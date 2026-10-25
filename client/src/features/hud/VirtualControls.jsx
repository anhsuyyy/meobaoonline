import { useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import networkInstance from '../../game/network';
import { ASSET_MANIFEST } from '../../game/config/assetManifest';

const DIRECTIONS = ['up', 'down', 'left', 'right'];
const SKILL_IDS = ['s1', 's2', 's3', 's4', 's5'];

const VirtualControls = () => {
    const isAuto = useSelector((state) => state.game.isAuto);
    const pressedDirections = useRef(new Set());
    const [activeDirections, setActiveDirections] = useState([]);

    const publishMovement = (directions) => {
        const input = Object.fromEntries(DIRECTIONS.map((direction) => [direction, directions.has(direction)]));
        window.dispatchEvent(new CustomEvent('game:virtual-movement', { detail: input }));
        setActiveDirections([...directions]);
    };

    const pressDirection = (direction, event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        pressedDirections.current.add(direction);
        publishMovement(pressedDirections.current);
    };

    const releaseDirection = (direction) => {
        if (!pressedDirections.current.delete(direction)) return;
        publishMovement(pressedDirections.current);
    };

    const triggerSkill = (skillId) => {
        window.dispatchEvent(new CustomEvent('game:cast-skill', { detail: skillId }));
    };

    const basicAttack = () => {
        networkInstance.getSocket()?.emit('playerAttack', { skillId: 'basic' });
    };

    const pickup = () => window.dispatchEvent(new Event('game:pickup'));

    const toggleAuto = () => networkInstance.getSocket()?.emit('toggleAuto', !isAuto);

    const directionButton = (direction, symbol, position) => (
        <button
            key={direction}
            type="button"
            aria-label={`Di chuyển ${direction}`}
            onPointerDown={(event) => pressDirection(direction, event)}
            onPointerUp={() => releaseDirection(direction)}
            onPointerCancel={() => releaseDirection(direction)}
            onLostPointerCapture={() => releaseDirection(direction)}
            className={`absolute ${position} flex size-9 touch-none select-none items-center justify-center rounded-full border text-base text-white shadow-md ${activeDirections.includes(direction) ? 'border-amber-300 bg-amber-600' : 'border-slate-500 bg-slate-800/90 active:bg-amber-600'}`}
        >
            {symbol}
        </button>
    );

    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-30 flex items-end justify-between px-2 md:hidden">
            <div aria-label="Điều khiển di chuyển" className="pointer-events-auto relative size-28 touch-none rounded-full border border-slate-500/70 bg-slate-950/65 shadow-xl backdrop-blur-sm">
                {directionButton('up', '▲', 'left-9 top-1')}
                {directionButton('down', '▼', 'bottom-1 left-9')}
                {directionButton('left', '◀', 'left-1 top-9')}
                {directionButton('right', '▶', 'right-1 top-9')}
                <div className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-600/80" />
            </div>

            <div className="pointer-events-auto flex items-end gap-1.5">
                <div className="grid grid-cols-3 gap-1">
                    {SKILL_IDS.map((skillId) => {
                        const skill = ASSET_MANIFEST.skills[skillId];
                        return (
                            <button
                                key={skillId}
                                type="button"
                                aria-label={`Dùng kỹ năng ${skillId.slice(1)}: ${skill.name}`}
                                title={`${skill.name} · ${skill.mpCost} MP`}
                                onClick={() => triggerSkill(skillId)}
                                className="relative flex size-9 touch-manipulation items-center justify-center rounded-xl border border-amber-500 bg-slate-950/90 text-lg shadow-lg active:scale-95 active:bg-amber-700"
                            >
                                <span>{skill.emoji}</span>
                                <span className="absolute -right-1 -top-1 rounded bg-black px-1 text-[9px] font-bold text-amber-200">{skillId.slice(1)}</span>
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        aria-label="Nhặt vật phẩm gần đây"
                        onClick={pickup}
                        className="flex size-9 touch-manipulation items-center justify-center rounded-xl border border-yellow-500 bg-slate-950/90 text-lg shadow-lg active:scale-95"
                    >
                        🪙
                    </button>
                    <button
                        type="button"
                        aria-label={isAuto ? 'Tắt tự động đánh' : 'Bật tự động đánh'}
                        onClick={toggleAuto}
                        className={`flex size-9 touch-manipulation items-center justify-center rounded-xl border text-base shadow-lg active:scale-95 ${isAuto ? 'border-emerald-400 bg-emerald-900/90' : 'border-emerald-700 bg-slate-950/90'}`}
                    >
                        ⚡
                    </button>
                </div>
                <button
                    type="button"
                    aria-label="Đánh thường"
                    onClick={basicAttack}
                    className="flex size-14 touch-manipulation flex-col items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-rose-500 to-red-800 text-xl shadow-[0_0_14px_rgba(239,68,68,0.65)] active:scale-95"
                >
                    🐾
                    <span className="text-[9px] font-black tracking-wide text-white">ĐÁNH</span>
                </button>
            </div>
        </div>
    );
};

export default VirtualControls;
