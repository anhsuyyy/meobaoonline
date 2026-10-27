const { calculateSkillDamage, applyDamagePercentSteps } = require('./combat');
const { getNroProgress, getPotentialReward, getNroMobAttackDamage } = require('./nroProgression');
const { getNroCharmPotentialMultipliers } = require('./nroCharms');
const { metersToPixels } = require('./units');
const { clampPlayerPosition } = require('./movement');
const { getBasicAttackCooldownMs } = require('./attackSpeed');
const { getNroPowerLimit } = require('./nroTraining');
const { canNroPlayerAttack } = require('./nroSkills');
const { consumeNroStaminaForAttack } = require('./nroStamina');

const DAMAGE_TYPES = new Set([
    'melee', 'projectile', 'aoe_melee', 'aoe_debuff', 'aoe_target',
    'aoe_zone', 'aoe_burst', 'projectile_cc', 'cone_aoe', 'dash_target', 'channeling'
]);
const MELEE_SKILL_TYPES = new Set(['basic', 'melee', 'aoe_melee', 'aoe_debuff', 'dash_target']);
const NRO_ATTACK_SKILL_TYPES = new Set([
    'basic', 'melee', 'projectile', 'aoe_melee', 'aoe_debuff', 'aoe_target',
    'aoe_zone', 'aoe_burst', 'projectile_cc', 'cone_aoe', 'dash_target', 'channeling'
]);

function clampSkillLevel(level, maxLevel) {
    return Math.min(maxLevel, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));
}

/**
 * SkillManager is the sole authority for skill cost, cooldown, targeting and effects.
 * Scaling uses a linear Lv1..Lv7 interpolation: base + (max-base)*(level-1)/6.
 * Values that represent counts/timers are rounded to integers; damage percentages
 * stay fractional until the final damage formula rounds the result.
 */
class SkillManager {
    constructor({ gameConfig, players, monsters, io, onMonsterDeath, onPowerGain, getNroSkill = () => null, now = Date.now }) {
        this.gameConfig = gameConfig;
        this.players = players;
        this.monsters = monsters;
        this.io = io;
        this.onMonsterDeath = onMonsterDeath;
        this.onPowerGain = onPowerGain;
        this.getNroSkill = getNroSkill;
        this.now = now;
        this.actions = [];
    }

    resolveSkillAtLevel(skill, requestedLevel) {
        const maxLevel = Math.min(this.gameConfig.skills.maxLevel, Number(skill.maxLevel) || this.gameConfig.skills.maxLevel);
        const level = clampSkillLevel(requestedLevel, maxLevel);
        const t = (level - 1) / (maxLevel - 1);
        const resolved = { ...skill, level };
        for (const [key, endpoints] of Object.entries(skill.levelScaling || {})) {
            const value = endpoints.length === maxLevel
                ? endpoints[level - 1]
                : endpoints[0] + (endpoints[1] - endpoints[0]) * t;
            resolved[key] = ['cooldownMs', 'durationMs', 'stunDurationMs', 'rootDurationMs', 'hits'].includes(key)
                ? Math.round(value)
                : value;
        }
        if (resolved.cooldownMs === undefined) resolved.cooldownMs = skill.cooldownMs;
        if (resolved.mpCost !== undefined) resolved.mpCost = Math.round(resolved.mpCost);
        return resolved;
    }

