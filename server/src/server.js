require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Trạng thái server (Lưu mọi thứ của người chơi)
const players = {}; 

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

io.on('connection', (socket) => {
    console.log(`[Socket] Có người kết nối: ${socket.id}`);
    
    // Tạo nhân vật mặc định khi kết nối
    players[socket.id] = {
        id: socket.id,
        x: 400,
        y: 300,
        input: { left: false, right: false, up: false, down: false }
    };
    
    socket.join('room_chuong0'); // Đưa người chơi vào phòng Chương 0
    
    // Gửi danh sách người chơi hiện tại cho người mới
    socket.emit('currentPlayers', players);
    // Báo cho các người chơi cũ biết có người mới vào
    socket.to('room_chuong0').emit('newPlayer', players[socket.id]);

    // Nhận TÍN HIỆU PHÍM BẤM từ client (Tuyệt đối không nhận tọa độ x,y để chống hack)
    socket.on('playerInput', (inputData) => {
        if (players[socket.id]) {
            players[socket.id].input = inputData;
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Ngắt kết nối: ${socket.id}`);
        delete players[socket.id];
        io.to('room_chuong0').emit('playerDisconnected', socket.id);
    });
});

// VÒNG LẶP GAME SERVER (20 tick / giây = 50ms)
setInterval(() => {
    let stateChanged = false;
    const speed = 5; // Tốc độ di chuyển mỗi tick

    for (let id in players) {
        let p = players[id];
        let moved = false;
        
        // Tính toán vị trí dựa trên phím bấm
        if (p.input.left) { p.x -= speed; moved = true; }
        if (p.input.right) { p.x += speed; moved = true; }
        if (p.input.up) { p.y -= speed; moved = true; }
        if (p.input.down) { p.y += speed; moved = true; }
        
        // Giới hạn bản đồ cơ bản để không chạy ra ngoài viền (800x600)
        if (p.x < 25) p.x = 25;
        if (p.x > 775) p.x = 775;
        if (p.y < 25) p.y = 25;
        if (p.y > 575) p.y = 575;

        if (moved) stateChanged = true;
    }

    // Nếu có sự thay đổi, phát sóng (broadcast) tọa độ mới cho toàn bộ room
    if (stateChanged) {
        const payload = {};
        for (let id in players) {
            payload[id] = { x: players[id].x, y: players[id].y }; // Chỉ gửi x,y để tối ưu gói tin
        }
        io.to('room_chuong0').emit('stateUpdate', payload);
    }
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});