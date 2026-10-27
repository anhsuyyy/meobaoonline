function createNroMovementState({ x = 60, y = 456 } = {}) {
    return { x, y, velocityX: 0, velocityY: 0, grounded: false, isFlying: false, flightKiDrainCarry: 0, flightIdleMs: 0, flightUpHoldMs: 0, facing: 1, jumpInputWasDown: false };
}

function toggleNroFlight(player) {
    if (!player) return { ok: false, isFlying: false, error: 'Không tìm thấy nhân vật.' };
    if (player.isFlying) {
        player.isFlying = false;
        player.velocityY = 0;
        player.flightIdleMs = 0;
        player.flightUpHoldMs = 0;
        return { ok: true, isFlying: false };
    }
    if (!Number.isFinite(Number(player.mp)) || Number(player.mp) <= 0) {
        return { ok: false, isFlying: false, error: 'Không đủ KI để cất cánh.' };
    }
    player.isFlying = true;
    player.grounded = false;
    player.velocityY = 0;
    player.flightIdleMs = 0;
    player.flightUpHoldMs = 0;
    return { ok: true, isFlying: true };
}

function getNroAnimationState(player) {
    if (player?.isFlying) return 'flying';
    if (!player?.grounded) return Number(player?.velocityY) < 0 ? 'jumping' : 'falling';
    if (Math.abs(Number(player?.velocityX) || 0) > 0.5) return 'running';
    return 'standing';
}

function getNroTileCollisionMasks(tileSet, mapId) {
    const topTileValues = new Set((tileSet?.tileTypes?.find((entry) => entry.type === 2)?.tiles || [])
        .filter((tileId) => !(Number(mapId) === 0 && tileId === 39)));
    const wallTileValues = new Set((tileSet?.tileTypes || [])
        .filter((entry) => entry.type === 4 || entry.type === 8)
        .flatMap((entry) => entry.tiles || []));
    const solidTileValues = new Set([...topTileValues, ...wallTileValues]
        .filter((tileId) => !(Number(mapId) === 0 && tileId === 39)));
    return { topTileValues, wallTileValues, solidTileValues };
}

function isNroMovementBlocked(effects, now) {
    return Array.isArray(effects) && effects.some((effect) =>
        ['stun', 'root'].includes(effect?.type) && Number(effect.expiresAt) > now
    );
}

function getNroMovementInput(input, effects, now) {
    return isNroMovementBlocked(effects, now) ? {} : (input || {});
}

function findLandingSurface(map, solidTileValues, x, fromY, toY, tileSize, playerWidth = 0) {
    if (toY < fromY) return null;
    const halfWidth = Math.max(0, Number(playerWidth) || 0) / 2;
    const firstColumn = Math.max(0, Math.min(map.width - 1, Math.floor((x - halfWidth + 0.001) / tileSize)));
    const lastColumn = Math.max(0, Math.min(map.width - 1, Math.floor((x + halfWidth - 0.001) / tileSize)));
    const firstRow = Math.max(0, Math.floor(fromY / tileSize));
    const lastRow = Math.min(map.height - 1, Math.floor(toY / tileSize));

    for (let row = firstRow; row <= lastRow; row++) {
        const surfaceY = row * tileSize;
        if (surfaceY < fromY || surfaceY > toY) continue;
        for (let column = firstColumn; column <= lastColumn; column++) {
            if (solidTileValues.has(map.tiles[row]?.[column])) return surfaceY;
        }
    }
    return null;
}

function findCeilingSurface(map, solidTileValues, x, fromY, toY, tileSize, playerWidth, playerHeight) {
    if (toY >= fromY) return null;
    const halfWidth = Math.max(0, Number(playerWidth) || 0) / 2;
    const height = Math.max(1, Number(playerHeight) || tileSize);
    const oldHeadY = fromY - height;
    const newHeadY = toY - height;
    const firstColumn = Math.max(0, Math.min(map.width - 1, Math.floor((x - halfWidth + 0.001) / tileSize)));
    const lastColumn = Math.max(0, Math.min(map.width - 1, Math.floor((x + halfWidth - 0.001) / tileSize)));
    const firstRow = Math.max(0, Math.floor(newHeadY / tileSize));
    const lastRow = Math.min(map.height - 1, Math.floor(oldHeadY / tileSize));
    let nearestCeilingBottom = null;

    for (let row = firstRow; row <= lastRow; row++) {
        const blockBottom = (row + 1) * tileSize;
        if (blockBottom < newHeadY || blockBottom > oldHeadY) continue;
        for (let column = firstColumn; column <= lastColumn; column++) {
            if (solidTileValues.has(map.tiles[row]?.[column])) {
                nearestCeilingBottom = Math.max(nearestCeilingBottom ?? -Infinity, blockBottom);
            }
        }
    }
    return nearestCeilingBottom === null ? null : nearestCeilingBottom + height;
}

