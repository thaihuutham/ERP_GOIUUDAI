# PERSONAL PREFERENCES

File này chứa các cài đặt riêng (project-level personal conventions) do user quyết định.
Mọi AI agent bắt buộc đọc file này trước khi phân tích/thiết kế/implement.

## 1. Quy tắc ưu tiên
- Khi có xung đột giữa wording mặc định và quy ước tại đây, ưu tiên file này.
- Nếu user đưa yêu cầu mới trong chat, yêu cầu mới nhất của user có ưu tiên cao nhất.
- Nếu cài đặt tại đây ảnh hưởng behavior nghiệp vụ, phải xác nhận lại với user trước khi sửa logic.

## 2. Cài đặt riêng hiện tại

### 2.1 Thuật ngữ thao tác xóa
- Không dùng `Lưu trữ/Lưu Trữ` để diễn đạt hành động delete/archive trong UI, message, label, test.
- Dùng thống nhất từ `Xóa` (hoặc `xóa` theo ngữ cảnh câu).

### 2.2 Chuẩn nhập ngày/giờ trên form
- Trường ngày (`date`) dùng chuẩn nhập strict: `YYYY-MM-DD`.
- Trường ngày giờ (`datetime-local`) dùng chuẩn nhập strict: `YYYY-MM-DDTHH:mm`.
- Không chấp nhận chuỗi ngày/giờ mơ hồ hoặc không đúng định dạng chuẩn ở tầng submit.

## 3. Cách mở rộng file này
- Mỗi cài đặt mới phải ghi rõ:
  - mục tiêu,
  - phạm vi áp dụng (UI/API/test/docs),
  - ví dụ đúng/sai nếu cần.
- Không thêm cài đặt mơ hồ kiểu “xử lý linh hoạt”; phải có rule kiểm chứng được.
