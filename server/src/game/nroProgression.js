const captions = require('../../../shared/nro/maps/captions.json');

function getNroLevel(power, rows = captions) {
    const value = Math.max(0, Math.floor(Number(power) || 0));
    let level = 0;
    for (let index = rows.length - 1; index >= 0; index--) {
        if (value >= Number(rows[index].power)) {
            level = index;
            break;
        }
    }
    return level;
}

function getNroProgress(power, rows = captions) {
    const value = Math.max(0, Math.floor(Number(power) || 0));
    if (!rows.length) return { level: 0, exp: value, maxExp: 1 };
    const level = getNroLevel(value, rows);
    const reachedFirstCaption = value >= Number(rows[0].power);
    const currentThreshold = reachedFirstCaption ? Number(rows[level].power) : 0;
    const nextThreshold = reachedFirstCaption
        ? Number(rows[level + 1]?.power) || Number(rows[level].power)
        : Number(rows[0].power);
    return {
        level,
        exp: Math.max(0, value - currentThreshold),
        maxExp: Math.max(1, nextThreshold - currentThreshold)
    };
}

function getPotentialReward({ damage, mobHp, mobLevel = 1, playerLevel = 1, playerPower = 0, maxPotential, cFlag = 0, powerLimit = Infinity, tnsmBonuses = [], satelliteTnsmBonus = 0, charmPotentialMultipliers = [] }) {
    const safeHp = Math.max(1, Math.floor(Number(mobHp) || 1));
    const safeDamage = Math.max(0, Math.floor(Number(damage) || 0));
    if (!safeDamage) return 0;

    // Mob.getTiemNangForPlayer: first convert the hit to an integer HP percent,
    // then award that share of this mob's maxTiemNang.
    const hitPercent = Math.floor(safeDamage * 100 / safeHp);
    let reward = Math.floor(hitPercent * Math.max(1, Math.floor(Number(maxPotential) || 1)) / 100);
    reward = Math.max(1, reward);

    // Source attenuates each level of player advantage by 15%; being behind adds
    // 10% per level. Keep integer arithmetic and the source's minimum +1 step.
    const levelDelta = Math.max(-100, Math.min(100, Math.floor(playerLevel) - Math.floor(mobLevel)));
    if (levelDelta > 0) {
        for (let i = 0; i < levelDelta; i++) reward = Math.max(1, reward - Math.max(1, Math.floor(reward * 0.15)));
    } else {
        for (let i = 0; i > levelDelta; i--) reward += Math.max(1, Math.floor(reward * 0.10));
    }

    // NPoint returns 10 at the cap; Service.addSMTN accepts that last gain,
    // then rejects subsequent rewards once power has crossed the cap.
    const currentPower = Number(playerPower) || 0;
    const currentLimit = Number(powerLimit);
    if (currentPower > currentLimit) return 0;
    if (currentPower === currentLimit) return 10;

    // NPoint.calSucManhTiemNang applies each equipped TNSM option in source order,
    // then faction bonus, server rate (1), and halves before high-power penalties.
    for (const percent of tnsmBonuses) {
        reward += Math.floor(reward * Math.max(0, Number(percent) || 0) / 100);
    }
    if (cFlag > 0) reward += Math.floor(reward * (cFlag === 8 ? 10 : 5) / 100);
    if (satelliteTnsmBonus > 0) reward += Math.floor(reward * satelliteTnsmBonus / 100);
    // NPoint snapshots `tn` after gear/faction/satellite bonuses. Charms 213/671/672
    // add that same snapshot once/twice/three times before high-power reductions.
    const charmBaseReward = reward;
    for (const multiplier of charmPotentialMultipliers) {
        reward += Math.floor(charmBaseReward * Math.max(0, Number(multiplier) || 0));
    }
    const power = Number(playerPower) || 0;
    if (power >= 40_000_000_000) reward -= Math.floor(reward * 0.90);
    reward = Math.floor(reward / 2);
    const powerPenalty = power >= 110_000_000_000 ? 90
        : power >= 100_000_000_000 ? 85
            : power >= 90_000_000_000 ? 80
                : power >= 80_000_000_000 ? 75 : 0;
    if (powerPenalty) reward -= Math.floor(reward * powerPenalty / 100);
    return Math.max(1, reward);
}

function getNroMobAttackDamage({ maxHp, level = 1, pDame = 5, baseDamage = 0, randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1)) }) {
    const fixedDamage = Math.floor(Number(baseDamage) || 0);
    if (fixedDamage > 0) {
        const variance = Math.floor(fixedDamage / 100);
        return Math.max(1, fixedDamage + randomInt(-variance, variance));
    }

    const mobLevel = Math.max(1, Math.floor(Number(level) || 1));
    const damagePercent = Math.max(0, Math.floor(Number(pDame) || 0));
    const hpDamage = Math.floor(Math.max(1, Number(maxHp) || 1) * randomInt(damagePercent - 1, damagePercent + 1) / 100);
    const levelVariance = randomInt(-(mobLevel * 10), mobLevel * 10);
    return Math.max(1, hpDamage + levelVariance);
}

module.exports = { getNroLevel, getNroProgress, getPotentialReward, getNroMobAttackDamage };
