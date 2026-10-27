const gameConfig = require('../config/gameConfig.json');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const MonsterAI = require('../game/MonsterAI');
const { clampToLeashCircle, findNearestValidTarget } = require('../game/autoFarm');
const {
    parseMovementInput,
    createTokenBucket,
    getMovementSpeedPxPerSecond,
    getMovementDelta,
    getMovementTowardDelta,
    clampPlayerPosition
} = require('../game/movement');
const { metersToPixels } = require('../game/units');
const { SkillManager, clampSkillLevel } = require('../game/SkillManager');
const { getNroSkill, getNroSkillSet, getNroSkillBookInfo } = require('../game/nroSkills');
const {
    applyNroEquipmentAuraDrain,
    applyNroEquipmentKiRecovery10s,
    applyNroEquipmentRecovery,
    applyNroGoldDropBonus,
    getBeanRecoveryAmount,
    getNroEquipmentAttack,
    getNroEquipmentBonuses,
    getNroTnsmBonuses,
    normalizeItemOptions
} = require('../game/nroItems');
const { getNroProgress } = require('../game/nroProgression');
const { activateNroCharm, getNroCharm } = require('../game/nroCharms');
const { getNroPowerLimit, trainNroStat } = require('../game/nroTraining');
const authService = require('../modules/auth/authService');
const userRepository = require('../modules/auth/userRepository');
const guildService = require('../modules/guild/guildService');
const { createChatService } = require('./chatService');
const { createNroMovementState, getNroAnimationState, getNroMovementInput, getNroTileCollisionMasks, isNroMovementBlocked, stepNroMovement, toggleNroFlight } = require('../game/nroMovement');
const { tickNroRespawn } = require('../game/nroRespawn');
const { initializeNroStamina, recoverNroStamina } = require('../game/nroStamina');
const nroMaps = require('../../../shared/nro/maps/catalog.json');
const nroTileSets = require('../../../shared/nro/maps/tile-sets.json');
const nroMobTemplates = require('../../../shared/nro/maps/mob-templates.json');
const nroNpcTemplates = require('../../../shared/nro/maps/npc-templates.json');
const nroItemTemplates = require('../../../shared/nro/maps/item-templates.json');
const nroItemShop = require('../../../shared/nro/maps/item-shop.json');
const nroShops = require('../../../shared/nro/maps/shops.json');
const nroShopTabs = require('../../../shared/nro/maps/shop-tabs.json');
const nroItemOptions = require('../../../shared/nro/maps/item-options.json');
const nroItemShopOptions = require('../../../shared/nro/maps/item-shop-options.json');
const nroMobRewards = require('../../../shared/nro/maps/mob-rewards.json');
const nroMobDropBaseOptions = require('../../../shared/nro/maps/mob-drop-base-options.json');
const nroTaskTemplates = require('../../../shared/nro/maps/tasks.json');

function stackOptionsKey(options) {
    return JSON.stringify((options || []).map((option) => [Number(option.optionId), Number(option.param ?? option.parameter ?? 0)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]));
}

function findMatchingStack(bag, template, options = []) {
    if (!template?.stackable) return null;
    const key = stackOptionsKey(options);
    return bag.find((slot) => Number(slot.templateId) === Number(template.id)
        && stackOptionsKey(slot.options) === key);
}

function mergeExistingStackableItems(bag) {
    let changed = false;
    const sourceBag = Array.isArray(bag) ? bag : [];
    const merged = [];
    const byKey = new Map();
    for (const slot of sourceBag) {
        const template = nroItemTemplates.find((entry) => entry.id === Number(slot.templateId));
        if (!template?.stackable) { merged.push(slot); continue; }
        const key = `${template.id}:${stackOptionsKey(slot.options)}`;
        const existing = byKey.get(key);
        if (!existing) {
            const normalized = { ...slot, quantity: Math.max(1, Math.floor(Number(slot.quantity) || 1)) };
            byKey.set(key, normalized);
            merged.push(normalized);
        } else {
            existing.quantity += Math.max(1, Math.floor(Number(slot.quantity) || 1));
            changed = true;
        }
    }
    return { bag: changed ? merged : sourceBag, changed };
}

function getNroMap(mapId) { return nroMaps.find((entry) => entry.id === Number(mapId)) || null; }
function canUseNroNpcShop(player, npcId) {
    const requiredRaceByNpc = { 7: 'earth', 8: 'namek', 9: 'saiyan' };
    const requiredRace = requiredRaceByNpc[Number(npcId)];
    return !requiredRace || player?.raceId === requiredRace;
}
function findNroMapSpawn(mapEntry, topTileValues, tileSize) {
    if (!mapEntry?.map || !topTileValues.size) return { x: 60, y: 384 };
    // Initial spawns for the three race homes should use the authored waypoint
    // destination from each race's village, not a heuristic platform center.
    const homeVillageByMap = { 21: 0, 22: 7, 23: 14 };
    const homeVillageId = homeVillageByMap[Number(mapEntry.id)];
    if (homeVillageId !== undefined) {
        const incoming = getNroMap(homeVillageId)?.waypoints?.find((waypoint) => Number(waypoint[7]) === Number(mapEntry.id));
        const spawnX = Number(incoming?.[8]);
        const spawnY = Number(incoming?.[9]);
        if (Number.isFinite(spawnX) && Number.isFinite(spawnY)) return { x: spawnX, y: spawnY };
    }
    const { width, height, tiles } = mapEntry.map;
    let best = null;
    // Find the widest walkable platform in the lower half of the map. This
    // gives maps without hand-authored spawn points a real floor to fall onto.
    for (let row = Math.floor(height * 0.5); row < height - 2; row++) {
        let start = -1;
        for (let column = 1; column < width; column++) {
            const isPlatform = topTileValues.has(tiles[row]?.[column]);
            if (isPlatform && start < 0) start = column;
            if ((!isPlatform || column === width - 1) && start >= 0) {
                const end = isPlatform && column === width - 1 ? column : column - 1;
                const length = end - start + 1;
                if (!best || length > best.length) best = { row, start, end, length };
                start = -1;
            }
        }
    }
    if (!best) return { x: Math.min(width * tileSize / 2, width * tileSize - tileSize * 2), y: 384 };
    return {
        x: Math.round((best.start + best.end + 1) * tileSize / 2),
        y: Math.max(0, best.row * tileSize - tileSize * 2)
    };
}

function resolveNroMapArrival(world, requestedX, requestedY, playerWidth = 40) {
    const { map, tileSize } = world;
    const solidTileValues = world.solidTileValues || world.topTileValues;
    const minX = tileSize + 12;
    const maxX = map.width * tileSize - tileSize - 12;
    const rawX = Number(requestedX);
    const rawY = Number(requestedY);
    const desiredX = Number.isFinite(rawX) ? rawX : world.spawn.x;
    const desiredY = Number.isFinite(rawY) ? rawY : world.spawn.y;
    const x = Math.max(minX, Math.min(maxX, desiredX));
    const y = Math.max(tileSize, Math.min(map.height * tileSize - tileSize * 4, desiredY));
    const halfWidth = Math.max(1, Number(playerWidth) || 40) / 2;
    const firstColumn = Math.max(0, Math.floor((x - halfWidth) / tileSize));
    const lastColumn = Math.min(map.width - 1, Math.floor((x + halfWidth) / tileSize));
    const maxVerticalOffset = tileSize * 8;
    let nearestSurface = null;

    for (let row = 1; row < map.height - 4; row += 1) {
        const surfaceY = row * tileSize;
        const verticalOffset = surfaceY - y;
        if (Math.abs(verticalOffset) > maxVerticalOffset) continue;
        for (let column = firstColumn; column <= lastColumn; column += 1) {
            const currentTile = map.tiles[row]?.[column];
            const tileAbove = map.tiles[row - 1]?.[column];
            // Collision maps repeat solid tile ids through the whole body of a
            // platform. Only its top edge is a valid arrival/standing surface.
            if (!solidTileValues.has(currentTile) || solidTileValues.has(tileAbove)) continue;
            const score = Math.abs(verticalOffset);
            if (!nearestSurface || score < nearestSurface.score) nearestSurface = { y: surfaceY, score };
        }
    }

    if (nearestSurface) return { x, y: nearestSurface.y, grounded: true };
    return { x: world.spawn.x, y: world.spawn.y, grounded: false };
}

