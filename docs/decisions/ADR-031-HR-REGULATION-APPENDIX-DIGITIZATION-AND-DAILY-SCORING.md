# ADR-031: HR Quy Che 2026 - So hoa PL01/02/03/04/05/06/10 + Cham diem ngay tu dong

## Status
Accepted

## Context
- Quy trinh HR dang phu thuoc vao ghi chep thu cong cho cac phu luc quan trong (PL01/02/03/04/05/06/10), kho audit va kho van hanh khi quy mo tang.
- He thong da co san `workflow engine` (duyet 1 cap), `audit log`, `notifications`, va scheduler patterns.
- Nhu cau van hanh hien tai:
  - quy mo ~50 nhan su noi bo,
  - khach le khong dang nhap he thong,
  - tenant van hanh chinh: `GOIUUDAI`,
  - can cham diem ngay theo vai tro, co cua so chinh T+1.
- Yeu cau phap ly va van hanh:
  - diem v1 chi dung cho dashboard/canh bao/PIP trigger,
  - chua tac dong truc tiep luong/thuong de giam rui ro.

## Decision
- Tao appendix domain rieng trong HR (khong nhoi vao `HrGoal`) de mo rong on dinh:
  - `HrAppendixTemplate`
  - `HrAppendixSubmission`
  - `HrAppendixEvidence`
  - `HrAppendixRevision`
  - `HrScoreRoleTemplate`
  - `HrDailyScoreSnapshot`
  - `HrPipCase`
- Chot pham vi v1 cho cac ma phu luc: `PL01/02/03/04/05/06/10`.
- Quy trinh duyet:
  - `PL04/05/06/10` bat buoc duyet 1 cap.
  - Approver mac dinh: `employee.managerId`; neu thieu manager thi fallback `HCNS manager`.
- Quy tac T+1:
  - Khong cho ghi de truc tiep.
  - Tao `HrAppendixRevision` o trang thai `PENDING_APPROVAL`.
  - Chi ap payload moi vao submission va diem sau khi manager approve revision.
- Scoring engine:
  - Recompute real-time khi co event nộp/sua/duyet.
  - Co scheduler reconcile dinh ky de chong miss event va retry.
  - Freeze rule:
    - diem ngay D la `PROVISIONAL` den D+1 23:59 (Asia/Ho_Chi_Minh),
    - qua moc thi chuyen `FINAL`.
  - Soft enforcement:
    - thieu/tre phu luc => tru diem + canh bao,
    - khong block nghiep vu.
- PIP auto draft (PL10):
  - Trigger khi KPI < 75% trong 2 thang lien tiep, hoac
  - thieu log theo nguong lap lai.
- Mac dinh role template neu HCNS chua cau hinh:
  - Sales: `50/20/20/10`
  - Marketing: `45/25/20/10`
  - HCNS: `35/20/35/10`
  - Ke toan: `35/15/40/10`
  - Thu tu pillar: `output/activity/compliance/quality`.
- API va UI:
  - Bo sung nhom endpoint `/api/v1/hr/appendix/*`, `/api/v1/hr/performance/daily-scores*`, `/api/v1/hr/pip/cases*`.
  - Them section UI `HR / regulation` gom 3 tab: `Bieu mau`, `Diem ngay`, `PIP`.
- Notifications & Ops:
  - Su dung `IN_APP + EMAIL`.
  - Bo sung notification dispatch scheduler.
  - Giu endpoint manual run cho ops (`daily-scores recompute/reconcile`, `notifications dispatch`, `auto-draft pip`).

## Consequences
- Co audit trail day du hon cho quy trinh phu luc va chinh sua T+1.
- Giam thao tac tay, giam that lac minh chung, de truy xuat tranh chap noi bo.
- Can bo sung bo test regression cho cac module HR hien huu (`attendance/goals/workflow`) de dam bao khong doi hanh vi cu.
- Can theo doi scheduler health khi deploy VM de tranh ton dong dispatch/reconcile.

## Out of Scope v1
- Khong import du lieu lich su truoc go-live.
- Khong tich hop chu ky so PKI trong v1.
- Khong tac dong truc tiep luong/thuong tu diem ngay trong v1.
