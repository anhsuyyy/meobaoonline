const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getBasicAttackCooldownMs } = require('../src/game/attackSpeed');

describe('AGI attack speed', () => {
    const rules = { baseCooldownMs: 650, agiReductionMsPerPoint: 2, minimumCooldownMs: 400 };

    it('uses the 650ms base cooldown when AGI is zero', () => {
        assert.equal(getBasicAttackCooldownMs(0, rules), 650);
    });

    it('reduces basic attack cooldown by 2ms per AGI, down to 400ms', () => {
        assert.equal(getBasicAttackCooldownMs(50, rules), 550);
        assert.equal(getBasicAttackCooldownMs(200, rules), 400);
        assert.equal(getBasicAttackCooldownMs(500, rules), 400);
    });

    it('treats invalid or negative AGI as zero', () => {
        assert.equal(getBasicAttackCooldownMs(-10, rules), 650);
        assert.equal(getBasicAttackCooldownMs(Number.NaN, rules), 650);
    });
});
