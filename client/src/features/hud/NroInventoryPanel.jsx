import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import networkInstance from '../../game/network';
import { clearSkillCooldowns, logoutUser, setActiveSkill, setNroBag, setNroEquipment, updateStats } from '../../store/gameSlice';
import NroSpritePreview from '../auth/NroSpritePreview';
import { getNroSkillIcon } from './nroSkillIcon';
import { getNroItemIcon } from './nroItemIcon';

const EQUIPMENT_TYPES = ['Áo', 'Quần', 'Găng', 'Giày', 'Rada'];
const EMPTY_BAG = [];
const SKILL_BOOK_RANGES = {
    earth: [[94, 100], [115, 121], [300, 306], [307, 313], [434, 440]],
    namek: [[101, 107], [122, 128], [328, 334], [335, 341], [481, 487]],
    saiyan: [[108, 114], [129, 135], [314, 320], [321, 327], [434, 440]]
};
const PANEL_TABS = ['Nhiệm vụ', 'Hành trang', 'Trang bị', 'Kỹ năng', 'Bang hội', 'Chức năng'];
const TRAINING_STATS = [
    ['HP', 0, 'hp'], ['KI', 1, 'mp'], ['Sức đánh', 2, 'damage'], ['Giáp', 3, 'defense'], ['Chí mạng', 4, 'critical']
];
const STAT_ICON_TEXT = { hp: 'HP', mp: 'KI', damage: 'STR', defense: 'DEF', critical: 'CRIT' };
const format = (value) => Number(value || 0).toLocaleString('vi-VN');
const optionValue = (option) => Number(option?.param ?? option?.parameter ?? 0);

function getTrainingCost(statType, points, value) {
    const count = BigInt(points);
    const current = BigInt(Math.max(0, Math.floor(Number(value) || 0)));
    if (statType === 0 || statType === 1) return count * (current + 1000n) + count * (count - 1n) * 10n;
    if (statType === 2) return count * (2n * current + count - 1n) / 2n * 100n;
    if (statType === 3) return (current + 5n) * 100_000n;
    if (statType === 4) return 50_000_000n * (5n ** current);
    return 0n;
}

function StatIcon({ stat }) {
    const paths = {
        hp: <path d="M24 41S7 30 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 12-17 23-17 23Z" />,
        mp: <path d="M24 5C18 15 10 22 10 31a14 14 0 0 0 28 0C38 22 30 15 24 5Z" />,
        damage: <path d="m28 4-17 23h12l-3 17 18-25H26l2-15Z" />,
        defense: <path d="M24 5 40 11v12c0 11-7 17-16 21C15 40 8 34 8 23V11l16-6Zm-8 19 6 6 12-13" />,
        critical: <><circle cx="24" cy="24" r="15" /><circle cx="24" cy="24" r="5" /><path d="M24 2v8m0 28v8M2 24h8m28 0h8" /></>
    };
    return <span className={`nro-skill-row-icon nro-stat-icon--${stat}`} aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">{paths[stat]}</svg>
        <small>{STAT_ICON_TEXT[stat]}</small>
    </span>;
}

