const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createNroMovementState, getNroAnimationState, getNroMovementInput, getNroTileCollisionMasks, isNroMovementBlocked, stepNroMovement } = require('../src/game/nroMovement');
const map0 = require('../../shared/nro/maps/map-0.json');
const nroMaps = require('../../shared/nro/maps/catalog.json');
const tileSets = require('../../shared/nro/maps/tile-sets.json');
const config = require('../src/config/gameConfig.json');

const tileSize = config.nroWorld.tileSize;
const { topTileValues, wallTileValues, solidTileValues } = getNroTileCollisionMasks(
    tileSets.find((set) => set.setId === map0.tileId), map0.id
);
const world = {
    map: map0.map,
    tileSize,
    topTileValues,
    wallTileValues,
    solidTileValues,
    runSpeedPxPerSecond: config.nroWorld.runSpeedPxPerSecond,
    flightSpeedPxPerSecond: config.nroWorld.flightSpeedPxPerSecond,
    flightKiPerSecond: config.nroWorld.flightKiPerSecond,
    flightActivationHoldMs: config.nroWorld.flightActivationHoldMs,
    flightHoverDurationMs: config.nroWorld.flightHoverDurationMs,
    gravityPxPerSecondSquared: config.nroWorld.gravityPxPerSecondSquared,
    jumpVelocityPxPerSecond: config.nroWorld.jumpVelocityPxPerSecond,
    maxFallSpeedPxPerSecond: config.nroWorld.maxFallSpeedPxPerSecond,
    spawn: config.nroWorld.spawn
};

