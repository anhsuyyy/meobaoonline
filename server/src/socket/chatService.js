const { randomUUID } = require('node:crypto');

const HISTORY_LIMIT = 50;
const MESSAGE_LIMIT = 200;
const GENERAL_COOLDOWN_MS = 1000;
const WORLD_COOLDOWN_MS = 3000;
const DUPLICATE_COOLDOWN_MS = 10000;

function sanitizeChatText(value) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/<[^>]*>/g, '')
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
        .trim()
        .slice(0, MESSAGE_LIMIT)
        .trim();
}

function createChatService(io, { now = Date.now, idFactory = randomUUID } = {}) {
    const histories = {
        world: [],
        area: new Map(),
        party: new Map(),
        system: []
    };
    const lastSentByUser = new Map();
    let sequence = 0;
    const areaKey = (mapId, zoneId = 0) => `${Number(mapId)}:${Number(zoneId) || 0}`;

    function remember(history, message) {
        history.push(message);
        if (history.length > HISTORY_LIMIT) history.shift();
    }

    function publishSystem(text) {
        const cleanText = sanitizeChatText(text);
        if (!cleanText) return null;
        const message = {
            messageId: idFactory(),
            sequence: ++sequence,
            senderId: 'system',
            senderName: 'Hệ Thống',
            channel: 'system',
            timestamp: new Date(now()).toISOString(),
            text: cleanText
        };
        remember(histories.system, message);
        io.emit('chatMessage', message);
        return message;
    }

    function getHistory({ mapId, zoneId = 0, partyId }) {
        return {
            channels: {
                world: histories.world.slice(-HISTORY_LIMIT),
                system: histories.system.slice(-HISTORY_LIMIT),
                area: (histories.area.get(areaKey(mapId, zoneId)) || []).slice(-HISTORY_LIMIT),
                party: partyId ? (histories.party.get(partyId) || []).slice(-HISTORY_LIMIT) : []
            }
        };
    }

    function handleSend(socket, payload = {}) {
        const channel = payload.channel;
        if (!['world', 'party', 'area'].includes(channel)) {
            return { ok: false, error: 'Kênh chat không hợp lệ.' };
        }

        const text = sanitizeChatText(payload.text);
        if (!text) return { ok: false, error: 'Tin nhắn không được để trống.' };
        if (!socket.user?.userId) return { ok: false, error: 'Không xác định được người gửi.' };

        const partyId = socket.partyId || socket.character?.partyId || null;
        if (channel === 'party' && !partyId) {
            return { ok: false, error: 'Bạn chưa tham gia đội.' };
        }

        const currentTime = now();
        const userId = socket.user.userId;
        const previous = lastSentByUser.get(userId);
        if (previous) {
            const cooldown = channel === 'world' ? WORLD_COOLDOWN_MS : GENERAL_COOLDOWN_MS;
            if (currentTime - previous.sentAt < cooldown) {
                return { ok: false, error: 'Bạn gửi tin quá nhanh, hãy chờ một chút.' };
            }
            if (previous.text === text && currentTime - previous.sentAt < DUPLICATE_COOLDOWN_MS) {
                return { ok: false, error: 'Bạn vừa gửi tin nhắn này rồi.' };
            }
        }

        const message = {
            messageId: idFactory(),
            sequence: ++sequence,
            senderId: userId,
            senderName: socket.user.characterName || socket.user.username,
            channel,
            timestamp: new Date(currentTime).toISOString(),
            text
        };
        lastSentByUser.set(userId, { sentAt: currentTime, text });

        if (channel === 'world') {
            remember(histories.world, message);
            io.emit('chatMessage', message);
        } else if (channel === 'area') {
            const mapId = socket.mapId;
            if (mapId === undefined || mapId === null) return { ok: false, error: 'Không xác định được khu vực hiện tại.' };
            const zoneId = Number(socket.zoneId) || 0;
            const key = areaKey(mapId, zoneId);
            if (!histories.area.has(key)) histories.area.set(key, []);
            remember(histories.area.get(key), message);
            io.to(socket.areaRoom || `map_${mapId}_zone_${zoneId}`).emit('chatMessage', message);
        } else {
            if (!histories.party.has(partyId)) histories.party.set(partyId, []);
            remember(histories.party.get(partyId), message);
            io.to(`party_${partyId}`).emit('chatMessage', message);
        }

        return { ok: true, message };
    }

    return { getHistory, handleSend, publishSystem };
}

module.exports = { createChatService, sanitizeChatText, HISTORY_LIMIT, MESSAGE_LIMIT };
