/* ═══════════════════════════════════════════════════════════
   SCRIPT.JS — Di Sản Thái Nguyên
   Module 1: Main App (bản đồ, tìm kiếm, drawer, audio player)
   Module 2: Chatbot AI (Gemini backend)
   ═══════════════════════════════════════════════════════════ */

/* ═══════════════ MODULE 1: MAIN APP ═══════════════ */
(function () {
    'use strict';
    if (!window.HeritageData) { console.error('[Di Sản] Không tải được heritage-data.js!'); return; }
    const HD = window.HeritageData;
    const { HERITAGE_DATA, COMMUNE_LIST, CATEGORY_ORDER, norm, esc, findCommuneKey, DI_SAN, LEVEL_UNESCO, LEVEL_NATIONAL, UNESCO_RECORDS, NATIONAL_RECORDS, CATEGORY_MAP, getAudioUrlFor } = HD;

    /*════ DOM & GLOBALS ════*/
    const el = id => document.getElementById(id);
    const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
    const hm = el('home'), ms = el('map-scr'), mpEl = el('mp'), dr = el('dr'), bs = el('bs');
    const srInp = el('sr-inp'), srDd = el('sr-dd'), regBtn = el('region-btn'), regMenu = el('region-menu'), overviewBtn = el('overview-btn');
    const drList = el('dr-list'), bsList = el('bs-list'), drTitle = el('dr-title'), drSub = el('dr-sub'), bsTitle = el('bs-title'), bsSub = el('bs-sub');
    const drBack = el('dr-back'), bsBack = el('bs-back'), bsHandle = el('bs-handle'), bsClose = el('bs-close');
    const am = el('am'), themeBtn = el('theme-btn'), ctaBtn = el('cta-btn'), backBtn = el('back-btn'), ft = el('ft'), brand = el('brand');
    const heritageModal = el('heritage-modal'), qrModal = el('qr-modal'), qrDonateBtn = el('qr-donate-btn'), qrCloseBtn = el('qr-close-btn');
    const lightbox = el('lightbox'), lbImg = el('lb-img'), lbCount = el('lb-count'), modalAudioBtn = el('modal-audio-btn');

    let mp = null, gL = null, aL = [], tileLayer = null, cXa = null, currentView = 'region';
    let overviewState = { level: null, category: null };
    let isDark = false, lg = 'vi', lastFocusEl = null, currentHeritage = null, tileFallbackActive = false;

    /*════ TILE CONFIG ════*/
    const CARTO_API_KEY = 'cb1_3fh4_1_cb344e64a2a7f016560e4bbb';
    const CARTO_BASE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=' + CARTO_API_KEY;
    const CARTO_DARK_BASE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png?key=' + CARTO_API_KEY;
    const OSM_FALLBACK = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const TILE_OPTS = { subdomains: 'abcd', maxZoom: 19, minZoom: 7, detectRetina: true, crossOrigin: true, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>', errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' };
    const OSM_FALLBACK_OPTS = { subdomains: 'abc', maxZoom: 19, minZoom: 7, detectRetina: false, crossOrigin: true, attribution: '&copy; OpenStreetMap' };

    function buildTileLayer() {
        const url = tileFallbackActive ? OSM_FALLBACK : (isDark ? CARTO_DARK_BASE : CARTO_BASE);
        const opts = tileFallbackActive ? OSM_FALLBACK_OPTS : TILE_OPTS;
        const layer = L.tileLayer(url, opts);
        let errCount = 0, notified = false;
        layer.on('tileerror', function () {
            errCount++;
            if (!tileFallbackActive && errCount >= 3) {
                tileFallbackActive = true;
                if (!notified) { notified = true; console.warn('[Di Sản Thái Nguyên] CARTO tiles lỗi — chuyển OSM.'); }
                layer.setUrl(OSM_FALLBACK); layer.options.subdomains = 'abc'; layer.redraw();
            }
        });
        return layer;
    }

    /*════ I18N ════*/
    const TXT = {
        vi: {
            skipLink: 'Bỏ qua điều hướng',
            brandTitle: 'Thái Nguyên',
            badge: 'Âm Vang Di Sản',
            searchLabel: 'Tìm kiếm di sản, xã, phường',
            searchPlaceholder: 'Tìm xã, phường, di sản... (Ctrl+K)',
            region: 'Khu vực',
            overview: 'Tổng quát',
            theme: 'Sáng/Tối',
            search: 'Tìm kiếm',
            home: 'Trang chủ',
            themeBtnTitle: 'Đổi chế độ sáng/tối',
            overviewBtnTitle: 'Tổng quát — Danh mục di sản theo cấp ghi danh',
            aboutBtnTitle: 'Thông tin dự án',
            searchBtnTitle: 'Tìm kiếm',
            menuBtnTitle: 'Mở menu',
            heroBadge: 'Dự án Khoa học Kỹ thuật · THPT Phú Bình',
            heroTitle: 'Di Sản Thái Nguyên',
            heroSub: 'ÂM VANG DI SẢN VĂN HOÁ PHI VẬT THỂ',
            heroSlogan: '"Lắng nghe hồn xưa &mdash; Chạm vào di sản"',
            ctaBtn: '<i class="fa-solid fa-leaf"></i> KHÁM PHÁ NGAY',
            footerSchool: 'THPT Phú Bình',
            donateBtnTitle: 'Ủng hộ chúng tôi',
            footerKhkt: 'Sản phẩm dự thi Cuộc thi Khoa học Kỹ thuật cấp tỉnh',
            footerCopyright: '© 2026 Dự án số hóa Di sản Văn hóa Phi vật thể · THPT Phú Bình',
            backBtn: '<i class="fa-solid fa-arrow-left"></i> Trang chủ',
            closeBtnTitle: 'Đóng danh sách',
            backToXa: 'Quay lại',
            backToLevel: 'Về cấp ghi danh',
            backToCategory: 'Về loại hình',
            amTitle: 'Về Dự án',
            amLead: '<strong>Di Sản Thái Nguyên · Âm Vang Di Sản Văn Hoá Phi Vật Thể</strong> là nền tảng số hóa bản đồ di sản văn hóa phi vật thể tương tác cấp <strong>xã/phường</strong> tại tỉnh Thái Nguyên sau sáp nhập với tỉnh Bắc Kạn. Dự án kết hợp công nghệ bản đồ số (WebGIS), trí tuệ nhân tạo (AI) và kho tư liệu ảnh – tư liệu văn hóa để đưa di sản đến gần hơn với cộng đồng, đặc biệt là thế hệ trẻ.',
            amSecKhkt: 'Dự án Khoa học Kỹ thuật',
            amKhktLead: 'Đây là <strong>sản phẩm dự thi Cuộc thi Khoa học Kỹ thuật cấp tỉnh</strong> dành cho học sinh trung học — do nhóm học sinh <strong>Trường THPT Phú Bình</strong> nghiên cứu, thiết kế và phát triển.',
            amKhktField: '<strong>Lĩnh vực dự thi:</strong> Khoa Học Xã Hội Và Hành Vi',
            amKhktAuthor: '<strong>Nhóm tác giả:</strong> Học sinh THPT Phú Bình',
            amKhktIdea: '<strong>Ý tưởng:</strong> Ứng dụng công nghệ số vào bảo tồn văn hóa phi vật thể',
            amKhktTech: '<strong>Công nghệ:</strong> WebGIS (Leaflet), AI (Google Gemini + Google Search Grounding), PWA',
            amKhktGoal: '<strong>Mục tiêu:</strong> Số hóa – Lan tỏa – Giáo dục thế hệ trẻ về di sản',
            amKhktNew: '<strong>Tính mới:</strong> Bản đồ di sản cấp xã/phường đầu tiên tại Thái Nguyên sau sáp nhập',
            amSecFeatures: 'Chức năng cốt lõi',
            amFeature1: '<strong>Bản đồ tương tác di sản theo từng xã/phường</strong> — hiển thị chi tiết di sản của địa bàn.',
            amFeature2: '<strong>Tổng quát — Danh mục di sản</strong> — tra cứu theo cấp ghi danh (UNESCO / Quốc gia), theo 6 loại hình và xem năm ghi danh, quyết định ghi danh của từng bản ghi.',
            amFeature3: '<strong>Tra cứu &amp; Tìm kiếm thông minh</strong> — autocomplete theo từ khóa, tên xã, phường, hoặc tên di sản.',
            amFeature4: '<strong>Trợ lý AI Di sản</strong> — chatbot AI hỗ trợ giải đáp thắc mắc về văn hóa, lịch sử, di sản.',
            amFeature5: '<strong>Trình phát âm thanh di sản</strong> — nghe trực tiếp giai điệu hát dân gian có sẵn tài nguyên.',
            amFeature6: '<strong>Bộ lọc đa năng</strong> — lọc theo xã/phường, chuyển đổi ngôn ngữ Việt/Anh, chế độ Sáng/Tối.',
            amSecMeaning: 'Ý nghĩa dự án',
            amMeaning: 'Dự án nhằm <strong>tôn vinh, bảo tồn và lan tỏa</strong> giá trị văn hóa phi vật thể quý báu của đồng bào các dân tộc trên địa bàn tỉnh Thái Nguyên. Thông qua công nghệ số, dự án kết nối thế hệ trẻ với nguồn cội, khơi dậy niềm tự hào văn hóa dân tộc.',
            amSecMessage: 'Thông điệp dự án',
            amMessage: '...',
            amSign: '— Phát triển bởi <strong>THPT Phú Bình</strong> —<br><span style="font-size:0.78rem;opacity:0.85;">Sản phẩm dự thi Cuộc thi Khoa học Kỹ thuật cấp tỉnh</span>',
            amDomain: 'Nguồn dữ liệu: Danh mục di sản văn hóa phi vật thể Thái Nguyên sau sáp nhập.',
            qrTitle: 'Ủng hộ chúng tôi',
            qrDesc: 'Quét mã QR để ủng hộ',
            qrThanks: 'Cảm ơn bạn đã đồng hành cùng dự án!',
            qrClose: 'Đóng',
            lblCategory: 'Loại hình',
            lblYear: 'Năm ghi danh',
            lblLoc: 'Địa bàn',
            lblDecision: 'Quyết định / Căn cứ ghi danh',
            lblDesc: 'Mô tả chi tiết',
            lblImgSource: 'Nguồn ảnh',
            levelUnesco: 'Di sản văn hoá phi vật thể được UNESCO ghi danh',
            levelNational: 'Di sản văn hoá phi vật thể quốc gia',
            lblLevelUnesco: 'Di sản văn hoá phi vật thể được UNESCO ghi danh',
            lblLevelNational: 'Di sản văn hoá phi vật thể quốc gia',
            unknownLoc: 'Chưa xác định xã/phường cụ thể trong tệp dữ liệu',
            noDesc: 'Thông tin mô tả chi tiết chưa có trong tư liệu được cung cấp.',
            noDecision: 'Chưa có thông tin trong tệp dữ liệu.',
            noImgSrc: 'Thông tin nguồn ảnh chưa có trong tệp dữ liệu.',
            loadingImg: 'Đang tải hình ảnh...',
            noImg: 'Chưa có hình ảnh cho di sản này',
            menuTitle: 'Menu',
            fabBook: 'Cuốn sách di sản',
            fabTravel: 'Thái Nguyên Travel',
            apTitle: 'Giai điệu di sản',
            apSub: 'Đang phát...',
            chatFabTooltip: 'Chat với AI',
            chatTitle: 'Trợ Lý Di Sản AI',
            chatStatus: 'Online',
            chatInputPlaceholder: 'Nhập câu hỏi...',
            dsCount: 'di sản',
            allXa: 'Về danh sách xã',
            xaShort: 'Quay lại',
            noResult: 'Không tìm thấy kết quả',
            noHeritage: 'Xã này chưa có dữ liệu di sản được ghi nhận.',
            pickCategory: 'Chọn loại hình',
            allLevel: 'Về cấp ghi danh',
            allCategory: 'Về loại hình',
            emptyCommuneTitle: 'Dữ liệu đang được cập nhật',
            emptyCommuneDesc: 'Hiện tệp tư liệu chưa ghi nhận di sản có địa bàn cụ thể tại xã/phường này.',
            emptyCommuneAction: 'Xem danh mục Tổng quát',
            emptyCat: 'Chưa có bản ghi nào thuộc loại hình này.'
        },
        en: {
            skipLink: 'Skip navigation',
            brandTitle: 'Thai Nguyen',
            badge: 'Echoes of Heritage',
            searchLabel: 'Search heritage, communes',
            searchPlaceholder: 'Search commune, heritage... (Ctrl+K)',
            region: 'Regions',
            overview: 'Overview',
            theme: 'Theme',
            search: 'Search',
            home: 'Home',
            themeBtnTitle: 'Toggle theme',
            overviewBtnTitle: 'Overview — Heritage catalogue by level',
            aboutBtnTitle: 'Project information',
            searchBtnTitle: 'Open search',
            menuBtnTitle: 'Open menu',
            heroBadge: 'Science & Engineering Project · Phu Binh High School',
            heroTitle: 'Thai Nguyen Heritage',
            heroSub: 'ECHOES OF INTANGIBLE CULTURAL HERITAGE',
            heroSlogan: '"Listen to the ancient soul &mdash; Touch the heritage"',
            ctaBtn: '<i class="fa-solid fa-leaf"></i> EXPLORE NOW',
            footerSchool: 'Phu Binh High School',
            donateBtnTitle: 'Support us',
            footerKhkt: 'Provincial Science & Engineering Fair Project',
            footerCopyright: '© 2026 Intangible Cultural Heritage Digitization Project · Phu Binh High School',
            backBtn: '<i class="fa-solid fa-arrow-left"></i> Home',
            closeBtnTitle: 'Close list',
            backToXa: 'Back',
            backToLevel: 'Back to levels',
            backToCategory: 'Back to categories',
            amTitle: 'About Project',
            amLead: '<strong>Thai Nguyen Heritage · Echoes of Intangible Cultural Heritage</strong> is an interactive digital heritage map platform at the <strong>commune/ward</strong> level in Thai Nguyen province after merging with Bac Kan province. The project combines digital map technology (WebGIS), artificial intelligence (AI), and a repository of images and cultural materials to bring heritage closer to the community, especially the younger generation.',
            amSecKhkt: 'Science & Engineering Project',
            amKhktLead: 'This is a <strong>Provincial Science & Engineering Fair project</strong> for high school students — researched, designed, and developed by the student team of <strong>Phu Binh High School</strong>.',
            amKhktField: '<strong>Field:</strong> Social and Behavioral Sciences',
            amKhktAuthor: '<strong>Authors:</strong> Phu Binh High School Students',
            amKhktIdea: '<strong>Idea:</strong> Applying digital technology to preserve intangible cultural heritage',
            amKhktTech: '<strong>Technology:</strong> WebGIS (Leaflet), AI (Google Gemini + Google Search Grounding), PWA',
            amKhktGoal: '<strong>Goal:</strong> Digitize – Spread – Educate the younger generation about heritage',
            amKhktNew: '<strong>Novelty:</strong> First commune/ward-level heritage map in Thai Nguyen after merging',
            amSecFeatures: 'Core Features',
            amFeature1: '<strong>Interactive heritage map by commune/ward</strong> — displaying detailed heritage of the area.',
            amFeature2: '<strong>Overview — Heritage catalogue</strong> — search by level (UNESCO / National), by 6 categories, and view registration year, decision of each record.',
            amFeature3: '<strong>Smart Search & Lookup</strong> — autocomplete by keyword, commune, ward, or heritage name.',
            amFeature4: '<strong>Heritage AI Assistant</strong> — AI chatbot to answer questions about culture, history, heritage.',
            amFeature5: '<strong>Heritage Audio Player</strong> — listen directly to available folk melodies.',
            amFeature6: '<strong>Multi-functional filters</strong> — filter by commune/ward, switch languages (VN/EN), Light/Dark mode.',
            amSecMeaning: 'Project Meaning',
            amMeaning: 'The project aims to <strong>honor, preserve, and spread</strong> the precious intangible cultural heritage values of ethnic minorities in Thai Nguyen province. Through digital technology, the project connects the younger generation with their roots, arousing national cultural pride.',
            amSecMessage: 'Project Message',
            amMessage: '...',
            amSign: '— Developed by <strong>Phu Binh High School</strong> —<br><span style="font-size:0.78rem;opacity:0.85;">Provincial Science & Engineering Fair Project</span>',
            amDomain: 'Data source: Thai Nguyen Intangible Cultural Heritage List after merging.',
            qrTitle: 'Support Us',
            qrDesc: 'Scan QR code to support',
            qrThanks: 'Thank you for accompanying the project!',
            qrClose: 'Close',
            lblCategory: 'Category',
            lblYear: 'Year inscribed',
            lblLoc: 'Location',
            lblDecision: 'Decision / Basis for inscription',
            lblDesc: 'Detailed description',
            lblImgSource: 'Image sources',
            levelUnesco: 'Intangible Cultural Heritage inscribed by UNESCO',
            levelNational: 'National Intangible Cultural Heritage',
            lblLevelUnesco: 'Intangible Cultural Heritage inscribed by UNESCO',
            lblLevelNational: 'National Intangible Cultural Heritage',
            unknownLoc: 'Commune/ward not specifically identified in data',
            noDesc: 'Detailed description not available in provided data.',
            noDecision: 'No information in provided data.',
            noImgSrc: 'Image sources not available in data.',
            loadingImg: 'Loading images...',
            noImg: 'No images available',
            menuTitle: 'Menu',
            fabBook: 'Heritage Book',
            fabTravel: 'Thai Nguyen Travel',
            apTitle: 'Heritage Melody',
            apSub: 'Playing...',
            chatFabTooltip: 'Chat with AI',
            chatTitle: 'Heritage AI Assistant',
            chatStatus: 'Online',
            chatInputPlaceholder: 'Type your question...',
            dsCount: 'heritages',
            allXa: 'Back to commune list',
            xaShort: 'Back',
            noResult: 'No results found',
            noHeritage: 'No heritage data recorded for this commune yet.',
            pickCategory: 'Pick a category',
            allLevel: 'Back to levels',
            allCategory: 'Back to categories',
            emptyCommuneTitle: 'Data is being updated',
            emptyCommuneDesc: 'No heritage with a specific location in this commune has been recorded yet.',
            emptyCommuneAction: 'View Overview catalogue',
            emptyCat: 'No records in this category.'
        }
    };

    /*════ HELPERS ════*/
    function catIcon(c) { switch (c) { case 'Tiếng nói, chữ viết': return '✍️'; case 'Nghệ thuật trình diễn dân gian': return '🎭'; case 'Tập quán xã hội và tín ngưỡng': return '🕯️'; case 'Lễ hội truyền thống': return '🥁'; case 'Làng nghề thủ công truyền thống': return '🧵'; case 'Tri thức dân gian': return '🍃'; default: return '📜' } }
    function catClass(c) { switch (c) { case 'Tiếng nói, chữ viết': return 'lang'; case 'Nghệ thuật trình diễn dân gian': return 'art'; case 'Tập quán xã hội và tín ngưỡng': return 'fes'; case 'Lễ hội truyền thống': return 'fes'; case 'Làng nghề thủ công truyền thống': return 'knw'; case 'Tri thức dân gian': return 'knw'; default: return 'knw' } }
    const typeLabel = t => t === 'xa' ? (lg === 'en' ? 'Commune' : 'Xã/Phường') : (lg === 'en' ? 'Heritage' : 'Di sản');

    /*════ THEME ════*/
    function applyTheme(dark) {
        isDark = dark;
        document.body.classList.toggle('dark', isDark);
        const i = themeBtn.querySelector('i'); if (i) i.className = isDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
        const bn = el('bn-theme'); if (bn) { const bi = bn.querySelector('i'); if (bi) bi.className = isDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun'; }
        if (tileLayer) {
            if (tileFallbackActive) tileLayer.setUrl(OSM_FALLBACK);
            else { tileLayer.setUrl(isDark ? CARTO_DARK_BASE : CARTO_BASE); tileLayer.options.subdomains = 'abcd'; }
        }
        if (gL) aL.forEach(l => l.setStyle(l._hl ? stlHl() : stlGeo()));
        try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (e) { }
    }
    themeBtn.addEventListener('click', () => applyTheme(!isDark));
    try { if (localStorage.getItem('theme') === 'dark') applyTheme(true); } catch (e) { }

    /*════ LANGUAGE ════*/
    function swLang(l) {
        lg = l;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (TXT[lg][key]) {
                el.innerHTML = TXT[lg][key];
            }
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (TXT[lg][key]) {
                el.placeholder = TXT[lg][key];
            }
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (TXT[lg][key]) {
                el.title = TXT[lg][key];
            }
        });

        $$('#lang-sw .pill-btn').forEach(b => { const on = b.dataset.lang === lg; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        $$('.m-lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lg));

        updateBsBackLabel();
        if (currentView === 'region' && cXa) openCommuneView(cXa, false, false);
        if (currentView === 'overview') renderOverviewCurrent();
    }
    $$('#lang-sw .pill-btn').forEach(b => b.addEventListener('click', () => swLang(b.dataset.lang)));

    function updateBsBackLabel() {
        if (currentView === 'overview') {
            if (overviewState.category) bsBack.innerHTML = '<i class="fa-solid fa-arrow-left"></i> <span>' + esc(TXT[lg].allCategory) + '</span>';
            else if (overviewState.level) bsBack.innerHTML = '<i class="fa-solid fa-arrow-left"></i> <span>' + esc(TXT[lg].allLevel) + '</span>';
            else bsBack.innerHTML = '<i class="fa-solid fa-arrow-left"></i> <span>' + esc(TXT[lg].xaShort) + '</span>';
        } else bsBack.innerHTML = '<i class="fa-solid fa-arrow-left"></i> <span>' + esc(TXT[lg].xaShort) + '</span>';
    }

    /*════ STYLES ════*/
    function stlGeo() { return { fillColor: isDark ? '#00FFCC' : '#2D6A4F', color: isDark ? '#00FFCC' : '#2D6A4F', weight: 1.3, opacity: .75, fillOpacity: isDark ? .08 : .14 } }
    function stlHl() { return { fillColor: isDark ? '#FFD700' : '#B8860B', color: isDark ? '#FFD700' : '#B8860B', weight: 3, opacity: 1, fillOpacity: isDark ? .32 : .4 } }

    /*════ MAP ════*/
    function bldMap() {
        mp = L.map('mp', { center: [21.95, 105.85], zoom: 9, zoomControl: false, attributionControl: true, scrollWheelZoom: window.innerWidth > 768, preferCanvas: true });
        tileLayer = buildTileLayer().addTo(mp);
        L.control.zoom({ position: 'bottomright' }).addTo(mp);
        L.control.attribution({ position: 'bottomleft', prefix: '© THPT Phú Bình' }).addTo(mp);
        ldGeo();
    }
    function ldGeo() {
        fetch('./thainguyen.geojson').then(r => { if (!r.ok) throw new Error('geojson'); return r.json() }).then(renderGeo).catch(fallbackGeo);
    }
    function fallbackGeo() {
        const box = (x1, y1, x2, y2) => ({ type: 'Polygon', coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]] });
        const fb = {
            type: 'FeatureCollection', features: [
                { type: 'Feature', properties: { name: 'Kha Sơn' }, geometry: box(105.94, 21.46, 105.99, 21.50) },
                { type: 'Feature', properties: { name: 'Phú Bình' }, geometry: box(105.99, 21.44, 106.04, 21.48) },
                { type: 'Feature', properties: { name: 'Tân Cương' }, geometry: box(105.76, 21.52, 105.81, 21.57) },
                { type: 'Feature', properties: { name: 'Ba Bể' }, geometry: box(105.68, 22.38, 105.74, 22.44) },
                { type: 'Feature', properties: { name: 'Côn Minh' }, geometry: box(106.03, 22.06, 106.09, 22.12) },
                { type: 'Feature', properties: { name: 'Văn Lăng' }, geometry: box(105.82, 21.60, 105.88, 21.66) },
                { type: 'Feature', properties: { name: 'Bắc Kạn' }, geometry: box(105.82, 22.12, 105.88, 22.17) }
            ]
        };
        renderGeo(fb);
    }
    function renderGeo(data) {
        if (gL) mp.removeLayer(gL);
        gL = L.geoJSON(data, { style: stlGeo(), onEachFeature: onFeat }).addTo(mp);
        aL = []; gL.eachLayer(l => aL.push(l));
        try { mp.fitBounds(gL.getBounds(), { padding: [40, 40], maxZoom: 12 }); } catch (e) { }
    }
    function onFeat(f, layer) {
        const p = f.properties || {};
        const raw = p.name || p.Name || p.ten_xa || p.TEN_XA || p.xa || '';
        const matched = findCommuneKey(raw);
        layer._rawName = raw; layer._xa = matched || ''; layer._hl = false;
        layer.bindTooltip(raw || norm(raw), { className: 'heritage-tip', sticky: true, direction: 'top', offset: [0, -8] });
        layer.on('click', () => { if (layer._xa) openCommuneView(layer._xa, true); });
        layer.on('mouseover', () => { if (!layer._hl) layer.setStyle({ weight: 2.4, opacity: .95, fillOpacity: isDark ? .16 : .24 }); });
        layer.on('mouseout', () => { if (!layer._hl) layer.setStyle(stlGeo()); });
    }
    function clearHighlight() { aL.forEach(l => { l._hl = false; l.setStyle(stlGeo()); }); }
    function matchLayer(l, xa) { if (!xa) return true; return l._xa === xa; }
    function zoomToLayers(layers, maxZoom, padding) {
        if (!layers.length) return;
        let b = null;
        layers.forEach(l => { const lb = l.getBounds(); if (!lb) return; if (!b) b = L.latLngBounds(lb.getSouthWest(), lb.getNorthEast()); else b.extend(lb); });
        if (b && b.isValid()) mp.fitBounds(b, { padding: padding || [60, 60], maxZoom: maxZoom || 14 });
    }
    function highlightCommune(xa) {
        const matched = [];
        aL.forEach(l => { if (matchLayer(l, xa)) { l.setStyle(stlHl()); l._hl = true; l.bringToFront(); matched.push(l); } else { l._hl = false; l.setStyle(stlGeo()); } });
        if (matched.length) setTimeout(() => zoomToLayers(matched, 14, [70, 70]), 60);
    }
    const isMobile = () => window.innerWidth <= 768;

    /*════ DRAWER ════*/
    function openDrawer(title, sub, html, showBack, backLabel, animateSwap) {
        if (isMobile()) {
            const shouldAnimate = animateSwap !== false;
            if (shouldAnimate) { bsList.classList.remove('bs-swap'); void bsList.offsetWidth; }
            bsTitle.textContent = title; bsSub.textContent = sub || ''; bsList.innerHTML = html;
            if (shouldAnimate) bsList.classList.add('bs-swap');
            if (showBack) { bsBack.classList.add('show'); if (backLabel) bsBack.innerHTML = '<i class="fa-solid fa-arrow-left"></i> <span>' + esc(backLabel) + '</span>'; }
            else bsBack.classList.remove('show');
            bs.classList.add('open'); dr.classList.remove('open'); bsList.scrollTop = 0;
        } else {
            drTitle.textContent = title; drSub.textContent = sub || ''; drList.innerHTML = html;
            if (showBack) { drBack.classList.add('show'); if (backLabel) drBack.innerHTML = '<i class="fa-solid fa-arrow-left"></i> ' + esc(backLabel); }
            else drBack.classList.remove('show');
            dr.classList.add('open'); bs.classList.remove('open'); drList.scrollTop = 0;
        }
    }
    function closeDrawers() {
        dr.classList.remove('open'); bs.classList.remove('open'); bs.style.transform = '';
        dr.classList.remove('overview-mode'); bs.classList.remove('overview-mode');
        currentView = 'region'; overviewState = { level: null, category: null }; updateOverviewBtn();
    }
    function updateOverviewBtn() {
        if (!overviewBtn) return;
        const active = currentView === 'overview';
        overviewBtn.classList.toggle('active', active);
        overviewBtn.setAttribute('aria-expanded', active ? 'true' : 'false');
        const bn = el('bn-overview'); if (bn) bn.classList.toggle('active', active);
    }

    /*════ CARDS ════*/
    function renderHeritageCards(list, options) {
        options = options || {};
        if (!list || !list.length) {
            if (options.emptyMode === 'commune') {
                return '<div class="empty-state"><div class="es-icon"><i class="fa-solid fa-map-location-dot"></i></div><div class="es-title">' + esc(TXT[lg].emptyCommuneTitle) + '</div><div class="es-desc">' + esc(TXT[lg].emptyCommuneDesc) + '</div><button class="es-action" onclick="window.__openOverviewFromEmpty && window.__openOverviewFromEmpty()"><i class="fa-solid fa-layer-group"></i> ' + esc(TXT[lg].emptyCommuneAction) + '</button></div>';
            }
            return '<div class="list-empty">' + esc(TXT[lg].noHeritage) + '</div>';
        }
        return list.map(d => {
            const metaParts = [];
            metaParts.push('<span class="badge-level">' + esc(d.level === 'UNESCO' ? 'UNESCO' : (lg === 'en' ? 'National' : 'Quốc gia')) + '</span>');
            if (d.year) metaParts.push('<span><i class="fa-regular fa-calendar"></i> ' + esc(d.year) + '</span>');
            if (d.locations && d.locations.length) metaParts.push('<span><i class="fa-solid fa-location-dot"></i> ' + esc(d.locations[0]) + (d.locations.length > 1 ? ' +' + (d.locations.length - 1) : '') + '</span>');
            else metaParts.push('<span><i class="fa-solid fa-circle-question"></i> ?</span>');
            const cls = catClass(d.category);
            const name = lg === 'en' ? (d.n_en || d.n) : d.n;
            return '<div class="ds-card" data-id="' + esc(d.id) + '" role="button" tabindex="0" aria-label="' + esc(name) + '"><div class="ds-tag ' + cls + '">' + catIcon(d.category) + '</div><div class="ds-info"><div class="ds-name">' + esc(name) + '</div><div class="ds-meta">' + metaParts.join('') + '</div></div></div>';
        }).join('');
    }
    function bindHeritageCards(container) {
        if (!container) return;
        $$('.ds-card', container).forEach(card => {
            const fire = () => {
                const id = card.dataset.id;
                const rec = HERITAGE_DATA.find(r => r.id === id);
                if (rec) openHeritage(rec);
            };
            card.addEventListener('click', fire);
            card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
        });
    }
    function openCommuneView(xa, doZoom, fromOverview) {
        if (!fromOverview) { currentView = 'region'; dr.classList.remove('overview-mode'); bs.classList.remove('overview-mode'); }
        cXa = xa;
        const list = DI_SAN[xa] || [];
        const sub = list.length + ' ' + TXT[lg].dsCount;
        const html = renderHeritageCards(list, { emptyMode: 'commune' });
        openDrawer(xa, sub, html, false, null, false);
        const container = isMobile() ? bsList : drList;
        bindHeritageCards(container);
        if (doZoom !== false) highlightCommune(xa);
        updateOverviewBtn(); updateBsBackLabel();
    }

    /*════ OVERVIEW ════*/
    function openOverview() {
        currentView = 'overview'; overviewState = { level: null, category: null };
        dr.classList.add('overview-mode'); bs.classList.add('overview-mode');
        showMap(); renderOverviewCurrent(); updateOverviewBtn();
    }
    function parseDecisionDate(str) {
        if (!str) return null;
        const m = String(str).match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/);
        if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); if (!isNaN(d.getTime())) return d; }
        return null;
    }
    function renderOverviewCurrent() {
        const state = overviewState;
        if (!state.level) {
            const html =
                '<div class="cat-card cat-unesco" data-level="UNESCO" role="button" tabindex="0" aria-label="' + (lg === 'en' ? 'UNESCO Level' : 'Cấp quốc tế UNESCO') + '"><div class="cat-ic">🌏</div><div class="cat-info"><div class="cat-name">' + (lg === 'en' ? 'UNESCO' : 'UNESCO') + '</div><div class="cat-desc">' + esc(TXT[lg].levelUnesco) + '</div></div><span class="cat-count">' + UNESCO_RECORDS.length + '</span><i class="fa-solid fa-chevron-right cat-go"></i></div>' +
                '<div class="cat-card" data-level="Quốc gia" role="button" tabindex="0" aria-label="' + (lg === 'en' ? 'National Level' : 'Cấp quốc gia') + '"><div class="cat-ic">🏛️</div><div class="cat-info"><div class="cat-name">' + (lg === 'en' ? 'National' : 'Quốc gia') + '</div><div class="cat-desc">' + esc(TXT[lg].levelNational) + '</div></div><span class="cat-count">' + NATIONAL_RECORDS.length + '</span><i class="fa-solid fa-chevron-right cat-go"></i></div>';
            openDrawer(TXT[lg].overview, TXT[lg].pickCategory || 'Chọn cấp', html, false, null, true);
        } else if (state.level === 'UNESCO') {
            const list = UNESCO_RECORDS.slice().sort((a, b) => a.sourceOrder - b.sourceOrder);
            const sub = list.length + ' ' + TXT[lg].dsCount;
            const html = renderHeritageCards(list);
            openDrawer('UNESCO', sub, html, true, TXT[lg].allLevel, true);
            bindHeritageCards(isMobile() ? bsList : drList);
        } else if (state.level === 'Quốc gia') {
            if (!state.category) {
                const html = CATEGORY_ORDER.map(cat => {
                    const n = (CATEGORY_MAP[cat] || []).length;
                    const cls = catClass(cat);
                    const catName = lg === 'en' ? (NATIONAL_RECORDS.find(r => r.category === cat)?.category_en || cat) : cat;
                    return '<div class="cat-card ' + cls + '" data-cat="' + esc(cat) + '" role="button" tabindex="0" aria-label="' + esc(catName) + '"><div class="cat-ic">' + catIcon(cat) + '</div><div class="cat-info"><div class="cat-name">' + esc(catName) + '</div><div class="cat-desc">' + esc(TXT[lg].pickCategory) + '</div></div><span class="cat-count">' + n + '</span><i class="fa-solid fa-chevron-right cat-go"></i></div>';
                }).join('');
                openDrawer(lg === 'en' ? 'National' : 'Quốc gia', TXT[lg].pickCategory, html, true, TXT[lg].allLevel, true);
            } else {
                const list = (CATEGORY_MAP[state.category] || []).slice().sort((a, b) => {
                    const da = parseDecisionDate(a.decision), db = parseDecisionDate(b.decision);
                    if (da && db && da.getTime() !== db.getTime()) return da - db;
                    return a.sourceOrder - b.sourceOrder;
                });
                const sub = list.length + ' ' + TXT[lg].dsCount;
                const html = list.length ? renderHeritageCards(list) : '<div class="list-empty">' + esc(TXT[lg].emptyCat) + '</div>';
                const catName = lg === 'en' ? (NATIONAL_RECORDS.find(r => r.category === state.category)?.category_en || state.category) : state.category;
                openDrawer(catName, sub, html, true, TXT[lg].allCategory, true);
                bindHeritageCards(isMobile() ? bsList : drList);
            }
        }
        updateBsBackLabel();
    }

    /*════ DELEGATION ════*/
    document.addEventListener('click', e => {
        const catCard = e.target.closest('.cat-card');
        if (catCard && catCard.dataset.level) { overviewState.level = catCard.dataset.level; overviewState.category = null; renderOverviewCurrent(); return; }
        if (catCard && catCard.dataset.cat) { overviewState.category = catCard.dataset.cat; renderOverviewCurrent(); }
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            const t = document.activeElement;
            if (t && t.classList && t.classList.contains('cat-card')) { e.preventDefault(); t.click(); }
        }
    });
    function handleOverviewBack() {
        if (currentView !== 'overview') { closeDrawers(); return; }
        if (overviewState.category) { overviewState.category = null; renderOverviewCurrent(); }
        else if (overviewState.level) { overviewState.level = null; overviewState.category = null; renderOverviewCurrent(); }
        else closeDrawers();
    }
    drBack.addEventListener('click', handleOverviewBack);
    bsBack.addEventListener('click', handleOverviewBack);
    if (bsClose) bsClose.addEventListener('click', () => { closeDrawers(); clearHighlight(); cXa = null; });
    window.__openOverviewFromEmpty = () => { closeDrawers(); setTimeout(openOverview, 200); };
    el('dr-close').addEventListener('click', () => { closeDrawers(); clearHighlight(); cXa = null; });

    /*════ SWIPE SHEET ════*/
    (function () {
        let startY = null;
        const onStart = e => { if (!isMobile()) return; const t = e.touches ? e.touches[0] : e; startY = t.clientY; bs.style.transition = 'none'; };
        const onMove = e => { if (startY === null) return; const t = e.touches ? e.touches[0] : e; const dy = t.clientY - startY; if (dy > 0) { bs.style.transform = 'translateY(' + dy + 'px)'; if (e.cancelable) try { e.preventDefault(); } catch (err) { } } };
        const onEnd = e => { if (startY === null) return; const t = e.changedTouches ? e.changedTouches[0] : e; const dy = t.clientY - startY; bs.style.transition = ''; bs.style.transform = ''; if (dy > 80) closeDrawers(); startY = null; };
        if (bsHandle) {
            bsHandle.addEventListener('touchstart', onStart, { passive: true });
            bsHandle.addEventListener('touchmove', onMove, { passive: false });
            bsHandle.addEventListener('touchend', onEnd, { passive: true });
            bsHandle.addEventListener('touchcancel', onEnd, { passive: true });
        }
    })();

    /*════ SEARCH ════*/
    const srIdx = (function () {
        const idx = [];
        COMMUNE_LIST.forEach(xa => idx.push({ n: xa, type: 'xa', xa, ic: '🏘️' }));
        HERITAGE_DATA.forEach(rec => idx.push({ n: rec.n, n_en: rec.n_en, type: 'disan', rec, ic: catIcon(rec.category) }));
        return idx;
    })();
    function doSearch(q) {
        const ql = norm(q);
        if (!ql) { srDd.classList.remove('open'); srDd.innerHTML = ''; return; }
        const res = srIdx.filter(it => norm(it.n).indexOf(ql) !== -1 || (it.n_en && norm(it.n_en).indexOf(ql) !== -1)).slice(0, 14);
        if (!res.length) {
            srDd.innerHTML = '<div class="item" style="opacity:.6;"><span class="ic">🔍</span><span class="nm">' + TXT[lg].noResult + '</span></div>';
            srDd.classList.add('open'); return;
        }
        srDd.innerHTML = res.map((r, i) => {
            let extra = '';
            if (r.type === 'disan') extra = ' · ' + r.rec.year + ' · ' + (r.rec.level === 'UNESCO' ? 'UNESCO' : (lg === 'en' ? 'National' : 'QG'));
            const displayName = lg === 'en' && r.n_en ? r.n_en : r.n;
            return '<div class="item" data-i="' + i + '" role="option" tabindex="0"><span class="ic">' + r.ic + '</span><span class="nm">' + esc(displayName) + esc(extra) + '</span><small>' + esc(typeLabel(r.type)) + '</small></div>';
        }).join('');
        srDd.classList.add('open');
        $$('.item', srDd).forEach(node => node.addEventListener('click', () => {
            const r = res[+node.dataset.i]; if (!r) return; handleSearchPick(r);
        }));
    }
    function handleSearchPick(r) {
        srDd.classList.remove('open'); srInp.value = ''; showMap();
        if (r.type === 'xa') openCommuneView(r.xa, true);
        else setTimeout(() => openHeritage(r.rec), 220);
    }
    srInp.addEventListener('input', () => doSearch(srInp.value));
    srInp.addEventListener('focus', () => { if (srInp.value) doSearch(srInp.value); });
    srInp.addEventListener('keydown', e => { if (e.key === 'Enter') { const first = srDd.querySelector('.item[data-i]'); if (first) first.click(); } });
    document.addEventListener('click', e => {
        if (!srDd.contains(e.target) && e.target !== srInp) srDd.classList.remove('open');
        if (!regMenu.contains(e.target) && e.target !== regBtn && !regBtn.contains(e.target)) {
            regMenu.classList.remove('open'); regBtn.classList.remove('open'); regBtn.setAttribute('aria-expanded', 'false');
        }
    });

    /*════ REGION MENU ════*/
    function bldRegMenu() {
        let html = '<div class="grp-label"><i class="fa-solid fa-star"></i> ' + (lg === 'en' ? 'Thai Nguyen Province' : 'Tỉnh Thái Nguyên') + ' </div>';
        COMMUNE_LIST.forEach(xa => {
            const n = (DI_SAN[xa] || []).length;
            html += '<div class="ri" data-x="' + esc(xa) + '" role="menuitem" tabindex="0"><i class="fa-solid fa-location-dot"></i> ' + esc(xa) + (n ? ' <span style="margin-left:auto;opacity:.6;font-size:.7rem">' + n + '</span>' : '') + '</div>';
        });
        regMenu.innerHTML = html;
        $$('.ri', regMenu).forEach(node => node.addEventListener('click', () => {
            regMenu.classList.remove('open'); regBtn.classList.remove('open'); regBtn.setAttribute('aria-expanded', 'false');
            currentView = 'region'; showMap(); openCommuneView(node.dataset.x, true);
        }));
    }
    bldRegMenu();
    function toggleRegionMenu(force) {
        const open = typeof force === 'boolean' ? force : !regMenu.classList.contains('open');
        regMenu.classList.toggle('open', open); regBtn.classList.toggle('open', open);
        regBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    regBtn.addEventListener('click', e => { e.stopPropagation(); toggleRegionMenu(); });
    if (overviewBtn) overviewBtn.addEventListener('click', e => { e.stopPropagation(); openOverview(); });
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            if (!ms.classList.contains('active')) showMap();
            setTimeout(() => { if (isMobile()) openMobileSearch(); else srInp.focus(); }, 120);
        }
    });

    /*════ SCREEN SWITCH ════*/
    function showMap() {
        hm.classList.add('hidden'); ft.classList.add('hidden'); ms.classList.add('active');
        document.body.classList.add('map-view');
        if (!mp) bldMap();
        else setTimeout(() => mp.invalidateSize(), 120);
        setTimeout(() => { if (mp) mp.invalidateSize(); }, 500);
    }
    function showHome() {
        hm.classList.remove('hidden'); ft.classList.remove('hidden'); ms.classList.remove('active');
        document.body.classList.remove('map-view'); closeDrawers(); clearHighlight(); cXa = null;
    }
    ctaBtn.addEventListener('click', showMap);
    backBtn.addEventListener('click', showHome);
    brand.addEventListener('click', showHome);
    brand.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showHome(); } });
    el('bn-home').addEventListener('click', showHome);
    el('bn-region').addEventListener('click', () => openMobileMenu('region'));
    el('bn-overview').addEventListener('click', () => openOverview());
    el('bn-search').addEventListener('click', () => openMobileSearch());
    el('bn-theme').addEventListener('click', () => applyTheme(!isDark));

    /*════ MODAL ABOUT / QR ════*/
    el('about-btn').addEventListener('click', () => {
        lastFocusEl = document.activeElement;
        am.classList.add('open'); am.setAttribute('aria-hidden', 'false');
    });
    el('am-close').addEventListener('click', () => { am.classList.remove('open'); am.setAttribute('aria-hidden', 'true'); });
    am.addEventListener('click', e => { if (e.target === am) { am.classList.remove('open'); am.setAttribute('aria-hidden', 'true'); } });
    qrDonateBtn.addEventListener('click', () => { qrModal.classList.add('open'); qrModal.setAttribute('aria-hidden', 'false'); });
    qrCloseBtn.addEventListener('click', () => { qrModal.classList.remove('open'); qrModal.setAttribute('aria-hidden', 'true'); });
    qrModal.addEventListener('click', e => { if (e.target === qrModal) { qrModal.classList.remove('open'); qrModal.setAttribute('aria-hidden', 'true'); } });

    /*════ LIGHTBOX ════*/
    let lbImages = [], lbIndex = 0;
    function openLightbox(images, index) {
        lbImages = images.slice(); lbIndex = index || 0;
        renderLightbox(); lightbox.classList.add('open'); lightbox.setAttribute('aria-hidden', 'false');
    }
    function renderLightbox() {
        if (!lbImages.length) return;
        if (lbIndex < 0) lbIndex = lbImages.length - 1;
        if (lbIndex >= lbImages.length) lbIndex = 0;
        lbImg.src = lbImages[lbIndex];
        lbCount.textContent = (lbIndex + 1) + ' / ' + lbImages.length;
        const single = lbImages.length <= 1;
        lightbox.querySelector('.lb-prev').style.display = single ? 'none' : 'flex';
        lightbox.querySelector('.lb-next').style.display = single ? 'none' : 'flex';
    }
    function closeLightbox() { lightbox.classList.remove('open'); lightbox.setAttribute('aria-hidden', 'true'); lbImg.src = ''; }
    lightbox.querySelector('.lb-close').addEventListener('click', closeLightbox);
    lightbox.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); lbIndex--; renderLightbox(); });
    lightbox.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); lbIndex++; renderLightbox(); });
    lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

    /*════ IMAGE LOADER — HỖ TRỢ NHIỀU ĐỊNH DẠNG (png, jpg, jpeg, webp, gif, avif, bmp) ════*/
    function loadImages(folder, max, cb) {
        const EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'];
        const valid = [];

        function tryImage(url) {
            return new Promise(resolve => {
                const im = new Image();
                im.onload = () => resolve(true);
                im.onerror = () => resolve(false);
                im.src = url;
            });
        }

        (async () => {
            let preferredExt = null;

            for (let i = 1; i <= max; i++) {
                let loaded = null;

                // 1) Ưu tiên thử định dạng đã biết trước đó (nhanh)
                if (preferredExt) {
                    const url = './' + folder + '/' + i + '.' + preferredExt;
                    if (await tryImage(url)) loaded = { url, i };
                }

                // 2) Nếu chưa có hoặc định dạng ưa thích thất bại → thử lần lượt các định dạng khác
                if (!loaded) {
                    for (const ext of EXTS) {
                        if (ext === preferredExt) continue;
                        const url = './' + folder + '/' + i + '.' + ext;
                        if (await tryImage(url)) {
                            loaded = { url, i };
                            preferredExt = ext; // Ghi nhớ định dạng đã thành công
                            break;
                        }
                    }
                }

                // 3) Không tìm thấy định dạng nào cho index này → dừng (ảnh thường đánh số liên tục 1..N)
                if (!loaded) break;

                valid.push(loaded);
            }

            cb(valid);
        })();
    }

    function buildSlider(container, folder, altText) {
        container.innerHTML = '<div class="no-img"><i class="fa-solid fa-spinner fa-spin"></i> ' + TXT[lg].loadingImg + '</div>';
        if (!folder) { container.innerHTML = '<div class="no-img"><i class="fa-solid fa-image"></i>' + TXT[lg].noImg + '</div>'; return; }
        loadImages(folder, 10, valid => {
            if (!valid.length) { container.innerHTML = '<div class="no-img"><i class="fa-solid fa-image"></i>' + TXT[lg].noImg + '</div>'; return; }
            let html = '';
            valid.forEach((v, i) => { html += '<img src="' + v.url + '" alt="' + esc(altText) + ' - ' + (lg === 'en' ? 'image' : 'ảnh') + ' ' + (i + 1) + '" loading="lazy"' + (i === 0 ? ' class="active"' : '') + ' data-idx="' + i + '">'; });
            html += '<div class="img-counter" style="display:none;">1 / ' + valid.length + '</div>';
            container.innerHTML = html;
            const imgs = $$('img', container);
            const counter = container.querySelector('.img-counter');
            counter.style.display = valid.length > 1 ? 'block' : 'none';
            if (valid.length > 1) {
                const dotsNav = document.createElement('div');
                dotsNav.className = 'slider-nav';
                let dh = '';
                valid.forEach((_, i) => { dh += '<span class="slider-dot' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '"></span>'; });
                dotsNav.innerHTML = dh; container.appendChild(dotsNav);
                const prev = document.createElement('button'); prev.className = 'slider-arrow prev'; prev.type = 'button'; prev.innerHTML = '‹';
                const next = document.createElement('button'); next.className = 'slider-arrow next'; next.type = 'button'; next.innerHTML = '›';
                container.appendChild(prev); container.appendChild(next);
                let cur = 0;
                const go = n => {
                    if (n < 0) n = imgs.length - 1;
                    if (n >= imgs.length) n = 0;
                    imgs.forEach(im => im.classList.remove('active'));
                    $$('.slider-dot', container).forEach(d => d.classList.remove('active'));
                    imgs[n].classList.add('active');
                    const dot = container.querySelector('.slider-dot[data-idx="' + n + '"]');
                    if (dot) dot.classList.add('active');
                    cur = n; counter.textContent = (n + 1) + ' / ' + imgs.length;
                };
                prev.addEventListener('click', e => { e.stopPropagation(); go(cur - 1); });
                next.addEventListener('click', e => { e.stopPropagation(); go(cur + 1); });
                $$('.slider-dot', container).forEach(d => d.addEventListener('click', () => go(+d.dataset.idx)));
            }
            imgs.forEach((im, i) => im.addEventListener('click', () => openLightbox(valid.map(v => v.url), i)));
        });
    }

    /*════ AUDIO PLAYER ════*/
    const AudioPlayer = (function () {
        let currentAudio = null, currentBtn = null, toastTimer = null, currentRec = null, apVolume = .8, apBarMode = 'hidden';
        const toastEl = el('audio-toast'), apBar = el('ap-bar'), apArt = el('ap-art'), apTitle = el('ap-title'), apSub = el('ap-sub');
        const apMiniTitle = el('ap-mini-title'), apMiniSeek = el('ap-mini-seek'), apMiniFill = el('ap-mini-fill'), apMiniKnob = el('ap-mini-knob');
        const apMiniTime = el('ap-mini-time'), apMiniClose = el('ap-mini-close'), apWave = el('ap-wave');
        const apSeekTrack = el('ap-seek-track'), apSeekFill = el('ap-seek-fill'), apSeekKnob = el('ap-seek-knob');
        const apTimeCur = el('ap-time-cur'), apTimeDur = el('ap-time-dur');
        const apVolTrack = el('ap-vol-track'), apVolFill = el('ap-vol-fill'), apVolKnob = el('ap-vol-knob'), apVolIcon = el('ap-vol-icon');
        const apBtnPlay = el('ap-btn-play'), apIconPlay = el('ap-icon-play'), apIconPause = el('ap-icon-pause');
        const apBtnPlayM = el('ap-btn-play-mini'), apIconPlayM = el('ap-icon-play-mini'), apIconPauseM = el('ap-icon-pause-mini');
        const waveBars = apWave ? apWave.querySelectorAll('span') : [];
        let audioCtx = null, analyser = null, audioSrcNode = null, animFrameId = null;
        let isSeeking = false, isSeekingMini = false, dragRatio = -1, dragRatioMini = -1;
        let pendingSeekListener = null, seekClearTimer = null, pendingSeekListenerMini = null, seekClearTimerMini = null;
        let seekLockTarget = null, seekLockExpiry = 0;

        function initAudioContext(a) {
            if (audioCtx || !a) return;
            try {
                const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
                audioCtx = new AC(); analyser = audioCtx.createAnalyser(); analyser.fftSize = 64; analyser.smoothingTimeConstant = .8;
                audioSrcNode = audioCtx.createMediaElementSource(a); audioSrcNode.connect(analyser); analyser.connect(audioCtx.destination);
            } catch (e) { }
        }
        function renderVisualizer() {
            if (!analyser || !currentAudio || currentAudio.paused) { if (animFrameId) cancelAnimationFrame(animFrameId); animFrameId = null; return; }
            const bufLen = analyser.frequencyBinCount, arr = new Uint8Array(bufLen);
            analyser.getByteFrequencyData(arr);
            if (waveBars && waveBars.length) {
                const step = Math.max(1, Math.floor(bufLen / (waveBars.length + 1)));
                let sumBass = 0;
                for (let i = 0; i < waveBars.length; i++) {
                    const val = arr[i * step + 1] || 0;
                    const h = Math.max(3, Math.min(18, (val / 255) * 18));
                    waveBars[i].style.height = h + 'px';
                    if (i < 2) sumBass += val;
                }
                const bassRatio = sumBass / (2 * 255);
                if (apBar) apBar.style.setProperty('--liquid-pulse', (1 + bassRatio * .05).toFixed(3));
            }
            animFrameId = requestAnimationFrame(renderVisualizer);
        }
        function startVisualizer() {
            if (currentAudio) initAudioContext(currentAudio);
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => { });
            if (analyser && !animFrameId) animFrameId = requestAnimationFrame(renderVisualizer);
        }
        function stopVisualizer() {
            if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
            if (waveBars) waveBars.forEach(b => b.style.height = '');
            if (apBar) apBar.style.removeProperty('--liquid-pulse');
        }
        const fmt = s => { if (!isFinite(s)) return '0:00'; const m = Math.floor(s / 60); return m + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
        function showToast(msg, icon) {
            if (!toastEl) return;
            toastEl.innerHTML = '<i class="fa-solid ' + (icon || 'fa-circle-info') + '"></i><span>' + esc(msg) + '</span>';
            toastEl.classList.add('show');
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
        }
        function setBtnState(btn, state) {
            if (!btn) return;
            btn.classList.remove('idle', 'loading', 'playing'); btn.classList.add(state);
            const icon = btn.querySelector('.audio-btn__icon i'); const tooltip = btn.querySelector('.audio-btn__tooltip');
            if (state === 'loading') { if (icon) icon.className = 'fa-solid fa-circle-notch fa-spin'; if (tooltip) tooltip.textContent = lg === 'en' ? 'Loading...' : 'Đang tải...'; btn.setAttribute('aria-label', lg === 'en' ? 'Loading audio' : 'Đang tải âm thanh'); }
            else if (state === 'playing') { if (icon) icon.className = 'fa-solid fa-pause'; if (tooltip) tooltip.textContent = lg === 'en' ? 'Pause' : 'Tạm dừng'; btn.setAttribute('aria-label', lg === 'en' ? 'Pause' : 'Tạm dừng'); }
            else { if (icon) icon.className = 'fa-solid fa-play'; if (tooltip) tooltip.textContent = lg === 'en' ? 'Listen to heritage melody' : 'Nghe giai điệu di sản'; btn.setAttribute('aria-label', lg === 'en' ? 'Listen to heritage melody' : 'Nghe giai điệu di sản'); }
        }
        function applyMiniStyles() {
            const isMini = apBarMode === 'mini';
            ['.ap-wc-btns', '.ap-body', '.ap-progress-row', '.ap-volume-row'].forEach(sel => {
                const elm = apBar.querySelector(':scope > ' + sel);
                if (elm) elm.style.display = isMini ? 'none' : '';
            });
            const miniRow = apBar.querySelector(':scope > .ap-mini-row');
            if (miniRow) miniRow.style.display = isMini ? 'flex' : '';
            if (!apBar.classList.contains('ap-hidden')) apBar.style.pointerEvents = 'auto';
            else apBar.style.pointerEvents = '';
        }
        function showBar(mode) {
            const prevMode = apBarMode;
            apBarMode = mode || 'full';
            apBar.classList.remove('ap-hidden', 'ap-mini');
            if (prevMode !== apBarMode) { apBar.style.left = ''; apBar.style.top = ''; apBar.style.right = ''; apBar.style.bottom = ''; apBar.style.transform = ''; }
            if (apBarMode === 'mini') { apBar.classList.add('ap-mini'); document.body.classList.add('ap-mini-active'); updateMiniUI(); }
            else document.body.classList.remove('ap-mini-active');
            applyMiniStyles(); clampBarPos();
        }
        function hideBar() {
            apBarMode = 'hidden'; apBar.classList.add('ap-hidden'); apBar.classList.remove('ap-mini');
            document.body.classList.remove('ap-mini-active'); applyMiniStyles(); stopVisualizer();
        }
        function toggleMini() {
            if (apBarMode === 'mini') showBar('full'); else showBar('mini');
        }
        function updateBarMeta(rec) {
            if (!rec) return;
            const folder = rec.imageFolder || rec.id;
            const defaultSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23222"/><circle cx="50" cy="50" r="20" fill="%23b8860b"/><circle cx="50" cy="50" r="6" fill="%23fff"/></svg>';
            apArt.src = defaultSvg;
            if (typeof loadImages === 'function' && folder) loadImages(folder, 10, valid => { if (valid && valid.length) apArt.src = valid[0].url; });
            const name = lg === 'en' ? (rec.n_en || rec.n) : rec.n;
            const shortName = name.length > 36 ? name.substring(0, 34) + '…' : name;
            apTitle.textContent = shortName; apTitle.title = name;
            apMiniTitle.textContent = shortName; apMiniTitle.title = name;
            apSub.textContent = lg === 'en' ? (rec.category_en || rec.category) : (rec.category || (rec.level === 'UNESCO' ? 'Di sản UNESCO' : 'Di sản Quốc gia'));
        }
        function syncPlayUI(playing) {
            apIconPlay.style.display = playing ? 'none' : ''; apIconPause.style.display = playing ? '' : 'none';
            apIconPlayM.style.display = playing ? 'none' : ''; apIconPauseM.style.display = playing ? '' : 'none';
            apWave.classList.toggle('ap-wave-paused', !playing);
            apArt.classList.toggle('ap-playing', playing);
            apBar.classList.toggle('ap-playing-glow', playing);
            if (playing) startVisualizer(); else stopVisualizer();
            if (currentBtn) setBtnState(currentBtn, playing ? 'playing' : 'idle');
            if (modalAudioBtn && modalAudioBtn._url && currentAudio && modalAudioBtn._url === currentAudio._url) setBtnState(modalAudioBtn, playing ? 'playing' : 'idle');
        }
        function lockSeekTo(t) { seekLockTarget = t; seekLockExpiry = Date.now() + 3000; }
        function unlockSeek() { seekLockTarget = null; seekLockExpiry = 0; }
        function isSeekLocked() {
            if (seekLockTarget === null) return false;
            if (Date.now() > seekLockExpiry) { seekLockTarget = null; seekLockExpiry = 0; return false; }
            return true;
        }
        function updateProgress() {
            if (!currentAudio) return;
            if (currentAudio.seeking || isSeeking || isSeekingMini) return;
            if (isSeekLocked()) {
                const cur = currentAudio.currentTime || 0;
                if (Math.abs(cur - seekLockTarget) > .5) return;
                unlockSeek();
            }
            const cur = currentAudio.currentTime || 0, dur = currentAudio.duration || 0;
            const pct = dur ? (cur / dur) * 100 : 0;
            apSeekFill.style.width = pct + '%'; apSeekKnob.style.left = pct + '%';
            apTimeCur.textContent = fmt(cur); apTimeDur.textContent = '-' + fmt(Math.max(0, dur - cur));
            if (apMiniFill) { apMiniFill.style.width = pct + '%'; apMiniKnob.style.left = pct + '%'; if (apMiniTime) apMiniTime.textContent = fmt(cur); }
        }
        function updateMiniUI() {
            if (currentAudio && apMiniFill) {
                const cur = currentAudio.currentTime || 0, dur = currentAudio.duration || 0;
                const pct = dur ? (cur / dur) * 100 : 0;
                apMiniFill.style.width = pct + '%'; apMiniKnob.style.left = pct + '%';
                if (apMiniTime) apMiniTime.textContent = fmt(cur);
            }
        }
        function applyVolume(v) {
            apVolume = Math.max(0, Math.min(1, v));
            if (currentAudio) currentAudio.volume = apVolume;
            apVolFill.style.width = (apVolume * 100) + '%'; apVolKnob.style.left = (apVolume * 100) + '%';
            if (apVolume === 0) apVolIcon.className = 'fa-solid fa-volume-xmark ap-vol-icon';
            else if (apVolume < .5) apVolIcon.className = 'fa-solid fa-volume-low ap-vol-icon';
            else apVolIcon.className = 'fa-solid fa-volume-high ap-vol-icon';
        }
        function doProgrammaticSeek(target) {
            if (!currentAudio || !isFinite(currentAudio.duration)) return;
            const dur = currentAudio.duration;
            target = Math.max(0, Math.min(dur, target));
            const pct = (target / dur) * 100;
            apSeekFill.style.width = pct + '%'; apSeekKnob.style.left = pct + '%';
            apTimeCur.textContent = fmt(target); apTimeDur.textContent = '-' + fmt(Math.max(0, dur - target));
            if (apMiniFill) { apMiniFill.style.width = pct + '%'; apMiniKnob.style.left = pct + '%'; if (apMiniTime) apMiniTime.textContent = fmt(target); }
            lockSeekTo(target);
            try { currentAudio.currentTime = target; } catch (e) { unlockSeek(); }
        }
        function cancelPendingSeek(a) {
            if (pendingSeekListener && a) try { a.removeEventListener('seeked', pendingSeekListener); } catch (e) { }
            pendingSeekListener = null;
            if (seekClearTimer) { clearTimeout(seekClearTimer); seekClearTimer = null; }
        }
        function cancelPendingSeekMini(a) {
            if (pendingSeekListenerMini && a) try { a.removeEventListener('seeked', pendingSeekListenerMini); } catch (e) { }
            pendingSeekListenerMini = null;
            if (seekClearTimerMini) { clearTimeout(seekClearTimerMini); seekClearTimerMini = null; }
        }
        function getClientX(e) {
            if (e.touches && e.touches[0]) return e.touches[0].clientX;
            if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientX;
            return e.clientX;
        }
        function bindProSlider(trackEl, opts) {
            if (!trackEl) return;
            const onStart = opts.onStart || (() => { }), onDrag = opts.onDrag || (() => { }), onEnd = opts.onEnd || (() => { });
            function handleDown(e) {
                if (e.button !== undefined && e.button !== 0 && e.type === 'mousedown') return;
                e.preventDefault(); e.stopPropagation();
                trackEl.classList.add('dragging'); onStart();
                const rect = trackEl.getBoundingClientRect();
                const computeRatio = x => Math.max(0, Math.min(1, (x - rect.left) / rect.width));
                onDrag(computeRatio(getClientX(e)));
                function onMove(ev) { if (ev.cancelable) ev.preventDefault(); onDrag(computeRatio(getClientX(ev))); }
                function onUp() {
                    trackEl.classList.remove('dragging'); onEnd();
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.removeEventListener('touchmove', onMove);
                    document.removeEventListener('touchend', onUp);
                    document.removeEventListener('touchcancel', onUp);
                }
                document.addEventListener('mousemove', onMove, { passive: false });
                document.addEventListener('mouseup', onUp);
                document.addEventListener('touchmove', onMove, { passive: false });
                document.addEventListener('touchend', onUp);
                document.addEventListener('touchcancel', onUp);
            }
            trackEl.addEventListener('mousedown', handleDown);
            trackEl.addEventListener('touchstart', handleDown, { passive: false });
        }
        /*── TUA THEO THỜI GIAN THỰC (REAL-TIME SCRUBBING) ──
          Âm thanh được nhảy tới vị trí mới ngay trong lúc kéo thanh tua.
          Mỗi lần chỉ gửi 1 lệnh seek; lệnh kế tiếp được gửi khi trình duyệt báo 'seeked'
          (hoặc sau 250ms nếu sự kiện bị trễ) để tránh dồn lệnh gây giật/treo âm thanh. */
        const scrub = { audio: null, target: -1, inFlight: false, inFlightAt: 0 };
        function paintProgress(t, dur) {
            const pct = dur ? (t / dur) * 100 : 0;
            apSeekFill.style.width = pct + '%'; apSeekKnob.style.left = pct + '%';
            apTimeCur.textContent = fmt(t); apTimeDur.textContent = '-' + fmt(Math.max(0, dur - t));
            if (apMiniFill) { apMiniFill.style.width = pct + '%'; apMiniKnob.style.left = pct + '%'; if (apMiniTime) apMiniTime.textContent = fmt(t); }
        }
        function setProgressTransition(v) {
            apSeekFill.style.transition = v; apSeekKnob.style.transition = v;
            if (apMiniFill) { apMiniFill.style.transition = v; apMiniKnob.style.transition = v; }
        }
        function flushScrub() {
            const a = scrub.audio;
            if (!a || a !== currentAudio || scrub.target < 0) return;
            if (scrub.inFlight && Date.now() - scrub.inFlightAt < 250) return;
            if (Math.abs((a.currentTime || 0) - scrub.target) < 0.05) { scrub.inFlight = false; return; }
            scrub.inFlight = true; scrub.inFlightAt = Date.now();
            try { a.currentTime = scrub.target; } catch (e) { scrub.inFlight = false; }
        }
        function onScrubSeeked() { scrub.inFlight = false; flushScrub(); }
        function resetScrub() {
            if (scrub.audio) scrub.audio.removeEventListener('seeked', onScrubSeeked);
            scrub.audio = null; scrub.target = -1; scrub.inFlight = false; scrub.inFlightAt = 0;
        }
        function startScrub() {
            const a = currentAudio;
            resetScrub();
            if (!a) return;
            cancelPendingSeek(a); cancelPendingSeekMini(a); unlockSeek();
            scrub.audio = a; isSeeking = true;
            a.addEventListener('seeked', onScrubSeeked);
            setProgressTransition('none');
        }
        function moveScrub(ratio) {
            const a = scrub.audio;
            if (!a || a !== currentAudio || !isFinite(a.duration) || a.duration <= 0) return;
            const t = ratio * a.duration;
            scrub.target = t;
            paintProgress(t, a.duration);
            flushScrub();
        }
        function endScrub() {
            const a = scrub.audio, t = scrub.target;
            setProgressTransition('');
            resetScrub();
            if (!a || a !== currentAudio || t < 0 || !isFinite(a.duration)) { isSeeking = false; unlockSeek(); return; }
            paintProgress(t, a.duration);
            lockSeekTo(t);
            try { if (Math.abs((a.currentTime || 0) - t) > 0.05) a.currentTime = t; } catch (e) { unlockSeek(); }
            isSeeking = false;
        }
        const scrubHandlers = { onStart: startScrub, onDrag: moveScrub, onEnd: endScrub };
        bindProSlider(apSeekTrack, scrubHandlers);
        if (apMiniSeek) bindProSlider(apMiniSeek, scrubHandlers);
        bindProSlider(apVolTrack, { onDrag: ratio => applyVolume(ratio) });
        function togglePlayPause() {
            if (!currentAudio) return;
            if (currentAudio.paused) { const p = currentAudio.play(); if (p && p.catch) p.catch(() => { }); }
            else currentAudio.pause();
        }
        function bindPlayButton(btn) {
            if (!btn) return;
            btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); togglePlayPause(); });
        }
        bindPlayButton(apBtnPlay); bindPlayButton(apBtnPlayM);
        el('ap-btn-rew').addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            if (!currentAudio) return;
            const dur = currentAudio.duration; if (!isFinite(dur) || dur <= 0) return;
            doProgrammaticSeek(currentAudio.currentTime - 10);
        });
        el('ap-btn-fwd').addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            if (!currentAudio) return;
            const dur = currentAudio.duration; if (!isFinite(dur) || dur <= 0) return;
            doProgrammaticSeek(currentAudio.currentTime + 10);
        });
        el('ap-btn-close').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); stop(); hideBar(); });
        el('ap-btn-mini').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleMini(); });
        el('ap-btn-full').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleMini(); });
        function openCurrentHeritageModal() { if (currentRec && typeof openHeritage === 'function') openHeritage(currentRec); }
        apArt.addEventListener('click', openCurrentHeritageModal);
        apTitle.addEventListener('click', openCurrentHeritageModal);
        apMiniTitle.addEventListener('click', () => { if (apJustDragged) return; if (apBarMode === 'mini') showBar('full'); });
        if (apMiniClose) apMiniClose.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); stop(); hideBar(); });
        apBar.addEventListener('pointermove', e => {
            const r = apBar.getBoundingClientRect();
            apBar.style.setProperty('--glass-x', (e.clientX - r.left) + 'px');
            apBar.style.setProperty('--glass-y', (e.clientY - r.top) + 'px');
        });
        apBar.addEventListener('pointerleave', () => { apBar.style.removeProperty('--glass-x'); apBar.style.removeProperty('--glass-y'); });
        let apDragging = false, apDragSX, apDragSY, apStartL, apStartT, apJustDragged = false;
        const isDesktop = () => window.innerWidth > 768;
        function clampBarPos() {
            if (!isDesktop()) return;
            const r = apBar.getBoundingClientRect();
            const maxL = window.innerWidth - apBar.offsetWidth - 8, maxT = window.innerHeight - apBar.offsetHeight - 8;
            const curL = parseFloat(apBar.style.left) || r.left, curT = parseFloat(apBar.style.top) || r.top;
            if (apBar.style.left) { apBar.style.left = Math.max(8, Math.min(curL, maxL)) + 'px'; apBar.style.top = Math.max(8, Math.min(curT, maxT)) + 'px'; }
        }
        function apStartDrag(e) {
            if (!isDesktop()) return;
            if (e.target.closest('button, .ap-btn, .ap-seek-track, .ap-vol-track, .ap-wc-btn, .ap-mini-seek, .ap-mini-close, .ap-mini-play, .ap-info, .ap-art, .ap-title, .ap-sub, .ap-mini-main')) return;
            if (e.button !== 0 && e.type === 'mousedown') return;
            e.preventDefault(); apDragging = true; apJustDragged = false;
            apBar.classList.add('ap-dragging');
            const r = apBar.getBoundingClientRect();
            apBar.style.transform = 'none'; apBar.style.left = r.left + 'px'; apBar.style.top = r.top + 'px'; apBar.style.right = 'auto'; apBar.style.bottom = 'auto';
            apDragSX = e.clientX; apDragSY = e.clientY; apStartL = r.left; apStartT = r.top;
        }
        function apOnDrag(e) {
            if (!apDragging) return;
            e.preventDefault();
            const dx = e.clientX - apDragSX;
            if (Math.abs(dx) > 5) apJustDragged = true;
            if (apBarMode === 'mini') {
                const nL = Math.max(8, Math.min(apStartL + dx, window.innerWidth - apBar.offsetWidth - 8));
                apBar.style.left = nL + 'px';
            } else {
                const dy = e.clientY - apDragSY;
                const nL = Math.max(8, Math.min(apStartL + dx, window.innerWidth - apBar.offsetWidth - 8));
                const nT = Math.max(8, Math.min(apStartT + dy, window.innerHeight - apBar.offsetHeight - 8));
                apBar.style.left = nL + 'px'; apBar.style.top = nT + 'px';
            }
        }
        function apEndDrag() {
            if (!apDragging) return;
            apDragging = false; apBar.classList.remove('ap-dragging');
            if (apJustDragged) setTimeout(() => { apJustDragged = false; }, 150);
        }
        apBar.addEventListener('mousedown', apStartDrag);
        document.addEventListener('mousemove', apOnDrag);
        document.addEventListener('mouseup', apEndDrag);
        document.addEventListener('keydown', e => {
            if (apBarMode === 'hidden') return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            if (e.code === 'Space') { e.preventDefault(); togglePlayPause(); }
            if (e.code === 'ArrowLeft') { if (currentAudio) doProgrammaticSeek(currentAudio.currentTime - 5); }
            if (e.code === 'ArrowRight') { if (currentAudio) doProgrammaticSeek(currentAudio.currentTime + 5); }
        });
        function stop() {
            cancelPendingSeek(currentAudio); cancelPendingSeekMini(currentAudio); resetScrub(); setProgressTransition('');
            isSeeking = false; isSeekingMini = false; dragRatio = -1; dragRatioMini = -1; unlockSeek(); stopVisualizer();
            if (currentAudio) {
                try {
                    currentAudio.pause(); currentAudio.currentTime = 0;
                    currentAudio.onplaying = null; currentAudio.onpause = null; currentAudio.onended = null; currentAudio.onerror = null; currentAudio.ontimeupdate = null;
                    currentAudio.removeAttribute('src'); currentAudio.load();
                } catch (e) { }
                currentAudio = null;
            }
            if (currentBtn) { setBtnState(currentBtn, 'idle'); currentBtn = null; }
            if (modalAudioBtn) setBtnState(modalAudioBtn, 'idle');
            syncPlayUI(false); updateProgress(); currentRec = null;
        }
        function isPlayingFor(url) {
            if (!currentAudio || currentAudio.paused || !currentAudio._url) return false;
            return currentAudio._url === url || currentAudio.src.indexOf(url) !== -1;
        }
        function toggle(url, btn, rec) {
            if (!url) return;
            if (btn && btn.classList.contains('loading')) return;
            if (currentAudio && currentAudio._url === url) {
                if (currentAudio.paused) { const p = currentAudio.play(); if (p && p.catch) p.catch(() => syncPlayUI(false)); }
                else currentAudio.pause();
                return;
            }
            stop(); currentBtn = btn; currentRec = rec || currentHeritage || null;
            if (btn) setBtnState(btn, 'loading');
            updateBarMeta(currentRec); applyVolume(apVolume);
            showBar(apBarMode === 'mini' ? 'mini' : 'full');
            const audio = new Audio(); audio.preload = 'auto'; audio.volume = apVolume; audio._url = url; audio.src = url; currentAudio = audio;
            audio.ontimeupdate = updateProgress;
            audio.onloadedmetadata = updateProgress;
            audio.onplaying = () => { if (currentAudio !== audio) return; syncPlayUI(true); };
            audio.onpause = () => { if (currentAudio !== audio) return; syncPlayUI(false); };
            audio.onended = () => { if (currentAudio !== audio) return; syncPlayUI(false); try { audio.currentTime = 0; } catch (e) { } updateProgress(); };
            audio.onerror = () => { if (currentAudio !== audio) return; stop(); hideBar(); showToast(lg === 'en' ? 'No audio recording available for this heritage' : 'Chưa có bản ghi âm cho di sản này', 'fa-music'); };
            const p = audio.play();
            if (p && p.catch) p.catch(err => {
                if (currentAudio !== audio) return;
                if (err && err.name === 'NotSupportedError') { stop(); hideBar(); showToast(lg === 'en' ? 'No audio recording available for this heritage' : 'Chưa có bản ghi âm cho di sản này', 'fa-music'); }
            });
        }
        applyVolume(apVolume);
        return { toggle, stop, setBtnState, isPlayingFor, showBar, hideBar, toggleMini };
    })();
    modalAudioBtn.addEventListener('click', () => {
        if (modalAudioBtn._url) AudioPlayer.toggle(modalAudioBtn._url, modalAudioBtn, modalAudioBtn._rec || currentHeritage);
    });

    /*════ HERITAGE MODAL ════*/
    function openHeritage(rec) {
        if (!rec) return;
        currentHeritage = rec;
        el('modal-name').textContent = lg === 'en' ? (rec.n_en || rec.n) : rec.n;
        const levelEl = el('modal-level');
        if (rec.level === 'UNESCO') { levelEl.className = 'level-badge level-unesco'; levelEl.innerHTML = '<i class="fa-solid fa-globe"></i> ' + TXT[lg].lblLevelUnesco; }
        else { levelEl.className = 'level-badge level-national'; levelEl.innerHTML = '<i class="fa-solid fa-landmark"></i> ' + TXT[lg].lblLevelNational; }
        el('modal-category').textContent = lg === 'en' ? (rec.category_en || rec.category || '—') : (rec.category || '—');
        el('modal-year').textContent = rec.year ? String(rec.year) : '—';
        const locEl = el('modal-loc');
        if (rec.locations && rec.locations.length) { locEl.innerHTML = '<div class="loc-list">' + rec.locations.map(loc => '<span class="loc-chip">' + esc(loc) + '</span>').join('') + '</div>'; }
        else locEl.innerHTML = '<div class="loc-list"><span class="loc-chip unknown">' + TXT[lg].unknownLoc + '</span></div>';
        const decEl = el('modal-decision');
        if (rec.decision) { decEl.classList.remove('muted'); decEl.textContent = rec.decision; }
        else { decEl.classList.add('muted'); decEl.textContent = TXT[lg].noDecision; }
        const descEl = el('modal-desc');
        const desc = lg === 'en' ? (rec.description_en || rec.description) : rec.description;
        if (desc && desc.trim()) { descEl.textContent = desc; descEl.classList.remove('muted'); descEl.style.whiteSpace = 'pre-wrap'; }
        else { descEl.textContent = TXT[lg].noDesc; descEl.classList.add('muted'); }
        const sourceEl = el('modal-image-source');
        const imgSources = [];
        if (Array.isArray(rec.imageSources) && rec.imageSources.length) rec.imageSources.forEach(s => { if (s && String(s).trim()) imgSources.push(String(s).trim()); });
        if (!imgSources.length) {
            if (rec.imageCaption && String(rec.imageCaption).trim()) imgSources.push(String(rec.imageCaption).trim());
            if (rec.imageCaption2 && String(rec.imageCaption2).trim()) imgSources.push(String(rec.imageCaption2).trim());
        }
        if (imgSources.length === 0) {
            if (rec.sourceDoc && String(rec.sourceDoc).trim()) { sourceEl.textContent = (lg === 'en' ? 'Source document: ' : 'Nguồn tư liệu: ') + rec.sourceDoc; sourceEl.classList.remove('muted'); sourceEl.style.whiteSpace = 'pre-wrap'; }
            else { sourceEl.textContent = TXT[lg].noImgSrc; sourceEl.classList.add('muted'); sourceEl.style.whiteSpace = ''; }
        } else if (imgSources.length === 1) {
            sourceEl.textContent = imgSources[0]; sourceEl.classList.remove('muted'); sourceEl.style.whiteSpace = 'pre-wrap';
        } else {
            sourceEl.innerHTML = '<ol class="source-list">' + imgSources.map((s, i) => '<li><span class="src-idx">' + (i + 1) + '</span><span class="src-text">' + esc(s) + '</span></li>').join('') + '</ol>';
            sourceEl.classList.remove('muted'); sourceEl.style.whiteSpace = '';
        }
        const imgSliderEl = heritageModal.querySelector('.img-slider');
        let capEl = imgSliderEl.querySelector('.heritage-caption');
        if (capEl) capEl.remove();
        if (rec.imageCaption && rec.imageCaption.trim()) {
            capEl = document.createElement('div');
            capEl.className = 'heritage-caption';
            capEl.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:8px 14px;background:rgba(0,0,0,0.62);color:#F7F1E5;font-size:0.72rem;font-style:italic;line-height:1.4;text-align:center;';
            capEl.textContent = rec.imageCaption;
            imgSliderEl.appendChild(capEl);
        }
        const imgSlider = heritageModal.querySelector('.img-slider');
        const folderName = rec.imageFolder || rec.id;
        buildSlider(imgSlider, folderName, lg === 'en' ? (rec.n_en || rec.n) : rec.n);
        const audioUrl = getAudioUrlFor(rec);
        if (audioUrl) {
            modalAudioBtn.style.display = 'inline-flex'; modalAudioBtn._url = audioUrl; modalAudioBtn._rec = rec;
            if (AudioPlayer.isPlayingFor(audioUrl)) AudioPlayer.setBtnState(modalAudioBtn, 'playing');
            else AudioPlayer.setBtnState(modalAudioBtn, 'idle');
        } else { modalAudioBtn.style.display = 'none'; modalAudioBtn._url = null; modalAudioBtn._rec = null; }
        heritageModal.classList.add('open'); heritageModal.setAttribute('aria-hidden', 'false');
        heritageModal.querySelector('.modal-content').scrollTop = 0;
        lastFocusEl = document.activeElement;
    }
    function closeHeritage() {
        modalAudioBtn._url = null; modalAudioBtn._rec = null; currentHeritage = null;
        heritageModal.classList.remove('open'); heritageModal.setAttribute('aria-hidden', 'true');
        const imgSlider = heritageModal.querySelector('.img-slider');
        imgSlider.innerHTML = '<div class="no-img"><i class="fa-solid fa-spinner fa-spin"></i> ' + TXT[lg].loadingImg + '</div>';
    }
    heritageModal.querySelector('.modal-close').addEventListener('click', closeHeritage);
    heritageModal.addEventListener('click', e => { if (e.target === heritageModal) closeHeritage(); });

    /*════ MOBILE SEARCH ════*/
    const mSearchOverlay = el('mobile-search-overlay'), mSearchInp = el('m-search-inp'), mSearchBody = el('m-search-body');
    const mSearchBack = el('m-search-back'), mSearchClear = el('m-search-clear'), mobileSearchBtn = el('mobile-search-btn');
    function openMobileSearch() {
        if (!mSearchOverlay) return;
        mSearchOverlay.classList.add('open'); mSearchOverlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setTimeout(() => { try { mSearchInp.focus(); } catch (e) { } }, 100);
        renderMobileSearch('');
    }
    function closeMobileSearch() {
        if (!mSearchOverlay) return;
        mSearchOverlay.classList.remove('open'); mSearchOverlay.setAttribute('aria-hidden', 'true');
        mSearchInp.value = ''; try { mSearchInp.blur(); } catch (e) { }
        document.body.style.overflow = '';
    }
    function renderMobileSearch(q) {
        if (!mSearchBody) return;
        const ql = norm(q);
        let results;
        if (!ql) results = srIdx.filter(it => it.type === 'xa').slice(0, 60);
        else results = srIdx.filter(it => norm(it.n).indexOf(ql) !== -1 || (it.n_en && norm(it.n_en).indexOf(ql) !== -1)).slice(0, 40);
        if (!results.length) { mSearchBody.innerHTML = '<div class="m-empty"><i class="fa-solid fa-magnifying-glass"></i><p>' + esc(TXT[lg].noResult) + '</p></div>'; return; }
        mSearchBody.innerHTML = results.map((r, i) => {
            let extra = '';
            if (r.type === 'disan') extra = ' · ' + r.rec.year + ' · ' + (r.rec.level === 'UNESCO' ? 'UNESCO' : (lg === 'en' ? 'National' : 'QG'));
            const displayName = lg === 'en' && r.n_en ? r.n_en : r.n;
            return '<div class="m-result" data-idx="' + i + '" role="button" tabindex="0"><div class="m-result-icon">' + r.ic + '</div><div class="m-result-info"><div class="m-result-name">' + esc(displayName) + esc(extra) + '</div><div class="m-result-meta">' + esc(typeLabel(r.type)) + '</div></div><i class="fa-solid fa-chevron-right m-result-go"></i></div>';
        }).join('');
        $$('.m-result', mSearchBody).forEach(node => {
            const fire = () => {
                const r = results[+node.dataset.idx]; if (!r) return;
                closeMobileSearch(); handleSearchPick(r);
            };
            node.addEventListener('click', fire);
            node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
        });
    }
    if (mobileSearchBtn) mobileSearchBtn.addEventListener('click', openMobileSearch);
    if (mSearchBack) mSearchBack.addEventListener('click', closeMobileSearch);
    if (mSearchClear) mSearchClear.addEventListener('click', () => { mSearchInp.value = ''; renderMobileSearch(''); try { mSearchInp.focus(); } catch (e) { } });
    if (mSearchInp) mSearchInp.addEventListener('input', () => renderMobileSearch(mSearchInp.value));

    /*════ MOBILE MENU ════*/
    const mobileMenuDrawer = el('mobile-menu-drawer'), mobileMenuBtn = el('mobile-menu-btn');
    const mobileMenuClose = el('m-drawer-close'), mobileMenuBackdrop = el('m-drawer-backdrop'), mobileMenuBody = el('m-drawer-body');
    function openMobileMenu(scrollTo) {
        if (!mobileMenuDrawer) return;
        mobileMenuDrawer.classList.add('open'); mobileMenuDrawer.setAttribute('aria-hidden', 'false');
        if (scrollTo === 'region') setTimeout(() => {
            const regSection = mobileMenuBody.querySelector('.m-menu-section[data-region]');
            if (regSection) regSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }
    function closeMobileMenu() {
        if (!mobileMenuDrawer) return;
        mobileMenuDrawer.classList.remove('open'); mobileMenuDrawer.setAttribute('aria-hidden', 'true');
    }
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => openMobileMenu());
    if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMobileMenu);
    if (mobileMenuBackdrop) mobileMenuBackdrop.addEventListener('click', closeMobileMenu);
    function buildMobileMenuBody() {
        if (!mobileMenuBody) return;
        let html = '';
        html += '<div class="m-menu-section"><div class="m-menu-label">' + (lg === 'en' ? 'Catalogue' : 'Danh mục') + '</div><button class="m-menu-item" id="m-overview-item" type="button"><i class="fa-solid fa-layer-group"></i><span>' + (lg === 'en' ? 'Overview — Heritage catalogue' : 'Tổng quát — Danh mục di sản') + '</span><i class="fa-solid fa-chevron-right m-menu-arrow"></i></button></div>';
        html += '<div class="m-menu-section"><div class="m-menu-label">' + (lg === 'en' ? 'Quick Links' : 'Liên kết nhanh') + '</div><a class="m-menu-item" href="https://sachdoc.pages.dev/" target="_blank" rel="noopener noreferrer" style="text-decoration:none;"><i class="fa-solid fa-book-open"></i><span>' + (lg === 'en' ? 'Heritage Book' : 'Cuốn sách di sản') + '</span><i class="fa-solid fa-arrow-up-right-from-square m-menu-arrow"></i></a><a class="m-menu-item" href="http://thainguyentravel.pages.dev/" target="_blank" rel="noopener noreferrer" style="text-decoration:none;"><i class="fa-solid fa-plane-departure"></i><span>' + (lg === 'en' ? 'Thai Nguyen Travel' : 'Thái Nguyên Travel') + '</span><i class="fa-solid fa-arrow-up-right-from-square m-menu-arrow"></i></a></div>';
        html += '<div class="m-menu-section"><div class="m-menu-label">' + (lg === 'en' ? 'Display' : 'Hiển thị') + '</div><button class="m-menu-item" id="m-theme-item" type="button"><i class="fa-solid ' + (isDark ? 'fa-moon' : 'fa-sun') + '" id="m-theme-icon"></i><span>' + (lg === 'en' ? (isDark ? 'Dark Mode' : 'Light Mode') : 'Chế độ ' + (isDark ? 'Tối' : 'Sáng')) + '</span><i class="fa-solid fa-chevron-right m-menu-arrow"></i></button></div>';
        html += '<div class="m-menu-section"><div class="m-menu-label">' + (lg === 'en' ? 'Language' : 'Ngôn ngữ') + '</div><div class="m-lang-switch"><button class="m-lang-btn' + (lg === 'vi' ? ' active' : '') + '" data-lang="vi" type="button">VN · Tiếng Việt</button><button class="m-lang-btn' + (lg === 'en' ? ' active' : '') + '" data-lang="en" type="button">EN · English</button></div></div>';
        html += '<div class="m-menu-section" data-region><div class="m-menu-label">' + (lg === 'en' ? 'Regions · Tap to view' : 'Khu vực · Chạm để xem') + '</div><div class="m-region-group open"><button class="m-region-province" type="button"><span>' + (lg === 'en' ? 'Thai Nguyen Province' : 'Tỉnh Thái Nguyên') + '</span><i class="fa-solid fa-chevron-down"></i></button><div class="m-region-districts">';
        COMMUNE_LIST.forEach(xa => {
            const n = (DI_SAN[xa] || []).length;
            html += '<div class="m-region-commune" data-x="' + esc(xa) + '" role="button" tabindex="0"><i class="fa-solid fa-circle"></i><span>' + esc(xa) + '</span><span style="margin-left:auto;font-size:0.7rem;opacity:.65">' + n + ' ' + (lg === 'en' ? 'heritages' : 'di sản') + '</span></div>';
        });
        html += '</div></div></div>';
        html += '<div class="m-menu-section"><button class="m-menu-item" id="m-about-item" type="button"><i class="fa-solid fa-circle-info"></i><span>' + (lg === 'en' ? 'About Project' : 'Về dự án') + '</span><i class="fa-solid fa-chevron-right m-menu-arrow"></i></button></div>';
        mobileMenuBody.innerHTML = html;
        $$('.m-region-province', mobileMenuBody).forEach(btn => btn.addEventListener('click', () => btn.parentElement.classList.toggle('open')));
        $$('.m-region-commune', mobileMenuBody).forEach(node => node.addEventListener('click', () => {
            const x = node.dataset.x; closeMobileMenu(); showMap();
            setTimeout(() => openCommuneView(x, true), 200);
        }));
        const themeItem = mobileMenuBody.querySelector('#m-theme-item');
        if (themeItem) themeItem.addEventListener('click', () => {
            applyTheme(!isDark);
            const span = themeItem.querySelector('span'), icon = themeItem.querySelector('#m-theme-icon');
            if (span) span.textContent = lg === 'en' ? (isDark ? 'Dark Mode' : 'Light Mode') : 'Chế độ ' + (isDark ? 'Tối' : 'Sáng');
            if (icon) icon.className = isDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
        });
        $$('.m-lang-btn', mobileMenuBody).forEach(b => b.addEventListener('click', () => swLang(b.dataset.lang)));
        const aboutItem = mobileMenuBody.querySelector('#m-about-item');
        if (aboutItem) aboutItem.addEventListener('click', () => {
            closeMobileMenu(); setTimeout(() => { am.classList.add('open'); am.setAttribute('aria-hidden', 'false'); }, 200);
        });
        const overviewItem = mobileMenuBody.querySelector('#m-overview-item');
        if (overviewItem) overviewItem.addEventListener('click', () => { closeMobileMenu(); setTimeout(openOverview, 200); });
    }
    buildMobileMenuBody();

    /*════ KEYBOARD ════*/
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (lightbox.classList.contains('open')) { closeLightbox(); return; }
            if (heritageModal.classList.contains('open')) { closeHeritage(); return; }
            if (qrModal.classList.contains('open')) { qrModal.classList.remove('open'); qrModal.setAttribute('aria-hidden', 'true'); return; }
            if (am.classList.contains('open')) { am.classList.remove('open'); am.setAttribute('aria-hidden', 'true'); return; }
            if (mobileMenuDrawer && mobileMenuDrawer.classList.contains('open')) { closeMobileMenu(); return; }
            if (mSearchOverlay && mSearchOverlay.classList.contains('open')) { closeMobileSearch(); return; }
            if (regMenu.classList.contains('open')) { toggleRegionMenu(false); return; }
            if (srDd.classList.contains('open')) { srDd.classList.remove('open'); return; }
            closeDrawers(); clearHighlight();
        }
        if (lightbox.classList.contains('open')) {
            if (e.key === 'ArrowLeft') { lbIndex--; renderLightbox(); }
            if (e.key === 'ArrowRight') { lbIndex++; renderLightbox(); }
        }
    });
    document.addEventListener('click', e => {
        if (!isMobile()) return;
        if (!bs.classList.contains('open')) return;
        if (bs.contains(e.target)) return;
        if (e.target.closest('.leaflet-interactive')) return;
        if (e.target.closest('#bottom-nav')) return;
        if (e.target.closest('#back-btn')) return;
        if (e.target.closest('#nav')) return;
        if (e.target.closest('.leaflet-control')) return;
        if (e.target.closest('#mp')) closeDrawers();
    });
    let rzT = null;
    window.addEventListener('resize', () => {
        if (mp) mp.invalidateSize();
        if (rzT) clearTimeout(rzT);
        rzT = setTimeout(() => {
            if (currentView === 'region' && cXa) openCommuneView(cXa, false, false);
            if (currentView === 'overview') renderOverviewCurrent();
        }, 220);
    });
    (function () { const a = new Image(); a.src = 'light.png'; const b = new Image(); b.src = 'dark.png'; })();
    console.log('%c🌸 Di Sản Thái Nguyên — Dự án Khoa học Kỹ thuật THPT Phú Bình', 'background:#2D6A4F;color:#FFD700;padding:4px 10px;border-radius:6px;font-weight:bold;');
})();

