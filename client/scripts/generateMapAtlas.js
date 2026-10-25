import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, '../public/assets/maps/chuong-0-tram-cao');
const tileSize = 32;

const tiles = [
    { name: 'ground_grass_00', paint: paintGrassOne },
    { name: 'ground_grass_01', paint: paintGrassTwo },
    { name: 'ground_path_00', paint: paintPath },
    { name: 'decor_flower_yellow_00', paint: (put) => paintFlower(put, [247, 204, 72]) },
    { name: 'decor_flower_pink_00', paint: (put) => paintFlower(put, [232, 128, 174]) },
    { name: 'obstacle_rock_00', paint: paintRock },
    { name: 'obstacle_tree_00', paint: paintTree },
    { name: 'ground_water_00', paint: paintWater }
];

function createCanvas(width, height) {
    const pixels = Buffer.alloc(width * height * 4);
    const put = (x, y, color) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        pixels.set(color, (y * width + x) * 4);
    };
    const rect = (x, y, w, h, color) => {
        for (let py = y; py < y + h; py += 1) {
            for (let px = x; px < x + w; px += 1) put(px, py, color);
        }
    };
    const circle = (cx, cy, radius, color) => {
        for (let y = cy - radius; y <= cy + radius; y += 1) {
            for (let x = cx - radius; x <= cx + radius; x += 1) {
                if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) put(x, y, color);
            }
        }
    };
    return { pixels, put, rect, circle };
}

function paintGrassOne({ put, rect }) {
    rect(0, 0, 32, 32, [79, 155, 85, 255]);
    [[4, 6], [21, 4], [12, 22], [27, 27]].forEach(([x, y]) => put(x, y, [120, 189, 101, 255]));
    [[8, 16], [24, 13], [3, 28]].forEach(([x, y]) => put(x, y, [52, 115, 66, 255]));
}

function paintGrassTwo({ put, rect }) {
    rect(0, 0, 32, 32, [69, 145, 78, 255]);
    [[6, 10], [19, 18], [28, 5], [11, 28]].forEach(([x, y]) => put(x, y, [135, 198, 111, 255]));
    [[27, 22], [2, 20], [16, 6]].forEach(([x, y]) => put(x, y, [49, 111, 63, 255]));
}

function paintPath({ rect }) {
    rect(0, 0, 32, 32, [185, 130, 85, 255]);
    rect(2, 3, 12, 7, [202, 151, 101, 255]);
    rect(17, 2, 12, 9, [169, 112, 74, 255]);
    rect(4, 14, 10, 7, [166, 111, 74, 255]);
    rect(17, 14, 13, 8, [199, 145, 97, 255]);
    rect(1, 24, 14, 6, [203, 153, 104, 255]);
    rect(19, 25, 11, 5, [160, 106, 73, 255]);
}

function paintFlower({ put, circle }, petal) {
    circle(16, 12, 3, petal);
    circle(11, 16, 3, petal);
    circle(21, 16, 3, petal);
    circle(13, 21, 3, petal);
    circle(19, 21, 3, petal);
    circle(16, 17, 2, [251, 228, 126, 255]);
    put(16, 22, [55, 115, 62, 255]);
    put(16, 24, [55, 115, 62, 255]);
}

function paintRock({ rect, put }) {
    rect(8, 13, 16, 9, [48, 58, 55, 255]);
    rect(6, 15, 20, 6, [48, 58, 55, 255]);
    rect(9, 12, 14, 8, [104, 116, 120, 255]);
    rect(12, 10, 9, 3, [163, 175, 176, 255]);
    put(11, 14, [193, 202, 199, 255]);
    rect(10, 20, 13, 2, [72, 82, 81, 255]);
}

function paintTree({ circle, rect }) {
    rect(14, 17, 5, 12, [105, 69, 47, 255]);
    circle(16, 13, 10, [32, 42, 36, 255]);
    circle(14, 11, 9, [43, 118, 65, 255]);
    circle(12, 9, 5, [74, 161, 81, 255]);
    circle(19, 13, 5, [54, 137, 70, 255]);
}

function paintWater({ rect, put }) {
    rect(0, 0, 32, 32, [59, 155, 176, 255]);
    rect(3, 7, 12, 1, [116, 209, 197, 255]);
    rect(19, 14, 10, 1, [116, 209, 197, 255]);
    rect(5, 24, 14, 1, [116, 209, 197, 255]);
    put(21, 7, [37, 127, 153, 255]);
    put(8, 18, [37, 127, 153, 255]);
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
    const typeBuffer = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
    return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width, height, pixels) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const stride = width * 4;
    const scanlines = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
        const rowOffset = y * (stride + 1);
        scanlines[rowOffset] = 0;
        pixels.copy(scanlines, rowOffset + 1, y * stride, (y + 1) * stride);
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', deflateSync(scanlines)),
        pngChunk('IEND')
    ]);
}

const width = tiles.length * tileSize;
const atlas = createCanvas(width, tileSize);
const frames = {};
tiles.forEach((tile, index) => {
    const tileCanvas = createCanvas(tileSize, tileSize);
    tile.paint(tileCanvas);
    for (let y = 0; y < tileSize; y += 1) {
        for (let x = 0; x < tileSize; x += 1) {
            const sourceOffset = (y * tileSize + x) * 4;
            atlas.put(index * tileSize + x, y, [...tileCanvas.pixels.subarray(sourceOffset, sourceOffset + 4)]);
        }
    }
    frames[tile.name] = {
        frame: { x: index * tileSize, y: 0, w: tileSize, h: tileSize },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: tileSize, h: tileSize },
        sourceSize: { w: tileSize, h: tileSize }
    };
});

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'atlas.png'), encodePng(width, tileSize, atlas.pixels));
fs.writeFileSync(path.join(outputDir, 'atlas.json'), `${JSON.stringify({
    frames,
    meta: {
        app: 'Mèo Đa Vũ Trụ Online procedural map atlas',
        version: '1.0',
        image: 'atlas.png',
        format: 'RGBA8888',
        size: { w: width, h: tileSize },
        scale: '1'
    }
}, null, 2)}\n`);

console.log(`Generated ${tiles.length} frames (${width}x${tileSize}) at ${outputDir}`);
