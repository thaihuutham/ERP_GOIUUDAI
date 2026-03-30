# API Error Response Contract

## Chuẩn response lỗi (áp dụng global)

Mọi lỗi HTTP do API trả về phải theo cùng 1 shape:

```json
{
  "success": false,
  "error": {
    "code": 401,
    "message": "Token không hợp lệ hoặc đã hết hạn.",
    "details": {}
  },
  "meta": {
    "requestId": "2f978dc0-3d03-4554-a6a8-a590eb6df1a8",
    "tenantId": "tenant_demo_company",
    "path": "/api/v1/crm/customers",
    "method": "GET",
    "timestamp": "2026-03-28T11:07:43.972Z"
  }
}
```

## Ý nghĩa field
- `success`: luôn là `false` cho error response.
- `error.code`: HTTP status code.
- `error.message`: thông điệp chính để client hiển thị/log.
- `error.details`: payload chi tiết (validation hoặc context lỗi khác).
- `meta.requestId`: id truy vết, đồng bộ với header `x-request-id`.
- `meta.tenantId`: tenant context tại thời điểm xử lý request.
- `meta.path`, `meta.method`: định danh endpoint gây lỗi.
- `meta.timestamp`: thời điểm API trả response.

## Mapping lỗi phổ biến
- `400`: input validation sai schema hoặc business rule invalid.
- `401`: thiếu/sai Bearer token.
- `403`: role không đủ quyền truy cập endpoint.
- `404`: không tìm thấy tài nguyên.
- `500`: lỗi nội bộ chưa map business exception.

## Yêu cầu khi tích hợp client
- Luôn log `meta.requestId` cùng error.
- Không parse message bằng regex; dựa trên `error.code` để xử lý logic chính.
- UI có thể fallback message chung nếu `error.message` rỗng (trường hợp hiếm).