function isNroPositionInsideTerrain(world, position, playerWidth = 40) {
    if (!world?.map || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return false;
    const solidTiles = world.solidTileValues || world.topTileValues;
    const halfWidth = Math.max(1, Number(playerWidth) || 40) / 2;
    const row = Math.floor((position.y - 0.001) / world.tileSize);
    const firstColumn = Math.max(0, Math.floor((position.x - halfWidth + 0.001) / world.tileSize));
    const lastColumn = Math.min(world.map.width - 1, Math.floor((position.x + halfWidth - 0.001) / world.tileSize));
    for (let column = firstColumn; column <= lastColumn; column += 1) {
        if (solidTiles.has(world.map.tiles[row]?.[column])) return true;
    }
    return false;
}
function getHomeForRace(raceId) {
    const homes = {
        earth: { mapId: 21, npcId: 0, npcName: 'Gôhan' },
        namek: { mapId: 22, npcId: 2, npcName: 'Moori' },
        saiyan: { mapId: 23, npcId: 1, npcName: 'Paragus' }
    };
    return homes[raceId] || homes.earth;
}
function getStartMapForRace(raceId) {
    return { earth: 0, namek: 7, saiyan: 14 }[raceId] ?? 0;
}
function getFoodMapForRace(raceId) {
    // Source ConstTask.MAP_200: Earth=1, Namek=8, Saiyan=15.
    return { earth: 1, namek: 8, saiyan: 15 }[raceId] ?? 1;
}
function getMeteorMapForRace(raceId) {
    // Task 3 points to the race's authored cliff map, where the meteor event is placed.
    return { earth: 42, namek: 43, saiyan: 44 }[raceId] ?? 42;
}

function createMainTaskState(saved = {}, raceId = 'earth') {
    const taskId = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(Number(saved.taskId)) ? Number(saved.taskId) : 1;
    const taskTemplate = nroTaskTemplates.find((entry) => entry.id === taskId);
    const subtaskIndex = Math.max(0, Number(saved.subtaskIndex) || 0);
    const subtask = taskTemplate?.subtasks?.[subtaskIndex];
    const home = getHomeForRace(raceId);
    const foodMapId = getFoodMapForRace(raceId);
    const foodMapName = getNroMap(foodMapId)?.name || `khu vực ${foodMapId}`;
    const meteorMapId = getMeteorMapForRace(raceId);
    const meteorMapName = getNroMap(meteorMapId)?.name || `khu vực ${meteorMapId}`;
    return {
        taskId,
        status: ['active', 'ready_to_report', 'completed'].includes(saved.status) ? saved.status : 'active',
        subtaskIndex,
        progress: Math.max(0, Number(saved.progress) || 0),
        title: taskTemplate?.name || 'Nhiệm vụ tập luyện',
        detail: (taskTemplate?.detail || '').replaceAll('Gohan', home.npcName)
            .replaceAll('%2', home.npcName).replaceAll('%3', foodMapName)
            .replaceAll('%8', 'Bò Mộng').replaceAll('%9', 'Quỷ bay')
            .replaceAll('%4', 'khủng long, lợn lòi và quỷ đất'),
        objective: taskId === 7 && subtaskIndex === 1
            ? (subtask?.name || '').replaceAll('%9', 'Quỷ bay').replace('20 con', '10 con')
            : taskId === 8 && subtaskIndex === 2
                ? (subtask?.name || '').replaceAll('%2', home.npcName)
            : (subtask?.name || 'Đánh ngã 5 mộc nhân').replaceAll('%2', home.npcName)
                .replaceAll('%8', 'Bò Mộng').replaceAll('%9', 'Quỷ bay'),
        target: Math.max(1, Number(subtask?.maxCount) || 5),
        targetMapId: taskId === 2 ? foodMapId : taskId === 3 && subtaskIndex === 1 ? meteorMapId
            : taskId === 4 ? [2, 9, 17][subtaskIndex] ?? null
                : taskId === 7 ? (subtaskIndex === 1 ? 17 : subtaskIndex === 2 ? 47 : null)
                    : taskId === 8 && subtaskIndex === 1 ? 4 : taskId === 8 && subtaskIndex === 3 ? 46
                    : taskId === 9 ? (subtaskIndex < 2 ? 47 : 46)
                        : taskId === 10 ? (subtaskIndex === 0 ? 46 : subtaskIndex < 3 ? 47 : getHomeForRace(raceId).mapId) : null,
        targetMapName: taskId === 2 ? foodMapName : taskId === 3 && subtaskIndex === 1 ? meteorMapName
            : taskId === 4 && [2, 9, 17][subtaskIndex] !== undefined ? getNroMap([2, 9, 17][subtaskIndex])?.name
                : taskId === 7 && [17, 47][subtaskIndex - 1] !== undefined ? getNroMap([17, 47][subtaskIndex - 1])?.name
                    : taskId === 8 && [4, 46][subtaskIndex === 1 ? 0 : subtaskIndex === 3 ? 1 : -1] !== undefined
                        ? getNroMap(subtaskIndex === 1 ? 4 : 46)?.name
                        : taskId === 9 ? getNroMap(subtaskIndex < 2 ? 47 : 46)?.name
                            : taskId === 10 ? (subtaskIndex === 0 ? getNroMap(46)?.name
                                : subtaskIndex < 3 ? getNroMap(47)?.name : getNroMap(getHomeForRace(raceId).mapId)?.name) : null,
    };
}
function getNroWorld(mapId) {
    const mapEntry = getNroMap(mapId);
    const playableMapIds = new Set(gameConfig.nroWorld?.playableMapIds || []);
    if (!mapEntry?.map || !playableMapIds.has(Number(mapId))) return null;
    const tileSet = nroTileSets.find((entry) => entry.setId === mapEntry.tileId);
    if (!tileSet) return null;
    const { topTileValues, wallTileValues, solidTileValues } = getNroTileCollisionMasks(tileSet, mapEntry.id);
    if (!topTileValues.size) return null;
    return {
        mapId: mapEntry.id,
        map: mapEntry.map,
        tileSize: gameConfig.nroWorld.tileSize,
        runSpeedPxPerSecond: gameConfig.nroWorld.runSpeedPxPerSecond,
        flightSpeedPxPerSecond: gameConfig.nroWorld.flightSpeedPxPerSecond,
        flightKiPerSecond: gameConfig.nroWorld.flightKiPerSecond,
        gravityPxPerSecondSquared: gameConfig.nroWorld.gravityPxPerSecondSquared,
        jumpVelocityPxPerSecond: gameConfig.nroWorld.jumpVelocityPxPerSecond,
        maxFallSpeedPxPerSecond: gameConfig.nroWorld.maxFallSpeedPxPerSecond,
        spawn: mapEntry.id === gameConfig.nroWorld.mapId
            ? gameConfig.nroWorld.spawn
            : findNroMapSpawn(mapEntry, topTileValues, gameConfig.nroWorld.tileSize),
        topTileValues,
        wallTileValues,
        solidTileValues
    };
}
const nroMap = getNroMap(gameConfig.nroWorld?.mapId);
const nroWorld = getNroWorld(gameConfig.nroWorld?.mapId);

// Quản lý trạng thái thế giới authoritative phía server
const players = {};
const monsters = {};
const items = {};
let itemIdCounter = 1;

// NRO spawns come from the imported map and template records; legacy mode
// continues to use the hand-authored prototype configuration.
function createNroMonsterConfigs(mapEntry, zoneId = 0) {
    return (mapEntry?.mobs || []).map((spawn, index) => {
        const [templateId, level, spawnHp, x, y] = spawn;
        const template = nroMobTemplates.find((entry) => entry.id === templateId);
        return {
            id: `nro_mob_${mapEntry.id}_${zoneId}_${index}`,
            mapId: mapEntry.id,
            zoneId,
            templateId,
            level,
            name: template?.name || `Quái ${templateId}`,
            type: 'normal',
            x,
            y,
            maxHp: Math.max(1, Number(spawnHp) || template?.hp || 100),
            // NRO rangeMove and speed define a small patrol around the spawn.
            // MobPoint rolls pDame ±1% of max HP plus level-based variance.
            atk: 1,
            pDame: Math.max(0, Number(template?.damagePercent) || 0),
            baseDamage: Number(templateId) === 70 ? 900000 : 0,
            // Modest patrol speed and a short radius keep mobs close to spawn.
            speedPxPerSecond: Number(template?.rangeMove) > 0 ? Math.max(30, (Number(template?.speed) || 1) * 22) : 0,
            aiMode: Number(template?.rangeMove) > 0 ? 'roam' : 'stationary',
            patrolRadiusPx: Number(template?.rangeMove) > 0 ? Math.max(42, Number(template.rangeMove) * 1.2) : 0,
            leashRadiusPx: Math.max(180, (Number(template?.rangeMove) || 24) * 5),
            canAttack: ![0, 82].includes(Number(templateId)),
            attackRangeMeters: 3.5,
            rangedAttackRangeMeters: 12,
            aggroDurationMs: 12000,
            visionMeters: 18,
            attackCooldownMs: 1800,
            targetScanIntervalMs: 250,
            respawnMs: 2000,
            exp: template?.type === 0 ? 1 : 10,
            // Imported mob templates carry the source potentialPercent value;
            // the source uses it to derive the mob's maxTiemNang from full HP.
            potentialPercent: Math.max(0, Number(template?.potentialPercent) || 0),
            dtnFactor: Math.max(0, Number(template?.potentialPercent) || 0) / 100,
            goldMin: 0,
            goldMax: 0
        };
    });
}

const initializedNroZones = new Set();
function activateNroZone(mapId, zoneId = 0) {
    const parsedId = Number(mapId);
    const parsedZoneId = Number(zoneId) || 0;
    const zoneKey = `${parsedId}:${parsedZoneId}`;
    if (initializedNroZones.has(zoneKey)) return;
    const mapEntry = getNroMap(parsedId);
    if (!mapEntry) return;
    for (const monsterConfig of createNroMonsterConfigs(mapEntry, parsedZoneId)) {
        monsters[monsterConfig.id] = new MonsterAI({ ...monsterConfig, pixelsPerMeter: gameConfig.world.pixelsPerMeter });
    }
    initializedNroZones.add(zoneKey);
}

function tau77EncounterId(userId) {
    const digest = createHash('sha256').update(String(userId)).digest('hex').slice(0, 20);
    return `nro_quest_tau77_${digest}`;
}

function spawnTau77Encounter(owner, io, { invulnerable = true } = {}) {
    if (!owner || Number(owner.mapId) !== 47) return null;
    const id = tau77EncounterId(owner.userId);
    const existing = monsters[id];
    if (existing && !existing.isDead) {
        existing.questOwnerUserId = String(owner.userId);
        existing.zoneId = Number(owner.zoneId) || 0;
        return existing;
    }
    const config = {
        id,
        mapId: 47,
        zoneId: Number(owner.zoneId) || 0,
        templateId: null,
        name: 'Tàu Pảy Pảy',
        type: 'quest_boss',
        bossPartIds: [92, 93, 94],
        questOwnerUserId: String(owner.userId),
        questEncounter: 'tau_7_7',
        x: 775,
        y: 264,
        width: 48,
        height: 64,
        maxHp: 10_000,
        atk: 1_000,
        baseDamage: 1_000,
        speedPxPerSecond: 120,
        aiMode: 'chase',
        canAttack: true,
        attackRangeMeters: 4,
        visionMeters: 80,
        attackCooldownMs: 2_000,
        respawnMs: 0,
        exp: 0,
        potentialPercent: 0,
        goldMin: 0,
        goldMax: 0,
        invulnerable,
        pixelsPerMeter: gameConfig.world.pixelsPerMeter
    };
    monsters[id] = new MonsterAI(config);
    io?.to(owner.id).emit('stateUpdate', {
        players: {}, monsters: { [id]: serializeMonster(monsters[id]) }
    });
    return monsters[id];
}

function spawnKarinDuel(owner, io) {
    if (!owner || Number(owner.mapId) !== 46) return null;
    const id = `nro_quest_karin_${createHash('sha256').update(String(owner.userId)).digest('hex').slice(0, 20)}`;
    const existing = monsters[id];
    if (existing && !existing.isDead) {
        existing.questOwnerUserId = String(owner.userId);
        existing.zoneId = Number(owner.zoneId) || 0;
        return existing;
    }
    const [npcId, x, y] = getNroMap(46)?.npcs?.find((npc) => Number(npc[0]) === 18) || [];
    if (npcId === undefined) return null;
    const config = {
        id, mapId: 46, zoneId: Number(owner.zoneId) || 0, templateId: null,
        name: 'Thần Mèo Karin', type: 'quest_boss', bossPartIds: [89, 90, 91],
        questOwnerUserId: String(owner.userId), questEncounter: 'karin_duel',
        x, y, width: 40, height: 56, maxHp: 500, atk: 50, baseDamage: 50,
        speedPxPerSecond: 120, aiMode: 'chase', canAttack: true,
        attackRangeMeters: 3, visionMeters: 80, attackCooldownMs: 2_000,
        respawnMs: 0, exp: 0, potentialPercent: 0, goldMin: 0, goldMax: 0,
        invulnerable: false, pixelsPerMeter: gameConfig.world.pixelsPerMeter
    };
    monsters[id] = new MonsterAI(config);
    io?.to(owner.id).emit('stateUpdate', {
        players: {}, monsters: { [id]: serializeMonster(monsters[id]) }
    });
    return monsters[id];
}

if (gameConfig.gameMode !== 'nro') {
    for (const monsterConfig of Object.values(gameConfig.monsters)) {
        monsters[monsterConfig.id] = new MonsterAI({ ...monsterConfig, pixelsPerMeter: gameConfig.world.pixelsPerMeter });
    }
}

function mapRoom(mapId, zoneId = 0) { return `map_${Number(mapId)}_zone_${Number(zoneId) || 0}`; }
function playerRoom(player) { return gameConfig.gameMode === 'nro' ? mapRoom(player.mapId, player.zoneId) : 'room_chuong0'; }
function canSeeMonster(player, monster) {
    return !monster.questOwnerUserId || String(monster.questOwnerUserId) === String(player.userId);
}
function selectAvailableZone(mapEntry, preferredZoneId = 0, excludingPlayerId = null) {
    const zoneCount = Math.max(1, Math.min(256, Number(mapEntry?.zones) || 1));
    const capacity = Math.max(1, Number(mapEntry?.maxPlayers) || 30);
    const counts = Array(zoneCount).fill(0);
    for (const [playerId, player] of Object.entries(players)) {
        if (playerId === excludingPlayerId || Number(player.mapId) !== Number(mapEntry?.id)) continue;
        const zoneId = Number(player.zoneId) || 0;
        if (zoneId >= 0 && zoneId < zoneCount) counts[zoneId]++;
    }
    const preferred = Number(preferredZoneId);
    if (Number.isInteger(preferred) && preferred >= 0 && preferred < zoneCount && counts[preferred] < capacity) return preferred;
    let selected = -1;
    for (let zoneId = 0; zoneId < zoneCount; zoneId++) {
        if (counts[zoneId] >= capacity) continue;
        if (selected < 0 || counts[zoneId] < counts[selected]) selected = zoneId;
    }
    return selected;
}

function tryMapTransition(io, socket, player, chatService, requestedDestinationId) {
    if (!socket || !player || player.hp <= 0 || isNroMovementBlocked(player.effects, Date.now())
        || Date.now() - (player.lastMapTransitionAt || 0) < 1200) return false;
    const sourceMap = getNroMap(player.mapId);
    const destinationId = Number(requestedDestinationId);
    if (!Number.isInteger(destinationId)) return false;
    const waypoint = sourceMap?.waypoints?.find((entry) => {
        const [, x1, y1, x2, y2] = entry;
        if (Number(entry[7]) !== destinationId) return false;
        // A transition is only allowed after an explicit request while the
        // authoritative player body overlaps this authored waypoint.
        const halfWidth = Math.max(1, Number(player.width) || 40) / 2;
        const playerTop = player.y - Math.max(1, Number(player.height) || 40);
        const interactionMargin = 48;
        return player.x + halfWidth >= Math.min(x1, x2) - interactionMargin
            && player.x - halfWidth <= Math.max(x1, x2) + interactionMargin
            && player.y >= Math.min(y1, y2) - interactionMargin
            && playerTop <= Math.max(y1, y2) + interactionMargin;
    });
    if (!waypoint || waypoint.length < 10) return false;
    const destinationMap = getNroMap(destinationId);
    if (!destinationMap?.map) return false;
    const destinationWorld = getNroWorld(destinationId);
    if (!destinationWorld) {
        if (Date.now() - (player.lastMapUnavailableNoticeAt || 0) > 3000) {
            socket.emit('zoneError', { message: 'Bản đồ này chưa sẵn sàng về hình ảnh hoặc va chạm.' });
            player.lastMapUnavailableNoticeAt = Date.now();
        }
        return false;
    }

    const oldMapId = player.mapId;
    const oldZoneId = player.zoneId || 0;
    const destinationZoneId = selectAvailableZone(destinationMap, oldZoneId, player.id);
    if (destinationZoneId < 0) {
        if (Date.now() - (player.lastZoneFullNoticeAt || 0) > 5000) {
            socket.emit('zoneError', { message: 'Các khu của bản đồ này hiện đã đầy.' });
            player.lastZoneFullNoticeAt = Date.now();
        }
        return false;
    }
    const requestedX = Number(waypoint[8]);
    const requestedY = Number(waypoint[9]);
    const arrival = resolveNroMapArrival(destinationWorld,
        Number.isFinite(requestedX) ? requestedX : destinationWorld.spawn.x,
        Number.isFinite(requestedY) ? requestedY : destinationWorld.spawn.y,
        player.width);
    activateNroZone(destinationId, destinationZoneId);
    socket.leave(mapRoom(oldMapId, oldZoneId));
    socket.join(mapRoom(destinationId, destinationZoneId));
    socket.mapId = destinationId;
    socket.zoneId = destinationZoneId;
    socket.areaRoom = mapRoom(destinationId, destinationZoneId);
    player.mapId = destinationId;
    player.zoneId = destinationZoneId;
    player.x = arrival.x;
    player.y = arrival.y;
    player.velocityX = 0;
    player.velocityY = 0;
    player.grounded = arrival.grounded;
    player.isFlying = false;
    player.flightKiDrainCarry = 0;
    player.flightIdleMs = 0;
    player.flightUpHoldMs = 0;
    player.input = { left: false, right: false, up: false, down: false, jump: false, flight: false };
    player.jumpInputWasDown = false;
    player.lastMapTransitionAt = Date.now();

    if (player.mainTask?.taskId === 3 && player.mainTask.status === 'active'
        && player.mainTask.subtaskIndex === 1 && destinationId === getMeteorMapForRace(player.raceId)) {
        player.mainTask = createMainTaskState({ taskId: 3, status: 'ready_to_report', subtaskIndex: 2, progress: 1 }, player.raceId);
        socket.emit('nroTaskUpdate', player.mainTask);
    }
    if (player.mainTask?.taskId === 8 && player.mainTask.status === 'active'
        && player.mainTask.subtaskIndex === 3 && destinationId === 46) {
        player.mainTask = createMainTaskState({ taskId: 8, status: 'completed', subtaskIndex: 3, progress: 1 }, player.raceId);
        socket.emit('nroTaskUpdate', player.mainTask);
        void persistPlayer(socket, player);
    }
    if (player.mainTask?.taskId === 9 && player.mainTask.status === 'active'
        && player.mainTask.subtaskIndex === 2 && destinationId === 46) {
        player.mainTask = createMainTaskState({ taskId: 9, status: 'active', subtaskIndex: 3, progress: 0 }, player.raceId);
        const encounterId = tau77EncounterId(player.userId);
        delete monsters[encounterId];
        socket.emit('nroTaskUpdate', player.mainTask);
        void persistPlayer(socket, player);
    }

    io.to(mapRoom(oldMapId, oldZoneId)).emit('playerDisconnected', player.id);
    socket.to(mapRoom(destinationId, destinationZoneId)).emit('newPlayer', serializePlayer(player));
    socket.emit('mapTransition', {
        mapEntry: destinationMap,
        zoneId: destinationZoneId,
        player: serializePlayer(player),
        players: Object.fromEntries(Object.entries(players).filter(([, entry]) => entry.mapId === destinationId && entry.zoneId === destinationZoneId)
            .map(([id, entry]) => [id, serializePlayer(entry)])),
        monsters: Object.fromEntries(Object.entries(monsters).filter(([, monster]) => monster.mapId === destinationId && monster.zoneId === destinationZoneId && canSeeMonster(player, monster))
            .map(([id, monster]) => [id, serializeMonster(monster)])),
        items: Object.fromEntries(Object.entries(items).filter(([, item]) => item.mapId === destinationId && item.zoneId === destinationZoneId)
            .map(([id, item]) => [id, serializeItem(item)]))
    });
    socket.emit('chatHistory', chatService?.getHistory({
        mapId: destinationId,
        zoneId: destinationZoneId,
        partyId: socket.partyId || player.partyId
    }) || { channels: {} });
    void persistPlayer(socket, player);
    return true;
}

function setupGameSocket(io, { onTick } = {}) {
    const chatService = createChatService(io);
    const activeSocketByUser = new Map();
    const skillManager = new SkillManager({
        gameConfig,
        players,
        monsters,
        io,
        getNroSkill,
        onMonsterDeath: (monster, player) => handleMonsterDeath(monster, player, io),
        onPowerGain: (player) => {
            const task = player.mainTask;
            const requiredPower = task?.taskId === 7 ? 16_000 : task?.taskId === 8 ? 40_000 : Infinity;
            if (![7, 8].includes(task?.taskId) || task.status !== 'active'
                || task.subtaskIndex !== 0 || player.inventory.power < requiredPower) return;
            player.mainTask = createMainTaskState({ taskId: task.taskId, status: 'active', subtaskIndex: 1, progress: 0 }, player.raceId);
            const playerSocket = io.sockets.sockets.get(player.id);
            playerSocket?.emit('nroTaskUpdate', player.mainTask);
            void persistPlayer(playerSocket, player);
        }
    });
    io.publishSystemChat = chatService.publishSystem;
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        const decoded = token && authService.verifyToken(token);
        if (!decoded?.userId) {
            return next(new Error('AUTH_REQUIRED'));
        }

        try {
            const user = await userRepository.findById(decoded.userId);
            if (!user || (Number(decoded.sessionVersion) || 0) !== (Number(user.sessionVersion) || 0)) {
                return next(new Error('AUTH_REQUIRED'));
            }
            socket.user = {
                userId: String(user._id),
                username: user.username,
                characterName: user.character?.nroCharacter?.characterName || user.username
            };
            socket.character = user.character;
            return next();
        } catch {
            return next(new Error('SERVICE_UNAVAILABLE'));
        }
    });

    io.on('connection', async (socket) => {
        const previousSocketId = activeSocketByUser.get(String(socket.user.userId));
        activeSocketByUser.set(String(socket.user.userId), socket.id);
        if (previousSocketId && previousSocketId !== socket.id) {
            const previousSocket = io.sockets.sockets.get(previousSocketId);
            await persistPlayer(previousSocket, players[previousSocketId]);
            try {
                const latestUser = await userRepository.findById(socket.user.userId);
                if (latestUser?.character) socket.character = latestUser.character;
            } catch {
                activeSocketByUser.delete(String(socket.user.userId));
                socket.disconnect(true);
                return;
            }
            previousSocket?.disconnect(true);
        }
        const packetBuckets = new Map();
        socket.use(([eventName], next) => {
            const group = ['castSkill', 'playerAttack'].includes(eventName) ? 'combat'
                : ['pickupItem', 'buyNroShopItem', 'openNroShop', 'useNroItem', 'equipNroItem', 'learnNroSkill'].includes(eventName) ? 'inventory'
                : ['guildCreate', 'guildJoin', 'guildLeave', 'guildInviteSend', 'guildInviteRespond', 'guildTransferLeadership', 'guildKickMember', 'interactNroNpc', 'nroNpcAction', 'travelNroPlanet', 'travelNroWaypoint', 'toggleAuto'].includes(eventName) ? 'social' : null;
            if (!group) return next();
            if (!packetBuckets.has(group)) {
                const policy = group === 'combat' ? { capacity: 8, refillPerSecond: 6 }
                    : group === 'inventory' ? { capacity: 6, refillPerSecond: 3 }
                        : { capacity: 6, refillPerSecond: 2 };
                packetBuckets.set(group, createTokenBucket(policy));
            }
            return packetBuckets.get(group)() ? next() : next(new Error('RATE_LIMITED'));
        });
        console.log(`[Socket.IO] Người chơi kết nối: ${socket.user.username} (${socket.id})`);

        const defaults = gameConfig.playerDefaults;
        const character = socket.character;
        if (!character) {
            socket.disconnect(true);
            return;
        }
        const raceId = character.nroCharacter?.raceId || 'earth';
        const initialPower = Number.isFinite(character.power) ? character.power : (character.dtn || 0);
        const initialNroProgress = getNroProgress(initialPower);
        const nroSkillSet = gameConfig.gameMode === 'nro' ? getNroSkillSet(raceId, initialPower) : null;
        // Keep NRO skill progress inside the NRO character so it cannot leak
        // into the legacy game mode's class skills. Fall back to old saves.
        const savedSkillLevelsRaw = character.nroCharacter?.skillLevels?.toObject?.()
            || character.nroCharacter?.skillLevels
            || character.skillLevels?.toObject?.()
            || character.skillLevels
            || {};
        // Older saves used s1–s5 for source slots 1–5. Shift those taught levels
        // once so they continue to belong to Kamejoko/Masenko/etc after the new
        // visible s1 slot is assigned to the planet-specific punch.
        const savedSkillLevels = Number(character.nroCharacter?.skillLayoutVersion) >= 1
            ? savedSkillLevelsRaw
            : Object.fromEntries(Object.entries(savedSkillLevelsRaw).map(([skillId, level]) => {
                const oldSlot = /^s([1-5])$/.exec(skillId);
                return [oldSlot ? `s${Number(oldSlot[1]) + 1}` : skillId, level];
            }));
        const skillDefinitions = nroSkillSet.skills;
        const skillLevels = Object.fromEntries(Object.keys(skillDefinitions).filter((skillId) =>
            !nroSkillSet || nroSkillSet.levels[skillId] || Number(savedSkillLevels[skillId]) >= 1
        ).map((skillId) => [
            skillId,
            clampSkillLevel(savedSkillLevels[skillId] ?? gameConfig.skills.defaultLevel, gameConfig.skills.maxLevel)
        ]));
        const clientSkillDefinitions = Object.fromEntries(Object.entries(skillDefinitions).map(([skillId, skill]) => [
            skillId,
            {
                ...skill,
                unlocked: !nroSkillSet || Boolean(nroSkillSet.levels[skillId] || Number(savedSkillLevels[skillId]) >= 1),
                ...(skill.icon ? { icon: skill.icon } : {})
            }
        ]));
        const questConfig = gameConfig.quests.quest_01;

        // Khởi tạo nhân vật mới với danh tính xác thực
        const savedNroMapId = Number(character.nroCharacter?.mapId);
        const initialMapId = Number.isInteger(savedNroMapId) && getNroWorld(savedNroMapId)
            ? savedNroMapId : Number(gameConfig.nroWorld.mapId);
        const initialMapEntry = getNroMap(initialMapId);
        const initialZoneId = gameConfig.gameMode === 'nro'
            ? selectAvailableZone(initialMapEntry, character.nroCharacter?.zoneId)
            : 0;
        if (initialZoneId < 0) {
            socket.emit('zoneError', { message: 'Các khu đang đầy. Hãy thử kết nối lại sau.' });
            socket.disconnect(true);
            return;
        }
        if (gameConfig.gameMode === 'nro') activateNroZone(initialMapId, initialZoneId);
        const playerWorld = getNroWorld(initialMapId);
        const savedNroPosition = character.nroCharacter?.position;
        const spawn = playerWorld?.spawn || gameConfig.nroWorld.spawn;
        const maxPlayableY = playerWorld ? playerWorld.map.height * playerWorld.tileSize - (playerWorld.tileSize * 4) : Infinity;
        const minPlayableX = playerWorld ? playerWorld.tileSize + 12 : 0;
        const maxPlayableX = playerWorld ? playerWorld.map.width * playerWorld.tileSize - playerWorld.tileSize - 12 : Infinity;
        const savedPositionIsUsable = savedNroPosition && Number.isFinite(savedNroPosition.x)
            && Number.isFinite(savedNroPosition.y) && savedNroPosition.y >= 0
            && savedNroPosition.y <= maxPlayableY;
        const candidatePosition = savedPositionIsUsable
            ? savedNroPosition
            : { x: savedNroPosition && Number.isFinite(savedNroPosition.x) ? savedNroPosition.x : spawn.x, y: spawn.y };
        const initialNroPosition = playerWorld ? {
            x: Math.max(minPlayableX, Math.min(maxPlayableX, candidatePosition.x)),
            y: candidatePosition.y
        } : candidatePosition;
        const initialNroMovement = createNroMovementState(initialNroPosition);
        // Bad/legacy saves can put the feet inside a multi-row collision block.
        // Snap those saves to the actual top face, never an interior solid tile.
        if (savedPositionIsUsable && isNroPositionInsideTerrain(playerWorld, initialNroPosition)) {
            const safePosition = resolveNroMapArrival(playerWorld, initialNroPosition.x, initialNroPosition.y);
            initialNroMovement.x = safePosition.x;
            initialNroMovement.y = safePosition.y;
            initialNroMovement.grounded = Boolean(safePosition.grounded);
        }

        const normalizedBag = mergeExistingStackableItems(character.nroCharacter?.bag);
        players[socket.id] = {
            id: socket.id,
            userId: socket.user.userId,
            characterRevision: Number(character.revision) || 0,
            username: socket.user.username,
            characterName: character.nroCharacter?.characterName || socket.user.username,
            legacyPosition: { ...(character.position || { x: 200, y: 300 }) },
            ...initialNroMovement,
            x: initialNroPosition.x ?? gameConfig.nroWorld.spawn.x,
            y: initialNroMovement.y,
            raceId,
            mapId: initialMapId,
            zoneId: initialZoneId,
            nroCharacterCreated: Boolean(character.nroCharacter?.created),
            headPartId: character.nroCharacter?.headPartId ?? 0,
            bodyPartId: character.nroCharacter?.bodyPartId ?? 1,
            legPartId: character.nroCharacter?.legPartId ?? 2,
            bag: normalizedBag.bag,
            bagCapacity: character.nroCharacter?.bagCapacity || 20,
            width: 40,
            height: 40,
            equipment: character.nroCharacter?.equipment || {},
            skillLevels,
            skillLayoutVersion: 1,
            hp: character.hp,
            maxHp: character.maxHp || defaults.maxHp,
            mp: character.mp,
            maxMp: character.maxMp || defaults.maxMp,
            atk: defaults.atk,
            str: defaults.str,
            armor: defaults.armor,
            agi: Number.isFinite(character.agi) ? character.agi : defaults.agi,
            partyId: socket.partyId || character.partyId || null,
            effects: (character.nroCharacter?.effects || []).filter((effect) =>
                ['damage_boost', 'damage_reduction', 'max_hp_boost', 'max_mp_boost', 'nro_charm_tri_tue', 'nro_charm_tri_tue_x3', 'nro_charm_tri_tue_x4', 'nro_charm_manh_me', 'nro_charm_da_trau', 'nro_charm_bat_tu', 'nro_charm_deo_dai', 'nro_charm_thu_hut'].includes(effect?.type)
                && Number(effect.expiresAt) > Date.now()
            ),
            stamina: character.nroCharacter?.stamina,
            maxStamina: character.nroCharacter?.maxStamina,
            staminaAttackCount: character.nroCharacter?.staminaAttackCount,
            staminaRecoveredAt: character.nroCharacter?.staminaRecoveredAt,
            input: { left: false, right: false, up: false, down: false },
            takeInputToken: createTokenBucket({ capacity: 30, refillPerSecond: 120 }),
            shopRequestIds: new Set(Array.isArray(character.nroCharacter?.shopRequestIds) ? character.nroCharacter.shopRequestIds : []),
            isAuto: false,
            autoAnchor: { ...spawn },
            cooldowns: { basic: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 },
            mayDoExpiresAt: Number(character.nroCharacter?.mayDoExpiresAt) || 0,
            cFlag: Math.max(0, Math.min(7, Number(character.nroCharacter?.cFlag) || 0)),
            blueGems: Math.max(0, Math.floor(Number(character.nroCharacter?.blueGems) || 0)),
            limitPower: Math.max(0, Math.min(11, Number(character.nroCharacter?.limitPower) || 0)),
            openPowerExpiresAt: Math.max(0, Number(character.nroCharacter?.openPowerExpiresAt) || 0),
            lastFlagChangeAt: 0,
            inventory: {
                gold: character.gold || 0,
                dtn: character.dtn || 0,
                // Existing accounts predate the separate NRO power field.
                // Seed from saved potential once, then persist independently.
                power: Number.isFinite(character.power) ? character.power : (character.dtn || 0),
                exp: gameConfig.gameMode === 'nro' ? initialNroProgress.exp : (character.exp || 0),
                level: gameConfig.gameMode === 'nro' ? initialNroProgress.level : (character.level || 1),
                maxExp: gameConfig.gameMode === 'nro' ? initialNroProgress.maxExp : (character.maxExp || gameConfig.progression.expPerLevel)
            },
            quests: {
                quest_01: {
                    id: 'quest_01',
                    status: character.questCompleted ? 'completed' : 'accepted',
                    progress: character.questProgress || 0,
                    target: questConfig.targetKill
                }
            },
            mainTask: createMainTaskState(character.nroCharacter?.mainTask, character.nroCharacter?.raceId),
            flags: { completed_quest_01: !!character.questCompleted },
            isPersisting: false,
            lastPersistAt: Date.now()
        };
        initializeNroStamina(players[socket.id]);
        players[socket.id].baseStats = character.nroCharacter?.baseStats || {
            str: defaults.str, armor: defaults.armor,
            maxHp: character.maxHp || defaults.maxHp,
            maxMp: character.maxMp || defaults.maxMp
        };
        players[socket.id].nroStats = character.nroCharacter?.nroStats || {
            hp: players[socket.id].baseStats.maxHp,
            mp: players[socket.id].baseStats.maxMp,
            damage: players[socket.id].baseStats.str,
            defense: Math.floor(players[socket.id].baseStats.armor / 4),
            critical: 0
        };
        players[socket.id].crit = Number(players[socket.id].nroStats.critical) || 0;
        recalculateNroEquipmentStats(players[socket.id]);
        if (normalizedBag.changed) void persistPlayer(socket, players[socket.id]);

        socket.mapId = gameConfig.gameMode === 'nro' ? initialMapId : gameConfig.map.id;
        socket.zoneId = initialZoneId;
        if (gameConfig.gameMode !== 'nro') socket.join('room_chuong0');
        socket.join(mapRoom(socket.mapId, socket.zoneId));
        socket.areaRoom = playerRoom(players[socket.id]);
        const partyId = socket.partyId || character.partyId || null;
        if (partyId) socket.join(`party_${partyId}`);
        const connectedPlayer = players[socket.id];
        const connectedTask = connectedPlayer.mainTask;
        const connectedTaskPower = connectedTask?.taskId === 7 ? 16_000 : connectedTask?.taskId === 8 ? 40_000 : Infinity;
        if ([7, 8].includes(connectedTask?.taskId) && connectedTask.status === 'active'
            && connectedTask.subtaskIndex === 0 && connectedPlayer.inventory.power >= connectedTaskPower) {
            connectedPlayer.mainTask = createMainTaskState({ taskId: connectedTask.taskId, status: 'active', subtaskIndex: 1, progress: 0 }, connectedPlayer.raceId);
            void persistPlayer(socket, connectedPlayer);
        }
        if (connectedPlayer.mainTask?.taskId === 9
            && [1, 2].includes(connectedPlayer.mainTask.subtaskIndex)
            && Number(connectedPlayer.mapId) === 47) {
            spawnTau77Encounter(connectedPlayer, io, { invulnerable: true });
        } else if (connectedPlayer.mainTask?.taskId === 10 && connectedPlayer.mainTask.status === 'active'
            && connectedPlayer.mainTask.subtaskIndex === 1 && Number(connectedPlayer.mapId) === 47) {
            spawnTau77Encounter(connectedPlayer, io, { invulnerable: false });
        }

        // Gửi toàn bộ trạng thái ban đầu cho người chơi
        socket.emit('initialState', {
            playerId: socket.id,
            user: { username: socket.user.username },
            players: Object.fromEntries(
                Object.entries(players).filter(([, player]) => gameConfig.gameMode !== 'nro' || (player.mapId === initialMapId && player.zoneId === initialZoneId))
                    .map(([id, player]) => [id, serializePlayer(player)])
            ),
            monsters: Object.fromEntries(
                Object.entries(monsters).filter(([, monster]) => gameConfig.gameMode !== 'nro' || (monster.mapId === initialMapId && monster.zoneId === initialZoneId && canSeeMonster(connectedPlayer, monster)))
                    .map(([id, monster]) => [id, serializeMonster(monster)])
            ),
            items: Object.fromEntries(
                Object.entries(items).filter(([, item]) => gameConfig.gameMode !== 'nro' || (item.mapId === initialMapId && item.zoneId === initialZoneId))
                    .map(([id, item]) => [id, serializeItem(item)])
            ),
            config: {
                map: gameConfig.map,
                skills: clientSkillDefinitions,
                skillLevels: players[socket.id].skillLevels,
                progression: gameConfig.progression,
                world: gameConfig.world,
                autoFarm: gameConfig.autoFarm,
                tickRateHz: gameConfig.server.tickRateHz,
                gameMode: gameConfig.gameMode,
                nroWorld: {
                    mapId: initialMapId,
                    zoneId: initialZoneId,
                    mapEntry: getNroMap(initialMapId),
                    tileSize: gameConfig.nroWorld.tileSize,
                    runSpeedPxPerSecond: gameConfig.nroWorld.runSpeedPxPerSecond,
                    gravityPxPerSecondSquared: gameConfig.nroWorld.gravityPxPerSecondSquared,
                    jumpVelocityPxPerSecond: gameConfig.nroWorld.jumpVelocityPxPerSecond,
                    flightSpeedPxPerSecond: gameConfig.nroWorld.flightSpeedPxPerSecond,
                    flightKiPerSecond: gameConfig.nroWorld.flightKiPerSecond,
                    spawn: playerWorld?.spawn || gameConfig.nroWorld.spawn,
                    mapCatalogUrl: '/assets/nro/maps/catalog.json',
                    tileSetUrl: '/assets/nro/maps/tile-sets.json'
                },
                nroPowerLimit: getNroPowerLimit(players[socket.id].limitPower)
            },
            character: publicCharacter(players[socket.id])
        });
        socket.emit('nroFlagResult', { ok: true, flag: players[socket.id].cFlag || 0 });
        socket.emit('chatHistory', chatService.getHistory({
            mapId: socket.mapId,
            zoneId: socket.zoneId,
            partyId
        }));

        const sendGuildState = async () => {
            try {
                const [guild, guilds, invitations] = await Promise.all([
                    guildService.getForUser(socket.user.userId), guildService.list(),
                    guildService.listInvitations(socket.user.userId)
                ]);
                const room = guild ? `guild:${guild.id}` : null;
                if (socket.guildRoom && socket.guildRoom !== room) socket.leave(socket.guildRoom);
                socket.guildRoom = room;
                if (room) socket.join(room);
                socket.emit('guildState', { ok: true, guild, guilds, invitations });
            } catch (error) {
                socket.emit('guildState', { ok: false, guild: null, guilds: [], invitations: [], message: error.message || 'Không tải được dữ liệu bang hội.' });
            }
        };
        const refreshGuildRoom = (room) => {
            if (room) io.to(room).emit('guildRefresh');
        };
        socket.on('guildRefreshRequest', sendGuildState);
        socket.on('guildRequestState', sendGuildState);
        socket.on('guildCreate', async (payload = {}) => {
            try {
                await guildService.create({ userId: socket.user.userId, username: socket.user.username, ...payload });
                await sendGuildState();
                socket.emit('guildResult', { ok: true, message: 'Đã lập bang hội.' });
            } catch (error) {
                socket.emit('guildResult', { ok: false, message: error.message || 'Không thể lập bang hội.' });
            }
        });
        socket.on('guildJoin', async ({ guildId } = {}) => {
            try {
                await guildService.join({ userId: socket.user.userId, username: socket.user.username, guildId });
                await sendGuildState();
                refreshGuildRoom(`guild:${String(guildId)}`);
                socket.emit('guildResult', { ok: true, message: 'Đã tham gia bang hội.' });
            } catch (error) {
                socket.emit('guildResult', { ok: false, message: error.message || 'Không thể tham gia bang hội.' });
            }
        });
        socket.on('guildInviteSend', async (payload = {}) => {
            try {
                const result = await guildService.inviteMember({
                    userId: socket.user.userId, username: socket.user.username,
                    targetUsername: payload && typeof payload === 'object' ? payload.targetUsername : ''
                });
                const targets = [...io.sockets.sockets.values()].filter((candidate) =>
                    String(candidate.user?.userId) === result.targetUserId);
                for (const target of targets) {
                    target.emit('guildInvitationReceived', result.invitation);
                }
                socket.emit('guildResult', {
                    ok: true, message: `Đã gửi lời mời vào bang ${result.invitation.guildName} cho ${result.targetUsername}.`
                });
            } catch (error) {
                socket.emit('guildResult', { ok: false, message: error.message || 'Không gửi được lời mời bang hội.' });
            }
        });
        socket.on('guildInviteRespond', async (payload = {}) => {
            let result;
            try {
                result = await guildService.respondToInvitation({
                    userId: socket.user.userId,
                    invitationId: payload && typeof payload === 'object' ? payload.invitationId : null,
                    accept: payload?.accept === true
                });
                await sendGuildState();
                if (result.accepted) refreshGuildRoom(`guild:${result.guildId}`);
                const inviterSockets = [...io.sockets.sockets.values()].filter((candidate) =>
                    String(candidate.user?.userId) === result.inviterId);
                const message = result.accepted
                    ? `${socket.user.username} đã tham gia bang ${result.guildName}.`
                    : `${socket.user.username} đã từ chối lời mời vào bang ${result.guildName}.`;
                for (const candidate of inviterSockets) candidate.emit('guildResult', { ok: true, message });
                socket.emit('guildResult', {
                    ok: true,
                    message: result.accepted ? `Bạn đã tham gia bang ${result.guildName}.` : 'Đã từ chối lời mời bang hội.'
                });
            } catch (error) {
                socket.emit('guildResult', { ok: false, message: error.message || 'Không xử lý được lời mời bang hội.' });
            }
        });
        socket.on('guildLeave', async () => {
            try {
                const previousRoom = socket.guildRoom;
                const result = await guildService.leave(socket.user.userId);
                await sendGuildState();
                refreshGuildRoom(previousRoom);
                socket.emit('guildResult', { ok: true, message: result.message });
            } catch (error) {
                socket.emit('guildResult', { ok: false, message: error.message || 'Không thể rời bang hội.' });
            }
        });
        socket.on('guildTransferLeadership', async ({ targetUserId } = {}) => {
            try {
                const result = await guildService.transferLeadership({ userId: socket.user.userId, targetUserId });
                await sendGuildState();
                refreshGuildRoom(`guild:${result.guildId}`);
                socket.emit('guildResult', { ok: true, message: 'Đã chuyển quyền bang chủ.' });
            } catch (error) {
                socket.emit('guildResult', { ok: false, message: error.message || 'Không thể chuyển quyền bang chủ.' });
            }
        });
        socket.on('guildKickMember', async ({ targetUserId } = {}) => {
            try {
                const result = await guildService.kickMember({ userId: socket.user.userId, targetUserId });
                const removedSocket = [...io.sockets.sockets.values()].find((candidate) =>
                    String(candidate.user?.userId) === String(result.removedUserId));
                if (removedSocket) {
                    removedSocket.leave(`guild:${result.guildId}`);
                    removedSocket.guildRoom = null;
                    removedSocket.emit('guildRefresh');
                }
                await sendGuildState();
                refreshGuildRoom(`guild:${result.guildId}`);
                socket.emit('guildResult', { ok: true, message: 'Đã trục xuất thành viên khỏi bang.' });
            } catch (error) {
                socket.emit('guildResult', { ok: false, message: error.message || 'Không thể trục xuất thành viên.' });
            }
        });
        socket.on('guildUpdateDescription', async ({ description } = {}) => {
            try {
                const result = await guildService.updateDescription({ userId: socket.user.userId, description });
                await sendGuildState();
                refreshGuildRoom(`guild:${result.guildId}`);
                socket.emit('guildResult', { ok: true, message: 'Đã cập nhật giới thiệu bang.' });
            } catch (error) {
                socket.emit('guildResult', { ok: false, message: error.message || 'Không thể cập nhật giới thiệu bang.' });
            }
        });
        let lastGuildChatAt = 0;
        socket.on('guildChatSend', async ({ text } = {}) => {
            const now = Date.now();
            if (now - lastGuildChatAt < 650) {
                socket.emit('guildResult', { ok: false, message: 'Bạn gửi tin bang quá nhanh.' });
                return;
            }
            lastGuildChatAt = now;
            try {
                const guildId = await guildService.canUseGuildChat(socket.user.userId);
                const message = String(text || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 240);
                if (!guildId) throw new Error('Bạn chưa thuộc bang hội nào.');
                if (!message) return;
                io.to(`guild:${guildId}`).emit('guildChatMessage', {
                    userId: String(socket.user.userId), username: String(socket.user.username || 'Chiến binh').slice(0, 24),
                    text: message, sentAt: now
                });
            } catch (error) {
                socket.emit('guildResult', { ok: false, message: error.message || 'Không gửi được tin bang.' });
            }
        });

        let lastNetworkPingAt = 0;
        socket.on('networkPing', (acknowledge) => {
            const now = Date.now();
            if (now - lastNetworkPingAt < 1000) return;
            lastNetworkPingAt = now;
            if (typeof acknowledge === 'function') acknowledge({ serverTime: now });
        });

        socket.on('chatSend', (payload, acknowledge) => {
            const result = chatService.handleSend(socket, payload);
            if (typeof acknowledge === 'function') acknowledge(result);
            else if (!result.ok) socket.emit('chatError', { message: result.error });
        });

        // Báo cho những người chơi khác trong phòng
        socket.to(playerRoom(players[socket.id])).emit('newPlayer', serializePlayer(players[socket.id]));

        // 1. Nhận input điều khiển di chuyển
        socket.on('playerInput', (inputData) => {
            const p = players[socket.id];
            if (!p || !p.takeInputToken()) return;
            const validatedInput = parseMovementInput(inputData);
            if (!validatedInput) return;

            // Hướng từ analog/D-pad khác 0 là thao tác điều khiển thủ công.
            // Chuyển khỏi Auto Farm trước khi vòng tick xử lý hướng mới.
            const analogActive = Number.isFinite(validatedInput.axisX) &&
                Math.hypot(validatedInput.axisX, validatedInput.axisY) > 0.03;
            const dpadActive = ['up', 'down', 'left', 'right', 'flight'].some((direction) => validatedInput[direction] === true);
            if (p.isAuto && (analogActive || dpadActive)) {
                p.isAuto = false;
                socket.emit('autoStateChanged', {
                    isAuto: false,
                    anchor: p.autoAnchor,
                    leashRadiusPx: metersToPixels(gameConfig.autoFarm.leashRadiusMeters, gameConfig.world.pixelsPerMeter)
                });
            }

            if (!p.isAuto) p.input = validatedInput;
        });

        socket.on('respawnNro', async ({ choice } = {}) => {
            const p = players[socket.id];
            if (!p || gameConfig.gameMode !== 'nro' || p.hp > 0 || !['wait', 'home', 'gem'].includes(choice)) return;
            if (choice === 'wait') {
                socket.emit('nroRespawnResult', { ok: true, state: 'waiting' });
                return;
            }
            if (choice === 'gem' && p.blueGems < 1) {
                socket.emit('nroRespawnResult', { ok: false, message: 'Bạn không đủ 1 ngọc xanh để hồi sinh.' });
                return;
            }

            let destinationId = p.mapId;
            if (choice === 'home') destinationId = getHomeForRace(p.raceId).mapId;
            const destinationMap = getNroMap(destinationId);
            const world = getNroWorld(destinationId);
            if (!destinationMap?.map || !world?.spawn || Date.now() - (p.lastMapTransitionAt || 0) < 800) {
                socket.emit('nroRespawnResult', { ok: false, message: 'Điểm hồi sinh hiện chưa sẵn sàng.' });
                return;
            }
            const oldRoom = mapRoom(p.mapId, p.zoneId || 0);
            const zoneId = destinationId === p.mapId ? (p.zoneId || 0) : selectAvailableZone(destinationMap, 0, p.id);
            if (zoneId < 0) {
                socket.emit('nroRespawnResult', { ok: false, message: 'Các khu tại điểm hồi sinh hiện đã đầy.' });
                return;
            }
            const arrival = resolveNroMapArrival(world, world.spawn.x, world.spawn.y, p.width);
            if (choice === 'gem') p.blueGems -= 1;
            if (destinationId !== p.mapId || zoneId !== p.zoneId) {
                activateNroZone(destinationId, zoneId);
                socket.leave(oldRoom);
                socket.join(mapRoom(destinationId, zoneId));
                io.to(oldRoom).emit('playerDisconnected', p.id);
            }
            p.mapId = destinationId; p.zoneId = zoneId; p.x = arrival.x; p.y = arrival.y;
            p.velocityX = 0; p.velocityY = 0; p.grounded = Boolean(arrival.grounded);
            p.isFlying = false; p.isAuto = false; p.autoAnchor = null; p.respawnAt = 0;
            p.input = { left: false, right: false, up: false, down: false, jump: false, flight: false, axisX: 0, axisY: 0 };
            p.hp = Math.max(1, Number(p.maxHp) || 1); p.mp = Math.max(0, Math.min(p.maxMp, p.mp));
            p.lastMapTransitionAt = Date.now(); socket.mapId = destinationId; socket.zoneId = zoneId;
            socket.areaRoom = mapRoom(destinationId, zoneId);
            skillManager.cancelCharge(p.id);
            socket.emit('mapTransition', {
                mapEntry: destinationMap, zoneId, player: serializePlayer(p),
                players: Object.fromEntries(Object.entries(players).filter(([, entry]) => entry.mapId === destinationId && entry.zoneId === zoneId).map(([id, entry]) => [id, serializePlayer(entry)])),
                monsters: Object.fromEntries(Object.entries(monsters).filter(([, entry]) => entry.mapId === destinationId && entry.zoneId === zoneId).map(([id, entry]) => [id, serializeMonster(entry)])),
                items: Object.fromEntries(Object.entries(items).filter(([, entry]) => entry.mapId === destinationId && entry.zoneId === zoneId).map(([id, entry]) => [id, serializeItem(entry)]))
            });
            socket.emit('statsUpdate', { hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp, blueGems: p.blueGems, respawnRemainingMs: 0 });
            socket.emit('nroRespawnResult', { ok: true, state: 'respawned', choice });
            void persistPlayer(socket, p);
        });

        socket.on('toggleFly', () => {
            const p = players[socket.id];
            if (!p || !p.takeInputToken() || gameConfig.gameMode !== 'nro') return;
            if (p.hp <= 0) {
                socket.emit('flightError', { message: 'Không thể bay khi đang gục.' });
                return;
            }
            if (!p.isFlying && isNroMovementBlocked(p.effects, Date.now())) {
                socket.emit('flightError', { message: 'Không thể cất cánh khi đang bị khống chế.' });
                return;
            }
            const result = toggleNroFlight(p);
            if (!result.ok) {
                socket.emit('flightError', { message: result.error });
                return;
            }
            p.isAuto = false;
            p.autoAnchor = null;
            const flightState = { playerId: socket.id, isFlying: result.isFlying };
            io.to(playerRoom(p)).emit('flightStateChanged', flightState);
            socket.emit('statsUpdate', { mp: p.mp, maxMp: p.maxMp, isFlying: p.isFlying });
            socket.emit('autoStateChanged', { isAuto: false, anchor: null });
        });

        socket.on('setNroFlag', (payload = {}) => {
            const player = players[socket.id];
            const nextFlag = Number(payload?.flag);
            if (!player || gameConfig.gameMode !== 'nro' || !Number.isInteger(nextFlag) || nextFlag < 0 || nextFlag > 7) {
                socket.emit('nroFlagResult', { ok: false, message: 'Cờ phe không hợp lệ.' });
                return;
            }
            const now = Date.now();
            if (nextFlag !== player.cFlag && now - (player.lastFlagChangeAt || 0) < 60_000) {
                socket.emit('nroFlagResult', {
                    ok: false,
                    flag: player.cFlag,
                    cooldownMs: 60_000 - (now - player.lastFlagChangeAt),
                    message: 'Bạn chỉ có thể đổi cờ phe mỗi 60 giây.'
                });
                return;
            }
            if (nextFlag !== player.cFlag) player.lastFlagChangeAt = now;
            player.cFlag = nextFlag;
            socket.emit('nroFlagResult', { ok: true, flag: player.cFlag, message: nextFlag ? `Đã chọn cờ phe ${nextFlag}.` : 'Đã bỏ cờ phe.' });
            void persistPlayer(socket, player);
        });

        socket.on('interactNroNpc', (npcId) => {
            const player = players[socket.id];
            const playerMap = player && getNroMap(player.mapId);
            if (!player || gameConfig.gameMode !== 'nro' || !playerMap) return;
            const parsedId = Number(npcId);
            if (!Number.isInteger(parsedId)) return;
            const entry = playerMap.npcs.find((npc) => Number(npc[0]) === parsedId);
            if (!entry) return;
            const [, x, y, avatar] = entry;
            if (Math.hypot(player.x - x, player.y - y) > 60) {
                socket.emit('nroNpcDialog', { ok: false, message: 'Hãy đến gần NPC hơn để trò chuyện.' });
                return;
            }
            const npcTemplate = nroNpcTemplates.find((template) => template.id === parsedId);
            const taskHome = getHomeForRace(player.raceId);
            const isTaskHomeNpc = Number(player.mapId) === taskHome.mapId && parsedId === taskHome.npcId;
            const isRescueBomoNpc = Number(player.mapId) === 47 && parsedId === 17;
            const isKarinNpc = Number(player.mapId) === 46 && parsedId === 18;
            let taskReportMessage = '';
            // Older characters may have already claimed task 1 before this
            // chapter was added. Advance them without granting its reward twice.
            if (isTaskHomeNpc && player.mainTask?.taskId === 1 && player.mainTask.status === 'completed') {
                player.mainTask = createMainTaskState({ taskId: 2, status: 'active', subtaskIndex: 0, progress: 0 }, player.raceId);
                taskReportMessage = `Nhiệm vụ mới: đến khu vực ${getNroMap(getFoodMapForRace(player.raceId))?.name || getFoodMapForRace(player.raceId)}, hạ quái và nhặt 10 đùi gà.`;
                socket.emit('nroTaskUpdate', player.mainTask);
                void persistPlayer(socket, player);
            } else if (isTaskHomeNpc && player.mainTask?.taskId === 2 && player.mainTask.status === 'completed') {
                // Advance returning players from the previously terminal task-2 state without replaying its reward.
                player.mainTask = createMainTaskState({ taskId: 3, status: 'active', subtaskIndex: 0, progress: 0 }, player.raceId);
                taskReportMessage = 'Nhiệm vụ mới: dùng tiềm năng nâng một chỉ số, sau đó khám phá khu vực sao băng tại vách núi.';
                socket.emit('nroTaskUpdate', player.mainTask);
                void persistPlayer(socket, player);
            } else if (isTaskHomeNpc && player.mainTask?.taskId === 3 && player.mainTask.status === 'completed') {
                player.mainTask = createMainTaskState({ taskId: 4, status: 'active', subtaskIndex: 0, progress: 0 }, player.raceId);
                taskReportMessage = 'Nhiệm vụ mới: đến Trái Đất săn 3 khủng long mẹ. Hãy dùng trạm tàu vũ trụ để sang Namếc và Xayda.';
                socket.emit('nroTaskUpdate', player.mainTask);
                void persistPlayer(socket, player);
            } else if (isTaskHomeNpc && player.mainTask?.taskId === 4 && player.mainTask.status === 'completed') {
                // Older saves already received task 4 rewards; migrate without awarding them again.
                player.mainTask = createMainTaskState({ taskId: 5, status: 'active', subtaskIndex: 0, progress: 0 }, player.raceId);
                taskReportMessage = 'Nhiệm vụ mới: hạ 50 Mộc Nhân tại làng khởi đầu của con.';
                socket.emit('nroTaskUpdate', player.mainTask);
                void persistPlayer(socket, player);
            } else if (isTaskHomeNpc && player.mainTask?.taskId === 6 && player.mainTask.status === 'completed') {
                player.mainTask = createMainTaskState({ taskId: 7, status: 'active', subtaskIndex: 0, progress: 0 }, player.raceId);
                taskReportMessage = 'Nhiệm vụ mới: đạt 16.000 sức mạnh, rồi đến Rừng nguyên sinh săn Quỷ bay.';
                socket.emit('nroTaskUpdate', player.mainTask);
                void persistPlayer(socket, player);
            } else if (isTaskHomeNpc && player.mainTask?.taskId === 7 && player.mainTask.status === 'completed') {
                const nextIndex = player.inventory.power >= 40_000 ? 1 : 0;
                player.mainTask = createMainTaskState({ taskId: 8, status: 'active', subtaskIndex: nextIndex, progress: 0 }, player.raceId);
                taskReportMessage = nextIndex === 1
                    ? 'Nhiệm vụ mới: đến Rừng Xương săn Thằn lằn mẹ và tìm Ngọc Rồng 7 sao.'
                    : 'Nhiệm vụ mới: đạt 40.000 sức mạnh để bắt đầu tìm Ngọc Rồng 7 sao.';
                socket.emit('nroTaskUpdate', player.mainTask);
                void persistPlayer(socket, player);
            }
            if (isRescueBomoNpc && player.mainTask?.taskId === 7 && player.mainTask.status === 'active'
                && player.mainTask.subtaskIndex === 2) {
                player.mainTask = createMainTaskState({ taskId: 7, status: 'ready_to_report', subtaskIndex: 3, progress: 0 }, player.raceId);
                taskReportMessage = `Bò Mộng đã ghi nhận chiến công. Hãy về gặp ông ${taskHome.npcName} để nhận thưởng.`;
                socket.emit('nroTaskUpdate', player.mainTask);
                void persistPlayer(socket, player);
            }
            if (isRescueBomoNpc && player.mainTask?.taskId === 8 && player.mainTask.status === 'completed') {
                player.mainTask = createMainTaskState({ taskId: 9, status: 'active', subtaskIndex: 0, progress: 0 }, player.raceId);
            }
            if (isRescueBomoNpc && player.mainTask?.taskId === 9 && player.mainTask.status === 'active'
                && player.mainTask.subtaskIndex === 0) {
                player.mainTask = createMainTaskState({ taskId: 9, status: 'active', subtaskIndex: 1, progress: 0 }, player.raceId);
                spawnTau77Encounter(player, io);
                taskReportMessage = 'Tàu Pảy Pảy xuất hiện! Hãy đối đầu với hắn, rồi chạy lên Tháp Karin.';
                socket.emit('nroTaskUpdate', player.mainTask);
                void persistPlayer(socket, player);
            }
            if (isRescueBomoNpc && player.mainTask?.taskId === 10 && player.mainTask.status === 'active'
                && player.mainTask.subtaskIndex === 1) {
                const existing = Object.values(monsters).find((monster) => monster.questEncounter === 'tau_7_7'
                    && monster.questOwnerUserId === player.userId && !monster.isDead);
                if (!existing) spawnTau77Encounter(player, io, { invulnerable: false });
                taskReportMessage = 'Tàu Pảy Pảy đã xuất hiện ở Rừng Karin. Hãy đánh bại hắn.';
            }
            if (isRescueBomoNpc && player.mainTask?.taskId === 10 && player.mainTask.status === 'active'
                && player.mainTask.subtaskIndex === 2) {
                const sixStarBall = player.bag.find((slot) => Number(slot.templateId) === 19 && Number(slot.quantity) > 0);
                if (sixStarBall) {
                    taskReportMessage = 'Con đã nhận Ngọc Rồng 6 sao. Hãy đem về báo cáo với sư phụ ở nhà.';
                } else if (player.bag.length >= player.bagCapacity) {
                    taskReportMessage = 'Hành trang đã đầy. Hãy bỏ bớt vật phẩm rồi quay lại nhận Ngọc Rồng 6 sao.';
                } else {
                    player.bag.push({ templateId: 19, quantity: 1, options: [] });
                    player.mainTask = createMainTaskState({ taskId: 10, status: 'ready_to_report', subtaskIndex: 3, progress: 0 }, player.raceId);
                    taskReportMessage = 'Bò Mộng tặng con Ngọc Rồng 6 sao. Hãy đem về báo cáo với sư phụ ở nhà.';
                    socket.emit('nroTaskUpdate', player.mainTask);
                    socket.emit('nroInventoryResult', { ok: true, bag: player.bag, bagCapacity: player.bagCapacity,
                        gold: player.inventory.gold, message: taskReportMessage });
                    void persistPlayer(socket, player);
                }
            }
            if (isKarinNpc && player.mainTask?.taskId === 9 && player.mainTask.status === 'active'
                && player.mainTask.subtaskIndex === 3) {
                player.mainTask = createMainTaskState({ taskId: 10, status: 'active', subtaskIndex: 0, progress: 0 }, player.raceId);
                taskReportMessage = 'Karin đồng ý dạy võ. Hãy chọn “Thách đấu” để chứng minh sức mạnh.';
                socket.emit('nroTaskUpdate', player.mainTask);
                void persistPlayer(socket, player);
            }
            if (player.mainTask?.status === 'ready_to_report' && isTaskHomeNpc) {
                if (player.mainTask.taskId === 1 && player.mainTask.subtaskIndex === 1) {
                    const reward = gameConfig.quests.nroTaskRewards?.task1 || { power: 500, potential: 500, strength: 500 };
                    player.inventory.dtn += reward.potential;
                    player.inventory.power += reward.power;
                    player.baseStats.str += reward.strength;
                    player.mainTask = createMainTaskState({ taskId: 2, status: 'active', subtaskIndex: 0, progress: 0 }, player.raceId);
                    taskReportMessage = `Làm tốt lắm! Bây giờ hãy đến khu vực ${getFoodMapForRace(player.raceId)}, hạ khủng long, lợn lòi hoặc quỷ đất để nhặt 10 đùi gà.`;
                } else if (player.mainTask.taskId === 2 && player.mainTask.subtaskIndex === 1) {
                    const chickenSlots = player.bag.filter((slot) => Number(slot.templateId) === 73);
                    const chickenCount = chickenSlots.reduce((total, slot) => total + (Number(slot.quantity) || 0), 0);
                    if (chickenCount < 10) {
                        socket.emit('nroNpcDialog', {
                            ok: true,
                            npc: { id: parsedId, name: npcTemplate?.name || `NPC ${parsedId}`, x, y, avatar },
                            message: `Con mới có ${chickenCount}/10 đùi gà. Hãy đến khu vực ${getFoodMapForRace(player.raceId)} tìm quái nhé.`,
                            options: []
                        });
                        return;
                    }
                    let remaining = 10;
                    for (const slot of chickenSlots) {
                        const consumed = Math.min(remaining, Number(slot.quantity) || 0);
                        slot.quantity -= consumed;
                        remaining -= consumed;
                        if (remaining === 0) break;
                    }
                    player.bag = player.bag.filter((slot) => Number(slot.templateId) !== 73 || slot.quantity > 0);
                    const reward = gameConfig.quests.nroTaskRewards?.task2 || { power: 1500, potential: 1500, gold: 300_000_000 };
                    player.inventory.dtn += reward.potential;
                    player.inventory.power += reward.power;
                    player.inventory.gold += reward.gold;
                    player.mainTask = createMainTaskState({ taskId: 3, status: 'active', subtaskIndex: 0, progress: 0 }, player.raceId);
                    taskReportMessage = 'Tốt lắm! Hãy dùng tiềm năng để nâng một chỉ số, sau đó đến khu vực sao băng ở vách núi.';
                } else if (player.mainTask.taskId === 3 && player.mainTask.subtaskIndex === 2) {
                    player.inventory.dtn += 2000;
                    player.inventory.power += 2000;
                    player.mainTask = createMainTaskState({ taskId: 3, status: 'completed', subtaskIndex: 2, progress: 1 }, player.raceId);
                    taskReportMessage = 'Con đã hoàn thành nhiệm vụ sao băng. Đây là phần thưởng 2.000 sức mạnh và tiềm năng.';
                } else if (player.mainTask.taskId === 4 && player.mainTask.subtaskIndex === 3) {
                    player.inventory.dtn += 4000;
                    player.inventory.power += 4000;
                    player.mainTask = createMainTaskState({ taskId: 5, status: 'active', subtaskIndex: 0, progress: 0 }, player.raceId);
                    taskReportMessage = 'Hoàn thành thử thách liên hành tinh, nhận 4.000 sức mạnh và tiềm năng. Nhiệm vụ mới: hạ 50 Mộc Nhân tại làng.';
                } else if (player.mainTask.taskId === 7 && player.mainTask.subtaskIndex === 3) {
                    player.inventory.dtn += 8000;
                    player.inventory.power += 8000;
                    player.mainTask = createMainTaskState({ taskId: 7, status: 'completed', subtaskIndex: 3, progress: 1 }, player.raceId);
                    taskReportMessage = 'Hoàn thành nhiệm vụ giải cứu! Nhận 8.000 sức mạnh và tiềm năng.';
                } else if (player.mainTask.taskId === 8 && player.mainTask.subtaskIndex === 2) {
                    const dragonBall = player.bag.find((slot) => Number(slot.templateId) === 20 && Number(slot.quantity) > 0);
                    if (!dragonBall) {
                        socket.emit('nroNpcDialog', {
                            ok: true,
                            npc: { id: parsedId, name: npcTemplate?.name || `NPC ${parsedId}`, x, y, avatar },
                            message: 'Con hãy tìm Ngọc Rồng 7 sao ở Rừng Xương rồi mang về đây.',
                            options: []
                        });
                        return;
                    }
                    dragonBall.quantity -= 1;
                    player.bag = player.bag.filter((slot) => Number(slot.quantity) > 0);
                    player.inventory.dtn += 15_000;
                    player.inventory.power += 15_000;
                    player.mainTask = createMainTaskState({ taskId: 8, status: 'active', subtaskIndex: 3, progress: 0 }, player.raceId);
                    taskReportMessage = 'Đã giao Ngọc Rồng 7 sao, nhận 15.000 sức mạnh và tiềm năng. Hãy đến Tháp Karin.';
                } else if (player.mainTask.taskId === 10 && player.mainTask.subtaskIndex === 3) {
                    const sixStarBall = player.bag.find((slot) => Number(slot.templateId) === 19 && Number(slot.quantity) > 0);
                    if (!sixStarBall) {
                        socket.emit('nroNpcDialog', {
                            ok: true,
                            npc: { id: parsedId, name: npcTemplate?.name || `NPC ${parsedId}`, x, y, avatar },
                            message: 'Hãy nhận Ngọc Rồng 6 sao từ Bò Mộng rồi mang về đây.', options: []
                        });
                        return;
                    }
                    sixStarBall.quantity -= 1;
                    player.bag = player.bag.filter((slot) => Number(slot.quantity) > 0);
                    player.inventory.dtn += 15_000;
                    player.inventory.power += 15_000;
                    player.mainTask = createMainTaskState({ taskId: 10, status: 'completed', subtaskIndex: 3, progress: 1 }, player.raceId);
                    taskReportMessage = 'Hoàn thành nhiệm vụ Thần Mèo. Nhận 15.000 sức mạnh và tiềm năng.';
                }
                Object.assign(player.inventory, getNroProgress(player.inventory.power));
                recalculateNroEquipmentStats(player);
                socket.emit('nroTaskUpdate', player.mainTask);
                socket.emit('statsUpdate', {
                    str: player.str, atk: player.atk, dtn: player.inventory.dtn, power: player.inventory.power,
                    gold: player.inventory.gold, hp: player.hp, maxHp: player.maxHp, mp: player.mp, maxMp: player.maxMp,
                    level: player.inventory.level, exp: player.inventory.exp, maxExp: player.inventory.maxExp
                });
                socket.emit('nroInventoryResult', {
                    ok: true, bag: player.bag, bagCapacity: player.bagCapacity,
                    gold: player.inventory.gold, message: 'Nhiệm vụ đã cập nhật hành trang.'
                });
                void persistPlayer(socket, player);
            }
            const raceShopNpc = { 7: 'earth', 8: 'namek', 9: 'saiyan' }[parsedId];
            const canOpenRaceShop = Boolean(raceShopNpc && player.raceId === raceShopNpc);
            let dialogue;
            if (Number(player.mapId) === 5 && parsedId === 13) {
                dialogue = 'Ho hô! Chào mừng con đến Đảo Kamê. Hãy nghỉ ngơi, luyện tập và chuẩn bị cho chuyến phiêu lưu tiếp theo.';
            } else if (raceShopNpc) {
                dialogue = canOpenRaceShop
                    ? (parsedId === 7 ? 'Cậu cần trang bị gì cứ đến chỗ tôi nhé.' : 'Con cần trang bị gì? Hãy xem hàng của hành tinh chúng ta.')
                    : 'Cửa hàng này chỉ phục vụ chiến binh đúng hành tinh.';
            } else if (parsedId === 42) {
                dialogue = `Ta có thể giúp con mở giới hạn sức mạnh. Giới hạn hiện tại: ${getNroPowerLimit(player.limitPower).power.toLocaleString()}.`;
            } else {
                dialogue = taskReportMessage || (isTaskHomeNpc && player.mainTask?.status === 'completed'
                    ? 'Con đã hoàn thành nhiệm vụ rất tốt. Đây là phần thưởng của con.'
                    : `Đây là điểm thông tin khu vực ${playerMap.name}.`);
            }
            const stationDestinations = { 24: [{ raceId: 'namek', mapId: 7, label: 'Đến hành tinh Namếc' }, { raceId: 'saiyan', mapId: 14, label: 'Đến hành tinh Xayda' }],
                25: [{ raceId: 'earth', mapId: 0, label: 'Đến Trái Đất' }, { raceId: 'saiyan', mapId: 14, label: 'Đến hành tinh Xayda' }],
                26: [{ raceId: 'earth', mapId: 0, label: 'Đến Trái Đất' }, { raceId: 'namek', mapId: 7, label: 'Đến hành tinh Namếc' }] };
            const isStation = (Number(player.mapId) === 24 && parsedId === 10)
                || (Number(player.mapId) === 25 && parsedId === 11)
                || (Number(player.mapId) === 26 && parsedId === 12);
            const configuredShop = nroShops.some((entry) => Number(entry.npcId) === parsedId);
            const options = configuredShop && canUseNroNpcShop(player, parsedId)
                ? [{ type: 'open_shop', label: 'Mở cửa hàng' }]
                : parsedId === 42 ? [{ type: 'open_power_training', label: 'Nâng sức mạnh / chỉ số' }]
                    : isStation ? stationDestinations[player.mapId]
                        : isKarinNpc && player.mainTask?.taskId === 10 && player.mainTask.status === 'active'
                            && player.mainTask.subtaskIndex === 0 ? [{ type: 'challenge_karin', label: 'Thách đấu Thần Mèo' }] : [];
            socket.emit('nroNpcDialog', {
                ok: true,
                npc: { id: parsedId, name: npcTemplate?.name || `NPC ${parsedId}`, x, y, avatar },
                message: dialogue,
                options
            });
        });

        socket.on('nroNpcAction', ({ npcId, action } = {}) => {
            const player = players[socket.id];
            if (!player || gameConfig.gameMode !== 'nro' || Number(player.mapId) !== 46
                || Number(npcId) !== 18 || action !== 'challenge_karin'
                || player.mainTask?.taskId !== 10 || player.mainTask.status !== 'active'
                || player.mainTask.subtaskIndex !== 0) return;
            const npc = getNroMap(46)?.npcs?.find((entry) => Number(entry[0]) === 18);
            if (!npc || Math.hypot(player.x - npc[1], player.y - npc[2]) > 60) {
                socket.emit('nroNpcDialog', { ok: false, message: 'Hãy đến gần Thần Mèo Karin để thách đấu.' });
                return;
            }
            const existing = Object.values(monsters).find((monster) => monster.questEncounter === 'karin_duel'
                && monster.questOwnerUserId === player.userId && !monster.isDead);
            if (existing) return;
            if (!spawnKarinDuel(player, io)) return;
            socket.emit('nroNpcDialog', { ok: true, npc: { id: 18, name: 'Thần Mèo Karin', x: npc[1], y: npc[2] },
                message: 'Trận đấu bắt đầu. Hãy đánh bại Thần Mèo Karin.', options: [] });
        });

        socket.on('travelNroPlanet', ({ destinationMapId } = {}) => {
            const player = players[socket.id];
            const sourceMapId = Number(player?.mapId);
            const stationNpc = { 24: 10, 25: 11, 26: 12 }[sourceMapId];
            const destinationId = Number(destinationMapId);
            const destinations = { 24: [7, 14], 25: [0, 14], 26: [0, 7] }[sourceMapId] || [];
            const sourceMap = getNroMap(sourceMapId);
            const npc = sourceMap?.npcs?.find((entry) => Number(entry[0]) === stationNpc);
            if (!player || !npc || !destinations.includes(destinationId) || !getNroWorld(destinationId)
                || Math.hypot(player.x - npc[1], player.y - npc[2]) > 60
                || Date.now() - (player.lastMapTransitionAt || 0) < 1200) {
                socket.emit('zoneError', { message: 'Hãy đến gần nhân viên trạm tàu để chọn hành tinh.' });
                return;
            }
            const destinationMap = getNroMap(destinationId);
            const destinationWorld = getNroWorld(destinationId);
            const oldRoom = mapRoom(sourceMapId, player.zoneId || 0);
            const zoneId = selectAvailableZone(destinationMap, player.zoneId || 0, player.id);
            if (zoneId < 0) {
                socket.emit('zoneError', { message: 'Các khu của hành tinh này hiện đã đầy.' });
                return;
            }
            activateNroZone(destinationId, zoneId);
            socket.leave(oldRoom);
            socket.join(mapRoom(destinationId, zoneId));
            player.mapId = destinationId;
            player.zoneId = zoneId;
            const arrival = resolveNroMapArrival(destinationWorld, destinationWorld.spawn.x, destinationWorld.spawn.y, player.width);
            player.x = arrival.x;
            player.y = arrival.y;
            player.velocityX = 0;
            player.velocityY = 0;
            player.grounded = arrival.grounded;
            player.input = { left: false, right: false, up: false, down: false, jump: false, flight: false };
            player.lastMapTransitionAt = Date.now();
            socket.mapId = destinationId;
            socket.zoneId = zoneId;
            socket.areaRoom = mapRoom(destinationId, zoneId);
            io.to(oldRoom).emit('playerDisconnected', player.id);
            socket.to(socket.areaRoom).emit('newPlayer', serializePlayer(player));
            socket.emit('mapTransition', {
                mapEntry: destinationMap, zoneId, player: serializePlayer(player),
                players: Object.fromEntries(Object.entries(players).filter(([, entry]) => entry.mapId === destinationId && entry.zoneId === zoneId)
                    .map(([id, entry]) => [id, serializePlayer(entry)])),
                monsters: Object.fromEntries(Object.entries(monsters).filter(([, entry]) => entry.mapId === destinationId && entry.zoneId === zoneId)
                    .map(([id, entry]) => [id, serializeMonster(entry)])),
                items: Object.fromEntries(Object.entries(items).filter(([, entry]) => entry.mapId === destinationId && entry.zoneId === zoneId)
                    .map(([id, entry]) => [id, serializeItem(entry)]))
            });
            socket.emit('chatHistory', chatService?.getHistory({
                mapId: destinationId,
                zoneId,
                partyId: socket.partyId || player.partyId
            }) || { channels: {} });
            socket.emit('nroTaskUpdate', player.mainTask);
            void persistPlayer(socket, player);
        });

        socket.on('travelNroWaypoint', ({ destinationMapId } = {}) => {
            const player = players[socket.id];
            if (!player || gameConfig.gameMode !== 'nro') return;
            if (!tryMapTransition(io, socket, player, chatService, Number(destinationMapId))) {
                socket.emit('zoneError', { message: 'Hãy đứng đúng cổng bản đồ rồi xác nhận chuyển map.' });
            }
        });

        socket.on('openNroShop', ({ npcId } = {}) => {
            const player = players[socket.id];
            const parsedId = Number(npcId);
            const playerMap = player && getNroMap(player.mapId);
            const npc = playerMap?.npcs.find((entry) => Number(entry[0]) === parsedId);
            const shop = nroShops.find((entry) => entry.npcId === parsedId);
            if (player && npc && shop && !canUseNroNpcShop(player, parsedId)) {
                socket.emit('nroShopCatalog', { ok: false, message: 'Cửa hàng này chỉ phục vụ chiến binh đúng hành tinh.' });
                return;
            }
            if (!player || !npc || !shop || Math.hypot(player.x - npc[1], player.y - npc[2]) > 60) {
                socket.emit('nroShopCatalog', { ok: false, message: 'Hãy đến gần người bán hàng để mở cửa hàng.' });
                return;
            }
            const tabs = nroShopTabs.filter((tab) => tab.shopId === shop.id);
            const tabIds = new Set(tabs.map((tab) => tab.id));
            const catalog = nroItemShop.filter((entry) => tabIds.has(entry.tabId) && entry.isSellable)
                .map((entry) => ({
                    ...entry,
                    item: nroItemTemplates.find((item) => item.id === entry.templateId) || null,
                    options: nroItemShopOptions.filter((option) => option.shopEntryId === entry.id)
                        .map((option) => ({ ...option, template: nroItemOptions.find((item) => item.id === option.optionId) || null }))
                }))
                .filter((entry) => entry.item);
            socket.emit('nroShopCatalog', {
                ok: true, npcId: parsedId,
                npcName: nroNpcTemplates.find((entry) => entry.id === parsedId)?.name || 'Người bán hàng',
                tabs, items: catalog, bag: player.bag, bagCapacity: player.bagCapacity
            });
        });

        socket.on('buyNroShopItem', async ({ npcId, entryId, requestId } = {}) => {
            const player = players[socket.id];
            const normalizedRequestId = typeof requestId === 'string' && /^[a-zA-Z0-9_-]{12,80}$/.test(requestId)
                ? requestId : null;
            if (!normalizedRequestId) {
                socket.emit('nroShopTransactionResult', { ok: false, message: 'Mã giao dịch không hợp lệ. Hãy tải lại cửa hàng.' });
                return;
            }
            const alreadyProcessed = normalizedRequestId && player?.shopRequestIds.has(normalizedRequestId);
            if (alreadyProcessed) {
                socket.emit('nroShopTransactionResult', {
                    ok: true, message: 'Giao dịch đã được xử lý trước đó.', bag: player.bag,
                    bagCapacity: player.bagCapacity, gold: player.inventory.gold
                });
                return;
            }
            const parsedNpcId = Number(npcId);
            const playerMap = player && getNroMap(player.mapId);
            const npc = playerMap?.npcs.find((entry) => Number(entry[0]) === parsedNpcId);
            const shop = nroShops.find((entry) => entry.npcId === parsedNpcId);
            if (player && npc && shop && !canUseNroNpcShop(player, parsedNpcId)) {
                socket.emit('nroShopTransactionResult', { ok: false, message: 'Cửa hàng này chỉ phục vụ chiến binh đúng hành tinh.' });
                return;
            }
            if (!player || !npc || !shop || Math.hypot(player.x - npc[1], player.y - npc[2]) > 60) {
                socket.emit('nroShopTransactionResult', { ok: false, message: 'Bạn cần đứng gần cửa hàng để mua vật phẩm.' });
                return;
            }
            const validTabIds = new Set(nroShopTabs.filter((tab) => tab.shopId === shop.id).map((tab) => tab.id));
            const entry = nroItemShop.find((item) => item.id === Number(entryId) && validTabIds.has(item.tabId) && item.isSellable);
            const template = entry && nroItemTemplates.find((item) => item.id === entry.templateId);
            if (!entry || !template || entry.gem > 0 || entry.exchangeTemplateId >= 0) {
                socket.emit('nroShopTransactionResult', { ok: false, message: 'Vật phẩm này hiện chưa thể mua bằng vàng.' });
                return;
            }
            if (player.inventory.gold < entry.gold) {
                socket.emit('nroShopTransactionResult', { ok: false, message: 'Bạn không đủ vàng.' });
                return;
            }
            const options = nroItemShopOptions.filter((option) => option.shopEntryId === entry.id)
                .map(({ optionId, parameter }) => ({ optionId, parameter }));
            const bagSlot = findMatchingStack(player.bag, template, options);
            if (!bagSlot && player.bag.length >= player.bagCapacity) {
                socket.emit('nroShopTransactionResult', { ok: false, message: 'Hành trang đã đầy.' });
                return;
            }
            player.inventory.gold -= entry.gold;
            if (bagSlot) bagSlot.quantity += 1;
            else player.bag.push({ templateId: template.id, shopEntryId: entry.id, quantity: 1, options });
            socket.emit('statsUpdate', { gold: player.inventory.gold });
            const receipt = {
                ok: true, message: `Đã mua ${template.name}.`, bag: player.bag,
                bagCapacity: player.bagCapacity, gold: player.inventory.gold
            };
            if (normalizedRequestId) {
                player.shopRequestIds.add(normalizedRequestId);
                while (player.shopRequestIds.size > 128) player.shopRequestIds.delete(player.shopRequestIds.values().next().value);
            }
            socket.emit('nroShopTransactionResult', receipt);
            await persistPlayer(socket, player);
        });

        socket.on('equipNroItem', async ({ bagIndex } = {}) => {
            const player = players[socket.id];
            const index = Number(bagIndex);
            const slot = player?.bag[index];
            const template = slot && nroItemTemplates.find((entry) => entry.id === Number(slot.templateId));
            const raceGender = { earth: 0, namek: 1, saiyan: 2 }[player?.raceId] ?? -1;
            if (!player || !Number.isInteger(index) || index < 0 || !slot || !template || template.type < 0 || template.type > 4) {
                socket.emit('nroInventoryResult', { ok: false, message: 'Vật phẩm không thể trang bị.' });
                return;
            }
            if (template.gender !== 3 && template.gender !== raceGender) {
                socket.emit('nroInventoryResult', { ok: false, message: 'Trang bị không dành cho hành tinh của bạn.' });
                return;
            }
            if (player.inventory.power < template.powerRequired) {
                socket.emit('nroInventoryResult', { ok: false, message: `Cần ${template.powerRequired.toLocaleString()} sức mạnh để dùng vật phẩm này.` });
                return;
            }
            const previous = player.equipment[template.type] || null;
            if (Number(slot.quantity) > 1) slot.quantity -= 1;
            else player.bag.splice(index, 1);
            if (previous) player.bag.push(previous);
            player.equipment[template.type] = { ...slot, templateId: template.id, quantity: 1 };
            recalculateNroEquipmentStats(player);
            socket.emit('nroInventoryResult', {
                ok: true, message: `Đã trang bị ${template.name}.`, bag: player.bag,
                equipment: player.equipment, stats: { str: player.str, armor: player.armor, crit: player.crit, maxHp: player.maxHp, maxMp: player.maxMp, hp: player.hp, mp: player.mp }
            });
            socket.emit('statsUpdate', { str: player.str, armor: player.armor, crit: player.crit, maxHp: player.maxHp, maxMp: player.maxMp, hp: player.hp, mp: player.mp });
            await persistPlayer(socket, player);
        });

        socket.on('useNroItem', async ({ bagIndex } = {}) => {
            const player = players[socket.id];
            const index = Number(bagIndex);
            const slot = player?.bag[index];
            const template = slot && nroItemTemplates.find((entry) => entry.id === Number(slot.templateId));
            const resetsCooldowns = template?.id === 2144 && template.type === 27;
            const usesRadar = template?.id === 379 && template.type === 29;
            const usesSatellite = template?.type === 22 && [342, 343, 344, 345].includes(template.id);
            const nroCharm = template?.type === 13 ? getNroCharm(template.id) : null;
            const isRoastChicken = template?.id === 74 && template.type === 27;
            const combatBuff = template?.type === 29 && ({
                381: { type: 'damage_boost', damageBonusPercent: 100, name: 'Cuồng nộ' },
                382: { type: 'max_hp_boost', statBonusPercent: 100, name: 'Bổ huyết' },
                383: { type: 'max_mp_boost', statBonusPercent: 100, name: 'Bổ khí' },
                384: { type: 'damage_reduction', damageReductionPercent: 50, name: 'Giáp Xên bọ hung' }
            })[template.id];
            if (!player || !Number.isInteger(index) || index < 0 || !slot || !template
                || (template.type !== 6 && !resetsCooldowns && !usesRadar && !usesSatellite && !isRoastChicken && !combatBuff && !nroCharm)) {
                socket.emit('nroInventoryResult', { ok: false, message: 'Chỉ có thể dùng vật phẩm tiêu hao phù hợp.' });
                return;
            }
            if (player.inventory.power < template.powerRequired) {
                socket.emit('nroInventoryResult', { ok: false, message: `Cần ${template.powerRequired.toLocaleString()} sức mạnh để dùng vật phẩm này.` });
                return;
            }
            if (!resetsCooldowns && !usesRadar && !usesSatellite && !combatBuff && !nroCharm && player.hp >= player.maxHp && player.mp >= player.maxMp) {
                socket.emit('nroInventoryResult', { ok: false, message: 'HP và KI đã đầy.' });
                return;
            }
            let recovery = 0;
            if (resetsCooldowns) player.cooldowns = {};
            else if (usesRadar) player.mayDoExpiresAt = Date.now() + 30 * 60 * 1000;
            else if (nroCharm) activateNroCharm(player, template.id);
            else if (combatBuff) {
                const now = Date.now();
                const oldMaxHp = player.maxHp;
                const oldMaxMp = player.maxMp;
                player.effects ||= [];
                player.effects = player.effects.filter((effect) => effect.type !== combatBuff.type || effect.expiresAt <= now);
                player.effects.push({ ...combatBuff, sourceId: player.userId, expiresAt: now + 10 * 60 * 1000 });
                if (['max_hp_boost', 'max_mp_boost'].includes(combatBuff.type)) {
                    recalculateNroEquipmentStats(player);
                    if (combatBuff.type === 'max_hp_boost') player.hp = Math.min(player.maxHp, player.hp + Math.max(0, player.maxHp - oldMaxHp));
                    else player.mp = Math.min(player.maxMp, player.mp + Math.max(0, player.maxMp - oldMaxMp));
                }
            }
            else if (usesSatellite) {
                const count = Object.values(items).filter((item) => item.type === 'satellite'
                    && item.mapId === player.mapId && item.zoneId === player.zoneId && item.expiresAt > Date.now()).length;
                if (count >= 3) {
                    socket.emit('nroInventoryResult', { ok: false, message: 'Khu vực đã có tối đa 3 vệ tinh.' });
                    return;
                }
                const id = `satellite_${itemIdCounter++}`;
                const satellite = items[id] = {
                    id, type: 'satellite', satellite: true,
                    templateId: template.id, name: template.name, iconId: template.iconId,
                    quantity: 1, ownerId: player.userId, mapId: player.mapId, zoneId: player.zoneId,
                    x: Math.round(player.x), y: Math.round(player.y),
                    expiresAt: Date.now() + 30 * 60 * 1000, lastBuffAt: 0
                };
                io.to(mapRoom(player.mapId, player.zoneId)).emit('itemDropped', serializeItem(satellite));
            }
            else if (isRoastChicken) {
                recovery = Math.max(player.maxHp, player.maxMp);
                player.hp = player.maxHp;
                player.mp = player.maxMp;
            } else {
                recovery = getBeanRecoveryAmount(template.id, slot.options);
                if (recovery <= 0) {
                    socket.emit('nroInventoryResult', { ok: false, message: 'Đậu thần này chưa có dữ liệu hồi phục.' });
                    return;
                }
                player.hp = Math.min(player.maxHp, player.hp + recovery);
                player.mp = Math.min(player.maxMp, player.mp + recovery);
            }
            if (Number(slot.quantity) > 1) slot.quantity -= 1;
            else player.bag.splice(index, 1);
            socket.emit('nroInventoryResult', {
                ok: true,
                message: resetsCooldowns ? `${template.name} đã hồi tất cả chiêu thức.`
                    : usesRadar ? `${template.name} hoạt động trong 30 phút.`
                        : nroCharm ? `${template.name} có hiệu lực thêm 60 phút.`
                            : combatBuff ? `${template.name} có hiệu lực trong 10 phút.`
                        : usesSatellite ? `${template.name} được đặt trong khu vực trong 30 phút.`
                        : isRoastChicken ? `${template.name} đã hồi đầy HP và KI.`
                            : `${template.name} hồi ${recovery.toLocaleString()} HP và KI.`,
                bag: player.bag,
                equipment: player.equipment,
                cooldownsReset: resetsCooldowns
            });
            if (!resetsCooldowns && !usesSatellite) socket.emit('statsUpdate', { hp: player.hp, maxHp: player.maxHp, mp: player.mp, maxMp: player.maxMp });
            await persistPlayer(socket, player);
        });

        socket.on('discardNroItem', async ({ bagIndex } = {}) => {
            const player = players[socket.id];
            const index = Number(bagIndex);
            const slot = player?.bag[index];
            const template = slot && nroItemTemplates.find((entry) => entry.id === Number(slot.templateId));
            if (!player || !Number.isInteger(index) || index < 0 || !slot || !template
                || [8, 9, 10].includes(Number(template.type)) || Number(template.id) === 73) {
                socket.emit('nroInventoryResult', { ok: false, message: 'Vật phẩm nhiệm vụ hoặc tiền tệ không thể vứt bỏ.' });
                return;
            }
            const quantity = Math.max(1, Math.floor(Number(slot.quantity) || 1));
            const droppedSlot = { ...slot, options: normalizeItemOptions(slot.options || []), quantity: 1 };
            if (quantity > 1) slot.quantity = quantity - 1;
            else player.bag.splice(index, 1);
            createNroItemDrop(Number(template.id), 1, { mapId: player.mapId, zoneId: player.zoneId, x: player.x, y: player.y }, player, io, droppedSlot.options);
            socket.emit('nroInventoryResult', { ok: true, message: `Đã bỏ ${template.name} ra mặt đất.`, bag: player.bag, equipment: player.equipment });
            await persistPlayer(socket, player);
        });

        socket.on('learnNroSkill', async ({ bagIndex } = {}) => {
            const player = players[socket.id];
            const index = Number(bagIndex);
            const item = player?.bag[index];
            const template = item && nroItemTemplates.find((entry) => entry.id === Number(item.templateId));
            const book = getNroSkillBookInfo(player?.raceId, template);
            if (!player || gameConfig.gameMode !== 'nro' || !player.nroCharacterCreated
                || !Number.isInteger(index) || index < 0 || !item || !book) {
                socket.emit('nroInventoryResult', { ok: false, message: 'Sách kỹ năng không phù hợp với hành tinh của bạn.' });
                return;
            }
            if ((Number(player.inventory.power) || 0) < book.powerRequired) {
                socket.emit('nroInventoryResult', {
                    ok: false,
                    message: `Cần ${book.powerRequired.toLocaleString()} sức mạnh để học kỹ năng này.`
                });
                return;
            }
            const currentLevel = Number(player.skillLevels?.[book.skillId]) || 0;
            const maxLevel = Math.min(7, Number(book.skillTemplate.maxLevel) || 7);
            if (book.level > maxLevel || currentLevel >= maxLevel) {
                socket.emit('nroInventoryResult', { ok: false, message: 'Kỹ năng đã đạt cấp tối đa.' });
                return;
            }
            if ((currentLevel === 0 && book.level !== 1) || (currentLevel > 0 && book.level !== currentLevel + 1)) {
                const requiredLevel = currentLevel + 1;
                socket.emit('nroInventoryResult', {
                    ok: false,
                    message: `Cần học ${book.skillTemplate.name} cấp ${requiredLevel} trước.`
                });
                return;
            }

            player.skillLevels = { ...player.skillLevels, [book.skillId]: book.level };
            if (Number(item.quantity) > 1) item.quantity -= 1;
            else player.bag.splice(index, 1);
            const skillSet = getNroSkillSet(player.raceId, player.inventory.power || 0);
            skillSet.levels[book.skillId] = book.level;
            skillSet.skills[book.skillId] = { ...skillSet.skills[book.skillId], unlocked: true };
            socket.emit('nroSkillConfig', {
                skills: skillSet.skills,
                skillLevels: player.skillLevels,
                newlyUnlocked: currentLevel === 0 ? [book.skillId] : []
            });
            socket.emit('nroInventoryResult', {
                ok: true,
                message: `Đã học ${book.skillTemplate.name} cấp ${book.level}.`,
                bag: player.bag,
                skillLevels: player.skillLevels
            });
            await persistPlayer(socket, player);
        });

        socket.on('trainNroStat', async ({ statType, points = 1 } = {}) => {
            const player = players[socket.id];
            if (!player || gameConfig.gameMode !== 'nro' || !player.nroCharacterCreated) {
                socket.emit('nroTrainingResult', { ok: false, message: 'Nhân vật NRO chưa sẵn sàng.' });
                return;
            }
            const limit = getNroPowerLimit(player.limitPower);
            const result = trainNroStat({
                statType: Number(statType), points: Number(points),
                potential: player.inventory.dtn, stats: player.nroStats, limit
            });
            if (!result.ok) {
                socket.emit('nroTrainingResult', result);
                return;
            }

            player.nroStats = result.stats;
            player.inventory.dtn = result.potential;
            if (Number(statType) === 0) player.baseStats.maxHp += Number(points) * 20;
            if (Number(statType) === 1) player.baseStats.maxMp += Number(points) * 20;
            if (Number(statType) === 2) player.baseStats.str += Number(points);
            if (Number(statType) === 3) player.baseStats.armor += Number(points) * 4;
            if (Number(statType) === 4) player.crit = result.stats.critical;
            recalculateNroEquipmentStats(player);
            if (player.mainTask?.taskId === 3 && player.mainTask.status === 'active'
                && player.mainTask.subtaskIndex === 0) {
                player.mainTask = createMainTaskState({ taskId: 3, status: 'active', subtaskIndex: 1, progress: 0 }, player.raceId);
                socket.emit('nroTaskUpdate', player.mainTask);
            }
            const stats = {
                hp: player.hp, maxHp: player.maxHp, mp: player.mp, maxMp: player.maxMp,
                str: player.str, armor: player.armor, dtn: player.inventory.dtn,
                nroStats: player.nroStats, limitPower: player.limitPower
            };
            socket.emit('nroTrainingResult', { ok: true, message: 'Đã nâng chỉ số.', cost: result.cost, stats });
            socket.emit('statsUpdate', stats);
            await persistPlayer(socket, player);
        });

        socket.on('openNroPowerLimit', async ({ speed = false } = {}) => {
            const player = players[socket.id];
            const emitResult = (result) => socket.emit('nroPowerLimitResult', result);
            if (!player || gameConfig.gameMode !== 'nro' || !player.nroCharacterCreated) {
                emitResult({ ok: false, message: 'Nhân vật NRO chưa sẵn sàng.' });
                return;
            }
            const kingNpc = nroMaps.find((entry) => entry.id === 43)?.npcs?.find((entry) => Number(entry[0]) === 42);
            if (player.mapId !== 43 || !kingNpc
                || Math.hypot(player.x - Number(kingNpc[1]), player.y - Number(kingNpc[2])) > 60) {
                emitResult({ ok: false, message: 'Hãy đến gần Quốc Vương tại Vách Núi Moori để mở giới hạn.' });
                return;
            }
            if (player.limitPower >= 11) {
                emitResult({ ok: false, message: 'Giới hạn sức mạnh đã đạt bậc cao nhất.' });
                return;
            }
            if (speed) {
                const cost = 1_000_000_000;
                if (player.inventory.power < 17_900_000_000) {
                    emitResult({ ok: false, message: 'Cần ít nhất 17,9 tỷ sức mạnh.' });
                    return;
                }
                if (player.inventory.gold < cost) {
                    emitResult({ ok: false, message: 'Cần 1 tỷ vàng để mở nhanh giới hạn.' });
                    return;
                }
                player.inventory.gold -= cost;
                player.limitPower = Math.min(11, player.limitPower + 1);
                emitResult({ ok: true, message: 'Đã mở nhanh giới hạn sức mạnh thêm một bậc.', limitPower: player.limitPower, limit: getNroPowerLimit(player.limitPower), gold: player.inventory.gold });
            } else {
                const cap = getNroPowerLimit(player.limitPower).power;
                if (player.openPowerExpiresAt > Date.now()) {
                    emitResult({ ok: false, message: 'Đang mở giới hạn; quá trình hoàn tất sau 24 giờ.' });
                    return;
                }
                if (player.inventory.power < cap) {
                    emitResult({ ok: false, message: `Cần đạt ${cap.toLocaleString()} sức mạnh để bắt đầu.` });
                    return;
                }
                player.openPowerExpiresAt = Date.now() + 86_400_000;
                emitResult({ ok: true, message: 'Bắt đầu mở giới hạn. Bậc mới sẽ có sau 24 giờ.', openPowerExpiresAt: player.openPowerExpiresAt });
            }
            await persistPlayer(socket, player);
        });

        socket.on('createNroCharacter', async (payload = {}) => {
            const player = players[socket.id];
            const characterName = typeof payload.characterName === 'string' ? payload.characterName.trim() : '';
            const racePresets = {
                earth: { headPartId: 0, bodyPartId: 1, legPartId: 2 },
                namek: { headPartId: 3, bodyPartId: 4, legPartId: 5 },
                saiyan: { headPartId: 6, bodyPartId: 7, legPartId: 8 }
            };
            const preset = Object.hasOwn(racePresets, payload.raceId) ? racePresets[payload.raceId] : null;
            if (!player || !preset) {
                socket.emit('nroCharacterCreationResult', { ok: false, message: 'Hành tinh không hợp lệ.' });
                return;
            }
            if (characterName.length < 3 || characterName.length > 16 || !/^[\p{L}\p{N}_]+$/u.test(characterName)) {
                socket.emit('nroCharacterCreationResult', { ok: false, message: 'Tên nhân vật cần 3–16 ký tự chữ, số hoặc dấu gạch dưới.' });
                return;
            }
            if (player.nroCharacterCreated) {
                socket.emit('nroCharacterCreationResult', { ok: false, message: 'Nhân vật đã chọn hành tinh trước đó.' });
                return;
            }

            const startMapId = getStartMapForRace(payload.raceId);
            const startMapEntry = getNroMap(startMapId);
            const startWorld = getNroWorld(startMapId);
            if (!startMapEntry || !startWorld) {
                socket.emit('nroCharacterCreationResult', { ok: false, message: 'Map khởi đầu của hành tinh chưa sẵn sàng.' });
                return;
            }
            const startZoneId = selectAvailableZone(startMapEntry, 0);
            if (startZoneId < 0) {
                socket.emit('nroCharacterCreationResult', { ok: false, message: 'Các khu khởi đầu đang đầy. Hãy thử lại.' });
                return;
            }
            activateNroZone(startMapId, startZoneId);
            const spawn = startWorld.spawn;

            let saved;
            try {
                saved = await userRepository.createNroCharacter(player.userId, {
                    created: true,
                    characterName,
                    raceId: payload.raceId,
                    ...preset,
                    mapId: startMapId,
                    zoneId: startZoneId,
                    position: { x: spawn.x, y: spawn.y }
                });
            } catch {
                socket.emit('nroCharacterCreationResult', { ok: false, message: 'Không thể lưu nhân vật. Hãy thử lại.' });
                return;
            }
            if (!saved) {
                socket.emit('nroCharacterCreationResult', { ok: false, message: 'Nhân vật đã được tạo ở phiên khác. Hãy đăng nhập lại.' });
                return;
            }
            player.characterRevision = Number(saved.character?.revision) || player.characterRevision;
            player.raceId = payload.raceId;
            player.characterName = characterName;
            socket.user.characterName = characterName;
            const oldRoom = mapRoom(player.mapId, player.zoneId || 0);
            socket.to(oldRoom).emit('playerDisconnected', player.id);
            socket.leave(oldRoom);
            player.mapId = startMapId;
            player.zoneId = startZoneId;
            const nroSkillSet = getNroSkillSet(player.raceId, player.inventory.power || 0);
            player.skillLevels = nroSkillSet.levels;
            player.headPartId = preset.headPartId;
            player.bodyPartId = preset.bodyPartId;
            player.legPartId = preset.legPartId;
            player.nroCharacterCreated = true;
            player.x = spawn.x;
            player.y = spawn.y;
            player.velocityX = 0;
            player.velocityY = 0;
            player.grounded = false;
            socket.mapId = startMapId;
            socket.zoneId = startZoneId;
            socket.join(mapRoom(startMapId, startZoneId));
            player.lastPersistAt = Date.now();
            player.mainTask = createMainTaskState(player.mainTask, player.raceId);
            socket.emit('nroCharacterCreationResult', {
                ok: true,
                character: { created: true, characterName, raceId: player.raceId, mapId: player.mapId, ...preset, position: { x: player.x, y: player.y } },
                skills: nroSkillSet.skills,
                skillLevels: player.skillLevels
            });
            socket.emit('nroTaskUpdate', player.mainTask);
            socket.emit('mapTransition', {
                mapEntry: startMapEntry,
                zoneId: startZoneId,
                player: serializePlayer(player),
                players: Object.fromEntries(Object.entries(players)
                    .filter(([, entry]) => entry.mapId === startMapId && entry.zoneId === startZoneId)
                    .map(([id, entry]) => [id, serializePlayer(entry)])),
                monsters: Object.fromEntries(Object.entries(monsters)
                    .filter(([, entry]) => entry.mapId === startMapId && entry.zoneId === startZoneId)
                    .map(([id, entry]) => [id, serializeMonster(entry)])),
                items: Object.fromEntries(Object.entries(items)
                    .filter(([, entry]) => entry.mapId === startMapId && entry.zoneId === startZoneId)
                    .map(([id, entry]) => [id, serializeItem(entry)]))
            });
            io.to(playerRoom(player)).emit('playerCharacterChanged', {
                playerId: player.id,
                raceId: player.raceId,
                headPartId: player.headPartId,
                bodyPartId: player.bodyPartId,
                legPartId: player.legPartId
            });
            void persistPlayer(socket, player);
        });

        // 2. Bật / Tắt Auto Farm với Leash Circle (P12 & P13)
        socket.on('toggleAuto', (status) => {
            const p = players[socket.id];
            if (p && typeof status === 'boolean') {
                if (gameConfig.gameMode === 'nro' && status) {
                    p.isAuto = false;
                    p.autoAnchor = null;
                    socket.emit('autoStateChanged', { isAuto: false, message: 'Trong NRO, hãy chọn mục tiêu hai lần để tự đánh.' });
                    return;
                }
                p.isAuto = status && !p.isFlying && p.hp > 0;
                if (p.isAuto) {
                    p.autoAnchor = { x: p.x, y: p.y };
                }
                socket.emit('autoStateChanged', {
                    isAuto: p.isAuto,
                    anchor: p.autoAnchor,
                    leashRadiusPx: metersToPixels(gameConfig.autoFarm.leashRadiusMeters, gameConfig.world.pixelsPerMeter)
                });
            } else if (p) {
                socket.emit('autoStateChanged', { isAuto: p.isAuto, message: 'Lệnh tự đánh không hợp lệ.' });
            }
        });

        // 3. Combat và kỹ năng: server xác thực skillId, MP, cooldown, tầm và mục tiêu.
        const handlePlayerCast = async (payload = {}) => {
            const targetId = typeof payload.target === 'string' ? payload.target : payload.targetId;
            const result = skillManager.castSkill(socket.id, payload.skillId, targetId, payload.targetPos);
            if (result.needsApproach) {
                socket.emit('combatApproach', {
                    skillId: result.skillId,
                    targetId: result.targetId,
                    rangePx: result.rangePx,
                    verticalTolerance: result.verticalTolerance,
                    requiresFacing: result.requiresFacing,
                    targetX: result.targetX,
                    targetY: result.targetY
                });
                return;
            }
            if (!result.ok) {
                socket.emit('combatError', {
                    skillId: result.skillId,
                    cooldownRemainingMs: result.cooldownRemainingMs,
                    message: result.error
                });
                return;
            }
            io.to(playerRoom(players[socket.id])).emit('skillSuccess', result);
            if (result.damageTaken.length) {
                io.to(playerRoom(players[socket.id])).emit('damageTaken', {
                    playerId: socket.id, skillId: result.skillId,
                    skillType: result.skillType, damageTaken: result.damageTaken
                });
                // PvP HP is persistent character state. Persist every online victim
                // after an authoritative hit so a disconnect cannot restore stale HP.
                const pvpVictims = new Set(result.damageTaken
                    .filter((hit) => hit.targetType === 'player')
                    .map((hit) => hit.targetId));
                for (const victimId of pvpVictims) {
                    const victim = players[victimId];
                    const victimSocket = io.sockets.sockets.get(victimId);
                    if (victim) void persistPlayer(victimSocket, victim);
                }
            }
            io.to(playerRoom(players[socket.id])).emit('playerAttacked', {
                playerId: socket.id, skillId: result.skillId, skillType: result.skillType,
                cooldownMs: result.cooldownMs, miss: result.miss,
                hits: result.damageTaken.filter((hit) => hit.targetType === 'monster').map((hit) => ({
                    monsterId: hit.targetId, damage: hit.damage, isCrit: hit.isCrit, isDead: hit.isDead
                })),
                healed: result.healed
            });
            const player = players[socket.id];
            socket.emit('statsUpdate', {
                hp: player.hp, maxHp: player.maxHp, mp: player.mp, maxMp: player.maxMp,
                stamina: player.stamina, maxStamina: player.maxStamina,
                gold: player.inventory.gold, dtn: player.inventory.dtn, power: player.inventory.power, exp: player.inventory.exp,
                level: player.inventory.level, maxExp: player.inventory.maxExp
            });
            await persistPlayer(socket, player);
            return;

        };
        socket.on('castSkill', handlePlayerCast);
        socket.on('playerAttack', handlePlayerCast);

        // 4. Nhặt vật phẩm (Atomic Server-Authoritative)
        socket.on('pickupItem', async (itemId) => {
            const p = players[socket.id];
            const item = items[itemId];
            if (!p || !item) return;
            if (gameConfig.gameMode === 'nro'
                && (Number(item.mapId) !== Number(p.mapId) || Number(item.zoneId || 0) !== Number(p.zoneId || 0))) {
                socket.emit('itemPickupResult', { ok: false, message: 'Vật phẩm không thuộc khu vực hiện tại.' });
                return;
            }
            if (item.ownerId && item.ownerId !== p.userId) {
                socket.emit('itemPickupResult', { ok: false, message: 'Vật phẩm này thuộc về người khác.' });
                return;
            }

            const dist = Math.hypot(p.x - item.x, p.y - item.y);
            if (dist <= metersToPixels(gameConfig.world.pickupRangeMeters, gameConfig.world.pixelsPerMeter)) {
                if (item.type === 'gold') {
                    p.inventory.gold += item.value;
                } else if (item.type === 'item') {
                    const template = nroItemTemplates.find((entry) => entry.id === Number(item.templateId));
                    const bagSlot = template && findMatchingStack(p.bag, template, item.options || []);
                    if (!template || (!bagSlot && p.bag.length >= p.bagCapacity)) {
                        socket.emit('itemPickupResult', { ok: false, message: 'Hành trang đầy hoặc vật phẩm không hợp lệ.' });
                        return;
                    }
                    if (bagSlot) bagSlot.quantity += item.quantity || 1;
                    else p.bag.push({ templateId: template.id, quantity: item.quantity || 1, options: item.options || [] });
                    if (template.id === 73 && p.mainTask?.taskId === 2 && p.mainTask.status === 'active'
                        && p.mainTask.subtaskIndex === 0 && Number(p.mapId) === getFoodMapForRace(p.raceId)) {
                        const collected = p.bag.filter((slot) => Number(slot.templateId) === 73)
                            .reduce((total, slot) => total + (Number(slot.quantity) || 0), 0);
                        const progress = Math.min(10, collected);
                        const ready = progress >= 10;
                        p.mainTask = {
                            ...p.mainTask,
                            status: ready ? 'ready_to_report' : 'active',
                            subtaskIndex: ready ? 1 : 0,
                            progress: ready ? 0 : progress,
                            target: ready ? 1 : 10,
                            objective: ready ? `Báo cáo với ông ${getHomeForRace(p.raceId).npcName}` : p.mainTask.objective
                        };
                        socket.emit('nroTaskUpdate', p.mainTask);
                    }
                    if (template.id === 20 && p.mainTask?.taskId === 8 && p.mainTask.status === 'active'
                        && p.mainTask.subtaskIndex === 1 && Number(item.mapId) === 4) {
                        p.mainTask = createMainTaskState({ taskId: 8, status: 'ready_to_report', subtaskIndex: 2, progress: 0 }, p.raceId);
                        socket.emit('nroTaskUpdate', p.mainTask);
                        void persistPlayer(socket, p);
                    }
                } else {
                    return;
                }
                delete items[itemId];

                io.to(gameConfig.gameMode === 'nro' ? mapRoom(item.mapId, item.zoneId) : 'room_chuong0').emit('itemPicked', {
                    itemId,
                    playerId: socket.id,
                    type: item.type,
                    value: item.value
                });
                socket.emit('itemPickupResult', { ok: true, message: 'Đã nhặt vật phẩm.', bag: p.bag, bagCapacity: p.bagCapacity, gold: p.inventory.gold });
                socket.emit('statsUpdate', {
                    gold: p.inventory.gold,
                    dtn: p.inventory.dtn,
                    hp: p.hp,
                    mp: p.mp
                });
                await persistPlayer(socket, p);
            }
        });

        // 5. Ngắt kết nối
        socket.on('disconnect', async () => {
            console.log(`[Socket.IO] Người chơi ngắt kết nối: ${socket.user.username} (${socket.id})`);
            const leavingPlayer = players[socket.id];
            const isCurrentSession = activeSocketByUser.get(String(socket.user.userId)) === socket.id;
            if (isCurrentSession) {
                activeSocketByUser.delete(String(socket.user.userId));
                await persistPlayer(socket, leavingPlayer);
            }
            delete players[socket.id];
            if (leavingPlayer) io.to(playerRoom(leavingPlayer)).emit('playerDisconnected', socket.id);
        });
    });

    // VÒNG LẶP SERVER 30Hz (mỗi 33ms)
    let tickCounter = 0;
    const tickIntervalMs = gameConfig.server.tickIntervalMs || 50;
    let nextTickAt = performance.now() + tickIntervalMs;
    let tickTimer;
    const runTick = () => {
        if (onTick) onTick(performance.now());
        tickCounter++;
        const now = Date.now();
        const expiringStatBuffs = Object.entries(players).filter(([, player]) =>
            player.effects?.some((effect) => ['max_hp_boost', 'max_mp_boost'].includes(effect.type) && effect.expiresAt <= now)
        );
        let stateChanged = skillManager.tick(now);
        for (const [id, player] of expiringStatBuffs) {
            recalculateNroEquipmentStats(player);
            const playerSocket = io.sockets.sockets.get(id);
            playerSocket?.emit('statsUpdate', { hp: player.hp, maxHp: player.maxHp, mp: player.mp, maxMp: player.maxMp });
            void persistPlayer(playerSocket, player);
            stateChanged = true;
        }
        for (const [itemId, satellite] of Object.entries(items)) {
            if (satellite.type === 'satellite' && satellite.expiresAt <= now) {
                delete items[itemId];
                io.to(mapRoom(satellite.mapId, satellite.zoneId)).emit('itemPicked', { itemId });
                stateChanged = true;
            }
        }

        // Xử lý di chuyển & hồi phục người chơi
        for (const id in players) {
            const p = players[id];
            let moved = false;
            const now = Date.now();
            if (gameConfig.gameMode === 'nro' && p.hp <= 0) {
                if (p.isAuto) {
                    p.isAuto = false;
                    p.autoAnchor = null;
                    io.sockets.sockets.get(id)?.emit('autoStateChanged', { isAuto: false, message: 'Tự đánh đã dừng vì nhân vật bị hạ.' });
                }
                const respawn = tickNroRespawn(p, getNroWorld(p.mapId), now);
                if (respawn.state === 'respawned') {
                    skillManager.cancelCharge(id);
                    p.lastPersistAt = 0;
                    const playerSocket = io.sockets.sockets.get(id);
                    playerSocket?.emit('statsUpdate', {
                        hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp, respawnRemainingMs: 0
                    });
                    void persistPlayer(playerSocket, p);
                    stateChanged = true;
                    continue;
                }
                if (respawn.state === 'dead') continue;
            }
            if (gameConfig.gameMode === 'nro' && p.hp > 0 && recoverNroStamina(p, now)) {
                const playerSocket = io.sockets.sockets.get(id);
                playerSocket?.emit('statsUpdate', { stamina: p.stamina, maxStamina: p.maxStamina });
                void persistPlayer(playerSocket, p);
            }
            p.satelliteExpBonus = 0;
            p.satelliteDefenseActive = false;
            for (const satellite of Object.values(items)) {
                if (satellite.type !== 'satellite' || satellite.ownerId !== p.userId
                    || satellite.mapId !== p.mapId || satellite.zoneId !== p.zoneId
                    || Math.hypot(satellite.x - p.x, satellite.y - p.y) > 250) continue;
                if (satellite.templateId === 343) p.satelliteExpBonus = 20;
                if (satellite.templateId === 344) p.satelliteDefenseActive = true;
                if ([342, 345].includes(satellite.templateId) && now - satellite.lastBuffAt >= 30_000) {
                    satellite.lastBuffAt = now;
                    if (satellite.templateId === 342) p.mp = Math.min(p.maxMp, p.mp + Math.floor(p.maxMp * 0.05));
                    else p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.05));
                    io.sockets.sockets.get(id)?.emit('statsUpdate', { hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp });
                    void persistPlayer(io.sockets.sockets.get(id), p);
                }
            }
            if (gameConfig.gameMode === 'nro' && p.openPowerExpiresAt > 0 && now >= p.openPowerExpiresAt) {
                p.limitPower = Math.min(11, p.limitPower + 1);
                p.openPowerExpiresAt = 0;
                p.lastPersistAt = 0;
                const playerSocket = io.sockets.sockets.get(id);
                playerSocket?.emit('nroPowerLimitResult', {
                    ok: true,
                    message: 'Đã mở giới hạn sức mạnh thêm một bậc.',
                    limitPower: p.limitPower,
                    limit: getNroPowerLimit(p.limitPower)
                });
                playerSocket?.emit('statsUpdate', { limitPower: p.limitPower });
                void persistPlayer(playerSocket, p);
                stateChanged = true;
            }
            const movementBlocked = isNroMovementBlocked(p.effects, now);
            const speedBoost = p.effects?.filter((effect) => ['speed_boost', 'monkey_transform'].includes(effect.type)
                && effect.expiresAt > now)
                .reduce((multiplier, effect) => Math.max(multiplier, effect.speedMultiplier || 1), 1) || 1;
            const speedPxPerSecond = getMovementSpeedPxPerSecond(
                gameConfig.movement.baseSpeedMetersPerSecond,
                p.agi,
                gameConfig.movement.agiBonusPixelsPerSecond,
                gameConfig.world.pixelsPerMeter,
                p.nroMoveSpeedPercent
            ) * speedBoost;

            if (gameConfig.gameMode === 'nro') {
                const playerWorld = getNroWorld(p.mapId);
                // Status control blocks input, not world physics: a stunned player
                // still falls and lands instead of hanging in midair until expiry.
                if (playerWorld) {
                    // Auto mode disables manual movement but must keep gravity and
                    // collision active so the character remains on the terrain.
                    const rawInput = p.isAuto && !movementBlocked ? {} : p.input;
                    const movementInput = getNroMovementInput(rawInput, p.effects, now);
                    const hasMovementInput = !movementBlocked && (
                        Math.abs(Number(movementInput?.axisX) || 0) > 0.03
                        || Math.abs(Number(movementInput?.axisY) || 0) > 0.03
                        || movementInput?.left || movementInput?.right || movementInput?.up
                        || movementInput?.down || movementInput?.jump || movementInput?.flight
                    );
                    if (hasMovementInput) skillManager.cancelCharge(id);
                    const previousMp = p.mp;
                    const previousFlying = Boolean(p.isFlying);
                    // Keep running speed server-authoritative while using the
                    // same AGI/equipment modifiers as legacy input.
                    moved = stepNroMovement(p, movementInput, tickIntervalMs, {
                        ...playerWorld,
                        runSpeedPxPerSecond: speedPxPerSecond,
                        flightKiPerSecond: gameConfig.nroWorld.flightKiPerSecond,
                        flightHoverDurationMs: gameConfig.nroWorld.flightHoverDurationMs
                    });
                    const playerSocket = io.sockets.sockets.get(id);
                    if (p.mp !== previousMp) {
                        playerSocket?.emit('statsUpdate', { mp: p.mp, maxMp: p.maxMp, isFlying: p.isFlying });
                        void persistPlayer(playerSocket, p);
                    }
                    if (Boolean(p.isFlying) !== previousFlying) {
                        io.to(playerRoom(p)).emit('flightStateChanged', { playerId: id, isFlying: Boolean(p.isFlying) });
                    }
                }
            } else if (p.isAuto && !movementBlocked) {
                const targetRadiusPx = metersToPixels(gameConfig.autoFarm.targetRadiusMeters, gameConfig.world.pixelsPerMeter);
                const { target, distance } = findNearestValidTarget(p, monsters, targetRadiusPx);

                if (target) {
                    const engageRangePx = metersToPixels(gameConfig.autoFarm.engageRangeMeters, gameConfig.world.pixelsPerMeter);
                    if (distance > engageRangePx) {
                        const delta = getMovementTowardDelta(p, target, speedPxPerSecond, tickIntervalMs);
                        const nextX = p.x + delta.x;
                        const nextY = p.y + delta.y;

                        const leashRadiusPx = metersToPixels(gameConfig.autoFarm.leashRadiusMeters, gameConfig.world.pixelsPerMeter);
                        const clamped = clampToLeashCircle(p.autoAnchor, { x: nextX, y: nextY }, leashRadiusPx);
                        p.x = clamped.x;
                        p.y = clamped.y;
                        moved = true;
                    } else {
                        const autoSkills = getNroSkillSet(p.raceId, p.inventory.power || 0).skills;
                        const s3 = autoSkills.s3;
                        const s1 = autoSkills.s1;
                        const s3Resolved = s3 && skillManager.resolveSkillAtLevel(s3, p.skillLevels.s3);
                        const s1Resolved = s1 && skillManager.resolveSkillAtLevel(s1, p.skillLevels.s1);
                        const s3Ready = s3Resolved?.unlocked !== false && (now - (p.cooldowns.s3 || 0)) >= (s3Resolved?.cooldownMs || Infinity) && p.mp >= (s3Resolved?.mpCost || Infinity);
                        const s1Ready = s1Resolved?.unlocked !== false && (now - (p.cooldowns.s1 || 0)) >= (s1Resolved?.cooldownMs || Infinity) && p.mp >= (s1Resolved?.mpCost || Infinity);

                        if (s3Ready) {
                            io.sockets.sockets.get(id)?.emit('autoAttackTrigger', { skillId: 's3' });
                        } else if (s1Ready) {
                            io.sockets.sockets.get(id)?.emit('autoAttackTrigger', { skillId: 's1' });
                        }
                    }
                }
            } else if (!p.isAuto && !movementBlocked) {
                const delta = getMovementDelta(p.input, speedPxPerSecond, tickIntervalMs);
                const nextPosition = clampPlayerPosition(p, { x: p.x + delta.x, y: p.y + delta.y }, gameConfig.map);
                moved = nextPosition.x !== p.x || nextPosition.y !== p.y;
                p.x = nextPosition.x;
                p.y = nextPosition.y;
            }

            if (p.isAuto) {
                const bounded = clampPlayerPosition(p, p, gameConfig.map);
                p.x = bounded.x;
                p.y = bounded.y;
            }

            if (moved) stateChanged = true;

            const auraDrain = applyNroEquipmentAuraDrain(p, monsters, Date.now());
            if (auraDrain?.drainedHp > 0) {
                io.sockets.sockets.get(id)?.emit('statsUpdate', { hp: p.hp });
                stateChanged = true;
            }

            if (gameConfig.gameMode === 'nro' && applyNroEquipmentRecovery(p, Date.now())) {
                io.sockets.sockets.get(id)?.emit('statsUpdate', { hp: p.hp, mp: p.mp });
                stateChanged = true;
            }
            if (applyNroEquipmentKiRecovery10s(p, Date.now())) {
                io.sockets.sockets.get(id)?.emit('statsUpdate', { mp: p.mp });
                stateChanged = true;
            }

            // Hồi phục MP mỗi 1 giây (20 tick)
            if (tickCounter % 20 === 0) {
                if (gameConfig.gameMode !== 'nro') {
                    const regen = p.isAuto ? gameConfig.playerDefaults.mpRegenInCombat : gameConfig.playerDefaults.mpRegenOutOfCombat;
                    if (p.mp < p.maxMp) {
                        p.mp = Math.min(p.maxMp, p.mp + regen);
                        io.sockets.sockets.get(id)?.emit('statsUpdate', { mp: p.mp });
                    }
                }
                if (tickCounter % 100 === 0 && Date.now() - p.lastPersistAt >= 5000) {
                    void persistPlayer(io.sockets.sockets.get(id), p);
                }
            }
        }

        // Cập nhật State Machine của quái
        for (const mid in monsters) {
            const m = monsters[mid];
            const oldX = m.x;
            const oldY = m.y;
            const oldState = m.state;
            const oldFacing = m.facing;
            const oldTargetId = m.focusedTargetId;
            const eligiblePlayers = gameConfig.gameMode === 'nro'
                ? Object.fromEntries(Object.entries(players).filter(([, p]) => p.mapId === m.mapId && p.zoneId === m.zoneId))
                : players;
            if (gameConfig.gameMode === 'nro' && Object.keys(eligiblePlayers).length === 0) continue;
            const attackedPlayer = m.update(eligiblePlayers, tickIntervalMs, Date.now());
            if (attackedPlayer) {
                const damageTaken = skillManager.applyMonsterAttack(m, attackedPlayer);
                if (damageTaken) {
                    stateChanged = true;
                    io.sockets.sockets.get(attackedPlayer.id)?.emit('statsUpdate', { hp: attackedPlayer.hp });
                    void persistPlayer(io.sockets.sockets.get(attackedPlayer.id), attackedPlayer);
                    if (m.questEncounter === 'tau_7_7' && attackedPlayer.userId === m.questOwnerUserId
                        && attackedPlayer.mainTask?.taskId === 9 && attackedPlayer.mainTask.status === 'active'
                        && attackedPlayer.mainTask.subtaskIndex === 1) {
                        attackedPlayer.mainTask = createMainTaskState({ taskId: 9, status: 'active', subtaskIndex: 2, progress: 0 }, attackedPlayer.raceId);
                        io.sockets.sockets.get(attackedPlayer.id)?.emit('nroTaskUpdate', attackedPlayer.mainTask);
                        void persistPlayer(io.sockets.sockets.get(attackedPlayer.id), attackedPlayer);
                    }
                }
            }

            if (oldX !== m.x || oldY !== m.y || oldState !== m.state
                || oldFacing !== m.facing || oldTargetId !== m.focusedTargetId) {
                stateChanged = true;
            }
        }

        // Phát snapshot theo tick 30Hz; Phaser nội suy/render độc lập ở client.
        if (stateChanged || tickCounter % 4 === 0) {
            const payload = {
                players: {},
                monsters: {}
            };

            for (const id in players) {
                payload.players[id] = {
                    x: Math.round(players[id].x),
                    y: Math.round(players[id].y),
                    velocityX: Math.round(players[id].velocityX || 0),
                    velocityY: Math.round(players[id].velocityY || 0),
                    grounded: Boolean(players[id].grounded),
                    isFlying: Boolean(players[id].isFlying),
                    animationState: getNroAnimationState(players[id]),
                    facing: players[id].facing || 1,
                    hp: players[id].hp,
                    maxHp: players[id].maxHp,
                    mp: players[id].mp,
                    maxMp: players[id].maxMp,
                    respawnRemainingMs: 0,
                    username: players[id].characterName || players[id].username,
                    isAuto: players[id].isAuto,
                    mapId: players[id].mapId,
                    zoneId: players[id].zoneId,
                    effects: (players[id].effects || []).filter((effect) => effect.expiresAt > Date.now())
                        .map((effect) => ({ type: effect.type, remainingMs: effect.expiresAt - Date.now() })),
                    companion: players[id].companion?.expiresAt > Date.now() ? {
                        ...players[id].companion,
                        remainingMs: players[id].companion.expiresAt - Date.now(),
                        expiresAt: undefined
                    } : null
                };
            }

            for (const mid in monsters) {
                payload.monsters[mid] = {
                    templateId: monsters[mid].templateId,
                    level: monsters[mid].level,
                    name: monsters[mid].name,
                    type: monsters[mid].type,
                    x: Math.round(monsters[mid].x),
                    y: Math.round(monsters[mid].y),
                    width: monsters[mid].width,
                    height: monsters[mid].height,
                    atk: Math.max(Number(monsters[mid].atk) || 0,
                        Math.floor((Number(monsters[mid].maxHp) || 0) * (Number(monsters[mid].pDame) || 0) / 100)),
                    def: Number(monsters[mid].def) || 0,
                    facing: monsters[mid].facing || 1,
                    targetId: monsters[mid].focusedTargetId || null,
                    velocityX: Math.round(monsters[mid].velocityX || 0),
                    velocityY: Math.round(monsters[mid].velocityY || 0),
                    attackSequence: monsters[mid].attackSequence || 0,
                    hp: monsters[mid].hp,
                    maxHp: monsters[mid].maxHp,
                    state: monsters[mid].state,
                    isDead: monsters[mid].isDead,
                    mapId: monsters[mid].mapId,
                    zoneId: monsters[mid].zoneId,
                    effects: (monsters[mid].effects || []).filter((effect) => effect.expiresAt > Date.now())
                        .map((effect) => ({ type: effect.type, remainingMs: effect.expiresAt - Date.now() }))
                };
            }

            if (gameConfig.gameMode === 'nro') {
                const activeMapZones = new Set(Object.values(players).map((player) => `${player.mapId}:${player.zoneId || 0}`));
                for (const mapZone of activeMapZones) {
                    const [mapId, zoneId] = mapZone.split(':').map(Number);
                    const zonePlayers = Object.entries(players).filter(([, player]) => player.mapId === mapId && player.zoneId === zoneId);
                    for (const [recipientId, recipient] of zonePlayers) {
                        const mapPayload = { players: {}, monsters: {} };
                        for (const [id, player] of zonePlayers) mapPayload.players[id] = payload.players[id];
                        for (const [id, monster] of Object.entries(monsters)) {
                            if (monster.mapId === mapId && monster.zoneId === zoneId && canSeeMonster(recipient, monster)) {
                                mapPayload.monsters[id] = payload.monsters[id];
                            }
                        }
                        io.to(recipientId).emit('stateUpdate', mapPayload);
                    }
                }
            } else {
                io.to('room_chuong0').emit('stateUpdate', payload);
            }
        }
        nextTickAt += tickIntervalMs;
        tickTimer = setTimeout(runTick, Math.max(0, nextTickAt - performance.now()));
    };
    tickTimer = setTimeout(runTick, tickIntervalMs);

    return () => clearTimeout(tickTimer);
}

