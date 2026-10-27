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

function waitForEvent(socket, eventName, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${eventName}`)), timeoutMs);
        const cleanup = () => {
            clearTimeout(timer);
            socket.off(eventName, onEvent);
            socket.off('connect_error', onError);
        };
        const finish = (error, value) => {
            cleanup();
            if (error) reject(error);
            else resolve(value);
        };
        const onEvent = (value) => finish(null, value);
        const onError = (error) => finish(error);
        socket.once(eventName, onEvent);
        socket.once('connect_error', onError);
    });
}

function waitForSkillOutcome(socket) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timer);
            socket.off('skillSuccess', onSuccess);
            socket.off('combatError', onError);
        };
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out waiting for skillSuccess or combatError'));
        }, 15_000);
        const onSuccess = (value) => { cleanup(); resolve(value); };
        const onError = (value) => { cleanup(); reject(new Error(`Server rejected attack: ${value.message}`)); };
        socket.once('skillSuccess', onSuccess);
        socket.once('combatError', onError);
    });
}

after(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    userRepository.findById = originalFindById;
    userRepository.updateCharacter = originalUpdateCharacter;
});

describe('NRO source charm loot pickup', () => {
    it('auto-picks task loot for the owner and advances the task without a manual pickup input', async () => {
        process.env.JWT_SECRET = 'nro-charm-thu-hut-owner-auto-pickup-test-secret';
        const user = {
            _id: 'nro_charm_loot_owner', username: 'nro_charm_loot_owner',
            character: {
                level: 1, exp: 0, maxExp: 100, hp: 500, maxHp: 500, mp: 200, maxMp: 200,
                gold: 0, dtn: 0, position: { x: 200, y: 300 },
                nroCharacter: {
                    created: true, raceId: 'earth', mapId: 4, zoneId: 0,
                    position: { x: 592, y: 144 },
                    baseStats: { str: 100_000, armor: 0, maxHp: 500, maxMp: 200 },
                    inventory: { power: 50_000, dtn: 0, gold: 0 },
                    mainTask: { taskId: 8, status: 'active', subtaskIndex: 1, progress: 0 },
                    bag: [], effects: [{ type: 'nro_charm_thu_hut', name: 'Bùa Thu Hút', expiresAt: Date.now() + 60 * 60 * 1000 }]
                }
            }
        };
        const users = new Map([[user._id, user]]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async (id, character) => {
            const stored = users.get(String(id));
            if (stored) stored.character = { ...stored.character, ...character, nroCharacter: {
                ...stored.character.nroCharacter, ...character.nroCharacter
            } };
            return { acknowledged: true };
        };

        const httpServer = http.createServer();
        const ioServer = new SocketServer(httpServer);
        const stopGameLoop = setupGameSocket(ioServer);
        const clients = [];
        try {
            await new Promise((resolve, reject) => {
                httpServer.once('error', reject);
                httpServer.listen(0, '127.0.0.1', resolve);
            });
            const client = createClient(`http://127.0.0.1:${httpServer.address().port}`, {
                auth: { token: authService.generateToken({ id: user._id }) },
                reconnection: false, timeout: 3000
            });
            clients.push(client);
            const state = await waitForEvent(client, 'initialState');
            assert.ok(state.players[state.playerId].effects.some((effect) => effect.type === 'nro_charm_thu_hut'));
            assert.equal(state.character.nroCharacter.mainTask.taskId, 8);
            const target = Object.values(state.monsters).find((monster) => monster.templateId === 10 && !monster.isDead && monster.hp > 0);
            assert.ok(target, 'map 4 must spawn a living mother lizard');

            const outcomePromise = waitForSkillOutcome(client);
            const taskPromise = waitForEvent(client, 'nroTaskUpdate');
            const pickupPromise = waitForEvent(client, 'itemPickupResult');
            const resultPromise = Promise.all([outcomePromise, taskPromise, pickupPromise]);
            client.emit('playerAttack', { skillId: 'basic', targetId: target.id });
            const [hit, task, pickup] = await resultPromise;

            assert.ok(hit.damageTaken.some((entry) => entry.targetId === target.id && entry.isDead), JSON.stringify(hit));
            assert.equal(pickup.ok, true);
            assert.ok(pickup.bag.some((slot) => Number(slot.templateId) === 20));
            assert.equal(task.taskId, 8);
            assert.equal(task.status, 'ready_to_report');
            assert.equal(task.subtaskIndex, 2);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('keeps stamina and Bùa Dẻo Dai authoritative across cast, persistence, and reconnect', async () => {
        process.env.JWT_SECRET = 'nro-stamina-reconnect-test-secret';
        const user = {
            _id: 'nro_stamina_reconnect', username: 'nro_stamina_reconnect',
            character: {
                level: 1, exp: 0, maxExp: 100, hp: 500, maxHp: 500, mp: 200, maxMp: 200,
                gold: 0, dtn: 0, position: { x: 200, y: 300 },
                nroCharacter: {
                    created: true, raceId: 'earth', mapId: 0, zoneId: 0,
                    position: { x: 60, y: 384 },
                    stamina: 1, maxStamina: 5, staminaAttackCount: 4,
                    effects: [{ type: 'nro_charm_deo_dai', name: 'Bùa Dẻo Dai', expiresAt: Date.now() + 60_000 }]
                }
            }
        };
        const users = new Map([[user._id, user]]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async (id, character) => {
            const stored = users.get(String(id));
            if (stored) stored.character = { ...stored.character, ...character, nroCharacter: {
                ...stored.character.nroCharacter, ...character.nroCharacter
            } };
            return { acknowledged: true };
        };

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
            const connectClient = async () => {
                const client = createClient(url, {
                    auth: { token: authService.generateToken({ id: user._id }) },
                    reconnection: false, timeout: 3000
                });
                clients.push(client);
                return { client, state: await waitForEvent(client, 'initialState') };
            };

            const { client, state } = await connectClient();
            assert.equal(state.character.nroCharacter.stamina, 1);
            assert.equal(state.character.nroCharacter.maxStamina, 5);
            const successPromise = waitForEvent(client, 'skillSuccess');
            const statsPromise = waitForEvent(client, 'statsUpdate');
            client.emit('playerAttack', { skillId: 'basic' });
            const [success, stats] = await Promise.all([successPromise, statsPromise]);
            assert.equal(success.stamina, 1);
            assert.equal(stats.stamina, 1);
            assert.equal(user.character.nroCharacter.staminaAttackCount, 4);

            client.disconnect();
            const reconnected = await connectClient();
            assert.equal(reconnected.state.character.nroCharacter.stamina, 1);
            assert.ok(reconnected.state.players[reconnected.state.playerId].effects
                .some((effect) => effect.type === 'nro_charm_deo_dai'));
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });
});
