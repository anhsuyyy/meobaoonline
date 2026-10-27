import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import PlayerStatusPanel from './PlayerStatusPanel';
import TargetStatusPanel from './TargetStatusPanel';
import MiniMapPanel from './MiniMapPanel';
import QuestTracker from './QuestTracker';
import SkillBar from './SkillBar';
import ChatPanel from './ChatPanel';
import GameNotifications from './GameNotifications';
import VirtualControls from './VirtualControls';
import NroNpcDialog from './NroNpcDialog';
import ShopDualPanel from './ShopDualPanel';
import NroInventoryPanel from './NroInventoryPanel';
import NroTrainingPanel from './NroTrainingPanel';
import NroClassicChrome from './NroClassicChrome';
import networkInstance from '../../game/network';
import './classic-hud.css';

/**
 * GameHUD - Lớp phủ React trên Phaser Canvas
 * Layout:
 *   [PlayerStatus]         [TargetStatus]         [MiniMap + Quest]   ← top row
 *   [GameNotifications]                                                ← center (absolute)
 *   [ChatPanel centered]                       [SkillBar + attack]     ← bottom row
 */
const GameHUD = () => {
    const game = useSelector((state) => state.game);
    const { character, hp, blueGems } = game;
    const [nroMode, setNroMode] = useState(true);
    const [nroMapName, setNroMapName] = useState('Làng Aru');
    const [nroZoneId, setNroZoneId] = useState(0);
    const [respawnMenu, setRespawnMenu] = useState(false);
    const [respawnMessage, setRespawnMessage] = useState('');

    useEffect(() => {
        const handleMode = (event) => setNroMode(event.detail?.gameMode === 'nro');
        const handleMapChanged = (event) => {
            if (event.detail?.name) setNroMapName(event.detail.name);
            if (Number.isInteger(event.detail?.zoneId)) setNroZoneId(event.detail.zoneId);
        };
        window.addEventListener('game:mode', handleMode);
        window.addEventListener('game:nro-map-changed', handleMapChanged);
        const onRespawn = (event) => {
            setRespawnMessage(event.detail?.message || '');
            if (event.detail?.ok && event.detail?.state === 'respawned') setRespawnMenu(false);
        };
        window.addEventListener('game:nro-respawn-result', onRespawn);
        return () => {
            window.removeEventListener('game:mode', handleMode);
            window.removeEventListener('game:nro-map-changed', handleMapChanged);
            window.removeEventListener('game:nro-respawn-result', onRespawn);
        };
    }, []);

    return (
        <div className={`game-hud ${nroMode ? 'nro-classic-hud' : ''}`} style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 20,
            overflow: 'hidden',
            fontFamily: '"Nunito Variable", system-ui, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '10px 10px 10px 10px'
        }}>
            {/* ── TOP ROW ── */}
            {nroMode ? <NroClassicChrome mapName={nroMapName} zoneId={nroZoneId} /> : <div className="hud-top-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                {/* Góc trên trái: Player Status */}
                <PlayerStatusPanel />

                {/* Góc trên giữa: Target Status (ẩn nếu không có target) */}
                <div className="hud-center-target" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 6, flex: 1 }}>
                    <TargetStatusPanel />
                </div>

                {/* Góc trên phải: MiniMap + Quest */}
                <div className="hud-info-stack" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <MiniMapPanel /><QuestTracker />
                </div>
            </div>}

            {/* ── GIỮA (absolute): Thông báo hệ thống bay nổi ── */}
            <GameNotifications />
            {nroMode && character?.nroCharacter?.created && hp <= 0 && (
                <div className="nro-death-notice nro-soul-notice" role="status" aria-live="polite">
                    <strong>Linh hồn · Kiệt sức</strong>
                    <span>Bạn đã gục. Chọn cách tiếp tục.</span>
                    <button type="button" onClick={() => { setRespawnMenu(true); setRespawnMessage(''); }}>Kiệt sức</button>
                </div>
            )}
            {nroMode && character?.nroCharacter?.created && hp <= 0 && respawnMenu && <div className="nro-respawn-backdrop">
                <section className="nro-respawn-dialog" role="dialog" aria-modal="true" aria-label="Chọn cách hồi sinh">
                    <h2>Linh hồn kiệt sức</h2><p>Chọn cách hồi sinh</p>
                    <div><button onClick={() => { networkInstance.getSocket()?.emit('respawnNro', { choice: 'wait' }); setRespawnMenu(false); }}>Chờ</button>
                        <button onClick={() => networkInstance.getSocket()?.emit('respawnNro', { choice: 'home' })}>Về nhà</button>
                        <button disabled={blueGems < 1} onClick={() => networkInstance.getSocket()?.emit('respawnNro', { choice: 'gem' })}>Hồi sinh ngay<br /><small>(1 ngọc xanh · có {blueGems})</small></button></div>
                    {respawnMessage && <span role="alert">{respawnMessage}</span>}
                    <button className="nro-respawn-close" onClick={() => setRespawnMenu(false)}>Đóng</button>
                </section>
            </div>}
            {/* ── BOTTOM ROW ── */}
            {nroMode ? <><ChatPanel variant="classic" /><SkillBar layout="classic" /></> : <div className="hud-bottom-row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
                {/* Chat giữa cạnh dưới; kỹ năng desktop dồn về góc dưới phải. */}
                <div className="hud-chat-wrap"><ChatPanel /></div>

                <div className="hud-skill-wrap" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <SkillBar />
                </div>
            </div>}

            {/* Mobile virtual controls (hiện nếu là mobile) */}
            <VirtualControls movementOnly={nroMode} />
            {nroMode && <NroNpcDialog />}
            {nroMode && <ShopDualPanel />}
            {nroMode && <NroInventoryPanel />}
            {nroMode && <NroTrainingPanel />}

        </div>
    );
};

export default GameHUD;
