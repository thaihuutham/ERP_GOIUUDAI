# ERP GOIUUDAI — Design System Specification v1.0

> Tài liệu thiết kế gốc cho toàn bộ frontend ERP.
> Mọi session agent và developer phải tuân theo spec này khi thay đổi UI.
> Last updated: 2026-04-03

---

## 1. Design Principles

### 1.1. Nguyên tắc cốt lõi

| # | Nguyên tắc | Giải thích |
|---|-----------|------------|
| P1 | **Clarity over cleverness** | Giao diện rõ ràng, không cần giải thích. Icon luôn đi kèm text label. |
| P2 | **Progressive disclosure** | Hiển thị thông tin cần thiết trước, chi tiết ẩn sau click/expand. |
| P3 | **Consistent patterns** | Cùng loại thao tác → cùng pattern UI trên mọi module. |
| P4 | **Minimal cognitive load** | Trang không quá 3 level depth, bảng không quá 8 cột mặc định. |
| P5 | **Non-IT friendly** | Không hiển thị JSON, ID thô, hoặc thuật ngữ kỹ thuật. |
| P6 | **Responsive first** | Desktop → Tablet → Mobile (progressive collapse). |

### 1.2. Đối tượng người dùng

| Role | Mô tả | Tần suất | Mức kỹ thuật |
|------|--------|----------|-------------|
| ADMIN | Quản trị hệ thống, 1-2 người | Hằng ngày | Trung bình |
| MANAGER | Quản lý phòng ban, 5-8 người | Hằng ngày | Thấp |
| STAFF | Nhân viên vận hành, ~40 người | Hằng ngày | Thấp |

---

## 2. Color System

### 2.1. Design Tokens — Default "Premium Green"

> Admin có thể override primary palette qua Settings > Giao diện.
> Cơ chế: CSS custom properties set tại `:root` từ runtime settings API.

```css
:root {
  /* ══════ Primary Palette (admin-overridable via --primary) ══════ */
  --primary-50:  #ecfdf5;
  --primary-100: #d1fae5;
  --primary-200: #a7f3d0;
  --primary-300: #6ee7b7;
  --primary-400: #34d399;
  --primary-500: #10b981;   /* Default primary */
  --primary-600: #059669;
  --primary-700: #047857;
  --primary-800: #065f46;
  --primary-900: #064e3b;

  /* Runtime override entry point — set by JS from settings */
  --primary:       var(--primary-700);
  --primary-hover: var(--primary-800);
  --primary-soft:  var(--primary-50);
  --primary-muted: var(--primary-100);
  --primary-text:  var(--primary-900);

  /* ══════ Neutral Palette (không override) ══════ */
  --gray-25:  #fcfcfd;
  --gray-50:  #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;

  /* ══════ Semantic Colors ══════ */
  --success:     #059669;
  --success-bg:  #ecfdf5;
  --success-border: #a7f3d0;

  --warning:     #d97706;
  --warning-bg:  #fffbeb;
  --warning-border: #fde68a;

  --danger:      #dc2626;
  --danger-bg:   #fef2f2;
  --danger-border: #fecaca;

  --info:        #2563eb;
  --info-bg:     #eff6ff;
  --info-border: #bfdbfe;

  /* ══════ Surfaces ══════ */
  --bg-app:      #f8fafc;
  --bg-sidebar:  #ffffff;
  --bg-card:     #ffffff;
  --bg-elevated: #ffffff;
  --bg-hover:    var(--gray-50);
  --bg-active:   var(--primary-50);

  /* ══════ Borders ══════ */
  --border-default: var(--gray-200);
  --border-light:   var(--gray-100);
  --border-focus:   var(--primary-500);

  /* ══════ Text ══════ */
  --text-primary:   var(--gray-900);
  --text-secondary: var(--gray-600);
  --text-muted:     var(--gray-400);
  --text-inverse:   #ffffff;
  --text-link:      var(--primary-700);
}
```

### 2.2. Admin Color Override — Runtime Mechanism

```
Settings > Giao diện > Màu chủ đạo
  → Lưu vào domain `branding.primaryColor`
  → Runtime settings API trả `branding.primaryColor`
  → AppShell JS set `document.documentElement.style.setProperty('--primary', color)`
  → Cần auto-generate --primary-hover, --primary-soft từ base color
```

