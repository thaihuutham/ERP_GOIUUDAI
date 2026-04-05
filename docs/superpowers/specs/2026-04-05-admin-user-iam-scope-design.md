# Admin/User IAM + Data Scope Design

## 1. Bối cảnh và mục tiêu
Dự án ERP hiện có role-gating theo `ADMIN/MANAGER/STAFF` và permission action-level theo module. Mục tiêu mới là chuẩn hóa mô hình phân quyền:

- Chỉ còn role nền: `ADMIN` và `USER`.
- `ADMIN` thấy toàn bộ hệ thống.
- `USER` chỉ thấy dữ liệu trong phạm vi quản lý được xác định theo cây nhân sự.
- Mọi thao tác đều đi qua permission chi tiết theo `module/action/capability`.
- Các quyền thiết lập nhạy cảm chỉ cho `ADMIN` hoặc user được cấp quyền đặc biệt.

Mục tiêu này phải đảm bảo:
- Không đổi business behavior ERP ngoài phạm vi IAM.
- Có lộ trình migration an toàn, rollback được bằng feature flag.
- Không phá vỡ vận hành hiện tại trong giai đoạn chuyển tiếp.

## 2. Quyết định đã chốt với stakeholder

### 2.1 Mô hình vai trò
- Chọn phương án: `ADMIN/USER`.
- Không giữ role nghiệp vụ `MANAGER/STAFF` như role nền để quyết định truy cập.

### 2.2 Phạm vi dữ liệu
- Scope chính theo cây nhân sự.
- Đơn vị có nhiều cấp quản lý:
  - Trưởng phòng/giám đốc: có thể xem toàn unit phụ trách.
  - Phó phòng/phó giám đốc: xem phạm vi subtree họ phụ trách.
- Dữ liệu không có owner nhân sự: dùng org-unit scope.

### 2.3 Cơ chế xác định scope
- Mặc định theo chức danh (title mapping).
- Admin có thể override scope mode riêng từng user.
- Chọn mô hình kết hợp (default theo title + override thủ công).

### 2.4 Mặc định user mới
- Mặc định self-service tối thiểu (không deny-all tuyệt đối).

### 2.5 IAM đặc quyền
- Tách quyền IAM thành:
  - `IAM_VIEW`
  - `IAM_MANAGE`
- Ràng buộc cứng:
  - Không ai được xóa/thu hồi quyền lõi của `ADMIN`.
  - Không ai được tự cấp quyền cao hơn cho chính mình.

### 2.6 Quy tắc truy cập tổng quát
- Kiểm tra theo phép giao:
  - `ALLOW = hasActionPermission AND inDataScope`

### 2.7 Ngoại lệ workflow
- Nếu user được assign làm approver cho hồ sơ ngoài scope thường:
  - Cho phép xem/xử lý đúng hồ sơ được assign (record-level exception).

## 3. Đánh giá phương án

### Phương án A: Role-light + title template
- Nhanh triển khai nhưng kém linh hoạt khi cơ cấu tổ chức phức tạp.

### Phương án B: ABAC thuần 100%
- Linh hoạt cao nhất nhưng chi phí triển khai/rủi ro lớn.

### Phương án C (được chọn): Hybrid
- Role nền `ADMIN/USER`.
- Action permission chi tiết theo policy matrix.
- Scope compiler theo cây nhân sự + org-unit + override user.
- Workflow assignment exception ở record-level.

Lý do chọn: cân bằng giữa khả năng triển khai ngắn hạn và mở rộng dài hạn.

## 4. Thiết kế logic truy cập

## 4.1 Khái niệm cốt lõi
- **Action Permission**: quyền làm gì (`VIEW/CREATE/UPDATE/DELETE/APPROVE` + capability đặc biệt).
- **Data Scope**: dữ liệu nào được thấy/chạm.
- **Capability**: quyền hệ thống nhạy cảm (IAM, security settings, workflow admin...).

## 4.2 Scope mode
Đề xuất enum:
- `SELF`
- `SUBTREE`
- `UNIT_FULL`

## 4.3 Thứ tự resolve scope
1. `userScopeOverride` (nếu có).
2. Title mapping theo cấu hình (`position -> scopeMode`).
3. Fallback `SELF`.

## 4.4 Scope data theo loại bản ghi
- Bản ghi có owner (`employeeId`, `ownerStaffId`): lọc theo tập employee trong scope.
- Bản ghi không owner nhưng có `orgUnitId/departmentId`: lọc theo unit scope.
- Bản ghi không owner và không org-unit: `ADMIN-only` (fail-safe bảo mật).

## 4.5 Rule workflow exception
Khi có task workflow assign:
- Tạo record access grant tạm (`recordType`, `recordId`, `actorId`, `expiresAt`).
- Grant chỉ mở quyền cho record đó, không mở rộng module-wide scope.

## 5. Mô hình dữ liệu IAM đề xuất

### 5.1 Bảng action grants
`iam_action_grants`
- `subjectType` (`USER` | `POSITION` | `TEMPLATE`)
- `subjectId`
- `moduleKey`
- `action`
- `effect` (`ALLOW` | `DENY`)
- `priority`
- `createdBy`, `updatedBy`, timestamps.

