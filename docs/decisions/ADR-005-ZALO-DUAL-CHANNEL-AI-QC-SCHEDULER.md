# ADR-005: Zalo Dual-Channel + AI QC Scheduler

## Status
Accepted

## Context
ERP cần tích hợp hội thoại Zalo theo hai hướng có mức rủi ro/compliance khác nhau:
- Zalo cá nhân qua `zca-js` để ưu tiên tốc độ triển khai.
- Zalo OA official API để chuẩn hóa dần theo hướng compliance.

Đồng thời cần chấm điểm chất lượng hội thoại bằng AI theo lịch (batch), không chạy realtime.

## Decision
- Dùng đồng thời 2 kênh `ZALO_PERSONAL` và `ZALO_OA`, ưu tiên vận hành `ZALO_PERSONAL` trước.
- Chuẩn hóa dữ liệu hội thoại vào các bảng: `ConversationThread`, `ConversationMessage`.
- Tách lớp tích hợp Zalo thành module riêng:
  - pool đăng nhập QR/reconnect cho Zalo cá nhân
  - webhook ingest cho OA (có xác thực chữ ký HMAC khi cấu hình secret)
- Chấm điểm AI theo lịch bằng `ConversationEvaluationJob` + `ConversationEvaluationRun` + `ConversationEvaluation`.
- Provider AI mặc định là OpenAI-compatible endpoint (phù hợp 9router).

## Consequences
- Có thể go-live nhanh với Zalo cá nhân nhưng vẫn giữ đường nâng cấp sang OA official.
- Tăng chi phí vận hành dữ liệu (thêm scheduler + bảng QC), đổi lại có audit trail rõ ràng cho chất lượng CSKH.
- Cần quản trị secrets chặt chẽ (`AI_OPENAI_COMPAT_API_KEY`, `ZALO_OA_WEBHOOK_SECRET`) trong CI/CD và môi trường VM.
