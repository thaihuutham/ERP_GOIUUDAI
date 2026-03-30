# CONVENTIONS

## 1. Git
- Branch prefix: `feat/`, `fix/`, `docs/`, `refactor/`, `ops/`.
- Commit style: Conventional Commit (`feat:`, `fix:`, `docs:`...).
- Không commit secrets.

## 2. Coding
- Ưu tiên tách hàm/component nhỏ, tránh file > 400 LOC khi có thể.
- Mọi logic truy cập Firestore phải có xử lý lỗi qua `handleFirestoreError`.
- Không hardcode role/status khi đã có enum/constant.
- Với NestJS controller, ưu tiên khai báo DI tường minh: `@Inject(Service)` trong constructor.

## 3. Documentation
- Quyết định kỹ thuật phải có ADR trong `docs/decisions/`.
- Handoff session bắt buộc cập nhật trong `.agent/` và `planning/CURRENT_TASK.md`.

## 4. Deploy
- Chỉ deploy qua GitHub Actions workflow.
- VM production không deploy thủ công bằng SSH nếu không có sự cố.
