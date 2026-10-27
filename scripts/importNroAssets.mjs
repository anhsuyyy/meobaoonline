import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const assetRoot = path.resolve(projectRoot, 'client/nro-source-archive');
const sqlPath = process.argv[2];
const outputRoot = process.argv[3] ? path.resolve(projectRoot, process.argv[3]) : projectRoot;
if (!sqlPath) {
    throw new Error('Usage: node scripts/importNroAssets.mjs <path-to-ngocrong.sql> [output-root]');
}

function readSqlRows(sql, tableName) {
    const marker = `INSERT INTO \`${tableName}\``;
    const rows = [];
    let searchAt = 0;

    while (true) {
        const insertAt = sql.indexOf(marker, searchAt);
        if (insertAt < 0) break;
        const valuesAt = sql.indexOf('VALUES', insertAt);
        if (valuesAt < 0) break;
        let cursor = valuesAt + 'VALUES'.length;
        searchAt = cursor;

        while (cursor < sql.length) {
            while (/\s|,/.test(sql[cursor] || '')) cursor++;
            if (sql[cursor] !== '(') break;
            cursor++;
            const values = [];
            let token = '';
            let quoted = false;

            while (cursor < sql.length) {
                const char = sql[cursor++];
                if (quoted && char === '\\' && cursor < sql.length) {
                    token += char + sql[cursor++];
                } else if (char === "'") {
                    if (quoted && sql[cursor] === "'") {
                        token += "''";
                        cursor++;
                    } else {
                        quoted = !quoted;
                        token += char;
                    }
                } else if (!quoted && (char === ',' || char === ')')) {
                    values.push(token.trim());
                    token = '';
                    if (char === ')') break;
                } else {
                    token += char;
                }
            }

            rows.push(values);
        }
    }
    return rows;
}

function decodeSqlString(value) {
    if (value === 'NULL') return null;
    if (!value.startsWith("'") || !value.endsWith("'")) return value;
    const input = value.slice(1, -1);
    let output = '';
    for (let index = 0; index < input.length; index++) {
        const char = input[index];
        if (char === '\\' && index + 1 < input.length) {
            const next = input[++index];
            output += ({ '0': '\0', n: '\n', r: '\r', t: '\t', b: '\b', Z: '\x1a' })[next] ?? next;
        } else if (char === "'" && input[index + 1] === "'") {
            output += "'";
            index++;
        } else {
            output += char;
        }
    }
    return output;
}

function decodeJsonList(sqlValue, legacyQuotes = false) {
    const text = decodeSqlString(sqlValue);
    if (!text) return [];
    const normalized = legacyQuotes
        ? text.replace(/\["\[/g, '[[').replace(/\]"\]/g, ']]').replace(/","/g, ',')
        : text;
    try {
        return JSON.parse(normalized);
    } catch {
        return [];
    }
}

function readMapTiles(mapId) {
    const filePath = path.join(assetRoot, 'map', String(mapId));
    if (!fs.existsSync(filePath)) return null;
    const bytes = fs.readFileSync(filePath);
    const width = bytes.readUInt8(0);
    const height = bytes.readUInt8(1);
    if (!width || !height || bytes.length < width * height + 2) return null;
    const tiles = [];
    let offset = 2;
    for (let y = 0; y < height; y++) {
        tiles.push(Array.from(bytes.subarray(offset, offset + width)));
        offset += width;
    }
    return { width, height, tiles };
}

function readTileSets() {
    const filePath = path.join(assetRoot, 'KhanhDTK/map/tile_set_info');
    if (!fs.existsSync(filePath)) return [];
    const bytes = fs.readFileSync(filePath);
    let offset = 0;
    const setCount = bytes.readUInt8(offset++);
    const sets = [];
    for (let setId = 0; setId < setCount; setId++) {
        const typeCount = bytes.readUInt8(offset++);
        const tileTypes = [];
        for (let index = 0; index < typeCount; index++) {
            const type = bytes.readInt32BE(offset);
            offset += 4;
            const tileCount = bytes.readUInt8(offset++);
            const tiles = Array.from(bytes.subarray(offset, offset + tileCount));
            offset += tileCount;
            tileTypes.push({ type, tiles });
        }
        sets.push({ setId: setId + 1, tileTypes });
    }
    return sets;
}

