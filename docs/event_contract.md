# 📡 Socket.IO Event Contract — Mèo Đa Vũ Trụ Online (V2.0)

Nguyên tắc: **Server-Authoritative**. Mọi trạng thái vị trí, máu, mana, nhặt đồ và combat đều do Server kiểm tra và quyết định.

---

## 1. Handshake & Room
- **Room mặc định**: `room_chuong0` (Chương 0: Trạm Cào).
- **Kết nối thành công**:
  - Server gửi event `initialState` cho riêng client kết nối.
  - Server gửi event `newPlayer` cho các client khác trong phòng.

---

## 2. Danh sách Event Contract

| Event Name | Chiều | Payload Schema | Mô Tả |
| :--- | :--- | :--- | :--- |
| `initialState` | Server ➔ Client | `{ playerId, players, monsters, items, config }` | Gửi toàn bộ snapshot thế giới khi vừa kết nối. |
| `newPlayer` | Server ➔ Client (Room) | `{ id, x, y, hp, maxHp, className }` | Thông báo người chơi mới gia nhập phòng. |
| `playerDisconnected` | Server ➔ Client (Room) | `playerId: string` | Người chơi ngắt kết nối và dọn entity trên client. |
| `playerInput` | Client ➔ Server | `{ up: bool, down: bool, left: bool, right: bool }` | Chỉ nhận bốn boolean hướng, không nhận tọa độ hay field phụ; server giới hạn burst 30 và tốc độ trung bình 120 event/giây mỗi socket. Input bị vượt giới hạn sẽ bị bỏ qua. Server áp dụng input ở tick 20Hz, chuẩn hóa di chuyển chéo và giới hạn hitbox trong map. |
| `stateUpdate` | Server ➔ Client (Room) | `{ players: {}, monsters: {} }` | Snapshot đồng bộ vị trí & HP ở tần số 20Hz (mỗi 50ms). |
| `playerAttack` | Client ➔ Server | `{ skillId: 'basic' \| 's1' \| 's2' \| 's3' \| 's4' \| 's5' }` | Yêu cầu đánh thường hoặc dùng một trong năm skill; server xác thực cấu hình, MP, cooldown, tầm đánh và hiệu ứng. |
| `playerAttacked` | Server ➔ Client (Room) | `{ playerId, skillId, hits: [{ monsterId, damage, isCrit, isDead }], healed }` | Kết quả combat authoritative để render animation, sát thương hoặc lượng HP hồi. |
| `statsUpdate` | Server ➔ Client | `{ hp, maxHp, mp, maxMp, gold, dtn, level, exp }` | Đồng bộ chỉ số bền vững của nhân vật về Redux UI. |
| `toggleAuto` | Client ➔ Server | `status: boolean` | Bật hoặc tắt chế độ Auto Farm. |
| `autoStateChanged` | Server ➔ Client | `{ isAuto: bool, anchor: { x, y } }` | Xác nhận trạng thái Auto Farm và vị trí neo (Anchor) Leash Circle. |
| `autoAttackTrigger` | Server ➔ Client | `{ skillId: string }` | Lệnh server kích hoạt xuất chiêu khi Auto Farm ở cự ly hợp lệ. |
| `itemDropped` | Server ➔ Client (Room) | `{ id, type: 'gold', x, y, value }` | Rơi xu vàng khi quái chết. |
| `pickupItem` | Client ➔ Server | `itemId: string` | Yêu cầu nhặt vật phẩm gần người chơi (< 60px). |
| `itemPicked` | Server ➔ Client (Room) | `{ itemId, playerId }` | Xác nhận nhặt vật phẩm thành công, dọn dẹp item trên bản đồ. |
| `chatSend` | Client ➔ Server | `{ channel: 'world' \| 'party' \| 'area', text }` + ACK | Máy chủ xác thực kênh, nội dung và tốc độ gửi; client không được gửi kênh `system`. |
| `chatHistory` | Server ➔ Client | `{ channels: { world, system, area, party } }` | 50 tin gần nhất mỗi kênh có quyền xem; gửi khi join/reconnect. |
| `chatMessage` | Server ➔ Client (phạm vi kênh) | `{ messageId, sequence, senderId, senderName, channel, timestamp, text }` | Tin được định danh, đóng dấu thời gian và sắp thứ tự bởi server; client khử trùng theo `messageId`. |
| `chatError` | Server ➔ Client | `{ message }` | Lỗi gửi chat khi client không dùng ACK callback. |
| `questProgressUpdate`| Server ➔ Client | `{ questId, progress, target, status }` | Cập nhật tiến độ nhiệm vụ. |
| `questCompleted` | Server ➔ Client | `{ questId, title, rewardGold, rewardDtn }` | Cấp thưởng nhiệm vụ hoàn thành. |

## 3. Quy tắc chat

- `world` được broadcast tới mọi socket; `area` gửi tới các socket trong map hiện tại; `party` gửi trong room `party_<partyId>` khi nhân vật có party ID. Chức năng tạo/gia nhập đội chưa được triển khai nên tài khoản chưa thuộc đội sẽ nhận lỗi.
- `system` chỉ được phát từ server qua `io.publishSystemChat()`; không có event client để gửi tin hệ thống.
- Server bỏ thẻ HTML và ký tự điều khiển, giới hạn nội dung 200 ký tự, từ chối tin rỗng và tin lặp trong 10 giây. Giới hạn mỗi user là 1 tin/giây; kênh thế giới là 1 tin/3 giây. Lịch sử gần nhất giữ trong RAM tối đa 50 tin/kênh và mất khi process khởi động lại.