    castSkill(playerId, skillIndex, targetId, targetPos) {
        const player = this.players[playerId];
        if (!player || player.hp <= 0) return { ok: false, error: 'Nhân vật không thể dùng kỹ năng.' };

        const isNroSkill = skillIndex !== 'basic';
        const baseSkill = skillIndex === 'basic'
            ? this.gameConfig.basicAttack
            : this.getNroSkill(player.raceId, skillIndex);
        if (!baseSkill) return { ok: false, error: 'Kỹ năng không thuộc hành tinh hiện tại.' };
        if (isNroSkill && !player.skillLevels?.[skillIndex]) {
            return { ok: false, skillId: skillIndex, error: 'Nhân vật chưa đủ tiềm năng để học kỹ năng này.' };
        }

        const skillLevel = skillIndex === 'basic'
            ? 1
            : clampSkillLevel(player.skillLevels?.[skillIndex], Math.min(this.gameConfig.skills.maxLevel, Number(baseSkill.maxLevel) || this.gameConfig.skills.maxLevel));
        const skill = this.resolveSkillAtLevel(baseSkill, skillLevel);
        if (skillIndex === 'basic') {
            skill.cooldownMs = getBasicAttackCooldownMs(player.agi, {
                baseCooldownMs: skill.cooldownMs,
                agiReductionMsPerPoint: this.gameConfig.attackSpeed.agiReductionMsPerPoint,
                minimumCooldownMs: this.gameConfig.attackSpeed.minimumBasicCooldownMs
            });
        }
        const now = this.now();
        const castBlockingEffect = ['stun', 'sleep', 'silence']
            .find((effectType) => this._hasEffect(player, effectType, now));
        if (castBlockingEffect) {
            const statusName = { stun: 'choáng', sleep: 'ngủ', silence: 'câm lặng' }[castBlockingEffect];
            return { ok: false, skillId: skillIndex, error: `Đang bị ${statusName}, không thể dùng kỹ năng.` };
        }
        const lastCastTime = player.cooldowns[skillIndex] || 0;
        if (now - lastCastTime < skill.cooldownMs) {
            return {
                ok: false,
                skillId: skillIndex,
                cooldownRemainingMs: skill.cooldownMs - (now - lastCastTime),
                error: 'Kỹ năng đang hồi chiêu.'
            };
        }
        if (player.mp < skill.mpCost) return { ok: false, skillId: skillIndex, error: 'Không đủ MP.' };
        const hpCost = skill.hpCostPercent ? Math.floor(player.maxHp * skill.hpCostPercent / 100) : 0;
        if (hpCost && player.hp <= hpCost) return { ok: false, skillId: skillIndex, error: 'Không đủ HP để dùng Kaioken.' };

        if (targetId) {
            const explicitTarget = this.monsters[targetId] || this.players[targetId];
            const selfSkill = skill.type === 'self_recovery'
                || (skill.type === 'aoe_heal' && skill.effect === 'instant_heal');
            if (!selfSkill && explicitTarget?.questOwnerUserId
                && String(explicitTarget.questOwnerUserId) !== String(player.userId)) {
                return { ok: false, skillId: skillIndex, error: 'Encounter nhiệm vụ này chỉ dành cho chủ nhiệm vụ.' };
            }
            if (!selfSkill && this.gameConfig.gameMode === 'nro' && explicitTarget
                && (Number(explicitTarget.mapId) !== Number(player.mapId)
                    || Number(explicitTarget.zoneId || 0) !== Number(player.zoneId || 0))) {
                return { ok: false, skillId: skillIndex, error: 'Mục tiêu không cùng khu vực.' };
            }
            if (!selfSkill && (!explicitTarget || !this._canTarget(player, explicitTarget))) {
                return { ok: false, skillId: skillIndex, error: 'Mục tiêu không tồn tại hoặc không cùng khu vực.' };
            }
        }

        const rangePx = metersToPixels(skill.rangeMeters ?? this.gameConfig.skills.singleTargetRangeMeters, this.gameConfig.world.pixelsPerMeter);
        const needsExplicitNroTarget = this.gameConfig.gameMode === 'nro'
            && NRO_ATTACK_SKILL_TYPES.has(skill.type || skillIndex)
            && skill.effect !== 'self_destruct';
        const explicitCombatTarget = targetId ? (this.monsters[targetId] || this.players[targetId]) : null;
        if (needsExplicitNroTarget && !explicitCombatTarget) {
            return { ok: false, skillId: skillIndex, needsTarget: true, error: 'Hãy chọn quái làm mục tiêu trước.' };
        }
        if (needsExplicitNroTarget && explicitCombatTarget && this._canTarget(player, explicitCombatTarget)) {
            const dx = explicitCombatTarget.x - player.x;
            const dy = explicitCombatTarget.y - player.y;
            const melee = MELEE_SKILL_TYPES.has(skill.type || skillIndex);
            const verticalTolerance = melee ? 42 : 96;
            const facingTarget = !melee || Math.abs(dx) <= 4 || Math.sign(dx) === (player.facing || 1);
            const inSkillRange = Math.hypot(dx, dy) <= rangePx && Math.abs(dy) <= verticalTolerance && facingTarget;
            if (!inSkillRange) {
                return {
                    ok: false,
                    needsApproach: true,
                    skillId: skillIndex,
                    targetId: explicitCombatTarget.id,
                    rangePx,
                    verticalTolerance,
                    requiresFacing: melee,
                    targetX: explicitCombatTarget.x,
                    targetY: explicitCombatTarget.y,
                    error: 'Đang tiếp cận mục tiêu.'
                };
            }
        }
        const selected = this._resolveTarget(player, targetId, rangePx, skill.type || skillIndex);
        const selfCentered = skill.effect === 'self_destruct'
            || skill.type === 'self_recovery'
            || (skill.type === 'aoe_heal' && skill.effect === 'instant_heal');
        const requestedPoint = selfCentered
            ? { x: player.x, y: player.y }
            : skill.requiresTarget && selected?.target
                ? { x: selected.target.x, y: selected.target.y }
            : targetPos && Number.isFinite(targetPos.x) && Number.isFinite(targetPos.y)
                ? { x: targetPos.x, y: targetPos.y }
                : skill.type === 'aoe_heal'
                    ? { x: player.x, y: player.y }
                : selected?.target ? { x: selected.target.x, y: selected.target.y } : { x: player.x, y: player.y };
        const targetedArea = ['aoe_target', 'aoe_burst', 'aoe_zone', 'aoe_heal'].includes(skill.type);
        if (targetedArea && Math.hypot(requestedPoint.x - player.x, requestedPoint.y - player.y) > rangePx) {
            return { ok: false, skillId: skillIndex, error: 'Vị trí mục tiêu nằm ngoài tầm kỹ năng.' };
        }
        if (skill.type === 'dash_target' && !selected.target) {
            return { ok: false, skillId: skillIndex, error: 'Cần chọn mục tiêu trong tầm để ám sát.' };
        }
        if (skill.requiresTarget && !selected.target) {
            return { ok: false, skillId: skillIndex, error: 'Cần chọn mục tiêu trong tầm để dùng kỹ năng này.' };
        }

        const staminaCost = this.gameConfig.gameMode === 'nro' && NRO_ATTACK_SKILL_TYPES.has(skill.type || skillIndex)
            ? consumeNroStaminaForAttack(player, now)
            : { ok: true, changed: false };
        if (!staminaCost.ok) return { ok: false, skillId: skillIndex, error: 'Thể lực đã cạn kiệt, hãy nghỉ ngơi để hồi phục.' };

        // NRO stops charging when the character moves or starts another skill.
        this.cancelCharge(playerId);
        if (hpCost) player.hp -= hpCost;
        player.mp -= skill.mpCost;
        player.cooldowns[skillIndex] = now;
        const result = {
            ok: true,
            playerId,
            skillId: skillIndex,
            skillLevel,
            skillType: skill.type,
            skillName: skill.name,
            cooldownMs: skill.cooldownMs,
            mpCost: skill.mpCost,
            stamina: player.stamina,
            maxStamina: player.maxStamina,
            effectDurationMs: Number(skill.durationMs || skill.channelDurationMs || skill.castTimeMs) || 0,
            radiusPx: Number.isFinite(skill.radiusMeters)
                ? metersToPixels(skill.radiusMeters, this.gameConfig.world.pixelsPerMeter) : null,
            rangePx: metersToPixels(skill.rangeMeters ?? this.gameConfig.skills.singleTargetRangeMeters,
                this.gameConfig.world.pixelsPerMeter),
            targetId: selected.target?.id || null,
            targetPos: requestedPoint,
            damageTaken: [],
            healed: 0,
            miss: false,
            effects: []
        };
        if (hpCost) {
            result.hpCost = hpCost;
            this.io?.to(playerId).emit('statsUpdate', { hp: player.hp, mp: player.mp });
        }

        if (skill.type === 'buff') {
            this._applyBuff(player, skill, now, result);
        } else if (skill.type === 'dash_back') {
            this._dashBack(player, skill);
            this._applyTimedEffect(player, 'speed_boost', now, skill.durationMs, playerId, {
                speedMultiplier: skill.speedMultiplier
            });
            this._clearEffects(player, ['slow']);
            result.position = { x: player.x, y: player.y };
            result.effects.push({ type: 'speed_boost', durationMs: skill.durationMs });
        } else if (skill.type === 'aoe_heal' && skill.effect === 'instant_heal') {
            result.healed = this._applyInstantHeal(player, skill, requestedPoint);
        } else if (skill.type === 'aoe_heal') {
            this.actions.push({
                kind: 'heal_zone', playerId, skillId: skillIndex, skill,
                position: requestedPoint,
                nextTickAt: now + 1000,
                endsAt: now + skill.durationMs
            });
        } else if (skill.type === 'self_recovery' && skill.effect === 'charge_recovery') {
            this._applyTimedEffect(player, 'charging', now, skill.durationMs, playerId);
            this.actions.push({
                kind: 'charge_recovery', playerId, skillId: skillIndex, skill,
                nextTickAt: now,
                endsAt: now + skill.durationMs
            });
            result.channelDurationMs = skill.durationMs;
            result.effects.push({ type: 'charging', durationMs: skill.durationMs });
        } else if (skill.type === 'aoe_zone') {
            this.actions.push({
                kind: 'damage_zone', playerId, skillId: skillIndex, skill,
                position: requestedPoint,
                nextTickAt: now,
                endsAt: now + skill.durationMs
            });
        } else if (skill.type === 'aoe_burst') {
            this.actions.push({
                kind: 'damage_burst', playerId, skillId: skillIndex, skill,
                position: requestedPoint,
                nextTickAt: now + skill.castTimeMs,
                endsAt: now + skill.castTimeMs
            });
            result.castTimeMs = skill.castTimeMs;
        } else if (skill.type === 'channeling') {
            this.actions.push({
                kind: 'channel', playerId, skillId: skillIndex, skill,
                targetId: selected.target?.id || null,
                position: requestedPoint,
                nextTickAt: now + (skill.channelDurationMs / skill.shots),
                endsAt: now + skill.channelDurationMs,
                shotsRemaining: skill.shots
            });
            result.channelDurationMs = skill.channelDurationMs;
        } else if (DAMAGE_TYPES.has(skill.type)) {
            if (skill.type === 'dash_target') {
                this._dashBehind(player, selected.target);
                result.position = { x: player.x, y: player.y };
            }
            const targets = this._selectAreaTargets(player, skill, requestedPoint, selected.target);
            const hitCount = skill.hits || 1;
            for (const target of targets) {
                if (skill.noDamage) {
                    if (skill.effect === 'root') this._applyTimedEffect(target, 'root', now, skill.rootDurationMs, playerId);
                    if (skill.effect === 'stun') this._applyTimedEffect(target, 'stun', now, skill.stunDurationMs, playerId);
                    if (skill.effect === 'taunt') this._applyTimedEffect(target, 'taunt', now, skill.durationMs || 3000, playerId);
                    result.damageTaken.push({
                        targetId: target.id,
                        targetType: this.monsters[target.id] ? 'monster' : 'player',
                        damage: 0,
                        hp: target.hp,
                        maxHp: target.maxHp,
                        isDead: false,
                        effect: skill.effect
                    });
                    result.effects.push({ type: skill.effect, targetId: target.id, durationMs: skill.stunDurationMs });
                    continue;
                }
                for (let hitIndex = 0; hitIndex < hitCount; hitIndex++) {
                    if (target.hp <= 0) break;
                    const victim = this._damageTarget(player, target, skill, result);
                    if (victim) {
                        result.damageTaken.push(victim);
                        if (victim.companionHit) result.damageTaken.push(victim.companionHit);
                        if (victim.reflectedHit) result.damageTaken.push(victim.reflectedHit);
                        if (victim.counterHit) result.damageTaken.push(victim.counterHit);
                        if (victim.attackerRecovery) {
                            result.healed += victim.attackerRecovery.hp + victim.attackerRecovery.mp;
                        }
                    }
                    if (target.isDead) break;
                }
                if (skill.effect === 'root') this._applyTimedEffect(target, 'root', now, skill.rootDurationMs, playerId);
                if (skill.effect === 'stun') this._applyTimedEffect(target, 'stun', now, skill.stunDurationMs, playerId);
                if (skill.effect === 'taunt') this._applyTimedEffect(target, 'taunt', now, skill.durationMs || 3000, playerId);
            }
            if (targets.length === 0) result.miss = true;
        }

        return result;
    }

