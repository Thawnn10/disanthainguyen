/**
 * ============================================================================
 * MODULE ĐÓNG GÓP TRI THỨC CỘNG ĐỒNG & QUẢN TRỊ HỆ THỐNG (CLOUDFLARE D1)
 * Dự án KHKT: DI SẢN THÁI NGUYÊN · ÂM VANG DI SẢN
 * Tích hợp trực tiếp trong Worker: disanthainguyen-backendd (binding: env.DB)
 * Database: disanthainguyen-contributions (6a0e2ff6-2230-43ba-8ec4-22987349bb7a)
 * ============================================================================
 */

export const ALLOWED_CONTRIBUTION_TYPES = [
    'Bổ sung kiến thức di sản',
    'Chia sẻ câu chuyện văn hóa',
    'Đề xuất cải thiện website',
    'Báo lỗi hoặc đính chính thông tin',
    'Ý tưởng phát triển dự án',
    'Khác'
];

export const ALLOWED_STATUSES = ['pending', 'approved', 'rejected', 'archived'];

export const SESSION_COOKIE_NAME = 'dstn_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 giờ

const PUBLIC_RATE_WINDOW_SEC = 10 * 60; // 10 phút
const PUBLIC_RATE_MAX_COUNT = 5;        // Tối đa 5 lần gửi / 10 phút / IP
const PUBLIC_BURST_COOLDOWN_SEC = 8;    // Tối thiểu 8 giây giữa 2 lần gửi liên tiếp

const LOGIN_RATE_WINDOW_SEC = 15 * 60;  // 15 phút
const LOGIN_MAX_FAILS = 5;              // Tối đa 5 lần sai mật khẩu
const LOGIN_LOCKOUT_SEC = 15 * 60;      // Khóa 15 phút khi vượt ngưỡng

const memoryRateMap = new Map();

/* ─────────────────────────── HELPERS: CRYPTO & PBKDF2 ─────────────────────────── */

function bytesToHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
    if (!hex || hex.length % 2 !== 0) return new Uint8Array(0);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function randomHex(byteLength = 16) {
    const buf = new Uint8Array(byteLength);
    crypto.getRandomValues(buf);
    return bytesToHex(buf);
}

async function sha256Hex(input) {
    const data = new TextEncoder().encode(String(input));
    const digest = await crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256Hex(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(String(secret)),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(message)));
    return bytesToHex(new Uint8Array(sig));
}

function timingSafeEqualStr(a, b) {
    const strA = String(a || '');
    const strB = String(b || '');
    const enc = new TextEncoder();
    const bufA = enc.encode(strA);
    const bufB = enc.encode(strB);
    const len = Math.max(bufA.length, bufB.length);
    let diff = bufA.length ^ bufB.length;
    for (let i = 0; i < len; i++) {
        diff |= (bufA[i] || 0) ^ (bufB[i] || 0);
    }
    return diff === 0;
}

/**
 * Định dạng password hash:
 * pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
 */
export async function hashPasswordPBKDF2(password, iterations = 100000, saltHex = null) {
    const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        'raw',
        enc.encode(String(password)),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt,
            iterations,
            hash: 'SHA-256'
        },
        baseKey,
        256
    );
    const hashHex = bytesToHex(new Uint8Array(derivedBits));
    return `pbkdf2_sha256$${iterations}$${bytesToHex(salt)}$${hashHex}`;
}

export async function verifyPasswordPBKDF2(password, storedHash) {
    if (!password || !storedHash || typeof storedHash !== 'string') return false;
    const parts = storedHash.trim().split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
    const iterations = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const expectedHashHex = parts[3];
    if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 600000) return false;
    if (!saltHex || !expectedHashHex) return false;
    try {
        const computed = await hashPasswordPBKDF2(password, iterations, saltHex);
        return timingSafeEqualStr(computed, storedHash.trim());
    } catch {
        return false;
    }
}

/* ─────────────────────────── HELPERS: SANITIZATION & ID ─────────────────────────── */

function cleanSingleLine(val) {
    if (typeof val !== 'string') return '';
    return val
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanMultiLine(val) {
    if (typeof val !== 'string') return '';
    return val
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();
}

function hasSuspiciousInjectionPayload(str) {
    if (!str) return false;
    return /<\s*script\b|javascript\s*:|onerror\s*=|onload\s*=|<\s*iframe\b|<\s*object\b/i.test(str);
}

function generateContributionId() {
    const now = new Date();
    const yy = String(now.getUTCFullYear()).slice(-2);
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    let suffix = '';
    for (let i = 0; i < 6; i++) {
        suffix += alphabet[bytes[i] % alphabet.length];
    }
    return `DSTN-${yy}${mm}${dd}-${suffix}`;
}

/* ─────────────────────────── HELPERS: ORIGIN, CORS & COOKIES ─────────────────────────── */

export function isTrustedFrontendOrigin(origin, requestUrl, env = {}) {
    if (!origin) return true;
    try {
        const origUrl = new URL(origin);
        const reqUrl = new URL(requestUrl);

        // 1. Cùng host với Worker hoặc Proxy
        if (origUrl.host === reqUrl.host) return true;

        // 2. Domain chính thức Cloudflare Pages của dự án (bao gồm cả preview subdomains)
        if (
            origUrl.protocol === 'https:' &&
            (origUrl.hostname === 'disanthainguyen.pages.dev' ||
                origUrl.hostname.endsWith('.disanthainguyen.pages.dev') ||
                origUrl.hostname === 'disanthainguyen-backendd.tathanh72727.workers.dev')
        ) {
            return true;
        }

        // 3. Môi trường kiểm thử Localhost
        if (
            (origUrl.protocol === 'http:' || origUrl.protocol === 'https:') &&
            (origUrl.hostname === 'localhost' || origUrl.hostname === '127.0.0.1')
        ) {
            return true;
        }

        // 4. Danh sách ALLOWED_ORIGINS cấu hình thêm trong env
        const rawAllowed = String(env?.ALLOWED_ORIGINS || '').trim();
        if (rawAllowed && rawAllowed !== '*') {
            const list = rawAllowed.split(',').map(s => s.trim()).filter(Boolean);
            if (list.includes(origin) || list.includes(origUrl.origin)) return true;
        }

        return false;
    } catch {
        return false;
    }
}

export function resolveCorsHeaders(request, env = {}) {
    const origin = request.headers.get('Origin') || '';
    const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Requested-With, X-CSRF-Token',
        'Access-Control-Expose-Headers': 'Content-Disposition',
        'Access-Control-Max-Age': '86400'
    };

    if (origin && isTrustedFrontendOrigin(origin, request.url, env)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
        headers['Vary'] = 'Origin';
    } else {
        const rawAllowed = String(env?.ALLOWED_ORIGINS || '*').trim();
        if (rawAllowed === '*') {
            headers['Access-Control-Allow-Origin'] = '*';
        }
    }

    return headers;
}

