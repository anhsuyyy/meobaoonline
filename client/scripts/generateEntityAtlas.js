import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const outputPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/entities/atlas.png');
const jsonPath = outputPath.replace(/\.png$/, '.json');
const frameSize = 48;
const columns = 8;

const characters = {
    meo_bao: { fur: '#c98d58', shade: '#875638', cloth: '#2dd4bf', accent: '#e3b272', prop: 'spots' },
    meo_cu_ta: { fur: '#eea04c', shade: '#9b572f', cloth: '#d65c36', accent: '#f8d07a', prop: 'weights' },
    meowrie_antoinette: { fur: '#fff0dc', shade: '#bfa795', cloth: '#d84f8c', accent: '#ffd36e', prop: 'crown' },
    meo_vu_tru: { fur: '#aa91d8', shade: '#554c83', cloth: '#344f91', accent: '#70d6e7', prop: 'helmet' }
};

const monsters = {
    chuot_nhat: { fur: '#a9a19a', shade: '#5b5753', accent: '#ed9b9b', prop: 'mouse' },
    gian_khong_lo: { fur: '#a86e3c', shade: '#503522', accent: '#e9b958', prop: 'roach' },
    chuot_cong_dot_bien: { fur: '#665c70', shade: '#302b3a', accent: '#a8ec82', prop: 'mutant' },
    nhen_long: { fur: '#8562a8', shade: '#433356', accent: '#f0c4ff', prop: 'spider' },
    ong_vo_ve_bac_ha: { fur: '#8fd5a2', shade: '#34765d', accent: '#f5d76b', prop: 'bee' },
    bo_ngua_dot_bien: { fur: '#a6cf55', shade: '#526b2e', accent: '#eff59b', prop: 'mantis' }
};

const npc = { fur: '#e7e0d1', shade: '#77736c', cloth: '#637c9c', accent: '#f4d47a', prop: 'elder' };
const clipFrames = {
    character: { idle: 2, walk: 2, attack: 2, hit: 1, die: 2 },
    monster: { idle: 2, walk: 2, attack: 2, die: 2 },
    npc: { idle: 2 }
};
const directions = ['down', 'up', 'side'];
const entities = [
    ...Object.entries(characters).map(([id, style]) => ({ id, kind: 'character', style })),
    ...Object.entries(monsters).map(([id, style]) => ({ id, kind: 'monster', style })),
    { id: 'truong_lao_linh_mieu', kind: 'npc', style: npc }
];

function color(value) {
    const hex = value.replace('#', '');
    return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).concat(255);
}

function canvas() {
    const pixels = Buffer.alloc(frameSize * frameSize * 4);
    const put = (x, y, fill) => {
        if (x < 0 || y < 0 || x >= frameSize || y >= frameSize) return;
        pixels.set(fill, (y * frameSize + x) * 4);
    };
    const rect = (x, y, w, h, fill) => {
        for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) put(px, py, fill);
    };
    const ellipse = (cx, cy, rx, ry, fill) => {
        for (let y = cy - ry; y <= cy + ry; y += 1) {
            for (let x = cx - rx; x <= cx + rx; x += 1) {
                if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(x, y, fill);
            }
        }
    };
    const circle = (cx, cy, r, fill) => ellipse(cx, cy, r, r, fill);
    const line = (x0, y0, x1, y1, thickness, fill) => {
        let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let error = dx + dy;
        while (true) {
            circle(x0, y0, Math.ceil(thickness / 2), fill);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * error;
            if (e2 >= dy) { error += dy; x0 += sx; }
            if (e2 <= dx) { error += dx; y0 += sy; }
        }
    };
    return { pixels, put, rect, ellipse, circle, line };
}

const outline = color('#202a24');
const white = color('#fff4dd');
const eye = color('#242d2a');

