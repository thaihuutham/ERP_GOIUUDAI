# Sổ tay Module Quy trình (dành cho người không chuyên IT)

## 1) Module Quy trình dùng để làm gì?

Module Quy trình giúp doanh nghiệp:
- Gửi yêu cầu cần duyệt (ví dụ: sửa đơn hàng, duyệt nghỉ phép, duyệt chi phí).
- Giao đúng người có trách nhiệm duyệt.
- Theo dõi tiến độ từng yêu cầu từ lúc tạo đến lúc hoàn tất.
- Tránh sai sót nội bộ nhờ quy tắc kiểm soát quyền duyệt (SoD).

Nói ngắn gọn: đây là nơi quản lý “ai gửi”, “ai duyệt”, “đang ở bước nào”, “vì sao bị lỗi”.

## 2) Bốn tab chính trong màn hình Quy trình

### Tab `Inbox` (Hộp duyệt của tôi)
Dùng khi bạn là người cần xử lý yêu cầu.

Các việc thường làm:
1. Mở dòng yêu cầu cần xử lý.
2. Chọn hành động:
   - `Approve` (Đồng ý)
   - `Reject` (Từ chối)
   - `Delegate` (Ủy quyền tạm thời)
   - `Reassign` (Chuyển hẳn cho người khác)
3. Ghi chú lý do (khuyến nghị luôn nhập).
4. Bấm `Xác nhận`.

Lưu ý:
- Nếu hệ thống báo lỗi màu đỏ, hãy đọc nội dung lỗi vì thường đã chỉ rõ nguyên nhân (thiếu người nhận, policy chặn, quá hạn delegate...).

### Tab `Requests` (Yêu cầu tôi đã gửi)
Dùng để xem các yêu cầu bạn đã tạo.

Bạn sẽ thấy:
- Trạng thái hiện tại (đang chờ, đã duyệt, bị từ chối...).
- Bước đang xử lý.
- Thời điểm tạo.

Nên dùng tab này để kiểm tra “hồ sơ của mình đang nằm ở đâu”.

### Tab `Builder` (Thiết kế quy trình)
Dành cho người phụ trách vận hành/quản trị quy trình.

Thao tác chuẩn:
1. Chọn quy trình cần chỉnh.
2. `Validate` để kiểm tra cấu hình có hợp lệ không.
3. `Simulate` để thử chạy mô phỏng trước khi áp dụng thật.
4. `Publish` để kích hoạt dùng thật.
5. `Archive` khi muốn ngưng dùng định nghĩa cũ.

Quy tắc an toàn:
- Không `Publish` nếu chưa `Validate` và `Simulate` thành công.
- Không xóa lịch sử cũ, chỉ `Archive` để lưu dấu vết.

### Tab `Monitor` (Giám sát)
Dùng để theo dõi toàn bộ phiên chạy quy trình.

Bạn sẽ thấy:
- Danh sách phiên đang chạy/đã xong.
- Timeline hành động (ai làm gì, lúc nào).
- Ghi chú thao tác (nếu người duyệt đã nhập).

Tab này hữu ích khi cần truy vết nguyên nhân chậm hoặc tranh chấp nội bộ.

## 3) Quy tắc SoD (Segregation of Duties) dễ hiểu

SoD nghĩa là tách quyền để tránh tự kiểm duyệt.

Các nguyên tắc đang áp dụng:
- Người tạo yêu cầu không được tự duyệt chính yêu cầu đó.
- Duyệt phải đúng người được giao.
- Mọi hành động duyệt/chuyển đều lưu vết.

Lợi ích:
- Giảm rủi ro gian lận nội bộ.
- Dễ kiểm tra khi có kiểm toán.

## 4) Khi nào dùng `Delegate` và `Reassign`?

- `Delegate` (Ủy quyền):
  - Dùng khi bạn vẫn là người chịu trách nhiệm chính nhưng cần người khác xử lý giúp tạm thời.
  - Thường có policy giới hạn (ví dụ số ngày ủy quyền).

- `Reassign` (Chuyển hẳn):
  - Dùng khi cần đổi người phụ trách chính cho task hiện tại.
  - Bắt buộc chỉ định rõ người nhận mới.