const sql = fs.readFileSync(path.resolve(sqlPath), 'utf8');
const rows = readSqlRows(sql, 'map_template');
const maps = rows.map((row) => {
    const id = Number(row[0]);
    const data = decodeJsonList(row[2]);
    return {
        id,
        name: decodeSqlString(row[1]),
        type: Number(data[0] ?? 0),
        planetId: Number(data[1] ?? 0),
        bgType: Number(data[2] ?? 0),
        tileId: Number(data[3] ?? 0),
        bgId: Number(data[4] ?? 0),
        zones: Number(row[3] ?? 0),
        maxPlayers: Number(row[4] ?? 0),
        waypoints: decodeJsonList(row[5], true),
        mobs: decodeJsonList(row[6], true),
        npcs: decodeJsonList(row[7], true),
        effects: decodeJsonList(row[10]),
        map: readMapTiles(id),
    };
}).filter((map) => map.map);
if (!maps.length) {
    throw new Error(`No binary maps found under ${path.join(assetRoot, 'map')}; refusing to overwrite the map catalog with an empty list.`);
}

const parts = readSqlRows(sql, 'part').map((row) => ({
    id: Number(row[0]),
    type: Number(row[1]),
    frames: decodeJsonList(row[2]),
}));
const mobTemplates = readSqlRows(sql, 'mob_template').map((row) => ({
    id: Number(row[0]),
    type: Number(row[1]),
    name: decodeSqlString(row[2]),
    hp: Number(row[3]),
    rangeMove: Number(row[4]),
    speed: Number(row[5]),
    dartType: Number(row[6]),
    damagePercent: Number(row[7]),
    potentialPercent: Number(row[8]),
}));
const npcTemplates = readSqlRows(sql, 'npc_template').map((row) => ({
    id: Number(row[0]),
    name: decodeSqlString(row[1]),
    head: Number(row[2]),
    body: Number(row[3]),
    leg: Number(row[4]),
}));
const itemTemplates = readSqlRows(sql, 'item_template').map((row) => ({
    id: Number(row[0]),
    type: Number(row[1]),
    gender: Number(row[2]),
    name: decodeSqlString(row[3]),
    description: decodeSqlString(row[4]),
    iconId: Number(row[5]),
    partId: Number(row[6]),
    stackable: Number(row[7]) === 1,
    powerRequired: Number(row[8]),
}));
const shopEntries = readSqlRows(sql, 'item_shop').map((row) => ({
    id: Number(row[0]),
    tabId: Number(row[1]),
    templateId: Number(row[2]),
    gold: Number(row[3]),
    gem: Number(row[4]),
    isNew: Number(row[5]) === 1,
    isSellable: Number(row[6]) === 1,
    exchangeTemplateId: Number(row[7]),
    exchangeQuantity: Number(row[8]),
}));
const itemOptions = readSqlRows(sql, 'item_option_template').map((row) => ({
    id: Number(row[0]),
    name: decodeSqlString(row[1]),
    type: Number(row[2]),
}));
const shopItemOptions = readSqlRows(sql, 'item_shop_option').map((row) => ({
    shopEntryId: Number(row[0]),
    optionId: Number(row[1]),
    parameter: Number(row[2]),
    id: Number(row[3]),
}));
const skillTemplates = readSqlRows(sql, 'skill_template').map((row) => ({
    planetClassId: Number(row[0]),
    id: Number(row[1]),
    name: decodeSqlString(row[2]),
    maxLevel: Number(row[3]),
    manaUseType: Number(row[4]),
    type: Number(row[5]),
    iconId: Number(row[6]),
    damageInfo: decodeSqlString(row[7]),
    slot: Number(row[8]),
    levels: decodeJsonList(row[9]),
    description: decodeSqlString(row[10]),
}));
const captions = readSqlRows(sql, 'caption').map((row) => ({
    id: Number(row[0]),
    earth: decodeSqlString(row[1]),
    saiyan: decodeSqlString(row[2]),
    namek: decodeSqlString(row[3]),
    power: Number(row[4]),
})).sort((a, b) => a.id - b.id);
if (!captions.length) throw new Error('The SQL source has no caption power thresholds.');
const powerLimits = readSqlRows(sql, 'power_limit').map((row) => ({
    id: Number(row[0]),
    power: Number(row[1]),
    hp: Number(row[2]),
    mp: Number(row[3]),
    damage: Number(row[4]),
    defense: Number(row[5]),
    critical: Number(row[6]),
})).sort((a, b) => a.id - b.id);
if (!powerLimits.length) throw new Error('The SQL source has no power limits.');
const shopTemplates = readSqlRows(sql, 'shop').map((row) => ({
    id: Number(row[0]),
    npcId: Number(row[1]),
    order: Number(row[2]),
}));
const shopTabs = readSqlRows(sql, 'tab_shop').map((row) => ({
    id: Number(row[0]),
    shopId: Number(row[1]),
    name: decodeSqlString(row[2]),
}));
const taskMainTemplates = readSqlRows(sql, 'task_main_template').map((row) => ({
    id: Number(row[0]),
    name: decodeSqlString(row[1]),
    detail: decodeSqlString(row[2]),
    subtasks: [],
}));
for (const row of readSqlRows(sql, 'task_sub_template')) {
    const task = taskMainTemplates.find((entry) => entry.id === Number(row[0]));
    if (!task) continue;
    task.subtasks.push({
        order: task.subtasks.length,
        name: decodeSqlString(row[1]),
        maxCount: Number(row[2]),
        notify: decodeSqlString(row[3]),
        npcId: Number(row[4]),
        mapId: Number(row[5]),
    });
}

