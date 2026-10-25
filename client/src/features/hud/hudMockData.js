/**
 * Dữ liệu mẫu (Demo / Fallback Data) tách biệt cho giao diện HUD
 * Dùng làm giá trị mặc định khi chưa có snapshot từ server thật
 */

export const mockPlayerStatus = {
    name: 'Mèo Báo Chiến Thần',
    avatarClass: 'meo_bao',
    level: 1,
    exp: 35,
    maxExp: 100,
    hp: 500,
    maxHp: 500,
    mp: 200,
    maxMp: 200,
    gold: 150,
    dtn: 45, // Điểm tiềm năng
    className: 'Mèo Báo'
};

export const mockTargetStatus = {
    id: 'nhen_chua_1',
    name: 'Nhện Lông Trạm Cào',
    type: 'elite', // 'normal' | 'elite' | 'boss'
    level: 3,
    hp: 420,
    maxHp: 420
};

export const mockMapInfo = {
    zoneName: 'Chương 0: Trạm Cào',
    subArea: 'Khu Vực An Toàn',
    channel: 'Kênh 1',
    serverTime: '12:45',
    fps: 60,
    ping: 28,
    isSafeZone: true
};

export const skillBarConfig = [
    {
        id: 's1',
        name: 'Vuốt Chớp Nhoáng',
        icon: '🐾',
        key: 'SPACE',
        mpCost: 2,
        cooldown: 0.65,
        description: 'Cào liên hoàn phía trước gây sát thương chí mạng.'
    },
    {
        id: 's2',
        name: 'Phóng Phi Tiêu',
        icon: '🎯',
        key: '1',
        mpCost: 15,
        cooldown: 5.0,
        description: 'Ném phi tiêu tầm xa 5m gây sát thương lớn.'
    },
    {
        id: 's3',
        name: 'Bão Móng Vuốt',
        icon: '🌪️',
        key: 'Q',
        mpCost: 30,
        cooldown: 8.0,
        description: 'Tạo lốc xoáy móng vuốt quét sạch tối đa 4 mục tiêu.'
    },
    {
        id: 's4',
        name: 'Tàng Hình Báo Đời',
        icon: '👤',
        key: 'E',
        mpCost: 35,
        cooldown: 24.0,
        description: 'Ẩn mình vào bóng tối trong 3 giây, đòn đầu tăng 50% damage.'
    },
    {
        id: 's5',
        name: 'Ám Sát Không Gian',
        icon: '⚡',
        key: 'R',
        mpCost: 70,
        cooldown: 45.0,
        description: 'Lướt xuyên không gian áp sát làm choáng kẻ thù.'
    },
    {
        id: 'item_hp',
        name: 'Bình Máu Nhỏ',
        icon: '🧪',
        key: '3',
        count: 15,
        type: 'consumable',
        description: 'Hồi phục 150 HP tức thì.'
    },
    {
        id: 'item_mp',
        name: 'Bình Nước Suối',
        icon: '💧',
        key: '4',
        count: 10,
        type: 'consumable',
        description: 'Hồi phục 80 MP tức thì.'
    }
];