Hệ thống đã có sẵn cơ chế này qua `runtimePayload?.branding?.primaryColor`.

### 2.3. Module Accent Colors

Mỗi module có accent riêng để phân biệt visual trên sidebar/header:

| Module Group | Accent | CSS Variable |
|-------------|--------|-------------|
| Kinh doanh | Emerald | `--accent-business: #059669` |
| Nhân sự | Teal | `--accent-hr: #0d9488` |
| Tài chính & Vận hành | Blue | `--accent-finance: #2563eb` |
| Hệ thống | Slate | `--accent-system: #475569` |

---

## 3. Typography

### 3.1. Font Stack

```css
--font-display: 'Plus Jakarta Sans', 'Manrope', -apple-system, sans-serif;
--font-body:    'Inter', 'Manrope', -apple-system, sans-serif;
--font-mono:    'JetBrains Mono', 'Fira Code', monospace;
```

### 3.2. Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-2xl` | 1.5rem (24px) | 700 | 1.3 | Page title (H1) |
| `--text-xl` | 1.25rem (20px) | 600 | 1.3 | Section title (H2) |
| `--text-lg` | 1.125rem (18px) | 600 | 1.4 | Sub-section (H3) |
| `--text-base` | 0.875rem (14px) | 400 | 1.5 | Body text, table cells |
| `--text-sm` | 0.8125rem (13px) | 400 | 1.5 | Secondary text, labels |
| `--text-xs` | 0.75rem (12px) | 500 | 1.4 | Captions, badges |
| `--text-xxs` | 0.6875rem (11px) | 500 | 1.3 | Metadata, timestamps |

> **Quy tắc**: Body text toàn hệ thống dùng 14px. Không dùng font-size < 11px.

---

## 4. Spacing & Layout

### 4.1. Spacing Scale (4px base)

```css
--space-0:  0;
--space-1:  0.25rem;  /* 4px */
--space-2:  0.5rem;   /* 8px */
--space-3:  0.75rem;  /* 12px */
--space-4:  1rem;     /* 16px */
--space-5:  1.25rem;  /* 20px */
--space-6:  1.5rem;   /* 24px */
--space-8:  2rem;     /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
```

### 4.2. Border Radius

```css
--radius-sm:   4px;   /* Badges, pills nhỏ */
--radius-md:   6px;   /* Buttons, inputs */
--radius-lg:   8px;   /* Cards, panels */
--radius-xl:   12px;  /* Modals, featured cards */
--radius-2xl:  16px;  /* Hero sections */
--radius-full: 9999px; /* Avatars, pills */
```

### 4.3. Shadows

```css
--shadow-xs:  0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-sm:  0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
--shadow-md:  0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
--shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
--shadow-xl:  0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
```

### 4.4. Shell Layout

```
┌──────────────────────────────────────────────┐
│ Sidebar                    Main Area         │
│ ┌──────────┐ ┌──────────────────────────────┐│
│ │ Brand    │ │ Toolbar (title + actions)    ││
│ │ 240px    │ │                              ││
│ │          │ │ Content Area                 ││
│ │ Nav      │ │ (padding: 24px 32px)         ││
│ │ Groups   │ │                              ││
│ │          │ │                              ││
│ │ Footer   │ │                              ││
│ └──────────┘ └──────────────────────────────┘│
└──────────────────────────────────────────────┘

Sidebar width:     240px (expanded) / 64px (collapsed)
Toolbar height:    ~64px
Content padding:   24px 32px (desktop), 16px (mobile)
```

---

## 5. Component Specifications

### 5.1. Button

**Variants:**
- `primary` — filled green, white text
- `secondary` — outlined, green border
- `ghost` — transparent, subtle hover
- `danger` — filled red, white text
- `icon` — square, icon-only

**Sizes:** `sm` (28px), `md` (36px), `lg` (44px)

**States:** default, hover, active (scale 0.97), focus (ring), disabled (opacity 0.5)

```html
<button class="btn btn-primary btn-md">
  <Icon /> Label
</button>
```

### 5.2. Card

**Variants:**
- `base` — white bg, border, basic padding
- `metric` — with colored left border accent
- `interactive` — hover lift + border color change
- `featured` — gradient bg (primary-50 → white)

