const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const MonsterAI = require('../src/game/MonsterAI');

describe('MonsterAI - State Machine V2.0', () => {
    const sampleConfig = {
        id: 'monster_test_1',
        name: 'Chuột Nhắt Test',
        type: 'normal',
        x: 400,
        y: 300,
        maxHp: 100,
        atk: 10,
        speedPxPerSecond: 40,
        pixelsPerMeter: 10,
        visionMeters: 20,
        attackRangeMeters: 5,
        respawnMs: 500
    };

    it('khởi tạo quái vật với trạng thái mặc định Patrol', () => {
        const monster = new MonsterAI(sampleConfig);
        assert.equal(monster.state, 'Patrol');
        assert.equal(monster.hp, 100);
        assert.equal(monster.isDead, false);
    });

    it('chuyển sang trạng thái Chase khi người chơi xuất hiện trong tầm nhìn (200px)', () => {
        const monster = new MonsterAI(sampleConfig);
        const players = {
            p1: { x: 480, y: 300, hp: 500 } // Khoảng cách 80px (nằm trong 50px - 200px)
        };

        monster.update(players);
        assert.equal(monster.state, 'Chase');
        assert.equal(monster.x, 402); // 40px/s trong một tick 50ms
    });

    it('chuyển sang trạng thái Attack khi người chơi ở cự ly cận chiến (<= 50px)', () => {
        const monster = new MonsterAI(sampleConfig);
        const players = {
            p1: { x: 440, y: 300, hp: 500 } // Khoảng cách 40px (<= 50px)
        };

        monster.update(players);
        assert.equal(monster.state, 'Attack');
    });

    it('bỏ qua người chơi đang được vệ tinh phòng thủ bảo vệ', () => {
        const monster = new MonsterAI({ ...sampleConfig, aiMode: 'stationary' });
        const target = monster.update({ p1: { x: 440, y: 300, hp: 500, satelliteDefenseActive: true } });
        assert.equal(target, null);
        assert.equal(monster.state, 'Patrol');
    });

    it('does not attack while stunned and resumes target selection when stun expires', () => {
        const monster = new MonsterAI({ ...sampleConfig, effects: [{ type: 'stun', expiresAt: 1_500 }] });
        const players = { p1: { x: 440, y: 300, hp: 500 } };

        assert.equal(monster.update(players, 50, 1_000), null);
        assert.equal(monster.state, 'Stunned');
        assert.equal(monster.lastAttackTime, 0);
        assert.equal(monster.update(players, 50, 1_500), players.p1);
        assert.equal(monster.state, 'Attack');
    });

    it('keeps a rooted monster in place while it chases a visible target', () => {
        const monster = new MonsterAI({ ...sampleConfig, effects: [{ type: 'root', expiresAt: 1_500 }] });
        const target = { x: 500, y: 300, hp: 500 };

        assert.equal(monster.update({ p1: target }, 50, 1_000), null);
        assert.equal(monster.state, 'Chase');
        assert.equal(monster.x, 400);
    });

    it('forces a taunted monster to pursue the effect source instead of a closer player', () => {
        const monster = new MonsterAI({ ...sampleConfig, effects: [{ type: 'taunt', sourceId: 'p1', expiresAt: 1_500 }] });
        const players = {
            p1: { x: 500, y: 300, hp: 500 },
            p2: { x: 420, y: 300, hp: 500 }
        };

        monster.update(players, 50, 1_000);
        assert.equal(monster.state, 'Chase');
        assert.equal(monster.x, 402);
    });

    it('ignores an invisible target only while the invisibility effect is active', () => {
        const monster = new MonsterAI({ ...sampleConfig, aiMode: 'stationary' });
        const players = { p1: { x: 440, y: 300, hp: 500, effects: [{ type: 'invisible', expiresAt: 1_500 }] } };

        assert.equal(monster.update(players, 50, 1_000), null);
        assert.equal(monster.state, 'Patrol');
        assert.equal(monster.update(players, 50, 1_500), null, 'stationary NRO mobs do not rescan every tick');
        assert.equal(monster.update(players, 50, 3_000), players.p1);
        assert.equal(monster.state, 'Attack');
    });

    it('scans nearby players for stationary NRO mobs at the source 2-second interval', () => {
        const monster = new MonsterAI({ ...sampleConfig, aiMode: 'stationary', targetScanIntervalMs: 2_000 });
        const players = { p1: { x: 440, y: 300, hp: 500 } };

        assert.equal(monster.update(players, 50, 1_000), players.p1);
        assert.equal(monster.lastTargetScanAt, 1_000);
        assert.equal(monster.update(players, 50, 2_999), null);
        assert.equal(monster.update(players, 50, 3_000), players.p1);
        assert.equal(monster.lastTargetScanAt, 3_000);
    });

    it('chuyển sang trạng thái Return khi người chơi đi ra ngoài tầm nhìn', () => {
        const monster = new MonsterAI(sampleConfig);
        monster.x = 450; // Quái đã bị lôi ra khỏi vị trí gốc (400)

        // Không có ai ở gần
        monster.update({});
        assert.equal(monster.state, 'Return');
        assert.ok(monster.x < 450); // Đang di chuyển lùi về 400
    });

    it('xử lý nhận sát thương và chuyển sang Dead khi HP = 0', () => {
        const monster = new MonsterAI({
            ...sampleConfig,
            effects: [{ type: 'stun', expiresAt: Date.now() + 60_000 }, { type: 'taunt', sourceId: 'p1', expiresAt: Date.now() + 60_000 }]
        });
        const hit1 = monster.takeDamage(60);
        assert.equal(hit1.damageDealt, 60);
        assert.equal(hit1.isDead, false);
        assert.equal(monster.hp, 40);

        const hit2 = monster.takeDamage(50);
        assert.equal(hit2.damageDealt, 40); // Chỉ trừ tối đa lượng máu còn lại
        assert.equal(hit2.isDead, true);
        assert.equal(monster.hp, 0);
        assert.equal(monster.state, 'Dead');
        assert.equal(monster.isDead, true);
        assert.deepEqual(monster.effects, [], 'active effects end with the current monster life');

        // Xóa timer test để tránh leak
        if (monster.respawnTimer) clearTimeout(monster.respawnTimer);
    });
});
