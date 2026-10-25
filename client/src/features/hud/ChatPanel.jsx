import React, { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { toggleChat, addChatMessage } from '../../store/gameSlice';

const CHANNEL_COLORS = {
    system:  { label: '[HT]',    sender: '#fbbf24', text: '#fde68a' },
    world:   { label: '[TG]',    sender: '#4ade80', text: '#d1fae5' },
    party:   { label: '[ĐỘI]',   sender: '#60a5fa', text: '#dbeafe' },
    guild:   { label: '[MH]',    sender: '#c084fc', text: '#ede9fe' },
};

/**
 * ChatPanel - Góc dưới bên trái, phong cách MMORPG cổ điển
 */
const ChatPanel = () => {
    const dispatch = useDispatch();
    const { chatMessages, isChatOpen, user } = useSelector((state) => state.game);
    const [activeTab, setActiveTab] = useState('all');
    const [inputText, setInputText] = useState('');
    const msgListRef = useRef(null);

    // Auto-scroll xuống dưới khi có tin nhắn mới
    useEffect(() => {
        if (msgListRef.current) {
            msgListRef.current.scrollTop = msgListRef.current.scrollHeight;
        }
    }, [chatMessages, isChatOpen]);

    const filteredMessages = chatMessages.filter((msg) => {
        if (activeTab === 'all') return true;
        return msg.channel === activeTab;
    });

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!inputText.trim()) return;
        dispatch(addChatMessage({
            channel: 'world',
            sender: user.username || 'Bạn',
            text: inputText.trim()
        }));
        setInputText('');
    };

    const tabs = [
        { key: 'all', label: 'Tất cả' },
        { key: 'system', label: 'Hệ thống' },
        { key: 'world', label: 'Thế giới' },
        { key: 'party', label: 'Đội' },
    ];

    const panelStyle = {
        background: 'linear-gradient(180deg, rgba(28,18,8,0.95) 0%, rgba(12,8,3,0.97) 100%)',
        border: '2px solid #b45309',
        outline: '1px solid #451a03',
        boxShadow: '0 4px 16px rgba(0,0,0,0.85), inset 0 1px 3px rgba(251,191,36,0.1)',
    };

    return (
        <div className="pointer-events-auto flex flex-col" style={{ maxWidth: 300, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))' }}>
            {/* Tab bar + nút toggle */}
            <div style={{
                ...panelStyle,
                borderRadius: '8px 8px 0 0',
                borderBottom: 'none',
                display: 'flex', alignItems: 'center', gap: 2,
                padding: '3px 6px'
            }}>
                <span style={{ color: '#d97706', fontSize: 10, marginRight: 3 }}>💬</span>
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
                <div style={{
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
                        style={{
                            height: 100, overflowY: 'auto',
                            display: 'flex', flexDirection: 'column', gap: 2,
                            paddingRight: 2
                        }}
                    >
                        {filteredMessages.map((msg) => {
                            const cfg = CHANNEL_COLORS[msg.channel] || CHANNEL_COLORS.world;
                            return (
                                <div key={msg.id} style={{ lineHeight: 1.4, fontSize: 10 }}>
                                    <span style={{ color: cfg.sender, fontWeight: 700 }}>
                                        {cfg.label} {msg.sender}:{' '}
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
