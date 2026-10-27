const STATUS_EFFECT_DISPLAY = {
    damage_boost: { label: 'Cuồng nộ', icon: 'ATK' },
    nro_charm_tri_tue: { label: 'Bùa Trí Tuệ', icon: 'EXP' },
    nro_charm_tri_tue_x3: { label: 'Bùa Trí Tuệ x3', icon: 'EXP' },
    nro_charm_tri_tue_x4: { label: 'Bùa Trí Tuệ x4', icon: 'EXP' },
    damage_reduction: { label: 'Giáp Xên', icon: 'DEF' },
    max_hp_boost: { label: 'Bổ huyết', icon: 'HP' },
    max_mp_boost: { label: 'Bổ khí', icon: 'KI' },
    damage_immunity: { label: 'Khiên năng lượng', icon: 'IMM' },
    armor_boost: { label: 'Tăng giáp', icon: 'DEF' },
    speed_boost: { label: 'Tăng tốc', icon: 'SPD' },
    stun: { label: 'Choáng', icon: 'STN', debuff: true },
    root: { label: 'Trói chân', icon: 'ROOT', debuff: true },
    slow: { label: 'Chậm', icon: 'SLOW', debuff: true },
    charging: { label: 'Tụ lực', icon: 'CHG' },
    invisible: { label: 'Tàng hình', icon: 'INV' },
    reflect_damage: { label: 'Phản sát thương', icon: 'REF' },
    taunt: { label: 'Khiêu khích', icon: 'TAUNT', debuff: true },
    monkey_transform: { label: 'Biến hình', icon: 'MON' },
    nro_charm_manh_me: { label: 'Bùa Mạnh Mẽ', icon: 'ATK' },
    nro_charm_da_trau: { label: 'Bùa Da Trâu', icon: 'DEF' },
    nro_charm_bat_tu: { label: 'Bùa Bất Tử', icon: 'HP' },
    nro_charm_deo_dai: { label: 'Bùa Dẻo Dai', icon: 'STA' },
    nro_charm_thu_hut: { label: 'Bùa Thu Hút', icon: 'LOOT' }
};

export function toStatusEffectBadges(effects) {
    if (!Array.isArray(effects)) return [];
    return effects.flatMap((effect, index) => {
        const display = STATUS_EFFECT_DISPLAY[effect?.type];
        if (!display) return [];
        const seconds = Math.max(0, Math.ceil((Number(effect.remainingMs) || 0) / 1000));
        return [{
            key: `${effect.type}-${index}`,
            type: effect.type,
            label: display.label,
            icon: display.icon,
            seconds,
            debuff: Boolean(display.debuff)
        }];
    });
}
