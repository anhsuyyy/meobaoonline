/**
 * Monster AI: horizontal patrol, retaliate at range, and preserve legacy chase modes.
 */
const { metersToPixels } = require('./units');

class MonsterAI {
    constructor(config) {
        this.id = config.id;
        this.templateId = config.templateId ?? null;
        this.bossPartIds = Array.isArray(config.bossPartIds) ? [...config.bossPartIds] : null;
        this.questOwnerUserId = config.questOwnerUserId || null;
        this.questEncounter = config.questEncounter || null;
        this.invulnerable = config.invulnerable === true;
        this.mapId = config.mapId ?? null;
        this.zoneId = config.zoneId ?? 0;
        this.level = config.level ?? 1;
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
        this.pDame = Number(config.pDame) || 0;
        this.baseDamage = Number(config.baseDamage) || 0;
        this.speedPxPerSecond = config.speedPxPerSecond ?? 0;
        this.aiMode = config.aiMode || 'chase';
        this.patrolRadiusPx = Math.max(0, Number(config.patrolRadiusPx) || 0);
        this.leashRadiusPx = Math.max(this.patrolRadiusPx, Number(config.leashRadiusPx) || 0);
        this.patrolTargetX = null;
        this.nextPatrolAt = Date.now() + 100 + Math.random() * 250;
        this.patrolStartedAt = Date.now();
        this.velocityX = 0;
        this.velocityY = 0;
        this.facing = 1;
        this.canAttack = config.canAttack !== false;
        this.pixelsPerMeter = config.pixelsPerMeter ?? 10;
        this.vision = metersToPixels(config.visionMeters ?? 20, this.pixelsPerMeter);
        this.attackRange = metersToPixels(config.attackRangeMeters ?? 5, this.pixelsPerMeter);
        this.rangedAttackRange = metersToPixels(config.rangedAttackRangeMeters ?? config.visionMeters ?? 15, this.pixelsPerMeter);
        this.aggroDurationMs = Math.max(1000, Number(config.aggroDurationMs) || 10000);
        this.aggroTargetId = null;
        this.focusedTargetId = null;
        this.aggroExpiresAt = 0;
        this.attackSequence = 0;
        this.respawnMs = config.respawnMs || 8000;
        this.attackCooldownMs = config.attackCooldownMs || 1000;
        this.targetScanIntervalMs = config.targetScanIntervalMs ?? this.attackCooldownMs;
        this.exp = config.exp || 30;
        this.dtnFactor = config.dtnFactor || 0.1;
        this.potentialPercent = Math.max(0, Number(config.potentialPercent) || this.dtnFactor * 100);
        this.fixedPotentialVariance = Number.isFinite(config.potentialVariance) ? config.potentialVariance : null;
        this.rollMaxPotential();
        this.goldMin = config.goldMin || 15;
        this.goldMax = config.goldMax || 35;

        this.state = 'Patrol';
        this.isDead = false;
        this.lastAttackTime = 0;
        this.lastTargetScanAt = null;
        this.respawnTimer = null;
        this.effects = Array.isArray(config.effects) ? config.effects.map((effect) => ({ ...effect })) : [];
    }

    takeDamage(damage) {
        if (this.isDead) return { damageDealt: 0, isDead: true };
        if (this.invulnerable) return { damageDealt: 0, isDead: false };

        const actualDamage = Math.min(this.hp, damage);
        this.hp -= actualDamage;

        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
            this.state = 'Dead';
            this.velocityX = 0;
            this.velocityY = 0;
            // Control/buff effects belong to the current life and must not leak
            // into the next spawn after the respawn timer restores this mob.
            this.effects = [];
            this.scheduleRespawn();
            return { damageDealt: actualDamage, isDead: true };
        }

