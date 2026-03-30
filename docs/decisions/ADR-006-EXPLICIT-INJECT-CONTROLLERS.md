# ADR-006: Explicit `@Inject(...)` for Controller Dependencies

## Status
Accepted

## Context
Một số controller route-level test trong môi trường Vitest/esbuild gặp lỗi runtime:
- `Cannot read properties of undefined (reading '...')`

Nguyên nhân là dependency injection theo constructor type metadata không luôn ổn định giữa các môi trường transpile/runtime (đặc biệt khi test).

## Decision
- Chuẩn hóa việc khai báo dependency ở controller theo dạng explicit:
  - `constructor(@Inject(SomeService) private readonly someService: SomeService) {}`
- Áp dụng ngay cho các controller còn thiếu trong phase hiện tại:
  - `conversations`, `conversation-quality`, `zalo`, `sales`, `settings`, `notifications`.

## Consequences
- Route-level integration tests ổn định, giảm rủi ro `service undefined`.
- Tăng độ rõ ràng DI token ở controller.
- Tăng nhẹ boilerplate, nhưng chấp nhận được để đổi lấy tính nhất quán giữa môi trường test và runtime.
