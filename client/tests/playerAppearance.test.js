import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNroPlayerAppearance } from '../src/game/playerAppearance.js';

describe('NRO player appearance', () => {
    it('uses the source monkey head/body/leg parts for each active transformation level', () => {
        const expectedHeads = [192, 195, 196, 199, 197, 200, 198];
        expectedHeads.forEach((headPartId, index) => {
            const appearance = resolveNroPlayerAppearance({
                headPartId: 6, bodyPartId: 7, legPartId: 8,
                effects: [{ type: 'monkey_transform', levelMonkey: index + 1, expiresAt: 5000 }]
            }, 4000);
            assert.deepEqual(
                [appearance.headPartId, appearance.bodyPartId, appearance.legPartId],
                [headPartId, 193, 194]
            );
        });
    });

    it('restores the character base parts when the transformation is expired or absent', () => {
        const base = { headPartId: 6, bodyPartId: 7, legPartId: 8 };
        assert.deepEqual(resolveNroPlayerAppearance({
            ...base, effects: [{ type: 'monkey_transform', levelMonkey: 1, expiresAt: 4000 }]
        }, 4000), { ...base, effects: [{ type: 'monkey_transform', levelMonkey: 1, expiresAt: 4000 }] });
        assert.deepEqual(resolveNroPlayerAppearance(base, 0), base);
    });
});
