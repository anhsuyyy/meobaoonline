const test = require('node:test');
const assert = require('node:assert/strict');
const { getNroSkillBookInfo, getNroSkillSet, getNroSkill, PLANET_CLASS_ID } = require('../src/game/nroSkills');
const { SkillManager } = require('../src/game/SkillManager');
const { getNroLevel, getNroProgress, getPotentialReward, getNroMobAttackDamage } = require('../src/game/nroProgression');
const { applyNroEquipmentAuraDrain, applyNroEquipmentKiRecovery10s, applyNroEquipmentRecovery, applyNroGoldDropBonus, applySequentialAttackPercent, getBeanRecoveryAmount, getNroEquipmentAttack, getNroEquipmentBonuses, getNroTnsmBonuses, normalizeItemOptions } = require('../src/game/nroItems');
const { getNroPowerLimit, getTrainingCost, trainNroStat } = require('../src/game/nroTraining');
const nroItemTemplates = require('../../shared/nro/maps/item-templates.json');
const nroSkillTemplates = require('../../shared/nro/maps/skill-templates.json');
const gameConfig = require('../src/config/gameConfig.json');
const { canNroPlayerAttack } = require('../src/game/nroSkills');

test('NRO skill scaling preserves exact source values at all seven levels', () => {
    const manager = new SkillManager({ gameConfig, players: {}, monsters: {} });
    for (const [race, planetClassId] of Object.entries(PLANET_CLASS_ID)) {
        for (let sourceSlot = 0; sourceSlot <= 4; sourceSlot += 1) {
            const source = nroSkillTemplates.find((template) =>
                template.planetClassId === planetClassId && template.slot === sourceSlot
            );
            const skillId = `s${sourceSlot + 1}`;
            const skill = getNroSkill(race, skillId);
            assert.ok(skill, `${race}/${skillId} maps a source skill`);
            assert.equal(source.levels.length, 7, `${race}/${skillId} has seven source levels`);

            for (let level = 1; level <= 7; level += 1) {
                const sourceLevel = source.levels[level - 1];
                const resolved = manager.resolveSkillAtLevel(skill, level);
                assert.equal(resolved.cooldownMs, sourceLevel.cool_down, `${race}/${skillId} cooldown Lv${level}`);
                assert.equal(resolved.mpCost, sourceLevel.mana_use, `${race}/${skillId} MP Lv${level}`);
                if (skill.levelScaling.damagePercent) {
                    assert.equal(resolved.damagePercent, sourceLevel.damage, `${race}/${skillId} damage Lv${level}`);
                }
                if (skill.effect === 'stun') {
                    assert.equal(resolved.radiusMeters, sourceLevel.dx / 10, `${race}/${skillId} radius Lv${level}`);
                    assert.equal(resolved.stunDurationMs, sourceLevel.damage, `${race}/${skillId} stun Lv${level}`);
                }
            }
        }
    }
});

test('NRO skill unlock thresholds use sức mạnh independently from tiềm năng', () => {
    const race = 'earth';
    const locked = getNroSkillSet(race, 0);
    const skill = Object.values(locked.skills).find((entry) => entry.powerRequired > 0);

    assert.ok(skill, 'source skill catalog should include a power-gated skill');
    assert.equal(skill.unlocked, false);
    const unlocked = getNroSkillSet(race, skill.powerRequired);
    assert.equal(unlocked.skills[skill.id].unlocked, true);
    assert.equal(unlocked.levels[skill.id], 1);
});

test('NRO skill books expose the exact source power requirement for each taught level', () => {
    const levelOneBook = nroItemTemplates.find((item) => item.id === 94);
    const levelTwoBook = nroItemTemplates.find((item) => item.id === 95);
    const wrongRaceBook = nroItemTemplates.find((item) => item.id === 101);
    assert.equal(getNroSkillBookInfo('earth', levelOneBook).powerRequired, 10_000);
    assert.equal(getNroSkillBookInfo('earth', levelTwoBook).powerRequired, 20_000);
    assert.equal(getNroSkillBookInfo('earth', wrongRaceBook), null);
});