const rewardDirectory = path.resolve(path.dirname(sqlPath), 'Server/resources/KhanhDTK/data/data_mob_reward');
const mobRewards = new Map();
if (fs.existsSync(rewardDirectory)) {
    for (const filename of fs.readdirSync(rewardDirectory).filter((name) => name.endsWith('.txt')).sort()) {
        const category = path.basename(filename, '.txt');
        const content = fs.readFileSync(path.join(rewardDirectory, filename), 'utf8');
        for (const line of content.split(/\r?\n/).filter(Boolean)) {
            const [mobValue, ...rewardValues] = line.replace(/[{}\[\]]/g, '').split('|');
            const mobTemplateId = Number(mobValue);
            if (!Number.isInteger(mobTemplateId)) continue;
            const entries = mobRewards.get(mobTemplateId) || [];
            for (const rewardValue of rewardValues) {
                const [mapList = '', itemList = '', ratio = '0', typeRatio = '0', allGender = '0'] = rewardValue.split(',');
                for (const templateValue of itemList.split(';')) {
                    const templateId = Number(templateValue);
                    if (!Number.isInteger(templateId)) continue;
                    entries.push({
                        category,
                        mapIds: mapList.split(';').map(Number).filter(Number.isInteger),
                        templateId,
                        ratio: Number(ratio) || 0,
                        typeRatio: Number(typeRatio) || 0,
                        forAllGender: Number(allGender) === 1,
                    });
                }
            }
            mobRewards.set(mobTemplateId, entries);
        }
    }
}

