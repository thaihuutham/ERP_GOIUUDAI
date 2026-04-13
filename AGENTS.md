# AGENTS.md

File này là entrypoint bắt buộc cho mọi AI agent (Codex, Claude Code, ChatGPT, session mới).

## 1. Nguyên tắc làm việc
- Stateless tuyệt đối: không dựa vào chat history, chỉ dựa vào file trong repo.
- Không tự mở rộng scope khi không có yêu cầu.
- Không đổi hành vi chức năng ERP khi đang làm việc tái cấu trúc.
- Mọi quyết định kiến trúc mới phải ghi vào `docs/decisions/`.

### 1.1 Bắt buộc tuân thủ cài đặt riêng
- Agent phải đọc `docs/specs/PERSONAL_PREFERENCES.md` trước khi bắt đầu mọi nhiệm vụ.
- Các quy ước wording/format nhập liệu trong file cài đặt riêng phải được áp dụng nhất quán ở code, test, docs liên quan.
- Nếu phát hiện xung đột giữa cài đặt riêng và yêu cầu mới của user, ưu tiên yêu cầu mới nhất của user và cập nhật lại file cài đặt riêng sau khi chốt.

### 1.2 Bắt buộc dùng skill brainstorming khi yêu cầu chưa rõ
- Với mọi nội dung có **nhiều phương án thực hiện** hoặc **còn mơ hồ/thiếu ràng buộc**, agent **bắt buộc** dùng skill [$brainstorming](/Users/mrtao/.codex/skills/skills/brainstorming/SKILL.md) trước khi sửa code.
- Không được implement ngay khi chưa chốt rõ:
  - mục tiêu,
  - phạm vi và non-goals,
  - ràng buộc kỹ thuật/phi chức năng (performance, scale, security, reliability, maintainability).
- Trước khi thiết kế/implement, phải có bước xác nhận với user (Understanding Lock): tóm tắt hiểu biết, assumptions, câu hỏi mở.
- Chỉ được chuyển sang code khi user đã xác nhận hướng tiếp cận.

## 2. Trình tự đọc trước khi sửa code
1. `docs/specs/PERSONAL_PREFERENCES.md`
2. `planning/CURRENT_TASK.md`
3. `.agent/memory/CONTEXT_SNAPSHOT.md`
4. `docs/specs/PROJECT_OVERVIEW.md`
5. `docs/specs/CONVENTIONS.md`
6. `docs/architecture/SCALING_DESIGN.md`
7. `docs/deployment/VM_AUTODEPLOY.md`

## 3. Phạm vi ưu tiên hiện tại
- Ổn định cấu trúc dự án theo template.
- Vận hành cho mô hình công ty: 50 nhân viên nội bộ, khách lẻ không đăng nhập hệ thống.
- Chuẩn hóa pipeline deploy VM tự động qua GitHub Actions.

## 4. Tuyệt đối không làm
- Không xóa business logic cũ nếu chưa có ADR + kế hoạch migration.
- Không commit secrets thật.
- Không chỉnh Firestore rules/schema production khi chưa có kế hoạch rollout.
- Không chỉnh luồng deploy production trực tiếp trên VM bằng thao tác tay.

## 5. Handoff bắt buộc cuối session
- Cập nhật `.agent/memory/CONTEXT_SNAPSHOT.md`.
- Ghi session mới trong `.agent/sessions/`.
- Cập nhật `planning/CURRENT_TASK.md`.
- Nếu có quyết định mới, tạo ADR mới trong `docs/decisions/`.
