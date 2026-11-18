# HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG ĐÓNG GÓP TRI THỨC CỘNG ĐỒNG
## DI SẢN THÁI NGUYÊN · ÂM VANG DI SẢN (`CONTRIBUTION-DEPLOYMENT.md`)

Tài liệu này hướng dẫn chi tiết kiến trúc, cách cấu hình **Cloudflare D1**, **Cloudflare Pages Functions**, quản lý biến mật (**Secrets**), chạy **Migrations**, khởi tạo tài khoản **Admin** an toàn và quy trình triển khai lên môi trường Production (`https://disanthainguyen.pages.dev/`).

---

## 1. Kiến trúc hệ thống

Hệ thống được tích hợp trực tiếp vào kiến trúc **Cloudflare Pages** hiện tại của dự án mà không cần tạo server rời hay làm ảnh hưởng tới Worker Chatbot AI (`https://disanthainguyen-backendd.tathanh72727.workers.dev/api/chat`):

```
Người xem (Public UI: /)
   └── Nhấn nút "ĐÓNG GÓP" (#contribute-btn)
   └── Điền biểu mẫu (#contribution-modal)
   └── POST /api/contributions
          │
          ▼
Cloudflare Pages Functions (/functions/api/[[path]].js)
   ├── Kiểm tra dữ liệu (Server-side validation, chống XSS, chống SQLi bằng Prepared Statements)
   ├── Chống Spam (Honeypot + Rate Limiting theo IP + Chống trùng lặp)
   └── Lưu vào Cloudflare D1 (Bảng `contributions` với trạng thái mặc định `pending`)
          │
          ▼
Trang Quản trị (/admin/)
   ├── Xác thực Admin qua PBKDF2-HMAC-SHA256 + Phiên Cookie HttpOnly + CSRF Token
   ├── Thống kê thời gian thực (Tổng số, Chờ duyệt, Đã duyệt, Từ chối, Biểu đồ 14 ngày)
   ├── Tìm kiếm, Lọc trạng thái / loại đóng góp, Sắp xếp, Phân trang
   ├── Xem chi tiết, Ghi chú nội bộ, Duyệt / Từ chối / Lưu trữ (có lưu Audit Log)
   └── Xuất dữ liệu CSV chuẩn UTF-8 BOM (hiển thị tiếng Việt có dấu trên Excel)
```

---

## 2. Danh sách các file được thêm mới và chỉnh sửa

### Các file thêm mới:
- `migrations/0001_init_contributions.sql`: Schema khởi tạo các bảng `contributions`, `contribution_audit_logs`, `admin_users`, `admin_sessions`, `rate_limits` và các chỉ mục (indexes) tối ưu truy vấn.
- `functions/api/[[path]].js`: Backend API chạy trên Cloudflare Pages Functions / Workers xử lý toàn bộ `/api/contributions` và `/api/admin/*`.
- `admin/index.html`: Giao diện trang quản trị `/admin/` (Đăng nhập, Tổng quan, Quản lý đóng góp, Chi tiết & Kiểm duyệt, Cài đặt).
- `admin/admin.css`: Hệ thống thiết kế SaaS chuẩn Linear / Stripe / Vercel (bảng màu `#F7F8FA`, `#FFFFFF`, `#17191C`, `#707782`, `#E6E8EC`, **hoàn toàn không sử dụng gradient**).
- `admin/admin.js`: Logic điều khiển trang quản trị, kết nối API bảo mật qua Cookie `HttpOnly` và `X-CSRF-Token`.
- `scripts/hash-admin-password.mjs`: Công cụ CLI giúp chủ dự án tự tạo mã băm mật khẩu PBKDF2-HMAC-SHA256 và lệnh SQL khởi tạo Admin mà không bao giờ lưu mật khẩu dạng rõ trong code.
- `wrangler.toml`: Cấu hình Cloudflare Pages & D1 database binding (`DB`).
- `.dev.vars.example` & `.gitignore`: Mẫu cấu hình biến môi trường local và danh sách loại trừ file nhạy cảm khi commit Git.
- `CONTRIBUTION-DEPLOYMENT.md` & `README.md`: Tài liệu kỹ thuật và hướng dẫn vận hành.

