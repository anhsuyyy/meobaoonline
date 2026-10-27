# Đánh giá source NRO để chuyển sang game web

Cập nhật: 25/10/2026

## Source đã nhận

- Archive: `D:\VibeCode\SRC NRO NEW 01.rar` (RAR5, khoảng 546 MB).
- Đã kiểm tra danh sách 61.904 entry; không thấy entry có đường dẫn traversal/absolute.
- Mã Java và SQL tham khảo được trích xuất chọn lọc vào `D:\VibeCode\NRO_SOURCE_READONLY`. Bản archive tài nguyên gốc được giữ tại `client/nro-source-archive/` (git-ignore) làm tư liệu đối chiếu. Từ 26/10/2026, runtime art được tạo mới từ catalog bằng `client/scripts/generateNroArtwork.mjs`; source PNG nằm ngoài web ở `artwork-source/nro-source-assets/normal`, còn renderer chỉ tải ảnh runtime đã sinh trong `client/public/assets/nro`. Tile/collision/catalog dữ liệu vẫn lấy từ importer NRO.
- Có project `Server` và `Login` dạng Java/Maven; phần lớn source game nằm ở `Server/src/main/java/nro` (431 file Java trong archive). Server đang dùng giao thức nhị phân riêng, khác Node.js/Socket.IO của app web.
- `lệnh.docx` là danh sách lệnh admin/game. `Hướng dẫn setup.docx` chủ yếu là nội dung quảng bá dịch vụ, không phải đặc tả chuyển game.

## Luồng gameplay quan trọng đã đọc

- `nro/services/SkillService.java`: kiểm tra MP, cooldown và trạng thái hiệu ứng trước khi dùng skill; có nhóm đánh, buff, khống chế, AoE và kỹ năng chuẩn bị/cast. MP có thể trừ theo số cố định, phần trăm MP tối đa hoặc toàn bộ MP. Cooldown được ghi nhận sau khi dùng skill thành công.
- `nro/models/skill/PlayerSkill.java` và `nro/models/skill/Skill.java`: chọn skill, cấp skill, trạng thái hồi chiêu và các hằng số skill.
- `nro/models/map/Zone.java`: quản lý người chơi cùng khu, cập nhật vị trí, kiểm tra trạng thái chết/hiệu ứng, phát vị trí cho người chơi trong map và kiểm tra nhiệm vụ di chuyển.
- `nro/services/MobService.java`: mob nhận damage, chết/hồi sinh, rơi vật phẩm và trao thưởng.
- Đối chiếu `nro/models/mob/Mob.java` và `MobPoint.java`: mob thường không có vòng đi/chase; kiểm tra mục tiêu trong bán kính 100 px mỗi 2 giây, mob template 0/82 không đánh người chơi, mob thường hồi sinh sau 2 giây trên map thường. Sát thương cơ bản lấy từ HP tối đa × `percentDame` (có sai số theo source).
- `nro/models/player/Player.java`: vòng cập nhật nhân vật và các hiệu ứng theo thời gian.
- `nro/services/func/ChangeMapService.java`, `nro/services/MapService.java`: chuyển map/khu và đồng bộ map.
- `nro/services/TaskService.java` + `nro/models/boss/mapoffline/Boss_Tau77.java`: task 9 gọi encounter riêng `Service.callTau77` tại Bò Mộng; Tau77 xuất hiện ở map 47 (Rừng Karin), chỉ đổi nhiệm vụ người chơi được gắn encounter khi boss đánh trúng; đi vào map 46 mở bước nói chuyện Thần Mèo Karin (NPC 18). `BossData.TAU_7_7` dùng outfit parts 92/93/94 và 10.000 HP. Đây là quest boss, không phải mob template/spawn của catalog map.
- `nro/models/npc/NpcFactory.java`, `Boss_ThanMeo.java`, `Boss_Tau77.java` và `BossData`: sau task 9, NPC Karin yêu cầu xác nhận thách đấu; duel boss Karin có HP 500, damage 50 và outfit 89/90/91. Task 10 index 1 cho chủ nhiệm vụ gây damage Tau77; khi hạ boss, task chuyển sang nói chuyện với Bò Mộng. Bò Mộng trao Ngọc Rồng 6 sao template 19, rồi NPC nhà hoàn tất turn-in và thưởng 15.000 sức mạnh/tiềm năng. `Service.callTau77` ngăn summon trùng boss cho cùng người chơi.
- Tài nguyên JSON có 80 mẫu quái trong `Server/resources/normal/monster_data`; effect data cũng ở JSON.
- Map binary có header `width, height`, sau đó là tile grid 24 px. Importer đọc `map_template`, `part`, `mob_template` và `npc_template` từ SQL; sinh catalog 163 map có tile file, tile-set collision, 2.042 bộ part, 84 mob template và 80 NPC template. Client/server cùng dùng dữ liệu trong `shared/nro/maps`; bản client được phục vụ tại `client/public/assets/nro/maps`.

## Khác biệt kiến trúc cần xử lý

App hiện tại là top-down Phaser, Node.js authoritative qua Socket.IO, map và class chủ đề mèo. NRO source là game side-view với tọa độ X/Y có trọng lực/nền, nhân vật đứng trên mặt đất, rơi/nhảy, hướng mặt và vùng bản đồ/khu. Vì vậy không thể chỉ thay tên skill hoặc copy service Java: cần chuyển các luật gameplay sang module JavaScript chạy server, rồi đổi scene Phaser sang camera side-view và dữ liệu map phù hợp. Bước đầu đã nhập asset scale 1x và tạo catalog map; renderer NRO, physics và socket contract side-view còn cần triển khai.

## Thứ tự port đề xuất

1. Chốt phạm vi vertical slice: một map, một race/class, di chuyển trái/phải/nhảy, một mob và đánh thường.
2. Port mô hình tọa độ side-view: gravity, grounded, collision nền, giới hạn map và đồng bộ snapshot server.
3. Port cấu hình nhân vật/skill, validation MP + cooldown, damage và effect; không mang nguyên protocol TCP nhị phân sang Socket.IO.
4. Port AI mob, respawn, EXP/tiềm năng, vật phẩm rơi và nhặt vật phẩm.
5. Mở rộng map/zone, NPC, nhiệm vụ, inventory và lưu tiến trình.

Không nhập nguyên source Java vào app. Tài nguyên NRO đã nằm trong `client/public/assets/nro`; mã tham khảo nằm ngoài repository tại `D:\VibeCode\NRO_SOURCE_READONLY`.
