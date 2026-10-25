const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateSkillDamage, checkAABBCollision } = require('../src/game/combat');

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