test('the five visible NRO slots start with the planet punch; fifth source skills remain book-learnable', () => {
    const earth = getNroSkillSet('earth', 10_000_000);
    const namek = getNroSkillSet('namek', 10_000_000);
    const saiyan = getNroSkillSet('saiyan', 10_000_000);
    assert.equal(earth.skills.s1.name, 'Chiêu đấm Dragon');
    assert.equal(namek.skills.s1.name, 'Chiêu đấm Demon');
    assert.equal(saiyan.skills.s1.name, 'Chiêu đấm Galick');
    assert.equal(earth.skills.s5.name, 'Quả cầu kênh khi');
    assert.equal(namek.skills.s5.name, 'Makankosappo');
    assert.equal(saiyan.skills.s5.name, 'Tự phát nổ');

    for (const [race, itemId] of [['earth', 434], ['namek', 481], ['saiyan', 434]]) {
        const book = nroItemTemplates.find((item) => item.id === itemId);
        assert.equal(getNroSkillBookInfo(race, book).skillId, 's6');
    }
    assert.equal(getNroSkillBookInfo('namek', nroItemTemplates.find((item) => item.id === 434)), null);
});

test('NRO potential reward follows damage share, level scaling, and faction bonus', () => {
    const base = { damage: 100, mobHp: 1000, maxPotential: 500, mobLevel: 10, playerLevel: 10 };
    assert.equal(getPotentialReward(base), 25);
    assert.equal(getPotentialReward({ ...base, playerLevel: 11 }), 21);
    assert.equal(getPotentialReward({ ...base, playerLevel: 9 }), 27);
    assert.equal(getPotentialReward({ ...base, cFlag: 1 }), 26);
    assert.equal(getPotentialReward({ ...base, tnsmBonuses: [10] }), 27);
    assert.equal(getPotentialReward({ ...base, tnsmBonuses: [10], cFlag: 1 }), 28);
    assert.equal(getPotentialReward({ ...base, cFlag: 1, satelliteTnsmBonus: 20 }), 31);
    assert.equal(getPotentialReward({ ...base, playerPower: 80_000_000_000 }), 1);
    assert.equal(getPotentialReward({ ...base, damage: 0 }), 0);
});

test('NRO rank and EXP progress follow caption power thresholds from SQL', () => {
    assert.equal(getNroLevel(999), 0);
    assert.equal(getNroLevel(1000), 0);
    assert.equal(getNroLevel(3000), 1);
    assert.equal(getNroLevel(40_000_000_000), 14);
    assert.deepEqual(getNroProgress(999), { level: 0, exp: 999, maxExp: 1000 });
    assert.deepEqual(getNroProgress(2500), { level: 0, exp: 1500, maxExp: 2000 });
    assert.deepEqual(getNroProgress(3000), { level: 1, exp: 0, maxExp: 12000 });
});

test('NRO stat training uses Java costs, power-limit caps, and rejects insufficient potential', () => {
    const stats = { hp: 500, mp: 200, damage: 40, defense: 5, critical: 0 };
    assert.deepEqual([0, 1, 2, 3, 4].map((type) => Number(getTrainingCost(type, 1, stats))), [1500, 1200, 4000, 1000000, 50000000]);
    const limit = getNroPowerLimit(0);
    const trained = trainNroStat({ statType: 0, points: 1, potential: 1500, stats, limit });
    assert.equal(trained.ok, true);
    assert.equal(trained.stats.hp, 520);
    assert.equal(trained.potential, 0);
    assert.equal(trainNroStat({ statType: 0, points: 1, potential: 1499, stats, limit }).ok, false);
    assert.equal(trainNroStat({ statType: 0, points: 1, potential: 1500, stats: { ...stats, hp: 215000 }, limit }).ok, false);
    assert.equal(trainNroStat({ statType: 2, points: 101, potential: 1e9, stats, limit }).ok, false);
});

test('NRO PvP follows source PK/faction-flag hostility rules', () => {
    const player = { id: 'a', hp: 100, cFlag: 1 };
    assert.equal(canNroPlayerAttack(player, { id: 'b', hp: 100, cFlag: 0 }), false);
    assert.equal(canNroPlayerAttack(player, { id: 'b', hp: 100, cFlag: 1 }), false);
    assert.equal(canNroPlayerAttack(player, { id: 'b', hp: 100, cFlag: 2 }), true);
    assert.equal(canNroPlayerAttack(player, { id: 'b', hp: 100, cFlag: 8 }), true);
    assert.equal(canNroPlayerAttack({ ...player, cFlag: 0, typePk: 3 }, { id: 'b', hp: 100 }), true);
    assert.equal(canNroPlayerAttack(player, { id: 'b', hp: 0, cFlag: 2 }), false);
});

