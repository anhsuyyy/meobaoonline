/** One full-body idle frame, shared with the Phaser character animation assets. */
const NroSpritePreview = ({ race = 'earth', className = '' }) => {
    const raceId = String(race).toLowerCase();
    const normalizedRace = ({ earth: 'td', namek: 'nm', saiyan: 'xd', td: 'td', nm: 'nm', xd: 'xd' })[raceId] || 'td';
    return <span
        className={`nro-source-warrior ${className}`}
        style={{ backgroundImage: `url("/assets/nro/character/${normalizedRace}/dung/dung1.png")` }}
        aria-hidden="true"
    />;
};

export default NroSpritePreview;
