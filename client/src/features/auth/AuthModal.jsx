import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { setAuthSession } from '../../store/gameSlice';
import { apiRequest } from '../../game/api';
import networkInstance from '../../game/network';

const AuthModal = () => {
    const dispatch = useDispatch();
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await apiRequest(`/api/auth/${isRegister ? 'register' : 'login'}`, {
                method: 'POST',
                body: JSON.stringify({ username: username.trim(), password })
            });
            const { character } = await apiRequest('/api/characters/me', {
                token: result.token
            });

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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-md sm:p-6">
            <section
                aria-labelledby="auth-title"
                className="fantasy-panel-gold my-auto w-full max-w-md p-5 text-slate-100 shadow-2xl sm:p-7"
            >
                <header className="mb-5 text-center">
                    <div className="mb-2 text-4xl" aria-hidden="true">🐾</div>
                    <h1 id="auth-title" className="text-xl font-black tracking-wide text-amber-300 sm:text-2xl">
                        MÈO ĐA VŨ TRỤ ONLINE
                    </h1>
                    <p className="mt-2 text-sm text-slate-300">
                        {isRegister ? 'Tạo tài khoản và nhân vật mới' : 'Đăng nhập để tiếp tục hành trình'}
                    </p>
                </header>

                <div className="mb-5 grid grid-cols-2 rounded-lg border border-amber-900/70 bg-black/30 p-1">
                    <button
                        type="button"
                        onClick={() => switchMode(false)}
                        aria-pressed={!isRegister}
                        className={`rounded-md px-3 py-2 text-sm font-bold transition ${!isRegister ? 'bg-amber-700 text-white' : 'text-slate-300 hover:bg-white/5'}`}
                    >
                        Đăng nhập
                    </button>
                    <button
                        type="button"
                        onClick={() => switchMode(true)}
                        aria-pressed={isRegister}
                        className={`rounded-md px-3 py-2 text-sm font-bold transition ${isRegister ? 'bg-amber-700 text-white' : 'text-slate-300 hover:bg-white/5'}`}
                    >
                        Đăng ký
                    </button>
                </div>

                <p className="mb-4 rounded-lg border border-teal-900/70 bg-teal-950/40 p-3 text-xs leading-relaxed text-teal-100">
                    Phiên chơi chỉ lưu trong bộ nhớ của trang. Khi tải lại website, bạn cần đăng nhập lại.
                </p>

                {error && (
                    <p role="alert" className="mb-4 rounded-lg border border-red-500/50 bg-red-950/60 p-3 text-sm text-red-200">
                        ⚠️ {error}
                    </p>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <label className="flex flex-col gap-1.5 text-sm font-semibold text-amber-100">
                        Tên đăng nhập
                        <input
                            autoComplete="username"
                            autoFocus
                            required
                            minLength={3}
                            maxLength={30}
                            pattern="[A-Za-z0-9_]{3,30}"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            placeholder="3–30 ký tự, chữ không dấu, số hoặc _"
                            className="w-full rounded-lg border border-amber-900 bg-slate-950/80 px-3 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-amber-400"
                        />
                    </label>

                    <label className="flex flex-col gap-1.5 text-sm font-semibold text-amber-100">
                        Mật khẩu
                        <input
                            autoComplete={isRegister ? 'new-password' : 'current-password'}
                            required
                            minLength={8}
                            maxLength={128}
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Từ 8 đến 128 ký tự"
                            className="w-full rounded-lg border border-amber-900 bg-slate-950/80 px-3 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-amber-400"
                        />
                    </label>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-1 w-full rounded-lg border border-amber-300/50 bg-gradient-to-b from-amber-500 to-amber-700 px-4 py-3 font-black text-white shadow-lg transition hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
                    >
                        {loading
                            ? (isRegister ? 'Đang tạo tài khoản và nhân vật…' : 'Đang tải nhân vật…')
                            : (isRegister ? 'Tạo tài khoản & vào game' : 'Đăng nhập')}
                    </button>
                </form>
            </section>
        </div>
    );
};

export default AuthModal;
