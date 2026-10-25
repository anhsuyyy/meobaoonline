const gameConfig = require('../config/gameConfig.json');
const { performance } = require('node:perf_hooks');
const MonsterAI = require('../game/MonsterAI');
const { calculateSkillDamage } = require('../game/combat');
const { clampToLeashCircle, findNearestValidTarget } = require('../game/autoFarm');
const { parseMovementInput, createTokenBucket, getMovementDelta, clampPlayerPosition } = require('../game/movement');
const authService = require('../modules/auth/authService');
const userRepository = require('../modules/auth/userRepository');
const { createChatService } = require('./chatService');

// Quản lý trạng thái thế giới authoritative phía server
const players = {};
const monsters = {};
const items = {};
let itemIdCounter = 1;

// Khởi tạo quái vật từ cấu hình
for (const mid in gameConfig.monsters) {
    monsters[mid] = new MonsterAI(gameConfig.monsters[mid]);
}

function setupGameSocket(io, { onTick } = {}) {
    const chatService = createChatService(io);
    io.publishSystemChat = chatService.publishSystem;
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        const decoded = token && authService.verifyToken(token);
        if (!decoded?.userId) {
            return next(new Error('AUTH_REQUIRED'));
        }

        try {
            const user = await userRepository.findById(decoded.userId);
            if (!user) return next(new Error('AUTH_REQUIRED'));
            socket.user = { userId: String(user._id), username: user.username };
            socket.character = user.character;
            return next();
        } catch {
            return next(new Error('SERVICE_UNAVAILABLE'));
        }
    });

    io.on('connection', async (socket) => {
        console.log(`[Socket.IO] Người chơi kết nối: ${socket.user.username} (${socket.id})`);

        const defaults = gameConfig.playerDefaults;
        const character = socket.character;
        if (!character) {
            socket.disconnect(true);
            return;
        }
        const startingClass = gameConfig.classes[character.classId] || gameConfig.classes.meo_bao;
        const questConfig = gameConfig.quests.quest_01;

        // Khởi tạo nhân vật mới với danh tính xác thực
        players[socket.id] = {
            id: socket.id,
            userId: socket.user.userId,
            username: socket.user.username,
            x: character.position?.x ?? 200,
            y: character.position?.y ?? 300,
            width: 40,
            height: 40,
            hp: character.hp,
            maxHp: character.maxHp || defaults.maxHp,
            mp: character.mp,
            maxMp: character.maxMp || defaults.maxMp,
            atk: defaults.atk,
            armor: defaults.armor,
            speed: defaults.speed,
            classId: character.classId || null,
            className: character.classId ? startingClass.name : null,
            input: { left: false, right: false, up: false, down: false },
            takeInputToken: createTokenBucket({ capacity: 30, refillPerSecond: 120 }),
            isAuto: false,
            autoAnchor: { x: character.position?.x ?? 200, y: character.position?.y ?? 300 },
            cooldowns: { basic: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 },
            inventory: {
                gold: character.gold || 0,
                dtn: character.dtn || 0,
                exp: character.exp || 0,
                level: character.level || 1,
                maxExp: character.maxExp || gameConfig.progression.expPerLevel
            },
            quests: {
                quest_01: {
                    id: 'quest_01',
                    status: character.questCompleted ? 'completed' : 'accepted',
                    progress: character.questProgress || 0,
                    target: questConfig.targetKill
                }
            },
            flags: { completed_quest_01: !!character.questCompleted },
            classInteractionActive: false,
            isPersisting: false,
            lastPersistAt: Date.now()
        };

        socket.mapId = gameConfig.map.id;
        socket.join('room_chuong0');
        socket.join(`map_${socket.mapId}`);
        const partyId = socket.partyId || character.partyId || null;
        if (partyId) socket.join(`party_${partyId}`);

        // Gửi toàn bộ trạng thái ban đầu cho người chơi
        socket.emit('initialState', {
            playerId: socket.id,
            user: { username: socket.user.username },
            players: Object.fromEntries(
                Object.entries(players).map(([id, player]) => [id, serializePlayer(player)])
            ),
            monsters: Object.fromEntries(
                Object.entries(monsters).map(([id, monster]) => [id, serializeMonster(monster)])
            ),
            items: Object.fromEntries(
                Object.entries(items).map(([id, item]) => [id, { ...item }])
            ),
            config: {
                map: gameConfig.map,
                skills: startingClass.skills || gameConfig.classes.meo_bao.skills,
                classes: gameConfig.classes,
                classNpc: gameConfig.classNpc,
                progression: gameConfig.progression
            },
            character: publicCharacter(players[socket.id])
        });
        socket.emit('chatHistory', chatService.getHistory({
            mapId: socket.mapId,
            partyId
        }));

        socket.on('chatSend', (payload, acknowledge) => {
            const result = chatService.handleSend(socket, payload);
            if (typeof acknowledge === 'function') acknowledge(result);
            else if (!result.ok) socket.emit('chatError', { message: result.error });
        });

        // Báo cho những người chơi khác trong phòng
        socket.to('room_chuong0').emit('newPlayer', serializePlayer(players[socket.id]));

        // 1. Nhận input điều khiển di chuyển
        socket.on('playerInput', (inputData) => {
            const p = players[socket.id];
            if (!p || p.isAuto || !p.takeInputToken()) return;
            const validatedInput = parseMovementInput(inputData);
            if (validatedInput) p.input = validatedInput;
        });

        socket.on('interactNpc', (npcId) => {
            const p = players[socket.id];
            const npc = gameConfig.classNpc;
            if (!p || npcId !== npc.id) return;

            if (p.inventory.level < gameConfig.progression.classSelectionLevel) {
                socket.emit('classNpcFeedback', {
                    message: `Đạt cấp ${gameConfig.progression.classSelectionLevel} để chọn class tại NPC này.`
                });
                return;
            }
            if (p.classId) {
                socket.emit('classNpcFeedback', { message: 'Nhân vật đã chọn class và không thể chọn lại.' });
                return;
            }
            if (Math.hypot(p.x - npc.x, p.y - npc.y) > npc.interactionRadius) {
                socket.emit('classNpcFeedback', { message: `Hãy đến gần ${npc.name} để trò chuyện.` });
                return;
            }

            p.classInteractionActive = true;
            socket.emit('classNpcInteraction', {
                npc: { id: npc.id, name: npc.name },
                classes: Object.entries(gameConfig.classes).map(([id, value]) => ({
                    id,
                    name: value.name,
                    role: value.role,
                    description: value.description,
                    portrait: value.portrait
                }))
            });
        });

        socket.on('selectClass', async (classId) => {
            const p = players[socket.id];
            const npc = gameConfig.classNpc;
            const classInfo = gameConfig.classes[classId];
            if (!p || !classInfo) {
                socket.emit('classSelectionResult', { success: false, message: 'Class không hợp lệ.' });
                return;
            }
            if (p.inventory.level < gameConfig.progression.classSelectionLevel) {
                socket.emit('classSelectionResult', {
                    success: false,
                    message: `Cần đạt cấp ${gameConfig.progression.classSelectionLevel} mới được chọn class.`
                });
                return;
            }
            if (p.classId) {
                socket.emit('classSelectionResult', { success: false, message: 'Class chỉ được chọn một lần.' });
                return;
            }
            if (!p.classInteractionActive || Math.hypot(p.x - npc.x, p.y - npc.y) > npc.interactionRadius) {
                p.classInteractionActive = false;
                socket.emit('classSelectionResult', {
                    success: false,
                    message: `Hãy đến gần và trò chuyện với ${npc.name} trước khi chọn class.`
                });
                return;
            }

            try {
                const updatedUser = await userRepository.selectClass(
                    p.userId,
                    classId,
                    gameConfig.progression.classSelectionLevel
                );
                if (!updatedUser) {
                    socket.emit('classSelectionResult', {
                        success: false,
                        message: 'Nhân vật đã được cập nhật ở nơi khác. Hãy đăng nhập lại để đồng bộ.'
                    });
                    return;
                }

                p.classId = classId;
                p.className = classInfo.name;
                p.classInteractionActive = false;
                p.lastPersistAt = Date.now();
                socket.emit('classSelectionResult', {
                    success: true,
                    message: `Chúc mừng! Bạn đã trở thành ${classInfo.name}.`,
                    character: publicCharacter(p)
                });
                socket.to('room_chuong0').emit('playerClassChanged', {
                    playerId: socket.id,
                    classId,
                    className: classInfo.name
                });
            } catch {
                socket.emit('classSelectionResult', {
                    success: false,
                    message: 'Không thể lưu class do lỗi kết nối dữ liệu. Vui lòng thử lại.'
                });
            }
        });

        // 2. Bật / Tắt Auto Farm với Leash Circle (P12 & P13)
        socket.on('toggleAuto', (status) => {
            const p = players[socket.id];
            if (p) {
                p.isAuto = !!status;
                if (p.isAuto) {
                    p.autoAnchor = { x: p.x, y: p.y };
                }
                socket.emit('autoStateChanged', { isAuto: p.isAuto, anchor: p.autoAnchor });
            }
        });

        // 3. Combat và kỹ năng: server xác thực skillId, MP, cooldown, tầm và mục tiêu.
        socket.on('playerAttack', async (payload = {}) => {
            const p = players[socket.id];
            if (!p || p.hp <= 0) return;

            const allowedSkills = ['basic', 's1', 's2', 's3', 's4', 's5'];
            if (!payload || typeof payload !== 'object' || !allowedSkills.includes(payload.skillId)) {
                socket.emit('combatError', { message: 'Kỹ năng không hợp lệ.' });
                return;
            }

            const skillId = payload.skillId;
            const activeClass = gameConfig.classes[p.classId] || gameConfig.classes.meo_bao;
            const skillConfig = skillId === 'basic'
                ? gameConfig.basicAttack
                : activeClass.skills?.[skillId] || gameConfig.classes.meo_bao.skills[skillId];
            if (!skillConfig) return;

            const now = Date.now();
            const lastCast = p.cooldowns[skillId] || 0;
            if (now - lastCast < skillConfig.cooldownMs) {
                return; // Đang hồi chiêu
            }

            if (p.mp < skillConfig.mpCost) {
                socket.emit('combatError', { message: 'Không đủ MP!' });
                return;
            }

            if (skillConfig.type === 'heal' && p.hp >= p.maxHp) {
                socket.emit('combatError', { message: 'HP đang đầy.' });
                return;
            }

            // Trừ MP & cập nhật cooldown authoritative
            p.mp -= skillConfig.mpCost;
            p.cooldowns[skillId] = now;

            const hits = [];

            let healed = 0;
            if (skillConfig.type === 'heal') {
                healed = Math.min(skillConfig.healAmount, p.maxHp - p.hp);
                p.hp += healed;
            } else {
                let targetCount = 0;
                for (const mid in monsters) {
                    const monster = monsters[mid];
                    if (monster.isDead || monster.hp <= 0) continue;

                    const distance = Math.hypot(p.x - monster.x, p.y - monster.y);
                    if (distance > skillConfig.range) continue;
                    if (skillConfig.type !== 'aoe' && targetCount > 0) break;
                    if (skillConfig.type === 'aoe' && targetCount >= skillConfig.maxTargets) break;
                    targetCount++;

                    for (let hit = 0; hit < (skillConfig.hits || 1); hit++) {
                        if (monster.isDead) break;
                        const { damage, isCrit } = calculateSkillDamage(p, monster, skillConfig);
                        const { damageDealt, isDead } = monster.takeDamage(damage);
                        p.inventory.dtn += Math.floor(damageDealt * monster.dtnFactor);
                        hits.push({ monsterId: mid, damage: damageDealt, isCrit, isDead });
                        if (isDead) {
                            handleMonsterDeath(monster, p, io);
                            break;
                        }
                    }
                }
            }

            // Gửi event chiến đấu cho cả phòng để render hiệu ứng & floating text
            io.to('room_chuong0').emit('playerAttacked', {
                playerId: socket.id,
                skillId,
                cooldownMs: skillConfig.cooldownMs,
                hits,
                healed
            });

            // Gửi chỉ số mới cho người chơi
            socket.emit('statsUpdate', {
                hp: p.hp,
                maxHp: p.maxHp,
                mp: p.mp,
                maxMp: p.maxMp,
                gold: p.inventory.gold,
                dtn: p.inventory.dtn,
                exp: p.inventory.exp,
                level: p.inventory.level,
                maxExp: p.inventory.maxExp
            });
            await persistPlayer(socket, p);
        });

        // 4. Nhặt vật phẩm (Atomic Server-Authoritative)
        socket.on('pickupItem', async (itemId) => {
            const p = players[socket.id];
            const item = items[itemId];
            if (!p || !item) return;

            const dist = Math.hypot(p.x - item.x, p.y - item.y);
            if (dist <= 60) {
                if (item.type === 'gold') {
                    p.inventory.gold += item.value;
                }
                delete items[itemId];

                io.to('room_chuong0').emit('itemPicked', { itemId, playerId: socket.id });
                socket.emit('statsUpdate', {
                    gold: p.inventory.gold,
                    dtn: p.inventory.dtn,
                    hp: p.hp,
                    mp: p.mp
                });
                await persistPlayer(socket, p);
            }
        });

        // 5. Ngắt kết nối
        socket.on('disconnect', async () => {
            console.log(`[Socket.IO] Người chơi ngắt kết nối: ${socket.user.username} (${socket.id})`);
            await persistPlayer(socket, players[socket.id]);
            delete players[socket.id];
            io.to('room_chuong0').emit('playerDisconnected', socket.id);
        });
    });

    // VÒNG LẶP SERVER 20Hz (mỗi 50ms)
    let tickCounter = 0;
    const tickIntervalMs = gameConfig.server.tickIntervalMs || 50;
    let nextTickAt = performance.now() + tickIntervalMs;
    let tickTimer;
    const runTick = () => {
        if (onTick) onTick(performance.now());
        tickCounter++;
        let stateChanged = false;

        // Xử lý di chuyển & hồi phục người chơi
        for (const id in players) {
            const p = players[id];
            let moved = false;

            if (p.isAuto) {
                const { target, distance } = findNearestValidTarget(p, monsters, gameConfig.playerDefaults.autoFarmRadius);

                if (target) {
                    if (distance > 55) {
                        const angle = Math.atan2(target.y - p.y, target.x - p.x);
                        const nextX = p.x + Math.cos(angle) * 3.5;
                        const nextY = p.y + Math.sin(angle) * 3.5;

                        const clamped = clampToLeashCircle(p.autoAnchor, { x: nextX, y: nextY }, gameConfig.playerDefaults.autoFarmLeashRadius);
                        p.x = clamped.x;
                        p.y = clamped.y;
                        moved = true;
                    } else {
                        const now = Date.now();
                        const autoSkill = gameConfig.classes.meo_bao.skills.s3;
                        const s3Ready = (now - (p.cooldowns.s3 || 0)) >= autoSkill.cooldownMs && p.mp >= autoSkill.mpCost;
                        const s1Ready = (now - (p.cooldowns.s1 || 0)) >= gameConfig.classes.meo_bao.skills.s1.cooldownMs && p.mp >= 2;

                        if (s3Ready) {
                            io.sockets.sockets.get(id)?.emit('autoAttackTrigger', { skillId: 's3' });
                        } else if (s1Ready) {
                            io.sockets.sockets.get(id)?.emit('autoAttackTrigger', { skillId: 's1' });
                        }
                    }
                }
            } else {
                const delta = getMovementDelta(p.input, p.speed);
                const nextPosition = clampPlayerPosition(p, { x: p.x + delta.x, y: p.y + delta.y }, gameConfig.map);
                moved = nextPosition.x !== p.x || nextPosition.y !== p.y;
                p.x = nextPosition.x;
                p.y = nextPosition.y;
            }

            if (p.isAuto) {
                const bounded = clampPlayerPosition(p, p, gameConfig.map);
                p.x = bounded.x;
                p.y = bounded.y;
            }

            if (moved) stateChanged = true;

            // Hồi phục MP mỗi 1 giây (20 tick)
            if (tickCounter % 20 === 0) {
                const regen = p.isAuto ? gameConfig.playerDefaults.mpRegenInCombat : gameConfig.playerDefaults.mpRegenOutOfCombat;
                if (p.mp < p.maxMp) {
                    p.mp = Math.min(p.maxMp, p.mp + regen);
                    io.sockets.sockets.get(id)?.emit('statsUpdate', { mp: p.mp });
                }
                if (tickCounter % 100 === 0 && Date.now() - p.lastPersistAt >= 5000) {
                    void persistPlayer(io.sockets.sockets.get(id), p);
                }
            }
        }

        // Cập nhật State Machine của quái
        for (const mid in monsters) {
            const m = monsters[mid];
            const oldX = m.x;
            const oldY = m.y;
            const oldState = m.state;
            m.update(players);

            if (oldX !== m.x || oldY !== m.y || oldState !== m.state) {
                stateChanged = true;
            }
        }

        // Phát snapshot 20Hz cho client
        if (stateChanged || tickCounter % 4 === 0) {
            const payload = {
                players: {},
                monsters: {}
            };

            for (const id in players) {
                payload.players[id] = {
                    x: Math.round(players[id].x),
                    y: Math.round(players[id].y),
                    hp: players[id].hp,
                    maxHp: players[id].maxHp,
                    mp: players[id].mp,
                    maxMp: players[id].maxMp,
                    username: players[id].username,
                    isAuto: players[id].isAuto
                };
            }

            for (const mid in monsters) {
                payload.monsters[mid] = {
                    x: Math.round(monsters[mid].x),
                    y: Math.round(monsters[mid].y),
                    hp: monsters[mid].hp,
                    maxHp: monsters[mid].maxHp,
                    state: monsters[mid].state,
                    isDead: monsters[mid].isDead
                };
            }

            io.to('room_chuong0').emit('stateUpdate', payload);
        }
        nextTickAt += tickIntervalMs;
        tickTimer = setTimeout(runTick, Math.max(0, nextTickAt - performance.now()));
    };
    tickTimer = setTimeout(runTick, tickIntervalMs);

    return () => clearTimeout(tickTimer);
}

