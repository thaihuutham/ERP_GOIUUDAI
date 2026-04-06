# Customer360 Data Dictionary

## 1. Phạm vi và endpoint chuẩn
- Tên nghiệp vụ: `Customer360` (Khách hàng 360).
- Thực thể lưu trữ gốc: bảng `Customer` trong PostgreSQL.
- Endpoint chuẩn sau khi hợp nhất route:
  - `GET /api/v1/crm/customers`
  - `POST /api/v1/crm/customers`
  - `PATCH /api/v1/crm/customers/:id`
  - `DELETE /api/v1/crm/customers/:id`

Ghi chú: trước đây tồn tại route alias `/crm/customer-360`; hiện đã chuẩn hóa về `/crm/customers` để tránh trùng API.

## 2. Dictionary trường dữ liệu (Core Customer)

| Field | Kiểu dữ liệu (DB) | Bắt buộc | Ý nghĩa nghiệp vụ | Nguồn cập nhật | Màn hình sử dụng chính |
|---|---|---|---|---|---|
| `id` | `String` (`cuid`) | Có (hệ thống tự sinh) | Khóa định danh khách hàng | Tự sinh khi tạo khách | `/modules/crm`, `/modules/sales`, `/modules/zalo-automation/*` |
| `tenant_Id` | `String` | Có (hệ thống) | Phân vùng dữ liệu theo tenant | Gắn tự động theo context tenant | Toàn hệ thống (không hiển thị cho user) |
| `code` | `String?` | Không | Mã khách hàng nghiệp vụ | Tạo/sửa khách từ CRM | `/modules/sales` (bảng vận hành), API CRM |
| `fullName` | `String` | Có (khi create thủ công) | Họ tên khách hàng | Tạo/sửa CRM, sync danh bạ Zalo, merge khách | `/modules/crm`, `/modules/sales`, Zalo inbox/snapshot |
| `email` | `String?` | Không | Email hiển thị | Tạo/sửa CRM, merge khách | `/modules/crm`, `/modules/sales` |
| `emailNormalized` | `String?` | Không | Email chuẩn hóa để tìm kiếm/khử trùng | Tạo/sửa CRM, merge khách | Logic backend dedup/search |
| `phone` | `String?` | Không | Số điện thoại hiển thị | Tạo/sửa CRM, sync danh bạ Zalo, merge khách | `/modules/crm`, `/modules/sales`, Zalo campaign filters/snapshot |
| `phoneNormalized` | `String?` | Không | SĐT chuẩn hóa để định danh/khử trùng | Tạo/sửa CRM, sync danh bạ Zalo, merge khách | Logic backend dedup/search/campaign targeting |
| `tags` | `String[]` | Không (default `[]`) | Nhãn phân loại khách hàng | Tạo/sửa CRM, tương tác CRM, mark-paid, merge, sync Zalo (new customer) | `/modules/crm`, `/modules/sales`, `/modules/zalo-automation/messages`, `/modules/zalo-automation/campaigns` |
| `customerStage` | `String?` | Không (default nghiệp vụ `MOI`) | Giai đoạn vòng đời khách | Tạo/sửa CRM, tương tác CRM, mark-paid (`DA_MUA`), sync Zalo (new customer), merge | `/modules/crm`, `/modules/sales`, `/modules/zalo-automation/campaigns` |
| `ownerStaffId` | `String?` | Không | Nhân sự phụ trách khách | Tạo/sửa CRM, merge khách | `/modules/crm`, `/modules/sales` |
| `consentStatus` | `String?` | Không | Trạng thái đồng ý nhận thông tin/chăm sóc | Tạo/sửa CRM, merge khách | `/modules/crm`, `/modules/sales` |
| `segment` | `String?` | Không | Phân khúc khách hàng | Tạo/sửa CRM, merge khách | `/modules/crm`, `/modules/sales` |
| `source` | `String?` | Không | Nguồn khách (Zalo/Online/Referral/...) | Tạo/sửa CRM, sync Zalo (`ZALO`), merge khách | `/modules/crm`, `/modules/sales`, `/modules/zalo-automation/campaigns` |
| `customFieldSchemaVersion` | `Int?` | Không (hệ thống) | Version schema custom fields đang áp vào bản ghi | Custom Fields engine cập nhật | Không hiển thị trực tiếp; dùng trong API wrapper |
| `totalOrders` | `Int` | Có (default `0`) | Tổng số đơn đã mua | Sửa CRM thủ công, merge khách (cộng dồn) | `/modules/crm`, `/modules/sales`, báo cáo bán hàng |
| `totalSpent` | `Decimal(18,2)?` | Không | Tổng chi tiêu | Sửa CRM thủ công, merge khách (cộng dồn) | `/modules/crm`, `/modules/sales`, báo cáo tài chính bán hàng |
| `lastOrderAt` | `DateTime?` | Không | Ngày mua gần nhất | Mark-paid payment request, sửa CRM, merge khách | `/modules/sales`, `/modules/crm` |
| `lastContactAt` | `DateTime?` | Không | Ngày tương tác gần nhất | Tạo interaction CRM, gửi campaign Zalo thành công, sync danh bạ Zalo, sửa CRM, merge khách | `/modules/crm`, `/modules/sales`, vận hành CSKH |
| `status` | `GenericStatus` | Có (default `ACTIVE`) | Trạng thái hồ sơ | Tạo/sửa CRM, archive CRM (`ARCHIVED`), sync Zalo (new customer), merge khách | `/modules/crm`, `/modules/sales` |
| `createdAt` | `DateTime` | Có (hệ thống) | Thời điểm tạo bản ghi | Tự sinh | Toàn hệ thống (audit/báo cáo) |
| `updatedAt` | `DateTime` | Có (hệ thống) | Thời điểm cập nhật cuối | Tự cập nhật bởi DB/ORM | `/modules/crm`, `/modules/sales`, đồng bộ search |

## 3. Trường mở rộng (Custom Fields)

Customer360 hỗ trợ trường động qua Custom Fields, không cần sửa schema `Customer` khi thêm field mới.

- Bảng định nghĩa schema:
  - `CustomFieldDefinition`
  - `CustomFieldSchemaVersion`
- Bảng lưu giá trị theo entity:
  - `CustomFieldValue` với khóa `(tenant_Id, entityType, entityId, fieldKey)`

API CRM trả entity có wrapper:
- `id`
- `schemaVersion`
- `base` (core fields từ `Customer`)
- `customFields` (field mở rộng)

Frontend hiện đang unwrap về object phẳng khi render list/detail.

## 4. Ràng buộc dữ liệu quan trọng

- Unique trong cùng tenant:
  - `(tenant_Id, code)`
  - `(tenant_Id, phoneNormalized)`
  - `(tenant_Id, emailNormalized)`
- Index hiệu năng:
  - `tenant_Id`
  - `tenant_Id + phone`
  - `tenant_Id + email`
  - `tenant_Id + customFieldSchemaVersion`

## 5. Ghi chú vận hành

- `Customer360` là tên nghiệp vụ/UI; model dữ liệu gốc vẫn là `Customer`.
- Các luồng tự động có thể cập nhật customer mà không qua form CRM:
  - Sync danh bạ Zalo (`/zalo/accounts/:id/sync-contacts`)
  - Tương tác CSKH
  - Mark-paid hóa đơn/yêu cầu thanh toán
  - Gửi campaign Zalo thành công
  - Gộp khách trùng (`/crm/merge-customers`)