function hasGroundSupport(player, world) {
    const solidTiles = world.solidTileValues || world.topTileValues;
    const halfWidth = Math.max(1, Number(player.width) || world.tileSize) / 2;
    const firstColumn = Math.max(0, Math.floor((player.x - halfWidth + 0.001) / world.tileSize));
    const lastColumn = Math.min(world.map.width - 1, Math.floor((player.x + halfWidth - 0.001) / world.tileSize));
    const row = Math.floor((player.y + 0.001) / world.tileSize);
    for (let column = firstColumn; column <= lastColumn; column += 1) {
        if (solidTiles.has(world.map.tiles[row]?.[column])) return true;
    }
    return false;
}

function resolveHorizontalCollision(player, nextX, horizontal, world) {
    const solidTileValues = world.solidTileValues || world.wallTileValues;
    if (!solidTileValues?.size || !horizontal) return nextX;

    const tileSize = world.tileSize;
    const halfWidth = Math.max(1, Number(player.width || tileSize) / 2);
    const height = Math.max(1, Number(player.height || tileSize));
    const epsilon = 0.001;
    const left = nextX - halfWidth;
    const right = nextX + halfWidth;
    const top = player.y - height;
    const bottom = player.y - epsilon;
    const firstRow = Math.max(0, Math.floor(top / tileSize));
    const lastRow = Math.min(world.map.height - 1, Math.floor(bottom / tileSize));
    const leadingEdge = horizontal > 0 ? right - epsilon : left + epsilon;
    const column = Math.floor(leadingEdge / tileSize);

    for (let row = firstRow; row <= lastRow; row++) {
        if (!solidTileValues.has(world.map.tiles[row]?.[column])) continue;
        return horizontal > 0
            ? column * tileSize - halfWidth
            : (column + 1) * tileSize + halfWidth;
    }
    return nextX;
}

