const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    consumeNroStaminaForAttack,
    initializeNroStamina,
    recoverNroStamina
} = require('../src/game/nroStamina');

describe('NRO stamina', () => {
    it('initializes new characters with the inferred 1000 stamina default and clamps persisted values', () => {
        const fresh = {};
        initializeNroStamina(fresh, 10);
        assert.equal(fresh.stamina, 1000);
        assert.equal(fresh.maxStamina, 1000);

        const restored = { stamina: 1200, maxStamina: 500, staminaAttackCount: -2 };
        initializeNroStamina(restored, 10);
        assert.equal(restored.stamina, 500);
        assert.equal(restored.staminaAttackCount, 0);
    });

    it('consumes one stamina every five attack actions', () => {
        const player = { stamina: 2, maxStamina: 2, staminaAttackCount: 0 };
        for (let index = 0; index < 4; index++) {
            assert.equal(consumeNroStaminaForAttack(player, 100).ok, true);
            assert.equal(player.stamina, 2);
        }
        const fifth = consumeNroStaminaForAttack(player, 100);
        assert.deepEqual(fifth, { ok: true, changed: true });
        assert.equal(player.stamina, 1);
        assert.equal(player.staminaAttackCount, 0);
    });

    it('lets active endurance charm prevent consumption but does not bypass zero stamina', () => {
        const player = {
            stamina: 1, maxStamina: 1, staminaAttackCount: 4,
            effects: [{ type: 'nro_charm_deo_dai', expiresAt: 200 }]
        };
        assert.deepEqual(consumeNroStaminaForAttack(player, 100), { ok: true, changed: false });
        assert.equal(player.stamina, 1);
        assert.equal(player.staminaAttackCount, 4);
        assert.deepEqual(consumeNroStaminaForAttack(player, 200), { ok: true, changed: true });
        assert.equal(player.stamina, 0);
        assert.deepEqual(consumeNroStaminaForAttack(player, 201), { ok: false, changed: false });
    });

    it('recovers exactly one stamina per elapsed minute and caps at maximum', () => {
        const player = { stamina: 0, maxStamina: 2, staminaRecoveredAt: 500 };
        assert.equal(recoverNroStamina(player, 60_499), false);
        assert.equal(recoverNroStamina(player, 60_500), true);
        assert.equal(player.stamina, 1);
        assert.equal(recoverNroStamina(player, 120_500), true);
        assert.equal(player.stamina, 2);
        assert.equal(recoverNroStamina(player, 180_500), false);
    });
});
