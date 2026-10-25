/**
 * Asset Manifest - Danh mục quản lý Asset tập trung cho "Mèo Đa Vũ Trụ Online"
 * 
 * Hướng dẫn thay thế asset:
 * - Để thay thế hình ảnh nhân vật, quái, bản đồ hoặc kỹ năng, chỉ cần sao chép file ảnh mới
 *   vào đúng đường dẫn quy định bên dưới, giữ nguyên tên file (định dạng PNG/SVG).
 * - Sau khi copy và refresh trình duyệt, game sẽ tự động nhận ảnh mới mà không cần sửa code.
 * - Nếu file ảnh chưa có trên đĩa, Phaser Engine sẽ tự động kích hoạt bộ Fallback Procedural
 *   để vẽ đồ họa thay thế sắc nét, đảm bảo màn hình không bao giờ bị đen hoặc crash.
 */

export const ASSET_MANIFEST = {
    // 1. Nhân vật & Các Lớp Nhân Vật (Classes / Skins)
    characters: {
        'meo-bao': {
            id: 'meo-bao',
            name: 'Mèo Báo (Vua Cào)',
            description: 'Sát thủ cơ động nhanh nhẹn, đòn đánh dồn dập và bạo kích cao',
            portrait: '/assets/characters/meo-bao/portrait.png',
            idle: '/assets/characters/meo-bao/idle.png',
            walk: '/assets/characters/meo-bao/walk.png',
            attack: '/assets/characters/meo-bao/attack.png',
            frameWidth: 48,
            frameHeight: 48,
            fallbackColor: 0x14b8a6,
            strokeColor: 0x2dd4bf,
            emoji: '🐱'
        },
        'meowrie-antoinette': {
            id: 'meowrie-antoinette',
            name: 'Meowrie Antoinette (Quý Tộc)',
            description: 'Pháp sư quý tộc điều khiển ma thuật ánh sáng và bánh kem',
            portrait: '/assets/characters/meowrie-antoinette/portrait.png',
            idle: '/assets/characters/meowrie-antoinette/idle.png',
            walk: '/assets/characters/meowrie-antoinette/walk.png',
            attack: '/assets/characters/meowrie-antoinette/attack.png',
            frameWidth: 48,
            frameHeight: 48,
            fallbackColor: 0xec4899,
            strokeColor: 0xf472b6,
            emoji: '👑'
        },
        'meo-vu-tru': {
            id: 'meo-vu-tru',
            name: 'Mèo Vũ Trụ (Nhà Chiêm Tinh)',
            description: 'Thuật sĩ kiểm soát không gian, tạo hố đen và bão sao băng',
            portrait: '/assets/characters/meo-vu-tru/portrait.png',
            idle: '/assets/characters/meo-vu-tru/idle.png',
            walk: '/assets/characters/meo-vu-tru/walk.png',
            attack: '/assets/characters/meo-vu-tru/attack.png',
            frameWidth: 48,
            frameHeight: 48,
            fallbackColor: 0x8b5cf6,
            strokeColor: 0xa78bfa,
            emoji: '🔮'
        },
        'meo-cu-ta': {
            id: 'meo-cu-ta',
            name: 'Mèo Cử Tạ (Đấu Sĩ)',
            description: 'Đỡ đòn tanker dũng mãnh với lượng máu khủng và sức càn quét lớn',
            portrait: '/assets/characters/meo-cu-ta/portrait.png',
            idle: '/assets/characters/meo-cu-ta/idle.png',
            walk: '/assets/characters/meo-cu-ta/walk.png',
            attack: '/assets/characters/meo-cu-ta/attack.png',
            frameWidth: 48,
            frameHeight: 48,
            fallbackColor: 0xf97316,
            strokeColor: 0xfb923c,
            emoji: '🦁'
        }
    },

    // 2. Quái Vật (Monsters / Bosses)
    monsters: {
        'chuot-nhat': {
            id: 'chuot-nhat',
            name: 'Chuột Nhắt Đạo Tặc',
            type: 'normal',
            level: 45,
            idle: '/assets/monsters/chuot-nhat/idle.png',
            attack: '/assets/monsters/chuot-nhat/attack.png',
            width: 36,
            height: 36,
            fallbackColor: 0xeab308,
            strokeColor: 0xfef08a,
            emoji: '🐭'
        },
        'nhen-long': {
            id: 'nhen-long',
            name: 'Nhện Lông Gai Góc',
            type: 'normal',
            level: 46,
            idle: '/assets/monsters/nhen-long/idle.png',
            attack: '/assets/monsters/nhen-long/attack.png',
            width: 40,
            height: 40,
            fallbackColor: 0x64748b,
            strokeColor: 0x94a3b8,
            emoji: '🕷️'
        },
        'cau-quy': {
            id: 'cau-quy',
            name: 'Cầu Quỷ Hắc Ám',
            type: 'elite',
            level: 47,
            idle: '/assets/monsters/cau-quy/idle.png',
            attack: '/assets/monsters/cau-quy/attack.png',
            width: 52,
            height: 52,
            fallbackColor: 0x9333ea,
            strokeColor: 0xf59e0b,
            emoji: '👁️'
        }
    },

    // 3. Bản Đồ Môi Trường (Maps / Zones)
    maps: {
        'chuong-0-tram-cao': {
            id: 'chuong-0-tram-cao',
            name: 'Trạm Cào - Bờ Suối Bạc Hà (Khu 1)',
            background: '/assets/maps/chuong-0-tram-cao/background.png',
            tileset: '/assets/maps/chuong-0-tram-cao/tileset.png',
            river: '/assets/maps/chuong-0-tram-cao/river.png',
            minimap: '/assets/ui/minimap/chuong-0.png',
            music: '/assets/audio/bgm/field-peace.mp3',
            dimensions: { width: 1280, height: 720 }
        }
    },

    // 4. Kỹ Năng & Chiêu Thức (Skills)
    skills: {
        's1': {
            id: 's1',
            name: 'Cào Cơ Bản',
            icon: '/assets/skills/icons/s1-cao-co-ban.png',
            hotkey: 'Space / 1',
            cooldown: 500,
            mpCost: 0,
            color: '#38bdf8',
            emoji: '🐾'
        },
        's2': {
            id: 's2',
            name: 'Cào Lửa Nguyên Tố',
            icon: '/assets/skills/icons/s2-phun-lua.png',
            hotkey: '2',
            cooldown: 2000,
            mpCost: 15,
            color: '#f97316',
            emoji: '🔥'
        },
        's3': {
            id: 's3',
            name: 'Bão Móng Vuốt',
            icon: '/assets/skills/icons/s3-bao-mong-vuot.png',
            hotkey: 'Q / 3',
            cooldown: 4000,
            mpCost: 35,
            color: '#a855f7',
            emoji: '🌪️'
        },
        's4': {
            id: 's4',
            name: 'Tiếng Gầm Sư Tử Mèo',
            icon: '/assets/skills/icons/s4-tieng-gam.png',
            hotkey: '4',
            cooldown: 8000,
            mpCost: 50,
            color: '#eab308',
            emoji: '⚡'
        },
        's5': {
            id: 's5',
            name: 'Cỏ Mèo Hồi Máu',
            icon: '/assets/skills/icons/s5-hoi-phuc.png',
            hotkey: '5',
            cooldown: 12000,
            mpCost: 40,
            color: '#22c55e',
            emoji: '🌿'
        }
    },

    // 5. Giao Diện (UI Frames & Icons)
    ui: {
        portraitFrame: '/assets/ui/frames/portrait-frame.png',
        hotbarFrame: '/assets/ui/frames/hotbar-frame.png',
        targetFrame: '/assets/ui/frames/target-frame.png',
        minimapFrame: '/assets/ui/frames/minimap-frame.png'
    }
};

export default ASSET_MANIFEST;
