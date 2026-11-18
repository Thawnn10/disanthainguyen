/**
 * GEMINI AI ENGINE — TÍCH HỢP GEMINI INTERACTIONS API & GOOGLE SEARCH GROUNDING (Mục IV)
 *
 * 1. Sử dụng Gemini Interactions API (`/v1beta/interactions`) với header `x-goog-api-key`
 *    và `Api-Revision: 2026-05-20`.
 * 2. Không bao giờ truyền API key trên URL query string.
 * 3. Hỗ trợ công cụ `google_search` Grounding (`tools: [{ type: "google_search" }]`).
 * 4. Hỗ trợ quản lý ngữ cảnh hội thoại đa lượt (`input` steps hoặc `previous_interaction_id`).
 * 5. Tích hợp chặt chẽ với `api-key-manager.js` để xoay vòng 9 API key và xử lý lỗi chuẩn xác.
 */

import {
    getPrimaryModel,
    getFallbackModels,
    getInteractionsEndpoint,
    getGenerateContentEndpoint,
    GEMINI_INTERACTIONS_REVISION,
    REQUEST_LIMITS,
    OVERLOAD_USER_MESSAGE
} from './config.js';
import {
    discoverApiKeys,
    buildRotationPlan,
    classifyGeminiError,
    markKeySuccess,
    markKeyFailure,
    isModelSearchTemporarilyBlocked
} from './api-key-manager.js';
import {
    extractFromInteractionsResponse,
    extractFromGenerateContentResponse
} from './citation-extractor.js';

/**
 * Chuyển đổi lịch sử hội thoại + câu hỏi hiện tại (kèm RAG context) sang định dạng `steps` của Interactions API
 */
export function buildInteractionsInputSteps(history = [], currentAugmentedPrompt = '') {
    const steps = [];

    for (const turn of history) {
        if (!turn || !turn.text) continue;
        if (turn.role === 'user') {
            steps.push({
                type: 'user_input',
                content: [{ type: 'text', text: turn.text }]
            });
        } else if (turn.role === 'model') {
            steps.push({
                type: 'model_output',
                content: [{ type: 'text', text: turn.text }]
            });
        }
    }

    steps.push({
        type: 'user_input',
        content: [{ type: 'text', text: currentAugmentedPrompt }]
    });

    return steps;
}

/**
 * Gọi trực tiếp Gemini Interactions API (`POST /v1beta/interactions`)
 * Sử dụng header `x-goog-api-key` (tuyệt đối không đặt key trên URL)
 */
async function callInteractionsEndpoint({
    apiKey,
    modelName,
    systemInstruction,
    history,
    augmentedPrompt,
    previousInteractionId,
    useSearch,
    env,
    fetchImpl = fetch,
    timeoutMs = REQUEST_LIMITS.GEMINI_TIMEOUT_MS
}) {
    const endpoint = getInteractionsEndpoint(env);
    const isGemini3Or4 = /^gemini-(3|4)/i.test(modelName);

    const requestBody = {
        model: modelName,
        system_instruction: systemInstruction,
        ...(previousInteractionId
            ? {
                previous_interaction_id: previousInteractionId,
                input: augmentedPrompt
            }
            : {
                store: false,
                input: history && history.length > 0
                    ? buildInteractionsInputSteps(history, augmentedPrompt)
                    : augmentedPrompt
            }),
        ...(useSearch ? { tools: [{ type: 'google_search' }] } : {}),
        generation_config: {
            max_output_tokens: 8192,
            ...(isGemini3Or4 ? { thinking_level: 'low' } : {})
        }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
        res = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
                'Api-Revision': env?.GEMINI_INTERACTIONS_REVISION || GEMINI_INTERACTIONS_REVISION
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }

    const retryAfterHeader = res.headers?.get?.('retry-after') || null;
    const rawText = await res.text();
    let json = null;
    try {
        json = rawText ? JSON.parse(rawText) : null;
    } catch (_) {
        json = null;
    }

    if (!res.ok) {
        const errMsg = json?.error?.message || json?.message || rawText.slice(0, 300) || `HTTP ${res.status}`;
        const err = new Error(errMsg);
        err.status = res.status;
        err.retryAfter = retryAfterHeader;
        throw err;
    }

    const extracted = extractFromInteractionsResponse(json);
    if (!extracted.text) {
        const statusInfo = json?.status || 'empty_output';
        const err = new Error(`Gemini Interactions API trả về nội dung rỗng (status=${statusInfo}).`);
        err.status = 502;
        throw err;
    }

    return {
        apiType: 'interactions',
        interactionId: json?.id || null,
        text: extracted.text,
        webSources: extracted.webSources,
        searchQueries: extracted.searchQueries,
        searchPerformed: Boolean(useSearch && (extracted.searchQueries.length > 0 || extracted.searchResultCount > 0 || extracted.webSources.length > 0)),
        annotations: extracted.annotations
    };
}

