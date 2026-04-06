# Zalo Campaigns V1 (PERSONAL)

## 1. Understanding Summary
- Xây trang mới trong nhóm **Zalo Automation** để vận hành campaign gửi tin bằng tài khoản **Zalo PERSONAL**.
- Mục tiêu: cho phép chạy nhiều campaign đồng thời, tự động xoay tua tài khoản theo quota + cooldown, và cập nhật tương tác về CRM.
- Trong **mỗi campaign**, mỗi khách hàng chỉ nhận tối đa **1 tin**; giữa các campaign khác nhau có thể nhận tiếp.
- Nội dung gửi theo **template riêng từng account**, hỗ trợ biến `{{...}}` và cú pháp spin `{A|B|C}`.
- Khung giờ gửi cố định toàn hệ thống theo `Asia/Ho_Chi_Minh`: `07:00-11:30`, `14:00-20:00`.
- Snapshot khách hàng tại thời điểm bấm chạy; thiếu biến thì skip và lưu lý do.
- Nhân viên được admin chỉ định là operator sẽ có full quyền trên campaign được giao.

## 2. Scope V1
- Kênh: `ZALO_PERSONAL`.
- Campaign lifecycle: `DRAFT -> RUNNING -> PAUSED -> COMPLETED/FAILED/CANCELED`.
- Runtime account state: `READY/PAUSED_ERROR/DONE(legacy)/DISABLED`.
- Scheduler nội bộ ERP tự khôi phục sau restart.
- Trang web mới: `/modules/zalo-automation/campaigns`.

## 3. Non-goals V1
- Không triển khai media/rich template phức tạp.
- Không đồng bộ với n8n trong V1.
- Không chặn trùng khách giữa nhiều campaign đang chạy.

## 4. Functional Rules
1. Mỗi account có template riêng và quota gửi theo ngày.
2. Quota account reset lúc 24:00 theo timezone campaign.
3. Mỗi lượt gửi thành công của account phải chờ ngẫu nhiên `delayMin..delayMax` (mặc định 180-300 giây).
4. Nếu account lỗi liên tiếp đạt ngưỡng `N` (nhập theo campaign) thì pause account đó, các account khác tiếp tục.
5. Campaign cho phép chọn policy đích gửi:
   - `PRIORITIZE_RECENT_INTERACTION`
   - `AVOID_PREVIOUSLY_INTERACTED_ACCOUNT`
6. Snapshot khách khi start campaign, không tự thêm khách mới trong lúc chạy.

## 5. Variable + Spin Strategy
- Cú pháp biến: `{{variable_key}}`.
- Cú pháp spin: `{nội dung 1|nội dung 2|nội dung 3}`.
- Hỗ trợ `allowedVariableKeys` để giới hạn biến được resolve (tránh truy vấn quá rộng).
- Khi thiếu biến hoặc biến không nằm trong allowlist: recipient bị skip và ghi reason.

## 6. Access Control
- `ADMIN`: tạo/sửa/xóa/start/pause/resume/stop campaign, quản lý operator.
- `Operator` (được gán campaign): full quyền trên campaign được gán.
- User khác: không truy cập campaign detail.
- Web route `zalo-automation` vẫn đi theo policy module `crm`; backend bổ sung resource ACL theo campaign.

## 7. Data Model (V1)
- `ZaloCampaign`
- `ZaloCampaignAccount`
- `ZaloCampaignOperator`
- `ZaloCampaignRecipient`
- `ZaloCampaignMessageAttempt`

## 8. Runtime Flow
1. Scheduler quét campaign `RUNNING` đúng khung giờ.
2. Chọn account `READY` đến hạn gửi.
3. Claim recipient `PENDING` theo account/policy.
4. Render template (mask placeholder -> spin -> resolve biến).
5. Gửi qua API Zalo personal hiện có.
6. Thành công: mark `SENT`, ghi CRM interaction, cập nhật nextSendAt.
7. Thất bại: tăng error counter; đạt ngưỡng thì pause account.
8. Không còn recipient hợp lệ thì campaign kết thúc.

## 9. Decision Log
1. Chọn ERP-native campaign module thay vì n8n orchestration cho V1.
2. Chọn channel `PERSONAL` cho bài toán hiện tại.
3. Chọn snapshot-at-start để đảm bảo deterministic recipients.
4. Chọn account-level template + spin + variable allowlist.
5. Chọn auto round-robin scheduler + account pause on consecutive errors.
6. Chọn ACL theo campaign operator (admin chỉ định).
7. Chọn auto-resume sau restart.

## 10. Risks
- Policy `AVOID_PREVIOUSLY_INTERACTED_ACCOUNT` có thể làm tăng tỷ lệ fail nếu account mục tiêu không còn điều kiện gửi thực tế.
- Variable quá linh hoạt có thể làm runtime chậm nếu allowlist không giới hạn tốt.

## 11. Verification Plan
- Unit: parser spin/variable, ACL operator, account conflict check.
- Integration: campaign lifecycle + recipient state transitions.
- E2E: admin tạo campaign + gán operator; operator vận hành; user ngoài campaign bị chặn.
