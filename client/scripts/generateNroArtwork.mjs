import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(clientRoot, '..');
// Canonical runtime taxonomy: keep each asset in the domain folder it belongs to.
const outRoot = path.join(clientRoot, 'public/assets/nro');
const sourceRoot = path.join(projectRoot, 'artwork-source/nro-source-assets/normal');
const read = (file) => JSON.parse(fs.readFileSync(path.join(projectRoot, file), 'utf8'));
const ensure = (dir) => fs.mkdirSync(dir, { recursive: true });
const write = (file, content) => { ensure(path.dirname(file)); fs.writeFileSync(file, content); };
const hash = (value) => [...String(value)].reduce((sum, char) => ((sum * 33) ^ char.charCodeAt(0)) >>> 0, 5381);
const choose = (list, seed) => list[seed % list.length];
const palettes = [
    ['#52b94e', '#287c44', '#123c3b', '#e7c781', '#bd7444'],
    ['#55b9d4', '#4071aa', '#25355e', '#f0dcac', '#b47748'],
    ['#a783d0', '#6553a4', '#33234f', '#f1d49a', '#c26a75'],
    ['#e3a94e', '#b96734', '#673b34', '#f0d08d', '#519244'],
    ['#9dd765', '#4d943d', '#315b36', '#dfc28b', '#7362a5']
];

