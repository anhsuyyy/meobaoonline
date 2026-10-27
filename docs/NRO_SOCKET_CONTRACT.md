# Hợp đồng Socket.IO cho NRO

Server giữ quyền quyết định cuối cùng về vị trí, HP/MP, combat, phần thưởng, hành trang và nhân vật. Client chỉ gửi lệnh hoặc ý định; không gửi kết quả đã tính.

## Kết nối và trạng thái

| Event | Chiều | Payload chính | Mục đích |
|---|---|---|---|
| `initialState` | server → client | `playerId`, `players`, `monsters`, `items`, `config` | Snapshot đầu phiên; player có tọa độ, race, part, chỉ số, trạng thái và companion hiện hành nếu có |
| `stateUpdate` | server → room | `players`, `monsters`, `items` | Snapshot authoritative theo tick; companion được gửi trong player record |
| `newPlayer` | server → room | player đã serialize | Thông báo người chơi vào khu |
| `playerDisconnected` | server → room | player ID | Xóa entity rời khu |
| `networkPing` | hai chiều | acknowledgement có `serverTime` | Đo RTT; server giới hạn một yêu cầu mỗi giây |
| `zoneError` | server → client | `{message}` | Thông báo map/khu đã đầy hoặc không thể chuyển khu |

Trong NRO, room được phân theo `map_{mapId}_zone_{zoneId}`. Mỗi zone có instance mob/drop và chat khu riêng, số người tối đa lấy từ `maxPlayers` của map; legacy mode tiếp tục dùng `room_chuong0`.

## Điều khiển và chiến đấu

| Event | Chiều | Payload chính | Quy tắc |
|---|---|---|---|
| `playerInput` | client → server | `{left,right,up,down,jump}` hoặc `{axisX,axisY}` | Server lọc schema/rate limit; tự mô phỏng tốc độ, trọng lực, collision và bốn hướng khi đang bay |
| `toggleFly` | client → server | không có payload | Server bật/tắt bay, yêu cầu KI > 0 khi cất cánh; tick trừ KI theo `flightKiPerSecond`, hết KI thì bật gravity lại |
| `flightStateChanged` | server → room | `{playerId,isFlying}` | Đồng bộ trạng thái bay và hiệu ứng client |
| `flightError` | server → client | `{message}` | Từ chối bật bay khi thiếu KI, đang gục hoặc bị khống chế |
| `castSkill` | client → server | `{skillId,target,targetPos?}` | Client chọn trước skill; chỉ gửi lúc bấm ĐÁNH/Space/Enter. Server xác thực MP, cooldown, hướng, mục tiêu và tầm |
| `playerAttack` | client → server | `{skillId,targetId?,targetPos?}` | Event legacy được giữ để tương thích client/test cũ |
| `skillSuccess` | server → room | `playerId`, `skillId`, `skillLevel`, `skillType`, `cooldownMs`, `mpCost`, `stamina`, `maxStamina`, `effectDurationMs`, `radiusPx?`, `rangePx`, `targetId?`, `targetPos`, `position?`, `damageTaken`, `healed`, `effects`, `channelDurationMs?`, `castTimeMs?`, `hpCost?` | Kết quả cast đã được chấp nhận; thời lượng/bán kính/tầm đã resolve từ cấp skill và hệ số px/m của server. `position` chỉ có với dash và là tọa độ authoritative mới; client dùng dữ liệu này để vẽ VFX, không tự cập nhật vị trí nhân vật. HP/MP cost, thể lực, hồi phục, channel và hiệu ứng do server xác nhận. |
| `nroSkillConfig` | server → client | `{skills,skillLevels,newlyUnlocked}` | Đồng bộ skill mở khóa theo hành tinh/tiềm năng; client chỉ hiển thị và gửi yêu cầu cast |
| `combatError` | server → client | `skillId`, `cooldownRemainingMs`, `message` | Từ chối cast; không áp dụng hiệu ứng |
| `damageTaken` | server → room | `playerId`, `skillId`, `damageTaken[]` | HP/damage thực tế của nạn nhân |
| `statsUpdate` | server → client | HP/MP/thể lực/EXP/tiền/cấp | Cập nhật chỉ số đã lưu; stamina được phát khi tấn công làm thay đổi hoặc hồi phục |