/* ═══════════════ MODULE 2: CHATBOT AI ═══════════════ */
(function () {
    'use strict';
    const chatFab = document.getElementById('chat-fab'), chatWindow = document.getElementById('chat-window');
    const chatBody = document.getElementById('chat-body'), chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send'), chatMinimize = document.getElementById('chat-minimize');
    const chatClose = document.getElementById('chat-close'), chatHeader = chatWindow.querySelector('.chat-header');
    const API_URL = 'https://disanthainguyen-backend.tathanh72727.workers.dev/api/chat';
    const FAB_POS_KEY = 'chatFabPos_v1';
    let isOpen = false, firstOpen = true, isLoading = false, lastChatToggleAt = 0;

    const isMobileView = () => window.innerWidth <= 768;
    function escapeHtmlChat(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function renderChatMarkdown(text) {
        if (!text) return '';
        let html = escapeHtmlChat(text);
        html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => /^https?:\/\//i.test(u) ? '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + t + '</a>' : _);
        html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
        html = html.replace(/^[\-\u2022]\s+(.+)$/gm, '<span class="chat-bullet">\u2022 $1</span>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }
    function restoreFabPosition() {
        if (!isMobileView()) { chatFab.style.left = ''; chatFab.style.top = ''; chatFab.style.right = ''; chatFab.style.bottom = ''; return; }
        try {
            const saved = JSON.parse(localStorage.getItem(FAB_POS_KEY) || 'null');
            if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
                const w = chatFab.offsetWidth || 58, h = chatFab.offsetHeight || 58;
                const x = Math.max(8, Math.min(window.innerWidth - w - 8, saved.x));
                const y = Math.max(8, Math.min(window.innerHeight - h - 8, saved.y));
                chatFab.style.left = x + 'px'; chatFab.style.top = y + 'px'; chatFab.style.right = 'auto'; chatFab.style.bottom = 'auto';
            }
        } catch (e) { }
    }
    function saveFabPosition() {
        if (!isMobileView()) return;
        try {
            const r = chatFab.getBoundingClientRect();
            localStorage.setItem(FAB_POS_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
        } catch (e) { }
    }
    function getPoint(e) {
        if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        return { x: e.clientX, y: e.clientY };
    }
    let fabLongPressTimer = null, fabDragging = false, fabStartX = 0, fabStartY = 0, fabStartLeft = 0, fabStartTop = 0, fabW = 0, fabH = 0, fabJustDragged = false;
    function startFabPress(e) {
        if (!isMobileView()) return;
        if (e.type !== 'touchstart') return;
        const p = getPoint(e), r = chatFab.getBoundingClientRect();
        fabStartX = p.x; fabStartY = p.y; fabStartLeft = r.left; fabStartTop = r.top;
        fabW = r.width; fabH = r.height; fabDragging = false;
        if (fabLongPressTimer) clearTimeout(fabLongPressTimer);
        fabLongPressTimer = setTimeout(() => {
            fabLongPressTimer = null; fabDragging = true; chatFab.classList.add('dragging');
            if (navigator.vibrate) try { navigator.vibrate(30); } catch (err) { }
        }, 400);
        document.addEventListener('touchmove', moveFabPress, { passive: false });
        document.addEventListener('touchend', endFabPress, { passive: false });
        document.addEventListener('touchcancel', endFabPress, { passive: false });
    }
    function moveFabPress(e) {
        if (!isMobileView()) return;
        if (!fabDragging) {
            const p0 = getPoint(e);
            if (Math.hypot(p0.x - fabStartX, p0.y - fabStartY) > 10 && fabLongPressTimer) { clearTimeout(fabLongPressTimer); fabLongPressTimer = null; }
            return;
        }
        if (e.cancelable) try { e.preventDefault(); } catch (err) { }
        const p = getPoint(e), dx = p.x - fabStartX, dy = p.y - fabStartY;
        const newL = Math.max(4, Math.min(window.innerWidth - fabW - 4, fabStartLeft + dx));
        const newT = Math.max(4, Math.min(window.innerHeight - fabH - 4, fabStartTop + dy));
        chatFab.style.left = newL + 'px'; chatFab.style.top = newT + 'px'; chatFab.style.right = 'auto'; chatFab.style.bottom = 'auto';
    }
    function endFabPress(e) {
        const isCancel = e && e.type === 'touchcancel';
        if (fabLongPressTimer) { clearTimeout(fabLongPressTimer); fabLongPressTimer = null; }
        document.removeEventListener('touchmove', moveFabPress);
        document.removeEventListener('touchend', endFabPress);
        document.removeEventListener('touchcancel', endFabPress);
        if (fabDragging) { fabDragging = false; chatFab.classList.remove('dragging'); snapFabToEdge(); fabJustDragged = true; setTimeout(() => { fabJustDragged = false; }, 400); return; }
        if (isCancel) return;
        if (e && e.cancelable) try { e.preventDefault(); } catch (err) { }
        fabJustDragged = true; setTimeout(() => { fabJustDragged = false; }, 400);
        toggleChat();
    }
    function snapFabToEdge() {
        if (!isMobileView()) return;
        const r = chatFab.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
        const margin = 12, bottomSafe = 76;
        const newL = (r.left < vw - r.right) ? margin : (vw - r.width - margin);
        const newT = Math.max(70, Math.min(vh - r.height - bottomSafe, r.top));
        chatFab.style.transition = 'left 0.32s cubic-bezier(0.22,1,0.36,1), top 0.32s cubic-bezier(0.22,1,0.36,1)';
        chatFab.style.left = newL + 'px'; chatFab.style.top = newT + 'px'; chatFab.style.right = 'auto'; chatFab.style.bottom = 'auto';
        setTimeout(() => { chatFab.style.transition = ''; saveFabPosition(); }, 340);
    }
    chatFab.addEventListener('touchstart', startFabPress, { passive: true });
    chatFab.addEventListener('click', e => {
        if (fabJustDragged) { e.preventDefault(); e.stopPropagation(); return; }
        if (isMobileView()) return;
        toggleChat();
    });
    restoreFabPosition();
    window.addEventListener('resize', () => {
        restoreFabPosition();
        if (isMobileView() && chatFab.style.left && chatFab.style.top) {
            const r = chatFab.getBoundingClientRect();
            const x = Math.max(8, Math.min(window.innerWidth - r.width - 8, r.left));
            const y = Math.max(8, Math.min(window.innerHeight - r.height - 8, r.top));
            chatFab.style.left = x + 'px'; chatFab.style.top = y + 'px';
        }
    });
    function toggleChat() { if (isOpen) closeChat(); else openChat(); }
    function openChat() {
        isOpen = true; lastChatToggleAt = Date.now();
        chatWindow.classList.remove('minimized'); chatWindow.classList.add('open');
        chatFab.style.display = 'none';
        if (firstOpen) { firstOpen = false; showGreeting(); }
        setTimeout(() => { try { chatInput.focus(); } catch (e) { } }, 200);
    }
    function closeChat() {
        isOpen = false; lastChatToggleAt = Date.now();
        chatWindow.classList.remove('open'); chatWindow.classList.add('minimized');
        chatFab.style.display = 'flex';
    }
    function minimizeChat() {
        isOpen = false; lastChatToggleAt = Date.now();
        chatWindow.classList.remove('open'); chatWindow.classList.add('minimized');
        chatFab.style.display = 'flex';
    }
    chatMinimize.addEventListener('click', e => { e.stopPropagation(); minimizeChat(); });
    chatClose.addEventListener('click', e => { e.stopPropagation(); closeChat(); });
    function showGreeting() {
        const lang = localStorage.getItem('lang') || 'vi';
        const greeting = lang === 'en' ? 'Hello! I am the **Thai Nguyen Heritage AI Assistant** — a product of the Science & Engineering project at Phu Binh High School.\n\nYou can ask me:\n- "What heritages are in Kha Son commune?"\n- "Long Tong Festival Ba Be"\n- "Then Practice - Tinh Lute of Tay people"\n- Or any question about Vietnamese history, culture, and heritage.' : 'Xin chào! Tôi là **Trợ lý AI Di sản Thái Nguyên** — sản phẩm của dự án Khoa học Kỹ thuật THPT Phú Bình.\n\nBạn có thể hỏi tôi:\n- "Xã Kha Sơn có di sản gì?"\n- "Lễ hội Lồng tồng Ba Bể"\n- "Hát Then - Đàn Tính của người Tày"\n- Hoặc bất kỳ câu hỏi về lịch sử, văn hóa, di sản Việt Nam.';
        addMessage('ai', greeting);
    }
    function addMessage(type, content) {
        const div = document.createElement('div'); div.className = 'chat-message ' + type;
        if (type === 'ai') div.innerHTML = renderChatMarkdown(content); else div.textContent = content;
        chatBody.appendChild(div); scrollToBottom(); return div;
    }
    function showTyping() {
        const t = document.createElement('div'); t.className = 'chat-typing'; t.id = 'chat-typing';
        t.innerHTML = '<span></span><span></span><span></span>';
        chatBody.appendChild(t); scrollToBottom();
    }
    function removeTyping() { const t = document.getElementById('chat-typing'); if (t) t.remove(); }
    function scrollToBottom() { chatBody.scrollTop = chatBody.scrollHeight; }
    const SEND_COOLDOWN_MS = 4000;
    let lastSendAt = 0, cooldownTimer = null;
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || isLoading) return;
        const now = Date.now();
        if (now - lastSendAt < SEND_COOLDOWN_MS) return;
        lastSendAt = now;
        addMessage('user', text); chatInput.value = '';
        isLoading = true; chatSend.disabled = true; showTyping();
        const sendStartTime = Date.now();
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            removeTyping();
            if (data && data.reply) addMessage('ai', data.reply);
            else if (data && data.error) addMessage('ai', '⚠️ ' + data.error);
            else addMessage('ai', 'Xin lỗi, tôi chưa nhận được phản hồi phù hợp.');
        } catch (err) {
            removeTyping();
            console.error('Chatbot API error:', err);
            addMessage('ai', 'Xin lỗi, hệ thống đang gặp sự cố. Vui lòng thử lại sau.');
        } finally {
            isLoading = false;
            try { chatInput.focus(); } catch (e) { }
            scrollToBottom();
            startSendCooldown(sendStartTime);
        }
    }
    function startSendCooldown(startTime) {
        if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
        const elapsed = Date.now() - startTime;
        let remaining = Math.max(0, SEND_COOLDOWN_MS - elapsed);
        if (remaining <= 0) { chatSend.disabled = false; chatSend.classList.remove('cooldown'); chatSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i>'; chatSend.setAttribute('aria-label', 'Gửi tin nhắn'); return; }
        chatSend.disabled = true; chatSend.classList.add('cooldown');
        function renderCountdown() {
            const sec = Math.max(1, Math.ceil(remaining / 1000));
            chatSend.innerHTML = '<span class="cooldown-num">' + sec + '</span>';
            chatSend.setAttribute('aria-label', 'Vui lòng đợi ' + sec + ' giây');
            remaining -= 1000;
        }
        renderCountdown();
        cooldownTimer = setInterval(() => {
            if (remaining <= 0) {
                clearInterval(cooldownTimer); cooldownTimer = null;
                chatSend.classList.remove('cooldown'); chatSend.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
                chatSend.disabled = false; chatSend.setAttribute('aria-label', 'Gửi tin nhắn'); return;
            }
            renderCountdown();
        }, 1000);
    }
    chatSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    const isDesktop = () => window.innerWidth > 768;
    let isDragging = false, dragStartX, dragStartY, startLeft, startTop;
    function startDrag(e) {
        if (!isDesktop()) return;
        if (e.target.closest('.chat-header-btn')) return;
        if (e.button !== 0 && e.type === 'mousedown') return;
        e.preventDefault(); isDragging = true; chatWindow.classList.add('dragging');
        const r = chatWindow.getBoundingClientRect();
        if (chatWindow.style.right && !chatWindow.style.left) {
            chatWindow.style.left = r.left + 'px'; chatWindow.style.top = r.top + 'px'; chatWindow.style.right = 'auto'; chatWindow.style.bottom = 'auto';
        }
        dragStartX = e.clientX; dragStartY = e.clientY;
        startLeft = parseFloat(chatWindow.style.left) || r.left;
        startTop = parseFloat(chatWindow.style.top) || r.top;
    }
    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
        const newL = Math.max(16, Math.min(startLeft + dx, window.innerWidth - chatWindow.offsetWidth - 16));
        const newT = Math.max(16, Math.min(startTop + dy, window.innerHeight - chatWindow.offsetHeight - 16));
        chatWindow.style.left = newL + 'px'; chatWindow.style.top = newT + 'px';
    }
    function endDrag() { if (!isDragging) return; isDragging = false; chatWindow.classList.remove('dragging'); }
    chatHeader.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    chatWindow.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', e => {
        if (!isOpen) return;
        if (Date.now() - lastChatToggleAt < 400) return;
        if (chatWindow.contains(e.target)) return;
        if (chatFab.contains(e.target)) return;
        closeChat();
    });
    console.log('🤖 Chatbot AI Khoa học Kỹ thuật đã sẵn sàng! Backend:', API_URL);
})();