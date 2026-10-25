import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { useDispatch } from 'react-redux';
import SceneChuong0 from './scenes/SceneChuong0';
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
    updateTargetHp,
    openClassSelection,
    setClassSelectionError,
    classSelectionSucceeded
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

    useEffect(() => {
        if (destroyTimerRef.current !== null) {
            window.clearTimeout(destroyTimerRef.current);
            destroyTimerRef.current = null;
        }

        // Guard chống React Strict Mode double-mount
        if (gameRef.current || !containerRef.current) return;

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
            scene: [SceneChuong0],
            physics: {
                default: 'arcade',
                arcade: { debug: false }
            },
            render: {
                pixelArt:         false,
                antialias:        true,
                antialiasGL:      true,
                roundPixels:      false,
                preserveDrawingBuffer: false
            }
        };

        const phaserGame = new Phaser.Game(config);
        gameRef.current  = phaserGame;

        // ── Cầu nối sự kiện Phaser → Redux ──
        const ev = phaserGame.events;
        ev.on('setPlayerId',        (id)      => dispatch(setPlayerId(id)));
        ev.on('updateStats',        (stats)   => dispatch(updateStats(stats)));
        ev.on('setPlayerPos',       (pos)     => dispatch(setPlayerPos(pos)));
        ev.on('setSelectedTarget',  (target)  => dispatch(setSelectedTarget(target)));
        ev.on('updateTargetHp',     (data)    => dispatch(updateTargetHp(data)));
        ev.on('setAutoFarmState',   (payload) => dispatch(setAutoFarmState(payload)));
        ev.on('updateQuestProgress',(payload) => dispatch(updateQuestProgress(payload)));
        ev.on('setQuestCompleted',  (payload) => dispatch(setQuestCompleted(payload)));
        ev.on('classNpcInteraction', (payload) => dispatch(openClassSelection(payload)));
        ev.on('classNpcFeedback', (payload) => dispatch(setSystemMessage(payload.message)));
        ev.on('classLevelUnlocked', (payload) => dispatch(setSystemMessage(
            `Bạn đã đạt Lv.${payload.level}! Hãy đến gặp ${payload.npc.name} để chọn class.`
        )));
        ev.on('persistenceError', (payload) => dispatch(setSystemMessage(payload.message)));
        ev.on('classSelectionResult', (payload) => {
            if (payload.success) {
                dispatch(classSelectionSucceeded(payload));
            } else {
                dispatch(setClassSelectionError(payload.message));
            }
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
                gameRef.current = null;
                destroyTimerRef.current = null;
            }, 0);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);   // chạy đúng 1 lần – dispatch không thay đổi

    return (
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
    );
};

export default GameCanvas;