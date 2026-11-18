# Di Sản Thái Nguyên · Âm Vang Di Sản Văn Hóa Phi Vật Thể

**Website Production:** [https://disanthainguyen.pages.dev/](https://disanthainguyen.pages.dev/)  
**Worker Backend API:** `https://disanthainguyen-backendd.tathanh72727.workers.dev`  
**Đơn vị thực hiện:** Nhóm nghiên cứu Khoa học Kỹ thuật — Trường THPT Phú Bình, tỉnh Thái Nguyên.

---

## Kiến trúc Tổng thể

1. **Cloudflare Pages (`disanthainguyen.pages.dev`):**
   - Phục vụ giao diện công khai WebGIS 46 di sản văn hóa phi vật thể (`/`), Modal Đóng góp tri thức cộng đồng (`#contribution-modal`) và giao diện Quản trị hệ thống (`/admin/`).
   - Kèm tầng proxy mỏng không trạng thái (`functions/api/[[path]].js` — không gắn D1, không chứa logic nghiệp vụ) chuyển tiếp request sang Worker `disanthainguyen-backendd`.
2. **Cloudflare Worker (`disanthainguyen-backendd`):**
   - Xử lý **Trợ lý AI Di sản** (`POST /api/chat`, `POST /api/heritage/ask`, `GET /api/heritage/search`, `GET /api/heritage/health`, `GET /api/heritage/health/deep`) với **Durable Object `GEMINI_EXECUTOR` (`GeminiRegionExecutor`)**.
   - Xử lý **Hệ thống Đóng góp Cộng đồng & Quản trị Admin** (`POST /api/contributions`, `/api/admin/*`) kết nối trực tiếp với **Cloudflare D1** qua `env.DB`.
3. **Cloudflare D1 (`disanthainguyen-contributions`):**
   - Binding: `DB`
   - Database name: `disanthainguyen-contributions`
   - Database ID: `6a0e2ff6-2230-43ba-8ec4-22987349bb7a`

---

## Kiểm thử nhanh tại Local

```bash
# 1. Áp dụng migration D1 local cho database disanthainguyen-contributions
npx wrangler d1 migrations apply disanthainguyen-contributions --local

# 2. Chạy bộ 27 bài kiểm thử tự động (AI RAG + Durable Object + D1 Contributions + Admin + CORS/CSRF)
node --no-warnings tests/quality-checks.test.js
```

Xem hướng dẫn triển khai chi tiết tại [CONTRIBUTION-DEPLOYMENT.md](file:///c:/Users/Thanhh/OneDrive/code/KHKT/CONTRIBUTION-DEPLOYMENT.md).
