import { createSlice } from '@reduxjs/toolkit';
import { mockMapInfo, mockTargetStatus } from '../features/hud/hudMockData';

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
    classSelection: {
        isOpen: false,
        isSaving: false,
        error: null,
        npc: null,
        classes: []
    },
    hp: 0,
    maxHp: 500,
    mp: 0,
    maxMp: 200,
    exp: 0,
    maxExp: 100,
    gold: 0,
    dtn: 0,
    level: 1,
    className: null,
    isAuto: false,
    autoAnchor: null,
    playerPos: { x: 200, y: 300 },
    selectedTarget: mockTargetStatus,
    mapInfo: mockMapInfo,
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
    state.exp = character.exp;
    state.maxExp = character.maxExp;
    state.gold = character.gold;
    state.dtn = character.dtn;
    state.level = character.level;
    state.className = character.className;
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
            state.selectedTarget = null;
            state.classSelection = initialState.classSelection;
            state.systemMessage = character.classId
                ? `Chào mừng trở lại, ${user.username}!`
                : `Chào mừng ${user.username}! Hãy luyện cấp đến Lv.5 rồi tìm NPC chọn class.`;
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
            state.classSelection = initialState.classSelection;
            state.playerId = null;
            state.hp = 0;
            state.mp = 0;
            state.level = 1;
            state.exp = 0;
            state.gold = 0;
            state.dtn = 0;
            state.className = null;
            state.systemMessage = 'Đã đăng xuất. Đăng nhập lại để tiếp tục.';
        },
        setAuthModalOpen: (state, action) => {
            state.isAuthModalOpen = action.payload;
        },
        updateStats: (state, action) => {
            const p = action.payload;
            const previousLevel = state.level;
            if (p.hp !== undefined) state.hp = p.hp;
            if (p.maxHp !== undefined) state.maxHp = p.maxHp;
            if (p.mp !== undefined) state.mp = p.mp;
            if (p.maxMp !== undefined) state.maxMp = p.maxMp;
            if (p.gold !== undefined) state.gold = p.gold;
            if (p.dtn !== undefined) state.dtn = p.dtn;
            if (p.exp !== undefined) state.exp = p.exp;
            if (p.maxExp !== undefined) state.maxExp = p.maxExp;
            if (p.level !== undefined) state.level = p.level;
            if (p.username) state.user.username = p.username;
            if (state.character) {
                Object.assign(state.character, {
                    hp: state.hp, maxHp: state.maxHp, mp: state.mp, maxMp: state.maxMp,
                    gold: state.gold, dtn: state.dtn, exp: state.exp, maxExp: state.maxExp,
                    level: state.level
                });
            }
            if (previousLevel < 5 && state.level >= 5) {
                state.systemMessage = 'Bạn đã đạt Lv.5! Hãy đến gặp Trưởng Lão Linh Miêu để chọn class.';
            }
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
                state.selectedTarget.hp = action.payload.hp;
                if (action.payload.maxHp) state.selectedTarget.maxHp = action.payload.maxHp;
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
        openClassSelection: (state, action) => {
            state.classSelection = {
                isOpen: true,
                isSaving: false,
                error: null,
                npc: action.payload.npc,
                classes: action.payload.classes
            };
        },
        setClassSelectionSaving: (state, action) => {
            state.classSelection.isSaving = action.payload;
            state.classSelection.error = null;
        },
        setClassSelectionError: (state, action) => {
            state.classSelection.isSaving = false;
            state.classSelection.error = action.payload;
        },
        classSelectionSucceeded: (state, action) => {
            applyCharacter(state, action.payload.character);
            state.classSelection.isOpen = false;
            state.classSelection.isSaving = false;
            state.classSelection.error = null;
            state.systemMessage = action.payload.message;
        },
        closeClassSelection: (state) => {
            state.classSelection.isOpen = false;
            state.classSelection.isSaving = false;
            state.classSelection.error = null;
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
    setPlayerPos,
    setSelectedTarget,
    clearSelectedTarget,
    updateTargetHp,
    setAutoFarmState,
    updateQuestProgress,
    setQuestCompleted,
    openClassSelection,
    setClassSelectionSaving,
    setClassSelectionError,
    classSelectionSucceeded,
    closeClassSelection,
    setSystemMessage,
    toggleChat,
    receiveChatHistory,
    receiveChatMessage
} = gameSlice.actions;

export default gameSlice.reducer;
