/**
 * Cấu hình tập trung cho Backend AI Research Agent
 * Dự án KHKT: DI SẢN THÁI NGUYÊN – ÂM VANG DI SẢN
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const DEFAULT_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com';
export const GEMINI_API_VERSION = 'v1beta';
export const GEMINI_INTERACTIONS_REVISION = '2026-05-20';

export const REQUEST_LIMITS = {
    MAX_BODY_BYTES: 128 * 1024,          // 128 KB
    MAX_MESSAGE_LENGTH: 3000,            // Tối đa 3000 ký tự cho mỗi câu hỏi
    MAX_HISTORY_TURNS: 10,               // Tối đa 10 lượt hội thoại gần nhất
    MAX_HISTORY_ITEM_LENGTH: 4000,       // Tối đa 4000 ký tự mỗi lượt lịch sử
    MAX_RAG_RECORDS_DETAILED: 6,         // Tối đa 6 bản ghi chi tiết đầy đủ đưa vào context
    MAX_RAG_RECORDS_SUMMARY: 46,         // Tối đa 46 bản ghi dạng tóm tắt khi hỏi danh sách tổng hợp
    MAX_CONTEXT_CHARS: 24000,            // Giới hạn ký tự cho RAG context để tối ưu token
    GEMINI_TIMEOUT_MS: 16000,            // Timeout mỗi lần gọi Gemini API (16s để tránh treo lâu khi key/model chậm)
    MAX_SUBREQUESTS_PER_REQUEST: 45,     // An toàn dưới giới hạn 50 subrequests của Cloudflare Workers
    RATE_LIMIT_MAX_REQUESTS: 25,         // Giới hạn 25 requests / phút / IP
    RATE_LIMIT_WINDOW_MS: 60 * 1000,     // Cửa sổ 60 giây
    CACHE_TTL_MS: 10 * 60 * 1000         // Cache 10 phút cho câu hỏi tra cứu tĩnh phổ biến
};

export const COOLDOWN_CONFIG = {
    RATE_LIMIT_MS: 60 * 1000,            // Cooldown 60s khi gặp 429 (hoặc theo Retry-After)
    AUTH_ERROR_MS: 10 * 60 * 1000,       // Cooldown 10 phút khi gặp 401/403 (key hỏng/bị thu hồi)
    SERVER_ERROR_MS: 20 * 1000,          // Cooldown 20s khi gặp 500/502/503
    MODEL_SEARCH_BLOCKED_MS: 5 * 60 * 1000 // Cooldown 5 phút nếu Google Search bị chặn trên model
};

export const PRIORITY_OFFICIAL_DOMAINS = [
    { domain: 'dsvh.gov.vn', publisher: 'Cục Di sản văn hóa', priority: 1 },
    { domain: 'bvhttdl.gov.vn', publisher: 'Bộ Văn hóa, Thể thao và Du lịch', priority: 2 },
    { domain: 'ich.unesco.org', publisher: 'UNESCO Intangible Cultural Heritage', priority: 3 },
    { domain: 'unesco.org', publisher: 'UNESCO', priority: 3 },
    { domain: 'chinhphu.vn', publisher: 'Cổng Thông tin điện tử Chính phủ', priority: 4 },
    { domain: 'vbpl.vn', publisher: 'Cơ sở dữ liệu quốc gia về văn bản pháp luật', priority: 5 },
    { domain: 'thainguyen.gov.vn', publisher: 'Cổng Thông tin điện tử tỉnh Thái Nguyên', priority: 6 },
    { domain: 'sovhttdl.thainguyen.gov.vn', publisher: 'Sở Văn hóa, Thể thao và Du lịch tỉnh Thái Nguyên', priority: 7 },
    { domain: 'backan.gov.vn', publisher: 'Cổng Thông tin điện tử Bắc Kạn', priority: 8 }
];

export const RESEARCH_DOMAINS = [
    'vass.gov.vn',
    'vicas.org.vn',
    'baotang.vn',
    'vme.org.vn',
    'tnu.edu.vn',
    'vnu.edu.vn',
    'hcmussh.edu.vn',
    'ussh.vnu.edu.vn',
    'scholar.google.com'
];

export const OFFICIAL_PRESS_DOMAINS = [
    { domain: 'baothainguyen.vn', publisher: 'Báo Thái Nguyên' },
    { domain: 'baobackan.vn', publisher: 'Báo Bắc Kạn' },
    { domain: 'baobackan.org.vn', publisher: 'Báo Bắc Kạn' },
    { domain: 'nhandan.vn', publisher: 'Báo Nhân Dân' },
    { domain: 'vov.vn', publisher: 'Đài Tiếng nói Việt Nam (VOV)' },
    { domain: 'vovworld.vn', publisher: 'Đài Tiếng nói Việt Nam (VOV5)' },
    { domain: 'vietnamplus.vn', publisher: 'VietnamPlus (TTXVN)' },
    { domain: 'baotintuc.vn', publisher: 'Báo Tin tức (TTXVN)' },
    { domain: 'vnanet.vn', publisher: 'Thông tấn xã Việt Nam (TTXVN)' },
    { domain: 'qdnd.vn', publisher: 'Báo Quân đội nhân dân' },
    { domain: 'cand.com.vn', publisher: 'Báo Công an nhân dân' },
    { domain: 'vietnamnet.vn', publisher: 'Báo VietNamNet' },
    { domain: 'danviet.vn', publisher: 'Báo Dân Việt' },
    { domain: 'laodong.vn', publisher: 'Báo Lao Động' },
    { domain: 'tuoitre.vn', publisher: 'Báo Tuổi Trẻ' },
    { domain: 'thanhnien.vn', publisher: 'Báo Thanh Niên' },
    { domain: 'bvhttdl.gov.vn', publisher: 'Cổng TTĐT Bộ VHTTDL' }
];

export const OVERLOAD_USER_MESSAGE =
    'Hệ thống AI hiện đang tạm quá tải hoặc đạt giới hạn truy cập. Vui lòng thử lại sau.';

export function getPrimaryModel(env = {}) {
    const configured = typeof env.GEMINI_MODEL === 'string' ? env.GEMINI_MODEL.trim() : '';
    return configured || DEFAULT_GEMINI_MODEL;
}

export function getFallbackModels(env = {}) {
    const raw = typeof env.GEMINI_FALLBACK_MODELS === 'string' ? env.GEMINI_FALLBACK_MODELS.trim() : '';
    if (!raw) return [...DEFAULT_FALLBACK_MODELS];
    return raw
        .split(/[,\s;]+/)
        .map(s => s.trim())
        .filter(Boolean);
}

export function getInteractionsEndpoint(env = {}) {
    const baseUrl = (typeof env.GEMINI_BASE_URL === 'string' && env.GEMINI_BASE_URL.trim())
        ? env.GEMINI_BASE_URL.trim().replace(/\/+$/, '')
        : GEMINI_API_BASE_URL;
    const version = (typeof env.GEMINI_API_VERSION === 'string' && env.GEMINI_API_VERSION.trim())
        ? env.GEMINI_API_VERSION.trim()
        : GEMINI_API_VERSION;
    return `${baseUrl}/${version}/interactions`;
}

export function getGenerateContentEndpoint(modelName, env = {}) {
    const baseUrl = (typeof env.GEMINI_BASE_URL === 'string' && env.GEMINI_BASE_URL.trim())
        ? env.GEMINI_BASE_URL.trim().replace(/\/+$/, '')
        : GEMINI_API_BASE_URL;
    const version = (typeof env.GEMINI_API_VERSION === 'string' && env.GEMINI_API_VERSION.trim())
        ? env.GEMINI_API_VERSION.trim()
        : GEMINI_API_VERSION;
    return `${baseUrl}/${version}/models/${encodeURIComponent(modelName)}:generateContent`;
}
