import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import networkInstance from '../../game/network';

const labels = ['HP', 'KI', 'Sức đánh', 'Giáp', 'Chí mạng'];
const keys = ['hp', 'mp', 'damage', 'defense', 'critical'];

const NroTrainingPanel = () => {
    const { character, dtn } = useSelector((state) => state.game);
    const [open, setOpen] = useState(false);
    const [points, setPoints] = useState(1);
    const [limit, setLimit] = useState(null);
    const [limitPower, setLimitPower] = useState(0);
    const [openPowerExpiresAt, setOpenPowerExpiresAt] = useState(0);
    const [now, setNow] = useState(0);
    const [message, setMessage] = useState('');
    const stats = character?.nroCharacter?.nroStats || {};

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const toggle = () => setOpen((value) => !value);
        const show = () => setOpen(true);
        const close = () => setOpen(false);
        const onKeyDown = (event) => { if (event.code === 'Escape') close(); };
        const config = (event) => {
            setLimit(event.detail?.limit || null);
            setLimitPower(event.detail?.limitPower || 0);
            setOpenPowerExpiresAt(event.detail?.openPowerExpiresAt || 0);
        };
        const result = (event) => {
            setMessage(event.detail?.message || '');
            if (event.detail?.openPowerExpiresAt !== undefined) setOpenPowerExpiresAt(event.detail.openPowerExpiresAt);
            if (event.detail?.limitPower !== undefined) setLimitPower(event.detail.limitPower);
            if (event.detail?.limit) setLimit(event.detail.limit);
        };
        window.addEventListener('game:nro-training-toggle', toggle);
        window.addEventListener('game:nro-training-show', show);
        window.addEventListener('game:nro-panels-close', close);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('game:nro-training-config', config);
        window.addEventListener('game:nro-training-result', result);
        window.addEventListener('game:nro-power-limit-result', result);
        return () => {
            window.removeEventListener('game:nro-training-toggle', toggle);
            window.removeEventListener('game:nro-training-show', show);
            window.removeEventListener('game:nro-panels-close', close);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('game:nro-training-config', config);
            window.removeEventListener('game:nro-training-result', result);
            window.removeEventListener('game:nro-power-limit-result', result);
        };
    }, []);

    const train = (statType) => networkInstance.getSocket()?.emit('trainNroStat', { statType, points });
    const openLimit = (speed) => networkInstance.getSocket()?.emit('openNroPowerLimit', { speed });
    const isOpeningLimit = openPowerExpiresAt > now;
    if (!open) return null;
    return <div role="dialog" aria-label="Tiềm năng" className="nro-training-panel pointer-events-auto absolute bottom-24 left-1/2 z-[100] w-[min(360px,92vw)] -translate-x-1/2 rounded-xl border border-amber-600 bg-slate-950/95 p-3 text-xs text-white shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
            <strong className="text-amber-300">Tiềm năng: {Number(dtn || 0).toLocaleString()}</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng" className="px-2 text-lg">×</button>
        </div>
        <div className="mb-2 flex items-center justify-between text-slate-300">
            <span>Giới hạn sức mạnh: cấp {limitPower + 1}</span>
            <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPoints((n) => Math.max(1, n - 1))}>−</button>
                <span>{points} điểm</span>
                <button type="button" onClick={() => setPoints((n) => Math.min(100, n + 1))}>+</button>
            </div>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => openLimit(false)} disabled={isOpeningLimit}
                className="rounded border border-sky-800 bg-sky-950/70 px-2 py-1.5 disabled:opacity-50">
                {isOpeningLimit ? 'Đang mở giới hạn (24 giờ)' : 'Mở giới hạn (24 giờ)'}
            </button>
            <button type="button" onClick={() => openLimit(true)} className="rounded border border-amber-700 bg-amber-950/70 px-2 py-1.5">
                Mở ngay · 1 tỷ vàng
            </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
            {labels.map((label, statType) => <button key={label} type="button" onClick={() => train(statType)}
                className="rounded border border-amber-800 bg-amber-950/60 px-2 py-2 text-left hover:bg-amber-900">
                {label}: {Number(stats[keys[statType]] || 0).toLocaleString()}
                <span className="block text-[10px] text-slate-400">Tối đa {Number(limit?.[keys[statType]] || 0).toLocaleString()}</span>
            </button>)}
        </div>
        {message && <p role="status" className="mt-2 text-amber-200">{message}</p>}
    </div>;
};

export default NroTrainingPanel;