test('NRO potential reward switches to the source fixed reward at the active power cap', () => {
    assert.equal(getPotentialReward({ damage: 100, mobHp: 1000, maxPotential: 500, playerPower: 17_999_999_999, powerLimit: 17_999_999_999 }), 10);
    assert.equal(getPotentialReward({ damage: 100, mobHp: 1000, maxPotential: 500, playerPower: 18_000_000_009, powerLimit: 17_999_999_999 }), 0);
});

test('NRO bean recovery follows source item options and bean-level values', () => {
    assert.equal(getBeanRecoveryAmount(13), 100);
    assert.equal(getBeanRecoveryAmount(60), 500);
    assert.equal(getBeanRecoveryAmount(61), 2000);
    assert.equal(getBeanRecoveryAmount(595), 256000);
    assert.equal(getBeanRecoveryAmount(61, [{ optionId: 2, param: 5 }]), 5000);
    assert.equal(getBeanRecoveryAmount(13, [{ optionId: 48, parameter: 120 }]), 120);
    assert.deepEqual(normalizeItemOptions([{ optionId: 2, param: 5 }]), [{ optionId: 2, parameter: 5 }]);
});

test('equipped gear TNSM options are read in equipment and option order', () => {
    assert.deepEqual(getNroTnsmBonuses({
        shirt: { options: [{ optionId: 101, param: 10 }, { optionId: 47, param: 5 }] },
        shoes: { options: [{ optionId: 88, parameter: 20 }, { optionId: 156, param: 30 }] },
        invalid: null
    }), [10, 20, 30]);
});

test('equipped gear contributes source crit, crit-damage and PvE damage options', () => {
    assert.deepEqual(getNroEquipmentBonuses({
        shirt: { options: [
            { optionId: 14, param: 3 }, { optionId: 5, param: 20 }, { optionId: 15, param: 25 }, { optionId: 19, param: 10 }, { optionId: 94, param: 40 },
            { optionId: 77, param: 5 }, { optionId: 147, param: 8 }, { optionId: 16, param: 10 },
            { optionId: 49, param: 3 }, { optionId: 117, param: 10 }, { optionId: 50, param: 5 },
            { optionId: 117, param: 10 }, { optionId: 156, param: 1 },
            { optionId: 27, param: 3 }, { optionId: 80, param: 5 }, { optionId: 95, param: 20 }, { optionId: 104, param: 15 }, { optionId: 100, param: 25 },
            { optionId: 98, param: 30 }, { optionId: 99, param: 40 }, { optionId: 8, param: 2 }, { optionId: 108, param: 12 }, { optionId: 3, param: 50 }, { optionId: 173, param: 3 }
        ] },
        gloves: { options: [
            { optionId: 14, parameter: 2 }, { optionId: 19, parameter: 5 }, { optionId: 103, parameter: 7 },
            { optionId: 114, parameter: 5 }, { optionId: 148, parameter: 15 }, { optionId: 94, parameter: 35 },
            { optionId: 28, parameter: 4 }, { optionId: 81, parameter: 2 }, { optionId: 96, parameter: 10 }, { optionId: 97, parameter: 30 }, { optionId: 178, parameter: 10 }
        ] }
    }), {
        attack: 0,
        attackPercent: 16,
        attackPercentSteps: [8, 3, 5],
        attackReductionPercent: 50,
        beautifulAttackPercentSteps: [10, 10],
        armor: 0,
        armorPercent: 0,
        damageReductionPercent: 60,
        hp: 0,
        hpPercent: 5,
        hpRecoveryPerInterval: 3,
        hpRecoveryPercentPerInterval: 5,
        hpRecoveryOption173Percent: 3,
        mp: 0,
        mpPercent: 7,
        mpRecoveryPerInterval: 4,
        mpRecoveryPercentPerInterval: 2,
        mpRecoveryOption173Percent: 3,
        mpRecoveryPercentPer10Seconds: 10,
        moveSpeedPercent: 30,
        crit: 5,
        meleeCounterDamage: 25,
        critDamagePercent: 20,
        monsterDamagePercent: 15,
        monsterDamagePercentSteps: [10, 5],
        goldDropPercent: 25,
        projectileArmorPenetrationPercent: 30,
        meleeArmorPenetrationPercent: 40,
        hpDrainPercent: 20,
        hpDrainFromMonsterPercent: 15,
        siphonAroundPercent: 2,
        dodgePercent: 12,
        projectileDamageToMpPercent: 50,
        mpDrainPercent: 10,
        reflectDamagePercent: 30
    });
});

