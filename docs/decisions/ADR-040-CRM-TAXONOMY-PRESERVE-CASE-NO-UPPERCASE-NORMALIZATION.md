# ADR-040 — CRM Taxonomy Preserve Case (No Uppercase Normalization)

## Status
Accepted (2026-04-04)

## Context
Hành vi hiện tại ép `customerTaxonomy.stages/sources` về UPPERCASE tại nhiều lớp (UI input, settings normalization, runtime mapping, CRM service).  
User yêu cầu bỏ chuẩn hóa UPPERCASE để giữ nguyên giá trị nhập.

## Decision
1. Bỏ ép uppercase cho CRM taxonomy values ở toàn bộ flow:
   - UI taxonomy manager,
   - settings policy/service normalization,
   - runtime settings read.
2. CRM service vẫn enforce taxonomy hợp lệ nhưng theo cơ chế:
   - so khớp case-insensitive với danh mục taxonomy cấu hình,
   - lưu canonical value đúng như taxonomy đang cấu hình (preserve case).
3. Không thay đổi behavior của CRM tag registry lowercase trong ADR này.

## Consequences
### Positive
- Giá trị taxonomy giữ đúng case người vận hành mong muốn.
- Không còn side-effect tự chuyển hoa khi add/edit taxonomy.
- Vẫn giữ được kiểm soát dữ liệu qua taxonomy guard ở backend.

### Trade-offs
- Cần duy trì canonical mapping case-insensitive ở CRM service để tránh mismatch khi input khác hoa/thường.
- Cần theo dõi dữ liệu lịch sử có case cũ khi migration/hardening phase tiếp theo.