function handleMonsterDeath(monster, killerPlayer, io) {
    if (gameConfig.gameMode === 'nro') {
        if (monster.questEncounter === 'karin_duel' || monster.questEncounter === 'tau_7_7') {
            const task = killerPlayer.mainTask;
            if (String(monster.questOwnerUserId) !== String(killerPlayer.userId) || task?.taskId !== 10 || task.status !== 'active') return;
            if (monster.questEncounter === 'karin_duel' && task.subtaskIndex === 0) {
                killerPlayer.mainTask = createMainTaskState({ taskId: 10, status: 'active', subtaskIndex: 1, progress: 0 }, killerPlayer.raceId);
            } else if (monster.questEncounter === 'tau_7_7' && task.subtaskIndex === 1) {
                killerPlayer.mainTask = createMainTaskState({ taskId: 10, status: 'active', subtaskIndex: 2, progress: 0 }, killerPlayer.raceId);
            }
            delete monsters[monster.id];
            io.sockets.sockets.get(killerPlayer.id)?.emit('nroTaskUpdate', killerPlayer.mainTask);
            io.sockets.sockets.get(killerPlayer.id)?.emit('nroNpcDialog', {
                ok: true, npc: { name: monster.name }, message: monster.questEncounter === 'karin_duel'
                    ? 'Con đã thắng Thần Mèo. Hãy xuống Rừng Karin tiêu diệt Tàu Pảy Pảy.'
                    : 'Tàu Pảy Pảy đã bị tiêu diệt. Hãy đến gặp Bò Mộng.'
            });
            void persistPlayer(io.sockets.sockets.get(killerPlayer.id), killerPlayer);
            return;
        }
        dropNroMobReward(monster, killerPlayer, io);
        if (killerPlayer.mainTask?.taskId === 1 && killerPlayer.mainTask.status === 'active' && killerPlayer.mainTask.subtaskIndex === 0
            && Number(monster.templateId) === 0
            && Number(monster.mapId) === getStartMapForRace(killerPlayer.raceId)) {
            const progress = Math.min(killerPlayer.mainTask.target, killerPlayer.mainTask.progress + 1);
            const ready = progress >= killerPlayer.mainTask.target;
            killerPlayer.mainTask = {
                ...killerPlayer.mainTask,
                status: ready ? 'ready_to_report' : 'active',
                subtaskIndex: ready ? 1 : 0,
                objective: ready
                    ? (nroTaskTemplates.find((entry) => entry.id === 1)?.subtasks?.[1]?.name?.replaceAll('%2', getHomeForRace(killerPlayer.raceId).npcName) || `Báo cáo với ông ${getHomeForRace(killerPlayer.raceId).npcName}`)
                    : killerPlayer.mainTask.objective,
                target: ready ? 1 : killerPlayer.mainTask.target,
                progress: ready ? 0 : progress,
            };
            io.sockets.sockets.get(killerPlayer.id)?.emit('nroTaskUpdate', killerPlayer.mainTask);
        }
        const task4Targets = [
            { templateId: 4, maps: [2, 3, 4] },
            { templateId: 5, maps: [9, 11, 12] },
            { templateId: 6, maps: [16, 17, 18] }
        ];
        const task4 = killerPlayer.mainTask;
        const taskTarget = task4?.taskId === 4 && task4.status === 'active'
            ? task4Targets[task4.subtaskIndex] : null;
        if (taskTarget && Number(monster.templateId) === taskTarget.templateId && taskTarget.maps.includes(Number(monster.mapId))) {
            const nextProgress = task4.progress + 1;
            const stageComplete = nextProgress >= 3;
            const nextStage = task4.subtaskIndex + 1;
            killerPlayer.mainTask = createMainTaskState({
                taskId: 4,
                status: stageComplete && nextStage === 3 ? 'ready_to_report' : 'active',
                subtaskIndex: stageComplete ? nextStage : task4.subtaskIndex,
                progress: stageComplete ? (nextStage === 3 ? 0 : 0) : nextProgress
            }, killerPlayer.raceId);
            io.sockets.sockets.get(killerPlayer.id)?.emit('nroTaskUpdate', killerPlayer.mainTask);
        }
        const woodenTask = killerPlayer.mainTask;
        if ([5, 6].includes(woodenTask?.taskId) && woodenTask.status === 'active'
            && Number(monster.templateId) === 0
            && Number(monster.mapId) === getStartMapForRace(killerPlayer.raceId)) {
            const target = woodenTask.target;
            const progress = Math.min(target, woodenTask.progress + 1);
            if (woodenTask.taskId === 5 && progress >= target) {
                killerPlayer.mainTask = createMainTaskState({ taskId: 6, status: 'active', subtaskIndex: 0, progress: 0 }, killerPlayer.raceId);
            } else {
                killerPlayer.mainTask = createMainTaskState({
                    taskId: woodenTask.taskId,
                    status: progress >= target ? 'completed' : 'active',
                    subtaskIndex: 0,
                    progress
                }, killerPlayer.raceId);
            }
            io.sockets.sockets.get(killerPlayer.id)?.emit('nroTaskUpdate', killerPlayer.mainTask);
        }
        const rescueTask = killerPlayer.mainTask;
        if (rescueTask?.taskId === 7 && rescueTask.status === 'active') {
            if (rescueTask.subtaskIndex === 0 && killerPlayer.inventory.power >= 16_000) {
                killerPlayer.mainTask = createMainTaskState({ taskId: 7, status: 'active', subtaskIndex: 1, progress: 0 }, killerPlayer.raceId);
                io.sockets.sockets.get(killerPlayer.id)?.emit('nroTaskUpdate', killerPlayer.mainTask);
            } else if (rescueTask.subtaskIndex === 1 && Number(monster.templateId) === 9 && Number(monster.mapId) === 17) {
                const progress = Math.min(rescueTask.target, rescueTask.progress + 1);
                const complete = progress >= rescueTask.target;
                killerPlayer.mainTask = createMainTaskState({
                    taskId: 7,
                    status: 'active',
                    subtaskIndex: complete ? 2 : 1,
                    progress: complete ? 0 : progress
                }, killerPlayer.raceId);
                io.sockets.sockets.get(killerPlayer.id)?.emit('nroTaskUpdate', killerPlayer.mainTask);
            }
        }
    } else {
        const goldValue = Math.floor(Math.random() * (monster.goldMax - monster.goldMin + 1)) + monster.goldMin;
        if (goldValue > 0) {
            const dropId = `drop_${itemIdCounter++}`;
            items[dropId] = { id: dropId, type: 'gold', x: Math.round(monster.x), y: Math.round(monster.y), value: goldValue };
            io.to('room_chuong0').emit('itemDropped', serializeItem(items[dropId]));
        }
    }
    if (gameConfig.gameMode !== 'nro') killerPlayer.inventory.exp += monster.exp;
    const quest = killerPlayer.quests.quest_01;
    if (quest && quest.status === 'accepted') {
        quest.progress += 1;
        if (quest.progress >= quest.target) {
            quest.status = 'completed';
            killerPlayer.flags.completed_quest_01 = true;
            killerPlayer.inventory.gold += gameConfig.quests.quest_01.rewardGold;
            killerPlayer.inventory.dtn += gameConfig.quests.quest_01.rewardDtn;
            killerPlayer.inventory.power += gameConfig.quests.quest_01.rewardDtn;
            if (gameConfig.gameMode !== 'nro') killerPlayer.inventory.exp += gameConfig.quests.quest_01.rewardExp;

            io.sockets.sockets.get(killerPlayer.id)?.emit('questCompleted', {
                questId: 'quest_01',
                title: gameConfig.quests.quest_01.title,
                rewardGold: gameConfig.quests.quest_01.rewardGold,
                rewardDtn: gameConfig.quests.quest_01.rewardDtn
            });
        }

        io.sockets.sockets.get(killerPlayer.id)?.emit('questProgressUpdate', {
            questId: 'quest_01',
            progress: quest.progress,
            target: quest.target,
            status: quest.status
        });
    }
    if (gameConfig.gameMode === 'nro') {
        const skillSet = getNroSkillSet(killerPlayer.raceId, killerPlayer.inventory.power || 0);
        const previousLevels = killerPlayer.skillLevels || {};
        const newlyUnlocked = Object.keys(skillSet.levels).filter((id) => !previousLevels[id]);
        killerPlayer.skillLevels = { ...previousLevels };
        for (const [skillId, level] of Object.entries(skillSet.levels)) {
            killerPlayer.skillLevels[skillId] = Math.max(Number(killerPlayer.skillLevels[skillId]) || 0, level);
        }
        for (const skillId of Object.keys(killerPlayer.skillLevels)) {
            if (skillSet.skills[skillId]) skillSet.skills[skillId].unlocked = true;
        }
        if (newlyUnlocked.length) {
            io.sockets.sockets.get(killerPlayer.id)?.emit('nroSkillConfig', {
                skills: skillSet.skills,
                skillLevels: killerPlayer.skillLevels,
                newlyUnlocked
            });
        }
    }
    const socket = io.sockets.sockets.get(killerPlayer.id);
    levelUpCharacter(killerPlayer);
    if (socket) {
        socket.emit('statsUpdate', {
            hp: killerPlayer.hp, maxHp: killerPlayer.maxHp,
            mp: killerPlayer.mp, maxMp: killerPlayer.maxMp,
            exp: killerPlayer.inventory.exp, maxExp: killerPlayer.inventory.maxExp,
            level: killerPlayer.inventory.level, gold: killerPlayer.inventory.gold,
            dtn: killerPlayer.inventory.dtn,
            power: killerPlayer.inventory.power
        });
        void persistPlayer(socket, killerPlayer);
    }
}

