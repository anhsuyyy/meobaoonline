require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Cấu hình CORS để frontend (React) có thể gọi API
app.use(cors({ origin: '*' }));
app.use(express.json());

// Khởi tạo Socket.IO cho realtime
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// API Health Check kiểm tra trạng thái
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Server Mèo Đa Vũ Trụ đang chạy!' });
});

// Lắng nghe kết nối người chơi
io.on('connection', (socket) => {
    console.log(`[Socket] Có người kết nối: ${socket.id}`);
    
    socket.on('disconnect', () => {
        console.log(`[Socket] Ngắt kết nối: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});