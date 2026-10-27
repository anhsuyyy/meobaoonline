/**
 * Combat Engine - Server Authoritative theo Game Design Document V2.0
 */

function calculateSkillDamage(attacker, target, skillConfig) {
    const strength = skillConfig.baseStat
        ? Number(attacker[skillConfig.baseStat]) || 0
        : attacker.str ?? attacker.atk ?? 40;
    const randomMult = skillConfig.damagePercent !== undefined
        ? skillConfig.damagePercent / 100
        : (skillConfig.damageMultiplierMin ?? 1.0) + Math.random() * ((skillConfig.damageMultiplierMax ?? 1.3) - (skillConfig.damageMultiplierMin ?? 1.0));
    let rawDamage = strength * randomMult * (skillConfig.damageMultiplier ?? 1);
    // NRO option 19 is applied one option at a time after skill damage is
    // calculated. Keep Java's integer truncation at each step (not a sum).
    for (const percent of skillConfig.damagePercentSteps || []) {
        const bonusPercent = Number(percent);
        if (Number.isFinite(bonusPercent) && bonusPercent !== 0) {
            rawDamage = Math.floor(rawDamage * (1 + bonusPercent / 100));
        }
    }

    // Tính giáp giảm sát thương theo công thức GDD V2
    const armorBonus = target.effects?.reduce((bonus, effect) =>
        effect.type === 'armor_boost' && effect.expiresAt > Date.now()
            ? bonus + (effect.armorBonusPercent || 0) / 100
            : bonus, 0) || 0;
    const targetArmor = (target.armor || 10) * (1 + armorBonus);
    const damageReduction = Math.min(0.80, Math.max(0, targetArmor / (targetArmor + 2000)));

    // Roll chí mạng cơ bản (5% cơ bản, nhân 1.5)
    const critChance = skillConfig.critChancePercent ?? 8;
    const isCrit = skillConfig.canCrit !== false && Math.random() * 100 < critChance;
    const critMult = isCrit ? 1.5 + (Number(skillConfig.critDamageBonusPercent) || 0) / 100 : 1.0;

    const finalDamage = Math.max(1, Math.round(rawDamage * (1 - damageReduction) * critMult));

    return {
        damage: finalDamage,
        isCrit
    };
}

function applyDamagePercentSteps(damage, steps = []) {
    let result = Math.max(0, Math.floor(Number(damage) || 0));
    for (const percent of steps) {
        const bonusPercent = Number(percent);
        if (Number.isFinite(bonusPercent) && bonusPercent !== 0) {
            result = Math.floor(result * (1 + bonusPercent / 100));
        }
    }
    return result;
}

/**
 * Kiểm tra va chạm AABB hình chữ nhật giữa hai entity
 */
function checkAABBCollision(box1, box2) {
    return (
        box1.x - box1.width / 2 < box2.x + box2.width / 2 &&
        box1.x + box1.width / 2 > box2.x - box2.width / 2 &&
        box1.y - box1.height / 2 < box2.y + box2.height / 2 &&
        box1.y + box1.height / 2 > box2.y - box2.height / 2
    );
}

module.exports = {
    calculateSkillDamage,
    applyDamagePercentSteps,
    checkAABBCollision
};
