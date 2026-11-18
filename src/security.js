/**
 * MODULE BẢO MẬT, KIỂM TRA ĐẦU VÀO, CHỐNG PROMPT INJECTION, RATE LIMIT & CACHE (Mục XI)
 */

import { REQUEST_LIMITS } from './config.js';

/**
 * Các mẫu Prompt Injection cố gắng ghi đè System Instruction hoặc trích xuất API Key
 */
const PROMPT_INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules)/i,
    /disregard\s+(all\s+)?(previous|prior|system)\s+(instructions|prompts|rules)/i,
    /(bỏ qua|xóa bỏ|phớt lờ)\s+(tất cả\s+)?(hướng dẫn|chỉ thị|quy tắc|system\s*prompt)/i,
    /(tiết lộ|in ra|hiển thị|cho tôi biết|show\s+me|print|reveal)\s+.*(api\s*key|secret|GEMINI_API_KEY|system\s*prompt|system\s*instruction)/i,
    /you\s+are\s+now\s+(dan|jailbroken|unrestricted)/i
];

/**
 * Kiểm tra và làm sạch request gửi đến POST /api/heritage/ask hoặc POST /api/chat
 */
export function validateAndSanitizeInput(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return {
            ok: false,
            status: 400,
            error: 'Dữ liệu yêu cầu không hợp lệ (body phải là một JSON object).'
        };
    }

    // Cho phép người dùng gửi `message` hoặc `question` hoặc `query`
    const rawMessage = body.message ?? body.question ?? body.query;

    if (typeof rawMessage !== 'string') {
        return {
            ok: false,
            status: 400,
            error: 'Trường "message" bắt buộc phải là chuỗi ký tự (string).'
        };
    }

    const trimmedMessage = rawMessage.trim();
    if (!trimmedMessage) {
        return {
            ok: false,
            status: 400,
            error: 'Nội dung câu hỏi không được để trống.'
        };
    }

    if (trimmedMessage.length > REQUEST_LIMITS.MAX_MESSAGE_LENGTH) {
        return {
            ok: false,
            status: 400,
            error: `Câu hỏi vượt quá độ dài tối đa cho phép (${REQUEST_LIMITS.MAX_MESSAGE_LENGTH} ký tự).`
        };
    }

    // Chặn nếu người dùng cố truyền systemInstruction / system_instruction trực tiếp trong body
    if (body.systemInstruction !== undefined || body.system_instruction !== undefined || body.systemPrompt !== undefined) {
        return {
            ok: false,
            status: 400,
            error: 'Không được phép truyền hoặc ghi đè SYSTEM INSTRUCTION từ phía client.'
        };
    }

    // Kiểm tra dấu hiệu Prompt Injection nhằm đánh cắp API Key hoặc phá vỡ System Instruction
    const isPromptInjection = PROMPT_INJECTION_PATTERNS.some(rx => rx.test(trimmedMessage));

    // Kiểm tra và lọc lịch sử hội thoại (`history`)
    const sanitizedHistory = [];
    if (body.history !== undefined && body.history !== null) {
        if (!Array.isArray(body.history)) {
            return {
                ok: false,
                status: 400,
                error: 'Trường "history" phải là một mảng (array) các lượt hội thoại hợp lệ.'
            };
        }

        const recentHistory = body.history.slice(-REQUEST_LIMITS.MAX_HISTORY_TURNS);
        for (const item of recentHistory) {
            if (!item || typeof item !== 'object') continue;

            // Chỉ chấp nhận vai trò 'user' và 'model' (hoặc 'assistant'/'ai' được chuẩn hóa thành 'model')
            // Tuyệt đối loại bỏ mọi vai trò 'system' hoặc 'developer' từ client!
            const rawRole = String(item.role || item.type || '').toLowerCase().trim();
            let normalizedRole = null;
            if (rawRole === 'user' || rawRole === 'user_input') {
                normalizedRole = 'user';
            } else if (rawRole === 'model' || rawRole === 'assistant' || rawRole === 'ai' || rawRole === 'model_output') {
                normalizedRole = 'model';
            } else {
                // Bỏ qua vai trò không hợp lệ (ví dụ: system)
                continue;
            }

            let textContent = '';
            if (typeof item.content === 'string') {
                textContent = item.content.trim();
            } else if (typeof item.text === 'string') {
                textContent = item.text.trim();
            } else if (typeof item.message === 'string') {
                textContent = item.message.trim();
            } else if (Array.isArray(item.content)) {
                textContent = item.content
                    .map(part => (typeof part === 'string' ? part : part?.text || ''))
                    .join('\n')
                    .trim();
            } else if (Array.isArray(item.parts)) {
                textContent = item.parts
                    .map(part => (typeof part === 'string' ? part : part?.text || ''))
                    .join('\n')
                    .trim();
            }

            if (!textContent) continue;

            // Chặn Prompt Injection ẩn trong lịch sử hội thoại
            if (PROMPT_INJECTION_PATTERNS.some(rx => rx.test(textContent))) {
                continue;
            }

            sanitizedHistory.push({
                role: normalizedRole,
                text: textContent.slice(0, REQUEST_LIMITS.MAX_HISTORY_ITEM_LENGTH)
            });
        }
    }

    // Xử lý context tùy chọn
    const sanitizedContext = {
        heritageId: typeof body.context?.heritageId === 'string'
            ? body.context.heritageId.trim().slice(0, 20)
            : null
    };

    const previousInteractionId = typeof body.previousInteractionId === 'string' && body.previousInteractionId.trim()
        ? body.previousInteractionId.trim().slice(0, 128)
        : null;

    return {
        ok: true,
        message: trimmedMessage,
        history: sanitizedHistory,
        context: sanitizedContext,
        previousInteractionId,
        isPromptInjection
    };
}

