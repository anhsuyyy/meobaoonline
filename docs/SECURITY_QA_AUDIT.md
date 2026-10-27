# Security & Gameplay QA Audit — Ngọc Rồng Online Web

Cập nhật: 27/10/2026. Tài liệu ghi trạng thái source, lỗi đã tái hiện khi chơi, bản vá đang có và các rủi ro còn lại. Bản vá ở lượt này chưa được xác nhận bằng test suite hoặc chạy live sau thay đổi.

## Kiểm tra trong lượt này

- Đăng nhập tài khoản được ủy quyền, chơi trực tiếp ở 1440×900: canvas/HUD render, không tràn viewport hoặc lỗi JavaScript. Đã di chuyển bằng phím mũi tên, đánh thường, dùng Đấm Dragon và Kamejoko, mở nhiệm vụ, bật auto, chuyển map qua waypoint, nói chuyện với NPC, mua một món bằng vàng, nhặt loot và làm nhiệm vụ.
- Kết quả combat thực tế: giữ mũi tên 0,7 giây làm tọa độ server đổi 216→348 (132 px); đòn đánh thường và Đấm Dragon gây 91 damage mỗi lần; Kamejoko nhận `skillSuccess`, gây 18 damage kết liễu mục tiêu, trừ 30 KI, cooldown server 2.000 ms và UI hiện bộ đếm còn 1,3 giây sau 0,7 giây. Quái gây damage lên HP người chơi; khi nhân vật gục, đồng hồ hồi sinh chạy và nhân vật hồi sinh được.
- Waypoint: ngoài phạm vi, click bảng tên không đổi map; sau khi đi vào entry, focus hiển thị tên map và nhấn Enter chuyển map 11→9, server đặt tọa độ spawn 1188,264. Điểm chuyển map hoạt động hai chiều.
- Mua/nhặt: mua đúng một Quần vải đen với giá 400 vàng qua UI; số vàng giảm chính xác 400 và túi tăng từ 1/20 lên 2/20. Nhặt Sao pha lê và Đùi gà đều được server xác nhận bằng `itemPickupResult`; loot và vật phẩm vào túi. Không thử retry packet hay thao tác đồng thời.
- Nhiệm vụ: hạ 5 Mộc nhân, báo cáo NPC, nhiệm vụ hoàn tất và server cộng đúng 500 sức mạnh + 500 tiềm năng; nhiệm vụ kế tiếp “Tìm 10 đùi gà” mở ra. Trong lần kiểm tra tiếp theo, tiến độ nhiệm vụ 2 được xác nhận 5/10 sau khi hạ quái và nhặt Đùi gà; chưa hoàn tất hoặc nhận thưởng 300 triệu vàng.
- Shop NPC: mua ở Bunma hoạt động bình thường. Riêng Uron tại Trạm tàu vũ trụ chỉ mở hội thoại thông tin dù cấu hình shop ánh xạ NPC 16 tới shop 4; không có nút mở shop trong hội thoại. Ghi nhận là finding 19.
- Baseline trước bản vá: `npm test` có **145/162 server tests đạt, 17 thất bại**; `npm --prefix client test` đạt **27/27**. Chưa chạy lại test suite sau các thay đổi trong lượt này. Sau bản vá, `node --check` các module server liên quan, `npm --prefix client run lint` và `npm --prefix client run build` đều đạt; build vẫn cảnh báo chunk Phaser 1.367 KB vượt 500 kB.
- Không có module/event giao dịch người chơi hoặc kho rương trong server hiện tại; các mục này là yêu cầu thiết kế an toàn trước khi triển khai, không phải lỗ hổng đã khai thác được.

## Trạng thái xử lý trong lượt này

