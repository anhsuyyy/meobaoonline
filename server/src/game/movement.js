const DIRECTIONS = ['left', 'right', 'up', 'down'];

function parseMovementInput(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const keys = Object.keys(payload);
    if (keys.some((key) => !DIRECTIONS.includes(key))) return null;
    if (DIRECTIONS.some((key) => typeof payload[key] !== 'boolean')) return null;

    return Object.fromEntries(DIRECTIONS.map((key) => [key, payload[key]]));
}

function createTokenBucket({ capacity, refillPerSecond, now = Date.now }) {
    let tokens = capacity;
    let lastRefill = now();

    return function takeToken() {
        const currentTime = now();
        const elapsedSeconds = Math.max(0, currentTime - lastRefill) / 1000;
        tokens = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond);
        lastRefill = currentTime;

        if (tokens < 1) return false;
        tokens -= 1;
        return true;
    };
}

function getMovementDelta(input, speed) {
    const horizontal = Number(input.right) - Number(input.left);
    const vertical = Number(input.down) - Number(input.up);
    const length = Math.hypot(horizontal, vertical);
    if (length === 0) return { x: 0, y: 0 };

    return {
        x: (horizontal / length) * speed,
        y: (vertical / length) * speed
    };
}

function clampPlayerPosition(player, desiredPosition, map) {
    const halfWidth = (player.width || 0) / 2;
    const halfHeight = (player.height || 0) / 2;
    return {
        x: Math.max(halfWidth, Math.min(map.width - halfWidth, desiredPosition.x)),
        y: Math.max(halfHeight, Math.min(map.height - halfHeight, desiredPosition.y))
    };
}

module.exports = { parseMovementInput, createTokenBucket, getMovementDelta, clampPlayerPosition };
