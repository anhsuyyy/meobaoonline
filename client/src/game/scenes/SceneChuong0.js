import Phaser from 'phaser';
import networkInstance from '../network';
import ASSET_MANIFEST from '../config/assetManifest';
import { groundFrameAt, TRAM_CAO_LAYOUT } from '../maps/tramCaoLayout';

/**
 * SceneChuong0 - Bản đồ Trạm Cào, Khu 1
 * World size: 1280×720 (16:9)
 *
 * Đảm bảo render ngay khi create() chạy, kể cả khi chưa kết nối socket.
 * Khi socket gửi initialState → cập nhật entity thật; fallback placeholder bị xóa.
 */
export default class SceneChuong0 extends Phaser.Scene {
    constructor() {
        super('SceneChuong0');
        this.players  = {};
        this.monsters = {};
        this.items    = {};
        this.myId     = null;
        this.isAutoFarming  = false;
        this.autoAnchor     = null;
        this.leashGraphics  = null;
        this._placeholderCreated = false;
    }

    // ──────────────────────────────────────────────
    //  PRELOAD – Thử tải ảnh, fallback nếu lỗi
    // ──────────────────────────────────────────────
    preload() {
        const maps = Object.values(ASSET_MANIFEST.maps);
        const map = maps.find((entry) => entry.gameMapId === 'chuong0_tram_cao') || maps[0];
        this.mapTextureKey = map.textureKey;
        this.entityTextureKey = ASSET_MANIFEST.entities.textureKey;
        this.mapAtlasFailed = false;
        this.entityAtlasFailed = false;

        const width = this.scale.width;
        const height = this.scale.height;
        this.preloadGraphics = this.add.graphics().setScrollFactor(0).setDepth(10000);
        this.preloadLabel = this.add.text(width / 2, height / 2 - 16, 'Đang tải tài nguyên 0%', {
            fontFamily: 'sans-serif', fontSize: '18px', fontStyle: 'bold',
            color: '#fef3c7', stroke: '#202a24', strokeThickness: 5
        }).setOrigin(0.5).setScrollFactor(0).setDepth(10000);

        this.load.on('progress', (progress) => {
            this.preloadGraphics.clear();
            this.preloadGraphics.fillStyle(0x17221a, 0.92);
            this.preloadGraphics.fillRoundedRect(width / 2 - 190, height / 2 + 8, 380, 20, 8);
            this.preloadGraphics.lineStyle(2, 0x202a24, 1);
            this.preloadGraphics.strokeRoundedRect(width / 2 - 190, height / 2 + 8, 380, 20, 8);
            this.preloadGraphics.fillStyle(0x78bd65, 1);
            this.preloadGraphics.fillRoundedRect(width / 2 - 187, height / 2 + 11, 374 * progress, 14, 6);
            this.preloadLabel.setText(`Đang tải tài nguyên ${Math.round(progress * 100)}%`);
        });
        this.load.on('fileprogress', (file) => {
            this.preloadLabel.setText(`Đang tải ${file.key}`);
        });
        this.load.on('loaderror', (file) => {
            if (file.key === this.mapTextureKey) this.mapAtlasFailed = true;
            if (file.key === this.entityTextureKey) this.entityAtlasFailed = true;
            console.warn(`[Asset] Không tải được ${file.src}; scene sẽ dùng đồ họa procedural.`);
        });
        this.load.once('complete', () => {
            this.preloadGraphics?.destroy();
            this.preloadLabel?.destroy();
            this.preloadGraphics = null;
            this.preloadLabel = null;
        });

        // Chỉ nạp atlas của map hiện tại; các map khác không vào queue này.
        this.load.atlas(map.textureKey, map.atlasPng, map.atlasJson);
        this.load.atlas(
            this.entityTextureKey,
            ASSET_MANIFEST.entities.atlasPng,
            ASSET_MANIFEST.entities.atlasJson
        );
    }

