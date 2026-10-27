import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    playerId: null,
    user: {
        username: '',
        token: null,
        isAuthenticated: false
    },
    isAuthModalOpen: true,
    character: null,
    characterLoading: false,
    characterError: null,
    hp: 0,
    maxHp: 500,
    mp: 0,
    maxMp: 200,
    respawnRemainingMs: 0,
    stamina: 1000,
    maxStamina: 1000,
    exp: 0,
    maxExp: 100,
    gold: 0,
    blueGems: 0,
    dtn: 0,
    power: 0,
    str: 0,
    armor: 0,
    crit: 0,
    damageReductionPercent: 0,
    reflectDamagePercent: 0,
    level: 1,
    skillConfig: null,
    skillLevels: {},
    skillCooldowns: {},
    activeSkillId: 'basic',
    isFlying: false,
    isAuto: false,
    autoAnchor: null,
    playerPos: { x: 200, y: 300 },
    selectedTarget: null,
    mapInfo: {
        zoneName: 'Làng Aru', subArea: 'Khu vực an toàn', channel: 'Khu 0',
        serverTime: '', fps: 0, ping: null, isSafeZone: true
    },
    quest: {
        id: 'quest_01',
        title: 'Bảo vệ Trạm Cào',
        progress: 0,
        target: 3,
        status: 'accepted'
    },
    chatMessages: [],
    isChatOpen: true,
    systemMessage: 'Đăng nhập để bắt đầu hành trình.'
};

function applyCharacter(state, character) {
    state.character = character;
    state.hp = character.hp;
    state.maxHp = character.maxHp;
    state.mp = character.mp;
    state.maxMp = character.maxMp;
    state.respawnRemainingMs = 0;
    state.stamina = character.nroCharacter?.stamina ?? state.stamina;
    state.maxStamina = character.nroCharacter?.maxStamina ?? state.maxStamina;
    state.exp = character.exp;
    state.maxExp = character.maxExp;
    state.gold = character.gold;
    state.blueGems = Math.max(0, Number(character.nroCharacter?.blueGems ?? character.blueGems) || 0);
    state.dtn = character.dtn;
    state.power = character.power ?? character.dtn ?? 0;
    state.str = Number(character.str ?? character.nroCharacter?.nroStats?.damage) || 0;
    state.armor = Number(character.armor ?? character.nroCharacter?.nroStats?.defense) || 0;
    state.crit = Number(character.crit ?? character.nroCharacter?.nroStats?.critical) || 0;
    state.damageReductionPercent = Number(character.nroDamageReductionPercent ?? character.nroCharacter?.nroDamageReductionPercent) || 0;
    state.reflectDamagePercent = Number(character.nroReflectDamagePercent ?? character.nroCharacter?.nroReflectDamagePercent) || 0;
    state.level = character.level;
    state.playerPos = character.position || state.playerPos;
    state.quest.progress = character.questProgress || 0;
    state.quest.status = character.questCompleted ? 'completed' : 'accepted';
}