function securityHeaders(request, env, extra = {}) {
    return {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        ...resolveCorsHeaders(request, env),
        ...extra
    };
}

function jsonResponse(request, env, data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: securityHeaders(request, env, extraHeaders)
    });
}

function parseCookies(cookieHeader) {
    const out = {};
    if (!cookieHeader) return out;
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx === -1) continue;
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        try {
            out[k] = decodeURIComponent(v);
        } catch {
            out[k] = v;
        }
    }
    return out;
}

function detectCookieMode(request) {
    const reqUrl = new URL(request.url);
    const forwardedProto = (request.headers.get('X-Forwarded-Proto') || '').toLowerCase();
    const isHttps = reqUrl.protocol === 'https:' || forwardedProto === 'https';

    // Nếu đi qua Pages Functions Proxy cùng origin, proxy sẽ gửi X-Forwarded-Host
    const proxiedHost = request.headers.get('X-Forwarded-Host') || '';
    const origin = request.headers.get('Origin') || '';

    let isCrossSite = false;
    if (origin && !proxiedHost) {
        try {
            const origUrl = new URL(origin);
            if (origUrl.host !== reqUrl.host) {
                isCrossSite = true;
            }
        } catch { }
    }

    return { isHttps, isCrossSite };
}

function buildSessionCookie(token, request, maxAge = SESSION_TTL_SECONDS) {
    const { isHttps, isCrossSite } = detectCookieMode(request);
    const sameSite = isHttps && isCrossSite ? 'None' : 'Lax';
    const parts = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        `SameSite=${sameSite}`,
        `Max-Age=${maxAge}`
    ];
    if (isHttps) parts.push('Secure');
    if (isHttps && isCrossSite) parts.push('Partitioned');
    return parts.join('; ');
}

function clearSessionCookie(request) {
    const { isHttps, isCrossSite } = detectCookieMode(request);
    const sameSite = isHttps && isCrossSite ? 'None' : 'Lax';
    const parts = [
        `${SESSION_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        `SameSite=${sameSite}`,
        'Max-Age=0',
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    ];
    if (isHttps) parts.push('Secure');
    if (isHttps && isCrossSite) parts.push('Partitioned');
    return parts.join('; ');
}

function getClientIp(request) {
    return (
        request.headers.get('X-Forwarded-Client-IP') ||
        request.headers.get('CF-Connecting-IP') ||
        (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
        '127.0.0.1'
    );
}

/* ─────────────────────────── DATABASE AUTO-INIT GUARD ─────────────────────────── */

let schemaChecked = false;

export async function ensureDatabaseSchema(db) {
    if (!db) {
        const err = new Error('Chưa cấu hình kết nối Cloudflare D1 (binding DB).');
        err.code = 'DB_MISSING';
        throw err;
    }
    if (schemaChecked) return;
    try {
        await db.batch([
            db.prepare(`CREATE TABLE IF NOT EXISTS contributions (
                id TEXT PRIMARY KEY,
                school_name TEXT NOT NULL,
                contributor_name TEXT NOT NULL,
                contribution_type TEXT NOT NULL DEFAULT 'Bổ sung kiến thức di sản',
                content TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'archived')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                reviewed_at TEXT,
                admin_note TEXT DEFAULT ''
            )`),
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status)`),
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_contributions_created_at ON contributions(created_at DESC)`),
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_contributions_school_name ON contributions(school_name)`),
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_contributions_status_created ON contributions(status, created_at DESC)`),
            db.prepare(`CREATE TABLE IF NOT EXISTS contribution_audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contribution_id TEXT NOT NULL,
                previous_status TEXT,
                new_status TEXT NOT NULL,
                admin_username TEXT NOT NULL,
                admin_note TEXT DEFAULT '',
                changed_at TEXT NOT NULL
            )`),
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_contribution_id ON contribution_audit_logs(contribution_id, changed_at DESC)`),
            db.prepare(`CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_login_at TEXT
            )`),
            db.prepare(`CREATE TABLE IF NOT EXISTS admin_sessions (
                token_hash TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                csrf_token TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                ip_hint TEXT DEFAULT '',
                user_agent TEXT DEFAULT ''
            )`),
            db.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at)`),
            db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
                key TEXT PRIMARY KEY,
                count INTEGER NOT NULL DEFAULT 1,
                window_start INTEGER NOT NULL,
                blocked_until INTEGER NOT NULL DEFAULT 0
            )`)
        ]);
        schemaChecked = true;
    } catch (e) {
        console.warn('[D1 Schema Check]', e.message);
    }
}

/* ─────────────────────────── RATE LIMITING (D1 + MEMORY FALLBACK) ─────────────────────────── */

