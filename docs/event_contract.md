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
| `playerInput` | Client ➔ Server | `{ up: bool, down: bool, left: bool, right: bool }` | Input phím điều khiển di chuyển. |
| `stateUpdate` | Server ➔ Client (Room) | `{ players: {}, monsters: {} }` | Snapshot đồng bộ vị trí & HP ở tần số 20Hz (mỗi 50ms). |
| `playerAttack` | Client ➔ Server | `{ skillId: 's1' \| 's3' }` | Yêu cầu xuất chiêu (S1 Vuốt Chớp Nhoáng hoặc S3 Bão Móng). |
| `playerAttacked` | Server ➔ Client (Room) | `{ playerId, skillId, hits: [{ monsterId, damage, isCrit, isDead }] }` | Kết quả combat authoritative để render animation và số sát thương. |
| `statsUpdate` | Server ➔ Client | `{ hp, maxHp, mp, maxMp, gold, dtn, level, exp }` | Đồng bộ chỉ số bền vững của nhân vật về Redux UI. |
| `toggleAuto` | Client ➔ Server | `status: boolean` | Bật hoặc tắt chế độ Auto Farm. |
| `autoStateChanged` | Server ➔ Client | `{ isAuto: bool, anchor: { x, y } }` | Xác nhận trạng thái Auto Farm và vị trí neo (Anchor) Leash Circle. |
| `autoAttackTrigger` | Server ➔ Client | `{ skillId: string }` | Lệnh server kích hoạt xuất chiêu khi Auto Farm ở cự ly hợp lệ. |
| `itemDropped` | Server ➔ Client (Room) | `{ id, type: 'gold', x, y, value }` | Rơi xu vàng khi quái chết. |
| `pickupItem` | Client ➔ Server | `itemId: string` | Yêu cầu nhặt vật phẩm gần người chơi (< 60px). |
| `itemPicked` | Server ➔ Client (Room) | `{ itemId, playerId }` | Xác nhận nhặt vật phẩm thành công, dọn dẹp item trên bản đồ. |
| `questProgressUpdate`| Server ➔ Client | `{ questId, progress, target, status }` | Cập nhật tiến độ nhiệm vụ. |
| `questCompleted` | Server ➔ Client | `{ questId, title, rewardGold, rewardDtn }` | Cấp thưởng nhiệm vụ hoàn thành. |
