/**
 * CORE APPLICATION ROUTER & PIPELINE XỬ LÝ CÂU HỎI (Mục VIII, IX, X, XI)
 *
 * Hỗ trợ đầy đủ các endpoints:
 * - POST /api/heritage/ask   (Chuẩn giao thức mới - Mục X.1)
 * - POST /api/chat           (Tương thích 100% với Frontend `script.js` hiện có)
 * - GET  /api/heritage/health & GET /health (Kiểm tra trạng thái - Mục X.2, tuyệt đối không lộ API key)
 * - GET  /api/heritage/search (Tìm kiếm nhanh dữ liệu di sản nội bộ - Mục X.3)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
    getPrimaryModel,
    getFallbackModels,
    REQUEST_LIMITS,
    OVERLOAD_USER_MESSAGE
} from './config.js';
import {
    HERITAGE_DATA,
    COMMUNE_LIST,
    CATEGORY_ORDER,
    UNESCO_RECORDS,
    NATIONAL_RECORDS,
    getHeritageById
} from './heritage-data-adapter.js';
import {
    retrieveHeritageData,
    buildRagContextPrompt,
    buildMatchedHeritageSummary
} from './rag-engine.js';
import {
    classifyQuestionIntent,
    shouldUseGoogleSearch
} from './intent-classifier.js';
import { buildSystemInstruction } from './heritage-system-prompt.js';
import {
    validateAndSanitizeInput,
    checkRateLimit,
    makeCacheKey,
    getCachedResponse,
    setCachedResponse
} from './security.js';
import { executeGeminiResearch, probeGeminiHealth } from './gemini-client.js';
import { buildCombinedSources } from './citation-extractor.js';
import {
    verifyAndSanitizeModelAnswer,
    formatReplyForFrontendChat
} from './fact-verifier.js';
import { getKeyPoolPublicStatus } from './api-key-manager.js';
import {
    registerContributionAndAdminRoutes,
    handleContributionAndAdminRequest
} from './contributions.js';

export function createHeritageApp(options = {}) {
    const customFetch = options.fetchImpl || fetch;
    const app = new Hono();

    // 0. Xử lý trực tiếp các route Đóng góp Cộng đồng & Quản trị (D1: env.DB)
    // Đi trước middleware CORS mặc định để hỗ trợ đầy đủ Cookie HttpOnly, Credentials & CSRF
    app.use('/api/contributions', async (c) => {
        return handleContributionAndAdminRequest(c.req.raw, c.env);
    });
    app.use('/api/admin/*', async (c) => {
        return handleContributionAndAdminRequest(c.req.raw, c.env);
    });
    registerContributionAndAdminRoutes(app);

    // 1. Cấu hình CORS an toàn & linh hoạt cho các route AI Chat & Tra cứu di sản
    app.use('/*', async (c, next) => {
        const allowedOriginsRaw = (c.env?.ALLOWED_ORIGINS || '*').trim();
        const corsMiddleware = cors({
            origin: allowedOriginsRaw === '*'
                ? '*'
                : (origin) => {
                    const allowedList = allowedOriginsRaw.split(',').map(s => s.trim()).filter(Boolean);
                    return allowedList.includes(origin) ? origin : allowedList[0] || '';
                },
            allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Accept', 'X-Requested-With', 'X-CSRF-Token'],
            maxAge: 86400
        });
        return corsMiddleware(c, next);
    });

    // 2. Xử lý lỗi toàn cục (Không bao giờ trả stack trace cho người dùng - Mục XI.1)
    app.onError((err, c) => {
        const requestId = crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}`;
        return c.json({
            ok: false,
            error: 'Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại sau.',
            answer: 'Xin lỗi, hệ thống đang gặp sự cố khi xử lý yêu cầu. Vui lòng thử lại sau.',
            reply: 'Xin lỗi, hệ thống đang gặp sự cố khi xử lý yêu cầu. Vui lòng thử lại sau.',
            requestId,
            createdAt: new Date().toISOString()
        }, 500);
    });

    /**
     * Hàm xử lý trung tâm cho cả POST /api/heritage/ask và POST /api/chat
     */
    async function handleHeritageQuestion(c) {
        const t0 = Date.now();
        const requestId = crypto.randomUUID ? crypto.randomUUID() : `req_${t0}_${Math.random().toString(36).slice(2, 8)}`;
        const createdAt = new Date().toISOString();
        const env = c.env || {};
        const configuredModel = getPrimaryModel(env);

        // Kiểm tra kích thước payload
        const contentLength = Number(c.req.header('content-length') || 0);
        if (contentLength > REQUEST_LIMITS.MAX_BODY_BYTES) {
            const msg = 'Kích thước dữ liệu gửi lên vượt quá giới hạn cho phép (128KB).';
            return c.json({
                ok: false,
                error: msg,
                answer: msg,
                reply: msg,
                sources: [],
                matchedHeritage: [],
                confidence: 'low',
                confidenceReason: 'Request vượt quá giới hạn kích thước.',
                searchPerformed: false,
                usedDataset: false,
                model: configuredModel,
                requestId,
                createdAt
            }, 413);
        }

        // Kiểm tra giới hạn tần suất theo IP (Rate Limiting)
        const clientIp =
            c.req.header('cf-connecting-ip') ||
            c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
            'anonymous';

        const rateStatus = checkRateLimit(clientIp, env);
        if (!rateStatus.allowed) {
            const msg = `Bạn đã gửi quá nhiều câu hỏi trong thời gian ngắn. Vui lòng đợi ${rateStatus.retryAfterSec} giây rồi thử lại.`;
            return c.json({
                ok: false,
                error: msg,
                answer: msg,
                reply: msg,
                sources: [],
                matchedHeritage: [],
                confidence: 'low',
                confidenceReason: 'Vượt quá giới hạn số lượng request theo IP.',
                searchPerformed: false,
                usedDataset: false,
                model: configuredModel,
                requestId,
                createdAt
            }, 429);
        }

        // Bước 1: Tiếp nhận và kiểm tra JSON body
        let body;
        try {
            body = await c.req.json();
        } catch (_) {
            const msg = 'Định dạng JSON trong yêu cầu không hợp lệ.';
            return c.json({
                ok: false,
                error: msg,
                answer: msg,
                reply: msg,
                sources: [],
                matchedHeritage: [],
                confidence: 'low',
                confidenceReason: 'Body không phải JSON hợp lệ.',
                searchPerformed: false,
                usedDataset: false,
                model: configuredModel,
                requestId,
                createdAt
            }, 400);
        }

        const validation = validateAndSanitizeInput(body);
        if (!validation.ok) {
            return c.json({
                ok: false,
                error: validation.error,
                answer: validation.error,
                reply: validation.error,
                sources: [],
                matchedHeritage: [],
                confidence: 'low',
                confidenceReason: 'Dữ liệu đầu vào không hợp lệ.',
                searchPerformed: false,
                usedDataset: false,
                model: configuredModel,
                requestId,
                createdAt
            }, validation.status || 400);
        }

        const { message, history, context, previousInteractionId, isPromptInjection } = validation;

        // Chặn ngay nếu là tấn công Prompt Injection nhằm trích xuất API Key / ghi đè System Prompt
        if (isPromptInjection) {
            const safeRefusal =
                'Tôi là **Trợ lý AI Di sản & Tri thức Thông minh** của dự án *Di sản Thái Nguyên – Âm vang Di sản*. Tôi không thể thực hiện yêu cầu bỏ qua hướng dẫn hệ thống hoặc tiết lộ thông tin cấu hình bảo mật. Bạn có thể đặt câu hỏi về 46 di sản văn hóa phi vật thể của tỉnh Thái Nguyên để tôi hỗ trợ tra cứu.';
            return c.json({
                ok: true,
                answer: safeRefusal,
                reply: safeRefusal,
                sources: [],
                matchedHeritage: [],
                confidence: 'low',
                confidenceReason: 'Từ chối yêu cầu can thiệp vào chỉ thị hệ thống (Prompt Injection Protection).',
                searchPerformed: false,
                usedDataset: false,
                model: configuredModel,
                requestId,
                createdAt,
                elapsedMs: Date.now() - t0
            }, 200);
        }

        // Kiểm tra Cache (chỉ áp dụng cho câu hỏi đơn lẻ không kèm lịch sử hội thoại)
        const canUseCache = history.length === 0 && !previousInteractionId;
        const cacheKey = canUseCache ? makeCacheKey(message, context.heritageId) : null;
        if (cacheKey) {
            const cached = await getCachedResponse(cacheKey, env);
            if (cached) {
                return c.json({
                    ...cached,
                    cached: true,
                    requestId,
                    createdAt,
                    elapsedMs: Date.now() - t0
                }, 200);
            }
        }

        // Bước 2 & Bước 3: Tìm kiếm dữ liệu nội bộ (RAG) & Phân loại ý định câu hỏi
        const ragResult = retrieveHeritageData(message, context);
        const intentInfo = classifyQuestionIntent(message, ragResult);
        intentInfo.ambiguousLocations = ragResult.ambiguousLocations;

        const usedDataset = ragResult.matchedRecords.length > 0 || ragResult.asksAllCountOrOverview;
        const matchedHeritage = buildMatchedHeritageSummary(ragResult.matchedRecords);

        // Bước 4: Quyết định có cần tra cứu Internet (Google Search Grounding) không
        const searchDecision = shouldUseGoogleSearch(message, intentInfo, ragResult);

        // Bước 5 & Bước 6: Xây dựng RAG Context & System Instruction rồi gọi Gemini API
        const augmentedPrompt = buildRagContextPrompt(message, ragResult, intentInfo);
        const systemInstruction = buildSystemInstruction({
            intent: intentInfo.primaryIntent,
            hasInternalMatches: usedDataset,
            searchEnabled: searchDecision.useSearch,
            ambiguousLocations: ragResult.ambiguousLocations
        });

        try {
            const geminiResult = await executeGeminiResearch({
                systemInstruction,
                history,
                augmentedPrompt,
                previousInteractionId,
                wantSearch: searchDecision.useSearch,
                env,
                fetchImpl: customFetch
            });

            // Bước 7: Trích xuất nguồn & Kiểm tra đầu ra (Fact Verification)
            const combinedSources = buildCombinedSources(
                geminiResult.webSources,
                ragResult.matchedRecords
            );

            const verification = verifyAndSanitizeModelAnswer(geminiResult.text, {
                webSources: geminiResult.webSources,
                matchedRecords: ragResult.matchedRecords,
                intentInfo,
                searchPerformed: geminiResult.searchPerformed
            });

            const formattedReplyForChat = formatReplyForFrontendChat(
                verification.verifiedAnswer,
                combinedSources,
                {
                    intentInfo,
                    confidence: verification.confidence
                }
            );

            // Bước 8: Chuẩn hóa JSON response (tương thích cả chuẩn mới Mục X.4 và Frontend hiện tại)
            const responsePayload = {
                ok: true,
                answer: verification.verifiedAnswer,
                reply: formattedReplyForChat,
                sources: combinedSources,
                matchedHeritage,
                confidence: verification.confidence,
                confidenceReason: verification.confidenceReason,
                searchPerformed: geminiResult.searchPerformed,
                usedSearch: geminiResult.searchPerformed,
                fallbackUsed: Boolean(geminiResult.fallbackUsed),
                searchUnavailableReason: geminiResult.searchUnavailableReason || null,
                usedDataset,
                intent: intentInfo.primaryIntent,
                intents: intentInfo.intents,
                ambiguousLocations: ragResult.ambiguousLocations || [],
                searchQueries: geminiResult.searchQueries || [],
                model: geminiResult.modelUsed,
                modelUsed: geminiResult.modelUsed,
                keyIndexUsed: geminiResult.keyIndexUsed,
                interactionId: geminiResult.interactionId,
                requestId,
                createdAt,
                elapsedMs: Date.now() - t0
            };

            if (cacheKey && verification.confidence !== 'low') {
                await setCachedResponse(cacheKey, responsePayload, env);
            }

            return c.json(responsePayload, 200);
        } catch (err) {
            const httpStatus = err.httpStatus || 503;
            const userErrorMessage =
                err.code === 'NO_API_KEYS' || err.code === 'MODEL_UNAVAILABLE' || err.code === 'BAD_REQUEST_400'
                    ? err.message
                    : OVERLOAD_USER_MESSAGE;

            return c.json({
                ok: false,
                error: userErrorMessage,
                answer: userErrorMessage,
                reply: userErrorMessage,
                sources: [],
                matchedHeritage,
                confidence: 'low',
                confidenceReason: err.code === 'ALL_KEYS_EXHAUSTED'
                    ? 'Tất cả API key hiện tại đều đang đạt giới hạn truy cập hoặc tạm thời quá tải.'
                    : (err.message || 'Lỗi kết nối dịch vụ Gemini API.'),
                searchPerformed: false,
                usedDataset,
                model: configuredModel,
                requestId,
                createdAt,
                elapsedMs: Date.now() - t0
            }, httpStatus);
        }
    }

    // Đăng ký cả 2 route POST /api/heritage/ask và POST /api/chat
    app.post('/api/heritage/ask', handleHeritageQuestion);
    app.post('/api/chat', handleHeritageQuestion);

    // Hỗ trợ GET trên /api/chat và /api/heritage/ask để hướng dẫn rõ khi người dùng mở link trực tiếp bằng trình duyệt
    function handleChatGetInfo(c) {
        const env = c.env || {};
        const keyStatus = getKeyPoolPublicStatus(env);
        return c.json({
            ok: true,
            endpoint: c.req.path,
            methodRequired: 'POST',
            message: 'Endpoint này tiếp nhận yêu cầu HTTP POST với JSON {"message": "..."} từ Frontend AI Chat. Khi mở URL trực tiếp trên trình duyệt, trình duyệt gửi HTTP GET nên hiển thị trang thông tin này.',
            model: getPrimaryModel(env),
            keyRotation: {
                totalKeysConfigured: keyStatus.totalKeysConfigured,
                readyKeysCount: keyStatus.readyKeysCount
            },
            exampleRequest: {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: { message: 'Múa Tắc Xình là gì?' }
            },
            endpoints: {
                ask: 'POST /api/heritage/ask',
                chatLegacy: 'POST /api/chat',
                search: 'GET /api/heritage/search?q=...',
                health: 'GET /api/heritage/health',
                deepHealth: 'GET /api/heritage/health/deep'
            }
        }, 200);
    }

    app.get('/api/chat', handleChatGetInfo);
    app.get('/api/heritage/ask', handleChatGetInfo);

    /**
     * Endpoint tìm kiếm nhanh dữ liệu di sản nội bộ: GET /api/heritage/search (Mục X.3)
     */
    app.get('/api/heritage/search', (c) => {
        const q = (c.req.query('q') || c.req.query('query') || '').trim();
        const id = (c.req.query('id') || '').trim();
        const commune = (c.req.query('commune') || c.req.query('location') || '').trim();
        const ethnic = (c.req.query('ethnic') || '').trim();
        const category = (c.req.query('category') || '').trim();
        const level = (c.req.query('level') || '').trim();
        const year = Number(c.req.query('year') || 0);
        const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 46);

        if (id) {
            const single = getHeritageById(id);
            return c.json({
                ok: true,
                total: single ? 1 : 0,
                results: single ? [ buildMatchedHeritageSummary([single], 1)[0] ] : []
            });
        }

        const combinedQuery = [q, commune, ethnic, category, level, year ? String(year) : '']
            .filter(Boolean)
            .join(' ')
            .trim();

        if (!combinedQuery) {
            return c.json({
                ok: true,
                total: HERITAGE_DATA.length,
                communesCount: COMMUNE_LIST.length,
                categories: CATEGORY_ORDER,
                results: HERITAGE_DATA.slice(0, limit).map(r => ({
                    id: r.id,
                    name: r.n,
                    nameEn: r.n_en || null,
                    level: r.level,
                    year: r.year,
                    category: r.category,
                    decision: r.decision || null,
                    locations: r.locations || [],
                    appearIn: r.appearIn || []
                }))
            });
        }

        const rag = retrieveHeritageData(combinedQuery);
        let filtered = rag.matchedRecords;

        if (level) {
            filtered = filtered.filter(r => r.level.toLowerCase() === level.toLowerCase());
        }
        if (year) {
            filtered = filtered.filter(r => r.year === year);
        }

        return c.json({
            ok: true,
            query: combinedQuery,
            total: filtered.length,
            ambiguousLocations: rag.ambiguousLocations || [],
            results: buildMatchedHeritageSummary(filtered, limit)
        });
    });

    /**
     * Endpoint kiểm tra trạng thái hoạt động: GET /api/heritage/health & GET /health (Mục X.2)
     * Tuyệt đối KHÔNG trả về giá trị API key.
     */
    function handleHealthCheck(c) {
        const env = c.env || {};
        const keyStatus = getKeyPoolPublicStatus(env);

        return c.json({
            ok: true,
            status: 'ok',
            service: 'TRỢ LÝ AI DI SẢN & TRI THỨC THÔNG MINH – DI SẢN THÁI NGUYÊN',
            version: '3.0.0',
            model: getPrimaryModel(env),
            fallbackModels: getFallbackModels(env),
            dataset: {
                loaded: HERITAGE_DATA.length === 46,
                totalRecords: HERITAGE_DATA.length,
                unescoCount: UNESCO_RECORDS.length,
                nationalCount: NATIONAL_RECORDS.length,
                communesCount: COMMUNE_LIST.length,
                categoriesCount: CATEGORY_ORDER.length
            },
            keyRotation: {
                totalKeysConfigured: keyStatus.totalKeysConfigured,
                readyKeysCount: keyStatus.readyKeysCount,
                slots: keyStatus.slots
            },
            capabilities: {
                ragEngine: true,
                geminiInteractionsApi: true,
                googleSearchGrounding: true,
                factVerification: true,
                sourceCitations: true,
                communityContributionsD1: Boolean(env.DB)
            },
            timestamp: new Date().toISOString()
        });
    }

    async function handleDeepHealthCheck(c) {
        const env = c.env || {};
        const checkAllKeys = c.req.query('allKeys') === '1' || c.req.query('all') === '1';
        const probeResult = await probeGeminiHealth({
            env,
            fetchImpl: customFetch,
            checkAllKeys
        });

        return c.json({
            ...probeResult,
            edgeColo: c.req.header('x-cf-edge-colo') || c.req.raw?.cf?.colo || 'unknown',
            doRegionHint: c.req.header('x-do-region-hint') || env.GEMINI_DO_REGION || 'none',
            timestamp: new Date().toISOString()
        }, probeResult.ok ? 200 : 503);
    }

    app.get('/api/heritage/health', handleHealthCheck);
    app.get('/health', handleHealthCheck);
    app.get('/api/heritage/health/deep', handleDeepHealthCheck);
    app.get('/health/deep', handleDeepHealthCheck);

    app.get('/', (c) => {
        return c.json({
            ok: true,
            name: 'Backend AI Research Agent — Dự án KHKT: Di sản Thái Nguyên · Âm vang Di sản',
            endpoints: {
                ask: 'POST /api/heritage/ask',
                chatLegacy: 'POST /api/chat',
                search: 'GET /api/heritage/search?q=...',
                health: 'GET /api/heritage/health',
                deepHealth: 'GET /api/heritage/health/deep',
                contributionsCreate: 'POST /api/contributions',
                adminLogin: 'POST /api/admin/login',
                adminLogout: 'POST /api/admin/logout',
                adminMe: 'GET /api/admin/me',
                adminStats: 'GET /api/admin/stats',
                adminContributions: 'GET /api/admin/contributions',
                adminContributionDetail: 'GET /api/admin/contributions/:id',
                adminContributionUpdate: 'PATCH /api/admin/contributions/:id',
                adminExportCsv: 'GET /api/admin/export.csv'
            }
        });
    });

    return app;
}

