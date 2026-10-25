import { useSelector, useDispatch } from 'react-redux';
import { logoutUser } from '../../store/gameSlice';
import networkInstance from '../../game/network';

/**
 * PlayerStatusPanel - Góc trên bên trái
 * Phong cách: Viền kim loại vàng đồng, nền tối fantasy MMORPG, style như ảnh tham khảo
 */
const PlayerStatusPanel = () => {
    const dispatch = useDispatch();
    const {
        hp, maxHp, mp, maxMp,
        exp, maxExp, gold, dtn,
        level, className, user
    } = useSelector((state) => state.game);

    const hpPct   = maxHp  > 0 ? Math.max(0, Math.min(100, (hp  / maxHp)  * 100)) : 0;
    const mpPct   = maxMp  > 0 ? Math.max(0, Math.min(100, (mp  / maxMp)  * 100)) : 0;
    const expPct  = maxExp > 0 ? Math.max(0, Math.min(100, (exp / maxExp) * 100)) : 0;

    return (
        <div className="pointer-events-auto flex items-start gap-2" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))' }}>

            {/* Avatar khung vàng đồng */}
            <div className="relative flex-shrink-0">
                <div style={{
                    width: 64, height: 64,
                    background: 'linear-gradient(135deg, #1c1208 0%, #0d0a05 100%)',
                    border: '2px solid #d97706',
                    outline: '1px solid #78350f',
                    borderRadius: 10,
                    boxShadow: '0 0 12px rgba(217,119,6,0.45), inset 0 1px 3px rgba(251,191,36,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28, overflow: 'hidden'
                }}>
                    🐱
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
                    whiteSpace: 'nowrap', letterSpacing: '0.05em'
                }}>
                    Lv.{level}
                </div>
            </div>

            {/* Bảng thông số */}
            <div style={{
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
                            {user.username || 'Chiến Binh Mèo'}
                        </span>
                        <span style={{
                            background: 'rgba(120,53,15,0.6)',
                            color: '#fcd34d', fontSize: 9, fontWeight: 600,
                            border: '1px solid #78350f',
                            borderRadius: 4, padding: '0 4px'
                        }}>{className || 'Chưa chọn class'}</span>
                    </div>
                    {user.isAuthenticated && (
                        <button
                            onClick={() => {
                                networkInstance.disconnect();
                                dispatch(logoutUser());
                            }}
                            style={{ color: '#f87171', fontSize: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >Thoát</button>
                    )}
                </div>

                {/* HP Bar */}
                <BarRow
                    label="HP"
                    emoji="❤"
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
                    emoji="💧"
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
                        🪙 {gold.toLocaleString()}
                    </span>
                    <span style={{ color: '#c084fc', fontSize: 10, fontWeight: 700 }}>
                        ✨ {dtn.toLocaleString()} ĐTN
                    </span>
                </div>
            </div>
        </div>
    );
};

/** Component con: 1 thanh chỉ số có nhãn */
const BarRow = ({ label, emoji, current, max, pct, barColor, labelColor, glowColor, trackBorder, height = 8 }) => (
    <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: labelColor, fontSize: 10, fontWeight: 700 }}>{emoji} {label}</span>
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