function svg(width, height, body, defs = '') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${defs}${body}</svg>`;
}

function readPng(relativePath) {
    const file = path.join(sourceRoot, relativePath);
    if (!fs.existsSync(file)) return null;
    const data = fs.readFileSync(file);
    if (data.toString('ascii', 1, 4) !== 'PNG') return null;
    return {
        data,
        width: data.readUInt32BE(16),
        height: data.readUInt32BE(20),
        uri: `data:image/png;base64,${data.toString('base64')}`
    };
}

function sourceIconArt(iconId, size = 64) {
    const png = readPng(`image/1/icon/${iconId}.png`);
    if (!png || png.width <= 1 || png.height <= 1) return null;
    const scale = Math.min((size - 8) / png.width, (size - 8) / png.height);
    const width = Math.max(1, Math.round(png.width * scale));
    const height = Math.max(1, Math.round(png.height * scale));
    const x = Math.floor((size - width) / 2);
    const y = Math.floor((size - height) / 2);
    return svg(size, size, `<image href="${png.uri}" x="${x}" y="${y}" width="${width}" height="${height}" image-rendering="pixelated"/>`);
}

function sourceMobArt(mobId) {
    const dataFile = path.join(sourceRoot, `monster_data/${mobId}.json`);
    const atlas = readPng(`image/1/monster/${mobId}.png`);
    if (!atlas || !fs.existsSync(dataFile)) return null;
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const frames = (data.frames || []).slice(0, 12);
    if (!frames.length) return null;
    const parts = frames.map((frame, index) => {
        const sprites = (frame || []).map(({ sprite_id: spriteId, dx = 0, dy = 0 }) => {
            const sprite = data.sprites?.find((entry) => Number(entry.id) === Number(spriteId));
            if (!sprite || sprite.w <= 0 || sprite.h <= 0) return '';
            // The source atlas is packed. A nested SVG viewport crops each exact
            // source rectangle while retaining the original NRO frame offsets.
            const x = index * 64 + 32 + Number(dx);
            const y = 80 + Number(dy);
            return `<svg x="${x}" y="${y}" width="${sprite.w}" height="${sprite.h}" viewBox="${sprite.x} ${sprite.y} ${sprite.w} ${sprite.h}" overflow="hidden"><image href="${atlas.uri}" width="${atlas.width}" height="${atlas.height}" image-rendering="pixelated"/></svg>`;
        }).join('');
        return `<g>${sprites}</g>`;
    }).join('');
    return svg(frames.length * 64, 80, parts);
}

function sourceNpcArt(npc) {
    const byId = new Map(parts.map((part) => [Number(part.id), part]));
    const placements = [
        { partId: npc.head, y: 0 },
        { partId: npc.body, y: 18 },
        { partId: npc.leg, y: 32 }
    ];
    const layers = placements.map(({ partId, y }) => {
        const part = byId.get(Number(partId));
        const frame = part?.frames?.find(([iconId]) => Number(iconId) > 0);
        if (!frame) return '';
        const [iconId, dx = 0, dy = 0] = frame;
        const png = readPng(`image/1/icon/${iconId}.png`);
        if (!png || png.width <= 1 || png.height <= 1) return '';
        const scale = Math.min(1, 30 / Math.max(png.width, png.height));
        const width = Math.max(1, Math.round(png.width * scale));
        const height = Math.max(1, Math.round(png.height * scale));
        return `<image href="${png.uri}" x="${Math.round(32 - width / 2 + Number(dx))}" y="${Math.round(y + Number(dy))}" width="${width}" height="${height}" image-rendering="pixelated"/>`;
    }).join('');
    return layers ? svg(64, 80, `<ellipse cx="32" cy="74" rx="15" ry="4" fill="#26351e" opacity=".55"/>${layers}`) : null;
}

function sourceTileArt(setId, tileId) {
    const png = readPng(`data/2/x2/t/${setId}$${tileId}.png`);
    if (!png) return null;
    return svg(24, 24, `<image href="${png.uri}" width="24" height="24" image-rendering="pixelated"/>`);
}

function sourceMapBackgroundArt(bgId) {
    const directory = path.join(sourceRoot, 'data/1/bg');
    if (!fs.existsSync(directory)) return null;
    const prefix = `b${String(bgId).padStart(2, '0')}-`;
    const layerFiles = fs.readdirSync(directory)
        .filter((name) => name.startsWith(prefix) && name.endsWith('.png'))
        .sort((a, b) => Number(b.match(/-(\d+)\.png$/)?.[1]) - Number(a.match(/-(\d+)\.png$/)?.[1]));
    const layers = layerFiles.map((name) => ({ name, png: readPng(`data/1/bg/${name}`) }))
        .filter(({ png }) => png);
    if (!layers.length) return null;
    const width = 1280;
    const height = 440;
    const scale = 2;
    const layerY = { 5: 24, 3: 96, 2: 154, 1: 206, 4: 258 };
    const body = layers.map(({ name, png }) => {
        const layer = Number(name.match(/-(\d+)\.png$/)?.[1]) || 0;
        const tileWidth = png.width * scale;
        const tileHeight = png.height * scale;
        const offset = layer % 2 ? Math.floor(tileWidth / 2) : 0;
        const y = layerY[layer] ?? height - tileHeight;
        const tiles = [];
        for (let x = -offset; x < width; x += tileWidth) {
            tiles.push(`<image href="${png.uri}" x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" image-rendering="pixelated"/>`);
        }
        return tiles.join('');
    }).join('');
    return svg(width, height, `<rect width="${width}" height="${height}" fill="#77c9ee"/>${body}`);
}