/**
 * Dự phòng: Gọi endpoint `generateContent` (cũng dùng header `x-goog-api-key`)
 * Chỉ kích hoạt nếu môi trường/proxy chưa bật route `/v1beta/interactions`.
 */
async function callGenerateContentFallback({
    apiKey,
    modelName,
    systemInstruction,
    history,
    augmentedPrompt,
    useSearch,
    env,
    fetchImpl = fetch
}) {
    const endpoint = getGenerateContentEndpoint(modelName, env);
    const contents = [];

    for (const turn of history || []) {
        if (!turn || !turn.text) continue;
        contents.push({
            role: turn.role === 'model' ? 'model' : 'user',
            parts: [{ text: turn.text }]
        });
    }
    contents.push({
        role: 'user',
        parts: [{ text: augmentedPrompt }]
    });

    const requestBody = {
        systemInstruction: {
            parts: [{ text: systemInstruction }]
        },
        contents,
        ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
        generationConfig: {
            maxOutputTokens: 8192
        }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
        res = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }

    const retryAfterHeader = res.headers?.get?.('retry-after') || null;
    const rawText = await res.text();
    let json = null;
    try {
        json = rawText ? JSON.parse(rawText) : null;
    } catch (_) {
        json = null;
    }

    if (!res.ok) {
        const errMsg = json?.error?.message || json?.message || rawText.slice(0, 300) || `HTTP ${res.status}`;
        const err = new Error(errMsg);
        err.status = res.status;
        err.retryAfter = retryAfterHeader;
        throw err;
    }

    const extracted = extractFromGenerateContentResponse(json);
    if (!extracted.text) {
        const finishReason = json?.candidates?.[0]?.finishReason || 'UNKNOWN';
        const err = new Error(`Gemini API trả về nội dung rỗng (finishReason=${finishReason}).`);
        err.status = 502;
        throw err;
    }

    return {
        apiType: 'generateContent',
        interactionId: null,
        text: extracted.text,
        webSources: extracted.webSources,
        searchQueries: extracted.searchQueries,
        searchPerformed: Boolean(useSearch && (extracted.searchQueries.length > 0 || extracted.searchResultCount > 0 || extracted.webSources.length > 0)),
        annotations: extracted.annotations
    };
}

/**
 * Thực thi gọi Gemini với cơ chế xoay vòng 9 API Key, phân loại lỗi và fallback an toàn
 */
