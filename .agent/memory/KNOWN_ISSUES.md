# KNOWN ISSUES

## Critical
- KI-001: Firestore rules có tham chiếu hàm `isOwner(...)` nhưng chưa thấy định nghĩa trong file hiện tại.
  - Impact: có thể lỗi khi publish rules hoặc behavior không như kỳ vọng ở rule `performance`/`benefits`.
  - Workaround: review + bổ sung hàm trước lần cập nhật rules production tiếp theo.

## Medium
- KI-002: `src/App.tsx` quá lớn, khó maintain và dễ tạo regression.
- KI-003: Nhiều query trực tiếp Firestore chưa có lớp repository/use-case.

## Low
- KI-004: Một số comment/config còn dấu vết từ AI Studio template cũ.
