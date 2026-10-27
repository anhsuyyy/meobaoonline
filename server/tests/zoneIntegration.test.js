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
const originalCreateNroCharacter = userRepository.createNroCharacter;

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

function waitForMatchingEvent(socket, eventName, predicate, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error(`Timed out waiting for matching ${eventName}`)), timeoutMs);
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
        const onEvent = (payload) => {
            if (predicate(payload)) finish(null, payload);
        };
        const onError = (error) => finish(error);
        socket.on(eventName, onEvent);
        socket.once('connect_error', onError);
    });
}

function waitForSkillOutcome(socket, timeoutMs = 1500) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timer);
            socket.off('skillSuccess', onSuccess);
            socket.off('combatError', onError);
        };
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out waiting for skillSuccess or combatError'));
        }, timeoutMs);
        const onSuccess = (payload) => { cleanup(); resolve(payload); };
        const onError = (payload) => { cleanup(); reject(new Error(`Server rejected attack: ${payload.message}`)); };
        socket.once('skillSuccess', onSuccess);
        socket.once('combatError', onError);
    });
}

function makeUser(id, zoneId) {
    return {
        _id: id,
        username: id,
        character: {
            level: 1, exp: 0, maxExp: 100, classId: null,
            hp: 500, maxHp: 500, mp: 200, maxMp: 200,
            gold: 0, dtn: 0, position: { x: 200, y: 300 },
            questProgress: 0, questCompleted: false,
            nroCharacter: { mapId: 0, zoneId }
        }
    };
}

function makeClient(url, userId) {
    return createClient(url, {
        auth: { token: authService.generateToken({ id: userId }) },
        reconnection: false,
        timeout: 3000
    });
}

after(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    userRepository.findById = originalFindById;
    userRepository.updateCharacter = originalUpdateCharacter;
    userRepository.createNroCharacter = originalCreateNroCharacter;
});

