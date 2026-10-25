import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setSystemMessage } from '../../store/gameSlice';

/**
 * GameNotifications - Thông báo hệ thống bay nổi giữa màn hình
 * Tự biến mất sau 3 giây. Dùng cho: lên cấp, hoàn thành quest, nhặt đồ hiếm
 */
const GameNotifications = () => {
    const dispatch = useDispatch();
    const systemMessage = useSelector((state) => state.game.systemMessage);
    const [visible, setVisible] = useState(false);
    const [displayed, setDisplayed] = useState('');

    useEffect(() => {
        if (!systemMessage) return;

        setDisplayed(systemMessage);
        setVisible(true);

        const hideTimer = setTimeout(() => {
            setVisible(false);
        }, 3000);

        const clearTimer = setTimeout(() => {
            dispatch(setSystemMessage(null));
        }, 3400);

        return () => {
            clearTimeout(hideTimer);
            clearTimeout(clearTimer);
        };
    }, [systemMessage, dispatch]);

    if (!displayed) return null;

    return (
        <div
            className="pointer-events-none flex justify-center w-full"
            style={{
                position: 'absolute', top: '12%', left: 0, right: 0,
                display: 'flex', justifyContent: 'center',
                zIndex: 50
            }}
        >
            <div style={{
                background: 'linear-gradient(180deg, rgba(28,18,8,0.97) 0%, rgba(12,8,3,0.99) 100%)',
                border: '2px solid #d97706',
                outline: '1px solid #78350f',
                borderRadius: 24,
                padding: '7px 18px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.9), 0 0 16px rgba(217,119,6,0.4)',
                display: 'flex', alignItems: 'center', gap: 7,
                transition: 'opacity 0.35s ease',
                opacity: visible ? 1 : 0
            }}>
                <span style={{ fontSize: 14 }}>🔔</span>
                <span style={{
                    color: '#fde68a', fontSize: 11, fontWeight: 700,
                    textShadow: '0 1px 4px rgba(0,0,0,0.9)',
                    maxWidth: 380, textAlign: 'center'
                }}>
                    {displayed}
                </span>
            </div>
        </div>
    );
};

export default GameNotifications;
