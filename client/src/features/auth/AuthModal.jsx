import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { setAuthSession } from '../../store/gameSlice';
import { apiRequest } from '../../game/api';
import networkInstance from '../../game/network';
import { resolveAuthenticatedCharacter } from './authSession';
import NroSceneBackdrop from './NroSceneBackdrop';
import { getServerCompatibilityNotice, getServerUnavailableNotice } from './serverCompatibility';

const REMEMBERED_USERNAME_KEY = 'meo-online.remembered-username';
const LEGACY_CREDENTIALS_KEY = 'meo-online.remembered-credentials';

function readRememberedCredentials() {
    try {
        const saved = window.localStorage.getItem(REMEMBERED_USERNAME_KEY) || '';
        // Remove credentials saved by older builds; browser storage is readable by
        // scripts on this origin, so it must never contain a reusable password.
        window.localStorage.removeItem(LEGACY_CREDENTIALS_KEY);
        return { username: saved, password: '' };
    } catch {
        return { username: '', password: '' };
    }
}

const AuthModal = () => {
    const dispatch = useDispatch();
    const [savedCredentials] = useState(readRememberedCredentials);
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState(savedCredentials.username);
    const [rememberAccount, setRememberAccount] = useState(Boolean(savedCredentials.username));
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [serverNotice, setServerNotice] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let mounted = true;
        apiRequest('/health')
            .then((health) => {
                const notice = getServerCompatibilityNotice(health);
                if (mounted && notice) setServerNotice(notice);
            })
            .catch(() => {
                if (mounted) setServerNotice(getServerUnavailableNotice());
            });
        return () => { mounted = false; };
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await apiRequest(`/api/auth/${isRegister ? 'register' : 'login'}`, {
                method: 'POST',
                body: JSON.stringify({ username: username.trim(), password })
            });
            // Registration already returns the server-created default character.
            // Avoid a second database request after the account has been committed:
            // if that read fails, the UI would report registration failure even
            // though retrying would only hit the duplicate-username guard.
            const character = await resolveAuthenticatedCharacter({
                isRegister,
                result,
                fetchCharacter: (token) => apiRequest('/api/characters/me', { token })
            });

            if (!isRegister) {
                try {
                    if (rememberAccount) {
                        window.localStorage.setItem(REMEMBERED_USERNAME_KEY, username.trim());
                    } else {
                        window.localStorage.removeItem(REMEMBERED_USERNAME_KEY);
                        window.localStorage.removeItem(LEGACY_CREDENTIALS_KEY);
                    }
                } catch {
                    // Private browsing/storage restrictions do not block sign-in.
                }
            }

            networkInstance.setToken(result.token);
            dispatch(setAuthSession({
                user: result.user,
                character,
                token: result.token
            }));
        } catch (requestError) {
            setError(requestError.message || 'Không thể xác thực. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (register) => {
        setIsRegister(register);
        setError('');
        setPassword('');
    };

    const handleRememberChange = (checked) => {
        setRememberAccount(checked);
        if (!checked) {
            try {
                window.localStorage.removeItem(REMEMBERED_USERNAME_KEY);
                window.localStorage.removeItem(LEGACY_CREDENTIALS_KEY);
            } catch {
                // Storage restrictions do not block sign-in.
            }
        }
    };

    return (
        <div className="nro-auth-screen fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-6">
            <NroSceneBackdrop />
            <div className="nro-auth-layout">
                <header className="nro-auth-brand text-center">
                    <h1 id="auth-title" className="nro-game-logo">
                        CHÚ BÉ RỒNG <span>ONLINE</span>
                    </h1>
                    <p className="nro-auth-subtitle">
                        {isRegister ? 'Tạo tài khoản và nhân vật mới' : 'Đăng nhập để tiếp tục hành trình'}
                    </p>
                </header>

                <section aria-labelledby="auth-title" className="nro-auth-panel relative w-full max-w-md p-5 sm:p-7">
                <div className="nro-auth-switch mb-5 grid grid-cols-2 p-1">
                    <button
                        type="button"
                        onClick={() => switchMode(false)}
                        aria-pressed={!isRegister}
                        className={`nro-game-button px-3 py-2 text-sm font-bold ${!isRegister ? 'active' : ''}`}
                    >
                        Đăng nhập
                    </button>
                    <button
                        type="button"
                        onClick={() => switchMode(true)}
                        aria-pressed={isRegister}
                        className={`nro-game-button px-3 py-2 text-sm font-bold ${isRegister ? 'active' : ''}`}
                    >
                        Đăng ký
                    </button>
                </div>

                {error && (
                    <p role="alert" className="nro-auth-error mb-4 p-3 text-sm">
                        {error}
                    </p>
                )}

                {serverNotice && (
                    <p role="status" className="nro-auth-error mb-4 p-3 text-sm">
                        {serverNotice}
                    </p>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <label className="nro-auth-label flex flex-col gap-1.5 text-sm font-bold">
                        Tên đăng nhập
                        <input
                            name="username"
                            id="auth-username"
                            autoComplete="username"
                            required
                            minLength={3}
                            maxLength={30}
                            pattern="[A-Za-z0-9_]{3,30}"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            placeholder="3–30 ký tự, chữ không dấu, số hoặc _"
                            className="nro-auth-input w-full px-3 py-3 text-base outline-none"
                        />
                    </label>

                    <label className="nro-auth-label flex flex-col gap-1.5 text-sm font-bold">
                        Mật khẩu
                        <input
                            name="password"
                            id="auth-password"
                            autoComplete={isRegister ? 'new-password' : 'current-password'}
                            required
                            minLength={8}
                            maxLength={128}
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Từ 8 đến 128 ký tự"
                            className="nro-auth-input w-full px-3 py-3 text-base outline-none"
                        />
                    </label>

                    {!isRegister && (
                        <div className="nro-auth-remember flex flex-col gap-1">
                            <label htmlFor="remember-account" className="flex cursor-pointer items-center gap-2 text-sm">
                                <input
                                    id="remember-account"
                                    type="checkbox"
                                    checked={rememberAccount}
                                onChange={(event) => handleRememberChange(event.target.checked)}
                                    className="size-4 accent-amber-700"
                                />
                                Ghi nhớ tên đăng nhập trên thiết bị này
                            </label>
                            <p className="pl-6 text-xs">
                                Mật khẩu được lưu trên trình duyệt này. Chỉ bật trên thiết bị cá nhân.
                            </p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="nro-game-button nro-game-button-primary mt-1 w-full px-4 py-3 font-black disabled:cursor-wait disabled:opacity-60"
                    >
                        {loading
                            ? (isRegister ? 'Đang tạo tài khoản và nhân vật…' : 'Đang tải nhân vật…')
                            : (isRegister ? 'Tạo tài khoản & vào game' : 'Đăng nhập')}
                    </button>
                </form>
                </section>
            </div>
        </div>
    );
};

export default AuthModal;
