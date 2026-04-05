# ADR-045: IAM v2 All-Module Enforcement Semantics

## Status
Accepted - 2026-04-05

## Context
Sau khi có nền tảng IAM v2 (ADR-044), nhu cầu vận hành yêu cầu có thể bật enforcement cho toàn bộ phân hệ cùng lúc, thay vì bắt buộc rollout theo danh sách module.

## Decision
Chuẩn hóa semantics `access_security.iamV2.enforcementModules` như sau:
- `[]` => áp dụng IAM v2 cho toàn bộ module hợp lệ.
- `['ALL']` hoặc `['*']` => canonical về `[]` (toàn bộ module).
- Danh sách module cụ thể (`['crm','sales', ...]`) => rollout theo module như cũ.

`mode` vẫn giữ ý nghĩa hành vi engine (`OFF | SHADOW | ENFORCE`), không phải nhánh rollout module.

## Consequences
- Có thể bật toàn hệ thống bằng một cấu hình rõ ràng, không cần tách nhánh triển khai.
- Vẫn giữ tương thích ngược cho kịch bản rollout từng module.
- Giảm nhầm lẫn cấu hình khi muốn áp dụng global enforcement.

## Non-Goals
- Không thay đổi role model hoặc xóa permission engine legacy trong ADR này.
- Không đổi luồng migration dữ liệu IAM.
