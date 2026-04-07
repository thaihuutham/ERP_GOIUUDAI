# ADR-053: Tách trạng thái CSKH khỏi GenericStatus và chuẩn hóa rule Zalo nick type

- Status: Accepted
- Date: 2026-04-07

## Context
- Trạng thái `Customer.status` đang dùng `GenericStatus` không còn phản ánh đúng quy trình CSKH thực tế (9 trạng thái nghiệp vụ đã chốt).
- Luồng campaign Zalo trước đó phụ thuộc cứng vào `status = ACTIVE`, gây sai lệch với nghiệp vụ CSKH và khó lọc đúng tập khách có thể gửi.
- Nghiệp vụ cần thêm phân loại khả năng nhắn tin Zalo theo từng khách để điều phối account gửi và auto học từ kết quả campaign.
- Nghiệp vụ "BỎ QUA/Xóa" yêu cầu là soft-skip, không xóa cứng dữ liệu khách hàng.

## Decision
- Tách riêng enum `CustomerCareStatus` cho `Customer.status` với 9 giá trị CSKH:
  - `MOI_CHUA_TU_VAN`
  - `DANG_SUY_NGHI`
  - `DONG_Y_CHUYEN_THANH_KH`
  - `KH_TU_CHOI`
  - `KH_DA_MUA_BEN_KHAC`
  - `NGUOI_NHA_LAM_THUE_BAO`
  - `KHONG_NGHE_MAY_LAN_1`
  - `KHONG_NGHE_MAY_LAN_2`
  - `SAI_SO_KHONG_TON_TAI_BO_QUA_XOA`
- Thêm enum `CustomerZaloNickType` + cột `Customer.zaloNickType`:
  - `CHUA_KIEM_TRA` (default)
  - `CHUA_CO_NICK_ZALO`
  - `CHAN_NGUOI_LA`
  - `GUI_DUOC_TIN_NHAN`
- Data migration:
  - toàn bộ status cũ của Customer chuyển về `MOI_CHUA_TU_VAN`;
  - backfill `zaloNickType = CHUA_KIEM_TRA`.
- `DELETE /crm/customers/:id` đổi semantics thành soft-skip:
  - set `status = SAI_SO_KHONG_TON_TAI_BO_QUA_XOA`;
  - không archive/xóa cứng record.
- Rule CRM:
  - khi set `status = DONG_Y_CHUYEN_THANH_KH`, tự động set `customerStage = DA_MUA`.
- Rule campaign Zalo:
  - bỏ filter cứng `customer.status = ACTIVE`;
  - dùng `recipientFilterJson.zaloNickTypes` (multi-select);
  - mặc định khi không chọn: `CHUA_KIEM_TRA + GUI_DUOC_TIN_NHAN`, loại `CHUA_CO_NICK_ZALO`;
  - dispatch theo từng `zaloNickType`:
    - `CHAN_NGUOI_LA`: chỉ gửi bằng account đã tương tác gần nhất;
    - `GUI_DUOC_TIN_NHAN`: theo `selectionPolicy`;
    - `CHUA_CO_NICK_ZALO`: skip;
    - `CHUA_KIEM_TRA`: theo logic lookup/sending hiện tại;
  - auto update `zaloNickType` theo kết quả campaign:
    - lookup UID không ra -> `CHUA_CO_NICK_ZALO`
    - gửi thành công -> `GUI_DUOC_TIN_NHAN`
    - lỗi chặn người lạ -> `CHAN_NGUOI_LA`
    - lỗi khác -> giữ nguyên.
- Bổ sung import Excel khách hàng:
  - endpoint `POST /crm/customers/import` (admin only);
  - upsert theo `phoneNormalized` ưu tiên, fallback `emailNormalized`;
  - hỗ trợ update `status` CSKH + `zaloNickType`.

## Consequences
### Positive
- Trạng thái Customer phản ánh đúng nghiệp vụ CSKH, dễ thống kê và vận hành.
- Luồng campaign Zalo chọn đúng tệp gửi, giảm tỷ lệ gửi lỗi không cần thiết.
- Giữ toàn vẹn lịch sử khách hàng nhờ soft-skip thay vì xóa cứng.
- Import dữ liệu khách hàng có thể đồng bộ đầy đủ trạng thái CSKH + khả năng nhắn Zalo.

### Negative
- Cần cập nhật typing/test ở các điểm đang giả định `Customer.status` là `GenericStatus`.
- Cần truyền thông rõ cho vận hành vì semantics nút `Delete` đã đổi thành soft-skip.

## Mitigation
- Giữ nguyên `GenericStatus` cho các module khác, chỉ tách riêng Customer để giảm blast radius.
- Bổ sung test migration, CRM soft-skip, campaign filtering/routing và auto-update nick type.
- Cập nhật docs data dictionary + spec campaign để đồng bộ backend/frontend/ops.
