import { Provider } from 'react-redux';
import { store } from './store';
import GameCanvas from './game/GameCanvas';
import GameHUD from './features/hud/GameHUD';
import AuthModal from './features/auth/AuthModal';
import ClassSelectionModal from './features/auth/ClassSelectionModal';
import { useSelector } from 'react-redux';

/**
 * App - Root component
 * Layout 16:9 responsive: tối đa 1440×810, giữa màn hình, viền vàng đồng
 */
function AppContent() {
    const isAuthenticated = useSelector((state) => state.game.user.isAuthenticated);

    return (
        <div style={{
                width: '100vw',
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(ellipse at center, #0d1810 0%, #020617 100%)',
                overflow: 'hidden'
            }}>
                {/* Khung game 16:9 responsive */}
                <div style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    maxWidth: 1440,
                    maxHeight: 810,
                    aspectRatio: '16/9',
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: '2px solid #b45309',
                    outline: '1px solid #78350f',
                    boxShadow: '0 0 50px rgba(180,83,9,0.3), 0 0 120px rgba(0,0,0,0.8), inset 0 0 30px rgba(0,0,0,0.5)'
                }}>
                    {isAuthenticated ? (
                        <>
                            <GameCanvas />
                            <GameHUD />
                            <ClassSelectionModal />
                        </>
                    ) : (
                        <AuthModal />
                    )}
                </div>
        </div>
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