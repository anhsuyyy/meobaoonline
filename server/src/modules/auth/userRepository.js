const User = require('./userModel');
const { isDbConnected } = require('../../infrastructure/database/connection');

function requireDatabase() {
    if (!isDbConnected()) {
        const error = new Error('Dịch vụ dữ liệu tạm thời không khả dụng. Vui lòng thử lại sau.');
        error.status = 503;
        throw error;
    }
}

function markDatabaseError(error) {
    if (error.code === 11000 && error.keyPattern?.username) {
        const duplicateError = new Error('Tên đăng nhập đã tồn tại.');
        duplicateError.status = 409;
        return duplicateError;
    }
    error.status = 503;
    return error;
}

class UserRepository {
    async findByUsername(username) {
        requireDatabase();
        const cleanName = username.toLowerCase().trim();
        try {
            return await User.findOne({ username: cleanName }).select('+passwordHash +salt').lean();
        } catch (error) {
            throw markDatabaseError(error);
        }
    }

    async findById(id) {
        requireDatabase();
        try {
            return await User.findById(id).lean();
        } catch (error) {
            throw markDatabaseError(error);
        }
    }

    async createUser({ username, email, passwordHash, salt }) {
        requireDatabase();
        const cleanName = username.toLowerCase().trim();
        try {
            const user = new User({
                username: cleanName,
                email: email ? email.toLowerCase().trim() : null,
                passwordHash,
                salt,
                character: {}
            });
            const saved = await user.save();
            return saved.toObject();
        } catch (error) {
            throw markDatabaseError(error);
        }
    }

    async updateCharacter(userId, character) {
        requireDatabase();
        const fields = [
            'level', 'exp', 'maxExp', 'hp', 'maxHp', 'mp', 'maxMp',
            'gold', 'dtn', 'position', 'questProgress', 'questCompleted'
        ];
        const updates = Object.fromEntries(
            fields.map((field) => [`character.${field}`, character[field]])
        );
        try {
            return await User.findByIdAndUpdate(
                userId,
                { $set: updates },
                { new: true, runValidators: true }
            ).select('character').lean();
        } catch (error) {
            throw markDatabaseError(error);
        }
    }

    async selectClass(userId, classId, minimumLevel) {
        requireDatabase();
        try {
            return await User.findOneAndUpdate(
                {
                    _id: userId,
                    'character.level': { $gte: minimumLevel },
                    'character.classId': null
                },
                { $set: { 'character.classId': classId } },
                { new: true, runValidators: true }
            ).select('character').lean();
        } catch (error) {
            throw markDatabaseError(error);
        }
    }
}

module.exports = new UserRepository();
