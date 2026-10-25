const { after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { Server: SocketServer } = require('socket.io');
const { io: createClient } = require(require.resolve('socket.io-client', {
    paths: [path.resolve(__dirname, '../../client')]
}));

const authService = require('../src/modules/auth/authService');
const userRepository = require('../src/modules/auth/userRepository');
const setupGameSocket = require('../src/socket/gameSocket');

const originalJwtSecret = process.env.JWT_SECRET;
const originalFindById = userRepository.findById;
const originalUpdateCharacter = userRepository.updateCharacter;

function waitForEvent(socket, eventName, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${eventName}`)), timeoutMs);
        const cleanup = () => {
            clearTimeout(timer);
            socket.off(eventName, onEvent);
            socket.off('connect_error', onError);
        };
        const finish = (error, payload) => {
            cleanup();
            if (error) reject(error);
            else resolve(payload);
        };
        const onEvent = (payload) => finish(null, payload);
        const onError = (error) => finish(error);
        socket.once(eventName, onEvent);
        socket.once('connect_error', onError);
    });
}

function sendChat(socket, payload) {
    return new Promise((resolve) => socket.emit('chatSend', payload, resolve));
}

function makeClient(url, userId) {
    return createClient(url, {
        auth: { token: authService.generateToken({ id: userId }) },
        reconnection: false,
        timeout: 3000
    });
}

function makeTestUser(id) {
    return {
        _id: id,
        username: id,
        character: {
            level: 1, exp: 0, maxExp: 100, classId: null,
            hp: 500, maxHp: 500, mp: 200, maxMp: 200,
            gold: 0, dtn: 0, position: { x: 200, y: 300 },
            questProgress: 0, questCompleted: false
        }
    };
}

after(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    userRepository.findById = originalFindById;
    userRepository.updateCharacter = originalUpdateCharacter;
});

describe('Socket.IO world chat integration', () => {
    it('broadcasts server-ordered messages, restores history after reconnect and rate-limits sends', async () => {
        process.env.JWT_SECRET = 'chat-integration-test-secret-32-chars';
        const users = new Map([
            ['chat_alice', makeTestUser('chat_alice')],
            ['chat_bob', makeTestUser('chat_bob')]
        ]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async () => ({ acknowledged: true });

        const httpServer = http.createServer();
        const ioServer = new SocketServer(httpServer);
        const stopGameLoop = setupGameSocket(ioServer);
        const clients = [];

        try {
            await new Promise((resolve, reject) => {
                httpServer.once('error', reject);
                httpServer.listen(0, '127.0.0.1', resolve);
            });
            const url = `http://127.0.0.1:${httpServer.address().port}`;
            const alice = makeClient(url, 'chat_alice');
            const bob = makeClient(url, 'chat_bob');
            clients.push(alice, bob);
            const aliceHistory = waitForEvent(alice, 'chatHistory');
            const bobHistory = waitForEvent(bob, 'chatHistory');
            await Promise.all([waitForEvent(alice, 'connect'), waitForEvent(bob, 'connect'), aliceHistory, bobHistory]);

            let bobMessageCount = 0;
            bob.on('chatMessage', () => { bobMessageCount += 1; });
            const bobReceivesAlice = waitForEvent(bob, 'chatMessage');
            const firstResult = await sendChat(alice, { channel: 'world', text: ' <b>Chào cả thế giới</b> ' });
            const firstMessage = await bobReceivesAlice;
            assert.equal(firstResult.ok, true);
            assert.equal(firstMessage.text, 'Chào cả thế giới');
            assert.equal(firstMessage.senderId, 'chat_alice');
            assert.equal(firstMessage.senderName, 'chat_alice');
            assert.equal(firstMessage.channel, 'world');
            assert.ok(firstMessage.messageId && firstMessage.timestamp);

            const aliceReceivesBob = waitForEvent(alice, 'chatMessage');
            const secondResult = await sendChat(bob, { channel: 'world', text: 'Tin tiếp theo' });
            const secondMessage = await aliceReceivesBob;
            assert.equal(secondResult.ok, true);
            assert.ok(secondMessage.sequence > firstMessage.sequence, 'server sequence defines shared ordering');

            const rateLimited = await sendChat(alice, { channel: 'world', text: 'Tin quá nhanh' });
            assert.equal(rateLimited.ok, false);
            assert.match(rateLimited.error, /quá nhanh/);
            assert.equal((await sendChat(alice, { channel: 'system', text: 'Giả mạo thông báo' })).ok, false,
                'client cannot send into the server-only system channel');

            await new Promise((resolve) => setTimeout(resolve, 3100));
            const repeated = await sendChat(alice, { channel: 'world', text: 'Chào cả thế giới' });
            assert.equal(repeated.ok, false);
            assert.match(repeated.error, /vừa gửi tin nhắn này/);
            await new Promise((resolve) => setTimeout(resolve, 30));
            assert.equal(bobMessageCount, 2, 'rejected repeats do not broadcast duplicate messages');

            bob.disconnect();
            const reconnectedBob = makeClient(url, 'chat_bob');
            clients.push(reconnectedBob);
            const historyPromise = waitForEvent(reconnectedBob, 'chatHistory');
            await waitForEvent(reconnectedBob, 'connect');
            const restored = await historyPromise;
            const restoredWorld = restored.channels.world;
            assert.deepEqual(restoredWorld.map((message) => message.messageId), [
                firstMessage.messageId,
                secondMessage.messageId
            ]);
            assert.equal(new Set(restoredWorld.map((message) => message.messageId)).size, restoredWorld.length,
                'history contains no duplicate message IDs');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });
});
