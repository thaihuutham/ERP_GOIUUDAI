# ADR-055: AI n8n routing per-channel-account with ERP-owned guardrails

- Status: Accepted
- Date: 2026-04-08

## Context
- Cần chuyển logic auto-reply AI từ xử lý cục bộ sang mô hình agent workflow qua n8n.
- Mỗi nick kênh (Zalo/Facebook/TikTok) phải gắn ngành để route đúng agent theo nghiệp vụ.
- ERP vẫn phải là nơi quyết định gửi tin cuối cùng để đảm bảo takeover người thật, toggle account, và log hội thoại thống nhất.
- Yêu cầu vận hành: không mất event, có idempotency theo `eventId`, có retry ngắn hạn, có handoff khi lỗi.

## Decision
1. Mapping ngành đặt tại ERP (`channel + channelAccountId -> industryKey`), không đặt trong n8n.
2. ERP dùng 1 contract webhook outbound chung sang n8n, route theo `industryKey` và binding ngành/workflow.
3. n8n chỉ xử lý suy luận, callback về ERP; ERP là bên gửi tin ra connector thật.
4. Thêm các bảng chuẩn hóa:
   - `ai_industries`
   - `ai_routing_channel_accounts`
   - `ai_industry_bindings`
   - `ai_conversation_jobs`
   - `ai_conversation_outbox`
5. Thêm chế độ rollout `AI_ROUTING_MODE=legacy|n8n|shadow` để cutover an toàn.
6. Inbound customer message đi qua debounce cấu hình (mặc định 8s) trước khi tạo AI job/outbox.
7. Callback từ n8n bắt buộc HMAC + idempotency; trước khi gửi thật ERP re-check takeover/toggle/account-state.
8. Mặc định mask PII trước khi gửi context sang n8n/LLM, có whitelist field theo ngành qua `piiMaskConfigJson`.
9. Nếu không có mapping ngành active: không auto-reply AI, job chuyển `HANDOFF` với lý do rõ ràng để ops xử lý.

## Consequences
### Positive
- ERP giữ quyền kiểm soát nghiệp vụ chat và audit trail end-to-end.
- Có thể mở rộng đa kênh (FB/TikTok) mà không thay core flow: chỉ thêm mapping/binding.
- Outbox + retry/backoff + job status giúp quan sát vận hành và xử lý sự cố rõ ràng.
- Rollout `shadow` giảm rủi ro khi chuyển từ AI legacy sang n8n production.

### Negative
- Tăng độ phức tạp mô hình dữ liệu và vận hành (job/outbox + callback lifecycle).
- Cần quản lý secret HMAC hai chiều và theo dõi sức khỏe webhook n8n thường xuyên.
- Context hiện mới gửi 20 message gần nhất + summary rút gọn; chất lượng trả lời phụ thuộc chất lượng knowledge service ngoài.

## Alternatives considered
1. Đặt toàn bộ routing và gửi tin trực tiếp ở n8n: loại vì khó đảm bảo takeover/toggle/audit theo chuẩn ERP.
2. Tách microservice AI gateway riêng ngay từ đầu: loại ở phase này vì tăng hạ tầng và độ phức tạp rollout.
3. Tiếp tục AI legacy nội bộ không qua n8n: loại vì khó quản trị đa-agent theo ngành và khó mở rộng workflow.

## Follow-up
- Bổ sung dashboard ops cho `ai-jobs` (lọc theo status/reason/SLA latency) ở UI admin.
- Bổ sung contract test tự động cho webhook ERP<->n8n (schema + signature + idempotency).
- Chuẩn hóa external knowledge service (`knowledgeSpaceRef`) theo tenant/industry với healthcheck riêng.