- Đã vá trong source: không lưu mật khẩu ở localStorage; thu hồi phiên qua session version; giới hạn login/register và nhóm Socket.IO nhạy cảm; một socket cho mỗi tài khoản trong process cùng CAS revision khi lưu nhân vật; unique claim membership bang hội; strict boolean cho auto; dừng auto khi chết; sửa timer tự đánh; mở shop theo mapping NPC; request ID mua hàng; đếm quest theo vật phẩm nhặt trong nhiệm vụ; cấu hình thưởng nhiệm vụ.
- Cần restart backend rồi xác nhận lại trên live: auto đánh lặp, Uron mở shop và mua đúng một lần, logout thu hồi token/socket, tạo/tham gia bang đồng thời, quest không tính item cũ. Backend cũ ở cổng 3000 vẫn đang chạy; thử dừng đúng PID để áp dụng bản vá đã bị chính sách tự động chặn.
- Còn giới hạn: rate limit và session lock hiện ở bộ nhớ một process; triển khai nhiều worker cần Redis/DB lease (CAS vẫn ngăn ghi snapshot cũ). Receipt shop lưu trong nhân vật nhưng pickup/drop vẫn dựa vào state RAM. Bag index chưa được thay bằng item instance ID. Trade/kho chưa tồn tại nên chưa có hành vi để vá; animation chỉ có thể được nghiệm thu qua gameplay browser.

## Lỗ hổng và lỗi logic

### 1. Mật khẩu lưu nguyên văn trong localStorage — Cao, đã vá

1. **Tên lỗi / lỗ hổng:** `client/src/features/auth/AuthModal.jsx` lưu `{username, password}` dưới `meo-online.remembered-credentials`.
2. **Test case:** đăng nhập có bật ghi nhớ, mở DevTools → Application → Local Storage, đọc key này; cùng origin có thể đọc bằng `localStorage.getItem(...)`.
3. **Hậu quả:** người dùng chung máy, extension độc hại hoặc XSS có thể lấy mật khẩu dùng lại ở dịch vụ khác. Mã hóa bằng JavaScript trong cùng origin không bảo vệ được trước XSS.
4. **Fix/Patch:** bỏ lưu password, chỉ ghi nhớ username và dùng password manager của trình duyệt. Nếu cần đăng nhập tự động, đổi sang access token ngắn hạn + refresh token ngẫu nhiên, lưu hash refresh token ở server và gửi refresh token bằng cookie `HttpOnly; Secure; SameSite=Strict`; không lưu mật khẩu hay refresh token trong localStorage.

### 2. JWT sống 7 ngày nhưng không có thu hồi phiên — Cao, đã vá bằng session version

1. **Tên lỗi / lỗ hổng:** token vẫn hết hạn sau 7 ngày, nhưng nay có `sessionVersion` trong JWT và user record; HTTP/Socket.IO so phiên bản trước khi chấp nhận token.
2. **Test case:** đăng nhập, gọi `/api/auth/logout`, rồi thử token cũ lại qua `/api/characters/me` và Socket.IO handshake.
3. **Hậu quả:** token cũ bị từ chối ở request/handshake tiếp theo; logout cũng ngắt các socket đang hoạt động của tài khoản.
4. **Fix/Patch:** logout tăng phiên bản server-side và broadcast disconnect. Còn thiếu refresh token ngắn hạn/rotation; triển khai cookie `HttpOnly; Secure; SameSite=Strict` nếu cần phiên dài.

### 3. Không giới hạn tốc độ đăng nhập/đăng ký — Cao, đã vá giới hạn theo IP trong process

1. **Tên lỗi / lỗ hổng:** trước đây `/api/auth/login` và `/api/auth/register` không có rate limit; nay có cửa sổ theo IP ở controller (10 login/15 phút, 5 đăng ký/giờ).
2. **Test case:** gửi liên tục nhiều lần POST `/api/auth/login` cho một tài khoản hoặc nhiều username từ cùng IP; đo số lần PBKDF2/database query mỗi giây.
3. **Hậu quả:** brute-force mật khẩu và làm cạn CPU do PBKDF2 210.000 vòng, đồng thời tăng tải MongoDB.
4. **Fix/Patch:** hiện đã thêm giới hạn IP trong process. Trước production nhiều worker, chuyển bucket sang Redis và thêm hạn chế theo username/độ trễ tăng dần; không khóa cứng tài khoản chỉ dựa vào IP.

### 4. Nhiều socket cùng tài khoản ghi đè toàn bộ snapshot nhân vật — Cao, đã chặn bằng socket lock + CAS revision

