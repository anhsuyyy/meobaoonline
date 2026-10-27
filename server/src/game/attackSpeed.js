function getBasicAttackCooldownMs(agility, { baseCooldownMs, agiReductionMsPerPoint, minimumCooldownMs }) {
    const safeAgility = Number.isFinite(agility) ? Math.max(0, agility) : 0;
    return Math.max(minimumCooldownMs, baseCooldownMs - (safeAgility * agiReductionMsPerPoint));
}

module.exports = { getBasicAttackCooldownMs };
