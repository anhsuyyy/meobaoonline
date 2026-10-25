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
        speed: 2,
        vision: 200,
        range: 50,
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
        assert.ok(monster.x > 400); // Đã di chuyển hướng về phía người chơi
    });

    it('chuyển sang trạng thái Attack khi người chơi ở cự ly cận chiến (<= 50px)', () => {
        const monster = new MonsterAI(sampleConfig);
        const players = {
            p1: { x: 440, y: 300, hp: 500 } // Khoảng cách 40px (<= 50px)
        };

        monster.update(players);
        assert.equal(monster.state, 'Attack');
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
        const monster = new MonsterAI(sampleConfig);
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

        // Xóa timer test để tránh leak
        if (monster.respawnTimer) clearTimeout(monster.respawnTimer);
    });
});
