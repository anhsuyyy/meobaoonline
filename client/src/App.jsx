import { lazy, Suspense } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import AuthModal from './features/auth/AuthModal';
import { useSelector } from 'react-redux';

const GameCanvas = lazy(() => import('./game/GameCanvas'));
const GameHUD = lazy(() => import('./features/hud/GameHUD'));
const NroCharacterCreationModal = lazy(() => import('./features/auth/NroCharacterCreationModal'));

/**
 * App - Root component
 * Layout 16:9 responsive: tối đa 1440×810, giữa màn hình, viền vàng đồng
 */
function AppContent() {
    const { isAuthenticated } = useSelector((state) => state.game.user);
    const character = useSelector((state) => state.game.character);
    const shouldShowRotateHint = isAuthenticated && character?.nroCharacter?.created;

    return (
        <main className={`nro-app-shell ${isAuthenticated ? 'nro-app-shell--playing' : ''}`}>
                <div className="nro-game-frame">
                    {isAuthenticated ? (
                        <>
                            <Suspense fallback={<div className="game-loading" role="status">Đang tải thế giới game…</div>}>
                                <GameCanvas />
                            </Suspense>
                            <Suspense fallback={null}>
                                <GameHUD />
                                <NroCharacterCreationModal />
                            </Suspense>
                        </>
                    ) : (
                        <AuthModal />
                    )}
                </div>
                {shouldShowRotateHint && <div className="nro-rotate-hint" role="status">
                    <span className="nro-rotate-icon" aria-hidden="true" />
                    <strong>Hãy xoay ngang thiết bị</strong>
                    <span>Thế giới Ngọc Rồng được thiết kế theo khung hình ngang.</span>
                </div>}
        </main>
    );
}

function App() {
    return (
        <Provider store={store}>
            <AppContent />
        </Provider>
    );
}

export default App;
