import React from 'react';
import { useSelector } from 'react-redux';
import networkInstance from '../../game/network';

const VirtualControls = () => {
    const isAuto = useSelector((state) => state.game.isAuto);

    const sendDirection = (direction, isDown) => {
        const socket = networkInstance.getSocket();
        if (!socket || isAuto) return;

        const inputState = {
            up: direction === 'up' && isDown,
            down: direction === 'down' && isDown,
            left: direction === 'left' && isDown,
            right: direction === 'right' && isDown
        };

        socket.emit('playerInput', inputState);
    };

    const triggerSkill = (skillId) => {
        const socket = networkInstance.getSocket();
        if (socket) {
            socket.emit('playerAttack', { skillId });
        }
    };

    const triggerPickup = () => {
        const socket = networkInstance.getSocket();
        if (socket) {
            socket.emit('playerInput', {});
        }
    };

    return (
        <div className="pointer-events-auto block md:hidden w-full flex justify-between items-end px-3 pb-3">
            {/* D-Pad Ảo Góc Dưới Bên Trái */}
            <div className="relative w-28 h-28 bg-slate-950/60 backdrop-blur-sm border border-slate-700/60 rounded-full flex items-center justify-center shadow-lg">
                <button
                    onTouchStart={() => sendDirection('up', true)}
                    onTouchEnd={() => sendDirection('up', false)}
                    className="absolute top-1 w-9 h-9 bg-slate-800/80 active:bg-amber-600 rounded-full flex items-center justify-center text-sm text-slate-200"
                >
                    ▲
                </button>
                <button
                    onTouchStart={() => sendDirection('down', true)}
                    onTouchEnd={() => sendDirection('down', false)}
                    className="absolute bottom-1 w-9 h-9 bg-slate-800/80 active:bg-amber-600 rounded-full flex items-center justify-center text-sm text-slate-200"
                >
                    ▼
                </button>
                <button
                    onTouchStart={() => sendDirection('left', true)}
                    onTouchEnd={() => sendDirection('left', false)}
                    className="absolute left-1 w-9 h-9 bg-slate-800/80 active:bg-amber-600 rounded-full flex items-center justify-center text-sm text-slate-200"
                >
                    ◀
                </button>
                <button
                    onTouchStart={() => sendDirection('right', true)}
                    onTouchEnd={() => sendDirection('right', false)}
                    className="absolute right-1 w-9 h-9 bg-slate-800/80 active:bg-amber-600 rounded-full flex items-center justify-center text-sm text-slate-200"
                >
                    ▶
                </button>
                <div className="w-5 h-5 rounded-full bg-slate-700/60" />
            </div>

            {/* Cụm Phím Kỹ Năng Nhanh Góc Dưới Bên Phải */}
            <div className="flex items-center gap-2">
                <button
                    onClick={triggerPickup}
                    className="w-11 h-11 bg-slate-900/80 active:scale-95 border-2 border-yellow-500 rounded-full flex items-center justify-center text-base shadow"
                >
                    🪙
                </button>
                <button
                    onClick={() => triggerSkill('s3')}
                    className="w-12 h-12 bg-slate-900/80 active:scale-95 border-2 border-purple-500 rounded-full flex items-center justify-center text-lg shadow"
                >
                    🌪️
                </button>
                <button
                    onClick={() => triggerSkill('s1')}
                    className="w-14 h-14 bg-gradient-to-r from-teal-500 to-emerald-600 active:scale-95 border-2 border-white rounded-full flex items-center justify-center text-xl shadow-[0_0_12px_rgba(20,184,166,0.8)]"
                >
                    🐾
                </button>
            </div>
        </div>
    );
};

export default VirtualControls;
