/**
 * MODULE KIỂM TRA ĐẦU RA & ĐÁNH GIÁ ĐỘ TIN CẬY (FACT VERIFICATION - Mục VIII.7 & X.4)
 *
 * Kiểm tra:
 * 1. Có bịa nguồn (URL không nằm trong kết quả Grounding hoặc danh mục chính thức) không?
 * 2. Có bịa số hiệu quyết định không?
 * 3. Có biến `sourceDoc` nội bộ thành URL giả không?
 * 4. Đánh giá `confidence` ('high' | 'medium' | 'low') dựa trên bằng chứng thực tế.
 * 5. Định dạng chuỗi `reply` tương thích 100% với giao diện AI Chat hiện tại (`script.js`).
 */

import { INDEXED_HERITAGE_RECORDS } from './heritage-data-adapter.js';
import { PRIORITY_OFFICIAL_DOMAINS, OFFICIAL_PRESS_DOMAINS, RESEARCH_DOMAINS } from './config.js';

// Tập hợp toàn bộ số hiệu quyết định có thật trong `heritage-data.js`
const KNOWN_DECISION_NUMBERS = new Set(
    INDEXED_HERITAGE_RECORDS
        .map(r => r.decisionNumber)
        .filter(Boolean)
        .map(s => s.toUpperCase())
);

// Tập hợp các tên miền gốc được phép giữ lại nếu là trang chủ chính thức trong System Prompt
const ALLOWED_ROOT_OFFICIAL_URLS = new Set([
    'https://dsvh.gov.vn',
    'https://dsvh.gov.vn/',
    'https://bvhttdl.gov.vn',
    'https://bvhttdl.gov.vn/',
    'https://chinhphu.vn',
    'https://chinhphu.vn/',
    'https://vbpl.vn',
    'https://vbpl.vn/',
    'https://ich.unesco.org',
    'https://ich.unesco.org/',
    'https://thainguyen.gov.vn',
    'https://thainguyen.gov.vn/'
]);

/**
 * Kiểm tra và làm sạch câu trả lời của mô hình để loại bỏ URL bịa đặt hoặc số hiệu quyết định không có căn cứ
 */
export function verifyAndSanitizeModelAnswer(rawAnswer, {
    webSources = [],
    matchedRecords = [],
    intentInfo = {},
    searchPerformed = false
} = {}) {
    let cleanedAnswer = String(rawAnswer || '').trim();
    const warnings = [];

    // 1. Tập hợp các URL hợp lệ được trả về thực tế từ Google Search Grounding hoặc trong imageSources nội bộ
    const verifiedUrls = new Set(webSources.map(s => s.url));
    for (const rec of matchedRecords) {
        for (const imgSrc of rec.imageSources || []) {
            const urlMatches = String(imgSrc).match(/https?:\/\/[^\s)]+/gi) || [];
            urlMatches.forEach(u => verifiedUrls.add(u.replace(/[.,;]+$/, '')));
        }
    }

    // 2. Kiểm tra mọi URL xuất hiện trong văn bản trả lời của Gemini
    // Nếu Gemini tự sáng tác một đường dẫn sâu (deep link) không có trong kết quả Grounding -> gỡ link giả để chống hallucination!
    cleanedAnswer = cleanedAnswer.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (fullMatch, label, url) => {
            const cleanUrl = url.replace(/[.,;]+$/, '');
            if (verifiedUrls.has(cleanUrl) || ALLOWED_ROOT_OFFICIAL_URLS.has(cleanUrl)) {
                return fullMatch;
            }
            warnings.push(`Đã lược bỏ đường dẫn chưa được xác minh trực tiếp từ kết quả Grounding: ${cleanUrl}`);
            return `${label}`;
        }
    );

    // Kiểm tra các bare URL đứng độc lập trong câu trả lời
    cleanedAnswer = cleanedAnswer.replace(
        /(?<!\()https?:\/\/[^\s)<>\]]+/g,
        (url) => {
            const cleanUrl = url.replace(/[.,;]+$/, '');
            if (verifiedUrls.has(cleanUrl) || ALLOWED_ROOT_OFFICIAL_URLS.has(cleanUrl)) {
                return url;
            }
            warnings.push(`Đã lược bỏ URL trần chưa xác minh: ${cleanUrl}`);
            return '[Đường dẫn chưa xác minh đã được ẩn]';
        }
    );

    // 3. Kiểm tra các số hiệu quyết định dạng XXXX/QĐ-BVHTTDL xuất hiện trong câu trả lời
    const mentionedDecisions = cleanedAnswer.match(/\b\d+\/QĐ-[A-ZĐ]+\b/gi) || [];
    const unverifiedDecisions = [];
    for (const dec of mentionedDecisions) {
        const upperDec = dec.toUpperCase();
        if (!KNOWN_DECISION_NUMBERS.has(upperDec) && webSources.length === 0) {
            unverifiedDecisions.push(upperDec);
        }
    }

    if (unverifiedDecisions.length > 0) {
        warnings.push(
            `Số hiệu quyết định (${[...new Set(unverifiedDecisions)].join(', ')}) không nằm trong dữ liệu nội bộ và chưa có nguồn Grounding đi kèm.`
        );
    }

    // 4. Gọt dũa câu chữ, chuẩn hóa hiển thị cho khung chat và loại bỏ hoàn toàn mã hồ sơ / tên file nội bộ
    cleanedAnswer = polishAnswerForUser(cleanedAnswer, { intentInfo });

    // 5. Đánh giá độ tin cậy (`confidence` & `confidenceReason`) dựa trên bằng chứng thực tế
    const { confidence, confidenceReason } = evaluateConfidence({
        cleanedAnswer,
        webSources,
        matchedRecords,
        intentInfo,
        searchPerformed,
        warnings,
        unverifiedDecisions
    });

    return {
        verifiedAnswer: cleanedAnswer,
        confidence,
        confidenceReason,
        verificationWarnings: warnings
    };
}