### 5.3. Badge / Status Pill

```html
<span class="badge badge-success">Đã duyệt</span>
<span class="badge badge-warning">Chờ duyệt</span>
<span class="badge badge-danger">Từ chối</span>
<span class="badge badge-neutral">Nháp</span>
```

**Mapping semantic:**
| Status | Badge variant | Màu nền | Màu text |
|--------|-------------|---------|---------|
| Active/Approved/Done | `success` | success-bg | success |
| Pending/Draft/New | `warning` | warning-bg | warning |
| Rejected/Error/Overdue | `danger` | danger-bg | danger |
| Neutral/Info/Archive | `neutral` | gray-100 | gray-600 |

### 5.4. Data Table

**Pattern chuẩn cho mọi module:**
1. Filter bar (collapsible)
2. Bulk selection checkbox + bulk actions toolbar
3. Sortable column headers
4. Row hover highlight
5. Clickable row → Side panel detail
6. Pagination bar

**Quy tắc cột:**
- Mặc định tối đa 8 cột hiển thị
- Cột ẩn/hiện qua column settings
- Cột đầu tiên luôn là checkbox (nếu cho phép selection)
- Cột cuối cùng luôn là actions

### 5.5. Breadcrumb

```
Tổng quan > Bán hàng > Đơn hàng SO-1234
```

- Luôn hiển thị trên mọi trang (trừ Dashboard)
- Mỗi segment clickable
- Segment cuối cùng không clickable (current)
- Tối đa 4 segments, truncate ở giữa nếu dài hơn

### 5.6. Tabs

**Dùng khi:**
- Module có nhiều sub-views (ví dụ: Sales → Đơn hàng | Phê duyệt | Thống kê)
- Trang settings có nhiều domain

**Style:** Underline tabs, không dùng pill tabs cho navigation chính.

### 5.7. Empty State

Khi bảng hoặc section không có dữ liệu:
- Illustration/Icon đại diện
- Title: "Chưa có [entity]"
- Description: Hướng dẫn ngắn gọn
- CTA button: "Tạo [entity] đầu tiên"

### 5.8. Skeleton Loading

- Dùng animated placeholder cho mọi data fetch
- Skeleton shape phải khớp với layout thật
- Animation: shimmer pulse từ trái sang phải

### 5.9. Toast / Notification

**Position:** Top-right, stack vertical
**Types:** success (green), error (red), warning (yellow), info (blue)
**Auto dismiss:** 4s (success/info), 8s (warning), manual (error)

### 5.10. Modal / Dialog

- Max-width: 560px (form), 720px (confirm with detail)
- Overlay: semi-transparent backdrop + blur
- Close: X button + Escape key + backdrop click
- Focus trap khi open
- Animate: fade + scale from center

---

## 6. Sidebar Navigation — Grouped by Function

### 6.1. Structure

```
┌────────────────────────────┐
│ [Logo] GOIUUDAI            │
│ Sản phẩm số - Dịch vụ số  │
├────────────────────────────┤
│                            │
│ ◆ Tổng quan                │
│                            │
│ ── KINH DOANH ──           │
│ ○ CRM                      │
│ ○ Bán hàng                 │
│ ○ Danh mục                 │
│ ○ Inbox hội thoại          │
│                            │
│ ── NHÂN SỰ ──              │
│ ▸ Nhân viên                │
│ ▸ Chấm công                │
│ ▸ Tiền lương               │
│ ▸ BHXH                     │
│ ▸ Tuyển dụng               │
│ ▸ Quy chế 2026             │
│ ▸ Đánh giá                 │
│ ▸ Thuế TNCN                │
│ ▸ Mục tiêu                 │
│                            │
│ ── TÀI CHÍNH & VẬN HÀNH ──│
│ ○ Tài chính                │
│ ○ Chuỗi cung ứng          │
│ ○ Tài sản                  │
│ ○ Dự án                    │
│                            │
│ ── HỆ THỐNG ──             │
│ ○ Quy trình phê duyệt     │
│ ○ Trợ lý AI               │
│   ▸ Phiên chạy             │
│   ▸ Phân quyền             │
│   ▸ Truy vấn               │
│   ▸ Nguồn tri thức         │
│   ▸ Kênh phân phối         │
│ ○ Báo cáo                  │
│ ○ Nhật ký hệ thống        │
│ ○ Thông báo                │
│ ○ Cấu hình                 │
│                            │
├────────────────────────────┤
│ [Avatar] ADMIN • Active    │
└────────────────────────────┘
```

