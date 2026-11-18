/**
 * Bộ phân loại ý định câu hỏi (Intent Classifier) & Quyết định tra cứu Internet (Google Search Grounding)
 * Thực hiện Bước 2 và Bước 4 trong Pipeline xử lý câu hỏi (Mục VIII).
 */

import {
    norm,
    normWithDiacritics,
    ETHNIC_GROUPS_CATALOG,
    CATEGORY_ORDER
} from './heritage-data-adapter.js';

/**
 * Nhận diện các dân tộc được người dùng hỏi trong câu truy vấn
 */
export function detectQueriedEthnicGroups(query) {
    const qDiacritic = normWithDiacritics(query);
    const qNorm = norm(query);
    const matched = [];

    for (const group of ETHNIC_GROUPS_CATALOG) {
        let hit = false;
        let matchedSubgroup = null;

        // Ưu tiên khớp có dấu trước
        for (const alias of group.aliases) {
            const pattern = new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
            if (pattern.test(qDiacritic)) {
                hit = true;
                break;
            }
        }

        // Khớp không dấu (nhưng cẩn thận với từ "tay", "thai" dễ trùng từ thông thường)
        if (!hit) {
            for (const normAlias of group.normAliases) {
                if (normAlias === 'tay' || normAlias === 'thai') {
                    // Chỉ nhận không dấu khi có từ ghép "nguoi tay", "dan toc tay", "dong bao tay"
                    continue;
                }
                const pattern = new RegExp(`(^|\\s)${normAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
                if (pattern.test(qNorm)) {
                    hit = true;
                    break;
                }
            }
        }

        if (hit) {
            if (group.id === 'dao') {
                if (/dao\s*đỏ|dao\s*do/i.test(qDiacritic) || /\bdao do\b/.test(qNorm)) matchedSubgroup = 'Dao Đỏ';
                else if (/dao\s*tiền|dao\s*tiên|dao\s*tien/i.test(qDiacritic)) matchedSubgroup = 'Dao Tiền';
                else if (/lô\s*gang|lô\s*giang|lo\s*gang|lo\s*giang/i.test(qDiacritic)) matchedSubgroup = 'Dao Lô Gang';
                else if (/quần\s*chẹt|quan\s*chet/i.test(qDiacritic)) matchedSubgroup = 'Dao Quần Chẹt';
            } else if (group.id === 'nung') {
                if (/phàn\s*slình|phàn\s*sllình|phan\s*slinh/i.test(qDiacritic)) matchedSubgroup = 'Nùng Phàn Slình';
            }

            matched.push({
                id: group.id,
                canonical: group.canonical,
                subgroup: matchedSubgroup
            });
        }
    }

    return matched;
}

/**
 * Nhận diện loại hình di sản được hỏi
 */
export function detectQueriedCategory(query) {
    const qNorm = norm(query);
    const categoryKeywords = [
        { category: 'Tiếng nói, chữ viết', patterns: ['tieng noi', 'chu viet', 'chu nom', 'ngon ngu', 'van tu'] },
        { category: 'Nghệ thuật trình diễn dân gian', patterns: ['nghe thuat trinh dien', 'trinh dien dan gian', 'dan ca', 'dan vu', 'dieu mua', 'lan dieu'] },
        { category: 'Tập quán xã hội và tín ngưỡng', patterns: ['tap quan xa hoi', 'tin nguong', 'nghi le cap sac', 'tap quan'] },
        { category: 'Lễ hội truyền thống', patterns: ['le hoi truyen thong', 'cac le hoi', 'nhung le hoi'] },
        { category: 'Làng nghề thủ công truyền thống', patterns: ['lang nghe', 'nghe thu cong', 'det thu cong', 'det tho cam'] },
        { category: 'Tri thức dân gian', patterns: ['tri thuc dan gian', 'tri thuc trong', 'trang tri hoa van', 'may theu trang phuc'] }
    ];

    const matched = [];
    for (const item of categoryKeywords) {
        if (item.patterns.some(p => qNorm.includes(p))) {
            matched.push(item.category);
        }
    }
    return matched;
}

/**
 * Phân loại ý định của người dùng (12 nhóm ý định + cờ an toàn)
 */
export function classifyQuestionIntent(message, ragResult = null) {
    const qDiacritic = normWithDiacritics(message);
    const qNorm = norm(message);
    const intents = new Set();

    // 1. Kiểm tra yêu cầu bịa đặt thông tin (Nhóm E1)
    const isFabricationRequest =
        /(bịa|tự tạo|tự nghĩ|chế ra|sáng tác|giả lập|hư cấu)\s+(ra\s+)?(số hiệu|quyết định|văn bản|nguồn|url|đường dẫn|di sản|năm công nhận)/i.test(message) ||
        /\b(bia|tu tao|che ra)\b.*\b(quyet dinh|so hieu|nguon|url)\b/.test(qNorm);

    if (isFabricationRequest) {
        intents.add('fabrication_request');
    }

    // 2. Kiểm tra nhận định sai / mâu thuẫn từ người dùng (Nhóm E2, E3)
    const claimsUnescoForNonUnesco =
        /\bunesco\b/i.test(message) &&
        ragResult?.matchedRecords?.length > 0 &&
        ragResult.matchedRecords.some(r => r.level !== 'UNESCO') &&
        !/(những|các|danh sách|có bao nhiêu|nào)\s+di sản.*unesco/i.test(message);

    const asksAboutConflictOrVerification =
        /(có chính xác không|có đúng không|mâu thuẫn|khác nhau|tại sao.*khác|xác minh|kiểm chứng|thật không|phải không|văn bản chính thức xác nhận)/i.test(message) ||
        /\b(co chinh xac khong|co dung khong|xac minh|kiem chung|mau thuan)\b/.test(qNorm);

    if (claimsUnescoForNonUnesco || asksAboutConflictOrVerification) {
        intents.add('user_misconception_or_conflict');
    }

    // 3. Tra cứu pháp lý / quyết định ghi danh / năm / cấp độ (Nhóm C)
    if (
        /(quyết định|số hiệu|ghi danh|công nhận|cấp quốc gia|cấp độ|unesco|bộ văn hóa|bvhttdl|cơ quan.*ban hành|văn bản|hồ sơ pháp lý|năm nào)/i.test(message) ||
        /\b(quyet dinh|so hieu|ghi danh|cong nhan|cap do|unesco|bvhttdl|nam nao)\b/.test(qNorm)
    ) {
        intents.add('legal_decision');
    }

    // 4. Hỏi theo năm ghi danh
    const yearMatches = message.match(/\b(19\d{2}|20[0-3]\d)\b/g);
    if (yearMatches || /\b(năm nào|vào năm|năm ghi danh|năm công nhận)\b/i.test(message)) {
        intents.add('by_year');
    }

    // 5. Hỏi theo dân tộc (Nhóm B)
    const ethnicGroups = detectQueriedEthnicGroups(message);
    if (ethnicGroups.length > 0 && /(những|các|danh sách|di sản nào|loại hình nào|gắn với|liên quan đến|của người|của dân tộc)/i.test(message)) {
        intents.add('by_ethnic_group');
    } else if (ethnicGroups.length > 0) {
        intents.add('by_ethnic_group');
    }

    // 6. Hỏi theo xã/phường/địa danh
    if (
        /(xã|phường|thị trấn|huyện|thành phố|ở đâu|địa bàn|địa phương|địa danh|sáp nhập|hành chính)/i.test(message) ||
        (ragResult?.matchedCommunes && ragResult.matchedCommunes.length > 0) ||
        (ragResult?.ambiguousLocations && ragResult.ambiguousLocations.length > 0)
    ) {
        intents.add('by_location');
    }

    // 7. Hỏi theo loại hình
    const categories = detectQueriedCategory(message);
    if (categories.length > 0 || /(loại hình|nhóm di sản|phân loại)/i.test(message)) {
        intents.add('by_category');
    }

    // 8. Hỏi danh sách di sản
    if (/(những di sản|các di sản|danh sách|liệt kê|có bao nhiêu di sản|tổng hợp|gồm những gì)/i.test(message)) {
        intents.add('heritage_list');
    }

    // 9. Hỏi lịch sử và nguồn gốc
    if (/(lịch sử|nguồn gốc|ra đời|hình thành|truyền thuyết|sự tích|từ bao giờ|ông tổ)/i.test(message)) {
        intents.add('history_origin');
    }

    // 10. Hỏi nghi lễ, phong tục, cách thực hành
    if (/(nghi lễ|nghi thức|phong tục|trình tự|cách thực hành|động tác|lễ vật|thầy cúng|thầy tào|thầy pụt|thầy then|cách hát|quy trình|chế biến|kỹ thuật)/i.test(message)) {
        intents.add('ritual_custom');
    }

    // 11. Hỏi tình trạng bảo tồn, sự kiện mới, hiện nay
    if (/(bảo tồn|phát huy|hiện nay|gần đây|mới nhất|năm nay|2025|2026|truyền dạy|nghệ nhân ưu tú|nghệ nhân nhân dân|câu lạc bộ|mai một|thực trạng)/i.test(message)) {
        intents.add('conservation_status');
    }

    // 12. Hỏi so sánh nhiều di sản
    if (/(so sánh|khác nhau|giống nhau|phân biệt|điểm khác)/i.test(message) || (ragResult?.specificHeritageCount >= 2)) {
        intents.add('comparison');
    }

    // 13. Hỏi về một di sản cụ thể
    if (ragResult?.matchedRecords?.length > 0 && ragResult.topScore >= 40) {
        intents.add('specific_heritage');
    }

    // 14. Nếu không khớp di sản nào và không hỏi về văn hóa/lịch sử/Thái Nguyên -> out_of_scope
    const isCulturalOrLocalTopic =
        /(di sản|văn hóa|thái nguyên|bắc kạn|việt bắc|lễ hội|dân tộc|tày|nùng|dao|sán chay|sán dìu|mông|then|sli|lượn|soọng cô|sấng cọ|tắc xình|pả dung|páo dung|cấp sắc|tết nhảy|rối cạn|khèn|chè tân cương|đền đuổm|phương độ|lục giáp|núi văn|núi võ|ba bể|dương tự minh|lưu nhân chú)/i.test(message) ||
        /\b(di san|van hoa|thai nguyen|bac kan|le hoi|dan toc)\b/.test(qNorm);

    if (intents.size === 0 && (!ragResult || ragResult.matchedRecords.length === 0) && !isCulturalOrLocalTopic) {
        intents.add('out_of_scope');
    } else if (intents.size === 0) {
        intents.add('specific_heritage');
    }

    const intentList = Array.from(intents);
    const primaryIntent =
        intentList.find(i => i === 'fabrication_request') ||
        intentList.find(i => i === 'user_misconception_or_conflict') ||
        intentList.find(i => i === 'legal_decision') ||
        intentList.find(i => i === 'comparison') ||
        intentList.find(i => i === 'by_location') ||
        intentList.find(i => i === 'by_ethnic_group') ||
        intentList.find(i => i === 'by_category') ||
        intentList.find(i => i === 'heritage_list') ||
        intentList.find(i => i === 'conservation_status') ||
        intentList.find(i => i === 'specific_heritage') ||
        intentList[0] ||
        'general_heritage';

    return {
        primaryIntent,
        intents: intentList,
        ethnicGroups,
        categories,
        years: yearMatches ? yearMatches.map(Number) : [],
        isFabricationRequest,
        claimsUnescoForNonUnesco,
        asksAboutConflictOrVerification,
        isCulturalOrLocalTopic
    };
}

/**
 * Quyết định có cần bật công cụ Google Search Grounding hay không (Mục IV.3 & VIII.4)
 *
 * Bật Google Search khi:
 * - Hỏi xác minh pháp lý, số hiệu quyết định, văn bản chính thức, cơ quan ban hành.
 * - Có dấu hiệu thông tin mâu thuẫn hoặc người dùng hiểu nhầm (UNESCO vs Quốc gia).
 * - Hỏi địa danh hành chính hiện hành / sau sáp nhập chưa rõ trong dữ liệu nội bộ.
 * - Hỏi thực trạng bảo tồn hiện nay, hoạt động lễ hội/sự kiện mới, nghệ nhân cụ thể ngoài dữ liệu.
 * - Hỏi lịch sử/nguồn gốc chuyên sâu hoặc câu hỏi mà dữ liệu nội bộ không khớp mạnh.
 * - Không cần gọi Google Search nếu người dùng chỉ yêu cầu bịa đặt (từ chối ngay) hoặc câu hỏi giải thích cơ bản đã có đầy đủ 100% trong bản ghi nội bộ.
 */
export function shouldUseGoogleSearch(arg1, arg2, arg3) {
    let message = '';
    let intentInfo = {};
    let ragResult = null;

    if (typeof arg1 === 'string') {
        message = arg1;
        intentInfo = arg2 || {};
        ragResult = arg3 || null;
    } else {
        intentInfo = arg1 || {};
        ragResult = arg2 || null;
        message = ragResult?.query || '';
    }
    if (intentInfo.isFabricationRequest) {
        return {
            useSearch: false,
            reason: 'Yêu cầu bịa đặt thông tin bị từ chối theo quy tắc chống hallucination; không cần gọi Google Search.'
        };
    }

    if (intentInfo.asksAboutConflictOrVerification || intentInfo.claimsUnescoForNonUnesco) {
        return {
            useSearch: true,
            reason: 'Câu hỏi yêu cầu xác minh thông tin hoặc đối chiếu mâu thuẫn từ nguồn chính thống.'
        };
    }

    if (intentInfo.intents.includes('legal_decision')) {
        return {
            useSearch: true,
            reason: 'Câu hỏi liên quan đến quyết định ghi danh, số hiệu văn bản pháp lý hoặc cấp độ công nhận.'
        };
    }

    if (intentInfo.intents.includes('conservation_status')) {
        return {
            useSearch: true,
            reason: 'Câu hỏi yêu cầu thông tin cập nhật về công tác bảo tồn, sự kiện hoặc hoạt động hiện nay.'
        };
    }

    // Nếu không tìm thấy bản ghi nội bộ đủ mạnh -> cần tra cứu Internet
    if (!ragResult || ragResult.matchedRecords.length === 0 || ragResult.topScore < 35) {
        return {
            useSearch: true,
            reason: 'Dữ liệu nội bộ chưa có bản ghi khớp trực tiếp hoặc cần mở rộng tra cứu bên ngoài.'
        };
    }

    // Nếu hỏi về sáp nhập hành chính hoặc địa danh chưa có trong danh mục nội bộ
    if (
        /(sáp nhập|nghị quyết|địa giới hành chính hiện nay|ủy ban thường vụ quốc hội)/i.test(message)
    ) {
        return {
            useSearch: true,
            reason: 'Câu hỏi yêu cầu xác minh văn bản sắp xếp đơn vị hành chính.'
        };
    }

    // Nếu hỏi về lịch sử/nguồn gốc chuyên sâu hoặc sự kiện/diễn biến cập nhật mới -> bật Google Search
    const needsHistoryOrCurrentInfo =
        intentInfo.intents.includes('history_origin') ||
        /(lịch sử|nguồn gốc|xuất xứ|ra đời khi nào|sự kiện mới|lễ hội năm nay|hiện nay|gần đây|mới nhất|\b202[4-9]\b)/i.test(
            message
        );
    if (needsHistoryOrCurrentInfo) {
        return {
            useSearch: true,
            reason: 'Câu hỏi yêu cầu thông tin lịch sử chuyên sâu, nguồn gốc hoặc diễn biến cập nhật ngoài dữ liệu mô tả cơ bản.'
        };
    }

    // Không cần gọi Google Search cho câu hỏi giải thích/tra cứu đơn giản đã khớp mạnh trong heritage-data.js (Mục IV.3)
    const strongInternalIntents = new Set([
        'specific_heritage',
        'by_ethnic_group',
        'by_category',
        'heritage_list',
        'by_location',
        'comparison'
    ]);
    if (
        ragResult &&
        ragResult.matchedRecords.length > 0 &&
        ragResult.topScore >= 80 &&
        strongInternalIntents.has(intentInfo.primaryIntent)
    ) {
        return {
            useSearch: false,
            reason: 'Dữ liệu nội bộ (heritage-data.js) đã khớp trực tiếp với độ tin cậy cao cho câu hỏi tra cứu/giải thích cơ bản.'
        };
    }

    // Mặc định: bật Google Search cho các câu hỏi nghiên cứu còn lại hoặc độ khớp nội bộ trung bình
    return {
        useSearch: true,
        reason: 'Kết hợp dữ liệu nội bộ (heritage-data.js) và Google Search Grounding để đảm bảo độ chính xác và nguồn dẫn chứng.'
    };
}