function handleMonsterDeath(monster, killerPlayer, io) {
    const goldValue = Math.floor(Math.random() * (monster.goldMax - monster.goldMin + 1)) + monster.goldMin;
    const dropId = `drop_${itemIdCounter++}`;
    items[dropId] = {
        id: dropId,
        type: 'gold',
        x: Math.round(monster.x + (Math.random() * 20 - 10)),
        y: Math.round(monster.y + (Math.random() * 20 - 10)),
        value: goldValue
    };

    io.to('room_chuong0').emit('itemDropped', items[dropId]);
    killerPlayer.inventory.exp += monster.exp;

    const quest = killerPlayer.quests.quest_01;
    if (quest && quest.status === 'accepted') {
        quest.progress += 1;
        if (quest.progress >= quest.target) {
            quest.status = 'completed';
            killerPlayer.flags.completed_quest_01 = true;
            killerPlayer.inventory.gold += gameConfig.quests.quest_01.rewardGold;
            killerPlayer.inventory.dtn += gameConfig.quests.quest_01.rewardDtn;
            killerPlayer.inventory.exp += gameConfig.quests.quest_01.rewardExp;

            io.sockets.sockets.get(killerPlayer.id)?.emit('questCompleted', {
                questId: 'quest_01',
                title: gameConfig.quests.quest_01.title,
                rewardGold: gameConfig.quests.quest_01.rewardGold,
                rewardDtn: gameConfig.quests.quest_01.rewardDtn
            });
        }

        io.sockets.sockets.get(killerPlayer.id)?.emit('questProgressUpdate', {
            questId: 'quest_01',
            progress: quest.progress,
            target: quest.target,
            status: quest.status
        });
    }
    const socket = io.sockets.sockets.get(killerPlayer.id);
    const previousLevel = killerPlayer.inventory.level;
    levelUpCharacter(killerPlayer);
    if (previousLevel < gameConfig.progression.classSelectionLevel &&
        killerPlayer.inventory.level >= gameConfig.progression.classSelectionLevel) {
        socket?.emit('classLevelUnlocked', {
            level: killerPlayer.inventory.level,
            npc: { id: gameConfig.classNpc.id, name: gameConfig.classNpc.name }
        });
    }
    if (socket) void persistPlayer(socket, killerPlayer);
}

