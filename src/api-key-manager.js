/**
 * CƠ CHẾ XOAY VÒNG 9 GEMINI API KEY & QUẢN LÝ QUOTA / LỖI (Mục VII)
 *
 * Nguyên tắc:
 * 1. Đọc 9 API Key từ Cloudflare Secrets (`GEMINI_API_KEY_1` .. `GEMINI_API_KEY_9`)
 *    và tương thích ngược với `GEMINI_KEYS`, `GEMINI_API_KEY`, `GEMINI_KEY_1..N`.
 * 2. Không bao giờ ghi giá trị thực của API key vào console log, JSON response, KV hay Durable Objects.
 * 3. Lưu trạng thái xoay vòng (round-robin cursor) và trạng thái cooldown theo chỉ số key (`keyIndex: 1..9`).
 * 4. Phân loại chính xác lỗi Gemini API: 400, 401, 403, 404, 429, 500, 502, 503, Timeout, Network Error.
 * 5. Quản lý quota theo project (nếu có cấu hình `GEMINI_KEY_PROJECTS`) để khi gặp 429 ưu tiên chuyển sang key thuộc project khác.
 */

import { COOLDOWN_CONFIG } from './config.js';

// Bộ nhớ trạng thái tại isolate (và được đồng bộ với Durable Object storage thông qua stateAdapter)
let memoryCursor = -1;
const memoryKeyAuthCooldownUntil = new Map();     // keyIndex -> timestamp
const memoryKeyRateCooldownUntil = new Map();     // `${keyIndex}::${model}::${mode}` -> timestamp
const memoryProjectRateCooldownUntil = new Map(); // `${projectId}::${model}::${mode}` -> timestamp
const memoryModelSearchBlockedUntil = new Map();  // model -> timestamp

/**
 * Thu thập danh sách API Key từ `env` (Cloudflare Secrets)
 * Trả về mảng các descriptor: `{ index, slotName, apiKey, projectId }`
 */
