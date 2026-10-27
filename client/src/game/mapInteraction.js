/** Find the closest authored portal whose trigger rectangle contains the player. */
const NRO_WAYPOINT_INTERACTION_MARGIN = 48;

export function findNearbyNroWaypoint(player, waypoints, playerWidth = 40, playerHeight = 40) {
    const playerX = Number(player?.x);
    const playerY = Number(player?.y);
    const halfWidth = Math.max(0, Number(playerWidth) || 0) / 2;
    const playerTop = playerY - Math.max(1, Number(playerHeight) || 40);
    if (!Number.isFinite(playerX) || !Number.isFinite(playerY)) return null;

    let nearest = null;
    let nearestDistanceSquared = Infinity;
    for (const entry of waypoints || []) {
        const x1 = Number(entry?.[1]);
        const y1 = Number(entry?.[2]);
        const x2 = Number(entry?.[3]);
        const y2 = Number(entry?.[4]);
        const destinationMapId = Number(entry?.[7]);
        if (![x1, y1, x2, y2, destinationMapId].every(Number.isFinite) || !Number.isInteger(destinationMapId)) continue;

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);
        // Portals are often authored slightly above a platform. Let the player
        // interact from the platform edge instead of requiring an impossible overlap.
        if (playerX + halfWidth < left - NRO_WAYPOINT_INTERACTION_MARGIN
            || playerX - halfWidth > right + NRO_WAYPOINT_INTERACTION_MARGIN
            || playerY < top - NRO_WAYPOINT_INTERACTION_MARGIN
            || playerTop > bottom + NRO_WAYPOINT_INTERACTION_MARGIN) continue;

        const centerX = (left + right) / 2;
        const centerY = (top + bottom) / 2;
        const distanceSquared = (playerX - centerX) ** 2 + (playerY - centerY) ** 2;
        if (distanceSquared < nearestDistanceSquared) {
            nearest = { entry, destinationMapId, mapName: String(entry[0] || `Bản đồ ${destinationMapId}`) };
            nearestDistanceSquared = distanceSquared;
        }
    }
    return nearest;
}

/** Position a map prompt over the waypoint in the scaled Phaser viewport. */
export function getWaypointPromptPosition(entry, camera, width, height) {
    const x = (Number(entry?.[1]) + Number(entry?.[3])) / 2;
    const y = (Number(entry?.[2]) + Number(entry?.[4])) / 2;
    const sceneWidth = Number(width);
    const sceneHeight = Number(height);
    const zoom = Number(camera?.zoom);
    if (![x, y, sceneWidth, sceneHeight, zoom].every(Number.isFinite)
        || sceneWidth <= 0 || sceneHeight <= 0 || zoom <= 0) return null;

    const screenX = Number(camera.x || 0) + (x - Number(camera.scrollX || 0)) * zoom;
    const screenY = Number(camera.y || 0) + (y - Number(camera.scrollY || 0)) * zoom;
    return {
        left: `${Math.max(8, Math.min(92, screenX / sceneWidth * 100))}%`,
        top: `${Math.max(18, Math.min(78, screenY / sceneHeight * 100))}%`
    };
}
