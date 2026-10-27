const NRO_CHARM_ITEM_IDS = Object.freeze({
    213: { type: 'nro_charm_tri_tue', name: 'Bùa Trí Tuệ', potentialBonusMultiplier: 1 },
    214: { type: 'nro_charm_manh_me', name: 'Bùa Mạnh Mẽ', damageBonusPercent: 150 },
    215: { type: 'nro_charm_da_trau', name: 'Bùa Da Trâu', damageReductionPercent: 50 },
    217: { type: 'nro_charm_bat_tu', name: 'Bùa Bất Tử' },
    218: { type: 'nro_charm_deo_dai', name: 'Bùa Dẻo Dai' },
    219: { type: 'nro_charm_thu_hut', name: 'Bùa Thu Hút' },
    671: { type: 'nro_charm_tri_tue_x3', name: 'Bùa Trí Tuệ x3', potentialBonusMultiplier: 2 },
    672: { type: 'nro_charm_tri_tue_x4', name: 'Bùa Trí Tuệ x4', potentialBonusMultiplier: 3 }
});

const NRO_CHARM_DURATION_MS = 60 * 60 * 1000;

function getNroCharm(itemId) {
    return NRO_CHARM_ITEM_IDS[Number(itemId)] || null;
}

function activateNroCharm(player, itemId, now = Date.now()) {
    const charm = getNroCharm(itemId);
    if (!player || !charm) return null;
    player.effects ||= [];
    const current = player.effects.find((effect) => effect.type === charm.type && effect.expiresAt > now);
    const expiresAt = Math.max(now, Number(current?.expiresAt) || 0) + NRO_CHARM_DURATION_MS;
    player.effects = player.effects.filter((effect) => effect.type !== charm.type || effect.expiresAt <= now);
    player.effects.push({ ...charm, sourceId: player.userId, expiresAt });
    return { ...charm, expiresAt };
}

function getNroCharmPotentialMultipliers(effects = [], now = Date.now()) {
    return (Array.isArray(effects) ? effects : []).filter((effect) =>
        ['nro_charm_tri_tue', 'nro_charm_tri_tue_x3', 'nro_charm_tri_tue_x4'].includes(effect?.type)
        && Number(effect.expiresAt) > now
    ).map((effect) => Math.max(0, Number(effect.potentialBonusMultiplier) || 0));
}

module.exports = { NRO_CHARM_DURATION_MS, activateNroCharm, getNroCharm, getNroCharmPotentialMultipliers };