function levelUpCharacter(player) {
    while (player.inventory.exp >= player.inventory.maxExp) {
        player.inventory.exp -= player.inventory.maxExp;
        player.inventory.level += 1;
        player.inventory.maxExp = player.inventory.level * gameConfig.progression.expPerLevel;
        player.maxHp += 20;
        player.maxMp += 10;
        player.hp = player.maxHp;
        player.mp = player.maxMp;
    }
}

function publicCharacter(player) {
    return {
        level: player.inventory.level,
        exp: player.inventory.exp,
        maxExp: player.inventory.maxExp,
        classId: player.classId,
        hp: player.hp,
        maxHp: player.maxHp,
        mp: player.mp,
        maxMp: player.maxMp,
        gold: player.inventory.gold,
        dtn: player.inventory.dtn,
        position: { x: player.x, y: player.y },
        questProgress: player.quests.quest_01.progress,
        questCompleted: player.quests.quest_01.status === 'completed',
        className: player.className
    };
}

function serializePlayer(player) {
    return {
        id: player.id,
        username: player.username,
        x: player.x,
        y: player.y,
        width: player.width,
        height: player.height,
        hp: player.hp,
        maxHp: player.maxHp,
        mp: player.mp,
        maxMp: player.maxMp,
        classId: player.classId,
        className: player.className,
        isAuto: player.isAuto,
        inventory: { ...player.inventory }
    };
}

function serializeMonster(monster) {
    return {
        id: monster.id,
        name: monster.name,
        type: monster.type,
        x: monster.x,
        y: monster.y,
        width: monster.width,
        height: monster.height,
        hp: monster.hp,
        maxHp: monster.maxHp,
        state: monster.state,
        isDead: monster.isDead
    };
}

async function persistPlayer(socket, player) {
    if (!socket || !player || player.isPersisting) return;
    player.isPersisting = true;
    try {
        await userRepository.updateCharacter(player.userId, publicCharacter(player));
        player.lastPersistAt = Date.now();
    } catch (error) {
        const code = typeof error.code === 'string' || typeof error.code === 'number'
            ? ` (${error.code})`
            : '';
        console.error(`[Character] Failed to persist character for user ${player.userId}${code}.`);
        socket.emit('persistenceError', {
            message: 'Không thể lưu tiến trình nhân vật. Hãy kiểm tra kết nối và thử lại.'
        });
    } finally {
        player.isPersisting = false;
    }
}

module.exports = setupGameSocket;
