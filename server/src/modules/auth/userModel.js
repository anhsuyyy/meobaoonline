const mongoose = require('mongoose');

const characterSchema = new mongoose.Schema({
    level: { type: Number, default: 1, min: 1 },
    exp: { type: Number, default: 0, min: 0 },
    maxExp: { type: Number, default: 100, min: 1 },
    classId: { type: String, default: null },
    hp: { type: Number, default: 500, min: 0 },
    maxHp: { type: Number, default: 500, min: 1 },
    mp: { type: Number, default: 200, min: 0 },
    maxMp: { type: Number, default: 200, min: 1 },
    gold: { type: Number, default: 0, min: 0 },
    dtn: { type: Number, default: 0, min: 0 },
    position: {
        x: { type: Number, default: 200 },
        y: { type: Number, default: 300 }
    },
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
