import { useSelector, useDispatch } from 'react-redux';
import { clearSelectedTarget } from '../../store/gameSlice';

/**
 * TargetStatusPanel - Hiển thị thông tin quái/mục tiêu đang được chọn
 * Phong cách: khung viền màu theo độ hiếm (đỏ elite, tím boss, vàng thường)
 */
const TargetStatusPanel = () => {
    const dispatch = useDispatch();
    const selectedTarget = useSelector((state) => state.game.selectedTarget);

    if (!selectedTarget) return null;

    const hpPct     = Math.max(0, Math.min(100, (selectedTarget.hp / selectedTarget.maxHp) * 100));
    const isElite   = selectedTarget.type === 'elite';
    const isBoss    = selectedTarget.type === 'boss';

    const accentColor = isBoss ? '#c084fc' : isElite ? '#f87171' : '#f59e0b';
    const borderGlow  = isBoss ? 'rgba(192,132,252,0.5)' : isElite ? 'rgba(248,113,113,0.5)' : 'rgba(217,119,6,0.4)';
    const typeLabel   = isBoss ? 'BOSS' : isElite ? 'TINH ANH' : 'Thường';
    const targetKind = isBoss ? 'boss' : isElite ? 'elite' : 'mob';
    const barColor    = isBoss
        ? 'linear-gradient(90deg, #581c87, #a855f7, #d8b4fe)'
        : isElite
        ? 'linear-gradient(90deg, #7f1d1d, #dc2626, #f87171)'
        : 'linear-gradient(90deg, #713f12, #d97706, #fbbf24)';

    return (
        <div className="pointer-events-auto" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))' }}>
            <div className="hud-target-card" style={{
                background: 'linear-gradient(180deg, rgba(28,18,8,0.95) 0%, rgba(12,8,3,0.97) 100%)',
                border: `2px solid ${accentColor}`,
                outline: '1px solid rgba(0,0,0,0.6)',
                borderRadius: 8,
                boxShadow: `0 4px 16px rgba(0,0,0,0.85), 0 0 14px ${borderGlow}`,
                padding: '6px 10px',
                minWidth: 210,
                display: 'flex', flexDirection: 'column', gap: 5
            }}>
                {/* Header: Tên quái + badge loại + nút đóng */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
                        <span className={`nro-target-glyph ${targetKind}`} aria-hidden="true" />
                        <span style={{
                            color: accentColor, fontWeight: 700, fontSize: 11,
                            textShadow: `0 0 8px ${borderGlow}`,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                            {selectedTarget.name}
                        </span>
                        <span style={{
                            background: 'rgba(0,0,0,0.5)',
                            color: accentColor, fontSize: 9, fontWeight: 700,
                            border: `1px solid ${accentColor}`,
                            borderRadius: 4, padding: '0 4px',
                            flexShrink: 0
                        }}>Lv.{selectedTarget.level || 1}</span>
                        {(isElite || isBoss) && (
                            <span style={{
                                background: isBoss ? 'rgba(88,28,135,0.7)' : 'rgba(127,29,29,0.7)',
                                color: accentColor, fontSize: 8, fontWeight: 700,
                                border: `1px solid ${accentColor}`,
                                borderRadius: 3, padding: '0 3px', flexShrink: 0
                            }}>{typeLabel}</span>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            dispatch(clearSelectedTarget());
                            window.dispatchEvent(new CustomEvent('game:clear-target'));
                        }}
                        style={{
                            color: '#94a3b8', fontSize: 12, background: 'none', border: 'none',
                            cursor: 'pointer', padding: '0 2px', flexShrink: 0,
                            lineHeight: 1, fontWeight: 700
                        }}
                        title="Bỏ chọn mục tiêu"
                    >✕</button>
                </div>

                {/* HP quái */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ color: '#fca5a5', fontSize: 9, fontWeight: 700 }}><i className="nro-stat-glyph hp mr-1" aria-hidden="true" />HP</span>
                        <span style={{ color: '#cbd5e1', fontSize: 9, fontFamily: 'monospace' }}>
                            {selectedTarget.hp.toLocaleString()} / {selectedTarget.maxHp.toLocaleString()}
                        </span>
                    </div>
                    <div style={{
                        background: '#0c0804', borderRadius: 4, height: 8,
                        border: '1px solid #450a0a', padding: 1.5,
                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)'
                    }}>
                        <div style={{
                            width: `${hpPct}%`, height: '100%', borderRadius: 3,
                            background: barColor,
                            boxShadow: `0 0 6px ${borderGlow}`,
                            transition: 'width 0.15s ease'
                        }} />
                    </div>
                </div>

                {/* Trạng thái ngắn */}
                <div style={{ display: 'flex', gap: 4 }}>
                    {[
                        { label: 'ATK', glyph: 'attack', value: Number.isFinite(selectedTarget.atk) ? selectedTarget.atk.toLocaleString() : (isElite ? 'Cao' : 'TB'), color: '#fca5a5' },
                        { label: 'DEF', glyph: 'defense', value: Number.isFinite(selectedTarget.def) ? selectedTarget.def.toLocaleString() : (isElite ? 'TB' : 'Thấp'), color: '#93c5fd' },
                    ].map(s => (
                        <span key={s.label} style={{
                            background: 'rgba(0,0,0,0.5)',
                            border: '1px solid #292524',
                            borderRadius: 4, padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 9, color: s.color, fontWeight: 600
                        }}><i className={`nro-combat-glyph ${s.glyph}`} aria-hidden="true" />{s.label}: {s.value}</span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TargetStatusPanel;
