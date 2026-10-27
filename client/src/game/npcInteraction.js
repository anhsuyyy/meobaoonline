export const NRO_NPC_INTERACTION_RANGE_PX = 60;

/** Return the closest valid map NPC within the same range enforced by the server. */
export function findNearbyNroNpc(player, npcs, maxDistance = NRO_NPC_INTERACTION_RANGE_PX) {
    const playerX = Number(player?.x);
    const playerY = Number(player?.y);
    const range = Number(maxDistance);
    if (!Number.isFinite(playerX) || !Number.isFinite(playerY) || !Number.isFinite(range) || range < 0) return null;

    let nearest = null;
    let nearestDistanceSquared = range * range;
    for (const entry of npcs || []) {
        const npcId = Number(entry?.[0]);
        const npcX = Number(entry?.[1]);
        const npcY = Number(entry?.[2]);
        if (!Number.isInteger(npcId) || !Number.isFinite(npcX) || !Number.isFinite(npcY)) continue;
        const dx = playerX - npcX;
        const dy = playerY - npcY;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared <= nearestDistanceSquared) {
            nearest = entry;
            nearestDistanceSquared = distanceSquared;
        }
    }
    return nearest;
}

/** Convert the NPC's world position to a clamped percentage for the HUD prompt. */
export function getNpcPromptPosition(entry, camera, width, height, verticalOffset = 30) {
    const x = Number(entry?.[1]);
    const y = Number(entry?.[2]);
    const sceneWidth = Number(width);
    const sceneHeight = Number(height);
    const zoom = Number(camera?.zoom);
    if (![x, y, sceneWidth, sceneHeight, zoom].every(Number.isFinite)
        || sceneWidth <= 0 || sceneHeight <= 0 || zoom <= 0) return null;

    const screenX = Number(camera.x || 0) + (x - Number(camera.scrollX || 0)) * zoom;
    const screenY = Number(camera.y || 0) + (y - Number(camera.scrollY || 0)) * zoom - Number(verticalOffset || 0);
    return {
        left: `${Math.max(7, Math.min(93, screenX / sceneWidth * 100))}%`,
        // Keep the prompt above the chat and touch controls at the bottom edge.
        top: `${Math.max(12, Math.min(72, screenY / sceneHeight * 100))}%`
    };
}