function npcArt(npc) {
    const seed = hash(npc.id + npc.name);
    const p = choose(palettes, seed);
    const name = npc.name.toLowerCase();
    if (/rương|hòm/.test(name)) return svg(64, 80, `<ellipse cx="32" cy="69" rx="19" ry="5" fill="#18331f" opacity=".5"/><rect x="10" y="40" width="44" height="26" rx="3" fill="#744329" stroke="#36231d" stroke-width="4"/><rect x="13" y="43" width="38" height="9" fill="#c18943"/><rect x="14" y="55" width="36" height="8" fill="#a96a34"/><rect x="28" y="47" width="8" height="13" fill="#f4d475" stroke="#614522" stroke-width="2"/>`);
    if (/mèo|thú|chó/.test(name)) return svg(64, 80, `<ellipse cx="32" cy="68" rx="17" ry="5" fill="#18331f" opacity=".5"/><path d="M16 45 20 24 30 32 40 30 48 22 50 47 45 60 20 60Z" fill="${p[0]}" stroke="#30251c" stroke-width="4"/><path d="M19 31 21 17 30 28M42 28 50 17 49 34" fill="${p[3]}" stroke="#30251c" stroke-width="3"/><rect x="25" y="36" width="4" height="5" fill="#fff4cc"/><rect x="38" y="36" width="4" height="5" fill="#fff4cc"/><path d="M29 47h7l-3 4z" fill="#ee7b77"/>`);
    const skin = choose(['#f0c195', '#d99b6b', '#b8d878', '#79c6d0'], seed >>> 3);
    const hair = choose(['#31251f', '#dfbd75', '#633a3d', '#263e61', '#e4ded0'], seed >>> 7);
    const cloth = choose([p[0], p[1], p[4], '#e35b4b', '#7956a5'], seed >>> 11);
    const hairStyle = seed % 3;
    const hairShape = hairStyle === 0 ? `<path d="M18 27 21 12 28 18 32 8 37 18 47 11 48 31 43 26 20 33Z" fill="${hair}" stroke="#29211d" stroke-width="3"/>` : hairStyle === 1 ? `<path d="M18 25Q20 9 33 10Q47 10 49 26L44 32H20Z" fill="${hair}" stroke="#29211d" stroke-width="3"/>` : `<path d="M17 26 20 11 28 17 34 9 41 17 49 13 50 30 44 26 20 32Z" fill="${hair}" stroke="#29211d" stroke-width="3"/>`;
    return svg(64, 80, `<ellipse cx="32" cy="70" rx="17" ry="5" fill="#18331f" opacity=".48"/><path d="M24 52h16v17H24z" fill="#303744"/><path d="M19 43h26l7 20H12z" fill="${cloth}" stroke="#30251c" stroke-width="3"/><path d="M21 47h22v5H21z" fill="${p[3]}" opacity=".9"/><path d="M20 68h10v6H19zm15 0h10v6H35z" fill="#30251c"/><path d="M21 25q0-13 12-13t12 13v13q-3 10-12 10T21 38z" fill="${skin}" stroke="#30251c" stroke-width="3"/>${hairShape}<rect x="25" y="31" width="4" height="4" fill="#30251c"/><rect x="37" y="31" width="4" height="4" fill="#30251c"/><path d="M29 40h8" stroke="#7d3f39" stroke-width="2"/>`);
}

function mobArt(mob) {
    const seed = hash(mob.id + mob.name);
    const p = choose(palettes, seed);
    const name = mob.name.toLowerCase();
    const bodyColor = choose([p[0], p[1], p[4], '#c88b58', '#9a5cb5', '#9bc8d0'], seed >>> 5);
    const ears = /chuột|rat|thỏ/.test(name) ? `<path d="M18 28 13 12 27 21M42 21 54 11 48 31" fill="${bodyColor}" stroke="#29211d" stroke-width="3"/>` : '';
    const spikes = /khủng long|rồng|nhím|xên|boss/.test(name) ? `<path d="M18 39 13 29 23 33 27 23 33 31 40 22 43 33 52 28 47 42" fill="${p[3]}" stroke="#2d251f" stroke-width="2"/>` : '';
    const wings = /dơi|bọ|ong|bướm|ruồi/.test(name) ? `<path d="M22 38Q7 17 5 38Q10 49 24 46M42 38Q57 17 59 38Q54 49 40 46" fill="#b7dce2" stroke="#293342" stroke-width="3"/>` : '';
    const frame = (index) => {
        const bob = [0, -1, 0, 1][index];
        const step = index % 2 ? 3 : -2;
        return `<g transform="translate(${index * 64} ${bob})">${wings}<ellipse cx="32" cy="70" rx="19" ry="5" fill="#24351e" opacity=".55"/><path d="M17 49 11 ${59 + step} 17 62 25 54M47 49 53 ${59 - step} 47 62 39 54" fill="${bodyColor}" stroke="#29211d" stroke-width="3"/><path d="M18 40Q21 29 32 28Q45 29 47 41L45 57Q40 65 31 64Q22 63 18 55Z" fill="${bodyColor}" stroke="#29211d" stroke-width="4"/>${ears}${spikes}<rect x="24" y="41" width="5" height="6" fill="#fff4d8"/><rect x="37" y="41" width="5" height="6" fill="#fff4d8"/><rect x="26" y="43" width="3" height="4" fill="#25252a"/><rect x="38" y="43" width="3" height="4" fill="#25252a"/><path d="M29 53h7" stroke="#663838" stroke-width="2"/></g>`;
    };
    return svg(256, 80, [0, 1, 2, 3].map(frame).join(''));
}