test('NRO option 117 applies each source damage bonus sequentially with integer rounding', () => {
    assert.equal(applySequentialAttackPercent(101, [10, 10]), 122);
    assert.equal(applySequentialAttackPercent(100, [10, 10]), 121);
    assert.equal(applySequentialAttackPercent(100, [10, Number.NaN, 0]), 110);
    assert.equal(applySequentialAttackPercent(101, [10], [10], 50), 61);
    assert.equal(getNroEquipmentAttack(101, {
        gloves: { options: [
            { optionId: 49, parameter: 3 }, { optionId: 117, parameter: 10 },
            { optionId: 50, parameter: 5 }, { optionId: 117, parameter: 10 },
            { optionId: 156, parameter: 1 }
        ] }
    }), 65);
});

test('NRO option 8 drains nearby mobs non-lethally every five seconds and heals its owner', () => {
    const player = {
        id: 'owner', mapId: 1, zoneId: 2, x: 100, y: 100,
        hp: 95, maxHp: 100, nroSiphonAroundPercent: 5
    };
    const monsters = {
        nearA: { hp: 500, maxHp: 1000, mapId: 1, zoneId: 2, x: 100, y: 100 },
        nearB: { hp: 30, maxHp: 500, mapId: 1, zoneId: 2, x: 300, y: 100 },
        atOneHp: { hp: 1, maxHp: 1000, mapId: 1, zoneId: 2, x: 100, y: 100 },
        outside: { hp: 500, maxHp: 1000, mapId: 1, zoneId: 2, x: 301, y: 100 },
        otherZone: { hp: 500, maxHp: 1000, mapId: 1, zoneId: 3, x: 100, y: 100 },
        questBoss: { hp: 500, maxHp: 1000, mapId: 1, zoneId: 2, x: 100, y: 100, questEncounter: 'tau_7_7' },
        protected: { hp: 500, maxHp: 1000, mapId: 1, zoneId: 2, x: 100, y: 100, invulnerable: true },
        dead: { hp: 0, maxHp: 1000, isDead: true, mapId: 1, zoneId: 2, x: 100, y: 100 }
    };

    assert.equal(applyNroEquipmentAuraDrain(player, monsters, 0), null);
    assert.equal(applyNroEquipmentAuraDrain(player, monsters, 4_999), null);
    const result = applyNroEquipmentAuraDrain(player, monsters, 5_000);
    assert.deepEqual(result, { drainedHp: 75, healedHp: 5, hitCount: 2 });
    assert.equal(player.hp, 100);
    assert.equal(monsters.nearA.hp, 450);
    assert.equal(monsters.nearB.hp, 5);
    assert.equal(monsters.atOneHp.hp, 1);
    assert.equal(monsters.outside.hp, 500);
    assert.equal(monsters.otherZone.hp, 500);
    assert.equal(monsters.questBoss.hp, 500);
    assert.equal(monsters.protected.hp, 500);
    assert.equal(monsters.dead.hp, 0);
    assert.equal(applyNroEquipmentAuraDrain(player, monsters, 9_999), null);
    assert.equal(applyNroEquipmentAuraDrain(player, monsters, 10_000).hitCount, 2);
});

test('NRO gold drop equipment bonus scales dropped gold amounts and sanitizes invalid values', () => {
    assert.equal(applyNroGoldDropBonus(1_000, 25), 1_250);
    assert.equal(applyNroGoldDropBonus(1_001, 10), 1_101);
    assert.equal(applyNroGoldDropBonus(1_000, -50), 1_000);
    assert.equal(applyNroGoldDropBonus(1_000, Infinity), 1_000);
    assert.equal(applyNroGoldDropBonus(-10, 100), 0);
});

