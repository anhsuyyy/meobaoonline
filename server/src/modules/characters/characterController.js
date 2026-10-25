const express = require('express');
const router = express.Router();
const authenticateToken = require('../../infrastructure/http/authMiddleware');
const userRepository = require('../auth/userRepository');
const gameConfig = require('../../config/gameConfig.json');

router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await userRepository.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
        }
        if (!user.character) {
            return res.status(500).json({ error: 'Tài khoản chưa có dữ liệu nhân vật. Vui lòng liên hệ hỗ trợ.' });
        }

        return res.json({
            character: {
                ...user.character,
                className: user.character.classId
                    ? gameConfig.classes[user.character.classId]?.name || null
                    : null
            }
        });
    } catch {
        return res.status(503).json({ error: 'Không thể tải nhân vật do lỗi kết nối dữ liệu. Vui lòng thử lại.' });
    }
});

module.exports = router;
