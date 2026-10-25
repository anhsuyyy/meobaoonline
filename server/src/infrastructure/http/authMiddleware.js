const authService = require('../../modules/auth/authService');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục.' });
    }

    const decoded = authService.verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.' });
    }

    req.user = decoded;
    next();
}

module.exports = authenticateToken;
