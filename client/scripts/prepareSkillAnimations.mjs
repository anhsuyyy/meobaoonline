import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(clientRoot, '..');
const skillRoot = path.join(clientRoot, 'public/assets/nro/skill/animation');
const manifestRoot = path.join(clientRoot, 'public/assets/nro/data/manifests');
const raceByPlanetId = new Map([[0, 'earth'], [1, 'namek'], [2, 'saiyan']]);
const raceFolder = { earth: 'td', namek: 'nm', saiyan: 'xd' };
const templates = JSON.parse(fs.readFileSync(path.join(projectRoot, 'shared/nro/maps/skill-templates.json'), 'utf8'));
const manifest = {};

for (const [planetClassId, race] of raceByPlanetId) {
    manifest[race] = {};
    for (let slot = 0; slot < 5; slot += 1) {
        const skillId = `s${slot + 1}`;
        const folder = path.join(skillRoot, raceFolder[race], skillId);
        fs.mkdirSync(folder, { recursive: true });
        const frames = Array.from({ length: 3 }, (_, index) => `${skillId}-${index + 1}.png`);
        const existingFrames = frames.filter((filename) => fs.existsSync(path.join(folder, filename)));

        if (existingFrames.length === 0) {
            const keep = path.join(folder, '.gitkeep');
            if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
        }

        const template = templates.find((entry) => entry.planetClassId === planetClassId && entry.slot === slot);
        manifest[race][skillId] = {
            sourceId: template?.id ?? null,
            name: template?.name ?? skillId,
            frames: existingFrames.length === 3
                ? frames.map((filename) => `/assets/nro/skill/animation/${raceFolder[race]}/${skillId}/${filename}`)
                : []
        };
    }
}

fs.mkdirSync(manifestRoot, { recursive: true });
const output = path.join(manifestRoot, 'skill-animations.json');
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared per-skill animation folders for ${Object.keys(manifest).length} races; ${Object.values(manifest).flatMap((skills) => Object.values(skills)).filter((skill) => skill.frames.length === 3).length} complete skill animations found.`);