1. **Tên lỗi / lỗ hổng:** snapshot nhân vật dùng `$set` toàn bộ field; nay chỉ lưu nếu `character.revision` khớp revision đã đọc, sau đó tăng revision atomically. Một active socket mỗi user trong process persist socket cũ trước khi thay thế.
2. **Test case:** mở cùng tài khoản ở hai trình duyệt; mua/nhặt/nâng chỉ số ở A và B gần đồng thời, hoặc để một tab cũ ghi khi tab mới đã cập nhật.
3. **Hậu quả:** snapshot cũ có thể ghi đè vàng, túi đồ, HP, nhiệm vụ hoặc điểm tiềm năng mới; có thể tạo item rollback/chi tiêu lệch khi các thao tác diễn ra ở hai bản sao state.
4. **Fix/Patch:** `findOneAndUpdate` lọc revision và `$inc` để snapshot cũ bị từ chối; xung đột buộc socket nạp lại phiên. Socket lock dừng socket cũ trong cùng process; Redis lease vẫn cần để điều phối multi-process.

### 5. Guild membership dùng check-then-write trên nhiều document — Cao, đã vá bằng unique claim

1. **Tên lỗi / lỗ hổng:** `server/src/modules/guild/guildService.js:create/join` gọi `Guild.exists()` rồi mới `create`/`findOneAndUpdate`. `optimisticConcurrency` chỉ bảo vệ ghi cùng một guild document, không ngăn user xuất hiện ở hai guild.
2. **Test case:** cùng user gửi `guildJoin` tới hai guild (hoặc `guildCreate` và `guildJoin`) đồng thời bằng hai socket.
3. **Hậu quả:** một user có thể trở thành thành viên nhiều bang, làm sai quyền, chat và vai trò.
4. **Fix/Patch:** đã thêm collection `GuildMembership` với unique index `userId`, backfill thành viên cũ, claim atomically trước create/join và rollback membership nếu ghi guild thất bại. Không cần replica-set transaction cho unique claim; vẫn cần test concurrent trên Mongo thật.

### 6. Toggle auto ép kiểu truthy sai — Trung bình, đã vá

1. **Tên lỗi / lỗ hổng:** trước đây handler `toggleAuto` dùng truthiness; nay chỉ nhận boolean và từ chối bật auto legacy trong mode NRO.
2. **Test case:** qua DevTools phát `socket.emit('toggleAuto', 'false')`, sau đó quan sát `autoStateChanged` và thử di chuyển.
3. **Hậu quả:** state auto bật ngoài ý muốn; trong NRO hiện tại auto còn chặn input thủ công nên nhân vật có thể đứng yên đến khi gửi input khác.
4. **Fix/Patch:** đã strict-check boolean, chỉ bật legacy auto ở mode cũ, và chặn bật khi nhân vật chết/đang bay.

### 7. Auto Farm legacy không chạy ở mode NRO — Cao, đã chặn nút legacy trong mode NRO

1. **Tên lỗi / lỗ hổng:** trong vòng tick `gameSocket.js`, mode NRO đi vào nhánh `if (gameMode === 'nro')`; nhánh auto farm thực tế nằm ở `else if (p.isAuto ...)` nên không bao giờ chạy cho NRO. NRO vẫn bỏ input thủ công khi `p.isAuto`, nhưng không tự tiếp cận/đánh. Nhánh cũ chỉ emit `autoAttackTrigger`; không có listener tương ứng trong client.
2. **Test case:** đăng nhập NRO, bật nút AUTO khi có quái; quan sát player không đánh/tìm mục tiêu và nút di chuyển chỉ có tác dụng sau khi trạng thái auto tắt.
3. **Hậu quả:** nút auto hiển thị bật nhưng vòng lặp auto không hoạt động; người chơi tưởng đang đánh, nhân vật có thể bị quái hạ.
4. **Fix/Patch:** đã chặn `toggleAuto=true` legacy trong mode NRO để nó không thể bật cờ nhưng bỏ input thủ công. NRO auto nhắm mục tiêu dùng luồng double-click/Enter của client và mọi sát thương vẫn đi qua `SkillManager`; cần xác nhận lại timer live sau sửa.

### 8. Auto attack phía client vẫn gửi packet sau khi nhân vật chết — Trung bình, đã vá phía client và server

