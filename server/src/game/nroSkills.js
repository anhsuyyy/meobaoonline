const skillTemplates = require('../../../shared/nro/maps/skill-templates.json');

const PLANET_CLASS_ID = { earth: 0, namek: 1, saiyan: 2 };
const MAX_SKILL_LEVEL = 7;
// Item ranges mirror SkillUtil.getTempSkillSkillByItemID in the supplied Java
// source, narrowed to the five combat hotkeys currently exposed by this web build.
const SKILL_BOOK_RANGES = {
    earth: [[94, 100, 1], [115, 121, 2], [300, 306, 3], [307, 313, 4], [434, 440, 5]],
    namek: [[101, 107, 1], [122, 128, 2], [328, 334, 3], [335, 341, 4], [481, 487, 5]],
    saiyan: [[108, 114, 1], [129, 135, 2], [314, 320, 3], [321, 327, 4], [434, 440, 5]]
};

function endpoints(levels, key) {
    const first = levels[0] || {};
    const last = levels[Math.min(MAX_SKILL_LEVEL, levels.length) - 1] || first;
    return [Number(first[key]) || 0, Number(last[key]) || 0];
}

function levelValues(levels, key, transform = (value) => value) {
    return levels.map((level) => transform(Number(level[key]) || 0));
}

function resolveType(template) {
    const name = template.name.toLowerCase();
    // Source slot 0 is the planet's basic melee technique (Dragon/Demon/Galick).
    // Its damageInfo describes a damage bonus rather than its attack range, so
    // inferring type from damageInfo alone incorrectly turns the punch into a bolt.
    if (template.slot === 0) return {
        type: 'melee', rangeMeters: Math.max(3, (Number(template.levels?.[0]?.dx) || 32) / 10)
    };
    if (name.includes('thái dương')) return { type: 'aoe_debuff', effect: 'stun', noDamage: true };
    if (name.includes('quả cầu kênh khi')) return {
        type: 'aoe_target', effect: 'splash', damageFormula: 'qckk', requiresTarget: true
    };
    if (name.includes('makankosappo')) return { type: 'projectile', damageStat: 'maxMp', canCrit: false };
    if (name.includes('trị thương')) return { type: 'aoe_heal', effect: 'instant_heal', radiusMeters: 30 };
    if (name.includes('tái tạo năng lượng')) return { type: 'self_recovery', effect: 'charge_recovery' };
    if (name.includes('đẻ trứng')) return { type: 'buff', effect: 'summon_companion' };
    if (name.includes('khiên năng lượng')) return { type: 'buff', effect: 'damage_immunity' };
    if (name.includes('liên hoàn')) return { type: 'melee', rangeMeters: Math.max(3, (Number(template.levels?.[0]?.dx) || 30) / 10) };
    // Kaioken is a front-facing melee strike that spends HP in SkillService.
    if (name.includes('kaioken')) return { type: 'melee', rangeMeters: 5, effect: 'kaioken', hpCostPercent: 10 };
    // SkillService.setIsMonkey starts the transformation after a 2s cast.
    if (name.includes('biến hình')) return { type: 'buff', effect: 'monkey_transform' };
    if (name.includes('tự phát nổ')) return { type: 'aoe_burst', effect: 'self_destruct', damageFormula: 'self_destruct', castTimeMs: 2000 };
    if (template.type === 2) return { type: 'aoe_heal', radiusMeters: 3 };
    if (template.type === 3) return { type: 'buff', effect: 'armor_boost' };
    if (template.type === 4) return { type: 'aoe_burst', radiusMeters: 4 };
    return `${template.damageInfo} ${template.description}`.toLowerCase().includes('cận chiến')
        ? { type: 'melee', rangeMeters: 5 }
        : { type: 'projectile', rangeMeters: 20 };
}