export async function executeGeminiResearch({
    systemInstruction,
    history = [],
    augmentedPrompt,
    previousInteractionId = null,
    wantSearch = true,
    env = {},
    fetchImpl = fetch
}) {
    const keyDescriptors = discoverApiKeys(env);
    if (keyDescriptors.length === 0) {
        const noKeyErr = new Error('Hệ thống chưa được cấu hình Gemini API Key trong Cloudflare Secrets.');
        noKeyErr.code = 'NO_API_KEYS';
        noKeyErr.httpStatus = 503;
        throw noKeyErr;
    }

    const primaryModel = getPrimaryModel(env);
    const fallbackModels = getFallbackModels(env);
    const modelsToTry = [...new Set([primaryModel, ...fallbackModels])];

    const deadKeyIndices = new Set();
    const unsupportedModels = new Set();
    const searchBlockedModels = new Set();
    const attemptLogs = [];

    let subrequestsCount = 0;
    const plainSweepNeed = keyDescriptors.length * Math.max(1, modelsToTry.length);
    const maxSubrequests = Math.min(
        REQUEST_LIMITS.MAX_SUBREQUESTS_PER_REQUEST,
        Math.max(plainSweepNeed + Math.min(keyDescriptors.length + 3, 14), 24)
    );
    // Dành đủ ngân sách subrequest cho vòng dự phòng không Google Search đi hết mọi key x mọi model
    const desiredPass1Cap = Math.min(Math.max(keyDescriptors.length + 2, 6), 14);
    const pass1MaxSubrequests = wantSearch
        ? Math.max(1, Math.min(desiredPass1Cap, maxSubrequests - Math.min(plainSweepNeed, maxSubrequests - 1)))
        : maxSubrequests;

    let searchUnavailableReason = null;

    // Nếu wantSearch = true, thử vòng 1 có Google Search, vòng 2 dự phòng tắt Google Search nếu Search hết quota/bị chặn
    const searchPasses = wantSearch ? [true, false] : [false];

    for (const passUseSearch of searchPasses) {
        if (!passUseSearch && wantSearch && !searchUnavailableReason) {
            const lastPass1Failure = [...attemptLogs].reverse().find(item => item.useSearch);
            searchUnavailableReason =
                lastPass1Failure?.reason ||
                'Công cụ google_search tạm thời không khả dụng trên gói API hiện tại.';
        }
        const currentPassLimit = passUseSearch ? pass1MaxSubrequests : maxSubrequests;
        const triedKeysInPass = new Set();

        // Ưu tiên quét các key chưa cooldown trên toàn bộ các model trước (includeRateLimited=false),
        // tránh việc 1 model vừa hết 20 RPD làm chậm các request tiếp theo trước khi chuyển sang fallback model.
        for (const includeRateLimited of [false, true]) {
            for (const modelName of modelsToTry) {
                if (subrequestsCount >= currentPassLimit) break;
                if (unsupportedModels.has(modelName)) continue;

                if (passUseSearch && (searchBlockedModels.has(modelName) || isModelSearchTemporarilyBlocked(modelName))) {
                    continue;
                }

                const rotationPlan = buildRotationPlan(
                    keyDescriptors,
                    modelName,
                    passUseSearch,
                    deadKeyIndices,
                    { includeRateLimited }
                );
                if (rotationPlan.length === 0) continue;

                for (const keyDesc of rotationPlan) {
                    if (subrequestsCount >= currentPassLimit) break;
                    if (unsupportedModels.has(modelName)) break;
                    if (passUseSearch && searchBlockedModels.has(modelName)) break;

                    const attemptSignature = `${passUseSearch ? 's' : 'p'}::${modelName}::${keyDesc.index}`;
                    if (triedKeysInPass.has(attemptSignature)) continue;
                    triedKeysInPass.add(attemptSignature);

                subrequestsCount++;

                try {
                    let result;
                    try {
                        result = await callInteractionsEndpoint({
                            apiKey: keyDesc.apiKey,
                            modelName,
                            systemInstruction,
                            history,
                            augmentedPrompt,
                            previousInteractionId,
                            useSearch: passUseSearch,
                            env,
                            fetchImpl
                        });
                    } catch (interactionsErr) {
                        // Nếu tài khoản/endpoint báo 404 riêng cho route /interactions (chưa bật Interactions API),
                        // thử fallback sang generateContent trên cùng model và key đó
                        if (
                            Number(interactionsErr?.status) === 404 &&
                            /interactions|not found/i.test(interactionsErr?.message || '') &&
                            !/model.*not found/i.test(interactionsErr?.message || '')
                        ) {
                            subrequestsCount++;
                            result = await callGenerateContentFallback({
                                apiKey: keyDesc.apiKey,
                                modelName,
                                systemInstruction,
                                history,
                                augmentedPrompt,
                                useSearch: passUseSearch,
                                env,
                                fetchImpl
                            });
                        } else {
                            throw interactionsErr;
                        }
                    }

                    markKeySuccess(keyDesc, modelName, passUseSearch);

                    return {
                        ...result,
                        modelUsed: modelName,
                        keySlotUsed: keyDesc.slotName,
                        keyIndexUsed: keyDesc.index,
                        searchRequested: wantSearch,
                        searchEnabledInCall: passUseSearch,
                        fallbackUsed: !passUseSearch && wantSearch,
                        searchUnavailableReason: !passUseSearch && wantSearch ? searchUnavailableReason : null
                    };
                } catch (err) {
                    const classified = classifyGeminiError(err, err?.status, err?.retryAfter);

                    attemptLogs.push({
                        keySlot: keyDesc.slotName,
                        model: modelName,
                        useSearch: passUseSearch,
                        category: classified.category,
                        status: classified.status,
                        reason: classified.reason
                    });

                    markKeyFailure(keyDesc, modelName, passUseSearch, classified);

                    if (classified.shouldAbortAll) {
                        const abortErr = new Error(classified.reason);
                        abortErr.code = classified.category;
                        abortErr.httpStatus = classified.status === 400 ? 400 : 503;
                        abortErr.attemptLogs = attemptLogs;
                        throw abortErr;
                    }

                    if (classified.shouldDisableKey) {
                        deadKeyIndices.add(keyDesc.index);
                        continue;
                    }

                    if (classified.shouldDisableSearchOnModel) {
                        searchBlockedModels.add(modelName);
                        if (!searchUnavailableReason) {
                            searchUnavailableReason = classified.reason;
                        }
                        break; // Chuyển sang pass không search
                    }

                    if (classified.shouldSwitchModel) {
                        unsupportedModels.add(modelName);
                        break; // Chuyển sang model tiếp theo
                    }

                    // Với 429, 500, 502, 503, Timeout, Network Error -> xoay sang key tiếp theo trong rotationPlan
                }
            }
            }
        }
    }

    // Nếu toàn bộ các model đều bị báo 404 (không có quyền truy cập model)
    if (unsupportedModels.size === modelsToTry.length) {
        const modelErr = new Error(
            `Model cấu hình (${primaryModel}) hiện không khả dụng với tài khoản API hiện tại. Vui lòng kiểm tra biến môi trường GEMINI_MODEL.`
        );
        modelErr.code = 'MODEL_UNAVAILABLE';
        modelErr.httpStatus = 503;
        modelErr.attemptLogs = attemptLogs;
        throw modelErr;
    }

    const exhaustedErr = new Error(OVERLOAD_USER_MESSAGE);
    exhaustedErr.code = 'ALL_KEYS_EXHAUSTED';
    exhaustedErr.httpStatus = 503;
    exhaustedErr.attemptLogs = attemptLogs;
    throw exhaustedErr;
}

