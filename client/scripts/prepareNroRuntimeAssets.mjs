import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(clientRoot, '..');
const sourceArgument = process.env.NRO_SOURCE_DIR || path.join(clientRoot, 'nro-source-archive');
const sourceRoot = fs.existsSync(path.join(sourceArgument, 'normal'))
    ? path.join(sourceArgument, 'normal')
    : sourceArgument;
const targetRoot = path.join(projectRoot, 'artwork-source/nro-source-assets');
const targetNormal = path.join(targetRoot, 'normal');
const markerPath = path.join(targetRoot, '.runtime-assets-manifest.json');
const maps = JSON.parse(fs.readFileSync(path.join(projectRoot, 'shared/nro/maps/catalog.json'), 'utf8'));
const parts = JSON.parse(fs.readFileSync(path.join(projectRoot, 'shared/nro/maps/parts.json'), 'utf8'));
const npcs = JSON.parse(fs.readFileSync(path.join(projectRoot, 'shared/nro/maps/npc-templates.json'), 'utf8'));
const mobs = JSON.parse(fs.readFileSync(path.join(projectRoot, 'shared/nro/maps/mob-templates.json'), 'utf8'));
const items = JSON.parse(fs.readFileSync(path.join(projectRoot, 'shared/nro/maps/item-templates.json'), 'utf8'));
const skills = JSON.parse(fs.readFileSync(path.join(projectRoot, 'shared/nro/maps/skill-templates.json'), 'utf8'));
const gameConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'server/src/config/gameConfig.json'), 'utf8'));
const playableMapIds = new Set(gameConfig.nroWorld.playableMapIds || [gameConfig.nroWorld.mapId]);

if (!fs.existsSync(path.join(sourceRoot, 'image/1/icon')) || !fs.existsSync(path.join(sourceRoot, 'data/2/x2/t'))) {
    if (fs.existsSync(markerPath)) {
        console.log('NRO runtime assets are already prepared; full source archive is not present.');
        process.exit(0);
    }
    throw new Error(`Missing NRO source assets at ${sourceRoot}. Set NRO_SOURCE_DIR to the extracted source folder.`);
}

const requiredTerrainFiles = new Set();
for (const map of maps.filter((entry) => playableMapIds.has(entry.id) && entry.map?.tiles)) {
    const tileIds = new Set(map.map.tiles.flat().filter((tileId) => Number(tileId) > 0));
    for (const tileId of tileIds) requiredTerrainFiles.add(`data/2/x2/t/${map.tileId}$${tileId}.png`);
}
const missingTerrainFiles = [...requiredTerrainFiles].filter((relativePath) =>
    !fs.existsSync(path.join(sourceRoot, relativePath))
);
if (missingTerrainFiles.length) {
    throw new Error(`Missing ${missingTerrainFiles.length} required terrain tile image(s): ${missingTerrainFiles.slice(0, 12).join(', ')}`);
}

// Keep an extracted source archive intact. Only replace directories generated
// by this script; never remove the user's original art source.
let preserveExistingSource = false;
if (fs.existsSync(targetRoot)) {
    if (!fs.existsSync(markerPath)) {
        const looksLikeSourceArchive = fs.existsSync(path.join(targetNormal, 'image/1/icon'))
            && fs.existsSync(path.join(targetNormal, 'data/2/x2/t'));
        if (!looksLikeSourceArchive) {
            throw new Error(`Refusing to replace unmarked NRO assets at ${targetRoot}; it is not a recognized extracted source archive.`);
        }
        preserveExistingSource = true;
    } else {
        const previousManifest = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        preserveExistingSource = previousManifest.managedOutput === false;
        if (!preserveExistingSource) fs.rmSync(targetRoot, { recursive: true, force: true });
    }
}
fs.mkdirSync(targetNormal, { recursive: true });

