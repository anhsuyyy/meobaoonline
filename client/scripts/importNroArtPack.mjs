import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(clientRoot, '..');
const packRoot = path.join(projectRoot, 'NRO_Art_Pack/NRO_Art_Pack');
const publicRoot = path.join(clientRoot, 'public/assets/nro');
const publishedPackRoot = publicRoot;
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(projectRoot, file), 'utf8'));
const slug = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ensure = (file) => fs.mkdirSync(path.dirname(file), { recursive: true });

if (!fs.existsSync(packRoot)) throw new Error(`Missing NRO art pack at ${packRoot}`);
const publish = (sourceRelative, targetRelative) => {
    const source = path.join(packRoot, sourceRelative);
    const target = path.join(publishedPackRoot, targetRelative);
    if (!fs.existsSync(source)) return null;
    ensure(target);
    fs.copyFileSync(source, target);
    return `/assets/nro/${targetRelative.replaceAll('\\', '/')}`;
};

const npcTemplates = readJson('shared/nro/maps/npc-templates.json');
const npcAliases = new Map([
    ['cay-dau-than', 4], ['khu-vuc', 6], ['bulma', 7], ['dende', 8], ['appule', 9],
    ['tien-si-brief', 10], ['ong-gohan', 0], ['ong-moori', 2], ['ong-paragus', 1],
    ['quy-lao', 13], ['ba-hat-mit', 21], ['bo-mong', 17], ['than-meo-karin', 18],
    ['thuong-de', 19], ['mr-popo', 67], ['than-vu-tru', 20], ['ghi-danh', 23],
    ['uron', 16], ['santa', 39], ['cui', 12], ['ruong-do', 3],
    ['linh-canh', 25]
]);
const npcAssets = {};
for (const [name, id] of npcAliases) {
    const file = `npc/${name}/dung.png`;
    if (!npcTemplates.some((npc) => npc.id === id)) continue;
    const url = publish(file, `npc/portraits/${name}/dung.png`);
    if (!url) continue;
    npcAssets[id] = url;
    const target = path.join(publishedPackRoot, 'npc/generated', `${id}.svg`);
    ensure(target);
    fs.writeFileSync(target, `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="160" viewBox="0 0 128 160"><image href="${url}" width="128" height="160" image-rendering="pixelated"/></svg>`);
}

const backgrounds = {
    0: 'lang-aru', 3: 'rung-karin', 5: 'rung-nam', 6: 'thung-lung-maima',
    8: 'lang-kakarot', 9: 'rung-nguyen-sinh', 12: 'thap-karin'
};
const backgroundAssets = {};
for (const [id, name] of Object.entries(backgrounds)) {
    const file = `backgrounds/${name}/bg.png`;
    const url = publish(file, `map/backgrounds/source/${name}/bg.png`);
    if (!url) continue;
    backgroundAssets[id] = url;
    const target = path.join(publishedPackRoot, 'map/backgrounds', `bg-${id}.svg`);
    ensure(target);
    fs.writeFileSync(target, `<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="880" viewBox="0 0 2560 880"><image href="${url}" width="2560" height="880" preserveAspectRatio="none"/></svg>`);
}

const skillTemplates = readJson('shared/nro/maps/skill-templates.json');
const skillAliases = {
    dragon: ['dragon'], demon: ['demon'], galick: ['galick'], masenko: ['masenko'], antomic: ['antomic'],
    kamejoko: ['kamejoko', 'super-kamejoko'], 'thai-duong': ['thai-duong-ha-san'],
    kaioken: ['kaioken'], 'qua-cau-nang-luong': ['qua-cau-kenh-khi'],
    'khien-nang-luong': ['khien-nang-luong'], 'dich-chuyen': ['dich-chuyen-tuc-thoi'],
    'thoi-mien': ['thoi-mien'], 'de-trung': ['de-trung'], 'lien-hoan': ['lien-hoan', 'cadic-lien-hoan-chuong'],
    'bien-khi': ['bien-hinh'], 'tri-thuong': ['tri-thuong'], 'tai-tao': ['tai-tao-nang-luong'],
    'tu-phat-no': ['tu-phat-no'], 'hu-sao': ['huyt-sao'], 'troi-nang-luong': ['troi'],
    'tang-hinh': ['tang-hinh'], 'thoi-mien-nang-cao': ['thoi-mien-nang-cao'],
    'hoa-khi': ['hoa-khi'], 'hoi-ki': ['hoi-ki'], 'hoi-hp': ['hoi-hp'],
    laser: ['makankosappo'], 'phan-don': ['phan-don'], 'bao-nang-luong': ['bao-nang-luong'],
    'luong-long': ['luong-long']
};
const skillFiles = fs.readdirSync(path.join(packRoot, 'icons/skills')).filter((file) => file.endsWith('.png'));
const skillAssets = {};
for (const [fileSlug, candidates] of Object.entries(skillAliases)) {
    const file = skillFiles.find((entry) => slug(path.basename(entry, '.png')) === fileSlug);
    if (!file) continue;
    const url = publish(`icons/skills/${file}`, `skill/icon/source/${file}`);
    if (!url) continue;
    for (const skill of skillTemplates) {
        const name = slug(skill.name);
        if (!candidates.some((candidate) => name.includes(candidate))) continue;
        const key = `${skill.planetClassId}-${skill.id}`;
        skillAssets[key] = url;
        const target = path.join(publishedPackRoot, 'skill/icon', `nro-${key}.svg`);
        ensure(target);
        fs.writeFileSync(target, `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><image href="${url}" x="4" y="4" width="56" height="56" image-rendering="pixelated"/></svg>`);
    }
}

