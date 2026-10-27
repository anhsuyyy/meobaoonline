import Phaser from 'phaser';
import networkInstance from '../network';
import { findNearbyNroWaypoint } from '../mapInteraction';
import {
    NRO_REMOTE_INTERPOLATION_DELAY_MS,
    pushPositionSnapshot,
    samplePositionSnapshot
} from '../snapshotInterpolation';

const TILE = 24;
const BASE_WORLD_ZOOM = 1.5;

/** Side-view NRO scene; server snapshots remain the authority for position. */
export default class SceneNro extends Phaser.Scene {
    constructor() {
        super('SceneNro');
        this.players = {};
        this.monsters = {};
        this.companions = {};
        this.drops = {};
        this.pendingDropIcons = new Set();
        this.mobAssetRequests = new Set();
        this.bossAssetRequests = new Set();
        this.myId = null;
        this.targets = {};
        this.virtualInput = { axisX: 0, axisY: 0 };
        this.touchInputActive = false;
        this.lastInput = '';
        this.nearbyWaypointId = null;
        this.nearbyWaypointEntry = null;
        this.focusedInteractable = null;
        this.npcMarkers = new Map();
        this.waypointSignposts = [];
        this.mobFrameMetrics = new Map();
        this.skillAnimationLoadStarted = false;
    }

    preload() {
        this.load.json('nroMap0', '/assets/nro/map/data/map-0.json');
        this.load.json('nroMapCatalog', '/assets/nro/map/data/catalog.json');
        this.load.json('nroNpcTemplates', '/assets/nro/map/data/npc-templates.json');
        this.load.json('nroMobTemplates', '/assets/nro/map/data/mob-templates.json');
        this.load.json('nroTileSets', '/assets/nro/map/data/tile-sets.json');
        this.load.json('nroSkillAnimationManifest', '/assets/nro/data/manifests/skill-animations.json');
        this.load.json('nroArtPackManifest', '/assets/nro/data/manifests/art-pack.json');
        this.load.json('nroCharacterMobFrameManifest', '/assets/nro/data/manifests/character-monster-frames.json');
        this.load.json('nroGeneratedItemManifest', '/assets/nro/data/manifests/generated-items.json');
        for (const race of ['earth', 'namek', 'saiyan']) {
            const raceFolder = ({ earth: 'td', namek: 'nm', saiyan: 'xd' })[race];
            for (const action of ['dung', 'di', 'bay', 'tancong', 'chuong']) {
                for (let frame = 1; frame <= 5; frame += 1) {
                    const textureKey = `nroPlayer-${race}-${action}${frame}`;
                    this.load.image(textureKey, `/assets/nro/character/${raceFolder}/${action}/${action}${frame}.png`);
                }
            }
        }
        // Authored SVG NPC, monster, terrain and item art is loaded lazily by map/catalog ID.
    }

    createPlayerAnimations() {
        for (const race of ['earth', 'namek', 'saiyan']) {
            const definitions = [
                ['idle', 'dung', 3, 4, -1],
                ['run', 'di', 5, 10, -1],
                ['fly', 'bay', 5, 8, -1],
                // Keep looping attacks while the short server-confirmed attack window is active.
                ['attack', 'tancong', 5, 12, -1],
                ['cast', 'chuong', 5, 8, 0]
            ];
            for (const [state, folder, frameCount, frameRate, repeat] of definitions) {
                const key = `nro-player-${race}-${state}`;
                if (!this.anims.exists(key)) {
                    this.anims.create({
                        key,
                        frames: Array.from({ length: frameCount }, (_, index) => ({
                            key: `nroPlayer-${race}-${folder}${index + 1}`,
                            frame: '__BASE'
                        })),
                        frameRate,
                        repeat
                    });
                }
            }
        }
    }

    prepareSkillAnimations() {
        if (this.skillAnimationLoadStarted) return;
        this.skillAnimationLoadStarted = true;
        const manifest = this.cache.json.get('nroSkillAnimationManifest') || {};
        const pending = [];
        for (const [race, skills] of Object.entries(manifest)) {
            for (const [skillId, entry] of Object.entries(skills || {})) {
                if (!Array.isArray(entry.frames) || entry.frames.length !== 3) continue;
                entry.frames.forEach((url, index) => {
                    const key = `nroPlayerSkill-${race}-${skillId}-${index + 1}`;
                    if (this.textures.exists(key)) return;
                    pending.push({ key, race, skillId });
                    this.load.image(key, url);
                });
            }
        }
        if (!pending.length) return;
        this.load.once(Phaser.Loader.Events.COMPLETE, () => {
            const groups = new Map();
            for (const frame of pending) groups.set(`${frame.race}:${frame.skillId}`, frame);
            for (const frame of groups.values()) {
                const keys = [1, 2, 3].map((index) => `nroPlayerSkill-${frame.race}-${frame.skillId}-${index}`);
                if (!keys.every((key) => this.textures.exists(key))) continue;
                const animationKey = `nro-player-${frame.race}-skill-${frame.skillId}`;
                if (this.anims.exists(animationKey)) continue;
                this.anims.create({
                    key: animationKey,
                    frames: keys.map((key) => ({ key, frame: '__BASE' })),
                    frameRate: 12,
                    repeat: -1
                });
            }
        });
        this.load.start();
    }

    addCrispText(x, y, text, style = {}) {
        return this.add.text(x, y, text, {
            fontFamily: '"Nunito Variable", Arial, sans-serif',
            fontStyle: 'bold',
            ...style
        }).setResolution(2);
    }

    getPlayerRace(data = {}) {
        const raceId = String(data.raceId || '').toLowerCase();
        if (['earth', 'namek', 'saiyan'].includes(raceId)) return raceId;
        const ids = [Number(data.headPartId), Number(data.bodyPartId), Number(data.legPartId)].join(':');
        if (ids === '3:4:5') return 'namek';
        if (ids === '6:7:8') return 'saiyan';
        return 'earth';
    }

