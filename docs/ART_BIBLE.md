# Art Bible — Mèo Đa Vũ Trụ Online

Tài liệu này quy định hình ảnh gốc của dự án. Hai ảnh tham chiếu chỉ dùng để học bố cục và mức độ chi tiết; không sao chép sprite, tên riêng, biểu tượng, logo hoặc bảng thiết kế nhận diện từ game khác.

## Lưới và kích thước

- Kích thước tile chuẩn: **32 × 32 px** ở độ phân giải gốc. Đồ vật lớn ghép từ tile hoặc dùng frame riêng theo bội số 16 px.
- Nhân vật thường: hitbox gameplay giữ nguyên theo server; sprite hướng tới khung **48 × 48 px**, chân đặt ở tâm đáy frame. Quái nhỏ 32 × 32 px, quái lớn 48–64 px. Kích thước hình không được dùng để đổi luật va chạm.
- Atlas dùng lưới pixel nguyên, không làm mờ nội suy; scale chỉ bằng bội số nguyên khi có thể. Tất cả frame có khoảng đệm trong suốt ít nhất 1 px để tránh lem viền.
- Gốc tọa độ map ở góc trên trái; y tăng xuống dưới. Tile nền có thể lặp; vật thể trang trí neo tại tâm đáy để sắp lớp theo tọa độ chân.

## Ngôn ngữ hình ảnh

- Chủ đề: chibi vui nhộn, ấm áp, ma mị nhẹ và thân thiện; hình khối rõ ở kích thước nhỏ.
- Viền ngoài dùng nâu than/xanh đen `#202a24`, thường dày 2 px ở nhân vật 48 px; chi tiết trong dùng 1 px. Viền không dùng đen tuyệt đối.
- Mỗi vật thể dùng 2–3 tông: màu bóng, màu chính, vùng sáng. Nguồn sáng quy ước từ **trên trái**; bóng đổ lệch xuống phải.
- Bảng nền: cỏ `#4f9b55`, cỏ tối `#347342`, cỏ sáng `#78bd65`; đất `#b98255`, bóng đất `#82543d`; đá `#687478`, sáng đá `#a3afb0`; nước `#3b9bb0`, sáng nước `#74d1c5`.
- Màu nhận diện: Mèo Báo xanh ngọc `#2dd4bf`; Cử Tạ cam `#fb923c`; Meowrie hồng `#f472b6`; Vũ Trụ tím `#a78bfa`. Hiệu ứng chiến đấu dùng vàng/trắng, không dựa riêng vào màu đỏ/xanh để truyền đạt trạng thái.
- Tên và số trong game cần viền tối tương phản. Không gắn nhãn dài lên sprite; tên hiển thị trong UI tách riêng.

## Animation

- Tên clip chuẩn: `idle`, `walk`, `attack`, `hit`, `die`; quái dùng `idle`, `walk`, `attack`, `die`.
- Tên frame chuẩn: `<entity>_<clip>_<direction>_<index>`; ví dụ `meo_bao_walk_down_00`. Hướng: `down`, `up`, `side`; `side` lật ngang bằng code khi đi sang trái.
- Tốc độ mặc định: idle 5 FPS, walk 8 FPS, attack 10 FPS, hit 12 FPS, die 8 FPS. Clip một frame vẫn giữ hậu tố `_00`.
- Mỗi frame trong một clip giữ cùng canvas/kích thước và cùng vị trí chân. Hiệu ứng nháy/hit không được làm đổi hitbox.

## Quy ước asset và atlas

- Thư mục: `client/public/assets/<category>/<id-kebab-case>/`; map dùng `maps/<map-id>/`.
- File source dùng chữ thường ASCII, dấu gạch nối, không dấu tiếng Việt. Atlas map đặt `atlas.png` + `atlas.json`; metadata JSON theo JSON Hash của Phaser.
- Tên frame dùng chữ thường `snake_case`; tên texture runtime có prefix theo map, ví dụ `map.chuong_0_tram_cao`.
- Manifest trong `client/src/game/config/assetManifest.js` là nơi duy nhất scene tra đường dẫn asset. Asset chỉ được preload cho map đang vào, không tải mọi map cùng lúc.
- Atlas thiếu/hỏng phải ghi cảnh báo và cho scene tiếp tục bằng đồ họa procedural/placeholders. Không để lỗi tải asset chặn đăng nhập hoặc kết nối game.
- Atlas entity dùng chung đặt tại `client/public/assets/entities/`; atlas map đặt riêng theo `maps/<map-id>/`. Tên entity frame phải khớp ID ổn định trong script/manifest, không khớp tên hiển thị trên UI.
- Placeholder sinh bằng code chỉ phục vụ prototype và kiểm tra pipeline. Chúng **chưa phải art cuối**, không đại diện chất lượng sprite phát hành.

## Nguồn gốc và ghi công

Ảnh gốc của game được vẽ bằng code tại `client/scripts/generateMapAtlas.js`; không dùng ảnh tham chiếu làm source, không dùng asset bên thứ ba. Khi thêm asset của họa sĩ hoặc nguồn ngoài, cập nhật `docs/ASSET_CREDITS.md` trước khi đưa vào manifest.