export function discoverApiKeys(env = {}) {
    const descriptors = [];
    const seenKeys = new Set();

    // Map project tùy chọn: GEMINI_KEY_PROJECTS="projA,projB,..."
    const projectList = typeof env.GEMINI_KEY_PROJECTS === 'string' && env.GEMINI_KEY_PROJECTS.trim()
        ? env.GEMINI_KEY_PROJECTS.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean)
        : [];

    // 1. Ưu tiên đọc chuẩn GEMINI_API_KEY_1 .. GEMINI_API_KEY_9 (và mở rộng tới N)
    const numberedEntries = [];
    const numberedRegex = /^GEMINI_(?:API_)?KEY_?(\d+)$/i;

    for (const [propName, propVal] of Object.entries(env || {})) {
        const match = propName.match(numberedRegex);
        if (match && typeof propVal === 'string' && propVal.trim()) {
            const slotNumber = parseInt(match[1], 10);
            const cleanKey = propVal.trim().replace(/^['"]|['"]$/g, '');
            if (cleanKey && cleanKey.length >= 10) {
                numberedEntries.push({
                    slotNumber,
                    slotName: `GEMINI_API_KEY_${slotNumber}`,
                    apiKey: cleanKey
                });
            }
        }
    }

    numberedEntries.sort((a, b) => a.slotNumber - b.slotNumber);
    for (const entry of numberedEntries) {
        if (!seenKeys.has(entry.apiKey)) {
            seenKeys.add(entry.apiKey);
            const idx = descriptors.length + 1;
            const explicitProject = env[`GEMINI_PROJECT_${entry.slotNumber}`] || projectList[entry.slotNumber - 1] || `project_slot_${entry.slotNumber}`;
            descriptors.push({
                index: idx,
                slotNumber: entry.slotNumber,
                slotName: entry.slotName,
                apiKey: entry.apiKey,
                projectId: String(explicitProject).trim()
            });
        }
    }

    // 2. Hỗ trợ tương thích ngược với GEMINI_KEYS, GEMINI_API_KEY, GEMINI_KEY
    const bulkSources = [env.GEMINI_KEYS, env.GEMINI_API_KEY, env.GEMINI_KEY];
    for (const src of bulkSources) {
        if (typeof src !== 'string' || !src.trim()) continue;
        const trimmed = src.trim();
        let candidates = [];

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    candidates = parsed.map(x => String(x || '').trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
                }
            } catch (_) {
                // Fallback bên dưới
            }
        }

        if (candidates.length === 0) {
            candidates = trimmed
                .split(/[,\s;]+/)
                .map(k => k.trim().replace(/^['"\[\]]+|['"\[\]]+$/g, ''))
                .filter(Boolean);
        }

        for (const cleanKey of candidates) {
            if (cleanKey.length >= 10 && !seenKeys.has(cleanKey)) {
                seenKeys.add(cleanKey);
                const idx = descriptors.length + 1;
                descriptors.push({
                    index: idx,
                    slotNumber: idx,
                    slotName: `GEMINI_API_KEY_${idx}`,
                    apiKey: cleanKey,
                    projectId: projectList[idx - 1] || `project_slot_${idx}`
                });
            }
        }
    }

    return descriptors;
}

/**
 * Phân loại lỗi Gemini API chi tiết theo bảng Mục VII.3:
 * | 400 | Kiểm tra request, không xoay vòng vô điều kiện |
 * | 401 | Đánh dấu key không hợp lệ, thử key tiếp theo |
 * | 403 | Kiểm tra quyền truy cập hoặc trạng thái key |
 * | 404 | Kiểm tra model/endpoint, không lặp vô ích |
 * | 429 | Xử lý quota/rate limit, thử key thuộc quota khác nếu có |
 * | 500 | Thử key khác khi phù hợp |
 * | 502 | Thử lại có giới hạn |
 * | 503 | Chuyển key hoặc thử lại có giới hạn |
 * | Timeout | Thử lại có kiểm soát |
 * | Network Error | Thử lại có kiểm soát |
 */
export function classifyGeminiError(err, httpStatus = 0, retryAfterHeader = null) {
    const rawMsg = err?.message || String(err || '');
    const status = Number(httpStatus || err?.status || err?.code || 0);

    // Đọc Retry-After header hoặc cụm "Please retry in 35m43s" / "requests per day" từ thông báo Google
    let retryAfterMs = 0;
    if (retryAfterHeader) {
        const sec = Number(retryAfterHeader);
        if (!Number.isNaN(sec) && sec > 0) {
            retryAfterMs = Math.min(sec * 1000, 15 * 60 * 1000);
        }
    }
    if (retryAfterMs === 0) {
        const retryInMatch = rawMsg.match(/retry in\s+(?:(\d+)h)?(?:(\d+)m)?(\d+(?:\.\d+)?)?s?/i);
        if (retryInMatch) {
            const hours = Number(retryInMatch[1] || 0);
            const mins = Number(retryInMatch[2] || 0);
            const secs = Number(retryInMatch[3] || 0);
            const parsedMs = ((hours * 3600) + (mins * 60) + secs) * 1000;
            if (parsedMs > 0) {
                retryAfterMs = Math.min(parsedMs, 15 * 60 * 1000);
            }
        } else if (/requests per day|per day on free tier/i.test(rawMsg)) {
            retryAfterMs = 15 * 60 * 1000;
        }
    }

    const isTimeout =
        err?.name === 'TimeoutError' ||
        err?.name === 'AbortError' ||
        /timeout|timed out|aborted/i.test(rawMsg);

    const isNetworkError =
        !status &&
        !isTimeout &&
        /fetch failed|network|socket|econnreset|enotfound|connection/i.test(rawMsg);

    const isLocationBlocked =
        /user location is not supported/i.test(rawMsg) ||
        (status === 400 && /failed_precondition/i.test(rawMsg) && /location|region|country/i.test(rawMsg));

    const isSearchRelated =
        /google_search|search_grounding|search[\s_-]*grounding|grounding|grounded|tool.*not supported|billing.*search/i.test(
            rawMsg
        );

    if (isTimeout) {
        return {
            category: 'TIMEOUT',
            status: 408,
            shouldRotateKey: true,
            shouldDisableKey: false,
            shouldSwitchModel: false,
            shouldDisableSearchOnModel: false,
            shouldAbortAll: false,
            cooldownMs: 30000,
            reason: 'Quá thời gian chờ phản hồi từ Gemini API (Timeout).'
        };
    }

    if (isNetworkError) {
        return {
            category: 'NETWORK_ERROR',
            status: 503,
            shouldRotateKey: true,
            shouldDisableKey: false,
            shouldSwitchModel: false,
            shouldDisableSearchOnModel: false,
            shouldAbortAll: false,
            cooldownMs: 5000,
            reason: 'Lỗi kết nối mạng tới Gemini API.'
        };
    }

    if (isLocationBlocked) {
        return {
            category: 'LOCATION_BLOCKED',
            status: 400,
            shouldRotateKey: false,
            shouldDisableKey: false,
            shouldSwitchModel: false,
            shouldDisableSearchOnModel: false,
            shouldAbortAll: true,
            cooldownMs: 0,
            reason: 'Vị trí máy chủ Edge hiện tại bị hạn chế bởi vùng địa lý của Google Gemini API.'
        };
    }

    switch (status) {
        case 400: {
            // 400: Kiểm tra request, không xoay vòng vô điều kiện.
            // Ngoại lệ: nếu lỗi 400 do key không hợp lệ (Google đôi khi trả 400 API_KEY_INVALID) hoặc do công cụ google_search
            if (/api_key_invalid|api key not valid|invalid api key/i.test(rawMsg)) {
                return {
                    category: 'INVALID_KEY_400',
                    status: 401,
                    shouldRotateKey: true,
                    shouldDisableKey: true,
                    shouldSwitchModel: false,
                    shouldDisableSearchOnModel: false,
                    shouldAbortAll: false,
                    cooldownMs: COOLDOWN_CONFIG.AUTH_ERROR_MS,
                    reason: 'API key không hợp lệ (API_KEY_INVALID).'
                };
            }
            if (isSearchRelated) {
                return {
                    category: 'SEARCH_UNSUPPORTED_400',
                    status: 400,
                    shouldRotateKey: false,
                    shouldDisableKey: false,
                    shouldSwitchModel: false,
                    shouldDisableSearchOnModel: true,
                    shouldAbortAll: false,
                    cooldownMs: COOLDOWN_CONFIG.MODEL_SEARCH_BLOCKED_MS,
                    reason: 'Công cụ Google Search không được hỗ trợ trên cấu hình/model hiện tại.'
                };
            }
            if (/thinking_level|thinking_budget|generation_config|store.*not supported|unsupported.*field/i.test(rawMsg)) {
                return {
                    category: 'MODEL_PARAM_UNSUPPORTED_400',
                    status: 400,
                    shouldRotateKey: false,
                    shouldDisableKey: false,
                    shouldSwitchModel: true,
                    shouldDisableSearchOnModel: false,
                    shouldAbortAll: false,
                    cooldownMs: 0,
                    reason: 'Model hiện tại không hỗ trợ một tham số cấu hình trong yêu cầu (400).'
                };
            }
            return {
                category: 'BAD_REQUEST_400',
                status: 400,
                shouldRotateKey: false,
                shouldDisableKey: false,
                shouldSwitchModel: false,
                shouldDisableSearchOnModel: false,
                shouldAbortAll: true,
                cooldownMs: 0,
                reason: 'Yêu cầu gửi tới Gemini API không hợp lệ (400 Bad Request).'
            };
        }

        case 401:
            return {
                category: 'UNAUTHORIZED_401',
                status: 401,
                shouldRotateKey: true,
                shouldDisableKey: true,
                shouldSwitchModel: false,
                shouldDisableSearchOnModel: false,
                shouldAbortAll: false,
                cooldownMs: COOLDOWN_CONFIG.AUTH_ERROR_MS,
                reason: 'API key không hợp lệ hoặc chưa xác thực (401).'
            };

        case 403:
            if (isSearchRelated) {
                return {
                    category: 'SEARCH_FORBIDDEN_403',
                    status: 403,
                    shouldRotateKey: false,
                    shouldDisableKey: false,
                    shouldSwitchModel: false,
                    shouldDisableSearchOnModel: true,
                    shouldAbortAll: false,
                    cooldownMs: COOLDOWN_CONFIG.MODEL_SEARCH_BLOCKED_MS,
                    reason: 'Tài khoản Free Tier hoặc model bị giới hạn quyền sử dụng công cụ Google Search (403).'
                };
            }
            return {
                category: 'FORBIDDEN_403',
                status: 403,
                shouldRotateKey: true,
                shouldDisableKey: true,
                shouldSwitchModel: false,
                shouldDisableSearchOnModel: false,
                shouldAbortAll: false,
                cooldownMs: COOLDOWN_CONFIG.AUTH_ERROR_MS,
                reason: 'API key không có quyền truy cập hoặc đã bị vô hiệu hóa (403).'
            };

        case 404:
            return {
                category: 'NOT_FOUND_404',
                status: 404,
                shouldRotateKey: false,
                shouldDisableKey: false,
                shouldSwitchModel: true,
                shouldDisableSearchOnModel: false,
                shouldAbortAll: false,
                cooldownMs: 0,
                reason: 'Model hoặc endpoint không tồn tại / không được hỗ trợ (404).'
            };

        case 429: {
            const isSearchZeroQuota =
                isSearchRelated &&
                /limit\s*[:=]\s*0|not available|free[\s_-]*tier|billing|plan/i.test(rawMsg);
            if (isSearchZeroQuota) {
                return {
                    category: 'SEARCH_GROUNDING_QUOTA_429',
                    status: 429,
                    shouldRotateKey: false,
                    shouldDisableKey: false,
                    shouldSwitchModel: false,
                    shouldDisableSearchOnModel: true,
                    shouldAbortAll: false,
                    cooldownMs: 0,
                    reason: 'Công cụ google_search không khả dụng hoặc có hạn mức bằng 0 trên model/gói hiện tại (429).'
                };
            }
            return {
                category: 'RATE_LIMIT_429',
                status: 429,
                shouldRotateKey: true,
                shouldDisableKey: false,
                shouldSwitchModel: false,
                shouldDisableSearchOnModel: false,
                shouldAbortAll: false,
                cooldownMs: retryAfterMs || COOLDOWN_CONFIG.RATE_LIMIT_MS,
                reason: 'Đạt giới hạn tần suất hoặc hạn mức truy cập (429 Rate Limit / Quota).'
            };
        }

        case 500:
            return {
                category: 'SERVER_ERROR_500',
                status: 500,
                shouldRotateKey: true,
                shouldDisableKey: false,
                shouldSwitchModel: false,
                shouldDisableSearchOnModel: false,
                shouldAbortAll: false,
                cooldownMs: COOLDOWN_CONFIG.SERVER_ERROR_MS,
                reason: 'Lỗi máy chủ nội bộ từ phía Gemini API (500).'
            };

        case 502:
            return {
                category: 'BAD_GATEWAY_502',
                status: 502,
                shouldRotateKey: true,
                shouldDisableKey: false,
                shouldSwitchModel: false,
                shouldDisableSearchOnModel: false,
                shouldAbortAll: false,
                cooldownMs: COOLDOWN_CONFIG.SERVER_ERROR_MS,
                reason: 'Lỗi cổng kết nối Gemini API (502 Bad Gateway).'
            };

        case 503:
            return {
                category: 'SERVICE_UNAVAILABLE_503',
                status: 503,
                shouldRotateKey: true,
                shouldDisableKey: false,
                shouldSwitchModel: false,
                shouldDisableSearchOnModel: false,
                shouldAbortAll: false,
                cooldownMs: COOLDOWN_CONFIG.SERVER_ERROR_MS,
                reason: 'Dịch vụ Gemini API đang tạm quá tải (503 Service Unavailable).'
            };

        default:
            return {
                category: `HTTP_${status || 'UNKNOWN'}`,
                status: status || 500,
                shouldRotateKey: true,
                shouldDisableKey: false,
                shouldSwitchModel: false,
                shouldDisableSearchOnModel: false,
                shouldAbortAll: false,
                cooldownMs: 10000,
                reason: 'Lỗi không xác định khi gọi Gemini API.'
            };
    }
}

/**
 * Quản lý chọn thứ tự xoay vòng Key cho mỗi request
 */
export function buildRotationPlan(keyDescriptors, modelName, useSearch, deadKeyIndices = new Set(), options = {}) {
    const { includeRateLimited = true } = options;
    const total = keyDescriptors.length;
    if (total === 0) return [];

    const now = Date.now();
    pruneExpiredCooldowns(now);

    if (memoryCursor < 0 || memoryCursor >= total) {
        memoryCursor = Math.floor(Math.random() * total);
    }
    const startIdx = memoryCursor;
    memoryCursor = (memoryCursor + 1) % total;

    const modeTag = useSearch ? 'search' : 'plain';
    const healthyDiffProject = [];
    const healthySameProject = [];
    const rateLimited = [];

    const cooledProjects = new Set();
    for (const [projKey, until] of memoryProjectRateCooldownUntil.entries()) {
        if (until > now && projKey.endsWith(`::${modelName}::${modeTag}`)) {
            cooledProjects.add(projKey.split('::')[0]);
        }
    }

    for (let offset = 0; offset < total; offset++) {
        const pos = (startIdx + offset) % total;
        const desc = keyDescriptors[pos];

        if (deadKeyIndices.has(desc.index)) continue;

        const authUntil = memoryKeyAuthCooldownUntil.get(desc.index) || 0;
        if (authUntil > now) continue;

        const rateKey = `${desc.index}::${modelName}::${modeTag}`;
        const rateUntil = memoryKeyRateCooldownUntil.get(rateKey) || 0;

        if (rateUntil > now) {
            rateLimited.push(desc);
        } else if (cooledProjects.has(desc.projectId)) {
            healthySameProject.push(desc);
        } else {
            healthyDiffProject.push(desc);
        }
    }

    const ordered = includeRateLimited
        ? [...healthyDiffProject, ...healthySameProject, ...rateLimited]
        : [...healthyDiffProject, ...healthySameProject];
    if (ordered.length > 0) return ordered;
    if (!includeRateLimited) return [];

    // Nếu tất cả key đều từng bị đánh dấu auth cooldown từ trước, thử lại các key chưa chết trong request hiện tại
    return keyDescriptors.filter(d => !deadKeyIndices.has(d.index));
}

export function markKeySuccess(keyDescriptor, modelName, useSearch) {
    const modeTag = useSearch ? 'search' : 'plain';
    memoryKeyAuthCooldownUntil.delete(keyDescriptor.index);
    memoryKeyRateCooldownUntil.delete(`${keyDescriptor.index}::${modelName}::${modeTag}`);
    memoryProjectRateCooldownUntil.delete(`${keyDescriptor.projectId}::${modelName}::${modeTag}`);
}

export function markKeyFailure(keyDescriptor, modelName, useSearch, classifiedError) {
    const now = Date.now();
    const modeTag = useSearch ? 'search' : 'plain';

    if (classifiedError.shouldDisableKey) {
        memoryKeyAuthCooldownUntil.set(
            keyDescriptor.index,
            now + (classifiedError.cooldownMs || COOLDOWN_CONFIG.AUTH_ERROR_MS)
        );
    } else if (classifiedError.category === 'RATE_LIMIT_429') {
        const until = now + (classifiedError.cooldownMs || COOLDOWN_CONFIG.RATE_LIMIT_MS);
        memoryKeyRateCooldownUntil.set(`${keyDescriptor.index}::${modelName}::${modeTag}`, until);
        memoryProjectRateCooldownUntil.set(`${keyDescriptor.projectId}::${modelName}::${modeTag}`, until);
    } else if (classifiedError.cooldownMs > 0) {
        memoryKeyRateCooldownUntil.set(
            `${keyDescriptor.index}::${modelName}::${modeTag}`,
            now + classifiedError.cooldownMs
        );
    }

    if (classifiedError.shouldDisableSearchOnModel) {
        memoryModelSearchBlockedUntil.set(
            modelName,
            now + (classifiedError.cooldownMs || COOLDOWN_CONFIG.MODEL_SEARCH_BLOCKED_MS)
        );
    }
}

export function isModelSearchTemporarilyBlocked(modelName) {
    const until = memoryModelSearchBlockedUntil.get(modelName) || 0;
    return until > Date.now();
}

function pruneExpiredCooldowns(now) {
    for (const [k, until] of memoryKeyAuthCooldownUntil.entries()) {
        if (until <= now) memoryKeyAuthCooldownUntil.delete(k);
    }
    for (const [k, until] of memoryKeyRateCooldownUntil.entries()) {
        if (until <= now) memoryKeyRateCooldownUntil.delete(k);
    }
    for (const [k, until] of memoryProjectRateCooldownUntil.entries()) {
        if (until <= now) memoryProjectRateCooldownUntil.delete(k);
    }
    for (const [k, until] of memoryModelSearchBlockedUntil.entries()) {
        if (until <= now) memoryModelSearchBlockedUntil.delete(k);
    }
}

/**
 * Báo cáo trạng thái tổng quan của hệ thống Key Rotation (TUYỆT ĐỐI KHÔNG chứa giá trị API key!)
 */
export function getKeyPoolPublicStatus(env = {}) {
    const now = Date.now();
    pruneExpiredCooldowns(now);
    const descriptors = discoverApiKeys(env);

    const slots = descriptors.map(d => {
        const authCooldown = memoryKeyAuthCooldownUntil.get(d.index) || 0;
        return {
            keySlot: d.slotName,
            index: d.index,
            projectId: d.projectId,
            status: authCooldown > now ? 'auth_cooldown' : 'ready'
        };
    });

    return {
        totalKeysConfigured: descriptors.length,
        readyKeysCount: slots.filter(s => s.status === 'ready').length,
        slots
    };
}
