# n8n AI Router V1

Tài liệu này chuẩn hóa cách dùng workflow n8n cho luồng AI auto-reply theo ngành, với mô hình:

- ERP là source of truth nghiệp vụ.
- n8n chỉ làm suy luận AI và callback đề xuất trả lời.
- ERP luôn re-check guardrail trước khi gửi tin thật ra kênh.

## 1) Artifacts

- Workflow mẫu import vào n8n:
  - `docs/integrations/n8n/workflows/ERP_AI_ROUTER_V1.json`
- Mẫu payload ERP -> n8n:
  - `docs/integrations/n8n/examples/erp-chat-event.json`
- Mẫu callback n8n -> ERP:
  - `docs/integrations/n8n/examples/n8n-ai-reply-callback.json`

## 2) Runtime contract

### 2.1 ERP -> n8n (outbound webhook)

- Endpoint nhận tại n8n workflow: `POST /webhook/erp-chat-events`
- Header chữ ký: `x-erp-signature` (HMAC SHA-256 của raw JSON body)
- Secret verify phía n8n:
  - `N8N_ERP_OUTBOUND_HMAC_SECRET`

Các field bắt buộc trong body:

- `eventId` (idempotency key)
- `threadId`
- `industryKey`
- `channel`
- `channelAccountId`
- `context` (transcript, latestMessages, customer snapshot đã mask PII theo policy ERP)

### 2.2 n8n -> ERP (callback)

- Endpoint callback ERP:
  - `POST /api/v1/integrations/n8n/ai-replies`
- Header chữ ký:
  - `x-n8n-signature: sha256=<hex>`
- Secret ký phía n8n và verify phía ERP:
  - `N8N_ERP_CALLBACK_HMAC_SECRET` (n8n)
  - `AI_N8N_CALLBACK_HMAC_SECRET` (ERP runtime)

Các field callback chuẩn:

- `eventId`
- `replyText`
- `confidence`
- `workflowKey`
- `agentKey`
- `tokenUsage`
- `latencyMs`
- `safetyFlags`
- `shouldHandoff`

## 3) Environment variables

### 3.1 n8n

- `N8N_ERP_OUTBOUND_HMAC_SECRET`
- `N8N_ERP_CALLBACK_HMAC_SECRET`
- `ERP_API_BASE_URL` (ví dụ `http://api:3001`)
- `AI_OPENAI_COMPAT_BASE_URL`
- `AI_OPENAI_COMPAT_API_KEY`
- `AI_OPENAI_COMPAT_MODEL`
- `KNOWLEDGE_SERVICE_URL` (optional)
- `AI_MODEL_BAO_HIEM` (optional)
- `AI_MODEL_VIEN_THONG` (optional)
- `AI_MODEL_DIGITAL` (optional)

### 3.2 ERP

- `AI_ROUTING_MODE=legacy|n8n|shadow`
- `AI_N8N_CHAT_EVENTS_URL` (URL webhook n8n)
- `AI_N8N_OUTBOUND_HMAC_SECRET`
- `AI_N8N_CALLBACK_HMAC_SECRET`
- `AI_N8N_DEBOUNCE_SECONDS` (default 8)
- `AI_N8N_DISPATCH_TIMEOUT_MS` (default 25000)
- `AI_N8N_MAX_RETRY_ATTEMPTS` (default 3)
- `AI_N8N_RETRY_BACKOFF_SECONDS` (default `10,30,90`)

## 4) Hành vi quan trọng

- ERP route theo `channel + channelAccountId -> industry`.
- Đổi mapping ngành có hiệu lực cho event mới; job đang chạy giữ snapshot cũ.
- Nếu không có mapping active: ERP không auto-reply AI, job đi `HANDOFF`.
- Callback duplicate `eventId`: ERP xử lý idempotent (trả về NOOP).
- Mọi tin AI gửi thành công đều được lưu vào thread ERP với `origin=AI`.

## 5) Import workflow n8n

1. Mở n8n -> Import from file.
2. Chọn `ERP_AI_ROUTER_V1.json`.
3. Cấu hình đầy đủ env vars ở mục trên.
4. Activate workflow.
5. Trên ERP, đặt `AI_ROUTING_MODE=n8n` cho pilot; có thể dùng `shadow` để rollout an toàn.

