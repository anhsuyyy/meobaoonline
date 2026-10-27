const authService = require('../../modules/auth/authService');
const userRepository = require('../../modules/auth/userRepository');

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
    }

    const decoded = authService.verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' });
    }

    try {
        const user = await userRepository.findById(decoded.userId);
        if (!user || (Number(decoded.sessionVersion) || 0) !== (Number(user.sessionVersion) || 0)) {
            return res.status(401).json({ error: 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.' });
        }
        req.user = decoded;
        return next();
    } catch {
        return res.status(503).json({ error: 'Không thể xác thực phiên đăng nhập lúc này.' });
    }
}

module.exports = authenticateToken;
