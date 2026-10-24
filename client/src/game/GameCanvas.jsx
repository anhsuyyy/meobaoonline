import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import SceneChuong0 from './scenes/SceneChuong0';

const GameCanvas = () => {
    const gameRef = useRef(null);

    useEffect(() => {
        // Chỉ khởi tạo nếu chưa có game instance nào
        if (gameRef.current === null) {
            const config = {
                type: Phaser.AUTO,
                width: 800,
                height: 600,
                parent: 'game-container', // ID của thẻ div chứa game
                scene: [SceneChuong0],
                physics: {
                    default: 'arcade',
                    arcade: {
                        debug: true // Bật debug để thấy hitbox (sau này tắt đi)
                    }
                }
            };
            gameRef.current = new Phaser.Game(config);
        }

        // Cleanup: Xóa game instance khi component bị unmount
        return () => {
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
            }
        };
    }, []);

    return (
        <div className="flex justify-center items-center w-full h-screen bg-gray-900">
            {/* Vùng chứa game */}
            <div id="game-container" className="border-4 border-gray-700 shadow-lg" />
        </div>
    );
};

export default GameCanvas;