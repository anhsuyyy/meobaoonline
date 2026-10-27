const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateSkillDamage, applyDamagePercentSteps, checkAABBCollision } = require('../src/game/combat');

describe('Combat Engine - Server Authoritative Logic', () => {
    const defaultAttacker = { atk: 50 };
    const defaultTarget = { armor: 20 };
    const skillS1 = {
        damageMultiplierMin: 1.0,
        damageMultiplierMax: 1.3
    };

    it('tính sát thương phải luôn lớn hơn 0 và là số nguyên', () => {
        const result = calculateSkillDamage(defaultAttacker, defaultTarget, skillS1);
        assert.ok(typeof result.damage === 'number');
        assert.ok(result.damage > 0);
        assert.equal(result.damage, Math.round(result.damage));
    });

    it('giảm sát thương qua giáp tuân thủ công thức giáp GDD V2', () => {
        // Giáp 0: Không giảm
        const noArmorTarget = { armor: 0 };
        const resNoArmor = calculateSkillDamage({ atk: 100 }, noArmorTarget, { damageMultiplierMin: 1.0, damageMultiplierMax: 1.0 });

        // Giáp 2000: Giảm 50%
        const highArmorTarget = { armor: 2000 };
        const resHighArmor = calculateSkillDamage({ atk: 100 }, highArmorTarget, { damageMultiplierMin: 1.0, damageMultiplierMax: 1.0 });

        assert.ok(resHighArmor.damage < resNoArmor.damage);
    });

    it('applies equipped NRO critical-damage bonus only when the hit crits', () => {
        const attacker = { str: 1000 };
        const target = { armor: 0 };
        const normalCrit = calculateSkillDamage(attacker, target, {
            damagePercent: 100, critChancePercent: 100, canCrit: true
        });
        const equippedCrit = calculateSkillDamage(attacker, target, {
            damagePercent: 100, critChancePercent: 100, critDamageBonusPercent: 20, canCrit: true
        });
        assert.equal(normalCrit.isCrit, true);
        assert.equal(equippedCrit.isCrit, true);
        assert.ok(equippedCrit.damage > normalCrit.damage);
    });

    it('applies NRO monster damage options sequentially with integer truncation', () => {
        assert.equal(applyDamagePercentSteps(101, [10, 10]), 122);
        assert.equal(applyDamagePercentSteps(100, [10, 10]), 121);
        assert.equal(applyDamagePercentSteps(100, [10, Number.NaN, 0]), 110);
        const result = calculateSkillDamage({ str: 103 }, { armor: 0 }, {
            damagePercent: 100, damagePercentSteps: [10, 10], canCrit: false
        });
        assert.equal(result.damage, 123);
    });

    it('giảm sát thương có trần tối đa 80% kể cả khi giáp cực lớn', () => {
        const superArmorTarget = { armor: 999999 };
        const res = calculateSkillDamage({ atk: 100 }, superArmorTarget, { damageMultiplierMin: 1.0, damageMultiplierMax: 1.0 });
        // Tại trần 80%, sát thương tối thiểu còn 20% (trừ khi chí mạng)
        assert.ok(res.damage >= 15);
    });

    it('kiểm tra va chạm AABB chính xác giữa hai thực thể', () => {
        const boxA = { x: 100, y: 100, width: 40, height: 40 };
        const boxB = { x: 120, y: 110, width: 40, height: 40 }; // Chồng lấn
        const boxC = { x: 300, y: 300, width: 40, height: 40 }; // Xa nhau

        assert.equal(checkAABBCollision(boxA, boxB), true);
        assert.equal(checkAABBCollision(boxA, boxC), false);
    });
});
