# Hướng Dẫn Sử Dụng Module Học Trực Tuyến (E-Learning) — Dành Cho Admin

> **Phiên bản:** 1.1  
> **Cập nhật:** 2026-04-13  
> **Đối tượng:** Admin, HR Manager, Quản lý đào tạo

---

## Mục Lục

1. [Tổng Quan Module](#1-tổng-quan-module)
2. [Truy Cập Module](#2-truy-cập-module)
3. [Quản Lý Khóa Học](#3-quản-lý-khóa-học)
   - 3.1 [Tạo Khóa Học Mới](#31-tạo-khóa-học-mới)
   - 3.2 [Biên Tập Nội Dung Khóa Học](#32-biên-tập-nội-dung-khóa-học)
   - 3.3 [Cấu Trúc Phần (Section)](#33-cấu-trúc-phần-section)
   - 3.4 [Thêm Bài Học (Lesson)](#34-thêm-bài-học-lesson)
   - 3.5 [Các Loại Nội Dung Bài Học](#35-các-loại-nội-dung-bài-học)
   - 3.6 [Cài Đặt Khóa Học](#36-cài-đặt-khóa-học)
   - 3.7 [Xuất Bản & Xóa Khóa Học](#37-xuất-bản--xóa-khóa-học)
4. [Ngân Hàng Câu Hỏi](#4-ngân-hàng-câu-hỏi)
   - 4.1 [Tạo Câu Hỏi](#41-tạo-câu-hỏi)
   - 4.2 [Phân Loại Câu Hỏi](#42-phân-loại-câu-hỏi)
   - 4.3 [Quản Lý & Tìm Kiếm](#43-quản-lý--tìm-kiếm)
5. [Bài Thi Cuối Khóa](#5-bài-thi-cuối-khóa)
   - 5.1 [Tạo Bài Thi](#51-tạo-bài-thi)
   - 5.2 [Cấu Hình Điểm Đạt](#52-cấu-hình-điểm-đạt)
   - 5.3 [Cấp Chứng Nhận Tự Động](#53-cấp-chứng-nhận-tự-động)
6. [Quản Lý Học Viên & Ghi Danh](#6-quản-lý-học-viên--ghi-danh)
   - 6.1 [Ghi Danh Nhân Viên](#61-ghi-danh-nhân-viên)
   - 6.2 [Theo Dõi Tiến Độ](#62-theo-dõi-tiến-độ)
7. [Trắc Nghiệm Hàng Ngày (Daily Quiz)](#7-trắc-nghiệm-hàng-ngày-daily-quiz)
8. [Dashboard Tổng Quan](#8-dashboard-tổng-quan)
   - 8.1 [Dashboard Admin](#81-dashboard-admin)
   - 8.2 [Dashboard HR](#82-dashboard-hr)
9. [Quy Trình Làm Việc Chuẩn](#9-quy-trình-làm-việc-chuẩn)
10. [Câu Hỏi Thường Gặp (FAQ)](#10-câu-hỏi-thường-gặp-faq)

---

## 1. Tổng Quan Module

Module **Học trực tuyến** (E-Learning) là hệ thống đào tạo nội bộ tích hợp trong ERP, cho phép:

| Chức năng | Mô tả |
|-----------|-------|
| **Quản lý khóa học** | Tạo, biên tập, xuất bản các khóa đào tạo |
| **Nội dung đa dạng** | Video, tài liệu, infographic, slide, liên kết ngoài, trắc nghiệm |
| **Ngân hàng câu hỏi** | Kho câu hỏi trắc nghiệm phân loại theo phòng ban/chủ đề |
| **Bài thi cuối khóa** | Kiểm tra kiến thức, cấp chứng nhận tự động |
| **Ghi danh & tiến độ** | Quản lý học viên, theo dõi % hoàn thành |
| **Trắc nghiệm hàng ngày** | 2 câu hỏi mỗi ngày khi đăng nhập |
| **Dashboard HR** | Báo cáo tổng quan, tiến độ nhân viên, phát hiện chậm tiến độ |

### Mô hình quyền hạn

| Vai trò | Quyền |
|---------|-------|
| **Admin/HR** | Tạo, sửa, xóa khóa học; quản lý câu hỏi; ghi danh; xem dashboard |
| **Nhân viên** | Xem khóa học được ghi danh; học bài; làm bài thi; xem chứng nhận |

---

## 2. Truy Cập Module

1. Đăng nhập vào hệ thống ERP.
2. Tại thanh điều hướng bên trái, chọn **"Học trực tuyến"** (biểu tượng 📖).
3. Giao diện chính hiện ra với 3 tab:
   - **Khóa học** — Danh sách tất cả khóa đào tạo
   - **Ngân hàng câu hỏi** — Kho câu hỏi trắc nghiệm
   - **Tổng quan** — Dashboard thống kê

> **Lưu ý:** Nếu bạn thấy thông báo *"Bạn không có quyền truy cập module E-Learning"*, hãy liên hệ quản trị viên hệ thống để được cấp quyền.

---

## 3. Quản Lý Khóa Học

### 3.1 Tạo Khóa Học Mới

**Bước thực hiện:**

1. Tại tab **"Khóa học"**, bấm nút **"+ Tạo khóa học"** (góc phải phía trên).
2. Panel bên phải mở ra, điền thông tin:

| Trường | Bắt buộc | Mô tả | Ví dụ |
|--------|----------|-------|-------|
| **Tên khóa học** | ✅ | Tên ngắn gọn, dễ hiểu | `Quy trình bán hàng cơ bản` |
| **Mô tả** | ❌ | Mô tả ngắn về mục tiêu, đối tượng | `Khóa đào tạo dành cho nhân viên kinh doanh mới, bao gồm quy trình từ tiếp cận khách hàng đến chốt đơn` |
| **Chính sách ghi danh** | ❌ | Cách thức nhập học | `Mời (Admin ghi danh)` hoặc `Mở (Nhân viên tự ghi danh)` |

3. Bấm **"Tạo khóa học"**.
4. Khóa học được tạo ở trạng thái **DRAFT** (Nháp).

**Ví dụ minh họa — Tạo khóa onboarding:**
```
Tên khóa học: Onboarding Nhân Viên Mới 2026
Mô tả: Chương trình đào tạo bắt buộc cho tất cả nhân viên mới. 
        Bao gồm: văn hóa công ty, nội quy, quy trình làm việc cơ bản.
Chính sách: Mời (Admin ghi danh)
```

### 3.2 Biên Tập Nội Dung Khóa Học

Sau khi tạo, bấm vào thẻ khóa học để mở **Trình biên tập khóa học**. Giao diện gồm 4 tab:

| Tab | Biểu tượng | Chức năng |
|-----|------------|-----------|
| **Nội dung** | 📖 | Quản lý cấu trúc: Phần → Bài học |
| **Học viên** | 👥 | Ghi danh, xem tiến độ |
| **Bài thi** | 🏆 | Tạo bài thi cuối khóa |
| **Cài đặt** | ⚙️ | Sửa tên, mô tả, tag, chính sách |

**Thanh thông tin nhanh** ở header hiển thị:
- Số phần (section)
- Số bài học (lesson)
- Số học viên (enrollment)
- Số chứng nhận đã cấp

### 3.3 Cấu Trúc Phần (Section)

**Phần** (Section) dùng để nhóm các bài học theo chủ đề, tạo cấu trúc mục lục rõ ràng.

**Thêm phần mới:**

1. Tại tab **"Nội dung"**, cuộn xuống cuối và bấm **"+ Thêm phần mới"**.
2. Ô nhập tên phần xuất hiện.
3. Nhập tên phần → bấm **"Lưu"** hoặc nhấn `Enter`.

**Ví dụ cấu trúc khóa "Onboarding Nhân Viên Mới":**
```
📁 Phần 1 — Giới thiệu công ty
   📄 Bài 1.1: Lịch sử và tầm nhìn
   📄 Bài 1.2: Cơ cấu tổ chức
   📄 Bài 1.3: Văn hóa doanh nghiệp

📁 Phần 2 — Nội quy & chính sách
   📄 Bài 2.1: Nội quy công ty (Video)
   📄 Bài 2.2: Chính sách BH & phúc lợi (Tài liệu)
   📄 Bài 2.3: Trắc nghiệm nội quy

📁 Phần 3 — Nghiệp vụ cơ bản
   📄 Bài 3.1: Quy trình bán hàng (Slide)
   📄 Bài 3.2: Hệ thống CRM (Video hướng dẫn)
   📄 Bài 3.3: Thực hành trên hệ thống (Liên kết ngoài)
```

**Thao tác với phần:**

| Thao tác | Cách thực hiện |
|----------|----------------|
| **Mở rộng/Thu gọn** | Bấm vào header phần (▼/▶) |
| **Xóa phần** | Bấm biểu tượng 🗑️ trên header phần. Các bài học trong phần sẽ thành bài học tự do. |

> ⚠️ **Lưu ý:** Xóa phần chỉ xóa "thư mục", KHÔNG xóa bài học bên trong. Bài học sẽ trở thành **bài học tự do** và hiện trong mục "Bài học tự do" ở cuối tab Nội dung.

### 3.4 Thêm Bài Học (Lesson)

**Cách 1 — Thêm bài học vào một phần:**

1. Mở rộng phần muốn thêm bài.
2. Cuộn xuống cuối phần, bấm **"+ Thêm bài học"**.
3. Form nhập liệu xuất hiện:

| Trường | Bắt buộc | Mô tả |
|--------|----------|-------|
| **Tên bài học** | ✅ | Tiêu đề ngắn gọn |
| **Loại nội dung** | ✅ | Chọn từ dropdown (Video, Tài liệu, v.v.) |
| **URL / Nội dung** | ❌ | Tùy loại: URL video, nội dung HTML, link ngoài |
| **Thời lượng (phút)** | ❌ | Thời gian ước tính để hoàn thành bài |

4. Bấm **"Thêm bài học"**.

**Cách 2 — Thêm bài học tự do (không thuộc phần nào):**

Cuộn xuống cuối trang tab "Nội dung", bấm **"+ Thêm bài học"** ở khu vực bên ngoài các phần.

> 💡 **Bài học tự do** là bài học không thuộc phần nào. Chúng được hiện trong mục riêng **"Bài học tự do"** ở cuối tab Nội dung. Khi bạn xóa một phần, tất cả bài học bên trong tự động trở thành bài tự do.

**Ví dụ — Thêm bài học video:**
```
Tên bài học: Hướng dẫn sử dụng CRM
Loại nội dung: Video
URL: https://www.youtube.com/watch?v=abc123xyz
Thời lượng: 15 (phút)
```

### 3.5 Các Loại Nội Dung Bài Học

Hệ thống hỗ trợ **6 loại nội dung** bài học:

| Loại | Icon | Mô tả | Trường nhập | Ví dụ |
|------|------|-------|-------------|-------|
| **Video** | 🎬 | Video đào tạo | URL video (YouTube, Vimeo, MP4...) | `https://youtu.be/abc123` |
| **Tài liệu** | 📄 | Nội dung văn bản | Nội dung HTML hoặc URL file | Nhập trực tiếp nội dung `<h2>Chương 1</h2><p>Nội dung...</p>` |
| **Infographic** | 🖼️ | Hình ảnh minh họa | URL hình ảnh hoặc nội dung HTML | `https://storage.example.com/infographic-sales.png` |
| **Trình chiếu** | 📊 | Slide thuyết trình | URL slide (Google Slides, Canva) | `https://docs.google.com/presentation/d/xxx/embed` |
| **Liên kết ngoài** | 🔗 | Link đến website bên ngoài | URL liên kết | `https://wiki.company.com/noi-quy` |
| **Trắc nghiệm** | ❓ | Bài kiểm tra trong bài | Liên kết câu hỏi từ ngân hàng | Gắn câu hỏi vào bài học |

**Chi tiết hỗ trợ Video:**
- **YouTube**: Tự động nhận dạng và nhúng player (embed)
  - Hỗ trợ format: `youtube.com/watch?v=xxx` và `youtu.be/xxx`
- **Vimeo**: Tự động nhúng player
  - Hỗ trợ format: `vimeo.com/12345`
- **Video trực tiếp**: Các URL MP4 sẽ dùng HTML5 video player

**Chi tiết Tài liệu & Infographic:**
- Hỗ trợ nội dung **HTML** nhập trực tiếp (bold, heading, list, link, ảnh)
- Hoặc URL đến file PDF/hình ảnh trên hệ thống lưu trữ

**Chi tiết Trắc nghiệm (QUIZ) — Gắn câu hỏi từ Ngân hàng:**

1. **Tạo bài trắc nghiệm:** Chọn loại nội dung "Trắc nghiệm" và bấm "Thêm bài học".
2. Sau khi tạo, bài QUIZ hiện nút **"❓ Câu hỏi"** trên hàng bài học.
3. Bấm nút → Panel **"Câu hỏi trắc nghiệm"** mở ra ngay dưới bài học.
4. Giao diện panel gồm:
   - **Câu hỏi đã gắn** (viền xanh ✓) — Bấm ✕ để gỡ
   - **Ô tìm kiếm** — Nhập từ khóa để tìm câu hỏi trong ngân hàng
   - **Danh sách câu hỏi** — Bấm **"+ Gắn"** để liên kết vào bài
5. Câu hỏi đã gắn sẽ được dùng cho bài thi cuối khóa.

> 💡 **Mẹo:** Gắn 10-20 câu hỏi cho mỗi bài QUIZ. Bài thi cuối khóa sẽ ưu tiên lấy câu hỏi từ các bài QUIZ này.

### 3.6 Cài Đặt Khóa Học

Tại tab **"Cài đặt"** trong trình biên tập khóa học, bạn có thể chỉnh sửa:

| Trường | Mô tả | Ví dụ |
|--------|-------|-------|
| **Tên khóa học** | Sửa tiêu đề *(bắt buộc)* | `Quy trình bán hàng nâng cao` |
| **Mô tả** | Mô tả chi tiết khóa học | `Khóa nâng cao dành cho nhân viên đã hoàn thành khóa cơ bản...` |
| **Chính sách ghi danh** | `Mời` hoặc `Mở` | `Mở (Nhân viên tự ghi danh)` |
| **Nhóm khóa học** | Phân loại khóa để xác định phạm vi câu hỏi bài thi | `Kinh doanh`, `Nhân sự`, `Onboarding`... |
| **Tags** | Nhãn phân loại, cách nhau bằng dấu phẩy | `onboarding, bắt buộc, sale` |

> ⚠️ **Quan trọng:** Trường **"Nhóm khóa học"** quyết định phạm vi câu hỏi cho bài thi cuối khóa. Hệ thống ưu tiên lấy câu hỏi từ ngân hàng có cùng nhóm. Nếu chưa chọn nhóm, bài thi sẽ lấy từ toàn bộ ngân hàng.

Sau khi chỉnh sửa, bấm **"💾 Lưu thay đổi"**. Hệ thống hiện thông báo *"Đã lưu thay đổi."* khi thành công.

### 3.7 Xuất Bản & Xóa Khóa Học

#### Vòng đời Khóa học:

```
  DRAFT (Nháp)  ──── Xuất bản ────▶  ACTIVE (Đã xuất bản)
        ▲                                      │
        └──────── Xóa ◀────────────── Xóa ─────┘
                          │
                   ARCHIVED (Đã xóa)
```

#### Xuất bản khóa học:

1. Mở trình biên tập khóa học.
2. Kiểm tra nội dung đã đầy đủ (phần, bài học, bài thi nếu cần).
3. Bấm nút **"▶ Xuất bản"** ở góc phải header.
4. Trạng thái chuyển từ `DRAFT` → `ACTIVE`.
5. **Tất cả bài học và bài thi** đang ở trạng thái Nháp sẽ **tự động chuyển sang ACTIVE**.
6. Nhân viên giờ có thể thấy và học khóa này.

#### Xuất bản nội dung sau khi khóa đã xuất bản:

Nếu bạn thêm nội dung mới sau khi khóa đã xuất bản, nội dung mới sẽ ở trạng thái **Nháp**. Có 2 cách xuất bản:

- **Xuất bản từng bài:** Bấm nút **▶** (play xanh) trên hàng bài học.
- **Xuất bản tất cả:** Thanh cảnh báo vàng hiện ở đầu tab Nội dung — bấm **"▶ Xuất bản tất cả nội dung"**.

> ⚠️ **Khuyến nghị:** Nên tạo đầy đủ nội dung (ít nhất 1 phần + 1 bài học) trước khi xuất bản.

#### Xóa khóa học:

- Tại danh sách khóa học, bấm **"🗑️ Xóa"** trên thẻ khóa.
- Trạng thái chuyển thành `ARCHIVED`.
- Khóa học sẽ không còn hiển thị cho nhân viên.

---

## 4. Ngân Hàng Câu Hỏi

Ngân hàng câu hỏi là kho trung tâm chứa tất cả câu hỏi trắc nghiệm, được dùng cho:
- Bài thi cuối khóa
- Trắc nghiệm hàng ngày (Daily Quiz)
- Bài kiểm tra trong bài học

### 4.1 Tạo Câu Hỏi

1. Chuyển sang tab **"Ngân hàng câu hỏi"** tại trang chính E-Learning.
2. Bấm **"+ Thêm câu hỏi"**.
3. Panel bên phải mở ra, điền thông tin:

| Trường | Bắt buộc | Mô tả |
|--------|----------|-------|
| **Nội dung câu hỏi** | ✅ | Nội dung câu hỏi trắc nghiệm |
| **Phân loại** | ❌ | Chọn nhóm câu hỏi (mặc định: Chung) |
| **Đáp án A, B, C, D** | ✅ (tối thiểu 2) | Nội dung từng đáp án |
| **Tick đáp án đúng** | ✅ (tối thiểu 1) | Checkbox chọn đáp án đúng |
| **Giải thích** | ❌ | Lời giải thích hiện sau khi nộp bài |

4. Bấm **"Thêm câu hỏi"**.

**Ví dụ minh họa — Câu hỏi kinh doanh:**
```
Nội dung câu hỏi: Khi khách hàng phản hồi "giá cao quá", nhân viên kinh doanh nên làm gì?

Phân loại: Kinh doanh

☐ Đáp án A: Giảm giá ngay lập tức
☑ Đáp án B: Giải thích giá trị sản phẩm và lợi ích mang lại
☐ Đáp án C: Bỏ qua và chuyển sang khách hàng khác  
☐ Đáp án D: Nói xấu đối thủ cạnh tranh

Giải thích: Việc giải thích giá trị sản phẩm giúp khách hàng hiểu được 
lợi ích thực sự, tạo niềm tin và tăng khả năng chốt đơn hàng thành công.
```

**Ví dụ — Câu hỏi tuân thủ:**
```
Nội dung câu hỏi: Theo quy định công ty, thời hạn bảo mật thông tin khách hàng sau khi nghỉ việc là bao lâu?

Phân loại: Tuân thủ

☐ Đáp án A: 6 tháng
☐ Đáp án B: 1 năm
☑ Đáp án C: 2 năm
☐ Đáp án D: Không giới hạn

Giải thích: Theo điều khoản bảo mật trong hợp đồng lao động, nhân viên 
phải giữ bí mật thông tin khách hàng trong vòng 2 năm sau khi chấm dứt hợp đồng.
```

### 4.2 Phân Loại Câu Hỏi

Hệ thống hỗ trợ **7 nhóm phân loại** để tổ chức câu hỏi:

| Phân loại | Tag | Mô tả | Ví dụ câu hỏi |
|-----------|-----|-------|---------------|
| **Chung** | `GENERAL` | Kiến thức chung | Nội quy, văn hóa công ty |
| **Kinh doanh** | `SALES` | Kỹ năng bán hàng | Quy trình bán hàng, xử lý phản đối |
| **Nhân sự** | `HR` | Chính sách HR | Chế độ nghỉ phép, bảo hiểm |
| **Tài chính** | `FINANCE` | Tài chính - kế toán | Quy trình duyệt chi, báo cáo |
| **Chuỗi cung ứng** | `SCM` | Logistics, kho bãi | Quy trình nhập/xuất kho |
| **Tuân thủ** | `COMPLIANCE` | Pháp luật, nội quy | Bảo mật dữ liệu, PCCC |
| **Onboarding** | `ONBOARDING` | Dành cho nhân viên mới | Giới thiệu phòng ban, hệ thống |

### 4.3 Quản Lý & Tìm Kiếm

**Tìm kiếm câu hỏi:**
- Sử dụng ô tìm kiếm ở đầu trang tab "Ngân hàng câu hỏi".
- Nhập từ khóa trong nội dung câu hỏi để lọc.

**Giao diện hiển thị mỗi câu hỏi bao gồm:**
- Nội dung câu hỏi (in đậm)
- Badge phân loại (góc phải)
- Danh sách đáp án (đáp án đúng được highlight viền xanh + ✓)
- Lời giải thích (nếu có, hiện dạng italic kèm 💡)

---

## 5. Bài Thi Cuối Khóa

Bài thi cuối khóa là công cụ kiểm tra kiến thức sau khi học viên hoàn thành tất cả bài học.

### 5.1 Tạo Bài Thi

1. Mở trình biên tập khóa học → Tab **"Bài thi"**.
2. Đọc thông tin hướng dẫn về **phạm vi câu hỏi** (hiện ngay đầu tab).

3. Bấm **"+ Tạo bài thi"**.
4. Điền thông tin:

| Trường | Mô tả | Giá trị ví dụ |
|--------|-------|---------------|
| **Tên bài thi** | Tiêu đề bài thi | `Bài thi cuối khóa — Quy trình bán hàng` |
| **Số câu hỏi** | Số câu lấy ngẫu nhiên từ ngân hàng | `10` |
| **Điểm đạt (%)** | Ngưỡng % để coi là đạt | `70` |

5. Bấm **"Tạo bài thi"**.

#### Phạm vi câu hỏi bài thi (thứ tự ưu tiên):

Hệ thống chọn câu hỏi ngẫu nhiên theo 3 bước ưu tiên:

| Ưu tiên | Nguồn | Điều kiện |
|---------|-------|----------|
| **1** | Câu hỏi gắn trong bài QUIZ | Bạn đã gắn câu hỏi vào bài học loại Trắc nghiệm |
| **2** | Ngân hàng câu hỏi cùng nhóm | Bạn đã chọn "Nhóm khóa học" ở tab Cài đặt |
| **3** | Toàn bộ ngân hàng câu hỏi | Nếu 2 bước trên không đủ câu hỏi |

> 💡 **Khuyến nghị:** Để bài thi chính xác nhất, hãy: (1) gắn câu hỏi vào bài QUIZ, HOẶC (2) chọn "Nhóm khóa học" ở tab Cài đặt.

**Ví dụ — Bài thi onboarding:**
```
Tên bài thi: Kiểm tra kiến thức Onboarding
Số câu hỏi: 15
Điểm đạt: 80%
Nhóm khóa học (Cài đặt): Onboarding → Bài thi ưu tiên lấy câu hỏi tag ONBOARDING
```

### 5.2 Cấu Hình Điểm Đạt

| Điểm đạt | Phù hợp cho | Ghi chú |
|-----------|------------|---------|
| **60%** | Khóa học nâng cao, nội dung khó | Yêu cầu thấp |
| **70%** | Đa số khóa học thông thường | Mặc định, phù hợp phần lớn trường hợp |
| **80%** | Khóa học bắt buộc, tuân thủ | Yêu cầu cao, đảm bảo nhân viên nắm vững |
| **90-100%** | Khóa an toàn lao động, pháp lý | Nghiêm ngặt, chỉ dùng khi nội dung cực kỳ quan trọng |

### 5.3 Cấp Chứng Nhận Tự Động

Khi học viên đạt điểm ngưỡng bài thi cuối khóa, hệ thống **tự động**:
1. Ghi nhận trạng thái **"Hoàn thành"** cho enrollment.
2. Tạo **chứng nhận nội bộ** với:
   - Mã chứng nhận duy nhất
   - Điểm đạt được
   - Ngày cấp
3. Chứng nhận hiển thị tại trang "Chứng nhận" của nhân viên.

---

## 6. Quản Lý Học Viên & Ghi Danh

### 6.1 Ghi Danh Nhân Viên

1. Mở trình biên tập khóa học → Tab **"Học viên"**.
2. Tại mục **"Ghi danh nhân viên"**, nhập mã nhân viên (Employee ID).
3. Có thể ghi danh **hàng loạt** bằng cách nhập nhiều mã, cách nhau bằng dấu phẩy.
4. Bấm **"Ghi danh"**.

**Ví dụ ghi danh hàng loạt:**
```
Nhập mã NV: emp001, emp002, emp003, emp004, emp005
```

**Kết quả:** Hệ thống hiện thông báo:
```
✅ Đã ghi danh 5 nhân viên
```

Hoặc nếu có nhân viên đã ghi danh trước đó:
```
✅ Đã ghi danh 3 nhân viên (2 đã có sẵn)
```

> 💡 **Mẹo:** Nhân viên đã ghi danh sẵn sẽ tự động bỏ qua, không bị trùng lặp.

### 6.2 Theo Dõi Tiến Độ

Danh sách học viên hiển thị:

| Cột | Mô tả |
|-----|-------|
| **Mã NV** | Mã nhân viên (hiển thị 12 ký tự đầu) |
| **Trạng thái** | `Đã ghi danh` / `Đang học` / `Hoàn thành` |
| **Thanh tiến độ** | Thanh progress bar hiện % bài đã hoàn thành |
| **%** | Con số phần trăm cụ thể |

**Mã màu trạng thái:**
- 🟢 **Hoàn thành** (xanh) — Đã học hết 100% bài học
- 🔵 **Đang học** (xanh dương) — Đã bắt đầu nhưng chưa xong
- ⚪ **Đã ghi danh** (xám) — Chưa bắt đầu học

---

## 7. Trắc Nghiệm Hàng Ngày (Daily Quiz)

### Cơ chế hoạt động

- Mỗi ngày khi nhân viên **đăng nhập** vào hệ thống, họ phải trả lời **2 câu hỏi ngắn**.
- Câu hỏi được lấy **ngẫu nhiên** từ ngân hàng câu hỏi, phù hợp với vị trí/phòng ban.
- Nhân viên **phải hoàn thành** trước khi truy cập vào hệ thống ERP.
- Sau khi nộp bài, hiển thị kết quả + giải thích đáp án.

### Admin cần làm gì?

1. **Duy trì ngân hàng câu hỏi đủ lớn**: Tối thiểu 50-100 câu hỏi để tránh lặp lại.
2. **Phân loại đúng tag**: Đảm bảo câu hỏi phù hợp với vị trí công việc.
3. **Viết giải thích rõ ràng**: Phần "Giải thích" hiện sau khi nộp bài, giúp nhân viên học từ câu sai.
4. **Theo dõi báo cáo**: Kiểm tra điểm trung bình nhân viên tại Dashboard HR.

### Quy trình xem của nhân viên

```
Đăng nhập ERP
    │
    ▼
Kiểm tra Daily Quiz (tự động)
    │
    ├── Không bắt buộc / Đã làm hôm nay → Vào hệ thống
    │
    └── Chưa làm → Hiện màn hình quiz toàn màn hình
                      │
                      ▼
                  Trả lời 2 câu hỏi
                      │
                      ▼
                  Nộp bài → Xem kết quả + giải thích
                      │
                      ▼
                  Bấm "Tiếp tục vào hệ thống"
```

---

## 8. Dashboard Tổng Quan

### 8.1 Dashboard Admin

Tại tab **"Tổng quan"** trên trang E-Learning chính, hiển thị 4 thẻ KPI:

| Thẻ | Biểu tượng | Mô tả |
|-----|------------|-------|
| **Khóa học** | 📖 | Tổng số khóa đã tạo |
| **Lượt ghi danh** | 👥 | Tổng lượt nhân viên được ghi danh |
| **Hoàn thành** | ✅ | Số enrollment đã hoàn thành 100% |
| **Chứng nhận** | 🏆 | Số chứng nhận đã cấp |

**Thanh Tỷ lệ hoàn thành:** Hiện progress bar + % tổng tỷ lệ hoàn thành toàn hệ thống.

### 8.2 Dashboard HR

Dashboard HR dành cho bộ phận Nhân sự, gồm **4 tab con**:

#### Tab "Tổng quan"
Thẻ KPI mở rộng:
- Tổng khóa học (+ bao nhiêu đang mở)
- Tổng ghi danh (+ bao nhiêu hoàn thành)
- Chứng nhận đã cấp
- Ngân hàng câu hỏi (tổng số câu)

Thẻ tỷ lệ:
- **Tỷ lệ hoàn thành khóa học** — Mục tiêu: > 70%
- **Điểm trắc nghiệm TB hàng ngày** — Mục tiêu: > 70%

#### Tab "Tiến độ nhân viên"
Bảng chi tiết theo từng nhân viên:

| Nhân viên | Ghi danh | Hoàn thành | Tỷ lệ | Hoạt động gần nhất |
|-----------|---------|------------|-------|-------------------|
| Nguyễn Văn A | 3 | 2 | 67% | 10/04/2026 |
| Trần Thị B | 5 | 5 | 100% | 12/04/2026 |

**Mã màu tỷ lệ:**
- 🟢 ≥ 80%: Tốt
- 🟡 50–79%: Trung bình
- 🔴 < 50%: Cần cải thiện

#### Tab "Báo cáo trắc nghiệm"
Bảng kết quả daily quiz theo giai đoạn:
- Bộ lọc: **Tuần này** / **Tháng này** / **Quý này** / **Năm nay**
- Cột: Nhân viên, Tổng phiên, Đã làm, Điểm TB, Lần cuối

#### Tab "Chưa hoàn thành"
- Danh sách nhân viên có tỷ lệ hoàn thành < 100%.
- Badge đỏ hiện số lượng nhân viên cần theo dõi.
- Nhân viên có tỷ lệ < 50% được highlight nền đỏ nhạt.
- Nếu tất cả đã hoàn thành: hiện thông báo 🎉 *"Tất cả nhân viên đã hoàn thành!"*

---

## 9. Quy Trình Làm Việc Chuẩn

### Quy trình tạo khóa học hoàn chỉnh (Checklist)

```
□ Bước 1: Tạo khóa học mới (tên, mô tả, chính sách ghi danh)
□ Bước 2: Cài đặt "Nhóm khóa học" (tab Cài đặt) → xác định phạm vi câu hỏi bài thi
□ Bước 3: Tạo cấu trúc Phần (Section)
    □ Phần 1: Giới thiệu
    □ Phần 2: Nội dung chính
    □ Phần 3: Tổng kết & kiểm tra
□ Bước 4: Thêm bài học vào từng phần
    □ Chuẩn bị nội dung: video, tài liệu, slide
    □ Nhập URL hoặc nội dung HTML
    □ Ghi thời lượng ước tính
    □ Thêm bài Trắc nghiệm + gắn câu hỏi từ ngân hàng
□ Bước 5: Tạo câu hỏi trong Ngân hàng câu hỏi
    □ Tối thiểu 10-20 câu cho mỗi khóa
    □ Đảm bảo có giải thích cho mỗi câu
    □ Phân loại tag phù hợp
□ Bước 6: Gắn câu hỏi vào bài QUIZ (nút "❓ Câu hỏi" trên bài học)
□ Bước 7: Tạo bài thi cuối khóa
    □ Chọn số câu hỏi (ví dụ: 10)
    □ Đặt điểm đạt (ví dụ: 70%)
□ Bước 8: Cài đặt tags cho khóa (onboarding, bắt buộc, v.v.)
□ Bước 9: Xuất bản khóa học (tất cả nội dung tự động ACTIVE)
□ Bước 10: Ghi danh nhân viên
□ Bước 11: Theo dõi tiến độ qua Dashboard HR
```

### Quy trình bảo trì câu hỏi

```
□ Hàng tuần: Review câu hỏi mới cần thêm
□ Hàng tháng: Kiểm tra điểm TB daily quiz
    □ Nếu quá cao (> 95%): Cần thêm câu hỏi khó hơn
    □ Nếu quá thấp (< 40%): Cần review nội dung đào tạo
□ Hàng quý: Cập nhật câu hỏi theo chính sách/quy trình mới
```

---

## 10. Câu Hỏi Thường Gặp (FAQ)

### Q: Tôi có thể sửa nội dung khóa học sau khi xuất bản không?
**A:** Có. Bạn vẫn có thể thêm/sửa/xóa bài học, phần, và cài đặt sau khi xuất bản. Thay đổi có hiệu lực ngay lập tức.

### Q: Nhân viên có thể học lại bài đã hoàn thành không?
**A:** Có. Nhân viên vẫn truy cập được bài học đã hoàn thành để xem lại nội dung. Trạng thái hoàn thành không bị reset.

### Q: Nếu tôi xóa một phần (section) thì bài học bên trong sẽ ra sao?
**A:** Bài học **không bị xóa**, chúng sẽ trở thành bài học tự do (không thuộc phần nào). Bạn có thể di chuyển chúng vào phần khác sau.

### Q: Daily Quiz có bắt buộc không?
**A:** Tùy cấu hình. Hệ thống kiểm tra khi đăng nhập — nếu nhân viên chưa làm quiz hôm nay, họ phải hoàn thành trước khi vào hệ thống. Hệ thống tự bỏ qua nếu không bắt buộc hoặc đã hoàn thành.

### Q: Làm sao để biết nhân viên nào chưa hoàn thành khóa bắt buộc?
**A:** Vào Dashboard HR → Tab **"Chưa hoàn thành"**. Danh sách hiện tất cả nhân viên có tỷ lệ < 100%. Nhân viên < 50% được highlight đỏ.

### Q: Một câu hỏi có thể có nhiều đáp án đúng không?
**A:** Có. Khi tạo câu hỏi, bạn có thể tick checkbox cho nhiều đáp án đúng. Hệ thống hỗ trợ cả single-answer và multiple-answer.

### Q: Chứng nhận được cấp khi nào?
**A:** Chứng nhận được cấp **tự động** khi học viên đạt điểm ngưỡng bài thi cuối khóa. Admin không cần duyệt thủ công.

### Q: Số câu hỏi cho daily quiz lấy từ đâu?
**A:** Từ ngân hàng câu hỏi chung. Hệ thống chọn ngẫu nhiên câu hỏi phù hợp với vị trí/phòng ban của nhân viên. Vì vậy cần đảm bảo ngân hàng có đủ câu hỏi cho từng phân loại.

### Q: Khóa học bị xóa (archived) có thể khôi phục không?
**A:** Khóa học bị xóa chuyển sang trạng thái `ARCHIVED` và không hiển thị cho nhân viên. Hiện tại hệ thống chưa có chức năng khôi phục từ UI — liên hệ quản trị viên hệ thống để hỗ trợ.

---

> **Liên hệ hỗ trợ:** Nếu gặp lỗi hoặc cần hướng dẫn thêm, liên hệ bộ phận IT qua kênh hỗ trợ nội bộ.
