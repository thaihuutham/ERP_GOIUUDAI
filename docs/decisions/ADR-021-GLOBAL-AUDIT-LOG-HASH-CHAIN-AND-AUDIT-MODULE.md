# ADR-021: Global Audit Log (Append-Only + Hash Chain + Audit Module)

## Status
Accepted

## Context
- ERP cần một audit log tập trung cho toàn hệ thống để truy vết theo chuẩn vận hành doanh nghiệp.
- Các yêu cầu bắt buộc:
  - Ghi nhận toàn bộ thao tác ghi dữ liệu (write mutations + business transitions).
  - Ghi nhận các thao tác đọc nhạy cảm theo whitelist endpoint.
  - Tra cứu nhanh theo object/action/actor/module/request/time.
  - Đảm bảo toàn vẹn dữ liệu audit theo mô hình append-only và hash chain.
  - Retention mặc định dài hạn (7 năm) cho mục tiêu governance/compliance nội bộ.

## Decision
- Bổ sung data model audit tập trung ở backend:
  - `audit_logs` lưu event audit chuẩn hóa gồm actor/request/http context, before/after, changedFields, metadata, `prevHash` và `hash`.
  - `audit_chain_state` giữ trạng thái chain theo tenant (`lastHash`, `lastLogId`, `lastEventAt`) để hỗ trợ ghi hash chain nhất quán.
- Áp chính sách append-only ở DB cho `audit_logs`:
  - Trigger chặn `UPDATE`.
  - Trigger chặn `DELETE`, chỉ cho phép khi job bảo trì bật cờ session-local `app.audit_prune = 'on'`.
- Chuẩn hóa capture pipeline:
  - Global `AuditContextInterceptor` tạo request audit context (tenant/module/request metadata).
  - Prisma query extension capture tự động cho write operations (`create/update/delete/upsert/*Many`) và tự tính `changedFields`.
  - Decorator `@AuditAction` cho semantic actions (approve/reject/issue/pay/void/delegate/escalate...).
  - Decorator `@AuditRead` cho whitelist endpoint đọc nhạy cảm.
  - Payload audit luôn đi qua masking policy trước khi lưu.
- Mở API read-only cho Audit module:
  - `GET /api/v1/audit/logs`
  - `GET /api/v1/audit/objects/:entityType/:entityId/history`
  - `GET /api/v1/audit/actions`
  - RBAC xem audit: `MANAGER`, `ADMIN`.
- Mở module web chuyên dụng:
  - Route `/modules/audit` với filter bar, timeline table, side panel before/after/diff.
  - Hỗ trợ deep-link từ chi tiết CRM/Sales/Finance sang lịch sử object audit.
- Governance:
  - `data_governance_backup` thêm `auditRetentionYears` (default `7`).
  - Maintenance job prune audit theo retention mới, chạy qua cơ chế guard DB.

## Consequences
- ERP có kênh truy vết tập trung, giúp điều tra sự cố và kiểm soát vận hành nhanh hơn theo object/action.
- Dữ liệu audit có khả năng phát hiện tampering nhờ hash chain và append-only guard ở DB.
- Chi phí lưu trữ tăng theo retention 7 năm; cần theo dõi dung lượng và hiệu năng index định kỳ.
- Chưa triển khai external immutable archive (WORM) ở phase này; có thể bổ sung phase 2 khi yêu cầu compliance cao hơn.
