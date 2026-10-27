# Socket.IO Event Contract — NRO Web

Nguyên tắc: **Server-Authoritative**. Mọi trạng thái vị trí, máu, mana, nhặt đồ và combat đều do Server kiểm tra và quyết định.

---

## 1. Handshake & Room
- **Room prototype cũ**: `room_chuong0` (Chương 0: Trạm Cào). NRO dùng `map_{mapId}_zone_{zoneId}` để tách map/khu.
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
| `playerInput` | Client ➔ Server | `{ up?, down?, left?, right?, jump? }` | PC dùng phím mũi tên; mobile giữ nút D-pad/nhảy để gửi hướng và nhả nút gửi trạng thái dừng. WASD không điều khiển nhân vật. Server giới hạn tốc độ input, áp dụng movement ở tick và kiểm tra collision authoritative. |
| `stateUpdate` | Server ➔ Client (Room) | `{ players: {}, monsters: {} }` | Snapshot vị trí, HP và status effect đang còn hạn ở tần số 20Hz (mỗi 50ms). |
| `playerAttack` | Client ➔ Server | `{ skillId: 'basic' \| 's1' \| 's2' \| 's3' \| 's4' \| 's5', targetId?, targetPos? }` | Yêu cầu đánh thường hoặc dùng skill class hiện tại; server xác thực MP, cooldown, tầm đánh, mục tiêu và hiệu ứng. |
| `skillSuccess` | Server ➔ Client (Room) | `{ playerId, skillId, skillLevel, skillType, cooldownMs, targetId, targetPos, damageTaken, effects, position? }` | Xác nhận cast authoritative; client khởi động cooldown HUD, hoạt ảnh/VFX theo type và nội suy dash. |
| `damageTaken` | Server ➔ Client (Room) | `{ playerId, skillId, skillType, damageTaken, healed? }` | Báo sát thương/heal áp dụng ngay hoặc theo tick zone/channel; từng nạn nhân có `targetId`, `targetType`, HP và damage. |
| `playerAttacked` | Server ➔ Client (Room) | `{ playerId, skillId, skillType, cooldownMs, miss, hits, healed }` | Event tương thích và thông báo miss; nguồn damage authoritative là `damageTaken`. |
| `statsUpdate` | Server ➔ Client | `{ hp, maxHp, mp, maxMp, gold, dtn, level, exp }` | Đồng bộ chỉ số bền vững của nhân vật về Redux UI. |
| `toggleAuto` | Client ➔ Server | `status: boolean` | Bật hoặc tắt chế độ Auto Farm. |
| `autoStateChanged` | Server ➔ Client | `{ isAuto: bool, anchor: { x, y } }` | Xác nhận trạng thái Auto Farm và vị trí neo (Anchor) Leash Circle. |
| `autoAttackTrigger` | Server ➔ Client | `{ skillId: string }` | Lệnh server kích hoạt xuất chiêu khi Auto Farm ở cự ly hợp lệ. |
| `itemDropped` | Server ➔ Client (Room) | `{ id, type: 'gold', x, y, value }` | Rơi xu vàng khi quái chết. |
| `pickupItem` | Client ➔ Server | `itemId: string` | Yêu cầu nhặt vật phẩm trong bán kính 6m (60px theo world scale 10px/m); server kiểm tra lại khoảng cách. |
| `itemPicked` | Server ➔ Client (Room) | `{ itemId, playerId }` | Xác nhận nhặt vật phẩm thành công, dọn dẹp item trên bản đồ. |
| `chatSend` | Client ➔ Server | `{ channel: 'world' \| 'party' \| 'area', text }` + ACK | Máy chủ xác thực kênh, nội dung và tốc độ gửi; client không được gửi kênh `system`. |
| `chatHistory` | Server ➔ Client | `{ channels: { world, system, area, party } }` | 50 tin gần nhất mỗi kênh có quyền xem; gửi khi join/reconnect. |
| `chatMessage` | Server ➔ Client (phạm vi kênh) | `{ messageId, sequence, senderId, senderName, channel, timestamp, text }` | Tin được định danh, đóng dấu thời gian và sắp thứ tự bởi server; client khử trùng theo `messageId`. |
| `chatError` | Server ➔ Client | `{ message }` | Lỗi gửi chat khi client không dùng ACK callback. |
| `questProgressUpdate`| Server ➔ Client | `{ questId, progress, target, status }` | Cập nhật tiến độ nhiệm vụ. |
| `questCompleted` | Server ➔ Client | `{ questId, title, rewardGold, rewardDtn }` | Cấp thưởng nhiệm vụ hoàn thành. |
| `nroTaskUpdate` | Server ➔ Client | `{ taskId, status, subtaskIndex, progress, target, objective, targetMapId?, targetMapName? }` | Snapshot nhiệm vụ chính NRO sau khi hạ quái, nhặt vật phẩm, nâng chỉ số, chuyển map hoặc báo cáo NPC; nội dung được khôi phục từ trạng thái đã lưu khi kết nối lại. |
| `trainNroStat` | Client ➔ Server | `{ statType, points }` | Yêu cầu dùng tiềm năng nâng chỉ số; server xác thực cost/trần, lưu chỉ số và có thể tiến nhiệm vụ. |
| `mapTransition` | Server ➔ Client | `{ mapEntry, zoneId, player, players, monsters, items }` | Chuyển map qua waypoint, server đổi room/khu và gửi snapshot đích authoritative. |
| `travelNroPlanet` | Client ➔ Server | `{ destinationMapId: 0 \| 7 \| 14 }` | Chọn hành tinh tại NPC trạm tàu. Server xác thực map trạm, NPC, khoảng cách, đích hợp lệ và trả `mapTransition`. |

## 3. Quy tắc chat

- `world` được broadcast tới mọi socket; `area` gửi tới các socket trong map hiện tại; `party` gửi trong room `party_<partyId>` khi nhân vật có party ID. Chức năng tạo/gia nhập đội chưa được triển khai nên tài khoản chưa thuộc đội sẽ nhận lỗi.
- `system` chỉ được phát từ server qua `io.publishSystemChat()`; không có event client để gửi tin hệ thống.
- Server bỏ thẻ HTML và ký tự điều khiển, giới hạn nội dung 200 ký tự, từ chối tin rỗng và tin lặp trong 10 giây. Giới hạn mỗi user là 1 tin/giây; kênh thế giới là 1 tin/3 giây. Lịch sử gần nhất giữ trong RAM tối đa 50 tin/kênh và mất khi process khởi động lại.
