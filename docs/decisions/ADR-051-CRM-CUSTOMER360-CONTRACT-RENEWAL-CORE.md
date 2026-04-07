# ADR-051: CRM Customer360 contract-renewal core cho đa sản phẩm

- Status: Accepted
- Date: 2026-04-07

## Context
- Customer360 hiện chủ yếu tập trung hồ sơ khách, chưa có lõi hợp đồng dịch vụ đủ mạnh để:
  - lưu lịch sử mua hàng đa sản phẩm xuyên kênh;
  - theo dõi kỳ hạn/gia hạn viễn thông, bảo hiểm ô tô, bảo hiểm xe máy, dịch vụ số;
  - đồng bộ đơn hàng bảo hiểm từ hệ ngoài và OCR file/link GCN theo cơ chế duyệt tay;
  - hợp nhất định danh khách theo phone-first + social IDs (Zalo/Facebook/TikTok).
- Yêu cầu vận hành: nhân viên nội bộ cần worklist nhắc gia hạn theo lead days cấu hình, idempotent, không tạo duplicate khi scheduler chạy lại.

## Decision
- Chọn mô hình **Hybrid domain core**:
  - lõi dùng chung: `ServiceContract`, `ContractRenewalReminder`, `CustomerSocialIdentity`;
  - bảng chi tiết nghiệp vụ theo sản phẩm:
    - `TelecomServiceLine`
    - `AutoInsurancePolicyDetail`
    - `MotoInsurancePolicyDetail`
    - `DigitalServiceDetail`
  - tài sản bảo hiểm dùng chung: `Vehicle`.
- Chuẩn hóa ingest đồng bộ/OCR:
  - `ExternalOrderIngest` dedupe theo `(tenant_Id, sourceSystem, externalOrderId)`;
  - `InboundPolicyDocument` + `InboundPolicyExtraction` theo flow `extract -> review -> approve -> commit`.
- Chuẩn hóa renewal:
  - viễn thông mapping term-days cố định (`1/3/6/7/12/14/24 tháng -> 30/90/180/210/360/420/720 ngày`);
  - công thức cộng hạn `base = max(currentExpiryAt, transactionDate)`, rồi cộng `termDays`;
  - precedence lead-days: `contract override > product override > global default`.
- Bổ sung API CRM cho hợp đồng/tài sản/identity/ingestion và scheduler tạo reminder worklist idempotent theo `dedupeKey`.

## Consequences
### Positive
- Mở rộng CRM theo vòng đời hợp đồng mà không phá luồng ERP cũ.
- Hỗ trợ nhiều sản phẩm trong cùng hồ sơ khách, nhiều xe/một khách, nhiều kỳ/hợp đồng trên cùng tài sản.
- Nhân viên có worklist renewal tập trung, giảm miss gia hạn.
- Có khả năng mở rộng custom fields cho `SERVICE_CONTRACT`, `VEHICLE`, `INSURANCE_POLICY`.

### Negative
- Tăng số lượng bảng domain CRM và độ phức tạp mapping dữ liệu ingest/OCR.
- Cần giám sát scheduler và dữ liệu OCR review để tránh tồn backlog.

## Mitigation
- Giữ `Sales Order` là bản ghi giao dịch chuẩn, không thay thế luồng doanh thu hiện có.
- OCR commit chỉ diễn ra khi `APPROVED`, reject vẫn giữ hồ sơ để xử lý tay.
- Scheduler reminder dùng dedupe key theo tenant+contract+due-date để idempotent.
- Cập nhật runtime settings để admin điều chỉnh `renewalReminder` linh hoạt theo sản phẩm.