    tick(now = this.now()) {
        let changed = false;
        for (const entity of [...Object.values(this.players), ...Object.values(this.monsters)]) {
            if (!Array.isArray(entity.effects)) continue;
            const expired = entity.effects.filter((effect) => effect.expiresAt <= now);
            for (const effect of expired) {
                if (effect.type === 'monkey_transform' && Number.isFinite(effect.baseMaxHp)) {
                    entity.maxHp = effect.baseMaxHp;
                    entity.hp = Math.min(entity.hp, entity.maxHp);
                    if (this.players[entity.id]) this.io?.to(entity.id).emit('statsUpdate', { hp: entity.hp, maxHp: entity.maxHp });
                }
            }
            const activeEffects = entity.effects.filter((effect) => effect.expiresAt > now);
            if (activeEffects.length !== entity.effects.length) changed = true;
            entity.effects = activeEffects;
        }

        const pending = [];
        for (const action of this.actions) {
            if (action.nextTickAt > now) {
                pending.push(action);
                continue;
            }
            const owner = this.players[action.playerId];
            if (!owner || owner.hp <= 0) continue;

            if (action.kind === 'monkey_transform') {
                const baseMaxHp = owner.maxHp;
                const bonusMaxHp = Math.floor(baseMaxHp * action.skill.maxHpBonusPercent / 100);
                owner.maxHp += bonusMaxHp;
                this._applyTimedEffect(owner, 'monkey_transform', now, action.skill.durationMs, owner.id, {
                    baseMaxHp,
                    maxHpBonusPercent: action.skill.maxHpBonusPercent,
                    // The source player has speed 5 by default; setIsMonkey sends speed 6.
                    speedMultiplier: 6 / 5,
                    levelMonkey: action.skill.level,
                    critValue: 110,
                    sourceSkillId: action.skillId
                });
                this.io?.to(owner.id).emit('statsUpdate', { hp: owner.hp, maxHp: owner.maxHp, mp: owner.mp, maxMp: owner.maxMp });
                this._emitDamage({ playerId: owner.id, skillId: action.skillId, skillType: 'buff', damageTaken: [],
                    effects: [{ type: 'monkey_transform', durationMs: action.skill.durationMs, maxHp: owner.maxHp,
                        speedMultiplier: 6 / 5, levelMonkey: action.skill.level }] });
                changed = true;
                continue;
            }

            if (action.kind === 'damage_burst') {
                this._runDamagePulse(action, owner);
                if (action.skill.effect === 'self_destruct') {
                    owner.hp = 0;
                    owner.effects = [];
                    this.io?.to(owner.id).emit('statsUpdate', { hp: 0, maxHp: owner.maxHp, mp: owner.mp, maxMp: owner.maxMp });
                }
                changed = true;
                continue;
            }
            if (action.kind === 'charge_recovery') {
                const interrupted = owner.hp <= 0 || owner.effects?.some((effect) =>
                    effect.type !== 'charging' && effect.expiresAt > now && ['stun', 'root', 'sleep'].includes(effect.type)
                );
                if (!this._hasEffect(owner, 'charging', now) || interrupted
                    || (owner.hp >= owner.maxHp && owner.mp >= owner.maxMp)) {
                    this._clearEffects(owner, ['charging']);
                    changed = true;
                    continue;
                }
                const hp = Math.min(owner.maxHp - owner.hp, Math.floor(owner.maxHp * action.skill.recoveryPercent / 100));
                const mp = Math.min(owner.maxMp - owner.mp, Math.floor(owner.maxMp * action.skill.recoveryPercent / 100));
                owner.hp += Math.max(0, hp);
                owner.mp += Math.max(0, mp);
                if (hp > 0 || mp > 0) {
                    this._emitDamage({ playerId: owner.id, skillId: action.skillId, skillType: action.skill.type,
                        damageTaken: [], healed: [{ targetId: owner.id, hp: Math.max(0, hp), mp: Math.max(0, mp) }] });
                    this.io?.to(owner.id).emit('statsUpdate', { hp: owner.hp, mp: owner.mp });
                }
                action.nextTickAt += action.skill.tickIntervalMs;
                changed = true;
                if (action.nextTickAt < action.endsAt && (owner.hp < owner.maxHp || owner.mp < owner.maxMp)) pending.push(action);
                else this._clearEffects(owner, ['charging']);
                continue;
            }
            if (action.kind === 'damage_zone' && now < action.endsAt) {
                this._runDamagePulse(action, owner);
                action.nextTickAt += action.skill.tickIntervalMs;
                changed = true;
            } else if (action.kind === 'heal_zone' && now <= action.endsAt) {
                this._runHealPulse(action, owner);
                action.nextTickAt += 1000;
                changed = true;
            } else if (action.kind === 'channel' && action.shotsRemaining > 0) {
                this._runChannelShot(action, owner);
                action.shotsRemaining -= 1;
                action.nextTickAt += action.skill.channelDurationMs / action.skill.shots;
                changed = true;
            }

            const remains = action.kind === 'channel'
                ? action.shotsRemaining > 0
                : now < action.endsAt;
            if (remains) pending.push(action);
        }
        this.actions = pending;
        return changed;
    }

