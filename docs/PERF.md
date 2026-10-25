# Báo cáo đo hiệu năng

## Bước 1 — Socket.IO hai client và tick Chương 0

- **Ngày:** 25/10/2026.
- **Môi trường:** Windows, Node.js v22.23.1, Socket.IO server/client chạy cùng máy qua `127.0.0.1`; tài khoản và updateCharacter được mock trong test nên không đo độ trễ MongoDB.
- **Kịch bản:** client A kết nối room; client B kết nối và nhận snapshot có A; A nhận `newPlayer` của B; B disconnect và A nhận `playerDisconnected`; B kết nối lại bằng cùng user và nhận socket ID mới cùng snapshot của room.
- **Tick mục tiêu:** 20 Hz, chu kỳ 50ms.
- **Kết quả đo sau hiệu chỉnh deadline timer:** lần chạy toàn bộ test mới nhất đo 20 khoảng tick liên tiếp, trung bình **49.07ms / 20.38Hz**.
- **Rời phòng:** client còn lại nhận `playerDisconnected` sau **7.56ms** trong lần chạy toàn bộ test mới nhất.
- **Reconnect:** kết nối lại đến `initialState` sau **31.67ms** trong lần chạy toàn bộ test mới nhất.
- **Kết quả tích hợp:** PASS; cả hai client thấy đúng thành viên trong room, disconnect/reconnect thành công.

### Điều chỉnh timer

`setInterval(..., 50)` ban đầu đo được trung bình **61.85ms / 16.17Hz** trong bài đo timer trống và **61.74ms / 16.20Hz** trong vòng game. Đã thay bằng timer bám deadline tuyệt đối và tính lại thời gian chờ cho tick tiếp theo; số đo sau sửa mới nhất đạt **49.07ms / 20.38Hz**.

### Giới hạn phép đo

Đây là phép đo localhost với hai client và DB mock, không phải load test. Chưa có số liệu latency qua mạng thật, MongoDB, CPU/RAM, tick dưới tải nhiều người hoặc kiểm thử mất gói.

### Tái hiện

```bash
node --test tests/socketIntegration.test.js
```

Hoặc chạy toàn bộ test từ repository root bằng `npm test`; test in tick, disconnect và reconnect durations qua TAP diagnostics.
