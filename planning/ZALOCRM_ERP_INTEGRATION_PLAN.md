# ZaloCRM -> ERP Integration Plan (Multi-Account + Centralized Conversations + Assignment)

## 1) Objective
- Tích hợp năng lực từ ZaloCRM vào ERP:
  - quản lý nhiều tài khoản Zalo cá nhân,
  - quản lý hội thoại tập trung đa tài khoản,
  - admin phân quyền account cho nhân viên.
- Giữ nguyên nguyên tắc additive rollout, không phá behavior ERP hiện có.

## 2) In-Scope
- Backend data model, API, ACL enforce cho module Zalo + Conversations.
- Frontend trang quản trị tài khoản Zalo và assignment.
- Nâng cấp conversations workbench để lọc theo quyền account assignment.
- Audit log cho các hành động account/assignment quan trọng.

## 3) Out-of-Scope (Phase này)
- Không thay đổi Firestore rules/schema production.
- Không thay đổi kênh ngoài Zalo.
- Không gộp ngay vào IAM record-level chung.

## 4) Architecture Decisions
- ADR-046: dùng bảng chuyên biệt `zalo_account_assignments`.
- Quyền assignment:
  - `READ`: xem account + thread + message.
  - `CHAT`: `READ` + gửi tin nhắn.
  - `ADMIN`: `CHAT` + thao tác quản trị account/assignment.
- `ADMIN` hệ thống có full-access; `USER` bị giới hạn theo assignment active.

## 5) Data Model (API Prisma)
### 5.1 Bảng mới
- `ZaloAccountAssignment`
  - `id`, `zaloAccountId`, `userId`
  - `permissionLevel` enum: `READ|CHAT|ADMIN`
  - `assignedBy`, `assignedAt`
  - `revokedAt` nullable
  - `createdAt`, `updatedAt`

### 5.2 Index/Constraint
- unique active assignment theo (`zaloAccountId`,`userId`,`revokedAt IS NULL`) (triển khai bằng unique + app guard nếu DB không hỗ trợ partial unique).
- index cho:
  - (`userId`,`revokedAt`)
  - (`zaloAccountId`,`revokedAt`)

## 6) Backend API Design
### 6.1 Zalo account management
- Reuse + mở rộng module `zalo`:
  - `GET /api/v1/zalo/accounts`
  - `POST /api/v1/zalo/accounts`
  - `POST /api/v1/zalo/accounts/:id/login-qr`
  - `POST /api/v1/zalo/accounts/:id/reconnect`
  - `POST /api/v1/zalo/accounts/:id/disconnect`
  - `GET /api/v1/zalo/accounts/:id/status`

### 6.2 Assignment management
- API mới:
  - `GET /api/v1/zalo/accounts/:id/assignments`
  - `PUT /api/v1/zalo/accounts/:id/assignments/:userId`
  - `DELETE /api/v1/zalo/accounts/:id/assignments/:userId`
- Permission:
  - chỉ `ADMIN` hệ thống hoặc assignment `ADMIN` của account.

### 6.3 Conversations enforce
- `GET /api/v1/conversations/threads`:
  - nếu `USER`: chỉ trả thread thuộc account assigned.
- `GET /api/v1/conversations/threads/:id/messages`:
  - validate quyền `READ`.
- `POST /api/v1/conversations/threads/:id/send`:
  - validate quyền `CHAT`.

## 7) Frontend Plan
### 7.1 Trang quản trị Zalo accounts
- Tạo màn hình mới trong ERP web (route riêng trong CRM):
  - danh sách account + trạng thái kết nối,
  - thao tác QR login/reconnect/disconnect,
  - mở dialog assignment user + permission level.

### 7.2 Conversations workbench
- Giữ UI hiện tại, thêm:
  - filter account theo danh sách user được assign,
  - badge quyền (`READ/CHAT/ADMIN`) để minh bạch thao tác.
- Ẩn/disable nút gửi nếu user chỉ có `READ`.

## 8) Rollout Phases
### P0 - Foundation
- migration bảng assignment + service query helper.
- unit tests cho permission matrix.

### P1 - Read-path enforce
- filter thread/message theo assignment cho `USER`.
- smoke test không regression `ADMIN`.

### P2 - Write-path enforce
- gate send message theo quyền `CHAT`.
- audit log deny/pass decision.

### P3 - Account admin UI/API
- triển khai page quản trị account + assignment CRUD.
- e2e: admin phân account -> user thấy thread đúng phạm vi.

### P4 - Operational hardening
- metrics: số account active, reconnect fail, assignment mismatch.
- runbook section cho support.

## 9) Testing Strategy
- Unit:
  - assignment permission checker.
- API integration:
  - admin vs user visibility.
  - send message forbidden với `READ`.
- E2E web:
  - admin gán account.
  - user chỉ thấy đúng inbox được gán.
  - revoke assignment -> mất quyền ngay.

## 10) Risks + Mitigation
- Rủi ro: lọc thiếu ở 1 endpoint gây data leakage.
  - Mitigation: middleware/service guard tập trung + test matrix endpoint.
- Rủi ro: reconnect listener gây duplicate event.
  - Mitigation: idempotency key theo message externalId + unique guard.
- Rủi ro: rollout UI trước enforce backend.
  - Mitigation: enforce backend trước UI.

## 11) Implementation Order (Recommended)
1. Schema + migration + services permission.
2. Enforce read-path conversations.
3. Enforce write-path send.
4. Account assignment APIs.
5. Web admin page + conversation UX updates.
6. Regression + runbook + rollout checklist.