        return { damageDealt: actualDamage, isDead: false };
    }

    provoke(targetId, now = Date.now()) {
        if (this.isDead || !targetId) return;
        this.aggroTargetId = targetId;
        this.focusedTargetId = targetId;
        this.aggroExpiresAt = now + this.aggroDurationMs;
    }

    scheduleRespawn() {
        if (this.respawnTimer) clearTimeout(this.respawnTimer);
        this.respawnTimer = setTimeout(() => {
            this.hp = this.maxHp;
            this.rollMaxPotential();
            this.x = this.originX;
            this.y = this.originY;
            this.isDead = false;
            this.state = 'Patrol';
            this.patrolTargetX = null;
            this.aggroTargetId = null;
            this.focusedTargetId = null;
            this.aggroExpiresAt = 0;
            this.attackSequence = 0;
            this.nextPatrolAt = Date.now() + 100 + Math.random() * 250;
            this.patrolStartedAt = Date.now();
            this.velocityX = 0;
            this.velocityY = 0;
            this.respawnTimer = null;
        }, this.respawnMs);
    }

    rollMaxPotential() {
        const variance = this.fixedPotentialVariance ?? (Math.floor(Math.random() * 4) - 2);
        this.maxPotential = Math.max(1, Math.floor(this.maxHp * (this.potentialPercent + variance) / 100));
    }

    update(players, deltaMs = 50, now = Date.now()) {
        if (this.isDead) return null;
        if (this.effects?.some((effect) => effect.type === 'stun' && effect.expiresAt > now)) {
            this.state = 'Stunned';
            this.velocityX = 0;
            this.velocityY = 0;
            return null;
        }

        // Stationary and roaming NRO mobs do not acquire nearby players by sight.
        // Roaming mobs only retaliate against a recent attacker; legacy AI keeps
        // its original sight-based chase behavior.
        if (this.aiMode === 'stationary'
            && this.lastTargetScanAt !== null
            && now - this.lastTargetScanAt < this.targetScanIntervalMs) return null;
        if (this.aiMode === 'stationary') this.lastTargetScanAt = now;

        const taunt = this.effects?.find((effect) => effect.type === 'taunt' && effect.expiresAt > now);
        const forcedTarget = taunt ? players[taunt.sourceId] : null;

        let target = forcedTarget?.hp > 0 ? forcedTarget : null;
        let minDistance = this.vision;

        // Keep a focused player until they leave a slightly wider retention
        // radius. When that lock breaks, acquire the nearest visible player.
        if (!target && this.aiMode === 'roam' && this.focusedTargetId) {
            const focused = players[this.focusedTargetId];
            const distance = focused ? Math.hypot(focused.x - this.x, focused.y - this.y) : Infinity;
            const unavailable = !focused || focused.hp <= 0 || focused.satelliteDefenseActive
                || focused.effects?.some((effect) => effect.type === 'invisible' && effect.expiresAt > now);
            if (!unavailable && distance <= this.rangedAttackRange * 1.35) {
                target = focused;
                minDistance = distance;
            } else this.focusedTargetId = null;
        }

        if (!target && this.aiMode === 'roam' && this.aggroTargetId) {
            const provoker = players[this.aggroTargetId];
            const distance = provoker ? Math.hypot(provoker.x - this.x, provoker.y - this.y) : Infinity;
            const hidden = provoker?.satelliteDefenseActive
                || provoker?.effects?.some((effect) => effect.type === 'invisible' && effect.expiresAt > now);
            if (provoker?.hp > 0 && !hidden && now < this.aggroExpiresAt && distance <= this.rangedAttackRange) {
                target = provoker;
                minDistance = distance;
            } else if (now >= this.aggroExpiresAt || distance > this.rangedAttackRange || !provoker || provoker.hp <= 0 || hidden) {
                this.aggroTargetId = null;
                this.aggroExpiresAt = 0;
            }
        }

        // 1. Tìm người chơi gần nhất trong tầm nhìn
        if (!target && this.aiMode !== 'roam') {
            for (const pid in players) {
                const p = players[pid];
                if (this.questOwnerUserId && String(p?.userId) !== String(this.questOwnerUserId)) continue;
                if (!p || p.hp <= 0 || p.satelliteDefenseActive
                    || p.effects?.some((effect) => effect.type === 'invisible' && effect.expiresAt > now)) continue;

                const dist = Math.hypot(p.x - this.x, p.y - this.y);
                const targetLimit = this.aiMode === 'stationary' ? this.attackRange : minDistance;
                if (this.aiMode === 'stationary' ? dist <= targetLimit : dist < targetLimit) {
                    minDistance = dist;
                    target = p;
                }
            }
        } else if (target) {
            minDistance = Math.hypot(target.x - this.x, target.y - this.y);
        }

        if (!target && this.aiMode === 'roam') {
            let nearestDistance = this.rangedAttackRange;
            for (const player of Object.values(players)) {
                if (!player || player.hp <= 0 || player.satelliteDefenseActive
                    || player.effects?.some((effect) => effect.type === 'invisible' && effect.expiresAt > now)) continue;
                const distance = Math.hypot(player.x - this.x, player.y - this.y);
                if (distance <= nearestDistance) {
                    target = player;
                    nearestDistance = distance;
                }
            }
            if (target) minDistance = nearestDistance;
        }
        this.focusedTargetId = target?.id || null;

        // NRO mobs stop patrolling and retaliate while the attacker remains in
        // range. Once the attacker leaves that range, clear aggro and resume patrol.
        // Facing is authoritative even when the monster stands still to attack.
        if (target && Math.abs(target.x - this.x) > 0.001) {
            this.facing = Math.sign(target.x - this.x);
        }
        if (this.aiMode === 'roam') {
            if (target && minDistance <= this.rangedAttackRange) {
                this.state = this.canAttack ? 'Attack' : 'Patrol';
                this.velocityX = 0;
                this.velocityY = 0;
                this.patrolTargetX = null;
                if (this.canAttack && now - this.lastAttackTime >= this.attackCooldownMs) return target;
                return null;
            }
            this.patrolHorizontally(deltaMs, now);
            return null;
        }

        // 2. Chuyển đổi trạng thái (State Machine)
        if (target) {
            const currentAttackRange = this.aiMode === 'roam' ? this.rangedAttackRange : this.attackRange;
            if (minDistance <= currentAttackRange) {
                this.state = this.canAttack ? 'Attack' : 'Patrol';
                this.velocityX = 0;
                this.velocityY = 0;
                this.patrolTargetX = null;
                return this.canAttack && now - this.lastAttackTime >= this.attackCooldownMs ? target : null;
            } else {
                if (this.aiMode === 'stationary' || this.aiMode === 'roam') {
                    this.state = 'Patrol';
                    this.velocityX = 0;
                    return null;
                }
                this.state = 'Chase';
                this.patrolTargetX = null;
                if (!this.effects?.some((effect) => effect.type === 'root' && effect.expiresAt > now)) {
                    this.moveToward(target.x, target.y, deltaMs);
                }
            }
        } else {
            // Không có người chơi ở gần -> Đi về vị trí gốc
            const distToOrigin = Math.hypot(this.originX - this.x, this.originY - this.y);
            if (distToOrigin > 5) {
                this.state = 'Return';
                if (!this.effects?.some((effect) => effect.type === 'root' && effect.expiresAt > now)) {
                    this.moveToward(this.originX, this.originY, deltaMs);
                }
            } else {
                this.x = this.originX;
                this.y = this.originY;
                this.velocityX = 0;
                this.velocityY = 0;
                this.state = 'Patrol';
            }
        }
        return null;
    }

    patrolHorizontally(deltaMs, now) {
        if (this.patrolRadiusPx <= 0 || this.speedPxPerSecond <= 0) {
            this.velocityX = 0;
            this.velocityY = 0;
            this.state = 'Patrol';
            return;
        }
        // Continuous triangular patrol keeps movement visible and avoids long
        // random idle gaps while keeping the mob inside its horizontal leash.
        const radius = this.patrolRadiusPx;
        const travelPx = ((now - this.patrolStartedAt) * this.speedPxPerSecond / 1000 + radius) % (radius * 4);
        const movingRight = travelPx < radius * 2;
        const offset = movingRight ? -radius + travelPx : radius * 3 - travelPx;
        this.x = this.originX + offset;
        this.y = this.originY;
        this.velocityX = movingRight ? this.speedPxPerSecond : -this.speedPxPerSecond;
        this.velocityY = 0;
        this.facing = movingRight ? 1 : -1;
        this.state = 'Patrol';
    }

    moveToward(targetX, targetY, deltaMs) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.hypot(dx, dy);
        if (distance === 0) return;
        const step = Math.min(distance, this.speedPxPerSecond * deltaMs / 1000);
        this.facing = dx === 0 ? this.facing : Math.sign(dx);
        this.velocityX = distance > 0 ? (dx / distance) * this.speedPxPerSecond : 0;
        this.velocityY = distance > 0 ? (dy / distance) * this.speedPxPerSecond : 0;
        this.x += (dx / distance) * step;
        this.y += (dy / distance) * step;
    }
}

module.exports = MonsterAI;