function dropNroMobReward(monster, killerPlayer, io) {
    if (gameConfig.gameMode !== 'nro') return;
    const mobTemplateId = Number(monster.templateId);
    if (killerPlayer.mainTask?.taskId === 2 && killerPlayer.mainTask.status === 'active'
        && killerPlayer.mainTask.subtaskIndex === 0
        && Number(monster.mapId) === getFoodMapForRace(killerPlayer.raceId)
        && [1, 2, 3].includes(mobTemplateId)) {
        createNroItemDrop(73, 1, monster, killerPlayer, io);
    }
    if (killerPlayer.mainTask?.taskId === 8 && killerPlayer.mainTask.status === 'active'
        && killerPlayer.mainTask.subtaskIndex === 1 && mobTemplateId === 10 && Number(monster.mapId) === 4) {
        const alreadyOwned = killerPlayer.bag.some((slot) => Number(slot.templateId) === 20 && Number(slot.quantity) > 0)
            || Object.values(items).some((item) => Number(item.templateId) === 20
                && item.ownerId === killerPlayer.userId && Number(item.mapId) === 4
                && Number(item.zoneId || 0) === Number(monster.zoneId || 0));
        if (!alreadyOwned) createNroItemDrop(20, 1, monster, killerPlayer, io);
    }
    const configured = nroMobRewards.find((entry) => entry.mobTemplateId === mobTemplateId);
    if (!configured) return;
    const mapId = Number(monster.mapId ?? gameConfig.nroWorld.mapId);
    const gender = { earth: 0, namek: 1, saiyan: 2 }[killerPlayer.raceId] ?? -1;
    const goldIds = new Set([76, 188, 189, 190]);
    const gatedIds = new Set([380, 590, 663, 664, 665, 666, 667]);
    const isAvailable = (reward) => reward.mapIds.includes(-1) || reward.mapIds.includes(mapId);
    const isGenderAllowed = (reward) => {
        const itemGender = nroItemTemplates.find((item) => item.id === reward.templateId)?.gender ?? 3;
        return reward.forAllGender || itemGender > 2 || itemGender === gender;
    };
    const itemRewards = configured.rewards.filter((reward) => !goldIds.has(reward.templateId)
        && !gatedIds.has(reward.templateId));
    const goldRewards = configured.rewards.filter((reward) => goldIds.has(reward.templateId));
    const isCompleteGodSet = [0, 1, 2, 3, 4].every((type) => {
        const templateId = Number(killerPlayer.equipment?.[type]?.templateId);
        return templateId >= 555 && templateId <= 567;
    });
    const rollExtraPool = (category, enabled) => {
        if (!enabled) return;
        const pool = configured.rewards.filter((reward) => reward.category === category);
        if (!pool.length) return;
        const reward = pool[Math.floor(Math.random() * pool.length)];
        if (reward.typeRatio > 0 && Math.floor(Math.random() * reward.typeRatio) < reward.ratio) {
            createNroItemDrop(reward.templateId, 1, monster, killerPlayer, io);
        }
    };

    // RewardService selects one regular item entry, then applies that entry's
    // map/gender/ratio checks. Keep gated pools separate: in source, ky-bi
    // capsules, food and books depend on radar/set/flag state, and suppress gold.
    if (itemRewards.length) {
        const reward = itemRewards[Math.floor(Math.random() * itemRewards.length)];
        if (isAvailable(reward) && isGenderAllowed(reward) && reward.typeRatio > 0
            && Math.floor(Math.random() * reward.typeRatio) < reward.ratio) {
            const template = nroItemTemplates.find((item) => item.id === reward.templateId);
            if (template) {
                const baseOptions = nroMobDropBaseOptions[`${template.type}:${template.id}`] || [];
                const options = baseOptions.map(({ optionId, param }) => {
                    const variance = Math.floor(param * 10 / 100);
                    return { optionId, param: param + Math.floor(Math.random() * (variance * 2 + 1)) - variance };
                });
                if ([0, 1, 2, 3, 4].includes(Number(template.type))) {
                    const stars = [
                        { value: 1, ratio: 20, denominator: 100 },
                        { value: 2, ratio: 10, denominator: 100 },
                        { value: 3, ratio: 5, denominator: 100 },
                        { value: 4, ratio: 3, denominator: 200 },
                        { value: 5, ratio: 2, denominator: 200 },
                        { value: 6, ratio: 1, denominator: 200 },
                        { value: 7, ratio: 1, denominator: 300 }
                    ];
                    const selectedStar = stars[Math.floor(Math.random() * stars.length)];
                    if (Math.floor(Math.random() * selectedStar.denominator) < selectedStar.ratio) {
                        options.push({ optionId: 107, param: selectedStar.value });
                    }
                }
                if (reward.templateId === 2009) options.push({ optionId: 30, param: 0 });
                if ([2013, 2014, 2015].includes(reward.templateId)) options.push({ optionId: 74, param: 0 });
                createNroItemDrop(reward.templateId, 1, monster, killerPlayer, io, options);
            }
        }
    }

    rollExtraPool('capsulekybi', (killerPlayer.mayDoExpiresAt || 0) > Date.now());
    rollExtraPool('thucan', isCompleteGodSet);
    rollExtraPool('bikiep', Number(killerPlayer.cFlag) > 0);

    const hasGatedReward = configured.rewards.some((reward) => ['capsulekybi', 'thucan', 'bikiep'].includes(reward.category));
    if (goldRewards.length && !hasGatedReward) {
        const reward = goldRewards[Math.floor(Math.random() * goldRewards.length)];
        if (reward.typeRatio > 0
            && Math.floor(Math.random() * reward.typeRatio) < reward.ratio) {
            const quantityRanges = { 76: [1000, 5000], 188: [5000, 10000], 189: [10000, 20000], 190: [20000, 30000] };
            const [minimum, maximum] = quantityRanges[reward.templateId];
            const baseQuantity = minimum + Math.floor(Math.random() * (maximum - minimum + 1));
            const quantity = applyNroGoldDropBonus(baseQuantity, killerPlayer.nroGoldDropPercent);
            createNroItemDrop(reward.templateId, quantity, monster, killerPlayer, io);
        }
    }
}

