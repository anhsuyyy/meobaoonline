import { useEffect, useState } from 'react';

const NroTaskPanel = ({ task: providedTask } = {}) => {
    const [receivedTask, setTask] = useState(null);
    const task = providedTask ?? receivedTask;

    useEffect(() => {
        const handleTaskUpdate = (event) => setTask(event.detail || null);
        window.addEventListener('game:nro-task-update', handleTaskUpdate);
        return () => window.removeEventListener('game:nro-task-update', handleTaskUpdate);
    }, []);

    if (!task) return null;
    const completed = task.status === 'completed';
    const ready = task.status === 'ready_to_report';
    const percent = task.target > 0 ? Math.max(0, Math.min(100, task.progress / task.target * 100)) : 0;

    return (
        <section className="pointer-events-auto mt-2 w-[min(260px,38vw)] rounded-md border border-amber-700 bg-[#171006] p-3 text-slate-100 shadow-xl">
            <header className="mb-1 flex items-center gap-1.5 text-xs font-black text-amber-300"><i className="nro-scroll-glyph" aria-hidden="true" />{task.title}</header>
            <p className="text-[11px] leading-relaxed text-slate-300">
                {completed ? 'Đã hoàn thành nhiệm vụ.' : task.objective}
            </p>
            {task.targetMapId != null && !completed && (
                <p className="mt-1 text-[10px] text-sky-300">Khu vực mục tiêu: {task.targetMapName || `Map ${task.targetMapId}`}</p>
            )}
            {!ready && !completed && (
                <div className="mt-2">
                    <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                        <span>Tiến độ</span><span>{task.progress} / {task.target}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-amber-400 transition-[width]" style={{ width: `${percent}%` }} />
                    </div>
                </div>
            )}
            {ready && <p className="mt-2 text-[10px] font-bold text-emerald-300">Hãy {task.objective?.toLowerCase() || 'đến NPC tại nhà của hành tinh để báo cáo'}.</p>}
        </section>
    );
};

export default NroTaskPanel;
