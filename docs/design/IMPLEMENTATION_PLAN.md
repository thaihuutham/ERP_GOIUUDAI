# ERP GOIUUDAI — Frontend Redesign Implementation Plan v1.0

> Kế hoạch triển khai chi tiết từng bước, đồng bộ toàn dự án.
> Mọi agent session tuân theo thứ tự và spec tại `docs/design/DESIGN_SYSTEM.md`.
> Last updated: 2026-04-03

---

## Decisions

| # | Quyết định | Giá trị |
|---|-----------|---------|
| D1 | Scope | Đồng bộ toàn dự án, bắt đầu từ nền tảng |
| D2 | Dark mode | Chưa cần, chuẩn bị token cho tương lai |
| D3 | Sidebar | Nhóm 4 category: Kinh doanh / Nhân sự / Tài chính-VH / Hệ thống |
| D4 | Color | Giữ green primary, admin override qua settings |
| D5 | Chart library | Recharts (nhẹ, React-native, composable) |
| D6 | Design spec | `docs/design/DESIGN_SYSTEM.md` |

---

## Phase 1: CSS Architecture — Design Token Foundation

**Mục tiêu**: Tách `globals.css` 37KB monolithic thành token system có tổ chức.

### 1.1. Tạo CSS token file

- **File**: `apps/web/app/styles/tokens.css`
- **Nội dung**: Tất cả CSS custom properties từ Design System spec section 2-4
- Colors (primary palette, neutral, semantic, surfaces, borders, text)
- Typography (font families, type scale)
- Spacing scale
- Border radius
- Shadows
- Animation timing functions
- Module accent colors

### 1.2. Tạo Layout CSS

- **File**: `apps/web/app/styles/layout.css`
- **Nội dung**: Shell grid, sidebar, toolbar, breadcrumb
- Tách từ `globals.css` lines 66-260 (shell/sidebar/toolbar)
- Thêm sidebar grouped navigation styles
- Thêm breadcrumb styles

### 1.3. Tạo Components CSS

- **File**: `apps/web/app/styles/components.css`
- **Nội dung**: Buttons, cards, badges, pills, banners
- Tách từ `globals.css` lines 872-1003 (buttons, banners)
- Tách card styles (metric-card, module-card, action-card)
- Thêm badge/pill component styles
- Thêm avatar, empty-state, skeleton styles

### 1.4. Tạo Tables CSS

- **File**: `apps/web/app/styles/tables.css`
- **Nội dung**: Data tables, pagination, selection, bulk actions
- Tách từ `globals.css` lines 739-794 (data-table, pagination)
- Thêm row selection styles
- Thêm column settings styles

### 1.5. Tạo Forms CSS

- **File**: `apps/web/app/styles/forms.css`
- **Nội dung**: Form fields, filter bars, validation
- Tách từ `globals.css` lines 808-857 (field, inputs)
- Tách filter bar styles (584-636)
- Thêm form section grouping styles

### 1.6. Tạo Animations CSS

- **File**: `apps/web/app/styles/animations.css`
- **Nội dung**: Keyframes, transitions, stagger patterns
- Tất cả animation definitions từ Design System spec section 8

### 1.7. Tạo Module CSS files

Tách CSS theo module ra files riêng:
- `apps/web/app/styles/modules/dashboard.css`
- `apps/web/app/styles/modules/crm.css`
- `apps/web/app/styles/modules/sales.css`
- `apps/web/app/styles/modules/hr.css`
- `apps/web/app/styles/modules/finance.css`
- `apps/web/app/styles/modules/scm.css`
- `apps/web/app/styles/modules/workflows.css`
- `apps/web/app/styles/modules/settings.css`
- `apps/web/app/styles/modules/assistant.css`
- `apps/web/app/styles/modules/audit.css`

### 1.8. Tạo Responsive CSS

- **File**: `apps/web/app/styles/responsive.css`
- **Nội dung**: Tất cả media queries tập trung
- Tách từ `globals.css` lines 1378-1543

### 1.9. Cập nhật globals.css

- Thay thế toàn bộ nội dung bằng:
  - CSS reset
  - Google Fonts import
  - `@import` các file style mới
  - Base typography

### 1.10. Verify Phase 1

- `npm run lint --workspace @erp/web`
- `npm run build --workspace @erp/web`
- Visual comparison: tất cả trang phải giữ nguyên giao diện (refactor CSS only)
- Toàn bộ e2e test phải pass

---

## Phase 2: UI Component Library

**Mục tiêu**: Xây base components tái sử dụng, thay thế inline styles.

### 2.1. Install Recharts

```bash
npm install recharts --workspace @erp/web
```

### 2.2. Base Components

**Priority order** (xây components dùng nhiều nhất trước):

