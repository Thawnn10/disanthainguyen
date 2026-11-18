/**
 * HỆ THỐNG RAG & CONTEXT ENGINE TỪ HERITAGE-DATA.JS (Mục V)
 *
 * Kết hợp:
 * 1. Exact matching (ID di sản, tên có dấu tiếng Việt, số hiệu quyết định).
 * 2. Unicode normalization (NFC & NFD).
 * 3. Phân biệt địa danh đồng âm khác dấu (ví dụ: Văn Lang vs Văn Lăng) — tuyệt đối không tự gộp.
 * 4. Lọc chính xác theo cộng đồng chủ thể dân tộc (Tày, Nùng, Dao, Sán Chay, Sán Dìu, Mông...).
 * 5. Tìm kiếm theo xã/phường hiện hành (`locations`, `appearIn`) và địa danh lịch sử trong `description`.
 * 6. Fuzzy matching & Keyword matching có kiểm soát.
 * 7. Xây dựng Context có cấu trúc chuẩn và giới hạn token hợp lý.
 */

import {
    HERITAGE_DATA,
    COMMUNE_LIST,
    CATEGORY_ORDER,
    DI_SAN,
    UNESCO_RECORDS,
    NATIONAL_RECORDS,
    INDEXED_HERITAGE_RECORDS,
    AMBIGUOUS_COMMUNE_MAP,
    norm,
    normWithDiacritics,
    getHeritageById
} from './heritage-data-adapter.js';
import {
    detectQueriedEthnicGroups,
    detectQueriedCategory
} from './intent-classifier.js';
import { REQUEST_LIMITS } from './config.js';

const STOPWORDS_NORM = new Set([
    'la', 'gi', 'co', 'nhung', 'cac', 'nao', 'o', 'tai', 'cua', 'nguoi', 'dan', 'toc',
    'di', 'san', 'van', 'hoa', 'phi', 'vat', 'the', 'tinh', 'thai', 'nguyen', 'bac', 'kan',
    'xa', 'phuong', 'huyen', 'thanh', 'pho', 'thi', 'tran', 'cho', 'biet', 'hoi', 've',
    'dac', 'diem', 'y', 'nghia', 'nhu', 'the', 'nam', 'bao', 'nhieu', 'liet', 'ke',
    'danh', 'sach', 'va', 'hay', 'hoac', 'trong', 'duoc', 'ghi', 'cong', 'nhan',
    'cap', 'quoc', 'gia', 'loai', 'hinh', 'lien', 'quan', 'den', 'gan', 'voi'
]);

/**
 * Khoảng cách Levenshtein nhẹ cho fuzzy matching các cụm từ ngắn
 */
function levenshteinDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (Math.abs(a.length - b.length) > 3) return 99;

    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    const curr = new Array(b.length + 1);

    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + cost
            );
        }
        for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
}

/**
 * Nhận diện xã/phường trong câu hỏi, đặc biệt chú trọng:
 * - Ưu tiên khớp chính xác có dấu tiếng Việt (phân biệt "Văn Lang" và "Văn Lăng").
 * - Nếu người dùng gõ không dấu (ví dụ "xa Van Lang") trùng với cặp địa danh đồng âm khác dấu,
 *   giữ lại cả hai trong `ambiguousLocations` để yêu cầu làm rõ và trả kết quả của cả hai một cách tách biệt!
 */
