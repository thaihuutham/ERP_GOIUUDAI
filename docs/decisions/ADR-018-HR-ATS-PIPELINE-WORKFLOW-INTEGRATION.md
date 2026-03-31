# ADR-018: HR ATS Pipeline Thực Tế + Offer Approval qua Workflow Engine

## Status
Accepted

## Context
- Module HRM trước đây chỉ có `Recruitment` CRUD cơ bản với `stage/status` dạng text, chưa đáp ứng quy trình tuyển dụng thực tế (ATS).
- Yêu cầu nghiệp vụ cần pipeline chuẩn hóa theo stage rõ ràng, có lịch sử audit, hỗ trợ Kanban kéo-thả, lịch phỏng vấn, offer approval, và convert ứng viên thành nhân sự có điều kiện.
- Hệ thống đã có Workflow Engine sẵn dùng cho approval, cần tái sử dụng thay vì xây flow duyệt riêng cho HR.
- Trong phase hiện tại, CV được chốt theo quyết định vận hành: chỉ lưu URL ngoài (`cvExternalUrl`), chưa upload file nội bộ.

## Decision
- Thiết kế ATS domain mới trong HR:
  - `RecruitmentRequisition`
  - `RecruitmentCandidate`
  - `RecruitmentApplication`
  - `RecruitmentStageHistory`
  - `RecruitmentInterview`
  - `RecruitmentOffer`
- Chuẩn hóa enum nghiệp vụ:
  - Stage: `APPLIED -> SCREENING -> INTERVIEW -> ASSESSMENT -> OFFER -> HIRED`
  - Application status: `ACTIVE`, `REJECTED`, `WITHDRAWN`, `HIRED`
  - Candidate source: `REFERRAL`, `JOB_BOARD`, `SOCIAL_MEDIA`, `CAREER_SITE`, `AGENCY`, `CAMPUS`, `OTHER`
  - Interview status và Offer status theo flow ATS.
- Áp dụng rule pipeline bắt buộc:
  - Stage chỉ chuyển tiến, không cho nhảy sai thứ tự.
  - `REJECTED/WITHDRAWN` cho phép từ mọi stage active.
  - `reopen` chỉ từ terminal status và phải quay về stage hợp lệ (không cho reopen thẳng `HIRED`).
  - Mọi thay đổi stage/status bắt buộc ghi `RecruitmentStageHistory`.
- Tích hợp approval offer với Workflow Engine:
  - Submit offer tạo workflow instance với `targetType = HR_RECRUITMENT_OFFER`, `targetId = offerId`.
  - Đồng bộ status offer theo kết quả workflow: `PENDING_APPROVAL -> APPROVED/REJECTED`.
  - Chỉ cho phép chuyển `OFFER -> HIRED` và `convert-to-employee` khi offer đã `APPROVED` và ứng viên `ACCEPTED`.
- Thêm API ATS chuyên dụng dưới `/api/v1/hr/recruitment`:
  - `GET /pipeline`, `GET /metrics`
  - `POST /applications`, `PATCH /applications/:id/stage`, `PATCH /applications/:id/status`
  - `POST /interviews`, `PATCH /interviews/:id`
  - `POST /offers`, `PATCH /offers/:id`, `POST /offers/:id/submit-approval`
  - `POST /applications/:id/convert-to-employee`
- UI trang tuyển dụng của HR chuyển sang board Kanban chuyên dụng (thay vì CRUD generic), có filter global, detail drawer, timeline, offer/interview actions.
- Tương thích chuyển đổi:
  - Giữ endpoint recruitment cũ trong giai đoạn migration.
  - Thêm migration/backfill từ bảng `Recruitment` legacy sang ATS tables mới với mapping mặc định.

## Consequences
- HR có pipeline tuyển dụng thực tế, theo dõi được trạng thái hồ sơ theo board và audit đầy đủ.
- Quy trình offer/hiring an toàn hơn nhờ ràng buộc approval trước khi convert thành nhân sự.
- Tăng số lượng entity và quan hệ trong domain HR, yêu cầu test service/integration rõ hơn cho các rule stage/status.
- Trong migration window, cần duy trì song song dữ liệu legacy + ATS mới; các luồng mới sẽ ưu tiên ATS.
