import { useEffect, useState } from 'react';
import networkInstance from '../../game/network';

const NroFlagMenu = ({ initialFlag = 0 }) => {
    const [open, setOpen] = useState(false);
    const [flag, setFlag] = useState(initialFlag);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const result = (event) => {
            const payload = event.detail || {};
            if (payload.flag !== undefined) setFlag(payload.flag);
            setMessage(payload.message || '');
        };
        window.addEventListener('game:nro-flag-result', result);
        return () => window.removeEventListener('game:nro-flag-result', result);
    }, []);

    const selectFlag = (value) => networkInstance.getSocket()?.emit('setNroFlag', { flag: value });

    return <div className="relative pointer-events-auto">
        <button type="button" onClick={() => setOpen((value) => !value)}
            className="rounded border border-amber-700 bg-amber-950/80 px-2 py-1 text-xs"
            aria-label="Chọn cờ phe" aria-expanded={open}><span className="nro-flag-glyph" aria-hidden="true" />{flag ? ` ${flag}` : ''}</button>
        {open && <div className="absolute right-0 top-full z-[90] mt-2 w-48 rounded-lg border border-amber-600 bg-slate-950/95 p-2 shadow-xl">
            <p className="px-1 pb-2 text-[10px] font-bold text-amber-200">Cờ phe · đổi mỗi 60 giây</p>
            <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 8 }, (_, index) => <button key={index} type="button" onClick={() => selectFlag(index)}
                    className={`rounded border px-2 py-1 text-xs ${flag === index ? 'border-amber-400 bg-amber-800 text-white' : 'border-slate-700 bg-slate-900 text-slate-200'}`}>
                    {index === 0 ? 'Tắt' : index}
                </button>)}
            </div>
            {message && <p role="status" className="mt-2 text-[10px] text-teal-200">{message}</p>}
        </div>}
    </div>;
};

export default NroFlagMenu;
