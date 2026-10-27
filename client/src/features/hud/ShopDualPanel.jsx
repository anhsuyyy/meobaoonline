import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import networkInstance from '../../game/network';
import NroSpritePreview from '../auth/NroSpritePreview';
import { getNroItemIcon } from './nroItemIcon';
import { setNroBag, updateStats } from '../../store/gameSlice';

const EQUIPMENT_SLOTS = ['Áo', 'Quần', 'Găng', 'Giày', 'Rada', 'Cải trang', 'Pet'];
const format = (value) => (Number(value) || 0).toLocaleString('vi-VN');

export default function ShopDualPanel({ onClose }) {
    const dispatch = useDispatch();
    const game = useSelector((state) => state.game);
    const { gold, blueGems, dtn, power, character, user } = game;
    const [catalog, setCatalog] = useState(null);
    const [activeTab, setActiveTab] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [npcId, setNpcId] = useState(null);
    const [templates, setTemplates] = useState([]);
    const [optionTemplates, setOptionTemplates] = useState([]);
    const requestSequence = useRef(0);
    const bag = character?.nroCharacter?.bag || [];
    const equipment = character?.nroCharacter?.equipment || {};
    const nroCharacter = character?.nroCharacter || {};
    const race = nroCharacter.raceId || 'earth';
    const limitPower = Number(nroCharacter.limitPower ?? character?.limitPower) || 0;
    const factionProgress = limitPower > 0 ? Math.min(100, (Number(power) || 0) / limitPower * 100) : 0;
    const ownedCount = bag.reduce((total, item) => total + (Number(item.quantity) || 1), 0);
    const items = useMemo(() => catalog?.items?.filter((entry) => entry.tabId === activeTab) || [], [catalog, activeTab]);

    useEffect(() => {
        fetch('/assets/nro/map/data/item-templates.json')
            .then((response) => response.ok ? response.json() : [])
            .then(setTemplates)
            .catch(() => setTemplates([]));
        fetch('/assets/nro/map/data/item-options.json')
            .then((response) => response.ok ? response.json() : [])
            .then(setOptionTemplates)
            .catch(() => setOptionTemplates([]));
    }, []);

    useEffect(() => {
        const openShop = (event) => {
            const socket = networkInstance.getSocket();
            setNpcId(event.detail?.npcId ?? null);
            setCatalog(null);
            setLoading(true);
            setMessage('');
            if (!socket?.connected) {
                setLoading(false);
                setMessage('Mất kết nối máy chủ.');
                return;
            }
            socket.emit('openNroShop', { npcId: event.detail?.npcId });
        };
        const receiveCatalog = (event) => {
            setLoading(false);
            if (!event.detail?.ok) {
                setMessage(event.detail?.message || 'Không mở được cửa hàng.');
                return;
            }
            setCatalog(event.detail);
            setActiveTab(event.detail.tabs?.[0]?.id ?? null);
            dispatch(setNroBag(event.detail.bag || []));
        };
        const receivePurchase = (event) => {
            const result = event.detail || {};
            setMessage(result.message || 'Giao dịch không thành công.');
            if (!result.ok) return;
            dispatch(setNroBag(result.bag || []));
            dispatch(updateStats({ gold: result.gold }));
            setCatalog((current) => current ? ({ ...current, bag: result.bag, bagCapacity: result.bagCapacity }) : current);
        };
        const closeShop = () => { setCatalog(null); setLoading(false); setMessage(''); onClose?.(); };
        const onKeyDown = (event) => { if (event.key === 'Escape') closeShop(); };
        window.addEventListener('game:nro-open-shop', openShop);
        window.addEventListener('game:nro-shop-catalog', receiveCatalog);
        window.addEventListener('game:nro-shop-transaction', receivePurchase);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('game:nro-open-shop', openShop);
            window.removeEventListener('game:nro-shop-catalog', receiveCatalog);
            window.removeEventListener('game:nro-shop-transaction', receivePurchase);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [dispatch, onClose]);

    if (!catalog && !loading && !message) return null;

    const close = () => { setCatalog(null); setLoading(false); setMessage(''); onClose?.(); };
    const buy = (entry) => {
        const socket = networkInstance.getSocket();
        const requestId = globalThis.crypto?.randomUUID?.() || `${socket?.id || 'shop'}-${++requestSequence.current}`;
        socket?.emit('buyNroShopItem', { npcId: catalog.npcId, entryId: entry.id, requestId });
    };
    const ownedItemName = (slot) => templates.find((item) => Number(item.id) === Number(slot?.templateId))?.name || `Vật phẩm #${slot?.templateId}`;
    const ownedItemStats = (slot) => (slot?.options || []).slice(0, 2).map((option) => {
        const template = optionTemplates.find((entry) => Number(entry.id) === Number(option.optionId));
        const parameter = format(option.param ?? option.parameter);
        return template?.name?.replace('#', parameter) || (option.optionId ? `Thuộc tính ${option.optionId}: ${parameter}` : '');
    }).filter(Boolean).join(' · ');

    return <div className="shop-dual-overlay" role="presentation">
        <aside className="shop-dual-panel shop-dual-left" role="dialog" aria-modal="false" aria-labelledby="shop-dual-title">
            <header className="shop-dual-npc-header">
                <img src={`/assets/nro/npc/generated/${npcId ?? 0}.svg`} alt="" onError={(event) => {
                    if (event.currentTarget.dataset.fallback) return;
                    event.currentTarget.dataset.fallback = 'true';
                    event.currentTarget.src = '/assets/nro/npc/portraits/santa/dung.png';
                }} />
                <div><strong id="shop-dual-title">{catalog?.npcName || 'Người bán hàng'}</strong><span>Xin chào! Cậu muốn mua gì?</span></div>
            </header>
            <nav className="shop-dual-tabs" aria-label="Danh mục cửa hàng">
                {(catalog?.tabs || []).map((tab) => <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''}
                    aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>{tab.name.replaceAll('<>', ' ')}</button>)}
                <span className="shop-owned-tab">Sở hữu {ownedCount}</span>
            </nav>
            <main className="shop-dual-list" aria-live="polite">
                {loading && <p className="shop-dual-empty">Đang tải hàng hóa…</p>}
                {!loading && !catalog && message && <p className="shop-dual-message" role="status">{message}</p>}
                {catalog && items.map((entry) => {
                    const item = entry.item;
                    const canStack = bag.some((slot) => Number(slot.templateId) === Number(item.id) && item.stackable);
                    const disabled = entry.gem > 0 || entry.exchangeTemplateId >= 0 || entry.gold > gold
                        || (!canStack && bag.length >= (catalog.bagCapacity || 20));
                    return <article className="shop-dual-row" key={entry.id}>
                        <img src={getNroItemIcon(item.id)} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
                        <div className="shop-dual-copy"><strong>{item.name}</strong>
                            <span>{entry.expiryDays ? `Hạn sử dụng ${entry.expiryDays} ngày` : item.description || 'Vật phẩm cửa hàng'}</span>
                            {entry.options?.slice(0, 2).map((option) => option.template && <small key={`${option.id}-${option.optionId}`}>{option.template.name.replace('#', option.parameter)}</small>)}
                            <small className="shop-dual-power">Yêu cầu {format(item.powerRequired)} sức mạnh</small>
                        </div>
                        <div className="shop-dual-price"><b>{format(entry.gold || entry.gem)} <i className={`nro-currency-icon ${entry.gem > 0 ? 'blue-gem' : 'gold'}`} /></b>
                            <button type="button" disabled={disabled} onClick={() => buy(entry)}>Mua</button>
                        </div>
                    </article>;
                })}
                {catalog && !items.length && <p className="shop-dual-empty">Danh mục này đang trống.</p>}
                {catalog && message && <p className="shop-dual-message" role="status">{message}</p>}
            </main>
            <CurrencyFooter gold={gold} blueGems={blueGems} redGems={nroCharacter.redGems ?? character?.redGems ?? 0} />
        </aside>

        <button type="button" className="shop-dual-center" aria-label="Đóng cửa hàng khi bấm vào vùng giữa" onClick={close} />
        <button type="button" className="shop-dual-close" aria-label="Đóng cửa hàng" onClick={close}>×</button>

        <aside className="shop-dual-panel shop-dual-right" role="complementary" aria-label="Hành trang và trang bị">
            <header className="shop-dual-player-header">
                <NroSpritePreview race={race} />
                <div className="shop-dual-player-copy"><strong>{nroCharacter.characterName || user.username || 'Chiến binh'}</strong>
                <span>Thế lực <i><b style={{ width: `${factionProgress}%` }} /></i></span>
                    <small>Sức mạnh: {format(power || character?.power || dtn)}</small></div>
            </header>
            <h2 className="shop-dual-section-title">Trang bị</h2>
            <main className="shop-dual-equipment-list">
                {EQUIPMENT_SLOTS.map((slotName, index) => {
                    const slot = equipment[index] || equipment[String(index)];
                    if (!slot) return null;
                    return <article className="shop-dual-equipment-row" key={slotName}>
                        <img src={getNroItemIcon(slot.templateId)} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
                        <div><strong>{ownedItemName(slot)}</strong><span>{ownedItemStats(slot) || slotName}</span></div>
                        {Number(slot.quantity) > 1 && <small>×{slot.quantity}</small>}
                    </article>;
                })}
                {!Object.keys(equipment).length && bag.slice(0, 30).map((slot, index) => <article className="shop-dual-equipment-row" key={`${slot.templateId}-${index}`}>
                    <img src={getNroItemIcon(slot.templateId)} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
                    <div><strong>{ownedItemName(slot)}</strong><span>Trong hành trang</span></div>
                    <small>×{slot.quantity || 1}</small>
                </article>)}
                {!Object.keys(equipment).length && !bag.length && <p className="shop-dual-empty">Chưa có trang bị.</p>}
            </main>
            <CurrencyFooter gold={gold} blueGems={blueGems} redGems={nroCharacter.redGems ?? character?.redGems ?? 0} />
        </aside>
    </div>;
}

function CurrencyFooter({ gold, blueGems, redGems }) {
    return <footer className="shop-dual-currency" aria-label="Tiền tệ">
        <span><i className="nro-currency-icon gold" />{format(gold)}</span>
        <span><i className="nro-currency-icon blue-gem" />{format(blueGems)}</span>
        <span><i className="nro-currency-icon red-gem" />{format(redGems)}</span>
    </footer>;
}