1. **Tên lỗi / lỗ hổng:** trước đây timer client không dừng rõ khi HP người chơi về 0; nay Scene dừng target auto trên snapshot chết, timer cũng chặn cast khi HP≤0, server tắt auto khi gục.
2. **Test case:** double-click quái để bật tự đánh, để nhân vật chết trong khi quái còn sống; theo dõi Socket.IO frame `castSkill` sau snapshot HP=0.
3. **Hậu quả:** vòng lặp có thể tiếp tục gửi khoảng 13 request/giây khi gục; chủ yếu gây tải và lỗi UX, chưa vượt được chặn sát thương server.
4. **Fix/Patch:** các điểm dừng đã được nối ở server tick và Scene; combat rate limit bổ sung bảo vệ khi client bị sửa.

### 9. Packet flood lên cast/inventory/shop — Trung bình, đã thêm rate limit theo nhóm event

1. **Tên lỗi / lỗ hổng:** trước đây các event combat, inventory, shop, NPC, guild và auto thiếu bucket; nay Socket.IO middleware giới hạn theo nhóm event/socket.
2. **Test case:** gửi nhiều event invalid/valid liên tục qua DevTools; `castSkill` cùng một skill bị cooldown từ chối, nhưng server vẫn parse/resolve mục tiêu cho từng packet.
3. **Hậu quả:** có thể làm tăng CPU, lookup và DB write, gây lag cho cả khu; cooldown ngăn phần lớn sát thương lặp nhưng không phải biện pháp chống flood.
4. **Fix/Patch:** đã thêm bucket process-local cho combat, inventory và social; cần chuyển sang user-keyed Redis bucket nếu đa process.

### 10. Thao tác mua/nhặt không có idempotency key — Trung bình, mua hàng đã có request ID; pickup nguyên tử trong process

1. **Tên lỗi / lỗ hổng:** mua hàng nay yêu cầu `requestId` và giữ 128 ID gần nhất trong hồ sơ nhân vật; pickup vẫn dựa vào drop state RAM và xóa item đồng bộ trước persist.
2. **Test case:** gửi cùng `buyNroShopItem` hai lần khi response lần đầu bị trì hoãn/mất; thử cùng `pickupItem` ID song song. Trên 1 process, pickup thứ hai bị từ chối; mua thứ hai hiện là giao dịch mua mới và tính tiền tiếp.
3. **Hậu quả:** retry không phân biệt với lần mua mới có thể mua trùng và trừ tiền hai lần; thao tác pickup hiện an toàn trong một process nhưng dựa vào state RAM.
4. **Fix/Patch:** đã thêm UUID cho lệnh mua; retry cùng ID trả túi/vàng hiện tại mà không trừ lần nữa. Còn cần DB ledger transaction và durable unique claim cho drop trước khi chạy nhiều process.

### 11. Bag index có thể lỗi thời giữa các phiên — Trung bình, rủi ro đã xác nhận

1. **Tên lỗi / lỗ hổng:** `equipNroItem`, `useNroItem`, `learnNroSkill` vẫn nhận `bagIndex`; việc chặn socket song song giảm rủi ro trong một process nhưng chưa giải quyết stale index qua nhiều worker.
2. **Test case:** mở hai phiên cùng tài khoản; sắp xếp/tiêu thụ item ở phiên A rồi gửi packet với `bagIndex` cũ từ phiên B.
3. **Hậu quả:** thao tác có thể tác động nhầm vật phẩm trong snapshot cũ; sau đó full snapshot ghi đè có thể khôi phục item đã tiêu ở phiên kia.
4. **Fix/Patch:** còn cần cấp `itemInstanceId` ổn định và đổi các event trang bị/dùng/học skill sang ID; kết hợp CAS/transaction cho multi-process.

### 12. Giao dịch và kho rương chưa có — Chưa triển khai

1. **Tên lỗi / lỗ hổng:** không tìm thấy event/service trade, escrow hay bank/chest trong `server/src`; không có giao dịch thật để tester khai thác hiện tại.
2. **Test case:** UI không có luồng trao đổi/kho; nếu thêm thử nghiệm, chạy hai người chơi staging và gửi accept/cancel/disconnect đồng thời.
3. **Hậu quả:** chưa có rủi ro dupe từ tính năng này, nhưng triển khai trực tiếp bằng hai lần ghi túi đồ có thể mất item hoặc nhân đôi item.
4. **Fix/Patch:** tạo state trade server-side với revision và hai offer đã khóa; khi cả hai xác nhận, chạy transaction Mongo atomically kiểm tra ownership/capacity rồi trừ hai túi và cộng hai túi. Ghi ledger idempotent theo trade ID; cancel/timeout chỉ mở khóa escrow, không tự dựng lại item từ client.

