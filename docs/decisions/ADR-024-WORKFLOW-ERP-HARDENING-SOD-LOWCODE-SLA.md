# ADR-024: Workflow ERP Hardening (SoD Mặc Định + Low-Code Ops Board + SLA Auto-Escalation)

## Status
Accepted

## Context
- Module Quy Trình đã có nền tảng workflow graph và các action approve/reject/delegate/escalate, nhưng còn thiếu các điều kiện bắt buộc để vận hành ERP ổn định liên phòng ban.
- Các khoảng thiếu chính:
  - Có rủi ro duyệt sai người do tin `actorId` từ body và logic chọn pending approval chưa đủ chặt.
  - Chưa áp SoD mặc định để chặn người tạo tự duyệt.
  - Chưa có runtime automation chuẩn SLA theo lịch nền.
  - UI workflow còn thiên generic workbench, chưa có UX nghiệp vụ rõ cho vận hành.
  - Tích hợp liên module (đặc biệt Sales approval) chưa thống nhất qua workflow engine.

## Decision
- Chuẩn hóa bảo mật và phân quyền duyệt ở workflow engine:
  - Dùng actor từ auth context làm nguồn chính; `actorId` trong body chỉ còn backward-compat/deprecated path.
  - Loại bỏ fallback duyệt “bất kỳ pending approval” khi không đúng assignee.
  - Bật SoD mặc định: requester không được tự approve task của chính mình.
  - Chuẩn hóa assignment sang assignee cụ thể (user) tại thời điểm tạo task; không duy trì role token mơ hồ trong bước quyết định.
- Chuẩn hóa chính sách duyệt theo step:
  - Hỗ trợ `approvalMode`: `ANY`, `ALL`, `MIN_N`.
  - Lưu `requiredApprovals` theo từng task để kiểm soát nhất quán khi quyết định.
- Bổ sung automation SLA/escalation:
  - Scheduler nền chạy chu kỳ 5 phút.
  - Escalation idempotent (`escalatedAt` gate + conditional update) để tránh escalte lặp.
- Chuẩn hóa low-code workflow operations UI:
  - Tách thành 4 màn hình nghiệp vụ: `Inbox`, `Requests`, `Builder`, `Monitor`.
  - Builder hỗ trợ tạo/chỉnh step transitions, validate/simulate/publish/archive.
  - Inbox hỗ trợ thao tác task-level approve/reject/delegate/reassign.
- Chuẩn hóa tích hợp liên module:
  - Sales order-edit approval ưu tiên submit vào workflow engine theo definition code chuẩn; fallback legacy chỉ dùng khi chưa có definition.
- Giữ tương thích ngược:
  - Bổ sung migration mở rộng model `Approval` nhưng không xóa logic cũ ngay.
  - Chỉ migrate dần sang model mới, không phá luồng vận hành hiện hữu.

## Consequences
- Tăng mức an toàn vận hành ERP cho quy mô nội bộ 50 nhân sự (single-company), đặc biệt ở kiểm soát duyệt và truy vết quyết định.
- Tăng độ tin cậy khi vận hành nhờ inbox chuẩn + policy duyệt rõ + SLA automation chạy nền.
- Chi phí kỹ thuật tăng ở tầng workflow (schema, scheduler, UI board), nhưng đổi lại giảm rủi ro nghiệp vụ và giảm thao tác thủ công sai chuẩn.
