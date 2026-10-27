const PEA_TEMPLATE_IDS = [13, 60, 61, 62, 63, 64, 65, 352, 523, 595];
const PEA_RECOVERY_VALUES = [100, 500, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000];
const EQUIPMENT_RECOVERY_INTERVAL_MS = 30_000;
const EQUIPMENT_KI_RECOVERY_INTERVAL_MS = 10_000;
const EQUIPMENT_AURA_DRAIN_INTERVAL_MS = 5_000;
const EQUIPMENT_AURA_DRAIN_RADIUS_PX = 200;

function normalizeItemOptions(options = []) {
    return (Array.isArray(options) ? options : []).map((option) => ({
        optionId: Number(option.optionId),
        parameter: Number.isFinite(Number(option.parameter ?? option.param))
            ? Number(option.parameter ?? option.param) : 0
    })).filter((option) => Number.isInteger(option.optionId));
}

function getNroTnsmBonuses(equipment = {}) {
    return Object.values(equipment || {}).flatMap((equipped) =>
        normalizeItemOptions(equipped?.options)
            .filter((option) => [88, 101, 156].includes(option.optionId))
            .map((option) => option.parameter)
    );
}

function applySequentialAttackPercent(baseAttack, percentSteps = [], beautifulSteps = [], reductionPercent = 0) {
    let attack = Math.max(0, Math.trunc(Number(baseAttack) || 0));
    const applySteps = (steps) => {
        for (const rawPercent of Array.isArray(steps) ? steps : []) {
            const percent = Number(rawPercent);
            if (!Number.isFinite(percent)) continue;
            // NPoint.calPercent uses integer division per option, before the next
            // item is applied; grouping percentages changes rounding.
            attack = Math.max(0, attack + Math.trunc(attack * percent / 100));
        }
    };
    applySteps(percentSteps);
    applySteps(beautifulSteps);
    const reduction = Number(reductionPercent);
    if (Number.isFinite(reduction)) attack = Math.max(0, attack - Math.trunc(attack * reduction / 100));
    return attack;
}

function getNroEquipmentBonuses(equipment = {}) {
    const totals = {
        attack: 0,
        attackPercent: 0,
        attackPercentSteps: [],
        attackReductionPercent: 0,
        damageReductionPercent: 0,
        beautifulAttackPercentSteps: [],
        projectileDamageToMpPercent: 0,
        armor: 0,
        armorPercent: 0,
        hp: 0,
        hpPercent: 0,
        hpRecoveryPerInterval: 0,
        hpRecoveryPercentPerInterval: 0,
        hpRecoveryOption173Percent: 0,
        mp: 0,
        mpPercent: 0,
        mpRecoveryPerInterval: 0,
        mpRecoveryPercentPerInterval: 0,
        mpRecoveryOption173Percent: 0,
        mpRecoveryPercentPer10Seconds: 0,
        moveSpeedPercent: 0,
        crit: 0,
        critDamagePercent: 0,
        monsterDamagePercent: 0,
        monsterDamagePercentSteps: [],
        goldDropPercent: 0,
        projectileArmorPenetrationPercent: 0,
        meleeArmorPenetrationPercent: 0,
        meleeCounterDamage: 0,
        hpDrainPercent: 0,
        hpDrainFromMonsterPercent: 0,
        siphonAroundPercent: 0,
        dodgePercent: 0,
        mpDrainPercent: 0,
        reflectDamagePercent: 0
    };

    for (const equipped of Object.values(equipment || {})) {
        for (const { optionId, parameter } of normalizeItemOptions(equipped?.options)) {
            switch (optionId) {
                case 0: totals.attack += parameter; break;
                case 2: totals.hp += parameter * 1000; totals.mp += parameter * 1000; break;
                case 5: totals.critDamagePercent += parameter; break;
                case 6: totals.hp += parameter; break;
                case 7: totals.mp += parameter; break;
                case 14: totals.crit += parameter; break;
                case 15: totals.meleeCounterDamage += parameter; break;
                case 16:
                case 114:
                case 148: totals.moveSpeedPercent += parameter; break;
                case 19:
                    totals.monsterDamagePercent += parameter;
                    totals.monsterDamagePercentSteps.push(parameter);
                    break;
                case 100: totals.goldDropPercent += parameter; break;
                case 27: totals.hpRecoveryPerInterval += parameter; break;
                case 28: totals.mpRecoveryPerInterval += parameter; break;
                case 80: totals.hpRecoveryPercentPerInterval += parameter; break;
                case 81: totals.mpRecoveryPercentPerInterval += parameter; break;
                case 178: totals.mpRecoveryPercentPer10Seconds += parameter; break;
                case 173:
                    totals.hpRecoveryOption173Percent += parameter;
                    totals.mpRecoveryOption173Percent += parameter;
                    break;
                case 95: totals.hpDrainPercent += parameter; break;
                case 104: totals.hpDrainFromMonsterPercent += parameter; break;
                case 8: totals.siphonAroundPercent += parameter; break;
                case 3: totals.projectileDamageToMpPercent += parameter; break;
                // Source NPoint stores each option 117 in tlSDDep and applies
                // its rounded increase one by one after ordinary tlDame gear.
                case 117: totals.beautifulAttackPercentSteps.push(parameter); break;
                case 108: totals.dodgePercent += parameter; break;
                case 96: totals.mpDrainPercent += parameter; break;
                case 97: totals.reflectDamagePercent += parameter; break;
                case 98: totals.projectileArmorPenetrationPercent += parameter; break;
                case 99: totals.meleeArmorPenetrationPercent += parameter; break;
                case 22: totals.hp += parameter * 1000; break;
                case 23: totals.mp += parameter * 1000; break;
                case 47: totals.armor += parameter; break;
                case 48: totals.hp += parameter; totals.mp += parameter; break;
                case 49:
                case 50:
                case 147:
                    totals.attackPercent += parameter;
                    totals.attackPercentSteps.push(parameter);
                    break;
                case 77: totals.hpPercent += parameter; break;
                case 103: totals.mpPercent += parameter; break;
                // Source NPoint.setDef records option 94 in tlDef; it is a
                // separate incoming-damage reduction, capped at 60%, not armor.
                case 94: totals.damageReductionPercent += parameter; break;
                case 156: totals.attackReductionPercent += 50; break;
                default: break;
            }
        }
    }

    totals.damageReductionPercent = Math.min(60, Math.max(0, totals.damageReductionPercent));
    return totals;
}