function paintFace(g, direction, fur, faceOffset = 0) {
    const { circle, rect, line } = g;
    circle(24, 23 + faceOffset, 13, outline);
    circle(24, 22 + faceOffset, 12, fur);
    circle(15, 15 + faceOffset, 5, outline);
    circle(15, 15 + faceOffset, 3, fur);
    circle(33, 15 + faceOffset, 5, outline);
    circle(33, 15 + faceOffset, 3, fur);
    const eyesY = direction === 'up' ? 24 : 23;
    if (direction !== 'up') {
        circle(20, eyesY + faceOffset, 2, white);
        circle(29, eyesY + faceOffset, 2, white);
        circle(direction === 'side' ? 21 : 20, eyesY + faceOffset, 1, eye);
        circle(direction === 'side' ? 30 : 29, eyesY + faceOffset, 1, eye);
        circle(24, 28 + faceOffset, 2, color('#e89095'));
        line(24, 29 + faceOffset, 24, 31 + faceOffset, 1, outline);
        line(24, 31 + faceOffset, 21, 32 + faceOffset, 1, outline);
        line(24, 31 + faceOffset, 27, 32 + faceOffset, 1, outline);
    } else {
        rect(20, 24 + faceOffset, 9, 2, color('#533f4a'));
    }
}

function paintCharacter(g, entity, direction, clip, frame) {
    const { style } = entity;
    const { rect, ellipse, circle, line } = g;
    const bob = clip === 'walk' ? (frame ? -2 : 0) : clip === 'idle' && frame ? -1 : 0;
    const attack = clip === 'attack' && frame === 1;
    const hit = clip === 'hit';
    const fur = color(hit ? '#fffdf6' : style.fur);
    const shade = color(style.shade), cloth = color(style.cloth), accent = color(style.accent);
    const side = direction === 'side';

    line(15, 33 + bob, 9, 38 + bob, 5, outline);
    line(15, 32 + bob, 10, 37 + bob, 3, shade);
    line(31, 32 + bob, 37, 37 + bob, 5, outline);
    line(31, 32 + bob, 36, 37 + bob, 3, fur);
    ellipse(24, 33 + bob, 12, 9, outline);
    ellipse(24, 32 + bob, 11, 8, cloth);
    ellipse(24, 32 + bob, 6, 5, accent);
    rect(16, 39 + (clip === 'walk' && frame ? -2 : 0), 7, 5, outline);
    rect(26, 39 + (clip === 'walk' && !frame ? -2 : 0), 7, 5, outline);
    rect(17, 39 + (clip === 'walk' && frame ? -2 : 0), 5, 3, shade);
    rect(27, 39 + (clip === 'walk' && !frame ? -2 : 0), 5, 3, shade);
    paintFace(g, direction, fur, bob);
    ellipse(24, 34 + bob, 7, 5, color('#f1dcc2'));

    // Silhouette/accessory varies by class so color alone does not identify it.
    if (style.prop === 'spots') {
        circle(19, 31 + bob, 2, outline); circle(29, 34 + bob, 2, outline); circle(23, 38 + bob, 1, shade);
        circle(18, 20 + bob, 1, accent); circle(31, 25 + bob, 1, accent);
    } else if (style.prop === 'weights') {
        line(9, 29 + bob, 5, 24 + bob, 3, outline); line(5, 24 + bob, 3, 20 + bob, 4, accent);
        line(39, 29 + bob, 43, 24 + bob, 3, outline); line(43, 24 + bob, 45, 20 + bob, 4, accent);
        rect(5, 18, 3, 4, shade); rect(43, 18, 3, 4, shade);
    } else if (style.prop === 'crown') {
        rect(16, 8 + bob, 16, 4, outline); rect(17, 8 + bob, 14, 3, accent);
        circle(18, 7 + bob, 2, color('#ec6c91')); circle(24, 5 + bob, 2, accent); circle(30, 7 + bob, 2, color('#ec6c91'));
        ellipse(24, 35 + bob, 14, 4, color('#f6a6c5'));
    } else if (style.prop === 'helmet') {
        circle(24, 22 + bob, 15, outline); circle(24, 22 + bob, 13, color('#6678a4'));
        ellipse(24, 22 + bob, 9, 8, color('#8ee8ef')); ellipse(24, 22 + bob, 6, 5, color('#c9fbf5'));
        circle(17, 20 + bob, 2, color('#fff6ce')); circle(31, 25 + bob, 2, color('#fff6ce'));
        // Restore eyes inside the helmet glass.
        circle(21, 23 + bob, 1, eye); circle(28, 23 + bob, 1, eye);
    }

    if (side) {
        circle(33, 26 + bob, 3, color('#f0a0a0'));
        if (attack) line(35, 31 + bob, 44, 24 + bob, 3, accent);
    } else if (attack) {
        line(33, 31 + bob, 42, 29 + bob, 3, accent);
    }
    if (style.prop === 'weights' && attack) line(39, 30 + bob, 45, 25 + bob, 4, accent);
}