/**
 * Quy tắc xác định `confidence` ('high' | 'medium' | 'low') dựa trên nguồn thực tế (Mục X.4)
 */
function evaluateConfidence({
    cleanedAnswer,
    webSources,
    matchedRecords,
    intentInfo,
    searchPerformed,
    warnings,
    unverifiedDecisions
}) {
    const hasInternalMatch = matchedRecords.length > 0;
    const hasStrongInternalMatch = matchedRecords.some(r => r.score >= 60);
    const officialWebSources = webSources.filter(s => s.type === 'official');
    const researchOrPressSources = webSources.filter(s => s.type === 'research' || s.type === 'press');
    const admitsInsufficientEvidence =
        /chưa tìm thấy nguồn chính thức đủ để xác nhận|chưa đủ căn cứ|chưa thể xác minh/i.test(cleanedAnswer);

    // Nếu là yêu cầu bịa đặt hoặc câu trả lời thừa nhận chưa đủ bằng chứng hoặc có quyết định chưa xác minh
    if (intentInfo.isFabricationRequest) {
        return {
            confidence: 'low',
            confidenceReason: 'Yêu cầu chứa nội dung đề nghị tạo thông tin không có thật; hệ thống từ chối theo quy tắc chống bịa đặt.'
        };
    }

    if (unverifiedDecisions.length > 0) {
        return {
            confidence: 'low',
            confidenceReason: 'Câu trả lời có chứa số hiệu văn bản chưa được đối chiếu trong cơ sở dữ liệu nội bộ hoặc kết quả tìm kiếm.'
        };
    }

    if (!hasInternalMatch && webSources.length === 0) {
        return {
            confidence: 'low',
            confidenceReason: 'Không tìm thấy bản ghi khớp trong dữ liệu nội bộ (heritage-data.js) và không có nguồn xác minh từ Google Search Grounding.'
        };
    }

    if (admitsInsufficientEvidence && !hasStrongInternalMatch && officialWebSources.length === 0) {
        return {
            confidence: 'low',
            confidenceReason: 'Chưa tìm thấy nguồn chính thức đủ thẩm quyền để xác nhận toàn bộ thông tin được hỏi.'
        };
    }

    // Nếu có địa danh đồng âm khác dấu (như Văn Lang vs Văn Lăng) mà người dùng gõ không dấu
    if (intentInfo.ambiguousLocations && intentInfo.ambiguousLocations.length > 0) {
        return {
            confidence: 'medium',
            confidenceReason: 'Truy vấn chứa tên địa danh không dấu trùng với nhiều xã/phường khác nhau (ví dụ: Văn Lang và Văn Lăng); cần người dùng xác nhận địa danh cụ thể.'
        };
    }

    // High confidence:
    // - Khớp mạnh với dữ liệu nội bộ VÀ (có nguồn chính thức/báo chí từ Grounding HOẶC câu hỏi tra cứu trực tiếp dữ liệu nội bộ đã có đầy đủ quyết định, mô tả).
    if (hasStrongInternalMatch && officialWebSources.length > 0) {
        return {
            confidence: 'high',
            confidenceReason: `Đã đối chiếu khớp dữ liệu di sản nội bộ (${matchedRecords[0].id}) và xác minh thêm từ ${officialWebSources.length} nguồn cơ quan chính thức.`
        };
    }

    if (hasStrongInternalMatch && !intentInfo.asksAboutConflictOrVerification) {
        return {
            confidence: 'high',
            confidenceReason: `Thông tin được trích xuất trực tiếp từ hồ sơ dữ liệu di sản nội bộ của dự án (${matchedRecords.slice(0, 3).map(r => r.id).join(', ')})${webSources.length > 0 ? ` kết hợp ${webSources.length} nguồn tra cứu trực tuyến` : ''}.`
        };
    }

    if (officialWebSources.length > 0) {
        return {
            confidence: 'high',
            confidenceReason: `Được xác minh từ ${officialWebSources.length} nguồn thông tin chính thống qua Google Search Grounding.`
        };
    }

    if (hasInternalMatch || researchOrPressSources.length > 0 || webSources.length > 0) {
        return {
            confidence: 'medium',
            confidenceReason: 'Thông tin được tổng hợp từ dữ liệu tham khảo nội bộ hoặc báo chí/tư liệu thứ cấp; một số chi tiết chuyên sâu cần đối chiếu thêm văn bản gốc.'
        };
    }

    return {
        confidence: 'low',
        confidenceReason: 'Chưa đủ nguồn dữ liệu nội bộ hoặc tài liệu chính thức để khẳng định ở mức độ tin cậy cao.'
    };
}