test('equipped gear HP/KI recovery preserves source percentage groups and respects stat caps', () => {
    const player = {
        hp: 800, maxHp: 1000, mp: 300, maxMp: 500,
        nroHpRecoveryPerInterval: 20, nroMpRecoveryPerInterval: 5,
        nroHpRecoveryPercentPerInterval: 5, nroMpRecoveryPercentPerInterval: 2,
        nroHpRecoveryOption173Percent: 3, nroMpRecoveryOption173Percent: 3
    };
    assert.equal(applyNroEquipmentRecovery(player, 1000), false);
    assert.equal(player.nroEquipmentRegenAt, 31_000);
    assert.equal(applyNroEquipmentRecovery(player, 30_999), false);
    assert.equal(applyNroEquipmentRecovery(player, 31_000), true);
    assert.deepEqual([player.hp, player.mp], [910, 335]);
    player.hp = 990;
    player.mp = 499;
    assert.equal(applyNroEquipmentRecovery(player, 61_000), true);
    assert.deepEqual([player.hp, player.mp], [1000, 500]);
    assert.equal(applyNroEquipmentRecovery(player, 61_000), false);
});

test('NRO passive recovery restores the source base 1 percent every 30 seconds without gear', () => {
    const player = { hp: 50, maxHp: 1000, mp: 20, maxMp: 500 };
    assert.equal(applyNroEquipmentRecovery(player, 10_000), false);
    assert.equal(player.nroEquipmentRegenAt, 40_000);
    assert.equal(applyNroEquipmentRecovery(player, 39_999), false);
    assert.equal(applyNroEquipmentRecovery(player, 40_000), true);
    assert.deepEqual([player.hp, player.mp], [60, 25]);
});

test('NRO passive recovery advances its timer but does not heal a dead player', () => {
    const player = { hp: 0, maxHp: 1000, mp: 0, maxMp: 500, nroEquipmentRegenAt: 10_000 };
    assert.equal(applyNroEquipmentRecovery(player, 10_000), false);
    assert.deepEqual([player.hp, player.mp, player.nroEquipmentRegenAt], [0, 0, 40_000]);
});

test('NRO option 178 restores the configured percent of max KI every 10 seconds', () => {
    const totals = getNroEquipmentBonuses({ rada: { options: [{ optionId: 178, parameter: 10 }] } });
    assert.equal(totals.mpRecoveryPercentPer10Seconds, 10);

    const player = { mp: 200, maxMp: 500, nroMpRecoveryPercentPer10Seconds: totals.mpRecoveryPercentPer10Seconds };
    assert.equal(applyNroEquipmentKiRecovery10s(player, 1_000), false);
    assert.equal(player.nroEquipmentKiRegen10sAt, 11_000);
    assert.equal(applyNroEquipmentKiRecovery10s(player, 10_999), false);
    assert.equal(applyNroEquipmentKiRecovery10s(player, 11_000), true);
    assert.equal(player.mp, 250);
    assert.equal(player.nroEquipmentKiRegen10sAt, 21_000);
    player.mp = 495;
    assert.equal(applyNroEquipmentKiRecovery10s(player, 21_000), true);
    assert.equal(player.mp, 500);
    assert.equal(applyNroEquipmentKiRecovery10s(player, 31_000), false);
    player.nroMpRecoveryPercentPer10Seconds = 0;
    assert.equal(applyNroEquipmentKiRecovery10s(player, 41_000), false);
});

test('NRO mob damage rolls pDame and level variance inclusively like MobPoint', () => {
    const ranges = [];
    const roll = getNroMobAttackDamage({
        maxHp: 1000,
        level: 10,
        pDame: 5,
        randomInt: (min, max) => { ranges.push([min, max]); return max; }
    });
    assert.deepEqual(ranges, [[4, 6], [-100, 100]]);
    assert.equal(roll, 160);
    assert.equal(getNroMobAttackDamage({ baseDamage: 900000, randomInt: (min) => min }), 891000);
});
