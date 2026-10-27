import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { logoutUser } from '../../store/gameSlice';
import networkInstance from '../../game/network';
import nroCaptions from '../../../../shared/nro/maps/captions.json';
import NroSpritePreview from '../auth/NroSpritePreview';
import { toStatusEffectBadges } from './nroStatusEffects';

/**
 * PlayerStatusPanel - Góc trên bên trái
 * Phong cách: Viền kim loại vàng đồng, nền tối fantasy MMORPG, style như ảnh tham khảo
 */
const PlayerStatusPanel = () => {
    const dispatch = useDispatch();
    const [nroMode, setNroMode] = useState(true);
    const [activeEffects, setActiveEffects] = useState([]);
    useEffect(() => {
        const handleMode = (event) => {
            const isNro = event.detail?.gameMode === 'nro';
            setNroMode(isNro);
            if (!isNro) setActiveEffects([]);
        };
        const handleEffects = (event) => setActiveEffects(event.detail || []);
        window.addEventListener('game:mode', handleMode);
        window.addEventListener('game:nro-player-effects', handleEffects);
        return () => {
            window.removeEventListener('game:mode', handleMode);
            window.removeEventListener('game:nro-player-effects', handleEffects);
        };
    }, []);
    const {
        hp, maxHp, mp, maxMp,
        exp, maxExp, gold, dtn, power,
        level, className, user, character
    } = useSelector((state) => state.game);
    const planetName = ({ earth: 'Trái Đất', namek: 'Namek', saiyan: 'Xayda' })[character?.nroCharacter?.raceId] || 'Trái Đất';
    const raceId = character?.nroCharacter?.raceId || 'earth';
    const displayName = character?.nroCharacter?.characterName || user.username;
    const captionName = nroCaptions[level]?.[raceId] || `Lv.${level}`;

    const hpPct   = maxHp  > 0 ? Math.max(0, Math.min(100, (hp  / maxHp)  * 100)) : 0;
    const mpPct   = maxMp  > 0 ? Math.max(0, Math.min(100, (mp  / maxMp)  * 100)) : 0;
    const expPct  = maxExp > 0 ? Math.max(0, Math.min(100, (exp / maxExp) * 100)) : 0;

    return (
        <div className="hud-player-status pointer-events-auto flex items-start gap-2" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))' }}>

            {/* Avatar khung vàng đồng */}
            <div className="hud-player-avatar-wrap relative flex-shrink-0">
                <div style={{
                    width: 64, height: 64,
                    background: 'linear-gradient(135deg, #1c1208 0%, #0d0a05 100%)',
                    border: '2px solid #d97706',
                    outline: '1px solid #78350f',
                    borderRadius: 10,
                    boxShadow: '0 0 12px rgba(217,119,6,0.45), inset 0 1px 3px rgba(251,191,36,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28, overflow: 'hidden'
                }} className="hud-player-avatar">
                    {nroMode
                        ? <NroSpritePreview race={raceId} className="nro-source-warrior-hud" />
                        : <span className="nro-mini-avatar cat" aria-hidden="true" />}
                    {/* Góc trang trí */}
                    <div style={{
                        position: 'absolute', top: 2, left: 2,
                        width: 6, height: 6,
                        background: '#f59e0b',
                        borderRadius: '0 0 4px 0',
                        opacity: 0.7
                    }} />
                    <div style={{
                        position: 'absolute', top: 2, right: 2,
                        width: 6, height: 6,
                        background: '#f59e0b',
                        borderRadius: '0 0 0 4px',
                        opacity: 0.7
                    }} />
                    <div style={{
                        position: 'absolute', bottom: 2, left: 2,
                        width: 6, height: 6,
                        background: '#f59e0b',
                        borderRadius: '0 4px 0 0',
                        opacity: 0.7
                    }} />
                    <div style={{
                        position: 'absolute', bottom: 2, right: 2,
                        width: 6, height: 6,
                        background: '#f59e0b',
                        borderRadius: '4px 0 0 0',
                        opacity: 0.7
                    }} />
                </div>
                {/* Level badge */}
                <div style={{
                    position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(180deg, #f59e0b 0%, #b45309 100%)',
                    color: '#0d0a05', fontWeight: 900, fontSize: 10,
                    padding: '1px 6px', borderRadius: 10,
                    border: '1px solid #78350f',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.7)',
                    whiteSpace: 'nowrap', letterSpacing: '0.05em', maxWidth: 112,
                    overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                    <span title={nroMode ? captionName : `Lv.${level}`}>{nroMode ? captionName : `Lv.${level}`}</span>
                </div>
            </div>

            {/* Bảng thông số */}
            <div className="hud-player-card" style={{
                background: 'linear-gradient(180deg, rgba(28,18,8,0.95) 0%, rgba(12,8,3,0.97) 100%)',
                border: '2px solid #b45309',
                outline: '1px solid #451a03',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.85), inset 0 1px 3px rgba(251,191,36,0.2)',
                padding: '6px 10px',
                minWidth: 195,
                display: 'flex', flexDirection: 'column', gap: 4
            }}>
                {/* Tên & Class */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #292524', paddingBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{
                            color: '#fbbf24', fontWeight: 700, fontSize: 11,
                            textShadow: '0 1px 4px rgba(0,0,0,0.9)'
                        }}>
                            {displayName || (nroMode ? 'Chiến binh' : 'Chiến Binh Mèo')}
                        </span>
                        <span style={{
                            background: 'rgba(120,53,15,0.6)',
                            color: '#fcd34d', fontSize: 9, fontWeight: 600,
                            border: '1px solid #78350f',
                            borderRadius: 4, padding: '0 4px'
                        }}>{nroMode ? planetName : className || 'Chưa chọn class'}</span>
                    </div>
                    {user.isAuthenticated && (
                        <button
                            onClick={() => {
                                networkInstance.logout();
                                dispatch(logoutUser());
                            }}
                            style={{ color: '#f87171', fontSize: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >Thoát</button>
                    )}
                </div>

                {/* HP Bar */}
                <BarRow
                    label="HP"
                    iconClass="hp"
                    current={hp} max={maxHp} pct={hpPct}
                    barColor="linear-gradient(90deg, #7f1d1d 0%, #dc2626 55%, #f87171 100%)"
                    labelColor="#fca5a5"
                    glowColor="rgba(239,68,68,0.5)"
                    trackBorder="#450a0a"
                    height={9}
                />

                {/* MP Bar */}
                <BarRow
                    label="MP"
                    iconClass="ki"
                    current={mp} max={maxMp} pct={mpPct}
                    barColor="linear-gradient(90deg, #1e3a8a 0%, #2563eb 55%, #60a5fa 100%)"
                    labelColor="#93c5fd"
                    glowColor="rgba(59,130,246,0.5)"
                    trackBorder="#172554"
                    height={7}
                />

                {/* EXP Bar với % */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: '#fbbf24', fontSize: 9, fontWeight: 700 }}>EXP</span>
                        <span style={{ color: '#d97706', fontSize: 9, fontFamily: 'monospace' }}>+{expPct.toFixed(1)}%</span>
                    </div>
                    <div style={{
                        background: '#1c1208', borderRadius: 3, height: 5,
                        border: '1px solid #451a03', overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${expPct}%`, height: '100%',
                            background: 'linear-gradient(90deg, #713f12, #f59e0b, #fde047)',
                            boxShadow: `0 0 5px rgba(245,158,11,0.5)`,
                            transition: 'width 0.3s ease'
                        }} />
                    </div>
                </div>

                {/* Vàng & ĐTN */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    borderTop: '1px solid #292524', paddingTop: 4, marginTop: 1
                }}>
                    <span style={{ color: '#fcd34d', fontSize: 10, fontWeight: 700 }}>
                        <i className="nro-stat-glyph coin" aria-hidden="true" /> {gold.toLocaleString()}
                    </span>
                    <span style={{ color: '#c084fc', fontSize: 10, fontWeight: 700 }}>
                        <i className="nro-stat-glyph potential" aria-hidden="true" /> {dtn.toLocaleString()} ĐTN
                        {nroMode && <span className="ml-2 text-cyan-300"><i className="nro-stat-glyph power mr-1" aria-hidden="true" />{power.toLocaleString()} SM</span>}
                    </span>
                </div>
                {nroMode && activeEffects.length > 0 && <div className="flex flex-wrap gap-1 border-t border-stone-800 pt-1">
                    {toStatusEffectBadges(activeEffects).map((effect) => {
                        const tone = effect.debuff
                            ? 'border-red-800/80 bg-red-950/85 text-red-200'
                            : 'border-emerald-800/80 bg-emerald-950/80 text-emerald-200';
                        return <span key={effect.key} title={`${effect.label}: còn ${effect.seconds} giây`}
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold ${tone}`}>
                            <span aria-hidden="true" className="rounded-sm border border-current px-0.5 font-mono text-[7px] leading-3">{effect.icon}</span>
                            {effect.label} {Math.floor(effect.seconds / 60)}:{String(effect.seconds % 60).padStart(2, '0')}
                        </span>;
                    })}
                </div>}
            </div>
        </div>
    );
};

/** Component con: 1 thanh chỉ số có nhãn */
const BarRow = ({ label, iconClass, current, max, pct, barColor, labelColor, glowColor, trackBorder, height = 8 }) => (
    <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: labelColor, fontSize: 10, fontWeight: 700 }}><i className={`nro-stat-glyph ${iconClass}`} aria-hidden="true" /> {label}</span>
            <span style={{ color: '#cbd5e1', fontSize: 9, fontFamily: 'monospace' }}>
                {current.toLocaleString()} / {max.toLocaleString()}
            </span>
        </div>
        <div style={{
            background: '#0c0804', borderRadius: 4, height,
            border: `1px solid ${trackBorder}`, padding: 1.5,
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)'
        }}>
            <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 3,
                background: barColor,
                boxShadow: `0 0 6px ${glowColor}`,
                transition: 'width 0.2s ease'
            }} />
        </div>
    </div>
);

export default PlayerStatusPanel;
