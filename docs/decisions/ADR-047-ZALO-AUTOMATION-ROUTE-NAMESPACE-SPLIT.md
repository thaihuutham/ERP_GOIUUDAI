# ADR-047: Zalo Automation Route Namespace Split (No Redirect)

## Status
Accepted - 2026-04-05

## Context
Luồng Zalo trước đây nằm trong namespace CRM (`/modules/crm/conversations`, `/modules/crm/zalo-accounts`) và trộn cả vận hành chat với AI quality operations trong cùng màn hình.

Yêu cầu triển khai parity từ ZaloCRM đòi hỏi:
- tách navigation rõ ràng thành nhóm `Zalo Automation`,
- tách vận hành hội thoại khỏi AI runs,
- giữ tương thích quyền hiện có của CRM, không tạo module quyền mới gây rủi ro rollout.

## Decision
Tạo namespace route mới, không redirect từ route cũ:
- `/modules/zalo-automation/messages`
- `/modules/zalo-automation/accounts`
- `/modules/zalo-automation/ai-runs`

Quy tắc truy cập:
- tất cả route `/modules/zalo-automation/*` được map vào policy module `crm` trong access policy.
- sidebar tách group `Zalo Automation` với 3 mục con tương ứng.

Về nội dung trang:
- `messages`: chỉ vận hành hội thoại realtime, không chứa block AI.
- `accounts`: quản trị tài khoản + assignment + QR/reconnect/sync/delete.
- `ai-runs`: chứa toàn bộ schedule/run/evaluation workflow (dùng lại API `conversation-quality`).

## Consequences
- Ưu điểm:
  - IA rõ ràng, giảm tải nhận thức cho CS team.
  - cô lập workflow AI khỏi inbox vận hành realtime.
  - không làm nở scope quyền, giữ cơ chế module CRM hiện hữu.
- Đánh đổi:
  - tồn tại route CRM cũ ở mức backward compatibility, nhưng không còn xuất hiện trong sidebar và không là đường dẫn chính.
  - cần cập nhật e2e/navigation assertions theo namespace mới.

## Non-Goals
- Không tạo module permission key mới cho `zalo-automation`.
- Không thay đổi business logic CRM core ngoài phạm vi route/container.
- Không dùng redirect tự động từ route cũ sang route mới ở phase này.