export const gameSlice = createSlice({
    name: 'game',
    initialState,
    reducers: {
        setPlayerId: (state, action) => {
            state.playerId = action.payload;
        },
        setAuthSession: (state, action) => {
            const { user, character, token } = action.payload;
            state.user = { username: user.username, token, isAuthenticated: true };
            state.isAuthModalOpen = false;
            state.characterLoading = false;
            state.characterError = null;
            applyCharacter(state, character);
            state.chatMessages = [];
            state.playerId = null;
            state.isAuto = false;
            state.autoAnchor = null;
            state.skillConfig = null;
            state.skillLevels = {};
            state.skillCooldowns = {};
            state.activeSkillId = 'basic';
            state.isFlying = false;
            state.selectedTarget = null;
            state.systemMessage = `Chào mừng ${user.username}!`;
        },
        setCharacterLoading: (state, action) => {
            state.characterLoading = action.payload;
        },
        setCharacterError: (state, action) => {
            state.characterError = action.payload;
        },
        logoutUser: (state) => {
            state.user = { username: '', token: null, isAuthenticated: false };
            state.isAuthModalOpen = true;
            state.character = null;
            state.chatMessages = [];
            state.characterLoading = false;
            state.characterError = null;
            state.playerId = null;
            state.hp = 0;
            state.mp = 0;
            state.respawnRemainingMs = 0;
            state.level = 1;
            state.exp = 0;
            state.gold = 0;
            state.blueGems = 0;
            state.dtn = 0;
            state.power = 0;
            state.activeSkillId = 'basic';
            state.isFlying = false;
            state.systemMessage = 'Đã đăng xuất. Đăng nhập lại để tiếp tục.';
        },
        setAuthModalOpen: (state, action) => {
            state.isAuthModalOpen = action.payload;
        },
        updateStats: (state, action) => {
            const p = action.payload;
            if (p.hp !== undefined) state.hp = p.hp;
            if (p.maxHp !== undefined) state.maxHp = p.maxHp;
            if (p.mp !== undefined) state.mp = p.mp;
            if (p.maxMp !== undefined) state.maxMp = p.maxMp;
            if (p.respawnRemainingMs !== undefined) {
                state.respawnRemainingMs = Math.max(0, Number(p.respawnRemainingMs) || 0);
            }
            if (p.stamina !== undefined) state.stamina = p.stamina;
            if (p.maxStamina !== undefined) state.maxStamina = p.maxStamina;
            if (p.isFlying !== undefined) state.isFlying = Boolean(p.isFlying);
            if (p.gold !== undefined) state.gold = p.gold;
            if (p.blueGems !== undefined) {
                state.blueGems = Math.max(0, Number(p.blueGems) || 0);
                if (state.character?.nroCharacter) state.character.nroCharacter.blueGems = state.blueGems;
            }
            if (p.dtn !== undefined) state.dtn = p.dtn;
            if (p.power !== undefined) state.power = p.power;
            if (p.str !== undefined) state.str = p.str;
            if (p.armor !== undefined) state.armor = p.armor;
            if (p.crit !== undefined) state.crit = p.crit;
            if (p.damageReductionPercent !== undefined) state.damageReductionPercent = p.damageReductionPercent;
            if (p.reflectDamagePercent !== undefined) state.reflectDamagePercent = p.reflectDamagePercent;
            if (p.exp !== undefined) state.exp = p.exp;
            if (p.maxExp !== undefined) state.maxExp = p.maxExp;
            if (p.level !== undefined) state.level = p.level;
            if (p.str !== undefined && state.character) state.character.str = p.str;
            if (p.armor !== undefined && state.character) state.character.armor = p.armor;
            if (p.nroStats && state.character?.nroCharacter) state.character.nroCharacter.nroStats = p.nroStats;
            if (p.limitPower !== undefined && state.character?.nroCharacter) state.character.nroCharacter.limitPower = p.limitPower;
            if (p.username) state.user.username = p.username;
            if (state.character) {
                Object.assign(state.character, {
                    hp: state.hp, maxHp: state.maxHp, mp: state.mp, maxMp: state.maxMp,
                    gold: state.gold, dtn: state.dtn, power: state.power, exp: state.exp, maxExp: state.maxExp,
                    level: state.level
                });
                if (p.nroStats && state.character.nroCharacter) state.character.nroCharacter.nroStats = p.nroStats;
            }
        },
        setSkillConfig: (state, action) => {
            state.skillConfig = action.payload.skills;
            state.skillLevels = action.payload.levels || {};
        },
        setActiveSkill: (state, action) => {
            state.activeSkillId = action.payload || 'basic';
        },
        recordSkillSuccess: (state, action) => {
            const { skillId, cooldownMs, endsAt } = action.payload;
            state.skillCooldowns[skillId] = {
                durationMs: cooldownMs,
                endsAt: endsAt || Date.now() + cooldownMs
            };
        },
        clearSkillCooldowns: (state) => {
            state.skillCooldowns = {};
        },
        setPlayerPos: (state, action) => {
            state.playerPos = action.payload;
            if (state.character) state.character.position = action.payload;
        },
        setSelectedTarget: (state, action) => {
            state.selectedTarget = action.payload;
        },
        clearSelectedTarget: (state) => {
            state.selectedTarget = null;
        },
        updateTargetHp: (state, action) => {
            if (state.selectedTarget && state.selectedTarget.id === action.payload.id) {
                Object.assign(state.selectedTarget, action.payload);
                if (action.payload.hp <= 0) state.selectedTarget = null;
            }
        },
        setAutoFarmState: (state, action) => {
            state.isAuto = action.payload.isAuto;
            if (action.payload.anchor) state.autoAnchor = action.payload.anchor;
        },
        updateQuestProgress: (state, action) => {
            state.quest.progress = action.payload.progress;
            state.quest.status = action.payload.status;
            if (state.character) {
                state.character.questProgress = action.payload.progress;
                state.character.questCompleted = action.payload.status === 'completed';
            }
        },
        setQuestCompleted: (state, action) => {
            state.quest.status = 'completed';
            if (state.character) state.character.questCompleted = true;
            state.systemMessage = `🎉 Hoàn thành nhiệm vụ: ${action.payload.title}! Nhận +${action.payload.rewardGold} Vàng, +${action.payload.rewardDtn} ĐTN!`;
        },
        setNroCharacter: (state, action) => {
            if (state.character) state.character.nroCharacter = action.payload;
        },
        setNroBag: (state, action) => {
            if (state.character?.nroCharacter) state.character.nroCharacter.bag = action.payload;
        },
        setNroEquipment: (state, action) => {
            if (state.character?.nroCharacter) state.character.nroCharacter.equipment = action.payload || {};
        },
        setSystemMessage: (state, action) => {
            state.systemMessage = action.payload;
        },
        toggleChat: (state) => {
            state.isChatOpen = !state.isChatOpen;
        },
        receiveChatHistory: (state, action) => {
            state.chatMessages = [];
            mergeChatMessages(state, action.payload);
        },
        receiveChatMessage: (state, action) => {
            mergeChatMessages(state, [action.payload]);
        }
    }
});

function mergeChatMessages(state, messages) {
    const knownIds = new Set(state.chatMessages.map((message) => message.messageId));
    for (const message of messages || []) {
        if (message?.messageId && !knownIds.has(message.messageId)) {
            knownIds.add(message.messageId);
            state.chatMessages.push(message);
        }
    }
    state.chatMessages.sort((a, b) => a.sequence - b.sequence);
    if (state.chatMessages.length > 200) state.chatMessages.splice(0, state.chatMessages.length - 200);
}

export const {
    setPlayerId,
    setAuthSession,
    setCharacterLoading,
    setCharacterError,
    logoutUser,
    setAuthModalOpen,
    updateStats,
    setSkillConfig,
    setActiveSkill,
    recordSkillSuccess,
    clearSkillCooldowns,
    setPlayerPos,
    setSelectedTarget,
    clearSelectedTarget,
    updateTargetHp,
    setAutoFarmState,
    updateQuestProgress,
    setQuestCompleted,
    setNroCharacter,
    setNroBag,
    setNroEquipment,
    setSystemMessage,
    toggleChat,
    receiveChatHistory,
    receiveChatMessage
} = gameSlice.actions;

export default gameSlice.reducer;
