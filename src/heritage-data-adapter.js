/**
 * Adapter đọc trực tiếp dữ liệu từ `../heritage-data.js` (Single Source of Truth)
 * Không sao chép hay tạo danh sách 46 di sản thứ hai.
 * Tự động trích xuất thêm metadata phục vụ tìm kiếm thông minh (dân tộc, địa danh lịch sử, quyết định).
 */

import '../heritage-data.js';

const rawHeritageDataObj = globalThis.HeritageData;

if (!rawHeritageDataObj || !Array.isArray(rawHeritageDataObj.HERITAGE_DATA)) {
    throw new Error('Không thể nạp dữ liệu từ heritage-data.js (globalThis.HeritageData trống).');
}

export const {
    HERITAGE_DATA,
    COMMUNE_LIST,
    CATEGORY_ORDER,
    AUDIO_CATALOG,
    norm,
    slug,
    esc,
    findCommuneKey,
    DI_SAN,
    UNASSIGNED_LOCATIONS,
    LEVEL_UNESCO,
    LEVEL_NATIONAL,
    UNESCO_RECORDS,
    NATIONAL_RECORDS,
    CATEGORY_MAP,
    getAudioUrlFor
} = rawHeritageDataObj;

/**
 * Danh mục chuẩn các dân tộc và nhóm địa phương xuất hiện trong dữ liệu di sản Thái Nguyên
 */
export const ETHNIC_GROUPS_CATALOG = [
    {
        id: 'tay',
        canonical: 'Tày',
        aliases: ['người tày', 'dân tộc tày', 'đồng bào tày', 'tày'],
        normAliases: ['nguoi tay', 'dan toc tay', 'dong bao tay', 'tay'],
        subgroups: []
    },
    {
        id: 'nung',
        canonical: 'Nùng',
        aliases: ['người nùng', 'dân tộc nùng', 'đồng bào nùng', 'nùng phàn slình', 'nùng phàn sllình', 'nùng'],
        normAliases: ['nguoi nung', 'dan toc nung', 'dong bao nung', 'nung phan slinh', 'nung phan sllinh', 'nung'],
        subgroups: ['Nùng Phàn Slình']
    },
    {
        id: 'dao',
        canonical: 'Dao',
        aliases: [
            'người dao', 'dân tộc dao', 'đồng bào dao',
            'dao đỏ', 'dao tiền', 'dao tiên', 'dao lô gang', 'dao lô giang', 'dao quần chẹt', 'dao'
        ],
        normAliases: [
            'nguoi dao', 'dan toc dao', 'dong bao dao',
            'dao do', 'dao tien', 'dao lo gang', 'dao lo giang', 'dao quan chet', 'dao'
        ],
        subgroups: ['Dao Đỏ', 'Dao Tiền', 'Dao Lô Gang', 'Dao Quần Chẹt']
    },
    {
        id: 'san_chay',
        canonical: 'Sán Chay',
        aliases: ['người sán chay', 'dân tộc sán chay', 'đồng bào sán chay', 'sán chay', 'cao lan', 'sán chỉ'],
        normAliases: ['nguoi san chay', 'dan toc san chay', 'dong bao san chay', 'san chay', 'cao lan', 'san chi'],
        subgroups: []
    },
    {
        id: 'san_diu',
        canonical: 'Sán Dìu',
        aliases: ['người sán dìu', 'dân tộc sán dìu', 'đồng bào sán dìu', 'sán dìu'],
        normAliases: ['nguoi san diu', 'dan toc san diu', 'dong bao san diu', 'san diu'],
        subgroups: []
    },
    {
        id: 'mong',
        canonical: 'Mông',
        aliases: ['người mông', 'dân tộc mông', 'đồng bào mông', 'hmông', 'h\'mông', 'mông'],
        normAliases: ['nguoi mong', 'dan toc mong', 'dong bao mong', 'hmong', 'mong'],
        subgroups: []
    },
    {
        id: 'thai',
        canonical: 'Thái',
        aliases: ['người thái', 'dân tộc thái', 'đồng bào thái', 'tày nùng thái'],
        normAliases: ['nguoi thai', 'dan toc thai', 'dong bao thai', 'tay nung thai'],
        subgroups: []
    },
    {
        id: 'kinh',
        canonical: 'Kinh',
        aliases: ['người kinh', 'dân tộc kinh', 'việt'],
        normAliases: ['nguoi kinh', 'dan toc kinh'],
        subgroups: []
    }
];

