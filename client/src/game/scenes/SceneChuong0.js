import Phaser from 'phaser';
import { io } from 'socket.io-client';

export default class SceneChuong0 extends Phaser.Scene {
    constructor() {
        super('SceneChuong0');
        this.players = {}; // Chứa tất cả khối vuông của mình và người khác
    }

    create() {
        this.add.text(20, 20, 'Chương 0: Trạm Cào - Mèo Đa Vũ Trụ', { fontSize: '24px', fill: '#ffffff' });
        
        // Bật lắng nghe phím mũi tên
        this.cursors = this.input.keyboard.createCursorKeys();

        // 1. Khởi tạo Socket kết nối tới Server
        this.socket = io('http://localhost:3000');

        // 2. Lắng nghe danh sách người chơi ban đầu
        this.socket.on('currentPlayers', (serverPlayers) => {
            Object.keys(serverPlayers).forEach((id) => {
                this.addPlayer(serverPlayers[id], id === this.socket.id);
            });
        });

        // 3. Có người chơi mới vào phòng
        this.socket.on('newPlayer', (playerInfo) => {
            this.addPlayer(playerInfo, false);
        });

        // 4. Có người chơi thoát
        this.socket.on('playerDisconnected', (playerId) => {
            if (this.players[playerId]) {
                this.players[playerId].destroy();
                delete this.players[playerId];
            }
        });

        // 5. Cập nhật vị trí từ Server (Chống Hack)
        this.socket.on('stateUpdate', (serverPlayers) => {
            Object.keys(serverPlayers).forEach((id) => {
                if (this.players[id]) {
                    // Vẽ lại vị trí chính xác do Server quyết định
                    this.players[id].setPosition(serverPlayers[id].x, serverPlayers[id].y);
                }
            });
        });
    }

    addPlayer(playerInfo, isMe) {
        // Mình màu Xanh lá, người khác màu Đỏ
        const color = isMe ? 0x00ff00 : 0xff0000;
        const playerObj = this.add.rectangle(playerInfo.x, playerInfo.y, 50, 50, color);
        this.players[playerInfo.id] = playerObj;
    }

    update() {
        if (!this.socket) return;

        // Chỉ gửi phím bấm (Inputs), không gửi vị trí
        const currentInput = {
            left: this.cursors.left.isDown,
            right: this.cursors.right.isDown,
            up: this.cursors.up.isDown,
            down: this.cursors.down.isDown
        };

        // Gửi trạng thái phím lên server để server tính toán
        this.socket.emit('playerInput', currentInput);
    }
}