    applyMonsterAttack(monster, player, now = this.now()) {
        if (!monster || !player || player.hp <= 0 || this._hasEffect(monster, 'stun', now) || this._hasEffect(monster, 'root', now)) return null;
        const distance = Math.hypot(player.x - monster.x, player.y - monster.y);
        const meleeRange = Number(monster.attackRange) || metersToPixels(3.5, this.gameConfig.world.pixelsPerMeter);
        const rangedRange = Number(monster.rangedAttackRange) || meleeRange;
        const isRangedAttack = distance > meleeRange;
        if (distance > (isRangedAttack ? rangedRange : meleeRange)) return null;
        const cooldownMs = monster.attackCooldownMs || 1000;
        if (now - monster.lastAttackTime < cooldownMs) return null;
        monster.lastAttackTime = now;
        monster.attackSequence = (Number(monster.attackSequence) || 0) + 1;
        const skillType = isRangedAttack ? 'projectile' : 'melee';
        this._emitMonsterAttack(monster, player, { isRangedAttack, skillType, sequence: monster.attackSequence });
        const rawDamage = this.gameConfig.gameMode === 'nro'
            ? getNroMobAttackDamage({ maxHp: monster.maxHp, level: monster.level,
                pDame: monster.pDame, baseDamage: monster.baseDamage })
            : monster.atk;
        if (this._hasEffect(player, 'damage_immunity', now)) {
            const blocked = [{ targetId: player.id, targetType: 'player', damage: 0, hp: player.hp, maxHp: player.maxHp, blocked: true }];
            this._emitDamage({ playerId: monster.id, skillId: 'monster_attack', skillType, damageTaken: blocked });
            return blocked;
        }
        if (this._rollNroDodge(player.nroDodgePercent)) {
            const dodged = [{ targetId: player.id, targetType: 'player', damage: 0,
                hp: player.hp, maxHp: player.maxHp, isDead: false, dodged: true }];
            this._emitDamage({ playerId: monster.id, skillId: 'monster_attack', skillType, damageTaken: dodged });
            return dodged;
        }
        const damageAfterDefense = Math.max(1, Math.round(rawDamage * (1 - this._damageReduction(player))));
        const charmReduction = this.gameConfig.gameMode === 'nro'
            ? Math.min(100, Math.max(0, Number(this._getEffect(player, 'nro_charm_da_trau', now)?.damageReductionPercent) || 0)) : 0;
        const damage = Math.max(1, Math.floor(this._applyNroGearDamageReduction(damageAfterDefense, player) * (1 - charmReduction / 100)));
        const hasCharmInvulnerability = this.gameConfig.gameMode === 'nro' && this._hasEffect(player, 'nro_charm_bat_tu', now);
        const appliedDamage = hasCharmInvulnerability ? Math.min(damage, Math.max(0, player.hp - 1)) : damage;
        player.hp = Math.max(hasCharmInvulnerability ? 1 : 0, player.hp - appliedDamage);
        const victims = [{ targetId: player.id, targetType: 'player', damage: appliedDamage, hp: player.hp, maxHp: player.maxHp }];
        const reflect = this._getEffect(player, 'reflect_damage', now);
        const reflectPercent = Math.max(Number(reflect?.reflectPercent) || 0, Number(player.nroReflectDamagePercent) || 0);
        if (reflectPercent > 0 && damage > 0) {
            const reflectedDamage = Math.max(1, Math.round(damage * reflectPercent / 100));
            const actual = monster.takeDamage(reflectedDamage);
            victims.push({ targetId: monster.id, targetType: 'monster', damage: actual.damageDealt, hp: monster.hp, maxHp: monster.maxHp, isDead: actual.isDead, reflected: true });
            if (actual.isDead) this.onMonsterDeath?.(monster, player);
        }
        // The source counter option only reflects close-range melee hits. A
        // ranged mob shot must not trigger a melee-counter item effect.
        const counterDamage = !isRangedAttack
            ? Math.max(0, Math.floor(Number(player.nroMeleeCounterDamage) || 0))
            : 0;
        if (counterDamage > 0 && monster.hp > 0) {
            const actual = monster.takeDamage(counterDamage);
            victims.push({ targetId: monster.id, targetType: 'monster', damage: actual.damageDealt,
                hp: monster.hp, maxHp: monster.maxHp, isDead: actual.isDead, reflected: true, counter: true });
            if (actual.isDead) this.onMonsterDeath?.(monster, player);
        }
        this._emitDamage({ playerId: monster.id, skillId: 'monster_attack', skillType, damageTaken: victims });
        return victims;
    }

    _resolveTarget(player, targetId, rangePx, skillType = 'basic') {
        const inRange = (target) => {
            if (!target || !this._canTarget(player, target)) return false;
            const dx = target.x - player.x;
            const dy = target.y - player.y;
            if (this.gameConfig.gameMode === 'nro') {
                const verticalTolerance = ['basic', 'melee', 'aoe_melee', 'aoe_debuff', 'dash_target'].includes(skillType)
                    ? 42
                    : 96;
                if (Math.abs(dy) > verticalTolerance) return false;
                if (['basic', 'melee', 'aoe_melee', 'aoe_debuff', 'dash_target'].includes(skillType) &&
                    (Math.abs(dx) > 4 && Math.sign(dx) !== (player.facing || 1))) return false;
            }
            return Math.hypot(dx, dy) <= rangePx;
        };
        const explicit = targetId ? (this.monsters[targetId] || this.players[targetId]) : null;
        if (explicit && inRange(explicit)) {
            return { target: explicit };
        }
        let best = null;
        let bestDistance = rangePx;
        for (const target of [...Object.values(this.monsters), ...Object.values(this.players)]) {
            if (!inRange(target)) continue;
            const distance = Math.hypot(target.x - player.x, target.y - player.y);
            if (distance <= bestDistance) { best = target; bestDistance = distance; }
        }
        return { target: best, distance: bestDistance };
    }

    _canTarget(player, target) {
        if (!target || target.id === player.id || target.hp <= 0 || target.isDead) return false;
        if (target.questOwnerUserId && String(target.questOwnerUserId) !== String(player.userId)) return false;
        if (this.gameConfig.gameMode === 'nro'
            && (Number(target.mapId) !== Number(player.mapId) || Number(target.zoneId || 0) !== Number(player.zoneId || 0))) return false;
        if (this.players[target.id]) {
            return this.gameConfig.gameMode === 'nro'
                ? canNroPlayerAttack(player, target)
                : this.gameConfig.map.allowPvP === true;
        }
        return true;
    }

