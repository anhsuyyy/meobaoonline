import fs from 'fs';
import { Buffer } from 'node:buffer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicAssetsDir = path.resolve(__dirname, '../public/assets');

// Danh sách các thư mục cần tạo
const directories = [
    'characters/meo-bao',
    'characters/meowrie-antoinette',
    'characters/meo-vu-tru',
    'characters/meo-cu-ta',
    'monsters/chuot-nhat',
    'monsters/nhen-long',
    'monsters/cau-quy',
    'maps/chuong-0-tram-cao',
    'skills/icons',
    'ui/frames',
    'ui/minimap'
];

directories.forEach(dir => {
    const fullPath = path.join(publicAssetsDir, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

// Helper tạo SVG pixel-art placeholder có nhãn rõ ràng
function createSvgPlaceholder(text, color, bg, width = 64, height = 64) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}" rx="6" stroke="${color}" stroke-width="2"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="${Math.max(10, Math.floor(width/4))}" fill="${color}">${text}</text>
</svg>`;
}

// 1x1 transparent/colored PNG base64 để làm placeholder an toàn
const png1x1Base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const pngBuffer = Buffer.from(png1x1Base64, 'base64');

// Danh sách file ảnh cần có
const files = [
    // Mèo Báo
    { path: 'characters/meo-bao/portrait.png', text: '🐱', color: '#2dd4bf', bg: '#042f2e' },
    { path: 'characters/meo-bao/idle.png', text: '🐱', color: '#2dd4bf', bg: '#042f2e' },
    { path: 'characters/meo-bao/walk.png', text: '🐾', color: '#2dd4bf', bg: '#042f2e' },
    { path: 'characters/meo-bao/attack.png', text: '⚡', color: '#2dd4bf', bg: '#042f2e' },

    // Các class khác
    { path: 'characters/meowrie-antoinette/portrait.png', text: '👑', color: '#f472b6', bg: '#500724' },
    { path: 'characters/meowrie-antoinette/idle.png', text: '👑', color: '#f472b6', bg: '#500724' },
    { path: 'characters/meo-vu-tru/portrait.png', text: '🔮', color: '#c084fc', bg: '#3b0764' },
    { path: 'characters/meo-vu-tru/idle.png', text: '🔮', color: '#c084fc', bg: '#3b0764' },
    { path: 'characters/meo-cu-ta/portrait.png', text: '🦁', color: '#fb923c', bg: '#431407' },
    { path: 'characters/meo-cu-ta/idle.png', text: '🦁', color: '#fb923c', bg: '#431407' },

    // Quái vật
    { path: 'monsters/chuot-nhat/idle.png', text: '🐭', color: '#facc15', bg: '#422006' },
    { path: 'monsters/chuot-nhat/attack.png', text: '💥', color: '#facc15', bg: '#422006' },
    { path: 'monsters/nhen-long/idle.png', text: '🕷️', color: '#94a3b8', bg: '#0f172a' },
    { path: 'monsters/nhen-long/attack.png', text: '🕸️', color: '#94a3b8', bg: '#0f172a' },
    { path: 'monsters/cau-quy/idle.png', text: '👁️', color: '#e879f9', bg: '#3b0764' },
    { path: 'monsters/cau-quy/attack.png', text: '🔥', color: '#e879f9', bg: '#3b0764' },

    // Bản đồ
    { path: 'maps/chuong-0-tram-cao/background.png', text: '🌿 MAP CHƯƠNG 0', color: '#22c55e', bg: '#064e3b', w: 1280, h: 720 },
    { path: 'maps/chuong-0-tram-cao/river.png', text: '🌊 SÔNG BẠC HÀ', color: '#38bdf8', bg: '#075985', w: 300, h: 720 },

    // Kỹ năng
    { path: 'skills/icons/s1-cao-co-ban.png', text: '🐾', color: '#38bdf8', bg: '#0c4a6e' },
    { path: 'skills/icons/s2-phun-lua.png', text: '🔥', color: '#f97316', bg: '#7c2d12' },
    { path: 'skills/icons/s3-bao-mong-vuot.png', text: '🌪️', color: '#c084fc', bg: '#581c87' },
    { path: 'skills/icons/s4-tieng-gam.png', text: '⚡', color: '#facc15', bg: '#713f12' },
    { path: 'skills/icons/s5-hoi-phuc.png', text: '🌿', color: '#4ade80', bg: '#14532d' },

    // UI
    { path: 'ui/minimap/chuong-0.png', text: 'MAP', color: '#fbbf24', bg: '#1e293b', w: 120, h: 120 },
    { path: 'ui/frames/portrait-frame.png', text: 'FRAME', color: '#d97706', bg: '#292524', w: 64, h: 64 }
];

files.forEach(f => {
    const fullPath = path.join(publicAssetsDir, f.path);
    if (!fs.existsSync(fullPath)) {
        // Ghi file PNG hợp lệ
        fs.writeFileSync(fullPath, pngBuffer);
    }
    // Ghi kèm file svg trực quan để xem trước
    const svgPath = fullPath.replace(/\.png$/, '.svg');
    if (!fs.existsSync(svgPath)) {
        fs.writeFileSync(svgPath, createSvgPlaceholder(f.text, f.color, f.bg, f.w || 64, f.h || 64));
    }
});

console.log('✅ Asset directory structure and placeholders generated successfully!');