| # | Component | File | Mô tả |
|---|-----------|------|--------|
| 1 | `Badge` | `components/ui/badge.tsx` | Status pills với semantic variants |
| 2 | `Breadcrumb` | `components/ui/breadcrumb.tsx` | Navigation trail |
| 3 | `Tabs` | `components/ui/tabs.tsx` | Underline tab navigation |
| 4 | `EmptyState` | `components/ui/empty-state.tsx` | No-data placeholder |
| 5 | `Skeleton` | `components/ui/skeleton.tsx` | Loading placeholder |
| 6 | `StatCard` | `components/ui/stat-card.tsx` | Metric display with icon + trend |
| 7 | `Toast` | `components/ui/toast.tsx` | Notifications feedback |
| 8 | `Modal` | `components/ui/modal.tsx` | Dialog/confirm patterns |
| 9 | `Dropdown` | `components/ui/dropdown.tsx` | Menu, action dropdown |
| 10 | `AreaChart` | `components/ui/charts/area-chart.tsx` | Recharts wrapper |
| 11 | `BarChart` | `components/ui/charts/bar-chart.tsx` | Recharts wrapper |
| 12 | `PieChart` | `components/ui/charts/pie-chart.tsx` | Recharts wrapper |

### 2.3. Enhanced Existing Components

| Component | Cải tiến |
|-----------|---------|
| `standard-data-table.tsx` | Thêm skeleton loading, empty state, column settings |
| `side-panel.tsx` | Thêm animation (slide from right), focus trap |

### 2.4. Verify Phase 2

- `npm run lint --workspace @erp/web`
- `npm run build --workspace @erp/web`
- Tạo trang test `/modules/settings/design-preview` để preview tất cả components

---

## Phase 3: Sidebar Redesign — Grouped Navigation

**Mục tiêu**: Tổ chức lại sidebar thành 4 nhóm chức năng.

### 3.1. Tạo sidebar config

- **File**: `apps/web/lib/sidebar-config.ts`
- Nội dung: `SIDEBAR_GROUPS` array theo Design System spec section 6.3
- Mapping icons, RBAC filters, enabled module filters

### 3.2. Cập nhật AppShell sidebar rendering

- **File**: `apps/web/components/app-shell.tsx`
- Thay thế current flat list rendering bằng grouped rendering
- Group titles styled theo spec
- HR flat inline (không cần expand/collapse wrapper ngoài)
- AI Assistant giữ expand/collapse
- RBAC + enabledModules filter theo group

### 3.3. Thêm Breadcrumb vào AppShell

- Render breadcrumb dưới toolbar trên mọi trang (trừ Dashboard)
- Auto-generate từ pathname

### 3.4. Sidebar collapsed mode

- 64px width
- Icon + tooltip
- Group titles ẩn

### 3.5. Verify Phase 3

- `npm run lint --workspace @erp/web`
- `npm run build --workspace @erp/web`
- E2E: verify navigation flow cho 3 roles
- Visual: sidebar grouping hiển thị đúng

---

## Phase 4: Dashboard Redesign

**Mục tiêu**: Dashboard giàu thông tin, actionable, có biểu đồ thật.

### 4.1. Cập nhật HomeDashboard

- **File**: `apps/web/components/home-dashboard.tsx`
- Welcome banner với quick actions
- 4 metric cards với trend indicator
- AreaChart doanh thu 6 tháng (Recharts)
- Quick tasks panel (đơn cần duyệt, hóa đơn quá hạn)
- Recent activity feed
- Module card grid (compact)

### 4.2. Dashboard API

- Dùng existing `/reports/overview` endpoint
- Thêm fetch recent activities (nếu audit API hỗ trợ)

### 4.3. Dashboard animations

- Metric cards stagger entrance
- Chart fade-in
- Activity feed slide up

### 4.4. Verify Phase 4

- `npm run lint --workspace @erp/web`
- `npm run build --workspace @erp/web`
- E2E dashboard test vẫn pass

---

## Phase 5: Module Page Polish

**Mục tiêu**: Áp dụng design system cho từng module page.

### 5.1. Module workbench template

Chuẩn hóa layout pattern cho mọi module:
- Breadcrumb → Page header → Tabs → Filter → Table → Pagination

### 5.2. Cải thiện từng module (thứ tự ưu tiên)

| # | Module | Component chính | Cải thiện |
|---|--------|----------------|----------|
| 1 | CRM | `crm-operations-board.tsx` | Badge, filter, table polish |
| 2 | Sales | `sales-operations-board.tsx` | Approval flow, status pills |
| 3 | HR | `hr-operations-board.tsx` + sections | Consistent section layout |
| 4 | Finance | `finance-operations-board.tsx` | Chart integration, status pills |
| 5 | SCM | `scm-operations-board.tsx` | Table polish |
| 6 | Workflows | `workflows-operations-board.tsx` | Builder canvas polish |
| 7 | Settings | `settings-center.tsx` | Theme customization section |
| 8 | Assistant | `assistant/*.tsx` | Consistent with system |
| 9 | Audit | `audit-operations-board.tsx` | Timeline view |