function paintMonster(g, entity, direction, clip, frame) {
    const { style } = entity;
    const { rect, ellipse, circle, line } = g;
    const fur = color(style.fur), shade = color(style.shade), accent = color(style.accent);
    const bob = clip === 'walk' ? (frame ? -2 : 0) : clip === 'idle' && frame ? -1 : 0;
    const attack = clip === 'attack' && frame === 1;
    const die = clip === 'die' && frame === 1;
    const cx = direction === 'side' ? 25 : 24;

    if (style.prop === 'spider') {
        for (let i = 0; i < 4; i += 1) {
            const y = 20 + i * 3 + bob;
            line(16, y, 5, y - 6 + i, 3, outline); line(5, y - 6 + i, 2, y - 9 + i, 2, shade);
            line(32, y, 43, y - 6 + i, 3, outline); line(43, y - 6 + i, 46, y - 9 + i, 2, shade);
        }
    } else if (style.prop === 'mantis') {
        line(16, 28 + bob, 5, 18 + bob, 4, outline); line(5, 18 + bob, 2, 8 + bob, 3, accent);
        line(32, 28 + bob, 43, 18 + bob, 4, outline); line(43, 18 + bob, 46, 8 + bob, 3, accent);
        line(14, 38, 9, 44, 3, outline); line(34, 38, 39, 44, 3, outline);
    } else {
        line(14, 31 + bob, 7, 39 + bob, 3, outline); line(7, 39 + bob, 4, 42 + bob, 2, shade);
        line(33, 31 + bob, 40, 38 + bob, 3, outline);
    }

    if (style.prop === 'bee') {
        ellipse(16, 17 + bob, 6, 8, color('#d9fff0'));
        ellipse(32, 17 + bob, 6, 8, color('#d9fff0'));
        ellipse(cx, 29 + bob, 12, 10, outline);
        ellipse(cx, 28 + bob, 10, 8, fur);
        rect(17, 22 + bob, 16, 3, accent);
        rect(16, 30 + bob, 17, 3, shade);
        line(19, 18 + bob, 17, 12 + bob, 2, outline); line(29, 18 + bob, 31, 12 + bob, 2, outline);
    } else if (style.prop === 'spider') {
        ellipse(cx, 28 + bob, 10, 11, outline); ellipse(cx, 27 + bob, 8, 9, fur);
        circle(cx, 16 + bob, 7, outline); circle(cx, 16 + bob, 5, fur);
    } else if (style.prop === 'mantis') {
        ellipse(cx, 28 + bob, 7, 12, outline); ellipse(cx, 27 + bob, 5, 10, fur);
        circle(cx, 15 + bob, 8, outline); circle(cx, 15 + bob, 6, fur);
    } else {
        ellipse(cx, 30 + bob, 13, 8, outline);
        ellipse(cx, 29 + bob, 11, 6, fur);
        circle(17, 20 + bob, 6, outline); circle(17, 20 + bob, 4, fur);
        circle(31, 20 + bob, 6, outline); circle(31, 20 + bob, 4, fur);
        circle(cx, 21 + bob, 9, outline); circle(cx, 21 + bob, 7, fur);
        circle(20, 23 + bob, 2, white); circle(28, 23 + bob, 2, white);
        circle(20, 23 + bob, 1, eye); circle(28, 23 + bob, 1, eye);
        circle(cx, 27 + bob, 2, accent);
        if (style.prop === 'roach') {
            ellipse(cx, 31 + bob, 8, 5, color('#4c914d'));
            line(20, 15 + bob, 14, 7 + bob, 1, outline); line(28, 15 + bob, 34, 7 + bob, 1, outline);
            rect(22, 25 + bob, 5, 2, accent);
        } else if (style.prop === 'mutant') {
            circle(15, 30 + bob, 3, color('#a8ec82')); circle(34, 29 + bob, 3, color('#a8ec82'));
            rect(21, 17 + bob, 3, 2, color('#f4f18c')); rect(27, 17 + bob, 3, 2, color('#f4f18c'));
        }
    }
    if (die) {
        ellipse(cx, 39, 13, 4, outline);
        ellipse(cx, 38, 10, 3, shade);
    } else if (attack) {
        line(33, 29 + bob, 43, 24 + bob, 4, accent);
    }
}

