import { useSelector } from 'react-redux';
import PlayerStatusPanel from './PlayerStatusPanel';
import TargetStatusPanel from './TargetStatusPanel';
import MiniMapPanel from './MiniMapPanel';
import QuestTracker from './QuestTracker';
import SkillBar from './SkillBar';
import ChatPanel from './ChatPanel';
import GameNotifications from './GameNotifications';
import VirtualControls from './VirtualControls';

/**
 * GameHUD - Lớp phủ React trên Phaser Canvas
 * Layout:
 *   [PlayerStatus]         [TargetStatus]         [MiniMap + Quest]   ← top row
 *   [GameNotifications]                                                ← center (absolute)
 *   [ChatPanel]            [SkillBar]                                  ← bottom row
 */
const GameHUD = () => {
    const { user, level, character } = useSelector((state) => state.game);

    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 20,
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '10px 10px 10px 10px'
        }}>
            {/* ── TOP ROW ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                {/* Góc trên trái: Player Status */}
                <PlayerStatusPanel />

                {/* Góc trên giữa: Target Status (ẩn nếu không có target) */}
                <div style={{ display: 'flex', justifyContent: 'center', flex: 1 }}>
                    <TargetStatusPanel />
                </div>

                {/* Góc trên phải: MiniMap + Quest */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <MiniMapPanel />
                    <QuestTracker />
                </div>
            </div>

            {/* ── GIỮA (absolute): Thông báo hệ thống bay nổi ── */}
            <GameNotifications />

            {/* ── BOTTOM ROW ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
                {/* Góc dưới trái: Chat */}
                <ChatPanel />

                {/* Giữa dưới: Thanh kỹ năng */}
                <div style={{ display: 'flex', justifyContent: 'center', flex: 1 }}>
                    <SkillBar />
                </div>

                {/* Spacer phải để cân bằng layout */}
                <div style={{ minWidth: 120 }} />
            </div>

            {/* Mobile virtual controls (hiện nếu là mobile) */}
            <VirtualControls />

            <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-amber-700/60 bg-black/75 px-2 py-1 text-[10px] text-amber-100 sm:bottom-4 sm:right-4 sm:text-xs">
                {user.isAuthenticated && !character?.classId
                    ? (level >= 5
                        ? 'Lv.5+: Đến Trưởng Lão Linh Miêu, nhấn E hoặc chạm NPC'
                        : `Đạt Lv.5 để chọn class tại NPC · ${user.username}`)
                    : null}
            </div>
        </div>
    );
};

export default GameHUD;