function itemArt(item) {
    const seed = hash(item.id + item.name);
    const accent = choose(['#f2c14e', '#58d3b0', '#67c4f4', '#ed8d73', '#b48bed', '#d8e49a'], seed);
    const type = Number(item.type);
    let shape;
    if (type === 0) shape = `<path d="M18 15 27 10h10l9 5 9 8-7 8-5-4v24H21V27l-5 4-7-8z" fill="${accent}" stroke="#38271d" stroke-width="4"/><path d="M27 12q5 9 10 0M23 34h18v4H23z" fill="#f9e3a7" opacity=".8"/>`;
    else if (type === 1) shape = `<path d="M20 10h24l-3 19 7 24H35l-4-17-5 17H15l7-24z" fill="${accent}" stroke="#38271d" stroke-width="4"/><path d="M21 27h22v5H21z" fill="#f8e7b6"/>`;
    else if (type === 2) shape = `<path d="M19 42 15 27q-1-7 4-7 4 0 5 7l-1-13q0-5 4-5t5 5l1 12 2-14q1-5 5-4t3 6l-1 15 4-9q3-5 6-2 3 3 0 9l-6 18-8 9H24z" fill="${accent}" stroke="#38271d" stroke-width="4"/>`;
    else if (type === 3) shape = `<path d="M21 12h13v23l17 8v10H14v-8l7-5z" fill="${accent}" stroke="#38271d" stroke-width="4"/><path d="M16 45h31v5H16z" fill="#f4e5be"/>`;
    else if (type === 4) shape = `<circle cx="32" cy="32" r="22" fill="#223c4a" stroke="${accent}" stroke-width="5"/><circle cx="32" cy="32" r="13" fill="#6ecfe2" stroke="#d3fff6" stroke-width="3"/><path d="M32 32 47 17M32 32 19 41" stroke="#f7dc76" stroke-width="3"/><circle cx="32" cy="32" r="3" fill="#fff"/>`;
    else if (type === 6) shape = `<path d="M19 44Q11 26 29 14q17-11 22 2-2 20-22 31z" fill="#81c85c" stroke="#31552e" stroke-width="4"/><path d="m24 40 20-22M29 31l-2-10m8 3 7-7" stroke="#d6f29e" stroke-width="3"/>`;
    else if (type === 12) {
        const starCount = Math.max(1, Number(item.name.match(/(\d)\s*sao/i)?.[1]) || (seed % 7) + 1);
        const stars = Array.from({ length: starCount }, (_, index) => {
            const angle = (Math.PI * 2 * index) / starCount;
            const x = 32 + Math.cos(angle) * 12;
            const y = 32 + Math.sin(angle) * 12;
            return `<circle cx="${Math.round(x)}" cy="${Math.round(y)}" r="2.5" fill="#bd412b"/>`;
        }).join('');
        shape = `<circle cx="32" cy="32" r="23" fill="#ef7c27" stroke="#6c321e" stroke-width="4"/><circle cx="32" cy="32" r="18" fill="#ffb944"/>${stars}<path d="M18 27q14-15 28-2" fill="none" stroke="#ffe487" stroke-width="3"/>`;
    }
    else if (type === 7) shape = `<path d="M16 12h34v43H16z" fill="${accent}" stroke="#38271d" stroke-width="4"/><path d="M22 19h22v3H22zm0 8h18v3H22zm0 8h22v3H22z" fill="#fff0c7"/><path d="m28 47 5-6 5 6-5 5z" fill="#f7da76"/>`;
    else shape = `<path d="M15 19 32 9l17 10v27L32 56 15 46z" fill="${accent}" stroke="#38271d" stroke-width="4"/><path d="M21 22 32 16l11 6v20l-11 7-11-7z" fill="#fff3cf" opacity=".65"/><path d="m32 24 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1z" fill="#fff4a6"/>`;
    const markVariants = [
        `<path d="M28 25 32 19l4 6 7 2-5 5 1 7-7-4-7 4 1-7-5-5z" fill="#fff1ae"/>`,
        `<circle cx="32" cy="32" r="6" fill="#fff1ae"/><path d="M32 21v22M21 32h22" stroke="#fff1ae" stroke-width="3"/>`,
        `<path d="M22 28h20v4H22zm0 8h20v4H22z" fill="#fff1ae"/>`,
        `<path d="m32 21 11 11-11 11-11-11z" fill="#fff1ae" stroke="#8a532f" stroke-width="2"/>`
    ];
    const mark = markVariants[seed % markVariants.length];
    const shine = `<path d="M10 14h4v4h-4zm37 31h4v4h-4z" fill="#fff8d7" opacity=".9"/>`;
    return svg(64, 64, `<rect x="3" y="3" width="58" height="58" rx="8" fill="#241c24" stroke="#8f653d" stroke-width="3"/><rect x="7" y="7" width="50" height="50" rx="5" fill="#59402f"/>${shape}${type === 12 ? '' : mark}${shine}`);
}

