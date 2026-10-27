const express = require('express');
const cors = require('cors');
const authRouter = require('./modules/auth/authController');
const characterRouter = require('./modules/characters/characterController');
const gameConfig = require('./config/gameConfig.json');
const { corsOrigin } = require('./config/clientOrigin');
const { isDbConnected } = require('./infrastructure/database/connection');

const app = express();

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Auth routes
app.use('/api/auth', authRouter);
app.use('/api/characters', characterRouter);

// Health check endpoint
app.get('/health', (req, res) => {
    const gameName = gameConfig.gameMode === 'nro'
        ? 'Ngọc Rồng Online Web'
        : 'Mèo Đa Vũ Trụ Online';
    res.json({
        status: 'ok',
        game: gameName,
        mode: gameConfig.gameMode,
        databaseReady: isDbConnected(),
        version: gameConfig.version,
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
