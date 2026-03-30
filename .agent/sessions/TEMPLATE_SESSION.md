# Session Log: [YYYY-MM-DD_HHmm]

> Template này dùng để ghi lại mỗi session làm việc.
> Tạo file mới với tên `YYYY-MM-DD_HHmm.md` trong thư mục này.

---

## THÔNG TIN SESSION

```
Ngày/giờ bắt đầu : [YYYY-MM-DD HH:mm]
Ngày/giờ kết thúc: [YYYY-MM-DD HH:mm]
Agent            : [Claude Code / Codex / ChatGPT / Human / ...]
Account/Instance : [Mô tả nếu cần — không ghi thông tin nhạy cảm]
Task đang làm    : T-[số] — [tên task]
```

---

## TÓM TẮT SESSION

[2-4 câu mô tả những gì đã làm được trong session này]

---

## CÔNG VIỆC ĐÃ THỰC HIỆN

### ✅ Hoàn thành
- [Mô tả việc đã làm + file đã thay đổi]
- [...]

### 🔄 Đang dở
- [Mô tả chính xác đang ở bước nào]

### ❌ Chưa làm / Bỏ qua
- [Lý do nếu có]

---

## THAY ĐỔI FILE

```
ADDED:
  src/modules/[...]
  
MODIFIED:
  src/[...]
  docs/[...]
  
DELETED:
  [file nếu có + lý do]
```

---

## QUYẾT ĐỊNH TRONG SESSION NÀY

| Quyết định | Lý do | Thay thế đã cân nhắc |
|---|---|---|
| [Dùng X] | [Vì Y] | [Z — nhưng không dùng vì...] |

---

## VẤN ĐỀ PHÁT SINH

| Vấn đề | Đã xử lý chưa | Cách xử lý / TODO |
|---|---|---|
| [Mô tả] | ✅/❌ | [Cách xử lý hoặc ticket ID] |

---

## HANDOFF CHO AGENT TIẾP THEO

> Đọc phần này nếu bạn là agent sẽ tiếp tục task này

**Context cần biết:**
[Những điều quan trọng không rõ từ code — business logic, gotchas, etc.]

**Bước tiếp theo cụ thể:**
1. Mở file `[tên file]`
2. Tiếp tục từ [mô tả chính xác]
3. Chú ý: [cảnh báo quan trọng nếu có]

**Lệnh cần chạy để setup lại môi trường:**
```bash
# [Lệnh cụ thể nếu cần]
```