function createNroItemDrop(templateId, quantity, monster, owner, io, options = []) {
    const template = nroItemTemplates.find((entry) => entry.id === templateId);
    if (!template) return;
    const itemId = `drop_${itemIdCounter++}`;
    items[itemId] = {
        id: itemId,
        type: [76, 188, 189, 190].includes(templateId) ? 'gold' : 'item',
        templateId,
        name: template.name,
        iconId: template.iconId,
        ownerId: owner.userId,
        mapId: Number(monster.mapId ?? owner.mapId),
        zoneId: Number(monster.zoneId ?? owner.zoneId ?? 0),
        quantity,
        value: [76, 188, 189, 190].includes(templateId) ? quantity : undefined,
        x: Math.round(monster.x + (Math.random() * 30 - 15)),
        y: Math.round(monster.y - 4),
        options: normalizeItemOptions(options)
    };
    if (tryAutoPickupNroDrop(itemId, owner, io)) return;
    io.to(mapRoom(items[itemId].mapId, items[itemId].zoneId)).emit('itemDropped', serializeItem(items[itemId]));
}

function tryAutoPickupNroDrop(itemId, owner, io) {
    const item = items[itemId];
    const active = owner?.effects?.some((effect) => effect.type === 'nro_charm_thu_hut' && effect.expiresAt > Date.now());
    // The source charm deliberately leaves special ID 590 on the ground.
    if (!active || !item || Number(item.templateId) === 590) return false;

    let taskChanged = false;
    if (item.type === 'gold') {
        owner.inventory.gold += Number(item.value) || 0;
    } else if (item.type === 'item') {
        const template = nroItemTemplates.find((entry) => entry.id === Number(item.templateId));
        const bagSlot = template && findMatchingStack(owner.bag, template, item.options || []);
        if (!template || (!bagSlot && owner.bag.length >= owner.bagCapacity)) return false;
        if (bagSlot) bagSlot.quantity += item.quantity || 1;
        else owner.bag.push({ templateId: template.id, quantity: item.quantity || 1, options: item.options || [] });

        if (template.id === 73 && owner.mainTask?.taskId === 2 && owner.mainTask.status === 'active'
            && owner.mainTask.subtaskIndex === 0 && Number(owner.mapId) === getFoodMapForRace(owner.raceId)) {
            const collected = owner.bag.filter((slot) => Number(slot.templateId) === 73)
                .reduce((total, slot) => total + (Number(slot.quantity) || 0), 0);
            const progress = Math.min(10, collected);
            const ready = progress >= 10;
            owner.mainTask = {
                ...owner.mainTask, status: ready ? 'ready_to_report' : 'active',
                subtaskIndex: ready ? 1 : 0, progress: ready ? 0 : progress,
                target: ready ? 1 : 10,
                objective: ready ? `Báo cáo với ông ${getHomeForRace(owner.raceId).npcName}` : owner.mainTask.objective
            };
            taskChanged = true;
        }
        if (template.id === 20 && owner.mainTask?.taskId === 8 && owner.mainTask.status === 'active'
            && owner.mainTask.subtaskIndex === 1 && Number(item.mapId) === 4) {
            owner.mainTask = createMainTaskState({ taskId: 8, status: 'ready_to_report', subtaskIndex: 2, progress: 0 }, owner.raceId);
            taskChanged = true;
        }
    } else return false;

    delete items[itemId];
    const room = mapRoom(item.mapId, item.zoneId);
    io.to(room).emit('itemPicked', { itemId, playerId: owner.id, type: item.type, value: item.value });
    const socket = io.sockets.sockets.get(owner.id);
    socket?.emit('itemPickupResult', { ok: true, message: 'Bùa Thu Hút đã tự nhặt vật phẩm.', bag: owner.bag, bagCapacity: owner.bagCapacity, gold: owner.inventory.gold });
    socket?.emit('statsUpdate', { gold: owner.inventory.gold, dtn: owner.inventory.dtn, hp: owner.hp, mp: owner.mp });
    if (taskChanged) socket?.emit('nroTaskUpdate', owner.mainTask);
    if (socket) void persistPlayer(socket, owner);
    return true;
}

