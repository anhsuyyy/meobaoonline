const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const gameConfig = require('../src/config/gameConfig.json');
const { assertValidGameConfig, validateGameConfig } = require('../src/config/validateGameConfig');

describe('game configuration validation', () => {
    it('chấp nhận cấu hình gameplay hiện tại', () => {
        assert.equal(assertValidGameConfig(gameConfig), gameConfig);
    });

    it('báo rõ đường dẫn khi có giá trị âm và ID quái trùng', () => {
        const invalid = structuredClone(gameConfig);
        invalid.classes.meo_bao.skills.s1.mpCost = -1;
        invalid.monsters.chuot_nhat_2.id = invalid.monsters.chuot_nhat_1.id;

        const errors = validateGameConfig(invalid);
        assert.ok(errors.some((error) => error.includes('classes.meo_bao.skills.s1.mpCost')));
        assert.ok(errors.some((error) => error.includes('monsters.chuot_nhat_2.id bị trùng')));
    });

    it('từ chối sát thương min lớn hơn max', () => {
        const invalid = structuredClone(gameConfig);
        invalid.classes.meo_bao.skills.s1.damageMultiplierMin = 5;
        assert.throws(() => assertValidGameConfig(invalid), /damageMultiplierMin không được lớn hơn/);
    });
});
