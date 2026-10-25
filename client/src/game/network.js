import { io } from 'socket.io-client';
import { serverUrl } from './api';

class GameNetwork {
    constructor() {
        this.socket = null;
        this.token = null;
    }

    setToken(token) {
        this.token = token;
    }

    connect(url = serverUrl) {
        if (!this.token) {
            throw new Error('Cần đăng nhập trước khi kết nối vào game.');
        }

        if (!this.socket) {
            this.socket = io(url, {
                auth: {
                    token: this.token
                },
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000
            });
        }
        return this.socket;
    }

    getSocket() {
        return this.socket;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.token = null;
    }
}

export const networkInstance = new GameNetwork();
export default networkInstance;