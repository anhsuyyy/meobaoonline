export function getServerCompatibilityNotice(health) {
    if (health?.mode !== 'nro') {
        return 'Máy chủ đang chạy phiên bản game cũ. Cần cập nhật backend rồi tải lại trang trước khi chơi.';
    }
    if (health.databaseReady === false) {
        return 'Máy chủ game đang chạy nhưng dịch vụ dữ liệu chưa sẵn sàng. Hãy thử lại sau khi backend kết nối MongoDB.';
    }
    return null;
}

export function getServerUnavailableNotice() {
    return 'Chưa kết nối được máy chủ game. Hãy kiểm tra backend trước khi đăng nhập.';
}
