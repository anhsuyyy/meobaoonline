import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    closeClassSelection,
    setClassSelectionError,
    setClassSelectionSaving
} from '../../store/gameSlice';
import networkInstance from '../../game/network';

const ClassSelectionModal = () => {
    const dispatch = useDispatch();
    const { isOpen, isSaving, error, npc, classes } = useSelector((state) => state.game.classSelection);
    const [selectedClassId, setSelectedClassId] = useState('');

    if (!isOpen) return null;

    const closeDialog = () => {
        setSelectedClassId('');
        dispatch(closeClassSelection());
    };

    const confirmSelection = () => {
        const socket = networkInstance.getSocket();
        if (!selectedClassId) {
            dispatch(setClassSelectionError('Hãy chọn một class trước khi xác nhận.'));
            return;
        }
        if (!socket?.connected) {
            dispatch(setClassSelectionError('Mất kết nối game. Hãy kết nối lại rồi thử lần nữa.'));
            return;
        }

        dispatch(setClassSelectionSaving(true));
        socket.emit('selectClass', selectedClassId);
    };

    return (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6">
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="class-title"
                className="fantasy-panel-gold my-auto max-h-[94dvh] w-full max-w-3xl overflow-y-auto p-4 text-slate-100 shadow-2xl sm:p-6"
            >
                <header className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-teal-300">{npc?.name}</p>
                        <h2 id="class-title" className="mt-1 text-xl font-black text-amber-300 sm:text-2xl">
                            Chọn con đường của bạn
                        </h2>
                        <p className="mt-1 text-xs text-slate-300 sm:text-sm">
                            Bạn có thể đổi lựa chọn trước khi xác nhận. Class chỉ chọn được một lần.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={closeDialog}
                        disabled={isSaving}
                        aria-label="Đóng cửa sổ chọn class"
                        className="rounded-md px-2 py-1 text-xl text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >
                        ×
                    </button>
                </header>

                {error && (
                    <p role="alert" className="mb-3 rounded-md border border-red-500/50 bg-red-950/60 p-2.5 text-sm text-red-200">
                        ⚠️ {error}
                    </p>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {classes.map((item) => {
                        const isSelected = selectedClassId === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                    setSelectedClassId(item.id);
                                    if (error) dispatch(setClassSelectionError(''));
                                }}
                                disabled={isSaving}
                                aria-pressed={isSelected}
                                className={`flex min-h-28 items-center gap-3 rounded-xl border p-3 text-left transition sm:p-4 ${
                                    isSelected
                                        ? 'border-amber-300 bg-amber-950/70 shadow-[0_0_18px_rgba(245,158,11,0.25)]'
                                        : 'border-slate-700 bg-slate-950/75 hover:border-amber-700'
                                }`}
                            >
                                <img
                                    src={item.portrait}
                                    alt=""
                                    className="h-14 w-14 shrink-0 rounded-lg border border-amber-800/80 bg-black/40 object-contain p-1 sm:h-16 sm:w-16"
                                />
                                <span className="min-w-0">
                                    <span className="block font-black text-amber-100">{item.name}</span>
                                    <span className="mt-0.5 block text-xs font-bold text-teal-300">{item.role}</span>
                                    <span className="mt-1 block text-xs leading-relaxed text-slate-300">{item.description}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>

                <footer className="mt-5 flex flex-col-reverse gap-2 border-t border-amber-900/60 pt-4 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={closeDialog}
                        disabled={isSaving}
                        className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/5 disabled:opacity-50"
                    >
                        Để sau
                    </button>
                    <button
                        type="button"
                        onClick={confirmSelection}
                        disabled={isSaving || !selectedClassId}
                        className="rounded-lg border border-amber-300/50 bg-gradient-to-b from-amber-500 to-amber-700 px-5 py-2 text-sm font-black text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isSaving ? 'Đang lưu class…' : 'Xác nhận class'}
                    </button>
                </footer>
            </section>
        </div>
    );
};

export default ClassSelectionModal;
