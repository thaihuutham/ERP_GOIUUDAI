# ADR-049: Zalo PERSONAL Campaign ERP-native module

- Status: Accepted
- Date: 2026-04-06

## Context
- Cần vận hành chiến dịch gửi tin nhắn khuyến mãi bằng nhiều tài khoản Zalo PERSONAL.
- Yêu cầu nghiệp vụ:
  - Mỗi account có quota + template riêng.
  - Delay ngẫu nhiên giữa các lần gửi.
  - Chỉ chạy trong khung giờ cố định.
  - Mỗi khách chỉ 1 tin trong phạm vi 1 campaign.
  - Có thể chạy nhiều campaign đồng thời nhưng 1 account không được thuộc 2 campaign RUNNING cùng lúc.
  - Hệ thống phải tự resume sau restart.
- Cần tích hợp trực tiếp với CRM interaction để cập nhật trạng thái tương tác sau gửi.

## Decision
- Xây module campaign **trực tiếp trong ERP** (backend NestJS + Prisma + PostgreSQL), không dùng n8n cho V1.
- Tạo nhóm thực thể mới:
  - `ZaloCampaign`
  - `ZaloCampaignAccount`
  - `ZaloCampaignOperator`
  - `ZaloCampaignRecipient`
  - `ZaloCampaignMessageAttempt`
- Dùng scheduler nội bộ ERP để xử lý runtime gửi tin theo state machine account/recipient.
- Tạo route web mới trong nhóm Zalo Automation: `/modules/zalo-automation/campaigns`.
- Access model:
  - `ADMIN` quản trị toàn bộ campaign.
  - `Operator` được admin chỉ định có full quyền trên campaign được gán.

## Consequences
### Positive
- Nghiệp vụ campaign, dữ liệu khách hàng, và interaction CRM nằm cùng hệ thống -> dễ audit, dễ đồng bộ.
- Chủ động kiểm soát logic round-robin, cooldown, retry, pause-account theo lỗi liên tiếp.
- Dễ triển khai rollout incremental theo module hiện có.

### Negative
- Tăng độ phức tạp runtime trong ERP API process nếu chưa tách worker riêng.
- Cần bổ sung migration và test lifecycle campaign để tránh regression.

## Alternatives considered
1. Dùng n8n orchestration chính: loại do state campaign/account phức tạp và cần resource-level ACL nội bộ ERP.
2. Tái sử dụng bảng notifications dispatch: loại do không phù hợp template-per-account + policy chọn account/thread.
3. BullMQ từ đầu: chưa chọn ở V1 (YAGNI), nhưng giữ khả năng nâng cấp sau.

## Follow-up
- V1 triển khai scheduler polling trong API process.
- Khi tải tăng, cân nhắc ADR mới để tách queue worker (BullMQ) mà vẫn giữ model dữ liệu hiện tại.
