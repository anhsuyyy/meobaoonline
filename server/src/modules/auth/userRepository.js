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

    async revokeSessions(userId) {
        requireDatabase();
        try {
            return await User.findByIdAndUpdate(userId, { $inc: { sessionVersion: 1 } }, { new: true })
                .select('_id sessionVersion').lean();
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
        const expectedRevision = Number.isSafeInteger(Number(character.revision)) && Number(character.revision) >= 0
            ? Number(character.revision) : 0;
        const fields = [
            'level', 'exp', 'maxExp', 'agi', 'skillLevels', 'hp', 'maxHp', 'mp', 'maxMp',
            'gold', 'dtn', 'power', 'position', 'nroCharacter', 'questProgress', 'questCompleted'
        ];
        const updates = Object.fromEntries(
            fields.map((field) => [`character.${field}`, character[field]])
        );
        try {
            const revisionFilter = expectedRevision === 0
                ? { $or: [{ 'character.revision': 0 }, { 'character.revision': { $exists: false } }] }
                : { 'character.revision': expectedRevision };
            const updated = await User.findOneAndUpdate(
                { _id: userId, ...revisionFilter },
                { $set: updates, $inc: { 'character.revision': 1 } },
                { new: true, runValidators: true }
            ).select('character.revision').lean();
            if (!updated) {
                const conflict = new Error('Tiến trình nhân vật đã được cập nhật ở phiên khác. Hãy đăng nhập lại để tải dữ liệu mới.');
                conflict.status = 409;
                conflict.code = 'CHARACTER_REVISION_CONFLICT';
                throw conflict;
            }
            return { revision: updated.character.revision };
        } catch (error) {
            if (error.code === 'CHARACTER_REVISION_CONFLICT') throw error;
            throw markDatabaseError(error);
        }
    }

    async createNroCharacter(userId, nroCharacter) {
        requireDatabase();
        try {
            return await User.findOneAndUpdate(
                { _id: userId, 'character.nroCharacter.created': { $ne: true } },
                {
                    $set: Object.fromEntries(Object.entries(nroCharacter).map(([key, value]) => [`character.nroCharacter.${key}`, value])),
                    $inc: { 'character.revision': 1 }
                },
                { new: true, runValidators: true }
            ).select('character').lean();
        } catch (error) {
            throw markDatabaseError(error);
        }
    }
}

module.exports = new UserRepository();
