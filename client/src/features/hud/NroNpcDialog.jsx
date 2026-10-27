import { useEffect, useState } from 'react';
import networkInstance from '../../game/network';

/** Server-validated NPC dialogue for the NRO scene. */
const NroNpcDialog = () => {
    const [dialog, setDialog] = useState(null);

    useEffect(() => {
        const showDialog = (event) => setDialog(event.detail || {});
        window.addEventListener('game:nro-npc-dialog', showDialog);
        return () => window.removeEventListener('game:nro-npc-dialog', showDialog);
    }, []);

    if (!dialog) return null;
    const close = () => setDialog(null);
    const name = dialog.npc?.name || 'NPC';

    return (
        <div
            className="pointer-events-auto"
            role="presentation"
            onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
            style={{
                position: 'absolute', inset: 0, zIndex: 90,
                display: 'grid', placeItems: 'center',
                padding: 16, background: 'rgba(0,0,0,.3)'
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="nro-npc-dialog-title"
                style={{
                    width: 'min(420px, 100%)', color: '#fef3c7',
                    background: 'linear-gradient(160deg, #21170d, #090806)',
                    border: '2px solid #d97706', borderRadius: 12,
                    boxShadow: '0 16px 48px rgba(0,0,0,.75)', padding: 16
                }}
            >
                <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <div style={{ color: '#fbbf24', fontSize: 10, fontWeight: 800, letterSpacing: '.12em' }}>ĐỐI THOẠI</div>
                        <h2 id="nro-npc-dialog-title" style={{ margin: '3px 0 0', fontSize: 18, fontWeight: 900 }}>{name}</h2>
                    </div>
                    <button type="button" onClick={close} aria-label="Đóng hội thoại" style={closeButtonStyle}>×</button>
                </header>

                <p style={{ margin: '18px 0', fontSize: 14, lineHeight: 1.55, color: dialog.ok ? '#fef3c7' : '#fca5a5' }}>
                    {dialog.message || 'Hiện chưa thể trò chuyện với NPC này.'}
                </p>

                {dialog.ok && dialog.options?.length > 0 && (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {dialog.options.map((option) => {
                            const optionLabel = typeof option === 'string' ? option : option.label;
                            return <button key={optionLabel} type="button" onClick={() => {
                                if (option?.type === 'open_shop') {
                                    window.dispatchEvent(new CustomEvent('game:nro-open-shop', { detail: { npcId: dialog.npc?.id } }));
                                    close();
                                } else if (option?.type === 'open_power_training') {
                                    window.dispatchEvent(new Event('game:nro-training-show'));
                                    close();
                                } else if (option?.type === 'challenge_karin') {
                                    networkInstance.getSocket()?.emit('nroNpcAction', { npcId: dialog.npc?.id, action: 'challenge_karin' });
                                    close();
                                } else if (option?.mapId !== undefined) {
                                    networkInstance.getSocket()?.emit('travelNroPlanet', { destinationMapId: option.mapId });
                                    close();
                                }
                            }} style={{
                                padding: '10px 12px', borderRadius: 8,
                                border: '1px solid #70420f', background: 'rgba(120,53,15,.2)',
                                color: '#fcd34d', fontSize: 13, fontWeight: 700, textAlign: 'left', cursor: 'pointer'
                            }}>
                                {optionLabel}
                            </button>;
                        })}
                    </div>
                )}

                <footer style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                    <button type="button" onClick={close} style={actionButtonStyle}>Đóng</button>
                </footer>
            </section>
        </div>
    );
};

const closeButtonStyle = {
    width: 30, height: 30, border: '1px solid #78350f', borderRadius: 7,
    color: '#fcd34d', background: '#100b06', fontSize: 22, lineHeight: 1, cursor: 'pointer'
};

const actionButtonStyle = {
    border: '1px solid #f59e0b', borderRadius: 7, padding: '7px 16px',
    color: '#1c1004', background: 'linear-gradient(#fbbf24, #d97706)',
    fontWeight: 900, cursor: 'pointer'
};

export default NroNpcDialog;
