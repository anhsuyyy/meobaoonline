# Quyết định thiết kế đã chốt

Các lựa chọn dưới đây đã được chủ dự án xác nhận ngày 25/10/2026. Giá trị đang có trong `server/src/config/gameConfig.json` vẫn là cấu hình prototype cho đến khi được migrate trong lát gameplay tương ứng; không xem cấu hình cũ là luật GDD cuối cùng.

## 1. Chi phí MP của năm skill Mèo Báo

GDD có hai con số khác nhau cho một số skill:

| Skill | Trường “MP” | Trường “Tiêu hao” | Prototype hiện tại |
| --- | ---: | ---: | ---: |
| S1 | 0 | 2 | 2 |
| S2 | 15 | 15 | 15 |
| S3 | 30 | 35 | 30 |
| S4 | 35 | 50 | 50 |
| S5 | 70 | 100 | 40 |

**Đã chốt:** dùng trường “Tiêu hao” làm nguồn chính thức duy nhất: S1 2, S2 15, S3 35, S4 50, S5 100 MP. Xóa/đổi nhãn trường “MP” trong tài liệu để không còn hai nguồn số liệu. Runtime config vẫn cần cập nhật S3 từ 30 lên 35 và S5 từ 40 lên 100.

## 2. Ý nghĩa của “0,65s”

GDD mô tả đây là chu kỳ đánh thường và AGI có thể giảm chu kỳ xuống tối thiểu 0,40s; README cũ từng để ý nghĩa chưa rõ. Prototype hiện có `basicAttack.cooldownMs = 500` và S1 `cooldownMs = 650`.

**Đã chốt:** 650ms là chu kỳ đánh thường cơ sở; AGI giảm chu kỳ đến tối thiểu 400ms; tách riêng cooldown của các skill. Runtime config vẫn cần đổi basicAttack từ 500ms lên 650ms và triển khai công thức AGI.

## 3. Quy đổi mét sang pixel

GDD dùng mét cho tầm đánh/nhặt; code cũ có ngưỡng 50px, 60px và 200px. Chưa có world scale chính thức.

**Đã chốt:** đặt `10 px = 1 m`. Khi đó 5m = 50px, 6m = 60px, và ngưỡng nhìn 200px = 20m. Khai báo hằng số quy đổi trong config và dùng thống nhất cho skill, quái, nhặt đồ và Auto Farm.

## 4. Tốc độ di chuyển và world scale

GDD ghi tốc độ 4m/s; prototype dùng 5px mỗi tick 50ms (100px/s). Nếu dùng quy đổi 10px/m thì prototype hiện là 10m/s.

**Đã chốt:** tốc độ cơ sở 4m/s, tương đương 40px/s (2px mỗi tick 20Hz); đưa AGI vào công thức movement riêng khi triển khai.

---

Các lựa chọn đã được duyệt ngày 25/10/2026. Chưa áp dụng vào runtime config; sẽ cập nhật đồng bộ config, client UI và server trong lát combat/movement kế tiếp, kèm test hồi quy.