describe('NRO map zone isolation', () => {
    it('validates, stores and broadcasts a new NRO character name', async () => {
        process.env.JWT_SECRET = 'nro-character-name-creation-test-secret';
        const user = makeUser('character_name_owner', 0);
        user.character.nroCharacter = { created: false, mapId: 0, zoneId: 0, position: { x: 60, y: 384 } };
        const users = new Map([[user.username, user]]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async () => ({ acknowledged: true });
        userRepository.createNroCharacter = async (id, nroCharacter) => {
            assert.equal(String(id), user.username);
            user.character.nroCharacter = { ...user.character.nroCharacter, ...nroCharacter };
            return { character: user.character };
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');

            const invalidResultPromise = waitForEvent(client, 'nroCharacterCreationResult');
            client.emit('createNroCharacter', { raceId: 'earth', characterName: 'ab name' });
            const invalidResult = await invalidResultPromise;
            assert.equal(invalidResult.ok, false);
            assert.equal(user.character.nroCharacter.created, false, 'invalid names must not be persisted');

            const resultPromise = waitForEvent(client, 'nroCharacterCreationResult');
            const transitionPromise = waitForEvent(client, 'mapTransition');
            client.emit('createNroCharacter', { raceId: 'earth', characterName: 'MèoBáo_01' });
            const [result, transition] = await Promise.all([resultPromise, transitionPromise]);
            assert.equal(result.ok, true);
            assert.equal(user.character.nroCharacter.characterName, 'MèoBáo_01');
            assert.equal(result.character.characterName, 'MèoBáo_01');
            assert.equal(transition.player.username, 'MèoBáo_01');
            const chatAfterCreation = await new Promise((resolve) => client.emit('chatSend', {
                channel: 'area', text: 'Kiểm tra tên chat'
            }, resolve));
            assert.equal(chatAfterCreation.message.senderName, 'MèoBáo_01');

            client.disconnect();
            const reconnectClient = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(reconnectClient);
            const reconnectedState = await waitForEvent(reconnectClient, 'initialState');
            assert.equal(reconnectedState.players[reconnectedState.playerId].username, 'MèoBáo_01');
            await new Promise((resolve) => setTimeout(resolve, 1005));
            const chatAfterReconnect = await new Promise((resolve) => reconnectClient.emit('chatSend', {
                channel: 'area', text: 'Kiểm tra tên sau reconnect'
            }, resolve));
            assert.equal(chatAfterReconnect.message.senderName, 'MèoBáo_01');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('keeps a private quest boss out of another player’s initial and live snapshots in the same zone', async () => {
        process.env.JWT_SECRET = 'nro-private-quest-boss-visibility-test-secret';
        const owner = makeUser('private_boss_owner', 0);
        owner.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 47, zoneId: 0,
            position: { x: 636, y: 336 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 9, status: 'active', subtaskIndex: 0, progress: 0 }, bag: []
        };
        const observer = makeUser('private_boss_observer', 0);
        observer.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 47, zoneId: 0,
            position: { x: 680, y: 336 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 1, status: 'active', subtaskIndex: 0, progress: 0 }, bag: []
        };
        const users = new Map([[owner.username, owner], [observer.username, observer]]);
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
            const ownerClient = makeClient(url, owner.username);
            const observerClient = makeClient(url, observer.username);
            clients.push(ownerClient, observerClient);
            const ownerInitialPromise = waitForEvent(ownerClient, 'initialState');
            const observerInitialPromise = waitForEvent(observerClient, 'initialState');
            const [ownerInitial, observerInitial] = await Promise.all([ownerInitialPromise, observerInitialPromise]);
            assert.equal(Object.values(ownerInitial.monsters).some((mob) => mob.questEncounter === 'tau_7_7'), false);
            assert.equal(Object.values(observerInitial.monsters).some((mob) => mob.questEncounter === 'tau_7_7'), false);

            let observerSawPrivateBoss = false;
            const inspectSnapshot = (snapshot) => {
                if (Object.values(snapshot.monsters || {}).some((mob) => mob.questEncounter === 'tau_7_7')) {
                    observerSawPrivateBoss = true;
                }
            };
            observerClient.on('stateUpdate', inspectSnapshot);
            const ownerBossPromise = waitForMatchingEvent(ownerClient, 'stateUpdate', (snapshot) =>
                Object.values(snapshot.monsters || {}).some((mob) => mob.questEncounter === 'tau_7_7'));
            ownerClient.emit('interactNroNpc', 17);
            await ownerBossPromise;
            await new Promise((resolve) => setTimeout(resolve, 220));
            observerClient.off('stateUpdate', inspectSnapshot);
            assert.equal(observerSawPrivateBoss, false, 'live zone snapshots must not reveal another player’s quest boss');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('summons the private Tau77 quest boss at Bò Mộng and advances only after its owner is hit', async () => {
        process.env.JWT_SECRET = 'nro-task-nine-tau77-test-secret-32';
        const user = makeUser('tau77_quest_owner', 0);
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 47, zoneId: 0,
            position: { x: 636, y: 336 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 8, status: 'completed', subtaskIndex: 3, progress: 1 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');
            const startedPromise = waitForEvent(client, 'nroTaskUpdate');
            const bossSnapshotPromise = waitForMatchingEvent(client, 'stateUpdate', (snapshot) =>
                Object.values(snapshot.monsters || {}).some((monster) => monster.questEncounter === 'tau_7_7'));
            client.emit('interactNroNpc', 17);
            const started = await startedPromise;
            assert.equal(started.taskId, 9);
            assert.equal(started.subtaskIndex, 1);
            const bossSnapshot = await bossSnapshotPromise;
            const boss = Object.values(bossSnapshot.monsters || {})
                .find((monster) => monster.questEncounter === 'tau_7_7');
            assert.ok(boss, 'Bò Mộng should summon the source task encounter');
            assert.equal(boss.maxHp, 10_000);
            assert.deepEqual(boss.bossPartIds, [92, 93, 94]);
            assert.equal(boss.questOwnerUserId, undefined, 'private owner identifiers should not be sent to clients');
            const hitProgress = await waitForEvent(client, 'nroTaskUpdate', 8000);
            assert.equal(hitProgress.taskId, 9);
            assert.equal(hitProgress.subtaskIndex, 2);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('advances task 9 to the Karin conversation only after the player escapes into map 46', async () => {
        process.env.JWT_SECRET = 'nro-task-nine-map-test-secret-32chars';
        const user = makeUser('tau77_quest_escape', 0);
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 47, zoneId: 0,
            position: { x: 600, y: 60 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 9, status: 'active', subtaskIndex: 2, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');
            const taskPromise = waitForEvent(client, 'nroTaskUpdate');
            const transitionPromise = waitForEvent(client, 'mapTransition');
            client.emit('travelNroWaypoint', { destinationMapId: 46 });
            const [task, transition] = await Promise.all([taskPromise, transitionPromise]);
            assert.equal(transition.mapEntry.id, 46);
            assert.equal(task.taskId, 9);
            assert.equal(task.subtaskIndex, 3);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('starts source task 10 after the player reports the task 9 encounter to Thần Mèo Karin', async () => {
        process.env.JWT_SECRET = 'nro-task-nine-karin-npc-test-secret';
        const user = makeUser('tau77_quest_karin', 0);
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 46, zoneId: 0,
            position: { x: 420, y: 408 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 9, status: 'active', subtaskIndex: 3, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');
            const taskPromise = waitForEvent(client, 'nroTaskUpdate');
            const dialogPromise = waitForEvent(client, 'nroNpcDialog');
            client.emit('interactNroNpc', 18);
            const [task, dialog] = await Promise.all([taskPromise, dialogPromise]);
            assert.equal(task.taskId, 10);
            assert.equal(task.subtaskIndex, 0);
            assert.equal(task.status, 'active');
            assert.match(dialog.message, /Karin/);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('requires an explicit Karin challenge action and creates a private source-stat duel', async () => {
        process.env.JWT_SECRET = 'nro-task-ten-karin-duel-test-secret';
        const user = makeUser('karin_duel_start', 0);
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 46, zoneId: 0,
            position: { x: 420, y: 408 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 10, status: 'active', subtaskIndex: 0, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');
            const dialogPromise = waitForEvent(client, 'nroNpcDialog');
            client.emit('interactNroNpc', 18);
            const dialog = await dialogPromise;
            assert.deepEqual(dialog.options, [{ type: 'challenge_karin', label: 'Thách đấu Thần Mèo' }]);

            const bossPromise = waitForMatchingEvent(client, 'stateUpdate', (snapshot) =>
                Object.values(snapshot.monsters || {}).some((monster) => monster.questEncounter === 'karin_duel'));
            client.emit('nroNpcAction', { npcId: 18, action: 'challenge_karin' });
            const snapshot = await bossPromise;
            const boss = Object.values(snapshot.monsters).find((monster) => monster.questEncounter === 'karin_duel');
            assert.equal(boss.name, 'Thần Mèo Karin');
            assert.equal(boss.maxHp, 500);
            assert.deepEqual(boss.bossPartIds, [89, 90, 91]);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('advances task 10 only after the owner defeats the summoned Karin duel boss', async () => {
        process.env.JWT_SECRET = 'nro-task-ten-karin-kill-test-secret-32';
        const user = makeUser('karin_duel_kill', 0);
        user.character.hp = 5_000_000;
        user.character.maxHp = 5_000_000;
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 46, zoneId: 0,
            position: { x: 400, y: 408 }, baseStats: { str: 5_000, armor: 0, maxHp: 5_000_000, maxMp: 200 },
            mainTask: { taskId: 10, status: 'active', subtaskIndex: 0, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');
            const dialoguePromise = waitForEvent(client, 'nroNpcDialog');
            client.emit('interactNroNpc', 18);
            const dialogue = await dialoguePromise;
            assert.equal(dialogue.options[0].type, 'challenge_karin');

            const bossSnapshotPromise = waitForMatchingEvent(client, 'stateUpdate', (snapshot) =>
                Object.values(snapshot.monsters || {}).some((monster) => monster.questEncounter === 'karin_duel'));
            client.emit('nroNpcAction', { npcId: 18, action: 'challenge_karin' });
            const bossSnapshot = await bossSnapshotPromise;
            const boss = Object.values(bossSnapshot.monsters).find((monster) => monster.questEncounter === 'karin_duel');
            const skillPromise = waitForSkillOutcome(client);
            const progressPromise = waitForEvent(client, 'nroTaskUpdate');
            client.emit('playerAttack', { skillId: 'basic', targetId: boss.id });
            const skill = await skillPromise;
            const task = await progressPromise;
            assert.equal(skill.damageTaken[0].targetId, boss.id);
            assert.equal(skill.damageTaken[0].isDead, true);
            assert.equal(task.taskId, 10);
            assert.equal(task.subtaskIndex, 1);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('lets the task 10 owner kill Tau77 and advances to Bò Mộng without mob rewards', async () => {
        process.env.JWT_SECRET = 'nro-task-ten-tau77-kill-test-secret-32';
        const user = makeUser('task_ten_tau77_kill', 0);
        user.character.hp = 5_000_000;
        user.character.maxHp = 5_000_000;
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 47, zoneId: 0,
            position: { x: 755, y: 336 }, baseStats: { str: 100_000, armor: 0, maxHp: 5_000_000, maxMp: 200 },
            skillLevels: { s1: 1 },
            mainTask: { taskId: 10, status: 'active', subtaskIndex: 1, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            const initial = await waitForEvent(client, 'initialState');
            const boss = Object.values(initial.monsters).find((monster) => monster.questEncounter === 'tau_7_7');
            assert.ok(boss, 'task 10 reconnect should restore Tau77 in the owner zone');
            assert.equal(boss.hp, 10_000);
            const liveSnapshot = await waitForMatchingEvent(client, 'stateUpdate', (snapshot) =>
                Boolean(snapshot.monsters?.[boss.id] && snapshot.players?.[initial.playerId]));
            const livePlayer = liveSnapshot.players[initial.playerId];
            assert.equal(livePlayer.mapId, boss.mapId);
            assert.equal(livePlayer.zoneId, boss.zoneId);

            const skillPromise = waitForSkillOutcome(client);
            const progressPromise = waitForEvent(client, 'nroTaskUpdate');
            client.emit('playerAttack', { skillId: 's1', targetId: boss.id });
            const skill = await skillPromise;
            assert.equal(skill.damageTaken[0].targetId, boss.id);
            assert.equal(skill.damageTaken[0].isDead, true);
            const task = await progressPromise;
            assert.equal(task.taskId, 10);
            assert.equal(task.subtaskIndex, 2);
            assert.equal(users.get(user.username).character.nroCharacter.bag.length, 0,
                'quest bosses must not roll regular mob loot');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('gives task 10 the six-star Dragon Ball once and completes the home turn-in reward', async () => {
        process.env.JWT_SECRET = 'nro-task-ten-report-flow-test-secret';
        const bomoUser = makeUser('task_ten_bomo_reward', 0);
        bomoUser.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 47, zoneId: 0,
            position: { x: 636, y: 336 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 10, status: 'active', subtaskIndex: 2, progress: 0 }, bag: []
        };
        const homeUser = makeUser('task_ten_home_reward', 0);
        homeUser.character.power = 2_000;
        homeUser.character.dtn = 3_000;
        homeUser.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 21, zoneId: 0,
            position: { x: 228, y: 336 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 10, status: 'ready_to_report', subtaskIndex: 3, progress: 0 },
            bag: [{ templateId: 19, quantity: 1, options: [] }]
        };
        const users = new Map([[bomoUser.username, bomoUser], [homeUser.username, homeUser]]);
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
            const bomoClient = makeClient(`http://127.0.0.1:${httpServer.address().port}`, bomoUser.username);
            clients.push(bomoClient);
            await waitForEvent(bomoClient, 'initialState');
            const inventoryPromise = waitForEvent(bomoClient, 'nroInventoryResult');
            const taskPromise = waitForEvent(bomoClient, 'nroTaskUpdate');
            bomoClient.emit('interactNroNpc', 17);
            const [inventory, nextTask] = await Promise.all([inventoryPromise, taskPromise]);
            assert.equal(inventory.ok, true);
            assert.ok(inventory.bag.some((slot) => Number(slot.templateId) === 19 && Number(slot.quantity) === 1));
            assert.equal(nextTask.status, 'ready_to_report');
            assert.equal(nextTask.subtaskIndex, 3);

            const homeClient = makeClient(`http://127.0.0.1:${httpServer.address().port}`, homeUser.username);
            clients.push(homeClient);
            await waitForEvent(homeClient, 'initialState');
            const completedPromise = waitForEvent(homeClient, 'nroTaskUpdate');
            const paidStatsPromise = waitForEvent(homeClient, 'statsUpdate');
            const consumedBagPromise = waitForMatchingEvent(homeClient, 'nroInventoryResult', (result) =>
                result.ok && !result.bag.some((slot) => Number(slot.templateId) === 19));
            homeClient.emit('interactNroNpc', 0);
            const [completed, paidStats, consumedBag] = await Promise.all([
                completedPromise, paidStatsPromise, consumedBagPromise
            ]);
            assert.equal(completed.taskId, 10);
            assert.equal(completed.status, 'completed');
            assert.equal(paidStats.power, 17_000);
            assert.equal(paidStats.dtn, 18_000);
            assert.equal(consumedBag.bag.length, 0);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('consumes the seven-star Dragon Ball and pays task 8 once at the race home', async () => {
        process.env.JWT_SECRET = 'nro-task-eight-report-test-secret';
        const user = makeUser('dragon_ball_report', 0);
        user.character.power = 40_000;
        user.character.dtn = 100;
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 21, zoneId: 0,
            position: { x: 228, y: 336 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 8, status: 'ready_to_report', subtaskIndex: 2, progress: 0 },
            bag: [{ templateId: 20, quantity: 1, options: [] }]
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');
            const taskPromise = waitForEvent(client, 'nroTaskUpdate');
            const statsPromise = waitForEvent(client, 'statsUpdate');
            const inventoryPromise = waitForEvent(client, 'nroInventoryResult');
            client.emit('interactNroNpc', 0);
            const [task, stats, inventory] = await Promise.all([taskPromise, statsPromise, inventoryPromise]);
            assert.equal(task.taskId, 8);
            assert.equal(task.status, 'active');
            assert.equal(task.subtaskIndex, 3);
            assert.equal(stats.power, 55_000);
            assert.equal(stats.dtn, 15_100);
            assert.equal(inventory.bag.some((slot) => slot.templateId === 20), false);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('completes task 8 after authoritative travel into Karin Tower map 46', async () => {
        process.env.JWT_SECRET = 'nro-task-eight-karin-test-secret';
        const user = makeUser('dragon_ball_karin', 0);
        user.character.power = 55_000;
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 47, zoneId: 0,
            position: { x: 600, y: 60 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 8, status: 'active', subtaskIndex: 3, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');
            const taskPromise = waitForEvent(client, 'nroTaskUpdate');
            const transitionPromise = waitForEvent(client, 'mapTransition');
            client.emit('travelNroWaypoint', { destinationMapId: 46 });
            const [task, transition] = await Promise.all([taskPromise, transitionPromise]);
            assert.equal(transition.mapEntry.id, 46);
            assert.equal(task.taskId, 8);
            assert.equal(task.status, 'completed');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('drops the seven-star Dragon Ball from a mother lizard and advances task 8 on pickup', async () => {
        process.env.JWT_SECRET = 'nro-task-eight-pickup-test-secret';
        const user = makeUser('dragon_ball_task', 0);
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 4, zoneId: 0,
            position: { x: 592, y: 144 },
            baseStats: { str: 100_000, armor: 0, maxHp: 500, maxMp: 200 },
            inventory: { power: 50_000, dtn: 0, gold: 0 },
            mainTask: { taskId: 8, status: 'active', subtaskIndex: 1, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            const state = await waitForEvent(client, 'initialState');
            const target = Object.values(state.monsters).find((monster) => monster.templateId === 10 && !monster.isDead && monster.hp > 0);
            assert.ok(target, 'map 4 must have a living source mother lizard');
            const hitPromise = waitForEvent(client, 'skillSuccess');
            const dropPromise = waitForEvent(client, 'itemDropped');
            client.emit('playerAttack', { skillId: 'basic', targetId: target.id });
            const hit = await hitPromise;
            assert.ok(hit.damageTaken.some((entry) => entry.targetId === target.id && entry.isDead), JSON.stringify({ hit, target, player: state.players[state.playerId] }));
            const drop = await dropPromise;
            assert.equal(drop.templateId, 20);
            const taskPromise = waitForEvent(client, 'nroTaskUpdate');
            const pickupPromise = waitForEvent(client, 'itemPickupResult');
            client.emit('pickupItem', drop.id);
            const [task, pickup] = await Promise.all([taskPromise, pickupPromise]);
            assert.equal(pickup.ok, true);
            assert.equal(pickup.bag.some((slot) => slot.templateId === 20), true);
            assert.equal(task.taskId, 8);
            assert.equal(task.status, 'ready_to_report');
            assert.equal(task.subtaskIndex, 2);
            assert.equal(task.targetMapId, null);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('drops and tracks chicken legs only through an authoritative kill and pickup on the target map', async () => {
        process.env.JWT_SECRET = 'nro-zone-integration-test-secret';
        const user = makeUser('food_task_pickup', 0);
        user.character.nroCharacter = {
            created: true,
            raceId: 'earth',
            mapId: 1,
            zoneId: 0,
            position: { x: 324, y: 384 },
            baseStats: { str: 10_000, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 2, status: 'active', subtaskIndex: 0, progress: 0 },
            bag: []
        };
        const observer = makeUser('food_task_pickup_observer', 0);
        observer.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 1, zoneId: 0,
            position: { x: 324, y: 384 }, bag: []
        };
        const users = new Map([[user.username, user], [observer.username, observer]]);
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
            const client = makeClient(url, user.username);
            clients.push(client);
            const statePromise = waitForEvent(client, 'initialState');
            const observerClient = makeClient(url, observer.username);
            clients.push(observerClient);
            const observerStatePromise = waitForEvent(observerClient, 'initialState');
            const [state, observerState] = await Promise.all([statePromise, observerStatePromise]);
            assert.equal(state.config.nroWorld.mapId, 1);
            const dinosaur = Object.values(state.monsters).find((monster) => monster.templateId === 1);
            assert.ok(dinosaur, `map 1 spawns the source dinosaur mob (received ${JSON.stringify(Object.values(state.monsters))})`);
            assert.ok(observerState.monsters[dinosaur.id], 'the observer sees the same zone mob');

            const dropPromise = waitForEvent(client, 'itemDropped');
            const observerDropPromise = waitForEvent(observerClient, 'itemDropped');
            const hitPromise = waitForEvent(client, 'skillSuccess');
            client.emit('playerAttack', { skillId: 'basic', targetId: dinosaur.id });
            const [drop, observerDrop, hit] = await Promise.all([dropPromise, observerDropPromise, hitPromise]);
            assert.equal(hit.damageTaken.some((entry) => entry.targetId === dinosaur.id && entry.isDead), true);
            assert.equal(drop.templateId, 73);
            assert.equal(drop.mapId, 1);
            assert.equal(observerDrop.id, drop.id);

            const taskPromise = waitForEvent(client, 'nroTaskUpdate');
            const pickupPromise = waitForEvent(client, 'itemPickupResult');
            const observerPickupPromise = waitForEvent(observerClient, 'itemPickupResult');
            observerClient.emit('pickupItem', drop.id);
            const observerPickup = await observerPickupPromise;
            assert.equal(observerPickup.ok, false, 'only the server-designated drop owner can claim this item');
            client.emit('pickupItem', drop.id);
            const [task, pickup] = await Promise.all([taskPromise, pickupPromise]);
            assert.equal(pickup.ok, true);
            assert.equal(pickup.bag.some((slot) => slot.templateId === 73 && slot.quantity === 1), true);
            assert.equal((observerPickup.bag || []).some((slot) => slot.templateId === 73), false);
            assert.equal(task.taskId, 2);
            assert.equal(task.progress, 1);
            assert.equal(task.status, 'active');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('validates the food task report, consumes 10 chicken legs and starts the meteor task', async () => {
        process.env.JWT_SECRET = 'nro-zone-integration-test-secret';
        const user = makeUser('food_task_report', 0);
        user.character.nroCharacter = {
            created: true,
            raceId: 'earth',
            mapId: 21,
            zoneId: 0,
            position: { x: 228, y: 336 },
            mainTask: { taskId: 2, status: 'ready_to_report', subtaskIndex: 1, progress: 0 },
            bag: [{ templateId: 73, quantity: 10, options: [] }]
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');

            const taskUpdatePromise = waitForEvent(client, 'nroTaskUpdate');
            const inventoryPromise = waitForEvent(client, 'nroInventoryResult');
            const statsPromise = waitForEvent(client, 'statsUpdate');
            const dialogPromise = waitForEvent(client, 'nroNpcDialog');
            client.emit('interactNroNpc', 0);
            const [task, inventory, stats, dialog] = await Promise.all([
                taskUpdatePromise, inventoryPromise, statsPromise, dialogPromise
            ]);
            assert.equal(task.taskId, 3);
            assert.equal(task.status, 'active');
            assert.equal(task.subtaskIndex, 0);
            assert.equal(inventory.bag.length, 0);
            assert.equal(stats.gold, 300_000_000);
            assert.equal(stats.power, 1_500);
            assert.equal(stats.dtn, 1_500);
            assert.match(dialog.message, /nâng một chỉ số/i);
            await new Promise((resolve) => setTimeout(resolve, 50));
            assert.equal(users.get(user.username).character.nroCharacter.mainTask.taskId, 3);
            assert.equal(users.get(user.username).character.nroCharacter.mainTask.status, 'active');
            assert.equal(users.get(user.username).character.nroCharacter.bag.length, 0);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('grants the meteor task reward only after reporting to the home NPC', async () => {
        process.env.JWT_SECRET = 'nro-zone-integration-test-secret';
        const user = makeUser('meteor_task_report', 0);
        user.character.dtn = 4_000;
        user.character.power = 4_000;
        user.character.nroCharacter = {
            created: true,
            raceId: 'earth',
            mapId: 21,
            zoneId: 0,
            position: { x: 228, y: 336 },
            mainTask: { taskId: 3, status: 'ready_to_report', subtaskIndex: 2, progress: 1 },
            bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');

            const taskPromise = waitForEvent(client, 'nroTaskUpdate');
            const statsPromise = waitForEvent(client, 'statsUpdate');
            const dialogPromise = waitForEvent(client, 'nroNpcDialog');
            client.emit('interactNroNpc', 0);
            const [task, stats, dialog] = await Promise.all([taskPromise, statsPromise, dialogPromise]);
            assert.equal(task.taskId, 3);
            assert.equal(task.status, 'completed');
            assert.equal(stats.dtn, 6_000);
            assert.equal(stats.power, 6_000);
            assert.match(dialog.message, /2\.000 sức mạnh và tiềm năng/i);
            await new Promise((resolve) => setTimeout(resolve, 50));
            assert.equal(users.get(user.username).character.nroCharacter.mainTask.status, 'completed');
            assert.equal(users.get(user.username).character.power, 6_000);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('advances the meteor task after training and entering the race cliff through an edge waypoint', async () => {
        process.env.JWT_SECRET = 'nro-zone-integration-test-secret';
        const user = makeUser('meteor_task_progress', 0);
        user.character.dtn = 10_000;
        user.character.power = 100_000;
        user.character.nroCharacter = {
            created: true,
            raceId: 'earth',
            mapId: 0,
            zoneId: 0,
            position: { x: 36, y: 432 },
            baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            nroStats: { hp: 500, mp: 200, damage: 100, defense: 0, critical: 0 },
            mainTask: { taskId: 3, status: 'active', subtaskIndex: 0, progress: 0 },
            bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            const initial = await waitForEvent(client, 'initialState');
            assert.equal(initial.config.nroWorld.mapId, 0);

            const trainedTaskPromise = waitForEvent(client, 'nroTaskUpdate');
            const trainedResultPromise = waitForEvent(client, 'nroTrainingResult');
            client.emit('trainNroStat', { statType: 2, points: 1 });
            const [trainedTask, trainedResult] = await Promise.all([trainedTaskPromise, trainedResultPromise]);
            assert.equal(trainedResult.ok, true);
            assert.equal(trainedTask.taskId, 3);
            assert.equal(trainedTask.subtaskIndex, 1);
            assert.equal(trainedTask.targetMapId, 42);
            assert.equal(trainedTask.targetMapName, 'Vách núi Aru');

            const transitionPromise = waitForEvent(client, 'mapTransition');
            const taskReadyPromise = waitForEvent(client, 'nroTaskUpdate');
            client.emit('travelNroWaypoint', { destinationMapId: 42 });
            const [transition, readyTask] = await Promise.all([transitionPromise, taskReadyPromise]);
            assert.equal(transition.mapEntry.id, 42);
            assert.equal(readyTask.status, 'ready_to_report');
            assert.equal(readyTask.subtaskIndex, 2);
            await new Promise((resolve) => setTimeout(resolve, 50));
            assert.equal(users.get(user.username).character.nroCharacter.mainTask.status, 'ready_to_report');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('rejects NRO skill books below the source power requirement without consuming the book', async () => {
        process.env.JWT_SECRET = 'nro-zone-integration-test-secret';
        const makeSkillUser = (id, power) => {
            const user = makeUser(id, 0);
            user.character.power = power;
            user.character.nroCharacter = {
                created: true,
                raceId: 'earth',
                mapId: 0,
                zoneId: 0,
                bag: [{ templateId: 95, quantity: 1 }]
            };
            return user;
        };
        const users = new Map([
            ['skill_below_gate', makeSkillUser('skill_below_gate', 19_999)],
            ['skill_at_gate', makeSkillUser('skill_at_gate', 20_000)]
        ]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async (id, character) => {
            const user = users.get(String(id));
            if (user) user.character = { ...user.character, ...character, nroCharacter: {
                ...user.character.nroCharacter, ...character.nroCharacter
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
            const below = makeClient(url, 'skill_below_gate');
            const atGate = makeClient(url, 'skill_at_gate');
            clients.push(below, atGate);
            await Promise.all([
                waitForEvent(below, 'initialState'),
                waitForEvent(atGate, 'initialState')
            ]);

            const rejectedResultPromise = waitForEvent(below, 'nroInventoryResult');
            below.emit('learnNroSkill', { bagIndex: 0 });
            const rejected = await rejectedResultPromise;
            assert.equal(rejected.ok, false);
            assert.match(rejected.message, /20[.,]000 sức mạnh/);
            assert.equal(users.get('skill_below_gate').character.nroCharacter.bag.length, 1);
            assert.equal(users.get('skill_below_gate').character.nroCharacter.skillLevels?.s1, undefined);

            const configPromise = waitForEvent(atGate, 'nroSkillConfig');
            const learnedResultPromise = waitForEvent(atGate, 'nroInventoryResult');
            atGate.emit('learnNroSkill', { bagIndex: 0 });
            const [config, learned] = await Promise.all([configPromise, learnedResultPromise]);
            assert.equal(learned.ok, true);
            assert.equal(learned.skillLevels.s1, 2);
            assert.equal(config.skills.s1.unlocked, true);
            assert.equal(users.get('skill_at_gate').character.nroCharacter.bag.length, 0);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('isolates player snapshots, mob instances and area chat between zones', async () => {
        process.env.JWT_SECRET = 'nro-zone-integration-test-secret';
        const users = new Map([
            ['zone_zero', makeUser('zone_zero', 0)],
            ['zone_one', makeUser('zone_one', 1)]
        ]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async (id, character) => {
            const user = users.get(String(id));
            if (user) user.character.nroCharacter = character.nroCharacter;
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
            const zero = makeClient(url, 'zone_zero');
            const one = makeClient(url, 'zone_one');
            clients.push(zero, one);

            const zeroStatePromise = waitForEvent(zero, 'initialState');
            const oneStatePromise = waitForEvent(one, 'initialState');
            const [zeroState, oneState] = await Promise.all([zeroStatePromise, oneStatePromise]);

            assert.equal(zeroState.config.nroWorld.zoneId, 0);
            assert.equal(oneState.config.nroWorld.zoneId, 1);
            assert.ok(zeroState.players[zeroState.playerId]);
            assert.ok(oneState.players[oneState.playerId]);
            assert.equal(oneState.players[zeroState.playerId], undefined, 'players in another zone are hidden');
            assert.ok(Object.keys(zeroState.monsters).every((id) => id.startsWith('nro_mob_0_0_')));
            assert.ok(Object.keys(oneState.monsters).every((id) => id.startsWith('nro_mob_0_1_')));

            let zeroReceivedAreaChat = false;
            zero.on('chatMessage', (message) => {
                if (message.channel === 'area') zeroReceivedAreaChat = true;
            });
            const oneReceivedAreaChat = waitForEvent(one, 'chatMessage');
            const sendResult = await new Promise((resolve) => {
                one.emit('chatSend', { channel: 'area', text: 'Tin trong khu 1' }, resolve);
            });
            const areaMessage = await oneReceivedAreaChat;
            await new Promise((resolve) => setTimeout(resolve, 100));
            assert.equal(sendResult.ok, true);
            assert.equal(areaMessage.text, 'Tin trong khu 1');
            assert.equal(zeroReceivedAreaChat, false, 'area chat is limited to the sender zone');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('broadcasts server-calculated movement to both players in the same NRO zone and ignores client coordinates', async () => {
        process.env.JWT_SECRET = 'nro-zone-movement-authority-test-secret';
        const movementOwner = makeUser('movement_owner', 0);
        movementOwner.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 0, zoneId: 0,
            position: { x: 60, y: 432 }, baseStats: { str: 40, armor: 0, maxHp: 500, maxMp: 200 }
        };
        const movementObserver = makeUser('movement_observer', 0);
        movementObserver.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 0, zoneId: 0,
            position: { x: 200, y: 432 }, baseStats: { str: 40, armor: 0, maxHp: 500, maxMp: 200 }
        };
        const users = new Map([
            [movementOwner.username, movementOwner],
            [movementObserver.username, movementObserver]
        ]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async (id, character) => {
            const user = users.get(String(id));
            if (user) user.character.nroCharacter = { ...user.character.nroCharacter, ...character.nroCharacter };
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
            const owner = makeClient(url, 'movement_owner');
            clients.push(owner);
            const ownerInitial = await waitForEvent(owner, 'initialState');
            const observer = makeClient(url, 'movement_observer');
            clients.push(observer);
            const observerInitial = await waitForEvent(observer, 'initialState');
            const ownerId = ownerInitial.playerId;
            const startX = observerInitial.players[ownerId]?.x;
            assert.ok(Number.isFinite(startX), 'the second player receives the first player in initialState');
            assert.equal(ownerInitial.players[ownerId].grounded, true, 'player starts on the authored ground block');

            const downSnapshotPromise = waitForMatchingEvent(observer, 'stateUpdate', (snapshot) => {
                const player = snapshot.players?.[ownerId];
                return player?.grounded === true && player.y === 432;
            });
            owner.emit('playerInput', { down: true });
            const downSnapshot = await downSnapshotPromise;
            assert.equal(downSnapshot.players[ownerId].y, 432, 'pressing down cannot drop through the solid ground block');
            owner.emit('playerInput', { down: false });

            const movementSnapshotPromise = waitForMatchingEvent(observer, 'stateUpdate', (snapshot) =>
                Number(snapshot.players?.[ownerId]?.x) > startX);
            owner.emit('playerInput', { right: true });
            const movedSnapshot = await movementSnapshotPromise;
            const movedX = movedSnapshot.players[ownerId].x;
            assert.ok(movedX > startX, 'the server advances the player from directional input');
            assert.ok(movedX - startX < 100, 'movement advances by authoritative tick speed');

            const stoppedSnapshotPromise = waitForMatchingEvent(observer, 'stateUpdate', (snapshot) =>
                Number.isFinite(snapshot.players?.[ownerId]?.x)
                && snapshot.players[ownerId].x <= movedX + 5);
            owner.emit('playerInput', { right: false });
            const stoppedSnapshot = await stoppedSnapshotPromise;
            const finalPlayer = stoppedSnapshot.players[ownerId];
            assert.ok(finalPlayer.x < startX + 100, 'the following client coordinate spoof is also ignored');
            assert.ok(finalPlayer.x < 52 * 24);
            assert.ok(finalPlayer.y < 24 * 24);

            const afterSpoofPromise = waitForEvent(observer, 'stateUpdate');
            owner.emit('playerInput', { x: 50_000, y: 50_000 });
            const afterSpoof = await afterSpoofPromise;
            assert.equal(afterSpoof.players[ownerId].x, finalPlayer.x, 'coordinates alone cannot move the authoritative player');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('keeps flight server-authoritative, drains KI, and returns the player to the ground when flight ends', async () => {
        process.env.JWT_SECRET = 'nro-flight-loop-integration-test-secret';
        const user = makeUser('flight_loop', 0);
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 0, zoneId: 0,
            position: { x: 500, y: 432 },
            baseStats: { str: 40, armor: 0, maxHp: 500, maxMp: 200 }
        };
        const emptyKiUser = makeUser('flight_without_ki', 0);
        emptyKiUser.character.mp = 0;
        emptyKiUser.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 0, zoneId: 0,
            position: { x: 600, y: 432 },
            baseStats: { str: 40, armor: 0, maxHp: 500, maxMp: 200 }
        };
        const users = new Map([[user.username, user], [emptyKiUser.username, emptyKiUser]]);
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
            const client = makeClient(url, user.username);
            clients.push(client);
            const initial = await waitForEvent(client, 'initialState');
            const playerId = initial.playerId;
            const initialPlayer = initial.players[playerId];
            const initialMp = initial.character.mp;

            const movementPromise = waitForMatchingEvent(client, 'stateUpdate', (snapshot) => {
                const player = snapshot.players?.[playerId];
                return player?.isFlying && player.x > initialPlayer.x && player.y < initialPlayer.y;
            });
            client.emit('playerInput', { right: true, up: true });
            const moved = await movementPromise;
            assert.equal(moved.players[playerId].grounded, false);

            const releasedButMovingPromise = waitForMatchingEvent(client, 'stateUpdate', (snapshot) => {
                const player = snapshot.players?.[playerId];
                return player?.isFlying && player.x > moved.players[playerId].x;
            });
            client.emit('playerInput', { right: true, up: false });
            const releasedButMoving = await releasedButMovingPromise;
            assert.equal(releasedButMoving.players[playerId].isFlying, true, 'horizontal movement keeps flight active after up is released');

            const drainPromise = waitForMatchingEvent(client, 'statsUpdate', (stats) => Number(stats.mp) < initialMp, 3000);
            const drained = await drainPromise;
            assert.ok(drained.mp < initialMp, 'flight continuously consumes server-side KI');

            const groundedPromise = waitForMatchingEvent(client, 'stateUpdate', (snapshot) => {
                const player = snapshot.players?.[playerId];
                return player?.isFlying === false && player.grounded === true;
            });
            const stoppedPromise = waitForMatchingEvent(client, 'flightStateChanged', (state) => !state.isFlying);
            client.emit('playerInput', { right: false, up: false });
            await stoppedPromise;
            const grounded = await groundedPromise;
            assert.ok(grounded.players[playerId].y >= initialPlayer.y, 'gravity lands the player back on a platform');

            const noKiClient = makeClient(url, emptyKiUser.username);
            clients.push(noKiClient);
            await waitForEvent(noKiClient, 'initialState');
            const noKiErrorPromise = waitForEvent(noKiClient, 'flightError');
            noKiClient.emit('toggleFly');
            const noKiError = await noKiErrorPromise;
            assert.match(noKiError.message, /Không đủ KI/);
        } finally {
            clients.forEach((connectedClient) => connectedClient.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('restores authoritative NRO location, inventory and quest progress after reconnect', async () => {
        process.env.JWT_SECRET = 'nro-authoritative-reconnect-test-secret';
        const user = makeUser('nro_progress_reconnect', 0);
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 0, zoneId: 0,
            position: { x: 500, y: 432 },
            baseStats: { str: 40, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 2, status: 'active', subtaskIndex: 0, progress: 4 },
            bag: [{ templateId: 73, quantity: 4, options: [] }]
        };
        const users = new Map([[user.username, user]]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async (id, character) => {
            const stored = users.get(String(id));
            if (stored) {
                stored.character = { ...stored.character, ...character, nroCharacter: {
                    ...stored.character.nroCharacter, ...character.nroCharacter
                } };
            }
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
            const first = makeClient(url, user.username);
            clients.push(first);
            const initial = await waitForEvent(first, 'initialState');
            const startX = initial.players[initial.playerId].x;
            const movedPromise = waitForMatchingEvent(first, 'stateUpdate', (snapshot) =>
                Number(snapshot.players?.[initial.playerId]?.x) > startX);
            first.emit('playerInput', { right: true });
            const moved = await movedPromise;
            first.emit('playerInput', { right: false });
            first.disconnect();
            await new Promise((resolve) => setTimeout(resolve, 50));

            const stored = users.get(user.username).character.nroCharacter;
            assert.ok(stored.position.x > startX, 'disconnect persistence stores the server-calculated position');
            assert.equal(stored.mainTask.taskId, 2);
            assert.equal(stored.mainTask.progress, 4);
            assert.equal(stored.bag[0].quantity, 4);

            const reconnect = makeClient(url, user.username);
            clients.push(reconnect);
            const restored = await waitForEvent(reconnect, 'initialState');
            const restoredPlayer = restored.players[restored.playerId];
            assert.equal(restored.config.nroWorld.mapId, 0);
            assert.equal(restoredPlayer.x, stored.position.x);
            assert.equal(restored.character.nroCharacter.position.x, stored.position.x);
            assert.equal(restored.character.nroCharacter.mainTask.taskId, 2);
            assert.equal(restored.character.nroCharacter.mainTask.progress, 4);
            assert.equal(restored.character.nroCharacter.bag[0].quantity, 4);
            assert.ok(moved.players[initial.playerId].x > startX);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('broadcasts the server-confirmed combat result to another player in the same NRO zone', async () => {
        process.env.JWT_SECRET = 'nro-zone-combat-broadcast-test-secret';
        const createCombatUser = (id) => {
            const user = makeUser(id, 0);
            user.character.nroCharacter = {
                created: true, raceId: 'earth', mapId: 0, zoneId: 0,
                position: { x: 760, y: 432 },
                baseStats: { str: 10, armor: 0, maxHp: 500, maxMp: 200 },
                nroStats: { hp: 500, mp: 200, damage: 10, defense: 0, critical: 0 },
                bag: []
            };
            return user;
        };
        const users = new Map([
            ['combat_owner', createCombatUser('combat_owner')],
            ['combat_observer', createCombatUser('combat_observer')]
        ]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async (id, character) => {
            const user = users.get(String(id));
            if (user) user.character.nroCharacter = { ...user.character.nroCharacter, ...character.nroCharacter };
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
            const owner = makeClient(url, 'combat_owner');
            clients.push(owner);
            const ownerState = await waitForEvent(owner, 'initialState');
            const observer = makeClient(url, 'combat_observer');
            clients.push(observer);
            const observerState = await waitForEvent(observer, 'initialState');
            const target = Object.values(ownerState.monsters).find((monster) => monster.templateId === 0);
            assert.ok(target, 'the map sends its source rat mob in the initial snapshot');
            assert.ok(observerState.monsters[target.id], 'the observer receives the same zone mob');

            const observedHitPromise = waitForEvent(observer, 'skillSuccess');
            owner.emit('playerAttack', { skillId: 'basic', targetId: target.id, damage: 1_000_000 });
            const observedHit = await observedHitPromise;
            assert.equal(observedHit.playerId, ownerState.playerId);
            assert.equal(observedHit.skillId, 'basic');
            assert.equal(observedHit.effectDurationMs, 0);
            assert.equal(observedHit.rangePx, 50);
            assert.equal(observedHit.radiusPx, null);
            assert.ok(observedHit.damageTaken.some((hit) =>
                hit.targetId === target.id && hit.targetType === 'monster' && hit.damage > 0 && hit.hp < hit.maxHp
            ), `the broadcast carries the server-calculated hit: ${JSON.stringify({ observedHit, target })}`);
            assert.equal(observedHit.damageTaken.some((hit) => hit.damage >= 1_000_000), false,
                'a client-supplied damage value is ignored');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('validates and persists NRO faction flags through the server', async () => {
        process.env.JWT_SECRET = 'nro-zone-integration-test-secret';
        const users = new Map([['flag_user', makeUser('flag_user', 0)]]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async (id, character) => {
            const user = users.get(String(id));
            if (user) user.character.nroCharacter = { ...user.character.nroCharacter, ...character.nroCharacter };
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
            const first = makeClient(url, 'flag_user');
            clients.push(first);
            const firstStatePromise = waitForEvent(first, 'initialState');
            await firstStatePromise;

            const selectedFlagPromise = waitForEvent(first, 'nroFlagResult');
            first.emit('setNroFlag', { flag: 3 });
            const selectedFlag = await selectedFlagPromise;
            assert.equal(selectedFlag.ok, true);
            assert.equal(selectedFlag.flag, 3);

            const rateLimitPromise = waitForEvent(first, 'nroFlagResult');
            first.emit('setNroFlag', { flag: 4 });
            const rateLimited = await rateLimitPromise;
            assert.equal(rateLimited.ok, false);
            assert.equal(rateLimited.flag, 3);

            first.disconnect();
            await new Promise((resolve) => setTimeout(resolve, 50));
            const reconnect = makeClient(url, 'flag_user');
            clients.push(reconnect);
            const restoredStatePromise = waitForEvent(reconnect, 'initialState');
            const restoredFlagPromise = waitForEvent(reconnect, 'nroFlagResult');
            const [restoredState, restoredFlag] = await Promise.all([restoredStatePromise, restoredFlagPromise]);
            assert.equal(restoredState.character.nroCharacter.cFlag, 3);
            assert.equal(restoredFlag.flag, 3);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('gates power-limit upgrades to Quốc Vương and charges the server-side fast-upgrade cost', async () => {
        process.env.JWT_SECRET = 'nro-zone-integration-test-secret';
        const user = makeUser('power_limit_user', 0);
        user.character.power = 17_900_000_000;
        user.character.gold = 1_500_000_000;
        user.character.nroCharacter = {
            ...user.character.nroCharacter,
            created: true,
            mapId: 43,
            position: { x: 247, y: 432 }
        };
        const users = new Map([[user.username, user]]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async (id, character) => {
            const stored = users.get(String(id));
            if (stored) {
                stored.character.nroCharacter = { ...stored.character.nroCharacter, ...character.nroCharacter };
                stored.character.gold = character.gold;
            }
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');

            const kingDialogPromise = waitForEvent(client, 'nroNpcDialog');
            client.emit('interactNroNpc', 42);
            const kingDialog = await kingDialogPromise;
            assert.equal(kingDialog.ok, true);
            assert.equal(kingDialog.options[0].type, 'open_power_training');

            const allowedPromise = waitForEvent(client, 'nroPowerLimitResult');
            client.emit('openNroPowerLimit', { speed: true });
            const allowed = await allowedPromise;
            assert.equal(allowed.ok, true);
            assert.equal(allowed.limitPower, 1);
            assert.equal(allowed.gold, 500_000_000);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('consumes satellite items into zone entities and restores them in the next snapshot', async () => {
        process.env.JWT_SECRET = 'nro-zone-integration-test-secret';
        const user = makeUser('satellite_user', 0);
        user.character.nroCharacter = {
            ...user.character.nroCharacter,
            created: true,
            bag: [{ templateId: 343, quantity: 1, options: [] }]
        };
        const users = new Map([[user.username, user]]);
        userRepository.findById = async (id) => users.get(String(id)) || null;
        userRepository.updateCharacter = async (id, character) => {
            const stored = users.get(String(id));
            if (stored) stored.character.nroCharacter = { ...stored.character.nroCharacter, ...character.nroCharacter };
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
            const first = makeClient(url, user.username);
            clients.push(first);
            const firstState = await waitForEvent(first, 'initialState');
            assert.equal(firstState.character.nroCharacter.bag[0].templateId, 343);

            const dropPromise = waitForEvent(first, 'itemDropped');
            const usePromise = waitForEvent(first, 'nroInventoryResult');
            first.emit('useNroItem', { bagIndex: 0 });
            const [satellite, used] = await Promise.all([dropPromise, usePromise]);
            assert.equal(used.ok, true);
            assert.equal(used.bag.length, 0);
            assert.equal(satellite.type, 'satellite');
            assert.equal(satellite.templateId, 343);
            assert.equal(satellite.satellite, true);

            first.disconnect();
            await new Promise((resolve) => setTimeout(resolve, 50));
            const reconnect = makeClient(url, user.username);
            clients.push(reconnect);
            const restored = await waitForEvent(reconnect, 'initialState');
            assert.ok(Object.values(restored.items).some((item) => item.satellite && item.templateId === 343));
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('applies chicken recovery and timed combat consumables from the server inventory', async () => {
        process.env.JWT_SECRET = 'nro-zone-integration-test-secret';
        const user = makeUser('combat_consumables', 0);
        user.character.power = 10;
        user.character.hp = 50;
        user.character.mp = 20;
        user.character.nroCharacter = {
            created: true,
            raceId: 'earth',
            mapId: 0,
            zoneId: 0,
            position: { x: 60, y: 384 },
            baseStats: { str: 40, armor: 20, maxHp: 500, maxMp: 200 },
            bag: [
                { templateId: 74, quantity: 1, options: [] },
                { templateId: 382, quantity: 1, options: [] },
                { templateId: 383, quantity: 1, options: [] },
                { templateId: 381, quantity: 1, options: [] },
                { templateId: 384, quantity: 1, options: [] }
            ]
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');

            const chickenResult = waitForEvent(client, 'nroInventoryResult');
            const chickenStats = waitForEvent(client, 'statsUpdate');
            client.emit('useNroItem', { bagIndex: 0 });
            const [chicken, healed] = await Promise.all([chickenResult, chickenStats]);
            assert.equal(chicken.ok, true, chicken.message);
            assert.equal(healed.hp, healed.maxHp);
            assert.equal(healed.mp, healed.maxMp);
            assert.equal(chicken.bag[0].templateId, 382);

            const healthBuffResult = waitForEvent(client, 'nroInventoryResult');
            const healthBuffStats = waitForEvent(client, 'statsUpdate');
            client.emit('useNroItem', { bagIndex: 0 });
            const [healthBuff, boostedHealth] = await Promise.all([healthBuffResult, healthBuffStats]);
            assert.equal(healthBuff.ok, true);
            assert.equal(boostedHealth.maxHp, 1000);
            assert.equal(boostedHealth.hp, 1000);

            const kiBuffResult = waitForEvent(client, 'nroInventoryResult');
            const kiBuffStats = waitForEvent(client, 'statsUpdate');
            client.emit('useNroItem', { bagIndex: 0 });
            const [kiBuff, boostedKi] = await Promise.all([kiBuffResult, kiBuffStats]);
            assert.equal(kiBuff.ok, true);
            assert.equal(boostedKi.maxMp, 400);
            assert.equal(boostedKi.mp, 400);

            const rageResult = waitForEvent(client, 'nroInventoryResult');
            client.emit('useNroItem', { bagIndex: 0 });
            const rage = await rageResult;
            assert.equal(rage.ok, true);
            assert.match(rage.message, /10 phút/);
            const rageSnapshot = await waitForEvent(client, 'stateUpdate');
            assert.ok(Object.values(rageSnapshot.players).some((player) => player.effects.some((effect) => effect.type === 'damage_boost')));

            const armorResult = waitForEvent(client, 'nroInventoryResult');
            client.emit('useNroItem', { bagIndex: 0 });
            const armor = await armorResult;
            assert.equal(armor.ok, true);
            assert.equal(armor.bag.length, 0);
            const armorSnapshot = await waitForEvent(client, 'stateUpdate');
            assert.ok(Object.values(armorSnapshot.players).some((player) => player.effects.some((effect) => effect.type === 'damage_reduction')));

            client.disconnect();
            await new Promise((resolve) => setTimeout(resolve, 50));
            const reconnect = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(reconnect);
            const restored = await waitForEvent(reconnect, 'initialState');
            const restoredPlayer = Object.values(restored.players).find((player) => player.username === user.username);
            assert.deepEqual(new Set(restoredPlayer.effects.map((effect) => effect.type)), new Set([
                'damage_boost', 'damage_reduction', 'max_hp_boost', 'max_mp_boost'
            ]));
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('uses authored race-village waypoints for home-map startup spawns', async () => {
        process.env.JWT_SECRET = 'nro-zone-integration-test-secret';
        const starts = [
            ['earth_home', 21, 489, 336],
            ['namek_home', 22, 207, 336],
            ['saiyan_home', 23, 475, 336]
        ];
        const users = new Map(starts.map(([id, mapId]) => {
            const user = makeUser(id, 0);
            user.character.nroCharacter.mapId = mapId;
            return [id, user];
        }));
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
            const states = await Promise.all(starts.map(async ([id]) => {
                const client = makeClient(url, id);
                clients.push(client);
                const statePromise = waitForEvent(client, 'initialState');
                return statePromise;
            }));

            for (const [index, [, mapId, x, y]] of starts.entries()) {
                assert.equal(states[index].config.nroWorld.mapId, mapId);
                assert.deepEqual(states[index].config.nroWorld.spawn, { x, y });
                assert.deepEqual(
                    { x: states[index].players[states[index].playerId].x, y: states[index].players[states[index].playerId].y },
                    { x, y }
                );
            }
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('accepts NPC interaction in range and rejects the same interaction from outside server range', async () => {
        process.env.JWT_SECRET = 'nro-npc-interaction-range-test-secret';
        const farUser = makeUser('npc_interaction_far', 0);
        farUser.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 0, zoneId: 0,
            position: { x: 500, y: 432 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 }, bag: []
        };
        const nearUser = makeUser('npc_interaction_near', 0);
        nearUser.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 0, zoneId: 0,
            position: { x: 228, y: 432 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 }, bag: []
        };
        const users = new Map([[farUser.username, farUser], [nearUser.username, nearUser]]);
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
            const farClient = makeClient(url, farUser.username);
            const nearClient = makeClient(url, nearUser.username);
            clients.push(farClient, nearClient);
            const farStatePromise = waitForEvent(farClient, 'initialState');
            const nearStatePromise = waitForEvent(nearClient, 'initialState');
            const [farState, nearState] = await Promise.all([farStatePromise, nearStatePromise]);
            assert.equal(farState.config.nroWorld.mapId, 0);
            assert.equal(nearState.config.nroWorld.mapId, 0);

            const farDialogPromise = waitForEvent(farClient, 'nroNpcDialog');
            farClient.emit('interactNroNpc', 7);
            const farDialog = await farDialogPromise;
            assert.equal(farDialog.ok, false);
            assert.match(farDialog.message, /đến gần NPC hơn/i);

            const nearDialogPromise = waitForEvent(nearClient, 'nroNpcDialog');
            nearClient.emit('interactNroNpc', 7);
            const nearDialog = await nearDialogPromise;
            assert.equal(nearDialog.ok, true);
            assert.deepEqual(nearDialog.options, [{ type: 'open_shop', label: 'Mở cửa hàng' }]);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('opens Dende and Appule shops only for the matching planet and validates access on the server', async () => {
        process.env.JWT_SECRET = 'nro-planet-shop-access-test-secret';
        const makeShopUser = (username, raceId, mapId, npcId, position) => {
            const user = makeUser(username, 0);
            user.character.nroCharacter = {
                created: true, raceId, mapId, zoneId: 0, position,
                baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 }, bag: []
            };
            return user;
        };
        const namek = makeShopUser('dende_shop_user', 'namek', 7, 8, { x: 300, y: 432 });
        const saiyan = makeShopUser('appule_shop_user', 'saiyan', 14, 9, { x: 396, y: 408 });
        const wrongRace = makeShopUser('wrong_planet_shop_user', 'earth', 7, 8, { x: 300, y: 432 });
        wrongRace.character.gold = 1_000_000_000;
        const users = new Map([namek, saiyan, wrongRace].map((user) => [user.username, user]));
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
            const [namekClient, saiyanClient, wrongRaceClient] = [namek, saiyan, wrongRace].map((user) => {
                const client = makeClient(url, user.username);
                clients.push(client);
                return client;
            });
            await Promise.all(clients.map((client) => waitForEvent(client, 'initialState')));

            for (const [client, npcId] of [[namekClient, 8], [saiyanClient, 9]]) {
                const dialogPromise = waitForEvent(client, 'nroNpcDialog');
                client.emit('interactNroNpc', npcId);
                const dialog = await dialogPromise;
                assert.deepEqual(dialog.options, [{ type: 'open_shop', label: 'Mở cửa hàng' }]);
                const catalogPromise = waitForEvent(client, 'nroShopCatalog');
                client.emit('openNroShop', { npcId });
                const catalog = await catalogPromise;
                assert.equal(catalog.ok, true);
                assert.equal(catalog.npcId, npcId);
                assert.ok(catalog.items.length > 0);
            }

            const wrongRaceDialogPromise = waitForEvent(wrongRaceClient, 'nroNpcDialog');
            wrongRaceClient.emit('interactNroNpc', 8);
            assert.deepEqual((await wrongRaceDialogPromise).options, []);
            const deniedCatalogPromise = waitForEvent(wrongRaceClient, 'nroShopCatalog');
            wrongRaceClient.emit('openNroShop', { npcId: 8 });
            assert.equal((await deniedCatalogPromise).ok, false);

            const validCatalogPromise = waitForEvent(namekClient, 'nroShopCatalog');
            namekClient.emit('openNroShop', { npcId: 8 });
            const validShopEntryId = (await validCatalogPromise).items[0].id;
            const deniedPurchasePromise = waitForEvent(wrongRaceClient, 'nroShopTransactionResult');
            wrongRaceClient.emit('buyNroShopItem', { npcId: 8, entryId: validShopEntryId });
            const deniedPurchase = await deniedPurchasePromise;
            assert.equal(deniedPurchase.ok, false);
            assert.match(deniedPurchase.message, /đúng hành tinh/i);
            assert.equal(deniedPurchase.bag, undefined, 'a rejected cross-planet purchase must not return a changed bag');
            assert.equal(wrongRace.character.gold, 1_000_000_000, 'a rejected cross-planet purchase cannot charge gold');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('travels between planets only through a nearby station NPC and an allowed destination', async () => {
        process.env.JWT_SECRET = 'nro-station-travel-test-secret-32chars';
        const user = makeUser('station_travel', 0);
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 24, zoneId: 0,
            position: { x: 516, y: 336 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 4, status: 'active', subtaskIndex: 0, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            const state = await waitForEvent(client, 'initialState');
            assert.equal(state.config.nroWorld.mapId, 24);

            const dialoguePromise = waitForEvent(client, 'nroNpcDialog');
            client.emit('interactNroNpc', 10);
            const dialogue = await dialoguePromise;
            assert.deepEqual(dialogue.options.map((option) => option.mapId).sort((a, b) => a - b), [7, 14]);

            const rejectedPromise = waitForEvent(client, 'zoneError');
            client.emit('travelNroPlanet', { destinationMapId: 21 });
            assert.match((await rejectedPromise).message, /đến gần nhân viên trạm tàu/i);

            const transitionPromise = waitForEvent(client, 'mapTransition');
            const historyPromise = waitForEvent(client, 'chatHistory');
            client.emit('travelNroPlanet', { destinationMapId: 7 });
            const transition = await transitionPromise;
            assert.equal(transition.mapEntry.id, 7);
            assert.equal(transition.player.mapId, 7);
            const history = await historyPromise;
            assert.ok(history.channels);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('keeps players in map portals until they explicitly confirm the destination', async () => {
        process.env.JWT_SECRET = 'nro-waypoint-explicit-travel-test-secret';
        const user = makeUser('waypoint_explicit_travel', 0);
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 0, zoneId: 0,
            position: { x: 1236, y: 420 },
            baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            const initial = await waitForEvent(client, 'initialState');
            assert.equal(initial.players[initial.playerId].mapId, 0);

            const passiveSnapshot = await waitForEvent(client, 'stateUpdate');
            assert.equal(passiveSnapshot.players[initial.playerId].mapId, 0,
                'standing inside a waypoint must not teleport the player');

            const rejectionPromise = waitForEvent(client, 'zoneError');
            client.emit('travelNroWaypoint', { destinationMapId: 21 });
            assert.match((await rejectionPromise).message, /đứng đúng cổng/i);

            const transitionPromise = waitForEvent(client, 'mapTransition');
            client.emit('travelNroWaypoint', { destinationMapId: 1 });
            const transition = await transitionPromise;
            assert.equal(transition.mapEntry.id, 1);
            assert.equal(transition.player.mapId, 1);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('advances task 4 from an authoritative kill of the matching planet mob', async () => {
        process.env.JWT_SECRET = 'nro-task-four-kill-test-secret-32chars';
        const user = makeUser('task_four_kill', 0);
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 2, zoneId: 0,
            position: { x: 330, y: 408 }, baseStats: { str: 100_000, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 4, status: 'active', subtaskIndex: 0, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            const state = await waitForEvent(client, 'initialState');
            const target = Object.values(state.monsters).find((monster) => monster.templateId === 4);
            assert.ok(target, 'map 2 must spawn the source Khủng long mẹ mob');
            const progressPromise = waitForEvent(client, 'nroTaskUpdate');
            const attackPromise = waitForEvent(client, 'skillSuccess');
            client.emit('playerAttack', { skillId: 'basic', targetId: target.id });
            const attack = await attackPromise;
            assert.ok(attack.damageTaken.some((hit) => hit.targetId === target.id && hit.isDead),
                `expected hit at player ${JSON.stringify(state.players[state.playerId])} to kill mob ${JSON.stringify(target)}; got ${JSON.stringify(attack.damageTaken)}`);
            const progress = await progressPromise;
            assert.equal(progress.taskId, 4);
            assert.equal(progress.subtaskIndex, 0);
            assert.equal(progress.progress, 1);
            assert.equal(progress.target, 3);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('starts the 100 wooden-training task after the 50-kill task completes', async () => {
        process.env.JWT_SECRET = 'nro-task-six-transition-test-secret-32';
        const user = makeUser('wooden_task_transition', 0);
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 0, zoneId: 0,
            position: { x: 740, y: 432 }, baseStats: { str: 100_000, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 5, status: 'active', subtaskIndex: 0, progress: 49 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            const state = await waitForEvent(client, 'initialState');
            const target = Object.values(state.monsters).find((monster) => monster.templateId === 0);
            assert.ok(target, 'the Earth starter village must have wooden training mobs');
            const progressPromise = waitForEvent(client, 'nroTaskUpdate');
            const attackPromise = waitForEvent(client, 'skillSuccess');
            client.emit('playerAttack', { skillId: 'basic', targetId: target.id });
            const [task, attack] = await Promise.all([progressPromise, attackPromise]);
            assert.ok(attack.damageTaken.some((hit) => hit.targetId === target.id && hit.isDead));
            assert.equal(task.taskId, 6);
            assert.equal(task.progress, 0);
            assert.equal(task.target, 100);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('counts the source Quỷ bay mob in Rừng nguyên sinh and points task 7 to Bò Mộng', async () => {
        process.env.JWT_SECRET = 'nro-task-seven-kill-test-secret-32chars';
        const user = makeUser('rescue_task_kill', 0);
        user.character.power = 16_000;
        user.character.dtn = 1000;
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 17, zoneId: 0,
            position: { x: 570, y: 336 }, baseStats: { str: 100_000, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 7, status: 'active', subtaskIndex: 1, progress: 9 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            const state = await waitForEvent(client, 'initialState');
            const target = Object.values(state.monsters).find((monster) => monster.templateId === 9);
            assert.ok(target, 'map 17 must spawn source mob template 9, Quỷ bay');
            const progressPromise = waitForEvent(client, 'nroTaskUpdate');
            const attackPromise = waitForEvent(client, 'skillSuccess');
            client.emit('playerAttack', { skillId: 'basic', targetId: target.id });
            const [task, attack] = await Promise.all([progressPromise, attackPromise]);
            assert.ok(attack.damageTaken.some((hit) => hit.targetId === target.id && hit.isDead));
            assert.equal(task.taskId, 7);
            assert.equal(task.subtaskIndex, 2);
            assert.equal(task.targetMapId, 47);
            assert.equal(task.targetMapName, 'Rừng Karin');
            assert.match(task.objective, /Bò Mộng/);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('pays task 7 once after the player reports to their race home NPC', async () => {
        process.env.JWT_SECRET = 'nro-task-seven-report-test-secret-32';
        const user = makeUser('rescue_task_report', 0);
        user.character.power = 2000;
        user.character.dtn = 3000;
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 21, zoneId: 0,
            position: { x: 228, y: 336 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 7, status: 'ready_to_report', subtaskIndex: 3, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');
            const taskPromise = waitForEvent(client, 'nroTaskUpdate');
            const statsPromise = waitForEvent(client, 'statsUpdate');
            client.emit('interactNroNpc', 0);
            const [task, stats] = await Promise.all([taskPromise, statsPromise]);
            assert.equal(task.status, 'completed');
            assert.equal(stats.power, 10_000);
            assert.equal(stats.dtn, 11_000);

            const repeatDialogPromise = waitForEvent(client, 'nroNpcDialog');
            client.emit('interactNroNpc', 0);
            const dialog = await repeatDialogPromise;
            assert.equal(dialog.ok, true);
            assert.equal(user.character.power, 10_000, 'a repeated home-NPC interaction must not grant task 7 again');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('accepts task 7 turn-in only at Bò Mộng in Rừng Karin', async () => {
        process.env.JWT_SECRET = 'nro-task-seven-bomo-test-secret-32';
        const user = makeUser('rescue_task_bomo', 0);
        user.character.power = 16_000;
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 47, zoneId: 0,
            position: { x: 636, y: 336 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 7, status: 'active', subtaskIndex: 2, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            await waitForEvent(client, 'initialState');
            const taskPromise = waitForEvent(client, 'nroTaskUpdate');
            const dialogPromise = waitForEvent(client, 'nroNpcDialog');
            client.emit('interactNroNpc', 17);
            const [task, dialog] = await Promise.all([taskPromise, dialogPromise]);
            assert.equal(task.status, 'ready_to_report');
            assert.equal(task.subtaskIndex, 3);
            assert.match(dialog.message, /Bò Mộng/);
            assert.match(task.objective, /Gôhan/);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('opens task 7 hunting step as soon as server combat power reaches 16,000', async () => {
        process.env.JWT_SECRET = 'nro-task-seven-power-test-secret-32';
        const user = makeUser('rescue_task_power', 0);
        user.character.power = 15_999;
        user.character.dtn = 1000;
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 18, zoneId: 0,
            position: { x: 810, y: 312 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 },
            mainTask: { taskId: 7, status: 'active', subtaskIndex: 0, progress: 0 }, bag: []
        };
        const users = new Map([[user.username, user]]);
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            const state = await waitForEvent(client, 'initialState');
            const target = Object.values(state.monsters).find((monster) => monster.templateId === 9);
            assert.ok(target);
            const taskPromise = waitForEvent(client, 'nroTaskUpdate');
            const hitPromise = waitForEvent(client, 'skillSuccess');
            client.emit('playerAttack', { skillId: 'basic', targetId: target.id });
            const [task, hit] = await Promise.all([taskPromise, hitPromise]);
            assert.equal(hit.damageTaken.some((entry) => entry.targetId === target.id && entry.isDead), false,
                'the gate must advance from a non-lethal authoritative power reward');
            assert.equal(task.taskId, 7);
            assert.equal(task.subtaskIndex, 1);
            assert.equal(task.targetMapId, 17);
            assert.ok(user.character.power >= 16_000);
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

    it('publishes the server-owned respawn countdown in regular player snapshots', async () => {
        process.env.JWT_SECRET = 'nro-respawn-countdown-snapshot-test-secret';
        const user = makeUser('respawn_countdown_snapshot', 0);
        user.character.hp = 0;
        user.character.nroCharacter = {
            created: true, raceId: 'earth', mapId: 0, zoneId: 0,
            position: { x: 60, y: 384 }, baseStats: { str: 100, armor: 0, maxHp: 500, maxMp: 200 }, bag: []
        };
        userRepository.findById = async (id) => String(id) === user.username ? user : null;
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
            const client = makeClient(`http://127.0.0.1:${httpServer.address().port}`, user.username);
            clients.push(client);
            const initialState = await waitForEvent(client, 'initialState');
            assert.equal(initialState.players[initialState.playerId].hp, 0);

            const snapshot = await waitForMatchingEvent(client, 'stateUpdate', (state) => {
                const ownPlayer = state.players?.[initialState.playerId];
                return ownPlayer?.hp === 0 && ownPlayer.respawnRemainingMs > 0;
            });
            const remainingMs = snapshot.players[initialState.playerId].respawnRemainingMs;
            assert.ok(remainingMs <= 5000, 'countdown comes from the five-second server respawn deadline');
        } finally {
            clients.forEach((client) => client.disconnect());
            stopGameLoop();
            await new Promise((resolve) => ioServer.close(resolve));
        }
    });

});