### 6.2. Behavior

- **Group titles** luôn visible, uppercase, font-size `--text-xxs`
- **Collapsed mode** (64px): chỉ icon, hover tooltip hiện label
- **Mobile** (< 860px): drawer overlay, backdrop blur
- **Active state**: primary-50 bg + primary-700 text + left 3px accent bar
- **Hover**: translateX(2px) + bg-hover
- **HR section** đã inline (không cần expand/collapse bên ngoài)
- **AI Assistant** giữ expand/collapse cho sub-routes (chỉ ADMIN/MANAGER thấy full)

### 6.3. Nav Group Config

```typescript
export const SIDEBAR_GROUPS = [
  {
    key: 'overview',
    title: null,  // No group title for dashboard
    items: [{ key: 'dashboard', title: 'Tổng quan', href: '/', icon: 'LayoutDashboard' }]
  },
  {
    key: 'business',
    title: 'KINH DOANH',
    accent: 'var(--accent-business)',
    items: [
      { key: 'crm', title: 'CRM', href: '/modules/crm' },
      { key: 'sales', title: 'Bán hàng', href: '/modules/sales' },
      { key: 'catalog', title: 'Danh mục', href: '/modules/catalog' },
      { key: 'conversations', title: 'Inbox hội thoại', href: '/modules/crm/conversations' },
    ]
  },
  {
    key: 'hr',
    title: 'NHÂN SỰ',
    accent: 'var(--accent-hr)',
    items: [/* HR_SECTION_DEFINITIONS mapped to flat items */]
  },
  {
    key: 'finance',
    title: 'TÀI CHÍNH & VẬN HÀNH',
    accent: 'var(--accent-finance)',
    items: [
      { key: 'finance', title: 'Tài chính', href: '/modules/finance' },
      { key: 'scm', title: 'Chuỗi cung ứng', href: '/modules/scm' },
      { key: 'assets', title: 'Tài sản', href: '/modules/assets' },
      { key: 'projects', title: 'Dự án', href: '/modules/projects' },
    ]
  },
  {
    key: 'system',
    title: 'HỆ THỐNG',
    accent: 'var(--accent-system)',
    items: [
      { key: 'workflows', title: 'Quy trình phê duyệt', href: '/modules/workflows' },
      { key: 'assistant', title: 'Trợ lý AI', href: '/modules/assistant', expandable: true },
      { key: 'reports', title: 'Báo cáo', href: '/modules/reports' },
      { key: 'audit', title: 'Nhật ký hệ thống', href: '/modules/audit' },
      { key: 'notifications', title: 'Thông báo', href: '/modules/notifications' },
      { key: 'settings', title: 'Cấu hình', href: '/modules/settings' },
    ]
  }
];
```

---

## 7. Page Layouts

### 7.1. Dashboard Layout

