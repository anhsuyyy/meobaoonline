const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const gameConfig = require('../src/config/gameConfig.json');
const { SkillManager } = require('../src/game/SkillManager');
const { activateNroCharm, getNroCharm, getNroCharmPotentialMultipliers, NRO_CHARM_DURATION_MS } = require('../src/game/nroCharms');
const { getPotentialReward } = require('../src/game/nroProgression');

describe('NRO charms', () => {
    it('activates a source charm for one hour and extends an existing active timer', () => {
        const player = { userId: 'user-1', effects: [] };
        const first = activateNroCharm(player, 214, 10_000);
        const second = activateNroCharm(player, 214, 20_000);

        assert.equal(first.expiresAt, 10_000 + NRO_CHARM_DURATION_MS);
        assert.equal(second.expiresAt, first.expiresAt + NRO_CHARM_DURATION_MS);
        assert.equal(player.effects.length, 1);
        assert.equal(player.effects[0].damageBonusPercent, 150);
        assert.equal(getNroCharm(214).type, 'nro_charm_manh_me');
        assert.equal(getNroCharm(999), null);
    });

    it('uses exact source combat values for Da Trau and Bat Tu', () => {
        const player = { effects: [] };
        activateNroCharm(player, 215, 1_000);
        activateNroCharm(player, 217, 1_000);
        assert.equal(player.effects.find((effect) => effect.type === 'nro_charm_da_trau').damageReductionPercent, 50);
        assert.ok(player.effects.some((effect) => effect.type === 'nro_charm_bat_tu'));
        assert.equal(getNroCharm(218).type, 'nro_charm_deo_dai');
    });

    it('ports source potential rewards for wisdom charms 213, 671 and 672', () => {
        const player = { effects: [] };
        for (const itemId of [213, 671, 672]) activateNroCharm(player, itemId, 1_000);
        const multipliers = getNroCharmPotentialMultipliers(player.effects, 2_000);
        const reward = getPotentialReward({ damage: 100, mobHp: 100, mobLevel: 1, playerLevel: 1,
            playerPower: 0, maxPotential: 100, charmPotentialMultipliers: multipliers });
        assert.deepEqual(multipliers, [1, 2, 3]);
        assert.equal(reward, 350);
    });

    it('applies charm damage reduction and keeps the player at one HP against lethal mob attacks', () => {
        const oldRandom = Math.random;
        Math.random = () => 0.5;
        try {
            const player = { id: 'p', hp: 80, maxHp: 100, armor: 0, effects: [
                { type: 'nro_charm_da_trau', damageReductionPercent: 50, expiresAt: 20_000 }
            ] };
            const mob = { id: 'm', hp: 100, maxHp: 100, pDame: 50, level: 1, lastAttackTime: 0 };
            const manager = new SkillManager({ gameConfig: { ...gameConfig, gameMode: 'nro' }, players: { p: player }, monsters: { m: mob } });
            const hit = manager.applyMonsterAttack(mob, player, 10_000);
            assert.equal(hit[0].damage, 25);
            assert.equal(player.hp, 55);

            player.effects = [{ type: 'nro_charm_bat_tu', expiresAt: 20_000 }];
            player.hp = 5;
            mob.lastAttackTime = 0;
            const lethalHit = manager.applyMonsterAttack(mob, player, 12_000);
            assert.equal(lethalHit[0].damage, 4);
            assert.equal(player.hp, 1);
        } finally {
            Math.random = oldRandom;
        }
    });

    it('applies the source 150 percent attack bonus to monster damage only', () => {
        const oldRandom = Math.random;
        Math.random = () => 0.5;
        try {
            const attacker = { id: 'p', str: 100, atk: 100, hp: 100, maxHp: 100, mp: 100, maxMp: 100,
                x: 0, y: 0, mapId: 0, zoneId: 0, facing: 1, effects: [{
                    type: 'nro_charm_manh_me', damageBonusPercent: 150, expiresAt: Date.now() + 60_000
                }], cooldowns: {}, inventory: { level: 1, power: 0, dtn: 0, gold: 0 } };
            const mob = { id: 'm', x: 10, y: 0, mapId: 0, zoneId: 0, hp: 100_000, maxHp: 100_000,
                armor: 0, isDead: false, effects: [], takeDamage(amount) { this.hp -= amount; return { damageDealt: amount, isDead: false }; } };
            const manager = new SkillManager({ gameConfig: { ...gameConfig, gameMode: 'nro' },
                players: { p: attacker }, monsters: { m: mob } });
            const hit = manager.castSkill('p', 'basic', 'm');
            assert.equal(hit.ok, true, JSON.stringify(hit));
            assert.equal(hit.damageTaken[0].damage, 249);
        } finally {
            Math.random = oldRandom;
        }
    });
});
