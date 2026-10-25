const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { clampToLeashCircle, findNearestValidTarget } = require('../src/game/autoFarm');

describe('AutoFarm Engine - Leash Clamp & Target Selection', () => {
    const anchor = { x: 300, y: 300 };
    const radius = 300;

    it('vị trí mong muốn nằm trong vòng tròn bán kính 300px phải được giữ nguyên', () => {
        const insidePos = { x: 350, y: 350 };
        const clamped = clampToLeashCircle(anchor, insidePos, radius);
        assert.equal(clamped.x, 350);
        assert.equal(clamped.y, 350);
    });

    it('vị trí mong muốn vượt quá bán kính 300px phải bị kẹp về đúng biên vòng tròn', () => {
        const farAwayPos = { x: 800, y: 300 }; // Cách 500px theo trục X
        const clamped = clampToLeashCircle(anchor, farAwayPos, radius);

        assert.equal(clamped.x, 600); // 300 + 300
        assert.equal(clamped.y, 300);

        const distToAnchor = Math.hypot(clamped.x - anchor.x, clamped.y - anchor.y);
        assert.ok(Math.abs(distToAnchor - radius) <= 1);
    });

    it('xử lý an toàn khi anchor null hoặc bán kính âm', () => {
        const pos = { x: 100, y: 100 };
        const result1 = clampToLeashCircle(null, pos, radius);
        assert.equal(result1.x, 100);

        const result2 = clampToLeashCircle(anchor, pos, -10);
        assert.equal(result2.x, 100);
    });

    it('findNearestValidTarget chọn chính xác quái gần nhất trong bán kính 300px', () => {
        const playerPos = { x: 200, y: 200 };
        const monsters = {
            m1: { id: 'm1', x: 250, y: 200, hp: 100, isDead: false }, // dist: 50
            m2: { id: 'm2', x: 220, y: 200, hp: 100, isDead: false }, // dist: 20 (gần nhất)
            m3: { id: 'm3', x: 600, y: 600, hp: 100, isDead: false }, // dist > 500
            m4: { id: 'm4', x: 205, y: 200, hp: 0, isDead: true }     // quái đã chết (bỏ qua)
        };

        const { target, distance } = findNearestValidTarget(playerPos, monsters, 300);
        assert.ok(target !== null);
        assert.equal(target.id, 'm2');
        assert.equal(distance, 20);
    });

    it('findNearestValidTarget trả về null khi không có quái hợp lệ trong bán kính', () => {
        const playerPos = { x: 100, y: 100 };
        const monsters = {
            m1: { id: 'm1', x: 800, y: 800, hp: 100, isDead: false }
        };

        const { target } = findNearestValidTarget(playerPos, monsters, 300);
        assert.equal(target, null);
    });
});