describe('NRO server-authoritative platform movement', () => {
    it('blocks movement only while a stun or root status is active', () => {
        assert.equal(isNroMovementBlocked([{ type: 'stun', expiresAt: 1_500 }], 1_000), true);
        assert.equal(isNroMovementBlocked([{ type: 'root', expiresAt: 1_500 }], 1_000), true);
        assert.equal(isNroMovementBlocked([{ type: 'stun', expiresAt: 1_000 }], 1_000), false);
        assert.equal(isNroMovementBlocked([{ type: 'slow', expiresAt: 1_500 }], 1_000), false);
        assert.equal(isNroMovementBlocked(null, 1_000), false);
    });

    it('suppresses control input under stun but continues server gravity and landing', () => {
        const player = createNroMovementState({ x: 60, y: 17 * tileSize });
        const effects = [{ type: 'stun', expiresAt: 1_500 }];
        const blockedInput = getNroMovementInput({ right: true, jump: true }, effects, 1_000);

        assert.deepEqual(blockedInput, {});
        stepNroMovement(player, blockedInput, 50, world);
        assert.equal(player.x, 60);
        assert.ok(player.y > 17 * tileSize);
        for (let tick = 0; tick < 20 && !player.grounded; tick++) stepNroMovement(player, blockedInput, 50, world);
        assert.equal(player.grounded, true);
        assert.equal(player.y, 18 * tileSize);

        const afterExpiry = getNroMovementInput({ right: true }, effects, 1_500);
        assert.deepEqual(afterExpiry, { right: true });
    });

    it('builds source floor and wall masks for every enabled map tile set', () => {
        for (const mapId of config.nroWorld.playableMapIds) {
            const mapEntry = nroMaps.find((entry) => entry.id === mapId);
            const tileSet = tileSets.find((entry) => entry.setId === mapEntry?.tileId);
            const { topTileValues: floors, wallTileValues: walls } = getNroTileCollisionMasks(tileSet, mapId);
            const { solidTileValues } = getNroTileCollisionMasks(tileSet, mapId);
            const usedTileValues = new Set(mapEntry.map.tiles.flat());

            assert.ok(floors.size > 0, `map ${mapId} has source floor tiles`);
            assert.ok([...walls].some((tileId) => usedTileValues.has(tileId)), `map ${mapId} uses source wall tiles`);
            assert.deepEqual(
                [...walls].sort((a, b) => a - b),
                tileSet.tileTypes.filter((entry) => entry.type === 4 || entry.type === 8)
                    .flatMap((entry) => entry.tiles).filter((value, index, values) => values.indexOf(value) === index).sort((a, b) => a - b),
                `map ${mapId} uses its own tile set wall flags`
            );
            assert.ok([...floors, ...walls]
                .filter((tileId) => mapId !== 0 || tileId !== 39)
                .every((tileId) => solidTileValues.has(tileId)));
            if (mapId === 0) assert.equal(solidTileValues.has(39), false, 'map 0 water/shore tile 39 stays non-colliding');
        }
    });

    it('blocks against real wall-edge cells across maps with exposed side edges', () => {
        let checkedMaps = 0;
        for (const mapId of config.nroWorld.playableMapIds) {
            const mapEntry = nroMaps.find((entry) => entry.id === mapId);
            const tileSet = tileSets.find((entry) => entry.setId === mapEntry?.tileId);
            const { topTileValues, wallTileValues } = getNroTileCollisionMasks(tileSet, mapId);
            let edge;
            for (let row = 2; row < mapEntry.map.height - 4 && !edge; row++) {
                for (let column = 2; column < mapEntry.map.width - 1; column++) {
                    if (wallTileValues.has(mapEntry.map.tiles[row]?.[column])
                        && !wallTileValues.has(mapEntry.map.tiles[row]?.[column - 1])) {
                        edge = { row, column };
                        break;
                    }
                }
            }
            if (!edge) continue;

            const startX = edge.column * tileSize - tileSize / 2;
            const y = edge.row * tileSize + 20;
            const wallWorld = {
                ...world,
                map: mapEntry.map,
                topTileValues,
                wallTileValues,
                solidTileValues: new Set([...topTileValues, ...wallTileValues]),
                gravityPxPerSecondSquared: 0,
                maxFallSpeedPxPerSecond: 0,
                spawn: { x: startX, y }
            };
            const player = createNroMovementState({ x: startX, y });
            for (let tick = 0; tick < 30; tick++) stepNroMovement(player, { right: true }, 50, wallWorld);

            assert.equal(player.x, startX, `map ${mapId} stops at the source wall edge`);
            assert.equal(player.y, y, `map ${mapId} preserves the vertical position`);
            checkedMaps++;
        }
        assert.ok(checkedMaps >= 20, `expected broad source wall coverage, got ${checkedMaps} maps`);
    });

    it('falls from the authored Aru spawn and lands on its first source collision surface', () => {
        const player = createNroMovementState(world.spawn);
        for (let tick = 0; tick < 20 && !player.grounded; tick++) stepNroMovement(player, {}, 50, world);

        assert.equal(player.grounded, true);
        assert.equal(player.y, 18 * tileSize);
        assert.equal(player.velocityY, 0);
    });

    it('keeps a grounded player on the surface and starts a single jump on the rising edge', () => {
        const player = createNroMovementState({ x: 60, y: 18 * tileSize });
        player.grounded = true;

        stepNroMovement(player, { up: true }, 50, world);
        const firstJumpY = player.y;
        stepNroMovement(player, { up: true }, 50, world);

        assert.ok(firstJumpY < 18 * tileSize);
        assert.ok(player.y < firstJumpY);
        assert.ok(player.velocityY < 0);
    });

    it('lands after a jump without sinking below the tile top', () => {
        const player = createNroMovementState({ x: 60, y: 18 * tileSize });
        player.grounded = true;
        stepNroMovement(player, { up: true }, 50, world);
        stepNroMovement(player, {}, 50, world);
        for (let tick = 0; tick < 40 && !player.grounded; tick++) stepNroMovement(player, {}, 50, world);

        assert.equal(player.grounded, true);
        assert.equal(player.y, 18 * tileSize);
        assert.equal(player.velocityY, 0);
    });

    it('keeps the player standing on a ground block when down is pressed', () => {
        const player = createNroMovementState({ x: 60, y: 18 * tileSize });
        player.grounded = true;
        stepNroMovement(player, { down: true }, 50, world);
        const standingY = player.y;
        stepNroMovement(player, { down: true }, 50, world);

        assert.equal(standingY, 18 * tileSize);
        assert.equal(player.y, standingY);
        assert.equal(player.grounded, true);
        assert.equal(player.velocityY, 0);
    });

    it('blocks the player against solid terrain from the side and from below', () => {
        const blockMap = {
            width: 12,
            height: 30,
            tiles: Array.from({ length: 30 }, () => Array(12).fill(0))
        };
        blockMap.tiles[4][2] = 99;
        blockMap.tiles[3][3] = 99;
        const blockWorld = {
            ...world,
            map: blockMap,
            topTileValues: new Set(),
            wallTileValues: new Set(),
            solidTileValues: new Set([99]),
            gravityPxPerSecondSquared: 0,
            maxFallSpeedPxPerSecond: 0
        };
        const player = createNroMovementState({ x: 60, y: 184 });
        player.width = 40;
        player.height = 40;
        player.velocityY = -430;

        stepNroMovement(player, {}, 100, blockWorld);
        assert.equal(player.y, 160, 'head stops at the bottom face of the solid tile');
        assert.equal(player.velocityY, 0);

        const sidePlayer = createNroMovementState({ x: 36, y: 88 });
        sidePlayer.width = 40;
        sidePlayer.height = 40;
        for (let tick = 0; tick < 20; tick++) stepNroMovement(sidePlayer, { right: true }, 50, blockWorld);
        assert.equal(sidePlayer.x, 52, 'horizontal movement cannot cross a solid tile');
    });

    it('stops flight at solid blocks instead of passing through them', () => {
        const blockMap = {
            width: 12,
            height: 30,
            tiles: Array.from({ length: 30 }, () => Array(12).fill(0))
        };
        blockMap.tiles[6][2] = 99;
        const blockWorld = {
            ...world,
            map: blockMap,
            topTileValues: new Set(),
            wallTileValues: new Set(),
            solidTileValues: new Set([99]),
            gravityPxPerSecondSquared: 0,
            maxFallSpeedPxPerSecond: 0
        };
        const player = createNroMovementState({ x: 60, y: 120 });
        player.width = 40;
        player.height = 40;
        player.isFlying = true;
        player.mp = 100;

        for (let tick = 0; tick < 10; tick++) stepNroMovement(player, { down: true }, 100, blockWorld);
        assert.equal(player.y, 144, 'descending flight rests against the solid block top');
        assert.equal(player.isFlying, true);
    });

    it('takes off after holding up and keeps flying while the player moves after release', () => {
        const player = createNroMovementState({ x: 60, y: 18 * tileSize });
        player.grounded = true;
        player.mp = 100;

        stepNroMovement(player, { up: true }, 50, world);
        assert.equal(player.isFlying, false, 'a quick up press starts a jump first');
        stepNroMovement(player, { up: true }, 50, world);
        assert.equal(player.isFlying, false, 'flight waits for the configured hold threshold');
        stepNroMovement(player, { up: true }, 50, world);
        assert.equal(player.isFlying, true);
        assert.equal(player.grounded, false);
        assert.ok(player.y < 18 * tileSize - 3);
        assert.equal(getNroAnimationState(player), 'flying');

        const releasedY = player.y;
        stepNroMovement(player, { right: true }, 50, world);
        assert.equal(player.isFlying, true);
        assert.equal(player.flightIdleMs, 0, 'directional movement keeps flight engaged');
        assert.ok(player.x > 60);
        assert.equal(player.y, releasedY, 'horizontal movement keeps altitude');

        const hoverY = player.y;
        for (let tick = 0; tick < 19; tick++) stepNroMovement(player, {}, 50, world);
        assert.equal(player.isFlying, true, 'holds altitude for roughly one second after input stops');
        assert.equal(player.y, hoverY);

        stepNroMovement(player, {}, 50, world);
        assert.equal(player.isFlying, false);
        assert.ok(player.y > hoverY, 'gravity starts as soon as the hover grace expires');
        assert.equal(getNroAnimationState(player), 'falling');
    });

    it('resets the hover grace when movement resumes and lands after flight expires', () => {
        const player = createNroMovementState({ x: 60, y: 18 * tileSize });
        player.grounded = true;
        player.mp = 100;
        for (let tick = 0; tick < 3; tick++) stepNroMovement(player, { up: true }, 50, world);
        assert.equal(player.isFlying, true);

        for (let tick = 0; tick < 12; tick++) stepNroMovement(player, {}, 50, world);
        assert.equal(player.isFlying, true);
        stepNroMovement(player, { left: true }, 50, world);
        assert.equal(player.isFlying, true);
        assert.equal(player.flightIdleMs, 0);

        for (let tick = 0; tick < 40 && !player.grounded; tick++) stepNroMovement(player, {}, 50, world);
        assert.equal(player.isFlying, false);
        assert.equal(player.grounded, true);
        assert.equal(player.y, 18 * tileSize);
    });

    it('distinguishes jumping/falling animation states from flight', () => {
        const player = createNroMovementState();
        player.grounded = false;
        player.velocityY = -20;
        assert.equal(getNroAnimationState(player), 'jumping');
        player.velocityY = 20;
        assert.equal(getNroAnimationState(player), 'falling');
        player.isFlying = true;
        assert.equal(getNroAnimationState(player), 'flying');
    });

    it('blocks horizontal movement at source wall tiles without changing vertical motion', () => {
        const wallMap = {
            width: 12,
            height: 10,
            tiles: Array.from({ length: 10 }, () => Array(12).fill(0))
        };
        wallMap.tiles[5][5] = 99;
        const wallWorld = {
            ...world,
            map: wallMap,
            topTileValues: new Set(),
            wallTileValues: new Set([99]),
            solidTileValues: new Set([99]),
            gravityPxPerSecondSquared: 0,
            maxFallSpeedPxPerSecond: 0
        };
        const player = createNroMovementState({ x: 60, y: 138 });

        for (let tick = 0; tick < 30; tick++) stepNroMovement(player, { right: true }, 50, wallWorld);

        assert.equal(player.x, 108);
        assert.equal(player.velocityX, 0);
        assert.equal(player.y, 138);

        stepNroMovement(player, { left: true }, 50, wallWorld);
        assert.equal(player.x, 104);
    });
});
