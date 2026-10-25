# Mèo Đa Vũ Trụ Online

MMORPG 2D trên trình duyệt. Client dùng Vite, React, Phaser 4, Redux Toolkit và Socket.IO Client. Server dùng Node.js, Express, Socket.IO và MongoDB/Mongoose. Phaser quản lý render và input; React quản lý UI; Redux chỉ giữ dữ liệu giao diện có thể tuần tự hóa. Server là nguồn sự thật cho di chuyển, combat, quái, vật phẩm, tiến trình và class.

## Trạng thái dự án

Cập nhật lần cuối: 25/10/2026. Kế hoạch tham chiếu là bộ nâng cấp 5 giai đoạn / prompt P00–P23 trong [tài liệu Google Docs](https://docs.google.com/document/d/1dOLivWTfLPz6W2CKmTV3KBXRhGAqA3gqyJ0Xr8fFU6A/edit).

### Đã có trong repository

- **Nền tảng (Giai đoạn 1):** monorepo npm client/server; đăng ký và đăng nhập có băm mật khẩu và JWT; MongoDB; health endpoint; xác thực Socket.IO; room Chương 0; Phaser trong React; cập nhật vị trí theo server tick 20 Hz; reconnect phía client và lưu trạng thái nhân vật.
- **Combat (Giai đoạn 2):** combat server-side, kỹ năng Mèo Báo với MP cost 2/30, quái Patrol/Chase/Attack/Return/Dead, AABB, hiệu ứng sát thương phía client nhận từ kết quả server.
- **Core loop (Giai đoạn 3):** nhận thưởng khi hạ quái, quest đầu tiên và lưu tiến trình, nhặt xu, Redux HUD, Auto Farm tìm mục tiêu trong 300 px và leash 320 px.
- **Content (Giai đoạn 4):** NPC chọn class ở cấp 5, bốn lựa chọn class, một quest và một bản đồ Trạm Cào. Các class chưa có bộ skill riêng đang dùng fallback Mèo Báo.
- **Điều khiển chiến đấu:** phím 1–5 dùng năm skill và có phím tắt Space/Q cũ; server xử lý cả năm skill cùng đánh thường. Trên màn hình hẹp có D-pad cảm ứng, năm nút skill, nút ĐÁNH, nhặt đồ và Auto Farm.
- **Chat multiplayer (Bước 0):** tin thế giới được broadcast server-side; khu vực gắn với room map; hệ thống chỉ phát từ server; lịch sử tối đa 50 tin/kênh được gửi khi join/reconnect. Server gán ID/người gửi/thời gian/thứ tự, lọc HTML/control, chặn rỗng/trùng và giới hạn tốc độ. Chat đội có room support nhưng chưa có chức năng tạo/gia nhập party.
- **Art Bible/pipeline (Bước 1):** `docs/ART_BIBLE.md` quy định tile 32px, bảng màu, outline, ánh sáng, frame/animation và quy tắc asset. Map Trạm Cào có atlas prototype PNG+JSON gồm 8 frame được sinh bằng `npm --prefix client run assets:map`; preload có progress và chỉ tải atlas của map hiện tại, fallback về map procedural.
- **Sprite procedural (Bước 2):** atlas entity PNG+JSON gồm 258 frame cho bốn class, sáu quái mẫu và NPC; sprite có idle/walk/attack/hit/die theo bộ frame hiện có, đổ bóng elip, HP quái, flip trái/phải và tự dàn/ẩn nhãn khi đông. Tạo lại bằng `npm --prefix client run assets:entities`. Đây là art tạm vẽ bằng code, chưa phải art phát hành; nguồn được ghi ở `docs/ASSET_CREDITS.md`.
- **Map tile (Bước 3):** Trạm Cào được dựng từ dữ liệu tile 32px: cỏ biến thể, đường đất, bờ/nước, cây, đá, hoa và gợn nước; trang trí xếp depth theo chân để entity có thể đi sau cây. Ground layer được bake vào CanvasTexture để chỉ có một game object nền.
- **Combat VFX/cooldown (Bước 4):** cooldown HUD bắt đầu theo cast được server chấp nhận và lấy thời lượng từ cấu hình server; countdown hiển thị phần thời gian còn lại thật. VFX skill chỉ phát khi nhận `playerAttacked`; hồi máu và đòn diện rộng có hiệu ứng riêng. Đã đồng bộ MP S1–S5 thành 2/15/35/50/100 theo thông số đã chốt. Snapshot vẫn 20Hz authoritative; client nội suy sprite mỗi frame để chuyển động hiển thị mượt hơn, không tăng tick hoặc đổi luật server.
- **Đăng nhập:** checkbox lưu cả username và mật khẩu trong `localStorage` sau khi đăng nhập thành công để điền sẵn lần sau; bỏ chọn sẽ xóa thông tin đã lưu. Mật khẩu nằm dạng văn bản thuần trong storage của trình duyệt, vì vậy chỉ bật trên thiết bị cá nhân. JWT vẫn chỉ tồn tại trong bộ nhớ và tải lại trang sẽ yêu cầu đăng nhập lại.
- **Lint client (Bước 0):** đã sửa khai báo Buffer ở script Node, bỏ React import thừa trong HUD, và đổi thông báo sang CSS animation để không gọi setState đồng bộ trong effect. `npm --prefix client run lint` hiện PASS.
- **Thông số gameplay đã chốt:** MP S1–S5 lần lượt 2/15/35/50/100; đánh thường 650ms, AGI giảm chu kỳ đến tối thiểu 400ms; world scale 10px/m; tốc độ cơ sở 4m/s = 40px/s. MP skill đã migrate vào runtime config; các phần đánh thường/AGI/world scale/tốc độ còn cần migrate.
- **Cấu hình (Giai đoạn 5 / P17):** trong phiên làm việc 25/10/2026 đã thêm validate `gameConfig.json` khi server khởi động. Validator kiểm tra cấu trúc và giá trị thiết yếu của server, map, chỉ số mặc định, class/skill, quái và quest; báo đường dẫn trường lỗi. CORS không còn tự mở `*`; production yêu cầu `CLIENT_ORIGIN`.

### Mốc theo kế hoạch

| Mốc | Trạng thái hiện tại | Việc còn thiếu đáng kể |
| --- | --- | --- |
| A — Skeleton | Có | Hướng dẫn cài mới và checklist biến production đã thêm; vẫn cần xác nhận trên máy sạch/production thật. |
| B — Chương 0 multiplayer | Socket integration 2 client + world chat PASS | Còn xác nhận bằng 2 browser/điện thoại + MongoDB thật và đo dưới tải/mạng thật. Party subsystem chưa có. |
| C — Combat | Có 5 skill và đánh thường | Bổ sung test tích hợp socket, nhiều người đánh một quái và xử lý tranh chấp/claim; cân bằng cấu hình skill prototype. |
| D — Core loop | Có bản cơ bản | Inventory hiện chủ yếu là tiền/tài nguyên; cần item/drop có quyền nhặt và lưu bền vững. Auto Farm cần claim mục tiêu phía server. |
| E — Content | Có scaffold ban đầu | Quest manager tổng quát, NPC hội thoại data-driven, map gates và config khắc chế PvP +8% chưa hoàn chỉnh. |
| F — Alpha | Chưa đạt | P17 config validation đã có; còn profiling có số đo, hồi quy/bảo mật, Docker/Nginx, backup/restore và báo cáo release. |

### Đang làm và điểm tiếp tục

- **Hoàn tất lát P17**: validate config được gọi trước khi kết nối DB/mở cổng; test validator đã thêm trong `server/tests/gameConfig.test.js`.
- **Hoàn tất Bước 0:** README đã có quy trình máy mới (`npm install`, `.env`, MongoDB, `npm run dev`) và kiểm tra env production (`NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`, `VITE_SERVER_URL`). Đã sửa 7 lỗi lint; lập `docs/OPEN_QUESTIONS.md` để chờ duyệt thông số mâu thuẫn.
- **Kết quả lệnh sau Bước 0:** `npm test` PASS (28 tests, 0 fail); `npm run build:client` PASS; `npm --prefix client run lint` PASS. Vite vẫn cảnh báo bundle JS minify khoảng 1.72 MB (>500 kB); chưa code-split vì lát này chỉ tập trung Bước 0.
- **Tiếp tục P04/P05**: `playerInput` chỉ chấp nhận bốn boolean hướng, có token bucket (burst 30, refill 120 event/giây/socket); server bỏ input sai/vượt giới hạn, chuẩn hóa tốc độ chéo và kẹp hitbox trong biên map. Event contract được cập nhật; có unit test cho parser, rate limit, tốc độ và biên map. Sau thay đổi này `npm test` PASS (28 tests); kiểm tra cú pháp Node và `git diff --check` PASS. Chưa chạy hai client để đo tick/reconnect thực tế.
- **Cập nhật điều khiển combat:** phím 1–5 và nút skill cảm ứng cùng phát một event cast; server đã xử lý 5 skill và đánh thường authoritative. Thêm D-pad cảm ứng giữ đa hướng, nhặt đồ và Auto Farm; sửa nút nhặt trên desktop. Xác nhận `npm test` PASS (28 tests), client build PASS, lint các file điều khiển thay đổi PASS; chưa thử trực tiếp trên điện thoại.
- **Bước 1/Mốc B:** thêm test tích hợp hai socket client: join room, snapshot/presence, disconnect/reconnect. Tick loop ban đầu chạy khoảng 16.2Hz do drift timer; chuyển sang deadline timer. Lần chạy toàn bộ test mới nhất đo 49.07ms/20.38Hz, disconnect notice 7.56ms và reconnect đến `initialState` 31.67ms. Chi tiết các lần đo, môi trường và giới hạn ở `docs/PERF.md`. DB được mock nên đây chưa phải đo end-to-end qua MongoDB.
- **Bước 0 chat:** đã xác nhận hai tin `[TG]`/`[HT]` trong ảnh đến từ `hudMockData.js`; submit chỉ dispatch Redux cục bộ, server trước đó không có chat handler. Đã bỏ chat mock và thêm broadcast/history/validation trên Socket.IO; integration test xác nhận đồng bộ hai client, thứ tự, lịch sử reconnect, loại HTML, kênh system chỉ server, rate limit và chặn tin lặp. Chi tiết event ở `docs/event_contract.md`.
- **Kết quả kiểm tra mới nhất sau Bước 1 asset:** `npm test` PASS (30 tests, 0 fail); `npm run build:client` PASS; `npm --prefix client run lint` PASS. Vite cảnh báo bundle JS minify khoảng 1.72 MB (>500 kB). `git diff --check` PASS (chỉ có cảnh báo chuyển LF sang CRLF từ Git trên Windows).
- **Kết quả kiểm tra mới nhất sau Bước 3:** `npm test` PASS (30 tests, 0 fail); `npm run build:client` PASS; `npm --prefix client run lint` PASS. Build JS 1,727.79 kB minified (469.11 kB gzip), Vite vẫn cảnh báo vượt ngưỡng 500 kB.
- **Tiến độ Bước 4:** VFX/cooldown theo xác nhận server và nội suy hiển thị client đã được triển khai; kết quả lệnh của lát này được ghi bên dưới sau khi chạy kiểm tra.
- **Giới hạn/tiếp tục:** Trạm Cào đã dùng tilemap procedural; Ngoại Ô chưa thể vào game vì server hiện chỉ khai báo `chuong0_tram_cao`, chưa có map transition. Cây/đá chỉ là trang trí vì chưa có obstacle collision data. Server vẫn chạy 20Hz authoritative; client nội suy giữa các snapshot, đây không phải tăng simulation tick. Còn migrate đánh thường/AGI/world scale/tốc độ, sau đó kiểm thử trực quan trên desktop và điện thoại.

## Cài và chạy trên máy mới

### Yêu cầu

- Node.js `^20.19.0` hoặc `>=22.12.0` (theo engine yêu cầu của Vite hiện cài), kèm npm.
- MongoDB cục bộ hoặc MongoDB Atlas có thể kết nối từ máy chạy server.
- Git để lấy repository.

### Cài đặt development

1. Clone/mở repository rồi vào thư mục gốc.
2. Cài dependency của cả npm workspaces:

   ```bash
   npm install
   ```

3. Tạo `.env` từ `.env.example` (PowerShell: `Copy-Item .env.example .env`; macOS/Linux: `cp .env.example .env`). Thay placeholder bằng cấu hình thật:

   ```env
   PORT=3000
   NODE_ENV=development
   CLIENT_ORIGIN=http://localhost:5173
   MONGODB_URI=mongodb://127.0.0.1:27017/meo_da_vu_tru
   JWT_SECRET=<chuỗi-ngẫu-nhiên-riêng-tư-dài-ít-nhất-32-ký-tự>
   ```

   Có thể dùng Atlas thay MongoDB local. Thay `<username>`, `<password>`, host và database trong URI; URL-encode ký tự đặc biệt của password. Đảm bảo Network Access trên Atlas cho phép IP máy chạy server. Không commit `.env` hoặc dùng secret ví dụ ở môi trường thật.

4. Khởi chạy cả server và client:

   ```bash
   npm run dev
   ```

5. Mở `http://localhost:5173`; API chạy tại `http://localhost:3000`, health check là `GET /health`. Có thể chạy riêng `npm run dev:server` hoặc `npm run dev:client`.

### Chơi thử trên điện thoại cùng Wi-Fi

Vite được cấu hình lắng nghe trên mạng LAN (`0.0.0.0`). Trong development, API và Socket.IO chấp nhận origin localhost hoặc IP IPv4 private dùng cổng `5173`; production vẫn chỉ chấp nhận `CLIENT_ORIGIN` đã cấu hình.

1. Tìm IPv4 của máy chạy game (`ipconfig` trên Windows).
2. Chạy `npm run dev:server` và `npm --prefix client run dev -- --host 0.0.0.0 --port 5173 --strictPort` trong hai terminal.
3. Cho phép Node.js qua Windows Firewall trên mạng Private nếu Windows hỏi.
4. Mở `http://<IP-máy-tính>:5173` trên điện thoại đang cùng Wi-Fi. Backend mặc định ở cổng `3000`; kiểm tra bằng `http://<IP-máy-tính>:3000/health`.

Đây là chế độ dev trong mạng nội bộ; dịch vụ dừng khi tắt terminal hoặc máy tính. Wi-Fi guest/client isolation có thể chặn thiết bị truy cập lẫn nhau.

Server dừng trước khi nhận kết nối nếu `MONGODB_URI`/`JWT_SECRET` thiếu hoặc kết nối DB lỗi. `MONGODB_DNS_SERVERS` là biến tùy chọn nếu cần chỉ định DNS resolver để truy cập Atlas.

### Kiểm tra production env

- Server: đặt `NODE_ENV=production`, `MONGODB_URI` trỏ tới DB production, `JWT_SECRET` riêng tư dài ít nhất 32 ký tự, `CLIENT_ORIGIN` là origin cụ thể của client (ví dụ `https://game.example.com`), và `PORT` theo nhà cung cấp nếu cần. `CLIENT_ORIGIN` bắt buộc ở production; không để `*`.
- Client: đặt `VITE_SERVER_URL` trước khi build nếu API không ở cùng hostname theo mặc định; biến Vite được đóng gói vào client nên không chứa secret.
- Tạo bản client bằng `npm run build:client`; lệnh tạo `client/dist`. Repository hiện chưa cung cấp cấu hình deploy production.

```bash
npm install
npm run dev
```

Client: `http://localhost:5173`; API: `http://localhost:3000`; kiểm tra server: `GET /health`. Có thể chạy riêng `npm run dev:client` hoặc `npm run dev:server`.

## Điều khiển

- **WASD / phím mũi tên:** di chuyển.
- **Phím 1–5:** dùng skill tương ứng; Space vẫn là phím tắt cho skill 1 và Q cho skill 3.
- **Nút ĐÁNH:** đánh thường, không tiêu hao MP.
- **Enter:** nhặt xu gần nhân vật.
- **F:** bật/tắt Auto Farm.
- **E:** tương tác NPC khi đủ điều kiện.
- **Điện thoại:** D-pad cảm ứng để di chuyển; nút ĐÁNH, năm nút skill, nhặt đồ và Auto Farm trên màn hình.

Các hiệu ứng, MP và cooldown của skill do server xác nhận. Cấu hình prototype của skill 2/4/5 nằm trong `server/src/config/gameConfig.json` và cần cân bằng tiếp.

## Lệnh kiểm tra

```bash
npm test
npm run build:client
npm --prefix client run lint
```

Kết quả mới nhất sau Bước 0 sẽ được ghi trong phần trạng thái ở đầu README. Cấu hình game nằm ở `server/src/config/gameConfig.json`; validator ở `server/src/config/validateGameConfig.js`.
