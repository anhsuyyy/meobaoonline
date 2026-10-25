export const serverUrl = import.meta.env.VITE_SERVER_URL ||
    `${window.location.protocol}//${window.location.hostname}:3000`;

export async function apiRequest(path, { token, ...options } = {}) {
    let response;
    try {
        response = await fetch(`${serverUrl}${path}`, {
            ...options,
            headers: {
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options.headers
            }
        });
    } catch {
        throw new Error('Không thể kết nối máy chủ. Vui lòng kiểm tra backend và thử lại.');
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error('Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.');
    }

    if (!response.ok) {
        throw new Error(data.error || 'Yêu cầu thất bại. Vui lòng thử lại.');
    }
    return data;
}