```
┌──────────────────────────────────────────────┐
│ Breadcrumb: (hidden on dashboard)            │
├──────────────────────────────────────────────┤
│ Welcome Banner                               │
│ "Xin chào, [Role]! Hệ thống đang vận hành  │
│  ổn định."                                   │
│                  [Tạo đơn hàng] [Xem báo cáo]│
├──────┬──────┬──────┬──────────────────────────┤
│MetricMetricMetric  Metric                    │
│ Card  Card  Card   Card                      │
│ ↑12% 48    5 chờ  3 mới                     │
├──────┴──────┴──────┴──────────────────────────┤
│                                              │
│  ┌─── Biểu đồ ──────────┐ ┌── Quick Tasks ─┐│
│  │ Doanh thu 6 tháng     │ │ 3 đơn cần duyệt│
│  │ (Recharts AreaChart)  │ │ 2 hóa đơn quá  │
│  │                       │ │   hạn           │
│  │                       │ │ 1 PIP cần xem   │
│  └───────────────────────┘ └────────────────┘│
│                                              │
│  ┌─── Recent Activity ──────────────────────┐│
│  │ • Đơn SO-1234 đã duyệt            10m   ││
│  │ • NV mới: Nguyễn Văn A            1h    ││
│  │ • Hóa đơn INV-567 đã thanh toán   2h    ││
│  │ • PO-890 đã nhận hàng             3h    ││
│  └──────────────────────────────────────────┘│
│                                              │
│  ┌─── Phân hệ vận hành ────────────────────┐│
│  │ [CRM] [Bán hàng] [HR] [Tài chính] [...] ││
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

### 7.2. Module Workbench Layout (Master-Detail)

```
┌──────────────────────────────────────────────┐
│ Breadcrumb: Tổng quan > Bán hàng             │
├──────────────────────────────────────────────┤
│ Module Title + Description                    │
│ [Tab1: Active] [Tab2] [Tab3]                  │
├──────────────────────────────────────────────┤
│ Filter Bar (collapsible):                     │
│ [Trạng thái ▼] [Từ ngày ▼] [Đến ngày ▼] 🔍  │
│ Bộ lọc nâng cao ▸                             │
├──────────────────────────────────────────────┤
│ Toolbar: ☑ 3 mục đã chọn | [Xuất CSV] [...] │
├──────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐ │
│ │ Data Table                               │ │
│ │ ...                                      │ │
│ └──────────────────────────────────────────┘ │
│ Pagination: 1-20/156 items  ◀ 1 2 3 ... ▶   │
├──────────────────────────────────────────────┤
│ [SidePanel slides from right when row click] │
└──────────────────────────────────────────────┘
```

### 7.3. Form / Create Layout

```
┌──────────────────────────────────────────────┐
│ Breadcrumb: Tổng quan > HR > Nhân viên > Tạo│
├──────────────────────────────────────────────┤
│ "Tạo nhân viên mới"                          │
│ Điền thông tin bên dưới để tạo hồ sơ.        │
├──────────────────────────────────────────────┤
│ ┌─ Thông tin cơ bản ──────────────────────┐  │
│ │ [Họ tên      ] [Email           ]       │  │
│ │ [Phòng ban ▼ ] [Chức vụ ▼       ]       │  │
│ └─────────────────────────────────────────┘  │
│ ┌─ Hợp đồng ─────────────────────────────┐  │
│ │ [Loại HĐ  ▼ ] [Ngày bắt đầu    ]       │  │
│ │ [Mức lương   ] [Thử việc? ☐     ]       │  │
│ └─────────────────────────────────────────┘  │
│                                              │
│ [Hủy]                            [Lưu nhân  │
│                                   viên     ] │
└──────────────────────────────────────────────┘
```

**Quy tắc form:**
- Group fields thành sections có heading
- 2 cột trên desktop, 1 cột trên mobile
- Primary action ở góc phải dưới
- Cancel ở góc trái dưới
- Required fields đánh dấu `*` sau label

---

## 8. Animation & Motion

### 8.1. Timing Functions

```css
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);     /* standard */
--ease-decel:  cubic-bezier(0, 0, 0.2, 1);         /* entering */
--ease-accel:  cubic-bezier(0.4, 0, 1, 1);         /* exiting */
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275); /* bouncy */

--duration-fast:    150ms;
--duration-normal:  250ms;
--duration-slow:    350ms;
```

### 8.2. Standard Animations

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Page content | Fade in | 150ms | smooth |
| Card entrance | Slide up + fade | 250ms | decel, stagger 50ms |
| Side panel | Slide from right | 250ms | smooth |
| Modal | Scale + fade | 200ms | spring |
| Dropdown | Scale Y + fade | 150ms | smooth |
| Sidebar hover | TranslateX (2px) | 150ms | smooth |
| Button press | Scale (0.97) | 100ms | smooth |
| Toast enter | Slide down + fade | 250ms | spring |
| Toast exit | Fade + slide up | 200ms | accel |
| Skeleton | Shimmer pulse | 1.5s | linear, infinite |
| Row hover | Background color | 150ms | smooth |

### 8.3. Stagger Pattern (for card grids)

```css
.card-grid > * {
  animation: slideUpFade var(--duration-normal) var(--ease-decel) backwards;
}
.card-grid > *:nth-child(1) { animation-delay: 0ms; }
.card-grid > *:nth-child(2) { animation-delay: 50ms; }
.card-grid > *:nth-child(3) { animation-delay: 100ms; }
.card-grid > *:nth-child(4) { animation-delay: 150ms; }

