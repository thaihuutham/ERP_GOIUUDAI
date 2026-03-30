# ROADMAP

## 2026-Q2
- Chuẩn hóa cấu trúc project và tài liệu vận hành stateless.
- Ổn định pipeline CI/CD GitHub -> VM.
- Hardening Firestore rules và index theo lưu lượng thực tế.

## 2026-Q3
- Refactor app monolith thành module theo domain (CRM/Sales/HR/Finance/SCM/Projects).
- Tách read model cho báo cáo lớn để giảm chi phí query realtime.
- Bổ sung audit log và monitoring theo module.

## 2026-Q4
- Đánh giá chiến lược data layer cho 2M khách hàng:
  - Option A: Firestore + archival + aggregation.
  - Option B: Hybrid Firestore (operational) + Postgres/ClickHouse (analytics).
- Chuẩn hóa DR/backup/recovery runbook.
