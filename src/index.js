/**
 * ENTRYPOINT CLOUDFLARE WORKERS & DURABLE OBJECTS
 * Dự án KHKT: DI SẢN THÁI NGUYÊN – ÂM VANG DI SẢN
 * Worker: disanthainguyen-backendd
 * Bindings:
 *   - GEMINI_EXECUTOR (Durable Object: GeminiRegionExecutor)
 *   - DB (Cloudflare D1: disanthainguyen-contributions / 6a0e2ff6-2230-43ba-8ec4-22987349bb7a)
 */

import { DurableObject } from 'cloudflare:workers';
import { app, handleWorkerFetch } from './app.js';

/**
 * Durable Object `GeminiRegionExecutor`:
 * 1. Đặt tại vùng Bắc Mỹ (`wnam`) hoặc vùng được hỗ trợ để tránh lỗi Google Gemini chặn IP Edge PoP (như HKG).
 * 2. Duy trì con trỏ xoay vòng (round-robin) và trạng thái cooldown ổn định giữa các request đồng thời.
 * 3. Tuyệt đối KHÔNG lưu giá trị thực của API key vào bộ nhớ lưu trữ.
 */
export class GeminiRegionExecutor extends DurableObject {
    async fetch(request) {
        return app.fetch(request, this.env, {
            waitUntil: (promise) => this.ctx.waitUntil(promise)
        });
    }
}

export default {
    async fetch(request, env, ctx) {
        return handleWorkerFetch(request, env, ctx);
    }
};
