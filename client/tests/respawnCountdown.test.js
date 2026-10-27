import test from 'node:test';
import assert from 'node:assert/strict';
import gameReducer, { updateStats } from '../src/store/gameSlice.js';

test('stores a non-negative authoritative respawn countdown from player snapshots', () => {
    const deadState = gameReducer(undefined, updateStats({ hp: 0, respawnRemainingMs: 4321 }));
    assert.equal(deadState.hp, 0);
    assert.equal(deadState.respawnRemainingMs, 4321);

    const tickedState = gameReducer(deadState, updateStats({ respawnRemainingMs: -10 }));
    assert.equal(tickedState.respawnRemainingMs, 0);

    const respawnedState = gameReducer(tickedState, updateStats({ hp: 500, respawnRemainingMs: 0 }));
    assert.equal(respawnedState.hp, 500);
    assert.equal(respawnedState.respawnRemainingMs, 0);
});