    _selectAreaTargets(player, skill, position, selectedTarget) {
        if (['melee', 'projectile', 'projectile_cc', 'dash_target'].includes(skill.type)) {
            return selectedTarget ? [selectedTarget] : [];
        }
        const radius = metersToPixels(skill.radiusMeters ?? skill.rangeMeters ?? this.gameConfig.skills.singleTargetRangeMeters, this.gameConfig.world.pixelsPerMeter);
        const center = ['aoe_melee', 'aoe_debuff'].includes(skill.type) ? player : position;
        const targets = [...Object.values(this.monsters), ...Object.values(this.players)]
            .filter((target) => this._canTarget(player, target) && Math.hypot(target.x - center.x, target.y - center.y) <= radius);
        if (skill.type !== 'cone_aoe') return targets;

        const aim = selectedTarget || position;
        const angle = Math.atan2(aim.y - player.y, aim.x - player.x);
        const halfCone = (skill.coneDegrees || 60) * Math.PI / 360;
        return targets.filter((target) => {
            const targetAngle = Math.atan2(target.y - player.y, target.x - player.x);
            return Math.abs(Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle))) <= halfCone;
        });
    }

    _damageTarget(attacker, target, skill, result) {
        if (target.invulnerable || this._hasEffect(target, 'damage_immunity')) {
            return { targetId: target.id, targetType: this.players[target.id] ? 'player' : 'monster',
                damage: 0, hp: target.hp, maxHp: target.maxHp, isDead: false, blocked: true };
        }
        const targetIsPlayer = Boolean(this.players[target.id]);
        let damageConfig = {
            damagePercent: skill.damagePercent || 100,
            baseStat: skill.damageStat,
            canCrit: skill.canCrit
        };
        let bonusMultiplier = 1;
        const monkeyTransform = this._getEffect(attacker, 'monkey_transform');
        const critChancePercent = monkeyTransform ? monkeyTransform.critValue
            : this.gameConfig.gameMode === 'nro' ? Number(attacker.crit) || 0 : undefined;
        const invisible = this._getEffect(attacker, 'invisible');
        if (invisible) {
            bonusMultiplier *= invisible.nextDamageMultiplier || 1;
            this._clearEffects(attacker, ['invisible']);
        }
        const damageBoost = this._getEffect(attacker, 'damage_boost');
        if (damageBoost) bonusMultiplier *= 1 + (damageBoost.damageBonusPercent || 0) / 100;
        const targetIsMonster = Boolean(this.monsters[target.id]);
        if (targetIsMonster && this.gameConfig.gameMode === 'nro') {
            const charm = this._getEffect(attacker, 'nro_charm_manh_me');
            if (charm) bonusMultiplier *= 1 + (Number(charm.damageBonusPercent) || 0) / 100;
        }
        const monsterDamagePercentSteps = targetIsMonster
            ? attacker.nroMonsterDamagePercentSteps || []
            : [];
        const canApplyPvpRules = targetIsPlayer && (this.gameConfig.gameMode === 'nro' || this.gameConfig.map.allowPvP);
        const isMelee = MELEE_SKILL_TYPES.has(skill.type);
        const armorPenetrationPercent = canApplyPvpRules && skill.damageFormula !== 'self_destruct'
            ? Number(isMelee
                ? attacker.nroMeleeArmorPenetrationPercent
                : attacker.nroProjectileArmorPenetrationPercent) || 0
            : 0;
        damageConfig = {
            ...damageConfig,
            damageMultiplier: bonusMultiplier,
            damagePercentSteps: monsterDamagePercentSteps,
            critChancePercent,
            critDamageBonusPercent: attacker.critDamageBonusPercent
        };
        let damage;
        let isCrit;
        if (skill.damageFormula === 'qckk' && this.gameConfig.gameMode === 'nro') {
            const rawDamage = this._getQckkDamage(attacker);
            const reduction = targetIsPlayer ? this._damageReduction(target, armorPenetrationPercent) : 0;
            const boostedRawDamage = applyDamagePercentSteps(rawDamage, monsterDamagePercentSteps);
            damage = Math.max(1, Math.round(boostedRawDamage * bonusMultiplier * (1 - reduction)));
            isCrit = false;
        } else if (skill.damageFormula === 'self_destruct' && this.gameConfig.gameMode === 'nro') {
            const monkey = this._hasEffect(attacker, 'monkey_transform');
            damage = Math.max(1, Math.floor((attacker.maxHp || attacker.hp) / (monkey ? 2.4 : 2)));
            if (targetIsPlayer && !canApplyPvpRules) damage = 0;
            else if (targetIsPlayer) damage = Math.max(1, Math.round(damage * (1 - this._damageReduction(target, armorPenetrationPercent))));
            isCrit = false;
        } else {
            ({ damage, isCrit } = calculateSkillDamage(attacker, target, damageConfig));
            if (canApplyPvpRules) damage = Math.max(1, Math.round(damage * (1 - this._damageReduction(target, armorPenetrationPercent))));
        }
        if (targetIsPlayer && this.gameConfig.gameMode === 'nro'
            && Number(target.nroProjectileDamageToMpPercent) > 0
            && ['kamejoko', 'masenko', 'antomic'].some((name) => String(skill.name || '').toLowerCase().includes(name))) {
            // Source Player.injured converts these three chưởng hits to KI
            // before dodge/defense: the hit deals no HP damage and restores
            // option-percent KI from its incoming damage.
            const oldMp = Number(target.mp) || 0;
            const recoveredMp = Math.floor(damage * target.nroProjectileDamageToMpPercent / 100);
            target.mp = Math.min(Number(target.maxMp) || oldMp, oldMp + recoveredMp);
            this.io?.to(target.id).emit('statsUpdate', { mp: target.mp, maxMp: target.maxMp });
            return { targetId: target.id, targetType: 'player', damage: 0, isCrit: false,
                hp: target.hp, maxHp: target.maxHp, mp: target.mp, maxMp: target.maxMp,
                isDead: false, convertedToKi: target.mp - oldMp };
        }
        if (targetIsPlayer && this._rollNroDodge(target.nroDodgePercent, {
            piercing: skill.piercing === true,
            bypassDodge: skill.damageFormula === 'self_destruct'
        })) {
            return { targetId: target.id, targetType: 'player', damage: 0,
                hp: target.hp, maxHp: target.maxHp, isDead: false, dodged: true };
        }
        if (targetIsPlayer) damage = this._applyNroGearDamageReduction(damage, target);
        if (this.monsters[target.id]) {
            const { damageDealt, isDead } = target.takeDamage(damage);
            if (damageDealt > 0 && !isDead) {
                target.provoke?.(attacker.id, this.now());
                const directionToAttacker = Math.sign(Number(attacker.x) - Number(target.x));
                if (directionToAttacker) target.facing = directionToAttacker;
            }
            const progressionGain = this.gameConfig.gameMode === 'nro'
                ? getPotentialReward({
                    damage: damageDealt,
                    mobHp: target.maxHp,
                    mobLevel: target.level,
                    playerLevel: attacker.inventory.level,
                    playerPower: attacker.inventory.power,
                    maxPotential: target.maxPotential || Math.floor(target.maxHp * (target.potentialPercent || 0) / 100),
                    cFlag: attacker.cFlag || 0,
                    powerLimit: getNroPowerLimit(attacker.limitPower).power,
                    tnsmBonuses: attacker.nroTnsmBonuses || [],
                    satelliteTnsmBonus: attacker.satelliteExpBonus || 0,
                    charmPotentialMultipliers: getNroCharmPotentialMultipliers(attacker.effects, this.now())
                })
                : Math.floor(damageDealt * (target.dtnFactor || 0));
            // NRO combat progression increases sức mạnh and tiềm năng separately.
            // Gear and skill requirements use sức mạnh; tiềm năng remains spendable.
            attacker.inventory.dtn += progressionGain;
            attacker.inventory.power = (attacker.inventory.power || 0) + progressionGain;
            if (this.gameConfig.gameMode === 'nro') {
                Object.assign(attacker.inventory, getNroProgress(attacker.inventory.power));
                if (progressionGain > 0) this.onPowerGain?.(attacker, progressionGain);
            }
            const victim = { targetId: target.id, targetType: 'monster', damage: damageDealt, isCrit, hp: target.hp, maxHp: target.maxHp, isDead };
            const attackerRecovery = this._applyEquipmentDrain(attacker, damageDealt, true);
            if (attackerRecovery) victim.attackerRecovery = attackerRecovery;
            if (isDead) this.onMonsterDeath?.(target, attacker);
            const mobMeHit = this._applyMobMeHit(attacker, target, skill);
            if (mobMeHit) victim.companionHit = mobMeHit;
            return victim;
        }
        const damageDealt = Math.min(target.hp, damage);
        target.hp = Math.max(0, target.hp - damageDealt);
        this.io?.to(target.id).emit('statsUpdate', { hp: target.hp, maxHp: target.maxHp });
        const victim = { targetId: target.id, targetType: 'player', damage: damageDealt, isCrit, hp: target.hp, maxHp: target.maxHp, isDead: target.hp <= 0 };
        const reflectPercent = Math.max(0, Number(target.nroReflectDamagePercent) || 0);
        if (reflectPercent > 0 && damageDealt > 0 && attacker.hp > 0) {
            const reflectedDamage = Math.max(1, Math.round(damageDealt * reflectPercent / 100));
            attacker.hp = Math.max(0, attacker.hp - reflectedDamage);
            victim.reflectedHit = {
                targetId: attacker.id,
                targetType: 'player',
                damage: reflectedDamage,
                hp: attacker.hp,
                maxHp: attacker.maxHp,
                isDead: attacker.hp <= 0,
                reflected: true
            };
            this.io?.to(attacker.id).emit('statsUpdate', { hp: attacker.hp, maxHp: attacker.maxHp });
        }
        const counterDamage = canApplyPvpRules && isMelee && damageDealt > 0
            ? Math.max(0, Math.floor(Number(target.nroMeleeCounterDamage) || 0)) : 0;
        if (counterDamage > 0 && attacker.hp > 0) {
            const counterDamageDealt = Math.min(attacker.hp, counterDamage);
            attacker.hp -= counterDamageDealt;
            victim.counterHit = {
                targetId: attacker.id,
                targetType: 'player',
                damage: counterDamageDealt,
                hp: attacker.hp,
                maxHp: attacker.maxHp,
                isDead: attacker.hp <= 0,
                reflected: true,
                counter: true
            };
            this.io?.to(attacker.id).emit('statsUpdate', { hp: attacker.hp, maxHp: attacker.maxHp });
        }
        const attackerRecovery = this._applyEquipmentDrain(attacker, damageDealt, false);
        if (attackerRecovery) victim.attackerRecovery = attackerRecovery;
        const mobMeHit = this._applyMobMeHit(attacker, target, skill);
        if (mobMeHit) victim.companionHit = mobMeHit;
        return victim;
    }

    _rollNroDodge(percent, { piercing = false, bypassDodge = false } = {}) {
        const chance = Number(percent);
        if (this.gameConfig.gameMode !== 'nro' || piercing || bypassDodge || !Number.isFinite(chance) || chance <= 0) return false;
        // Source Util.isTrue(percent, 100): an integer roll in [0, 99] is
        // dodged when it is below the equipped option's summed percentage.
        return Math.floor(Math.random() * 100) < chance;
    }

    _applyEquipmentDrain(attacker, damageDealt, isMonsterTarget = false) {
        if (this.gameConfig.gameMode !== 'nro' || damageDealt <= 0) return null;
        // Source NPoint.getTileHutHp(true) adds option 104 only against mobs;
        // option 95 remains the shared HP-drain rate for mobs and PvP targets.
        const hpDrainPercent = Math.max(0, Number(attacker.nroHpDrainPercent) || 0)
            + (isMonsterTarget ? Math.max(0, Number(attacker.nroHpDrainFromMonsterPercent) || 0) : 0);
        const hp = Math.min(
            Math.max(0, (Number(attacker.maxHp) || 0) - (Number(attacker.hp) || 0)),
            Math.floor(damageDealt * hpDrainPercent / 100)
        );
        const mp = Math.min(
            Math.max(0, (Number(attacker.maxMp) || 0) - (Number(attacker.mp) || 0)),
            Math.floor(damageDealt * Math.max(0, Number(attacker.nroMpDrainPercent) || 0) / 100)
        );
        if (hp === 0 && mp === 0) return null;
        attacker.hp += hp;
        attacker.mp += mp;
        this.io?.to(attacker.id).emit('statsUpdate', { hp: attacker.hp, mp: attacker.mp });
        return { hp, mp };
    }

    _applyMobMeHit(attacker, target, skill) {
        const companion = attacker.companion;
        if (this.gameConfig.gameMode !== 'nro' || !companion || companion.expiresAt <= this.now() || companion.hp <= 0
            || target.hp <= 0 || skill.effect === 'self_destruct' || skill.noDamage) return null;
        // The Java source calls MobMe.attack only in its normal/Dragon/Demon/Galick/
        // Lien Hoan/Kamejoko/Masenko/Antomic/Kaioken attack cases.
        const sourceAttack = skill.id === 'basic' || skill.effect === 'kaioken'
            || /(Dragon|Demon|Galick|Liên Hoàn|Kamejoko|Masenko|Antomic)/i.test(skill.name || '');
        if (!sourceAttack) return null;

        const rawDamage = Math.floor(Number(attacker.str || attacker.atk || 0) * companion.damagePercent / 100);
        // MobMe.attack in the Java source only applies damage while target HP is
        // strictly greater than MobMe damage; the companion cannot land a kill hit.
        if (target.hp <= rawDamage) return null;
        const reduction = this.players[target.id] ? this._damageReduction(target) : 0;
        let dealt = Math.max(0, Math.floor(rawDamage * (1 - reduction)));
        if (this.players[target.id]) dealt = this._applyNroGearDamageReduction(dealt, target);
        dealt = Math.min(target.hp, dealt);
        if (dealt <= 0) return null;
        let isDead = false;
        if (this.monsters[target.id]) {
            ({ isDead } = target.takeDamage(dealt));
            target.provoke?.(attacker.id, this.now());
            const directionToAttacker = Math.sign(Number(attacker.x) - Number(target.x));
            if (directionToAttacker) target.facing = directionToAttacker;
            if (isDead) this.onMonsterDeath?.(target, attacker);
            // Source MobMe.attack grants potential independently for its own hit.
            const gain = this.gameConfig.gameMode === 'nro'
                ? getPotentialReward({
                    damage: dealt, mobHp: target.maxHp, mobLevel: target.level,
                    playerLevel: attacker.inventory.level, playerPower: attacker.inventory.power,
                    maxPotential: target.maxPotential || Math.floor(target.maxHp * (target.potentialPercent || 0) / 100),
                    cFlag: attacker.cFlag || 0, powerLimit: getNroPowerLimit(attacker.limitPower).power,
                    tnsmBonuses: attacker.nroTnsmBonuses || [], satelliteTnsmBonus: attacker.satelliteExpBonus || 0,
                    charmPotentialMultipliers: getNroCharmPotentialMultipliers(attacker.effects, this.now())
                }) : 0;
            attacker.inventory.dtn += gain;
            attacker.inventory.power = (attacker.inventory.power || 0) + gain;
            Object.assign(attacker.inventory, getNroProgress(attacker.inventory.power));
            if (gain > 0) this.onPowerGain?.(attacker, gain);
        } else {
            target.hp = Math.max(0, target.hp - dealt);
            isDead = target.hp <= 0;
            this.io?.to(target.id).emit('statsUpdate', { hp: target.hp, maxHp: target.maxHp });
        }
        return { targetId: target.id, targetType: this.players[target.id] ? 'player' : 'monster',
            damage: dealt, isCrit: false, hp: target.hp, maxHp: target.maxHp, isDead, source: 'companion' };
    }

    _applyBuff(player, skill, now, result) {
        if (skill.effect === 'damage_immunity') {
            this._applyTimedEffect(player, 'damage_immunity', now, skill.durationMs, player.id);
        } else if (skill.effect === 'invisible') {
            this._applyTimedEffect(player, 'invisible', now, skill.durationMs, player.id, { nextDamageMultiplier: skill.nextDamageMultiplier });
        } else if (skill.effect === 'armor_boost') {
            this._applyTimedEffect(player, 'armor_boost', now, skill.durationMs, player.id, { armorBonusPercent: skill.armorBonusPercent });
        } else if (skill.effect === 'reflect_damage') {
            this._applyTimedEffect(player, 'reflect_damage', now, skill.durationMs, player.id, { reflectPercent: skill.reflectPercent });
        } else if (skill.effect === 'damage_boost') {
            this._applyTimedEffect(player, 'damage_boost', now, skill.durationMs, player.id, { damageBonusPercent: skill.damageBonusPercent || 0 });
        } else if (skill.effect === 'monkey_transform') {
            // Source SkillService.setIsMonkey waits 2s before applying the form.
            this.actions.push({ kind: 'monkey_transform', playerId: player.id, skillId: skill.id,
                skill, nextTickAt: now + 2000, endsAt: now + 2000 });
        } else if (skill.effect === 'summon_companion') {
            const companionTemplates = [8, 11, 32, 25, 43, 49, 50];
            const companionHp = Math.floor(player.maxHp * skill.companionHpPercent / 100);
            player.companion = {
                id: `companion:${player.id}`,
                templateId: companionTemplates[Math.min(6, skill.level - 1)],
                level: skill.level,
                hp: companionHp,
                maxHp: companionHp,
                damagePercent: skill.companionDamagePercent,
                expiresAt: now + skill.durationMs
            };
        }
        result.effects.push({ type: skill.effect, durationMs: skill.durationMs,
            value: skill.nextDamageMultiplier ?? skill.armorBonusPercent ?? skill.reflectPercent,
            ...(skill.effect === 'summon_companion' ? { companion: { ...player.companion } } : {}) });
    }

    _applyTimedEffect(target, type, now, durationMs, sourceId, values = {}) {
        target.effects ||= [];
        target.effects = target.effects.filter((effect) => !(effect.type === type && effect.sourceId === sourceId));
        target.effects.push({ type, sourceId, expiresAt: now + durationMs, ...values });
    }

    _getEffect(target, type, now = this.now()) {
        return target.effects?.find((effect) => effect.type === type && effect.expiresAt > now) || null;
    }

    _hasEffect(target, type, now = this.now()) { return !!this._getEffect(target, type, now); }

    _clearEffects(target, types) {
        target.effects = (target.effects || []).filter((effect) => !types.includes(effect.type));
    }

    _damageReduction(target, armorPenetrationPercent = 0) {
        const armorBoost = this._getEffect(target, 'armor_boost');
        const penetration = Math.min(100, Math.max(0, Number(armorPenetrationPercent) || 0));
        const armor = (target.armor || 0) * (1 + (armorBoost?.armorBonusPercent || 0) / 100) * (1 - penetration / 100);
        const armorReduction = Math.min(0.8, Math.max(0, armor / (armor + 2000)));
        const itemReduction = (this._getEffect(target, 'damage_reduction')?.damageReductionPercent || 0) / 100;
        return Math.min(0.9, 1 - (1 - armorReduction) * (1 - itemReduction));
    }

    _applyNroGearDamageReduction(damage, target) {
        if (this.gameConfig.gameMode !== 'nro') return damage;
        const percent = Math.min(60, Math.max(0, Number(target?.nroDamageReductionPercent) || 0));
        if (percent <= 0) return damage;
        const incomingDamage = Math.max(0, Math.floor(Number(damage) || 0));
        // Player.injured subtracts calPercent(damage, tlGiamst) after defense.
        return Math.max(1, incomingDamage - Math.floor(incomingDamage * percent / 100));
    }

    _getQckkDamage(attacker) {
        const sameInstance = (entity) => Number(entity.mapId) === Number(attacker.mapId)
            && Number(entity.zoneId || 0) === Number(attacker.zoneId || 0);
        const totalHp = [
            ...Object.values(this.monsters).filter((entity) => !entity.isDead && entity.hp > 0 && sameInstance(entity)),
            ...Object.values(this.players).filter((entity) => entity.hp > 0 && sameInstance(entity))
        ].reduce((sum, entity) => sum + entity.hp, 0);
        // Source NPoint.getDameAttack(QUA_CAU_KENH_KHI): zone HP / 10 + STR × 10.
        return Math.floor(totalHp / 10) + Math.round(Number(attacker.str || attacker.atk || 0) * 10);
    }

    _runDamagePulse(action, owner) {
        let victims = [];
        if (action.kind === 'channel') {
            const target = action.targetId && (this.monsters[action.targetId] || this.players[action.targetId]);
            const valid = target && this._canTarget(owner, target) ? target : this._resolveTarget(owner, null,
                metersToPixels(action.skill.rangeMeters, this.gameConfig.world.pixelsPerMeter)).target;
            if (valid) victims = [this._damageTarget(owner, valid, action.skill, {})];
            if (valid && action.skill.knockbackChance && Math.random() < action.skill.knockbackChance) this._knockback(valid, owner, 18);
        } else {
            const radiusPx = metersToPixels(action.skill.radiusMeters || 3, this.gameConfig.world.pixelsPerMeter);
            const targets = [...Object.values(this.monsters), ...Object.values(this.players)]
                .filter((target) => this._canTarget(owner, target) && Math.hypot(target.x - action.position.x, target.y - action.position.y) <= radiusPx);
            victims = targets.map((target) => this._damageTarget(owner, target, action.skill, {})).filter(Boolean);
        }
        if (victims.length) {
            this._emitDamage({ playerId: owner.id, skillId: action.skillId, skillType: action.skill.type, position: action.position, damageTaken: victims });
            this.io?.to(owner.id).emit('statsUpdate', {
                hp: owner.hp, maxHp: owner.maxHp, mp: owner.mp, maxMp: owner.maxMp,
                gold: owner.inventory.gold, dtn: owner.inventory.dtn, power: owner.inventory.power, exp: owner.inventory.exp,
                level: owner.inventory.level, maxExp: owner.inventory.maxExp
            });
        }
    }

    _runHealPulse(action, owner) {
        const radiusPx = metersToPixels(action.skill.radiusMeters || 3, this.gameConfig.world.pixelsPerMeter);
        for (const ally of Object.values(this.players)) {
            const isAlly = ally.id === owner.id || (owner.partyId && ally.partyId === owner.partyId);
            if (!isAlly) continue;
            if (ally.hp <= 0 || Math.hypot(ally.x - action.position.x, ally.y - action.position.y) > radiusPx) continue;
            const hp = Math.max(1, Math.round(ally.maxHp * action.skill.healPercentPerSecond / 100));
            const mp = Math.max(1, Math.round(ally.maxMp * action.skill.healPercentPerSecond / 100));
            const healedHp = Math.min(hp, ally.maxHp - ally.hp);
            const healedMp = Math.min(mp, ally.maxMp - ally.mp);
            ally.hp += healedHp;
            ally.mp += healedMp;
            if (healedHp > 0 || healedMp > 0) {
                this._emitDamage({ playerId: owner.id, skillId: action.skillId, skillType: action.skill.type, position: action.position, damageTaken: [], healed: [{ targetId: ally.id, hp: healedHp, mp: healedMp }] });
                this.io?.to(ally.id).emit('statsUpdate', { hp: ally.hp, mp: ally.mp });
            }
        }
    }

    _applyInstantHeal(owner, skill, position) {
        const radiusPx = metersToPixels(skill.radiusMeters || 30, this.gameConfig.world.pixelsPerMeter);
        const healed = [];
        for (const ally of Object.values(this.players)) {
            const isAlly = ally.id === owner.id || (owner.partyId && ally.partyId === owner.partyId);
            const sameInstance = Number(ally.mapId) === Number(owner.mapId)
                && Number(ally.zoneId || 0) === Number(owner.zoneId || 0);
            if (!isAlly || !sameInstance || ally.hp <= 0
                || Math.hypot(ally.x - position.x, ally.y - position.y) > radiusPx) continue;
            const hp = Math.max(0, Math.floor(ally.maxHp * skill.healPercent / 100));
            const mp = Math.max(0, Math.floor(ally.maxMp * skill.healPercent / 100));
            const healedHp = Math.min(hp, ally.maxHp - ally.hp);
            const healedMp = Math.min(mp, ally.maxMp - ally.mp);
            ally.hp += healedHp;
            ally.mp += healedMp;
            if (healedHp > 0 || healedMp > 0) {
                healed.push({ targetId: ally.id, hp: healedHp, mp: healedMp });
                this.io?.to(ally.id).emit('statsUpdate', { hp: ally.hp, mp: ally.mp });
            }
        }
        if (healed.length) {
            this._emitDamage({ playerId: owner.id, skillId: skill.id, skillType: skill.type,
                position, damageTaken: [], healed });
        }
        return healed;
    }

    cancelCharge(playerId) {
        const player = this.players[playerId];
        const wasCharging = player?.effects?.some((effect) => effect.type === 'charging');
        if (!wasCharging) return false;
        this.actions = this.actions.filter((action) => !(action.playerId === playerId && action.kind === 'charge_recovery'));
        this._clearEffects(player, ['charging']);
        return true;
    }

    _runChannelShot(action, owner) { this._runDamagePulse(action, owner); }

    _dashBehind(player, target) {
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const distance = Math.hypot(dx, dy) || 1;
        const offsetPx = metersToPixels(1, this.gameConfig.world.pixelsPerMeter);
        const desired = { x: target.x + (dx / distance) * offsetPx, y: target.y + (dy / distance) * offsetPx };
        const clamped = clampPlayerPosition(player, desired, this.gameConfig.map);
        player.x = clamped.x;
        player.y = clamped.y;
    }

    _dashBack(player, skill) {
        let dx = Number.isFinite(player.input?.axisX)
            ? player.input.axisX : Number(player.input?.right) - Number(player.input?.left);
        let dy = Number.isFinite(player.input?.axisY)
            ? player.input.axisY : Number(player.input?.down) - Number(player.input?.up);
        if (!dx && !dy) { dx = 1; dy = 0; }
        const distance = Math.hypot(dx, dy) || 1;
        const dashPx = metersToPixels(skill.dashDistanceMeters || 3, this.gameConfig.world.pixelsPerMeter);
        const desired = { x: player.x - (dx / distance) * dashPx, y: player.y - (dy / distance) * dashPx };
        const clamped = clampPlayerPosition(player, desired, this.gameConfig.map);
        player.x = clamped.x;
        player.y = clamped.y;
    }

    _knockback(target, source, distancePx) {
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.hypot(dx, dy) || 1;
        target.x += (dx / distance) * distancePx;
        target.y += (dy / distance) * distancePx;
    }

    _emitDamage(payload) {
        const source = this.players[payload.playerId] || this.monsters[payload.playerId];
        const room = this.gameConfig.gameMode === 'nro' && source?.mapId !== undefined
            ? `map_${Number(source.mapId)}_zone_${Number(source.zoneId) || 0}` : 'room_chuong0';
        this.io?.to(room).emit('damageTaken', payload);
    }

    _emitMonsterAttack(monster, target, { isRangedAttack, skillType, sequence }) {
        const room = this.gameConfig.gameMode === 'nro' && monster.mapId !== undefined
            ? `map_${Number(monster.mapId)}_zone_${Number(monster.zoneId) || 0}` : 'room_chuong0';
        this.io?.to(room).emit('monsterAttack', {
            monsterId: monster.id,
            targetId: target.id,
            skillId: 'monster_attack',
            skillType,
            isRangedAttack,
            sequence,
            facing: Math.sign(Number(target.x) - Number(monster.x)) || monster.facing || 1,
            from: { x: monster.x, y: monster.y - 22 },
            to: { x: target.x, y: target.y - 20 }
        });
    }
}

module.exports = { SkillManager, clampSkillLevel };
