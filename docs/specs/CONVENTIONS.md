# CONVENTIONS

## 1. Git
- Branch prefix: `feat/`, `fix/`, `docs/`, `refactor/`, `ops/`.
- Commit style: Conventional Commit (`feat:`, `fix:`, `docs:`...).
- Không commit secrets.

## 2. Coding
- Ưu tiên tách hàm/component nhỏ, tránh file > 400 LOC khi có thể.
- Mọi logic truy cập Firestore phải có xử lý lỗi qua `handleFirestoreError`.
- Không hardcode role/status khi đã có enum/constant.
- Với NestJS controller, ưu tiên khai báo DI tường minh: `@Inject(Service)` trong constructor.
- Với UI ERP, các trường bắt buộc cần giá trị chính xác theo chuẩn hệ thống (module code, role, status, step key, action code, policy key, taxonomy key...) **không cho nhập tự do**.
- Bắt buộc dùng cơ chế chọn có kiểm soát (`select`, `autocomplete`, `radio`, `picker`) lấy từ danh mục/API chuẩn để giảm lỗi nhập sai.
- Nếu chưa có nguồn danh mục chuẩn cho trường bắt buộc, phải bổ sung nguồn dữ liệu chuẩn trước khi mở form cho người dùng nhập.
- Chuẩn nhập liệu cho người dùng không IT (áp dụng toàn ERP, user-facing):
  - Cấm dùng ô nhập JSON thô trên form người dùng.
  - Nếu backend cần object JSON, UI phải map từ field nghiệp vụ thân thiện (`input/select/checkbox/date`) sang object khi submit.
  - Không thêm mới `type: 'json'` trong module definitions và parser form chung.
  - Giữ tương thích ngược API: backend tiếp tục nhận key cũ và hỗ trợ alias thân thiện để UI thống nhất.

## 3. Documentation
- Quyết định kỹ thuật phải có ADR trong `docs/decisions/`.
- Handoff session bắt buộc cập nhật trong `.agent/` và `planning/CURRENT_TASK.md`.

## 4. Deploy
- Chỉ deploy qua GitHub Actions workflow.
- VM production không deploy thủ công bằng SSH nếu không có sự cố.
