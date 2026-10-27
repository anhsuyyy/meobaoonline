const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { RESPAWN_DELAY_MS, tickNroRespawn } = require('../src/game/nroRespawn');

describe('NRO authoritative player respawn', () => {
    it('locks movement and schedules a server-side delay when HP reaches zero', () => {
        const player = { hp: 0, maxHp: 500, isAuto: true, input: { right: true } };
        const result = tickNroRespawn(player, { spawn: { x: 20, y: 40 } }, 1000);
        assert.deepEqual(result, { state: 'countdown', remainingMs: RESPAWN_DELAY_MS });
        assert.equal(player.respawnAt, 1000 + RESPAWN_DELAY_MS);
        assert.equal(player.isAuto, false);
        assert.equal(player.input.right, false);
    });

    it('does not revive before the timer and restores the player at the map spawn after it', () => {
        const player = { hp: 0, maxHp: 500, x: 900, y: 900, velocityX: 4, velocityY: 8, respawnAt: 6000 };
        const world = { spawn: { x: 120, y: 384 } };
        assert.equal(tickNroRespawn(player, world, 5999).state, 'countdown');
        assert.equal(player.hp, 0);
        assert.deepEqual(tickNroRespawn(player, world, 6000), {
            state: 'respawned', x: 120, y: 384, hp: 500, maxHp: 500
        });
        assert.equal(player.velocityX, 0);
        assert.equal(player.velocityY, 0);
        assert.equal(player.respawnAt, 0);
    });

    it('waits safely when no valid map spawn exists and clears stale timers for living players', () => {
        const dead = { hp: 0, maxHp: 80, respawnAt: 100 };
        assert.equal(tickNroRespawn(dead, null, 100).state, 'waiting_for_spawn');
        const alive = { hp: 1, respawnAt: 900 };
        assert.equal(tickNroRespawn(alive, { spawn: { x: 0, y: 0 } }, 100).state, 'alive');
        assert.equal(alive.respawnAt, 0);
    });
});
