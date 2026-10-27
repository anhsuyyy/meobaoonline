import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import networkInstance from '../../game/network';
import { logoutUser, setNroCharacter } from '../../store/gameSlice';
import NroSceneBackdrop from './NroSceneBackdrop';
import NroSpritePreview from './NroSpritePreview';

const PLANETS = [
    { id: 'earth', name: 'Trái Đất', caption: 'Rồng đất', detail: 'Làng Aru · Hành tinh xanh' },
    { id: 'namek', name: 'Namek', caption: 'Rồng xanh', detail: 'Làng Mori · Hành tinh Namek' },
    { id: 'saiyan', name: 'Xayda', caption: 'Rồng đỏ', detail: 'Làng Kakarot · Hành tinh Xayda' }
];

const NroCharacterCreationModal = () => {
    const dispatch = useDispatch();
    const nroCharacter = useSelector((state) => state.game.character?.nroCharacter);
    const [selectedRace, setSelectedRace] = useState('earth');
    const [characterName, setCharacterName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const handleCreated = (event) => {
            const character = event.detail;
            if (character?.created) dispatch(setNroCharacter(character));
        };
        const handleResult = (event) => {
            setSaving(false);
            if (!event.detail?.ok) setError(event.detail?.message || 'Không tạo được nhân vật.');
        };
        window.addEventListener('game:nro-character-created', handleCreated);
        window.addEventListener('game:nro-character-creation', handleResult);
        return () => {
            window.removeEventListener('game:nro-character-created', handleCreated);
            window.removeEventListener('game:nro-character-creation', handleResult);
        };
    }, [dispatch]);

    if (!nroCharacter || nroCharacter.created) return null;

    const createCharacter = () => {
        const socket = networkInstance.getSocket();
        if (!socket?.connected) {
            setError('Đang kết nối máy chủ. Chờ kết nối rồi thử lại.');
            return;
        }
        setSaving(true);
        setError('');
        socket.emit('createNroCharacter', { raceId: selectedRace, characterName: characterName.trim() });
    };

    return (
        <div className="nro-character-screen pointer-events-auto fixed inset-0 z-[70]">
            <NroSceneBackdrop
                backgroundId={({ earth: 0, namek: 0, saiyan: 1 })[selectedRace]}
                groundType={selectedRace === 'saiyan' ? 'desert' : 'grass'}
            />
            <section role="dialog" aria-modal="true" aria-labelledby="nro-create-title" className="nro-character-panel">
                <div className="nro-character-heading">
                    <span className="nro-server-label">Máy chủ 5 Sao</span>
                    <h1 id="nro-create-title">Tạo nhân vật</h1>
                    <label className="nro-name-field">
                        <span>Tên nhân vật</span>
                        <input
                            value={characterName}
                            onChange={(event) => { setCharacterName(event.target.value.slice(0, 16)); setError(''); }}
                            onKeyDown={(event) => { if (event.key === 'Enter' && !saving) createCharacter(); }}
                            placeholder="Tên nhân vật"
                            maxLength={16}
                            autoComplete="off"
                            aria-label="Tên nhân vật"
                        />
                    </label>
                    <p>Chọn hành tinh khởi đầu · không thể đổi sau khi tạo</p>
                </div>

                <div className="nro-planet-grid">
                    {PLANETS.map((planet) => {
                        const active = selectedRace === planet.id;
                        return (
                            <button
                                key={planet.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => { setSelectedRace(planet.id); setError(''); }}
                                className={`nro-planet-choice ${active ? 'selected' : ''}`}
                            >
                                <span className="nro-planet-caption">{planet.caption}</span>
                                <span className="nro-planet-name">{planet.name}</span>
                                <span className="nro-planet-detail">{planet.detail}</span>
                            </button>
                        );
                    })}
                </div>

                <NroSpritePreview race={selectedRace} className="nro-character-preview" />

                {error && <p role="alert" className="nro-character-error">{error}</p>}
                <div className="nro-character-actions">
                    <button type="button" className="nro-game-button" onClick={() => { networkInstance.logout(); dispatch(logoutUser()); }}>Đóng</button>
                    <button type="button" onClick={createCharacter} disabled={saving} className="nro-game-button nro-game-button-primary">
                        {saving ? 'Đang tạo…' : 'Tạo mới'}
                    </button>
                </div>
            </section>
        </div>
    );
};

export default NroCharacterCreationModal;

