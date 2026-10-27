const { after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { Server: SocketServer } = require('socket.io');
const { performance } = require('node:perf_hooks');
const { io: createClient } = require(require.resolve('socket.io-client', {
    paths: [path.resolve(__dirname, '../../client')]
}));

const authService = require('../src/modules/auth/authService');
const userRepository = require('../src/modules/auth/userRepository');
const setupGameSocket = require('../src/socket/gameSocket');

const originalJwtSecret = process.env.JWT_SECRET;
const originalFindById = userRepository.findById;
const originalUpdateCharacter = userRepository.updateCharacter;
const jwtSecret = 'socket-integration-test-secret-32-chars';

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

function waitForCount(readCount, expectedCount, timeoutMs = 2500) {
    const startedAt = performance.now();
    return new Promise((resolve, reject) => {
        const poll = () => {
            if (readCount() >= expectedCount) return resolve();
            if (performance.now() - startedAt >= timeoutMs) return reject(new Error(`Timed out waiting for ${expectedCount} server ticks`));
            setTimeout(poll, 5);
        };
        poll();
    });
}

function makeTestUser(id) {
    return {
        _id: id,
        username: id,
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
            position: { x: 200, y: 300 },
            questProgress: 0,
            questCompleted: false
        }
    };
}

function makeClient(url, userId) {
    const token = authService.generateToken({ id: userId });
    return createClient(url, {
        auth: { token },
        reconnection: false,
        timeout: 3000
    });
}

function closeIo(ioServer) {
    return new Promise((resolve) => ioServer.close(resolve));
}

after(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    userRepository.findById = originalFindById;
    userRepository.updateCharacter = originalUpdateCharacter;
});