function mapBackdrop(bgId) {
    const themes = {
        1: ['#79c9ee', '#4d9844', '#285c39', '#8e6544'],
        3: ['#8bc6ee', '#528844', '#31513a', '#927151'],
        6: ['#d9b5ef', '#9b80c5', '#514474', '#b18a68'],
        8: ['#f4cc7e', '#72a449', '#704332', '#c38243'],
        9: ['#90c7e5', '#3e7e5d', '#203f42', '#967b56'],
        12: ['#9ad6ed', '#68a94c', '#4c6441', '#b09069']
    };
    const theme = themes[bgId] || themes[1];
    const seed = Number(bgId) * 991;
    const clouds = Array.from({ length: 10 }, (_, i) => {
        const x = (i * 157 + seed * 3) % 1300;
        const y = 35 + ((i * 47 + seed) % 110);
        return `<path d="M${x} ${y + 15}h24v-12h16v-12h28v12h18v12h19v12h-105z" fill="#eaf6ed" opacity=".76"/>`;
    }).join('');
    const mountains = Array.from({ length: 12 }, (_, i) => {
        const x = i * 122 - 80;
        const top = 160 + ((i * 31 + seed) % 95);
        return `<path d="M${x} 365  ${x + 66} ${top} ${x + 130} 365z" fill="${i % 2 ? '#66989a' : '#547f82'}"/><path d="m${x + 66} ${top} 24 43-24-12-21 12z" fill="#d6e1cc" opacity=".8"/>`;
    }).join('');
    const hills = Array.from({ length: 8 }, (_, i) => {
        const x = i * 190 - 40;
        const y = 330 + (i % 3) * 17;
        return `<path d="M${x} 410q60-115 128-26 30-54 80 26z" fill="${i % 2 ? theme[1] : '#70ad4b'}" stroke="#385b36" stroke-width="5"/>`;
    }).join('');
    const props = Array.from({ length: 18 }, (_, i) => {
        const x = (i * 83 + seed) % 1280;
        const y = 390 + (i % 4) * 18;
        if (bgId === 12) return `<path d="M${x} ${y}h20v-60h-20z" fill="${theme[3]}" stroke="#503d30" stroke-width="3"/><rect x="${x - 5}" y="${y - 62}" width="30" height="8" fill="#d8ba87"/>`;
        if (bgId === 8) return `<path d="M${x} ${y}q15-42 30 0z" fill="#51733e" stroke="#314c32" stroke-width="3"/>`;
        return `<rect x="${x + 10}" y="${y - 17}" width="7" height="20" fill="#684b32"/><path d="M${x} ${y - 13}q12-27 27 0z" fill="${i % 2 ? '#28674a' : '#3c8950'}" stroke="#31543a" stroke-width="3"/>`;
    }).join('');
    return svg(1280, 500, `<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${theme[0]}"/><stop offset="1" stop-color="#e7e4ae"/></linearGradient></defs><rect width="1280" height="500" fill="url(#sky)"/>${clouds}${mountains}${hills}<path d="M0 430q210-24 380 14t340-2 560 8v50H0z" fill="${theme[3]}"/>${props}<rect y="478" width="1280" height="22" fill="${theme[2]}"/>`);
}

