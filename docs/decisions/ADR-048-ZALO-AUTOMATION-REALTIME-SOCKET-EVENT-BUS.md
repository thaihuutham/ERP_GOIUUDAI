# ADR-048: Zalo Automation Realtime Socket Event Bus

## Status
Accepted - 2026-04-05

## Context
Parity vận hành ZaloCRM yêu cầu cập nhật realtime cho:
- trạng thái QR/login/reconnect tài khoản cá nhân,
- message mới và message undo trong inbox.

Kiến trúc trước đó thiên về polling/refresh, làm giảm trải nghiệm vận hành và gây trễ thông tin với team CS.

## Decision
Triển khai socket namespace riêng cho Zalo Automation:
- namespace: `/zalo-automation`
- client events:
  - `org:join`
  - `zalo:subscribe`
  - `zalo:unsubscribe`
- server events:
  - `zalo:qr`
  - `zalo:scanned`
  - `zalo:connected`
  - `zalo:disconnected`
  - `zalo:error`
  - `zalo:qr-expired`
  - `zalo:reconnect-failed`
  - `chat:message`
  - `chat:deleted`

Thiết kế phát sự kiện:
- `ZaloAutomationGateway` xử lý room `org:<orgId>` và `account:<accountId>`.
- `ZaloAutomationRealtimeService` làm abstraction emit scoped (`orgId` + `accountId`).
- event nguồn:
  - `ZaloPersonalPoolService` cho QR/reconnect/undo/connection lifecycle.
  - `ConversationsService` phát `chat:message` sau ingest message thành công cho channel Zalo.
  - `ZaloService.softDeleteAccount` phát `zalo:disconnected` với reason `SOFT_DELETED`.

## Consequences
- Ưu điểm:
  - realtime UX cho vận hành QR và inbox parity với ZaloCRM.
  - event bus tập trung, giảm coupling trực tiếp từ service sang gateway.
  - dễ mở rộng thêm event mà không phá API REST hiện hữu.
- Đánh đổi:
  - tăng complexity cho test integration (socket lifecycle).
  - cần đảm bảo graceful behavior khi gateway khởi tạo trong môi trường test (đã thêm guard).

## Non-Goals
- Không thay thế toàn bộ cơ chế polling của các module ERP khác.
- Không thêm broker external (Redis/NATS) cho phase hiện tại.
- Không thay đổi deployment model VM hiện tại ngoài dependency socket cần thiết.
