# Admin/User IAM Scope Rollout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Triển khai mô hình phân quyền `ADMIN/USER` với kiểm soát truy cập theo `action permission + data scope`, có workflow exception và guardrail chống tự nâng quyền.

**Architecture:** Xây IAM core theo mô hình hybrid: role nền đơn giản (`ADMIN/USER`), grants chi tiết theo module/action/capability, scope resolver theo cây nhân sự + org-unit + user override, và record-level temporary grants cho workflow assignment. Triển khai theo incremental rollout: schema additive, shadow-eval, enforcement từng module bằng feature flag để rollback nhanh.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Next.js, Vitest, Playwright, GitHub Actions deploy flags.

---

### Task 1: Add ADR + Runtime Flags For IAM v2

**Files:**
- Create: `docs/decisions/ADR-044-ADMIN-USER-IAM-SCOPE-HYBRID.md`
- Modify: `apps/api/src/modules/settings/settings-policy.types.ts`
- Modify: `apps/api/src/common/settings/runtime-settings.service.ts`
- Test: `apps/api/test/settings-policy.service.test.ts`

**Step 1: Write the failing test**

```ts
it('parses access_security.iamV2 policy with safe defaults', async () => {
  const runtime = await service.getAccessSecurityRuntime();
  expect(runtime.iamV2.enabled).toBe(false);
  expect(runtime.iamV2.mode).toBe('SHADOW');
  expect(runtime.iamV2.enforcementModules).toEqual([]);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace @erp/api -- test/settings-policy.service.test.ts -t "iamV2"`
Expected: FAIL vì `iamV2` chưa tồn tại trong runtime policy.

**Step 3: Write minimal implementation**

```ts
// settings-policy.types.ts
iamV2: {
  enabled: boolean;
  mode: 'OFF' | 'SHADOW' | 'ENFORCE';
  enforcementModules: string[];
  protectAdminCore: boolean;
  denySelfElevation: boolean;
}
```

```ts
// runtime-settings.service.ts
iamV2: {
  enabled: this.toBool(iamV2.enabled, false),
  mode: this.readString(iamV2.mode, 'SHADOW').toUpperCase() as 'OFF' | 'SHADOW' | 'ENFORCE',
  enforcementModules: this.toStringArray(iamV2.enforcementModules).map((s) => s.toLowerCase()),
  protectAdminCore: this.toBool(iamV2.protectAdminCore, true),
  denySelfElevation: this.toBool(iamV2.denySelfElevation, true)
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test --workspace @erp/api -- test/settings-policy.service.test.ts -t "iamV2"`
Expected: PASS

**Step 5: Commit**

```bash
git add docs/decisions/ADR-044-ADMIN-USER-IAM-SCOPE-HYBRID.md apps/api/src/modules/settings/settings-policy.types.ts apps/api/src/common/settings/runtime-settings.service.ts apps/api/test/settings-policy.service.test.ts
git commit -m "feat(iam): add iam v2 runtime policy and ADR"
```

---

### Task 2: Add IAM Tables In Prisma (Additive Migration)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260405110000_add_iam_v2_tables/migration.sql`
- Test: `apps/api/test/iam-schema-contract.test.ts`

**Step 1: Write the failing test**