const itemTemplates = readJson('shared/nro/maps/item-templates.json');
const generatedItemAssets = Object.fromEntries(itemTemplates.map((item) => {
    const type = Number(item.type);
    const planet = ({ 0: 'td', 1: 'nm', 2: 'xd' })[Number(item.gender)] || 'chung';
    const category = type <= 4 ? `trangbi/${planet}` : type === 5 ? 'skin' : ({ 6: 'bua', 12: 'ngocrong', 7: 'nangcap' })[type] || 'khac';
    const itemRoot = category === 'skin' || category.startsWith('trangbi/') ? category : `items/${category}`;
    return [item.id, `/assets/nro/${itemRoot}/item-${item.id}.svg`];
}));
const itemFiles = fs.readdirSync(path.join(packRoot, 'icons/items')).filter((file) => file.endsWith('.png'));
const itemAssets = {};
const equipmentSlot = { ao: 0, quan: 1, gang: 2, giay: 3, rada: 4 };
const raceId = { earth: 0, namek: 1, saiyan: 2 };
for (const file of itemFiles) {
    const name = slug(path.basename(file, '.png'));
    let category = 'khac';
    let ids = [];
    const gear = name.match(/^(earth|namek|saiyan)-(vai-tho|luyen-tap|cao-cap)-(ao|quan|gang|giay|rada)$/);
    if (gear) {
        const [, race, tier, slotName] = gear;
        const type = equipmentSlot[slotName];
        const gender = type === 4 ? 3 : raceId[race];
        let candidates = itemTemplates.filter((item) => Number(item.type) === type && Number(item.gender) === gender).sort((a, b) => a.id - b.id);
        const tierIndex = { 'vai-tho': 0, 'luyen-tap': 1, 'cao-cap': 2 }[tier];
        if (candidates.length) ids = [candidates[Math.min(tierIndex, candidates.length - 1)].id];
        category = `trangbi/${({ earth: 'td', namek: 'nm', saiyan: 'xd' })[gear[1]]}`;
    } else {
        const exact = itemTemplates.filter((item) => slug(item.name) === name);
        if (exact.length) ids = exact.map((item) => item.id);
        else {
            const bean = name.match(/^dau-than-cap-(\d+)$/);
            const dragonBall = name.match(/^ngoc-rong-(\d+)-sao$/);
            if (bean) ids = itemTemplates.filter((item) => item.type === 6 && slug(item.name) === `dau-than-cap-${bean[1]}`).map((item) => item.id);
            if (dragonBall) ids = itemTemplates.filter((item) => slug(item.name) === `ngoc-rong-${dragonBall[1]}-sao`).map((item) => item.id);
            if (name === 'vang') ids = itemTemplates.filter((item) => slug(item.name) === 'vang').map((item) => item.id);
            if (name === 'ngoc-xanh') ids = itemTemplates.filter((item) => ['ngoc', 'ngoc-xanh'].includes(slug(item.name))).slice(0, 1).map((item) => item.id);
        }
    }
    if (ids.length && category === 'khac') {
        const type = Number(itemTemplates.find((item) => ids.includes(item.id))?.type);
        category = type === 5 ? 'skin' : type === 6 ? 'bua' : type === 12 ? 'ngocrong' : type === 7 ? 'nangcap' : 'khac';
    }
    const itemRoot = category === 'skin' || category.startsWith('trangbi/') ? category : `items/${category}`;
    const url = publish(`icons/items/${file}`, `${itemRoot}/source/${file}`);
    if (!url) continue;
    for (const id of ids) {
        itemAssets[id] = url;
        const target = path.join(publishedPackRoot, itemRoot, `item-${id}.svg`);
        ensure(target);
        fs.writeFileSync(target, `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><image href="${url}" x="4" y="4" width="56" height="56" image-rendering="pixelated"/></svg>`);
    }
}

// Keep biome tiles in the source pack until their art IDs are mapped to the runtime tile sets.
const tileAssets = {};
const output = path.join(publishedPackRoot, 'data/manifests/art-pack.json');
const runtimeManifest = { version: 1, excluded: ['character', 'monster'], npcAssets, backgroundAssets, skillAssets, itemAssets, tileAssets };
fs.writeFileSync(output, `${JSON.stringify(runtimeManifest, null, 2)}\n`);
const sourceManifest = path.join(clientRoot, 'src/generated/nroArtPackManifest.js');
ensure(sourceManifest);
fs.writeFileSync(sourceManifest, `// Generated by scripts/importNroArtPack.mjs. Keep URLs in sync with public/assets/nro/data/manifests/art-pack.json.\nexport const NRO_ART_PACK_SKILLS = Object.freeze(${JSON.stringify(skillAssets, null, 2)});\nexport const NRO_ART_PACK_ITEMS = Object.freeze(${JSON.stringify(itemAssets, null, 2)});\nexport const NRO_GENERATED_ITEMS = Object.freeze(${JSON.stringify(generatedItemAssets, null, 2)});\n`);
console.log(`Imported NRO Art Pack overrides: ${Object.keys(npcAssets).length} NPCs, ${Object.keys(backgroundAssets).length} backgrounds, ${Object.keys(skillAssets).length} skill icons, ${Object.keys(itemAssets).length} item icons; source tiles remain out of runtime until mapped.`);