function paintNpc(g, direction, clip, frame) {
    const { ellipse, circle, rect, line } = g;
    const bob = clip === 'idle' && frame ? -1 : 0;
    ellipse(24, 35 + bob, 15, 9, outline); ellipse(24, 34 + bob, 13, 8, color(npc.cloth));
    rect(17, 39 + bob, 6, 5, outline); rect(26, 39 + bob, 6, 5, outline);
    circle(24, 22 + bob, 14, outline); circle(24, 21 + bob, 12, color(npc.fur));
    circle(15, 14 + bob, 5, outline); circle(15, 14 + bob, 3, color('#d29b9b'));
    circle(33, 14 + bob, 5, outline); circle(33, 14 + bob, 3, color('#d29b9b'));
    if (direction !== 'up') {
        circle(20, 23 + bob, 2, white); circle(29, 23 + bob, 2, white);
        circle(20, 23 + bob, 1, eye); circle(29, 23 + bob, 1, eye);
    }
    // Elder's soft beard, round spectacles and staff distinguish the NPC.
    ellipse(24, 29 + bob, 8, 5, color('#faf2dd'));
    circle(19, 23 + bob, 4, color('#9fe1d9')); circle(29, 23 + bob, 4, color('#9fe1d9'));
    circle(19, 23 + bob, 3, color('#e7e0d1')); circle(29, 23 + bob, 3, color('#e7e0d1'));
    rect(5, 16, 2, 29, outline); rect(6, 16, 1, 28, color('#986941'));
    circle(6, 14, 4, color(npc.accent)); circle(6, 14, 2, color('#fff2bb'));
    line(16, 10 + bob, 24, 6 + bob, 3, outline); line(24, 6 + bob, 32, 10 + bob, 3, outline);
    line(17, 10 + bob, 24, 8 + bob, 2, color(npc.accent)); line(24, 8 + bob, 31, 10 + bob, 2, color(npc.accent));
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
    const typeBytes = Buffer.from(type);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([length, typeBytes, data, checksum]);
}

function encodePng(width, height, pixels) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
    const stride = width * 4;
    const scanlines = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
        scanlines[y * (stride + 1)] = 0;
        pixels.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND')
    ]);
}

const allFrames = [];
for (const entity of entities) {
    const clips = clipFrames[entity.kind];
    for (const [clip, count] of Object.entries(clips)) {
        for (const direction of directions) {
            for (let frame = 0; frame < count; frame += 1) {
                const image = canvas();
                if (entity.kind === 'character') paintCharacter(image, entity, direction, clip, frame);
                else if (entity.kind === 'monster') paintMonster(image, entity, direction, clip, frame);
                else paintNpc(image, direction, clip, frame);
                allFrames.push({
                    name: `${entity.id}_${clip}_${direction}_${String(frame).padStart(2, '0')}`,
                    pixels: image.pixels
                });
            }
        }
    }
}

const rows = Math.ceil(allFrames.length / columns);
const width = columns * frameSize;
const height = rows * frameSize;
const atlasPixels = Buffer.alloc(width * height * 4);
const frameData = {};
allFrames.forEach(({ name, pixels }, index) => {
    const x = (index % columns) * frameSize;
    const y = Math.floor(index / columns) * frameSize;
    for (let row = 0; row < frameSize; row += 1) {
        pixels.copy(atlasPixels, ((y + row) * width + x) * 4, row * frameSize * 4, (row + 1) * frameSize * 4);
    }
    frameData[name] = {
        frame: { x, y, w: frameSize, h: frameSize },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: frameSize, h: frameSize },
        sourceSize: { w: frameSize, h: frameSize }
    };
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, encodePng(width, height, atlasPixels));
fs.writeFileSync(jsonPath, `${JSON.stringify({
    frames: frameData,
    meta: {
        app: 'Mèo Đa Vũ Trụ Online procedural entity atlas',
        version: '1.0', image: 'atlas.png', format: 'RGBA8888',
        size: { w: width, h: height }, scale: '1'
    }
}, null, 2)}\n`);
console.log(`Generated ${allFrames.length} frames (${width}x${height}) for ${entities.length} entities at ${outputPath}`);
