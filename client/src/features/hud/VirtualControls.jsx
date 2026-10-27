import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import networkInstance from '../../game/network';
import { getSkillFallbackIcon } from './skillIconFallback';
import { getNroSkillIcon } from './nroSkillIcon';
import { setActiveSkill, setSystemMessage } from '../../store/gameSlice';

const SKILL_IDS = ['s1', 's2', 's3', 's4', 's5'];
const EMPTY_SKILLS = Object.freeze({});

const VirtualControls = ({ movementOnly = false }) => {
    const dispatch = useDispatch();
    const { isAuto, character, skillConfig, skillCooldowns, selectedTarget, activeSkillId, mp } = useSelector((state) => state.game);
    const hasCurrentSkillSchema = Object.keys(skillConfig || {}).length > 0 &&
        Object.values(skillConfig).every((skill) => skill.key && (Array.isArray(skill.levelScaling?.cooldownMs) || Number.isFinite(skill.cooldownMs)));
    const skills = hasCurrentSkillSchema ? skillConfig : EMPTY_SKILLS;
    const directionRef = useRef({ up: false, down: false, left: false, right: false, jump: false });
    const directionPointersRef = useRef({});
    const [cooldowns, setCooldowns] = useState({});
    const [clock, setClock] = useState(0);
    const [nroMode, setNroMode] = useState(true);

    useEffect(() => {
        const handleMode = (event) => setNroMode(event.detail?.gameMode === 'nro');
        window.addEventListener('game:mode', handleMode);
        return () => window.removeEventListener('game:mode', handleMode);
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => {
            const now = Date.now();
            setClock(now);
            setCooldowns((current) => Object.fromEntries(
                Object.entries(current).filter(([, value]) => value.endsAt > now)
            ));
        }, 50);
        const updateCooldown = (event) => {
            const { skillId, cooldownMs } = event.detail || {};
            const skill = skills[skillId];
            if (!skill && skillId !== 'basic') return;
            const durationMs = Number.isFinite(cooldownMs) ? cooldownMs : (skill?.cooldown || 650);
            setCooldowns((current) => ({
                ...current,
                [skillId]: { endsAt: Date.now() + durationMs, durationMs }
            }));
        };
        const clearRejected = (event) => {
            const { skillId } = event.detail || {};
            if (!skillId) return;
            setCooldowns((current) => {
                const next = { ...current };
                delete next[skillId];
                return next;
            });
        };
        window.addEventListener('game:skill-cooldown-preview', updateCooldown);
        window.addEventListener('game:skill-cooldown', updateCooldown);
        window.addEventListener('game:skill-rejected', clearRejected);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('game:skill-cooldown-preview', updateCooldown);
            window.removeEventListener('game:skill-cooldown', updateCooldown);
            window.removeEventListener('game:skill-rejected', clearRejected);
        };
    }, [skills]);

    const publishDirections = useCallback(() => {
        const directions = { ...directionRef.current };
        const axisX = Number(directions.right) - Number(directions.left);
        const axisY = nroMode ? 0 : Number(directions.down) - Number(directions.up);
        const payload = nroMode
            ? { left: directions.left, right: directions.right, up: directions.up, jump: directions.jump, down: directions.down }
            : { left: directions.left, right: directions.right, up: directions.up, down: directions.down };
        networkInstance.getSocket()?.emit('playerInput', payload);
        window.dispatchEvent(new CustomEvent('game:virtual-movement', {
            detail: { axisX, axisY, up: directions.up, active: Object.values(directions).some(Boolean) }
        }));
    }, [nroMode]);

    const pressDirection = (event, direction) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        directionPointersRef.current[direction] = event.pointerId;
        directionRef.current[direction] = true;
        publishDirections();
    };

    const releaseDirection = (event, direction) => {
        if (directionPointersRef.current[direction] !== event.pointerId) return;
        delete directionPointersRef.current[direction];
        directionRef.current[direction] = false;
        publishDirections();
    };

    useEffect(() => {
        const releaseAll = () => {
            if (!Object.values(directionRef.current).some(Boolean)) return;
            directionRef.current = { up: false, down: false, left: false, right: false, jump: false };
            directionPointersRef.current = {};
            publishDirections();
        };
        window.addEventListener('blur', releaseAll);
        document.addEventListener('visibilitychange', releaseAll);
        return () => {
            window.removeEventListener('blur', releaseAll);
            document.removeEventListener('visibilitychange', releaseAll);
        };
    }, [nroMode, publishDirections]);

    const triggerSkill = (skillId) => {
        if (skills[skillId]?.unlocked === false) return;
        if (nroMode) dispatch(setActiveSkill(skillId));
        else window.dispatchEvent(new CustomEvent('game:cast-skill', { detail: skillId }));
    };

    const selectBasicAttack = () => dispatch(setActiveSkill('basic'));

    const basicAttack = () => {
        const skillId = activeSkillId || 'basic';
        const endsAt = Math.max(cooldowns[skillId]?.endsAt || 0, skillCooldowns[skillId]?.endsAt || 0);
        if (endsAt > Date.now()) {
            dispatch(setSystemMessage('Đang hồi chiêu'));
            return;
        }
        if (skillId !== 'basic' && mp < (skills[skillId]?.mpCost || 0)) {
            dispatch(setSystemMessage('Không đủ KI để dùng kỹ năng.'));
            return;
        }
        networkInstance.getSocket()?.emit('castSkill', { skillId, target: selectedTarget?.id || null });
    };

    const pickup = () => window.dispatchEvent(new Event('game:pickup'));

    const toggleAuto = () => networkInstance.getSocket()?.emit('toggleAuto', !isAuto);

    return (
        <div className={`hud-virtual-controls pointer-events-none ${movementOnly ? 'classic-movement' : ''}`} style={{
            position: 'absolute', left: 0, right: 0, bottom: 'max(24px, env(safe-area-inset-bottom))',
            zIndex: 80, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))'
        }}>
            <div className="hud-direction-pad pointer-events-auto grid touch-none" style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 48px)', gridTemplateRows: 'repeat(3, 48px)', gap: 3
            }} role="group" aria-label={nroMode ? 'Di chuyển, nhảy và bay' : 'Điều khiển bốn hướng'}>
                {[
                    { direction: 'up', icon: '▲', label: nroMode ? 'Nhấn nhanh hai lần để bay' : 'Di chuyển lên', position: 'up' },
                    { direction: 'left', icon: '◀', label: 'Di chuyển sang trái', position: 'left' },
                    { direction: 'right', icon: '▶', label: 'Di chuyển sang phải', position: 'right' },
                    { direction: 'down', icon: '▼', label: nroMode ? 'Bay xuống khi đang bay' : 'Di chuyển xuống', position: 'down' },
                ].map(({ direction, icon, label, position }) => (
                    <button
                        key={direction}
                        type="button"
                        aria-label={label}
                        onPointerDown={(event) => pressDirection(event, direction)}
                        onPointerUp={(event) => releaseDirection(event, direction)}
                        onPointerCancel={(event) => releaseDirection(event, direction)}
                        onLostPointerCapture={(event) => releaseDirection(event, direction)}
                        className={`hud-direction-button hud-direction-${position} touch-none select-none`}
                        style={{
                            gridArea: position === 'up' ? '1 / 2' : position === 'left' ? '2 / 1' : position === 'right' ? '2 / 3' : '3 / 2',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 48, height: 48, border: '1px solid rgba(251,191,36,.9)', borderRadius: 11,
                            color: '#fde68a', background: 'linear-gradient(145deg, rgba(30,41,59,.97), rgba(2,6,23,.97))',
                            boxShadow: '0 4px 12px rgba(0,0,0,.65)', fontSize: 19, fontWeight: 900, touchAction: 'none'
                        }}
                    >{icon}</button>
                ))}
                {movementOnly && <span className="classic-movement-knob" aria-hidden="true" />}
            </div>

            {!movementOnly && <div className="hud-touch-action-controls pointer-events-auto flex items-end gap-1.5">
                <div className="grid grid-cols-3 gap-1">
                    {SKILL_IDS.map((skillId) => {
                        const skill = skills[skillId];
                        if (!skill) return null;
                        const cooldown = cooldowns[skillId] || skillCooldowns[skillId];
                        const remainingMs = Math.max(0, (cooldown?.endsAt || 0) - clock);
                        const cooldownPct = cooldown?.durationMs ? remainingMs / cooldown.durationMs : 0;
                        return (
                            <button
                                key={skillId}
                                type="button"
                                aria-label={`Chọn kỹ năng ${skillId.slice(1)}: ${skill.name}`}
                                title={`${skill.name} · ${skill.mpCost} MP`}
                                onClick={() => triggerSkill(skillId)}
                                disabled={skill.unlocked === false}
                                className={`relative flex size-9 touch-manipulation items-center justify-center rounded-xl border bg-slate-950/90 text-lg active:scale-95 active:bg-amber-700 ${activeSkillId === skillId ? 'border-yellow-300 shadow-[0_0_12px_rgba(253,224,71,0.85)] ring-1 ring-yellow-200' : 'border-amber-500 shadow-lg'}`}
                            >
                                <img
                                    src={nroMode
                                        ? (getNroSkillIcon(skill, character?.nroCharacter?.raceId) || skill.icon || getSkillFallbackIcon(skill, skillId))
                                        : (skill.icon || getSkillFallbackIcon(skill, skillId))}
                                    onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = getSkillFallbackIcon(skill, skillId); }}
                                    alt="" draggable="false" className="size-7 rounded-md object-cover"
                                />
                                <span className="absolute -right-1 -top-1 rounded bg-black px-1 text-[9px] font-bold text-amber-200">{skillId.slice(1)}</span>
                                {remainingMs > 0 && <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/75 text-[10px] font-black text-white" style={{ background: `conic-gradient(from -90deg, rgba(0,0,0,.82) 0deg, rgba(0,0,0,.82) ${cooldownPct * 360}deg, transparent ${cooldownPct * 360}deg, transparent 360deg)` }}>
                                    {remainingMs >= 1000 ? `${(remainingMs / 1000).toFixed(1)}s` : `${(remainingMs / 1000).toFixed(2)}s`}
                                </span>}
                            </button>
                        );
                    })}
                    {!nroMode && <button
                        type="button"
                        aria-label="Nhặt vật phẩm gần đây"
                        onClick={pickup}
                        className="flex size-9 touch-manipulation items-center justify-center rounded-xl border border-yellow-500 bg-slate-950/90 text-lg shadow-lg active:scale-95"
                    >
                        <i className="nro-stat-glyph coin" aria-hidden="true" />
                    </button>}
                    {!nroMode && <button
                        type="button"
                        aria-label={isAuto ? 'Tắt tự động đánh' : 'Bật tự động đánh'}
                        onClick={toggleAuto}
                        className={`flex size-9 touch-manipulation items-center justify-center rounded-xl border text-base shadow-lg active:scale-95 ${isAuto ? 'border-emerald-400 bg-emerald-900/90' : 'border-emerald-700 bg-slate-950/90'}`}
                    >
                        <i className="nro-stat-glyph power" aria-hidden="true" />
                    </button>}
                </div>
                {nroMode && <button
                    type="button"
                    aria-label="Chọn đánh thường"
                    title="Chọn đánh thường"
                    onClick={selectBasicAttack}
                    className={`flex size-8 touch-manipulation items-center justify-center rounded-lg border text-[9px] font-black ${activeSkillId === 'basic' ? 'border-yellow-300 bg-amber-700 text-yellow-100 shadow-[0_0_10px_rgba(253,224,71,0.75)]' : 'border-amber-600 bg-slate-950 text-amber-200'}`}
                >BT</button>}
                <button
                    type="button"
                    aria-label={`Đánh kỹ năng đang chọn: ${activeSkillId || 'basic'}`}
                    title={`ĐÁNH · đang chọn ${activeSkillId || 'basic'} · Space/Enter trên PC`}
                    onClick={basicAttack}
                    className="relative flex size-14 touch-manipulation flex-col items-center justify-center rounded-full border-2 border-rose-200 bg-gradient-to-br from-rose-500 to-red-800 text-xl shadow-[0_0_14px_rgba(239,68,68,0.65)] active:scale-95"
                >
                    <i className="nro-attack-symbol" aria-hidden="true" />
                    <span className="text-[9px] font-black tracking-wide text-white">ĐÁNH</span>
                    {(() => {
                        const activeCooldown = cooldowns[activeSkillId] || skillCooldowns[activeSkillId];
                        const remainingMs = Math.max(0, (activeCooldown?.endsAt || 0) - clock);
                        const cooldownPct = activeCooldown?.durationMs ? remainingMs / activeCooldown.durationMs : 0;
                        return remainingMs > 0 && <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/75 text-[10px] font-black text-white" style={{ background: `conic-gradient(from -90deg, rgba(0,0,0,.82) 0deg, rgba(0,0,0,.82) ${cooldownPct * 360}deg, transparent ${cooldownPct * 360}deg, transparent 360deg)` }}>
                            {`${(remainingMs / 1000).toFixed(2)}s`}
                        </span>;
                    })()}
                </button>
            </div>}
        </div>
    );
};

export default VirtualControls;