function serializeItem(item) {
    return {
        id: item.id,
        type: item.type,
        satellite: Boolean(item.satellite),
        expiresAt: item.expiresAt,
        templateId: item.templateId,
        name: item.name,
        iconId: item.iconId,
        quantity: item.quantity,
        value: item.value,
        x: item.x,
        y: item.y,
        mapId: item.mapId,
        zoneId: item.zoneId
    };
}

function levelUpCharacter(player) {
    if (gameConfig.gameMode === 'nro') {
        Object.assign(player.inventory, getNroProgress(player.inventory.power));
        recalculateNroEquipmentStats(player);
        return;
    }
    while (player.inventory.exp >= player.inventory.maxExp) {
        player.inventory.exp -= player.inventory.maxExp;
        player.inventory.level += 1;
        player.inventory.maxExp = player.inventory.level * gameConfig.progression.expPerLevel;
        player.maxHp += 20;
        player.maxMp += 10;
        if (player.baseStats) {
            player.baseStats.maxHp += 20;
            player.baseStats.maxMp += 10;
        }
        player.hp = player.maxHp;
        player.mp = player.maxMp;
    }
    recalculateNroEquipmentStats(player);
}

function recalculateNroEquipmentStats(player) {
    const base = player.baseStats || { str: player.str || 0, armor: player.armor || 0, maxHp: player.maxHp || 1, maxMp: player.maxMp || 1 };
    const totals = getNroEquipmentBonuses(player.equipment);
    player.str = getNroEquipmentAttack(base.str, player.equipment);
    player.atk = player.str;
    player.armor = Math.max(0, Math.round((base.armor + totals.armor) * (1 + totals.armorPercent / 100)));
    player.nroDamageReductionPercent = totals.damageReductionPercent;
    player.crit = Math.max(0, Number(base.crit ?? player.nroStats?.critical ?? 0) + totals.crit);
    player.critDamageBonusPercent = totals.critDamagePercent;
    player.nroMonsterDamageBonusPercent = totals.monsterDamagePercent;
    player.nroMonsterDamagePercentSteps = totals.monsterDamagePercentSteps;
    player.nroGoldDropPercent = totals.goldDropPercent;
    player.nroProjectileArmorPenetrationPercent = totals.projectileArmorPenetrationPercent;
    player.nroMeleeArmorPenetrationPercent = totals.meleeArmorPenetrationPercent;
    player.nroMeleeCounterDamage = totals.meleeCounterDamage;
    player.nroHpDrainPercent = totals.hpDrainPercent;
    player.nroHpDrainFromMonsterPercent = totals.hpDrainFromMonsterPercent;
    player.nroProjectileDamageToMpPercent = totals.projectileDamageToMpPercent;
    player.nroDodgePercent = totals.dodgePercent;
    const auraDrainChanged = player.nroSiphonAroundPercent !== totals.siphonAroundPercent;
    player.nroSiphonAroundPercent = totals.siphonAroundPercent;
    if (auraDrainChanged || !Number.isFinite(Number(player.nroSiphonAroundAt))) {
        player.nroSiphonAroundAt = Date.now() + 5_000;
    }
    player.nroMpDrainPercent = totals.mpDrainPercent;
    player.nroReflectDamagePercent = totals.reflectDamagePercent;
    const now = Date.now();
    const hpBonusPercent = Math.max(0, ...(player.effects || [])
        .filter((effect) => effect.type === 'max_hp_boost' && effect.expiresAt > now)
        .map((effect) => Number(effect.statBonusPercent) || 0));
    const mpBonusPercent = Math.max(0, ...(player.effects || [])
        .filter((effect) => effect.type === 'max_mp_boost' && effect.expiresAt > now)
        .map((effect) => Number(effect.statBonusPercent) || 0));
    player.maxHp = Math.max(1, Math.round((base.maxHp + totals.hp) * (1 + (hpBonusPercent + totals.hpPercent) / 100)));
    player.maxMp = Math.max(1, Math.round((base.maxMp + totals.mp) * (1 + (mpBonusPercent + totals.mpPercent) / 100)));
    player.nroTnsmBonuses = getNroTnsmBonuses(player.equipment);
    player.nroMoveSpeedPercent = totals.moveSpeedPercent;
    const recoveryChanged = player.nroHpRecoveryPerInterval !== totals.hpRecoveryPerInterval
        || player.nroMpRecoveryPerInterval !== totals.mpRecoveryPerInterval
        || player.nroHpRecoveryPercentPerInterval !== totals.hpRecoveryPercentPerInterval
        || player.nroMpRecoveryPercentPerInterval !== totals.mpRecoveryPercentPerInterval
        || player.nroHpRecoveryOption173Percent !== totals.hpRecoveryOption173Percent
        || player.nroMpRecoveryOption173Percent !== totals.mpRecoveryOption173Percent;
    player.nroHpRecoveryPerInterval = totals.hpRecoveryPerInterval;
    player.nroMpRecoveryPerInterval = totals.mpRecoveryPerInterval;
    player.nroHpRecoveryPercentPerInterval = totals.hpRecoveryPercentPerInterval;
    player.nroMpRecoveryPercentPerInterval = totals.mpRecoveryPercentPerInterval;
    player.nroHpRecoveryOption173Percent = totals.hpRecoveryOption173Percent;
    player.nroMpRecoveryOption173Percent = totals.mpRecoveryOption173Percent;
    const kiRecovery10sChanged = player.nroMpRecoveryPercentPer10Seconds !== totals.mpRecoveryPercentPer10Seconds;
    player.nroMpRecoveryPercentPer10Seconds = totals.mpRecoveryPercentPer10Seconds;
    if (kiRecovery10sChanged || !Number.isFinite(Number(player.nroEquipmentKiRegen10sAt))) {
        player.nroEquipmentKiRegen10sAt = now + 10_000;
    }
    if (recoveryChanged || !Number.isFinite(Number(player.nroEquipmentRegenAt))) {
        player.nroEquipmentRegenAt = Date.now() + 30_000;
    }
    player.hp = Math.min(player.hp, player.maxHp);
    player.mp = Math.min(player.mp, player.maxMp);
}

