const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const gameConfig = require('../src/config/gameConfig.json');
const { SkillManager } = require('../src/game/SkillManager');
const { getNroSkill } = require('../src/game/nroSkills');
const prototypeConfig = { ...gameConfig, gameMode: 'prototype' };

function makePlayer(id, classId, overrides = {}) {
    return {
        id, classId, str: 40, agi: 0, x: 0, y: 0, mapId: 0, zoneId: 0, hp: 100, maxHp: 100,
        mp: 200, maxMp: 200, armor: 0, cooldowns: {}, effects: [],
        input: { left: false, right: false, up: false, down: false, axisX: 0, axisY: 0 },
        skillLevels: { s1: 1, s2: 1, s3: 1, s4: 1, s5: 1 },
        inventory: { dtn: 0 }, ...overrides
    };
}

function makeMonster(id, x, y = 0, hp = 1000) {
    return {
        id, x, y, mapId: 0, zoneId: 0, hp, maxHp: hp, armor: 0, isDead: false, effects: [],
        takeDamage(amount) {
            const damageDealt = Math.min(this.hp, amount);
            this.hp -= damageDealt;
            this.isDead = this.hp <= 0;
            return { damageDealt, isDead: this.isDead };
        }
    };
}

describe('server authoritative skill manager', () => {
    it('rejects an NRO attack at zero stamina without spending MP or starting cooldown', () => {
        const player = makePlayer('empty-stamina', null, { stamina: 0, maxStamina: 1000, mp: 200 });
        const manager = new SkillManager({
            gameConfig: { ...gameConfig, gameMode: 'nro' }, players: { [player.id]: player }, monsters: {}, now: () => 10_000
        });

        const result = manager.castSkill(player.id, 'basic');
        assert.equal(result.ok, false);
        assert.match(result.error, /thể lực đã cạn/i);
        assert.equal(player.mp, 200);
        assert.equal(player.cooldowns.basic, undefined);
    });

    it('uses Bùa Dẻo Dai to skip stamina drain across five NRO attack actions', () => {
        let now = 10_000;
        const player = makePlayer('endurance-charm', null, {
            stamina: 1, maxStamina: 1, staminaAttackCount: 4,
            effects: [{ type: 'nro_charm_deo_dai', expiresAt: 20_000 }]
        });
        const manager = new SkillManager({
            gameConfig: { ...gameConfig, gameMode: 'nro' }, players: { [player.id]: player }, monsters: {}, now: () => now
        });

        for (let index = 0; index < 5; index++) {
            const result = manager.castSkill(player.id, 'basic');
            assert.equal(result.ok, true, JSON.stringify(result));
            now += result.cooldownMs;
        }
        assert.equal(player.stamina, 1);
        assert.equal(player.staminaAttackCount, 4);
    });

    it('applies the source monkey speed value during Saiyan transformation and removes it on expiry', () => {
        let now = 1_000_000;
        const player = makePlayer('monkey-speed', null, {
            raceId: 'saiyan', hp: 90, maxHp: 100, skillLevels: { s3: 1 }
        });
        const manager = new SkillManager({
            gameConfig: { ...gameConfig, gameMode: 'nro' }, players: { [player.id]: player }, monsters: {},
            getNroSkill, now: () => now
        });

        const cast = manager.castSkill(player.id, 's3');
        assert.equal(cast.ok, true, JSON.stringify(cast));
        manager.tick(now + 1_999);
        assert.equal(player.effects.some((effect) => effect.type === 'monkey_transform'), false);

        now += 2_000;
        manager.tick(now);
        const transformation = player.effects.find((effect) => effect.type === 'monkey_transform');
        assert.equal(player.maxHp, 140);
        assert.equal(transformation.speedMultiplier, 6 / 5);

        now += transformation.expiresAt - now;
        manager.tick(now);
        assert.equal(player.maxHp, 100);
        assert.equal(player.effects.some((effect) => effect.type === 'monkey_transform'), false);
    });

    it('applies NRO gear dodge to mob and PvP hits but not to piercing or self-destruct attacks', () => {
        const previousRandom = Math.random;
        Math.random = () => 0;
        try {
            const player = makePlayer('dodge-target', null, {
                raceId: 'earth', nroDodgePercent: 100, cFlag: 2, hp: 100, maxHp: 100
            });
            const mob = makeMonster('dodge-mob', 0, 0, 1000);
            Object.assign(mob, { pDame: 5, baseDamage: 100, lastAttackTime: 0 });
            const attacker = makePlayer('dodge-attacker', null, { raceId: 'earth', cFlag: 1, x: 20, facing: -1 });
            const manager = new SkillManager({
                gameConfig: { ...gameConfig, gameMode: 'nro' },
                players: { [player.id]: player, [attacker.id]: attacker },
                monsters: { [mob.id]: mob }, getNroSkill, now: () => 10_000
            });

            const mobHit = manager.applyMonsterAttack(mob, player, 10_000);
            assert.equal(mobHit[0].dodged, true);
            assert.equal(mobHit[0].damage, 0);
            assert.equal(player.hp, 100);

            const pvpHit = manager.castSkill(attacker.id, 'basic', player.id);
            assert.equal(pvpHit.ok, true, JSON.stringify(pvpHit));
            assert.equal(pvpHit.damageTaken[0].dodged, true);
            assert.equal(player.hp, 100);

            const piercingHit = manager._damageTarget(attacker, player, {
                ...gameConfig.basicAttack, piercing: true
            }, {});
            assert.equal(piercingHit.dodged, undefined);
            assert.ok(piercingHit.damage > 0);

            const selfDestructHit = manager._damageTarget(attacker, player, {
                id: 'boom', type: 'aoe_burst', damageFormula: 'self_destruct'
            }, {});
            assert.equal(selfDestructHit.dodged, undefined);
            assert.equal(selfDestructHit.damage, Math.floor(attacker.maxHp / 2));
        } finally {
            Math.random = previousRandom;
        }
    });

    it('applies source option 94 damage reduction after defense on player and mob hits', () => {
        const previousRandom = Math.random;
        Math.random = () => 0.5;
        try {
            const attacker = makePlayer('reduction-attacker', null, {
                raceId: 'earth', cFlag: 1, str: 100, skillLevels: { s1: 1 }
            });
            const player = makePlayer('reduction-target', null, {
                raceId: 'earth', cFlag: 2, hp: 1000, maxHp: 1000,
                nroDamageReductionPercent: 30
            });
            const monster = makeMonster('reduction-mob', 0, 0, 1000);
            Object.assign(monster, { pDame: 0, baseDamage: 100, lastAttackTime: 0 });
            const manager = new SkillManager({
                gameConfig: { ...gameConfig, gameMode: 'nro' },
                players: { [attacker.id]: attacker, [player.id]: player },
                monsters: { [monster.id]: monster }, getNroSkill, now: () => 10_000
            });

            const pvp = manager._damageTarget(attacker, player, {
                ...gameConfig.basicAttack, damagePercent: 100
            }, {});
            assert.equal(pvp.damage, 70);
            player.hp = 1000;
            const mobHit = manager.applyMonsterAttack(monster, player, 10_000);
            assert.equal(mobHit[0].damage, 70);
            assert.equal(player.hp, 930);
            assert.equal(manager._applyNroGearDamageReduction(100, { nroDamageReductionPercent: 90 }), 40);
        } finally {
            Math.random = previousRandom;
        }
    });

    it('converts Kamejoko, Masenko, and Antomic PvP hits into capped KI before dodge', () => {
        const previousRandom = Math.random;
        Math.random = () => 0;
        try {
            for (const raceId of ['earth', 'namek', 'saiyan']) {
                const attacker = makePlayer(`chuong-${raceId}`, null, {
                    raceId, cFlag: 1, facing: 1, x: 0, skillLevels: { s1: 1 }
                });
                const defender = makePlayer(`chuong-guard-${raceId}`, null, {
                    raceId: 'earth', cFlag: 2, x: 20, hp: 100, maxHp: 100,
                    mp: 20, maxMp: 25, nroProjectileDamageToMpPercent: 50, nroDodgePercent: 100
                });
                const manager = new SkillManager({
                    gameConfig: { ...gameConfig, gameMode: 'nro' },
                    players: { [attacker.id]: attacker, [defender.id]: defender },
                    monsters: {}, getNroSkill, now: () => 10_000
                });

                const result = manager.castSkill(attacker.id, 's1', defender.id);
                assert.equal(result.ok, true, JSON.stringify(result));
                assert.equal(result.damageTaken[0].convertedToKi, 5);
                assert.equal(result.damageTaken[0].dodged, undefined);
                assert.equal(result.damageTaken[0].damage, 0);
                assert.equal(defender.hp, 100);
                assert.equal(defender.mp, 25);
            }
        } finally {
            Math.random = previousRandom;
        }
    });

    it('sends level-resolved visual range, radius, and duration with skill results', () => {
        const player = makePlayer('mage-vfx', 'meowrie_antoinette', { skillLevels: { s1: 1, s2: 1, s3: 7, s4: 1, s5: 1 } });
        const manager = new SkillManager({
            gameConfig: prototypeConfig, players: { [player.id]: player }, monsters: {}
        });

        const result = manager.castSkill(player.id, 's3');
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.skillType, 'aoe_zone');
        assert.equal(result.effectDurationMs, 2000);
        assert.equal(result.radiusPx, 30);
        assert.equal(result.rangePx, 150);
    });

    it('keeps a quest boss exclusive to its owner and blocks damage outside its source quest', () => {
        const owner = makePlayer('tau-owner', null, { userId: 'user-owner', raceId: 'earth', mapId: 47, x: 0 });
        const visitor = makePlayer('tau-visitor', null, { userId: 'user-visitor', raceId: 'earth', mapId: 47, x: 0 });
        const boss = makeMonster('quest-tau77', 20, 0, 10_000);
        Object.assign(boss, {
            mapId: 47, zoneId: 0,
            questEncounter: 'tau_7_7', questOwnerUserId: 'user-owner', invulnerable: true,
            type: 'quest_boss', level: 1, potentialPercent: 0, baseDamage: 1_000
        });
        const manager = new SkillManager({
            gameConfig: { ...gameConfig, gameMode: 'nro' },
            players: { [owner.id]: owner, [visitor.id]: visitor },
            monsters: { [boss.id]: boss }, getNroSkill
        });

        const blockedOwnerHit = manager.castSkill(owner.id, 'basic', boss.id);
        assert.equal(blockedOwnerHit.ok, true, JSON.stringify(blockedOwnerHit));
        assert.equal(blockedOwnerHit.damageTaken[0].blocked, true);
        assert.equal(boss.hp, 10_000);
        const foreignHit = manager.castSkill(visitor.id, 'basic', boss.id);
        assert.equal(foreignHit.ok, false);
        assert.match(foreignHit.error, /chủ nhiệm vụ/);
        assert.equal(boss.hp, 10_000);
    });

    it('allows only the quest owner to damage the Karin duel boss', () => {
        const owner = makePlayer('karin-owner', null, { userId: 'user-karin-owner', raceId: 'earth', mapId: 46, x: 0 });
        const visitor = makePlayer('karin-visitor', null, { userId: 'user-karin-visitor', raceId: 'earth', mapId: 46, x: 0 });
        const boss = makeMonster('quest-karin', 20, 0, 500);
        Object.assign(boss, {
            mapId: 46, zoneId: 0, questEncounter: 'karin_duel', questOwnerUserId: owner.userId,
            invulnerable: false, type: 'quest_boss', level: 1, potentialPercent: 0, baseDamage: 50
        });
        const manager = new SkillManager({
            gameConfig: { ...gameConfig, gameMode: 'nro' },
            players: { [owner.id]: owner, [visitor.id]: visitor },
            monsters: { [boss.id]: boss }, getNroSkill
        });

        const ownerHit = manager.castSkill(owner.id, 'basic', boss.id);
        assert.equal(ownerHit.ok, true, JSON.stringify(ownerHit));
        assert.ok(ownerHit.damageTaken[0].damage > 0);
        assert.ok(boss.hp < boss.maxHp);
        const visitorHit = manager.castSkill(visitor.id, 'basic', boss.id);
        assert.equal(visitorHit.ok, false);
        assert.equal(boss.hp, boss.maxHp - ownerHit.damageTaken[0].damage);
    });

    it('casts the source NRO shield and blocks monster damage for its level duration', () => {
        let now = 1_000_000;
        const player = makePlayer('shield-user', null, {
            raceId: 'earth', mapId: 0, zoneId: 0, skillLevels: { s5: 1 }
        });
        const monster = makeMonster('shield-mob', 0, 0, 10_000);
        monster.level = 1;
        monster.pDame = 5;
        monster.lastAttackTime = 0;
        const manager = new SkillManager({
            gameConfig: { ...gameConfig, gameMode: 'nro' },
            players: { [player.id]: player },
            monsters: { [monster.id]: monster },
            getNroSkill,
            now: () => now
        });

        const cast = manager.castSkill(player.id, 's5');
        assert.equal(cast.ok, true);
        assert.equal(cast.effects[0].type, 'damage_immunity');
        assert.equal(cast.effects[0].durationMs, 15_000);
        const blocked = manager.applyMonsterAttack(monster, player, now + 1_000);
        assert.equal(blocked[0].blocked, true);
        assert.equal(blocked[0].damage, 0);
        assert.equal(player.hp, 100);

        now += 15_001;
        assert.equal(manager.applyMonsterAttack(monster, player, now)?.[0].damage > 0, true);
    });

    it('reflects fixed melee-counter damage to a monster that hits the equipped player', () => {
        const player = makePlayer('counter-tank', null, {
            raceId: 'earth', nroMeleeCounterDamage: 35
        });
        const monster = makeMonster('counter-mob', 0, 0, 500);
        Object.assign(monster, { level: 1, pDame: 5, baseDamage: 100, lastAttackTime: 0 });
        const manager = new SkillManager({
            gameConfig: { ...gameConfig, gameMode: 'nro' },
            players: { [player.id]: player }, monsters: { [monster.id]: monster },
            now: () => 10_000
        });

        const hits = manager.applyMonsterAttack(monster, player);
        assert.ok(hits[0].damage > 0);
        assert.equal(hits[1].targetId, monster.id);
        assert.equal(hits[1].damage, 35);
        assert.equal(hits[1].counter, true);
        assert.equal(monster.hp, 465);
    });

    it('applies source Solar Flare stun to a hostile player and blocks that player until expiry', () => {
        let now = 1_000_000;
        const caster = makePlayer('solar-flare-caster', null, {
            raceId: 'earth', cFlag: 1, typePk: 1, skillLevels: { s2: 1 }
        });
        const target = makePlayer('solar-flare-target', null, {
            raceId: 'earth', cFlag: 2, typePk: 1, x: 30, skillLevels: { s1: 1 }
        });
        const manager = new SkillManager({
            gameConfig: { ...gameConfig, gameMode: 'nro' },
            players: { [caster.id]: caster, [target.id]: target }, monsters: {}, getNroSkill, now: () => now
        });

        const cast = manager.castSkill(caster.id, 's2', target.id);
        assert.equal(cast.ok, true, JSON.stringify(cast));
        assert.equal(cast.damageTaken.some((hit) => hit.targetId === target.id && hit.effect === 'stun'), true);
        const stun = target.effects.find((effect) => effect.type === 'stun');
        assert.equal(stun.expiresAt, now + 3_000);

        const hpBeforeBlockedCast = caster.hp;
        const blocked = manager.castSkill(target.id, 'basic', caster.id);
        assert.equal(blocked.ok, false);
        assert.match(blocked.error, /choáng/);
        assert.equal(caster.hp, hpBeforeBlockedCast);

        now = stun.expiresAt;
        const afterExpiry = manager.castSkill(target.id, 'basic', caster.id);
        assert.equal(afterExpiry.ok, true, JSON.stringify(afterExpiry));
        manager.tick(now);
        assert.equal(target.effects.some((effect) => effect.type === 'stun'), false);
    });

    it('applies the timed armor consumable as additional incoming damage reduction', () => {
        let now = 1_000;
        const manager = new SkillManager({
            gameConfig: prototypeConfig, players: {}, monsters: {}, now: () => now
        });
        const target = {
            armor: 0,
            effects: [{ type: 'damage_reduction', damageReductionPercent: 50, expiresAt: 2_000 }]
        };

        assert.equal(manager._damageReduction(target), 0.5);
        now = 2_001;
        assert.equal(manager._damageReduction(target), 0);
    });

    it('defines five level-scaled skills for each of the four classes', () => {
        for (const classConfig of Object.values(gameConfig.classes)) {
            assert.equal(Object.keys(classConfig.skills).length, 5);
            for (const skill of Object.values(classConfig.skills)) {
                assert.equal(skill.levelScaling.cooldownMs.length, 2);
            }
        }

        const manager = new SkillManager({ gameConfig: prototypeConfig, players: {}, monsters: {} });
        const s1 = gameConfig.classes.meo_bao.skills.s1;
        assert.equal(manager.resolveSkillAtLevel(s1, 1).cooldownMs, 500);
        assert.equal(manager.resolveSkillAtLevel(s1, 4).cooldownMs, 400);
        assert.equal(manager.resolveSkillAtLevel(s1, 7).damagePercent, 130);
    });

    it('validates MP and enforces the server cooldown before applying another hit', () => {
        let now = 10_000;
        const player = makePlayer('p1', 'meo_bao');
        const monster = makeMonster('m1', 40);
        const manager = new SkillManager({
            gameConfig: prototypeConfig, players: { p1: player }, monsters: { m1: monster }, now: () => now
        });

        const firstCast = manager.castSkill('p1', 's1', 'm1');
        assert.equal(firstCast.ok, true);
        assert.equal(player.mp, 198);
        const hpAfterHit = monster.hp;
        assert.equal(manager.castSkill('p1', 's1', 'm1').ok, false);
        assert.equal(monster.hp, hpAfterHit);

        now += firstCast.cooldownMs;
        player.mp = 1;
        const noMana = manager.castSkill('p1', 's1', 'm1');
        assert.equal(noMana.ok, false);
        assert.equal(monster.hp, hpAfterHit);
    });

    it('applies NRO option 19 percent steps to PvE hits only', () => {
        const previousRandom = Math.random;
        Math.random = () => 0.99;
        try {
            const damageWithBonus = (steps) => {
                const player = makePlayer(`gear-pve-${steps.length}`, 'meo_bao', { nroMonsterDamagePercentSteps: steps });
                const mob = makeMonster(`gear-pve-mob-${steps.length}`, 40, 0, 100_000);
                const manager = new SkillManager({
                    gameConfig: prototypeConfig, players: { [player.id]: player }, monsters: { [mob.id]: mob }
                });
                const result = manager.castSkill(player.id, 's1', mob.id);
                assert.equal(result.ok, true);
                return result.damageTaken[0].damage;
            };
            const baseDamage = damageWithBonus([]);
            const sequentialDamage = damageWithBonus([10, 10]);
            assert.ok(sequentialDamage > baseDamage);
            assert.ok(sequentialDamage < Math.round(baseDamage * 1.21) + 2);
        } finally {
            Math.random = previousRandom;
        }
    });

    it('converts equipped NRO hit damage into capped HP and KI recovery', () => {
        const player = makePlayer('gear-drain', null, {
            raceId: 'earth', x: 0, y: 0, hp: 20, maxHp: 100, mp: 5, maxMp: 50,
            nroHpDrainPercent: 25, nroMpDrainPercent: 50, skillLevels: { s1: 1 }
        });
        const monster = makeMonster('gear-drain-mob', 20, 0, 1000);
        const sourceSkill = {
            id: 's1', name: 'Gear drain test', type: 'melee', maxLevel: 7,
            levelScaling: { cooldownMs: [500, 500], mpCost: [0, 0], damagePercent: [100, 100] },
            cooldownMs: 500, mpCost: 0, damagePercent: 100, rangeMeters: 5
        };
        const manager = new SkillManager({
            gameConfig: { ...gameConfig, gameMode: 'nro' },
            players: { [player.id]: player }, monsters: { [monster.id]: monster },
            getNroSkill: () => sourceSkill, now: () => 10_000
        });
        const result = manager.castSkill(player.id, 's1', monster.id);

        assert.equal(result.ok, true);
        assert.deepEqual(result.damageTaken[0].attackerRecovery, { hp: 10, mp: 20 });
        assert.equal(result.healed, 30);
        assert.deepEqual([player.hp, player.mp], [30, 25]);
    });

    it('adds NRO option 104 HP drain only against mobs, on top of shared option 95', () => {
        const manager = new SkillManager({ gameConfig: { ...gameConfig, gameMode: 'nro' } });
        const player = { hp: 20, maxHp: 100, mp: 10, maxMp: 50, nroHpDrainPercent: 25, nroHpDrainFromMonsterPercent: 50 };

        const mobRecovery = manager._applyEquipmentDrain(player, 40, true);
        assert.deepEqual(mobRecovery, { hp: 30, mp: 0 });
        assert.equal(player.hp, 50);

        player.hp = 20;
        const pvpRecovery = manager._applyEquipmentDrain(player, 40, false);
        assert.deepEqual(pvpRecovery, { hp: 10, mp: 0 });
        assert.equal(player.hp, 30);
    });

    it('rejects casts while active stun, sleep, or silence is present without spending resources', () => {
        let now = 10_000;
        for (const status of ['stun', 'sleep', 'silence']) {
            const player = makePlayer(`blocked-${status}`, 'meo_bao', {
                effects: [{ type: status, expiresAt: now + 1_000 }]
            });
            const monster = makeMonster(`target-${status}`, 40);
            const manager = new SkillManager({
                gameConfig: prototypeConfig,
                players: { [player.id]: player }, monsters: { [monster.id]: monster }, now: () => now
            });

            const blocked = manager.castSkill(player.id, 's1', monster.id);
            assert.equal(blocked.ok, false);
            assert.match(blocked.error, /không thể dùng kỹ năng/);
            assert.equal(player.mp, 200);
            assert.equal(player.cooldowns.s1, undefined);
            assert.equal(monster.hp, 1_000);

            now += 1_000;
            const afterExpiry = manager.castSkill(player.id, 's1', monster.id);
            assert.equal(afterExpiry.ok, true, JSON.stringify(afterExpiry));
            assert.equal(player.mp, 198);
            now += afterExpiry.cooldownMs;
        }
    });

    it('applies the Namek MobMe as a separate server hit only on supported owner attacks', () => {
        let now = 1_000_000;
        const owner = makePlayer('mobme-owner', null, {
            raceId: 'namek', str: 100, companion: {
                id: 'companion:mobme-owner', templateId: 8, level: 1, hp: 30, maxHp: 30,
                damagePercent: 30, expiresAt: now + 120_000
            }
        });
        const mob = makeMonster('mobme-target', 20, 0, 2_000);
        mob.level = 1;
        mob.potentialPercent = 100;
        const manager = new SkillManager({
            gameConfig: { ...gameConfig, gameMode: 'nro' },
            players: { [owner.id]: owner }, monsters: { [mob.id]: mob }, getNroSkill, now: () => now
        });

        const basic = manager.castSkill(owner.id, 'basic', mob.id);
        assert.equal(basic.ok, true, JSON.stringify(basic));
        assert.equal(basic.damageTaken.length, 2);
        assert.equal(basic.damageTaken[1].source, 'companion');
        assert.equal(basic.damageTaken[1].damage, 30);
        assert.equal(basic.damageTaken[0].hp - basic.damageTaken[1].hp, basic.damageTaken[1].damage);

        const masenko = manager.castSkill(owner.id, 's1', mob.id);
        assert.equal(masenko.ok, true, JSON.stringify(masenko));
        assert.equal(masenko.damageTaken.some((hit) => hit.source === 'companion'), true);

        const makankosappo = manager.castSkill(owner.id, 's3', mob.id);
        assert.equal(makankosappo.ok, true, JSON.stringify(makankosappo));
        assert.equal(makankosappo.damageTaken.some((hit) => hit.source === 'companion'), false);

        const finisher = makePlayer('mobme-finisher', null, {
            raceId: 'namek', str: 100, companion: { hp: 30, maxHp: 30, damagePercent: 30, expiresAt: now + 120_000 }
        });
        const lowHpMob = makeMonster('mobme-low-hp', 20, 0, 130);
        lowHpMob.level = 1;
        const finisherManager = new SkillManager({
            gameConfig: { ...gameConfig, gameMode: 'nro' },
            players: { [finisher.id]: finisher }, monsters: { [lowHpMob.id]: lowHpMob }, getNroSkill, now: () => now
        });
        const ownerLeavesMobMeThreshold = finisherManager.castSkill(finisher.id, 'basic', lowHpMob.id);
        assert.equal(ownerLeavesMobMeThreshold.ok, true, JSON.stringify(ownerLeavesMobMeThreshold));
        assert.equal(lowHpMob.hp, 30);
        assert.equal(ownerLeavesMobMeThreshold.damageTaken.length, 1);
    });

    it('applies two AoE melee hits and expires root effects from the timed tick', () => {
        let now = 20_000;
        const player = makePlayer('p1', 'meo_bao');
        const near = makeMonster('near', 15);
        const far = makeMonster('far', 25);
        const manager = new SkillManager({
            gameConfig: prototypeConfig, players: { p1: player }, monsters: { near, far }, now: () => now
        });
        const result = manager.castSkill('p1', 's3');
        assert.equal(result.ok, true);
        assert.equal(result.damageTaken.length, 2);
        assert.ok(near.hp < 1000);
        assert.equal(far.hp, 1000);

        const ranger = makePlayer('p2', 'meo_vu_tru', { x: 0, y: 0 });
        const rooted = makeMonster('rooted', 30);
        const control = new SkillManager({
            gameConfig: prototypeConfig, players: { p2: ranger }, monsters: { rooted }, now: () => now
        });
        const rootResult = control.castSkill('p2', 's2', 'rooted');
        assert.equal(rootResult.ok, true);
        assert.equal(rooted.effects[0].type, 'root');
        now += 1_100;
        control.tick(now);
        assert.equal(rooted.effects.length, 0);
    });

    it('rejects an otherwise valid target from another NRO zone', () => {
        const player = makePlayer('p1', 'meo_bao', { raceId: 'earth', mapId: 0, zoneId: 0, facing: 1 });
        const otherZoneMob = makeMonster('other-zone-mob', 40);
        otherZoneMob.zoneId = 1;
        const manager = new SkillManager({
            gameConfig,
            players: { p1: player },
            monsters: { [otherZoneMob.id]: otherZoneMob },
            getNroSkill: () => gameConfig.classes.meo_bao.skills.s1,
            now: () => 30_000
        });

        const result = manager.castSkill('p1', 's1', otherZoneMob.id);
        assert.equal(result.ok, false);
        assert.match(result.error, /không cùng khu vực/);
        assert.equal(player.mp, 200, 'invalid zone targets do not consume MP');
        assert.equal(otherZoneMob.hp, otherZoneMob.maxHp);
    });

    it('applies authoritative NRO PvP only between hostile flags and updates victim HP', () => {
        const attacker = makePlayer('p1', 'meo_bao', { raceId: 'earth', cFlag: 1, mapId: 0, zoneId: 0, x: 0 });
        const target = makePlayer('p2', 'meowrie_antoinette', {
            raceId: 'namek', cFlag: 0, mapId: 0, zoneId: 0, x: 20, nroReflectDamagePercent: 50
        });
        const emitted = [];
        const manager = new SkillManager({
            gameConfig,
            players: { p1: attacker, p2: target },
            monsters: {},
            io: { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) },
            getNroSkill: () => ({ ...gameConfig.classes.meo_bao.skills.s1, canCrit: false }),
            now: () => 40_000
        });

        const blocked = manager.castSkill('p1', 's1', 'p2');
        assert.equal(blocked.ok, false);
        assert.equal(target.hp, 100);
        assert.equal(attacker.mp, 200);

        target.cFlag = 2;
        const hit = manager.castSkill('p1', 's1', 'p2');
        assert.equal(hit.ok, true);
        assert.equal(hit.damageTaken[0].targetType, 'player');
        assert.ok(hit.damageTaken[0].damage > 0);
        assert.equal(hit.damageTaken[1].targetId, attacker.id);
        assert.equal(hit.damageTaken[1].reflected, true);
        assert.equal(attacker.hp, 100 - hit.damageTaken[1].damage);
        assert.equal(target.hp, 100 - hit.damageTaken[0].damage);
        assert.ok(emitted.some((entry) => entry.event === 'statsUpdate' && entry.room === 'p2'));
    });

    it('applies equipment armor penetration only to its matching PvP attack category', () => {
        const cast = (skillIndex, penetration = {}) => {
            const attacker = makePlayer(`pen-${skillIndex}`, 'meo_bao', {
                raceId: 'earth', cFlag: 1, str: 100, crit: 0, ...penetration
            });
            const target = makePlayer(`armor-${skillIndex}`, 'meowrie_antoinette', {
                raceId: 'namek', cFlag: 2, armor: 2_000, hp: 10_000, maxHp: 10_000, x: 20
            });
            const manager = new SkillManager({
                gameConfig: { ...gameConfig, gameMode: 'nro' },
                players: { [attacker.id]: attacker, [target.id]: target },
                monsters: {}, getNroSkill, now: () => 10_000
            });
            const result = manager.castSkill(attacker.id, skillIndex, target.id);
            assert.equal(result.ok, true, JSON.stringify(result));
            return result.damageTaken[0].damage;
        };

        const normalMelee = cast('basic');
        assert.ok(cast('basic', { nroMeleeArmorPenetrationPercent: 50 }) > normalMelee);
        const normalChowng = cast('s1');
        assert.equal(cast('s1', { nroMeleeArmorPenetrationPercent: 50 }), normalChowng);
        assert.ok(cast('s1', { nroProjectileArmorPenetrationPercent: 50 }) > normalChowng);
        assert.equal(cast('basic', { nroProjectileArmorPenetrationPercent: 50 }), normalMelee);
    });

    it('applies flat melee-counter equipment only when the PvP attacker uses a melee skill', () => {
        const cast = (skillId) => {
            const attacker = makePlayer(`counter-attacker-${skillId}`, 'meo_bao', {
                raceId: 'earth', cFlag: 1, crit: 0
            });
            const target = makePlayer(`counter-target-${skillId}`, 'meowrie_antoinette', {
                raceId: 'namek', cFlag: 2, nroMeleeCounterDamage: 35, x: 20, hp: 10_000, maxHp: 10_000
            });
            const manager = new SkillManager({
                gameConfig: { ...gameConfig, gameMode: 'nro' },
                players: { [attacker.id]: attacker, [target.id]: target },
                monsters: {}, getNroSkill, now: () => 10_000
            });
            const result = manager.castSkill(attacker.id, skillId, target.id);
            assert.equal(result.ok, true, JSON.stringify(result));
            return { result, attacker };
        };

        const melee = cast('basic');
        assert.equal(melee.result.damageTaken[1].counter, true);
        assert.equal(melee.result.damageTaken[1].damage, 35);
        assert.equal(melee.attacker.hp, 65);
        const projectile = cast('s1');
        assert.equal(projectile.result.damageTaken.some((hit) => hit.counter), false);
        assert.equal(projectile.attacker.hp, 100);
    });
});
