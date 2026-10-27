const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const gameConfig = require('../src/config/gameConfig.json');
const { assertValidGameConfig, validateGameConfig } = require('../src/config/validateGameConfig');
const nroMaps = require('../../shared/nro/maps/catalog.json');
const nroTileSets = require('../../shared/nro/maps/tile-sets.json');
const clientMap0 = require('../../client/public/assets/nro/maps/map-0.json');
const sharedMap0 = require('../../shared/nro/maps/map-0.json');
const clientRuntimeAssetManifest = require('../../artwork-source/nro-source-assets/.runtime-assets-manifest.json');
const clientRuntimeAssets = require('../../client/public/assets/nro/maps/runtime-assets.json');

describe('game configuration validation', () => {
    it('chấp nhận cấu hình gameplay hiện tại', () => {
        assert.equal(assertValidGameConfig(gameConfig), gameConfig);
    });

    it('giữ các thông số đã chốt trong cấu hình runtime với đơn vị tường minh', () => {
        assert.equal(gameConfig.world.pixelsPerMeter, 10);
        assert.equal(gameConfig.world.pickupRangeMeters * gameConfig.world.pixelsPerMeter, 60);
        assert.equal(gameConfig.basicAttack.cooldownMs, 650);
        assert.equal(gameConfig.movement.baseSpeedMetersPerSecond * gameConfig.world.pixelsPerMeter, 200);
        assert.equal(gameConfig.nroWorld.runSpeedPxPerSecond, 200);
        assert.equal(gameConfig.nroWorld.flightSpeedPxPerSecond, 200);
        assert.equal(gameConfig.nroWorld.flightHoverDurationMs, 1000);
        assert.equal(gameConfig.server.tickRateHz, 30);
        assert.equal(gameConfig.server.tickIntervalMs, 33);
        assert.equal(gameConfig.attackSpeed.minimumBasicCooldownMs, 400);
        assert.equal(gameConfig.autoFarm.leashRadiusMeters * gameConfig.world.pixelsPerMeter, 320);
    });

    it('dùng cùng dữ liệu map 0 cho server và runtime client', () => {
        assert.deepEqual(clientMap0, sharedMap0);
        assert.deepEqual(nroMaps.find((entry) => entry.id === 0), sharedMap0);
    });

    it('chỉ mở các map có map data, tile set/collision và waypoint sang những nhánh kế tiếp', () => {
        const playable = new Set(gameConfig.nroWorld.playableMapIds);
        for (const mapId of playable) {
            const map = nroMaps.find((entry) => entry.id === mapId);
            assert.ok(map?.map?.tiles?.length, `map ${mapId} có tile data`);
            const tileSet = nroTileSets.find((entry) => entry.setId === map.tileId);
            assert.ok(tileSet?.tileTypes?.length, `map ${mapId} có collision tile set`);
        }
        for (const [sourceId, destinationId] of [
            [1, 2], [7, 8], [1, 47], [2, 3], [2, 24], [8, 9], [3, 4], [3, 27], [9, 25], [14, 15]
        ]) {
            const source = nroMaps.find((entry) => entry.id === sourceId);
            assert.ok(playable.has(destinationId), `waypoint ${sourceId} → ${destinationId} được mở`);
            assert.ok(source.waypoints.some((waypoint) => Number(waypoint[7]) === destinationId));
        }
    });

    it('ships every source tile referenced by each playable map', () => {
        const playableIds = [...gameConfig.nroWorld.playableMapIds].sort((a, b) => a - b);
        assert.deepEqual([...clientRuntimeAssetManifest.playableMapIds].sort((a, b) => a - b), playableIds);

        for (const mapId of playableIds) {
            const map = nroMaps.find((entry) => entry.id === mapId);
            const tileIds = new Set(map.map.tiles.flat().filter((tileId) => Number(tileId) > 0).map(Number));
            for (const tileId of tileIds) {
                const sourceTile = path.resolve(__dirname, '../../artwork-source/nro-source-assets/normal/data/2/x2/t', `${map.tileId}$${tileId}.png`);
                assert.ok(fs.existsSync(sourceTile), `map ${mapId} tile ${map.tileId}$${tileId} has a runtime source image`);
            }
        }
    });

    it('ships a real parallax background or the configured desert fallback for every playable map', () => {
        const backgroundLayers = clientRuntimeAssets.backgroundLayersById;
        for (const mapId of gameConfig.nroWorld.playableMapIds) {
            const map = nroMaps.find((entry) => entry.id === mapId);
            const requestedLayers = backgroundLayers[String(map.bgId)] || [];
            const fallbackLayers = backgroundLayers['1'] || [];
            assert.ok(
                requestedLayers.length || fallbackLayers.length,
                `map ${mapId} background ${map.bgId} has source layers or desert fallback`
            );
        }
    });

    it('báo rõ đường dẫn khi có giá trị âm và ID quái trùng', () => {
        const invalid = structuredClone(gameConfig);
        invalid.classes.meo_bao.skills.s1.mpCost = -1;
        const [firstMonsterKey, secondMonsterKey] = Object.keys(invalid.monsters);
        invalid.monsters[secondMonsterKey].id = invalid.monsters[firstMonsterKey].id;

        const errors = validateGameConfig(invalid);
        assert.ok(errors.some((error) => error.includes('classes.meo_bao.skills.s1.mpCost')));
        assert.ok(errors.some((error) => error.includes(`monsters.${secondMonsterKey}.id bị trùng`)));
    });

    it('từ chối sát thương min lớn hơn max', () => {
        const invalid = structuredClone(gameConfig);
        invalid.classes.meo_bao.skills.s1.damageMultiplierMin = 5;
        invalid.classes.meo_bao.skills.s1.damageMultiplierMax = 1.3;
        assert.throws(() => assertValidGameConfig(invalid), /damageMultiplierMin không được lớn hơn/);
    });
});
