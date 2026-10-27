const Guild = require('./guildModel');
const GuildMembership = require('./guildMembershipModel');
const { isDbConnected } = require('../../infrastructure/database/connection');

let membershipSetup;
async function ensureMemberships() {
    if (!membershipSetup) {
        membershipSetup = (async () => {
            await GuildMembership.init();
            const guilds = await Guild.find({}, { _id: 1, members: 1 }).sort({ createdAt: 1, _id: 1 }).lean();
            for (const guild of guilds) {
                for (const member of guild.members || []) {
                    await GuildMembership.updateOne(
                        { userId: String(member.userId) },
                        { $setOnInsert: { userId: String(member.userId), guildId: String(guild._id), username: member.username } },
                        { upsert: true }
                    );
                }
            }
        })().catch((error) => {
            membershipSetup = null;
            throw error;
        });
    }
    return membershipSetup;
}

async function claimMembership({ userId, guildId, username }) {
    try {
        await GuildMembership.create({ userId: String(userId), guildId: String(guildId), username: String(username) });
    } catch (error) {
        if (error.code === 11000) throw new Error('Bạn đã ở trong một bang hội.');
        throw error;
    }
}

function assertDatabase() {
    if (!isDbConnected()) throw new Error('Dữ liệu bang hội hiện chưa kết nối.');
}

function serialize(guild, userId) {
    if (!guild) return null;
    const value = guild.toObject ? guild.toObject() : guild;
    return {
        id: String(value._id), name: value.name, description: value.description,
        level: value.level, memberCount: value.members.length, maxMembers: value.maxMembers,
        isLeader: value.leaderId === String(userId),
        members: value.members.map(({ userId: id, username, role }) => ({
            userId: id, username, role, isSelf: String(id) === String(userId)
        }))
    };
}

async function getForUser(userId) {
    assertDatabase();
    await ensureMemberships();
    const membership = await GuildMembership.findOne({ userId: String(userId) }).lean();
    const guild = membership ? await Guild.findById(membership.guildId) : null;
    return serialize(guild, userId);
}

async function list() {
    assertDatabase();
    const guilds = await Guild.find({}, { name: 1, description: 1, level: 1, maxMembers: 1, members: 1 })
        .sort({ level: -1, name: 1 }).limit(30).lean();
    return guilds.map((guild) => ({
        id: String(guild._id), name: guild.name, description: guild.description,
        level: guild.level, memberCount: guild.members.length, maxMembers: guild.maxMembers
    }));
}

async function create({ userId, username, name, description }) {
    assertDatabase();
    await ensureMemberships();
    const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
    if (cleanName.length < 3 || cleanName.length > 20) throw new Error('Tên bang phải có từ 3 đến 20 ký tự.');
    const normalizedName = cleanName.toLocaleLowerCase('vi-VN');
    const guild = await Guild.create({
        name: cleanName, normalizedName, description: String(description || '').trim().slice(0, 120),
        leaderId: String(userId), members: [{ userId: String(userId), username: String(username), role: 'leader' }]
    });
    try {
        await claimMembership({ userId, username, guildId: guild._id });
    } catch (error) {
        await Guild.deleteOne({ _id: guild._id });
        throw error;
    }
    return serialize(guild, userId);
}

async function join({ userId, username, guildId }) {
    assertDatabase();
    await ensureMemberships();
    const candidate = await Guild.findById(guildId, { _id: 1 });
    if (!candidate) throw new Error('Bang không tồn tại hoặc đã đủ thành viên.');
    await claimMembership({ userId, username, guildId: candidate._id });
    let guild;
    try {
        guild = await Guild.findOneAndUpdate(
            { _id: candidate._id, $expr: { $lt: [{ $size: '$members' }, '$maxMembers'] } },
            { $push: { members: { userId: String(userId), username: String(username), role: 'member' } } },
            { new: true }
        );
    } catch (error) {
        await GuildMembership.deleteOne({ userId: String(userId), guildId: String(candidate._id) });
        throw error;
    }
    if (!guild) {
        await GuildMembership.deleteOne({ userId: String(userId), guildId: String(candidate._id) });
        throw new Error('Bang không tồn tại hoặc đã đủ thành viên.');
    }
    return serialize(guild, userId);
}

async function leave(userId) {
    assertDatabase();
    await ensureMemberships();
    const membership = await GuildMembership.findOne({ userId: String(userId) }).lean();
    const guild = membership ? await Guild.findById(membership.guildId) : null;
    if (!guild) throw new Error('Bạn chưa tham gia bang hội nào.');
    if (guild.leaderId === String(userId)) {
        await Guild.deleteOne({ _id: guild._id });
        await GuildMembership.deleteMany({ guildId: String(guild._id) });
        return { guild: null, message: 'Bang hội đã giải tán.' };
    }
    guild.members = guild.members.filter((member) => member.userId !== String(userId));
    await guild.save();
    await GuildMembership.deleteOne({ userId: String(userId), guildId: String(guild._id) });
    return { guild: null, message: 'Đã rời bang hội.' };
}

async function transferLeadership({ userId, targetUserId }) {
    assertDatabase();
    const guild = await Guild.findOne({ leaderId: String(userId) });
    if (!guild) throw new Error('Chỉ bang chủ mới được chuyển quyền bang chủ.');
    const target = guild.members.find((member) => member.userId === String(targetUserId));
    if (!target || target.userId === String(userId)) throw new Error('Hãy chọn một thành viên khác trong bang.');
    guild.members.forEach((member) => {
        member.role = member.userId === target.userId ? 'leader' : 'member';
    });
    guild.leaderId = target.userId;
    await guild.save();
    return { guildId: String(guild._id), guild: serialize(guild, userId) };
}

async function kickMember({ userId, targetUserId }) {
    assertDatabase();
    await ensureMemberships();
    const guild = await Guild.findOne({ leaderId: String(userId) });
    if (!guild) throw new Error('Chỉ bang chủ mới được trục xuất thành viên.');
    if (String(targetUserId) === String(userId)) throw new Error('Không thể tự trục xuất mình.');
    const target = guild.members.find((member) => member.userId === String(targetUserId));
    if (!target) throw new Error('Thành viên không thuộc bang hội này.');
    guild.members = guild.members.filter((member) => member.userId !== String(targetUserId));
    await guild.save();
    await GuildMembership.deleteOne({ userId: String(targetUserId), guildId: String(guild._id) });
    return { guildId: String(guild._id), removedUserId: String(targetUserId), guild: serialize(guild, userId) };
}

async function updateDescription({ userId, description }) {
    assertDatabase();
    const guild = await Guild.findOne({ leaderId: String(userId) });
    if (!guild) throw new Error('Chỉ bang chủ mới được sửa giới thiệu bang.');
    guild.description = String(description || '').trim().slice(0, 120);
    await guild.save();
    return { guildId: String(guild._id), guild: serialize(guild, userId) };
}

async function canUseGuildChat(userId) {
    assertDatabase();
    await ensureMemberships();
    const membership = await GuildMembership.findOne({ userId: String(userId) }, { guildId: 1 }).lean();
    return membership?.guildId || null;
}

module.exports = { create, getForUser, join, leave, list, transferLeadership, kickMember, updateDescription, canUseGuildChat };
