/**
 * Auto Farm Logic - Server Authoritative theo Game Design Document V2.0 & P12, P13
 */

/**
 * Giới hạn vị trí mong muốn nằm trong hình tròn bán kính leashRadius quanh Anchor
 */
function clampToLeashCircle(anchor, desiredPos, radius) {
    if (!anchor || radius <= 0) return { ...desiredPos };

    const dx = desiredPos.x - anchor.x;
    const dy = desiredPos.y - anchor.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= radius) {
        return { x: desiredPos.x, y: desiredPos.y };
    }

    // Nếu vượt quá bán kính anchor -> kéo về điểm gần nhất trên biên hình tròn
    const angle = Math.atan2(dy, dx);
    return {
        x: Math.round(anchor.x + Math.cos(angle) * radius),
        y: Math.round(anchor.y + Math.sin(angle) * radius)
    };
}

/**
 * Tìm quái hợp lệ gần nhất trong bán kính cho phép (mặc định 300px)
 */
function findNearestValidTarget(playerPos, monsters, maxRadius = 300) {
    let bestTarget = null;
    let minDistance = maxRadius;

    for (const id in monsters) {
        const m = monsters[id];
        if (!m || m.isDead || m.hp <= 0) continue;

        const dist = Math.hypot(m.x - playerPos.x, m.y - playerPos.y);
        if (dist <= minDistance) {
            minDistance = dist;
            bestTarget = m;
        }
    }

    return { target: bestTarget, distance: minDistance };
}

module.exports = {
    clampToLeashCircle,
    findNearestValidTarget
};
