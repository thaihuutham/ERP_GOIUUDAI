# ADR-028: Global Bulk Interaction Contract (Main Tables v1)

## Status
Accepted

## Context
- Các module ERP đang có nhiều bảng chính với thao tác giống nhau nhưng UX và cách xử lý lỗi trước đây chưa đồng nhất.
- Phạm vi hiện tại ưu tiên mô hình nội bộ ~50 người dùng, thao tác nhanh trên tập dữ liệu đã lọc/tải.
- Backend chưa có endpoint `/bulk`; nhiều module chỉ có endpoint mutate theo từng bản ghi.

## Decision
- Chuẩn hóa hợp đồng bulk dùng chung cho frontend:
  - `StandardDataTable` hỗ trợ chọn nhiều dòng theo cơ chế controlled, gồm checkbox từng dòng và checkbox “chọn tất cả dữ liệu đang tải”.
  - Bulk bar dùng chung: hiển thị số lượng đã chọn, cho phép `clear selection`, và utilities read-only (`Copy IDs`, `Export CSV`) khi bật.
  - Bulk result banner chuẩn: `thành công X/Y, lỗi Z`, kèm `Retry failed` và `Copy failed IDs`.
- Chuẩn hóa thực thi bulk:
  - Dùng `runBulkOperation` cho toàn bộ flow bulk mutate/read-only có lặp.
  - Chính sách mặc định `continueOnError=true`, không short-circuit khi có lỗi giữa chừng.
  - Kết quả trả về thống nhất `successCount`, `failedCount`, `failedIds`, `failures`.
  - Dòng lỗi được giữ lại selection để retry nhanh.
- Chuẩn hóa phá hủy dữ liệu:
  - Action destructive (`archive/delete/reject/deactivate`) bắt buộc confirm 1 lần ở cấp bulk action.
- Scope v1:
  - Chỉ áp dụng cho **bảng chính** của module.
  - `Select all` chỉ tác động lên tập dữ liệu đang tải theo filter hiện tại.
  - Không thay đổi backend API, không thêm migration DB.

## Consequences
- Hành vi bulk nhất quán giữa module, giảm sai lệch thao tác cho vận hành hàng ngày.
- Giữ an toàn rollout vì tái sử dụng endpoint hiện có, không phát sinh contract backend mới.
- Hiệu năng thao tác lớn phụ thuộc nhiều request đơn lẻ; nếu cần tối ưu ở v2, sẽ cần ADR riêng cho backend bulk endpoint + idempotency policy.
