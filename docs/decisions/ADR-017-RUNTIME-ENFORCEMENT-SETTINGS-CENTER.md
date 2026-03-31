# ADR-017: Runtime Enforcement 100% cho Settings Center Enterprise

## Status
Accepted

## Context
- Settings Center Enterprise đã có đủ domain config, validate, audit và snapshot; tuy nhiên một số policy trước đây mới dừng ở mức lưu cấu hình, chưa được business runtime tiêu thụ đầy đủ.
- Yêu cầu nghiệp vụ chốt cứng:
  - Enforce ngay lập tức, không chạy observe-only.
  - Settings Center là source-of-truth runtime.
  - ENV chỉ đóng vai trò fallback khi domain chưa cấu hình.
  - Module tắt trong settings phải bị chặn ở cả web navigation/route và API.

## Decision
- Chuẩn hóa Runtime Settings Engine dùng chung (`RuntimeSettingsService`) cho tất cả module nghiệp vụ:
  - Typed runtime getters theo từng domain.
  - Cache TTL ngắn và invalidate ngay sau `PUT /api/v1/settings/domains/:domain`.
- Áp dụng precedence thống nhất:
  - `settings domain value` > `ENV fallback`.
  - Với integrations, `secretRef` được resolve qua allowlist; chỉ fallback ENV khi domain không có giá trị hợp lệ.
- Enforce module gating toàn cục bằng `ModuleAvailabilityGuard`:
  - API module bị tắt trả `403`.
  - Ngoại lệ luôn được truy cập: `auth`, `health`, `settings`.
- Enforce runtime theo domain trên web và API:
  - `org_profile`: `enabledModules`, branding, document layout.
  - `locale_calendar`: formatter ngày/số/tiền, timezone.
  - `access_security`: session timeout/login policy/MFA policies.
  - `approval_matrix`: rule approver + escalation/delegation limits.
  - `finance_controls`: posting window/cutoff/numbering.
  - `sales_crm_policies`: discount/credit/customer taxonomy.
  - `catalog_scm_policies`: defaults receiving/warehouse/replenishment.
  - `hr_policies`: shift/leave/payroll defaults + approver chain.
  - `integrations`: BHTOT/Zalo/AI runtime settings-first.
  - `notifications_templates`: channel policy/retry/backoff/template version.
  - `search_performance`: engine/timeout/prefix/write-sync/reindex policy.
  - `data_governance_backup`: retention/archive/backup/export policy.
- Mở rộng persistence để hỗ trợ enforce:
  - migration runtime enforcement cho MFA fields, notification dispatch, numbering metadata, warehouse code.

## Consequences
- Thay đổi setting có hiệu lực runtime ngay, giảm sai lệch giữa UI config và hành vi hệ thống.
- Tăng tính an toàn vận hành do module gating, policy cutoff, retry/backoff, và security controls được thi hành thật.
- Test harness phải mock runtime dependencies rõ ràng hơn (dịch chuyển từ constructor cũ sang runtime-aware constructors).
- Trong môi trường CI/local web lint cần đảm bảo `.next/types` được tạo trước (build hoặc typegen) để tránh false negative do artifact thiếu.
