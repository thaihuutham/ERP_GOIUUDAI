# ADR-016: Menu cây Nhân sự + 9 route con + domain v1 Thuế TNCN/Mục tiêu/Thông tin nhân sự

## Status
Accepted

## Context
- Khối HR cần điều hướng dạng cây trong sidebar theo đúng 9 mục nghiệp vụ, nhưng vẫn giữ trang tổng quan `/modules/hr`.
- Một số chức năng HR cũ đã tồn tại và đang vận hành; yêu cầu mới bắt buộc không làm gãy API contract/luồng hiện hữu.
- Cần bổ sung 3 miền nghiệp vụ mới ở mức vận hành nội bộ v1:
  - Thuế TNCN
  - Mục tiêu
  - Thông tin nhân sự
- Quy tắc tính PIT đã được khóa cứng để tránh diễn giải khác nhau giữa các session agent.

## Decision
- Chuẩn hóa điều hướng HR trên web thành cây `Nhân sự` trong sidebar:
  - Parent `Nhân sự` mặc định đóng.
  - Khi click parent: vừa toggle mở/đóng vừa điều hướng về `/modules/hr`.
  - Auto-open subtree khi `pathname` bắt đầu bằng `/modules/hr`.
  - 9 child routes cố định:
    - `/modules/hr/payroll`
    - `/modules/hr/social-insurance`
    - `/modules/hr/recruitment`
    - `/modules/hr/employees`
    - `/modules/hr/attendance`
    - `/modules/hr/performance`
    - `/modules/hr/personal-income-tax`
    - `/modules/hr/goals`
    - `/modules/hr/employee-info`

- Chuẩn hóa route strategy cho HR section:
  - Giữ nguyên `/modules/hr` là dashboard/tổng quan HR.
  - Thêm dynamic route `/modules/hr/[section]` với map section key -> metadata nhãn/endpoint.
  - Dùng shared screen cho HR section để tái sử dụng filter/table/action patterns và tránh duplicate UI logic.

- Bổ sung domain backend v1 cho 3 mục mới:
  - Prisma models:
    - `PersonalIncomeTaxProfile`
    - `PersonalIncomeTaxRecord`
    - `HrGoal`
  - API mới dưới prefix `/api/v1/hr`:
    - `GET/POST/PATCH /personal-income-tax/profiles`
    - `GET/POST/PATCH /personal-income-tax/records`
    - `POST /personal-income-tax/records/generate`
    - `GET/POST/PATCH /goals`
    - `PATCH /goals/:id/progress`
    - `GET /employee-info`
    - `GET/PATCH /employee-info/:id`

- Khóa quy tắc PIT v1 như sau:
  - `grossTaxable = SUM(payrollLineItems where componentType=EARNING and isTaxable=true)`
  - `deduction = personalDeduction + dependentCount*dependentDeduction + insuranceDeduction + otherDeduction`
  - `taxableIncome = max(0, grossTaxable - deduction)`
  - `taxAmount = taxableIncome * taxRate` (default `10%`, cho phép override theo record)

- Giữ tương thích ngược:
  - Không thay đổi endpoint HR cũ.
  - Chỉ bổ sung endpoint/domain mới.

- Bổ sung dữ liệu mẫu và kiểm thử:
  - Seed demo cho PIT profile/record và goals.
  - Unit tests cho PIT formula, goal progress/completion, validation employee-info update.
  - Integration tests cho CRUD/generate PIT, CRUD/progress goals, employee-info list/detail/update.

## Consequences
- Điều hướng HR rõ ràng hơn cho vận hành nội bộ, đặc biệt trên sidebar/mobile drawer.
- 3 domain mới có thể dùng ngay ở mức v1 mà không cần workflow phê duyệt nâng cao.
- Tăng diện tích kiểm thử và độ phức tạp module HR, nhưng giảm rủi ro regression nhờ giữ nguyên contract cũ.
- Các quyết định nâng cấp v2 (progressive PIT, compliance, approval workflow) sẽ cần ADR riêng.
