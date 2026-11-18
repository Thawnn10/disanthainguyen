# HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG ĐÓNG GÓP TRI THỨC CỘNG ĐỒNG
## DI SẢN THÁI NGUYÊN · ÂM VANG DI SẢN (`CONTRIBUTION-DEPLOYMENT.md`)

Tài liệu này mô tả kiến trúc chính thức đã đồng bộ, cấu hình **Cloudflare Worker (`disanthainguyen-backendd`)**, **Cloudflare D1 (`disanthainguyen-contributions`)**, **Cloudflare Pages (`disanthainguyen.pages.dev`)**, quản lý **Secrets**, chạy **Migrations** và quy trình triển khai tách biệt giữa Worker và Pages.

---

## 1. Kiến trúc Hệ thống Chính thức

1. **Cloudflare Pages (`https://disanthainguyen.pages.dev`)**:
   - Chỉ phục vụ giao diện công khai (`/`) và giao diện quản trị (`/admin/`).
   - File `functions/api/[[path]].js` chỉ đóng vai trò **Reverse Proxy không trạng thái (Stateless Proxy)** chuyển tiếp `/api/*` sang Worker `disanthainguyen-backendd` để hỗ trợ First-Party Cookie `HttpOnly` cùng origin trên mọi trình duyệt (không gắn D1, không chứa bất kỳ câu lệnh SQL hay logic nghiệp vụ nào).
2. **Cloudflare Worker (`disanthainguyen-backendd` — `https://disanthainguyen-backendd.tathanh72727.workers.dev`)**:
   - Là **Backend duy nhất và trung tâm** của toàn bộ hệ thống.
   - Xử lý **Chatbot AI Gemini** (`POST /api/chat`, `POST /api/heritage/ask`, `GET /api/heritage/search`, `GET /api/heritage/health`, `GET /api/heritage/health/deep`) thông qua **Durable Object `GEMINI_EXECUTOR` (`GeminiRegionExecutor`)**.
   - Xử lý **toàn bộ API Đóng góp Cộng đồng & API Quản trị Admin** trực tiếp thông qua kết nối **Cloudflare D1 (`env.DB`)**:
     - `POST /api/contributions`
     - `POST /api/admin/login`
     - `POST /api/admin/logout`
     - `GET /api/admin/me`
     - `POST /api/admin/password`
     - `GET /api/admin/stats`
     - `GET /api/admin/contributions`
     - `GET /api/admin/contributions/:id`
     - `PATCH /api/admin/contributions/:id`
     - `GET /api/admin/export.csv`
3. **Cloudflare D1 Database**:
   - Gắn trực tiếp với Worker `disanthainguyen-backendd` qua biến môi trường `env.DB`:
     - **Binding**: `DB`
     - **Database name**: `disanthainguyen-contributions`
     - **Database ID**: `6a0e2ff6-2230-43ba-8ec4-22987349bb7a`

---

## 2. Cấu hình `wrangler.toml` của Worker (`disanthainguyen-backendd`)

File `wrangler.toml` (tại `D:\code\disanthainguyen_backendd\wrangler.toml` và đã đồng bộ tại `c:\Users\Thanhh\OneDrive\code\KHKT\wrangler.toml`):

```toml
name = "disanthainguyen-backendd"
main = "src/index.js"
compatibility_date = "2025-02-01"

[vars]
GEMINI_MODEL = "gemini-3.8-flash"
GEMINI_FALLBACK_MODELS = "gemini-3.5-flash-lite,gemini-3.1-flash-lite"
GEMINI_API_VERSION = "v1beta"
GEMINI_INTERACTIONS_REVISION = "2026-05-20"
GEMINI_DO_REGION = "wnam"
ALLOWED_ORIGINS = "*"
RATE_LIMIT_MAX_REQUESTS = "25"
RATE_LIMIT_WINDOW_SECONDS = "60"

[[durable_objects.bindings]]
name = "GEMINI_EXECUTOR"
class_name = "GeminiRegionExecutor"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["GeminiRegionExecutor"]

[[d1_databases]]
binding = "DB"
database_name = "disanthainguyen-contributions"
database_id = "6a0e2ff6-2230-43ba-8ec4-22987349bb7a"
migrations_dir = "migrations"
```

---

## 3. API URL mà Frontend và Admin sử dụng

- **Worker Base URL:** `https://disanthainguyen-backendd.tathanh72727.workers.dev`
- **Các đường dẫn API trên Worker:**
  - Chatbot AI: `https://disanthainguyen-backendd.tathanh72727.workers.dev/api/chat`
  - Gửi đóng góp công khai: `https://disanthainguyen-backendd.tathanh72727.workers.dev/api/contributions` (cũng hoạt động qua `/api/contributions` nhờ proxy mỏng trên Pages).
  - Quản trị Admin:
    - `POST /api/admin/login`
    - `POST /api/admin/logout`
    - `GET /api/admin/me`
    - `GET /api/admin/stats`
    - `GET /api/admin/contributions`
    - `GET /api/admin/contributions/:id`
    - `PATCH /api/admin/contributions/:id`
    - `GET /api/admin/export.csv`
    *(Trong `admin/admin.js`, hệ thống tự động gọi qua đường dẫn cùng origin `/api/admin/*` — được proxy thẳng tới `https://disanthainguyen-backendd.tathanh72727.workers.dev/api/admin/*` — hoặc tự động chuyển sang gọi trực tiếp `https://disanthainguyen-backendd.tathanh72727.workers.dev/api/admin/*` với `credentials: 'include'` nếu chạy thuần tĩnh).*

