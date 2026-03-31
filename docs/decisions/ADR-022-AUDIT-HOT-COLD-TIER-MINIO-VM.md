# ADR-022: Audit Hot/Cold Tier (PostgreSQL 12 Tháng + MinIO Trên VM)

## Status
Accepted

## Context
- Audit log cần giữ đủ 7 năm để phục vụ truy vết/điều tra nội bộ.
- Nếu giữ toàn bộ trong PostgreSQL transactional sẽ làm index/table phình lớn theo thời gian, tăng nguy cơ query chậm, lag UI và ảnh hưởng API chính.
- Mục tiêu vận hành:
  - Dữ liệu 12 tháng gần nhất truy vấn nhanh.
  - Dữ liệu cũ hơn vẫn tra cứu được, chấp nhận chậm hơn.
  - Không phát sinh thao tác thủ công trực tiếp trên VM cho luồng archive/prune thường kỳ.

## Decision
- Chốt kiến trúc lưu trữ audit 2 tầng:
  - `Hot tier`: bảng `audit_logs` trên PostgreSQL, giữ cửa sổ nóng mặc định `12` tháng (`auditHotRetentionMonths`).
  - `Cold tier`: object storage MinIO trên cùng VM Ubuntu, lưu NDJSON.GZ theo ngày.
- Bổ sung metadata archive:
  - Bảng `audit_archive_manifests` lưu window thời gian, object key/version, rowCount, checksum, hash boundary, trạng thái job.
- Luồng archive idempotent chạy hằng ngày (off-peak):
  1. Chọn window cũ hơn hot window.
  2. Export NDJSON + gzip + checksum, upload MinIO.
  3. Verify object thành công mới prune `audit_logs` tương ứng (guard `app.audit_prune='on'`).
  4. Cập nhật manifest và thống kê vận hành.
- Guard hiệu năng truy vấn cold:
  - Nếu query chạm cold tier thì bắt buộc có cả `from/to`.
  - Giới hạn cửa sổ cold mỗi request mặc định `31` ngày.
- API audit hợp nhất:
  - `GET /audit/logs` và `GET /audit/objects/:entityType/:entityId/history`
  - Thêm `includeArchived` (default `true`)
  - `pageInfo` mở rộng `tier: hot|cold|mixed` và `coldScanStats`.
- Giảm log nhiễu tại nguồn:
  - Bỏ ghi `updateMany/deleteMany` khi `count=0`.
  - Bỏ ghi mutation kỹ thuật theo denylist model (mặc định `Notification`, có thể mở rộng bằng env).

## Consequences
- DB giao dịch giữ nhẹ hơn theo thời gian, giảm rủi ro treo/lag do bảng audit phình lớn.
- Truy vấn dữ liệu cũ có độ trễ cao hơn nhưng vẫn khả dụng qua một UI thống nhất.
- Tăng độ phức tạp vận hành (MinIO + manifest + scheduler), đổi lại khả năng scale retention tốt hơn.
- Cần giám sát định kỳ:
  - tỷ lệ failed window,
  - độ trễ cold query,
  - dung lượng bucket MinIO và tính toàn vẹn checksum.
