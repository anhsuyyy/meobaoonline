const mongoose = require('mongoose');

const guildInvitationSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    guildName: { type: String, required: true },
    inviterId: { type: String, required: true, index: true },
    inviterUsername: { type: String, required: true },
    targetUserId: { type: String, required: true, index: true },
    targetUsername: { type: String, required: true },
    status: { type: String, enum: ['pending', 'processing'], default: 'pending', index: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
}, { versionKey: false });

guildInvitationSchema.index({ expiresAt:  1 }, { expireAfterSeconds: 0 });
guildInvitationSchema.index({ guildId: 1, targetUserId: 1, status: 1 });

module.exports = mongoose.models.GuildInvitation
    || mongoose.model('GuildInvitation', guildInvitationSchema);
