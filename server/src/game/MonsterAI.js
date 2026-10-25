/**
 * Monster AI theo State Machine V2.0: Patrol, Chase, Attack, Return, Dead
 */

class MonsterAI {
    constructor(config) {
        this.id = config.id;
        this.name = config.name || 'Quái';
        this.type = config.type || 'normal';
        this.x = config.x;
        this.y = config.y;
        this.originX = config.x;
        this.originY = config.y;
        this.width = config.width || 40;
        this.height = config.height || 40;
        
        this.maxHp = config.maxHp || 180;
        this.hp = this.maxHp;
        this.atk = config.atk || 15;
        this.speed = config.speed || 2;
        this.vision = config.vision || 200; // Ngưỡng phát hiện
        this.attackRange = config.range || 50; // Ngưỡng vào tầm đánh
        this.respawnMs = config.respawnMs || 8000;
        this.exp = config.exp || 30;
        this.dtnFactor = config.dtnFactor || 0.1;
        this.goldMin = config.goldMin || 15;
        this.goldMax = config.goldMax || 35;

        this.state = 'Patrol';
        this.isDead = false;
        this.lastAttackTime = 0;
        this.respawnTimer = null;
    }

    takeDamage(damage) {
        if (this.isDead) return { damageDealt: 0, isDead: true };

        const actualDamage = Math.min(this.hp, damage);
        this.hp -= actualDamage;

        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
            this.state = 'Dead';
            this.scheduleRespawn();
            return { damageDealt: actualDamage, isDead: true };
        }

        return { damageDealt: actualDamage, isDead: false };
    }

    scheduleRespawn() {
        if (this.respawnTimer) clearTimeout(this.respawnTimer);
        this.respawnTimer = setTimeout(() => {
            this.hp = this.maxHp;
            this.x = this.originX;
            this.y = this.originY;
            this.isDead = false;
            this.state = 'Patrol';
            this.respawnTimer = null;
        }, this.respawnMs);
    }

    update(players) {
        if (this.isDead) return;

        let target = null;
        let minDistance = this.vision;

        // 1. Tìm người chơi gần nhất trong tầm nhìn
        for (const pid in players) {
            const p = players[pid];
            if (!p || p.hp <= 0) continue;

            const dist = Math.hypot(p.x - this.x, p.y - this.y);
            if (dist < minDistance) {
                minDistance = dist;
                target = p;
            }
        }

        // 2. Chuyển đổi trạng thái (State Machine)
        if (target) {
            if (minDistance <= this.attackRange) {
                this.state = 'Attack';
            } else {
                this.state = 'Chase';
                const angle = Math.atan2(target.y - this.y, target.x - this.x);
                this.x += Math.cos(angle) * this.speed;
                this.y += Math.sin(angle) * this.speed;
            }
        } else {
            // Không có người chơi ở gần -> Đi về vị trí gốc
            const distToOrigin = Math.hypot(this.originX - this.x, this.originY - this.y);
            if (distToOrigin > 5) {
                this.state = 'Return';
                const angle = Math.atan2(this.originY - this.y, this.originX - this.x);
                this.x += Math.cos(angle) * this.speed;
                this.y += Math.sin(angle) * this.speed;
            } else {
                this.x = this.originX;
                this.y = this.originY;
                this.state = 'Patrol';
            }
        }
    }
}

module.exports = MonsterAI;