### 13. Hoàn thành nhiệm vụ có thưởng 300 triệu vàng hard-code — Cao về cân bằng, đã chuyển reward ra config

1. **Tên lỗi / lỗ hổng:** thưởng nhiệm vụ 1 và 2 đã chuyển vào `gameConfig.quests.nroTaskRewards`; task 2 vẫn có mức 300 triệu vàng theo nội dung quest. Trạng thái claim được chuyển tiếp và lưu cùng nhân vật.
2. **Test case:** trên staging, hoàn thành task đến `ready_to_report`, gửi report NPC một lần và kiểm tra reward; gửi lặp và gửi đồng thời từ hai phiên cùng user.
3. **Hậu quả:** nếu reward không phải giá trị dự kiến thì phá kinh tế; phiên đồng thời có thể cho phép nhận reward từ state cũ (liên quan finding 4).
4. **Fix/Patch:** reward đã cấu hình, pickup chỉ tăng tiến độ bằng item nhặt khi nhiệm vụ đang chạy. Còn cần ledger/CAS nếu chuyển sang nhiều worker hoặc persistence cạnh tranh.

### 14. Cooldown/MP/target có kiểm tra server-side — Đang được bảo vệ

1. **Tên lỗi / lỗ hổng:** kiểm tra DevTools giả sửa cooldown/MP/target.
2. **Test case:** sửa Redux/localStorage; gửi liên tục `castSkill` cùng ID, target ở map/khu khác, target ngoài range, skill chưa học, MP không đủ.
3. **Hậu quả:** hiện tại server `SkillManager` kiểm tra HP sống, skill/cấp, cooldown, MP, stamina, target, owner encounter, map/khu, tầm và hướng; sửa UI một mình không cấp sát thương hoặc tài nguyên.
4. **Fix/Patch:** giữ nguyên nguyên tắc này: client chỉ gửi intent; server đọc stat/level/equipment/cooldown từ player state. Bổ sung rate limit (finding 9) và regression integration cho từng packet giả mạo; không dùng thời gian cooldown client làm nguồn quyết định.

### 15. Sửa Vàng/Ngọc/HP/KI/level từ DevTools — Đang được bảo vệ

1. **Tên lỗi / lỗ hổng:** kiểm tra giả sửa Redux, DOM hoặc phát event `statsUpdate` từ client.
2. **Test case:** gán `gold`, `hp`, `mp`, `dtn`, `power` trong Redux/localStorage; thử emit event tên `statsUpdate` với số lớn.
3. **Hậu quả:** hiện `statsUpdate` là event server→client, không có handler inbound tương ứng; vàng/HP/KI/potential được thay ở server bởi các action đã kiểm tra. Hành vi DevTools chỉ đổi màn hình cục bộ.
4. **Fix/Patch:** tiếp tục không nhận snapshot stats từ client. Mọi API tăng/giảm currency phải gắn với server action và ledger; kiểm tra `Number.isSafeInteger`, miền giá trị, ownership và revision trước khi persist.

### 16. Hack tốc độ/teleport bằng sửa tọa độ — Đang được bảo vệ

1. **Tên lỗi / lỗ hổng:** gửi vị trí hoặc vận tốc giả qua `playerInput`.
2. **Test case:** gửi `{x: 999999, y: 0}`, `{axisX: 50, axisY: 0}` hoặc payload có key thừa; so với input hợp lệ liên tục.
3. **Hậu quả:** server chỉ nhận hướng boolean hoặc analog trong [-1, 1], giới hạn input bằng token bucket và tự tính vị trí mỗi tick; payload sai bị bỏ qua. Tốc độ lấy từ config/stat server.
4. **Fix/Patch:** giữ server là nguồn tọa độ duy nhất; thêm kiểm tra vận tốc bất thường theo tick và ghi log khi bị drop. Không đưa tọa độ client vào snapshot persist hoặc map transition.

### 17. Cooldown animation hoặc animation bị sửa — Trạng thái gameplay được bảo vệ, QA animation còn thiếu