function publicCharacter(player) {
    return {
        revision: Number(player.characterRevision) || 0,
        level: player.inventory.level,
        exp: player.inventory.exp,
        maxExp: player.inventory.maxExp,
        agi: player.agi,
        skillLevels: { ...player.skillLevels },
        hp: player.hp,
        maxHp: player.maxHp,
        mp: player.mp,
        maxMp: player.maxMp,
        str: player.str,
        armor: player.armor,
        nroStats: player.nroStats,
        limitPower: player.limitPower,
        gold: player.inventory.gold,
        dtn: player.inventory.dtn,
        power: player.inventory.power,
        position: { ...(player.legacyPosition || { x: 200, y: 300 }) },
        nroCharacter: {
            created: player.nroCharacterCreated,
            characterName: player.characterName || player.username,
            raceId: player.raceId || 'earth',
            mapId: player.mapId,
            zoneId: player.zoneId,
            headPartId: player.headPartId ?? 0,
            bodyPartId: player.bodyPartId ?? 1,
            legPartId: player.legPartId ?? 2,
            bag: player.bag,
            bagCapacity: player.bagCapacity,
            equipment: player.equipment,
            skillLevels: player.skillLevels,
            skillLayoutVersion: player.skillLayoutVersion || 1,
            baseStats: player.baseStats,
            nroStats: player.nroStats,
            limitPower: player.limitPower,
            openPowerExpiresAt: player.openPowerExpiresAt || 0,
            mainTask: player.mainTask,
            effects: (player.effects || []).filter((effect) =>
                ['damage_boost', 'damage_reduction', 'max_hp_boost', 'max_mp_boost', 'nro_charm_tri_tue', 'nro_charm_tri_tue_x3', 'nro_charm_tri_tue_x4', 'nro_charm_manh_me', 'nro_charm_da_trau', 'nro_charm_bat_tu', 'nro_charm_deo_dai', 'nro_charm_thu_hut'].includes(effect.type)
                && effect.expiresAt > Date.now()
            ),
            stamina: player.stamina,
            maxStamina: player.maxStamina,
            staminaAttackCount: player.staminaAttackCount,
            staminaRecoveredAt: player.staminaRecoveredAt,
            shopRequestIds: [...player.shopRequestIds],
            mayDoExpiresAt: player.mayDoExpiresAt || 0,
            cFlag: player.cFlag || 0,
            blueGems: Math.max(0, Number(player.blueGems) || 0),
            position: { x: player.x, y: player.y }
        },
        questProgress: player.quests.quest_01.progress,
        questCompleted: player.quests.quest_01.status === 'completed',
    };
}

