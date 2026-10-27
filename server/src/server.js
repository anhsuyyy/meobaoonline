const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../../.env');
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error && dotenvResult.error.code !== 'ENOENT') {
    throw dotenvResult.error;
}

const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const authService = require('./modules/auth/authService');
const setupGameSocket = require('./socket/gameSocket');
const { connectDatabase } = require('./infrastructure/database/connection');
const gameConfig = require('./config/gameConfig.json');
const { assertValidGameConfig } = require('./config/validateGameConfig');
const { corsOrigin } = require('./config/clientOrigin');

const PORT = process.env.PORT || gameConfig.server.port || 3000;

async function bootstrap() {
    assertValidGameConfig(gameConfig);
    authService.assertConfigured();
    // 1. Connect to the configured database before accepting requests.
    await connectDatabase();

    // Only allocate network resources after configuration and database validation.
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: corsOrigin,
            methods: ['GET', 'POST']
        }
    });
    app.locals.io = io;
    setupGameSocket(io);

    // 2. Lắng nghe HTTP & WebSocket
    server.listen(PORT, () => {
        console.log(`===============================================`);
        console.log(`🐾 MÈO ĐA VŨ TRỤ ONLINE - SERVER V${gameConfig.version}`);
        console.log(`🚀 API & Realtime đang chạy tại cổng ${PORT} (LAN enabled)`);
        console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth/register`);
        console.log(`🎮 Tick Rate: ${gameConfig.server.tickRateHz}Hz (${gameConfig.server.tickIntervalMs}ms)`);
        console.log(`===============================================`);
    });
}

bootstrap().catch((error) => {
    console.error(`[Startup] Backend startup failed: ${error.message}`);
    process.exitCode = 1;
});
