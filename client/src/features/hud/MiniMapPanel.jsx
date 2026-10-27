import { useState, useEffect, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';
import { areEffectsReduced, setEffectsReduced, subscribeEffectsPreference } from '../../game/effectsPreferences';
import useNetworkStatus from './useNetworkStatus';

/**
 * MiniMapPanel - Góc trên bên phải
 * Hiển thị: Tên khu vực, giờ game, minimap radar, tọa độ, FPS/ping
 */
const MiniMapPanel = () => {
    const { playerPos, mapInfo } = useSelector((state) => state.game);
    const [gameTime, setGameTime] = useState('');
    const [fps, setFps] = useState(0);
    const [menuOpen, setMenuOpen] = useState(false);
    const [debugOpen, setDebugOpen] = useState(false);
    const reducedEffects = useSyncExternalStore(subscribeEffectsPreference, areEffectsReduced, () => false);
    const network = useNetworkStatus();

    // Cập nhật đồng hồ thời gian thực
    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setGameTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
        };
        updateClock();
        const id = setInterval(updateClock, 60000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        let frames = 0;
        let startedAt = 0;
        let rafId;
        const measure = (now) => {
            if (!startedAt) startedAt = now;
            frames++;
            if (now - startedAt >= 1000) {
                setFps(Math.round((frames * 1000) / (now - startedAt)));
                frames = 0;
                startedAt = now;
            }
            rafId = window.requestAnimationFrame(measure);
        };
        rafId = window.requestAnimationFrame(measure);
        return () => window.cancelAnimationFrame(rafId);
    }, []);

    // Tỷ lệ tọa độ: world 1280×720 → minimap 110×72
    const dotX = Math.max(4, Math.min(106, (playerPos.x / 1280) * 110));
    const dotY = Math.max(4, Math.min(68,  (playerPos.y / 720)  * 72));

    return (
        <div className="pointer-events-auto" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))' }}>
            <div className="hud-minimap-card" style={{
                background: 'linear-gradient(180deg, rgba(28,18,8,0.95) 0%, rgba(12,8,3,0.97) 100%)',
                border: '2px solid #b45309',
                outline: '1px solid #451a03',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.85), inset 0 1px 3px rgba(251,191,36,0.2)',
                padding: '6px 8px',
                display: 'flex', flexDirection: 'column', gap: 5,
                minWidth: 140
            }}>
                {/* Header: Tên zone + đồng hồ */}
                <div className="hud-minimap-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #292524', paddingBottom: 4 }}>
                    <span style={{ color: '#4ade80', fontSize: 9, fontWeight: 700, textShadow: '0 0 6px rgba(34,197,94,0.4)' }}>
                        <i className="nro-map-pin" aria-hidden="true" /> {mapInfo.subArea || 'Khu 1'}
                    </span>
                    <span style={{
                        color: '#fbbf24', fontSize: 11, fontWeight: 900, fontFamily: 'monospace',
                        textShadow: '0 0 6px rgba(251,191,36,0.5)'
                    }}><i className="nro-clock-glyph" aria-hidden="true" /> {gameTime}</span>
                    <span className={`hud-connection-dot ${network.connection}`} role="img" aria-label={connectionLabel(network.connection)} title={connectionLabel(network.connection)} />
                    <button type="button" className="hud-menu-button" aria-label="Mở menu giao diện" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
                </div>

                {menuOpen && <div className="hud-quick-menu">
                    <button type="button" onClick={() => setEffectsReduced(!reducedEffects)}>
                        Hiệu ứng: {reducedEffects ? 'Giảm' : 'Đầy'}
                    </button>
                    <button type="button" onClick={() => setDebugOpen(!debugOpen)} aria-pressed={debugOpen}>
                        {debugOpen ? 'Ẩn bảng debug' : 'Bảng debug'}
                    </button>
                </div>}

                {/* Tên bản đồ */}
                <div style={{ textAlign: 'center' }}>
                    <span style={{
                        color: '#fcd34d', fontSize: 9, fontWeight: 600,
                        background: 'rgba(120,53,15,0.4)',
                        border: '1px solid #78350f',
                        borderRadius: 4, padding: '1px 6px'
                    }}>
                        {mapInfo.zoneName}
                    </span>
                </div>

                {/* Khung radar minimap */}
                <div className="hud-minimap-radar" style={{
                    position: 'relative', width: 110, height: 72,
                    background: 'linear-gradient(135deg, #064e3b 0%, #0f2d1f 50%, #0c1f1a 100%)',
                    border: '2px solid #d97706',
                    borderRadius: 5,
                    overflow: 'hidden',
                    boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)'
                }}>
                    {/* Lưới địa hình */}
                    <div style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: 'linear-gradient(rgba(34,197,94,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.06) 1px, transparent 1px)',
                        backgroundSize: '11px 9px'
                    }} />

                    {/* Con đường lát đá (gợi ý layout) */}
                    <div style={{
                        position: 'absolute', left: 22, top: 25, width: 66, height: 10,
                        background: 'rgba(51,65,85,0.5)', borderRadius: 2
                    }} />
                    <div style={{
                        position: 'absolute', left: 50, top: 0, width: 10, height: 72,
                        background: 'rgba(51,65,85,0.4)'
                    }} />

                    {/* Sông xanh phải */}
                    <div style={{
                        position: 'absolute', right: 0, top: 0, width: 15, height: 72,
                        background: 'rgba(2,132,199,0.35)',
                        borderLeft: '1px solid rgba(56,189,248,0.3)'
                    }} />

                    {/* Chấm quái đỏ */}
                    {[
                        { x: 25, y: 18 }, { x: 70, y: 50 }, { x: 38, y: 55 }
                    ].map((pos, i) => (
                        <div key={i} style={{
                            position: 'absolute', left: pos.x, top: pos.y,
                            width: 5, height: 5, borderRadius: '50%',
                            background: '#ef4444',
                            boxShadow: '0 0 3px rgba(239,68,68,0.8)'
                        }} />
                    ))}

                    {/* Chấm elite tím */}
                    <div style={{
                        position: 'absolute', left: 60, top: 60,
                        width: 6, height: 6, borderRadius: '50%',
                        background: '#a855f7',
                        boxShadow: '0 0 5px rgba(168,85,247,0.9)'
                    }} />

                    {/* Chấm người chơi xanh ngọc - nhấp nháy */}
                    <div style={{
                        position: 'absolute',
                        left: dotX - 5, top: dotY - 5,
                        width: 10, height: 10,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, #2dd4bf 0%, #0f766e 100%)',
                        border: '1.5px solid white',
                        boxShadow: '0 0 8px rgba(45,212,191,1)',
                        animation: 'pulse 1.5s ease-in-out infinite'
                    }} />

                    {/* Vòng tròn radar */}
                    <div style={{
                        position: 'absolute',
                        left: '50%', top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 44, height: 44, borderRadius: '50%',
                        border: '1px solid rgba(245,158,11,0.15)',
                        pointerEvents: 'none'
                    }} />
                </div>

                {/* Footer: Tọa độ + FPS + Ping */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    borderTop: '1px solid #292524', paddingTop: 3
                }}>
                    <span style={{ color: '#d97706', fontSize: 8, fontFamily: 'monospace' }}>
                        {Math.round(playerPos.x)},{Math.round(playerPos.y)}
                    </span>
                    <div style={{ display: 'flex', gap: 5 }}>
                        <span style={{ color: '#4ade80', fontSize: 8, fontWeight: 700 }}>FPS {fps || '—'}</span>
                        <span style={{ color: pingColor(network.pingMs), fontSize: 8, fontWeight: 700 }}>
                            Ping {network.pingMs === null ? '—' : `${network.pingMs}ms`}
                        </span>
                    </div>
                </div>

                {debugOpen && <div className="hud-debug-panel" aria-live="polite">
                    <div>Kết nối: <strong>{connectionLabel(network.connection)}</strong></div>
                    <div>Ping RTT: <strong>{network.pingMs === null ? '—' : `${network.pingMs} ms`}</strong></div>
                    <div>Tick server: <strong>{network.serverTickRate === null ? '—' : `${network.serverTickRate} Hz`}</strong></div>
                    <div>Snapshot: <strong>{network.measuredTickRate === null ? '—' : `${network.measuredTickRate} Hz`}</strong> · Jitter <strong>{network.jitterMs === null ? '—' : `${network.jitterMs} ms`}</strong></div>
                    <div>Entity: <strong>{network.players} người · {network.monsters} quái</strong></div>
                </div>}
            </div>
        </div>
    );
};

function pingColor(pingMs) {
    if (pingMs === null) return '#94a3b8';
    if (pingMs < 100) return '#4ade80';
    if (pingMs < 250) return '#facc15';
    return '#f87171';
}

function connectionLabel(connection) {
    if (connection === 'connected') return 'Đã kết nối';
    if (connection === 'reconnecting') return 'Đang kết nối lại';
    if (connection === 'offline') return 'Mất kết nối';
    return 'Đang kết nối';
}

export default MiniMapPanel;
