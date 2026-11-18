/**
 * ============================================================================
 * CLOUDFLARE PAGES FUNCTIONS — PURE STATELESS REVERSE PROXY (/api/*)
 * Dự án: Di Sản Thái Nguyên · Âm Vang Di Sản
 *
 * Kiến trúc:
 * - File này KHÔNG gắn Cloudflare D1 (không sử dụng env.DB) và KHÔNG chứa
 *   bất kỳ logic nghiệp vụ hay truy vấn cơ sở dữ liệu nào.
 * - Toàn bộ logic Chatbot Gemini (GEMINI_EXECUTOR), Đóng góp Cộng đồng và
 *   Quản trị Hệ thống (env.DB = disanthainguyen-contributions) đều nằm tại
 *   Cloudflare Worker chính: `disanthainguyen-backendd`.
 * - Proxy này chỉ chuyển tiếp (forward) các request `/api/*` từ domain
 *   Cloudflare Pages sang Worker `disanthainguyen-backendd` để đảm bảo
 *   Cookie `HttpOnly` hoạt động ổn định cùng Origin (First-Party Cookie) trên
 *   mọi trình duyệt (kể cả Safari iOS/macOS bật chặn Third-Party Cookie).
 * ============================================================================
 */

const DEFAULT_WORKER_ORIGIN = 'https://disanthainguyen-backendd.tathanh72727.workers.dev';

export async function onRequest(context) {
    const { request, env } = context;
    const incomingUrl = new URL(request.url);

    const workerOrigin = (env && env.WORKER_API_ORIGIN ? String(env.WORKER_API_ORIGIN) : DEFAULT_WORKER_ORIGIN)
        .trim()
        .replace(/\/+$/, '');

    const targetUrl = `${workerOrigin}${incomingUrl.pathname}${incomingUrl.search}`;

    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', incomingUrl.host);
    headers.set('X-Forwarded-Proto', incomingUrl.protocol.replace(':', ''));
    if (request.headers.get('CF-Connecting-IP')) {
        headers.set('X-Forwarded-Client-IP', request.headers.get('CF-Connecting-IP'));
    }

    const method = request.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const bodyBuffer = hasBody ? await request.arrayBuffer() : undefined;

    const upstreamReq = new Request(targetUrl, {
        method,
        headers,
        body: bodyBuffer,
        redirect: 'manual'
    });

    const upstreamRes = await fetch(upstreamReq);
    const resHeaders = new Headers(upstreamRes.headers);

    return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: resHeaders
    });
}
