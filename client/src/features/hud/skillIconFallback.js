const TYPE_COLORS = {
    melee: ['#fb7185', '#7f1d1d'],
    projectile: ['#38bdf8', '#0c4a6e'],
    aoe_melee: ['#f97316', '#7c2d12'],
    aoe_debuff: ['#facc15', '#713f12'],
    aoe_target: ['#c084fc', '#581c87'],
    aoe_zone: ['#a78bfa', '#4c1d95'],
    aoe_burst: ['#f87171', '#7f1d1d'],
    aoe_heal: ['#4ade80', '#14532d'],
    buff: ['#fbbf24', '#78350f'],
    self_recovery: ['#34d399', '#064e3b']
};

/** Build an inline fallback so a missing source icon can never render as a broken-image tile. */
export function getSkillFallbackIcon(skill, skillId) {
    const [accent, shade] = TYPE_COLORS[skill?.type] || ['#fbbf24', '#78350f'];
    const label = String(skill?.key || skillId?.slice(-1) || '?').replace(/[<>&"']/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="${shade}"/></linearGradient></defs><rect x="3" y="3" width="58" height="58" rx="13" fill="#111827" stroke="${accent}" stroke-width="3"/><path d="M14 46 27 14h10L50 46H39l-2-7H26l-2 7z" fill="url(#g)"/><text x="32" y="34" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="900" fill="#fff">${label}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
