import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importScript = path.join(projectRoot, 'scripts/importNroAssets.mjs');
const sqlPath = process.argv[2] ? path.resolve(process.argv[2]) : '';

if (!sqlPath || !fs.existsSync(sqlPath)) {
    throw new Error('Usage: node scripts/verifyNroImporter.mjs <path-to-ngocrong.sql>');
}

function collectJsonHashes(root, ignoredFiles = new Set()) {
    if (!fs.existsSync(root)) throw new Error(`Importer did not create output folder: ${root}`);
    const files = new Map();
    const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const filePath = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(filePath);
            else if (entry.isFile() && entry.name.endsWith('.json')) {
                const relativePath = path.relative(root, filePath).split(path.sep).join('/');
                if (ignoredFiles.has(relativePath)) continue;
                const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
                files.set(relativePath, hash);
            }
        }
    };
    visit(root);
    return files;
}

function assertSameFiles(expected, actual, label) {
    const differences = [];
    for (const [file, hash] of expected) {
        if (actual.get(file) !== hash) differences.push(file);
    }
    for (const file of actual.keys()) {
        if (!expected.has(file)) differences.push(`${file} (unexpected)`);
    }
    if (differences.length) {
        throw new Error(`${label} differs: ${differences.slice(0, 12).join(', ')}`);
    }
}

function runImport(outputRoot) {
    const result = spawnSync(process.execPath, [importScript, sqlPath, outputRoot], {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024
    });
    if (result.status !== 0) {
        throw new Error(`Importer failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
    }
    const summary = result.stdout.match(/Imported (\d+) maps, (\d+) character parts,.*?, (\d+) mob reward templates, (\d+) mob-drop base-option entries/);
    if (!summary) throw new Error(`Importer summary was not recognized:\n${result.stdout}`);
    const [, mapCount, partCount, rewardCount, baseOptionCount] = summary.map(Number);
    if (mapCount !== 163 || partCount !== 2042 || rewardCount !== 82 || baseOptionCount !== 169) {
        throw new Error(`Source import is incomplete: maps=${mapCount}, parts=${partCount}, rewards=${rewardCount}, baseOptions=${baseOptionCount}. Check that the full RAR source is extracted beside the SQL.`);
    }
    return result.stdout.trim();
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nro-import-verification-'));
try {
    const firstOutput = path.join(temporaryRoot, 'first');
    const secondOutput = path.join(temporaryRoot, 'second');
    const firstSummary = runImport(firstOutput);
    const secondSummary = runImport(secondOutput);
    if (firstSummary !== secondSummary) throw new Error('Importer summary changed between runs.');

    let checkedFiles = 0;
    for (const outputPath of [
        'shared/nro/maps',
        'client/public/assets/nro/maps'
    ]) {
        const first = collectJsonHashes(path.join(firstOutput, outputPath));
        const second = collectJsonHashes(path.join(secondOutput, outputPath));
        const current = collectJsonHashes(path.join(projectRoot, outputPath),
            outputPath === 'client/public/assets/nro/maps' ? new Set(['runtime-assets.json']) : new Set());
        assertSameFiles(first, second, `${outputPath} is not repeatable`);
        assertSameFiles(current, first, `${outputPath} does not match the current runtime`);
        checkedFiles += first.size;
    }

    console.log('NRO importer verification passed.');
    console.log(`Two runs match the checked-in runtime across ${checkedFiles} JSON files.`);
    console.log(firstSummary);
} finally {
    const tempRoot = path.resolve(os.tmpdir());
    if (!temporaryRoot.startsWith(`${tempRoot}${path.sep}`)) {
        throw new Error(`Refusing to remove unexpected temporary path: ${temporaryRoot}`);
    }
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
