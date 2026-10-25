const express = require('express');
const router = express.Router();
const authService = require('./authService');
const userRepository = require('./userRepository');
const authenticateToken = require('../../infrastructure/http/authMiddleware');
const gameConfig = require('../../config/gameConfig.json');

function sendError(res, error, fallbackMessage) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    const message = status < 500 ? error.message : fallbackMessage;
    return res.status(status).json({ error: message });
}

// Đăng ký tài khoản
router.post('/register', async (req, res) => {
    try {
        const { username, password, email } = req.body || {};
        const result = await authService.register({ username, password, email });
        res.status(201).json(result);
    } catch (err) {
        sendError(res, err, 'Không thể kết nối dữ liệu để tạo tài khoản. Vui lòng thử lại.');
    }
});

// Đăng nhập
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        const result = await authService.login({ username, password });
        res.status(200).json(result);
    } catch (err) {
        sendError(res, err, 'Không thể kết nối dữ liệu để đăng nhập. Vui lòng thử lại.');
    }
});

// Lấy thông tin tài khoản hiện tại
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await userRepository.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        }

        res.json({
            id: String(user._id || user.id),
            username: user.username,
            email: user.email,
            createdAt: user.createdAt,
            character: {
                ...user.character,
                className: user.character.classId
                    ? gameConfig.classes[user.character.classId]?.name || null
                    : null
            }
        });
    } catch (err) {
        sendError(res, err, 'Không thể kết nối dữ liệu để tải tài khoản. Vui lòng thử lại.');
    }
});

module.exports = router;
