# ADR-027: Settings Secrets At-Rest Encryption (AES-256-GCM)

## Status
Accepted

## Context
- ADR-026 cho phép nhập trực tiếp integration key/token từ Settings Center để rotate nhanh và runtime hot-reload.
- Khi key được lưu trực tiếp trong DB, rủi ro lộ dữ liệu tăng nếu dump DB bị truy cập trái phép.
- Mục tiêu hiện tại là giảm rủi ro lộ key tại tầng lưu trữ với thay đổi hạ tầng tối thiểu.

## Decision
- Áp dụng mã hóa at-rest cho secret fields bằng `AES-256-GCM`.
- Master key đọc từ env: `SETTINGS_ENCRYPTION_MASTER_KEY` (32-byte, base64 hoặc hex).
- Encrypt-on-write / decrypt-on-read cho:
  - `settings.integrations.v1.bhtot.apiKey`
  - `settings.integrations.v1.ai.apiKey`
  - `settings.integrations.v1.zalo.accessToken`
  - `settings.integrations.v1.zalo.webhookSecret`
  - `system_config.bhtotSync.apiKey` (legacy bridge)
- `secretRef` và `ENV fallback` vẫn giữ nguyên precedence runtime theo ADR-026.
- Không triển khai migration plaintext -> ciphertext trong pha này theo trạng thái dữ liệu hiện tại (greenfield, chưa có dữ liệu cũ cần migrate).

## Consequences
- DB không còn lưu plaintext key cho các field trên; giảm đáng kể rủi ro khi lộ DB snapshot/dump.
- Runtime behavior không đổi với người dùng cuối: đổi key trên UI vẫn có hiệu lực ngay, không restart container.
- Vận hành bắt buộc quản trị an toàn `SETTINGS_ENCRYPTION_MASTER_KEY`; mất key sẽ không giải mã được dữ liệu đã mã hóa.
- Khi cần key rotation master key trong tương lai, phải có playbook re-encryption riêng.
