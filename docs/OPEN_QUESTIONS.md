# Quyết định thiết kế đã chốt

Các lựa chọn dưới đây đã được chủ dự án xác nhận ngày 25/10/2026. MP skill và thông số đánh thường/AGI/world scale/tốc độ đã được migrate vào runtime config/server.

## 1. Chi phí MP của năm skill Mèo Báo

GDD có hai con số khác nhau cho một số skill:

| Skill | Trường “MP” | Trường “Tiêu hao” | Runtime hiện tại |
| --- | ---: | ---: | ---: |
| S1 | 0 | 2 | 2 |
| S2 | 15 | 15 | 15 |
| S3 | 30 | 35 | 35 |
| S4 | 35 | 50 | 50 |
| S5 | 70 | 100 | 100 |

**Đã chốt và áp dụng:** dùng trường “Tiêu hao” làm nguồn chính thức duy nhất: S1 2, S2 15, S3 35, S4 50, S5 100 MP. Runtime config và client HUD đã đồng bộ các giá trị này. Xóa/đổi nhãn trường “MP” trong tài liệu GDD để không còn hai nguồn số liệu.

## 2. Ý nghĩa của “0,65s”

GDD mô tả đây là chu kỳ đánh thường và AGI có thể giảm chu kỳ xuống tối thiểu 0,40s; prototype cũ từng đảo 500ms/650ms giữa đánh thường và S1. Runtime hiện đặt đánh thường cơ sở 650ms, S1 mỗi class theo config (Lv.1 500ms).

**Đã chốt và áp dụng:** 650ms là chu kỳ đánh thường cơ sở; mỗi điểm AGI giảm 2ms đến tối thiểu 400ms; cooldown skill vẫn tách riêng. AGI mặc định 0 và được lưu cùng character.

## 3. Quy đổi mét sang pixel

GDD dùng mét cho tầm đánh/nhặt; code cũ có ngưỡng 50px, 60px và 200px. Chưa có world scale chính thức.

**Đã chốt và áp dụng:** đặt `10 px = 1 m`. Pickup 6m = 60px; quái đánh 5m = 50px, tầm nhìn Chuột 20m = 200px và Nhện 22m = 220px. Auto Farm tìm mục tiêu 30m, áp sát 5.5m và leash 32m. Tầm skill được khai báo bằng mét trong `gameConfig.json` để thống nhất quy đổi.

## 4. Tốc độ di chuyển và world scale

GDD ghi tốc độ 4m/s; prototype dùng 5px mỗi tick 50ms (100px/s). Nếu dùng quy đổi 10px/m thì prototype hiện là 10m/s.

**Đã chốt và áp dụng:** tốc độ cơ sở 4m/s = 40px/s (2px mỗi tick 20Hz); mỗi điểm AGI cộng 0.1px/s. Vận tốc người chơi/quái được tính theo thời lượng tick, không giả định mỗi tick luôn đúng 50ms.

---

Các lựa chọn đã được duyệt ngày 25/10/2026 và áp dụng ở Bước 8. Còn thiếu giao diện/phân phối điểm AGI; hiện nhân vật mới mặc định 0, schema và lưu tiến trình đã hỗ trợ trường này. Skill level 1–7 đã có scaling và lưu dữ liệu, nhưng chưa chốt nguồn điểm/nút nâng cấp.

## G3: option vàng rơi 100

Option 100 (`+#% vàng rơi`) hiện tăng số vàng ở drop vàng NRO sau khi roll trúng, không thay đổi tỷ lệ chọn/rơi của reward. Đã kiểm tra lại Java source trong RAR: `RewardService` có mặt; `NPoint` gán option này vào `tlGold`, nhưng rà toàn bộ Java source không tìm thấy nơi đọc/áp dụng `tlGold`. Vì vậy chưa có bằng chứng source xác định option đổi quantity hay probability; cách port hiện tại vẫn là diễn giải theo nhãn và cần giữ mở câu hỏi.

## G3: option trang bị 8 với MiniPet

Đã port nhánh hút HP từ quái cùng map/khu trong 200 px, mỗi 5 giây, không giết quái; lượng HP hút hồi cho chủ và bị cap ở max HP. Source `updateXenHutXungQuanh()` còn nhánh hút HP/KI từ đối tượng `isMiniPet`. Runtime web chỉ có satellite/companion khác mô hình, chưa có thực thể MiniPet riêng nên chưa ánh xạ nhánh này; cần xác định loại pet tương đương trước khi port để không hút nhầm từ entity khác.

## G3: option equipment 162 chưa hoàn tất

Option 117 đã được port theo `NPoint.tlSDDep`: từng bonus được áp dụng lần lượt lên sức đánh sau nhóm `tlDame`, với phép chia số nguyên riêng cho từng option như `calPercent`. Regression test xác nhận thứ tự và sai khác làm tròn so với cộng gộp.

Option 162 được gán vào `mpHoiCute`, nhưng không tìm thấy chỗ sử dụng biến này trong source runtime hiện có; chưa thể xác nhận chu kỳ/vùng áp dụng từ code.

## G3: charm còn lại và giới hạn port theo source

Đã kiểm tra trực tiếp `Charms.java`, `SkillService.java`, `NPoint.java` và `Pet.java` trong archive:

- ID 216 (Bùa Oai Hùng): `Charms.addTimeCharms` và DAO chỉ lưu/đọc timer; không có chỗ áp dụng `tdOaiHung` trong Java gameplay. Item template mô tả boss đánh yếu đi, nhưng source hiện tại không chứng minh hành vi đó. Không tự tạo hiệu ứng suy đoán.
- ID 218 (Bùa Dẻo Dai): source bỏ qua đếm/tiêu hao thể lực khi đánh, nhưng vẫn chặn tấn công khi thể lực đã bằng 0. Nhân vật mất 1 điểm mỗi 5 lần tấn công; hồi 1 điểm mỗi 60 giây đến `maxStamina`. Đã port stamina authoritative, persist/reconnect, hồi phục, từ chối đánh khi bằng 0 và bùa 218 bỏ tiêu hao. Mặc định mới dùng 1000 theo giá trị ở dữ liệu player trong SQL archive và fixture tạo Pet; source Java không đặt default cho player mới, nên đây là giá trị khởi tạo suy ra từ dữ liệu mẫu, cần xác nhận nếu có quy tắc tạo nhân vật khác.
- ID 522 (Bùa Đệ Tử): source thực sự làm đệ tử giảm nhịp mất thể lực từ mỗi 2 lần đánh thành mỗi 5 lần, nhân đôi damage đệ tử đánh quái và cộng thêm `2 × tn` tiềm năng nền. Mô tả item nói giảm 50% sát thương nhận và tự đánh, nhưng các nhánh đó không được xác nhận bởi các điểm đọc charm trong source đã rà. Web chưa có entity đệ tử/stamina, nên chưa thể nối đầy đủ và đúng đối tượng.
- ID 2025 (Bùa Đệ Tử Mabư Thông Minh): `Pet.askPea()` gọi chủ ăn đậu khi đệ tử Mabư hỏi; source không chứng minh một scheduler độc lập tự ăn đậu. Web chưa có đệ tử Mabư hoặc luồng đậu dành cho entity đệ tử.

Các item này vẫn cần được xem là chưa port cho tới khi web có nền entity/stamina tương ứng hoặc có thêm source evidence; không phát badge như thể gameplay đã hoạt động.
