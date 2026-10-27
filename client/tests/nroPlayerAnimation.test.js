import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getNroAnimationFrameIndices } from '../src/game/nroPlayerAnimation.js';

const sourceParts = {
    head: { frames: Array.from({ length: 3 }, (_, index) => [17 + index, 0, 0]) },
    body: { frames: Array.from({ length: 17 }, (_, index) => [80 + index, 0, 0]) },
    legs: { frames: Array.from({ length: 14 }, (_, index) => [21 + index, 0, 0]) }
};

describe('NRO player frame pairing', () => {
    it('uses one synchronized body/leg frame throughout the run cycle', () => {
        for (const elapsedMs of [0, 120, 240, 600, 1200]) {
            const frames = getNroAnimationFrameIndices(sourceParts, 'running', elapsedMs);
            assert.equal(frames.body, frames.legs);
            assert.ok(frames.body >= 1 && frames.body <= 7);
        }
    });

    it('uses the same source pose index for both layers while airborne', () => {
        for (const state of ['jumping', 'falling', 'flying']) {
            const frames = getNroAnimationFrameIndices(sourceParts, state, 500);
            assert.equal(frames.body, 8);
            assert.equal(frames.legs, 8);
        }
    });

    it('clamps to the last shared frame when a race or costume has shorter parts', () => {
        const frames = getNroAnimationFrameIndices({
            head: { frames: [[1, 0, 0]] },
            body: { frames: Array.from({ length: 6 }, () => [1, 0, 0]) },
            legs: { frames: Array.from({ length: 3 }, () => [1, 0, 0]) }
        }, 'flying');
        assert.equal(frames.body, 2);
        assert.equal(frames.legs, 2);
        assert.equal(frames.head, 0);
    });

    it('keeps the standing pose at frame zero', () => {
        assert.deepEqual(getNroAnimationFrameIndices(sourceParts, 'standing'), {
            head: 0, body: 0, legs: 0
        });
    });
});