    playGeneratedPlayerAction(entity, animationKey, skillId = null) {
        const race = entity?.generatedRace || 'earth';
        const skillAnimationKey = skillId && skillId !== 'basic'
            ? `nro-player-${race}-skill-${skillId}`
            : null;
        const key = skillAnimationKey && this.anims.exists(skillAnimationKey)
            ? skillAnimationKey
            : `nro-player-${race}-${animationKey}`;
        if (!entity?.generatedSprite || !this.anims.exists(key)) return;
        entity.generatedActionTimer?.remove(false);
        entity.generatedAction = true;
        entity.generatedSprite.play(key, true);
        const finishAction = () => {
            entity.generatedAction = false;
            if (entity.active) this.updateGeneratedPlayerAnimation(entity);
        };
        if (animationKey === 'attack') {
            entity.generatedActionTimer = this.time.delayedCall(900, finishAction);
        } else {
            entity.generatedSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, finishAction);
        }
    }

    updateGeneratedPlayerAnimation(entity) {
        if (!entity?.generatedSprite || entity.generatedAction) return;
        const state = entity.serverData?.animationState || (entity.serverData?.isFlying ? 'flying' : 'standing');
        const action = state === 'running'
            ? 'run'
            : ['flying', 'jumping', 'falling'].includes(state)
                ? 'fly'
                : 'idle';
        const animationKey = `nro-player-${entity.generatedRace || 'earth'}-${action}`;
        if (entity.generatedSprite.anims.currentAnim?.key !== animationKey) {
            entity.generatedSprite.play(animationKey, true);
        }
    }

    create() {
        this.nroArtPack = this.cache.json.get('nroArtPackManifest') || {};
        this.nroGeneratedItems = this.cache.json.get('nroGeneratedItemManifest') || {};
        const mapEntry = this.cache.json.get('nroMap0');
        this.mapEntry = mapEntry;
        this.mapCatalogById = new Map((this.cache.json.get('nroMapCatalog') || []).map((map) => [Number(map.id), map]));
        this.mapData = mapEntry?.map;
        const tileSet = this.cache.json.get('nroTileSets')?.find((set) => set.setId === mapEntry?.tileId);
        this.topTileValues = new Set(tileSet?.tileTypes?.find((type) => type.type === 2)?.tiles || []);
        this.mobTemplatesById = new Map((this.cache.json.get('nroMobTemplates') || []).map((template) => [template.id, template]));
        this.npcTemplatesById = new Map((this.cache.json.get('nroNpcTemplates') || []).map((template) => [template.id, template]));
        this.createPlayerAnimations();
        this.prepareSkillAnimations();
        this.mapWidth = (this.mapData?.width || 52) * TILE;
        this.mapHeight = (this.mapData?.height || 24) * TILE;
        this.worldObjects = [];
        this.drawWorld();
        // NPC art is loaded after the server confirms the active map.
        this.mapNameLabel = this.addCrispText(this.scale.width / 2, 18, mapEntry?.name || 'Làng Aru', {
            fontSize: '16px',
            color: '#fff0b5', stroke: '#392718', strokeThickness: 5,
            backgroundColor: '#1b271bcc', padding: { x: 14, y: 6 }
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1000).setVisible(false);
        this.configureMapCamera();
        this.cursors = this.input.keyboard.createCursorKeys();
        this.lastUpPressAt = 0;
        this.upInputWasDown = false;
        this.onVirtualMovement = (event) => {
            this.virtualInput = event.detail || { axisX: 0, axisY: 0 };
            this.touchInputActive = Boolean(event.detail?.active);
        };
        window.addEventListener('game:virtual-movement', this.onVirtualMovement);
        this.onFocusedEnter = (event) => {
            if (this.focusedInteractable?.type === 'monster') {
                const targetId = String(this.focusedInteractable.id);
                const now = performance.now();
                if (this.lastTargetEnter?.id === targetId && now - this.lastTargetEnter.time <= 500) {
                    event.preventDefault();
                    this.startTargetAutoAttack(this.focusedInteractable.id);
                    this.lastTargetEnter = null;
                } else this.lastTargetEnter = { id: targetId, time: now };
                return;
            }
            if (!this.focusedInteractable) return;
            event.preventDefault();
            this.activateFocusedInteractable();
        };
        window.addEventListener('game:nro-enter', this.onFocusedEnter);
        this.onCycleFocus = () => this.cycleFocusedInteractable();
        window.addEventListener('game:nro-cycle-focus', this.onCycleFocus);
        this.onClearTarget = () => {
            this.selectedTargetId = null;
            this.stopTargetAutoAttack();
            if (this.focusedInteractable?.type === 'monster') this.focusedInteractable = null;
            this.updateFocusMarkers();
            this.cancelCombatApproach(true);
        };
        window.addEventListener('game:clear-target', this.onClearTarget);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener('game:virtual-movement', this.onVirtualMovement);
            window.removeEventListener('game:nro-enter', this.onFocusedEnter);
            window.removeEventListener('game:nro-cycle-focus', this.onCycleFocus);
            window.removeEventListener('game:clear-target', this.onClearTarget);
            this.socket?.off('initialState', this.onInitialState);
            this.socket?.off('stateUpdate', this.onStateUpdate);
            this.socket?.off('connect', this.onConnected);
            this.socket?.off('disconnect', this.onDisconnected);
            this.socket?.off('mapTransition', this.onMapTransition);
            this.socket?.off('flightStateChanged', this.onFlightStateChanged);
            this.socket?.off('flightError', this.onFlightError);
            this.socket?.off('skillSuccess', this.onSkillSuccess);
            this.socket?.off('monsterAttack', this.onMonsterAttack);
            this.socket?.off('damageTaken', this.onMonsterDamageTaken);
            this.socket?.off('combatApproach', this.onCombatApproach);
            this.socket?.off('combatError', this.onCombatError);
            this.socket?.off('nroTaskUpdate', this.onNroTaskUpdate);
            this.socket?.off('zoneError', this.onZoneError);
            window.clearInterval(this.pingTimer);
        });

        this.socket = networkInstance.connect();
        this.onInitialState = (state) => this.acceptInitialState(state);
        this.onStateUpdate = (state) => this.acceptSnapshot(state);
        this.onFlightStateChanged = ({ playerId, isFlying } = {}) => {
            const entity = this.players[playerId];
            if (entity) {
                entity.serverData = {
                    ...entity.serverData,
                    isFlying: Boolean(isFlying),
                    animationState: isFlying ? 'flying' : undefined
                };
            }
            if (playerId === this.myId) this.game.events.emit('updateStats', { isFlying: Boolean(isFlying) });
        };
        this.onFlightError = ({ message } = {}) => this.game.events.emit('setSystemMessage', message || 'Không thể bay lúc này.');
        this.onConnected = () => window.dispatchEvent(new CustomEvent('game:network-connection', {
            detail: { status: 'connected' }
        }));
        this.onDisconnected = () => window.dispatchEvent(new CustomEvent('game:network-connection', {
            detail: { status: 'reconnecting' }
        }));
        this.sendPing = () => {
            if (!this.socket?.connected) return;
            const startedAt = performance.now();
            this.socket.emit('networkPing', () => window.dispatchEvent(new CustomEvent('game:network-ping', {
                detail: { pingMs: performance.now() - startedAt }
            })));
        };
        this.socket.on('connect', this.onConnected);
        this.socket.on('disconnect', this.onDisconnected);
        this.socket.on('initialState', this.onInitialState);
        this.socket.on('stateUpdate', this.onStateUpdate);
        this.socket.on('flightStateChanged', this.onFlightStateChanged);
        this.socket.on('flightError', this.onFlightError);
        this.pingTimer = window.setInterval(this.sendPing, 3000);
        this.socket.on('newPlayer', (player) => {
            this.upsertPlayer(player);
        });
        this.socket.on('playerCharacterChanged', (change) => {
            const entity = this.players[change.playerId];
            if (entity) this.updatePlayerAppearance(entity, change);
        });
        this.socket.on('playerDisconnected', (id) => this.removeEntity(this.players, id));
        this.socket.on('chatHistory', (data) => this.game.events.emit('chatHistory', data?.channels || {}));
        this.socket.on('chatMessage', (message) => this.game.events.emit('chatMessage', message));
        this.socket.on('nroNpcDialog', (dialog) => {
            window.dispatchEvent(new CustomEvent('game:nro-npc-dialog', { detail: dialog || {} }));
        });
        this.socket.on('nroFlagResult', (result) => {
            window.dispatchEvent(new CustomEvent('game:nro-flag-result', { detail: result || {} }));
        });
        this.socket.on('nroRespawnResult', (result) => {
            window.dispatchEvent(new CustomEvent('game:nro-respawn-result', { detail: result || {} }));
            if (!result?.ok && result?.message) this.game.events.emit('setSystemMessage', result.message);
        });
        this.onNroTaskUpdate = (task) => window.dispatchEvent(new CustomEvent('game:nro-task-update', { detail: task || null }));
        this.socket.on('nroTaskUpdate', this.onNroTaskUpdate);
        this.socket.on('nroCharacterCreationResult', (result) => {
            if (result?.ok) {
                window.dispatchEvent(new CustomEvent('game:nro-character-created', { detail: result.character }));
                const skillConfig = { skills: result.skills || {}, levels: result.skillLevels || {} };
                this.game.events.emit('setSkillConfig', skillConfig);
                window.dispatchEvent(new CustomEvent('game:skill-config', { detail: skillConfig }));
            }
            this.game.events.emit('nroCharacterCreationResult', result);
        });
        this.socket.on('nroShopCatalog', (catalog) => {
            window.dispatchEvent(new CustomEvent('game:nro-shop-catalog', { detail: catalog || {} }));
        });
        this.socket.on('nroShopTransactionResult', (result) => {
            window.dispatchEvent(new CustomEvent('game:nro-shop-transaction', { detail: result || {} }));
        });
        this.socket.on('nroInventoryResult', (result) => {
            window.dispatchEvent(new CustomEvent('game:nro-inventory-result', { detail: result || {} }));
        });
        this.socket.on('nroTrainingResult', (result) => {
            if (result?.stats) this.game.events.emit('updateStats', result.stats);
            window.dispatchEvent(new CustomEvent('game:nro-training-result', { detail: result || {} }));
        });
        this.socket.on('nroPowerLimitResult', (result) => {
            if (result?.limitPower !== undefined) this.game.events.emit('updateStats', { limitPower: result.limitPower });
            if (result?.gold !== undefined) this.game.events.emit('updateStats', { gold: result.gold });
            window.dispatchEvent(new CustomEvent('game:nro-power-limit-result', { detail: result || {} }));
        });
        this.socket.on('itemDropped', (item) => this.upsertDrop(item));
        this.socket.on('itemPicked', (payload = {}) => {
            this.removeDrop(payload.itemId);
        });
        this.socket.on('itemPickupResult', (payload = {}) => {
            if (payload.ok) window.dispatchEvent(new CustomEvent('game:nro-inventory-picked', { detail: payload }));
            else this.game.events.emit('setSystemMessage', payload.message || 'Không nhặt được vật phẩm.');
        });
        this.onMapTransition = (payload = {}) => this.acceptMapTransition(payload);
        this.socket.on('mapTransition', this.onMapTransition);
        this.onZoneError = (payload = {}) => this.game.events.emit('setSystemMessage', payload.message || 'Không thể vào khu này.');
        this.socket.on('zoneError', this.onZoneError);
        this.onSkillSuccess = (payload) => {
            this.showSkillVfx(payload);
            const caster = this.players[payload?.playerId];
            if (caster?.generatedSprite) {
                const castTypes = new Set(['projectile', 'projectile_cc', 'channeling', 'aoe_burst']);
                this.playGeneratedPlayerAction(caster, castTypes.has(payload.skillType) ? 'cast' : 'attack', payload.skillId);
            }
            if (payload.playerId === this.myId) {
                this.game.events.emit('skillSuccess', payload);
                window.dispatchEvent(new CustomEvent('game:skill-cooldown', {
                    detail: { skillId: payload.skillId, cooldownMs: payload.cooldownMs }
                }));
            }
            for (const hit of payload.damageTaken || []) {
                if (hit.targetType === 'monster') {
                    const target = this.monsters[hit.targetId];
                    if (target && hit.damage > 0) this.showDamage(target, hit.damage, hit.isCrit);
                    continue;
                }
                if (hit.targetType === 'player') {
                    const target = this.players[hit.targetId];
                    if (target && hit.convertedToKi > 0) this.showDamage(target, `KI +${hit.convertedToKi}`, false, true);
                    else if (target && hit.dodged) this.showDamage(target, 'Né', false, true);
                    else if (target && hit.damage > 0) this.showDamage(target, hit.damage, hit.isCrit);
                    if (hit.targetId === this.myId && (Number.isFinite(hit.hp) || Number.isFinite(hit.mp))) {
                        this.game.events.emit('updateStats', {
                            ...(Number.isFinite(hit.hp) ? { hp: hit.hp, maxHp: hit.maxHp } : {}),
                            ...(Number.isFinite(hit.mp) ? { mp: hit.mp, maxMp: hit.maxMp } : {})
                        });
                    }
                }
            }
        };
        this.socket.on('skillSuccess', this.onSkillSuccess);
        this.onMonsterAttack = (payload = {}) => {
            const mob = this.monsters[payload.monsterId || payload.id];
            if (mob) {
                const facing = Number(payload.facing)
                    || (payload.from && payload.to ? Math.sign(Number(payload.to.x) - Number(payload.from.x)) : 0);
                if (facing) {
                    mob.serverData = { ...mob.serverData, facing };
                    if (mob.generatedMonsterSprite) mob.generatedMonsterSprite.flipX = facing < 0;
                }
                const frameProfile = (this.characterMobFrameManifest?.mobs || {})[Number(mob.generatedMonsterTemplateId)];
                if (frameProfile?.stationary) return;
            }
            this.showMonsterAttackVfx(payload);
        };
        this.onMonsterDamageTaken = (payload = {}) => {
            if (payload.skillId !== 'monster_attack') return;
            for (const hit of payload.damageTaken || []) {
                if (hit.targetType !== 'player') continue;
                const target = this.players[hit.targetId];
                if (target && hit.damage > 0) this.showDamage(target, hit.damage, false);
            }
        };
        this.socket.on('monsterAttack', this.onMonsterAttack);
        this.socket.on('damageTaken', this.onMonsterDamageTaken);
        this.socket.on('nroSkillConfig', (payload = {}) => {
            const skillConfig = { skills: payload.skills || {}, levels: payload.skillLevels || {} };
            this.game.events.emit('setSkillConfig', skillConfig);
            window.dispatchEvent(new CustomEvent('game:skill-config', { detail: skillConfig }));
            for (const skillId of payload.newlyUnlocked || []) {
                this.game.events.emit('setSystemMessage', `Đã mở khóa kỹ năng ${skillConfig.skills[skillId]?.name || skillId}!`);
            }
        });
        this.onCombatApproach = (request = {}) => {
            if (!request.targetId || !request.skillId) return;
            this.pendingCombatApproach = { ...request, nextInputAt: 0, lastAxis: null };
            this.game.events.emit('setSystemMessage', 'Đang áp sát mục tiêu...');
        };
        this.socket.on('combatApproach', this.onCombatApproach);
        this.onCombatError = (error) => {
            this.pendingCombatApproach = null;
            if (error.skillId && error.cooldownRemainingMs > 0) {
                window.dispatchEvent(new CustomEvent('game:skill-cooldown', {
                    detail: { skillId: error.skillId, cooldownMs: error.cooldownRemainingMs }
                }));
            } else if (error.skillId) {
                window.dispatchEvent(new CustomEvent('game:skill-rejected', { detail: error }));
            }
            this.game.events.emit('setSystemMessage', error.message || 'Không thể dùng kỹ năng.');
        };
        this.socket.on('combatError', this.onCombatError);
        this.input.on('pointerdown', (pointer) => {
            const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const sign = this.waypointSignposts.find((item) =>
                Math.abs(world.x - item.x) <= 110 && Math.abs(world.y - item.y) <= 28
            );
            if (sign) {
                this.lastTargetClick = null;
                const waypoint = this.findNearbyWaypointAt(this.players[this.myId]?.x, this.players[this.myId]?.y);
                if (!waypoint || waypoint.entry !== sign.entry) {
                    this.game.events.emit('setSystemMessage', 'Hãy đến gần biển chỉ đường để chuyển map.');
                    return;
                }
                this.nearbyWaypointId = sign.destinationMapId;
                this.nearbyWaypointEntry = sign.entry;
                this.setFocusedInteractable({ type: 'waypoint', id: sign.destinationMapId });
                this.activateFocusedInteractable();
                return;
            }
            const drop = Object.values(this.drops).find((entry) => Phaser.Math.Distance.Between(world.x, world.y, entry.x, entry.y) < 24);
            if (drop) {
                this.lastTargetClick = null;
                this.lastTargetClick = null;
                this.setFocusedInteractable({ type: 'drop', id: drop.id });
                this.activateFocusedInteractable();
                return;
            }
            const mob = Object.values(this.monsters).find((entry) =>
                !entry.serverData?.isDead && Phaser.Math.Distance.Between(world.x, world.y, entry.x, entry.y) < 32
            );
            if (mob) {
                const targetId = String(mob.serverData.id);
                const now = performance.now();
                const isDoubleClick = this.lastTargetClick?.id === targetId && now - this.lastTargetClick.time <= 500;
                this.lastTargetClick = { id: targetId, time: now };
                this.cancelCombatApproach(true);
                this.focusMob(mob);
                if (isDoubleClick) {
                    this.showDoubleClickTargetMarker(mob);
                    this.startTargetAutoAttack(mob.serverData.id);
                }
                return;
            }
            const npc = (this.mapEntry?.npcs || []).find((entry) =>
                Phaser.Math.Distance.Between(world.x, world.y, entry[1], entry[2]) <= 60
            );
            if (npc) {
                this.lastTargetClick = null;
                this.setFocusedInteractable({ type: 'npc', id: Number(npc[0]) });
                this.activateFocusedInteractable();
                return;
            }
            const waypoint = this.findNearbyWaypointAt(world.x, world.y);
            if (waypoint) {
                this.lastTargetClick = null;
                this.setFocusedInteractable({ type: 'waypoint', id: waypoint.destinationMapId });
                this.activateFocusedInteractable();
            }
            this.lastTargetClick = null;
        });
    }

    startTargetAutoAttack(targetId) {
        const target = this.monsters[targetId];
        if (!target || target.serverData?.isDead || Number(target.serverData?.hp) <= 0) return;
        this.autoAttackTargetId = targetId;
        this.players[this.myId]?.autoAttackLabel?.setVisible(true);
        window.dispatchEvent(new CustomEvent('game:nro-auto-attack', { detail: { active: true, targetId } }));
    }

    showDoubleClickTargetMarker(monster) {
        const marker = monster?.doubleClickTargetMarker;
        if (!marker?.active) return;
        this.tweens.killTweensOf(marker);
        marker.setVisible(true).setAlpha(1).setScale(0.75);
        this.tweens.add({
            targets: marker,
            alpha: 0,
            scale: 1.2,
            duration: 500,
            ease: 'Quad.easeOut',
            onComplete: () => marker.active && marker.setVisible(false).setAlpha(1).setScale(1)
        });
    }

    stopTargetAutoAttack() {
        if (this.autoAttackTargetId === undefined || this.autoAttackTargetId === null) return;
        this.autoAttackTargetId = null;
        this.players[this.myId]?.autoAttackLabel?.setVisible(false);
        window.dispatchEvent(new CustomEvent('game:nro-auto-attack', { detail: { active: false } }));
    }

    drawWorld() {
        const bg = this.add.graphics();
        const voidColors = {
            0: 0x385b35, 1: 0x3d633d, 3: 0x405943, 6: 0x514474,
            8: 0x60422e, 9: 0x294847, 12: 0x4e5c39
        };
        bg.fillStyle(voidColors[this.backgroundAssetId()] || 0x385b35, 1);
        bg.fillRect(0, 0, this.mapWidth, this.mapHeight).setDepth(-30);
        this.worldObjects.push(bg);
        this.drawBackgroundLayers();
        if (!this.mapData?.tiles) return;
        this.tileObjects = [];
        this.mapData.tiles.forEach((row, y) => row.forEach((id, x) => {
            if (!id) return;
            // The archive's tile strips do not include an index-to-frame table,
            // so use collision/map data for clean temporary terrain instead of
            // guessing and drawing unrelated frames.
            const tile = this.drawMapTile(id, x, y);
            // Sort terrain by its top edge. Player Y is the authoritative foot
            // position, so a character standing on this row must render above
            // the ground tile instead of having its legs hidden behind it.
            tile.setDepth(y * TILE);
            this.tileObjects.push(tile);
            this.worldObjects.push(tile);
        }));
    }

    drawMapTile(id, x, y) {
        // Tileset 13's ids 1-4 are collision-mask colors (white/black/yellow/purple),
        // not authored terrain art. Drawing those mask pixels made Karin Tower's
        // walkable platform appear as a white block with colored stripes.
        if (Number(this.mapEntry?.tileId) === 13 && [1, 2, 3, 4].includes(Number(id))) {
            return this.drawFallbackTile(id, x, y);
        }
        const textureKey = `nroTile_${this.mapEntry?.tileId}_${id}`;
        if (this.textures.exists(textureKey)) {
            return this.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, textureKey)
                .setOrigin(0.5, 0.5)
                .setDisplaySize(TILE, TILE);
        }
        return this.drawFallbackTile(id, x, y);
    }

    backgroundAssetId(mapEntry = this.mapEntry) {
        return Number.isInteger(Number(mapEntry?.bgId)) ? Number(mapEntry.bgId) : 0;
    }

    configureMapCamera() {
        const camera = this.cameras.main;
        if (!camera || !this.mapWidth || !this.mapHeight) return;

        // Keep short maps from exposing void past either edge. The zoom can
        // increase just enough for the map to cover the camera viewport, while
        // longer maps retain the regular world zoom and continue scrolling.
        const coverWidthZoom = camera.width / this.mapWidth;
        const coverHeightZoom = camera.height / this.mapHeight;
        const zoom = Math.max(BASE_WORLD_ZOOM, coverWidthZoom, coverHeightZoom);
        camera.setZoom(zoom);
        camera.setBounds(0, 0, this.mapWidth, this.mapHeight);
        camera.centerOn(this.mapWidth / 2, this.mapHeight / 2);
    }

    drawBackgroundLayers() {
        let groundRow = -1;
        let maxTopTiles = 0;
        const startRow = Math.floor((this.mapData?.height || 24) * 0.45);
        const endRow = Math.max(startRow, (this.mapData?.height || 24) - 2);
        for (let row = startRow; row < endRow; row++) {
            const count = (this.mapData?.tiles?.[row] || []).filter((tileId) => this.topTileValues?.has(tileId)).length;
            if (count > maxTopTiles) {
                maxTopTiles = count;
                groundRow = row;
            }
        }
        const groundY = groundRow >= 0 ? groundRow * TILE : this.mapHeight - TILE * 4;
        const customBackdrop = `nroCustomBg-${Number(this.mapEntry?.bgId)}`;
        if (this.textures.exists(customBackdrop)) {
            const backdrop = this.add.image(0, groundY, customBackdrop)
                .setOrigin(0, 1)
                .setDisplaySize(this.mapWidth, groundY)
                .setDepth(-25);
            this.worldObjects.push(backdrop);
            return;
        }
    }

    drawFallbackTile(id, x, y) {
        const left = x * TILE;
        const top = y * TILE;
        const solidTop = this.topTileValues?.has(id);
        const graphics = this.add.graphics().setPosition(left, top);
        if (id === 39) {
            graphics.fillStyle(0x98734b, 1).fillRect(0, 0, TILE, TILE);
            graphics.fillStyle(0xb58d5e, 1).fillRect(2, 2, 9, 7).fillRect(14, 12, 8, 9);
            graphics.fillStyle(0x795b3e, 1).fillRect(12, 3, 9, 7).fillRect(2, 14, 8, 8);
        } else if (solidTop) {
            graphics.fillStyle(0x8d6840, 1).fillRect(0, 0, TILE, TILE);
            graphics.fillStyle(0x68b94d, 1).fillRect(0, 0, TILE, 5);
            graphics.fillStyle(0xa17a4b, 1).fillRect(2, 9, 8, 5).fillRect(14, 17, 8, 4);
        } else {
            graphics.fillStyle(0x68b65a, 1).fillRect(0, 0, TILE, TILE);
            graphics.fillStyle(0x77c765, 0.7).fillRect(3, 5, 3, 3).fillRect(16, 15, 3, 3);
        }
        return graphics;
    }

    async ensureMobAssets(templateIds = []) {
        this.characterMobFrameManifest ||= this.cache.json.get('nroCharacterMobFrameManifest') || { mobs: {} };
        const frameMobProfiles = this.characterMobFrameManifest.mobs || {};
        this.mobActionManifest ||= fetch('/assets/nro/data/manifests/mob-animation-ids.json')
            .then((response) => response.ok ? response.json() : [])
            .then((ids) => new Set((Array.isArray(ids) ? ids : []).map(Number)))
            .catch(() => new Set());
        const availableActionIds = await this.mobActionManifest;
        const missing = [...new Set(templateIds.map(Number).filter(Number.isInteger))]
            .filter((id) => !this.mobAssetRequests.has(id));
        if (!missing.length) return;
        for (const id of missing) {
            this.mobAssetRequests.add(id);
            const frameProfile = frameMobProfiles[id];
            if (frameProfile) {
                const { slug, idleAction = 'di', actions = ['di', 'tancong', 'chet'], frameCount = 5 } = frameProfile;
                for (const frame of [1]) {
                    const key = `nroMobFrame-${id}-${idleAction}${frame}`;
                    this.load.image(key, `/assets/nro/monster/${slug}/${idleAction}/${idleAction}${frame}.png`);
                }
                for (const action of actions) {
                    for (let frame = 1; frame <= frameCount; frame += 1) {
                        const key = `nroMobFrame-${id}-${action}${frame}`;
                        if (this.textures.exists(key)) continue;
                        this.load.image(key, `/assets/nro/monster/${slug}/${action}/${action}${frame}.png`);
                    }
                }
                continue;
            }
            if (availableActionIds.has(id)) {
                this.load.spritesheet(`nroMobArt-${id}`, `/assets/nro/monster/generated/${id}.svg`, {
                    frameWidth: 64,
                    frameHeight: 80
                });
                for (const action of ['dung', 'dichuyen', 'tancong', 'chet']) {
                    for (let frame = 1; frame <= 5; frame += 1) {
                        const key = `nroMobFrame-${id}-${action}${frame}`;
                        this.load.image(key, `/assets/nro/monster/generated/${id}/${action}/${action}${frame}.png`);
                    }
                }
            }
        }
        if (this.load.list.size > 0) {
            await new Promise((resolve) => {
                this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
                this.load.start();
            });
        }
        for (const id of missing) {
            const frameProfile = frameMobProfiles[id];
            if (frameProfile) {
                const { idleAction = 'di', actions = ['di', 'tancong', 'chet'], frameCount = 5, stationary = false } = frameProfile;
                const idleKey = `nro-mob-${id}-idle`;
                const idleTexture = `nroMobFrame-${id}-${idleAction}1`;
                if (!this.anims.exists(idleKey) && this.textures.exists(idleTexture)) {
                    this.anims.create({ key: idleKey, frames: [{ key: idleTexture, frame: '__BASE' }], frameRate: 1, repeat: -1 });
                }
                const definitions = [
                    ...(!stationary && actions.includes('di') ? [['run', 'di', 8, -1]] : []),
                    ...(!stationary && actions.includes('tancong') ? [['attack', 'tancong', 10, 0]] : []),
                    ...(actions.includes('chet') ? [['death', 'chet', 8, 0]] : [])
                ];
                for (const [state, action, frameRate, repeat] of definitions) {
                    const key = `nro-mob-${id}-${state}`;
                    const frames = Array.from({ length: frameCount }, (_, index) => `nroMobFrame-${id}-${action}${index + 1}`)
                        .filter((frameKey) => this.textures.exists(frameKey));
                    if (!this.anims.exists(key) && frames.length) {
                        this.anims.create({ key, frames: frames.map((frameKey) => ({ key: frameKey, frame: '__BASE' })), frameRate, repeat });
                    }
                }
                continue;
            }
            const textureKey = `nroMobArt-${id}`;
            for (const [state, action, frameRate, repeat] of [
                ['idle', 'dung', 3, -1], ['run', 'dichuyen', 8, -1],
                ['attack', 'tancong', 10, 0], ['death', 'chet', 8, 0]
            ]) {
                const key = `nro-mob-${id}-${state}`;
                const frames = Array.from({ length: 5 }, (_, index) => `nroMobFrame-${id}-${action}${index + 1}`)
                    .filter((frameKey) => this.textures.exists(frameKey));
                if (!this.anims.exists(key) && frames.length) {
                    this.anims.create({ key, frames: frames.map((frameKey) => ({ key: frameKey })), frameRate, repeat });
                }
                if (!this.anims.exists(`${textureKey}-${state}`) && this.textures.exists(textureKey)) {
                    const fallback = state === 'attack' ? [2, 3] : state === 'run' ? [1, 2, 3] : [0, 1];
                    this.anims.create({ key: `${textureKey}-${state}`,
                        frames: fallback.map((frame) => ({ key: textureKey, frame })), frameRate, repeat });
                }
            }
        }
    }

    async ensureBossAssets(entities = {}) {
        const required = new Map();
        for (const entity of Object.values(entities)) {
            const ids = (entity.bossPartIds || []).map(Number).join(',');
            if (ids === '89,90,91') required.set('karin', '/assets/nro/boss/karin.svg');
            if (ids === '92,93,94') required.set('tau77', '/assets/nro/boss/tau77.svg');
        }
        const missing = [...required].filter(([name]) => !this.textures.exists(`nroBossArt-${name}`)
            && !this.bossAssetRequests.has(name));
        if (!missing.length) return;
        for (const [name, path] of missing) {
            this.bossAssetRequests.add(name);
            this.load.image(`nroBossArt-${name}`, path);
        }
        await new Promise((resolve) => {
            this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
            this.load.start();
        });
    }

    async ensureTileAssets(mapEntry) {
        const setId = Number(mapEntry?.tileId);
        const tileIds = new Set((mapEntry?.map?.tiles || []).flat().map(Number).filter((id) => id > 0));
        const missing = [...tileIds].filter((tileId) => !this.textures.exists(`nroTile_${setId}_${tileId}`));
        if (!Number.isInteger(setId) || !missing.length) return;
        for (const tileId of missing) {
            this.load.image(`nroTile_${setId}_${tileId}`, `/assets/nro/map/tiles/${setId}-${tileId}.svg`);
        }
        await new Promise((resolve) => {
            this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
            this.load.start();
        });
    }

    async ensureBackgroundAssets(mapEntry) {
        const bgId = this.backgroundAssetId(mapEntry);
        const key = `nroCustomBg-${bgId}`;
        if (this.textures.exists(key)) return;
        const path = this.nroArtPack.backgroundAssets?.[bgId] || `/assets/nro/map/backgrounds/bg-${bgId}.svg`;
        this.load.image(key, path);
        await new Promise((resolve) => {
            this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
            this.load.start();
        });
    }

    async ensureNpcAssets(mapEntry) {
        const ids = [...new Set((mapEntry?.npcs || []).map(([id]) => Number(id)).filter(Number.isInteger))];
        const missing = ids.filter((id) => !this.textures.exists(`nroNpcArt-${id}`));
        if (!missing.length) return;
        for (const id of missing) {
            const path = this.nroArtPack.npcAssets?.[id] || `/assets/nro/npc/generated/${id}.svg`;
            this.load.image(`nroNpcArt-${id}`, path);
        }
        await new Promise((resolve) => {
            this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
            this.load.start();
        });
    }

    mapMobTemplateIds(mapEntry) {
        return (mapEntry?.mobs || []).map((spawn) => Number(spawn[0]));
    }

    drawNpcs(npcs) {
        for (const npc of npcs) {
            const [npcId, x, y] = npc;
            const template = this.npcTemplatesById.get(npcId);
            const marker = this.add.container(x, y).setDepth(y + 1);
            const textureKey = `nroNpcArt-${npcId}`;
            const npcScale = this.nroArtPack.npcAssets?.[npcId] ? 0.45 : 0.9;
            const npcImage = this.add.image(0, -2, textureKey).setOrigin(0.5, 1).setScale(npcScale);
            const shadow = this.add.ellipse(0, 0, 28, 8, 0x183719, 0.5);
            const name = this.addCrispText(0, -npcImage.displayHeight - 6, template?.name || `NPC ${npcId}`, {
                fontSize: '12px', color: '#fff7d2',
                stroke: '#2d1b10', strokeThickness: 4
            }).setOrigin(0.5, 1);
            const focusArrow = this.addCrispText(0, -npcImage.displayHeight - 29, '▼', {
                fontSize: '15px',
                color: '#ffe35c', stroke: '#4c2506', strokeThickness: 4
            }).setOrigin(0.5, 1).setVisible(false);
            marker.add([shadow, npcImage, name, focusArrow]);
            marker.focusArrow = focusArrow;
            this.npcMarkers.set(Number(npcId), marker);
            this.worldObjects.push(marker);
        }
    }

    switchMap(mapEntry) {
        if (!mapEntry?.map) return;
        this.stopTargetAutoAttack();
        this.npcMarkers.clear();
        this.focusedInteractable = null;
        this.selectedTargetId = null;
        this.game.events.emit('clearSelectedTarget');
        window.dispatchEvent(new CustomEvent('game:nro-focus', { detail: null }));
        this.nearbyWaypointId = null;
        this.nearbyWaypointEntry = null;
        this.cameras.main.stopFollow();
        for (const sign of this.waypointSignposts) sign.container.destroy();
        this.waypointSignposts = [];
        for (const object of this.worldObjects || []) object.destroy();
        this.mapNameLabel?.destroy();
        for (const collection of [this.players, this.monsters, this.companions, this.drops]) {
            for (const object of Object.values(collection || {})) {
                if (collection === this.drops) object.marker?.destroy?.();
                else object.destroy?.();
            }
        }
        this.players = {};
        this.monsters = {};
        this.companions = {};
        this.drops = {};
        this.worldObjects = [];
        this.mapEntry = mapEntry;
        this.mapData = mapEntry.map;
        const tileSet = this.cache.json.get('nroTileSets')?.find((set) => set.setId === mapEntry.tileId);
        this.topTileValues = new Set((tileSet?.tileTypes?.find((type) => type.type === 2)?.tiles || [])
            .filter((tileId) => !(mapEntry.id === 0 && tileId === 39)));
        this.mapWidth = this.mapData.width * TILE;
        this.mapHeight = this.mapData.height * TILE;
        this.drawWorld();
        this.drawNpcs(mapEntry.npcs || []);
        this.drawWaypointSignposts(mapEntry.waypoints || []);
        this.mapNameLabel = this.addCrispText(this.scale.width / 2, 18, mapEntry.name || `Map ${mapEntry.id}`, {
            fontSize: '16px',
            color: '#fff0b5', stroke: '#392718', strokeThickness: 5,
            backgroundColor: '#1b271bcc', padding: { x: 14, y: 6 }
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1000).setVisible(false);
        this.configureMapCamera();
    }

    async acceptMapTransition(payload) {
        if (!payload?.mapEntry) return;
        const companionTemplates = Object.values(payload.players || {}).map((player) => player.companion?.templateId);
        await this.ensureMobAssets([...this.mapMobTemplateIds(payload.mapEntry), ...companionTemplates]);
        await this.ensureTileAssets(payload.mapEntry);
        await this.ensureBackgroundAssets(payload.mapEntry);
        await this.ensureNpcAssets(payload.mapEntry);
        await this.ensureBossAssets(payload.monsters);
        this.switchMap(payload.mapEntry);
        for (const player of Object.values(payload.players || {})) {
            this.upsertPlayer(player);
            if (player.companion) this.upsertCompanion(player.id, player.companion);
        }
        for (const monster of Object.values(payload.monsters || {})) this.upsertMonster(monster);
        for (const item of Object.values(payload.items || {})) this.upsertDrop(item);
        const me = payload.players?.[this.myId] || payload.player;
        if (me) {
            if (!this.players[me.id]) this.upsertPlayer(me);
            this.game.events.emit('setPlayerPos', { x: me.x, y: me.y });
            this.game.events.emit('updateStats', { ...me, ...me.inventory, username: me.username });
            this.cameras.main.startFollow(this.players[this.myId], true, 0.15, 0.15);
        }
        window.dispatchEvent(new Event('game:nro-scene-ready'));
        window.dispatchEvent(new CustomEvent('game:nro-map-changed', {
            detail: { mapId: payload.mapEntry.id, name: payload.mapEntry.name, zoneId: payload.zoneId ?? 0 }
        }));
    }

    async acceptInitialState(state) {
        this.myId = state.playerId;
        const initialMap = state.config?.nroWorld?.mapEntry;
        const companionTemplates = Object.values(state.players || {}).map((player) => player.companion?.templateId);
        await this.ensureMobAssets([...this.mapMobTemplateIds(initialMap), ...companionTemplates]);
        await this.ensureTileAssets(initialMap);
        await this.ensureBackgroundAssets(initialMap);
        await this.ensureNpcAssets(initialMap);
        await this.ensureBossAssets(state.monsters);
        if (initialMap) this.switchMap(initialMap);
        if (initialMap) {
            window.dispatchEvent(new CustomEvent('game:nro-map-changed', {
                detail: { mapId: initialMap.id, name: initialMap.name, zoneId: state.config?.nroWorld?.zoneId ?? 0 }
            }));
        }
        window.dispatchEvent(new CustomEvent('game:nro-task-update', {
            detail: state.character?.nroCharacter?.mainTask || null
        }));
        window.dispatchEvent(new CustomEvent('game:mode', {
            detail: { gameMode: state.config?.gameMode || 'nro' }
        }));
        window.dispatchEvent(new CustomEvent('game:nro-training-config', {
            detail: {
                limit: state.config?.nroPowerLimit,
                limitPower: state.character?.nroCharacter?.limitPower || 0,
                openPowerExpiresAt: state.character?.nroCharacter?.openPowerExpiresAt || 0
            }
        }));
        this.game.events.emit('setPlayerId', this.myId);
        const skillConfig = { skills: state.config?.skills || {}, levels: state.config?.skillLevels || {} };
        this.game.events.emit('setSkillConfig', skillConfig);
        window.dispatchEvent(new CustomEvent('game:skill-config', { detail: skillConfig }));
        window.dispatchEvent(new CustomEvent('game:network-config', {
            detail: { tickRateHz: state.config?.tickRateHz }
        }));
        for (const player of Object.values(state.players || {})) {
            this.upsertPlayer(player);
            if (player.companion) this.upsertCompanion(player.id, player.companion);
        }
        for (const monster of Object.values(state.monsters || {})) this.upsertMonster(monster);
        for (const item of Object.values(state.items || {})) this.upsertDrop(item);
        const me = state.players?.[this.myId];
        if (me) {
            this.game.events.emit('updateStats', {
                ...me, ...me.inventory, username: me.username
            });
            this.game.events.emit('setPlayerPos', { x: me.x, y: me.y });
            this.cameras.main.startFollow(this.players[this.myId], true, 0.15, 0.15);
        }
        window.dispatchEvent(new Event('game:nro-scene-ready'));
    }

    upsertDrop(item) {
        if (!item?.id || this.drops[item.id]) return;
        const marker = this.add.container(item.x, item.y).setDepth(item.y + 4);
        const isGold = item.type === 'gold';
        const fallback = this.add.circle(0, 0, 7, isGold ? 0xfbbf24 : 0x67e8f9, 1).setStrokeStyle(2, isGold ? 0x92400e : 0x155e75);
        marker.add(fallback);
        marker.add(this.addCrispText(0, -11, isGold ? `${item.value} vàng` : item.name || 'Vật phẩm', {
            fontSize: '10px', color: '#fff7d2', stroke: '#2d1b10', strokeThickness: 4
        }).setOrigin(0.5, 1));
        const focusArrow = this.addCrispText(0, -24, '▼', {
            fontSize: '15px',
            color: '#7df9ff', stroke: '#123849', strokeThickness: 4
        }).setOrigin(0.5, 1).setVisible(false);
        marker.add(focusArrow);
        const drop = { id: item.id, x: item.x, y: item.y, marker, fallback, icon: null, focusArrow, serverData: item };
        this.drops[item.id] = drop;
        const templateId = Number(item.templateId);
        if (Number.isInteger(templateId) && templateId >= 0) {
            const key = `nroDropArt${templateId}`;
            if (this.textures.exists(key)) this.applyDropIcon(drop, key);
            else if (!this.pendingDropIcons.has(key)) {
                this.pendingDropIcons.add(key);
                const itemUrl = this.nroArtPack.itemAssets?.[templateId] || this.nroGeneratedItems[templateId] || `/assets/nro/items/khac/item-${templateId}.svg`;
                this.load.image(key, itemUrl);
                this.load.once(`filecomplete-image-${key}`, () => {
                    this.pendingDropIcons.delete(key);
                    if (!this.textures.exists(key)) return;
                    for (const loadedDrop of Object.values(this.drops)) {
                        if (Number(loadedDrop.serverData.templateId) === templateId) this.applyDropIcon(loadedDrop, key);
                    }
                });
                this.load.start();
            }
        }
    }

    applyDropIcon(drop, key) {
        if (!drop || drop.icon || !this.textures.exists(key)) return;
        drop.fallback?.destroy();
        drop.icon = this.add.image(0, 0, key).setDisplaySize(20, 20);
        drop.marker.addAt(drop.icon, 0);
    }

    removeDrop(itemId) {
        const drop = this.drops[itemId];
        if (!drop) return;
        drop.marker.destroy();
        delete this.drops[itemId];
    }

    acceptSnapshot(state) {
        const localPlayer = state.players?.[this.myId];
        const inSameArea = (entity) => (!localPlayer?.mapId || entity.mapId === localPlayer.mapId)
            && (localPlayer?.zoneId === undefined || entity.zoneId === localPlayer.zoneId);
        const distanceFromPlayer = (entity) => Math.hypot((Number(entity.x) || 0) - (Number(localPlayer?.x) || 0), (Number(entity.y) || 0) - (Number(localPlayer?.y) || 0));
        const nearbyPlayers = Object.entries(state.players || {})
            .filter(([id, entity]) => id !== this.myId && inSameArea(entity))
            .map(([id, entity]) => ({ id, name: entity.username || entity.characterName || 'Chiến binh', level: entity.level,
                hp: Number(entity.hp) || 0, maxHp: Number(entity.maxHp) || 0, distance: distanceFromPlayer(entity) }))
            .sort((a, b) => a.distance - b.distance).slice(0, 5);
        const nearbyBosses = Object.entries(state.monsters || {})
            .filter(([, entity]) => inSameArea(entity) && !entity.isDead && Number(entity.hp) > 0
                && (entity.type === 'boss' || entity.type === 'quest_boss' || entity.bossPartIds?.length))
            .map(([id, entity]) => ({ id, name: entity.name || 'Boss', level: entity.level,
                hp: Number(entity.hp) || 0, maxHp: Number(entity.maxHp) || 0, distance: distanceFromPlayer(entity) }))
            .sort((a, b) => a.distance - b.distance).slice(0, 5);
        window.dispatchEvent(new CustomEvent('game:nro-nearby-entities', { detail: { players: nearbyPlayers, bosses: nearbyBosses } }));
        window.dispatchEvent(new CustomEvent('game:network-tick', {
            detail: {
                receivedAt: performance.now(),
                players: Object.keys(state.players || {}).length,
                monsters: Object.keys(state.monsters || {}).length
            }
        }));
        for (const [id, data] of Object.entries(state.players || {})) {
            if (id === this.myId) {
                window.dispatchEvent(new CustomEvent('game:nro-player-effects', { detail: data.effects || [] }));
            }
            const entity = this.players[id] || this.upsertPlayer({ id, ...data });
            this.setTarget(entity, data);
            entity.serverData = { ...entity.serverData, ...data, id };
            if (data.companion) {
                const companion = data.companion;
                this.ensureMobAssets([companion.templateId]).then(() => {
                    if (this.players[id]?.serverData?.companion?.id === companion.id) this.upsertCompanion(id, companion);
                });
            } else {
                this.removeEntity(this.companions, id);
            }
            if (id === this.myId) {
                if (Number(data.hp) <= 0) this.stopTargetAutoAttack();
                this.game.events.emit('setPlayerPos', { x: data.x, y: data.y });
                this.game.events.emit('updateStats', data);
            }
        }
        this.updateCompanions();
        for (const [id, data] of Object.entries(state.monsters || {})) {
            const bossKey = data.bossPartIds?.map(Number).join(',');
            const bossName = bossKey === '89,90,91' ? 'karin' : 'tau77';
            if (!this.monsters[id] && ['89,90,91', '92,93,94'].includes(bossKey)
                && !this.textures.exists(`nroBossArt-${bossName}`)) {
                if (!this.bossAssetRequests.has(bossName)) {
                    void this.ensureBossAssets({ [id]: data }).then(() => this.upsertMonster({ id, ...data }));
                }
                continue;
            }
            const entity = this.monsters[id] || this.upsertMonster({ id, ...data });
            this.setTarget(entity, data);
            entity.serverData = { ...entity.serverData, ...data, id };
            if (!data.isDead && data.hp > 0) {
                entity.deathAnimationStarted = false;
                entity.setVisible(true);
            }
            if (id === this.selectedTargetId) {
                this.game.events.emit('updateTargetHp', { id, ...data });
                if (data.isDead || data.hp <= 0) {
                    this.selectedTargetId = null;
                    this.game.events.emit('clearSelectedTarget');
                }
            }
        }
        this.refreshMonsterTargetIndicators();
    }

    refreshMonsterTargetIndicators() {
        const targetedPlayerIds = new Set(Object.values(this.monsters)
            .map((monster) => monster.serverData?.targetId)
            .filter((id) => id !== null && id !== undefined)
            .map(String));
        for (const [id, player] of Object.entries(this.players)) {
            player.monsterTargetIndicator?.setVisible(!player.isLocalPlayer && targetedPlayerIds.has(String(id)));
        }
    }

    upsertPlayer(data) {
        let entity = this.players[data.id];
        if (!entity) {
            const graphics = this.add.container(data.x || 60, data.y || 456).setScale(1 / 1.2);
            const flightAura = this.add.ellipse(0, 1, 42, 14, 0x38bdf8, 0.14)
                .setStrokeStyle(2, 0x67e8f9, 0.8).setVisible(Boolean(data.isFlying));
            const shadow = this.add.ellipse(0, 0, 30, 8, 0x173314, 0.45);
            const race = this.getPlayerRace(data);
            // Source PNGs have transparent padding below the feet. Offset each
            // frame so its visible pixels meet the server's foot coordinate.
            const sprite = this.add.sprite(0, 8, `nroPlayer-${race}-dung1`)
                .setOrigin(0.5, 1)
                .setScale(0.82);
            const name = this.addCrispText(0, 0, data.username || 'Chiến binh', {
                fontSize: '13px', color: '#fff7d2',
                stroke: '#2d1b10', strokeThickness: 4
            }).setOrigin(0.5, 1);
            name.setY(-sprite.displayHeight - 7);
            const monsterTargetIndicator = data.id === this.myId ? null : this.addCrispText(0, name.y - 1, '▼', {
                fontSize: '13px',
                color: '#ff685d', stroke: '#45130e', strokeThickness: 4
            }).setOrigin(0.5, 1).setVisible(false);
            const autoAttackLabel = this.addCrispText(0, name.y - 15, 'TỰ ĐÁNH', {
                fontSize: '10px', color: '#fff184', stroke: '#3c2608', strokeThickness: 4
            }).setOrigin(0.5, 1).setVisible(false);
            graphics.add([flightAura, shadow, sprite, name, autoAttackLabel]);
            if (monsterTargetIndicator) graphics.add(monsterTargetIndicator);
            graphics.setSize(30, 56).setDepth(data.y || 456);
            entity = graphics;
            entity.nameLabel = name;
            entity.monsterTargetIndicator = monsterTargetIndicator;
            entity.autoAttackLabel = autoAttackLabel;
            entity.generatedSprite = sprite;
            entity.generatedRace = race;
            entity.generatedAction = false;
            entity.generatedFlightAura = flightAura;
            entity.generatedShadow = shadow;
            entity.renderX = data.x || 60;
            entity.renderY = data.y || 456;
            entity.isLocalPlayer = data.id === this.myId;
            this.players[data.id] = entity;
        }
        entity.serverData = { ...data };
        this.updatePlayerAppearance(entity, data);
        this.setTarget(entity, data);
        return entity;
    }

    updatePlayerAppearance(entity, data) {
        if (!entity?.generatedSprite) return;
        entity.serverData = { ...entity.serverData, ...data };
        const race = this.getPlayerRace(entity.serverData);
        if (race === entity.generatedRace) return;
        entity.generatedAction = false;
        entity.generatedRace = race;
        entity.generatedSprite.stop();
        entity.generatedSprite.setTexture(`nroPlayer-${race}-dung1`);
        entity.nameLabel?.setY(entity.generatedSprite.y - entity.generatedSprite.displayHeight - 7);
        this.updateGeneratedPlayerAnimation(entity);
    }

    upsertMonster(data) {
        let entity = this.monsters[data.id];
        if (!entity) {
            const graphics = this.add.container(data.x || 0, data.y || 0);
            const shadow = this.add.ellipse(0, 0, 30, 8, 0x173314, 0.5);
            const generatedMobKey = `nroMobArt-${Number(data.templateId)}`;
            const mobFrameProfile = (this.characterMobFrameManifest?.mobs || {})[Number(data.templateId)];
            const firstFrameKey = `nroMobFrame-${Number(data.templateId)}-${mobFrameProfile?.idleAction || 'dung'}1`;
            if (this.textures.exists(firstFrameKey) || this.textures.exists(generatedMobKey)) {
                const crispFrames = this.textures.exists(firstFrameKey);
                const renderScale = crispFrames ? 0.575 : 1.15;
                const frameMetrics = crispFrames ? this.getMobFrameMetrics(firstFrameKey, renderScale) : null;
                const groundOffset = frameMetrics?.groundOffset || 0;
                const sprite = crispFrames
                    ? this.add.sprite(0, groundOffset, firstFrameKey).setOrigin(0.5, 1).setScale(renderScale)
                    : this.add.sprite(0, 0, generatedMobKey, 0).setOrigin(0.5, 1).setScale(renderScale);
                const idleKey = this.anims.exists(`nro-mob-${Number(data.templateId)}-idle`)
                    ? `nro-mob-${Number(data.templateId)}-idle` : `${generatedMobKey}-idle`;
                if (this.anims.exists(idleKey)) sprite.play(idleKey);
                const nameY = sprite.y - (frameMetrics?.visibleHeight || sprite.displayHeight) - 6;
                const name = this.addCrispText(0, nameY, data.name || 'Quái', {
                    fontSize: '13px', color: '#fff7d2',
                    stroke: '#2d1b10', strokeThickness: 4
                }).setOrigin(0.5, 1);
                const targetRing = this.add.ellipse(0, -2, 48, 16, 0xfbbf24, 0.1)
                    .setStrokeStyle(2, 0xffd65a, 0.9).setVisible(false);
                const focusArrow = this.addCrispText(0, nameY - 19, '▼', {
                    fontSize: '15px',
                    color: '#ffe35c', stroke: '#4c2506', strokeThickness: 4
                }).setOrigin(0.5, 1).setVisible(false);
                graphics.add([targetRing, shadow, sprite, name, focusArrow]);
                graphics.setSize(40, 56);
                this.monsters[data.id] = graphics;
                entity = graphics;
                entity.generatedMonsterSprite = sprite;
                entity.generatedMonsterTemplateId = Number(data.templateId);
                entity.nameLabel = name;
                entity.targetRing = targetRing;
                entity.focusArrow = focusArrow;
                entity.deathAnimationStarted = false;
                entity.attackAnimationPlaying = false;
            } else if (Array.isArray(data.bossPartIds) && data.bossPartIds.length === 3) {
                const partIds = data.bossPartIds.map(Number).join(',');
                const bossName = partIds === '89,90,91' ? 'karin' : 'tau77';
                const bossImage = this.add.image(0, 0, `nroBossArt-${bossName}`).setOrigin(0.5, 1).setScale(0.95);
                graphics.add([shadow, bossImage]);
                graphics.add(this.addCrispText(0, -bossImage.displayHeight - 5, data.name || 'Boss', {
                    fontSize: '14px', color: '#fff0bd',
                    stroke: '#2d160e', strokeThickness: 5
                }).setOrigin(0.5, 1));
                graphics.setSize(48, 72);
                this.monsters[data.id] = graphics;
                entity = graphics;
                entity.serverData = {};
            } else {
                const mob = this.add.rectangle(0, -16, 25, 32, 0x8b5e3c).setStrokeStyle(2, 0x3e2518);
                const name = this.addCrispText(0, -39, data.name || 'Quái', {
                fontSize: '13px', color: '#fff7d2',
                stroke: '#2d1b10', strokeThickness: 4
                }).setOrigin(0.5, 1);
                graphics.add([shadow, mob, name]);
                graphics.setSize(32, 48);
                this.monsters[data.id] = graphics;
                entity = graphics;
            }
        }
        if (!entity.focusArrow) {
            entity.focusArrow = this.addCrispText(0, -Math.max(40, Number(entity.height) || 48) - 8, '▼', {
                fontSize: '15px',
                color: '#ffe35c', stroke: '#4c2506', strokeThickness: 4
            }).setOrigin(0.5, 1).setVisible(false);
            entity.add(entity.focusArrow);
        }
        if (!entity.doubleClickTargetMarker) {
            const markerY = Number(entity.nameLabel?.y);
            entity.doubleClickTargetMarker = this.addCrispText(0,
                Number.isFinite(markerY) ? markerY - 20 : -Math.max(42, Number(entity.height) || 48) - 10,
                'X', { fontSize: '24px', color: '#ff3e35', stroke: '#3b0806', strokeThickness: 6, fontStyle: 'bold' })
                .setOrigin(0.5, 1).setVisible(false);
            entity.add(entity.doubleClickTargetMarker);
        }
        entity.serverData = { ...data };
        if (String(this.autoAttackTargetId) === String(data.id)
            && (data.isDead || Number(data.hp) <= 0)) this.stopTargetAutoAttack();
        this.setTarget(entity, data);
        entity.entityId = data.id;
        if (!data.isDead) {
            entity.deathAnimationStarted = false;
            entity.setVisible(true);
        }
        return entity;
    }

    getMobFrameMetrics(textureKey, scale) {
        const cacheKey = `${textureKey}:${scale}`;
        if (this.mobFrameMetrics.has(cacheKey)) return this.mobFrameMetrics.get(cacheKey);
        const metrics = { groundOffset: 0, visibleHeight: 0 };
        try {
            const source = this.textures.get(textureKey)?.getSourceImage?.();
            if (source?.width && source?.height) {
                const canvas = document.createElement('canvas');
                canvas.width = source.width;
                canvas.height = source.height;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                context.drawImage(source, 0, 0);
                const pixels = context.getImageData(0, 0, source.width, source.height).data;
                let top = source.height;
                let bottom = -1;
                for (let y = 0; y < source.height; y += 1) {
                    for (let x = 0; x < source.width; x += 1) {
                        if (pixels[(y * source.width + x) * 4 + 3] > 8) {
                            top = Math.min(top, y);
                            bottom = Math.max(bottom, y);
                        }
                    }
                }
                if (bottom >= top && top < source.height) {
                    metrics.groundOffset = (source.height - 1 - bottom) * scale;
                    metrics.visibleHeight = (bottom - top + 1) * scale;
                }
            }
        } catch { /* Cross origin or non-raster textures keep their authored baseline. */ }
        this.mobFrameMetrics.set(cacheKey, metrics);
        return metrics;
    }

    upsertCompanion(playerId, data) {
        if (!data || !this.players[playerId]) return;
        let entity = this.companions[playerId];
        if (entity?.serverData?.id !== data.id) {
            entity?.destroy();
            entity = null;
        }
        if (!entity) {
            const owner = this.players[playerId];
            const template = this.mobTemplatesById.get(Number(data.templateId));
            const generatedMobKey = `nroMobArt-${Number(data.templateId)}`;
            const graphics = this.add.container(owner.x + 24, owner.y - 8).setDepth(owner.y + 2);
            graphics.add(this.add.ellipse(0, 0, 22, 6, 0x173314, 0.45));
            if (this.textures.exists(generatedMobKey)) {
                const sprite = this.add.sprite(0, -7, generatedMobKey, 0).setOrigin(0.5, 1).setScale(0.72);
                sprite.play(`${generatedMobKey}-idle`);
                graphics.add(sprite);
            }
            else graphics.add(this.add.circle(0, -8, 9, 0x65c9e8, 1).setStrokeStyle(2, 0x12354a));
            const label = this.addCrispText(0, -32, template?.name || 'Đệ tử', {
                fontSize: '10px', color: '#e6f8ff',
                stroke: '#10283a', strokeThickness: 4
            }).setOrigin(0.5, 1);
            graphics.add(label);
            entity = graphics;
            entity.serverData = {};
            this.companions[playerId] = entity;
        }
        entity.serverData = { ...data };
        entity.setVisible(data.hp > 0 && data.remainingMs > 0);
        return entity;
    }

    updateCompanions() {
        for (const [playerId, companion] of Object.entries(this.companions)) {
            const owner = this.players[playerId];
            if (!owner || !owner.serverData?.companion) {
                this.removeEntity(this.companions, playerId);
                continue;
            }
            companion.setPosition(owner.x + (owner.serverData.facing || 1) * 25, owner.y - 7);
            companion.setDepth(owner.y + 2);
        }
    }

    setTarget(entity, data) {
        entity.targetX = Number(data.x) || 0;
        entity.targetY = Number(data.y) || 0;
        entity.targetFacing = data.facing || 1;
        entity.snapshotHistory = pushPositionSnapshot(entity.snapshotHistory, data, performance.now());
    }

    removeEntity(collection, id) {
        collection[id]?.destroy();
        delete collection[id];
    }

    showDamage(target, amount, isCrit, isDodge = false) {
        const label = this.addCrispText(target.x, target.y - 48, `${isCrit ? '✦ ' : ''}${amount}`, {
            fontSize: isCrit ? '18px' : '15px',
            fontStyle: 'bold', color: isDodge ? '#9dffad' : isCrit ? '#ffd54a' : '#fff4e6',
            stroke: isDodge ? '#154d22' : '#6b1111', strokeThickness: 4
        }).setOrigin(0.5).setDepth(10000);
        this.tweens.add({
            targets: label, y: label.y - 34, alpha: 0, duration: 750,
            onComplete: () => label.destroy()
        });
    }

    showSkillVfx(payload) {
        const caster = this.players[payload?.playerId];
        if (!caster || !payload.skillType) return;
        const destination = payload.targetPos || (payload.targetId && this.monsters[payload.targetId]) || caster;
        const x = Number(destination.x) || caster.x;
        const y = Number(destination.y) || caster.y;
        const colorByType = {
            projectile: 0x67e8f9, projectile_cc: 0x38bdf8, cone_aoe: 0xa78bfa,
            aoe_melee: 0xf97316, aoe_debuff: 0xfacc15, aoe_target: 0xfb7185,
            aoe_burst: 0xfde047, aoe_zone: 0x4ade80, aoe_heal: 0x34d399,
            dash_target: 0xc084fc, dash_back: 0x60a5fa, channeling: 0x22d3ee, buff: 0xf0abfc, melee: 0xffedd5
        };
        const color = colorByType[payload.skillType] || 0xfbbf24;
        const originX = caster.x + (caster.targetFacing || 1) * 14;
        const originY = caster.y - 20;
        const type = payload.skillType;
        const duration = Math.max(350, Number(payload.effectDurationMs) || 900);
        const radius = Math.max(22, Number(payload.radiusPx) || 48);
        const finish = (object, extra = {}) => this.tweens.add({
            targets: object, alpha: 0, duration: 420, onComplete: () => object.destroy(), ...extra
        });

        if (['projectile', 'projectile_cc', 'channeling'].includes(type)) {
            const bolt = this.add.circle(originX, originY, payload.skillType === 'channeling' ? 5 : 7, color)
                .setStrokeStyle(2, 0xffffff).setDepth(10001);
            this.tweens.add({ targets: bolt, x, y, alpha: 0.2, scale: 0.35, duration: 180, onComplete: () => bolt.destroy() });
            return;
        }

        if (type === 'dash_target' || type === 'dash_back') {
            // The server owns movement; this is only a trail between the rendered
            // position and the authoritative destination included in skillSuccess.
            const end = payload.position || { x, y };
            const trail = this.add.graphics().setDepth(10000);
            trail.lineStyle(12, color, 0.82).beginPath().moveTo(caster.x, caster.y - 12)
                .lineTo(Number(end.x) || x, Number(end.y) || y).strokePath();
            finish(trail, { duration: 300 });
            const flash = this.add.circle(Number(end.x) || x, Number(end.y) || y, 16, color, 0.75).setDepth(10001);
            this.tweens.add({ targets: flash, scale: 2.2, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
            return;
        }

        if (type === 'cone_aoe') {
            const dx = x - caster.x;
            const dy = y - caster.y;
            const facing = Math.atan2(dy, dx);
            const halfAngle = Math.PI / 6;
            const reach = Math.max(55, Number(payload.rangePx) || 150);
            const points = [{ x: caster.x, y: caster.y - 18 }];
            for (let index = 0; index <= 10; index += 1) {
                const angle = facing - halfAngle + (index / 10) * halfAngle * 2;
                points.push({ x: caster.x + Math.cos(angle) * reach, y: caster.y - 18 + Math.sin(angle) * reach });
            }
            const wedge = this.add.graphics().setDepth(10000);
            wedge.fillStyle(color, 0.48).fillPoints(points, true).lineStyle(3, color, 0.9).strokePoints(points, true);
            finish(wedge, { duration: 320 });
            return;
        }

        if (type === 'melee') {
            const slash = this.add.graphics().setDepth(10001);
            const direction = caster.targetFacing || 1;
            slash.lineStyle(7, color, 1).beginPath()
                .moveTo(caster.x + direction * 8, caster.y - 38)
                .lineTo(caster.x + direction * 34, caster.y - 24)
                .lineTo(caster.x + direction * 14, caster.y - 8).strokePath();
            finish(slash, { duration: 170, scaleX: 1.3 });
            return;
        }

        if (type === 'buff') {
            const aura = this.add.circle(caster.x, caster.y - 12, 22, color, 0.14)
                .setStrokeStyle(3, color, 0.9).setDepth(caster.depth + 1);
            this.tweens.add({ targets: aura, scale: 1.45, alpha: 0.04, duration,
                yoyo: true, repeat: Math.max(0, Math.floor(duration / 700) - 1), onComplete: () => aura.destroy() });
            return;
        }

        if (['aoe_zone', 'aoe_heal'].includes(type)) {
            const zone = this.add.circle(x, y, radius, color, type === 'aoe_heal' ? 0.12 : 0.2)
                .setStrokeStyle(3, color, 0.9).setDepth(9999);
            this.tweens.add({ targets: zone, alpha: 0.32, duration: 450, yoyo: true,
                repeat: Math.max(0, Math.floor(duration / 900) - 1), onComplete: () => zone.destroy() });
            return;
        }

        if (type === 'aoe_burst') {
            const impact = this.add.circle(x, y, 12, color, 0.68).setStrokeStyle(4, 0xffffff).setDepth(10001);
            this.tweens.add({ targets: impact, scale: radius / 12, alpha: 0, duration: 420, onComplete: () => impact.destroy() });
            return;
        }

        // Ground-targeted AoE: a quick expanding ring communicates its hit area.
        const ring = this.add.circle(x, y, 8, color, 0.18).setStrokeStyle(3, color).setDepth(10001);
        this.tweens.add({ targets: ring, scale: radius / 8, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    }

    showMonsterAttackVfx(payload) {
        const monster = this.monsters[payload.monsterId];
        if (monster) {
            monster.serverData = {
                ...monster.serverData,
                state: 'Attack',
                attackSequence: Number(payload.sequence) || monster.serverData?.attackSequence || 0
            };
            const templateId = monster.generatedMonsterTemplateId;
            const attackKey = this.anims.exists(`nro-mob-${templateId}-attack`)
                ? `nro-mob-${templateId}-attack` : `nroMobArt-${templateId}-attack`;
            if (monster.generatedMonsterSprite && this.anims.exists(attackKey)) {
                monster.generatedMonsterSprite.play(attackKey);
                monster.lastAttackAnimationSequence = Number(payload.sequence) || 0;
                monster.attackAnimationPlaying = true;
                monster.generatedMonsterSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
                    monster.attackAnimationPlaying = false;
                });
            }
        }
        if (!payload.isRangedAttack || !payload.from || !payload.to) return;
        const bolt = this.add.circle(payload.from.x, payload.from.y, 8, 0xffbd32)
            .setStrokeStyle(2, 0xfff1a6).setDepth(10002);
        const aura = this.add.circle(payload.from.x, payload.from.y, 12, 0xff7a1a, 0.32)
            .setStrokeStyle(2, 0xffc66d, 0.8).setDepth(10001);
        this.tweens.add({
            targets: [bolt, aura],
            x: payload.to.x,
            y: payload.to.y,
            duration: 360,
            ease: 'Linear',
            onComplete: () => {
                bolt.destroy();
                aura.destroy();
                const impact = this.add.circle(payload.to.x, payload.to.y, 9, 0xffd766, 0.85).setDepth(10002);
                this.tweens.add({ targets: impact, scale: 2.2, alpha: 0, duration: 180, onComplete: () => impact.destroy() });
            }
        });
    }

    update(_time, delta) {
        const alpha = Math.min(1, Math.max(0, delta / 70));
        const renderAt = performance.now() - NRO_REMOTE_INTERPOLATION_DELAY_MS;
        for (const entity of Object.values({ ...this.players, ...this.monsters })) {
            if (!Number.isFinite(entity.targetX)) continue;
            const previousRenderX = entity.x;
            const remotePosition = entity.isLocalPlayer ? null : samplePositionSnapshot(entity.snapshotHistory, renderAt);
            if (remotePosition) {
                entity.x = remotePosition.x;
                entity.y = remotePosition.y;
                entity.targetFacing = remotePosition.facing;
            } else {
                entity.x = Phaser.Math.Linear(entity.x, entity.targetX, alpha);
                entity.y = Phaser.Math.Linear(entity.y, entity.targetY, alpha);
            }
            // Keep the sprite in front of the platform at the same foot row.
            entity.setDepth(entity.y + 1);
            if (entity.generatedMonsterSprite) {
                const frameProfile = (this.characterMobFrameManifest?.mobs || {})[entity.generatedMonsterTemplateId];
                const attackAnimationKey = this.anims.exists(`nro-mob-${entity.generatedMonsterTemplateId}-attack`)
                    ? `nro-mob-${entity.generatedMonsterTemplateId}-attack`
                    : `nroMobArt-${entity.generatedMonsterTemplateId}-attack`;
                const keepAttackAnimation = entity.attackAnimationPlaying
                    && entity.generatedMonsterSprite.anims.isPlaying
                    && entity.generatedMonsterSprite.anims.currentAnim?.key === attackAnimationKey;
                const renderedVelocityX = (entity.x - previousRenderX) * 1000 / Math.max(1, delta);
                const state = entity.serverData?.isDead || entity.serverData?.state === 'Dead'
                    ? 'death'
                    : !frameProfile?.stationary && (keepAttackAnimation || entity.serverData?.state === 'Attack') ? 'attack'
                    : !frameProfile?.stationary && Math.abs(Number(entity.serverData?.velocityX) || renderedVelocityX) > 0.5 ? 'run' : 'idle';
                const animationKey = this.anims.exists(`nro-mob-${entity.generatedMonsterTemplateId}-${state}`)
                    ? `nro-mob-${entity.generatedMonsterTemplateId}-${state}`
                    : `nroMobArt-${entity.generatedMonsterTemplateId}-${state}`;
                if (entity.targetRing) entity.targetRing.setVisible(entity.serverData?.id === this.selectedTargetId);
                if (state === 'death' && !entity.deathAnimationStarted) {
                    entity.deathAnimationStarted = true;
                    entity.attackAnimationPlaying = false;
                    if (this.anims.exists(animationKey)) {
                        entity.generatedMonsterSprite.play(animationKey);
                        entity.generatedMonsterSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
                            if (entity.serverData?.isDead) entity.setVisible(false);
                        });
                    } else entity.setVisible(false);
                } else if (state === 'attack') {
                    const sequence = Number(entity.serverData?.attackSequence) || 0;
                    if (sequence > (entity.lastAttackAnimationSequence || 0)) {
                        entity.generatedMonsterSprite.play(animationKey);
                        entity.lastAttackAnimationSequence = sequence;
                    } else if (!entity.generatedMonsterSprite.anims.isPlaying) {
                        const idleKey = this.anims.exists(`nro-mob-${entity.generatedMonsterTemplateId}-idle`)
                            ? `nro-mob-${entity.generatedMonsterTemplateId}-idle`
                            : `nroMobArt-${entity.generatedMonsterTemplateId}-idle`;
                        if (this.anims.exists(idleKey)) entity.generatedMonsterSprite.play(idleKey, true);
                    }
                } else if (this.anims.exists(animationKey)
                    && (entity.generatedMonsterSprite.anims.currentAnim?.key !== animationKey
                        || !entity.generatedMonsterSprite.anims.isPlaying)) {
                    entity.deathAnimationStarted = false;
                    entity.generatedMonsterSprite.play(animationKey, true);
                }
                entity.generatedMonsterSprite.setFlipX((entity.serverData?.facing || 1) < 0);
            }
            if (entity.generatedSprite && entity.serverData) {
                const animationState = entity.serverData.animationState || (entity.serverData.isFlying ? 'flying' : 'standing');
                const flying = animationState === 'flying';
                const dead = Number(entity.serverData.hp) <= 0;
                entity.generatedSprite.setFlipX(entity.targetFacing < 0);
                if (dead) entity.generatedSprite.setAlpha(0.58).setTint(0x9dd8ff);
                else entity.generatedSprite.setAlpha(1).clearTint();
                entity.generatedFlightAura?.setVisible(flying)
                    .setAlpha(flying ? 0.35 + Math.sin(this.time.now / 120) * 0.12 : 0);
                entity.generatedShadow?.setScale(flying ? 0.72 : 1).setAlpha(flying ? 0.22 : 0.45);
                this.updateGeneratedPlayerAnimation(entity);
            }
        }
        this.updateCompanions();
        if (!this.socket?.connected || !this.myId) return;
        this.updateFocusedInteractable();
        const active = document.activeElement;
        const typing = active instanceof HTMLElement && (active.isContentEditable || ['INPUT', 'TEXTAREA'].includes(active.tagName));
        const analogActive = Math.abs(this.virtualInput.axisX || 0) > 0.03
            || Math.abs(this.virtualInput.axisY || 0) > 0.03;
        const movementRequested = analogActive || Boolean(this.virtualInput.up || this.virtualInput.down
            || this.virtualInput.left || this.virtualInput.right || this.cursors.left.isDown
            || this.cursors.right.isDown || this.cursors.up.isDown || this.cursors.down.isDown);
        if (this.autoAttackTargetId !== null && this.autoAttackTargetId !== undefined && movementRequested) {
            this.stopTargetAutoAttack();
        }
        if (this.pendingCombatApproach) {
            if (typing) {
                this.cancelCombatApproach(true);
            } else if (this.touchInputActive || analogActive || this.cursors.left.isDown || this.cursors.right.isDown
                || this.cursors.up.isDown || this.cursors.down.isDown) {
                this.cancelCombatApproach(true);
            } else {
                this.updateCombatApproach();
                return;
            }
        }
        if (typing) {
            if (this.lastInput !== 'neutral') {
                this.lastInput = 'neutral';
                this.socket.emit('playerInput', { left: false, right: false, up: false, down: false, jump: false });
            }
            return;
        }
        const upNow = Boolean(this.virtualInput.up || (!this.touchInputActive && this.cursors.up.isDown));
        const upPressed = upNow && !this.upInputWasDown;
        this.upInputWasDown = upNow;
        if (upPressed) {
            if (this.lastUpPressAt > 0 && this.time.now - this.lastUpPressAt <= 350) {
                this.socket.emit('toggleFly');
                this.lastUpPressAt = 0;
            } else this.lastUpPressAt = this.time.now;
        }
        if (this.touchInputActive || analogActive) {
            return;
        }
        const input = {
            left: this.cursors.left.isDown,
            right: this.cursors.right.isDown,
            up: this.cursors.up.isDown,
            down: this.cursors.down.isDown,
            jump: this.cursors.up.isDown
        };
        const signature = JSON.stringify(input);
        if (signature !== this.lastInput) {
            this.lastInput = signature;
            this.socket.emit('playerInput', input);
        }
    }

    updateCombatApproach() {
        const request = this.pendingCombatApproach;
        const player = this.players[this.myId];
        const target = request && this.monsters[request.targetId];
        if (!request || !player || !target || target.serverData?.isDead || this.selectedTargetId !== request.targetId) {
            this.cancelCombatApproach(true);
            return;
        }
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const distance = Math.hypot(dx, dy);
        const stoppingDistance = Math.max(10, (Number(request.rangePx) || 50) - 8);
        const verticalTolerance = Number(request.verticalTolerance) || 42;
        const verticallyAligned = Math.abs(dy) <= verticalTolerance;
        const withinRange = distance <= stoppingDistance && verticallyAligned;
        const facingTarget = Math.sign(dx) === (player.serverData?.facing || 1);
        if (withinRange && (!request.requiresFacing || facingTarget || Math.abs(dx) < 8)) {
            this.cancelCombatApproach(false);
            this.lastInput = 'neutral';
            this.socket.emit('playerInput', { left: false, right: false, up: false, down: false, jump: false });
            this.socket.emit('castSkill', { skillId: request.skillId, target: request.targetId });
            return;
        }
        if (this.time.now < request.nextInputAt) return;
        request.nextInputAt = this.time.now + 90;
        const needsVerticalTravel = Math.abs(dy) > verticalTolerance;
        const input = {
            left: dx < -4,
            right: dx > 4,
            up: needsVerticalTravel && dy < 0,
            down: needsVerticalTravel && dy > 0,
            jump: needsVerticalTravel && dy < 0,
            flight: needsVerticalTravel && dy > 0
        };
        const axis = input.left ? -1 : input.right ? 1 : 0;
        if (axis !== request.lastAxis || this.time.now - (request.lastInputAt || 0) >= 250) {
            request.lastAxis = axis;
            request.lastInputAt = this.time.now;
            this.socket.emit('playerInput', input);
        }
        if (!request.startedAt) request.startedAt = this.time.now;
        if (this.time.now - request.startedAt > 10000) {
            this.cancelCombatApproach(true);
            this.game.events.emit('setSystemMessage', 'Không thể tiếp cận mục tiêu.');
        }
    }

    cancelCombatApproach(stopMovement = false) {
        if (!this.pendingCombatApproach) return;
        this.pendingCombatApproach = null;
        if (stopMovement && this.socket?.connected) {
            this.lastInput = 'neutral';
            this.socket.emit('playerInput', { left: false, right: false, up: false, down: false, jump: false });
        }
    }

    focusMob(mob) {
        const data = mob?.serverData;
        if (!data?.id || data.isDead || data.hp <= 0) return;
        if (this.autoAttackTargetId !== null && this.autoAttackTargetId !== undefined
            && String(this.autoAttackTargetId) !== String(data.id)) this.stopTargetAutoAttack();
        this.focusedInteractable = { type: 'monster', id: data.id };
        this.selectedTargetId = data.id;
        this.game.events.emit('setSelectedTarget', {
            id: data.id, name: data.name, hp: data.hp, maxHp: data.maxHp,
            level: data.level, type: data.type, atk: data.atk, def: data.def
        });
        this.updateFocusMarkers();
    }

    setFocusedInteractable(candidate) {
        const current = this.focusedInteractable;
        if (current?.type === candidate?.type && String(current?.id) === String(candidate?.id)) return;
        if (current?.type === 'monster') {
            this.selectedTargetId = null;
            this.game.events.emit('clearSelectedTarget');
        }
        this.focusedInteractable = candidate ? { type: candidate.type, id: candidate.id } : null;
        if (candidate?.type === 'monster') {
            const mob = this.monsters[candidate.id];
            if (mob) this.focusMob(mob);
        } else this.updateFocusMarkers();
    }

    getNearbyInteractableCandidates() {
        const player = this.players[this.myId];
        if (!player) return [];
        const candidates = [];
        const add = (type, id, x, y, acquireRange, retainRange = acquireRange) => {
            const distance = Phaser.Math.Distance.Between(player.x, player.y, x, y);
            candidates.push({ type, id, x, y, distance, acquireRange, retainRange });
        };
        for (const entry of this.mapEntry?.npcs || []) add('npc', Number(entry[0]), Number(entry[1]), Number(entry[2]), 72, 96);
        for (const mob of Object.values(this.monsters)) {
            if (!mob.serverData?.isDead && mob.serverData?.hp > 0) add('monster', mob.serverData.id, mob.x, mob.y, 200, 270);
        }
        for (const drop of Object.values(this.drops)) {
            if (!drop.serverData?.satellite) add('drop', drop.id, drop.x, drop.y, 72, 96);
        }
        const waypoint = findNearbyNroWaypoint(player, this.mapEntry?.waypoints,
            player.serverData?.width || player.width || 40, player.serverData?.height || player.height || 40);
        this.nearbyWaypointId = waypoint?.destinationMapId ?? null;
        this.nearbyWaypointEntry = waypoint?.entry || null;
        if (waypoint) add('waypoint', waypoint.destinationMapId,
            (Number(waypoint.entry[1]) + Number(waypoint.entry[3])) / 2,
            (Number(waypoint.entry[2]) + Number(waypoint.entry[4])) / 2, 120, 160);
        return candidates;
    }

    updateFocusMarkers() {
        const focus = this.focusedInteractable;
        for (const [npcId, marker] of this.npcMarkers) {
            marker.focusArrow?.setVisible(focus?.type === 'npc' && focus.id === npcId);
        }
        for (const [id, mob] of Object.entries(this.monsters)) {
            const selected = focus?.type === 'monster' && String(focus.id) === id;
            mob.focusArrow?.setVisible(selected);
            mob.targetRing?.setVisible(selected);
            if (String(this.autoAttackTargetId) === id
                && (mob.serverData?.isDead || Number(mob.serverData?.hp) <= 0)) this.stopTargetAutoAttack();
        }
        for (const [id, drop] of Object.entries(this.drops)) {
            drop.focusArrow?.setVisible(focus?.type === 'drop' && String(focus.id) === id);
        }
        let summary = null;
        if (focus?.type === 'monster') {
            const data = this.monsters[focus.id]?.serverData;
            if (data) summary = { id: focus.id, name: data.name, hp: data.hp, maxHp: data.maxHp };
        } else if (focus?.type === 'npc') {
            summary = { id: focus.id, name: this.npcTemplatesById.get(Number(focus.id))?.name || 'NPC', label: 'NPC' };
        } else if (focus?.type === 'drop') {
            summary = { id: focus.id, name: this.drops[focus.id]?.serverData?.name || 'Vật phẩm', label: 'Nhặt vật phẩm' };
        } else if (focus?.type === 'waypoint') {
            summary = { id: focus.id, name: this.mapCatalogById?.get(Number(focus.id))?.name || 'Chuyển map', label: 'Đi đến' };
        }
        window.dispatchEvent(new CustomEvent('game:nro-focus', { detail: summary }));
    }

    updateFocusedInteractable() {
        // Double-click auto attack pins its target until the scene stops it
        // (manual movement, explicit target change, death, or map transition).
        // Do not let the proximity-focus scan clear that target mid-combat.
        if (this.autoAttackTargetId !== null && this.autoAttackTargetId !== undefined) {
            const autoTarget = this.monsters[this.autoAttackTargetId];
            if (autoTarget && !autoTarget.serverData?.isDead && Number(autoTarget.serverData?.hp) > 0) return;
            this.stopTargetAutoAttack();
        }
        const candidates = this.getNearbyInteractableCandidates();
        const current = this.focusedInteractable;
        const focused = candidates.find((item) => item.type === current?.type && String(item.id) === String(current?.id));
        if (focused && focused.distance <= focused.retainRange) return;
        candidates.sort((a, b) => a.distance - b.distance);
        this.setFocusedInteractable(candidates.find((item) => item.distance <= item.acquireRange) || null);
    }

    drawWaypointSignposts(waypoints) {
        this.waypointSignposts = [];
        for (const entry of waypoints) {
            const destinationMapId = Number(entry?.[7]);
            const x1 = Number(entry?.[1]); const y1 = Number(entry?.[2]);
            const x2 = Number(entry?.[3]); const y2 = Number(entry?.[4]);
            if (![destinationMapId, x1, y1, x2, y2].every(Number.isFinite)) continue;
            const destinationName = this.mapCatalogById?.get(destinationMapId)?.name || String(entry[0] || `Bản đồ ${destinationMapId}`);
            const label = this.addCrispText(0, 0, destinationName, {
                fontSize: '14px',
                color: '#fff0bd', stroke: '#482511', strokeThickness: 5,
                padding: { x: 9, y: 6 }, align: 'center'
            }).setOrigin(0.5);
            const plaque = this.add.rectangle(0, 0, label.width + 8, label.height + 4, 0x26170d, 0.96)
                .setStrokeStyle(2, 0xd88937, 1);
            // Edge portals can be only one tile wide. Centering a long name on
            // the portal puts half the plaque outside the map or under the wall.
            const halfWidth = (label.width + 8) / 2;
            const edgeClearance = 48;
            const forestReturnOffset = Number(this.mapEntry?.id) === 46 && destinationMapId === 47 ? 76 : 0;
            const x = Phaser.Math.Clamp(
                (x1 + x2) / 2 + forestReturnOffset,
                Math.min(halfWidth + edgeClearance, this.mapWidth / 2),
                Math.max(this.mapWidth - halfWidth - edgeClearance, this.mapWidth / 2)
            );
            const y = Math.max(label.height / 2 + 8, Math.min(y1, y2) - label.height / 2 - 34);
            // Keep the nameplate above foreground wall/ground tiles so it stays
            // fully readable while remaining anchored to the authored portal.
            const container = this.add.container(x, y).setDepth(20000).setAlpha(0.72);
            container.add([plaque, label]);
            this.waypointSignposts.push({ destinationMapId, entry, x, y, container });
        }
    }

    cycleFocusedInteractable() {
        const candidates = this.getNearbyInteractableCandidates().filter((item) => item.distance <= item.acquireRange)
            .sort((a, b) => a.distance - b.distance);
        if (!candidates.length) return;
        const index = candidates.findIndex((item) => item.type === this.focusedInteractable?.type
            && String(item.id) === String(this.focusedInteractable?.id));
        this.setFocusedInteractable(candidates[(index + 1) % candidates.length]);
    }

    findNearbyWaypointAt(x, y) {
        const player = this.players[this.myId];
        const waypoint = player && findNearbyNroWaypoint(
            { ...player, x, y }, this.mapEntry?.waypoints,
            player.serverData?.width || player.width || 40,
            player.serverData?.height || player.height || 40
        );
        if (waypoint) {
            this.nearbyWaypointId = waypoint.destinationMapId;
            this.nearbyWaypointEntry = waypoint.entry;
        }
        return waypoint || null;
    }

    activateFocusedInteractable() {
        const focus = this.focusedInteractable;
        if (!focus || !this.socket?.connected) return;
        if (focus.type === 'npc') this.interactWithNpc(focus.id);
        else if (focus.type === 'waypoint') this.travelThroughWaypoint(focus.id);
        else if (focus.type === 'drop') {
            const drop = this.drops[focus.id];
            if (drop && !drop.serverData?.satellite) this.socket.emit('pickupItem', drop.id);
        } else if (focus.type === 'monster') {
            const mob = this.monsters[focus.id];
            if (mob) this.focusMob(mob);
        }
    }

    travelThroughWaypoint(destinationMapId) {
        const parsedId = Number(destinationMapId);
        if (!Number.isInteger(parsedId) || parsedId !== this.nearbyWaypointId || !this.socket?.connected) return;
        this.socket.emit('travelNroWaypoint', { destinationMapId: parsedId });
    }

    interactWithNpc(npcId) {
        const parsedId = Number(npcId);
        if (!Number.isInteger(parsedId) || !this.socket?.connected) return;
        this.socket.emit('interactNroNpc', parsedId);
    }
}