## Nhân vật và NPC

| Event | Chiều | Payload chính | Quy tắc |
|---|---|---|---|
| `createNroCharacter` | client → server | `{raceId}` | Chỉ chấp nhận `earth`, `namek`, `saiyan`; chỉ tạo một lần cho mỗi tài khoản |
| `nroCharacterCreationResult` | server → client | `{ok,message?,character?}` | Xác nhận tạo nhân vật hoặc lý do từ chối |
| `nroTaskUpdate` | server → client | `{taskId,status,subtaskIndex,progress,target,title,objective}` | Cập nhật nhiệm vụ chính đã xác thực; trạng thái được lưu trong `nroCharacter` |
| `trainNroStat` | client → server | `{statType,points}` | Server xác thực tiềm năng/trần; nâng chỉ số hợp lệ có thể hoàn thành bước đầu nhiệm vụ sao băng và persist tiến độ |
| `playerCharacterChanged` | server → room | ID player, race và part IDs | Đồng bộ ngoại hình sau khi chọn hành tinh |
| `interactNroNpc` | client → server | NPC template ID | Server xác minh NPC trên map và khoảng cách |
| `nroNpcDialog` | server → client | `ok`, `npc`, `message`, `options` | Nội dung đối thoại được server xác nhận |
| `openNroShop` | client → server | `{npcId}` | Server xác minh người chơi còn trong phạm vi NPC và trả danh mục từ SQL |
| `nroShopCatalog` | server → client | `tabs`, `items`, `bag`, `bagCapacity` | Danh mục theo NPC/tab; gồm giá và yêu cầu tiềm năng |
| `buyNroShopItem` | client → server | `{npcId,entryId}` | Server xác minh vị trí, hàng hóa, vàng và chỗ trống trước khi trừ tiền |
| `nroShopTransactionResult` | server → client | `{ok,message,bag,gold}` | Xác nhận giao dịch và hành trang mới |
| `equipNroItem` | client → server | `{bagIndex}` | Trang bị áo/quần/găng/giày/rada; server xác thực template, hành tinh, tiềm năng và tính chỉ số từ option đã lưu |
| `useNroItem` | client → server | `{bagIndex}` | Type 6 dùng hồi phục; item 2144 (type 27) reset cooldown; server xác thực item ở đúng bag slot rồi mới tiêu thụ |
| `learnNroSkill` | client → server | `{bagIndex}` | Server khớp sách với hành tinh/skill template, chỉ nhận đúng cấp kế tiếp rồi trừ sách và lưu cấp skill |
| `nroInventoryResult` | server → client | `{ok,message,bag,equipment,stats,cooldownsReset?}` | Đồng bộ inventory; `cooldownsReset` chỉ bật khi server chấp nhận elixir 2144 để HUD xóa cooldown |

## Quái và vật phẩm

| Event | Chiều | Payload chính | Mục đích |
|---|---|---|---|
| `itemDropped` | server → room | ID, loại, template, vị trí, quantity, owner | Thông báo item/vàng được server tạo từ bảng reward |
| `pickupItem` | client → server | item ID | Server xác minh tồn tại, quyền nhặt và khoảng cách |
| `itemPicked` | server → room | item ID, player, loại, bag/gold mới | Xóa drop và thông báo người nhặt |
| `itemPickupResult` | server → client | `{ok,message,bag,gold}` | Xác nhận nhặt hoặc trả lý do từ chối |