function getNroEquipmentAttack(baseAttack, equipment = {}) {
    const totals = getNroEquipmentBonuses(equipment);
    return applySequentialAttackPercent(
        (Number(baseAttack) || 0) + totals.attack,
        totals.attackPercentSteps,
        totals.beautifulAttackPercentSteps,
        totals.attackReductionPercent
    );
}

/**
 * Port of the source option 8 aura tick: every five seconds, steal the option
 * percentage of nearby monsters' maximum HP, but leave each monster at 1 HP.
 * The source only scans live mobs in the owner's current zone and a 200 px
 * radius. Drained HP is restored to the owner (subject to max HP).
 */
function applyNroEquipmentAuraDrain(player, monsters = {}, now = Date.now()) {
    const percent = Math.max(0, Number(player?.nroSiphonAroundPercent) || 0);
    if (!player || percent <= 0 || Number(player.hp) <= 0) return null;
    const nextAt = Number(player.nroSiphonAroundAt);
    if (!Number.isFinite(nextAt)) {
        player.nroSiphonAroundAt = now + EQUIPMENT_AURA_DRAIN_INTERVAL_MS;
        return null;
    }
    if (now < nextAt) return null;
    player.nroSiphonAroundAt = nextAt
        + (Math.floor((now - nextAt) / EQUIPMENT_AURA_DRAIN_INTERVAL_MS) + 1) * EQUIPMENT_AURA_DRAIN_INTERVAL_MS;

    let drainedHp = 0;
    let hitCount = 0;
    const radiusSquared = EQUIPMENT_AURA_DRAIN_RADIUS_PX ** 2;
    for (const monster of Object.values(monsters || {})) {
        if (!monster || monster.isDead || monster.invulnerable || monster.questEncounter || Number(monster.hp) <= 1
            || Number(monster.mapId) !== Number(player.mapId)
            || Number(monster.zoneId || 0) !== Number(player.zoneId || 0)) continue;
        const dx = Number(monster.x) - Number(player.x);
        const dy = Number(monster.y) - Number(player.y);
        if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx * dx + dy * dy > radiusSquared) continue;
        const requested = Math.floor((Number(monster.maxHp) || 0) * percent / 100);
        const amount = Math.min(Math.max(0, requested), Number(monster.hp) - 1);
        if (amount <= 0) continue;
        monster.hp -= amount;
        drainedHp += amount;
        hitCount += 1;
    }

    if (drainedHp <= 0) return { drainedHp: 0, healedHp: 0, hitCount: 0 };
    const oldHp = Number(player.hp) || 0;
    player.hp = Math.min(Number(player.maxHp) || oldHp, oldHp + drainedHp);
    return { drainedHp, healedHp: player.hp - oldHp, hitCount };
}

