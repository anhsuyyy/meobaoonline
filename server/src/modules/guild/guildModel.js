const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    role: { type: String, enum: ['leader', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const guildSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, minlength: 3, maxlength: 20 },
    normalizedName: { type: String, required: true, unique: true },
    description: { type: String, trim: true, maxlength: 120, default: '' },
    leaderId: { type: String, required: true, index: true },
    members: { type: [memberSchema], default: [] },
    level: { type: Number, default: 1, min: 1 },
    maxMembers: { type: Number, default: 30, min: 2, max: 100 },
    createdAt: { type: Date, default: Date.now }
}, { optimisticConcurrency: true });

module.exports = mongoose.models.Guild || mongoose.model('Guild', guildSchema);