@keyframes slideUpFade {
  from { opacity: 0; transform: translateY(12px); }
}
```

---

## 9. Chart System — Recharts

### 9.1. Why Recharts

| Criteria | Recharts | Chart.js | D3 (raw) |
|----------|----------|----------|----------|
| Bundle  | ~45KB gz | ~60KB gz | ~30KB gz |
| React-native | ✅ JSX | ❌ Canvas | ❌ DOM |
| TypeScript | ✅ | ✅ | Partial |
| Composable | ✅ | ❌ | ✅ |
| Learning curve | Low | Medium | High |
| Responsive | ✅ built-in | Manual | Manual |

### 9.2. Chart Types Used

| Chart | Usage | Module |
|-------|-------|--------|
| AreaChart | Doanh thu trend | Dashboard, Sales |
| BarChart | Phân bổ nhân sự, ngân sách | HR, Finance |
| PieChart | Phân loại đơn hàng | Sales, CRM |
| LineChart | KPI trend | Reports |

### 9.3. Chart Styling Tokens

```css
--chart-grid:   var(--gray-100);
--chart-text:   var(--gray-500);
--chart-green:  #10b981;
--chart-blue:   #3b82f6;
--chart-amber:  #f59e0b;
--chart-red:    #ef4444;
--chart-violet: #8b5cf6;
```

---

## 10. Responsive Breakpoints

| Token | Width | Behavior |
|-------|-------|----------|
| `--bp-mobile` | ≤ 640px | 1 column, fullwidth |
| `--bp-tablet` | 641–1024px | Sidebar drawer, 2-col grid collapse |
| `--bp-desktop` | 1025–1440px | Full layout, 3+ col grids |
| `--bp-wide` | > 1440px | Wider content area |

```css
@media (max-width: 1024px) { /* tablet */ }
@media (max-width: 640px)  { /* mobile */ }
```

---

## 11. Accessibility

- Focus ring: `0 0 0 2px var(--primary-500)` with offset
- Color contrast: All text meets WCAG 2.1 AA (4.5:1 body, 3:1 large)
- `aria-label` on icon-only buttons
- `role="navigation"` on sidebar
- `role="main"` on content area
- Keyboard navigation: Tab order, Enter/Space activation
- `prefers-reduced-motion`: disable animations

---

## 12. File Organization — CSS Modules

### Target Structure

```
apps/web/app/
├── globals.css              # @import all, CSS reset, base typography
├── styles/
│   ├── tokens.css           # All CSS custom properties
│   ├── layout.css           # Shell grid, sidebar, toolbar
│   ├── components.css       # Buttons, cards, badges, inputs, tables
│   ├── forms.css            # Form fields, filter bars, validation
│   ├── charts.css           # Chart containers, legends
│   ├── animations.css       # Keyframes, transitions
│   ├── modules/
│   │   ├── dashboard.css    # Hero, metrics grid, activity
│   │   ├── crm.css
│   │   ├── sales.css
│   │   ├── hr.css
│   │   ├── finance.css
│   │   ├── scm.css
│   │   ├── workflows.css
│   │   ├── settings.css
│   │   ├── assistant.css
│   │   └── audit.css
│   └── responsive.css       # All media queries centralized
```

---

## 13. Admin Theme Customization (Settings > Giao diện)

### Fields in Settings Center

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Màu chủ đạo | Color picker | `#047857` | Override `--primary` |
| Tên công ty | Text | `GOIUUDAI` | Header brand |
| Logo URL | URL/Upload | none | Sidebar logo |
| Mã số thuế | Text | none | Shown in sidebar subtitle |

### Runtime flow:
1. Admin saves `branding.primaryColor` via settings API
2. API returns new value in `GET /settings/runtime`
3. `AppShell` applies to CSS custom property
4. Auto-derive `--primary-hover` (darken 10%) and `--primary-soft` (lighten 90%)

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-04-03 | Antigravity | Initial v1.0 — full design system spec |
