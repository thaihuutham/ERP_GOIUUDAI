# ADR-026: UI-managed Integration Secrets với Runtime Hot Reload

## Status
Accepted

> Bổ sung bảo mật at-rest cho các key lưu DB được quy định tại ADR-027.

## Context
- Trước đây domain `integrations` chỉ cho phép nhập `secretRef` (`apiKeyRef/accessTokenRef/webhookSecretRef`), key thật phải được inject qua env/secret store.
- Yêu cầu vận hành mới: nhập key trực tiếp từ UI để thao tác nhanh khi rotate key, và đổi key phải có hiệu lực ngay không cần restart container/docker.
- Runtime settings engine đã có cache TTL ngắn + invalidate sau `PUT /settings/domains/:domain`, phù hợp để áp dụng cấu hình nóng.

## Decision
- Cho phép lưu key/token trực tiếp trong `settings.integrations.v1`:
  - `bhtot.apiKey`
  - `ai.apiKey`
  - `zalo.accessToken`
  - `zalo.webhookSecret`
- Giữ `*Ref` để backward-compat và fallback (`apiKeyRef/accessTokenRef/webhookSecretRef`).
- Áp dụng precedence runtime thống nhất cho integrations:
  - `key/token nhập trực tiếp từ UI` > `secretRef` > `ENV fallback`.
- Cập nhật Settings Center UI để nhập trực tiếp key/token cho tất cả connector key chính, đồng thời vẫn giữ lựa chọn `SecretRef` fallback.
- `test-connection` và trạng thái `hasSecret/isConfigured` dùng cùng precedence mới để phản ánh đúng cấu hình thực tế.

## Consequences
- Ops có thể rotate key nhanh trực tiếp trên UI và runtime dùng key mới ngay sau khi lưu (không restart).
- Hệ thống tăng tính linh hoạt vận hành nhưng giảm mức độ tách biệt secret so với mô hình secret-store-only.
- Các môi trường đang dùng `secretRef/env` vẫn hoạt động do cơ chế fallback không bị loại bỏ.
