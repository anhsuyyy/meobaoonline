const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseMovementInput, createTokenBucket, getMovementDelta, clampPlayerPosition } = require('../src/game/movement');

describe('authoritative movement input', () => {
    it('accepts only a boolean direction object with no extra fields', () => {
        assert.deepEqual(parseMovementInput({ left: false, right: true, up: false, down: false }), {
            left: false, right: true, up: false, down: false
        });
        assert.equal(parseMovementInput({ right: 1 }), null);
        assert.equal(parseMovementInput({ right: true, x: 10000 }), null);
        assert.equal(parseMovementInput(null), null);
    });

    it('normalizes diagonal movement to the configured speed', () => {
        const delta = getMovementDelta({ left: false, right: true, up: true, down: false }, 5);
        assert.ok(Math.abs(Math.hypot(delta.x, delta.y) - 5) < 1e-9);
        assert.equal(getMovementDelta({ left: false, right: false, up: false, down: false }, 5).x, 0);
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