Nhiệm vụ chính 2: đùi gà template 73 chỉ rơi từ mob 1/2/3 trên map đích hành tinh và bị khóa cho người hạ quái. Server chỉ cộng tiến độ sau pickup hợp lệ. `nroTaskUpdate` phát tiến độ/`ready_to_report`; NPC nhà xác thực đủ 10 đùi gà, trừ item và trả thưởng. Nhiệm vụ 3 yêu cầu nâng chỉ số, chuyển qua waypoint tới vách núi race (map 42/43/44), rồi báo NPC nhà; server xác thực từng bước và lưu trạng thái.

Hành trang ban đầu có 20 ô. Các item template, tab/shop liên kết với NPC và giá được nhập từ SQL; giao dịch mua hiện chưa áp dụng item exchange hoặc thanh toán bằng ngọc.

Client render drop và gửi `pickupItem` khi chạm/click drop. Item thường vào bag; vàng cộng tài nguyên. Source reward condition đặc biệt và option base của gear rơi chưa port đầy đủ.

## Cổng bản đồ

Server đọc waypoint từ catalog map, chuyển khi thân nhân vật giao với vùng cổng (bao gồm cổng sát biên bị giới hạn tâm chuyển động), map đích nằm trong `nroWorld.playableMapIds`, có tile set collision và spawn nằm trong biên map. Server chọn zone còn chỗ, đổi room, lưu `mapId`/`zoneId`/tọa độ mới, rồi gửi `mapTransition` chứa map entry và snapshot entities cho client. Client chỉ dựng map theo payload server; không tự quyết định điểm đến. Map chưa sẵn sàng trả `zoneError` có rate limit thay vì cho vào world thiếu physics.

| Event | Chiều | Payload chính | Quy tắc |
|---|---|---|---|
| `mapTransition` | server → client | `{mapEntry,zoneId,player,players,monsters,items}` | Xác nhận chuyển map/zone; client dựng map đích và đồng bộ entities |

`initialState.config.nroWorld` trả `mapId`, `zoneId`, tốc độ bay và `flightKiPerSecond` (mặc định 1 KI/giây). Nếu tất cả zone của map đầy, server phát `zoneError` và từ chối kết nối/chuyển map.

## Bang hội

| Event | Chiều | Payload chính | Quy tắc |
|---|---|---|---|
| `guildRequestState` | client → server | không có | Trả bang hiện tại và danh sách tuyển thành viên. |
| `guildCreate`, `guildJoin`, `guildLeave` | client → server | `{name,description}` / `{guildId}` / không có | Server kiểm tra giới hạn tên, tư cách thành viên và số chỗ; kết quả trả qua `guildState`/`guildResult`. |
| `guildTransferLeadership` | client → server | `{targetUserId}` | Chỉ bang chủ chuyển quyền cho thành viên hiện hữu; cập nhật nguyên tử theo phiên bản document. |
| `guildKickMember` | client → server | `{targetUserId}` | Chỉ bang chủ trục xuất thành viên khác trong cùng bang. |
| `guildUpdateDescription` | client → server | `{description}` | Chỉ bang chủ được sửa mô tả; tối đa 120 ký tự. |
| `guildChatSend` | client → server | `{text}` | Server xác minh thành viên trong DB, giới hạn 240 ký tự và rate limit 650ms trước khi phát trong room bang. |
| `guildChatMessage`, `guildRefresh` | server → room bang | tin nhắn đã đóng dấu giờ / không có | Client nhận tin bang và tải lại trạng thái khi danh sách thành viên/quyền thay đổi. Chat hiện chỉ lưu trong phiên kết nối, chưa có lịch sử bền vững. |

Danh sách map đang mở lấy theo `server/src/config/gameConfig.json`: 0–4, 7–9, 11–12, 14–18, 21–27, 42–44 và 46–47 (27 map). Không tự suy ra rằng các map còn lại trong catalog 163 map đã chơi được; map 167 thiếu tile set collision và bị chặn. Map 15/44 được mở cho nội dung Xayda; background ID 8 không có trong archive, nên renderer dùng fallback. Spawn mặc định của map chưa cấu hình riêng được suy ra từ platform va chạm dài nhất ở nửa dưới map, cần QA hình ảnh từng map.