async function checkAndIncrementRateLimit(db, key, windowSec, maxCount, lockoutSec = 0, burstCooldownSec = 0) {
    const nowSec = Math.floor(Date.now() / 1000);

    try {
        const existing = await db
            .prepare('SELECT key, count, window_start, blocked_until FROM rate_limits WHERE key = ?1')
            .bind(key)
            .first();

        if (existing) {
            if (existing.blocked_until && existing.blocked_until > nowSec) {
                return {
                    allowed: false,
                    retryAfterSec: existing.blocked_until - nowSec,
                    reason: 'locked'
                };
            }

            const elapsed = nowSec - (existing.window_start || 0);
            if (burstCooldownSec > 0 && elapsed < burstCooldownSec && existing.count >= 1) {
                return {
                    allowed: false,
                    retryAfterSec: burstCooldownSec - elapsed,
                    reason: 'burst'
                };
            }

            if (elapsed > windowSec) {
                await db
                    .prepare('UPDATE rate_limits SET count = 1, window_start = ?1, blocked_until = 0 WHERE key = ?2')
                    .bind(nowSec, key)
                    .run();
                return { allowed: true, count: 1 };
            }

            const nextCount = (existing.count || 0) + 1;
            if (nextCount > maxCount) {
                const blockedUntil = lockoutSec > 0 ? nowSec + lockoutSec : (existing.window_start + windowSec);
                await db
                    .prepare('UPDATE rate_limits SET count = ?1, blocked_until = ?2 WHERE key = ?3')
                    .bind(nextCount, blockedUntil, key)
                    .run();
                return {
                    allowed: false,
                    retryAfterSec: Math.max(1, blockedUntil - nowSec),
                    reason: 'limit_exceeded'
                };
            }

            await db
                .prepare('UPDATE rate_limits SET count = ?1 WHERE key = ?2')
                .bind(nextCount, key)
                .run();
            return { allowed: true, count: nextCount };
        } else {
            await db
                .prepare('INSERT INTO rate_limits (key, count, window_start, blocked_until) VALUES (?1, 1, ?2, 0)')
                .bind(key, nowSec)
                .run();
            return { allowed: true, count: 1 };
        }
    } catch {
        const rec = memoryRateMap.get(key) || { count: 0, window_start: nowSec, blocked_until: 0 };
        if (rec.blocked_until > nowSec) {
            return { allowed: false, retryAfterSec: rec.blocked_until - nowSec, reason: 'locked' };
        }
        if (nowSec - rec.window_start > windowSec) {
            rec.count = 1;
            rec.window_start = nowSec;
            rec.blocked_until = 0;
        } else {
            rec.count += 1;
            if (rec.count > maxCount) {
                rec.blocked_until = lockoutSec > 0 ? nowSec + lockoutSec : (rec.window_start + windowSec);
                memoryRateMap.set(key, rec);
                return { allowed: false, retryAfterSec: Math.max(1, rec.blocked_until - nowSec), reason: 'limit_exceeded' };
            }
        }
        memoryRateMap.set(key, rec);
        return { allowed: true, count: rec.count };
    }
}

async function clearRateLimit(db, key) {
    memoryRateMap.delete(key);
    try {
        await db.prepare('DELETE FROM rate_limits WHERE key = ?1').bind(key).run();
    } catch { }
}

/* ─────────────────────────── SESSION & AUTHENTICATION ─────────────────────────── */

