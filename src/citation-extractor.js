/**
 * CƠ CHẾ TRÍCH DẪN NGUỒN THÔNG MINH (Mục IX)
 *
 * Đọc trực tiếp từ cấu trúc response thực tế của Gemini Interactions API:
 * - `steps`
 * - `google_search_call` (trích xuất danh sách `queries`)
 * - `google_search_result` (xác nhận có thực thi tìm kiếm; bỏ qua `search_suggestions` HTML)
 * - `model_output` -> `content[]` -> `annotations[]` -> `url_citation`
 * Đồng thời hỗ trợ tương thích cấu trúc `groundingMetadata` nếu gọi qua endpoint dự phòng,
 * và tách biệt hoàn toàn với nguồn dữ liệu nội bộ (`internal_dataset`).
 */

import {
    PRIORITY_OFFICIAL_DOMAINS,
    RESEARCH_DOMAINS,
    OFFICIAL_PRESS_DOMAINS
} from './config.js';

/**
 * Phân loại độ uy tín và loại nguồn từ URL thực tế
 */
export function classifyUrlSource(url, rawTitle = '') {
    if (!url || typeof url !== 'string') return null;

    let hostname = '';
    try {
        const parsed = new URL(url);
        hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch (_) {
        return null;
    }

    // 1. Kiểm tra danh sách cơ quan chính thức ưu tiên (Mục IV.3)
    for (const item of PRIORITY_OFFICIAL_DOMAINS) {
        if (hostname === item.domain || hostname.endsWith('.' + item.domain)) {
            return {
                type: 'official',
                publisher: item.publisher,
                priority: item.priority,
                verified: true,
                hostname
            };
        }
    }

    // Các cổng thông tin .gov.vn hoặc unesco.org khác
    if (hostname.endsWith('.gov.vn') || hostname === 'gov.vn') {
        return {
            type: 'official',
            publisher: rawTitle || `Cơ quan nhà nước (${hostname})`,
            priority: 9,
            verified: true,
            hostname
        };
    }

    // 2. Kiểm tra nguồn viện nghiên cứu, trường đại học, bảo tàng
    for (const domain of RESEARCH_DOMAINS) {
        if (hostname === domain || hostname.endsWith('.' + domain)) {
            return {
                type: 'research',
                publisher: rawTitle || `Tài liệu khoa học / Nghiên cứu (${hostname})`,
                priority: 15,
                verified: true,
                hostname
            };
        }
    }
    if (hostname.endsWith('.edu.vn') || hostname.endsWith('.ac.vn')) {
        return {
            type: 'research',
            publisher: rawTitle || `Cơ sở giáo dục / Nghiên cứu (${hostname})`,
            priority: 16,
            verified: true,
            hostname
        };
    }

    // 3. Kiểm tra báo chí chính thống
    for (const press of OFFICIAL_PRESS_DOMAINS) {
        if (hostname === press.domain || hostname.endsWith('.' + press.domain)) {
            return {
                type: 'press',
                publisher: press.publisher,
                priority: 25,
                verified: true,
                hostname
            };
        }
    }

    // 4. Các nguồn web khác từ Google Search Grounding
    return {
        type: 'web',
        publisher: rawTitle || hostname,
        priority: 50,
        verified: true,
        hostname
    };
}

/**
 * Trích xuất văn bản và nguồn tham khảo từ response của Gemini Interactions API (`/v1beta/interactions`)
 */
export function extractFromInteractionsResponse(interaction) {
    if (!interaction || typeof interaction !== 'object') {
        return {
            text: '',
            searchQueries: [],
            searchResultCount: 0,
            webSources: [],
            annotations: []
        };
    }

    const steps = Array.isArray(interaction.steps) ? interaction.steps : [];
    const searchQueries = [];
    let searchResultCount = 0;
    const rawAnnotations = [];
    const textParts = [];

    for (const step of steps) {
        if (!step || typeof step !== 'object') continue;

        if (step.type === 'google_search_call') {
            const queries = step.arguments?.queries || step.queries || [];
            if (Array.isArray(queries)) {
                for (const q of queries) {
                    if (typeof q === 'string' && q.trim()) {
                        searchQueries.push(q.trim());
                    }
                }
            }
        } else if (step.type === 'google_search_result') {
            searchResultCount++;
            // Lưu ý Mục IX: Không lấy HTML `search_suggestions` đưa vào giao diện!
            // Nếu result có chứa mảng tài liệu/url thực tế (ngoài search_suggestions), trích xuất an toàn:
            const resultItems = Array.isArray(step.result) ? step.result : [];
            for (const item of resultItems) {
                if (item && typeof item === 'object' && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
                    rawAnnotations.push({
                        url: item.url.trim(),
                        title: item.title || '',
                        citedText: item.snippet || '',
                        startIndex: null,
                        endIndex: null
                    });
                }
            }
        } else if (step.type === 'model_output') {
            const contentBlocks = Array.isArray(step.content) ? step.content : [];
            for (const block of contentBlocks) {
                if (!block || typeof block !== 'object') continue;
                if (block.type === 'text' && typeof block.text === 'string') {
                    const blockText = block.text;
                    textParts.push(blockText);

                    const blockAnnotations = Array.isArray(block.annotations) ? block.annotations : [];
                    for (const ann of blockAnnotations) {
                        if (!ann || typeof ann !== 'object') continue;
                        if (ann.type === 'url_citation' && typeof ann.url === 'string' && /^https?:\/\//i.test(ann.url)) {
                            const startIdx = Number.isInteger(ann.start_index)
                                ? ann.start_index
                                : (Number.isInteger(ann.startIndex) ? ann.startIndex : null);
                            const endIdx = Number.isInteger(ann.end_index)
                                ? ann.end_index
                                : (Number.isInteger(ann.endIndex) ? ann.endIndex : null);

                            let citedText = '';
                            if (
                                startIdx !== null &&
                                endIdx !== null &&
                                startIdx >= 0 &&
                                endIdx <= blockText.length &&
                                startIdx < endIdx
                            ) {
                                citedText = blockText.slice(startIdx, endIdx).trim();
                            }

                            rawAnnotations.push({
                                url: ann.url.trim(),
                                title: (ann.title || '').trim(),
                                startIndex: startIdx,
                                endIndex: endIdx,
                                citedText
                            });
                        }
                    }
                }
            }
        }
    }

    const fullText = (typeof interaction.output_text === 'string' && interaction.output_text.trim())
        ? interaction.output_text.trim()
        : textParts.join('\n').trim();

    const webSources = deduplicateAndRankWebSources(rawAnnotations);

    return {
        text: fullText,
        searchQueries: [...new Set(searchQueries)],
        searchResultCount,
        webSources,
        annotations: rawAnnotations
    };
}

/**
 * Trích xuất văn bản và nguồn tham khảo từ response `generateContent` (khi dùng fallback)
 */
export function extractFromGenerateContentResponse(response) {
    if (!response || typeof response !== 'object') {
        return {
            text: '',
            searchQueries: [],
            searchResultCount: 0,
            webSources: [],
            annotations: []
        };
    }

    const candidate = response.candidates?.[0] || {};
    const parts = candidate.content?.parts || [];
    const text = parts
        .filter(p => p && !p.thought && typeof p.text === 'string')
        .map(p => p.text)
        .join('')
        .trim();

    const gm = candidate.groundingMetadata || {};
    const searchQueries = Array.isArray(gm.webSearchQueries) ? gm.webSearchQueries.filter(Boolean) : [];
    const chunks = Array.isArray(gm.groundingChunks) ? gm.groundingChunks : [];
    const supports = Array.isArray(gm.groundingSupports) ? gm.groundingSupports : [];

    const rawAnnotations = [];

    for (let i = 0; i < chunks.length; i++) {
        const web = chunks[i]?.web;
        if (!web || typeof web.uri !== 'string' || !/^https?:\/\//i.test(web.uri)) continue;

        // Tìm câu trích dẫn được hỗ trợ bởi chunk này
        const supportingSegments = supports
            .filter(s => Array.isArray(s.groundingChunkIndices) && s.groundingChunkIndices.includes(i))
            .map(s => s.segment?.text || '')
            .filter(Boolean);

        rawAnnotations.push({
            url: web.uri.trim(),
            title: (web.title || '').trim(),
            startIndex: null,
            endIndex: null,
            citedText: supportingSegments.join(' | ').slice(0, 300)
        });
    }

    const webSources = deduplicateAndRankWebSources(rawAnnotations);

    return {
        text,
        searchQueries: [...new Set(searchQueries)],
        searchResultCount: chunks.length > 0 ? 1 : 0,
        webSources,
        annotations: rawAnnotations
    };
}

/**
 * Khử trùng lặp và xếp hạng nguồn Internet theo thứ tự ưu tiên Mục IV.3
 */
function deduplicateAndRankWebSources(rawAnnotations) {
    const byUrl = new Map();

    for (const item of rawAnnotations) {
        if (!item?.url) continue;
        const classification = classifyUrlSource(item.url, item.title);
        if (!classification) continue;

        if (!byUrl.has(item.url)) {
            byUrl.set(item.url, {
                title: item.title || classification.publisher || classification.hostname,
                url: item.url,
                type: classification.type,
                publisher: classification.publisher,
                source: 'google_search_grounding',
                verified: true,
                priority: classification.priority,
                citedSpans: item.citedText ? [item.citedText] : []
            });
        } else {
            const existing = byUrl.get(item.url);
            if (item.citedText && !existing.citedSpans.includes(item.citedText)) {
                existing.citedSpans.push(item.citedText);
            }
        }
    }

    const list = Array.from(byUrl.values());
    list.sort((a, b) => a.priority - b.priority);

    return list.map(({ priority, citedSpans, ...rest }) => ({
        ...rest,
        ...(citedSpans.length > 0 ? { citedText: citedSpans.slice(0, 3).join(' … ') } : {})
    }));
}

/**
 * Tạo danh sách nguồn tham khảo tổng hợp gồm cả:
 * - Nguồn từ Google Search Grounding (có URL thực tế từ API)
 * - Nguồn từ Dữ liệu di sản nội bộ (`internal_dataset`, KHÔNG gán URL giả)
 */
export function buildCombinedSources(webSources = [], matchedRecords = [], maxInternalSources = 6) {
    const combined = [];

    // 1. Nguồn xác minh từ Google Search Grounding (ưu tiên nguồn chính thức lên đầu)
    for (const ws of webSources) {
        combined.push(ws);
    }

    // 2. Nguồn dữ liệu nội bộ từ `heritage-data.js`
    const topInternal = matchedRecords.slice(0, maxInternalSources);
    for (const rec of topInternal) {
        combined.push({
            title: `Dữ liệu di sản nội bộ — ${rec.name}`,
            type: 'internal_dataset',
            source: 'heritage_data_js',
            recordId: rec.id,
            recordName: rec.name,
            level: rec.level,
            year: rec.year,
            decision: rec.decision || null,
            sourceDoc: rec.sourceDoc || null,
            verified: true
        });
    }

    return combined;
}