function normalizeTemplate(template, skillId) {
    const levels = (template.levels || []).slice(0, MAX_SKILL_LEVEL);
    if (!levels.length) return null;
    const first = levels[0];
    const last = levels[levels.length - 1];
    const mapped = resolveType(template);
    const effectScaling = {};
    if (mapped.effect === 'stun') effectScaling.stunDurationMs = levelValues(levels, 'damage');
    else if (mapped.effect === 'armor_boost') effectScaling.armorBonusPercent = levelValues(levels, 'damage');
    else if (mapped.effect === 'damage_boost') effectScaling.damageBonusPercent = levelValues(levels, 'damage');
    else if (mapped.effect === 'monkey_transform') effectScaling.maxHpBonusPercent = levelValues(levels, 'point', (level) => (level + 3) * 10);
    else if (mapped.effect === 'summon_companion') {
        effectScaling.companionHpPercent = levels.map((_, index) => (index + 3) * 10);
        effectScaling.companionDamagePercent = levels.map((_, index) => (index + 3) * 10);
    }
    else if (mapped.effect === 'instant_heal') effectScaling.healPercent = levelValues(levels, 'damage');
    else if (mapped.effect === 'charge_recovery') effectScaling.recoveryPercent = levelValues(levels, 'damage');
    else if (mapped.effect === 'damage_immunity') effectScaling.durationMs = levelValues(levels, 'damage', (seconds) => seconds * 1000);
    else if (mapped.type === 'aoe_heal') effectScaling.healPercentPerSecond = levelValues(levels, 'damage');
    else if (!mapped.damageFormula) effectScaling.damagePercent = levelValues(levels, 'damage');

    const levelScaling = {
        cooldownMs: levelValues(levels, 'cool_down'),
        mpCost: levelValues(levels, 'mana_use'),
        ...effectScaling
    };
    if (mapped.effect === 'stun') {
        // SkillUtil.getRangeStun(level) matches the source skill_template dx values.
        levelScaling.radiusMeters = levelValues(levels, 'dx', (pixels) => pixels / 10);
    }
    if (mapped.damageFormula === 'qckk') {
        levelScaling.radiusMeters = levelValues(levels, 'point', (level) => (350 + 30 * (level || 1)) / 10);
    }
    if (mapped.damageFormula === 'self_destruct') {
        levelScaling.radiusMeters = levelValues(levels, 'point', (level) => (400 + 30 * (level || 1)) / 10);
    }
    if (mapped.effect === 'stun' || mapped.effect === 'armor_boost' || mapped.effect === 'damage_boost' || mapped.effect === 'monkey_transform') {
        levelScaling.durationMs = mapped.effect === 'stun'
            ? levelScaling.stunDurationMs
            : mapped.effect === 'monkey_transform'
                ? levelValues(levels, 'point', (level) => (level + 5) * 10000)
                : [5000, 5000];
    }
    if (mapped.effect === 'summon_companion') {
        levelScaling.durationMs = levelValues(levels, 'point', (level) => (level + 5) * 20000);
    }
    if (mapped.type === 'aoe_heal' && mapped.effect !== 'instant_heal') levelScaling.durationMs = [1000, 1000];
    if (mapped.effect === 'charge_recovery') {
        levelScaling.durationMs = [10000, 10000];
        levelScaling.tickIntervalMs = [1000, 1000];
    }

    return {
        id: skillId,
        sourceId: template.id,
        planetClassId: template.planetClassId,
        name: template.name,
        key: skillId.slice(1),
        // Runtime HUD uses the freshly authored, crisp icon generated from the
        // imported skill catalog instead of the low-resolution source PNG.
        icon: `/assets/nro/generated/skills/nro-${template.planetClassId}-${template.id}.svg`,
        type: mapped.type,
        effect: mapped.effect,
        noDamage: Boolean(mapped.noDamage),
        damageFormula: mapped.damageFormula,
        castTimeMs: mapped.castTimeMs,
        damageStat: mapped.damageStat,
        hpCostPercent: mapped.hpCostPercent,
        canCrit: mapped.canCrit,
        requiresTarget: Boolean(mapped.requiresTarget),
        mpCost: Number(first.mana_use) || 0,
        cooldownMs: Number(first.cool_down) || 0,
        rangeMeters: mapped.rangeMeters || 20,
        radiusMeters: mapped.radiusMeters,
        tickIntervalMs: mapped.type === 'aoe_heal' ? 1000 : undefined,
        healPercentPerSecond: mapped.type === 'aoe_heal' ? Number(first.damage) || 0 : undefined,
        healPercent: mapped.effect === 'instant_heal' ? Number(first.damage) || 0 : undefined,
        recoveryPercent: mapped.effect === 'charge_recovery' ? Number(first.damage) || 0 : undefined,
        armorBonusPercent: mapped.effect === 'armor_boost' ? Number(first.damage) || 0 : undefined,
        durationMs: mapped.effect === 'damage_immunity' ? (Number(first.damage) || 0) * 1000 : undefined,
        damageBonusPercent: mapped.effect === 'damage_boost' ? Number(first.damage) || 0 : undefined,
        maxHpBonusPercent: mapped.effect === 'monkey_transform' ? ((Number(first.point) || 1) + 3) * 10 : undefined,
        companionHpPercent: mapped.effect === 'summon_companion' ? 30 : undefined,
        companionDamagePercent: mapped.effect === 'summon_companion' ? 30 : undefined,
        damagePercent: !mapped.damageFormula && (mapped.type === 'melee' || mapped.type === 'projectile' || mapped.type === 'aoe_burst')
            ? Number(first.damage) || 0 : undefined,
        levelScaling,
        powerRequired: Number(first.power_require) || 0,
        unlockedByDefault: Number(first.power_require) <= 0,
        maxLevel: levels.length,
        sourceDescription: template.description
    };
}

