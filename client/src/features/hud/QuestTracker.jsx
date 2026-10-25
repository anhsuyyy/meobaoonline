import React, { useState } from 'react';
import { useSelector } from 'react-redux';

const QuestTracker = () => {
    const quest = useSelector((state) => state.game.quest);
    const [isCollapsed, setIsCollapsed] = useState(false);

    if (!quest) return null;

    const isDone = quest.status === 'completed';
    const progressPercent = Math.max(0, Math.min(100, (quest.progress / quest.target) * 100));

    return (
        <div className="pointer-events-auto mt-2 max-w-[210px] md:max-w-[230px]">
            <div className="bg-slate-950/85 backdrop-blur-md border border-amber-600/60 rounded-xl p-2.5 shadow-xl text-xs text-slate-100 flex flex-col gap-1.5 transition-all">
                {/* Header Nhiệm Vụ */}
                <div className="flex justify-between items-center pb-1 border-b border-slate-800">
                    <span className="font-bold text-amber-300 flex items-center gap-1">
                        📜 {quest.title}
                    </span>
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="text-slate-400 hover:text-slate-200 text-[10px] px-1 font-mono"
                        title={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
                    >
                        {isCollapsed ? '➕' : '➖'}
                    </button>
                </div>

                {!isCollapsed && (
                    <>
                        <div className="text-[11px] text-slate-300">
                            Tiêu diệt quái vật:
                            <span className={`font-bold ml-1 ${isDone ? 'text-green-400' : 'text-amber-400 font-mono'}`}>
                                {quest.progress} / {quest.target}
                            </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-900 rounded-full h-1.5 border border-slate-700 overflow-hidden">
                            <div
                                className={`h-full transition-all duration-300 ${
                                    isDone ? 'bg-green-500' : 'bg-gradient-to-r from-amber-600 to-yellow-400'
                                }`}
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>

                        {/* Phần thưởng */}
                        <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 flex justify-between items-center">
                            <span>Thưởng:</span>
                            <span className="text-yellow-400 font-semibold">+100 🪙 +50 ✨</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default QuestTracker;
