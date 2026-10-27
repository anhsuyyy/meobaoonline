import { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { toggleChat } from '../../store/gameSlice';
import networkInstance from '../../game/network';

const CHANNEL_COLORS = {
    system:  { label: '[HT]',    sender: '#fbbf24', text: '#fde68a' },
    world:   { label: '[TG]',    sender: '#4ade80', text: '#d1fae5' },
    party:   { label: '[ĐỘI]',   sender: '#60a5fa', text: '#dbeafe' },
    area:    { label: '[KV]',    sender: '#c084fc', text: '#ede9fe' },
};

/**
 * ChatPanel - Góc dưới bên trái, phong cách MMORPG cổ điển
 */
const ChatPanel = ({ variant = 'default' }) => {
    const dispatch = useDispatch();
    const { chatMessages, isChatOpen } = useSelector((state) => state.game);
    const [activeTab, setActiveTab] = useState('all');
    const [inputText, setInputText] = useState('');
    const [sendError, setSendError] = useState('');
    const [classicOpen, setClassicOpen] = useState(false);
    const [previewEnabled, setPreviewEnabled] = useState(() => localStorage.getItem('nro:chat-preview') !== 'false');
    const msgListRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const preview = (event) => setPreviewEnabled(event.detail !== false);
        const close = (event) => { if (event.code === 'Escape') setClassicOpen(false); };
        window.addEventListener('game:nro-chat-preview', preview);
        window.addEventListener('keydown', close);
        return () => {
            window.removeEventListener('game:nro-chat-preview', preview);
            window.removeEventListener('keydown', close);
        };
    }, []);

    useEffect(() => {
        if (classicOpen) inputRef.current?.focus();
    }, [classicOpen]);

    // Auto-scroll xuống dưới khi có tin nhắn mới
    useEffect(() => {
        if (msgListRef.current) {
            msgListRef.current.scrollTop = msgListRef.current.scrollHeight;
        }
    }, [chatMessages, isChatOpen, classicOpen, activeTab]);

    const filteredMessages = chatMessages.filter((msg) => {
        if (activeTab === 'all') return true;
        return msg.channel === activeTab;
    });

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!inputText.trim()) return;
        if (activeTab === 'system') {
            setSendError('Kênh hệ thống chỉ nhận thông báo từ máy chủ.');
            return;
        }
        const channel = ['world', 'party', 'area'].includes(activeTab) ? activeTab : 'world';
        const socket = networkInstance.getSocket();
        if (!socket?.connected) {
            setSendError('Đang kết nối máy chủ…');
            return;
        }
        socket.emit('chatSend', { channel, text: inputText }, (result) => {
            if (!result?.ok) {
                setSendError(result?.error || 'Không gửi được tin nhắn.');
                return;
            }
            setSendError('');
            setInputText('');
        });
    };

    const tabs = [
        { key: 'all', label: 'Tất cả' },
        { key: 'system', label: 'Hệ thống' },
        { key: 'world', label: 'Thế giới' },
        { key: 'party', label: 'Đội' },
        { key: 'area', label: 'Khu vực' },
    ];

    const panelStyle = {
        background: 'linear-gradient(180deg, rgba(28,18,8,0.95) 0%, rgba(12,8,3,0.97) 100%)',
        border: '2px solid #b45309',
        outline: '1px solid #451a03',
        boxShadow: '0 4px 16px rgba(0,0,0,0.85), inset 0 1px 3px rgba(251,191,36,0.1)',
    };

    if (variant === 'classic') {
        const latest = chatMessages.filter((message) => message.channel !== 'system').at(-1);
        const bubble = <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M10 10h20q4 0 4 4v13q0 4-4 4h-8l-8 6v-6h-4q-4 0-4-4V14q0-4 4-4Z" fill="currentColor" /><path d="M13 17h14m-14 6h14" stroke="#e67b19" strokeWidth="3" strokeLinecap="round" /></svg>;
        return <div className="classic-chat">
            <div className="classic-chat-summary">
                {previewEnabled && <>
                    <button type="button" className="classic-round-button classic-world-chat" aria-label="Mở chat thế giới" onClick={() => { setActiveTab('world'); setClassicOpen(true); }}>{bubble}</button>
                    <button type="button" className="classic-chat-preview" onClick={() => setClassicOpen((value) => !value)} aria-label="Đọc tin nhắn chat">
                        <img src="/assets/nro/character/td/dung/dung1.png" alt="" draggable="false" />
                        <span><strong>{latest?.senderName || 'Trò chuyện'}</strong><span>{latest?.text || 'Chạm để gửi tin nhắn'}</span></span>
                    </button>
                </>}
                <button type="button" className="classic-round-button classic-chat-toggle" aria-label={classicOpen ? 'Đóng chat' : 'Mở chat'} aria-expanded={classicOpen}
                    onClick={() => setClassicOpen((value) => !value)}>{bubble}</button>
            </div>
            {classicOpen && <section className="classic-chat-window" aria-label="Trò chuyện">
                <header><strong>Trò chuyện</strong><button type="button" aria-label="Thu nhỏ chat" onClick={() => setClassicOpen(false)}>×</button></header>
                <nav aria-label="Kênh chat">{tabs.map((tab) => <button type="button" key={tab.key} aria-pressed={activeTab === tab.key}
                    onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}</nav>
                <div className="classic-chat-log" ref={msgListRef} role="log" aria-label="Tin nhắn">
                    {filteredMessages.map((message) => <p key={message.messageId}><strong>{message.senderName || 'Hệ thống'}: </strong>{message.text}</p>)}
                    {!filteredMessages.length && <p className="classic-chat-empty">Chưa có tin nhắn trong kênh này.</p>}
                </div>
                <form onSubmit={handleSendMessage}><input ref={inputRef} aria-label="Nội dung tin nhắn" value={inputText} maxLength={300}
                    onChange={(event) => setInputText(event.target.value)} placeholder="Nhập tin nhắn…" /><button type="submit">Gửi</button></form>
                {sendError && <p className="classic-chat-error" role="status">{sendError}</p>}
            </section>}
        </div>;
    }

    return (
        <div className={`hud-chat-panel pointer-events-auto flex flex-col ${isChatOpen ? 'chat-open' : 'chat-closed'}`} style={{ maxWidth: 300, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))' }}>
            {/* Tab bar + nút toggle */}
            <div className="hud-chat-header" style={{
                ...panelStyle,
                borderRadius: '8px 8px 0 0',
                borderBottom: 'none',
                display: 'flex', alignItems: 'center', gap: 2,
                padding: '3px 6px'
            }}>
                <span className="nro-chat-glyph" aria-hidden="true" />
                {tabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        style={{
                            padding: '2px 6px',
                            background: activeTab === t.key ? '#b45309' : 'transparent',
                            color: activeTab === t.key ? '#fff' : '#9ca3af',
                            border: activeTab === t.key ? '1px solid #d97706' : '1px solid transparent',
                            borderRadius: 4,
                            fontSize: 9, fontWeight: 700,
                            cursor: 'pointer', whiteSpace: 'nowrap'
                        }}
                    >
                        {t.label}
                    </button>
                ))}
                <button
                    onClick={() => dispatch(toggleChat())}
                    style={{
                        marginLeft: 'auto',
                        color: '#94a3b8', background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: 10, fontWeight: 700, padding: '0 3px'
                    }}
                    title={isChatOpen ? 'Thu nhỏ' : 'Mở rộng'}
                >
                    {isChatOpen ? '▼' : '▲'}
                </button>
            </div>

            {/* Body chat */}
            {isChatOpen ? (
                <div className="hud-chat-body" style={{
                    ...panelStyle,
                    borderRadius: '0 0 8px 8px',
                    borderTop: '1px solid #451a03',
                    padding: '6px 8px',
                    display: 'flex', flexDirection: 'column', gap: 5,
                    width: 280
                }}>
                    {/* Danh sách tin nhắn */}
                    <div
                        ref={msgListRef}
                        className="hud-chat-messages"
                        style={{
                            height: 100, overflowY: 'auto',
                            display: 'flex', flexDirection: 'column', gap: 2,
                            paddingRight: 2
                        }}
                    >
                        {filteredMessages.map((msg) => {
                            const cfg = CHANNEL_COLORS[msg.channel] || CHANNEL_COLORS.world;
                            return (
                                <div key={msg.messageId} style={{ lineHeight: 1.4, fontSize: 10 }}>
                                    <span style={{ color: cfg.sender, fontWeight: 700 }}>
                                        {cfg.label} {msg.senderName}:{' '}
                                    </span>
                                    <span style={{ color: cfg.text }}>{msg.text}</span>
                                </div>
                            );
                        })}
                        {filteredMessages.length === 0 && (
                            <span style={{ color: '#4b5563', fontSize: 9, fontStyle: 'italic' }}>
                                Chưa có tin nhắn.
                            </span>
                        )}
                    </div>

                    {/* Ô nhập */}
                    <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 5 }}>
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Nhập tin nhắn..."
                            style={{
                                flex: 1, background: '#0c0804',
                                border: '1px solid #451a03',
                                borderRadius: 5, padding: '4px 7px',
                                color: '#f1f5f9', fontSize: 10,
                                outline: 'none',
                                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.7)'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#d97706'}
                            onBlur={(e) => e.target.style.borderColor = '#451a03'}
                        />
                        <button
                            type="submit"
                            style={{
                                background: 'linear-gradient(180deg, #d97706, #92400e)',
                                color: '#fff', border: '1px solid #b45309',
                                borderRadius: 5, padding: '4px 10px',
                                fontSize: 10, fontWeight: 700, cursor: 'pointer'
                            }}
                        >
                            Gửi
                        </button>
                    </form>
                    {sendError && <span role="status" style={{ color: '#fca5a5', fontSize: 9 }}>{sendError}</span>}
                </div>
            ) : (
                <div
                    onClick={() => dispatch(toggleChat())}
                    style={{
                        ...panelStyle,
                        borderRadius: '0 0 8px 8px',
                        borderTop: '1px solid #451a03',
                        padding: '3px 10px',
                        color: '#6b7280', fontSize: 9,
                        cursor: 'pointer'
                    }}
                >
                    Bấm để mở hộp chat...
                </div>
            )}
        </div>
    );
};

export default ChatPanel;
