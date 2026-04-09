# Phase 2 UAT GitHub Variables/Secrets Template

Tài liệu này chốt bộ biến khuyến nghị để rollout `AUTH + RBAC` theo safe-baseline và tự chạy post-deploy smoke sau mỗi lần `deploy-vm`.

## 1) GitHub Variables (UAT)

| Variable | Suggested Value | Ghi chú |
| --- | --- | --- |
| `AUTH_ENABLED` | `true` | Bật auth guard ở API. |
| `NEXT_PUBLIC_AUTH_ENABLED` | `true` | Bật login gate ở web. |
| `PERMISSION_ENGINE_ENABLED` | `true` | Bật Permission Guard runtime. |
| `IAM_V2_ENABLED` | *(để trống / không set)* | Khuyến nghị để runtime lấy từ `settings.access_security.iamV2.enabled` (dễ rollback theo settings). |
| `POST_DEPLOY_AUTH_RBAC_SMOKE_ENABLED` | `true` | Tự chạy `smoke-auth-rbac-modules.sh` sau healthcheck. |
| `POST_DEPLOY_AUTH_RBAC_SMOKE_MODULES` | `sales,finance,crm,hr,scm,assets,projects,reports` | Danh sách module đang enforce đầy đủ khi Phase 2 đã hoàn tất rollout. |
| `DEFAULT_TENANT_ID` | `GOIUUDAI` | Giữ theo runtime single-tenant hiện tại. |
| `TENANCY_MODE` | `single` | Theo baseline hiện tại. |

## 2) GitHub Secrets tối thiểu cho Phase 2 UAT

| Secret | Required | Ghi chú |
| --- | --- | --- |
| `JWT_SECRET` | Yes | Bắt buộc khi `AUTH_ENABLED=true`. |
| `SETTINGS_ENCRYPTION_MASTER_KEY` | Yes | Bảo vệ secret nhập từ Settings Center. |
| `MINIO_ROOT_PASSWORD` | Yes | Runtime object storage + backup/audit archive. |
| `AUDIT_ARCHIVE_S3_SECRET_KEY` | Yes | Nếu tách riêng với `MINIO_ROOT_PASSWORD`. |

## 3) Cập nhật biến theo tiến độ rollout module

- Khi rollout staged chưa hoàn tất, cập nhật `POST_DEPLOY_AUTH_RBAC_SMOKE_MODULES` theo mức hiện tại:
  - `sales,finance,crm`
    - `sales,finance,crm,hr`
    - `sales,finance,crm,hr,scm`
    - `sales,finance,crm,hr,scm,assets`
    - `sales,finance,crm,hr,scm,assets,projects`
    - `sales,finance,crm,hr,scm,assets,projects,reports`

## 4) Safety note

- Không set cứng `IAM_V2_ENABLED=true` ở UAT trừ khi cần override khẩn cấp.
- Để env này trống giúp rollback linh hoạt theo settings:
  - `mode: ENFORCE -> SHADOW -> OFF`,
  - hoặc gỡ module khỏi `enforcementModules`.
