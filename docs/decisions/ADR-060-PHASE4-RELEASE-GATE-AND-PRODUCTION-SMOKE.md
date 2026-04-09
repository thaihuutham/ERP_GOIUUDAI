# ADR-060: Phase 4 release gate và production-readiness smoke

## Status
Accepted (2026-04-09)

## Context
- Sau khi Phase 3 stabilization hoàn tất, rollout production vẫn thiếu một gate thống nhất trước deploy để chặn regression cuối.
- Workflow deploy hiện có migrate + healthcheck + optional Auth/RBAC smoke, nhưng chưa có một pre-deploy gate bao trùm lint/build/test/e2e/smoke readiness theo checklist go-live.
- Team cần một baseline Phase 4 có thể chạy local và trên self-hosted runner, không thay đổi business logic ERP.

## Decision
1. Thêm script gate tổng hợp `scripts/quality/run-phase4-release-gate.sh` để chạy tuần tự:
   - infra checks (`docker` + DB port),
   - `prisma migrate status`,
   - API lint/build + targeted tests checkout callback/override,
   - Web lint/build,
   - Phase 3 stabilization gate,
   - production-readiness smoke.
2. Thêm script `scripts/deploy/smoke-production-readiness.sh` cho checklist production:
   - health API/Web,
   - auth boundary detect runtime,
   - permission boundary qua endpoint admin-only (`GET /settings`),
   - payment callback boundary với signature invalid,
   - optional callback success path khi cung cấp payload/signature/timestamp hợp lệ.
3. Wire pre-deploy release gate vào workflow `deploy-vm` với toggle:
   - `PHASE4_RELEASE_GATE_ENABLED` (default `true`).

## Consequences
### Positive
- Có điểm chặn nhất quán trước deploy production, giảm rủi ro regression “qua healthcheck nhưng fail nghiệp vụ”.
- Smoke checklist được chuẩn hóa thành script, giúp SRE/ops chạy lặp lại và audit được.
- Không thay đổi nghiệp vụ ERP runtime; chỉ tăng lớp kiểm soát release.

### Trade-offs
- Thời gian deploy tăng do chạy thêm lint/build/test/e2e/smoke trước khi deploy.
- Yêu cầu môi trường runner có đủ dependency để chạy gate (npm deps + services nền).
- Khi cần emergency bypass, phải set `PHASE4_RELEASE_GATE_ENABLED=false` có kiểm soát.

## Alternatives considered
- Chỉ dựa vào healthcheck + post-deploy smoke: không đủ mạnh để chặn regression trước deploy.
- Tách release gate sang workflow độc lập không ràng buộc deploy: dễ bị bỏ qua ở tình huống gấp.

## References
- `scripts/quality/run-phase4-release-gate.sh`
- `scripts/deploy/smoke-production-readiness.sh`
- `.github/workflows/deploy-vm.yml`
- `docs/operations/RUNBOOK.md`
- `docs/deployment/VM_AUTODEPLOY.md`