### 5.2 Bảng scope override user
`iam_user_scope_override`
- `userId`
- `scopeMode` (`SELF` | `SUBTREE` | `UNIT_FULL`)
- `rootOrgUnitId` (optional)
- `effectiveFrom`, `effectiveTo` (optional)
- `reason`, audit fields.

### 5.3 Bảng capability grants
`iam_capability_grants`
- `subjectType`, `subjectId`
- `capabilityKey` (`IAM_VIEW`, `IAM_MANAGE`, `SETTINGS_SECURITY_EDIT`, ...)
- `effect`, `priority`.

### 5.4 Bảng permission ceiling
`iam_permission_ceiling`
- `actorUserId`
- ceiling theo module/action/capability mà actor được phép cấp cho người khác.

### 5.5 Bảng scope cache
`iam_resolved_scope_members`
- `userId`
- `scopeVersion`
- `employeeIds[]`
- `orgUnitIds[]`
- `computedAt`, `expiresAt`.

### 5.6 Bảng record-level temporary grants
`iam_record_access_grants`
- `actorUserId`
- `recordType`
- `recordId`
- `grantReason` (`WORKFLOW_ASSIGNMENT`, ...)
- `actions[]`
- `expiresAt`
- `sourceRef` (instance/task id).

## 6. Policy engine runtime

## 6.1 Pipeline đánh giá request
1. Resolve actor identity.
2. Resolve capabilities hiệu lực.
3. Resolve action permission hiệu lực (deny overrides allow).
4. Resolve data scope hiệu lực.
5. Áp data filter vào query (read/write).
6. Kiểm tra record-level exception grant (nếu có).
7. Quyết định cuối cùng theo `AND` rule.
8. Ghi audit decision log (`allow/deny`, reason, policy version).

## 6.2 Guardrail bắt buộc
- Chặn self-elevation.
- Chặn thay đổi quyền lõi của admin bởi non-admin.
- Enforce permission ceiling cho `IAM_MANAGE`.
- Log đầy đủ before/after với immutable audit.

## 7. Contract scope theo module (high-level)
- CRM/Sales/HR/Finance/SCM/Assets/Projects: chuẩn hóa owner hoặc orgUnit field để filter scope nhất quán.
- Workflows:
  - list mặc định theo scope.
  - inbox/requests có thêm assignment-based visibility.
- Audit:
  - giữ scope theo org-unit management tree.
- Assistant:
  - dùng scope đã resolve từ IAM mới.

Lưu ý: module nào chưa có owner/orgUnit bắt buộc bổ sung metadata trước khi bật enforcement đầy đủ.

## 8. Migration và rollout

### Phase 0: Data readiness
- Chuẩn hóa org chart, manager tree, org unit mapping.
- Chuẩn hóa metadata scope trên bảng nghiệp vụ.

### Phase 1: Additive schema
- Thêm bảng IAM mới (không cắt logic cũ).
- Seed grants ban đầu từ permission hiện có.

### Phase 2: Shadow evaluation
- Chạy dual-decision: `legacyDecision` vs `newDecision`.
- Thu mismatch report theo module/action/user.

### Phase 3: Progressive enforcement
- Bật enforcement theo module qua feature flags.
- Rollout theo thứ tự rủi ro thấp -> cao.

### Phase 4: UI/ops cut-in
- UI quản trị IAM mới (`ADMIN/USER`, grants, scope override, capability).
- Quy trình vận hành + audit cho IAM changes.

### Phase 5: Legacy removal
- Tắt dần logic `MANAGER/STAFF` legacy.
- Giữ compatibility read-only ngắn hạn, sau đó dọn code.

## 9. Rollback strategy
- Rollback bằng feature flag theo module.
- Không rollback schema trừ khi sự cố nghiêm trọng.
- Dữ liệu IAM mới giữ nguyên để forensic và sửa rule.

## 10. Testing và tiêu chí nghiệm thu

## 10.1 Test bắt buộc
- Unit test policy evaluator (action/scope/capability/conflict).
- Integration test row-scope theo từng module.
- Security test cho self-elevation, admin-protection, permission ceiling.
- Workflow exception test (assigned outside scope).
- E2E role-model mới (`ADMIN/USER`) + effective access UI.

## 10.2 Tiêu chí pass
- Không có truy cập dữ liệu ngoài scope theo test matrix đã phê duyệt.
- Không có actor non-admin nào thay đổi quyền lõi admin.
- Shadow mismatch xuống ngưỡng chấp nhận trước cutover.
- Có audit trail đầy đủ cho mọi thay đổi IAM.

## 11. Non-goals giai đoạn này
- Không triển khai ABAC cực chi tiết theo mọi trường nghiệp vụ đặc thù từng màn hình.
- Không thay đổi business workflow cốt lõi ngoài phần guard quyền và scope filter.

## 12. Open items cần xác nhận trước implementation plan
- Danh sách chuẩn title mapping mặc định cho từng cấp (trưởng/phó/giám đốc/phó giám đốc).
- Danh mục capability v1 chính thức (ngoài `IAM_VIEW/IAM_MANAGE`).
- SLA recompute `resolved_scope_members` khi org chart thay đổi.