function sanitizeDiagnosticError(message = '') {
    return String(message || '')
        .replace(/AIza[0-9A-Za-z_-]{8,}/g, '[REDACTED]')
        .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
        .slice(0, 320);
}

async function runSingleHealthProbe({ keyDesc, modelName, useSearch, env, fetchImpl }) {
    const t0 = Date.now();
    try {
        const result = await callInteractionsEndpoint({
            apiKey: keyDesc.apiKey,
            modelName,
            systemInstruction: 'Trả lời ngắn gọn 1 từ.',
            history: [],
            augmentedPrompt: 'Trả lời đúng 1 từ: OK',
            previousInteractionId: null,
            useSearch,
            env,
            fetchImpl,
            timeoutMs: 8000
        });
        return {
            keySlot: keyDesc.slotName,
            projectId: keyDesc.projectId,
            model: modelName,
            useSearch,
            ok: true,
            status: 200,
            category: 'OK',
            elapsedMs: Date.now() - t0,
            apiType: result.apiType
        };
    } catch (err) {
        const classified = classifyGeminiError(err, err?.status, err?.retryAfter);
        return {
            keySlot: keyDesc.slotName,
            projectId: keyDesc.projectId,
            model: modelName,
            useSearch,
            ok: false,
            status: err?.status || classified.status || 500,
            category: classified.category,
            shouldDisableSearchOnModel: Boolean(classified.shouldDisableSearchOnModel),
            elapsedMs: Date.now() - t0,
            error: sanitizeDiagnosticError(err?.message || classified.reason)
        };
    }
}

