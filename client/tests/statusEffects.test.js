import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toStatusEffectBadges } from '../src/features/hud/nroStatusEffects.js';

describe('NRO status effect HUD badges', () => {
    it('shows combat buffs and control debuffs with remaining time', () => {
        const badges = toStatusEffectBadges([
            { type: 'damage_immunity', remainingMs: 15_001 },
            { type: 'stun', remainingMs: 1_200 },
            { type: 'root', remainingMs: 0 }
        ]);

        assert.deepEqual(badges.map(({ type, label, seconds, debuff }) => ({ type, label, seconds, debuff })), [
            { type: 'damage_immunity', label: 'Khiên năng lượng', seconds: 16, debuff: false },
            { type: 'stun', label: 'Choáng', seconds: 2, debuff: true },
            { type: 'root', label: 'Trói chân', seconds: 0, debuff: true }
        ]);
    });

    it('ignores unknown effects and malformed effect data', () => {
        assert.deepEqual(toStatusEffectBadges([
            null, { type: 'new_unported_status', remainingMs: 5000 }, { type: 'slow', remainingMs: 'bad' }
        ]).map(({ label, seconds }) => ({ label, seconds })), [
            { label: 'Chậm', seconds: 0 }
        ]);
        assert.deepEqual(toStatusEffectBadges(null), []);
    });

    it('shows NRO charm variants with their active countdowns', () => {
        assert.deepEqual(toStatusEffectBadges([
            { type: 'nro_charm_tri_tue', remainingMs: 3_600_000 },
            { type: 'nro_charm_tri_tue_x3', remainingMs: 60_000 },
            { type: 'nro_charm_tri_tue_x4', remainingMs: 1 },
            { type: 'nro_charm_deo_dai', remainingMs: 20_000 },
            { type: 'nro_charm_thu_hut', remainingMs: 5_000 }
        ]).map(({ label, seconds }) => ({ label, seconds })), [
            { label: 'Bùa Trí Tuệ', seconds: 3600 },
            { label: 'Bùa Trí Tuệ x3', seconds: 60 },
            { label: 'Bùa Trí Tuệ x4', seconds: 1 },
            { label: 'Bùa Dẻo Dai', seconds: 20 },
            { label: 'Bùa Thu Hút', seconds: 5 }
        ]);
    });
});