export function detectLocationsInQuery(query) {
    const qDiacritic = normWithDiacritics(query);
    const qNorm = norm(query);

    const matchedCommunes = new Set();
    const ambiguousLocations = [];

    for (const commune of COMMUNE_LIST) {
        if (commune === 'Thái Nguyên') continue; // Tránh khớp tên tỉnh với mọi câu hỏi chung

        const cDiacritic = normWithDiacritics(commune);
        const cNorm = norm(commune);
        const ambiguousCandidates = AMBIGUOUS_COMMUNE_MAP.get(cNorm);

        // Kiểm tra khớp chính xác có dấu tiếng Việt
        const exactPattern = new RegExp(`(^|\\s)${cDiacritic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
        if (exactPattern.test(qDiacritic)) {
            matchedCommunes.add(commune);
            continue;
        }

        // Nếu không khớp có dấu nhưng khớp không dấu
        const normPattern = new RegExp(`(^|\\s)${cNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
        if (normPattern.test(qNorm)) {
            if (ambiguousCandidates && ambiguousCandidates.length > 1) {
                // Kiểm tra xem có ứng viên nào trong nhóm đã khớp có dấu chưa
                const anyExactMatched = ambiguousCandidates.some(cand => {
                    const candDiacritic = normWithDiacritics(cand);
                    const p = new RegExp(`(^|\\s)${candDiacritic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
                    return p.test(qDiacritic);
                });

                if (!anyExactMatched) {
                    // Người dùng viết không dấu (VD: "Van Lang") -> đánh dấu mơ hồ và lấy cả 2 để đối chiếu rõ
                    if (!ambiguousLocations.some(pair => pair[0] === ambiguousCandidates[0])) {
                        ambiguousLocations.push(ambiguousCandidates);
                    }
                    for (const cand of ambiguousCandidates) {
                        matchedCommunes.add(cand);
                    }
                }
            } else {
                matchedCommunes.add(commune);
            }
        }
    }

    return {
        matchedCommunes: Array.from(matchedCommunes),
        ambiguousLocations
    };
}

/**
 * Các cụm từ khóa đặc trưng của từng di sản giúp nhận diện cực nhạy
 */
const HERITAGE_CORE_PHRASES = [
    { ids: ['ds05'], phrases: ['mua tac xinh', 'tac xinh'] },
    { ids: ['ds02', 'ds04'], phrases: ['chu nom dao', 'chu nom cua nguoi dao', 'nom dao'] },
    { ids: ['ds03'], phrases: ['chu nom tay', 'chu nom cua nguoi tay', 'nom tay'] },
    { ids: ['ds06'], phrases: ['luon sluong', 'luon suong'] },
    { ids: ['ds07'], phrases: ['roi can', 'tham roc', 'ru nghe', 'roi que', 'ma cong bang'] },
    { ids: ['ds08', 'ds11'], phrases: ['mua khen', 'khen mong', 'nghe thuat khen', 'tang quay'] },
    { ids: ['ds09'], phrases: ['soong co', 'hat soong co', 'ly tam moi'] },
    { ids: ['ds10'], phrases: ['sang co', 'hat sang co', 'hat vi luu tam', 'luu tam'] },
    { ids: ['ds12', 'ds14'], phrases: ['luon coi', 'hat luon coi'] },
    { ids: ['ds13', 'ds15'], phrases: ['pa dung', 'pao dung', 'hat pa dung', 'hat pao dung'] },
    { ids: ['ds16', 'ds20'], phrases: ['hat sli', 'sli nung', 'phan slinh', 'phan sllinh', 'cho tinh xuan duong'] },
    { ids: ['ds17'], phrases: ['mua bat'] },
    { ids: ['ds18'], phrases: ['hat ru cua nguoi tay', 'hat ru tay', 'giao hieu'] },
    { ids: ['ds19'], phrases: ['hat vi cua nguoi tay', 'hat vi tay'] },
    { ids: ['ds01', 'ds24'], phrases: ['thuc hanh then', 'nghi le then', 'hat then', 'dan tinh'] },
    { ids: ['ds21', 'ds22', 'ds34'], phrases: ['cap sac cua nguoi dao', 'cap sac dao', 'le cap sac dao', 'dao tien'] },
    { ids: ['ds23', 'ds29', 'ds31'], phrases: ['cap sac cua nguoi tay', 'cap sac tao', 'cap sac put', 'lau put'] },
    { ids: ['ds25', 'ds28'], phrases: ['het khoan', 'hoat khoan', 'mung sinh nhat cua nguoi nung', 'mung tho'] },
    { ids: ['ds26'], phrases: ['cau nam moi', 'tiu siang thun', 'tiu sieng thun'] },
    { ids: ['ds27'], phrases: ['tet nhay', 'nhang cham dao'] },
    { ids: ['ds30'], phrases: ['cap sac cua nguoi nung', 'cap sac nung'] },
    { ids: ['ds32'], phrases: ['cap sac cua nguoi san diu', 'cap sac san diu'] },
    { ids: ['ds33'], phrases: ['le ky yen', 'ky yen'] },
    { ids: ['ds35', 'ds37'], phrases: ['long tong', 'le hoi long tong', 'long tong ba be'] },
    { ids: ['ds36'], phrases: ['den duom', 'le hoi den duom', 'duong tu minh'] },
    { ids: ['ds38'], phrases: ['cau mua cua nguoi san chay', 'le hoi cau mua san chay'] },
    { ids: ['ds39'], phrases: ['dinh phuong do', 'le hoi dinh phuong do', 'phuong do'] },
    { ids: ['ds40'], phrases: ['nui van', 'nui vo', 'luu nhan chu', 'hoi the lung nhai'] },
    { ids: ['ds41'], phrases: ['den luc giap', 'le hoi den luc giap', 'luc giap', 'mieu vat', 'do can'] },
    { ids: ['ds42'], phrases: ['cau mua cua nguoi dao lo gang', 'dao lo gang', 'dao lo giang'] },
    { ids: ['ds43'], phrases: ['nghe det thu cong', 'det tho cam', 'det thu cong truyen thong'] },
    { ids: ['ds44'], phrases: ['trang tri hoa van tren trang phuc cua nguoi dao do', 'hoa van dao do', 'trang phuc dao do'] },
    { ids: ['ds45'], phrases: ['che tan cuong', 'trong va che bien che tan cuong', 'tra tan cuong'] },
    { ids: ['ds46'], phrases: ['may theu trang phuc cua nguoi dao', 'may, theu trang phuc', 'nghe thuat may theu'] }
];

/**
 * Truy xuất thông minh các bản ghi di sản từ `heritage-data.js`
 */
export function retrieveHeritageData(query, context = {}) {
    const rawQuery = String(query || '').trim();
    const qDiacritic = normWithDiacritics(rawQuery);
    const qNorm = norm(rawQuery);

    const { matchedCommunes, ambiguousLocations } = detectLocationsInQuery(rawQuery);
    const queriedEthnics = detectQueriedEthnicGroups(rawQuery);
    const queriedCategories = detectQueriedCategory(rawQuery);
    const yearMatches = (rawQuery.match(/\b(19\d{2}|20[0-3]\d)\b/g) || []).map(Number);
    const decisionNumMatch = rawQuery.match(/\b(\d{2,5})(?:\/QĐ-BVHTTDL)?\b/i);
    const asksUnesco = /\bunesco\b/i.test(rawQuery);
    const asksAllCountOrOverview =
        /(46 di sản|tất cả di sản|toàn bộ di sản|có bao nhiêu di sản|tổng số di sản)/i.test(rawQuery) ||
        /\b(46 di san|tat ca di san|toan bo di san|co bao nhieu di san|tong so di san)\b/.test(qNorm);

    // Tách từ khóa ý nghĩa
    const queryTokens = qNorm
        .split(/\s+/)
        .filter(tok => tok.length >= 2 && !STOPWORDS_NORM.has(tok));

    // Nhận diện cụm đặc trưng
    const boostedIds = new Set();
    for (const item of HERITAGE_CORE_PHRASES) {
        for (const phrase of item.phrases) {
            if (qNorm.includes(phrase)) {
                item.ids.forEach(id => boostedIds.add(id));
            } else {
                // Kiểm tra fuzzy cho các cụm >= 3 từ (>= 10 ký tự) để tránh khớp nhầm cụm ngắn (VD: "lang co" ~ "sang co")
                const phraseWords = phrase.split(' ');
                if (phraseWords.length >= 3 && phrase.length >= 10 && qNorm.length >= phrase.length - 2) {
                    const qWords = qNorm.split(' ');
                    for (let i = 0; i <= qWords.length - phraseWords.length; i++) {
                        const windowStr = qWords.slice(i, i + phraseWords.length).join(' ');
                        if (levenshteinDistance(windowStr, phrase) <= 1) {
                            item.ids.forEach(id => boostedIds.add(id));
                        }
                    }
                }
            }
        }
    }

    // Nếu context truyền vào heritageId cụ thể
    const explicitHeritageId = context?.heritageId ? String(context.heritageId).trim().toLowerCase() : null;

    const scored = [];

    for (const rec of INDEXED_HERITAGE_RECORDS) {
        let score = 0;
        const matchReasons = [];

        // 1. Khớp trực tiếp ID từ context hoặc câu hỏi (ds01..ds46)
        const idPattern = new RegExp(`(^|\\s)${rec.id}(\\s|$)`, 'i');
        if (explicitHeritageId === rec.id.toLowerCase() || idPattern.test(rawQuery)) {
            score += 200;
            matchReasons.push(`Khớp mã ID di sản (${rec.id})`);
        }

        // 2. Khớp cụm đặc trưng của di sản
        if (boostedIds.has(rec.id)) {
            score += 95;
            matchReasons.push('Khớp tên gọi / thuật ngữ đặc trưng của di sản');
        }

        // 3. Khớp chính xác tên di sản (có dấu & không dấu)
        if (rec.nameDiacritic && qDiacritic.includes(rec.nameDiacritic)) {
            score += 120;
            matchReasons.push('Khớp chính xác tên di sản có dấu');
        } else if (rec.nameNorm && qNorm.includes(rec.nameNorm)) {
            score += 100;
            matchReasons.push('Khớp tên di sản');
        } else if (rec.nameEnNorm && qNorm.includes(rec.nameEnNorm)) {
            score += 90;
            matchReasons.push('Khớp tên tiếng Anh của di sản');
        }

        // 4. Khớp số hiệu quyết định
        if (rec.decisionNumber && rawQuery.toUpperCase().includes(rec.decisionNumber)) {
            score += 140;
            matchReasons.push(`Khớp số hiệu quyết định (${rec.decisionNumber})`);
        } else if (
            decisionNumMatch &&
            rec.decisionNumber &&
            rec.decisionNumber.startsWith(`${decisionNumMatch[1]}/`)
        ) {
            score += 110;
            matchReasons.push(`Khớp số quyết định (${rec.decisionNumber})`);
        }

        // 5. Khớp xã/phường hiện hành (`locations` / `appearIn`)
        if (matchedCommunes.length > 0) {
            const matchedInRec = matchedCommunes.filter(c => rec.allLocations.includes(c));
            if (matchedInRec.length > 0) {
                score += 75 * matchedInRec.length;
                matchReasons.push(`Thuộc địa bàn xã/phường: ${matchedInRec.join(', ')}`);
            } else if (score < 80) {
                score -= 40;
            }
        }

        // 6. Khớp dân tộc chủ thể (Đảm bảo KHÔNG gán nhầm dân tộc)
        if (queriedEthnics.length > 0) {
            let ethnicMatched = false;
            for (const qe of queriedEthnics) {
                if (rec.primaryEthnicGroups.includes(qe.canonical)) {
                    ethnicMatched = true;
                    score += 65;
                    matchReasons.push(`Cộng đồng chủ thể: dân tộc ${qe.canonical}`);
                    if (qe.subgroup && rec.ethnicSubgroups.includes(qe.subgroup)) {
                        score += 35;
                        matchReasons.push(`Nhóm địa phương: ${qe.subgroup}`);
                    }
                }
            }
            // Nếu câu hỏi chỉ hỏi thuần túy về di sản của một dân tộc nhưng bản ghi này thuộc dân tộc khác -> giảm điểm
            if (!ethnicMatched && score < 80) {
                score -= 50;
            }
        }

        // 7. Khớp cấp độ UNESCO
        if (asksUnesco) {
            if (rec.level === 'UNESCO') {
                score += 90;
                matchReasons.push('Di sản cấp UNESCO');
            }
        }

        // 8. Khớp loại hình di sản
        if (queriedCategories.length > 0 && queriedCategories.includes(rec.category)) {
            score += 55;
            matchReasons.push(`Loại hình: ${rec.category}`);
        }

        // 9. Khớp năm ghi danh
        if (yearMatches.length > 0 && rec.year && yearMatches.includes(rec.year)) {
            score += 55;
            matchReasons.push(`Năm ghi danh: ${rec.year}`);
        }

        // 10. Khớp từ khóa trên tên và mô tả (bao gồm cả địa danh lịch sử như Ngọc Phái, Bộc Bố, Yên Cư, Lương Thượng, Giáo Hiệu, Quang Phong, Đôn Phong, Nam Mẫu, Đắc Sơn...)
        if (queryTokens.length > 0) {
            let titleTokenHits = 0;
            let descTokenHits = 0;

            for (const tok of queryTokens) {
                const tokRegex = new RegExp(`(^|\\s)${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
                if (tokRegex.test(rec.nameNorm)) {
                    titleTokenHits++;
                } else if (tokRegex.test(rec.descriptionNorm)) {
                    descTokenHits++;
                }
            }

            if (titleTokenHits >= 2) {
                score += titleTokenHits * 18;
                matchReasons.push(`Khớp ${titleTokenHits} từ khóa trong tên di sản`);
            } else if (titleTokenHits === 1 && queryTokens.length <= 3) {
                score += 12;
            }

            if (descTokenHits >= 2) {
                score += Math.min(descTokenHits * 8, 36);
                matchReasons.push(`Khớp ${descTokenHits} từ khóa trong nội dung mô tả`);
            }
        }

        if (score >= 25) {
            scored.push({
                record: rec,
                score,
                matchReasons
            });
        }
    }

    // Sắp xếp giảm dần theo điểm số, nếu bằng điểm giữ nguyên thứ tự gốc
    scored.sort((a, b) => b.score - a.score || (a.record.raw.sourceOrder || 0) - (b.record.raw.sourceOrder || 0));

    // Lọc các bản ghi thực sự liên quan
    const topScore = scored.length > 0 ? scored[0].score : 0;
    let filtered = scored;

    if (topScore >= 95 && matchedCommunes.length === 0 && queriedEthnics.length <= 1 && !asksAllCountOrOverview) {
        // Khi người dùng hỏi đích danh 1 di sản cụ thể (ví dụ "Múa Tắc Xình là gì?"), chỉ giữ các bản ghi có điểm cao sát với di sản đó
        filtered = scored.filter(item => item.score >= Math.max(45, topScore * 0.45));
    } else if (topScore >= 50) {
        filtered = scored.filter(item => item.score >= 35);
    }

    const matchedRecords = filtered.map(item => ({
        ...item.record,
        score: item.score,
        matchReasons: item.matchReasons
    }));

    return {
        query: rawQuery,
        topScore,
        matchedRecords,
        matchedCommunes,
        ambiguousLocations,
        queriedEthnics,
        queriedCategories,
        asksUnesco,
        asksAllCountOrOverview,
        specificHeritageCount: matchedRecords.filter(r => r.score >= 85).length
    };
}

/**
 * Định dạng một bản ghi thành cấu trúc chuẩn của Context Engine (Mục V.4)
 */
function formatDetailedRecordContext(rec) {
    const lines = [
        `Tên di sản: ${rec.name}`,
        ...(rec.nameEn ? [`Tên tiếng Anh: ${rec.nameEn}`] : []),
        `Loại hình: ${rec.category}`,
        `Cấp độ ghi danh: ${rec.level}`,
        `Năm ghi danh: ${rec.year ?? 'Chưa rõ trong hồ sơ'}`,
        `Quyết định ghi danh: ${rec.decision || 'Chưa ghi'}`,
        `Cộng đồng chủ thể chính: ${rec.primaryEthnicGroups.length > 0 ? rec.primaryEthnicGroups.join(', ') : 'Cộng đồng địa phương'}${rec.ethnicSubgroups.length > 0 ? ` (Nhóm: ${rec.ethnicSubgroups.join(', ')})` : ''}`,
        `Địa bàn thực hành hiện hành: ${(rec.locations || []).join(', ') || 'Chưa ghi'}`,
        ...(rec.appearIn && rec.appearIn.length > 0
            ? [`Phạm vi các xã/phường xuất hiện: ${rec.appearIn.join(', ')}`]
            : []),
        ...(rec.historicalLocationNotes && rec.historicalLocationNotes.length > 0
            ? [`Ghi chú địa danh lịch sử / trước sắp xếp: ${rec.historicalLocationNotes.join(' | ')}`]
            : []),
        `Mô tả chi tiết:\n${rec.description}`,
        ...(rec.imageCaption ? [`Chú thích tư liệu: ${rec.imageCaption}`] : []),
        ...(rec.imageSources && rec.imageSources.length > 0
            ? [`Tư liệu hình ảnh/âm thanh tham khảo: ${rec.imageSources.join(' ; ')}`]
            : [])
    ];
    return lines.join('\n');
}

/**
 * Định dạng bản ghi tóm tắt (dùng khi câu hỏi yêu cầu liệt kê danh sách nhiều di sản)
 */
function formatSummaryRecordLine(rec, idx) {
    const ethnicStr = rec.primaryEthnicGroups.length > 0 ? rec.primaryEthnicGroups.join(', ') : 'Cộng đồng địa phương';
    const locStr = rec.allLocations.join(', ');
    return `${idx + 1}. ${rec.name} | Dân tộc: ${ethnicStr} | Loại hình: ${rec.category} | Cấp: ${rec.level} (${rec.year}) | Quyết định: ${rec.decision || 'N/A'} | Địa bàn: ${locStr}`;
}

/**
 * Xây dựng Context hoàn chỉnh gửi vào Gemini (Mục V.4)
 */
export function buildRagContextPrompt(userMessage, ragResult, intentInfo) {
    const sections = [];

    sections.push(`CÂU HỎI CỦA NGƯỜI DÙNG:\n${userMessage}`);

    // Cảnh báo nếu có địa danh đồng âm khác dấu (như Văn Lang vs Văn Lăng)
    if (ragResult.ambiguousLocations && ragResult.ambiguousLocations.length > 0) {
        const warningLines = ragResult.ambiguousLocations.map(pair => {
            const details = pair.map(communeName => {
                const recs = DI_SAN[communeName] || [];
                const names = recs.map(r => r.n).join('; ');
                return `- Xã/Phường "${communeName}": có ${recs.length} di sản (${names || 'không có'})`;
            }).join('\n');
            return `Phát hiện các địa danh khác dấu trong danh mục:\n${details}`;
        });
        sections.push(
            `CẢNH BÁO ĐỊA DANH ĐỒNG ÂM KHÁC DẤU (KHÔNG ĐƯỢC GỘP LÀM MỘT):\n${warningLines.join('\n\n')}`
        );
    }

    // Nếu hỏi tổng quan / thống kê hoặc hỏi UNESCO
    if (ragResult.asksAllCountOrOverview || intentInfo.intents.includes('heritage_list')) {
        sections.push(
            `THỐNG KÊ TỔNG QUAN HỒ SƠ DI SẢN THÁI NGUYÊN:\n` +
            `- Tổng số di sản hiện có: ${HERITAGE_DATA.length} di sản.\n` +
            `- Cấp UNESCO: ${UNESCO_RECORDS.length} di sản (${UNESCO_RECORDS[0]?.n}).\n` +
            `- Cấp Quốc gia: ${NATIONAL_RECORDS.length} di sản.\n` +
            `- 06 loại hình di sản: ${CATEGORY_ORDER.map(cat => `${cat} (${HERITAGE_DATA.filter(r => r.category === cat).length} di sản)`).join('; ')}.`
        );
    }

    if (ragResult.matchedRecords.length > 0) {
        const detailedLimit = REQUEST_LIMITS.MAX_RAG_RECORDS_DETAILED;
        const detailedRecords = ragResult.matchedRecords.slice(0, detailedLimit);
        const remainingRecords = ragResult.matchedRecords.slice(detailedLimit, REQUEST_LIMITS.MAX_RAG_RECORDS_SUMMARY);

        const detailedBlocks = detailedRecords.map(rec => formatDetailedRecordContext(rec));
        let contextText = `HỒ SƠ TƯ LIỆU DI SẢN THÁI NGUYÊN (khớp ${ragResult.matchedRecords.length} hồ sơ; lưu ý KHÔNG nhắc mã nội bộ hay tên file kỹ thuật khi viết câu trả lời):\n\n` +
            detailedBlocks.join('\n\n----------------------------------------\n\n');

        if (remainingRecords.length > 0) {
            const summaryLines = remainingRecords.map((rec, i) => formatSummaryRecordLine(rec, detailedLimit + i));
            contextText += `\n\nCÁC DI SẢN LIÊN QUAN KHÁC TRONG HỒ SƠ (Tóm tắt):\n${summaryLines.join('\n')}`;
        }

        // Giới hạn độ dài context để tối ưu token
        if (contextText.length > REQUEST_LIMITS.MAX_CONTEXT_CHARS) {
            contextText = contextText.slice(0, REQUEST_LIMITS.MAX_CONTEXT_CHARS) + '\n...[Đã rút gọn bớt mô tả để tối ưu ngữ cảnh]';
        }

        sections.push(contextText);
    } else if (ragResult.asksAllCountOrOverview) {
        const allLines = INDEXED_HERITAGE_RECORDS.map((rec, i) => formatSummaryRecordLine(rec, i));
        sections.push(`DANH SÁCH 46 DI SẢN TRONG HỒ SƠ THÁI NGUYÊN:\n${allLines.join('\n')}`);
    } else {
        sections.push(
            `HỒ SƠ TƯ LIỆU DI SẢN:\nChưa có hồ sơ khớp trực tiếp trong danh mục di sản hiện tại cho truy vấn này.`
        );
    }

    return sections.join('\n\n========================================\n\n');
}

/**
 * Tạo danh sách rút gọn `matchedHeritage` để trả về trong JSON response
 */
export function buildMatchedHeritageSummary(matchedRecords = [], maxItems = 15) {
    return matchedRecords.slice(0, maxItems).map(rec => ({
        id: rec.id,
        name: rec.name,
        nameEn: rec.nameEn || null,
        level: rec.level,
        year: rec.year,
        category: rec.category,
        decision: rec.decision || null,
        locations: rec.locations || [],
        appearIn: rec.appearIn || [],
        ethnicGroups: rec.primaryEthnicGroups || [],
        audioUrl: rec.audioUrl || null,
        score: rec.score
    }));
}
