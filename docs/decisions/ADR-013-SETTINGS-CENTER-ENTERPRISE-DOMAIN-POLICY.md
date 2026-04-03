# ADR-013: Settings Center Enterprise theo Domain Policy + Audit/Snapshot

## Status
Accepted

## Superseded Note
- Phần chính sách integrations theo mô hình `secretRef-only` đã được thay thế bởi ADR-026.
- Từ ADR-026: cho phép nhập key trực tiếp trên UI (giữ `*Ref` làm fallback/backward-compat).

## Context
- Cấu hình hệ thống trước đây chủ yếu đi qua generic key-value (`system_config`, `order_settings`, `finance_period_locks`) nên khó kiểm soát thay đổi lớn theo domain.
- ERP cần một Settings Center enterprise cho vận hành nội bộ (50 nhân sự), có thể mở rộng multi-tenant sau này nhưng vẫn giữ tương thích API hiện hữu trong giai đoạn chuyển tiếp.
- Yêu cầu bảo mật bắt buộc: secret không lưu plaintext trong DB, chỉ dùng env/secret store.

## Decision
- Giới thiệu `SettingsPolicyService` làm lớp policy trung tâm cho settings theo domain, key chuẩn hóa:
  - `settings.<domain>.v1`
- Áp dụng 12 domain cấu hình chính thức:
  - `org_profile`, `locale_calendar`, `access_security`, `approval_matrix`, `finance_controls`,
  - `sales_crm_policies`, `catalog_scm_policies`, `hr_policies`, `integrations`,
  - `notifications_templates`, `search_performance`, `data_governance_backup`.
- Bổ sung Settings Center API:
  - `GET /settings/center`
  - `GET|PUT /settings/domains/:domain`
  - `POST /settings/domains/:domain/validate`
  - `POST /settings/domains/:domain/test-connection`
  - `GET /settings/audit`
  - `POST /settings/snapshots`, `GET /settings/snapshots`, `POST /settings/snapshots/:id/restore`
- Bổ sung enterprise controls:
  - audit trail bắt buộc (actor, requestId, changedPaths, before/after hash, reason, timestamp)
  - snapshot/restore theo domain
  - `dryRun` + `validate` trước commit
- Secret strategy:
  - DB chỉ lưu `secretRef` theo allowlist (`BHTOT_API_KEY`, `AI_OPENAI_COMPAT_API_KEY`, `ZALO_OA_ACCESS_TOKEN`, `MEILI_MASTER_KEY`)
  - secret thô nếu gửi lên sẽ bị sanitize (không persist)
  - test-connection resolve secret runtime từ env/secret store
- Backward compatibility theo migration bridge:
  - giữ endpoint cũ `/settings/config`, `/settings/search/*`, `/settings/bhtot/*`
  - dual-read/dual-write với key cũ `system_config`, `order_settings`, `finance_period_locks` trong migration window.
- UI:
  - `/modules/settings` chuyển sang `SettingsCenter` chuyên biệt theo domain, có checklist vận hành, diff preview, validate/test connection, snapshot/restore và audit timeline.

## Consequences
- Tăng độ an toàn thay đổi cấu hình và khả năng truy vết/audit cho production.
- Giảm rủi ro lộ secret do loại bỏ lưu plaintext khỏi DB/API response.
- Tăng chi phí vận hành ngắn hạn do duy trì bridge tương thích key cũ trong giai đoạn chuyển đổi.
- Tạo nền tảng rõ ràng để deprecate dần endpoint raw key-value (`POST /settings`) ở phase sau.
