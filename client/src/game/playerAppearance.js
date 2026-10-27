const MONKEY_HEAD_PARTS = [192, 195, 196, 199, 197, 200, 198];

export function resolveNroPlayerAppearance(player, now = Date.now()) {
    const source = player || {};
    const monkey = (source.effects || []).find((effect) => effect.type === 'monkey_transform'
        && Number(effect.expiresAt) > now);
    if (!monkey) return source;

    const level = Math.max(1, Math.min(7, Math.floor(Number(monkey.levelMonkey) || 1)));
    return { ...source, headPartId: MONKEY_HEAD_PARTS[level - 1], bodyPartId: 193, legPartId: 194 };
}