/**
 * Gọt dũa câu chữ khéo léo, chuẩn hóa định dạng hiển thị đẹp cho khung chat (`script.js`)
 * và gỡ bỏ hoàn toàn mã định danh nội bộ (`ds01`..`ds46`), tên file kỹ thuật (`heritage-data.js`, `.docx`).
 */
export function polishAnswerForUser(rawText = '', { intentInfo = {} } = {}) {
    let text = String(rawText || '').trim();
    if (!text) return '';

    // 1. Chuyển tiêu đề Markdown (#, ##, ###) sang chữ in đậm để hiển thị gọn trên khung chat
    text = text.replace(/^#{1,6}\s+(.+)$/gm, (_, heading) => `**${heading.replace(/\*+/g, '').trim()}**`);

    // 2. Bỏ đường kẻ ngang Markdown thô (---, ***, ___) và dấu backtick (`...`)
    text = text.replace(/^\s*[-*_]{3,}\s*$/gm, '');
    text = text.replace(/`([^`\n]+)`/g, '$1');

    // 3. Làm mượt đường dẫn chưa xác minh nếu có bị lược bỏ ở bước trên
    text = text.replace(/\[Đường dẫn chưa xác minh đã được ẩn\]/g, '(liên kết tham khảo chưa được công bố công khai)');

    // 4. Loại bỏ hoàn toàn mã hồ sơ nội bộ (ds01..ds46) và tên file tài liệu nội bộ (.docx, heritage-data.js)
    text = text.replace(
        /\(\s*(?:mã\s*(?:hồ\s*sơ|bản\s*ghi)|bản\s*ghi(?:\s*ID)?|ID(?:\s*hồ\s*sơ)?|hồ\s*sơ(?:\s*ID)?)\s*[:=]?\s*ds\d{1,3}[^)]*\)/gi,
        ''
    );
    text = text.replace(/\(\s*ds\d{1,3}\s*(?:[,;–-]\s*[^)]*)?\)/gi, '');
    text = text.replace(/\[\s*ds\d{1,3}(?:\s*,\s*ds\d{1,3})*\s*\]/gi, '');
    text = text.replace(/\b(?:mã\s*(?:hồ\s*sơ|bản\s*ghi)|bản\s*ghi(?:\s*ID)?|ID)\s*[:=]?\s*ds\d{1,3}\b/gi, '');
    text = text.replace(/\(\s*(?:tài\s*liệu|nguồn|trích\s*từ|xem)?[^)]*(?:\.docx|\.xlsx|\.js|heritage-data|tr\.\s*\d+)[^)]*\)/gi, '');

    // Gỡ dòng chú thích cuối tự sinh kiểu "*Nguồn tham khảo: Cơ sở dữ liệu... .docx*"
    text = text.replace(
        /^\s*\*?\s*(?:Nguồn|Tài liệu)\s*(?:tham khảo|trích dẫn|đối chiếu)\s*:\s*.*(?:Cơ sở dữ liệu|heritage-data|ds\d{1,3}|\.docx).*$/gim,
        ''
    );

    // Thay thế khéo léo các cụm nhắc trực tiếp tên file / thuật ngữ kỹ thuật nội bộ trong văn xuôi
    text = text
        .replace(/trong\s+(?:tệp|file)\s+heritage-data\.js/gi, 'trong hồ sơ di sản tỉnh Thái Nguyên')
        .replace(/\bheritage-data\.js\b/gi, 'hồ sơ di sản tỉnh Thái Nguyên')
        .replace(/[^\s,;()]*\.docx\b(?:\s*[—–-]\s*tr\.\s*\d+(?:\s*,\s*mục\s*\d+)?)?/gi, 'tư liệu kiểm kê di sản địa phương');

    // 5. Gọt dũa các câu mở đầu máy móc / thô cứng
    text = text.replace(
        /^(?:Chào bạn,\s*)?(?:Dựa trên|Theo)\s+(?:hồ sơ\s+)?cơ sở dữ liệu\s+(?:di sản\s+)?nội bộ(?:\s+của dự án)?(?:\s*\([^)]*\))?[,:\s]*(?:xin gửi đến bạn(?:\s+các)?\s+thông tin(?:\s+chi tiết(?:,\s*chính xác)?\s+về)?|thông tin chi tiết về)?[,:\s]*/i,
        ''
    );
    text = text.replace(/,?\s*được giới thiệu chi tiết như sau\s*:/i, ' là di sản văn hóa đặc sắc với những thông tin tiêu biểu sau:');

    // Gọt dũa mở đầu nhẹ nhàng hơn nếu là lời đính chính hoặc từ chối thô cứng
    if (intentInfo?.isFabricationRequest) {
        text = text
            .replace(/^Tôi không thể thực hiện yêu cầu tự bịa đặt[^.\n]*\./i,
                'Rất tiếc, tôi xin phép không tạo thông tin hay số hiệu quyết định giả định vì mọi tư liệu di sản cần dựa trên căn cứ xác thực.')
            .replace(/Việc bịa đặt dữ liệu vi phạm nguyên tắc khoa học[^.\n]*\./gi,
                'Sự chính xác giúp bảo toàn giá trị lịch sử và pháp lý của di sản văn hóa.');
    }

    // 6. Chuẩn hóa dấu câu và khoảng trắng thừa sau khi lọc cụm ngoặc
    text = text
        .replace(/[ \t]+\n/g, '\n')
        .replace(/([^\n ])[ \t]{2,}/g, '$1 ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .replace(/\(\s*\)/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (/^[a-zàáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/.test(text)) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
    }

    return text;
}

/**
 * Xây dựng chuỗi `reply` hiển thị trên khung chat hiện tại của Frontend (`script.js`).
 * - Chỉ gắn mục nguồn tham khảo khi có đường dẫn web thực tế được xác minh từ Grounding.
 * - Không ghi mã nội bộ (`[ds05]`) hay tên file nội bộ vào câu trả lời của người dùng.
 */
export function formatReplyForFrontendChat(verifiedAnswer, sources = [], options = {}) {
    if (!verifiedAnswer) return '';

    const { intentInfo = {}, confidence = 'high' } = options;
    if (intentInfo.isFabricationRequest || (confidence === 'low' && sources.every(s => !s.url))) {
        return verifiedAnswer;
    }

    const webSources = sources.filter(s => s.url && /^https?:\/\//i.test(s.url));
    const alreadyHasMarkdownLinks = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.test(verifiedAnswer);

    if (webSources.length > 0 && !alreadyHasMarkdownLinks) {
        const footerLines = webSources.slice(0, 4).map((ws) => {
            const label = ws.type === 'official'
                ? 'Nguồn chính thức'
                : (ws.type === 'research' ? 'Tư liệu nghiên cứu' : 'Tham khảo');
            return `- ${label}: [${ws.title || ws.publisher || ws.url}](${ws.url})`;
        });
        return `${verifiedAnswer}\n\n**Nguồn tham khảo:**\n${footerLines.join('\n')}`;
    }

    return verifiedAnswer;
}
