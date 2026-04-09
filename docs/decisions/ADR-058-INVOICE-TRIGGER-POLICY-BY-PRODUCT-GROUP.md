# ADR-058: Invoice automation trigger policy by product group

- Status: Accepted
- Date: 2026-04-08

## Context
- Nghiệp vụ phát hành/cập nhật hóa đơn khác nhau giữa nhóm sản phẩm (bảo hiểm, viễn thông, digital).
- Trigger một kiểu cho toàn bộ sản phẩm gây lệch với vận hành thực tế (nhóm cần chờ activation, nhóm chỉ cần đủ tiền).
- V1 cần cơ chế tự động hóa nhưng vẫn cho phép kế toán/admin can thiệp có kiểm soát khi webhook lỗi hoặc cần xử lý ngoại lệ.

## Decision
1. Định nghĩa policy hóa đơn theo `orderGroup` trong `sales_crm_policies.invoiceAutomation`.
2. Mỗi nhóm có cấu hình:
   - `trigger`: `ON_PAID | ON_ACTIVATED | MANUAL`
   - `requireFullPayment`: `true|false`.
3. Engine re-evaluate hóa đơn:
   - tự chạy khi event thanh toán/activation xảy ra,
   - cho phép manual rerun qua API riêng có kiểm soát (`invoice-actions/re-evaluate`).
4. Nếu đã có invoice cho order thì update trạng thái/số tiền theo policy thay vì tạo trùng.
5. Override thanh toán thủ công phải đi kèm audit (`reason`, `reference`) và được tính vào re-evaluate logic.

## Consequences
### Positive
- Linh hoạt theo đặc thù từng nhóm sản phẩm nhưng vẫn dùng chung một engine.
- Giảm thao tác tay lặp lại cho kế toán trong case chuẩn.
- Hạn chế tạo trùng invoice nhờ cơ chế update-in-place khi invoice đã tồn tại.

### Negative
- Cần vận hành cẩn thận khi đổi policy để tránh khác biệt giữa kỳ kế toán.
- Cần observability tốt để phân biệt case auto-trigger vs manual rerun.

## Alternatives considered
1. Một trigger cố định cho mọi nhóm: loại vì không đáp ứng khác biệt nghiệp vụ.
2. Đẩy toàn bộ logic invoice ra ngoài ERP: loại vì khó kiểm soát quyền, audit, và nhất quán dữ liệu nội bộ.

## Follow-up
- Bổ sung audit view chuyên biệt cho lịch sử invoice re-evaluate (source/reason/actor).
- Bổ sung cảnh báo khi policy thay đổi trong kỳ vận hành.
- Mở rộng test theo ma trận `group x trigger x payment-state x activation-state`.