### Các file được chỉnh sửa (bảo toàn 100% tính năng cũ):
- `index.html`: Thay thế nút Donate (`#qr-donate-btn`) bằng nút **ĐÓNG GÓP** (`#contribute-btn`) và thay `#qr-modal` bằng Modal biểu mẫu đóng góp (`#contribution-modal`).
- `style.css`: Thay thế CSS của nút/modal QR cũ bằng CSS cho nút **ĐÓNG GÓP** và Modal biểu mẫu đóng góp theo phong cách *Premium Editorial + Modern Product Design + Soft Liquid Glass*.
- `script.js`: Thay thế sự kiện nút QR cũ bằng bộ điều khiển Modal Đóng góp (auto-resize textarea, bộ đếm ký tự, kiểm tra trường bắt buộc, xử lý gửi API, hiển thị mã tiếp nhận và giữ nguyên dữ liệu nếu lỗi mạng).
- `_headers`: Bổ sung header bảo mật (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex, nofollow`) cho `/admin/*`.

---

## 3. Tạo cơ sở dữ liệu Cloudflare D1

Mở terminal tại thư mục gốc của dự án và đăng nhập Cloudflare (nếu chưa đăng nhập):

```bash
npx wrangler login
```

Tạo cơ sở dữ liệu D1 mới mang tên `disanthainguyen-db`:

```bash
npx wrangler d1 create disanthainguyen-db
```

Sau khi lệnh chạy xong, Cloudflare sẽ trả về thông tin tương tự:

```toml
[[d1_databases]]
binding = "DB"
database_name = "disanthainguyen-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

---

## 4. Cấu hình Binding `DB`

1. **Trong file `wrangler.toml`**:
   Thay giá trị `database_id` bằng chuỗi UUID thực tế vừa nhận được ở Bước 3:
   ```toml
   name = "disanthainguyen"
   pages_build_output_dir = "."
   compatibility_date = "2025-01-01"

   [[d1_databases]]
   binding = "DB"
   database_name = "disanthainguyen-db"
   database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   migrations_dir = "migrations"
   ```

2. **Trên Cloudflare Dashboard (cho Cloudflare Pages)**:
   - Truy cập **Cloudflare Dashboard** → **Workers & Pages** → chọn dự án **disanthainguyen**.
   - Vào tab **Settings** → **Bindings** (hoặc **Functions** → **D1 database bindings**).
   - Nhấn **Add** → chọn **D1 database**:
     - **Variable name**: `DB` (viết hoa chính xác).
     - **D1 database**: chọn `disanthainguyen-db`.
   - Nhấn **Save**.

---

## 5. Cấu hình Secrets & Tạo tài khoản Admin an toàn

Hệ thống **không sử dụng mật khẩu mặc định** và **không lưu mật khẩu dạng văn bản rõ**.

### Bước 5.1: Sinh mã băm mật khẩu và `SESSION_SECRET`
Chạy công cụ đi kèm trên máy của bạn (thay `<ten_dang_nhap>` và `<mat_khau_manh>` bằng thông tin thật của bạn):

```bash
node scripts/hash-admin-password.mjs admin "MatKhauQuanTri_Manh_2026!"
```

Lệnh trên sẽ in ra 3 giá trị:
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH` (định dạng `pbkdf2_sha256$100000$<salt>$<hash>`)
- `SESSION_SECRET` (64 ký tự hex ngẫu nhiên)

### Bước 5.2: Cấu hình cho môi trường Local (`.dev.vars`)
Tạo file `.dev.vars` ở thư mục gốc dự án (file này đã được chặn trong `.gitignore`, không bao giờ đẩy lên GitHub) và dán 3 dòng vừa tạo vào:

```ini
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=pbkdf2_sha256$100000$...
SESSION_SECRET=...
```

### Bước 5.3: Cấu hình Secrets trên Cloudflare Pages Production
Bạn có thể thiết lập qua CLI hoặc trên giao diện Cloudflare Dashboard:

- **Cách 1 (Qua Wrangler CLI):**
  ```bash
  npx wrangler pages secret put ADMIN_USERNAME --project-name disanthainguyen
  npx wrangler pages secret put ADMIN_PASSWORD_HASH --project-name disanthainguyen
  npx wrangler pages secret put SESSION_SECRET --project-name disanthainguyen
  ```
- **Cách 2 (Qua Cloudflare Dashboard):**
  Vào **Workers & Pages** → **disanthainguyen** → **Settings** → **Environment variables** → nhấn **Add** (chọn loại **Secret** / **Encrypt**) cho cả 3 biến `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`.

---

## 6. Chạy Migrations ở môi trường Local

Áp dụng file migration `migrations/0001_init_contributions.sql` vào cơ sở dữ liệu D1 cục bộ:

```bash
npx wrangler d1 migrations apply disanthainguyen-db --local
```

Kiểm tra các bảng đã được tạo trong D1 local:

```bash
npx wrangler d1 execute disanthainguyen-db --local --command "SELECT name FROM sqlite_master WHERE type='table';"
```

---

## 7. Kiểm thử Local

Khởi chạy toàn bộ website kèm Cloudflare Pages Functions và D1 local:

```bash
npx wrangler pages dev . --d1 DB=disanthainguyen-db --port 8788
```

Sau đó mở trình duyệt:
- **Giao diện công khai:** `http://localhost:8788/`
  - Cuộn xuống chân trang (hoặc mở Menu trên điện thoại), nhấn nút **ĐÓNG GÓP**.
  - Điền thông tin trường học, họ tên, nội dung và nhấn **Gửi đóng góp**.
  - Kiểm tra thông báo thành công kèm **Mã tiếp nhận** (`DSTN-...`).
- **Giao diện quản trị:** `http://localhost:8788/admin/`
  - Đăng nhập bằng tài khoản đã cấu hình trong `.dev.vars`.
  - Kiểm tra số liệu thống kê, tìm kiếm, lọc trạng thái, mở chi tiết bản ghi, thử **Duyệt / Từ chối / Lưu trữ** và **Xuất CSV**.

---

## 8. Chạy Migration trên Database Production (Chỉ thực hiện sau khi xác nhận)

> **LƯU Ý QUAN TRỌNG:** Chỉ chạy lệnh dưới đây sau khi bạn đã tạo D1 database trên Cloudflare, điền `database_id` vào `wrangler.toml` và sẵn sàng áp dụng schema lên Production.

```bash
npx wrangler d1 migrations apply disanthainguyen-db --remote
```

---

## 9. Triển khai Backend & 10. Triển khai Frontend

Do dự án sử dụng kiến trúc hợp nhất trên **Cloudflare Pages** (Frontend tĩnh + `/functions/api/[[path]].js`), cả Frontend và Backend sẽ được triển khai đồng bộ:

### Cách 1: Tự động qua GitHub CI/CD (Khuyến nghị — giữ nguyên cơ chế hiện tại)
Sau khi kiểm tra kỹ ở local, commit và push code lên nhánh chính của repository `https://github.com/Thawnn10/disanthainguyen`:

```bash
git add .
git commit -m "feat: add community contribution system and admin dashboard with Cloudflare D1"
git push origin main
```

Cloudflare Pages sẽ tự động build cả giao diện tĩnh (`/`, `/admin/`) lẫn Functions (`/api/*`).

### Cách 2: Triển khai thủ công qua Wrangler CLI (Khi cần)
```bash
npx wrangler pages deploy . --project-name disanthainguyen
```

---

## 11. Kiểm tra sau khi triển khai Production

1. Truy cập `https://disanthainguyen.pages.dev/api/health` → xác nhận phản hồi `{"ok":true,"hasDbBinding":true}`.
2. Truy cập `https://disanthainguyen.pages.dev/` → nhấn nút **ĐÓNG GÓP**, gửi một đóng góp thử nghiệm.
3. Truy cập `https://disanthainguyen.pages.dev/admin/` → đăng nhập quản trị, kiểm tra bản ghi vừa gửi hiển thị ở mục **Chờ duyệt**, thực hiện **Duyệt** hoặc **Lưu trữ**, và thử **Xuất CSV**.
4. Kiểm tra lại các chức năng gốc (Bản đồ 46 di sản, Tìm kiếm, Tổng quát, Trình phát âm thanh, Trợ lý AI, Trò chơi Sắc màu di sản).

---

## 12. Hướng dẫn Quản lý Tài khoản Admin & Đổi mật khẩu

- **Đổi mật khẩu trực tiếp trên giao diện Admin:**
  1. Đăng nhập vào `/admin/`.
  2. Chọn mục **Cài đặt** ở thanh điều hướng bên trái.
  3. Nhập **Mật khẩu hiện tại** và **Mật khẩu mới** (tối thiểu 8 ký tự), nhấn **Cập nhật mật khẩu**.
  4. Hệ thống sẽ tự động băm mật khẩu mới bằng `PBKDF2-HMAC-SHA256` (100.000 vòng lặp) và lưu vào bảng `admin_users` trên Cloudflare D1, đồng thời thu hồi các phiên đăng nhập cũ khác.

- **Tạo thêm hoặc đặt lại mật khẩu Admin bằng CLI:**
  Chạy lệnh sinh câu lệnh SQL an toàn:
  ```bash
  node scripts/hash-admin-password.mjs admin "MatKhauMoi@2026" --sql-only > reset-admin.sql
  ```
  Thực thi trên D1 Local:
  ```bash
  npx wrangler d1 execute disanthainguyen-db --local --file=reset-admin.sql
  ```
  Hoặc trên D1 Production (sau khi xác nhận):
  ```bash
  npx wrangler d1 execute disanthainguyen-db --remote --file=reset-admin.sql
  ```
  *(Nhớ xóa file `reset-admin.sql` sau khi chạy xong).*

- **Bảo vệ bổ sung với Cloudflare Access (Tùy chọn nâng cao):**
  Trên Cloudflare Zero Trust Dashboard (**Access** → **Applications**), bạn có thể tạo thêm một Self-hosted Application cho đường dẫn `disanthainguyen.pages.dev/admin*` để yêu cầu xác thực OTP qua Email chủ dự án trước khi vào trang đăng nhập Admin.