    // ──────────────────────────────────────────────
    //  CREATE
    // ──────────────────────────────────────────────
    create() {
        const W = 1280, H = 720;
        this.worldW = W;
        this.worldH = H;
        this._ensureEntityFallbackTexture();
        this._createEntityAnimations();

        // 1. Vẽ thế giới
        this.createWorld(W, H);

        // 2. Tạo placeholder entities ngay để màn không đen khi offline
        this._spawnPlaceholders(W, H);

        // 3. Điều khiển bàn phím
        this.cursors  = this.input.keyboard.createCursorKeys();
        this.wasd     = {
            up:    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            left:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            down:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };
        this.spaceBar  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.qKey      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
        this.enterKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        this.fKey      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.eKey      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.virtualInput = { left: false, right: false, up: false, down: false };
        this.onVirtualMovement = (event) => {
            this.virtualInput = event.detail;
        };
        this.onVirtualPickup = () => this.pickupNearbyItems();
        window.addEventListener('game:virtual-movement', this.onVirtualMovement);
        window.addEventListener('game:pickup', this.onVirtualPickup);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener('game:virtual-movement', this.onVirtualMovement);
            window.removeEventListener('game:pickup', this.onVirtualPickup);
            this.socket?.off('chatHistory', this._chatHistoryHandler);
            this.socket?.off('chatMessage', this._chatMessageHandler);
        });

        // 4. Graphics leash
        this.leashGraphics = this.add.graphics();

        // 5. Camera theo nhân vật (cần có đối tượng để follow)
        this.cameras.main.setBounds(0, 0, W, H);

        // 6. Kết nối socket
        this._setupSocket();
    }

    // ──────────────────────────────────────────────
    //  WORLD BUILDING
    // ──────────────────────────────────────────────
    createWorld(W, H) {
        this._createMapGroundTexture(W, H);
        this._createMapDecorations();
        this._createWaterShimmer();
        this._drawZoneSign();
        this._drawShrine(605, 355);
        const borderG = this.add.graphics();
        borderG.lineStyle(2, 0xd97706, 0.6);
        borderG.strokeRect(8, 8, W - 16, H - 16);
        borderG.lineStyle(1, 0x92400e, 0.4);
        borderG.strokeRect(12, 12, W - 24, H - 24);
    }

    _createMapGroundTexture(width, height) {
        const atlasKey = this.mapTextureKey;
        const hasGroundAtlas = this.textures.exists(atlasKey) &&
            this.textures.get(atlasKey).has('ground_grass_00') &&
            this.textures.get(atlasKey).has('ground_water_00');
        if (!hasGroundAtlas) {
            const fallback = this.add.graphics().setDepth(-1000);
            fallback.fillStyle(0x4f9b55, 1).fillRect(0, 0, width, height);
            fallback.fillStyle(0xb98255, 1).fillRect(128, 288, 960, 128);
            fallback.fillRect(544, 64, 128, 656);
            fallback.fillStyle(0x3b9bb0, 1).fillRect(1120, 0, 160, height);
            return;
        }

        const textureKey = 'map-ground-tramcao';
        if (this.textures.exists(textureKey)) this.textures.remove(textureKey);
        const texture = this.textures.createCanvas(textureKey, width, height);
        const columns = Math.ceil(width / TRAM_CAO_LAYOUT.tileSize);
        const rows = Math.ceil(height / TRAM_CAO_LAYOUT.tileSize);
        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                texture.drawFrame(atlasKey, groundFrameAt(column, row),
                    column * TRAM_CAO_LAYOUT.tileSize, row * TRAM_CAO_LAYOUT.tileSize, false);
            }
        }
        texture.refresh();
        this.mapGround = this.add.image(0, 0, textureKey).setOrigin(0).setDepth(-1000);
    }

    _createMapDecorations() {
        this.mapDecorationSprites = [];
        for (const decoration of TRAM_CAO_LAYOUT.decorations) {
            let frameName, width, height, originY, depthOffset;
            if (decoration.kind === 'tree') {
                frameName = 'obstacle_tree_00'; width = 64; height = 68; originY = 0.82; depthOffset = 0;
            } else if (decoration.kind === 'rock') {
                frameName = 'obstacle_rock_00'; width = 44; height = 34; originY = 0.78; depthOffset = 0;
            } else {
                frameName = `decor_${decoration.kind}_00`; width = 22; height = 22; originY = 0.68; depthOffset = 1;
            }
            const sprite = this.add.image(decoration.x, decoration.y, this.mapTextureKey, frameName)
                .setDisplaySize(width, height)
                .setOrigin(0.5, originY)
                .setDepth(decoration.y + depthOffset);
            sprite.setData('mapDecoration', true);
            this.mapDecorationSprites.push(sprite);
        }
    }

    _createWaterShimmer() {
        const river = TRAM_CAO_LAYOUT.regions.river;
        for (let index = 0; index < 5; index += 1) {
            const y = 82 + index * 132;
            const wave = this.add.graphics().setDepth(-900);
            wave.lineStyle(1.5, 0x9be8df, 0.42);
            wave.beginPath();
            wave.moveTo(river.x + 14, y);
            wave.lineTo(river.x + river.width - 18, y + 9);
            wave.strokePath();
            this.tweens.add({
                targets: wave,
                x: 9,
                yoyo: true,
                repeat: -1,
                duration: 2300 + index * 260,
                ease: 'Sine.easeInOut'
            });
        }
    }

    _drawZoneSign() {
        // Biển tên zone góc trên
        const g = this.add.graphics();
        g.fillStyle(0x1c1208, 0.85);
        g.fillRoundedRect(520, 14, 240, 28, 6);
        g.lineStyle(1.5, 0xd97706, 0.8);
        g.strokeRoundedRect(520, 14, 240, 28, 6);

        this.add.text(640, 28, '📍  Trạm Cào – Khu Vực An Toàn', {
            fontFamily: 'sans-serif', fontSize: '11px',
            color: '#fcd34d', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 2
        }).setOrigin(0.5, 0.5);
    }

    _drawShrine(cx, cy) {
        const g = this.add.graphics();
        // Nền shrine
        g.fillStyle(0x1e293b, 0.9);
        g.fillCircle(cx, cy, 42);
        g.lineStyle(3, 0xf59e0b, 0.85);
        g.strokeCircle(cx, cy, 42);
        g.lineStyle(1, 0xd97706, 0.5);
        g.strokeCircle(cx, cy, 48);

        // Nước ở giữa
        g.fillStyle(0x0284c7, 0.65);
        g.fillCircle(cx, cy, 28);

        // Sóng nước
        this.tweens.add({
            targets: { val: 0 },
            val: 1,
            repeat: -1,
            duration: 1800,
            ease: 'Sine.easeInOut',
            onUpdate: (tween) => {
                if (!this.shrineWave) {
                    this.shrineWave = this.add.graphics();
                }
                this.shrineWave.clear();
                const t = tween.getValue();
                this.shrineWave.lineStyle(1.5, 0x38bdf8, 0.3 * (1 - t));
                this.shrineWave.strokeCircle(cx, cy, 28 + t * 18);
            }
        });

        // Biểu tượng trung tâm
        this.add.text(cx, cy, '🐾', { fontSize: '20px' }).setOrigin(0.5);

        // Ánh sáng nhấp nháy
        const glow = this.add.graphics();
        glow.fillStyle(0xf59e0b, 0.12);
        glow.fillCircle(cx, cy, 60);
        this.tweens.add({
            targets: glow, alpha: 0.05, yoyo: true, repeat: -1, duration: 2200, ease: 'Sine.easeInOut'
        });
    }

    _ensureEntityFallbackTexture() {
        if (this.textures.exists(this.entityTextureKey)) return;
        const fallbackColors = {
            character: ['#2dd4bf', '#a87850'],
            monster: ['#a7bd63', '#806195'],
            npc: ['#e7e0d1', '#637c9c']
        };
        for (const [kind, [bodyColor, clothingColor]] of Object.entries(fallbackColors)) {
            const key = `entity-fallback-${kind}`;
            if (this.textures.exists(key)) continue;
            const texture = this.textures.createCanvas(key, 48, 48);
            const context = texture.getContext();
            context.imageSmoothingEnabled = false;
            context.fillStyle = '#202a24';
            context.beginPath(); context.ellipse(24, 34, 13, 9, 0, 0, Math.PI * 2); context.fill();
            context.fillStyle = clothingColor;
            context.beginPath(); context.ellipse(24, 33, 10, 7, 0, 0, Math.PI * 2); context.fill();
            context.fillStyle = '#202a24';
            context.beginPath(); context.arc(24, 21, 13, 0, Math.PI * 2); context.fill();
            context.fillStyle = bodyColor;
            context.beginPath(); context.arc(24, 20, 11, 0, Math.PI * 2); context.fill();
            context.fillStyle = '#fff4dd';
            context.fillRect(19, 21, 3, 3); context.fillRect(27, 21, 3, 3);
            context.fillStyle = '#202a24';
            context.fillRect(20, 22, 1, 2); context.fillRect(28, 22, 1, 2);
            texture.refresh();
        }
    }

    _createEntityAnimations() {
        if (!this.textures.exists(this.entityTextureKey)) return;
        const definitions = [
            { kind: 'character', ids: ['meo_bao', 'meo_cu_ta', 'meowrie_antoinette', 'meo_vu_tru'], clips: { idle: 2, walk: 2, attack: 2, hit: 1, die: 2 } },
            { kind: 'monster', ids: ['chuot_nhat', 'gian_khong_lo', 'chuot_cong_dot_bien', 'nhen_long', 'ong_vo_ve_bac_ha', 'bo_ngua_dot_bien'], clips: { idle: 2, walk: 2, attack: 2, die: 2 } },
            { kind: 'npc', ids: ['truong_lao_linh_mieu'], clips: { idle: 2 } }
        ];
        for (const { kind, ids, clips } of definitions) {
            for (const id of ids) {
                for (const [clip, count] of Object.entries(clips)) {
                    for (const direction of ['down', 'up', 'side']) {
                        const prefix = `${id}_${clip}_${direction}_`;
                        const key = `${kind}.${id}.${clip}.${direction}`;
                        if (this.anims.exists(key)) continue;
                        this.anims.create({
                            key,
                            frames: this.anims.generateFrameNames(this.entityTextureKey, {
                                prefix, start: 0, end: count - 1, zeroPad: 2
                            }),
                            frameRate: clip === 'idle' ? 5 : clip === 'walk' ? 8 : clip === 'die' ? 8 : 10,
                            repeat: clip === 'idle' || clip === 'walk' ? -1 : 0
                        });
                    }
                }
            }
        }
    }

    _createEntitySprite(x, y, kind, artId, size) {
        const frameName = `${artId}_idle_down_00`;
        const hasAtlasFrame = this.textures.exists(this.entityTextureKey) &&
            this.textures.get(this.entityTextureKey).has(frameName);
        const textureKey = hasAtlasFrame ? this.entityTextureKey : `entity-fallback-${kind}`;
        return this.add.sprite(x, y, textureKey, hasAtlasFrame ? frameName : undefined)
            .setDisplaySize(size, size)
            .setOrigin(0.5, 0.78);
    }

    _setEntityAnimation(entity, kind, artId, clip, direction = 'down') {
        const key = `${kind}.${artId}.${clip}.${direction}`;
        if (!this.anims.exists(key)) return false;
        entity.play(key, true);
        entity.facing = direction;
        return true;
    }

    _setCharacterArt(entity, classId) {
        const artId = ['meo_bao', 'meo_cu_ta', 'meowrie_antoinette', 'meo_vu_tru'].includes(classId)
            ? classId
            : 'meo_bao';
        entity.entityArtId = artId;
        const frameName = `${artId}_idle_down_00`;
        if (this.textures.exists(this.entityTextureKey) && this.textures.get(this.entityTextureKey).has(frameName)) {
            entity.setTexture(this.entityTextureKey, frameName);
        }
        this._setEntityAnimation(entity, 'character', artId, 'idle', entity.facing || 'down');
    }

    _layoutEntityLabels() {
        const entities = [
            ...Object.entries(this.players).map(([id, entity]) => ({ id, entity, priority: id === this.myId ? 0 : 1 })),
            ...Object.entries(this.monsters).map(([id, entity]) => ({ id, entity, priority: 2 }))
        ];
        if (this.classNpcSprite) entities.push({ id: 'class-npc', entity: this.classNpcSprite, priority: 1 });
        entities.sort((a, b) => a.priority - b.priority || a.entity.y - b.entity.y);

        const placed = [];
        for (const { entity } of entities) {
            const label = entity.ui?.nameText;
            if (!label || !entity.visible) continue;
            const height = label.height || 12;
            const halfWidth = Math.max(18, label.width / 2);
            let labelY = entity.y - (entity.displayHeight || entity.height || 48) * 0.78 - 10;
            let attempts = 0;
            const overlaps = (y) => placed.some((other) =>
                Math.abs(entity.x - other.x) < halfWidth + other.halfWidth + 4 &&
                Math.abs(y - other.y) < height + other.height + 2
            );
            while (overlaps(labelY) && attempts < 3) {
                labelY -= height + 4;
                attempts += 1;
            }
            label.setVisible(attempts < 3);
            if (attempts < 3) {
                label.setPosition(entity.x, labelY).setDepth(entity.y + 24);
                placed.push({ x: entity.x, y: labelY, halfWidth, height });
            }
            entity.ui.promptText?.setPosition(entity.x, entity.y + 34).setDepth(entity.y + 24);
        }
    }

    // ──────────────────────────────────────────────
    //  PLACEHOLDER ENTITIES (hiển thị khi chưa có server)
    // ──────────────────────────────────────────────
    _spawnPlaceholders(W, H) {
        // Nhân vật chính tại giao lộ
        const px = W / 2 - 20, py = H / 2 - 10;
        this._placeholderPlayer = this._createPlayerSprite(px, py, '[Bạn] Mèo Báo', true, 'meo_bao');

        // Camera theo placeholder
        this.cameras.main.startFollow(this._placeholderPlayer, true, 0.1, 0.1);

        // 3 quái patrols
        const monDefs = [
            { x: 300, y: 200, name: 'Chuột Nhắt', artId: 'chuot_nhat', color: 0xeab308, size: 38 },
            { x: 750, y: 200, name: 'Nhện Lông', artId: 'nhen_long', color: 0x64748b, size: 40 },
            { x: 250, y: 480, name: 'Gián Khổng Lồ', artId: 'gian_khong_lo', color: 0x9333ea, size: 46, isElite: true },
        ];
        this._placeholderMonsters = monDefs.map(d => this._createMonsterSprite(d));

        // Patrol animation quái
        this._placeholderMonsters.forEach((m, i) => {
            const startX = m.x, startY = m.y;
            this.tweens.add({
                targets: m,
                x: startX + (i % 2 === 0 ? 60 : -60),
                y: startY + (i === 1 ? 40 : -40),
                yoyo: true, repeat: -1,
                duration: 2200 + i * 400,
                ease: 'Sine.easeInOut',
                onUpdate: () => this._syncUI(m)
            });
        });

        // Vài vật phẩm rơi
        [[360, 370], [620, 390], [420, 440]].forEach(([ix, iy]) => {
            this._spawnCoin(ix, iy);
        });

        this._placeholderCreated = true;
    }

    _createPlayerSprite(x, y, label, isMe, artId = 'meo_bao') {
        const body = this._createEntitySprite(x, y, 'character', artId, 48);
        body.entityKind = 'character';
        body.entityArtId = artId;
        body.isMe = isMe;
        body.setDepth(y);

        const nameText = this.add.text(x, y - 44, label, {
            fontFamily: 'sans-serif', fontSize: '12px', fontStyle: 'bold',
            color: isMe ? '#9fffe7' : '#e4d6ff',
            stroke: '#202a24', strokeThickness: 4
        }).setOrigin(0.5);
        const shadow = this.add.ellipse(x, y + 14, 36, 10, 0x000000, 0.38).setDepth(y - 1);
        const hpBg = this.add.rectangle(x, y - 24, 38, 4, 0x17221a).setDepth(y + 1);
        const hpBar = this.add.rectangle(x, y - 24, 38, 4, 0x78bd65).setDepth(y + 2);
        hpBg.setStrokeStyle(1, 0x202a24);
        body.ui = { nameText, hpBg, hpBar, shadow, maxWidth: 38 };
        this._setEntityAnimation(body, 'character', artId, 'idle', 'down');
        return body;
    }

    _createMonsterSprite(d) {
        const { x, y, name, size = 36, isElite = false } = d;
        const artId = d.artId || this._getMonsterArtId(d.id, name);
        const body = this._createEntitySprite(x, y, 'monster', artId, size);
        body.entityKind = 'monster';
        body.entityArtId = artId;
        body.setDepth(y);
        body.monsterName = name;
        body.maxHp = isElite ? 33600 : 12000;
        body.currentHp = body.maxHp;
        body.monsterType = isElite ? 'elite' : 'normal';

        const nameText = this.add.text(x, y - size / 2 - 12, name, {
            fontFamily: 'sans-serif', fontSize: isElite ? '12px' : '11px', fontStyle: 'bold',
            color: isElite ? '#ffe1a1' : '#fff0bd',
            stroke: '#202a24', strokeThickness: 4
        }).setOrigin(0.5);

        const stateText = this.add.text(x, y + size / 2 + 6, '[Patrol]', {
            fontFamily: 'sans-serif', fontSize: '9px',
            color: '#94a3b8', stroke: '#000', strokeThickness: 2
        }).setOrigin(0.5);

        const hpBg = this.add.rectangle(x, y - size / 2 - 3, size, 4, 0x17221a).setDepth(y + 1);
        const hpBar = this.add.rectangle(x, y - size / 2 - 3, size, 4, 0xf06e6e).setDepth(y + 2);
        hpBg.setStrokeStyle(1, 0x202a24);
        const shadow = this.add.ellipse(x, y + size * 0.28, size * 0.86, 9, 0x000000, 0.35).setDepth(y - 1);

        // Click chọn quái
        body.setInteractive({ useHandCursor: true });
        body.on('pointerdown', () => {
            this.game.events.emit('setSelectedTarget', {
                id: `ph_${name}`, name: name.replace(/[^a-zA-ZÀ-ỹ\s]/g, '').trim(),
                type: body.monsterType, level: isElite ? 47 : 45,
                hp: body.currentHp, maxHp: body.maxHp
            });
        });

        body.ui = { nameText, stateText, hpBg, hpBar, shadow, maxWidth: size };
        this._setEntityAnimation(body, 'monster', artId, 'idle', 'down');
        return body;
    }

    _getMonsterArtId(id = '', name = '') {
        const value = `${id} ${name}`.toLowerCase();
        if (value.includes('gian') || value.includes('roach')) return 'gian_khong_lo';
        if (value.includes('cong') || value.includes('sewer')) return 'chuot_cong_dot_bien';
        if (value.includes('nhen') || value.includes('spider')) return 'nhen_long';
        if (value.includes('ong') || value.includes('bee')) return 'ong_vo_ve_bac_ha';
        if (value.includes('ngua') || value.includes('mantis')) return 'bo_ngua_dot_bien';
        return 'chuot_nhat';
    }

    _syncUI(entity) {
        if (!entity.ui) return;
        entity.setDepth(entity.y);
        this.updateEntityUI(entity, entity.currentHp, entity.maxHp, entity.currentState);
        this._layoutEntityLabels();
    }

    _spawnCoin(x, y) {
        const coin = this.add.circle(x, y, 7, 0xfacc15);
        coin.setStrokeStyle(1.5, 0xb45309);
        this.tweens.add({ targets: coin, y: y - 6, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
        return coin;
    }

    _clearPlaceholders() {
        if (!this._placeholderCreated) return;

        const destroy = (obj) => {
            if (!obj) return;
            if (obj.ui) {
                Object.values(obj.ui).forEach(el => { if (el?.destroy) el.destroy(); });
            }
            if (obj.destroy) obj.destroy();
        };

        destroy(this._placeholderPlayer);
        this._placeholderMonsters?.forEach(destroy);
        this._placeholderPlayer = null;
        this._placeholderMonsters = [];
        this._placeholderCreated = false;
    }

    // ──────────────────────────────────────────────
    //  SOCKET SETUP
    // ──────────────────────────────────────────────
    _setupSocket() {
        this.socket = networkInstance.connect();

        this.socket.on('initialState', (data) => {
            // Xóa placeholder khi server trả dữ liệu thật
            this._clearPlaceholders();

            this.myId = data.playerId;
            this.game.events.emit('setPlayerId', this.myId);
            if (data.config?.classNpc) this._createClassNpc(data.config.classNpc);

            for (const pid in data.players) this.addPlayer(data.players[pid], pid === this.myId);
            for (const mid in data.monsters) this.addMonster(data.monsters[mid]);
            for (const iid in data.items)    this.addItem(data.items[iid]);

            const me = data.players[this.myId];
            if (me) {
                this.game.events.emit('updateStats', {
                    hp: me.hp, maxHp: me.maxHp, mp: me.mp, maxMp: me.maxMp,
                    gold: me.inventory?.gold || 0, dtn: me.inventory?.dtn || 0,
                    level: me.inventory?.level || 1, exp: me.inventory?.exp || 0,
                    maxExp: me.inventory?.maxExp,
                    username: me.username
                });
                this.game.events.emit('setPlayerPos', { x: me.x, y: me.y });

                // Camera follow người chơi thật
                const myObj = this.players[this.myId];
                if (myObj) this.cameras.main.startFollow(myObj, true, 0.1, 0.1);
            }
        });

        this._chatHistoryHandler = (data) => {
            this.game.events.emit('chatHistory', data?.channels || {});
        };
        this._chatMessageHandler = (message) => {
            this.game.events.emit('chatMessage', message);
        };
        this.socket.off('chatHistory', this._chatHistoryHandler);
        this.socket.off('chatMessage', this._chatMessageHandler);
        this.socket.on('chatHistory', this._chatHistoryHandler);
        this.socket.on('chatMessage', this._chatMessageHandler);

        this.socket.on('newPlayer', (info) => this.addPlayer(info, false));

        this.socket.on('playerDisconnected', (id) => {
            if (this.players[id]) {
                this.destroyEntityUI(this.players[id]);
                delete this.players[id];
            }
        });

        this.socket.on('stateUpdate', (payload) => {
            const receivedAt = this.time.now;
            for (const id in payload.players) {
                const sp = payload.players[id];
                const po = this.players[id];
                if (po) {
                    const dx = sp.x - po.x, dy = sp.y - po.y;
                    po.renderFromX = po.x;
                    po.renderFromY = po.y;
                    po.renderToX = sp.x;
                    po.renderToY = sp.y;
                    po.renderStartedAt = receivedAt;
                    po.renderDuration = 50;
                    po.serverHp = sp.hp;
                    po.serverMaxHp = sp.maxHp;
                    const tookDamage = Number.isFinite(po.lastHp) && sp.hp < po.lastHp;
                    po.lastHp = sp.hp;
                    const direction = Math.abs(dx) > Math.abs(dy) ? 'side' : (dy < 0 ? 'up' : 'down');
                    if (direction === 'side') po.setFlipX(dx < 0);
                    else po.setFlipX(false);
                    const isMoving = Math.abs(dx) + Math.abs(dy) > 0.25;
                    if (sp.hp <= 0) {
                        if (!po.deathAnimationPlayed) {
                            po.deathAnimationPlayed = true;
                            this._setEntityAnimation(po, 'character', po.entityArtId, 'die', direction);
                        }
                    } else {
                        po.deathAnimationPlayed = false;
                        if (tookDamage && this._setEntityAnimation(po, 'character', po.entityArtId, 'hit', direction)) {
                            po.once('animationcomplete', () => this._setEntityAnimation(
                                po, 'character', po.entityArtId, 'idle', po.facing || direction
                            ));
                        } else {
                            this._setEntityAnimation(po, 'character', po.entityArtId, isMoving ? 'walk' : 'idle', direction);
                        }
                    }
                    this.updateEntityUI(po, sp.hp, sp.maxHp);
                    if (id === this.myId) this.game.events.emit('setPlayerPos', { x: sp.x, y: sp.y });
                }
            }
            for (const mid in payload.monsters) {
                const sm = payload.monsters[mid];
                const mo = this.monsters[mid];
                if (mo) {
                    const dx = sm.x - mo.x, dy = sm.y - mo.y;
                    mo.renderFromX = mo.x;
                    mo.renderFromY = mo.y;
                    mo.renderToX = sm.x;
                    mo.renderToY = sm.y;
                    mo.renderStartedAt = receivedAt;
                    mo.renderDuration = 50;
                    mo.currentHp = sm.hp;
                    if (sm.isDead) {
                        if (!mo.deathAnimationPlayed) {
                            mo.deathAnimationPlayed = true;
                            mo.setVisible(true);
                            if (this._setEntityAnimation(mo, 'monster', mo.entityArtId, 'die', 'down')) {
                                mo.once('animationcomplete', () => mo.setVisible(false));
                            } else {
                                mo.setVisible(false);
                            }
                        }
                    } else {
                        mo.deathAnimationPlayed = false;
                        mo.setVisible(true);
                        const direction = Math.abs(dx) > Math.abs(dy) ? 'side' : (dy < 0 ? 'up' : 'down');
                        if (direction === 'side') mo.setFlipX(dx < 0);
                        else mo.setFlipX(false);
                        const clip = sm.state === 'Attack' ? 'attack' : sm.state === 'Chase' ? 'walk' : 'idle';
                        this._setEntityAnimation(mo, 'monster', mo.entityArtId, clip, direction);
                    }
                    mo.currentState = sm.state;
                    this.updateEntityUI(mo, sm.hp, sm.maxHp, sm.state);
                }
            }
            this._layoutEntityLabels();
        });

        this.socket.on('playerAttacked', (data) => {
            const attacker = this.players[data.playerId];
            if (attacker) this.playAttackEffect(attacker, data.skillId, data.hits || [], data.healed || 0);
            if (data.playerId === this.myId) {
                window.dispatchEvent(new CustomEvent('game:skill-cooldown', {
                    detail: { skillId: data.skillId, cooldownMs: data.cooldownMs }
                }));
            }

            if (data.healed && attacker) {
                this.showFloatingHeal(attacker.x, attacker.y - 28, data.healed);
            }

            data.hits.forEach((hit) => {
                const mo = this.monsters[hit.monsterId];
                if (mo) {
                    this.showFloatingDamage(mo.x, mo.y - 28, hit.damage, hit.isCrit);
                    if (data.playerId === this.myId) {
                        this.game.events.emit('setSelectedTarget', {
                            id: hit.monsterId, name: mo.monsterName, type: mo.monsterType,
                            level: mo.monsterType === 'elite' ? 47 : 45,
                            hp: Math.max(0, mo.currentHp - hit.damage), maxHp: mo.maxHp
                        });
                    }
                    mo.setTint(0xffb5a6);
                    this.time.delayedCall(120, () => mo.clearTint());
                    if (hit.isDead) {
                        mo.deathAnimationPlayed = true;
                        mo.setVisible(true);
                        if (this._setEntityAnimation(mo, 'monster', mo.entityArtId, 'die', 'down')) {
                            mo.once('animationcomplete', () => mo.setVisible(false));
                        } else {
                            mo.setVisible(false);
                        }
                    }
                }
            });
        });

        this.socket.on('autoAttackTrigger', (p) => {
            this.socket.emit('playerAttack', { skillId: p?.skillId || 's1' });
        });

        this.socket.on('itemDropped',  (item) => this.addItem(item));
        this.socket.on('itemPicked',   (data) => {
            if (this.items[data.itemId]) {
                this.tweens.add({
                    targets: this.items[data.itemId], scale: 0, alpha: 0, duration: 200,
                    onComplete: () => { this.items[data.itemId]?.destroy(); delete this.items[data.itemId]; }
                });
            }
        });

        this.socket.on('autoStateChanged', (data) => {
            this.isAutoFarming = data.isAuto;
            this.autoAnchor = data.anchor;
            this.drawLeashCircle();
            this.game.events.emit('setAutoFarmState', data);
        });

        this.socket.on('statsUpdate', (stats) => this.game.events.emit('updateStats', stats));
        this.socket.on('questProgressUpdate',(d) => this.game.events.emit('updateQuestProgress', d));
        this.socket.on('questCompleted',     (d) => this.game.events.emit('setQuestCompleted', d));
        this.socket.on('combatError',        (e) => this.showFloatingNotice(e.message || 'Lỗi'));
        this.socket.on('classNpcInteraction', (data) => this.game.events.emit('classNpcInteraction', data));
        this.socket.on('classNpcFeedback', (data) => this.game.events.emit('classNpcFeedback', data));
        this.socket.on('classSelectionResult', (data) => {
            if (data.success && data.character) {
                const player = this.players[this.myId];
                if (player) this._setCharacterArt(player, data.character.classId);
            }
            this.game.events.emit('classSelectionResult', data);
        });
        this.socket.on('playerClassChanged', (data) => {
            const player = this.players[data.playerId];
            if (player) this._setCharacterArt(player, data.classId);
        });
        this.socket.on('classLevelUnlocked', (data) => this.game.events.emit('classLevelUnlocked', data));
        this.socket.on('persistenceError', (data) => this.game.events.emit('persistenceError', data));
        this.socket.on('connect_error', (error) => {
            if (error.message === 'AUTH_REQUIRED') {
                this.game.events.emit('authenticationExpired');
            } else {
                this.game.events.emit('socketConnectionError', {
                    message: error.message === 'SERVICE_UNAVAILABLE'
                        ? 'Dịch vụ game đang tạm thời không khả dụng.'
                        : 'Mất kết nối máy chủ game. Đang thử kết nối lại…'
                });
            }
        });
    }

    _createClassNpc(npc) {
        this.classNpc = npc;
        if (this.classNpcSprite) this.destroyEntityUI(this.classNpcSprite);
        const marker = this.add.circle(npc.x, npc.y, 26, 0xf59e0b, 0.16)
            .setStrokeStyle(2, 0xfef3c7).setDepth(npc.y - 1);
        this.tweens.add({
            targets: marker,
            scale: 1.18,
            alpha: 0.5,
            duration: 850,
            yoyo: true,
            repeat: -1
        });
        const sprite = this._createEntitySprite(npc.x, npc.y, 'npc', 'truong_lao_linh_mieu', 52)
            .setDepth(npc.y)
            .setInteractive({ useHandCursor: true });
        sprite.entityKind = 'npc';
        sprite.entityArtId = 'truong_lao_linh_mieu';
        this._setEntityAnimation(sprite, 'npc', 'truong_lao_linh_mieu', 'idle', 'down');
        sprite.on('pointerdown', () => this.socket.emit('interactNpc', npc.id));
        const nameText = this.add.text(npc.x, npc.y - 42, npc.name, {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#fde68a',
            stroke: '#202a24',
            strokeThickness: 4
        }).setOrigin(0.5);
        const promptText = this.add.text(npc.x, npc.y + 34, 'Chạm / nhấn E', {
            fontFamily: 'sans-serif',
            fontSize: '9px',
            color: '#fef3c7',
            stroke: '#202a24',
            strokeThickness: 3
        }).setOrigin(0.5);
        const shadow = this.add.ellipse(npc.x, npc.y + 16, 38, 10, 0x000000, 0.38).setDepth(npc.y - 1);
        sprite.ui = { nameText, promptText, shadow, marker };
        this.classNpcSprite = sprite;
        this._layoutEntityLabels();
    }

    // ──────────────────────────────────────────────
    //  ADD REAL ENTITIES
    // ──────────────────────────────────────────────
    addPlayer(info, isMe) {
        const artId = ['meo_bao', 'meo_cu_ta', 'meowrie_antoinette', 'meo_vu_tru'].includes(info.classId)
            ? info.classId
            : 'meo_bao';
        const name = isMe ? `[Bạn] ${info.username || 'Bạn'}` : (info.username || 'Người chơi');
        const pObj = this._createPlayerSprite(info.x, info.y, name, isMe, artId);
        pObj.playerId = info.id;
        this.players[info.id] = pObj;
        this._layoutEntityLabels();
    }

    addMonster(info) {
        const mObj = this._createMonsterSprite({
            x: info.x, y: info.y,
            id: info.id,
            name: info.name,
            artId: this._getMonsterArtId(info.id, info.name),
            size: info.type === 'elite' ? 50 : 38,
            isElite: info.type === 'elite'
        });
        mObj.monsterName = info.name;
        mObj.maxHp = info.maxHp;
        mObj.currentHp = info.maxHp;
        this.monsters[info.id] = mObj;
        this._layoutEntityLabels();
    }

    addItem(item) {
        if (this.items[item.id]) return;
        this.items[item.id] = this._spawnCoin(item.x, item.y);
    }

    // ──────────────────────────────────────────────
    //  UPDATE UI HELPERS
    // ──────────────────────────────────────────────
    updateEntityUI(entity, hp, maxHp, state) {
        if (!entity.ui) return;
        const { stateText, hpBg, hpBar, shadow, maxWidth = 40 } = entity.ui;
        const ey = entity.y, ex = entity.x, hw = entity.displayHeight || entity.height || 40;

        hpBg?.setPosition(ex, ey - hw * 0.62).setDepth(ey + 1);
        shadow?.setPosition(ex, ey + hw * 0.28).setDepth(ey - 1);

        const ratio = Math.max(0, Math.min(1, hp / maxHp));
        if (hpBar) {
            hpBar.displayWidth = maxWidth * ratio;
            hpBar.x = ex - (maxWidth * (1 - ratio)) / 2;
            hpBar.y = ey - hw * 0.62;
            hpBar.setDepth(ey + 2);
        }

        if (stateText && state) {
            stateText.setPosition(ex, ey + hw / 2 + 6);
            stateText.setText(`[${state}]`);
            stateText.setColor(state === 'Attack' ? '#f87171' : state === 'Chase' ? '#fb923c' : '#94a3b8');
        }
    }

    destroyEntityUI(entity) {
        if (entity?.ui) {
            Object.values(entity.ui).forEach(el => { if (el?.destroy) el.destroy(); });
        }
        entity?.destroy();
        if (entity === this.classNpcSprite) this.classNpcSprite = null;
    }

    // ──────────────────────────────────────────────
    //  EFFECTS
    // ──────────────────────────────────────────────
    playAttackEffect(player, skillId, hits = [], healed = 0) {
        if (player.entityKind === 'character') {
            this._setEntityAnimation(player, 'character', player.entityArtId, 'attack', player.facing || 'down');
        }
        if (skillId === 's5' && healed > 0) {
            const glow = this.add.circle(player.x, player.y, 28, 0x22c55e, 0.28).setStrokeStyle(3, 0x86efac, 0.9);
            this.tweens.add({ targets: glow, scale: 2.2, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => glow.destroy() });
            for (let i = 0; i < 6; i++) {
                const leaf = this.add.ellipse(player.x + Phaser.Math.Between(-16, 16), player.y + 12, 6, 11, 0x4ade80, 0.95);
                this.tweens.add({ targets: leaf, x: player.x + Phaser.Math.Between(-38, 38), y: player.y - 45, alpha: 0, angle: Phaser.Math.Between(-160, 160), duration: 420 + i * 25, onComplete: () => leaf.destroy() });
            }
        } else if (skillId === 's3' || skillId === 's4') {
            const color = skillId === 's4' ? 0xfacc15 : 0xa855f7;
            const strokeColor = skillId === 's4' ? 0xfef08a : 0xd8b4fe;
            const targets = hits.length ? hits.map((hit) => this.monsters[hit.monsterId]).filter(Boolean) : [player];
            targets.forEach((target, index) => {
                const ring = this.add.circle(target.x, target.y, 24, color, 0.24).setStrokeStyle(3, strokeColor);
                this.tweens.add({ targets: ring, scale: 2.1, alpha: 0, duration: 380 + index * 25, onComplete: () => ring.destroy() });
            });
        } else if (skillId === 's2') {
            const flame = this.add.circle(player.x + 20, player.y, 20, 0xf97316, 0.7);
            this.tweens.add({ targets: flame, scale: 1.8, alpha: 0, duration: 280, onComplete: () => flame.destroy() });
        } else {
            const claw = this.add.rectangle(player.x + 30, player.y, 35, 8, 0xffffff);
            claw.setAngle(25);
            this.time.delayedCall(90, () => claw.destroy());
        }
    }

    showFloatingDamage(x, y, damage, isCrit) {
        const text   = isCrit ? `💥 ${damage.toLocaleString()} CRIT!` : `-${damage.toLocaleString()}`;
        const color  = isCrit ? '#ef4444' : '#fde047';
        const fSize  = isCrit ? '20px' : '14px';
        const dmgTxt = this.add.text(x, y, text, {
            fontFamily: 'sans-serif', fontSize: fSize, fontStyle: 'bold',
            color, stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5);

        this.tweens.add({
            targets: dmgTxt, y: y - 42, alpha: 0, duration: 850,
            ease: 'Cubic.easeOut', onComplete: () => dmgTxt.destroy()
        });
    }

    showFloatingHeal(x, y, amount) {
        const healText = this.add.text(x, y, `+${amount} HP`, {
            fontFamily: 'sans-serif', fontSize: '15px', fontStyle: 'bold',
            color: '#4ade80', stroke: '#052e16', strokeThickness: 3
        }).setOrigin(0.5);
        this.tweens.add({
            targets: healText, y: y - 38, alpha: 0, duration: 850,
            ease: 'Cubic.easeOut', onComplete: () => healText.destroy()
        });
    }

    pickupNearbyItems() {
        const socket = this.socket;
        const player = this.players[this.myId];
        if (!socket || !player) return;
        for (const itemId in this.items) {
            const item = this.items[itemId];
            if (Math.hypot(player.x - item.x, player.y - item.y) <= 60) socket.emit('pickupItem', itemId);
        }
    }

    showFloatingNotice(message) {
        const myObj = this.players[this.myId] || this._placeholderPlayer;
        const x = myObj ? myObj.x : 640;
        const y = myObj ? myObj.y - 50 : 250;
        const notice = this.add.text(x, y, message, {
            fontFamily: 'sans-serif', fontSize: '13px', fontStyle: 'bold',
            color: '#f87171', stroke: '#0f172a', strokeThickness: 3
        }).setOrigin(0.5);
        this.tweens.add({
            targets: notice, y: y - 28, alpha: 0, duration: 900, onComplete: () => notice.destroy()
        });
    }

    drawLeashCircle() {
        this.leashGraphics.clear();
        if (this.isAutoFarming && this.autoAnchor) {
            this.leashGraphics.lineStyle(2, 0x14b8a6, 0.4);
            this.leashGraphics.strokeCircle(this.autoAnchor.x, this.autoAnchor.y, 320);
            this.leashGraphics.fillStyle(0x14b8a6, 0.7);
            this.leashGraphics.fillCircle(this.autoAnchor.x, this.autoAnchor.y, 5);
        }
    }

    // ──────────────────────────────────────────────
    //  UPDATE LOOP
    // ──────────────────────────────────────────────
    update() {
        const now = this.time.now;
        let hasInterpolatedEntity = false;
        for (const entity of [...Object.values(this.players), ...Object.values(this.monsters)]) {
            if (!Number.isFinite(entity.renderToX) || !Number.isFinite(entity.renderToY)) continue;
            const progress = Math.min(1, Math.max(0, (now - entity.renderStartedAt) / entity.renderDuration));
            entity.setPosition(
                Phaser.Math.Linear(entity.renderFromX, entity.renderToX, progress),
                Phaser.Math.Linear(entity.renderFromY, entity.renderToY, progress)
            ).setDepth(entity.y);
            this.updateEntityUI(entity, entity.serverHp ?? entity.currentHp, entity.serverMaxHp ?? entity.maxHp, entity.currentState);
            hasInterpolatedEntity = true;
        }
        if (hasInterpolatedEntity) this._layoutEntityLabels();

        // Cập nhật UI placeholder khi di chuyển (patrol tween tự gọi _syncUI)
        // Nếu đã kết nối server mới xử lý input
        if (!this.socket || !this.myId) return;

        if (Phaser.Input.Keyboard.JustDown(this.fKey)) {
            this.isAutoFarming = !this.isAutoFarming;
            this.socket.emit('toggleAuto', this.isAutoFarming);
        }

        // Skill hotkeys are handled by SkillBar so keyboard and on-screen buttons share cooldowns.

        if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            this.pickupNearbyItems();
        }

        if (Phaser.Input.Keyboard.JustDown(this.eKey) && this.classNpc) {
            this.socket.emit('interactNpc', this.classNpc.id);
        }

        if (!this.isAutoFarming) {
            this.socket.emit('playerInput', {
                left:  this.cursors.left.isDown  || this.wasd.left.isDown  || this.virtualInput.left,
                right: this.cursors.right.isDown || this.wasd.right.isDown || this.virtualInput.right,
                up:    this.cursors.up.isDown    || this.wasd.up.isDown    || this.virtualInput.up,
                down:  this.cursors.down.isDown  || this.wasd.down.isDown  || this.virtualInput.down,
            });
        }
    }
}
