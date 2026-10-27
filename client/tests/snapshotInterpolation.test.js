import assert from 'node:assert/strict';
import test from 'node:test';
import {
    NRO_REMOTE_INTERPOLATION_DELAY_MS,
    pushPositionSnapshot,
    samplePositionSnapshot
} from '../src/game/snapshotInterpolation.js';

test('samples remote movement between server snapshots at the interpolation delay', () => {
    let history = [];
    history = pushPositionSnapshot(history, { x: 100, y: 200, facing: 1 }, 0);
    history = pushPositionSnapshot(history, { x: 140, y: 240, facing: -1 }, 50);

    assert.equal(NRO_REMOTE_INTERPOLATION_DELAY_MS, 100);
    assert.deepEqual(samplePositionSnapshot(history, 25), { x: 120, y: 220, facing: -1 });
    assert.deepEqual(samplePositionSnapshot(history, 40), { x: 132, y: 232, facing: -1 });
});

test('holds the latest authoritative position without extrapolating and caps history', () => {
    let history = [];
    for (let tick = 0; tick < 80; tick++) {
        history = pushPositionSnapshot(history, { x: tick, y: tick * 2 }, tick * 50, 8);
    }

    assert.equal(history.length, 8);
    assert.deepEqual(samplePositionSnapshot(history, 10_000), { x: 79, y: 158, facing: 1 });
});

test('ignores malformed and out-of-order snapshots while replacing duplicate receive times', () => {
    let history = [];
    history = pushPositionSnapshot(history, { x: 1, y: 2 }, 10);
    history = pushPositionSnapshot(history, { x: 3, y: 4 }, 20);
    history = pushPositionSnapshot(history, { x: 9, y: 9 }, 15);
    history = pushPositionSnapshot(history, { x: 5, y: 6 }, 20);
    history = pushPositionSnapshot(history, { x: Infinity, y: 7 }, 30);

    assert.deepEqual(history.map(({ x, y, receivedAt }) => ({ x, y, receivedAt })), [
        { x: 1, y: 2, receivedAt: 10 },
        { x: 5, y: 6, receivedAt: 20 }
    ]);
});