function applyNroGoldDropBonus(amount, bonusPercent = 0) {
    const rawAmount = Number(amount);
    const rawPercent = Number(bonusPercent);
    const baseAmount = Number.isFinite(rawAmount) ? Math.max(0, Math.floor(rawAmount)) : 0;
    const percent = Number.isFinite(rawPercent) ? Math.max(0, rawPercent) : 0;
    return Math.floor(baseAmount * (1 + percent / 100));
}

function applyNroEquipmentRecovery(player, now = Date.now()) {
    if (!player) return false;
    const maxHp = Math.max(0, Number(player.maxHp) || 0);
    const maxMp = Math.max(0, Number(player.maxMp) || 0);
    // NPoint.setHpHoi/setMpHoi always add a base 1% regeneration. Gear
    // percentages 80/81 and 173 are accumulated in separate source fields,
    // so keep their integer truncation separate too.
    const hpRecovery = Math.floor(maxHp / 100)
        + Math.max(0, Number(player.nroHpRecoveryPerInterval) || 0)
        + Math.floor(maxHp * Math.max(0, Number(player.nroHpRecoveryPercentPerInterval) || 0) / 100)
        + Math.floor(maxHp * Math.max(0, Number(player.nroHpRecoveryOption173Percent) || 0) / 100);
    const mpRecovery = Math.floor(maxMp / 100)
        + Math.max(0, Number(player.nroMpRecoveryPerInterval) || 0)
        + Math.floor(maxMp * Math.max(0, Number(player.nroMpRecoveryPercentPerInterval) || 0) / 100)
        + Math.floor(maxMp * Math.max(0, Number(player.nroMpRecoveryOption173Percent) || 0) / 100);

    const nextAt = Number(player.nroEquipmentRegenAt);
    if (!Number.isFinite(nextAt)) {
        player.nroEquipmentRegenAt = now + EQUIPMENT_RECOVERY_INTERVAL_MS;
        return false;
    }
    if (now < nextAt) return false;

    player.nroEquipmentRegenAt = nextAt + (Math.floor((now - nextAt) / EQUIPMENT_RECOVERY_INTERVAL_MS) + 1) * EQUIPMENT_RECOVERY_INTERVAL_MS;
    if (Number(player.hp) <= 0) return false;
    const oldHp = Number(player.hp) || 0;
    const oldMp = Number(player.mp) || 0;
    player.hp = Math.min(Number(player.maxHp) || oldHp, oldHp + hpRecovery);
    player.mp = Math.min(Number(player.maxMp) || oldMp, oldMp + mpRecovery);
    return player.hp !== oldHp || player.mp !== oldMp;
}

function applyNroEquipmentKiRecovery10s(player, now = Date.now()) {
    if (!player) return false;
    const recoveryPercent = Math.max(0, Number(player.nroMpRecoveryPercentPer10Seconds) || 0);
    if (recoveryPercent === 0) return false;

    const nextAt = Number(player.nroEquipmentKiRegen10sAt);
    if (!Number.isFinite(nextAt)) {
        player.nroEquipmentKiRegen10sAt = now + EQUIPMENT_KI_RECOVERY_INTERVAL_MS;
        return false;
    }
    if (now < nextAt) return false;

    player.nroEquipmentKiRegen10sAt = nextAt
        + (Math.floor((now - nextAt) / EQUIPMENT_KI_RECOVERY_INTERVAL_MS) + 1) * EQUIPMENT_KI_RECOVERY_INTERVAL_MS;
    const oldMp = Number(player.mp) || 0;
    const maxMp = Number(player.maxMp) || oldMp;
    const recoveredMp = Math.floor(maxMp * recoveryPercent / 100);
    player.mp = Math.min(maxMp, oldMp + recoveredMp);
    return player.mp !== oldMp;
}

function getBeanRecoveryAmount(templateId, options = []) {
    const itemOptions = normalizeItemOptions(options);
    const flatOption = itemOptions.find((option) => option.optionId === 2);
    if (flatOption) return Math.max(0, flatOption.parameter * 1000);
    const rawOption = itemOptions.find((option) => option.optionId === 48);
    if (rawOption) return Math.max(0, rawOption.parameter);
    const level = PEA_TEMPLATE_IDS.indexOf(Number(templateId));
    return level < 0 ? 0 : PEA_RECOVERY_VALUES[level];
}

module.exports = {
    applyNroEquipmentAuraDrain,
    applyNroEquipmentKiRecovery10s,
    applyNroEquipmentRecovery,
    applyNroGoldDropBonus,
    applySequentialAttackPercent,
    getBeanRecoveryAmount,
    getNroEquipmentAttack,
    getNroEquipmentBonuses,
    getNroTnsmBonuses,
    normalizeItemOptions
};
