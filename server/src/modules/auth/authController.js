const express = require('express');
const router = express.Router();
const authService = require('./authService');
const userRepository = require('./userRepository');
const authenticateToken = require('../../infrastructure/http/authMiddleware');

const authAttempts = new Map();
function rateLimitAuth({ limit, windowMs }) {
    return (req, res, next) => {
        const now = Date.now();
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const key = `${req.path}:${ip}`;
        let bucket = authAttempts.get(key);
        if (!bucket || now - bucket.startedAt >= windowMs) {
            bucket = { startedAt: now, count: 0 };
            authAttempts.set(key, bucket);
        }
        if (bucket.count >= limit) {
            res.set('Retry-After', String(Math.ceil((bucket.startedAt + windowMs - now) / 1000)));
            return res.status(429).json({ error: 'Bạn thao tác quá nhanh. Hãy thử lại sau.' });
        }
        bucket.count += 1;
        if (authAttempts.size > 2000) {
            for (const [entry, value] of authAttempts) {
                if (now - value.startedAt >= windowMs) authAttempts.delete(entry);
            }
        }
        return next();
    };
}

function sendError(res, error, fallbackMessage) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    const message = status < 500 ? error.message : fallbackMessage;
    return res.status(status).json({ error: message });
}

// Đăng ký tài khoản
router.post('/register', rateLimitAuth({ limit: 5, windowMs: 60 * 60 * 1000 }), async (req, res) => {
    try {
        const { username, password, email } = req.body || {};
        const result = await authService.register({ username, password, email });
        res.status(201).json(result);
    } catch (err) {
        sendError(res, err, 'Không thể kết nối dữ liệu để tạo tài khoản. Vui lòng thử lại.');
    }
});

// Đăng nhập
router.post('/login', rateLimitAuth({ limit: 10, windowMs: 15 * 60 * 1000 }), async (req, res) => {
    try {
        const { username, password } = req.body || {};
        const result = await authService.login({ username, password });
        res.status(200).json(result);
    } catch (err) {
        sendError(res, err, 'Không thể kết nối dữ liệu để đăng nhập. Vui lòng thử lại.');
    }
});

router.post('/logout', authenticateToken, async (req, res) => {
    try {
        await userRepository.revokeSessions(req.user.userId);
        const io = req.app.locals.io;
        for (const socket of io?.sockets?.sockets?.values?.() || []) {
            if (String(socket.user?.userId) === String(req.user.userId)) {
                socket.emit('authenticationExpired');
                socket.disconnect(true);
            }
        }
        return res.status(204).end();
    } catch (err) {
        return sendError(res, err, 'Không thể thu hồi phiên đăng nhập. Vui lòng thử lại.');
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
                ...user.character
            }
        });
    } catch (err) {
        sendError(res, err, 'Không thể kết nối dữ liệu để tải tài khoản. Vui lòng thử lại.');
    }
});

module.exports = router;
