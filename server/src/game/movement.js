const DIRECTIONS = ['left', 'right', 'up', 'down'];

function parseMovementInput(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    if (Object.keys(payload).length === 2 && 'axisX' in payload && 'axisY' in payload &&
        Number.isFinite(payload.axisX) && Number.isFinite(payload.axisY) &&
        Math.abs(payload.axisX) <= 1 && Math.abs(payload.axisY) <= 1) {
        return { axisX: payload.axisX, axisY: payload.axisY };
    }
    const keys = Object.keys(payload);
    const acceptedKeys = new Set([...DIRECTIONS, 'jump', 'flight']);
    if (keys.some((key) => !acceptedKeys.has(key))) return null;
    if (keys.length === 0 || keys.some((key) => typeof payload[key] !== 'boolean')) return null;

    const normalized = Object.fromEntries(DIRECTIONS.map((key) => [key, payload[key] === true]));
    if ('jump' in payload) normalized.jump = payload.jump;
    if ('flight' in payload) normalized.flight = payload.flight;
    return normalized;
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

function getMovementSpeedPxPerSecond(baseMetersPerSecond, agility, agiBonusPxPerSecond, pixelsPerMeter, bonusPercent = 0) {
    const baseSpeed = (baseMetersPerSecond * pixelsPerMeter) + (Math.max(0, agility) * agiBonusPxPerSecond);
    return baseSpeed * (1 + Math.max(0, Number(bonusPercent) || 0) / 100);
}

function getMovementDelta(input, speedPxPerSecond, tickIntervalMs) {
    const horizontal = Number.isFinite(input.axisX) ? input.axisX : Number(input.right) - Number(input.left);
    const vertical = Number.isFinite(input.axisY) ? input.axisY : Number(input.down) - Number(input.up);
    const length = Math.hypot(horizontal, vertical);
    if (length === 0) return { x: 0, y: 0 };
    const distanceThisTick = speedPxPerSecond * tickIntervalMs / 1000 * Math.min(1, length);

    return {
        x: (horizontal / length) * distanceThisTick,
        y: (vertical / length) * distanceThisTick
    };
}

function getMovementTowardDelta(from, to, speedPxPerSecond, tickIntervalMs) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return { x: 0, y: 0 };
    const step = Math.min(distance, speedPxPerSecond * tickIntervalMs / 1000);
    return { x: (dx / distance) * step, y: (dy / distance) * step };
}

function clampPlayerPosition(player, desiredPosition, map) {
    const halfWidth = (player.width || 0) / 2;
    const halfHeight = (player.height || 0) / 2;
    return {
        x: Math.max(halfWidth, Math.min(map.width - halfWidth, desiredPosition.x)),
        y: Math.max(halfHeight, Math.min(map.height - halfHeight, desiredPosition.y))
    };
}

module.exports = {
    parseMovementInput,
    createTokenBucket,
    getMovementSpeedPxPerSecond,
    getMovementDelta,
    getMovementTowardDelta,
    clampPlayerPosition
};
