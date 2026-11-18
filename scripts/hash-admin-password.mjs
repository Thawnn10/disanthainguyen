#!/usr/bin/env node
/**
 * ============================================================================
 * CÔNG CỤ TẠO MÃ BĂM MẬT KHẨU QUẢN TRỊ AN TOÀN (PBKDF2-HMAC-SHA256)
 * Dự án: Di Sản Thái Nguyên · Âm Vang Di Sản
 *
 * Cách dùng:
 *   node scripts/hash-admin-password.mjs <username> <password>
 *
 * Công cụ này tạo:
 *   1. Chuỗi băm PBKDF2-HMAC-SHA256 (100.000 vòng lặp + salt ngẫu nhiên 16 byte)
 *      để cấu hình vào Cloudflare Secrets (ADMIN_PASSWORD_HASH).
 *   2. Câu lệnh SQL an toàn để thêm/cập nhật tài khoản vào bảng admin_users trên D1.
 *   3. Chuỗi SESSION_SECRET ngẫu nhiên 64 ký tự hex.
 * ============================================================================
 */

import crypto from 'node:crypto';

const args = process.argv.slice(2);
const username = (args[0] || '').trim();
const password = args[1] || '';

if (!username || !password) {
    console.error('Cách dùng: node scripts/hash-admin-password.mjs <username> <password>');
    console.error('Ví dụ:     node scripts/hash-admin-password.mjs admin "MatKhauManh@2026"');
    process.exit(1);
}

if (password.length < 8) {
    console.error('Lỗi: Mật khẩu quản trị phải có tối thiểu 8 ký tự.');
    process.exit(1);
}

const iterations = 100000;
const salt = crypto.randomBytes(16);
const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const passwordHash = `pbkdf2_sha256$${iterations}$${salt.toString('hex')}$${derived.toString('hex')}`;
const sessionSecret = crypto.randomBytes(32).toString('hex');
const nowIso = new Date().toISOString();
const safeUser = username.replace(/'/g, "''");

const sql = `INSERT INTO admin_users (username, password_hash, role, is_active, created_at, updated_at)
VALUES ('${safeUser}', '${passwordHash}', 'admin', 1, '${nowIso}', '${nowIso}')
ON CONFLICT(username) DO UPDATE SET
  password_hash = excluded.password_hash,
  is_active = 1,
  updated_at = excluded.updated_at;`;

if (args.includes('--sql-only')) {
    console.log(sql);
    process.exit(0);
}

console.log('============================================================================');
console.log(' THÔNG TIN CẤU HÌNH BẢO MẬT ADMIN — DI SẢN THÁI NGUYÊN');
console.log('============================================================================\n');
console.log('1) Biến môi trường Cloudflare Pages / Workers Secrets (.dev.vars khi chạy local):');
console.log(`ADMIN_USERNAME=${username}`);
console.log(`ADMIN_PASSWORD_HASH=${passwordHash}`);
console.log(`SESSION_SECRET=${sessionSecret}\n`);
console.log('2) Hoặc câu lệnh khởi tạo trực tiếp trong bảng admin_users (Cloudflare D1):');
console.log(sql);
console.log('\n============================================================================');
