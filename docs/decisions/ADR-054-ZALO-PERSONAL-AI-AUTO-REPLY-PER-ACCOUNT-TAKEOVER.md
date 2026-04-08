# ADR-054: Zalo PERSONAL AI auto-reply per-account + manual takeover window

- Status: Accepted
- Date: 2026-04-08

## Context
- Luồng Zalo PERSONAL (zca-js) đã có gửi/nhận và campaign outbound.
- Cần bổ sung phản hồi tự động bằng AI cho inbox khách hàng, nhưng phải:
  - bật/tắt theo từng tài khoản Zalo,
  - hỗ trợ takeover khi nhân viên đang chat,
  - không làm thay đổi hành vi campaign/outbound hiện có.
- Yêu cầu takeover: khi nhân viên gửi tay, AI tạm ngưng; nếu sau tin nhắn khách 5 phút vẫn chưa có phản hồi từ nhân viên thì AI mới trả lời lại.

## Decision
- Thêm cờ cấu hình theo tài khoản trong `ZaloAccount`:
  - `aiAutoReplyEnabled` (boolean)
  - `aiAutoReplyTakeoverMinutes` (int, default `5`)
- Dùng `ConversationThread.metadataJson` để lưu trạng thái runtime của auto-reply theo thread (`zaloAutoReply`):
  - `pauseUntil`
  - `pendingCustomerMessageId`
  - `pendingCustomerSentAt`
  - `pendingDueAt`
  - `lastHandledCustomerMessageId`
  - `lastAiReplyAt`
- Cắm trigger tại listener inbound Zalo PERSONAL (`ZaloPersonalPoolService`):
  - customer message + account bật AI:
    - nếu không trong takeover window -> AI trả lời ngay,
    - nếu đang takeover -> đánh dấu pending và hẹn deferred.
- Khi nhân viên gửi tay qua `sendPersonalMessage` (origin `USER`):
  - cập nhật `pauseUntil = now + takeoverMinutes`,
  - clear pending,
  - hủy timer deferred thread tương ứng.
- Định danh origin outbound:
  - `USER` (mặc định, gửi tay),
  - `CAMPAIGN`,
  - `AI`,
  - `SYSTEM`.
- Campaign outbound buộc gửi với origin `CAMPAIGN` để không kích hoạt takeover logic.

## Consequences
### Positive
- Đáp ứng đúng nghiệp vụ vận hành thực tế: AI hỗ trợ tự động nhưng ưu tiên quyền can thiệp nhân viên.
- Cấu hình per-account giúp triển khai dần theo từng team/tài khoản.
- Không cần thêm bảng runtime mới; tận dụng metadata thread hiện hữu để giảm migration footprint.

### Negative
- Runtime trạng thái auto-reply nằm trong metadata JSON nên cần giữ kỷ luật key/schema nội bộ.
- Deferred xử lý đang dựa timer trong process API; khi restart đúng lúc pending có thể bị trễ phản hồi tới lần inbound/poll tiếp theo.

## Alternatives considered
1. Tạo bảng riêng cho auto-reply state/job: chuẩn hơn nhưng tăng scope migration + vận hành cho phase hiện tại.
2. Không deferred, luôn trả lời ngay: loại vì không đáp ứng takeover 5 phút.
3. Dùng queue ngoài (BullMQ) ngay từ đầu: loại ở phase này để tránh mở rộng hạ tầng sớm.

## Follow-up
- Nếu lưu lượng tăng hoặc cần bảo đảm at-least-once mạnh hơn, cân nhắc ADR mới để tách deferred auto-reply sang queue worker bền vững.
- Có thể mở rộng policy theo account (giờ làm việc, max-replies/session, blacklist intent) ở pha tiếp theo.