function serializePlayer(player) {
    return {
        id: player.id,
        username: player.characterName || player.username,
        x: player.x,
        y: player.y,
        velocityX: player.velocityX || 0,
        velocityY: player.velocityY || 0,
        grounded: Boolean(player.grounded),
        isFlying: Boolean(player.isFlying),
        animationState: getNroAnimationState(player),
        facing: player.facing || 1,
        raceId: player.raceId || 'earth',
        mapId: player.mapId,
        zoneId: player.zoneId,
        nroCharacterCreated: Boolean(player.nroCharacterCreated),
        headPartId: player.headPartId ?? 0,
        bodyPartId: player.bodyPartId ?? 1,
        legPartId: player.legPartId ?? 2,
        width: player.width,
        height: player.height,
        hp: player.hp,
        maxHp: player.maxHp,
        mp: player.mp,
        maxMp: player.maxMp,
        level: player.level,
        str: player.str,
        armor: player.armor,
        crit: player.crit || 0,
        damageReductionPercent: Number(player.nroDamageReductionPercent) || 0,
        reflectDamagePercent: Number(player.nroReflectDamagePercent) || 0,
        nroStats: player.nroStats,
        limitPower: player.limitPower,
        openPowerExpiresAt: player.openPowerExpiresAt || 0,
        equipment: player.equipment,
        isAuto: player.isAuto,
        effects: (player.effects || []).filter((effect) => effect.expiresAt > Date.now())
            .map((effect) => ({ type: effect.type, name: effect.name, remainingMs: effect.expiresAt - Date.now() })),
        cFlag: player.cFlag || 0,
        companion: player.companion?.expiresAt > Date.now() ? {
            ...player.companion, remainingMs: player.companion.expiresAt - Date.now(), expiresAt: undefined
        } : null,
        inventory: { ...player.inventory }
    };
}

function serializeMonster(monster) {
    return {
        id: monster.id,
        templateId: monster.templateId,
        level: monster.level,
        name: monster.name,
        type: monster.type,
        bossPartIds: monster.bossPartIds,
        questEncounter: monster.questEncounter,
        x: monster.x,
        y: monster.y,
        width: monster.width,
        height: monster.height,
        atk: Math.max(Number(monster.atk) || 0, Math.floor((Number(monster.maxHp) || 0) * (Number(monster.pDame) || 0) / 100)),
        def: Number(monster.def) || 0,
        facing: monster.facing || 1,
        targetId: monster.focusedTargetId || null,
        velocityX: Number(monster.velocityX) || 0,
        velocityY: Number(monster.velocityY) || 0,
        attackSequence: monster.attackSequence || 0,
        hp: monster.hp,
        maxHp: monster.maxHp,
        state: monster.state,
        isDead: monster.isDead,
        mapId: monster.mapId,
        zoneId: monster.zoneId,
        effects: (monster.effects || []).filter((effect) => effect.expiresAt > Date.now())
            .map((effect) => ({ type: effect.type, remainingMs: effect.expiresAt - Date.now() }))
    };
}

async function persistPlayer(socket, player) {
    if (!socket || !player) return;
    if (player.isPersisting) {
        // Coalesce updates that arrive during a DB write and run one more write
        // with the newest state instead of silently losing combat/pickup changes.
        player.persistRequested = true;
        return;
    }
    player.isPersisting = true;
    try {
        do {
            player.persistRequested = false;
            const saved = await userRepository.updateCharacter(player.userId, publicCharacter(player));
            player.characterRevision = saved.revision;
            player.lastPersistAt = Date.now();
        } while (player.persistRequested);
    } catch (error) {
        const code = typeof error.code === 'string' || typeof error.code === 'number'
            ? ` (${error.code})`
            : '';
        console.error(`[Character] Failed to persist character for user ${player.userId}${code}.`);
        socket.emit('persistenceError', {
            message: 'Không thể lưu tiến trình nhân vật. Hãy kiểm tra kết nối và thử lại.'
        });
        if (error.code === 'CHARACTER_REVISION_CONFLICT') {
            socket.emit('authenticationExpired');
            socket.disconnect(true);
        }
    } finally {
        player.isPersisting = false;
    }
}

module.exports = setupGameSocket;
