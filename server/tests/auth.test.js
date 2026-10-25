const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'unit-test-jwt-secret-that-is-long-enough';

const authService = require('../src/modules/auth/authService');
const userRepository = require('../src/modules/auth/userRepository');

const users = new Map();
let userId = 0;

userRepository.findByUsername = async (username) => users.get(username.trim().toLowerCase()) || null;
userRepository.findById = async (id) => [...users.values()].find((user) => String(user._id) === String(id)) || null;
userRepository.createUser = async ({ username, email, passwordHash, salt }) => {
    const cleanName = username.toLowerCase();
    if (users.has(cleanName)) {
        const error = new Error('Duplicate username');
        error.code = 11000;
        error.keyPattern = { username: 1 };
        error.status = 409;
        throw error;
    }
    const user = {
        _id: `test-user-${++userId}`,
        username: cleanName,
        email: email ? email.toLowerCase() : null,
        passwordHash,
        salt,
        createdAt: new Date(),
        character: {
            level: 1,
            exp: 0,
            maxExp: 100,
            classId: null,
            hp: 500,
            maxHp: 500,
            mp: 200,
            maxMp: 200,
            gold: 0,
            dtn: 0,
            position: { x: 200, y: 300 }
        }
    };
    users.set(cleanName, user);
    return user;
};

after(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
});

describe('Auth Service - Registration, Login & JWT Verification', () => {
    beforeEach(() => {
        users.clear();
        userId = 0;
    });

    it('hashes passwords with a per-account salt and never returns the hash', async () => {
        const result = await authService.register({
            username: 'CatWarrior',
            password: 'secretpassword123',
            email: 'cat@universe.io'
        });

        const user = users.get('catwarrior');
        assert.equal(result.user.username, 'catwarrior');
        assert.equal(result.user.email, 'cat@universe.io');
        assert.equal(result.user.passwordHash, undefined);
        assert.equal(result.user.salt, undefined);
        assert.equal(user.passwordHash, authService.hashPassword('secretpassword123', user.salt));
        assert.notEqual(user.passwordHash, 'secretpassword123');
        assert.equal(result.user.character.level, 1);
        assert.equal(result.user.character.classId, null);
    });

    it('rejects invalid usernames, passwords, and email addresses', async () => {
        await assert.rejects(
            authService.register({ username: 'ab', password: 'long-enough-password' }),
            { status: 400, message: /3–30 ký tự/ }
        );
        await assert.rejects(
            authService.register({ username: 'validuser', password: 'short' }),
            { status: 400, message: /8 đến 128 ký tự/ }
        );
        await assert.rejects(
            authService.register({ username: 'validuser', password: 'long-enough-password', email: 'invalid' }),
            { status: 400, message: /Email không hợp lệ/ }
        );
    });

    it('rejects duplicate usernames regardless of case', async () => {
        await authService.register({ username: 'CatHero', password: 'password123' });
        await assert.rejects(
            authService.register({ username: 'cathero', password: 'differentpassword' }),
            { status: 409, message: /đã tồn tại/ }
        );
    });

    it('automatically signs up with a session token and verifies the account identity', async () => {
        const result = await authService.register({
            username: 'CatHero',
            password: 'password123'
        });
        const decoded = authService.verifyToken(result.token);

        assert.ok(result.token);
        assert.equal(decoded.userId, result.user.id);
        assert.equal(decoded.username, undefined);
        assert.equal(result.user.character.level, 1);
        assert.equal(result.user.character.classId, null);
    });

    it('logs in with valid credentials and gives one generic error for invalid credentials', async () => {
        await authService.register({ username: 'BaoBao', password: 'correctpassword' });
        const result = await authService.login({ username: 'baobao', password: 'correctpassword' });

        assert.ok(result.token);
        assert.equal(result.user.username, 'baobao');
        await assert.rejects(
            authService.login({ username: 'baobao', password: 'wrongpassword' }),
            { status: 401, message: /không chính xác/ }
        );
        await assert.rejects(
            authService.login({ username: 'ghostuser', password: 'password123' }),
            { status: 401, message: /không chính xác/ }
        );
    });

    it('requires an explicitly configured JWT secret', () => {
        const configuredSecret = process.env.JWT_SECRET;
        try {
            delete process.env.JWT_SECRET;
            assert.throws(() => authService.assertConfigured(), /JWT_SECRET must be configured/);
        } finally {
            process.env.JWT_SECRET = configuredSecret;
        }
    });

    it('does not fall back to an in-memory account store when MongoDB is unavailable', async () => {
        const repository = require('../src/modules/auth/userRepository');
        const databaseFindByUsername = Object.getPrototypeOf(repository).findByUsername;
        await assert.rejects(
            databaseFindByUsername.call(repository, 'missinguser'),
            { status: 503, message: /Dịch vụ dữ liệu/ }
        );
    });
});
