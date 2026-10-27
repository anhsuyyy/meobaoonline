const mongoose = require('mongoose');

const nroCharacterSchema = new mongoose.Schema({
    created: { type: Boolean, default: false },
    // New accounts do not create their NRO character until after signup, so the
    // default name is intentionally empty. createNroCharacter validates the
    // 3–16 character name before persisting a created character.
    characterName: { type: String, trim: true, maxlength: 16, default: '' },
    raceId: { type: String, default: 'earth' },
    mapId: { type: Number, default: 0, min: 0 },
    zoneId: { type: Number, default: 0, min: 0 },
    headPartId: { type: Number, default: 0, min: 0 },
    bodyPartId: { type: Number, default: 1, min: 0 },
    legPartId: { type: Number, default: 2, min: 0 },
    bagCapacity: { type: Number, default: 20, min: 1 },
    bag: { type: [mongoose.Schema.Types.Mixed], default: [] },
    equipment: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    skillLevels: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    skillLayoutVersion: { type: Number, default: 0, min: 0 },
    baseStats: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    nroStats: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    cFlag: { type: Number, default: 0, min: 0, max: 8 },
    blueGems: { type: Number, default: 0, min: 0 },
    limitPower: { type: Number, default: 0, min: 0, max: 11 },
    openPowerExpiresAt: { type: Number, default: 0, min: 0 },
    mainTask: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    effects: { type: [mongoose.Schema.Types.Mixed], default: [] },
    stamina: { type: Number, min: 0 },
    maxStamina: { type: Number, min: 1 },
    staminaAttackCount: { type: Number, min: 0, default: 0 },
    staminaRecoveredAt: { type: Number, min: 0, default: 0 },
    position: {
        x: { type: Number, default: 60 },
        y: { type: Number, default: 384 }
    }
}, { _id: false });

const characterSchema = new mongoose.Schema({
    revision: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 0 },
    exp: { type: Number, default: 0, min: 0 },
    maxExp: { type: Number, default: 100, min: 1 },
    agi: { type: Number, default: 0, min: 0 },
    skillLevels: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    hp: { type: Number, default: 500, min: 0 },
    maxHp: { type: Number, default: 500, min: 1 },
    mp: { type: Number, default: 200, min: 0 },
    maxMp: { type: Number, default: 200, min: 1 },
    gold: { type: Number, default: 0, min: 0 },
    dtn: { type: Number, default: 0, min: 0 },
    power: { type: Number, default: 0, min: 0 },
    position: {
        x: { type: Number, default: 200 },
        y: { type: Number, default: 300 }
    },
    nroCharacter: { type: nroCharacterSchema, default: () => ({}) },
    questProgress: { type: Number, default: 0, min: 0 },
    questCompleted: { type: Boolean, default: false }
}, { _id: false });

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 3,
        maxlength: 30
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: null
    },
    passwordHash: {
        type: String,
        required: true,
        select: false
    },
    salt: {
        type: String,
        required: true,
        select: false
    },
    sessionVersion: { type: Number, default: 0, min: 0 },
    character: {
        type: characterSchema,
        required: true,
        default: () => ({})
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;