/**
 * Kiểm tra kết nối trực tiếp tới Gemini API (mặc định kiểm tra Key đầu tiên ở chế độ plain & google_search;
 * nếu checkAllKeys=true sẽ kiểm tra lần lượt tối đa 9 key ở chế độ plain; đồng thời kiểm tra fallbackModels
 * nếu model chính bị hết quota Free Tier). Tuyệt đối không lộ API key.
 */
export async function probeGeminiHealth({ env = {}, fetchImpl = fetch, checkAllKeys = false } = {}) {
    const primaryModel = getPrimaryModel(env);
    const fallbackModels = getFallbackModels(env).filter(m => m !== primaryModel);
    const keyDescriptors = discoverApiKeys(env);

    if (keyDescriptors.length === 0) {
        return {
            ok: false,
            configuredKeysCount: 0,
            model: primaryModel,
            probes: [],
            error: 'Chưa cấu hình biến GEMINI_API_KEY_1..9 trên Cloudflare Secrets.'
        };
    }

    const probes = [];
    if (checkAllKeys) {
        for (const keyDesc of keyDescriptors.slice(0, 9)) {
            probes.push(
                await runSingleHealthProbe({
                    keyDesc,
                    modelName: primaryModel,
                    useSearch: false,
                    env,
                    fetchImpl
                })
            );
        }
    } else {
        probes.push(
            await runSingleHealthProbe({
                keyDesc: keyDescriptors[0],
                modelName: primaryModel,
                useSearch: false,
                env,
                fetchImpl
            })
        );
        probes.push(
            await runSingleHealthProbe({
                keyDesc: keyDescriptors[0],
                modelName: primaryModel,
                useSearch: true,
                env,
                fetchImpl
            })
        );
    }

    const primaryPlainOk = probes.some(p => p.ok && !p.useSearch);
    const searchOk = probes.some(p => p.ok && p.useSearch);

    // Nếu model chính bị 429 hết 20 RPD Free Tier hoặc tạm lỗi, kiểm tra ngay các model dự phòng
    const fallbackProbes = [];
    if (!primaryPlainOk && fallbackModels.length > 0) {
        const probeKeys = keyDescriptors.slice(0, 5);
        for (const fbModel of fallbackModels) {
            let modelSucceeded = false;
            for (const fbKeyDesc of probeKeys) {
                const fbProbe = await runSingleHealthProbe({
                    keyDesc: fbKeyDesc,
                    modelName: fbModel,
                    useSearch: false,
                    env,
                    fetchImpl
                });
                fallbackProbes.push(fbProbe);
                if (fbProbe.ok) {
                    modelSucceeded = true;
                    break;
                }
                if (fbProbe.status !== 429 && fbProbe.status !== 408) {
                    break;
                }
            }
            if (modelSucceeded) break;
        }
    }

    const fallbackPlainOk = fallbackProbes.some(p => p.ok && !p.useSearch);
    const activeFallbackProbe = fallbackProbes.find(p => p.ok) || null;
    const plainOk = primaryPlainOk || fallbackPlainOk;

    return {
        ok: plainOk || searchOk,
        primaryModelOk: primaryPlainOk,
        fallbackModelOk: fallbackPlainOk,
        activeModel: primaryPlainOk ? primaryModel : (activeFallbackProbe?.model || null),
        plainInferenceOk: plainOk,
        googleSearchGroundingOk: searchOk,
        configuredKeysCount: keyDescriptors.length,
        model: primaryModel,
        fallbackModels,
        endpoint: getInteractionsEndpoint(env),
        probes,
        ...(fallbackProbes.length > 0 ? { fallbackProbes } : {})
    };
}