/**
 * Chuẩn hóa chuỗi giữ nguyên dấu tiếng Việt (NFC, lowercase)
 */
export function normWithDiacritics(s) {
    if (!s) return '';
    return String(s)
        .normalize('NFC')
        .toLowerCase()
        .replace(/[.,;:!?()"“”‘’[\]{}<>\/\\|+-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Phân tích quyết định ghi danh thành { number, date, raw }
 */
export function parseDecisionInfo(decisionStr) {
    if (!decisionStr || typeof decisionStr !== 'string') {
        return { number: null, date: null, raw: null };
    }
    const raw = decisionStr.trim();
    const numMatch = raw.match(/(\d+\/QĐ-[A-ZĐ]+)/i);
    const dateMatch = raw.match(/ngày\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    return {
        number: numMatch ? numMatch[1].toUpperCase() : null,
        date: dateMatch ? dateMatch[1] : null,
        raw
    };
}

/**
 * Trích xuất cộng đồng chủ thể chính từ tên di sản (`n`) và câu mở đầu `description`
 * Đảm bảo KHÔNG gán nhầm một di sản chỉ vì trong mô tả có nhắc tên dân tộc khác để so sánh
 * (ví dụ: Hát Soọng cô của người Sán Dìu có câu "tương tự như sli, lượn của người Tày, Nùng, quan họ của người Kinh" -> chủ thể chỉ là Sán Dìu!)
 */
function extractPrimaryEthnicGroups(record) {
    const title = normWithDiacritics(record.n || '');
    const primary = new Set();
    const subgroups = new Set();

    // 1. Kiểm tra trực tiếp từ tên di sản (n)
    if (/\btày\b/.test(title)) primary.add('Tày');
    if (/\bnùng\b/.test(title)) {
        primary.add('Nùng');
        if (/phàn\s*slình|phàn\s*sllình/i.test(title)) subgroups.add('Nùng Phàn Slình');
    }
    if (/\bdao\b/.test(title)) {
        primary.add('Dao');
        if (/dao\s*đỏ/i.test(title)) subgroups.add('Dao Đỏ');
        if (/dao\s*tiền|dao\s*tiên/i.test(title)) subgroups.add('Dao Tiền');
        if (/lô\s*gang|lô\s*giang/i.test(title)) subgroups.add('Dao Lô Gang');
    }
    if (/sán\s*chay/.test(title)) primary.add('Sán Chay');
    if (/sán\s*dìu/.test(title)) primary.add('Sán Dìu');
    if (/\bmông\b|\bhmông\b/.test(title)) primary.add('Mông');
    if (/\bthái\b/.test(title) && !/thái\s*nguyên/.test(title)) primary.add('Thái');

    // 2. Bổ sung các nhóm nhánh người Dao được nêu là chủ thể trong mô tả của di sản người Dao
    if (primary.has('Dao')) {
        const desc = normWithDiacritics(record.description || '');
        if (/dao\s*đỏ/.test(desc)) subgroups.add('Dao Đỏ');
        if (/dao\s*quần\s*chẹt/.test(desc)) subgroups.add('Dao Quần Chẹt');
        if (/dao\s*lô\s*gang|dao\s*lô\s*giang/.test(desc)) subgroups.add('Dao Lô Gang');
        if (/dao\s*tiền|dao\s*tiên/.test(desc)) subgroups.add('Dao Tiền');
    }

    return {
        primaryEthnicGroups: Array.from(primary),
        ethnicSubgroups: Array.from(subgroups)
    };
}

/**
 * Trích xuất các địa danh lịch sử / trước sáp nhập được nhắc tới trong `description`
 */
function extractHistoricalLocations(record) {
    const desc = String(record.description || '');
    const notes = [];

    // Bắt các cụm như "xã X – Y (nay là/thuộc xã Z – tỉnh Thái Nguyên)" hoặc tương tự
    const patterns = [
        /(?:ở|tại)\s+([^\n.;()]{3,80}?\([^)\n]{3,80}?\))/gi,
        /(?:xã|thị trấn|huyện)\s+[A-ZÀ-Ỹ][^\n.;]{3,90}?(?:nay\s+(?:là|thuộc)\s+[^\n.;)]+)/gi
    ];

    for (const regex of patterns) {
        let m;
        while ((m = regex.exec(desc)) !== null) {
            const cleaned = m[0].replace(/\s+/g, ' ').trim();
            if (cleaned.length <= 160 && !notes.includes(cleaned)) {
                notes.push(cleaned);
            }
        }
    }

    return notes;
}

/**
 * Chỉ mục các cặp xã/phường trùng tên không dấu (như "Văn Lang" và "Văn Lăng")
 */
export const AMBIGUOUS_COMMUNE_MAP = new Map();
{
    const byNorm = new Map();
    for (const commune of COMMUNE_LIST) {
        const k = norm(commune);
        if (!byNorm.has(k)) byNorm.set(k, []);
        byNorm.get(k).push(commune);
    }
    for (const [k, list] of byNorm.entries()) {
        if (list.length > 1) {
            AMBIGUOUS_COMMUNE_MAP.set(k, list);
        }
    }
}

/**
 * Bản ghi đã được bổ sung chỉ mục tìm kiếm (nhưng giữ nguyên tham chiếu `raw` tới object gốc trong HERITAGE_DATA)
 */
export const INDEXED_HERITAGE_RECORDS = HERITAGE_DATA.map((rec) => {
    const { primaryEthnicGroups, ethnicSubgroups } = extractPrimaryEthnicGroups(rec);
    const decisionInfo = parseDecisionInfo(rec.decision);
    const allLocations = Array.from(
        new Set([...(rec.locations || []), ...(rec.appearIn || [])])
    );
    const historicalLocationNotes = extractHistoricalLocations(rec);
    const audioUrl = getAudioUrlFor(rec);

    return {
        raw: rec,
        id: rec.id,
        name: rec.n || '',
        nameEn: rec.n_en || '',
        nameDiacritic: normWithDiacritics(rec.n || ''),
        nameNorm: norm(rec.n || ''),
        nameEnNorm: norm(rec.n_en || ''),
        year: rec.year || null,
        level: rec.level || '',
        category: rec.category || '',
        categoryEn: rec.category_en || '',
        originalCategory: rec.originalCategory || '',
        decision: rec.decision || '',
        decisionNumber: decisionInfo.number,
        decisionDate: decisionInfo.date,
        locations: rec.locations || [],
        appearIn: rec.appearIn || [],
        allLocations,
        allLocationsNorm: allLocations.map(l => norm(l)),
        allLocationsDiacritic: allLocations.map(l => normWithDiacritics(l)),
        historicalLocationNotes,
        primaryEthnicGroups,
        ethnicSubgroups,
        description: rec.description || '',
        descriptionEn: rec.description_en || '',
        descriptionNorm: norm(rec.description || ''),
        descriptionDiacritic: normWithDiacritics(rec.description || ''),
        sourceDoc: rec.sourceDoc || '',
        imageFolder: rec.imageFolder || '',
        imageCaption: rec.imageCaption || '',
        imageSources: Array.isArray(rec.imageSources) ? rec.imageSources : [],
        hasVideo: Boolean(rec.hasVideo),
        audioUrl
    };
});

export function getHeritageById(id) {
    if (!id) return null;
    const cleanId = String(id).trim().toLowerCase();
    return INDEXED_HERITAGE_RECORDS.find(r => r.id.toLowerCase() === cleanId) || null;
}