async function createAdminSession(db, env, username, request) {
    const rawToken = randomHex(32);
    const csrfToken = randomHex(24);
    const signature = env.SESSION_SECRET
        ? await hmacSha256Hex(env.SESSION_SECRET, rawToken)
        : await sha256Hex('dstn_sig_' + rawToken);
    const signedToken = `${rawToken}.${signature}`;
    const tokenHash = await sha256Hex(signedToken);

    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
    const ipHint = await sha256Hex(getClientIp(request)).then(h => h.slice(0, 16));
    const userAgent = (request.headers.get('User-Agent') || '').slice(0, 180);

    await db
        .prepare('DELETE FROM admin_sessions WHERE expires_at <= ?1')
        .bind(now.toISOString())
        .run()
        .catch(() => { });

    await db
        .prepare(
            `INSERT INTO admin_sessions (token_hash, username, csrf_token, created_at, expires_at, ip_hint, user_agent)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        )
        .bind(
            tokenHash,
            username,
            csrfToken,
            now.toISOString(),
            expires.toISOString(),
            ipHint,
            userAgent
        )
        .run();

    return { signedToken, csrfToken, expiresAt: expires.toISOString() };
}

async function verifyAdminSession(request, db, env, requireCsrf = false) {
    const cookies = parseCookies(request.headers.get('Cookie') || '');
    const signedToken = cookies[SESSION_COOKIE_NAME];
    if (!signedToken || typeof signedToken !== 'string' || !signedToken.includes('.')) {
        return { authenticated: false, error: 'Chưa đăng nhập hoặc phiên làm việc đã kết thúc.' };
    }

    const [rawToken, providedSig] = signedToken.split('.');
    if (!rawToken || !providedSig) {
        return { authenticated: false, error: 'Phiên đăng nhập không hợp lệ.' };
    }

    const expectedSig = env.SESSION_SECRET
        ? await hmacSha256Hex(env.SESSION_SECRET, rawToken)
        : await sha256Hex('dstn_sig_' + rawToken);

    if (!timingSafeEqualStr(providedSig, expectedSig)) {
        return { authenticated: false, error: 'Chữ ký phiên không hợp lệ.' };
    }

    const tokenHash = await sha256Hex(signedToken);
    const nowIso = new Date().toISOString();

    const session = await db
        .prepare(
            `SELECT token_hash, username, csrf_token, created_at, expires_at
             FROM admin_sessions
             WHERE token_hash = ?1 AND expires_at > ?2`
        )
        .bind(tokenHash, nowIso)
        .first();

    if (!session) {
        return { authenticated: false, error: 'Phiên đăng nhập đã hết hạn hoặc đã đăng xuất.' };
    }

    if (requireCsrf) {
        const origin = request.headers.get('Origin') || '';
        if (origin && !isTrustedFrontendOrigin(origin, request.url, env)) {
            return { authenticated: false, status: 403, error: 'Yêu cầu bị từ chối do nguồn (Origin) không được phép.' };
        }
        const csrfHeader = request.headers.get('X-CSRF-Token') || '';
        if (!csrfHeader || !timingSafeEqualStr(csrfHeader, session.csrf_token)) {
            return { authenticated: false, status: 403, error: 'Mã xác thực bảo mật CSRF không hợp lệ. Vui lòng tải lại trang.' };
        }
    }

    return {
        authenticated: true,
        username: session.username,
        csrfToken: session.csrf_token,
        tokenHash
    };
}

async function authenticateAdminCredentials(db, env, username, password) {
    // 1. Kiểm tra trong bảng admin_users (D1)
    try {
        const dbUser = await db
            .prepare('SELECT id, username, password_hash, role, is_active FROM admin_users WHERE username = ?1 LIMIT 1')
            .bind(username)
            .first();

        if (dbUser) {
            if (!dbUser.is_active) {
                return { ok: false, reason: 'inactive', message: 'Tài khoản quản trị này đã bị vô hiệu hóa.' };
            }
            const match = await verifyPasswordPBKDF2(password, dbUser.password_hash);
            if (match) {
                await db
                    .prepare('UPDATE admin_users SET last_login_at = ?1 WHERE id = ?2')
                    .bind(new Date().toISOString(), dbUser.id)
                    .run()
                    .catch(() => { });
                return { ok: true, username: dbUser.username, role: dbUser.role || 'admin' };
            }
            return { ok: false, reason: 'invalid_credentials' };
        }
    } catch { }

    // 2. Kiểm tra qua biến môi trường Cloudflare Worker Secrets (ADMIN_USERNAME + ADMIN_PASSWORD_HASH)
    const envUser = env.ADMIN_USERNAME ? String(env.ADMIN_USERNAME).trim() : '';
    const envHash = env.ADMIN_PASSWORD_HASH ? String(env.ADMIN_PASSWORD_HASH).trim() : '';

    if (envUser && envHash) {
        const userOk = timingSafeEqualStr(username, envUser);
        const passOk = await verifyPasswordPBKDF2(password, envHash);
        if (userOk && passOk) {
            return { ok: true, username: envUser, role: 'admin' };
        }
        return { ok: false, reason: 'invalid_credentials' };
    }

    let count = 0;
    try {
        const row = await db.prepare('SELECT COUNT(*) as total FROM admin_users').first();
        count = Number(row?.total || 0);
    } catch { }

    if (count === 0 && !envHash) {
        return {
            ok: false,
            reason: 'not_configured',
            message: 'Tài khoản Quản trị viên chưa được khởi tạo trên Worker. Vui lòng tạo tài khoản bằng lệnh hash-admin-password theo hướng dẫn trong CONTRIBUTION-DEPLOYMENT.md.'
        };
    }

    return { ok: false, reason: 'invalid_credentials' };
}

/* ─────────────────────────── HANDLER: PUBLIC POST /api/contributions ─────────────────────────── */

async function handlePublicCreateContribution(request, db, env) {
    const origin = request.headers.get('Origin') || '';
    if (origin && !isTrustedFrontendOrigin(origin, request.url, env)) {
        return jsonResponse(request, env, { error: 'Yêu cầu không hợp lệ từ nguồn bên ngoài.' }, 403);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
        return jsonResponse(request, env, { error: 'Định dạng dữ liệu không hợp lệ (yêu cầu application/json).' }, 415);
    }

    let body;
    try {
        const rawText = await request.text();
        if (rawText.length > 32768) {
            return jsonResponse(request, env, { error: 'Dữ liệu gửi lên vượt quá kích thước cho phép.' }, 413);
        }
        body = JSON.parse(rawText);
    } catch {
        return jsonResponse(request, env, { error: 'Dữ liệu JSON không hợp lệ.' }, 400);
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return jsonResponse(request, env, { error: 'Dữ liệu biểu mẫu không hợp lệ.' }, 400);
    }

    const allowedKeys = new Set(['school_name', 'contributor_name', 'contribution_type', 'content', 'website']);
    for (const key of Object.keys(body)) {
        if (!allowedKeys.has(key)) {
            return jsonResponse(request, env, { error: `Trường dữ liệu không hợp lệ: "${key}".` }, 400);
        }
    }

    if (body.website && String(body.website).trim() !== '') {
        return jsonResponse(request, env, { error: 'Hệ thống phát hiện yêu cầu tự động không hợp lệ.' }, 400);
    }

    const schoolName = cleanSingleLine(body.school_name);
    const contributorName = cleanSingleLine(body.contributor_name);
    const rawType = cleanSingleLine(body.contribution_type);
    const contributionType = rawType || 'Bổ sung kiến thức di sản';
    const content = cleanMultiLine(body.content);

    const fieldErrors = {};
    if (!schoolName) {
        fieldErrors.school_name = 'Vui lòng nhập trường đang học / đang giảng dạy hoặc đơn vị công tác.';
    } else if (schoolName.length < 2 || schoolName.length > 180) {
        fieldErrors.school_name = 'Tên trường / đơn vị cần có độ dài từ 2 đến 180 ký tự.';
    }

    if (!contributorName) {
        fieldErrors.contributor_name = 'Vui lòng nhập họ và tên của bạn.';
    } else if (contributorName.length < 2 || contributorName.length > 120) {
        fieldErrors.contributor_name = 'Họ và tên cần có độ dài từ 2 đến 120 ký tự.';
    }

    if (!ALLOWED_CONTRIBUTION_TYPES.includes(contributionType)) {
        fieldErrors.contribution_type = 'Danh mục phân loại đóng góp không hợp lệ.';
    }

    if (!content) {
        fieldErrors.content = 'Vui lòng nhập nội dung đóng góp.';
    } else if (content.length < 10) {
        fieldErrors.content = 'Nội dung đóng góp quá ngắn (tối thiểu 10 ký tự).';
    } else if (content.length > 5000) {
        fieldErrors.content = 'Nội dung đóng góp vượt quá giới hạn 5.000 ký tự.';
    }

    if (
        hasSuspiciousInjectionPayload(schoolName) ||
        hasSuspiciousInjectionPayload(contributorName) ||
        hasSuspiciousInjectionPayload(content)
    ) {
        return jsonResponse(
            request,
            env,
            { error: 'Nội dung chứa mã thực thi hoặc thẻ không được phép. Vui lòng chỉ nhập văn bản thuần túy.' },
            400
        );
    }

    if (Object.keys(fieldErrors).length > 0) {
        const firstMsg = Object.values(fieldErrors)[0];
        return jsonResponse(request, env, { error: firstMsg, fields: fieldErrors }, 400);
    }

    const ip = getClientIp(request);
    const ipHash = (await sha256Hex('contrib_ip_' + ip)).slice(0, 24);
    const rate = await checkAndIncrementRateLimit(
        db,
        `pub_contrib:${ipHash}`,
        PUBLIC_RATE_WINDOW_SEC,
        PUBLIC_RATE_MAX_COUNT,
        0,
        PUBLIC_BURST_COOLDOWN_SEC
    );

    if (!rate.allowed) {
        const msg =
            rate.reason === 'burst'
                ? `Bạn thao tác quá nhanh. Vui lòng đợi ${rate.retryAfterSec} giây trước khi gửi tiếp.`
                : `Bạn đã gửi nhiều đóng góp trong thời gian ngắn. Vui lòng thử lại sau ${Math.ceil(rate.retryAfterSec / 60)} phút.`;
        return jsonResponse(
            request,
            env,
            { error: msg, retryAfterSec: rate.retryAfterSec },
            429,
            { 'Retry-After': String(rate.retryAfterSec) }
        );
    }

    const tenMinAgoIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const duplicate = await db
        .prepare(
            `SELECT id FROM contributions
             WHERE contributor_name = ?1 AND school_name = ?2 AND content = ?3 AND created_at >= ?4
             LIMIT 1`
        )
        .bind(contributorName, schoolName, content, tenMinAgoIso)
        .first();

    if (duplicate) {
        return jsonResponse(
            request,
            env,
            {
                error: 'Nội dung đóng góp này vừa được hệ thống tiếp nhận. Cảm ơn bạn đã gửi thông tin!',
                duplicateId: duplicate.id
            },
            409
        );
    }

    let id = generateContributionId();
    for (let attempt = 0; attempt < 3; attempt++) {
        const exists = await db.prepare('SELECT id FROM contributions WHERE id = ?1').bind(id).first();
        if (!exists) break;
        id = generateContributionId();
    }

    const nowIso = new Date().toISOString();

    const insertResult = await db
        .prepare(
            `INSERT INTO contributions (
                id, school_name, contributor_name, contribution_type, content,
                status, created_at, updated_at, reviewed_at, admin_note
            ) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?6, NULL, '')`
        )
        .bind(id, schoolName, contributorName, contributionType, content, nowIso)
        .run();

    if (!insertResult || insertResult.success === false) {
        return jsonResponse(request, env, { error: 'Không thể lưu đóng góp vào cơ sở dữ liệu. Vui lòng thử lại.' }, 500);
    }

    return jsonResponse(
        request,
        env,
        {
            ok: true,
            id,
            status: 'pending',
            created_at: nowIso,
            message:
                'Đóng góp của bạn đã được gửi thành công! Cảm ơn bạn đã chung tay gìn giữ và lan tỏa những giá trị văn hóa của Di Sản Thái Nguyên. Nội dung sẽ được đội ngũ quản trị kiểm duyệt trước khi sử dụng.'
        },
        201
    );
}

/* ─────────────────────────── HANDLERS: ADMIN AUTH ─────────────────────────── */

async function handleAdminLogin(request, db, env) {
    const origin = request.headers.get('Origin') || '';
    if (origin && !isTrustedFrontendOrigin(origin, request.url, env)) {
        return jsonResponse(request, env, { error: 'Yêu cầu bị từ chối do khác nguồn.' }, 403);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse(request, env, { error: 'Dữ liệu đăng nhập không hợp lệ.' }, 400);
    }

    const username = cleanSingleLine(body?.username || '');
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!username || !password) {
        return jsonResponse(request, env, { error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' }, 400);
    }

    if (username.length > 80 || password.length > 256) {
        return jsonResponse(request, env, { error: 'Thông tin đăng nhập vượt quá độ dài cho phép.' }, 400);
    }

    const ip = getClientIp(request);
    const rateKey = `admin_login:${(await sha256Hex(ip + ':' + username.toLowerCase())).slice(0, 24)}`;

    const nowSec = Math.floor(Date.now() / 1000);
    const existingRate = await db
        .prepare('SELECT count, window_start, blocked_until FROM rate_limits WHERE key = ?1')
        .bind(rateKey)
        .first()
        .catch(() => null);

    if (existingRate && existingRate.blocked_until > nowSec) {
        const waitSec = existingRate.blocked_until - nowSec;
        return jsonResponse(
            request,
            env,
            {
                error: `Tài khoản tạm khóa đăng nhập do nhập sai nhiều lần. Vui lòng thử lại sau ${Math.ceil(waitSec / 60)} phút.`,
                retryAfterSec: waitSec
            },
            429,
            { 'Retry-After': String(waitSec) }
        );
    }

    const authResult = await authenticateAdminCredentials(db, env, username, password);

    if (!authResult.ok) {
        if (authResult.reason === 'not_configured') {
            return jsonResponse(request, env, { error: authResult.message, code: 'ADMIN_NOT_CONFIGURED' }, 503);
        }

        const rl = await checkAndIncrementRateLimit(
            db,
            rateKey,
            LOGIN_RATE_WINDOW_SEC,
            LOGIN_MAX_FAILS,
            LOGIN_LOCKOUT_SEC,
            0
        );

        if (!rl.allowed) {
            return jsonResponse(
                request,
                env,
                {
                    error: `Bạn đã nhập sai quá ${LOGIN_MAX_FAILS} lần. Hệ thống tạm khóa đăng nhập trong 15 phút.`,
                    retryAfterSec: rl.retryAfterSec
                },
                429,
                { 'Retry-After': String(rl.retryAfterSec) }
            );
        }

        const remaining = Math.max(0, LOGIN_MAX_FAILS - (rl.count || 1));
        return jsonResponse(
            request,
            env,
            {
                error:
                    authResult.message ||
                    `Tên đăng nhập hoặc mật khẩu không chính xác.${remaining > 0 ? ` Còn ${remaining} lần thử.` : ''}`
            },
            401
        );
    }

    await clearRateLimit(db, rateKey);

    const session = await createAdminSession(db, env, authResult.username, request);

    return jsonResponse(
        request,
        env,
        {
            ok: true,
            user: {
                username: authResult.username,
                role: authResult.role || 'admin'
            },
            csrfToken: session.csrfToken,
            expiresAt: session.expiresAt
        },
        200,
        {
            'Set-Cookie': buildSessionCookie(session.signedToken, request)
        }
    );
}

async function handleAdminLogout(request, db, env) {
    const cookies = parseCookies(request.headers.get('Cookie') || '');
    const signedToken = cookies[SESSION_COOKIE_NAME];

    if (signedToken) {
        const tokenHash = await sha256Hex(signedToken);
        await db
            .prepare('DELETE FROM admin_sessions WHERE token_hash = ?1')
            .bind(tokenHash)
            .run()
            .catch(() => { });
    }

    return jsonResponse(
        request,
        env,
        { ok: true, message: 'Đã đăng xuất thành công.' },
        200,
        { 'Set-Cookie': clearSessionCookie(request) }
    );
}

async function handleAdminMe(request, db, env) {
    const session = await verifyAdminSession(request, db, env, false);
    if (!session.authenticated) {
        return jsonResponse(request, env, { authenticated: false, error: session.error }, 401);
    }
    return jsonResponse(request, env, {
        authenticated: true,
        user: { username: session.username, role: 'admin' },
        csrfToken: session.csrfToken
    });
}

async function handleAdminChangePassword(request, db, env) {
    const session = await verifyAdminSession(request, db, env, true);
    if (!session.authenticated) {
        return jsonResponse(request, env, { error: session.error }, session.status || 401);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse(request, env, { error: 'Dữ liệu JSON không hợp lệ.' }, 400);
    }

    const currentPassword = typeof body?.current_password === 'string' ? body.current_password : '';
    const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';

    if (!currentPassword || !newPassword) {
        return jsonResponse(request, env, { error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.' }, 400);
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
        return jsonResponse(request, env, { error: 'Mật khẩu mới phải có độ dài từ 8 đến 128 ký tự.' }, 400);
    }

    const check = await authenticateAdminCredentials(db, env, session.username, currentPassword);
    if (!check.ok) {
        return jsonResponse(request, env, { error: 'Mật khẩu hiện tại không chính xác.' }, 400);
    }

    const newHash = await hashPasswordPBKDF2(newPassword);
    const nowIso = new Date().toISOString();

    const existingUser = await db
        .prepare('SELECT id FROM admin_users WHERE username = ?1')
        .bind(session.username)
        .first();

    if (existingUser) {
        await db
            .prepare('UPDATE admin_users SET password_hash = ?1, updated_at = ?2 WHERE id = ?3')
            .bind(newHash, nowIso, existingUser.id)
            .run();
    } else {
        await db
            .prepare(
                `INSERT INTO admin_users (username, password_hash, role, is_active, created_at, updated_at)
                 VALUES (?1, ?2, 'admin', 1, ?3, ?3)`
            )
            .bind(session.username, newHash, nowIso)
            .run();
    }

    await db
        .prepare('DELETE FROM admin_sessions WHERE username = ?1 AND token_hash != ?2')
        .bind(session.username, session.tokenHash)
        .run()
        .catch(() => { });

    return jsonResponse(request, env, {
        ok: true,
        message: 'Đã cập nhật mật khẩu quản trị thành công.'
    });
}

/* ─────────────────────────── HANDLERS: ADMIN STATS, LIST, DETAIL, PATCH, CSV ─────────────────────────── */

async function handleAdminStats(request, db, env) {
    const session = await verifyAdminSession(request, db, env, false);
    if (!session.authenticated) {
        return jsonResponse(request, env, { error: session.error }, 401);
    }

    const statusRows = await db
        .prepare('SELECT status, COUNT(*) as count FROM contributions GROUP BY status')
        .all();

    const counts = {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        archived: 0
    };

    for (const row of statusRows?.results || []) {
        const st = row.status;
        const c = Number(row.count || 0);
        if (st in counts) counts[st] = c;
        counts.total += c;
    }

    const typeRows = await db
        .prepare('SELECT contribution_type, COUNT(*) as count FROM contributions GROUP BY contribution_type ORDER BY count DESC')
        .all();

    const schoolRows = await db
        .prepare('SELECT school_name, COUNT(*) as count FROM contributions GROUP BY school_name ORDER BY count DESC LIMIT 8')
        .all();

    const fourteenDaysAgo = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    fourteenDaysAgo.setUTCHours(0, 0, 0, 0);

    const timelineRows = await db
        .prepare(
            `SELECT substr(created_at, 1, 10) as day, COUNT(*) as count
             FROM contributions
             WHERE created_at >= ?1
             GROUP BY substr(created_at, 1, 10)
             ORDER BY day ASC`
        )
        .bind(fourteenDaysAgo.toISOString())
        .all();

    const dayMap = new Map();
    for (const r of timelineRows?.results || []) {
        dayMap.set(r.day, Number(r.count || 0));
    }

    const timeline = [];
    for (let i = 0; i < 14; i++) {
        const d = new Date(fourteenDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
        const dayStr = d.toISOString().slice(0, 10);
        timeline.push({
            date: dayStr,
            count: dayMap.get(dayStr) || 0
        });
    }

    return jsonResponse(request, env, {
        ok: true,
        stats: counts,
        byType: (typeRows?.results || []).map(r => ({
            contribution_type: r.contribution_type,
            count: Number(r.count || 0)
        })),
        topSchools: (schoolRows?.results || []).map(r => ({
            school_name: r.school_name,
            count: Number(r.count || 0)
        })),
        timeline
    });
}

function buildContributionFilterQuery(url) {
    const status = (url.searchParams.get('status') || 'all').trim();
    const type = (url.searchParams.get('type') || 'all').trim();
    const q = cleanSingleLine(url.searchParams.get('q') || '');
    const sort = (url.searchParams.get('sort') || 'newest').trim();

    const conditions = [];
    const params = [];

    if (status && status !== 'all' && ALLOWED_STATUSES.includes(status)) {
        params.push(status);
        conditions.push(`status = ?${params.length}`);
    }

    if (type && type !== 'all' && ALLOWED_CONTRIBUTION_TYPES.includes(type)) {
        params.push(type);
        conditions.push(`contribution_type = ?${params.length}`);
    }

    if (q) {
        const likeVal = `%${q.replace(/[%_]/g, '\\$&')}%`;
        params.push(likeVal);
        const idx = params.length;
        conditions.push(
            `(id LIKE ?${idx} ESCAPE '\\' OR contributor_name LIKE ?${idx} ESCAPE '\\' OR school_name LIKE ?${idx} ESCAPE '\\' OR content LIKE ?${idx} ESCAPE '\\')`
        );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'ORDER BY created_at DESC';
    if (sort === 'oldest') orderBy = 'ORDER BY created_at ASC';
    else if (sort === 'updated') orderBy = 'ORDER BY updated_at DESC';
    else if (sort === 'school') orderBy = 'ORDER BY school_name ASC, created_at DESC';

    return { whereClause, orderBy, params };
}

async function handleAdminListContributions(request, db, env) {
    const session = await verifyAdminSession(request, db, env, false);
    if (!session.authenticated) {
        return jsonResponse(request, env, { error: session.error }, 401);
    }

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '15', 10) || 15));
    const offset = (page - 1) * limit;

    const { whereClause, orderBy, params } = buildContributionFilterQuery(url);

    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM contributions ${whereClause}`);
    const countRow = await (params.length ? countStmt.bind(...params) : countStmt).first();
    const total = Number(countRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const dataSql = `
        SELECT
            id,
            school_name,
            contributor_name,
            contribution_type,
            content,
            status,
            created_at,
            updated_at,
            reviewed_at,
            admin_note
        FROM contributions
        ${whereClause}
        ${orderBy}
        LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}
    `;

    const dataStmt = db.prepare(dataSql).bind(...params, limit, offset);
    const rows = await dataStmt.all();

    return jsonResponse(request, env, {
        ok: true,
        items: rows?.results || [],
        pagination: {
            page,
            limit,
            total,
            totalPages
        }
    });
}