function getNroSkillSet(raceId, power = 0) {
    const planetClassId = PLANET_CLASS_ID[raceId] ?? PLANET_CLASS_ID.earth;
    const skills = {};
    const levels = {};
    // The first five visible hotkeys follow the source character's skill order:
    // slot 0 is the planet-specific Dragon/Demon/Galick punch, then source slots 1–4.
    // Keep source slot 5 as s6 so existing skill books still teach their original skill.
    for (let sourceSlot = 0; sourceSlot <= 5; sourceSlot++) {
        const template = skillTemplates.find((entry) => entry.planetClassId === planetClassId && entry.slot === sourceSlot);
        if (!template) continue;
        const skillId = `s${sourceSlot + 1}`;
        const skill = normalizeTemplate(template, skillId);
        if (!skill) continue;
        const unlocked = Number(power) >= skill.powerRequired;
        skills[skillId] = { ...skill, unlocked };
        if (unlocked) levels[skillId] = 1;
    }
    return { skills, levels };
}

function getNroSkillBookInfo(raceId, itemTemplate) {
    const raceGender = { earth: 0, namek: 1, saiyan: 2 }[raceId];
    const isUniversalShieldBook = itemTemplate?.gender === 3 && [0, 2].includes(PLANET_CLASS_ID[raceId]);
    if (!itemTemplate || itemTemplate.type !== 7 || (itemTemplate.gender !== raceGender && !isUniversalShieldBook)) return null;
    const levelMatch = itemTemplate.name.match(/(?:lv\s*|cấp\s*)([1-7])\s*$/i)
        || itemTemplate.name.match(/([1-7])\s*$/);
    const level = Number(levelMatch?.[1]);
    if (!level) return null;

    const range = (SKILL_BOOK_RANGES[raceId] || []).find(([minId, maxId]) =>
        itemTemplate.id >= minId && itemTemplate.id <= maxId
    );
    if (!range) return null;
    const sourceSlot = range[2];
    const skillTemplate = skillTemplates.find((entry) =>
        entry.planetClassId === PLANET_CLASS_ID[raceId] && entry.slot === sourceSlot
    );
    const levelDefinition = skillTemplate?.levels?.[level - 1];
    return skillTemplate && levelDefinition
        ? {
            skillId: `s${sourceSlot + 1}`,
            level,
            powerRequired: Math.max(0, Number(levelDefinition.power_require) || 0),
            skillTemplate
        }
        : null;
}

function getNroSkill(raceId, skillId) {
    const set = getNroSkillSet(raceId, Number.MAX_SAFE_INTEGER);
    return set.skills[skillId] || null;
}

// SkillService.canAttackPlayer: PK mode allows combat directly; otherwise
// both players need faction flags and those flags must conflict.
function canNroPlayerAttack(attacker, target) {
    if (!attacker || !target || attacker.id === target.id || attacker.hp <= 0 || target.hp <= 0) return false;
    if ((Number(attacker.typePk) || 0) > 0 || (Number(target.typePk) || 0) > 0) return true;
    const attackerFlag = Number(attacker.cFlag) || 0;
    const targetFlag = Number(target.cFlag) || 0;
    return attackerFlag !== 0 && targetFlag !== 0
        && (attackerFlag === 8 || targetFlag === 8 || attackerFlag !== targetFlag);
}

module.exports = { PLANET_CLASS_ID, canNroPlayerAttack, getNroSkill, getNroSkillSet, getNroSkillBookInfo };
