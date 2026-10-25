/**
 * Combat Engine - Server Authoritative theo Game Design Document V2.0
 */

function calculateSkillDamage(attacker, target, skillConfig) {
    const minMult = skillConfig.damageMultiplierMin || 1.0;
    const maxMult = skillConfig.damageMultiplierMax || 1.3;
    const randomMult = minMult + Math.random() * (maxMult - minMult);

    const rawDamage = (attacker.atk || 40) * randomMult;

    // Tính giáp giảm sát thương theo công thức GDD V2
    const targetArmor = target.armor || 10;
    const damageReduction = Math.min(0.80, Math.max(0, targetArmor / (targetArmor + 2000)));

    // Roll chí mạng cơ bản (5% cơ bản, nhân 1.5)
    const isCrit = Math.random() < 0.08;
    const critMult = isCrit ? 1.5 : 1.0;

    const finalDamage = Math.max(1, Math.round(rawDamage * (1 - damageReduction) * critMult));

    return {
        damage: finalDamage,
        isCrit
    };
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
    checkAABBCollision
};