/**
 * Bộ giới hạn tần suất truy cập theo IP (Sliding Window Rate Limiter)
 */
const ipRateBuckets = new Map();

export function checkRateLimit(clientIp, env = {}) {
    const now = Date.now();
    const maxRequests = Number(env.RATE_LIMIT_MAX_REQUESTS) || REQUEST_LIMITS.RATE_LIMIT_MAX_REQUESTS;
    const windowMs = (Number(env.RATE_LIMIT_WINDOW_SECONDS) || 60) * 1000;

    // Dọn dẹp định kỳ tránh rò rỉ bộ nhớ
    if (ipRateBuckets.size > 2000) {
        for (const [ip, timestamps] of ipRateBuckets.entries()) {
            const active = timestamps.filter(ts => now - ts < windowMs);
            if (active.length === 0) ipRateBuckets.delete(ip);
            else ipRateBuckets.set(ip, active);
        }
    }

    const key = clientIp || 'anonymous';
    const timestamps = (ipRateBuckets.get(key) || []).filter(ts => now - ts < windowMs);

    if (timestamps.length >= maxRequests) {
        const oldest = timestamps[0];
        const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        return {
            allowed: false,
            retryAfterSec,
            remaining: 0
        };
    }

    timestamps.push(now);
    ipRateBuckets.set(key, timestamps);

    return {
        allowed: true,
        retryAfterSec: 0,
        remaining: Math.max(0, maxRequests - timestamps.length)
    };
}

/**
 * Cache thông minh cho các câu hỏi đơn lẻ phổ biến (chỉ cache khi history rỗng)
 */
const memoryResponseCache = new Map();

export function makeCacheKey(message, heritageId = null) {
    const clean = String(message || '')
        .normalize('NFC')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    return `heritage_qa_v3::${heritageId || 'all'}::${clean}`;
}

export async function getCachedResponse(cacheKey, env = {}) {
    const now = Date.now();
    const memItem = memoryResponseCache.get(cacheKey);
    if (memItem) {
        if (memItem.expiresAt > now) {
            return memItem.value;
        }
        memoryResponseCache.delete(cacheKey);
    }

    if (env?.HERITAGE_CACHE && typeof env.HERITAGE_CACHE.get === 'function') {
        try {
            const raw = await env.HERITAGE_CACHE.get(cacheKey, 'json');
            if (raw && raw.answer) {
                return raw;
            }
        } catch (_) {
            // Bỏ qua lỗi đọc KV
        }
    }
    return null;
}

export async function setCachedResponse(cacheKey, value, env = {}) {
    const now = Date.now();
    if (memoryResponseCache.size > 300) {
        const firstKey = memoryResponseCache.keys().next().value;
        if (firstKey) memoryResponseCache.delete(firstKey);
    }

    memoryResponseCache.set(cacheKey, {
        value,
        expiresAt: now + REQUEST_LIMITS.CACHE_TTL_MS
    });

    if (env?.HERITAGE_CACHE && typeof env.HERITAGE_CACHE.put === 'function') {
        try {
            await env.HERITAGE_CACHE.put(cacheKey, JSON.stringify(value), {
                expirationTtl: Math.floor(REQUEST_LIMITS.CACHE_TTL_MS / 1000)
            });
        } catch (_) {
            // Bỏ qua lỗi ghi KV
        }
    }
}