// RewardService contains the source game's base-stat table for equipment
// dropped by mobs. Extract the table as data so the web server never loads or
// executes Java code, while keeping future asset imports reproducible.
function extractMobDropBaseOptions(javaSource) {
    const start = javaSource.indexOf('public void initBaseOptionClothes');
    const end = javaSource.indexOf('private void initBaseOptionSaoPhaLe', start);
    if (start < 0 || end < 0) return {};
    const method = javaSource.slice(start, end).replace(/\/\/[^\r\n]*/g, '');
    const typeSwitch = method.indexOf('switch (type)');
    const typeOpen = method.indexOf('{', typeSwitch);
    if (typeSwitch < 0 || typeOpen < 0) return {};

    const typeCases = [];
    let depth = 1;
    let lineStart = typeOpen + 1;
    for (let index = typeOpen + 1; index < method.length; index++) {
        if (depth === 1) {
            const match = method.slice(lineStart, index + 1).match(/^\s*case\s+(\d+)\s*:\s*$/);
            if (match) typeCases.push({ type: Number(match[1]), start: lineStart });
        }
        if (method[index] === '{') depth++;
        else if (method[index] === '}') depth--;
        if (method[index] === '\n') lineStart = index + 1;
        if (depth === 0) break;
    }

    const result = {};
    for (let index = 0; index < typeCases.length; index++) {
        const section = method.slice(typeCases[index].start, typeCases[index + 1]?.start ?? method.length);
        const innerSwitch = section.indexOf('switch (tempId)');
        if (innerSwitch < 0) continue;
        const defaults = Object.fromEntries([...section.slice(0, innerSwitch).matchAll(
            /option_param\[(\d+)\]\[(\d+)\]\s*=\s*(-?\d+)\s*;/g
        )].map(([, row, column, value]) => [`${row}:${column}`, Number(value)]));
        const caseBodyStart = section.indexOf('{', innerSwitch) + 1;
        let caseBodyEnd = caseBodyStart;
        let innerDepth = 1;
        for (; caseBodyEnd < section.length; caseBodyEnd++) {
            if (section[caseBodyEnd] === '{') innerDepth++;
            else if (section[caseBodyEnd] === '}' && --innerDepth === 0) break;
        }
        const cases = section.slice(caseBodyStart, caseBodyEnd);
        for (const [, itemId, body] of cases.matchAll(/case\s+(\d+)\s*:\s*([\s\S]*?)\bbreak\s*;/g)) {
            const values = { ...defaults };
            for (const [, row, column, value] of body.matchAll(
                /option_param\[(\d+)\]\[(\d+)\]\s*=\s*(-?\d+)\s*;/g
            )) values[`${row}:${column}`] = Number(value);
            const options = [];
            for (let row = 0; row < 5; row++) {
                const optionId = values[`${row}:0`] ?? -1;
                const param = values[`${row}:1`] ?? -1;
                if (optionId >= 0 && param >= 0) options.push({ optionId, param });
            }
            if (options.length) result[`${typeCases[index].type}:${itemId}`] = options;
        }
    }
    return result;
}

const rewardServicePath = path.resolve(path.dirname(sqlPath), 'Server/src/main/java/nro/services/RewardService.java');
const mobDropBaseOptions = fs.existsSync(rewardServicePath)
    ? extractMobDropBaseOptions(fs.readFileSync(rewardServicePath, 'utf8')) : {};

const outputDir = path.resolve(outputRoot, 'client/public/assets/nro/maps');
const sharedOutputDir = path.resolve(outputRoot, 'shared/nro/maps');
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(sharedOutputDir, { recursive: true });
const outputs = {
    'catalog.json': JSON.stringify(maps),
    'tile-sets.json': JSON.stringify(readTileSets()),
    'parts.json': JSON.stringify(parts),
    'map-0.json': JSON.stringify(maps.find((map) => map.id === 0) ?? null),
    'mob-templates.json': JSON.stringify(mobTemplates),
    'npc-templates.json': JSON.stringify(npcTemplates),
    'item-templates.json': JSON.stringify(itemTemplates),
    'item-shop.json': JSON.stringify(shopEntries),
    'item-options.json': JSON.stringify(itemOptions),
    'item-shop-options.json': JSON.stringify(shopItemOptions),
    'mob-rewards.json': JSON.stringify([...mobRewards].map(([mobTemplateId, rewards]) => ({ mobTemplateId, rewards }))),
    'mob-drop-base-options.json': JSON.stringify(mobDropBaseOptions),
    'skill-templates.json': JSON.stringify(skillTemplates),
    'captions.json': JSON.stringify(captions),
    'power-limits.json': JSON.stringify(powerLimits),
    'shops.json': JSON.stringify(shopTemplates),
    'shop-tabs.json': JSON.stringify(shopTabs),
    'tasks.json': JSON.stringify(taskMainTemplates),
};
for (const [filename, content] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(sharedOutputDir, filename), `${content}\n`);
    fs.writeFileSync(path.join(outputDir, filename), `${content}\n`);
}
console.log(`Imported ${maps.length} maps, ${parts.length} character parts, ${mobTemplates.length} mob templates, ${npcTemplates.length} NPC templates, ${itemTemplates.length} items, ${shopEntries.length} shop entries, ${itemOptions.length} item options, ${shopItemOptions.length} shop item options, ${mobRewards.size} mob reward templates, ${Object.keys(mobDropBaseOptions).length} mob-drop base-option entries, ${skillTemplates.length} skill templates, ${taskMainTemplates.length} main tasks and tile-set collision metadata.`);