const npcs = read('shared/nro/maps/npc-templates.json');
const mobs = read('shared/nro/maps/mob-templates.json');
const items = read('shared/nro/maps/item-templates.json');
const skills = read('shared/nro/maps/skill-templates.json');
const maps = read('shared/nro/maps/catalog.json');
const parts = read('shared/nro/maps/parts.json');
const playableIds = new Set(read('server/src/config/gameConfig.json').nroWorld.playableMapIds);
const tileSets = read('shared/nro/maps/tile-sets.json');

let sourceNpcs = 0;
let sourceMobs = 0;
let sourceItems = 0;
let sourceSkills = 0;
let sourceTiles = 0;
let sourceBackgrounds = 0;
for (const npc of npcs) {
    const art = sourceNpcArt(npc);
    if (art) sourceNpcs += 1;
    write(path.join(outRoot, `npc/generated/${npc.id}.svg`), art || npcArt(npc));
}
write(path.join(outRoot, 'boss/karin.svg'), sourceNpcArt({ head: 89, body: 90, leg: 91 }) || npcArt({ id: 900, name: 'Thần Mèo Karin' }));
write(path.join(outRoot, 'boss/tau77.svg'), sourceNpcArt({ head: 92, body: 93, leg: 94 }) || npcArt({ id: 901, name: 'Tau 7 7' }));
for (const mob of mobs) {
    const art = sourceMobArt(mob.id);
    if (art) sourceMobs += 1;
    write(path.join(outRoot, `monster/generated/${mob.id}.svg`), art || mobArt(mob));
}
for (const item of items) {
    const art = sourceIconArt(item.iconId);
    if (art) sourceItems += 1;
    const type = Number(item.type);
    const planet = ({ 0: 'td', 1: 'nm', 2: 'xd' })[Number(item.gender)] || 'chung';
    const category = type <= 4 ? `trangbi/${planet}` : type === 5 ? 'skin' : ({ 6: 'bua', 12: 'ngocrong', 7: 'nangcap' })[type] || 'khac';
    const itemRoot = category === 'skin' || category.startsWith('trangbi/') ? category : `items/${category}`;
    write(path.join(outRoot, `${itemRoot}/item-${item.id}.svg`), art || itemArt(item));
}
for (const skill of skills) {
    const original = sourceIconArt(skill.iconId);
    if (original) {
        sourceSkills += 1;
        write(path.join(outRoot, `skill/icon/nro-${skill.planetClassId}-${skill.id}.svg`), original);
        continue;
    }
    const seed = hash(skill.id + skill.name);
    const color = choose(['#59d8ff', '#f47e6b', '#84df7c', '#c49aff', '#ffd76c'], seed);
    const name = String(skill.name).toLowerCase();
    const motif = /kame|chưởng|chưởng|beam|cầu|đạn|sóng|laze/.test(name)
        ? `<circle cx="32" cy="32" r="15" fill="${color}" stroke="#fff2be" stroke-width="4"/><path d="M8 32h12m24 0h12M32 8v12m0 24v12" stroke="#fff2be" stroke-width="4"/>`
        : /khiên|bảo vệ/.test(name)
            ? `<path d="M32 8 52 17v16q-2 16-20 24Q14 49 12 33V17z" fill="${color}" stroke="#fff2be" stroke-width="4"/><path d="m22 32 7 7 14-16" fill="none" stroke="#fff" stroke-width="4"/>`
            : /trị thương|hồi|tái tạo/.test(name)
                ? `<path d="M26 13h12v13h13v12H38v13H26V38H13V26h13z" fill="${color}" stroke="#fff2be" stroke-width="3"/>`
                : /dịch chuyển|dash|bay/.test(name)
                    ? `<path d="M7 36 31 12l9 11 17-14-8 23-10-8-25 27z" fill="${color}" stroke="#fff2be" stroke-width="3"/>`
                    : `<path d="M32 7 38 24l18 2-14 11 5 18-15-10-15 10 5-18L8 26l18-2z" fill="${color}" stroke="#fff2be" stroke-width="3"/>`;
    const artwork = svg(64, 64, `<rect x="3" y="3" width="58" height="58" rx="8" fill="#241c24" stroke="#8f653d" stroke-width="3"/><rect x="7" y="7" width="50" height="50" rx="5" fill="#59402f"/>${motif}`);
    write(path.join(outRoot, `skill/icon/nro-${skill.planetClassId}-${skill.id}.svg`), artwork);
}
const bgIds = new Set(maps.filter((map) => playableIds.has(map.id)).map((map) => Number(map.bgId)));
for (const bgId of bgIds) {
    const art = sourceMapBackgroundArt(bgId);
    if (art) sourceBackgrounds += 1;
    write(path.join(outRoot, `map/backgrounds/bg-${bgId}.svg`), art || mapBackdrop(bgId));
}
const tileTypeLookup = new Map(tileSets.map((set) => [Number(set.setId), {
    top: new Set(set.tileTypes.find((type) => type.type === 2)?.tiles || []),
    sides: new Set(set.tileTypes.filter((type) => type.type === 4 || type.type === 8).flatMap((type) => type.tiles || [])),
    borders: new Set(set.tileTypes.find((type) => type.type === 8192)?.tiles || [])
}]));
const tilePalette = {
    1: ['#80563d', '#53a64e', '#327d3f'], 2: ['#715842', '#4f9144', '#327344'],
    4: ['#92704c', '#6aa953', '#d3ae6e'], 5: ['#836247', '#5ca84d', '#3e823f'],
    7: ['#69547f', '#8db978', '#493e62'], 9: ['#8f6544', '#86a94e', '#525f34'],
    10: ['#716b4d', '#5b8b49', '#3b673f'], 13: ['#9c7857', '#c4a572', '#735a46']
};
const tileKeys = new Set();
for (const map of maps.filter((entry) => playableIds.has(entry.id))) {
    for (const tile of new Set(map.map?.tiles?.flat()?.map(Number).filter((id) => id > 0) || [])) tileKeys.add(`${map.tileId}-${tile}`);
}
for (const key of tileKeys) {
    const [setId, tileId] = key.split('-').map(Number);
    const original = sourceTileArt(setId, tileId);
    if (original) {
        sourceTiles += 1;
        write(path.join(outRoot, `map/tiles/${setId}-${tileId}.svg`), original);
        continue;
    }
    const seed = hash(key);
    const palette = tilePalette[setId] || tilePalette[1];
    const types = tileTypeLookup.get(setId) || { top: new Set(), sides: new Set(), borders: new Set() };
    const top = types.top.has(tileId);
    const side = types.sides.has(tileId) || types.borders.has(tileId);
    const flecks = Array.from({ length: 7 }, (_, i) => {
        const x = 2 + ((seed + i * 11) % 18);
        const y = 2 + (((seed >>> (i % 16)) + i * 7) % 18);
        const width = 1 + (i % 3);
        const height = 1 + ((i + 1) % 2);
        const color = i % 3 === 0 ? palette[0] : palette[2];
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" opacity="${i % 2 ? '.46' : '.7'}"/>`;
    }).join('');
    const stones = Array.from({ length: 3 }, (_, i) => {
        const x = 3 + ((seed >>> (i * 3)) % 16);
        const y = 10 + ((seed + i * 5) % 10);
        return `<path d="M${x} ${y + 2}h3v-2h3v2h2v2h-8z" fill="${palette[2]}" opacity=".75"/>`;
    }).join('');
    const body = top
        ? `<rect width="24" height="24" fill="${palette[0]}"/><path d="M0 0h5v2h4v-1h5v2h4V1h6v6h-4v2h-5V7h-5v2H6V7H0z" fill="${palette[1]}"/><path d="M0 7h6v2h7V7h5v2h6v2H0z" fill="${palette[2]}" opacity=".86"/>${flecks}${stones}`
        : side
            ? `<rect width="24" height="24" fill="${palette[0]}"/><path d="M0 4h7v2h8v-2h9M0 14h5v2h10v-2h9" fill="none" stroke="${palette[2]}" stroke-width="2" opacity=".68"/>${flecks}${stones}`
            : `<rect width="24" height="24" fill="${palette[1]}"/><path d="M0 3h7v2h6V3h5v2h6M0 17h5v2h8v-2h6v2h5" fill="none" stroke="${palette[2]}" stroke-width="2" opacity=".5"/>${flecks}`;
    write(path.join(outRoot, `map/tiles/${setId}-${tileId}.svg`), svg(24, 24, body));
}

