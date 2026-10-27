import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '../../store/gameSlice';
import networkInstance from '../../game/network';
import NroSpritePreview from '../auth/NroSpritePreview';
import NroTaskPanel from './NroTaskPanel';
import NroFlagMenu from './NroFlagMenu';
import { toStatusEffectBadges } from './nroStatusEffects';

const format = (value) => Number(value || 0).toLocaleString('vi-VN');
const percent = (value, max) => max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : 0;

/** Compact game chrome; detailed stats stay in the character menu. */
export default function NroClassicChrome({ mapName, zoneId }) {
    const dispatch = useDispatch();
    const game = useSelector((state) => state.game);
    const { hp, maxHp, mp, maxMp, selectedTarget, character, user, power, dtn, gold, level, playerPos, str, armor, crit, damageReductionPercent, reflectDamagePercent } = game;
    const [focus, setFocus] = useState(null);
    const [panel, setPanel] = useState(null);
    const [fullscreenError, setFullscreenError] = useState('');
    const [task, setTask] = useState(null);
    const [effects, setEffects] = useState([]);
    const [nearby, setNearby] = useState({ players: [], bosses: [] });
    const [flag, setFlag] = useState(character?.nroCharacter?.cFlag || 0);
    const [showChat, setShowChat] = useState(() => localStorage.getItem('nro:chat-preview') !== 'false');
    const ownName = character?.nroCharacter?.characterName || user.username || 'Chiến binh';
    const target = selectedTarget || focus;

    useEffect(() => {
        const onFocus = (event) => setFocus(event.detail || null);
        const resetFocus = () => setFocus(null);
        const onTask = (event) => setTask(event.detail || null);
        const onEffects = (event) => setEffects(event.detail || []);
        const onNearby = (event) => setNearby(event.detail || { players: [], bosses: [] });
        const onFlag = (event) => { if (event.detail?.flag !== undefined) setFlag(event.detail.flag); };
        const close = () => setPanel(null);
        const keydown = (event) => { if (event.code === 'Escape') close(); };
        window.addEventListener('game:nro-focus', onFocus);
        window.addEventListener('game:nro-task-update', onTask);
        window.addEventListener('game:nro-player-effects', onEffects);
        window.addEventListener('game:nro-nearby-entities', onNearby);
        window.addEventListener('game:nro-flag-result', onFlag);
        window.addEventListener('game:nro-panels-close', close);
        window.addEventListener('game:nro-map-changed', resetFocus);
        window.addEventListener('keydown', keydown);
        return () => {
            window.removeEventListener('game:nro-focus', onFocus);
            window.removeEventListener('game:nro-task-update', onTask);
            window.removeEventListener('game:nro-player-effects', onEffects);
            window.removeEventListener('game:nro-nearby-entities', onNearby);
            window.removeEventListener('game:nro-flag-result', onFlag);
            window.removeEventListener('game:nro-panels-close', close);
            window.removeEventListener('game:nro-map-changed', resetFocus);
            window.removeEventListener('keydown', keydown);
        };
    }, []);

    const openCharacterPanel = () => {
        window.dispatchEvent(new Event('game:nro-inventory-toggle'));
    };

    const toggleChatPreview = (checked) => {
        setShowChat(checked);
        localStorage.setItem('nro:chat-preview', String(checked));
        window.dispatchEvent(new CustomEvent('game:nro-chat-preview', { detail: checked }));
    };

    const toggleFullscreen = async () => {
        setFullscreenError('');
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await (document.querySelector('.nro-game-frame') || document.documentElement).requestFullscreen();
        } catch { setFullscreenError('Thiết bị chưa hỗ trợ chế độ toàn màn hình.'); }
    };

    return <>
        <section className="classic-status" aria-label="Mục tiêu và sinh lực nhân vật">
            <button type="button" className="classic-focus-card" onClick={() => setPanel('Thông tin')}
                onPointerDown={(event) => event.preventDefault()}
                title={target ? `Mục tiêu: ${target.name}` : 'Thông tin nhân vật'}>
                <NroSpritePreview race={character?.nroCharacter?.raceId} className="classic-status-avatar" />
                <span className="classic-focus-copy"><strong>{target?.name || ownName}</strong>
                    <span>{target ? (Number.isFinite(target.hp) ? `${format(target.hp)} HP` : target.label || 'Đang chọn') : `Lv.${level} · SM ${format(power)}`}</span></span>
            </button>
            <div className="classic-vitals">
                <div className="classic-meter hp" role="progressbar" aria-label="HP của bạn" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={maxHp}
                    title={`HP: ${format(hp)} / ${format(maxHp)}`}>
                    <span style={{ width: `${percent(hp, maxHp)}%` }} /><small>HP</small><strong>{format(hp)} / {format(maxHp)}</strong>
                </div>
                <div className="classic-meter ki" role="progressbar" aria-label="KI của bạn" aria-valuenow={mp} aria-valuemin={0} aria-valuemax={maxMp}
                    title={`KI: ${format(mp)} / ${format(maxMp)}`}>
                    <span style={{ width: `${percent(mp, maxMp)}%` }} /><small>KI</small><strong>{format(mp)} / {format(maxMp)}</strong>
                </div>
            </div>
        </section>

        <button className={`classic-menu-toggle ${panel ? 'is-open' : ''}`} type="button"
            aria-label="Mở bảng nhân vật" title="Mở bảng nhân vật"
            onPointerDown={(event) => event.preventDefault()}
            onClick={openCharacterPanel}><span aria-hidden="true" /></button>

        <div className="classic-map-hud">
            <span className="classic-map-caption">{mapName} · Khu {zoneId}<small>X: {Math.round(playerPos?.x || 0)} · Y: {Math.round(playerPos?.y || 0)}</small></span>
            <section className="classic-entity-list" aria-label="Người chơi và boss trong khu vực">
                {nearby.bosses.map((entity) => <div className="classic-entity-row boss" key={`boss-${entity.id}`}>
                    <strong>{entity.name}</strong><span>Lv.{entity.level || 1}</span>
                    <i><b style={{ width: `${percent(entity.hp, entity.maxHp)}%` }} /></i><small>{format(entity.hp)} / {format(entity.maxHp)} HP</small>
                </div>)}
                {nearby.players.map((entity) => <div className="classic-entity-row player" key={`player-${entity.id}`}>
                    <strong>{entity.name}</strong><span>Lv.{entity.level || 1}</span>
                    <i><b style={{ width: `${percent(entity.hp, entity.maxHp)}%` }} /></i><small>{format(entity.hp)} / {format(entity.maxHp)} HP</small>
                </div>)}
                {!nearby.players.length && !nearby.bosses.length && <p>Chưa có người chơi hoặc boss trong khu vực</p>}
            </section>
        </div>
        {panel && <div className="classic-sheet-backdrop" onClick={() => setPanel(null)}>
            <section className="classic-sheet" role="dialog" aria-modal="true" aria-labelledby="classic-sheet-title" onClick={(event) => event.stopPropagation()}>
                <header><h2 id="classic-sheet-title">{panel}</h2><button type="button" aria-label={`Đóng ${panel}`} onClick={() => setPanel(null)}>×</button></header>
                {panel === 'Thông tin' ? <>
                    <div className="classic-character-identity"><NroSpritePreview race={character?.nroCharacter?.raceId} /><div><strong>{ownName}</strong><span>Cấp {level} · {({ earth: 'Trái Đất', namek: 'Namek', saiyan: 'Xayda' })[character?.nroCharacter?.raceId] || 'Chiến binh'}</span></div></div>
                    <dl className="classic-stat-list">
                        {[
                            ['HP', `${format(hp)} / ${format(maxHp)}`], ['KI', `${format(mp)} / ${format(maxMp)}`],
                            ['Sức mạnh', format(power)], ['Tiềm năng', format(dtn)], ['Vàng', format(gold)],
                            ['Sức đánh', format(str ?? character?.str)], ['Chí mạng', `${format(crit ?? character?.nroCharacter?.nroStats?.critical)}%`],
                            ['Giáp', format(armor ?? character?.armor)],
                            ['Giảm sát thương', `${format(damageReductionPercent ?? character?.nroCharacter?.nroDamageReductionPercent)}%`],
                            ['Phản sát thương', `${format(reflectDamagePercent ?? character?.nroCharacter?.nroReflectDamagePercent)}%`]
                        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                    </dl>
                    <div className="classic-info-extras"><NroFlagMenu initialFlag={flag} /><span>Cờ phe</span></div>
                    {effects.length > 0 && <div className="classic-effect-list">{toStatusEffectBadges(effects).map((effect) =>
                        <span key={effect.key} title={effect.debuff ? 'Hiệu ứng bất lợi' : 'Hiệu ứng đang hoạt động'}>{effect.label} · {effect.seconds}s</span>)}</div>}
                    <NroTaskPanel task={task} />
                </> : <div className="classic-settings">
                    <label><input type="checkbox" checked={showChat} onChange={(event) => toggleChatPreview(event.target.checked)} /> Hiện thông báo chat trên màn hình</label>
                    <button type="button" onClick={toggleFullscreen}>Bật / tắt toàn màn hình</button>
                    <button type="button" onClick={() => { networkInstance.logout(); dispatch(logoutUser()); }}>Đăng xuất</button>
                    {fullscreenError && <p role="status">{fullscreenError}</p>}
                    <p>↑: nhảy · nhấn đôi ↑: bay<br />1–5: chọn chiêu · Space / Enter: đánh<br />0: chọn đấm thường</p>
                </div>}
            </section>
        </div>}
    </>;
}