const iconIds = new Set([0, ...items.map((item) => item.iconId), ...skills.map((skill) => skill.iconId)]);
for (const part of parts.filter((entry) => entry.id >= 0 && entry.id <= 8)) {
    for (const frame of part.frames || []) iconIds.add(frame[0]);
}
// Source ConstPlayer.HEADMONKEY uses these seven head parts during Saiyan S3.
// Their body/leg parts are shared by every monkey form.
for (const partId of [192, 195, 196, 199, 197, 200, 198, 193, 194]) {
    const part = parts.find((entry) => entry.id === partId);
    for (const frame of part?.frames || []) iconIds.add(frame[0]);
}
for (const map of maps.filter((entry) => playableMapIds.has(entry.id))) {
    for (const npcSpawn of map.npcs || []) {
        iconIds.add(npcSpawn[3]);
        const template = npcs.find((entry) => entry.id === npcSpawn[0]);
        for (const partId of [template?.head, template?.body, template?.leg]) {
            const part = parts.find((entry) => entry.id === partId);
            for (const frame of part?.frames || []) iconIds.add(frame[0]);
        }
    }
}
// Generated static NPC art is reconstructed from the original head/body/leg
// icon parts, including templates not present in the currently opened maps.
for (const template of npcs) {
    for (const partId of [template.head, template.body, template.leg]) {
        const part = parts.find((entry) => entry.id === partId);
        for (const frame of part?.frames || []) {
            if (Number.isInteger(frame[0]) && frame[0] > 0) iconIds.add(frame[0]);
        }
    }
}
for (const id of [555, 556, 557, ...Array.from({ length: 34 }, (_, index) => index + 1), 80, 81, 82, 83, 91, 119, 120]) {
    iconIds.add(id);
}

const mobIds = new Set([
    ...maps.filter((entry) => playableMapIds.has(entry.id)).flatMap((entry) => (entry.mobs || []).map((mob) => mob[0])),
    ...mobs.map((mob) => mob.id)
]);
// Saiyan/Namek summon skills use the source MobMe templates independently of
// the active map's regular mob spawns, so these sprites must always ship.
for (const mobId of [8, 11, 32, 25, 43, 49, 50]) mobIds.add(mobId);
const backgroundIds = new Set(maps.filter((entry) => playableMapIds.has(entry.id)).map((entry) => entry.bgId));
const backgroundLayersById = {};

const copied = [];
const missing = [];
function copyFile(relativePath) {
    const source = path.join(sourceRoot, relativePath);
    if (!fs.existsSync(source)) {
        missing.push(relativePath.replaceAll('\\', '/'));
        return;
    }
    const destination = path.join(targetNormal, relativePath);
    if (preserveExistingSource && fs.existsSync(destination)) {
        copied.push(relativePath.replaceAll('\\', '/'));
        return;
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    copied.push(relativePath.replaceAll('\\', '/'));
}

for (const iconId of iconIds) {
    if (Number.isInteger(iconId)) copyFile(`image/1/icon/${iconId}.png`);
}
// Copy source tile textures only for maps enabled in the web build.
for (const relativePath of requiredTerrainFiles) copyFile(relativePath);
for (const backgroundId of backgroundIds) {
    const prefix = `b${String(backgroundId).padStart(2, '0')}-`;
    const directory = path.join(sourceRoot, 'data/1/bg');
    const filenames = fs.readdirSync(directory).filter((name) => name.startsWith(prefix));
    if (filenames.length) {
        backgroundLayersById[backgroundId] = filenames.map((name) => Number(name.match(/-(\d+)\.png$/)?.[1]))
            .filter(Number.isInteger).sort((a, b) => a - b);
    }
    for (const filename of filenames) {
        copyFile(path.join('data/1/bg', filename));
    }
}
for (const mobId of mobIds) {
    copyFile(`monster_data/${mobId}.json`);
    copyFile(`image/1/monster/${mobId}.png`);
}

const manifest = {
    source: 'NRO source archive, scale 1',
    managedOutput: !preserveExistingSource,
    playableMapIds: [...playableMapIds],
    copiedFileCount: copied.length,
    missingFiles: missing
};
fs.writeFileSync(markerPath, `${JSON.stringify(manifest, null, 2)}\n`);
const runtimeMapData = path.join(clientRoot, 'public/assets/nro/map/data');
fs.mkdirSync(runtimeMapData, { recursive: true });
fs.writeFileSync(path.join(runtimeMapData, 'runtime-assets.json'), `${JSON.stringify({
    backgroundLayersById
}, null, 2)}\n`);
console.log(`Prepared ${copied.length} NRO runtime assets for map ${[...playableMapIds].join(', ')}; ${missing.length} optional source files were unavailable.`);
