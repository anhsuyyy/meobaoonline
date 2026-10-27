import { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import networkInstance from '../../game/network';
import { getSkillFallbackIcon } from './skillIconFallback';
import { getNroSkillIcon } from './nroSkillIcon';
import { setActiveSkill, setSystemMessage } from '../../store/gameSlice';

/**
 * SkillBar - Thanh kỹ năng cạnh dưới, phong cách MMORPG khung vàng đồng
 * Đặt ở giữa bottom, layout: [Quick Slots][Kỹ năng chính][Auto/Nhặt]
 */
const EMPTY_SKILLS = Object.freeze({});

const getSkillCooldownMs = (skill, level) => {
    const configured = Number(skill?.cooldownMs);
    if (Number.isFinite(configured) && configured >= 0) return configured;

    const scaling = skill?.levelScaling?.cooldownMs;
    if (!Array.isArray(scaling) || scaling.length === 0) return 650;
    if (scaling.length === 1) return Number(scaling[0]) || 650;

    const maxLevel = Math.max(2, Number(skill?.maxLevel) || 7);
    const progress = (Math.min(maxLevel, Math.max(1, Number(level) || 1)) - 1) / (maxLevel - 1);
    if (scaling.length === maxLevel) return Number(scaling[Math.round(progress * (maxLevel - 1))]) || 650;
    return Math.round(Number(scaling[0]) + (Number(scaling[1]) - Number(scaling[0])) * progress) || 650;
};

const CooldownOverlay = ({ pct, remainingMs }) => {
    if (pct <= 0) return null;
    return (
        <div style={{
            position: 'absolute', inset: 0, borderRadius: 8,
            background: `conic-gradient(from -90deg, rgba(0,0,0,0.78) 0deg, rgba(0,0,0,0.78) ${pct * 360}deg, transparent ${pct * 360}deg, transparent 360deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 10, fontWeight: 900,
            textShadow: '0 1px 3px #000',
            zIndex: 2, pointerEvents: 'none'
        }}>
            {remainingMs >= 1000 ? `${(remainingMs / 1000).toFixed(1)}s` : `${(remainingMs / 1000).toFixed(2)}s`}
        </div>
    );
};

const SkillSlot = ({ skill, fallbackIcon, level = 1, isActive, onPress, cooldownPct = 0, remainingMs = 0, mpInsufficient = false }) => (
    <button
        onClick={onPress}
        title={`${skill.name} · ${skill.unlocked === false ? `Cần sức mạnh ${skill.powerRequired}` : `Lv.${level}`} (${skill.key || skill.hotkey || '?'}) · ${skill.mpCost} MP`}
        disabled={skill.unlocked === false}
        style={{
            position: 'relative',
            width: 46, height: 46,
            background: mpInsufficient
                ? 'linear-gradient(180deg, #1e1e1e 0%, #0d0d0d 100%)'
                : 'linear-gradient(180deg, #2c1f0e 0%, #1a1008 100%)',
            border: `2px solid ${mpInsufficient ? '#374151' : isActive ? '#fde047' : '#b45309'}`,
            outline: mpInsufficient ? 'none' : `1px solid ${isActive ? '#ca8a04' : '#78350f'}`,
            borderRadius: 8,
            cursor: skill.unlocked === false ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
            opacity: skill.unlocked === false ? 0.45 : mpInsufficient ? 0.72 : 1,
            boxShadow: isActive
                ? '0 0 10px rgba(253,224,71,0.7), inset 0 1px 3px rgba(253,224,71,0.3)'
                : '0 2px 6px rgba(0,0,0,0.6), inset 0 1px 2px rgba(251,191,36,0.1)',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            flexShrink: 0
        }}
    >
        <img
            src={skill.icon || fallbackIcon}
            onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = fallbackIcon; }}
            alt="" draggable="false"
            style={{ width: 28, height: 28, borderRadius: 5, filter: mpInsufficient || skill.unlocked === false ? 'grayscale(80%)' : 'none', userSelect: 'none' }}
        />

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
            {skill.key || skill.hotkey?.split(' / ')[0] || '?'}
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

const BasicAttackSlot = ({ cooldowns, skillCooldowns, clock, onPress, onSelect, isActive, activeSkillId }) => {
    const cooldown = cooldowns[activeSkillId] || skillCooldowns[activeSkillId];
    const remainingMs = Math.max(0, (cooldown?.endsAt || 0) - clock);
    const cooldownPct = cooldown?.durationMs ? remainingMs / cooldown.durationMs : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <button type="button" onClick={onSelect} aria-label="Chọn đánh thường" title="Chọn đánh thường (0)" style={{
                width: 22, height: 28, padding: 0, borderRadius: 6, border: `1px solid ${isActive ? '#fde047' : '#92400e'}`,
                background: '#1c1208', color: '#fde68a', fontSize: 8, fontWeight: 900, cursor: 'pointer',
                boxShadow: isActive ? '0 0 8px rgba(253,224,71,.65)' : 'none'
            }}>BT</button>
            <button
                type="button"
                aria-label="Đánh kỹ năng đang chọn"
                onClick={onPress}
                title="ĐÁNH · Space/Enter · dùng chiêu đang chọn"
                style={{
                    position: 'relative', width: 56, height: 56, borderRadius: '50%',
                    border: `2px solid ${isActive ? '#fde047' : '#fecaca'}`, color: '#fff', fontSize: 21,
                    background: 'linear-gradient(145deg, #fb7185, #991b1b)',
                    boxShadow: isActive ? '0 0 16px rgba(253,224,71,.72)' : '0 0 14px rgba(239,68,68,.5)', cursor: 'pointer', flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                }}
            >
                <span className="nro-attack-symbol" aria-hidden="true" />
                <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '.04em' }}>ĐÁNH</span>
                <CooldownOverlay pct={cooldownPct} remainingMs={remainingMs} />
            </button>
        </div>
    );
};

const SkillBar = ({ layout = 'default' }) => {
    const dispatch = useDispatch();
    const { hp, mp, isAuto, skillConfig, skillLevels, skillCooldowns, selectedTarget, activeSkillId, character } = useSelector((state) => state.game);
    const [autoAttackTargetId, setAutoAttackTargetId] = useState(null);
    const autoAttackLock = useRef(0);
    const autoAttackSkillId = useRef(activeSkillId || 'basic');
    const [nroMode, setNroMode] = useState(true);
    const hasCurrentSkillSchema = Object.keys(skillConfig || {}).length > 0 &&
        Object.values(skillConfig).every((skill) => skill.key && (Array.isArray(skill.levelScaling?.cooldownMs) || Number.isFinite(skill.cooldownMs)));
    // Never leak the legacy cat skill set while an NRO session is still loading
    // its server-authored skill definitions. The current basic action remains usable.
    const SKILLS = hasCurrentSkillSchema ? skillConfig : EMPTY_SKILLS;
    const [cooldowns, setCooldowns] = useState({}); // skillId → { endsAt, durationMs }
    const [clock, setClock] = useState(0);
    const [hoveredSkill, setHoveredSkill] = useState(null);

    useEffect(() => {
        const onAutoAttack = (event) => setAutoAttackTargetId(event.detail?.active ? event.detail.targetId : null);
        const stop = () => setAutoAttackTargetId(null);
        window.addEventListener('game:nro-auto-attack', onAutoAttack);
        window.addEventListener('game:nro-map-changed', stop);
        return () => {
            window.removeEventListener('game:nro-auto-attack', onAutoAttack);
            window.removeEventListener('game:nro-map-changed', stop);
        };
    }, []);

    useEffect(() => {
        if (autoAttackTargetId === null || autoAttackTargetId === undefined) return undefined;
        const selectedSkillId = activeSkillId || 'basic';
        if (autoAttackSkillId.current !== selectedSkillId) {
            autoAttackSkillId.current = selectedSkillId;
            autoAttackLock.current = 0;
        }
        const timer = window.setInterval(() => {
            // The scene owns the pinned auto-attack target and stops this loop on
            // movement, target change, death, or map change. Redux focus can be
            // briefly cleared while Phaser refreshes nearby targets; that must
            // not turn a double-click auto attack into a single cast.
            const skillId = activeSkillId || 'basic';
            const skill = SKILLS[skillId];
            if (Number(hp) <= 0) return;
            if (skillId !== 'basic' && (!skill || skill.unlocked === false || mp < Number(skill.mpCost || 0))) return;
            const now = Date.now();
            const cooldownUntil = Math.max(cooldowns[skillId]?.endsAt || 0, skillCooldowns[skillId]?.endsAt || 0);
            if (now < cooldownUntil || now < autoAttackLock.current) return;
            const socket = networkInstance.getSocket();
            if (!socket?.connected) return;
            socket.emit('castSkill', { skillId, target: autoAttackTargetId });
            autoAttackLock.current = now + Math.max(250, getSkillCooldownMs(skill, skillLevels[skillId]));
        }, 75);
        return () => window.clearInterval(timer);
    }, [autoAttackTargetId, activeSkillId, cooldowns, skillCooldowns, hp, mp, skillLevels, SKILLS]);

    useEffect(() => {
        const handleMode = (event) => setNroMode(event.detail?.gameMode === 'nro');
        window.addEventListener('game:mode', handleMode);
        return () => window.removeEventListener('game:mode', handleMode);
    }, []);

    // Đọc thời điểm kết thúc từ server event; cập nhật HUD độc lập với 20Hz game tick.
    useEffect(() => {
        const id = setInterval(() => {
            setClock(Date.now());
            setCooldowns((prev) => {
                const active = Object.entries(prev).filter(([, value]) => value.endsAt > Date.now());
                // Keep the object stable between cooldown changes. Replacing it on
                // every 50 ms restarted the 75 ms auto-attack timer before it fired.
                return active.length === Object.keys(prev).length ? prev : Object.fromEntries(active);
            });
        }, 50);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const reset = () => setCooldowns({});
        const onAuthoritativeCast = (event) => {
            const { skillId, cooldownMs } = event.detail || {};
            const skill = SKILLS[skillId];
            if (!skill && skillId !== 'basic') return;
            // Fallback lets this HUD work during a hot reload when the server still runs the previous build.
            const durationMs = Number.isFinite(cooldownMs) ? Math.max(0, cooldownMs) : (skill?.cooldown || 650);
            setCooldowns((previous) => ({
                ...previous,
                [skillId]: { endsAt: Date.now() + durationMs, durationMs }
            }));
        };
        const onCastRejected = (event) => {
            const { skillId } = event.detail || {};
            if (skillId) setCooldowns((previous) => {
                const next = { ...previous };
                delete next[skillId];
                return next;
            });
        };
        window.addEventListener('game:skill-cooldown', onAuthoritativeCast);
        window.addEventListener('game:skill-rejected', onCastRejected);
        window.addEventListener('game:skill-cooldowns-reset', reset);
        return () => {
            window.removeEventListener('game:skill-cooldown', onAuthoritativeCast);
            window.removeEventListener('game:skill-rejected', onCastRejected);
            window.removeEventListener('game:skill-cooldowns-reset', reset);
        };
    }, [SKILLS]);

    const selectSkill = useCallback((skillId) => {
        const skill = SKILLS[skillId];
        if (skillId !== 'basic' && (!skill || skill.unlocked === false)) return;
        dispatch(setActiveSkill(skillId));
    }, [SKILLS, dispatch]);

    const castSkill = useCallback((skillId) => {
        const skill = SKILLS[skillId];
        if (!skill || skill.unlocked === false) return;
        if (Math.max(cooldowns[skillId]?.endsAt || 0, skillCooldowns[skillId]?.endsAt || 0) > Date.now()) {
            dispatch(setSystemMessage('Đang hồi chiêu'));
            return;
        }
        if (mp < skill.mpCost) {
            dispatch(setSystemMessage('Không đủ KI để dùng kỹ năng.'));
            return;
        }

        const socket = networkInstance.getSocket();
        if (!socket?.connected) return;

        socket.emit('castSkill', { skillId, target: selectedTarget?.id || null });
    }, [SKILLS, cooldowns, dispatch, mp, selectedTarget, skillCooldowns]);

    const executeActiveSkill = useCallback(() => {
        const skillId = activeSkillId || 'basic';
        const cooldown = Math.max(cooldowns[skillId]?.endsAt || 0, skillCooldowns[skillId]?.endsAt || 0);
        if (cooldown > Date.now()) {
            dispatch(setSystemMessage('Đang hồi chiêu'));
            return;
        }
        if (skillId !== 'basic' && mp < (SKILLS[skillId]?.mpCost || 0)) {
            dispatch(setSystemMessage('Không đủ KI để dùng kỹ năng.'));
            return;
        }
        const socket = networkInstance.getSocket();
        if (!socket?.connected) return;
        socket.emit('castSkill', { skillId, target: selectedTarget?.id || null });
    }, [activeSkillId, cooldowns, dispatch, mp, selectedTarget, skillCooldowns, SKILLS]);

    const pressSkill = useCallback((skillId) => {
        if (!nroMode) {
            castSkill(skillId);
            return;
        }
        if ((activeSkillId || 'basic') === skillId) executeActiveSkill();
        else selectSkill(skillId);
    }, [activeSkillId, castSkill, executeActiveSkill, nroMode, selectSkill]);

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
            const target = event.target;
            if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
            if (layout === 'classic' && (document.querySelector('[role="dialog"], .classic-menu, .classic-chat-window')
                || (target instanceof HTMLElement && target.closest('button')))) return;

            const skillId = ({
                Digit1: 's1', Digit2: 's2', Digit3: 's3', Digit4: 's4', Digit5: 's5',
                Numpad1: 's1', Numpad2: 's2', Numpad3: 's3', Numpad4: 's4', Numpad5: 's5',
            })[event.code];
            if (!skillId) {
                if (nroMode && (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter')) {
                    event.preventDefault();
                    if (event.code !== 'Space') {
                        const interactEvent = new CustomEvent('game:nro-enter', { cancelable: true });
                        window.dispatchEvent(interactEvent);
                        if (interactEvent.defaultPrevented) return;
                    }
                    executeActiveSkill();
                } else if (nroMode && (event.code === 'Digit0' || event.code === 'Numpad0')) {
                    event.preventDefault();
                    selectSkill('basic');
                }
                return;
            }
            event.preventDefault();
            if (nroMode) selectSkill(skillId);
            else castSkill(skillId);
        };
        const onVirtualSkill = (event) => nroMode ? selectSkill(event.detail) : castSkill(event.detail);

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('game:cast-skill', onVirtualSkill);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('game:cast-skill', onVirtualSkill);
        };
    }, [castSkill, executeActiveSkill, nroMode, selectSkill, layout]);

    const toggleAuto = useCallback(() => {
        const socket = networkInstance.getSocket();
        if (socket) socket.emit('toggleAuto', !isAuto);
    }, [isAuto]);

    const handlePickup = useCallback(() => {
        window.dispatchEvent(new Event('game:pickup'));
    }, []);

    const skillList = nroMode ? ['s1', 's2', 'basic', 's3', 's4', 's5'] : ['s1', 's2', 's3', 'basic', 's4', 's5'];

    if (layout === 'classic') {
        const activeId = activeSkillId || 'basic';
        const activeCooldown = (cooldowns[activeId]?.endsAt || 0) > (skillCooldowns[activeId]?.endsAt || 0)
            ? cooldowns[activeId] : skillCooldowns[activeId];
        const attackRemaining = Math.max(0, (activeCooldown?.endsAt || 0) - clock);
        return <>
            <div className="classic-skill-strip" role="group" aria-label="Năm kỹ năng">
                {['s1', 's2', 's3', 's4', 's5'].map((id, index) => {
                    const skill = SKILLS[id];
                    const locked = !skill || skill.unlocked === false;
                    const cooldown = (cooldowns[id]?.endsAt || 0) > (skillCooldowns[id]?.endsAt || 0) ? cooldowns[id] : skillCooldowns[id];
                    const remaining = Math.max(0, (cooldown?.endsAt || 0) - clock);
                    const selected = activeId === id;
                    const name = skill?.name || (index === 0 ? 'Đấm Dragon / Demon / Galick' : `Kỹ năng ${index + 1}`);
                    const visibleName = id === 's1' ? name.replace(/^Chiêu\s+/i, '').replace(/^đấm/i, 'Đấm') : name;
                    const fallback = getSkillFallbackIcon(skill, id);
                    return <button type="button" key={id}
                        className={`classic-skill ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}`}
                        aria-label={`Chọn kỹ năng ${index + 1}: ${name}`} aria-pressed={selected}
                        title={skill ? `${visibleName} · ${skill.mpCost} KI${locked ? ' · Chưa mở' : ''}` : `${name} · Đang tải kỹ năng`}
                        onPointerDown={(event) => event.preventDefault()}
                        disabled={locked} onClick={() => pressSkill(id)}>
                        <img src={getNroSkillIcon(skill, character?.nroCharacter?.raceId) || skill?.icon || fallback}
                            alt="" draggable="false" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = fallback; }} />
                        <span className="classic-slot-key">{index + 1}</span>
                        {id === 's1' && <span className="classic-slot-name">{visibleName}</span>}
                        <CooldownOverlay pct={cooldown?.durationMs ? remaining / cooldown.durationMs : 0} remainingMs={remaining} />
                        {locked && <span className="classic-slot-lock" aria-hidden="true">×</span>}
                    </button>;
                })}
            </div>
            <div className="classic-combat-controls">
                <button type="button" className="classic-cycle classic-round-button" aria-label="Chuyển đối tượng" title="Chuyển đối tượng"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => window.dispatchEvent(new Event('game:nro-cycle-focus'))}>
                    <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M36 17A15 15 0 0 0 10 20M12 31a15 15 0 0 0 26-3" fill="none" stroke="currentColor" strokeWidth="6" /><path d="m5 12 4 14 13-6M43 36l-4-14-13 6" fill="currentColor" /></svg>
                </button>
                <button type="button" className={`classic-basic classic-round-button ${activeId === 'basic' ? 'selected' : ''}`}
                    onPointerDown={(event) => event.preventDefault()}
                    aria-label={activeId === 'basic' ? 'Đánh thường' : 'Chọn đấm thường'} aria-pressed={activeId === 'basic'} title="Đấm thường · phím 0" onClick={() => pressSkill('basic')}>0</button>
                <button type="button" className="classic-attack classic-round-button" aria-label="Đánh kỹ năng đang chọn"
                    onPointerDown={(event) => event.preventDefault()}
                    title={`Đánh · ${SKILLS[activeId]?.name || 'Đấm thường'} · Space / Enter`} onClick={executeActiveSkill}>
                    <svg className="classic-fist" viewBox="0 0 80 80" aria-hidden="true">
                        <path d="m40 3 5 11 10-8 1 14 13-3-5 12 13 5-11 8 11 9-15 2 3 14-13-5-7 12-7-11-10 8-1-14-13 3 5-12-13-5 11-8L6 27l15-2-3-14 13 5z" fill="none" stroke="#ffdf9b" strokeWidth="2" />
                        <path d="M22 46 18 33q0-6 6-6h3v-5q0-5 5-5t5 5q0-7 5-7t5 7q1-5 6-4t4 7q6-2 7 4l1 16-9 15H32z" fill="#fff7d9" stroke="#a74d22" strokeWidth="2.5" strokeLinejoin="round" />
                        <path d="M27 28v13m10-18v16m10-16v16m10-13v14M23 44l10-7q6-3 8 2l-6 8 12 3" fill="none" stroke="#c77c41" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    <span className="classic-attack-label">ĐÁNH</span>
                    <CooldownOverlay pct={activeCooldown?.durationMs ? attackRemaining / activeCooldown.durationMs : 0} remainingMs={attackRemaining} />
                </button>
            </div>
        </>;
    }

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
                        Phím: <span style={{ color: '#fde047' }}>{hoveredSkill.key || hoveredSkill.hotkey}</span>
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
                        if (id === 'basic') {
                            return <BasicAttackSlot key={id} cooldowns={cooldowns} skillCooldowns={skillCooldowns} clock={clock} onPress={executeActiveSkill} onSelect={() => nroMode ? pressSkill('basic') : selectSkill('basic')} isActive={activeSkillId === 'basic'} activeSkillId={activeSkillId || 'basic'} />;
                        }
                        const skill = SKILLS[id];
                        if (!skill) return null;
                        const displayedSkill = nroMode
                            ? { ...skill, key: id.slice(1), icon: getNroSkillIcon(skill, character?.nroCharacter?.raceId) || skill.icon }
                            : skill;
                        const cooldown = cooldowns[id] || skillCooldowns[id];
                        const remainingMs = Math.max(0, (cooldown?.endsAt || 0) - clock);
                        const cdPct = cooldown && cooldown.durationMs > 0 ? remainingMs / cooldown.durationMs : 0;
                        return (
                            <div
                                key={id}
                                onMouseEnter={() => setHoveredSkill(displayedSkill)}
                                onMouseLeave={() => setHoveredSkill(null)}
                            >
                                <SkillSlot
                                    skill={displayedSkill}
                                    fallbackIcon={getSkillFallbackIcon(displayedSkill, id)}
                                    level={skillLevels[id] || 1}
                                    isActive={activeSkillId === id}
                                    onPress={() => pressSkill(id)}
                                    cooldownPct={cdPct}
                                    remainingMs={remainingMs}
                                    mpInsufficient={mp < skill.mpCost}
                                />
                            </div>
                        );
                    })}
                </div>

                {!nroMode && <>
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
                        <i className="nro-stat-glyph coin" aria-hidden="true" />
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
                        <i className="nro-stat-glyph power" aria-hidden="true" />
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
                </>}
            </div>
        </div>
    );
};

export default SkillBar;
