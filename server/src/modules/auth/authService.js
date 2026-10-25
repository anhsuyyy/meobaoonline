const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const userRepository = require('./userRepository');

const TOKEN_EXPIRY = '7d';

class AuthService {
    assertConfigured() {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret || jwtSecret.length < 32) {
            throw new Error('JWT_SECRET must be configured with at least 32 characters.');
        }
    }

    hashPassword(password, salt) {
        return crypto.pbkdf2Sync(password, salt, 210000, 64, 'sha512').toString('hex');
    }

    generateSalt() {
        return crypto.randomBytes(16).toString('hex');
    }

    generateToken(user) {
        this.assertConfigured();
        const jwtSecret = process.env.JWT_SECRET;

        return jwt.sign(
            {
                userId: String(user._id || user.id)
            },
            jwtSecret,
            { expiresIn: TOKEN_EXPIRY }
        );
    }

    verifyToken(token) {
        try {
            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret || jwtSecret.length < 32) return null;
            return jwt.verify(token, jwtSecret);
        } catch {
            return null;
        }
    }

    validateCredentials({ username, password }) {
        if (typeof username !== 'string' || username !== username.trim() ||
            !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
            const error = new Error('Tên đăng nhập phải có 3–30 ký tự, chỉ gồm chữ không dấu, số hoặc dấu gạch dưới.');
            error.status = 400;
            throw error;
        }

        if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
            const error = new Error('Mật khẩu phải có từ 8 đến 128 ký tự.');
            error.status = 400;
            throw error;
        }
    }

    toPublicUser(user) {
        return {
            id: String(user._id || user.id),
            username: user.username,
            email: user.email,
            createdAt: user.createdAt,
            character: user.character
        };
    }

    async register({ username, password, email }) {
        this.validateCredentials({ username, password });
        if (email !== undefined && email !== null && email !== '' &&
            (typeof email !== 'string' || email.length > 254 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
            const error = new Error('Email không hợp lệ.');
            error.status = 400;
            throw error;
        }

        const existing = await userRepository.findByUsername(username);
        if (existing) {
            const error = new Error('Tên đăng nhập đã tồn tại.');
            error.status = 409;
            throw error;
        }

        const salt = this.generateSalt();
        const passwordHash = this.hashPassword(password, salt);

        const newUser = await userRepository.createUser({
            username,
            email,
            passwordHash,
            salt
        });

        const token = this.generateToken(newUser);

        return {
            user: this.toPublicUser(newUser),
            token
        };
    }

    async login({ username, password }) {
        this.validateCredentials({ username, password });

        const user = await userRepository.findByUsername(username);
        if (!user) {
            const error = new Error('Tài khoản hoặc mật khẩu không chính xác.');
            error.status = 401;
            throw error;
        }

        const inputHash = this.hashPassword(password, user.salt);
        const storedHash = Buffer.from(user.passwordHash, 'hex');
        const suppliedHash = Buffer.from(inputHash, 'hex');
        if (storedHash.length !== suppliedHash.length || !crypto.timingSafeEqual(storedHash, suppliedHash)) {
            const error = new Error('Tài khoản hoặc mật khẩu không chính xác.');
            error.status = 401;
            throw error;
        }

        const token = this.generateToken(user);

        return {
            user: this.toPublicUser(user),
            token
        };
    }
}

module.exports = new AuthService();