function itemIconFallback(item) {
    const label = String(item?.type ?? 'N').replace(/[<>&"']/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="2" y="2" width="44" height="44" rx="5" fill="#d8bd8c" stroke="#6f4a27" stroke-width="3"/><rect x="8" y="8" width="32" height="32" fill="#b8925f" stroke="#f4dfb1" stroke-width="2"/><text x="24" y="31" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="900" fill="#fff3cf">${label}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function formatOption(option, optionById) {
    const template = optionById.get(Number(option.optionId));
    return template?.name?.replace('#', format(optionValue(option)))
        || `Thuộc tính ${option.optionId}: ${format(optionValue(option))}`;
}

export default function NroInventoryPanel() {
    const dispatch = useDispatch();
    const panelRef = useRef(null);
    const closeTimerRef = useRef(null);
    const openStateRef = useRef(false);
    const game = useSelector((state) => state.game);
    const { character, level, skillConfig, skillLevels, user, hp, maxHp, mp, maxMp, str, armor, crit, dtn, gold, stamina, maxStamina } = game;
    const nroCharacter = character?.nroCharacter;
    const bag = nroCharacter?.bag || EMPTY_BAG;
    const equipment = nroCharacter?.equipment || {};
    // The panel mounts before character creation; it becomes visible naturally
    // once the character exists, without an effect-triggered extra render.
    const [open, setOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [optionTemplates, setOptionTemplates] = useState([]);
    const [message, setMessage] = useState('');
    const [activeTab, setActiveTab] = useState('Hành trang');
    const [selectedBagIndex, setSelectedBagIndex] = useState(-1);
    const [selectedEquipmentIndex, setSelectedEquipmentIndex] = useState(-1);
    const [detailSkillId, setDetailSkillId] = useState(null);
    const [task, setTask] = useState(null);
    const [guildState, setGuildState] = useState({ guild: null, guilds: [], loading: false });
    const [guildName, setGuildName] = useState('');
    const [guildInviteUsername, setGuildInviteUsername] = useState('');
    const [guildDescription, setGuildDescription] = useState('');
    const [guildChatDraft, setGuildChatDraft] = useState('');
    const [guildChat, setGuildChat] = useState([]);
    const [showChat, setShowChat] = useState(() => localStorage.getItem('nro:chat-preview') !== 'false');
    openStateRef.current = open;

    useEffect(() => {
        fetch('/assets/nro/map/data/item-templates.json')
            .then((response) => response.ok ? response.json() : [])
            .then(setTemplates)
            .catch(() => setTemplates([]));
        fetch('/assets/nro/map/data/item-options.json')
            .then((response) => response.ok ? response.json() : [])
            .then(setOptionTemplates)
            .catch(() => setOptionTemplates([]));
        const closePanel = () => {
            setClosing(true);
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = window.setTimeout(() => { setOpen(false); setClosing(false); }, 220);
        };
        const toggle = () => { if (openStateRef.current) closePanel(); else { setOpen(true); setClosing(false); } setMessage(''); };
        const show = (event) => {
            const requestedTab = event.detail?.tab;
            window.clearTimeout(closeTimerRef.current);
            setOpen(true);
            setClosing(false);
            setActiveTab(PANEL_TABS.includes(requestedTab) ? requestedTab : 'Hành trang');
            setMessage('');
        };
        const close = () => closePanel();
        const result = (event) => {
            const payload = event.detail || {};
            setMessage(payload.message || 'Không thể dùng vật phẩm.');
            if (!payload.ok) return;
            dispatch(setNroBag(payload.bag || []));
            if (payload.equipment) dispatch(setNroEquipment(payload.equipment));
            if (payload.stats) dispatch(updateStats(payload.stats));
            if (payload.cooldownsReset) {
                dispatch(clearSkillCooldowns());
                window.dispatchEvent(new CustomEvent('game:skill-cooldowns-reset'));
            }
        };
        const picked = (event) => {
            const payload = event.detail || {};
            if (payload.bag) dispatch(setNroBag(payload.bag));
            if (payload.gold !== undefined) dispatch(updateStats({ gold: payload.gold }));
            if (payload.message) setMessage(payload.message);
        };
        const taskUpdate = (event) => setTask(event.detail || null);
        window.addEventListener('game:nro-inventory-toggle', toggle);
        window.addEventListener('game:nro-inventory-open', show);
        window.addEventListener('game:nro-panels-close', close);
        window.addEventListener('game:nro-inventory-result', result);
        window.addEventListener('game:nro-inventory-picked', picked);
        window.addEventListener('game:nro-task-update', taskUpdate);
        return () => {
            window.clearTimeout(closeTimerRef.current);
            window.removeEventListener('game:nro-inventory-toggle', toggle);
            window.removeEventListener('game:nro-inventory-open', show);
            window.removeEventListener('game:nro-panels-close', close);
            window.removeEventListener('game:nro-inventory-result', result);
            window.removeEventListener('game:nro-inventory-picked', picked);
            window.removeEventListener('game:nro-task-update', taskUpdate);
        };
    }, [dispatch]);

    useEffect(() => {
        const socket = networkInstance.getSocket();
        if (!socket) return undefined;
        const onState = (payload = {}) => {
            setGuildState({ ...payload, loading: false });
            if (payload.guild) setGuildDescription(payload.guild.description || '');
            else setGuildChat([]);
        };
        const onResult = (payload = {}) => setMessage(payload.message || '');
        const onGuildRefresh = () => socket.emit('guildRefreshRequest');
        const onGuildChat = (entry) => setGuildChat((current) => [...current, entry].slice(-40));
        const onGuildInvitation = (invitation) => {
            setGuildState((state) => ({
                ...state,
                invitations: [invitation, ...(state.invitations || []).filter((entry) => entry.id !== invitation.id)]
                    .slice(0, 20)
            }));
            setMessage(`Bang ${invitation.guildName} mời bạn tham gia.`);
        };
        socket.on('guildState', onState);
        socket.on('guildResult', onResult);
        socket.on('guildRefresh', onGuildRefresh);
        socket.on('guildChatMessage', onGuildChat);
        socket.on('guildInvitationReceived', onGuildInvitation);
        socket.emit('guildRequestState');
        return () => {
            socket.off('guildState', onState);
            socket.off('guildResult', onResult);
            socket.off('guildRefresh', onGuildRefresh);
            socket.off('guildChatMessage', onGuildChat);
            socket.off('guildInvitationReceived', onGuildInvitation);
        };
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        const closeOnOutsidePointer = (event) => {
            if (!panelRef.current?.contains(event.target)) {
                setClosing(true);
                window.clearTimeout(closeTimerRef.current);
                closeTimerRef.current = window.setTimeout(() => { setOpen(false); setClosing(false); }, 220);
            }
        };
        document.addEventListener('pointerdown', closeOnOutsidePointer);
        return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const closeOnEscape = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            setClosing(true);
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = window.setTimeout(() => { setOpen(false); setClosing(false); }, 220);
            setMessage('');
        };
        document.addEventListener('keydown', closeOnEscape, true);
        return () => document.removeEventListener('keydown', closeOnEscape, true);
    }, [open]);

    const itemById = useMemo(() => new Map(templates.map((item) => [Number(item.id), item])), [templates]);
    const optionById = useMemo(() => new Map(optionTemplates.map((option) => [Number(option.id), option])), [optionTemplates]);
    const bagGroups = useMemo(() => {
        const groups = [];
        const stackGroups = new Map();
        bag.forEach((slot, index) => {
            const item = itemById.get(Number(slot.templateId));
            if (!item) return;
            const optionKey = JSON.stringify((slot.options || []).map((option) => [Number(option.optionId), optionValue(option)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]));
            const key = item.stackable ? `${item.id}:${optionKey}` : `slot:${index}`;
            const existing = stackGroups.get(key);
            if (existing) {
                existing.quantity += Math.max(1, Number(slot.quantity) || 1);
                existing.indices.push(index);
            } else {
                const group = { key, index, indices: [index], item, slot, quantity: Math.max(1, Number(slot.quantity) || 1) };
                stackGroups.set(key, group);
                groups.push(group);
            }
        });
        return groups;
    }, [bag, itemById]);
    const selectedBagGroup = bagGroups.find((group) => group.index === selectedBagIndex);
    if ((!open && !closing) || !nroCharacter?.created) return null;

    const act = (event, bagIndex) => networkInstance.getSocket()?.emit(event, { bagIndex });
    const taskInfo = task || nroCharacter.mainTask;
    const selectedSkill = game.activeSkillId || 'basic';
    const potential = format(dtn);
    const critical = Number(crit ?? nroCharacter?.nroStats?.critical) || 0;
    const blueGems = Number(game.blueGems ?? nroCharacter.blueGems ?? character.blueGems ?? 0);
    const redGems = Number(nroCharacter.redGems ?? character.redGems ?? 0);
    return <div className="nro-inventory-overlay" aria-label="Bảng nhân vật">
        <section ref={panelRef} role="dialog" aria-labelledby="nro-inventory-title" className={`nro-inventory-panel ${closing ? 'is-closing' : ''}`}>
            <header className="nro-inventory-header">
                <NroSpritePreview race={nroCharacter.raceId} className="nro-source-warrior-inventory" />
                <div className="nro-inventory-header-main">
                    <div className="nro-inventory-identity-line">
                        <div className="nro-inventory-player"><strong id="nro-inventory-title">{nroCharacter.characterName || user.username}</strong><span>Lv.{level || 1} · {({ earth: 'Trái Đất', namek: 'Namek', saiyan: 'Xayda' })[nroCharacter.raceId] || 'Chiến binh'}</span></div>
                        <button type="button" onClick={() => { setClosing(true); window.clearTimeout(closeTimerRef.current); closeTimerRef.current = window.setTimeout(() => { setOpen(false); setClosing(false); }, 220); }} aria-label="Đóng bảng nhân vật" className="nro-inventory-close">×</button>
                    </div>
                    <div className="nro-inventory-bars">
                        <label>HP <span>{format(hp)}/{format(maxHp)}</span><i><b style={{ width: `${maxHp > 0 ? Math.max(0, Math.min(100, hp / maxHp * 100)) : 0}%` }} /></i></label>
                        <label>KI <span>{format(mp)}/{format(maxMp)}</span><i><b style={{ width: `${maxMp > 0 ? Math.max(0, Math.min(100, mp / maxMp * 100)) : 0}%` }} /></i></label>
                    </div>
                </div>
            </header>

            <div className="nro-inventory-stats" aria-label="Chỉ số nhân vật">
                <span>Sức đánh <b>{format(str ?? character?.nroStats?.damage)}</b></span>
                <span>Giáp <b>{format(armor ?? character?.nroStats?.defense)}</b></span>
                <span>Chí mạng <b>{format(critical)}%</b></span>
                <span>Tiềm năng <b>{potential}</b></span>
                <span>Năng động <b>{format(stamina)}/{format(maxStamina)}</b></span>
            </div>

            <nav className="nro-inventory-tabs" aria-label="Các mục nhân vật">
                {PANEL_TABS.map((tab) => <button key={tab} type="button" className={activeTab === tab ? 'active' : ''}
                    aria-pressed={activeTab === tab} onClick={() => {
                        setActiveTab(tab); setMessage('');
                        if (tab === 'Bang hội') {
                            setGuildState((state) => ({ ...state, loading: true }));
                            networkInstance.getSocket()?.emit('guildRequestState');
                        }
                    }}>{tab}</button>)}
            </nav>

            <main className="nro-inventory-content">
                {activeTab === 'Nhiệm vụ' && <section className="nro-panel-task">
                    {taskInfo ? <>
                        <h3>{taskInfo.title || 'Nhiệm vụ hiện tại'}</h3>
                        <p>{taskInfo.objective || taskInfo.description || 'Đang theo dõi nhiệm vụ.'}</p>
                        {taskInfo.targetMapName && <small>Khu vực: {taskInfo.targetMapName}</small>}
                        {Number(taskInfo.target) > 0 && <>
                            <div className="nro-panel-task-progress"><span>Tiến độ</span><b>{format(taskInfo.progress)} / {format(taskInfo.target)}</b></div>
                            <i className="nro-panel-progress-track"><b style={{ width: `${Math.max(0, Math.min(100, Number(taskInfo.progress || 0) / Number(taskInfo.target) * 100))}%` }} /></i>
                        </>}
                        {taskInfo.status === 'ready_to_report' && <strong className="nro-panel-task-ready">Đã xong mục tiêu · Hãy đến NPC báo cáo.</strong>}
                    </> : <p className="nro-panel-empty">Chưa có nhiệm vụ đang theo dõi.</p>}
                    <div className="nro-panel-player-summary">
                        <span>Sức mạnh <b>{format(game.power)}</b></span><span>Tiềm năng <b>{potential}</b></span>
                    </div>
                </section>}

                {activeTab === 'Hành trang' && <>
                    <div className="nro-bag-capacity">Hành trang <b>{bagGroups.length}/{nroCharacter.bagCapacity || 20}</b></div>
                    <div className="nro-item-list">
                        {bagGroups.map((group) => {
                            const { item, index, quantity } = group;
                            return <article key={group.key} tabIndex={0} role="button"
                                aria-label={`${item.name}, số lượng ${quantity}`}
                                onClick={() => { setSelectedBagIndex(index); setDetailSkillId(null); }}
                                onKeyDown={(event) => {
                                    if (event.target !== event.currentTarget) return;
                                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedBagIndex(index); setDetailSkillId(null); }
                                }}
                                className={`nro-item-row ${selectedBagIndex === index ? 'selected' : ''}`}>
                                <span className="nro-item-icon-wrap"><img src={getNroItemIcon(item.id)} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = itemIconFallback(item); }} alt="" />
                                    {quantity > 1 && <b className="nro-item-quantity">×{format(quantity)}</b>}</span>
                                <div className="nro-item-copy"><p>{item.name}</p><small>{item.description}</small></div>
                            </article>;
                        })}
                        {bagGroups.length === 0 && <p className="nro-panel-empty">Hành trang chưa có vật phẩm.</p>}
                    </div>
                    {selectedBagGroup && (() => {
                        const { item, slot, index, quantity } = selectedBagGroup;
                        const equippable = item.type >= 0 && item.type <= 4;
                        const consumable = item.type === 6 || item.type === 22 || [74, 2144, 379, 381, 382, 383, 384].includes(item.id);
                        const skillBook = item.type === 7;
                        const raceId = nroCharacter.raceId || 'earth';
                        const supportedSkillBook = skillBook && (SKILL_BOOK_RANGES[raceId] || []).some(([min, max]) => item.id >= min && item.id <= max);
                        return <div className="nro-detail-backdrop" onClick={() => setSelectedBagIndex(-1)}><section className="nro-item-detail nro-detail-popup" aria-label={`Thông tin ${item.name}`} onClick={(event) => event.stopPropagation()}>
                            <div className="nro-item-detail-heading">
                                <img src={getNroItemIcon(item.id)} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = itemIconFallback(item); }} alt="" />
                                <div><strong>{item.name}</strong><small>Số lượng: {format(quantity)} · {item.type >= 0 && item.type <= 4 ? 'Trang bị' : skillBook ? 'Sách kỹ năng' : 'Vật phẩm'}</small></div>
                            </div>
                            <p>{item.description || 'Vật phẩm trong hành trang.'}</p>
                            {Number(item.powerRequired) > 0 && <small className="nro-item-requirement">Yêu cầu sức mạnh: {format(item.powerRequired)}</small>}
                            {(slot.options || []).length > 0 && <div className="nro-item-detail-stats"><strong>Chỉ số / tác dụng</strong>
                                {(slot.options || []).map((option, optionIndex) => <span key={optionIndex}>{formatOption(option, optionById)}</span>)}
                            </div>}
                            <div className="nro-item-detail-actions">
                                {equippable && <button type="button" onClick={() => act('equipNroItem', index)}>Mặc</button>}
                                {consumable && <button type="button" onClick={() => act('useNroItem', index)}>Sử dụng</button>}
                                {supportedSkillBook && <button type="button" onClick={() => act('learnNroSkill', index)}>Học</button>}
                                {!([8, 9, 10].includes(Number(item.type)) || Number(item.id) === 73) && <button type="button" className="nro-discard-item" onClick={() => act('discardNroItem', index)}>Bỏ ra</button>}
                                {skillBook && !supportedSkillBook && <small className="nro-not-supported">Sách này không dành cho hành tinh hiện tại.</small>}
                            </div>
                        </section></div>;
                    })()}
                </>}

                {activeTab === 'Trang bị' && <div className="nro-equipment-list">
                    {EQUIPMENT_TYPES.map((name, index) => {
                        const slot = equipment[index];
                        const item = slot && itemById.get(Number(slot.templateId));
                        const options = slot?.options || [];
                        const enhancement = Number(slot?.upgradeLevel ?? options.find((option) => Number(option.optionId) === 72)?.param ?? 0);
                        const starOption = options.find((option) => Number(option.optionId) === 107);
                        const stars = Math.max(0, Math.min(7, Number(starOption?.param ?? slot?.stars ?? slot?.star) || 0));
                        return <button type="button" key={name} className={`nro-equipment-row ${selectedEquipmentIndex === index ? 'selected' : ''}`}
                            onClick={() => setSelectedEquipmentIndex(index)}>
                            <img src={item ? getNroItemIcon(item.id) : itemIconFallback({ type: index + 1 })}
                                onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = itemIconFallback(item || { type: index + 1 }); }} alt="" />
                            <span className="nro-equipment-copy"><small>{name}</small><strong>{item ? `${item.name}${enhancement ? ` [+${enhancement}]` : ''}` : 'Chưa trang bị'}</strong>
                                {options.length > 0 && <small className="nro-equipment-bonus">{options.filter((option) => Number(option.optionId) !== 107).slice(0, 2).map((option) => formatOption(option, optionById)).join(' · ')}</small>}
                            </span>
                            <span className="nro-equipment-stars" aria-label={`${stars} sao`}>{stars ? '★'.repeat(stars) : '☆'}</span>
                        </button>;
                    })}
                    {selectedEquipmentIndex >= 0 && equipment[selectedEquipmentIndex] && <div className="nro-equipment-detail">
                        {(equipment[selectedEquipmentIndex].options || []).map((option, index) => <span key={index}>{formatOption(option, optionById)}</span>)}
                    </div>}
                </div>}

                {activeTab === 'Kỹ năng' && <>
                    <div className="nro-skill-list">
                    {TRAINING_STATS.map(([label, statType, key]) => {
                        const value = Number(nroCharacter.nroStats?.[key] ?? (key === 'hp' ? maxHp : key === 'mp' ? maxMp : key === 'damage' ? str : key === 'defense' ? armor : critical)) || 0;
                        const cost = getTrainingCost(statType, 1, value);
                        const delta = statType <= 1 ? 20 : 1;
                        const canAfford = BigInt(Math.max(0, Math.floor(Number(dtn) || 0))) >= cost;
                        return <button type="button" key={key} className="nro-skill-row nro-stat-training-row"
                            disabled={!canAfford} title={`Cần ${cost.toLocaleString('vi-VN')} tiềm năng để tăng ${delta}`}
                            onClick={() => networkInstance.getSocket()?.emit('trainNroStat', { statType, points: 1 })}>
                            <StatIcon stat={key} />
                            <span className="nro-skill-row-copy"><strong className={`nro-stat-name nro-stat-name--${key}`}>{label} gốc: {format(value)}{key === 'critical' ? '%' : ''}</strong>
                                <small>{cost.toLocaleString('vi-VN')} tiềm năng: tăng {delta}</small></span>
                        </button>;
                    })}
                    {Object.entries(skillConfig || {}).map(([skillId, skill]) => {
                        const rank = Number(skillLevels?.[skillId]) || 0;
                        const maxLevel = Number(skill.maxLevel) || 7;
                        const maxed = rank >= maxLevel;
                        return <button type="button" key={skillId} className={`nro-skill-row nro-known-skill-row ${selectedSkill === skillId ? 'selected' : ''}`}
                            aria-pressed={selectedSkill === skillId} onClick={() => { dispatch(setActiveSkill(skillId)); setDetailSkillId(skillId); setSelectedBagIndex(-1); }}>
                            <img src={getNroSkillIcon(skill, nroCharacter.raceId) || skill.icon} alt="" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = itemIconFallback({ type: skillId.slice(-1) }); }} />
                            <span className="nro-skill-row-copy"><strong className="nro-learned-skill-name"><span>{skill.name}</span><small>Cấp: {rank || 1}</small></strong>
                                <small>{skill.unlocked === false ? 'Chưa mở khóa' : maxed ? 'Đã đạt cấp tối đa' : 'Tiếp tục chiến đấu để tăng cấp'}</small></span>
                        </button>;
                    })}
                    {!Object.keys(skillConfig || {}).length && <p className="nro-panel-empty">Đang tải kỹ năng nhân vật.</p>}
                    </div>
                    {detailSkillId && skillConfig?.[detailSkillId] && (() => {
                        const skill = skillConfig[detailSkillId];
                        const rank = Number(skillLevels?.[detailSkillId]) || 1;
                        return <div className="nro-detail-backdrop" onClick={() => setDetailSkillId(null)}><section className="nro-item-detail nro-detail-popup" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                            <div className="nro-item-detail-heading"><img src={getNroSkillIcon(skill, nroCharacter.raceId) || skill.icon} alt="" /><div><strong>{skill.name}</strong><small>Kỹ năng · Cấp {rank}/{skill.maxLevel || 7}</small></div></div>
                            <p>{skill.description || skill.effect || 'Kỹ năng chiến đấu của nhân vật.'}</p>
                            <div className="nro-item-detail-stats"><strong>Thông tin kỹ năng</strong><span>Sát thương: {skill.damagePercent ?? skill.damage ?? 'Theo sức đánh'}</span><span>Tiêu hao KI: {format(skill.mpCost || 0)}</span><span>Hồi chiêu: {((skill.cooldownMs || skill.cooldown || 0) / 1000).toFixed(1)} giây</span></div>
                            <div className="nro-item-detail-actions"><button type="button" onClick={() => { dispatch(setActiveSkill(detailSkillId)); setDetailSkillId(null); }}>Chọn kỹ năng</button><button type="button" onClick={() => setDetailSkillId(null)}>Đóng</button></div>
                        </section></div>;
                    })()}
                </>}

                {activeTab === 'Bang hội' && <section className="nro-guild-panel">
                    <h3>Bang hội</h3>
                    {guildState.loading && <p className="nro-panel-empty">Đang tải dữ liệu bang hội…</p>}
                    {(guildState.invitations || []).length > 0 && <>
                        <h4>Lời mời đang chờ</h4>
                        <div className="nro-guild-list nro-guild-invitations">
                            {guildState.invitations.map((invitation) => <article key={invitation.id}>
                                <div>
                                    <strong>{invitation.guildName}</strong>
                                    <small>Bang chủ {invitation.inviterUsername}</small>
                                </div>
                                <span className="nro-guild-member-actions">
                                    <button type="button" onClick={() => networkInstance.getSocket()?.emit('guildInviteRespond', { invitationId: invitation.id, accept: true })}>Tham gia</button>
                                    <button type="button" onClick={() => networkInstance.getSocket()?.emit('guildInviteRespond', { invitationId: invitation.id, accept: false })}>Từ chối</button>
                                </span>
                            </article>)}
                        </div>
                    </>}
                    {guildState.guild && <>
                        <div className="nro-guild-card">
                            <strong>{guildState.guild.name}</strong>
                            <span>Cấp {guildState.guild.level} · {guildState.guild.memberCount}/{guildState.guild.maxMembers} thành viên</span>
                            {guildState.guild.description && <small>{guildState.guild.description}</small>}
                        </div>
                        <h4>Thành viên</h4>
                        <div className="nro-guild-members">{guildState.guild.members.map((member) => <div key={member.userId}>
                            <span>{member.username}</span><b>{member.role === 'leader' ? 'Bang chủ' : 'Thành viên'}</b>
                            {guildState.guild.isLeader && !member.isSelf && <span className="nro-guild-member-actions">
                                <button type="button" title="Chuyển quyền bang chủ" onClick={() => networkInstance.getSocket()?.emit('guildTransferLeadership', { targetUserId: member.userId })}>Phong chủ</button>
                                <button type="button" title="Trục xuất thành viên" onClick={() => networkInstance.getSocket()?.emit('guildKickMember', { targetUserId: member.userId })}>Mời ra</button>
                            </span>}
                        </div>)}</div>
                        {guildState.guild.isLeader && <form className="nro-guild-create" onSubmit={(event) => {
                            event.preventDefault();
                            networkInstance.getSocket()?.emit('guildUpdateDescription', { description: guildDescription });
                        }}>
                            <label>Giới thiệu bang <input value={guildDescription} maxLength={120} onChange={(event) => setGuildDescription(event.target.value)} /></label>
                            <button type="submit" className="nro-guild-action">Lưu giới thiệu</button>
                        </form>}
                        {guildState.guild.isLeader && <form className="nro-guild-create" onSubmit={(event) => {
                            event.preventDefault();
                            const targetUsername = guildInviteUsername.trim();
                            if (!targetUsername) return;
                            networkInstance.getSocket()?.emit('guildInviteSend', { targetUsername });
                            setGuildInviteUsername('');
                        }}>
                            <label>Mời người chơi <input value={guildInviteUsername} maxLength={30} minLength={3} required onChange={(event) => setGuildInviteUsername(event.target.value)} placeholder="Tên tài khoản" /></label>
                            <button type="submit" className="nro-guild-action">Gửi lời mời</button>
                        </form>}
                        <h4>Chat bang</h4>
                        <div className="nro-guild-chat" aria-live="polite">{guildChat.map((entry, index) => <p key={`${entry.sentAt}-${index}`}><b>{entry.username}:</b> {entry.text}</p>)}</div>
                        <form className="nro-guild-chat-form" onSubmit={(event) => {
                            event.preventDefault();
                            const text = guildChatDraft.trim();
                            if (!text) return;
                            networkInstance.getSocket()?.emit('guildChatSend', { text });
                            setGuildChatDraft('');
                        }}>
                            <input aria-label="Tin nhắn bang hội" maxLength={240} value={guildChatDraft} onChange={(event) => setGuildChatDraft(event.target.value)} placeholder="Nhắn với bang…" />
                            <button type="submit">Gửi</button>
                        </form>
                        <button type="button" className="nro-guild-action" onClick={() => networkInstance.getSocket()?.emit('guildLeave')}>Rời / giải tán bang</button>
                    </>}
                    {!guildState.loading && !guildState.guild && <>
                        <p className="nro-panel-empty">{guildState.message || 'Bạn chưa thuộc bang hội nào.'}</p>
                        <form className="nro-guild-create" onSubmit={(event) => {
                            event.preventDefault();
                            networkInstance.getSocket()?.emit('guildCreate', { name: guildName, description: guildDescription });
                        }}>
                            <label>Tên bang <input value={guildName} maxLength={20} minLength={3} required onChange={(event) => setGuildName(event.target.value)} /></label>
                            <label>Giới thiệu <input value={guildDescription} maxLength={120} onChange={(event) => setGuildDescription(event.target.value)} /></label>
                            <button type="submit" className="nro-guild-action">Lập bang</button>
                        </form>
                        <h4>Bang đang tuyển thành viên</h4>
                        <div className="nro-guild-list">{(guildState.guilds || []).map((guild) => <article key={guild.id}>
                            <div><strong>{guild.name}</strong><small>Cấp {guild.level} · {guild.memberCount}/{guild.maxMembers}</small></div>
                            <button type="button" disabled={guild.memberCount >= guild.maxMembers} onClick={() => networkInstance.getSocket()?.emit('guildJoin', { guildId: guild.id })}>Xin vào</button>
                        </article>)}</div>
                    </>}
                </section>}

                {activeTab === 'Chức năng' && <div className="nro-inventory-functions">
                    <button type="button" onClick={() => window.dispatchEvent(new Event('game:nro-training-show'))}>Nâng tiềm năng và chỉ số</button>
                    <label><input type="checkbox" checked={showChat} onChange={(event) => {
                        setShowChat(event.target.checked);
                        localStorage.setItem('nro:chat-preview', String(event.target.checked));
                        window.dispatchEvent(new CustomEvent('game:nro-chat-preview', { detail: event.target.checked }));
                    }} /> Hiện tin nhắn chat trên màn hình</label>
                    <button type="button" onClick={async () => {
                        try {
                            if (document.fullscreenElement) await document.exitFullscreen();
                            else await (document.querySelector('.nro-game-frame') || document.documentElement).requestFullscreen();
                        } catch { setMessage('Thiết bị chưa hỗ trợ toàn màn hình.'); }
                    }}>Bật / tắt toàn màn hình</button>
                    <button type="button" onClick={() => { networkInstance.logout(); dispatch(logoutUser()); }}>Đăng xuất</button>
                </div>}
            </main>

            <footer className="nro-inventory-footer" aria-label="Tài nguyên">
                <span><i className="nro-currency-icon gold" />{format(gold)}</span>
                <span><i className="nro-currency-icon blue-gem" />{format(blueGems)}</span>
                <span><i className="nro-currency-icon red-gem" />{format(redGems)}</span>
                <span className="nro-footer-potential">TN {potential}</span>
            </footer>
            {message && <p role="status" className="nro-inventory-message">{message}</p>}
        </section>
    </div>;
}

