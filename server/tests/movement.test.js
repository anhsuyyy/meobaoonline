const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    parseMovementInput,
    createTokenBucket,
    getMovementSpeedPxPerSecond,
    getMovementDelta,
    clampPlayerPosition
} = require('../src/game/movement');

describe('authoritative movement input', () => {
    it('accepts only a boolean direction object with no extra fields', () => {
        assert.deepEqual(parseMovementInput({ left: false, right: true, up: false, down: false }), {
            left: false, right: true, up: false, down: false
        });
        assert.equal(parseMovementInput({ right: 1 }), null);
        assert.equal(parseMovementInput({ right: true, x: 10000 }), null);
        assert.deepEqual(parseMovementInput({ axisX: 0.5, axisY: -0.25 }), { axisX: 0.5, axisY: -0.25 });
        assert.deepEqual(parseMovementInput({ left: false, right: false, up: true, down: false, jump: true, flight: true }), {
            left: false, right: false, up: true, down: false, jump: true, flight: true
        });
        assert.equal(parseMovementInput({ flight: 'yes' }), null);
        assert.equal(parseMovementInput({ axisX: 2, axisY: 0 }), null);
        assert.equal(parseMovementInput(null), null);
    });

    it('normalizes diagonal movement to the configured speed', () => {
        const delta = getMovementDelta({ left: false, right: true, up: true, down: false }, 40, 50);
        assert.ok(Math.abs(Math.hypot(delta.x, delta.y) - 2) < 1e-9);
        assert.equal(getMovementDelta({ left: false, right: false, up: false, down: false }, 40, 50).x, 0);
    });

    it('uses the increased 8m/s base speed, applies AGI bonus, and scales movement to tick duration', () => {
        const baseSpeed = getMovementSpeedPxPerSecond(8, 0, 0.1, 10);
        const agileSpeed = getMovementSpeedPxPerSecond(8, 10, 0.1, 10);
        const equippedSpeed = getMovementSpeedPxPerSecond(8, 0, 0.1, 10, 50);
        assert.equal(baseSpeed, 80);
        assert.equal(agileSpeed, 81);
        assert.equal(equippedSpeed, 120);
        assert.equal(getMovementDelta({ right: true, left: false, up: false, down: false }, baseSpeed, 33).x, 2.64);
        assert.equal(getMovementDelta({ right: true, left: false, up: false, down: false }, baseSpeed, 100).x, 8);
    });

    it('preserves analog stick magnitude and normalizes full diagonal input', () => {
        const halfStick = getMovementDelta({ axisX: 0.5, axisY: 0 }, 40, 50);
        const fullDiagonal = getMovementDelta({ axisX: 1, axisY: 1 }, 40, 50);
        assert.equal(halfStick.x, 1);
        assert.equal(halfStick.y, 0);
        assert.ok(Math.abs(Math.hypot(fullDiagonal.x, fullDiagonal.y) - 2) < 1e-9);
    });

    it('clamps player center to map bounds using the player hitbox', () => {
        const player = { width: 40, height: 40 };
        assert.deepEqual(clampPlayerPosition(player, { x: -50, y: 999 }, { width: 800, height: 600 }), { x: 20, y: 580 });
    });

    it('limits event bursts and refills the bucket over time', () => {
        let now = 0;
        const takeToken = createTokenBucket({ capacity: 2, refillPerSecond: 1, now: () => now });
        assert.equal(takeToken(), true);
        assert.equal(takeToken(), true);
        assert.equal(takeToken(), false);
        now = 1000;
        assert.equal(takeToken(), true);
    });
});