```ts
it('has iam_v2 tables after migration', async () => {
  const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'iam_%' ORDER BY tablename`
  );
  expect(rows.map((r) => r.tablename)).toEqual([
    'iam_action_grants',
    'iam_capability_grants',
    'iam_permission_ceiling',
    'iam_record_access_grants',
    'iam_resolved_scope_members',
    'iam_user_scope_override'
  ]);
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace @erp/api -- test/iam-schema-contract.test.ts`
Expected: FAIL do bảng chưa tồn tại.

**Step 3: Write minimal implementation**

```prisma
model IamActionGrant {
  id         String @id @default(cuid())
  tenant_Id  String
  subjectType String
  subjectId   String
  moduleKey   String
  action      PermissionAction
  effect      PermissionEffect
  priority    Int @default(100)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

```sql
CREATE TABLE "iam_action_grants" (...);
CREATE INDEX "iam_action_grants_lookup_idx" ON "iam_action_grants" ("tenant_Id", "subjectType", "subjectId", "moduleKey", "action");
```

**Step 4: Run migration and test**

Run: `npm run prisma:migrate --workspace @erp/api -- --name add_iam_v2_tables`
Expected: Migration applied successfully.

Run: `npm run test --workspace @erp/api -- test/iam-schema-contract.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260405110000_add_iam_v2_tables/migration.sql apps/api/test/iam-schema-contract.test.ts
git commit -m "feat(iam): add iam v2 persistence tables"
```

---

### Task 3: Build IAM Core Resolver Services

**Files:**
- Create: `apps/api/src/modules/iam/iam.types.ts`
- Create: `apps/api/src/modules/iam/iam-access.service.ts`
- Create: `apps/api/src/modules/iam/iam-scope.service.ts`
- Create: `apps/api/src/modules/iam/iam-ceiling.service.ts`
- Create: `apps/api/src/modules/iam/iam.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/iam-access.service.test.ts`
- Test: `apps/api/test/iam-scope.service.test.ts`

**Step 1: Write failing tests**

```ts
it('applies deny-overrides for action grants', async () => {
  const result = await service.resolveActionDecision(actor, 'crm', 'VIEW');
  expect(result.allowed).toBe(false);
  expect(result.reason).toContain('DENY_OVERRIDE');
});

it('resolves scope mode with override > title mapping > self', async () => {
  const scope = await scopeService.resolveEffectiveScope(actor);
  expect(scope.mode).toBe('UNIT_FULL');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test --workspace @erp/api -- test/iam-access.service.test.ts test/iam-scope.service.test.ts`
Expected: FAIL do service chưa tồn tại.

**Step 3: Implement minimal core services**

```ts
// iam-access.service.ts
async resolveActionDecision(actor, moduleKey, action) {
  const effects = await this.loadEffects(actor, moduleKey, action);
  if (effects.includes('DENY')) return { allowed: false, reason: 'DENY_OVERRIDE' };
  if (effects.includes('ALLOW')) return { allowed: true, reason: 'ALLOW_MATCH' };
  return { allowed: false, reason: 'NO_MATCH' };
}
```

```ts
// iam-scope.service.ts
async resolveEffectiveScope(actor) {
  const override = await this.findUserOverride(actor.userId);
  if (override) return override;
  const mapped = await this.findTitleDefault(actor.employeeId);
  return mapped ?? { mode: 'SELF' };
}
```

**Step 4: Re-run tests**

Run: `npm run test --workspace @erp/api -- test/iam-access.service.test.ts test/iam-scope.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/iam apps/api/src/app.module.ts apps/api/test/iam-access.service.test.ts apps/api/test/iam-scope.service.test.ts
git commit -m "feat(iam): add core access and scope resolvers"
```

---

### Task 4: Integrate PermissionGuard With IAM v2 + Shadow Decision Logging

**Files:**
- Modify: `apps/api/src/common/auth/permission.guard.ts`
- Modify: `apps/api/src/common/auth/permission.util.ts`
- Create: `apps/api/src/modules/iam/iam-shadow-log.service.ts`
- Test: `apps/api/test/permission.guard.test.ts`

**Step 1: Write failing tests for guard behavior**

```ts
it('denies when action allowed by legacy but denied by iam v2 in ENFORCE mode', async () => {
  await expect(guard.canActivate(ctx)).rejects.toThrow('Bạn không có quyền');
});

it('allows but logs mismatch in SHADOW mode', async () => {
  await expect(guard.canActivate(ctx)).resolves.toBe(true);
  expect(shadowLogger.log).toHaveBeenCalledWith(expect.objectContaining({ mismatch: true }));
});
```

**Step 2: Run tests and verify fail**

Run: `npm run test --workspace @erp/api -- test/permission.guard.test.ts`
Expected: FAIL do chưa tích hợp IAM v2.

**Step 3: Minimal guard integration**

```ts
const iamDecision = await this.iamAccess.evaluate({ actor, moduleKey, action, path });
if (policy.iamV2.mode === 'ENFORCE' && !iamDecision.allowed) throw new ForbiddenException(...);
if (policy.iamV2.mode === 'SHADOW') await this.shadowLog.logLegacyVsIam(...);
```

**Step 4: Re-run tests**

Run: `npm run test --workspace @erp/api -- test/permission.guard.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/common/auth/permission.guard.ts apps/api/src/common/auth/permission.util.ts apps/api/src/modules/iam/iam-shadow-log.service.ts apps/api/test/permission.guard.test.ts
git commit -m "feat(iam): wire permission guard to iam v2 with shadow mode"
```

---

### Task 5: Add Scope Filter Helpers And Apply To Pilot Modules (CRM/Sales/Finance)

**Files:**
- Create: `apps/api/src/modules/iam/iam-scope-filter.service.ts`
- Modify: `apps/api/src/modules/crm/crm.service.ts`
- Modify: `apps/api/src/modules/sales/sales.service.ts`
- Modify: `apps/api/src/modules/finance/finance.service.ts`
- Test: `apps/api/test/crm.api-flow.test.ts`
- Test: `apps/api/test/sales.service.test.ts`
- Test: `apps/api/test/finance.service.test.ts`

**Step 1: Write failing tests (outside scope data should be hidden)**

```ts
it('crm list excludes customers outside resolved scope', async () => {
  const data = await service.listCustomers(query, {}, undefined);
  expect(data.items.some((x) => x.ownerStaffId === 'outside_manager')).toBe(false);
});
```

```ts
it('sales list excludes orders outside scope employee ids', async () => {
  const data = await service.listOrders(query);
  expect(data.items.every((x) => ['emp_in_scope_1', 'emp_in_scope_2'].includes(x.employeeId))).toBe(true);
});
```

**Step 2: Run tests and verify fail**

Run: `npm run test --workspace @erp/api -- test/crm.api-flow.test.ts test/sales.service.test.ts test/finance.service.test.ts`
Expected: FAIL vì chưa áp scope filter.

**Step 3: Implement minimal filtering**

```ts
const scope = await this.iamScopeFilter.resolveForCurrentActor('crm');
if (scope.mode !== 'COMPANY') {
  where.ownerStaffId = { in: scope.actorIds };
}
```

```ts
const scope = await this.iamScopeFilter.resolveForCurrentActor('sales');
if (!scope.companyWide) where.employeeId = { in: scope.employeeIds };
```

**Step 4: Re-run tests**

Run: `npm run test --workspace @erp/api -- test/crm.api-flow.test.ts test/sales.service.test.ts test/finance.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/iam/iam-scope-filter.service.ts apps/api/src/modules/crm/crm.service.ts apps/api/src/modules/sales/sales.service.ts apps/api/src/modules/finance/finance.service.ts apps/api/test/crm.api-flow.test.ts apps/api/test/sales.service.test.ts apps/api/test/finance.service.test.ts
git commit -m "feat(iam): enforce row scope filters for crm sales finance"
```

---

### Task 6: Implement Workflow Record-Level Exception Grants

**Files:**
- Modify: `apps/api/src/modules/workflows/workflows.service.ts`
- Modify: `apps/api/src/modules/workflows/workflows.controller.ts`
- Modify: `apps/api/src/modules/iam/iam-access.service.ts`
- Test: `apps/api/test/workflows.service.test.ts`

**Step 1: Write failing tests for assignment exception**

```ts
it('allows approver to view assigned instance outside normal scope', async () => {
  const result = await service.getInstanceDetail(instanceIdOutsideScope);
  expect(result.id).toBe(instanceIdOutsideScope);
});
```

```ts
it('does not allow unrelated records outside scope', async () => {
  await expect(service.getInstanceDetail(unrelatedInstance)).rejects.toThrow();
});
```

**Step 2: Run tests and verify fail**

Run: `npm run test --workspace @erp/api -- test/workflows.service.test.ts`
Expected: FAIL do chưa có temporary grant check.

**Step 3: Implement minimal exception grant flow**

```ts
// on assignment creation
await this.iamAccess.grantRecordAccess({ actorUserId, recordType: 'WORKFLOW_INSTANCE', recordId: instance.id, actions: ['VIEW', 'APPROVE'], expiresAt });

// on detail/list decision
const allowed = await this.iamAccess.canAccessRecord(actor, 'WORKFLOW_INSTANCE', instanceId, 'VIEW');
if (!allowed) throw new ForbiddenException(...);
```

**Step 4: Re-run tests**

Run: `npm run test --workspace @erp/api -- test/workflows.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/workflows/workflows.service.ts apps/api/src/modules/workflows/workflows.controller.ts apps/api/src/modules/iam/iam-access.service.ts apps/api/test/workflows.service.test.ts
git commit -m "feat(iam): support workflow record-level access exceptions"
```

---

### Task 7: Add IAM Guardrails In Settings Enterprise APIs

**Files:**
- Modify: `apps/api/src/modules/settings/settings-enterprise.service.ts`
- Modify: `apps/api/src/modules/settings/settings.controller.ts`
- Test: `apps/api/test/settings-enterprise.service.test.ts`

**Step 1: Write failing guardrail tests**

```ts
it('prevents non-admin from revoking admin core permissions', async () => {
  await expect(service.updateUserPermissionOverrides(adminId, payloadByManager)).rejects.toThrow('ADMIN core rights');
});

it('prevents actor from self-elevation', async () => {
  await expect(service.updateUserPermissionOverrides(actorId, elevatingPayload)).rejects.toThrow('self elevation');
});
```

**Step 2: Run tests and verify fail**

Run: `npm run test --workspace @erp/api -- test/settings-enterprise.service.test.ts`
Expected: FAIL do chưa có guardrail.

**Step 3: Implement minimal guardrails**

```ts
if (targetIsAdmin && requesterRole !== 'ADMIN') throw new ForbiddenException('Cannot modify ADMIN core rights');
if (targetUserId === requesterUserId && this.isElevation(payload, requesterCeiling)) throw new ForbiddenException('Self elevation denied');
```

**Step 4: Re-run tests**

Run: `npm run test --workspace @erp/api -- test/settings-enterprise.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/settings/settings-enterprise.service.ts apps/api/src/modules/settings/settings.controller.ts apps/api/test/settings-enterprise.service.test.ts
git commit -m "feat(iam): enforce admin-protection and self-elevation guardrails"
```

---

### Task 8: Add Scope Override + Title Mapping Admin APIs

**Files:**
- Modify: `apps/api/src/modules/settings/settings-enterprise.service.ts`
- Modify: `apps/api/src/modules/settings/settings.controller.ts`
- Test: `apps/api/test/settings-enterprise.service.test.ts`

**Step 1: Write failing API/service tests**

```ts
it('updates user scope override and returns effective scope', async () => {
  const result = await service.updateUserScopeOverride(userId, { scopeMode: 'UNIT_FULL' });
  expect(result.scopeMode).toBe('UNIT_FULL');
});

it('updates title mapping defaults for scope mode', async () => {
  const result = await service.updateTitleScopeMapping({ titlePattern: 'PHO PHONG', scopeMode: 'SUBTREE' });
  expect(result.scopeMode).toBe('SUBTREE');
});
```

**Step 2: Run tests and verify fail**

Run: `npm run test --workspace @erp/api -- test/settings-enterprise.service.test.ts -t "scope override|title mapping"`
Expected: FAIL do endpoint/service chưa có.

**Step 3: Implement minimal endpoints and service methods**

```ts
@Put('iam/users/:userId/scope-override')
updateUserScopeOverride(...)

@Put('iam/title-scope-mapping')
updateTitleScopeMapping(...)
```

**Step 4: Re-run tests**

Run: `npm run test --workspace @erp/api -- test/settings-enterprise.service.test.ts -t "scope override|title mapping"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/settings/settings-enterprise.service.ts apps/api/src/modules/settings/settings.controller.ts apps/api/test/settings-enterprise.service.test.ts
git commit -m "feat(iam): add scope override and title mapping admin apis"
```

---

### Task 9: Add IAM v2 Mismatch Report API (Shadow Observability)

**Files:**
- Create: `apps/api/src/modules/iam/iam-shadow-report.service.ts`
- Modify: `apps/api/src/modules/settings/settings.controller.ts`
- Modify: `apps/api/src/modules/settings/settings-enterprise.service.ts`
- Test: `apps/api/test/permission.guard.test.ts`
- Test: `apps/api/test/settings-enterprise.service.test.ts`

**Step 1: Write failing tests**

```ts
it('records legacy vs iam decision mismatches with module/action dimensions', async () => {
  expect(report.items[0]).toEqual(expect.objectContaining({ moduleKey: 'crm', action: 'VIEW' }));
});
```

**Step 2: Run tests and verify fail**

Run: `npm run test --workspace @erp/api -- test/permission.guard.test.ts test/settings-enterprise.service.test.ts -t "mismatch"`
Expected: FAIL

**Step 3: Implement minimal report pipeline**

```ts
await shadowLog.write({ actorId, moduleKey, action, legacyAllowed, iamAllowed, mismatch: legacyAllowed !== iamAllowed });

@Get('permissions/iam-v2/mismatch-report')
getIamMismatchReport(...) { return service.getIamMismatchReport(...); }
```

**Step 4: Re-run tests**

Run: `npm run test --workspace @erp/api -- test/permission.guard.test.ts test/settings-enterprise.service.test.ts -t "mismatch"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/iam/iam-shadow-report.service.ts apps/api/src/modules/settings/settings.controller.ts apps/api/src/modules/settings/settings-enterprise.service.ts apps/api/test/permission.guard.test.ts apps/api/test/settings-enterprise.service.test.ts
git commit -m "feat(iam): add shadow mismatch reporting"
```

---

### Task 10: Frontend IAM Admin UI + Access Policy Adaptation

**Files:**
- Modify: `apps/web/components/settings-center.tsx`
- Modify: `apps/web/components/settings-position-detail-page.tsx`
- Modify: `apps/web/components/access-policy-context.tsx`
- Modify: `apps/web/lib/access-policy.ts`
- Test: `apps/web/lib/__tests__/access-policy.test.ts`
- Test: `apps/web/e2e/tests/access-policy-hardening.spec.ts`
- Test: `apps/web/e2e/tests/settings-center-reports.spec.ts`

**Step 1: Write failing frontend tests**

```ts
it('treats MANAGER/STAFF legacy roles as USER in iam v2 mode', () => {
  const result = mapRuntimeRoleToAccessRole('MANAGER', true);
  expect(result).toBe('USER');
});
```

```ts
test('shows iam scope override editor only for IAM_MANAGE users', async ({ page }) => {
  await expect(page.locator('[data-testid="iam-scope-override-editor"]')).toBeVisible();
});
```

**Step 2: Run tests and verify fail**

Run: `npm run test:unit --workspace @erp/web`
Expected: FAIL on new IAM v2 test cases.

Run: `CI=1 PLAYWRIGHT_PORT=4310 npx playwright test apps/web/e2e/tests/access-policy-hardening.spec.ts apps/web/e2e/tests/settings-center-reports.spec.ts --config=apps/web/e2e/playwright.config.ts --reporter=line`
Expected: FAIL do UI chưa có IAM controls mới.

**Step 3: Implement minimal UI changes**

```ts
const accessRole = iamV2Enabled ? (role === 'ADMIN' ? 'ADMIN' : 'USER') : role;
```

```tsx
{canCapability('IAM_MANAGE') && (
  <section data-testid="iam-scope-override-editor">...</section>
)}
```

**Step 4: Re-run tests**

Run: `npm run test:unit --workspace @erp/web`
Expected: PASS

Run: `CI=1 PLAYWRIGHT_PORT=4310 npx playwright test apps/web/e2e/tests/access-policy-hardening.spec.ts apps/web/e2e/tests/settings-center-reports.spec.ts --config=apps/web/e2e/playwright.config.ts --reporter=line`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/settings-center.tsx apps/web/components/settings-position-detail-page.tsx apps/web/components/access-policy-context.tsx apps/web/lib/access-policy.ts apps/web/lib/__tests__/access-policy.test.ts apps/web/e2e/tests/access-policy-hardening.spec.ts apps/web/e2e/tests/settings-center-reports.spec.ts
git commit -m "feat(web): add iam v2 admin ui and access policy mapping"
```

---

### Task 11: System Stability Gate + Rollout Docs

**Files:**
- Modify: `docs/deployment/VM_AUTODEPLOY.md`
- Modify: `planning/CURRENT_TASK.md`
- Modify: `.agent/memory/CONTEXT_SNAPSHOT.md`
- Create: `.agent/sessions/YYYY-MM-DD_HHMM_codex.md`

**Step 1: Add failing checklist item in rollout docs review (manual gate)**

Document expected missing items first:
- `IAM_V2_ENABLED`
- `IAM_V2_MODE`
- `IAM_V2_ENFORCEMENT_MODULES`
- rollback-by-module procedure.

**Step 2: Run doc lint sanity (manual)**

Run: `rg -n "IAM_V2|rollback|shadow" docs/deployment/VM_AUTODEPLOY.md planning/CURRENT_TASK.md .agent/memory/CONTEXT_SNAPSHOT.md`
Expected: initially missing lines.

**Step 3: Update docs and handoff state**

```md
- IAM rollout flags + safe default OFF/SHADOW
- module-by-module cutover + rollback
- post-deploy smoke for mismatch report endpoint
```

**Step 4: Run final verification commands**

Run:
- `docker ps --format 'table {{.Names}}\t{{.Status}}'`
- `DATABASE_URL=postgresql://erp:erp@localhost:55432/erp_retail npm run prisma:migrate:status --workspace @erp/api`
- `npm run lint --workspace @erp/api`
- `npm run build --workspace @erp/api`
- `npm run lint --workspace @erp/web`
- `npm run build --workspace @erp/web`
- targeted tests/e2e from tasks above

Expected: PASS all or explicit blocker report.

**Step 5: Commit**

```bash
git add docs/deployment/VM_AUTODEPLOY.md planning/CURRENT_TASK.md .agent/memory/CONTEXT_SNAPSHOT.md .agent/sessions
git commit -m "docs(ops): add iam v2 rollout and verification handoff"
```

---

## Implementation Notes (apply throughout)
- DRY: gom logic lọc scope vào service dùng chung (`iam-scope-filter.service.ts`), tránh lặp per module.
- YAGNI: chưa cắt enum `UserRole` ngay trong phase đầu; chỉ map runtime sang `ADMIN/USER` để giảm rủi ro.
- TDD bắt buộc: test fail trước, code tối thiểu, pass test rồi commit.
- Commit nhỏ, một ý thay đổi mỗi commit để dễ rollback/cherry-pick.

## Suggested Execution Order
1. Task 1 -> 4 (foundation + guard).
2. Task 5 -> 6 (data scope + workflow exception).
3. Task 7 -> 9 (iam admin + observability).
4. Task 10 -> 11 (UI + rollout/handoff).

