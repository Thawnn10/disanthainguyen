/**
 * ============================================================================
 * ADMIN.JS — Hệ thống Quản trị Đóng góp Cộng đồng
 * Dự án: Di Sản Thái Nguyên · Âm Vang Di Sản
 * Bảo mật: Cookie HttpOnly + CSRF Token trong bộ nhớ (không lưu token vào localStorage)
 * ============================================================================
 */
(function () {
  'use strict';

  const el = id => document.getElementById(id);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  // Trạng thái ứng dụng (chỉ giữ trong RAM)
  const state = {
    authenticated: false,
    user: null,
    csrfToken: '',
    activeNav: 'overview',
    filters: {
      status: 'all',
      type: 'all',
      q: '',
      sort: 'newest',
      page: 1,
      limit: 15
    },
    stats: {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      archived: 0
    },
    currentDetail: null,
    pendingConfirmAction: null,
    isDark: false
  };

  /* ─────────────────────────── HELPERS ─────────────────────────── */

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTimeVi(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return String(isoStr);
      return new Intl.DateTimeFormat('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(d);
    } catch {
      return String(isoStr);
    }
  }

  function statusInfo(status) {
    switch (status) {
      case 'pending':
        return { label: 'Chờ duyệt', cls: 'status-pending' };
      case 'approved':
        return { label: 'Đã duyệt', cls: 'status-approved' };
      case 'rejected':
        return { label: 'Từ chối', cls: 'status-rejected' };
      case 'archived':
        return { label: 'Lưu trữ', cls: 'status-archived' };
      default:
        return { label: status || 'Không rõ', cls: 'status-archived' };
    }
  }

  let toastTimer = null;
  function showToast(msg) {
    const toast = el('admin-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3400);
  }

  async function apiFetch(path, options = {}) {
    const opts = {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {
        ...(options.headers || {})
      }
    };

    if (options.body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(options.body);
    }

    if (state.csrfToken && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(opts.method.toUpperCase())) {
      opts.headers['X-CSRF-Token'] = state.csrfToken;
    }

    const res = await fetch(path, opts);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (res.status === 401 && path !== '/api/admin/login' && path !== '/api/admin/me') {
      handleSessionExpired();
    }

    return { ok: res.ok, status: res.status, data };
  }

  /* ─────────────────────────── THEME (FLAT SAAS LIGHT / DARK) ─────────────────────────── */

  function applyAdminTheme(dark) {
    state.isDark = Boolean(dark);
    document.body.classList.toggle('dark-mode', state.isDark);
    const icon = el('theme-toggle-icon');
    const lbl = el('theme-toggle-label');
    if (icon) icon.className = state.isDark ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
    if (lbl) lbl.textContent = state.isDark ? 'Giao diện sáng' : 'Giao diện tối';
    try {
      sessionStorage.setItem('dstn_admin_theme', state.isDark ? 'dark' : 'light');
    } catch { }
  }

  /* ─────────────────────────── SCREEN & NAVIGATION ─────────────────────────── */

  function showLoginScreen(errorMessage = '') {
    el('boot-screen').hidden = true;
    el('dashboard-screen').hidden = true;
    el('detail-drawer-wrap').hidden = true;
    el('confirm-modal').hidden = true;
    el('login-screen').hidden = false;

    const errEl = el('login-error');
    if (errorMessage) {
      errEl.textContent = errorMessage;
      errEl.hidden = false;
    } else {
      errEl.textContent = '';
      errEl.hidden = true;
    }

    setTimeout(() => {
      const u = el('login-username');
      if (u) try { u.focus(); } catch { }
    }, 60);
  }

  function showDashboardScreen() {
    el('boot-screen').hidden = true;
    el('login-screen').hidden = true;
    el('dashboard-screen').hidden = false;

    const uname = (state.user && state.user.username) ? state.user.username : 'admin';
    el('admin-username-display').textContent = uname;
    el('admin-avatar').textContent = uname.charAt(0).toUpperCase();
  }

  function handleSessionExpired() {
    state.authenticated = false;
    state.user = null;
    state.csrfToken = '';
    showLoginScreen('Phiên đăng nhập đã hết hạn hoặc đã đăng xuất. Vui lòng đăng nhập lại.');
  }

  const NAV_META = {
    overview: {
      title: 'Tổng quan',
      subtitle: 'Thống kê thời gian thực và hoạt động đóng góp cộng đồng'
    },
    all: {
      title: 'Tất cả đóng góp',
      subtitle: 'Danh sách toàn bộ đóng góp tri thức cộng đồng trong Cloudflare D1'
    },
    pending: {
      title: 'Đóng góp chờ duyệt',
      subtitle: 'Các đóng góp mới gửi về đang chờ quản trị viên kiểm duyệt'
    },
    approved: {
      title: 'Đóng góp đã duyệt',
      subtitle: 'Danh sách các tư liệu và đóng góp đã được xác nhận hợp lệ'
    },
    rejected: {
      title: 'Đóng góp bị từ chối',
      subtitle: 'Các bản ghi không phù hợp hoặc không đạt tiêu chuẩn kiểm duyệt'
    },
    archived: {
      title: 'Kho lưu trữ',
      subtitle: 'Các bản ghi đóng góp đã được chuyển vào lưu trữ dài hạn'
    },
    settings: {
      title: 'Cài đặt quản trị',
      subtitle: 'Quản lý mật khẩu bảo mật và quy tắc vận hành hệ thống'
    }
  };

  function closeMobileSidebar() {
    el('admin-sidebar').classList.remove('is-open');
    el('sidebar-backdrop').hidden = true;
  }

  function openMobileSidebar() {
    el('admin-sidebar').classList.add('is-open');
    el('sidebar-backdrop').hidden = false;
  }

  async function switchNav(navKey) {
    if (!NAV_META[navKey]) navKey = 'overview';
    state.activeNav = navKey;
    closeMobileSidebar();

    $$('.nav-item[data-nav]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-nav') === navKey);
    });

    const meta = NAV_META[navKey];
    el('topbar-title').textContent = meta.title;
    el('topbar-subtitle').textContent = meta.subtitle;

    const viewOverview = el('view-overview');
    const viewContrib = el('view-contributions');
    const viewSettings = el('view-settings');

    if (navKey === 'overview') {
      viewOverview.hidden = false;
      viewContrib.hidden = true;
      viewSettings.hidden = true;
      await loadOverviewData();
    } else if (navKey === 'settings') {
      viewOverview.hidden = true;
      viewContrib.hidden = true;
      viewSettings.hidden = false;
    } else {
      viewOverview.hidden = true;
      viewContrib.hidden = false;
      viewSettings.hidden = true;

      state.filters.status = navKey === 'all' ? 'all' : navKey;
      state.filters.page = 1;
      el('filter-status-select').value = state.filters.status;
      await Promise.all([loadStatsBadgesOnly(), loadContributionsTable()]);
    }
  }

  /* ─────────────────────────── DATA LOADING: OVERVIEW & STATS ─────────────────────────── */

  function renderNavBadges(stats) {
    state.stats = stats || state.stats;
    el('nav-badge-total').textContent = String(stats.total || 0);
    el('nav-badge-pending').textContent = String(stats.pending || 0);
    el('nav-badge-approved').textContent = String(stats.approved || 0);
    el('nav-badge-rejected').textContent = String(stats.rejected || 0);
    el('nav-badge-archived').textContent = String(stats.archived || 0);

    el('kpi-total').textContent = String(stats.total || 0);
    el('kpi-pending').textContent = String(stats.pending || 0);
    el('kpi-approved').textContent = String(stats.approved || 0);
    el('kpi-rejected').textContent = String(stats.rejected || 0);
  }

  async function loadStatsBadgesOnly() {
    const res = await apiFetch('/api/admin/stats');
    if (res.ok && res.data && res.data.stats) {
      renderNavBadges(res.data.stats);
    }
  }

  function renderTimelineChart(timeline) {
    const container = el('timeline-chart');
    if (!container) return;
    const list = Array.isArray(timeline) ? timeline : [];
    const maxCount = Math.max(1, ...list.map(d => Number(d.count || 0)));

    container.innerHTML = list
      .map(item => {
        const count = Number(item.count || 0);
        const pct = count > 0 ? Math.max(8, Math.round((count / maxCount) * 100)) : 0;
        const shortDate = String(item.date || '').slice(5).replace('-', '/');
        return `
          <div class="chart-col" title="Ngày ${escHtml(item.date)}: ${count} đóng góp">
            <span class="chart-bar-count">${count > 0 ? count : ''}</span>
            <div class="chart-bar-track">
              <div class="chart-bar-fill ${count === 0 ? 'is-zero' : ''}" style="height: ${pct}%;"></div>
            </div>
            <span class="chart-bar-date">${escHtml(shortDate)}</span>
          </div>
        `;
      })
      .join('');
  }

  function renderBreakdownList(containerId, items, nameKey, emptyText) {
    const container = el(containerId);
    if (!container) return;
    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = `<div class="table-empty-state" style="padding:20px 10px;">${escHtml(emptyText)}</div>`;
      return;
    }

    const total = Math.max(1, items.reduce((acc, it) => acc + Number(it.count || 0), 0));

    container.innerHTML = items
      .map(it => {
        const name = it[nameKey] || 'Khác';
        const count = Number(it.count || 0);
        const pct = Math.max(4, Math.round((count / total) * 100));
        return `
          <div class="breakdown-item">
            <div class="breakdown-row">
              <span class="breakdown-name" title="${escHtml(name)}">${escHtml(name)}</span>
              <span class="breakdown-count">${count}</span>
            </div>
            <div class="breakdown-track">
              <div class="breakdown-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  async function loadOverviewData() {
    const [statsRes, pendingRes] = await Promise.all([
      apiFetch('/api/admin/stats'),
      apiFetch('/api/admin/contributions?status=pending&sort=newest&page=1&limit=5')
    ]);

    if (statsRes.ok && statsRes.data) {
      renderNavBadges(statsRes.data.stats || {});
      renderTimelineChart(statsRes.data.timeline || []);
      renderBreakdownList(
        'type-breakdown-list',
        statsRes.data.byType || [],
        'contribution_type',
        'Chưa có dữ liệu phân loại đóng góp.'
      );
      renderBreakdownList(
        'school-breakdown-list',
        statsRes.data.topSchools || [],
        'school_name',
        'Chưa có dữ liệu trường / đơn vị.'
      );
    }

    const recentBox = el('recent-pending-list');
    if (recentBox) {
      const items = (pendingRes.ok && pendingRes.data && pendingRes.data.items) ? pendingRes.data.items : [];
      if (!items.length) {
        recentBox.innerHTML = `<div class="table-empty-state" style="padding:24px 12px;">Hiện không có đóng góp nào đang chờ duyệt.</div>`;
      } else {
        recentBox.innerHTML = items
          .map(item => `
            <div class="recent-item" data-detail-id="${escHtml(item.id)}" role="button" tabindex="0">
              <div class="recent-item-main">
                <div class="recent-item-top">
                  <span class="cell-id">${escHtml(item.id)}</span>
                  <span class="recent-item-name">${escHtml(item.contributor_name)}</span>
                  <span class="recent-item-school">· ${escHtml(item.school_name)}</span>
                </div>
                <div class="recent-item-snippet">${escHtml(item.content)}</div>
              </div>
              <span class="recent-item-time">${escHtml(formatDateTimeVi(item.created_at))}</span>
            </div>
          `)
          .join('');

        $$('.recent-item[data-detail-id]', recentBox).forEach(node => {
          node.addEventListener('click', () => openContributionDetail(node.getAttribute('data-detail-id')));
          node.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openContributionDetail(node.getAttribute('data-detail-id'));
            }
          });
        });
      }
    }
  }

  /* ─────────────────────────── DATA LOADING: CONTRIBUTIONS TABLE ─────────────────────────── */

  function buildFilterQueryString(includePagination = true) {
    const params = new URLSearchParams();
    if (state.filters.status && state.filters.status !== 'all') {
      params.set('status', state.filters.status);
    }
    if (state.filters.type && state.filters.type !== 'all') {
      params.set('type', state.filters.type);
    }
    if (state.filters.q) {
      params.set('q', state.filters.q);
    }
    if (state.filters.sort) {
      params.set('sort', state.filters.sort);
    }
    if (includePagination) {
      params.set('page', String(state.filters.page));
      params.set('limit', String(state.filters.limit));
    }
    return params.toString();
  }

  async function loadContributionsTable() {
    const tbody = el('contributions-tbody');
    if (!tbody) return;

    const qs = buildFilterQueryString(true);
    const res = await apiFetch('/api/admin/contributions?' + qs);

    if (!res.ok || !res.data) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="table-empty-state">Không thể tải dữ liệu đóng góp. Vui lòng thử lại.</div>
          </td>
        </tr>
      `;
      return;
    }

    const items = res.data.items || [];
    const pg = res.data.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 };

    if (!items.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="table-empty-state">
              <div class="table-empty-icon"><i class="fa-regular fa-folder-open" aria-hidden="true"></i></div>
              <div>Không tìm thấy bản ghi đóng góp nào khớp với bộ lọc hiện tại.</div>
            </div>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = items
        .map(item => {
          const st = statusInfo(item.status);
          return `
            <tr data-row-id="${escHtml(item.id)}">
              <td class="cell-id">${escHtml(item.id)}</td>
              <td class="cell-contributor">${escHtml(item.contributor_name)}</td>
              <td class="cell-school" title="${escHtml(item.school_name)}">${escHtml(item.school_name)}</td>
              <td><span class="cell-type-tag">${escHtml(item.contribution_type)}</span></td>
              <td class="cell-summary" title="${escHtml(item.content)}">${escHtml(item.content)}</td>
              <td class="cell-time">${escHtml(formatDateTimeVi(item.created_at))}</td>
              <td><span class="status-badge ${st.cls}">${escHtml(st.label)}</span></td>
              <td>
                <div class="row-actions">
                  <button type="button" class="btn btn-secondary btn-xs btn-view-detail" data-id="${escHtml(item.id)}">
                    Xem chi tiết
                  </button>
                </div>
              </td>
            </tr>
          `;
        })
        .join('');

      $$('tr[data-row-id]', tbody).forEach(tr => {
        tr.addEventListener('click', e => {
          const id = tr.getAttribute('data-row-id');
          if (id) openContributionDetail(id);
        });
      });
    }

    // Cập nhật phân trang
    const startIdx = pg.total === 0 ? 0 : (pg.page - 1) * pg.limit + 1;
    const endIdx = Math.min(pg.total, pg.page * pg.limit);
    el('pagination-info').textContent = `Hiển thị ${startIdx}–${endIdx} trên tổng số ${pg.total} đóng góp`;
    el('pagination-page-indicator').textContent = `Trang ${pg.page} / ${pg.totalPages}`;
    el('page-prev-btn').disabled = pg.page <= 1;
    el('page-next-btn').disabled = pg.page >= pg.totalPages;
  }

  /* ─────────────────────────── DETAIL DRAWER & MODERATION ─────────────────────────── */

  function renderDetailDrawer(item, auditLogs) {
    state.currentDetail = item;
    el('detail-id').textContent = item.id;

    const st = statusInfo(item.status);
    const badge = el('detail-status-badge');
    badge.className = 'status-badge ' + st.cls;
    badge.textContent = st.label;

    el('detail-contributor').textContent = item.contributor_name || '—';
    el('detail-school').textContent = item.school_name || '—';
    el('detail-type').textContent = item.contribution_type || '—';
    el('detail-created-at').textContent = formatDateTimeVi(item.created_at);
    el('detail-reviewed-at').textContent = item.reviewed_at ? formatDateTimeVi(item.reviewed_at) : 'Chưa duyệt';
    el('detail-updated-at').textContent = formatDateTimeVi(item.updated_at);
    el('detail-content').textContent = item.content || '';
    el('detail-admin-note').value = item.admin_note || '';

    // Disable nút trùng với trạng thái hiện tại
    el('action-approve-btn').disabled = item.status === 'approved';
    el('action-reject-btn').disabled = item.status === 'rejected';
    el('action-archive-btn').disabled = item.status === 'archived';

    // Render audit logs
    const logContainer = el('detail-audit-logs');
    const logs = Array.isArray(auditLogs) ? auditLogs : [];
    if (!logs.length) {
      logContainer.innerHTML = `<div class="audit-log-item" style="color:var(--text-secondary);">Chưa có thay đổi trạng thái nào được ghi nhận.</div>`;
    } else {
      logContainer.innerHTML = logs
        .map(l => {
          const prevSt = l.previous_status ? statusInfo(l.previous_status).label : 'Ban đầu';
          const newSt = statusInfo(l.new_status).label;
          return `
            <div class="audit-log-item">
              <div class="audit-log-top">
                <span class="audit-log-actor">${escHtml(l.admin_username)} · ${escHtml(prevSt)} → <strong>${escHtml(newSt)}</strong></span>
                <span class="audit-log-time">${escHtml(formatDateTimeVi(l.changed_at))}</span>
              </div>
              ${l.admin_note ? `<div class="audit-log-note">Ghi chú: ${escHtml(l.admin_note)}</div>` : ''}
            </div>
          `;
        })
        .join('');
    }
  }

  async function openContributionDetail(id) {
    if (!id) return;
    const res = await apiFetch('/api/admin/contributions/' + encodeURIComponent(id));
    if (!res.ok || !res.data || !res.data.item) {
      showToast((res.data && res.data.error) || 'Không thể tải chi tiết đóng góp.');
      return;
    }

    renderDetailDrawer(res.data.item, res.data.auditLogs || []);
    el('detail-drawer-wrap').hidden = false;
  }

  function closeDetailDrawer() {
    el('detail-drawer-wrap').hidden = true;
    state.currentDetail = null;
  }

  function promptStatusConfirmation(targetStatus) {
    if (!state.currentDetail) return;
    const id = state.currentDetail.id;
    const statusMap = {
      approved: {
        title: 'Xác nhận DUYỆT đóng góp',
        desc: `Bạn có chắc chắn muốn chuyển đóng góp "${id}" sang trạng thái ĐÃ DUYỆT (approved)? Thời gian duyệt và lịch sử kiểm duyệt sẽ được ghi nhận.`
      },
      rejected: {
        title: 'Xác nhận TỪ CHỐI đóng góp',
        desc: `Bạn có chắc chắn muốn chuyển đóng góp "${id}" sang trạng thái TỪ CHỐI (rejected)?`
      },
      archived: {
        title: 'Xác nhận LƯU TRỮ đóng góp',
        desc: `Bạn có chắc chắn muốn chuyển đóng góp "${id}" vào KHO LƯU TRỮ (archived)? Dữ liệu gốc vẫn được giữ nguyên an toàn.`
      }
    };

    const cfg = statusMap[targetStatus];
    if (!cfg) return;

    state.pendingConfirmAction = { id, status: targetStatus };
    el('confirm-modal-title').textContent = cfg.title;
    el('confirm-modal-desc').textContent = cfg.desc;
    el('confirm-modal').hidden = false;
  }

  function closeConfirmModal() {
    el('confirm-modal').hidden = true;
    state.pendingConfirmAction = null;
  }

  async function executeStatusOrNoteUpdate(id, nextStatus, nextNote) {
    const payload = { admin_note: nextNote };
    if (nextStatus) payload.status = nextStatus;

    const res = await apiFetch('/api/admin/contributions/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: payload
    });

    if (!res.ok || !res.data || !res.data.item) {
      showToast((res.data && res.data.error) || 'Cập nhật thất bại.');
      return false;
    }

    renderDetailDrawer(res.data.item, res.data.auditLogs || []);

    if (state.activeNav === 'overview') {
      await loadOverviewData();
    } else {
      await Promise.all([loadStatsBadgesOnly(), loadContributionsTable()]);
    }

    return true;
  }

  /* ─────────────────────────── CSV EXPORT ─────────────────────────── */

  async function handleExportCsv() {
    const btn = el('export-csv-btn');
    if (btn) btn.disabled = true;
    try {
      const qs = buildFilterQueryString(false);
      const url = '/api/admin/export.csv' + (qs ? '?' + qs : '');
      const res = await fetch(url, { credentials: 'same-origin' });
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!res.ok) {
        showToast('Không thể xuất dữ liệu CSV lúc này.');
        return;
      }
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = downloadUrl;
      a.download = `dong-gop-di-san-thai-nguyen-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);
      showToast('Đã xuất file CSV thành công.');
    } catch {
      showToast('Lỗi kết nối khi xuất CSV.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ─────────────────────────── EVENT BINDINGS & INIT ─────────────────────────── */

  function bindEvents() {
    // Hiện / Ẩn mật khẩu đăng nhập
    const togglePassBtn = el('toggle-password-btn');
    const passInput = el('login-password');
    if (togglePassBtn && passInput) {
      togglePassBtn.addEventListener('click', () => {
        const isPass = passInput.type === 'password';
        passInput.type = isPass ? 'text' : 'password';
        const icon = togglePassBtn.querySelector('i');
        if (icon) icon.className = isPass ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
      });
    }

    // Form Đăng nhập
    const loginForm = el('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        const username = (el('login-username').value || '').trim();
        const password = el('login-password').value || '';
        const errEl = el('login-error');
        const submitBtn = el('login-submit-btn');

        errEl.hidden = true;
        errEl.textContent = '';

        if (!username || !password) {
          errEl.textContent = 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.';
          errEl.hidden = false;
          return;
        }

        submitBtn.disabled = true;
        submitBtn.classList.add('is-loading');

        try {
          const res = await apiFetch('/api/admin/login', {
            method: 'POST',
            body: { username, password }
          });

          if (!res.ok || !res.data || !res.data.ok) {
            errEl.textContent = (res.data && res.data.error) || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.';
            errEl.hidden = false;
            return;
          }

          state.authenticated = true;
          state.user = res.data.user;
          state.csrfToken = res.data.csrfToken || '';
          el('login-password').value = '';

          showDashboardScreen();
          await switchNav('overview');
        } catch {
          errEl.textContent = 'Không thể kết nối tới máy chủ. Vui lòng thử lại.';
          errEl.hidden = false;
        } finally {
          submitBtn.disabled = false;
          submitBtn.classList.remove('is-loading');
        }
      });
    }

    // Điều hướng Sidebar
    $$('.nav-item[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-nav');
        switchNav(target);
      });
    });

    // Nhấn vào KPI Card ở trang Tổng quan để nhảy tới bộ lọc tương ứng
    $$('.kpi-card[data-jump-status]').forEach(card => {
      const fire = () => {
        const st = card.getAttribute('data-jump-status');
        switchNav(st || 'all');
      };
      card.addEventListener('click', fire);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fire();
        }
      });
    });

    const viewAllPendingBtn = el('overview-view-all-pending-btn');
    if (viewAllPendingBtn) {
      viewAllPendingBtn.addEventListener('click', () => switchNav('pending'));
    }

    // Mobile Sidebar
    const openSbBtn = el('sidebar-open-btn');
    const closeSbBtn = el('sidebar-close-btn');
    const sbBackdrop = el('sidebar-backdrop');
    if (openSbBtn) openSbBtn.addEventListener('click', openMobileSidebar);
    if (closeSbBtn) closeSbBtn.addEventListener('click', closeMobileSidebar);
    if (sbBackdrop) sbBackdrop.addEventListener('click', closeMobileSidebar);

    // Chuyển giao diện Sáng / Tối
    const themeBtn = el('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => applyAdminTheme(!state.isDark));
    }

    // Làm mới dữ liệu
    const refreshBtn = el('refresh-data-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        if (state.activeNav === 'overview') await loadOverviewData();
        else if (state.activeNav !== 'settings') {
          await Promise.all([loadStatsBadgesOnly(), loadContributionsTable()]);
        }
        showToast('Đã cập nhật dữ liệu mới nhất.');
      });
    }

    // Xuất CSV
    const exportBtn = el('export-csv-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', handleExportCsv);
    }

    // Đăng xuất
    const logoutBtn = el('sidebar-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await apiFetch('/api/admin/logout', { method: 'POST' });
        state.authenticated = false;
        state.user = null;
        state.csrfToken = '';
        showLoginScreen();
        showToast('Đã đăng xuất khỏi hệ thống quản trị.');
      });
    }

    // Tìm kiếm & Bộ lọc bảng
    let searchDebounce = null;
    const searchInput = el('filter-search-input');
    const clearSearchBtn = el('clear-search-btn');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const val = searchInput.value.trim();
        if (clearSearchBtn) clearSearchBtn.hidden = !val;
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          state.filters.q = val;
          state.filters.page = 1;
          loadContributionsTable();
        }, 260);
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.hidden = true;
        state.filters.q = '';
        state.filters.page = 1;
        loadContributionsTable();
      });
    }

    el('filter-status-select').addEventListener('change', e => {
      state.filters.status = e.target.value;
      state.filters.page = 1;
      loadContributionsTable();
    });

    el('filter-type-select').addEventListener('change', e => {
      state.filters.type = e.target.value;
      state.filters.page = 1;
      loadContributionsTable();
    });

    el('filter-sort-select').addEventListener('change', e => {
      state.filters.sort = e.target.value;
      state.filters.page = 1;
      loadContributionsTable();
    });

    el('page-prev-btn').addEventListener('click', () => {
      if (state.filters.page > 1) {
        state.filters.page -= 1;
        loadContributionsTable();
      }
    });

    el('page-next-btn').addEventListener('click', () => {
      state.filters.page += 1;
      loadContributionsTable();
    });

    // Chi tiết đóng góp & Kiểm duyệt
    el('detail-close-btn').addEventListener('click', closeDetailDrawer);
    el('detail-drawer-backdrop').addEventListener('click', closeDetailDrawer);

    el('save-note-only-btn').addEventListener('click', async () => {
      if (!state.currentDetail) return;
      const note = el('detail-admin-note').value.trim();
      const ok = await executeStatusOrNoteUpdate(state.currentDetail.id, null, note);
      if (ok) showToast('Đã lưu ghi chú quản trị.');
    });

    $$('[data-action-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetStatus = btn.getAttribute('data-action-status');
        promptStatusConfirmation(targetStatus);
      });
    });

    // Modal xác nhận
    el('confirm-cancel-btn').addEventListener('click', closeConfirmModal);
    el('confirm-backdrop').addEventListener('click', closeConfirmModal);
    el('confirm-ok-btn').addEventListener('click', async () => {
      if (!state.pendingConfirmAction) return;
      const { id, status } = state.pendingConfirmAction;
      const note = el('detail-admin-note').value.trim();
      const okBtn = el('confirm-ok-btn');
      okBtn.disabled = true;
      try {
        const ok = await executeStatusOrNoteUpdate(id, status, note);
        closeConfirmModal();
        if (ok) {
          showToast(`Đã chuyển trạng thái bản ghi ${id} sang "${statusInfo(status).label}".`);
        }
      } finally {
        okBtn.disabled = false;
      }
    });

    // Phím Escape đóng Modal xác nhận hoặc Drawer chi tiết
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!el('confirm-modal').hidden) {
          closeConfirmModal();
          return;
        }
        if (!el('detail-drawer-wrap').hidden) {
          closeDetailDrawer();
          return;
        }
      }
    });

    // Đổi mật khẩu quản trị trong mục Cài đặt
    const passForm = el('change-password-form');
    if (passForm) {
      passForm.addEventListener('submit', async e => {
        e.preventDefault();
        const curPass = el('cur-password').value || '';
        const newPass = el('new-password').value || '';
        const cfmPass = el('confirm-password').value || '';
        const msgBox = el('password-form-msg');
        const saveBtn = el('save-password-btn');

        msgBox.hidden = true;
        msgBox.className = 'settings-msg';

        if (!curPass || !newPass || !cfmPass) {
          msgBox.textContent = 'Vui lòng nhập đầy đủ các trường mật khẩu.';
          msgBox.classList.add('is-error');
          msgBox.hidden = false;
          return;
        }
        if (newPass.length < 8) {
          msgBox.textContent = 'Mật khẩu mới phải có tối thiểu 8 ký tự.';
          msgBox.classList.add('is-error');
          msgBox.hidden = false;
          return;
        }
        if (newPass !== cfmPass) {
          msgBox.textContent = 'Mật khẩu xác nhận không khớp.';
          msgBox.classList.add('is-error');
          msgBox.hidden = false;
          return;
        }

        saveBtn.disabled = true;
        try {
          const res = await apiFetch('/api/admin/password', {
            method: 'POST',
            body: {
              current_password: curPass,
              new_password: newPass
            }
          });

          if (!res.ok || !res.data || !res.data.ok) {
            msgBox.textContent = (res.data && res.data.error) || 'Không thể cập nhật mật khẩu.';
            msgBox.classList.add('is-error');
            msgBox.hidden = false;
            return;
          }

          passForm.reset();
          msgBox.textContent = res.data.message || 'Đã cập nhật mật khẩu thành công.';
          msgBox.classList.add('is-success');
          msgBox.hidden = false;
        } catch {
          msgBox.textContent = 'Lỗi kết nối khi cập nhật mật khẩu.';
          msgBox.classList.add('is-error');
          msgBox.hidden = false;
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
  }

  async function initAdminApp() {
    try {
      if (sessionStorage.getItem('dstn_admin_theme') === 'dark') {
        applyAdminTheme(true);
      }
    } catch { }

    bindEvents();

    try {
      const meRes = await apiFetch('/api/admin/me');
      if (meRes.ok && meRes.data && meRes.data.authenticated) {
        state.authenticated = true;
        state.user = meRes.data.user;
        state.csrfToken = meRes.data.csrfToken || '';
        showDashboardScreen();
        await switchNav('overview');
      } else {
        showLoginScreen();
      }
    } catch {
      showLoginScreen();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminApp);
  } else {
    initAdminApp();
  }
})();
