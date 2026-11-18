# Di Sản Thái Nguyên · Âm Vang Di Sản Văn Hóa Phi Vật Thể

**Website:** [https://disanthainguyen.pages.dev/](https://disanthainguyen.pages.dev/)  
**Đơn vị thực hiện:** Nhóm nghiên cứu Khoa học Kỹ thuật — Trường THPT Phú Bình, tỉnh Thái Nguyên.

---

## Giới thiệu dự án

**Di Sản Thái Nguyên · Âm Vang Di Sản** là nền tảng bản đồ số WebGIS tương tác cấp **xã/phường** số hóa **46 di sản văn hóa phi vật thể** trên địa bàn tỉnh Thái Nguyên sau sáp nhập (bao gồm 1 di sản đại diện của nhân loại được UNESCO ghi danh và 45 di sản văn hóa phi vật thể quốc gia thuộc 6 nhóm loại hình).

### Các phân hệ chính:
1. **Bản đồ số WebGIS tương tác (`/`):** Tra cứu trực quan 46 di sản theo từng xã/phường hoặc theo cấp ghi danh (UNESCO / Quốc gia) và 6 loại hình di sản.
2. **Kho tư liệu đa phương tiện & Trình phát âm thanh:** Hình ảnh tư liệu, thông tin quyết định ghi danh và trình phát giai điệu dân gian (Hát Then, Sọong cô, Sấng cọ, Lượn cọi, Sli...).
3. **Trợ lý Di sản AI:** Hỏi đáp thông minh song ngữ Việt – Anh về văn hóa, lịch sử và di sản Thái Nguyên.
4. **Trò chơi tương tác "Sắc màu Di sản Thái Nguyên":** Hệ thống thử thách trắc nghiệm, nhận diện hình ảnh và mở khóa dữ kiện.
5. **Hệ thống Đóng góp Tri thức Cộng đồng & Trang Quản trị (`/admin/`):**
   - Cho phép học sinh, giáo viên và cộng đồng gửi tư liệu, câu chuyện văn hóa và ý kiến đóng góp trực tiếp từ giao diện chính (**Nút ĐÓNG GÓP**).
   - Lưu trữ toàn bộ dữ liệu trên **Cloudflare D1** với trạng thái kiểm duyệt chặt chẽ (`pending` → `approved` / `rejected` / `archived`).
   - Trang quản trị `/admin/` dành cho ban điều hành dự án để thống kê, tìm kiếm, phân loại, kiểm duyệt và xuất báo cáo CSV.

---

## Cấu trúc mã nguồn

```text
├── index.html                        # Giao diện chính (WebGIS, Modal Di sản, Quiz, Chatbot AI, Modal Đóng góp)
├── style.css                         # Thiết kế giao diện chính (Sáng/Tối, Responsive, Modal Đóng góp)
├── script.js                         # Logic ứng dụng chính, Bản đồ Leaflet, Audio, Chatbot AI & Form Đóng góp
├── heritage-data.js                  # Cơ sở dữ liệu 46 di sản văn hóa phi vật thể tỉnh Thái Nguyên
├── heritage-quiz.js                  # Logic trò chơi Sắc màu Di sản Thái Nguyên
├── heritage-quiz-data.js             # Ngân hàng câu hỏi trò chơi di sản
├── heritage-quiz.css                 # Giao diện trò chơi di sản
├── thainguyen.geojson                # Dữ liệu ranh giới địa lý cấp xã/phường tỉnh Thái Nguyên
├── admin/
│   ├── index.html                    # Giao diện Quản trị hệ thống (/admin/)
│   ├── admin.css                     # Thiết kế SaaS phẳng chuyên nghiệp (Không sử dụng gradient)
│   └── admin.js                      # Logic trang quản trị, thống kê, kiểm duyệt & xuất CSV
├── functions/
│   └── api/
│       └── [[path]].js               # Cloudflare Pages Functions API (/api/contributions & /api/admin/*)
├── migrations/
│   └── 0001_init_contributions.sql   # Migration khởi tạo các bảng Cloudflare D1
├── scripts/
│   └── hash-admin-password.mjs       # Công cụ CLI băm mật khẩu quản trị (PBKDF2-HMAC-SHA256)
├── wrangler.toml                     # Cấu hình Cloudflare Pages & D1 Database
└── CONTRIBUTION-DEPLOYMENT.md        # Hướng dẫn chi tiết cấu hình Cloudflare D1, Secrets & Deploy
```

---

## Chạy thử nghiệm ở môi trường Local

1. **Khởi tạo cơ sở dữ liệu D1 local:**
   ```bash
   npx wrangler d1 migrations apply disanthainguyen-db --local
   ```

2. **Tạo tài khoản Admin cho môi trường local (`.dev.vars`):**
   ```bash
   node scripts/hash-admin-password.mjs admin "MatKhauManh@2026"
   ```
   Sao chép 3 dòng `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` vào file `.dev.vars`.

3. **Khởi động server phát triển:**
   ```bash
   npx wrangler pages dev . --d1 DB=disanthainguyen-db --port 8788
   ```
   - Trang công khai: `http://localhost:8788/`
   - Trang quản trị: `http://localhost:8788/admin/`

Xem hướng dẫn triển khai đầy đủ tại [CONTRIBUTION-DEPLOYMENT.md](file:///c:/Users/Thanhh/OneDrive/code/KHKT/CONTRIBUTION-DEPLOYMENT.md).