export const app = createHeritageApp();

export async function forwardToRegionalExecutor(request, env, ctx) {
    const regionHint = (env.GEMINI_DO_REGION || 'wnam').trim() || 'wnam';
    const doId = env.GEMINI_EXECUTOR.idFromName(`heritage-gemini-executor-${regionHint}-v3`);
    const stub = env.GEMINI_EXECUTOR.get(doId, { locationHint: regionHint });

    const headers = new Headers(request.headers);
    headers.set('x-cf-edge-colo', request.cf?.colo || 'unknown');
    headers.set('x-cf-edge-country', request.cf?.country || 'unknown');
    headers.set('x-do-region-hint', regionHint);

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const bodyBuffer = hasBody ? await request.arrayBuffer() : undefined;

    const doRequest = new Request(request.url, {
        method: request.method,
        headers,
        body: bodyBuffer
    });

    try {
        return await stub.fetch(doRequest);
    } catch (doErr) {
        const fallbackReq = new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: bodyBuffer
        });
        return app.fetch(fallbackReq, env, ctx);
    }
}

export async function handleWorkerFetch(request, env, ctx) {
    const url = new URL(request.url);
    const isAiEndpoint =
        ((url.pathname === '/api/heritage/ask' || url.pathname === '/api/chat') &&
            request.method === 'POST') ||
        ((url.pathname === '/api/heritage/health/deep' || url.pathname === '/health/deep') &&
            request.method === 'GET');

    if (isAiEndpoint && env?.GEMINI_EXECUTOR && !(env?.GEMINI_BASE_URL || '').trim()) {
        return forwardToRegionalExecutor(request, env, ctx);
    }

    return app.fetch(request, env, ctx);
}