---

## 4. Khởi tạo Tài khoản Admin & Cấu hình Secrets trên Worker

Hệ thống không hardcode mật khẩu trong mã nguồn. Hãy tạo mã băm mật khẩu PBKDF2-HMAC-SHA256 (100.000 vòng lặp + salt 16 byte) bằng công cụ đi kèm:

```bash
node scripts/hash-admin-password.mjs admin "MatKhauQuanTri_Manh_2026!"
```

Lệnh trên xuất ra 3 biến mật cần đặt trên **Worker `disanthainguyen-backendd`**:
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`

Thiết lập 3 biến này lên Worker `disanthainguyen-backendd`:

```bash
cd D:\code\disanthainguyen_backendd
npx wrangler secret put ADMIN_USERNAME --name disanthainguyen-backendd
npx wrangler secret put ADMIN_PASSWORD_HASH --name disanthainguyen-backendd
npx wrangler secret put SESSION_SECRET --name disanthainguyen-backendd
```

*(Các biến `GEMINI_API_KEY_1` .. `GEMINI_API_KEY_9` hiện có trên Worker được giữ nguyên tuyệt đối, không bị ghi đè).*

---

## 5. Kiểm thử Local

1. **Áp dụng migration D1 ở chế độ Local:**
   ```bash
   npx wrangler d1 migrations apply disanthainguyen-contributions --local
   ```

2. **Chạy toàn bộ 27 bài kiểm thử tự động (Gemini RAG + 9-Key Rotation + Durable Object `GEMINI_EXECUTOR` + D1 Contributions + Admin Auth/Moderation + CORS/CSRF):**
   ```bash
   node --no-warnings tests/quality-checks.test.js
   ```

---

## 6. Quy trình Migration Database Production An toàn (Chỉ chạy khi bạn xác nhận)

File `migrations/0001_init_contributions.sql` chỉ sử dụng `CREATE TABLE IF NOT EXISTS` và `CREATE INDEX IF NOT EXISTS`, đảm bảo **không xóa hoặc ghi đè bất kỳ bảng hay dữ liệu nào đang có** trong `disanthainguyen-contributions` (`6a0e2ff6-2230-43ba-8ec4-22987349bb7a`).

Khi bạn sẵn sàng áp dụng lên D1 Production:

1. **Đăng nhập Wrangler (nếu chưa đăng nhập):**
   ```bash
   npx wrangler login
   ```
2. **Kiểm tra danh sách migration chờ áp dụng trên Production:**
   ```bash
   npx wrangler d1 migrations list disanthainguyen-contributions --remote
   ```
3. **Thực thi migration trên D1 Production:**
   ```bash
   npx wrangler d1 migrations apply disanthainguyen-contributions --remote
   ```
4. **Xác nhận các bảng đã tồn tại trên D1 Production:**
   ```bash
   npx wrangler d1 execute disanthainguyen-contributions --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
   ```

---

## 7. Quy trình Deploy Worker và Cloudflare Pages Riêng biệt

### Bước A: Deploy Backend Worker (`disanthainguyen-backendd`)
Triển khai Worker trước để các API `/api/contributions` và `/api/admin/*` sẵn sàng trên `https://disanthainguyen-backendd.tathanh72727.workers.dev`:

```bash
cd D:\code\disanthainguyen_backendd
npx wrangler deploy
```

Kiểm tra nhanh sau khi deploy Worker:
- Mở `https://disanthainguyen-backendd.tathanh72727.workers.dev/health` → xác nhận `"ok": true` và `"communityContributionsD1": true`.

### Bước B: Deploy Frontend & Admin UI lên Cloudflare Pages (`disanthainguyen.pages.dev`)
Trong thư mục `c:\Users\Thanhh\OneDrive\code\KHKT`:

- **Cách 1 (Qua GitHub CI/CD như hiện tại):**
  Commit và push các file giao diện (`index.html`, `style.css`, `script.js`, `_headers`, `admin/*`, `functions/api/[[path]].js`) lên nhánh chính của repository `https://github.com/Thawnn10/disanthainguyen`.
  *(Lưu ý: Nếu Cloudflare Pages tự động build từ GitHub, không cần đẩy file `wrangler.toml` của Worker lên nhánh Pages hoặc chỉ giữ `wrangler.toml` trong thư mục Worker `D:\code\disanthainguyen_backendd` để Pages build thuần tĩnh + Pages Functions proxy).*
- **Cách 2 (Deploy trực tiếp qua Wrangler Pages CLI):**
  ```bash
  npx wrangler pages deploy . --project-name disanthainguyen
  ```