async function handleAdminGetContributionDetail(request, db, env, id) {
    const session = await verifyAdminSession(request, db, env, false);
    if (!session.authenticated) {
        return jsonResponse(request, env, { error: session.error }, 401);
    }

    const cleanId = cleanSingleLine(decodeURIComponent(id || ''));
    if (!cleanId) {
        return jsonResponse(request, env, { error: 'Mã đóng góp không hợp lệ.' }, 400);
    }

    const item = await db
        .prepare(
            `SELECT
                id, school_name, contributor_name, contribution_type, content,
                status, created_at, updated_at, reviewed_at, admin_note
             FROM contributions
             WHERE id = ?1`
        )
        .bind(cleanId)
        .first();

    if (!item) {
        return jsonResponse(request, env, { error: 'Không tìm thấy bản ghi đóng góp này.' }, 404);
    }

    const logs = await db
        .prepare(
            `SELECT id, contribution_id, previous_status, new_status, admin_username, admin_note, changed_at
             FROM contribution_audit_logs
             WHERE contribution_id = ?1
             ORDER BY changed_at DESC, id DESC`
        )
        .bind(cleanId)
        .all();

    return jsonResponse(request, env, {
        ok: true,
        item,
        auditLogs: logs?.results || []
    });
}

async function handleAdminUpdateContribution(request, db, env, id) {
    const session = await verifyAdminSession(request, db, env, true);
    if (!session.authenticated) {
        return jsonResponse(request, env, { error: session.error }, session.status || 401);
    }

    const cleanId = cleanSingleLine(decodeURIComponent(id || ''));
    if (!cleanId) {
        return jsonResponse(request, env, { error: 'Mã đóng góp không hợp lệ.' }, 400);
    }

    const existing = await db
        .prepare('SELECT id, status, admin_note, reviewed_at FROM contributions WHERE id = ?1')
        .bind(cleanId)
        .first();

    if (!existing) {
        return jsonResponse(request, env, { error: 'Không tìm thấy bản ghi đóng góp cần cập nhật.' }, 404);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse(request, env, { error: 'Dữ liệu JSON không hợp lệ.' }, 400);
    }

    const nextStatus = body?.status !== undefined ? cleanSingleLine(body.status) : existing.status;
    const nextNote = body?.admin_note !== undefined ? cleanMultiLine(body.admin_note) : (existing.admin_note || '');

    if (!ALLOWED_STATUSES.includes(nextStatus)) {
        return jsonResponse(request, env, { error: 'Trạng thái cập nhật không hợp lệ.' }, 400);
    }

    if (nextNote.length > 2000) {
        return jsonResponse(request, env, { error: 'Ghi chú quản trị không được vượt quá 2.000 ký tự.' }, 400);
    }

    const nowIso = new Date().toISOString();
    let reviewedAt = existing.reviewed_at;
    if (nextStatus === 'approved' || nextStatus === 'rejected') {
        reviewedAt = nowIso;
    }

    await db
        .prepare(
            `UPDATE contributions
             SET status = ?1, admin_note = ?2, updated_at = ?3, reviewed_at = ?4
             WHERE id = ?5`
        )
        .bind(nextStatus, nextNote, nowIso, reviewedAt, cleanId)
        .run();

    if (nextStatus !== existing.status || nextNote !== (existing.admin_note || '')) {
        await db
            .prepare(
                `INSERT INTO contribution_audit_logs (
                    contribution_id, previous_status, new_status, admin_username, admin_note, changed_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
            )
            .bind(cleanId, existing.status, nextStatus, session.username, nextNote, nowIso)
            .run();
    }

    const updated = await db
        .prepare(
            `SELECT
                id, school_name, contributor_name, contribution_type, content,
                status, created_at, updated_at, reviewed_at, admin_note
             FROM contributions
             WHERE id = ?1`
        )
        .bind(cleanId)
        .first();

    const logs = await db
        .prepare(
            `SELECT id, contribution_id, previous_status, new_status, admin_username, admin_note, changed_at
             FROM contribution_audit_logs
             WHERE contribution_id = ?1
             ORDER BY changed_at DESC, id DESC`
        )
        .bind(cleanId)
        .all();

    return jsonResponse(request, env, {
        ok: true,
        item: updated,
        auditLogs: logs?.results || []
    });
}

/* ─────────────────────────── HANDLER: CSV EXPORT ─────────────────────────── */

function escapeCsvCell(value) {
    if (value === null || value === undefined) return '""';
    let str = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
}

function statusLabelVi(status) {
    switch (status) {
        case 'pending': return 'Chờ duyệt';
        case 'approved': return 'Đã duyệt';
        case 'rejected': return 'Từ chối';
        case 'archived': return 'Lưu trữ';
        default: return status || '';
    }
}

async function handleAdminExportCsv(request, db, env) {
    const session = await verifyAdminSession(request, db, env, false);
    if (!session.authenticated) {
        return jsonResponse(request, env, { error: session.error }, 401);
    }

    const url = new URL(request.url);
    const { whereClause, orderBy, params } = buildContributionFilterQuery(url);

    const sql = `
        SELECT
            id,
            contributor_name,
            school_name,
            contribution_type,
            content,
            status,
            created_at,
            reviewed_at,
            admin_note
        FROM contributions
        ${whereClause}
        ${orderBy}
        LIMIT 5000
    `;

    const stmt = db.prepare(sql);
    const rows = await (params.length ? stmt.bind(...params) : stmt).all();
    const items = rows?.results || [];

    const headers = [
        'Mã đóng góp',
        'Họ và tên',
        'Trường đang học / đang giảng dạy',
        'Loại đóng góp',
        'Nội dung đóng góp',
        'Trạng thái',
        'Mã trạng thái',
        'Thời gian gửi (UTC)',
        'Thời gian duyệt (UTC)',
        'Ghi chú quản trị'
    ];

    const lines = [headers.map(escapeCsvCell).join(',')];

    for (const r of items) {
        lines.push(
            [
                r.id,
                r.contributor_name,
                r.school_name,
                r.contribution_type,
                r.content,
                statusLabelVi(r.status),
                r.status,
                r.created_at,
                r.reviewed_at || '',
                r.admin_note || ''
            ]
                .map(escapeCsvCell)
                .join(',')
        );
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const dateTag = new Date().toISOString().slice(0, 10);

    return new Response(csvContent, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="dong-gop-di-san-thai-nguyen-${dateTag}.csv"`,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store',
            ...resolveCorsHeaders(request, env)
        }
    });
}

