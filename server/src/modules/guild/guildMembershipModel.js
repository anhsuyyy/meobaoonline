const mongoose = require('mongoose');

const guildMembershipSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.models.GuildMembership
    || mongoose.model('GuildMembership', guildMembershipSchema);
