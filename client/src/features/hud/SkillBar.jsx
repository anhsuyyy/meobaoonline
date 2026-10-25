import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { ASSET_MANIFEST } from '../../game/config/assetManifest';
import networkInstance from '../../game/network';

/**
 * SkillBar - Thanh kỹ năng cạnh dưới, phong cách MMORPG khung vàng đồng
 * Đặt ở giữa bottom, layout: [Quick Slots][Kỹ năng chính][Auto/Nhặt]
 */
const SKILLS = ASSET_MANIFEST.skills;

const CooldownOverlay = ({ pct, remainingMs }) => {
    if (pct <= 0) return null;
    return (
        <div style={{
            position: 'absolute', inset: 0, borderRadius: 8,
            background: `conic-gradient(rgba(0,0,0,0.75) ${pct * 360}deg, transparent ${pct * 360}deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 10, fontWeight: 900,
            textShadow: '0 1px 3px #000',
            zIndex: 2, pointerEvents: 'none'
        }}>
            {remainingMs >= 1000 ? `${(remainingMs / 1000).toFixed(1)}s` : `${(remainingMs / 1000).toFixed(2)}s`}
        </div>
    );
};

const SkillSlot = ({ skill, isActive, onPress, cooldownPct = 0, remainingMs = 0, mpInsufficient = false }) => (
    <button
        onClick={onPress}
        title={`${skill.name} (${skill.hotkey}) – ${skill.mpCost} MP`}
        style={{
            position: 'relative',
            width: 46, height: 46,
            background: mpInsufficient
                ? 'linear-gradient(180deg, #1e1e1e 0%, #0d0d0d 100%)'
                : 'linear-gradient(180deg, #2c1f0e 0%, #1a1008 100%)',
            border: `2px solid ${mpInsufficient ? '#374151' : isActive ? '#fde047' : '#b45309'}`,
            outline: mpInsufficient ? 'none' : `1px solid ${isActive ? '#ca8a04' : '#78350f'}`,
            borderRadius: 8,
            cursor: mpInsufficient ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
            opacity: mpInsufficient ? 0.45 : 1,
            boxShadow: isActive
                ? '0 0 10px rgba(253,224,71,0.7), inset 0 1px 3px rgba(253,224,71,0.3)'
                : '0 2px 6px rgba(0,0,0,0.6), inset 0 1px 2px rgba(251,191,36,0.1)',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            flexShrink: 0
        }}
    >
        {/* Emoji icon */}
        <span style={{ filter: mpInsufficient ? 'grayscale(80%)' : 'none', userSelect: 'none' }}>
            {skill.emoji}
        </span>

        {/* Cooldown overlay */}
        <CooldownOverlay pct={cooldownPct} remainingMs={remainingMs} />

        {/* Phím tắt badge góc trên phải */}
        <span style={{
            position: 'absolute', top: -6, right: -4,
            background: '#0c0804',
            color: isActive ? '#fde047' : '#f59e0b',
            border: `1px solid ${isActive ? '#ca8a04' : '#78350f'}`,
            borderRadius: 4, padding: '0 3px',
            fontSize: 8, fontWeight: 900,
            lineHeight: '13px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.7)'
        }}>
            {skill.hotkey?.split(' / ')[0] || '?'}
        </span>

        {/* MP cost badge góc dưới trái */}
        {skill.mpCost > 0 && (
            <span style={{
                position: 'absolute', bottom: -6, left: '50%',
                transform: 'translateX(-50%)',
                background: '#0c1a2e',
                color: '#60a5fa', border: '1px solid #172554',
                borderRadius: 4, padding: '0 3px',
                fontSize: 7, fontWeight: 700,
                lineHeight: '12px',
                whiteSpace: 'nowrap'
            }}>
                {skill.mpCost}MP
            </span>
        )}
    </button>
);

const SkillBar = () => {
    const { mp, isAuto } = useSelector((state) => state.game);
    const [cooldowns, setCooldowns] = useState({}); // skillId → { endsAt, durationMs }
    const [clock, setClock] = useState(Date.now());
    const [hoveredSkill, setHoveredSkill] = useState(null);

    // Đọc thời điểm kết thúc từ server event; cập nhật HUD độc lập với 20Hz game tick.
    useEffect(() => {
        const id = setInterval(() => {
            setClock(Date.now());
            setCooldowns((prev) => Object.fromEntries(
                Object.entries(prev).filter(([, value]) => value.endsAt > Date.now())
            ));
        }, 50);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const onAuthoritativeCast = (event) => {
            const { skillId, cooldownMs } = event.detail || {};
            if (!SKILLS[skillId] || !Number.isFinite(cooldownMs)) return;
            const durationMs = Math.max(0, cooldownMs);
            setCooldowns((previous) => ({
                ...previous,
                [skillId]: { endsAt: Date.now() + durationMs, durationMs }
            }));
        };
        window.addEventListener('game:skill-cooldown', onAuthoritativeCast);
        return () => window.removeEventListener('game:skill-cooldown', onAuthoritativeCast);
    }, []);

    const castSkill = useCallback((skillId) => {
        const skill = SKILLS[skillId];
        if (!skill) return;
        if ((cooldowns[skillId]?.endsAt || 0) > Date.now()) return;
        if (mp < skill.mpCost) return;

        const socket = networkInstance.getSocket();
        if (socket) socket.emit('playerAttack', { skillId });

    }, [cooldowns, mp]);

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
            const target = event.target;
            if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;

            const skillId = ({
                Digit1: 's1', Digit2: 's2', Digit3: 's3', Digit4: 's4', Digit5: 's5',
                Numpad1: 's1', Numpad2: 's2', Numpad3: 's3', Numpad4: 's4', Numpad5: 's5',
                Space: 's1', KeyQ: 's3'
            })[event.code];
            if (!skillId) return;
            event.preventDefault();
            castSkill(skillId);
        };
        const onVirtualSkill = (event) => castSkill(event.detail);

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('game:cast-skill', onVirtualSkill);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('game:cast-skill', onVirtualSkill);
        };
    }, [castSkill]);

    const toggleAuto = useCallback(() => {
        const socket = networkInstance.getSocket();
        if (socket) socket.emit('toggleAuto', !isAuto);
    }, [isAuto]);

    const handlePickup = useCallback(() => {
        window.dispatchEvent(new Event('game:pickup'));
    }, []);

    const skillList = ['s1', 's2', 's3', 's4', 's5'];

    return (
        <div className="pointer-events-auto flex flex-col items-center gap-1.5" style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.85))' }}>
            {/* Tooltip kỹ năng */}
            {hoveredSkill && (
                <div style={{
                    background: 'linear-gradient(180deg, rgba(28,18,8,0.98) 0%, rgba(12,8,3,0.99) 100%)',
                    border: '2px solid #d97706',
                    outline: '1px solid #78350f',
                    borderRadius: 8,
                    padding: '6px 10px',
                    maxWidth: 220,
                    textAlign: 'center',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.9), 0 0 10px rgba(217,119,6,0.3)',
                    pointerEvents: 'none'
                }}>
                    <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 11, marginBottom: 3 }}>
                        {hoveredSkill.emoji} {hoveredSkill.name}
                        {hoveredSkill.mpCost > 0 && (
                            <span style={{ color: '#60a5fa', fontSize: 9, marginLeft: 5 }}>({hoveredSkill.mpCost} MP)</span>
                        )}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: 10 }}>
                        Phím: <span style={{ color: '#fde047' }}>{hoveredSkill.hotkey}</span>
                    </div>
                </div>
            )}

            {/* Thanh kỹ năng chính */}
            <div style={{
                background: 'linear-gradient(180deg, rgba(28,18,8,0.95) 0%, rgba(12,8,3,0.98) 100%)',
                border: '2px solid #d97706',
                outline: '1px solid #78350f',
                borderRadius: 12,
                padding: '8px 10px',
                boxShadow: '0 0 20px rgba(217,119,6,0.35), inset 0 1px 4px rgba(251,191,36,0.15)',
                display: 'flex', alignItems: 'center', gap: 6
            }}>
                {/* 5 kỹ năng */}
                <div style={{ display: 'flex', gap: 5 }}>
                    {skillList.map((id) => {
                        const skill = SKILLS[id];
                        const cooldown = cooldowns[id];
                        const remainingMs = Math.max(0, (cooldown?.endsAt || 0) - clock);
                        const cdPct = cooldown && cooldown.durationMs > 0 ? remainingMs / cooldown.durationMs : 0;
                        return (
                            <div
                                key={id}
                                onMouseEnter={() => setHoveredSkill(skill)}
                                onMouseLeave={() => setHoveredSkill(null)}
                            >
                                <SkillSlot
                                    skill={skill}
                                    isActive={false}
                                    onPress={() => castSkill(id)}
                                    cooldownPct={cdPct}
                                    remainingMs={remainingMs}
                                    mpInsufficient={mp < skill.mpCost}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Divider */}
                <div style={{ width: 1.5, height: 36, background: 'rgba(180,83,9,0.5)' }} />

                {/* Nhặt đồ */}
                <button
                    onClick={handlePickup}
                    title="Nhặt vật phẩm rơi gần (ENTER)"
                    style={{
                        position: 'relative',
                        width: 42, height: 42,
                        background: 'linear-gradient(180deg, #2c1f0e, #1a1008)',
                        border: '2px solid #ca8a04',
                        outline: '1px solid #78350f',
                        borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                        flexShrink: 0
                    }}
                >
                    🪙
                    <span style={{
                        position: 'absolute', top: -6, right: -4,
                        background: '#0c0804', color: '#fde047',
                        border: '1px solid #ca8a04', borderRadius: 4,
                        padding: '0 2px', fontSize: 7, fontWeight: 900, lineHeight: '13px'
                    }}>ENT</span>
                </button>

                {/* Auto Farm */}
                <button
                    onClick={toggleAuto}
                    title="Bật/Tắt Auto Farm (F)"
                    style={{
                        position: 'relative',
                        height: 42, padding: '0 10px',
                        background: isAuto
                            ? 'linear-gradient(180deg, #065f46, #034d38)'
                            : 'linear-gradient(180deg, #1a1008, #0c0804)',
                        border: `2px solid ${isAuto ? '#10b981' : '#374151'}`,
                        outline: isAuto ? '1px solid #065f46' : '1px solid #1f2937',
                        borderRadius: 8,
                        cursor: 'pointer',
                        boxShadow: isAuto
                            ? '0 0 12px rgba(16,185,129,0.6), inset 0 1px 3px rgba(52,211,153,0.2)'
                            : '0 2px 6px rgba(0,0,0,0.5)',
                        animation: isAuto ? 'pulse 2s ease-in-out infinite' : 'none',
                        flexShrink: 0
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <span style={{ fontSize: 13 }}>⚡</span>
                        <span style={{ color: isAuto ? '#34d399' : '#9ca3af', fontSize: 8, fontWeight: 900, whiteSpace: 'nowrap' }}>
                            {isAuto ? 'AUTO: BẬT' : 'AUTO'}
                        </span>
                    </div>
                    <span style={{
                        position: 'absolute', top: -6, right: -4,
                        background: '#0c0804',
                        color: isAuto ? '#34d399' : '#6b7280',
                        border: `1px solid ${isAuto ? '#065f46' : '#374151'}`,
                        borderRadius: 4, padding: '0 3px',
                        fontSize: 8, fontWeight: 900, lineHeight: '13px'
                    }}>F</span>
                </button>
            </div>
        </div>
    );
};

export default SkillBar;
