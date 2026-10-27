const NroSceneBackdrop = ({ backgroundId = 0, groundType = 'grass' }) => {
    const background = {
        0: 'lang-aru', 3: 'rung-karin', 5: 'rung-nam', 6: 'thung-lung-maima',
        8: 'lang-kakarot', 9: 'rung-nguyen-sinh', 12: 'thap-karin'
    }[Number(backgroundId)];
    const image = background
        ? `/assets/nro/map/backgrounds/source/${background}/bg.png`
        : Number(backgroundId) === 0
            ? '/assets/nro/map/backgrounds/bg-0.svg'
            : `/assets/nro/map/backgrounds/bg-${Number(backgroundId)}.svg`;

    return <div className="nro-menu-backdrop" aria-hidden="true">
        <div className="nro-menu-sky" />
        <img src={image} alt="" style={{ inset: 0, height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }} />
        <div className={`nro-menu-ground ${groundType === 'desert' ? 'nro-menu-ground--desert' : ''}`} />
    </div>;
};

export default NroSceneBackdrop;
