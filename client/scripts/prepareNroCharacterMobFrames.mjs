import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(clientRoot, '..');
const sourceRoot = path.join(projectRoot, 'NRO_NhanVat_Quai_Frames', 'NRO_NhanVat_Quai_Frames');
const outputRoot = path.join(clientRoot, 'public', 'assets', 'nro');
const raceFolder = { earth: 'td', namek: 'nm', saiyan: 'xd' };

const mobSlugsByTemplateId = {
    0: 'moc-nhan', 1: 'khung-long', 2: 'lon-loi', 3: 'quy-dat',
    4: 'khung-long-me', 5: 'lon-loi-me', 6: 'quy-dat-me',
    7: 'than-lan-bay', 8: 'phi-long', 9: 'quy-bay',
    10: 'than-lan-me', 11: 'phi-long-me', 12: 'quy-bay-me',
    16: 'heo-rung', 76: 'co-may-huy-diet', 82: 'moc-nhan'
};

if (!fs.existsSync(path.join(sourceRoot, 'manifest.json'))) {
    throw new Error(`Missing extracted NRO_NhanVat_Quai_Frames assets at ${sourceRoot}`);
}

const copyTree = (relativeRoot) => {
    const from = path.join(sourceRoot, relativeRoot);
    if (!fs.existsSync(from)) throw new Error(`Missing frame directory: ${from}`);
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const relative = path.join(relativeRoot, entry.name);
        const source = path.join(sourceRoot, relative);
        const parts = relative.split(path.sep);
        if (parts[0] === 'characters') parts[1] = raceFolder[parts[1]] || parts[1];
        if (parts[0] === 'characters') parts[0] = 'character';
        if (parts[0] === 'mobs') parts[0] = 'monster';
        const destination = path.join(outputRoot, ...parts);
        if (entry.isDirectory()) copyTree(relative);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.copyFileSync(source, destination);
        }
    }
};

copyTree('characters');
for (const slug of new Set(Object.values(mobSlugsByTemplateId))) copyTree(path.join('mobs', slug));

const mobs = Object.fromEntries(Object.entries(mobSlugsByTemplateId).map(([id, slug]) => [id, {
    slug,
    stationary: slug === 'moc-nhan',
    idleAction: 'di',
    actions: slug === 'moc-nhan' ? ['chet'] : ['di', 'tancong', 'chet'],
    frameCount: 5
}]));
fs.mkdirSync(path.join(outputRoot, 'data/manifests'), { recursive: true });
fs.writeFileSync(path.join(outputRoot, 'data/manifests/character-monster-frames.json'), `${JSON.stringify({
    source: 'NRO_NhanVat_Quai_Frames',
    characters: ['earth', 'namek', 'saiyan'],
    characterActions: ['dung', 'di', 'bay', 'tancong', 'chuong'],
    characterFrameCount: 5,
    mobs
}, null, 2)}\n`);

console.log(`Prepared 75 character frames and ${Object.keys(mobSlugsByTemplateId).length} mob template mappings in ${outputRoot}`);
