const express = require('express');
const cors = require('cors');
const authRouter = require('./modules/auth/authController');
const characterRouter = require('./modules/characters/characterController');
const gameConfig = require('./config/gameConfig.json');

const app = express();

const clientOrigin = process.env.CLIENT_ORIGIN || '*';
app.use(cors({ origin: clientOrigin }));
app.use(express.json());

// Auth routes
app.use('/api/auth', authRouter);
app.use('/api/characters', characterRouter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        game: 'Mèo Đa Vũ Trụ Online',
        version: gameConfig.version,
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