write(path.join(outRoot, 'data/manifests/art-manifest.json'), JSON.stringify({
    source: 'Reconstructed from NRO source sprite atlases, frame metadata, item icons and terrain textures; procedural fallback only for missing source files',
    sourceAssetCounts: { npcs: sourceNpcs, mobs: sourceMobs, items: sourceItems, skills: sourceSkills, tiles: sourceTiles, backgrounds: sourceBackgrounds },
    npcIds: npcs.map(({ id }) => id), mobIds: mobs.map(({ id }) => id),
    itemIds: items.map(({ id }) => id), bgIds: [...bgIds], tileKeys: [...tileKeys]
}, null, 2));
write(path.join(outRoot, 'data/manifests/mob-animation-ids.json'), JSON.stringify(mobs.map(({ id }) => id), null, 2));
const itemAssetPaths = Object.fromEntries(items.map((item) => {
    const type = Number(item.type);
    const planet = ({ 0: 'td', 1: 'nm', 2: 'xd' })[Number(item.gender)] || 'chung';
    const category = type <= 4 ? `trangbi/${planet}` : type === 5 ? 'skin' : ({ 6: 'bua', 12: 'ngocrong', 7: 'nangcap' })[type] || 'khac';
    const itemRoot = category === 'skin' ? 'skin' : `items/${category}`;
    return [item.id, `/assets/nro/${itemRoot}/item-${item.id}.svg`];
}));
write(path.join(outRoot, 'data/manifests/generated-items.json'), JSON.stringify(itemAssetPaths, null, 2));
console.log(`Rebuilt NRO art from source: ${sourceNpcs}/${npcs.length} NPCs, ${sourceMobs}/${mobs.length} mobs, ${sourceItems}/${items.length} items, ${sourceSkills}/${skills.length} skills, ${sourceBackgrounds}/${bgIds.size} backgrounds and ${sourceTiles}/${tileKeys.size} terrain tiles.`);