### 5.3. Settings Theme Section

- **File**: `apps/web/components/settings-center.tsx` (section `branding`)
- Thêm color picker cho `primaryColor`
- Preview panel hiển thị sidebar/button với màu mới
- Lưu vào `PUT /settings/domains/branding`

### 5.4. Verify Phase 5

- `npm run lint --workspace @erp/web`
- `npm run build --workspace @erp/web`
- Toàn bộ e2e suite pass
- Visual regression check

---

## Phase 6: Component Splitting (Code Quality)

**Mục tiêu**: Tách các file quá lớn để dễ maintain.

### 6.1. Tách Settings Center (123KB)

```
components/settings/
├── settings-shell.tsx          # Layout + tab navigation
├── settings-organization.tsx   # Org profile domain
├── settings-branding.tsx       # Theme + branding
├── settings-locale.tsx         # Timezone, currency, date format
├── settings-integrations.tsx   # Integration keys
├── settings-hr-policies.tsx    # HR policies
├── settings-access.tsx         # Access security
├── settings-notifications.tsx  # Notification config
└── settings-custom-fields.tsx  # Keep existing
```

### 6.2. Tách CRM Operations (83KB)

```
components/crm/
├── crm-shell.tsx               # Layout + sub-navigation
├── crm-contacts-tab.tsx        # Contacts table
├── crm-interactions-tab.tsx    # Interactions
├── crm-payments-tab.tsx        # Payments
└── crm-analytics-tab.tsx       # Analytics/charts
```

### 6.3. Tách HR Regulation (74KB)

```
components/hr/
├── hr-regulation-shell.tsx     # Tabs layout
├── hr-regulation-forms-tab.tsx # Biểu mẫu submissions
├── hr-regulation-scores-tab.tsx # Điểm ngày
└── hr-regulation-pip-tab.tsx   # PIP cases
```

### 6.4. Tách Workflows (63KB)

```
components/workflows/
├── workflows-shell.tsx         # Layout
├── workflows-definitions.tsx   # Definition CRUD
├── workflows-instances.tsx     # Running instances
└── workflows-builder.tsx       # Visual builder
```

### 6.5. Tách module-definitions.ts (90KB)

```
lib/module-definitions/
├── index.ts          # Re-export all
├── crm.ts
├── sales.ts
├── catalog.ts
├── hr.ts
├── finance.ts
├── scm.ts
├── assets.ts
├── projects.ts
├── workflows.ts
└── notifications.ts
```

### 6.6. Verify Phase 6

- `npm run lint --workspace @erp/web`
- `npm run build --workspace @erp/web`
- Toàn bộ e2e suite pass
- Không đổi behavior — refactor code only

---

## Safety Rules

> [!CAUTION]
> Áp dụng nghiêm ngặt trong suốt quá trình triển khai:

1. **Không đổi business logic** — chỉ thay đổi UI/CSS/layout
2. **Không đổi API contract** — request/response shapes giữ nguyên
3. **Không đổi database schema** — không migration mới
4. **Mỗi phase verify bằng System Stability Gate** trước khi tiến phase tiếp
5. **Visual regression**: screenshot before/after cho mỗi change lớn
6. **Backward compatible**: e2e hiện có phải pass (cập nhật selector nếu cần)
7. **Commit checkpoint** sau mỗi phase hoàn tất

---

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| Phase 1: CSS Architecture | Medium | None |
| Phase 2: UI Component Library | Medium | Phase 1 |
| Phase 3: Sidebar Redesign | Small | Phase 1 |
| Phase 4: Dashboard Redesign | Medium | Phase 1 + 2 |
| Phase 5: Module Page Polish | Large | Phase 1 + 2 + 3 |
| Phase 6: Component Splitting | Large | Phase 5 |

---

## Reference Documents

| Document | Path | Purpose |
|----------|------|---------|
| Design System | `docs/design/DESIGN_SYSTEM.md` | Single source of truth for design |
| This plan | `docs/design/IMPLEMENTATION_PLAN.md` | Execution roadmap |
| Project overview | `docs/specs/PROJECT_OVERVIEW.md` | Business context |
| Conventions | `docs/specs/CONVENTIONS.md` | Coding standards |
| AGENTS.md | `AGENTS.md` | Agent rules |

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-04-03 | Antigravity | Initial v1.0 — complete 6-phase plan |