## 5) Checklist vận hành hằng ngày

1. Mở `Inbox` và xử lý các task quá hạn trước.
2. Luôn điền ghi chú khi `Reject`, `Delegate`, `Reassign`.
3. Kiểm tra `Requests` để theo dõi yêu cầu quan trọng.
4. Với thay đổi quy trình ở `Builder`, luôn làm đủ chuỗi:
   - `Validate` -> `Simulate` -> `Publish`.
5. Dùng `Monitor` để rà các phiên bị treo/chậm.
6. Nếu có lỗi policy lặp lại nhiều lần, báo quản trị viên Settings để điều chỉnh cấu hình thay vì xử lý thủ công.

## 6) FAQ lỗi thường gặp (Validation + Policy)

### Câu 1: Tôi bấm `Reassign` nhưng báo thiếu người nhận
Nguyên nhân: chưa nhập `Người nhận mới`.

Cách xử lý:
1. Chọn lại task.
2. Chọn action `Reassign`.
3. Nhập đúng mã/người nhận mới.
4. Bấm `Xác nhận` lại.

### Câu 2: Hệ thống báo “Tính năng delegation đang tắt theo policy”
Nguyên nhân: đơn vị đang tắt quyền `Delegate` trong cấu hình policy.

Cách xử lý:
- Nếu cần chuyển việc ngay: dùng `Reassign` (nếu policy cho phép).
- Nếu bắt buộc phải `Delegate`: liên hệ quản trị viên mở policy delegation trong Settings.

### Câu 3: Tôi là người tạo yêu cầu nhưng không duyệt được
Nguyên nhân: SoD đang chặn tự duyệt.

Cách xử lý:
- Nhờ đúng cấp duyệt khác thực hiện.
- Không cố lách bằng đổi ghi chú hoặc đổi action.

### Câu 4: Bấm xác nhận xong nhưng vẫn thấy task trong Inbox
Nguyên nhân có thể:
- Mạng chậm hoặc trang chưa refresh.
- Thao tác bị policy chặn (có banner lỗi nhưng bị bỏ qua).

Cách xử lý:
1. Kiểm tra banner thông báo.
2. Tải lại trang.
3. Nếu vẫn lặp lại, chụp màn hình lỗi và gửi quản trị viên.

### Câu 5: `Validate` thành công nhưng `Publish` lỗi
Nguyên nhân thường gặp:
- Dữ liệu quy trình vừa bị người khác chỉnh song song.
- Trạng thái định nghĩa không còn phù hợp để publish.

Cách xử lý:
1. Mở lại định nghĩa mới nhất.
2. Chạy lại `Validate` và `Simulate`.
3. Publish lại.

### Câu 6: `Simulate` báo không đi được đến kết quả cuối
Nguyên nhân: thiếu nhánh chuyển bước hoặc điều kiện không đủ dữ liệu.

Cách xử lý:
- Kiểm tra các `transitions` trong từng bước.
- Kiểm tra dữ liệu đầu vào mô phỏng (ví dụ `amount`).

### Câu 7: Khi nào cần báo quản trị hệ thống?
Báo ngay khi:
- Lỗi policy lặp lại với nhiều người dùng.
- Không thể xử lý task dù đã nhập đúng thông tin.
- Timeline trong `Monitor` có dấu hiệu bất thường (nhảy bước, thiếu log).

## 7) Mẫu quy trình thao tác nhanh cho nhân sự nghiệp vụ

- Bước 1: Vào `Inbox`, mở task.
- Bước 2: Đọc nội dung và quyết định action.
- Bước 3: Nhập ghi chú ngắn gọn, rõ lý do.
- Bước 4: Bấm `Xác nhận`.
- Bước 5: Nếu lỗi, đọc banner và xử lý theo FAQ mục 6.
- Bước 6: Qua `Monitor` để xác minh timeline đã cập nhật.

## 8) Ghi nhớ quan trọng

- Luôn ưu tiên đúng quy trình hơn xử lý nhanh.
- Không chia sẻ tài khoản duyệt cho người khác.
- Mọi thao tác đều có dấu vết, vì vậy hãy ghi chú rõ ràng và trung thực.

