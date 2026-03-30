# ADR-002: Scale Strategy for 2M Customers

## Status
Accepted (Phase planning)

## Context
Mục tiêu dữ liệu khách hàng dài hạn 2M records; nhân sự nội bộ 50 người; khách không đăng nhập.

## Decision
- Giữ Firestore làm operational store ở giai đoạn hiện tại.
- Chuẩn hóa query/index theo `companyId` + dimension nghiệp vụ.
- Thêm chiến lược aggregation + archival để tối ưu chi phí và hiệu năng.

## Consequences
- Không phá chức năng hiện tại.
- Cần theo dõi read/write cost và index health định kỳ.
