import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useDispatch } from 'react-redux';
import SceneNro from './scenes/SceneNro';
import {
    setPlayerId,
    setSystemMessage,
    logoutUser,
    updateStats,
    setAutoFarmState,
    updateQuestProgress,
    setQuestCompleted,
    setPlayerPos,
    setSelectedTarget,
    clearSelectedTarget,
    updateTargetHp,
    receiveChatHistory,
    receiveChatMessage,
    setSkillConfig,
    recordSkillSuccess
} from '../store/gameSlice';
import networkInstance from './network';

/**
 * GameCanvas - Container Phaser 3, khởi tạo đúng 1 lần.
 * Kích thước chuẩn: 1280×720 (16:9), FIT vào container
 */
const GameCanvas = () => {
    const gameRef      = useRef(null);
    const containerRef = useRef(null);
    const destroyTimerRef = useRef(null);
    const dispatch     = useDispatch();
    const [sceneReady, setSceneReady] = useState(false);

    useEffect(() => {
        if (destroyTimerRef.current !== null) {
            window.clearTimeout(destroyTimerRef.current);
            destroyTimerRef.current = null;
        }

        // Guard chống React Strict Mode double-mount
        if (gameRef.current || !containerRef.current) return;

        // Subscribe before Phaser boots so a very fast initialState cannot race Redux listeners.
        const onSkillConfig = (event) => dispatch(setSkillConfig(event.detail || { skills: {}, levels: {} }));
        const onSceneReady = () => setSceneReady(true);
        window.addEventListener('game:skill-config', onSkillConfig);
        window.addEventListener('game:nro-scene-ready', onSceneReady);
        const container = containerRef.current;

        const config = {
            type: Phaser.AUTO,
            width:  1280,
            height: 720,
            parent: container,
            backgroundColor: '#0d1f10',   // Không còn đen trơn – xanh lá tối gợi rừng
            scale: {
                mode:       Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width:  1280,
                height: 720
            },
            fps: {
                target: 90,
                limit: 0,
                forceSetTimeOut: false,
                smoothStep: true
            },
            scene: [SceneNro],
            render: {
                pixelArt:         true,
                antialias:        false,
                antialiasGL:      false,
                roundPixels:      true,
                preserveDrawingBuffer: false
            }
        };

        const phaserGame = new Phaser.Game(config);
        gameRef.current  = phaserGame;

        // ── Cầu nối sự kiện Phaser → Redux ──
        const ev = phaserGame.events;
        ev.on('setPlayerId',        (id)      => dispatch(setPlayerId(id)));
        ev.on('setSkillConfig',     (value)  => dispatch(setSkillConfig(value)));
        ev.on('skillSuccess',       (value)  => dispatch(recordSkillSuccess(value)));
        ev.on('chatHistory',        (history) => dispatch(receiveChatHistory(Object.values(history).flat())));
        ev.on('chatMessage',        (message) => dispatch(receiveChatMessage(message)));
        ev.on('updateStats',        (stats)   => dispatch(updateStats(stats)));
        ev.on('setPlayerPos',       (pos)     => dispatch(setPlayerPos(pos)));
        ev.on('setSelectedTarget',  (target)  => dispatch(setSelectedTarget(target)));
        ev.on('clearSelectedTarget', () => dispatch(clearSelectedTarget()));
        ev.on('updateTargetHp',     (data)    => dispatch(updateTargetHp(data)));
        ev.on('setAutoFarmState',   (payload) => dispatch(setAutoFarmState(payload)));
        ev.on('updateQuestProgress',(payload) => dispatch(updateQuestProgress(payload)));
        ev.on('setQuestCompleted',  (payload) => dispatch(setQuestCompleted(payload)));
        ev.on('persistenceError', (payload) => dispatch(setSystemMessage(payload.message)));
        ev.on('nroCharacterCreationResult', (payload) => {
            window.dispatchEvent(new CustomEvent('game:nro-character-creation', { detail: payload }));
        });
        ev.on('authenticationExpired', () => {
            networkInstance.disconnect();
            dispatch(logoutUser());
        });
        ev.on('socketConnectionError', (payload) => dispatch(setSystemMessage(payload.message)));

        return () => {
            destroyTimerRef.current = window.setTimeout(() => {
                if (gameRef.current !== phaserGame) return;

                phaserGame.events.removeAllListeners();
                phaserGame.destroy(true);
                window.removeEventListener('game:skill-config', onSkillConfig);
                window.removeEventListener('game:nro-scene-ready', onSceneReady);
                gameRef.current = null;
                destroyTimerRef.current = null;
            }, 0);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);   // chạy đúng 1 lần – dispatch không thay đổi

    return (
        <>
        <div
            ref={containerRef}
            id="game-container"
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                background: '#0d1f10'
            }}
        />
        {!sceneReady && <div className="nro-scene-loading" role="status" aria-live="polite">Đang tải bản đồ…</div>}
        </>
    );
};

export default GameCanvas;
