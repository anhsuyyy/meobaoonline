import Phaser from 'phaser';
import networkInstance from '../network';

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
        // Khi lỗi tải asset → dùng procedural texture, KHÔNG throw
        this.load.on('loaderror', (fileObj) => {
            console.warn(`[Asset] Không tải được: ${fileObj.src} – sẽ dùng procedural fallback.`);
        });

        // Map background
        this.load.image('bg-map', '/assets/maps/chuong-0-tram-cao/background.png');
    }

    // ──────────────────────────────────────────────
    //  CREATE
    // ──────────────────────────────────────────────
    create() {
        const W = 1280, H = 720;
        this.worldW = W;
        this.worldH = H;

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
        // --- Nền cỏ gradient ---
        const bg = this.add.graphics();
        // Cỏ xanh đậm nền
        bg.fillGradientStyle(0x1a4a1a, 0x1a4a1a, 0x0d2e0d, 0x0d2e0d, 1);
        bg.fillRect(0, 0, W, H);

        // --- Thảm cỏ chi tiết: pattern ô vuông nhẹ ---
        const grassG = this.add.graphics();
        const tileW = 64, tileH = 64;
        for (let gy = 0; gy < H; gy += tileH) {
            for (let gx = 0; gx < W; gx += tileW) {
                const even = ((gx / tileW + gy / tileH) % 2 === 0);
                grassG.fillStyle(even ? 0x1e5c1e : 0x174e17, 0.45);
                grassG.fillRect(gx, gy, tileW, tileH);
            }
        }

        // --- Sông nước góc phải (bề rộng 130px) ---
        const riverG = this.add.graphics();
        riverG.fillStyle(0x0c4a6e, 1);
        riverG.fillRect(W - 140, 0, 140, H);
        // Hiệu ứng sóng nước
        riverG.fillStyle(0x0284c7, 0.25);
        riverG.fillRect(W - 140, 0, 140, H);
        // Bờ sông (cát / đá ven sông)
        riverG.fillStyle(0x3d5a40, 1);
        riverG.fillRect(W - 148, 0, 16, H);
        riverG.fillStyle(0x4a7c59, 0.6);
        riverG.fillRect(W - 152, 0, 8, H);

        // Sóng trang trí
        for (let i = 0; i < 5; i++) {
            const wy = 80 + i * 130;
            const wave = this.add.graphics();
            wave.lineStyle(1.5, 0x38bdf8, 0.35);
            wave.beginPath();
            wave.moveTo(W - 130, wy);
            wave.lineTo(W - 20, wy + 10);
            wave.strokePath();
            this.tweens.add({
                targets: wave,
                x: 10, yoyo: true, repeat: -1,
                duration: 2200 + i * 300,
                ease: 'Sine.easeInOut'
            });
        }

        // --- Đường lát đá cuội ---
        const pathG = this.add.graphics();
        pathG.fillStyle(0x334155, 0.7);
        // Đường ngang chính
        pathG.fillRect(120, 310, 860, 90);
        pathG.fillStyle(0x3b4f68, 0.5);
        // Đường dọc trung tâm
        pathG.fillRect(560, 80, 90, 560);

        // Chi tiết gạch đá
        pathG.fillStyle(0x475569, 0.3);
        for (let bx = 120; bx < 980; bx += 40) {
            for (let by = 310; by < 400; by += 30) {
                if (Math.random() > 0.4) {
                    pathG.fillRect(bx + 2, by + 2, 34, 24);
                }
            }
        }

        // --- Bụi cỏ lúp xúp viền đường ---
        this._drawGrassClumps();

        // --- Cây cối (vùng trái và trên) ---
        this._drawTrees(W);

        // --- Hoa dại ---
        this._drawFlowers();

        // --- Bảng đề name zone góc trên ---
        this._drawZoneSign();

        // --- Shrine trung tâm giao đường ---
        this._drawShrine(605, 355);

        // --- Đường biên bản đồ (viền vàng mảnh) ---
        const borderG = this.add.graphics();
        borderG.lineStyle(2, 0xd97706, 0.6);
        borderG.strokeRect(8, 8, W - 16, H - 16);
        borderG.lineStyle(1, 0x92400e, 0.4);
        borderG.strokeRect(12, 12, W - 24, H - 24);
    }

    _drawGrassClumps() {
        const g = this.add.graphics();
        const clumps = [
            { x: 115, y: 300 }, { x: 115, y: 340 }, { x: 115, y: 395 },
            { x: 985, y: 305 }, { x: 985, y: 370 }, { x: 985, y: 400 },
            { x: 550, y: 75 },  { x: 555, y: 635 }, { x: 650, y: 75 }
        ];
        clumps.forEach(c => {
            g.fillStyle(0x22c55e, 0.6);
            g.fillCircle(c.x, c.y, 5 + Math.random() * 4);
            g.fillStyle(0x16a34a, 0.5);
            g.fillCircle(c.x + 5, c.y - 3, 4);
        });
    }

    _drawTrees(W) {
        const treeData = [
            // Góc trên trái
            { x: 70, y: 70 }, { x: 140, y: 60 }, { x: 60, y: 150 }, { x: 200, y: 100 },
            // Góc trên phải (trước sông)
            { x: 980, y: 70 }, { x: 1040, y: 90 }, { x: 1000, y: 150 },
            // Góc dưới trái
            { x: 80, y: 580 }, { x: 150, y: 620 }, { x: 60, y: 660 },
            // Góc dưới phải
            { x: 960, y: 600 }, { x: 1020, y: 640 },
            // Dọc theo bờ sông
            { x: W - 160, y: 100 }, { x: W - 160, y: 230 }, { x: W - 160, y: 420 }, { x: W - 160, y: 580 }
        ];
        const g = this.add.graphics();
        treeData.forEach(t => {
            // Thân cây
            g.fillStyle(0x5c3d1e, 1);
            g.fillRect(t.x - 5, t.y + 20, 10, 24);
            // Tán lá (3 lớp, từ dưới lên)
            g.fillStyle(0x166534, 1);
            g.fillEllipse(t.x, t.y + 10, 42, 32);
            g.fillStyle(0x15803d, 1);
            g.fillEllipse(t.x, t.y - 2, 36, 28);
            g.fillStyle(0x16a34a, 1);
            g.fillEllipse(t.x, t.y - 12, 26, 22);
            // Chấm sáng bóng
            g.fillStyle(0x4ade80, 0.25);
            g.fillCircle(t.x - 4, t.y - 5, 5);
        });
    }

    _drawFlowers() {
        const g = this.add.graphics();
        const flowers = [
            { x: 180, y: 200, c: 0xfbbf24 }, { x: 220, y: 240, c: 0xf472b6 },
            { x: 350, y: 200, c: 0xa78bfa }, { x: 430, y: 260, c: 0xfbbf24 },
            { x: 750, y: 220, c: 0xf472b6 }, { x: 830, y: 180, c: 0x34d399 },
            { x: 200, y: 480, c: 0x60a5fa }, { x: 280, y: 530, c: 0xfbbf24 },
            { x: 700, y: 520, c: 0xf472b6 }, { x: 800, y: 560, c: 0xa78bfa },
        ];
        flowers.forEach(f => {
            for (let p = 0; p < 5; p++) {
                const angle = (p / 5) * Math.PI * 2;
                g.fillStyle(f.c, 0.8);
                g.fillCircle(f.x + Math.cos(angle) * 5, f.y + Math.sin(angle) * 5, 3);
            }
            g.fillStyle(0xfef3c7, 1);
            g.fillCircle(f.x, f.y, 2.5);
        });
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

    // ──────────────────────────────────────────────
    //  PLACEHOLDER ENTITIES (hiển thị khi chưa có server)
    // ──────────────────────────────────────────────
    _spawnPlaceholders(W, H) {
        // Nhân vật chính tại giao lộ
        const px = W / 2 - 20, py = H / 2 - 10;
        this._placeholderPlayer = this._createPlayerSprite(px, py, '🐱 Mèo Báo', 0x14b8a6, true);

        // Camera theo placeholder
        this.cameras.main.startFollow(this._placeholderPlayer, true, 0.1, 0.1);

        // 3 quái patrols
        const monDefs = [
            { x: 300, y: 200, name: '🐭 Chuột Nhắt Lv.45', color: 0xeab308, size: 36 },
            { x: 750, y: 200, name: '🕷️ Nhện Lông Lv.46',  color: 0x64748b, size: 38 },
            { x: 250, y: 480, name: '👁️ Cầu Quỷ Lv.47',   color: 0x9333ea, size: 48, isElite: true },
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

    _createPlayerSprite(x, y, label, color, isMe) {
        const size = 40;
        const body = this.add.rectangle(x, y, size, size, color);
        body.setStrokeStyle(2, isMe ? 0x2dd4bf : 0xa78bfa);

        const nameText = this.add.text(x, y - 32, label, {
            fontFamily: 'sans-serif', fontSize: '11px', fontStyle: 'bold',
            color: isMe ? '#2dd4bf' : '#c084fc',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);

        const shadow = this.add.ellipse(x, y + 22, size + 4, 10, 0x000000, 0.35);

        const hpBg  = this.add.rectangle(x, y - 22, size, 5, 0x0c0804);
        const hpBar = this.add.rectangle(x, y - 22, size, 5, 0x22c55e);
        hpBg.setStrokeStyle(1, 0x166534);

        body.ui = { nameText, hpBg, hpBar, shadow };
        return body;
    }

    _createMonsterSprite(d) {
        const { x, y, name, color, size = 36, isElite = false } = d;
        const body = this.add.rectangle(x, y, size, size, color);
        body.setStrokeStyle(2, isElite ? 0xf59e0b : 0xffffff);
        body.monsterName = name;
        body.maxHp = isElite ? 33600 : 12000;
        body.currentHp = body.maxHp;
        body.monsterType = isElite ? 'elite' : 'normal';

        const nameText = this.add.text(x, y - size / 2 - 12, name, {
            fontFamily: 'sans-serif', fontSize: isElite ? '11px' : '10px', fontStyle: 'bold',
            color: isElite ? '#f472b6' : '#fef08a',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);

        const stateText = this.add.text(x, y + size / 2 + 6, '[Patrol]', {
            fontFamily: 'sans-serif', fontSize: '9px',
            color: '#94a3b8', stroke: '#000', strokeThickness: 2
        }).setOrigin(0.5);

        const hpBg  = this.add.rectangle(x, y - size / 2 - 3, size, 4, 0x0c0804);
        const hpBar = this.add.rectangle(x, y - size / 2 - 3, size, 4, 0xef4444);

        const shadow = this.add.ellipse(x, y + size / 2 + 2, size + 4, 8, 0x000000, 0.3);

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
        return body;
    }

    _syncUI(entity) {
        if (!entity.ui) return;
        const { nameText, stateText, hpBg, hpBar, shadow } = entity.ui;
        nameText.setPosition(entity.x, entity.y - entity.height / 2 - 12);
        stateText?.setPosition(entity.x, entity.y + entity.height / 2 + 6);
        hpBg.setPosition(entity.x, entity.y - entity.height / 2 - 3);
        hpBar.setPosition(entity.x, entity.y - entity.height / 2 - 3);
        shadow?.setPosition(entity.x, entity.y + entity.height / 2 + 2);
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

        this.socket.on('newPlayer', (info) => this.addPlayer(info, false));

        this.socket.on('playerDisconnected', (id) => {
            if (this.players[id]) {
                this.destroyEntityUI(this.players[id]);
                delete this.players[id];
            }
        });

        this.socket.on('stateUpdate', (payload) => {
            for (const id in payload.players) {
                const sp = payload.players[id];
                const po = this.players[id];
                if (po) {
                    po.x = sp.x; po.y = sp.y;
                    this.updateEntityUI(po, sp.hp, sp.maxHp);
                    if (id === this.myId) this.game.events.emit('setPlayerPos', { x: sp.x, y: sp.y });
                }
            }
            for (const mid in payload.monsters) {
                const sm = payload.monsters[mid];
                const mo = this.monsters[mid];
                if (mo) {
                    mo.x = sm.x; mo.y = sm.y;
                    mo.currentHp = sm.hp;
                    mo.setVisible(!sm.isDead);
                    this.updateEntityUI(mo, sm.hp, sm.maxHp, sm.state);
                }
            }
        });

        this.socket.on('playerAttacked', (data) => {
            const attacker = this.players[data.playerId];
            if (attacker) this.playAttackEffect(attacker, data.skillId);

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
                    mo.setFillStyle(0xff2222);
                    this.time.delayedCall(120, () => {
                        if (this.monsters[hit.monsterId]) {
                            mo.setFillStyle(mo.monsterType === 'elite' ? 0x9333ea : 0xeab308);
                        }
                    });
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

        this.socket.on('statsUpdate',        (s) => this.game.events.emit('updateStats', s));
        this.socket.on('questProgressUpdate',(d) => this.game.events.emit('updateQuestProgress', d));
        this.socket.on('questCompleted',     (d) => this.game.events.emit('setQuestCompleted', d));
        this.socket.on('combatError',        (e) => this.showFloatingNotice(e.message || 'Lỗi'));
        this.socket.on('classNpcInteraction', (data) => this.game.events.emit('classNpcInteraction', data));
        this.socket.on('classNpcFeedback', (data) => this.game.events.emit('classNpcFeedback', data));
        this.socket.on('classSelectionResult', (data) => this.game.events.emit('classSelectionResult', data));
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
        const marker = this.add.circle(npc.x, npc.y, 21, 0xf59e0b, 0.9)
            .setStrokeStyle(3, 0xfef3c7)
            .setInteractive({ useHandCursor: true });
        this.tweens.add({
            targets: marker,
            scale: 1.12,
            alpha: 0.75,
            duration: 850,
            yoyo: true,
            repeat: -1
        });
        marker.on('pointerdown', () => this.socket.emit('interactNpc', npc.id));
        this.add.text(npc.x, npc.y - 36, `🧙 ${npc.name}`, {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#fde68a',
            stroke: '#0c0804',
            strokeThickness: 4
        }).setOrigin(0.5);
        this.add.text(npc.x, npc.y + 33, 'Chạm / nhấn E', {
            fontFamily: 'sans-serif',
            fontSize: '9px',
            color: '#fef3c7',
            stroke: '#0c0804',
            strokeThickness: 3
        }).setOrigin(0.5);
    }

    // ──────────────────────────────────────────────
    //  ADD REAL ENTITIES
    // ──────────────────────────────────────────────
    addPlayer(info, isMe) {
        const color = isMe ? 0x14b8a6 : 0x8b5cf6;
        const pObj  = this._createPlayerSprite(info.x, info.y,
            isMe ? `🐱 [Bạn] ${info.username || 'Bạn'}` : `🐱 ${info.username || 'Người chơi'}`,
            color, isMe);
        this.players[info.id] = pObj;
    }

    addMonster(info) {
        const mObj = this._createMonsterSprite({
            x: info.x, y: info.y,
            name: (info.type === 'elite' ? '👑 ' : '🐭 ') + info.name,
            color: info.type === 'elite' ? 0x9333ea : 0xeab308,
            size: info.type === 'elite' ? 50 : 38,
            isElite: info.type === 'elite'
        });
        mObj.monsterName = info.name;
        mObj.maxHp = info.maxHp;
        mObj.currentHp = info.maxHp;
        this.monsters[info.id] = mObj;
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
        const { nameText, stateText, hpBg, hpBar, shadow, maxWidth = 40 } = entity.ui;
        const ey = entity.y, ex = entity.x, hw = entity.height || 40;

        nameText.setPosition(ex, ey - hw / 2 - 12);
        hpBg.setPosition(ex, ey - hw / 2 - 3);
        shadow?.setPosition(ex, ey + hw / 2 + 2);

        const ratio = Math.max(0, Math.min(1, hp / maxHp));
        hpBar.displayWidth = maxWidth * ratio;
        hpBar.x = ex - (maxWidth * (1 - ratio)) / 2;
        hpBar.y = ey - hw / 2 - 3;

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
    }

    // ──────────────────────────────────────────────
    //  EFFECTS
    // ──────────────────────────────────────────────
    playAttackEffect(player, skillId) {
        if (skillId === 's3') {
            const ring = this.add.circle(player.x, player.y, 110, 0xa855f7, 0.3);
            ring.setStrokeStyle(3, 0xd8b4fe);
            this.tweens.add({ targets: ring, scale: 1.3, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
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
        // Cập nhật UI placeholder khi di chuyển (patrol tween tự gọi _syncUI)
        // Nếu đã kết nối server mới xử lý input
        if (!this.socket || !this.myId) return;

        if (Phaser.Input.Keyboard.JustDown(this.fKey)) {
            this.isAutoFarming = !this.isAutoFarming;
            this.socket.emit('toggleAuto', this.isAutoFarming);
        }

        if (Phaser.Input.Keyboard.JustDown(this.spaceBar) && !this.isAutoFarming) {
            this.socket.emit('playerAttack', { skillId: 's1' });
        }

        if (Phaser.Input.Keyboard.JustDown(this.qKey) && !this.isAutoFarming) {
            this.socket.emit('playerAttack', { skillId: 's3' });
        }

        if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            const myObj = this.players[this.myId];
            if (myObj) {
                for (const iid in this.items) {
                    const item = this.items[iid];
                    if (Math.hypot(myObj.x - item.x, myObj.y - item.y) <= 60) {
                        this.socket.emit('pickupItem', iid);
                    }
                }
            }
        }

        if (Phaser.Input.Keyboard.JustDown(this.eKey) && this.classNpc) {
            this.socket.emit('interactNpc', this.classNpc.id);
        }

        if (!this.isAutoFarming) {
            this.socket.emit('playerInput', {
                left:  this.cursors.left.isDown  || this.wasd.left.isDown,
                right: this.cursors.right.isDown || this.wasd.right.isDown,
                up:    this.cursors.up.isDown    || this.wasd.up.isDown,
                down:  this.cursors.down.isDown  || this.wasd.down.isDown,
            });
        }
    }
}