1. **Tên lỗi / lỗ hổng:** người chơi bỏ qua animation, gửi skill lại trước khi kết thúc hiệu ứng, hoặc animation kẹt sau khi chết/đổi map.
2. **Test case:** tua animation qua DevTools, spam cast trước khi hết CD, chết/respawn giữa animation rồi đánh lại.
3. **Hậu quả:** hình ảnh có thể lệch nếu client không dừng animation; sát thương vẫn bị chặn bởi cooldown server. Lần full suite hiện có các lỗi protocol/fixture chờ event cũ nên chưa đủ bằng chứng nghiệm thu vòng này.
4. **Fix/Patch:** client animation chỉ theo `skillSuccess`, cooldown dùng timestamp do server phát; reset pose khi `hp=0`, respawn, map change và disconnect. Bổ sung browser regression và socket test đối chiếu số lần `damageTaken` với số cast hợp lệ.

### 18. Auto đánh ghim mục tiêu nhưng không phát đòn lặp — Cao, đã vá nguyên nhân timer

1. **Tên lỗi / lỗ hổng:** thao tác double-click/Enter hai lần bật trạng thái auto ở Scene và hiện nhãn `TỰ ĐÁNH`, nhưng vòng gửi cast trong `SkillBar.jsx` không phát `castSkill` lặp.
2. **Test case:** vào map có quái, focus quái rồi double-click hoặc nhấn Enter hai lần; theo dõi WebSocket frames. Trong phiên QA, server nhận một đòn `basic` thủ công, sau đó client phát event `game:nro-auto-attack {active:true,targetId}`; trong 2,5–3 giây tiếp theo không có frame `castSkill` định kỳ dù mục tiêu còn sống và nhãn auto đã bật.
3. **Hậu quả:** người chơi thấy `TỰ ĐÁNH` nhưng nhân vật ngừng tấn công sau đòn đầu hoặc không tự đánh; làm kẹt tiến trình nhiệm vụ/farm và dễ khiến người chơi chết khi đứng yên giữa quái.
4. **Fix/Patch:** timer cooldown giờ giữ nguyên object khi không có cooldown hết hạn; trước đây cập nhật object mỗi 50 ms làm effect dọn timer auto 75 ms chạy lại liên tục. Server rate limit và tiếp tục xác thực từng cast. Cần live verify rằng auto phát nhiều cast đúng cooldown.

### 19. Shop Uron đã cấu hình nhưng không mở được từ hội thoại — Trung bình, đã vá theo mapping shop

1. **Tên lỗi / lỗ hổng:** `shared/nro/maps/shops.json` ánh xạ shop ID 4 vào NPC ID 16 (Uron), nhưng luồng `interactNroNpc` trong `server/src/socket/gameSocket.js` chỉ thêm option `open_shop` cho Bunma ID 7/race shop; Uron chỉ trả hội thoại thông tin. UI `NroNpcDialog.jsx` chỉ phát `game:nro-open-shop` khi server cung cấp option, nên người chơi bình thường không tới được catalog.
2. **Test case:** vào Trạm tàu vũ trụ, đứng cạnh NPC Uron ID 16 và nhấn Enter/click hội thoại. Quan sát chỉ có nội dung thông tin khu vực và không có nút “Mở cửa hàng”, dù `openNroShop` có cấu hình shop tương ứng.
3. **Hậu quả:** sách và phụ kiện của shop 4 không thể mua qua luồng chơi bình thường; UI và dữ liệu shop lệch nhau. QA không gọi event shop trực tiếp và không mua món ngọc để tránh bỏ qua gameplay.
4. **Fix/Patch:** dialog nay tra `nroShops` theo `npcId` để tạo option; phản hồi catalog kèm tên NPC. Handler tiếp tục xác thực mapping, map, tầm, tab/item và currency ở server. Cần xác nhận lại Uron trên live sau restart.

## Thứ tự xử lý khuyến nghị

1. Bỏ lưu mật khẩu rõ trong localStorage; bổ sung rate limit đăng nhập và thu hồi token.
2. Chặn nhiều session cùng tài khoản và thêm character revision/CAS.
3. Sửa auto NRO thành server-authoritative; strict-validate payload và rate limit combat/inventory.
4. Dùng item ID ổn định, request idempotency và ledger cho shop/reward.
5. Thêm unique membership cho bang hội; chỉ sau đó mới triển khai trade/kho bằng escrow + transaction.
6. Cập nhật các test còn theo giao thức cũ, điều tra 17 lỗi suite trước khi bật release gate.

