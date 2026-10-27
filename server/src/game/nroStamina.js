const DEFAULT_MAX_STAMINA = 1000;
const STAMINA_RECOVERY_INTERVAL_MS = 60_000;
const ATTACKS_PER_STAMINA = 5;

function initializeNroStamina(player, now = Date.now()) {
    const max = Number(player?.maxStamina);
    const current = Number(player?.stamina);
    player.maxStamina = Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_MAX_STAMINA;
    player.stamina = Number.isFinite(current)
        ? Math.max(0, Math.min(player.maxStamina, Math.floor(current)))
        : player.maxStamina;
    player.staminaAttackCount = Math.max(0, Math.floor(Number(player.staminaAttackCount) || 0));
    player.staminaRecoveredAt = Math.max(0, Number(player.staminaRecoveredAt) || now);
    return player;
}

/**
 * Source SkillService.useSkillAttack consumes one stamina per five successful
 * attack actions. Charm 218 (`tdDeoDai`) skips the decrement, not the zero check.
 */
function consumeNroStaminaForAttack(player, now = Date.now()) {
    initializeNroStamina(player, now);
    if (player.stamina <= 0) return { ok: false, changed: false };

    const hasEnduranceCharm = Array.isArray(player.effects) && player.effects.some((effect) =>
        effect?.type === 'nro_charm_deo_dai' && Number(effect.expiresAt) > now
    );
    if (hasEnduranceCharm) return { ok: true, changed: false };

    player.staminaAttackCount++;
    if (player.staminaAttackCount < ATTACKS_PER_STAMINA) return { ok: true, changed: false };

    player.staminaAttackCount = 0;
    player.stamina = Math.max(0, player.stamina - 1);
    return { ok: true, changed: true };
}

function recoverNroStamina(player, now = Date.now()) {
    initializeNroStamina(player, now);
    if (player.stamina >= player.maxStamina || now - player.staminaRecoveredAt < STAMINA_RECOVERY_INTERVAL_MS) {
        return false;
    }
    player.stamina++;
    player.staminaRecoveredAt = now;
    return true;
}

module.exports = {
    ATTACKS_PER_STAMINA,
    DEFAULT_MAX_STAMINA,
    STAMINA_RECOVERY_INTERVAL_MS,
    consumeNroStaminaForAttack,
    initializeNroStamina,
    recoverNroStamina
};