/* ─────────────────────────── REGISTER ROUTES ON HONO APP ─────────────────────────── */

export async function handleContributionAndAdminRequest(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: resolveCorsHeaders(request, env)
        });
    }

    const db = env ? env.DB : null;
    try {
        await ensureDatabaseSchema(db);
    } catch (err) {
        return jsonResponse(
            request,
            env,
            {
                error: 'Cơ sở dữ liệu D1 chưa được kết nối với Worker (thiếu binding DB).',
                code: err.code || 'DB_ERROR'
            },
            503
        );
    }

    try {
        if (pathname === '/api/contributions' && method === 'POST') {
            return await handlePublicCreateContribution(request, db, env);
        }

        if (pathname === '/api/admin/login' && method === 'POST') {
            return await handleAdminLogin(request, db, env);
        }
        if (pathname === '/api/admin/logout' && method === 'POST') {
            return await handleAdminLogout(request, db, env);
        }
        if (pathname === '/api/admin/me' && method === 'GET') {
            return await handleAdminMe(request, db, env);
        }
        if (pathname === '/api/admin/password' && method === 'POST') {
            return await handleAdminChangePassword(request, db, env);
        }
        if (pathname === '/api/admin/stats' && method === 'GET') {
            return await handleAdminStats(request, db, env);
        }
        if (pathname === '/api/admin/contributions' && method === 'GET') {
            return await handleAdminListContributions(request, db, env);
        }
        if (pathname === '/api/admin/export.csv' && method === 'GET') {
            return await handleAdminExportCsv(request, db, env);
        }

        const detailMatch = pathname.match(/^\/api\/admin\/contributions\/([^/]+)$/);
        if (detailMatch) {
            const recordId = detailMatch[1];
            if (method === 'GET') {
                return await handleAdminGetContributionDetail(request, db, env, recordId);
            }
            if (method === 'PATCH') {
                return await handleAdminUpdateContribution(request, db, env, recordId);
            }
        }

        return jsonResponse(request, env, { error: 'Endpoint API không tồn tại.' }, 404);
    } catch (err) {
        console.error('[Worker Contribution/Admin Error]', method, pathname, err);
        return jsonResponse(
            request,
            env,
            { error: 'Đã xảy ra lỗi xử lý trên máy chủ Worker. Vui lòng thử lại sau.' },
            500
        );
    }
}

export function registerContributionAndAdminRoutes(app) {
    app.on(['POST', 'OPTIONS'], '/api/contributions', (c) =>
        handleContributionAndAdminRequest(c.req.raw, c.env)
    );
    app.on(['GET', 'POST', 'PATCH', 'OPTIONS'], '/api/admin/*', (c) =>
        handleContributionAndAdminRequest(c.req.raw, c.env)
    );
}
