# ADR-012: Level 2 Hybrid Search với Meilisearch (Core 3 Modules)

## Status
Accepted

## Context
- Search hiện tại ở CRM/Sales/Catalog dùng `contains` SQL thuần, chất lượng ranking còn hạn chế khi dữ liệu tăng.
- ERP đang chạy Modular Monolith với PostgreSQL là nguồn dữ liệu chuẩn (source of truth).
- Mục tiêu giai đoạn này là nâng chất lượng tìm kiếm mà không thay đổi API contract hiện có (`q`, `limit`, `cursor`) và không làm gián đoạn vận hành MVP.

## Decision
- Áp dụng **Level 2 Hybrid Search** cho 3 module lõi:
  - CRM khách hàng (`customers`)
  - Sales đơn hàng (`orders`)
  - Catalog sản phẩm (`products`)
- Meilisearch chỉ dùng cho:
  - Ranking + candidate retrieval theo `q`
  - Lưu read index tách biệt khỏi transactional DB
- PostgreSQL vẫn là source of truth:
  - Kết quả cuối cùng vẫn đọc từ Postgres theo danh sách ID xếp hạng từ Meili.
  - Khi Meili lỗi/timeout hoặc request có `cursor`, hệ thống fallback SQL cũ.
- Bổ sung feature flags/env:
  - `SEARCH_ENGINE=sql|meili_hybrid`
  - `MEILI_*` cấu hình kết nối/index/timeout
  - `MEILI_ENABLE_WRITE_SYNC` bật/tắt write-through indexing best-effort.
- Bổ sung cơ chế vận hành:
  - CLI reindex: `npm run search:reindex --workspace @erp/api -- --entity=...`
  - API admin: `GET /api/v1/settings/search/status`, `POST /api/v1/settings/search/reindex`.

## Consequences
- Tăng chất lượng tìm kiếm cho các bảng vận hành chính mà không phá API frontend hiện tại.
- Có thêm hạ tầng Meilisearch và quy trình reindex định kỳ/sau deploy.
- Write sync chạy best-effort: lỗi index không làm fail transaction chính nhưng cần theo dõi log cảnh báo.
- Khi cần mở rộng Level 3 (search đa module sâu hơn), có thể bổ sung entity/index khác trên cùng khung SearchModule mà không đổi kiến trúc lõi.