describe('Socket.IO two-client integration', () => {
    it('joins both players to one room, broadcasts presence, disconnects and reconnects', async (t) => {
        process.env.JWT_SECRET = jwtSecret;
        const agilePlayer = makeTestUser('player_two');
        agilePlayer.character.agi = 50;
        const users = new Map([
            ['player_one', makeTestUser('player_one')],
            ['player_two', agilePlayer]
        ]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async () => ({ acknowledged: true });

        const httpServer = http.createServer();
        const ioServer = new SocketServer(httpServer, { cors: { origin: '*' } });
        const tickTimes = [];
        const stopGameLoop = setupGameSocket(ioServer, { onTick: (time) => tickTimes.push(time) });
        const clients = [];

        try {
            await new Promise((resolve, reject) => {
                httpServer.once('error', reject);
                httpServer.listen(0, '127.0.0.1', resolve);
            });
            const address = httpServer.address();
            const url = `http://127.0.0.1:${address.port}`;

            const alice = makeClient(url, 'player_one');
            clients.push(alice);
            const aliceConnected = waitForEvent(alice, 'connect');
            const aliceInitialState = waitForEvent(alice, 'initialState');
            const [, aliceState] = await Promise.all([aliceConnected, aliceInitialState]);
            const aliceId = aliceState.playerId;
            assert.equal(aliceId, alice.id);
            assert.ok(aliceState.players[aliceId], 'first client receives its own room snapshot');
            assert.equal(aliceState.config.tickRateHz, 30, 'initial state reports the configured server tick rate');
            assert.equal(aliceState.config.world.pixelsPerMeter, 10, 'initial state shares the configured world scale');
            assert.equal(aliceState.config.world.pickupRangeMeters * aliceState.config.world.pixelsPerMeter, 60);

            const pingAck = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Timed out waiting for networkPing ack')), 1500);
                alice.emit('networkPing', (ack) => {
                    clearTimeout(timer);
                    resolve(ack);
                });
            });
            assert.ok(Number.isFinite(pingAck.serverTime), 'authenticated socket returns a server ping acknowledgment');

            const aliceSeesBob = waitForEvent(alice, 'newPlayer');
            const bob = makeClient(url, 'player_two');
            clients.push(bob);
            const bobConnected = waitForEvent(bob, 'connect');
            const bobInitialState = waitForEvent(bob, 'initialState');
            const [, bobState, bobPresence] = await Promise.all([bobConnected, bobInitialState, aliceSeesBob]);
            const bobId = bobState.playerId;
            assert.equal(bobId, bob.id);
            assert.equal(bobState.character.agi, 50, 'initial character state includes AGI');
            assert.ok(bobState.players[aliceId], 'second client sees first client in the same room');
            assert.equal(bobPresence.id, bobId, 'first client receives second client presence');

            const startX = aliceState.players[aliceId].x;
            const rejectedMovement = waitForEvent(alice, 'stateUpdate');
            alice.emit('playerInput', { right: true, x: 1_000_000, y: 1_000_000 });
            const rejectedSnapshot = await rejectedMovement;
            assert.equal(rejectedSnapshot.players[aliceId].x, startX,
                'server rejects client-authored coordinates instead of applying a teleport');

            const movedSnapshotPromise = waitForEvent(alice, 'stateUpdate');
            alice.emit('playerInput', { right: true });
            const movedSnapshot = await movedSnapshotPromise;
            assert.ok(movedSnapshot.players[aliceId].x > startX,
                'server advances the player from a valid directional input');
            alice.emit('playerInput', { right: false });

            const aliceAttackResult = waitForEvent(alice, 'playerAttacked');
            const bobSeesAttack = waitForEvent(bob, 'playerAttacked');
            alice.emit('playerAttack', { skillId: 'basic' });
            const [aliceAttack, bobAttack] = await Promise.all([aliceAttackResult, bobSeesAttack]);
            assert.equal(aliceAttack.playerId, aliceId);
            assert.equal(aliceAttack.cooldownMs, 650, 'NRO basic attack uses the authoritative base cooldown');
            assert.equal(bobAttack.skillId, 'basic', 'other clients receive the same authoritative combat event');

            const bobBasicAttack = waitForEvent(bob, 'playerAttacked');
            bob.emit('playerAttack', { skillId: 'basic' });
            const basicAttack = await bobBasicAttack;
            assert.equal(basicAttack.cooldownMs, 550, 'basic cooldown applies 2ms reduction per AGI point');

            const aliceSeesBobLeave = waitForEvent(alice, 'playerDisconnected');
            const disconnectStartedAt = performance.now();
            bob.disconnect();
            const disconnectedPlayerId = await aliceSeesBobLeave;
            const disconnectNoticeMs = performance.now() - disconnectStartedAt;
            assert.equal(disconnectedPlayerId, bobId);

            const reconnectStartedAt = performance.now();
            const bobReconnected = makeClient(url, 'player_two');
            clients.push(bobReconnected);
            const reconnectConnected = waitForEvent(bobReconnected, 'connect');
            const reconnectInitialState = waitForEvent(bobReconnected, 'initialState');
            const [, reconnectedState] = await Promise.all([reconnectConnected, reconnectInitialState]);
            const reconnectDurationMs = performance.now() - reconnectStartedAt;
            assert.notEqual(reconnectedState.playerId, bobId, 'reconnect receives a fresh transient socket ID');
            assert.ok(reconnectedState.players[aliceId], 'reconnected client rejoins the room with the other player');

            const firstTickIndex = tickTimes.length;
            await waitForCount(() => tickTimes.length, firstTickIndex + 21);
            const measuredTickTimes = tickTimes.slice(firstTickIndex, firstTickIndex + 21);
            const intervals = measuredTickTimes.slice(1).map((time, index) => time - measuredTickTimes[index]);
            const averageTickMs = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
            const effectiveTickHz = 1000 / averageTickMs;

            assert.ok(averageTickMs >= 25 && averageTickMs <= 50,
                `expected average tick near 33ms (30Hz), got ${averageTickMs.toFixed(2)}ms`);
            assert.ok(reconnectDurationMs < 3000, `reconnect should complete within timeout, got ${reconnectDurationMs.toFixed(2)}ms`);

            t.diagnostic(`Configured target: 30Hz. Measured over 20 intervals: ${averageTickMs.toFixed(2)}ms average (${effectiveTickHz.toFixed(2)}Hz).`);
            t.diagnostic(`Player disconnect notice: ${disconnectNoticeMs.toFixed(2)}ms; reconnect handshake to initialState: ${reconnectDurationMs.toFixed(2)}ms.`);
        } finally {
            for (const client of clients) client.disconnect();
            stopGameLoop();
            await closeIo(ioServer);
        }
    });
});
