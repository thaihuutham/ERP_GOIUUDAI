# ADR-007: Deploy Env Rollout via GitHub Actions -> VM Runtime Env File

## Status
Accepted

## Context
Các biến mới cho CRM omnichannel + AI QC (`AI_OPENAI_COMPAT_*`, `ZALO_OA_*`) cần được rollout nhất quán qua pipeline deploy tự động.
Trước đây `docker-compose.yml` đang hardcode một phần env nên khó quản trị secrets và khó mở rộng biến mới.

## Decision
- Chuẩn hóa workflow `deploy-vm` để truyền env từ GitHub Secrets/Variables vào bước deploy.
- `scripts/deploy/deploy-from-runner.sh` tạo file runtime env (`.deploy.env`) trên VM với quyền hạn chế (`chmod 600`).
- `docker compose` chạy với `--env-file` để inject env runtime thay vì hardcode trong compose.
- Mở rộng danh sách env deploy cho:
  - `AI_OPENAI_COMPAT_BASE_URL`, `AI_OPENAI_COMPAT_API_KEY`, `AI_OPENAI_COMPAT_MODEL`, `AI_OPENAI_COMPAT_TIMEOUT_MS`
  - `ZALO_OA_WEBHOOK_SECRET`
  - `ZALO_OA_OUTBOUND_URL`, `ZALO_OA_ACCESS_TOKEN`, `ZALO_OA_API_BASE_URL`, `ZALO_OA_OUTBOUND_TIMEOUT_MS`

## Consequences
- Secrets và cấu hình runtime tách rõ khỏi source code, giảm rủi ro lộ key.
- Việc thêm/bớt env cho các phase sau không cần sửa business logic.
- Cần duy trì đồng bộ GitHub Secrets/Variables với checklist vận hành trong tài liệu deploy/runbook.