function stepNroMovement(player, input, deltaMs, world) {
    const dt = Math.min(0.1, Math.max(0, deltaMs / 1000));
    const axisX = Number.isFinite(input?.axisX) ? input.axisX : 0;
    const horizontal = Math.abs(axisX) > 0.03
        ? Math.max(-1, Math.min(1, axisX))
        : Number(Boolean(input?.right)) - Number(Boolean(input?.left));
    const verticalInput = Number.isFinite(input?.axisY)
        ? input.axisY
        : Number(Boolean(input?.down)) - Number(Boolean(input?.up));
    const vertical = Math.max(-1, Math.min(1, verticalInput));
    const wasFlying = Boolean(player.isFlying);
    const upHeld = Boolean(input?.up);
    // A short up press jumps. Flight is toggled by a client double-tap request;
    // once airborne, holding up keeps vertical flight responsive.
    const flightHeld = Boolean(input?.flight);
    const canUseKi = !Number.isFinite(Number(player.mp)) || Number(player.mp) > 0;
    player.flightUpHoldMs = 0;
    if (canUseKi && (flightHeld || (upHeld && wasFlying))) {
        player.isFlying = true;
        player.flightIdleMs = 0;
    }

    const jumpHeld = !player.isFlying && Boolean(input?.jump || input?.up);
    const jumpPressed = jumpHeld && !player.jumpInputWasDown;
    player.jumpInputWasDown = jumpHeld;
    let previousY = player.y;

    const minPlayableX = world.tileSize + 12;
    const maxPlayableX = world.map.width * world.tileSize - world.tileSize - 12;
    const minimumY = world.tileSize;
    const maximumY = world.map.height * world.tileSize - world.tileSize * 4;

    if (player.isFlying) {
        const kiPerSecond = Math.max(0, Number(world.flightKiPerSecond) || 1);
        if (Number.isFinite(Number(player.mp))) {
            const drainCarry = (Number(player.flightKiDrainCarry) || 0) + kiPerSecond * dt;
            const kiToDrain = Math.floor(drainCarry + 1e-9);
            player.flightKiDrainCarry = drainCarry - kiToDrain;
            if (kiToDrain > 0) player.mp = Math.max(0, Number(player.mp) - kiToDrain);
            if (player.mp <= 0) {
                player.isFlying = false;
                player.velocityY = 0;
                player.flightKiDrainCarry = 0;
            }
        }
    }

    if (player.isFlying) {
        const flightSpeed = Math.max(0, Number(world.flightSpeedPxPerSecond) || world.runSpeedPxPerSecond);
        const horizontalSpeed = flightSpeed;
        let moveX = horizontal;
        let moveY = vertical;
        const magnitude = Math.hypot(moveX, moveY);
        if (magnitude > 1) {
            moveX /= magnitude;
            moveY /= magnitude;
        }
        player.facing = moveX === 0 ? (player.facing || 1) : Math.sign(moveX);
        player.velocityX = moveX * horizontalSpeed;
        const requestedX = player.x + player.velocityX * dt;
        const resolvedX = resolveHorizontalCollision(player, requestedX, moveX, world);
        player.x = Math.max(minPlayableX, Math.min(maxPlayableX, resolvedX));
        if (player.x !== requestedX) player.velocityX = 0;
        player.grounded = false;
        const requestedY = player.y + moveY * flightSpeed * dt;
        const solidTiles = world.solidTileValues || world.topTileValues;
        const collisionY = moveY > 0
            ? findLandingSurface(world.map, solidTiles, player.x, player.y, requestedY, world.tileSize, player.width)
            : moveY < 0
                ? findCeilingSurface(world.map, solidTiles, player.x, player.y, requestedY, world.tileSize, player.width, player.height)
                : null;
        const resolvedY = collisionY === null ? requestedY : collisionY;
        player.y = Math.max(minimumY, Math.min(maximumY, resolvedY));
        player.velocityY = collisionY === null && player.y === requestedY ? moveY * flightSpeed : 0;
        const hasDirectionalMovement = Math.abs(horizontal) > 0.03 || Math.abs(vertical) > 0.03;
        if (upHeld || flightHeld || hasDirectionalMovement) player.flightIdleMs = 0;
        else player.flightIdleMs = (Number(player.flightIdleMs) || 0) + dt * 1000;
        if (!upHeld && !flightHeld && !hasDirectionalMovement
            && player.flightIdleMs >= Math.max(0, Number(world.flightHoverDurationMs) || 1000)) {
            player.isFlying = false;
            player.flightIdleMs = 0;
            player.velocityY = 0;
        } else {
            player.jumpInputWasDown = false;
            return previousY !== player.y || horizontal !== 0 || !wasFlying;
        }
    }

    player.isFlying = false;
    player.facing = horizontal === 0 ? (player.facing || 1) : Math.sign(horizontal);
    player.velocityX = horizontal * world.runSpeedPxPerSecond;
    const requestedX = player.x + player.velocityX * dt;
    const resolvedX = resolveHorizontalCollision(player, requestedX, horizontal, world);
    player.x = Math.max(minPlayableX, Math.min(maxPlayableX, resolvedX));
    if (player.x !== requestedX) player.velocityX = 0;

    if (jumpPressed && player.grounded) {
        player.velocityY = -world.jumpVelocityPxPerSecond;
        player.grounded = false;
    }

    if (!player.grounded) {
        player.velocityY = Math.min(world.maxFallSpeedPxPerSecond, player.velocityY + world.gravityPxPerSecondSquared * dt);
        const requestedY = player.y + player.velocityY * dt;
        const solidTiles = world.solidTileValues || world.topTileValues;
        if (player.velocityY < 0) {
            const ceilingY = findCeilingSurface(
                world.map, solidTiles, player.x, previousY, requestedY,
                world.tileSize, player.width, player.height
            );
            player.y = ceilingY ?? requestedY;
            if (ceilingY !== null) player.velocityY = 0;
        } else {
            const surfaceY = findLandingSurface(
                world.map, solidTiles, player.x, previousY, requestedY, world.tileSize, player.width
            );
            if (surfaceY !== null) {
                player.y = surfaceY;
                player.velocityY = 0;
                player.grounded = true;
            } else {
                player.y = requestedY;
            }
        }
    } else {
        // Only a genuinely empty column lets the player walk off a ledge.
        player.grounded = hasGroundSupport(player, world);
    }

    // Keep falling characters inside the playable area. The map's bottom rows
    // are border art, not walkable ground; return them above the real platforms.
    if (player.y > world.map.height * world.tileSize - world.tileSize * 4) {
        const safeY = world.spawn.y;
        player.x = Math.max(minPlayableX, Math.min(maxPlayableX, player.x));
        player.y = safeY;
        player.velocityY = 0;
        player.grounded = false;
    }

    return previousY !== player.y || horizontal !== 0;
}

module.exports = {
    createNroMovementState,
    findLandingSurface,
    getNroAnimationState,
    getNroMovementInput,
    getNroTileCollisionMasks,
    isNroMovementBlocked,
    resolveHorizontalCollision,
    stepNroMovement,
    toggleNroFlight
};
