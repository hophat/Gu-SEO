// pages-seo · admin dashboard logic.
//
// Single bundle, no framework. Auth model: email + password POST'd to
// /api/admin/login, which sets an HttpOnly session cookie. The cookie
// rides along on every subsequent fetch automatically (same-origin),
// so the api() helper doesn't need to add Authorization headers.
//
// The original Bearer ADMIN_TOKEN flow is preserved server-side as a
// fallback for the cron worker and as a recovery credential.
(() => {

  // ── helpers ─────────────────────────────────────────────────────
  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function setText(el, text) { if (el) el.textContent = String(text == null ? '' : text); }
  function showLog(el, text) { if (!el) return; el.hidden = false; el.textContent = String(text); }
  function appendLog(el, text) { if (!el) return; el.hidden = false; el.textContent += '\n' + String(text); el.scrollTop = el.scrollHeight; }
  function clearChildren(el) { if (el) el.replaceChildren(); }

  // ── toast system ───────────────────────────────────────────────
  // Replaces blocking alert() / confirm() with a queue of non-modal
  // toasts in the bottom-right. `toast(msg, kind, opts)` always
  // resolves immediately; the toast disappears on its own or when
  // the user dismisses it. We deliberately keep this dead simple
  // (no library, no animation library) so it stays out of the way.
  //
  //   kind: 'info' | 'good' | 'warn' | 'bad'  (default 'info')
  //   opts.duration  ms before auto-dismiss (default 5000, 0 = sticky)
  //   opts.action    { label, onClick } adds a button inside the toast
  //   opts.errorCode if present, appends a "see docs →" link to
  //                  /docs#err-<code> so users hit the explanation
  //                  without leaving context.
  //
  // The 6 alert() sites in admin.js + 14 in cover-editor.js will be
  // migrated to this gradually. Both surfaces use the same DOM root
  // so toasts stack naturally regardless of which module fired them.
  function ensureToastRoot() {
    let root = document.getElementById('toast-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'toast-root';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
    return root;
  }
  function toast(msg, kind = 'info', opts = {}) {
    const root = ensureToastRoot();
    const card = document.createElement('div');
    card.className = 'toast toast-' + kind;
    const text = document.createElement('div');
    text.className = 'toast-text';
    text.textContent = String(msg ?? '');
    card.appendChild(text);
    if (opts.errorCode) {
      const a = document.createElement('a');
      a.className = 'toast-link';
      a.href = 'https://seo.benjaminb.xyz/docs#err-' + opts.errorCode;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'tài liệu →';
      card.appendChild(a);
    }
    if (opts.action) {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = opts.action.label;
      btn.onclick = () => { try { opts.action.onClick?.(); } finally { dismiss(); } };
      card.appendChild(btn);
    }
    const close = document.createElement('button');
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Đóng');
    close.textContent = '×';
    card.appendChild(close);
    root.appendChild(card);
    const timer = (opts.duration === 0) ? null : setTimeout(dismiss, opts.duration || 5000);
    function dismiss() {
      if (timer) clearTimeout(timer);
      card.classList.add('toast-out');
      setTimeout(() => card.remove(), 200);
    }
    close.onclick = dismiss;
    return { dismiss };
  }
  // Expose globally so cover-editor.js (separate script) can use it.
  window.psToast = toast;

  // ── version badge ────────────────────────────────────────────
  // Compares the install's recorded SHA (from settings) against
  // upstream HEAD (from the canonical /api/version endpoint at
  // seo.benjaminb.xyz). Shows "v<short-sha>" or the release tag,
  // plus an orange dot when upstream is ahead.
  //
  // Both fetches go through canonical surfaces so we don't burn the
  // user's per-IP GitHub rate limit. /api/admin/whoami should already
  // be cheap; /api/version is edge-cached.
  async function populateVersionBadge() {
    const btn = document.getElementById('version-badge');
    const dot = btn?.querySelector('.version-dot');
    const lbl = btn?.querySelector('.version-label');
    if (!btn || !lbl) return;

    // Read the locally-installed sha. The install flow saves this
    // to settings.installed_sha; CLI installs leave it empty and
    // we just show "unknown".
    let installedSha = '';
    try {
      const r = await api('/api/admin/settings');
      installedSha = String(r.body?.settings?.installed_sha || '').trim();
    } catch { /* */ }

    // Ask our own origin. The previous version of this called the
    // maintainer's site cross-origin, which logged CORS failures in the
    // console and broke this badge whenever that third party flapped.
    let upstream = null;
    try {
      const r = await api('/api/admin/update');
      if (r.status === 200 && r.body?.ok && r.body?.latest) {
        upstream = {
          ok: true,
          sha: r.body.latest.sha,
          short: r.body.latest.short,
          tag: null,
        };
      }
    } catch { /* */ }

    btn.hidden = false;

    if (!upstream?.ok) {
      // Couldn't reach the canonical version endpoint. Still show
      // the installed version if we have one, so the user knows
      // SOMETHING. No dot, since we can't compare.
      lbl.textContent = installedSha ? 'v' + installedSha.slice(0, 7) : 'GU SEO';
      dot.hidden = true;
      btn.title = 'Không thể kiểm tra bản cập nhật';
      return;
    }

    // Prefer the release tag when one exists; fall back to SHA.
    const label = upstream.tag || ('v' + upstream.short);
    const ahead = installedSha && installedSha !== upstream.sha
      && !upstream.sha.startsWith(installedSha)
      && !installedSha.startsWith(upstream.short);

    if (!installedSha) {
      // CLI install, or older browser install before we recorded
      // the SHA. Show upstream's label but no comparison.
      lbl.textContent = label;
      dot.hidden = true;
      btn.title = 'Bản upstream hiện là ' + label + '. (Chưa ghi nhận phiên bản cài đặt của bạn.)';
    } else if (ahead) {
      lbl.textContent = 'v' + installedSha.slice(0, 7) + ' → ' + label;
      dot.hidden = false;
      btn.title = `Có bản cập nhật mới: upstream hiện là ${label}. Nhấn để mở tab Cập nhật.`;
    } else {
      lbl.textContent = label;
      dot.hidden = true;
      btn.title = 'Bạn đang chạy phiên bản ' + label + ' — đã đồng bộ với upstream.';
    }
  }
  window.psPopulateVersionBadge = populateVersionBadge;

  // Pull active admin notices (backend-detected conditions the SPA
  // can't see) and surface them as sticky toasts. Each notice has a
  // unique id; we cache shown ids in sessionStorage so re-mounts
  // don't re-show the same notice repeatedly.
  //
  // The notices endpoint never 5xxs on a half-migrated DB (it
  // returns an empty array with note:'table_missing'). So this
  // function is safe to call from any boot path.
  async function loadAdminNotices() {
    const { status, body } = await api('/api/admin/notices');
    if (status !== 200 || !body?.ok) return;
    const notices = Array.isArray(body.notices) ? body.notices : [];
    if (!notices.length) return;
    const shownKey = 'pages-seo:admin-notices-shown';
    const shown = new Set(JSON.parse(sessionStorage.getItem(shownKey) || '[]'));
    for (const n of notices) {
      if (shown.has(n.id)) continue;
      shown.add(n.id);
      const kind = n.severity === 'error' ? 'bad'
                 : n.severity === 'warn'  ? 'warn'
                 : 'info';
      const opts = { duration: 0 };  // sticky — user dismisses
      if (n.action_url && n.action_label) {
        opts.action = {
          label: n.action_label,
          onClick: () => {
            // Internal anchors get activated; external links open in new tab.
            const url = n.action_url;
            if (url.startsWith('#') || url.startsWith('/admin#')) {
              // /admin#covers → activate the 'covers' tab
              const m = url.match(/#([a-z][a-z0-9-]*)/i);
              if (m && typeof activateTab === 'function') activateTab(m[1]);
            } else if (url.startsWith('http')) {
              window.open(url, '_blank', 'noopener');
            } else {
              window.location.href = url;
            }
            dismissNotice(n.id).catch(() => {});
          },
        };
      }
      const t = toast(n.title + (n.detail ? ' — ' + n.detail : ''), kind, opts);
      // Wrap the close button so dismissing the toast also dismisses
      // the backend notice (so it doesn't re-pop on next mount).
      const root = document.getElementById('toast-root');
      const last = root?.lastElementChild;
      const closeBtn = last?.querySelector('.toast-close');
      if (closeBtn) {
        const orig = closeBtn.onclick;
        closeBtn.onclick = (ev) => {
          dismissNotice(n.id).catch(() => {});
          orig?.(ev);
        };
      }
    }
    sessionStorage.setItem(shownKey, JSON.stringify([...shown]));
  }
  async function dismissNotice(id) {
    await api('/api/admin/notices/dismiss', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  async function api(path, opts = {}) {
    let finalPath = path;
    if (finalPath.startsWith('/api/admin/') && !finalPath.startsWith('/api/admin/whoami') && !finalPath.startsWith('/api/admin/login') && !finalPath.startsWith('/api/admin/logout')) {
      const activeId = window.__psActiveProjectId;
      if (activeId) {
        const u = new URL(finalPath, window.location.origin);
        if (!u.searchParams.has('project_id')) {
          u.searchParams.set('project_id', activeId);
          finalPath = u.pathname + u.search;
        }
      }
    }
    const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
    // `credentials: 'same-origin'` is the default, but we set it
    // explicitly so the session cookie ALWAYS rides along — including
    // for POST/PUT/DELETE where some browsers default differently.
    const r = await fetch(finalPath, { ...opts, headers, credentials: 'same-origin' });
    let body = null;
    try { body = await r.json(); } catch { /* not JSON */ }
    return { status: r.status, body };
  }

  // ── login gate ──────────────────────────────────────────────────
  // whoamiStatus returns:
  //   { ok: true, info } — authenticated + configured (signed in)
  //   { ok: false, reason: 'config', missing: [...] } — deployment incomplete
  //   { ok: false, reason: 'unauth' } — no session
  async function whoamiStatus() {
    const { status, body } = await api('/api/admin/whoami');
    if (status === 200) return { ok: true, info: body };
    if (status === 503) {
      // needs_setup === true means no admin user exists yet — the SPA
      // should render the first-run setup form instead of the dead-end
      // "missing secrets" message.
      return {
        ok: false,
        reason: body?.needs_setup ? 'setup' : 'config',
        missing: body?.missing || [],
      };
    }
    return { ok: false, reason: 'unauth' };
  }

  function showConfigError(missing) {
    $('#gate').hidden = false;
    $('#dash').hidden = true;
    const err = $('#gate-err');
    const form = $('#login-form');
    if (form) form.style.display = 'none';
    err.textContent =
      'Chưa hoàn tất cài đặt. Thiếu: ' + (missing.join(', ') || 'không rõ') +
      '. Hãy chạy setup.sh / setup.py / setup.js, hoặc đẩy secret còn thiếu bằng `wrangler pages secret put <TÊN>`, sau đó deploy lại.';
  }

  async function showGate(initial) {
    $('#gate').hidden = false;
    $('#dash').hidden = true;
    const form = $('#login-form');
    if (form) form.style.display = '';
    const email = $('#gate-email');
    const password = $('#gate-password');
    const err = $('#gate-err');
    const go = $('#gate-go');
    email.disabled = false; password.disabled = false; go.disabled = false;
    password.value = '';
    err.textContent = initial?.note || '';
    setTimeout(() => (email.value ? password.focus() : email.focus()), 0);
  }

  // Login submit. Bound exactly ONCE at script-load time so the
  // handler exists before any user click — earlier we lazily attached
  // inside showGate(), which left a window where a click would do a
  // native form submission (browser navigated to /admin? with empty
  // query string). preventDefault is called synchronously before any
  // await.
  function checkRegisterHash() {
    if (window.location.hash === "#register") {
      const tabReg = document.getElementById("tab-btn-register");
      if (tabReg) tabReg.click();
    }
  }

  function bindRegisterTabs() {
    const tabLogin = document.getElementById('tab-btn-login');
    const tabReg = document.getElementById('tab-btn-register');
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const err = document.getElementById('gate-err');

    if (tabLogin && tabReg) {
      tabLogin.addEventListener('click', () => {
        tabLogin.className = 'btn btn-sm btn-primary';
        tabReg.className = 'btn btn-sm btn-ghost';
        if (loginForm) loginForm.hidden = false;
        if (regForm) regForm.hidden = true;
        if (err) err.textContent = '';
      });

      tabReg.addEventListener('click', () => {
        tabReg.className = 'btn btn-sm btn-primary';
        tabLogin.className = 'btn btn-sm btn-ghost';
        if (loginForm) loginForm.hidden = true;
        if (regForm) regForm.hidden = false;
        if (err) err.textContent = '';
      });
    }

    const sendOtpBtn = document.getElementById('reg-send-otp');
    if (sendOtpBtn) {
      sendOtpBtn.addEventListener('click', async () => {
        const email = document.getElementById('reg-email')?.value.trim().toLowerCase();
        const brand = document.getElementById('reg-brand')?.value.trim() || 'GU SEO';
        const err = document.getElementById('gate-err');

        if (!email || !email.includes('@')) {
          if (err) err.textContent = 'Vui lòng nhập địa chỉ email hợp lệ trước khi gửi OTP.';
          return;
        }

        sendOtpBtn.disabled = true;
        sendOtpBtn.textContent = 'Đang gửi…';
        if (err) err.textContent = '';

        try {
          const res = await fetch('/api/public/send-otp', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, brand_name: brand })
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            let countdown = 60;
            sendOtpBtn.textContent = `Gửi lại (${countdown}s)`;
            const timer = setInterval(() => {
              countdown--;
              if (countdown <= 0) {
                clearInterval(timer);
                sendOtpBtn.disabled = false;
                sendOtpBtn.textContent = 'Gửi OTP';
              } else {
                sendOtpBtn.textContent = `Gửi lại (${countdown}s)`;
              }
            }, 1000);
            if (err) {
              err.className = 'status good';
              err.textContent = `Đã gửi mã OTP tới ${email}. Vui lòng kiểm tra hộp thư Gmail (kể cả mục Spam).`;
            }
            document.getElementById('reg-otp')?.focus();
            return;
          }
          if (err) {
            err.className = 'err';
            err.textContent = data.detail || data.error || 'Không thể gửi mã OTP. Vui lòng thử lại sau.';
          }
          sendOtpBtn.disabled = false;
          sendOtpBtn.textContent = 'Gửi OTP';
        } catch (e) {
          if (err) {
            err.className = 'err';
            err.textContent = 'Lỗi kết nối máy chủ gửi thư: ' + e.message;
          }
          sendOtpBtn.disabled = false;
          sendOtpBtn.textContent = 'Gửi OTP';
        }
      });
    }

    if (regForm) {
      regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const brand = document.getElementById('reg-brand')?.value.trim();
        const website = document.getElementById('reg-website')?.value.trim();
        const email = document.getElementById('reg-email')?.value.trim().toLowerCase();
        const password = document.getElementById('reg-password')?.value;
        const btn = document.getElementById('reg-go');

        const otp = document.getElementById('reg-otp')?.value.trim();

        if (!brand || !email || !password) {
          if (err) err.textContent = 'Vui lòng điền đầy đủ tên thương hiệu, email và mật khẩu.';
          return;
        }
        if (!otp || otp.length !== 6) {
          if (err) err.textContent = 'Vui lòng bấm "Gửi OTP" và nhập mã xác thực 6 số từ Gmail.';
          return;
        }
        if (password.length < 8) {
          if (err) err.textContent = 'Mật khẩu phải có từ 8 ký tự trở lên.';
          return;
        }

        if (err) err.textContent = '';
        if (btn) { btn.disabled = true; btn.textContent = 'Đang xác thực OTP & Khởi tạo…'; }

        try {
          const res = await fetch('/api/public/register', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              brand_name: brand,
              website_url: website,
              email,
              password,
              otp
            }),
            credentials: 'same-origin'
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            // Auto login succeeded. Mark onboarding as seen so the
            // quickstart popup does not fire, then mount and send the
            // new operator straight into the Brand setup wizard.
            try {
              const pid = data.project_id || 'default';
              localStorage.setItem('ps_onboarding_seen_' + pid, 'true');
              localStorage.setItem('ps_open_wizard_after_mount', '1');
            } catch {}
            await mount();
            return;
          }
          if (err) err.textContent = data.detail || data.error || 'Đăng ký không thành công. Vui lòng thử lại.';
        } catch (error) {
          if (err) err.textContent = 'Lỗi kết nối máy chủ: ' + error.message;
        } finally {
          if (btn) { btn.disabled = false; btn.textContent = 'Tạo tài khoản Free & Vào Console →'; }
        }
      });
    }
  }

  function bindLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      // Cancel the native submit IMMEDIATELY. Anything async happens
      // after this line; the browser already knows not to navigate.
      e.preventDefault();
      runLogin().catch((err) => {
        const errEl = document.getElementById('gate-err');
        if (errEl) errEl.textContent = 'Lỗi mạng: ' + (err?.message || err);
      });
      return false;
    });
  }

  async function runLogin() {
    const email = document.getElementById('gate-email');
    const password = document.getElementById('gate-password');
    const err = document.getElementById('gate-err');
    const go = document.getElementById('gate-go');
    const e2 = String(email.value || '').trim().toLowerCase();
    const p2 = String(password.value || '');
    if (!e2 || !p2) { err.textContent = 'Vui lòng nhập email và mật khẩu.'; return; }
    err.textContent = ''; go.disabled = true; go.textContent = 'Đang đăng nhập…';
    try {
      const { status, body } = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: e2, password: p2 }),
      });
      if (status === 200 && body?.ok) {
        mount();
        return;
      }
      if (status === 429) {
        const wait = body?.retry_after_sec ? Math.ceil(body.retry_after_sec / 60) : 60;
        err.textContent = `Quá nhiều lần thử thất bại. Vui lòng thử lại sau ~${wait} phút.`;
        return;
      }
      err.textContent = body?.error === 'invalid_credentials'
        ? 'Email hoặc mật khẩu không chính xác.'
        : (body?.error || `Đăng nhập thất bại (HTTP ${status}).`);
    } finally {
      go.disabled = false; go.textContent = 'Đăng nhập';
    }
  }

  async function doLogout() {
    try { await api('/api/admin/logout', { method: 'POST' }); }
    catch { /* swallow */ }
    showGate({ note: 'Đã đăng xuất.' });
  }

  // Theme toggle: swap data-theme on <html>, persist choice.
  // The initial value is applied early in admin.html so there's no
  // flash-of-wrong-theme on first paint; this just handles the click.
  function toggleTheme() {
    const html = document.documentElement;
    const next = html.dataset.theme === 'light' ? 'dark' : 'light';
    if (next === 'light') html.dataset.theme = 'light';
    else delete html.dataset.theme;
    try { localStorage.setItem('ps_admin_theme', next); } catch { /* private mode */ }
  }

  // ── tabs ────────────────────────────────────────────────────────
  let currentLang = localStorage.getItem('ps_lang') || 'vi';

  const SUBTAB_LABELS_MAP = {
    vi: {
      blog: 'Blog hàng ngày',
      calendar: 'Lịch bài viết',
      brand: 'Brand DNA',
      prog: 'Programmatic SEO',
      links: 'Liên kết',
      seo: 'SEO & IndexNow',
      embeds: 'Widget nhúng',
      status: 'Trạng thái',
      updates: 'Cập nhật',
      usage: 'Chi phí & Token',
      trends: 'Xu hướng',
    },
    en: {
      blog: 'Daily blog',
      calendar: 'Calendar',
      brand: 'Brand DNA',
      prog: 'Programmatic',
      links: 'Links',
      seo: 'SEO',
      embeds: 'Embeds',
      status: 'Status',
      updates: 'Updates',
      usage: 'Usage',
      trends: 'Trends',
    }
  };

  // System-level surfaces a project-scoped operator must never reach:
  // AI provider keys and budget, global SEO settings, GSC credentials,
  // and the install/update controls. Hidden from the nav and blocked in
  // activateTab so deep links can't open them either. Distribution
  // (seo + embeds) stays available — it is project-scoped and is how a
  // tenant hands their blog to their own site.
  // Role-based navigation policy:
  // 4 system tabs (Dự án, Người dùng, Cài đặt, Hệ thống) are exclusive to super_admin.
  // Regular users / tenants (project_admin) only see the 5 business tabs.
  const SUPER_ADMIN_ONLY_TABS = ['settings', 'status', 'users', 'projects'];
  const PROJECT_ADMIN_HIDDEN_PAGES = ['settings', 'status', 'updates', 'usage', 'users', 'projects'];

  function applyRoleVisibility(role) {
    const isSuper = (role === 'super_admin');
    for (const tab of $$('.tab')) {
      if (SUPER_ADMIN_ONLY_TABS.includes(tab.dataset.tab)) {
        tab.hidden = !isSuper;
      }
    }
    // The setup wizard is project-scoped (Brand DNA -> providers ->
    // calendar), so every operator keeps it — a newly registered tenant
    // needs it to configure their own brand.
    const wizardBtn = $('#open-wizard');
    if (wizardBtn) wizardBtn.hidden = false;
  }

  function isTabBlocked(name) {
    const role = window.__psRole;
    return role && role !== 'super_admin' && PROJECT_ADMIN_HIDDEN_PAGES.includes(name);
  }

  const TAB_LABELS_MAP = {
    vi: {
      overview: 'Tổng quan',
      blog: 'Bài viết',
      brand: 'Thương hiệu',
      covers: 'Ảnh bìa',
      analytics: 'Phân tích',
      seo: 'Phân phối',
      status: 'Hệ thống',
      trends: 'Xu hướng',
      settings: 'Cài đặt',
      users: 'Người dùng',
      projects: 'Dự án',
    },
    en: {
      overview: 'Overview',
      blog: 'Blog',
      brand: 'Brand',
      covers: 'Covers',
      analytics: 'Analytics',
      seo: 'Distribution',
      status: 'System',
      trends: 'Trends',
      settings: 'Settings',
      users: 'Users',
      projects: 'Projects',
    }
  };

  function applyLanguage(lang) {
    currentLang = lang;
    try { localStorage.setItem('ps_lang', lang); } catch {}
    const langBtn = $('#lang-toggle');
    const flagEl = $('#admin-flag-icon');
    const textEl = $('#admin-lang-text');
    if (flagEl) {
      flagEl.innerHTML = lang === 'vi' ? '<svg class="flag-icon" width="16" height="12" viewBox="0 0 30 20" style="border-radius:2px;display:inline-block;vertical-align:middle;"><rect width="30" height="20" fill="#da251d"/><polygon points="15,4 17.5,11.5 10,7 20,7 12.5,11.5" fill="#ff0"/></svg>' : '<svg class="flag-icon" width="16" height="12" viewBox="0 0 60 30" style="border-radius:2px;display:inline-block;vertical-align:middle;"><clipPath id="s"><path d="M0,0 v30 h60 v-30 z"/></clipPath><clipPath id="t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><g clip-path="url(#s)"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#t)" stroke="#c8102e" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#c8102e" stroke-width="6"/></g></svg>';
    }
    if (textEl) {
      textEl.textContent = lang.toUpperCase();
    } else if (langBtn) {
      langBtn.textContent = lang.toUpperCase();
    }

    $$('.tab').forEach((t) => {
      const tabName = t.dataset.tab;
      if (!tabName || !TAB_LABELS_MAP[lang]?.[tabName]) return;
      const labelEl = t.querySelector('.tab-label');
      if (labelEl) {
        labelEl.textContent = TAB_LABELS_MAP[lang][tabName];
      } else {
        const textNode = Array.from(t.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
        if (textNode) {
          textNode.textContent = TAB_LABELS_MAP[lang][tabName] + ' ';
        }
      }
    });

    const sub = document.getElementById('subtabs');
    if (sub) {
      for (const btn of sub.querySelectorAll('.subtab')) {
        const kid = btn.dataset.tab;
        btn.textContent = SUBTAB_LABELS_MAP[lang]?.[kid] || kid;
      }
    }

    const wizardBtn = $('#open-wizard');
    if (wizardBtn) wizardBtn.textContent = lang === 'vi' ? 'Trình thiết lập' : 'Setup wizard';
    const lockBtn = $('#lock');
    if (lockBtn) lockBtn.textContent = lang === 'vi' ? 'Đăng xuất' : 'Sign out';
  }

  // Friendly labels for the sub-nav (data-children is just IDs).
  const SUBTAB_LABELS = SUBTAB_LABELS_MAP[currentLang];

  // Walk the top-level tabs and find which one owns this page name.
  // Returns { parentTab, children } or null if the page is a top-level
  // tab on its own.
  function findParentTab(name) {
    const all = $$('.tab[data-children]');
    for (const t of all) {
      const kids = t.dataset.children.split(',').map((s) => s.trim());
      if (kids.includes(name)) return { parentTab: t, children: kids };
    }
    // Page is a top-level tab without children (overview, covers, settings).
    return null;
  }

  // Track the currently-active page so we can short-circuit
  // redundant activateTab calls. Without this, clicking the same
  // tab twice (or a dispatcher that fires multiple times — e.g. a
  // child sub-nav click during a parent re-render) would re-run
  // all the per-tab loaders, which in some tabs (Status, Calendar)
  // do real network work. A loop of even moderate frequency
  // looks like an "infinite refresh" to the user.
  let _activeTab = null;
  function activateTab(name) {
    if (!name) return;
    if (isTabBlocked(name)) name = 'overview';
    // No-op when already on this page. Lets handlers be wired
    // permissively without worrying about double-fires.
    if (name === _activeTab) return;
    _activeTab = name;
    if (location.hash !== '#' + name) {
      history.replaceState(null, '', '#' + name);
    }

    // Resolve to the parent group if this page is a child.
    const parent = findParentTab(name);
    const parentTabName = parent ? parent.parentTab.dataset.tab : name;

    // Highlight the parent in the top-level nav.
    $$('.tab').forEach((t) => {
      const active = t.dataset.tab === parentTabName;
      t.setAttribute('aria-current', active ? 'page' : 'false');
    });

    // Show only the requested page section.
    $$('[data-page]').forEach((p) => {
      p.hidden = p.dataset.page !== name;
    });

    // Render the sub-nav strip for the parent's children, OR hide if
    // this is a flat tab without siblings. We re-render every time
    // (cheap; max 4 buttons) but only touch the DOM if the parent
    // changed since last call — keeps the visual flicker down when
    // jumping between siblings.
    const sub = document.getElementById('subtabs');
    if (sub) {
      const newParentId = parent ? parent.parentTab.dataset.tab : '';
      if (sub.dataset.parent !== newParentId) {
        clearChildren(sub);
        if (parent && parent.children.length > 1) {
          for (const kid of parent.children) {
            const btn = document.createElement('button');
            btn.className = 'subtab';
            btn.dataset.tab = kid;
            btn.textContent = SUBTAB_LABELS_MAP[currentLang]?.[kid] || SUBTAB_LABELS[kid] || kid;
            btn.addEventListener('click', () => activateTab(kid));
            sub.appendChild(btn);
          }
          sub.hidden = false;
          if (parent.parentTab) {
            parent.parentTab.insertAdjacentElement('afterend', sub);
          }
        } else {
          sub.hidden = true;
        }
        sub.dataset.parent = newParentId;
      } else if (parent && parent.parentTab && sub.previousElementSibling !== parent.parentTab) {
        parent.parentTab.insertAdjacentElement('afterend', sub);
      }
      // Update the is-active class without rebuilding the buttons.
      for (const btn of sub.querySelectorAll('.subtab')) {
        btn.classList.toggle('is-active', btn.dataset.tab === name);
      }
    }

    if (name === 'overview') loadOverview();
    if (name === 'blog') { loadJobs(); loadPosts(); }
    if (name === 'prog') { loadQueue(); }
    if (name === 'seo') { renderDistribution(); }
    if (name === 'brand') { loadBrand(); }
    if (name === 'links') { Links.init(); }
    if (name === 'calendar') { Calendar.init(); }
    if (name === 'usage') { loadUsage(); }
    if (name === 'covers') { Cover.init(); }
    if (name === 'embeds') { loadEmbeds(); }
    if (name === 'updates') { Updates.init(); }
    if (name === 'status')   { Status.init(); }
    if (name === 'settings') { loadSettings(); loadProviderGrid(); }
    if (name === 'users') { Users.init(); }
    if (name === 'projects') { Projects.init(); }
    if (name === 'analytics') { loadAnalytics(); }
    if (name === 'trends') { loadTrends(); }
  }

  async function loadAnalytics() {
    const { status, body } = await api('/api/admin/analytics');
    if (status !== 200 || !body?.ok) return;

    setText($('#an-total-posts'), body.total_posts ?? 0);
    setText($('#an-total-leads'), body.total_leads ?? 0);
    setText($('#an-ai-cost'), '$' + (Number(body.ai_cost_30d) || 0).toFixed(2));

    const fbEl = $('#an-feedback');
    if (fbEl) {
      fbEl.classList.remove('dim');
      clearChildren(fbEl);
      if (!body.feedback || !body.feedback.length) {
        fbEl.textContent = currentLang === 'vi' ? 'Chưa có phản hồi từ độc giả.' : 'No feedback received yet.';
      } else {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.gap = '16px';
        wrap.style.flexWrap = 'wrap';
        for (const row of body.feedback) {
          const card = document.createElement('div');
          card.style.padding = '8px 16px';
          card.style.border = '1px solid var(--border, #333)';
          card.style.borderRadius = '6px';
          const title = document.createElement('strong');
          title.textContent = (row.rating === 'yes' ? '👍 Hữu ích: ' : (row.rating === 'no' ? '👎 Chưa hữu ích: ' : `${row.rating}: `));
          const count = document.createElement('span');
          count.textContent = String(row.n ?? 0);
          card.appendChild(title);
          card.appendChild(count);
          wrap.appendChild(card);
        }
        fbEl.appendChild(wrap);
      }
    }

    const viewsEl = $('#an-views');
    if (viewsEl) {
      viewsEl.classList.remove('dim');
      clearChildren(viewsEl);
      if (!body.top_views || !body.top_views.length) {
        viewsEl.textContent = currentLang === 'vi' ? 'Chưa có dữ liệu lượt xem.' : 'No view data yet.';
      } else {
        const table = document.createElement('table');
        table.className = 'table';
        table.style.width = '100%';
        const thead = document.createElement('thead');
        const trh = document.createElement('tr');
        const headers = currentLang === 'vi'
          ? ['Bài viết', 'Lượt xem', 'Thời gian đọc TB']
          : ['Bài viết', 'Lượt xem', 'Thời gian đọc TB'];
        for (const h of headers) {
          const th = document.createElement('th');
          th.textContent = h;
          th.style.textAlign = 'left';
          th.style.padding = '8px';
          trh.appendChild(th);
        }
        thead.appendChild(trh);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const row of body.top_views) {
          const tr = document.createElement('tr');
          const tdSlug = document.createElement('td');
          tdSlug.textContent = row.blog_slug || '-';
          tdSlug.style.padding = '8px';
          const tdViews = document.createElement('td');
          tdViews.textContent = String(row.view_count ?? 0);
          tdViews.style.padding = '8px';
          const tdTime = document.createElement('td');
          const avgMs = row.view_count ? Math.round((row.total_read_time_ms || 0) / row.view_count) : 0;
          tdTime.textContent = avgMs >= 1000 ? `${(avgMs / 1000).toFixed(1)}s` : `${avgMs}ms`;
          tdTime.style.padding = '8px';
          tr.appendChild(tdSlug);
          tr.appendChild(tdViews);
          tr.appendChild(tdTime);
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        viewsEl.appendChild(table);
      }
    }

    const leadsEl = $('#an-leads');
    if (leadsEl) {
      leadsEl.classList.remove('dim');
      clearChildren(leadsEl);
      if (!body.latest_leads || !body.latest_leads.length) {
        leadsEl.textContent = currentLang === 'vi' ? 'Chưa có leads nào được thu thập.' : 'No leads captured yet.';
      } else {
        const table = document.createElement('table');
        table.className = 'table';
        table.style.width = '100%';
        const thead = document.createElement('thead');
        const trh = document.createElement('tr');
        const headers = currentLang === 'vi'
          ? ['Tên', 'Liên hệ', 'Nguồn', 'Bài viết', 'Thời gian']
          : ['Name', 'Contact', 'Source', 'Post', 'Date'];
        for (const h of headers) {
          const th = document.createElement('th');
          th.textContent = h;
          th.style.textAlign = 'left';
          th.style.padding = '8px';
          trh.appendChild(th);
        }
        thead.appendChild(trh);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const row of body.latest_leads) {
          const tr = document.createElement('tr');
          const tdName = document.createElement('td');
          tdName.textContent = row.name || '-';
          tdName.style.padding = '8px';
          const tdContact = document.createElement('td');
          tdContact.textContent = [row.email, row.phone].filter(Boolean).join(' / ') || '-';
          tdContact.style.padding = '8px';
          const tdSource = document.createElement('td');
          tdSource.textContent = row.source || '-';
          tdSource.style.padding = '8px';
          const tdSlug = document.createElement('td');
          tdSlug.textContent = row.blog_slug || '-';
          tdSlug.style.padding = '8px';
          const tdTime = document.createElement('td');
          tdTime.textContent = row.created_at ? new Date(row.created_at * 1000).toLocaleString() : '-';
          tdTime.style.padding = '8px';
          tr.appendChild(tdName);
          tr.appendChild(tdContact);
          tr.appendChild(tdSource);
          tr.appendChild(tdSlug);
          tr.appendChild(tdTime);
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        leadsEl.appendChild(table);
      }
    }
  }

  async function loadTrends() {
    const genBtn = $('#trend-generate');
    if (genBtn && !genBtn.dataset.wired) {
      genBtn.dataset.wired = '1';
      genBtn.addEventListener('click', async () => {
        genBtn.disabled = true;
        const statusEl = $('#trend-status');
        if (statusEl) statusEl.textContent = currentLang === 'vi' ? 'Đang phân tích xu hướng...' : 'Analyzing trends...';
        try {
          const { status, body } = await api('/api/admin/trend-discover', { method: 'POST', body: JSON.stringify({}) });
          if (status === 200 && body?.ok) {
            if (statusEl) statusEl.textContent = currentLang === 'vi' ? `Thành công! Đã tạo ${body.generated || 0} chủ đề.` : `Success! Generated ${body.generated || 0} topics.`;
            await loadTrends();
          } else {
            if (statusEl) statusEl.textContent = `Error: ${body?.error || status}`;
          }
        } catch (err) {
          if (statusEl) statusEl.textContent = `Network error: ${err.message}`;
        } finally {
          genBtn.disabled = false;
        }
      });
    }

    const listEl = $('#trend-list');
    if (!listEl) return;
    const { status, body } = await api('/api/admin/trend-discover');
    listEl.classList.remove('dim');
    clearChildren(listEl);
    if (status !== 200 || !body?.ok) {
      listEl.textContent = currentLang === 'vi' ? 'Lỗi tải danh sách xu hướng.' : 'Error loading trend topics.';
      return;
    }
    if (!body.topics || !body.topics.length) {
      listEl.textContent = currentLang === 'vi' ? 'Chưa có chủ đề xu hướng nào. Hãy nhấn "Khám phá xu hướng" ở trên.' : 'No trend topics found. Click "Discover trends" above.';
      return;
    }

    const table = document.createElement('table');
    table.className = 'table';
    table.style.width = '100%';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const headers = currentLang === 'vi'
      ? ['Chủ đề', 'Điểm phù hợp', 'Nguồn', 'Trạng thái', 'Thời gian']
      : ['Topic', 'Relevance Score', 'Source', 'Status', 'Date'];
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.textAlign = 'left';
      th.style.padding = '8px';
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const topic of body.topics) {
      const tr = document.createElement('tr');
      const tdTopic = document.createElement('td');
      tdTopic.textContent = topic.topic || '-';
      tdTopic.style.padding = '8px';
      tdTopic.style.fontWeight = '500';
      const tdScore = document.createElement('td');
      tdScore.textContent = `${topic.relevance_score ?? 80}/100`;
      tdScore.style.padding = '8px';
      const tdSource = document.createElement('td');
      tdSource.textContent = topic.source || 'ai';
      tdSource.style.padding = '8px';
      const tdStatus = document.createElement('td');
      tdStatus.textContent = topic.status || 'pending';
      tdStatus.style.padding = '8px';
      const tdTime = document.createElement('td');
      tdTime.textContent = topic.created_at ? new Date(topic.created_at * 1000).toLocaleString() : '-';
      tdTime.style.padding = '8px';
      tr.appendChild(tdTopic);
      tr.appendChild(tdScore);
      tr.appendChild(tdSource);
      tr.appendChild(tdStatus);
      tr.appendChild(tdTime);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    listEl.appendChild(table);
    await loadCompetitors();
  }

  async function loadCompetitors() {
    const scoreBtn = $('#topic-score');
    if (scoreBtn && !scoreBtn.dataset.wired) {
      scoreBtn.dataset.wired = '1';
      scoreBtn.addEventListener('click', async () => {
        const statusEl = $('#topic-score-status');
        scoreBtn.disabled = true;
        if (statusEl) statusEl.textContent = currentLang === 'vi' ? 'Đang chấm điểm...' : 'Scoring...';
        try {
          const { status, body } = await api('/api/admin/topics/score', { method: 'POST', body: JSON.stringify({ project_id: 'gulagi' }) });
          if (status === 200 && body?.ok) {
            if (statusEl) statusEl.textContent = currentLang === 'vi' ? `Đã chấm ${body.count || 0} topics.` : `Scored ${body.count || 0} topics.`;
            renderScoreList(body.topics || []);
          } else {
            if (statusEl) statusEl.textContent = `Error: ${body?.error || status}`;
          }
        } catch (err) {
          if (statusEl) statusEl.textContent = `Network error: ${err.message}`;
        } finally {
          scoreBtn.disabled = false;
        }
      });
    }
    const scanBtn = $('#comp-scan');
    if (scanBtn && !scanBtn.dataset.wired) {
      scanBtn.dataset.wired = '1';
      scanBtn.addEventListener('click', async () => {
        const statusEl = $('#comp-status');
        const keyword = $('#comp-keyword')?.value.trim() || '';
        const urls = $('#comp-urls')?.value.split('\n').map((s) => s.trim()).filter(Boolean) || [];
        if (!keyword) { if (statusEl) statusEl.textContent = currentLang === 'vi' ? 'Nhập từ khóa trước.' : 'Enter a keyword first.'; return; }
        if (!urls.length) { if (statusEl) statusEl.textContent = currentLang === 'vi' ? 'Nhập ít nhất 1 URL đối thủ.' : 'Enter at least 1 rival URL.'; return; }
        scanBtn.disabled = true;
        if (statusEl) statusEl.textContent = currentLang === 'vi' ? 'Đang đo đối thủ...' : 'Measuring rivals...';
        try {
          const { status, body } = await api('/api/admin/competitors/scan', { method: 'POST', body: JSON.stringify({ project_id: 'gulagi', keyword, urls }) });
          if (status === 200 && body?.ok) {
            const n = (body.snapshots || []).filter((s) => !s.error).length;
            if (statusEl) statusEl.textContent = body.cached
              ? (currentLang === 'vi' ? `Dùng lại snapshot 7 ngày (${n} URL).` : `Reused 7-day snapshot (${n} URLs).`)
              : (currentLang === 'vi' ? `Đã đo ${n}/${urls.length} URL.` : `Measured ${n}/${urls.length} URLs.`);
            await loadCompetitors();
          } else {
            if (statusEl) statusEl.textContent = `Error: ${body?.error || status}`;
          }
        } catch (err) {
          if (statusEl) statusEl.textContent = `Network error: ${err.message}`;
        } finally {
          scanBtn.disabled = false;
        }
      });
    }

    const listEl = $('#comp-list');
    if (!listEl) return;
    const { status, body } = await api('/api/admin/competitors');
    listEl.classList.remove('dim');
    clearChildren(listEl);
    if (status !== 200 || !body?.ok || !body.snapshots?.length) {
      listEl.textContent = currentLang === 'vi' ? 'Chưa có snapshot nào. Nhập từ khóa + URL rồi bấm "So sánh đối thủ".' : 'No snapshots yet. Enter a keyword + URLs and scan.';
      return;
    }
    const table = document.createElement('table');
    table.className = 'table';
    table.style.width = '100%';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const headers = currentLang === 'vi'
      ? ['URL đối thủ', 'Số từ', 'Số H2', 'Số link']
      : ['Rival URL', 'Words', 'H2s', 'Links'];
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.textAlign = 'left';
      th.style.padding = '8px';
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const s of body.snapshots) {
      const tr = document.createElement('tr');
      const tdUrl = document.createElement('td');
      tdUrl.textContent = s.error ? `${s.competitor_url} (${s.error})` : (s.title ? `${s.title} — ${s.competitor_url}` : s.competitor_url);
      tdUrl.style.padding = '8px';
      tdUrl.style.maxWidth = '420px';
      tdUrl.style.overflow = 'hidden';
      tdUrl.style.textOverflow = 'ellipsis';
      const tdW = document.createElement('td'); tdW.textContent = s.word_count ?? '-'; tdW.style.padding = '8px';
      const tdH = document.createElement('td'); tdH.textContent = s.h2_count ?? '-'; tdH.style.padding = '8px';
      const tdL = document.createElement('td'); tdL.textContent = s.link_count ?? '-'; tdL.style.padding = '8px';
      tr.appendChild(tdUrl); tr.appendChild(tdW); tr.appendChild(tdH); tr.appendChild(tdL);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    listEl.appendChild(table);
  }

  function renderScoreList(topics) {
    const listEl = $('#topic-score-list');
    if (!listEl) return;
    listEl.classList.remove('dim');
    clearChildren(listEl);
    if (!topics.length) {
      listEl.textContent = currentLang === 'vi' ? 'Không còn candidate nào (đã chọn, dùng hoặc lưu trữ hết).' : 'No candidates left.';
      return;
    }
    const table = document.createElement('table');
    table.className = 'table';
    table.style.width = '100%';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const headers = currentLang === 'vi'
      ? ['Chủ đề', 'Điểm cuối', 'Liên quan', 'Tươi mới', 'Cạnh tranh', 'Ý định']
      : ['Topic', 'Final', 'Relevance', 'Freshness', 'Competition', 'Intent'];
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.textAlign = 'left';
      th.style.padding = '8px';
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const t of topics) {
      const tr = document.createElement('tr');
      const cells = [t.key || '-', `${t.final ?? '-'}/100`, t.relevance ?? '-', t.freshness ?? '-', t.competition ?? '-', t.intent || '-'];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        td.style.padding = '8px';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    listEl.appendChild(table);
  }

  // ── usage ──────────────────────────────────────────────────────
  function fmtUSD(n) {
    if (n == null) return '—';
    if (n < 0.01) return '$' + n.toFixed(4);
    if (n < 1)    return '$' + n.toFixed(3);
    return '$' + n.toFixed(2);
  }
  function fmtInt(n) {
    if (n == null) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  }

  async function loadUsage() {
    const win = $('#usage-window')?.value || 'month';
    const { status, body } = await api('/api/admin/usage?window=' + encodeURIComponent(win));
    if (status !== 200) return;

    // Headline numbers
    setText($('#usage-spent'),  fmtUSD(body.total.cost_usd));
    setText($('#usage-budget'), body.budget.monthly_usd > 0 ? fmtUSD(body.budget.monthly_usd) : 'không có');
    setText($('#usage-pct'),    body.budget.monthly_usd > 0 ? body.budget.pct + '%' : '—');
    setText($('#usage-calls'),  fmtInt(body.total.calls));
    setText($('#usage-tokens'), fmtInt(body.total.total_tokens));
    setText($('#usage-errors'), fmtInt(body.total.errors));

    // Progress bar
    const wrap = $('#usage-progress-wrap');
    const fill = $('#usage-progress-fill');
    if (body.budget.monthly_usd > 0) {
      wrap.style.display = 'block';
      const pct = Math.min(100, body.budget.pct);
      fill.style.width = pct + '%';
      fill.classList.toggle('warn', body.budget.over_warn);
      fill.classList.toggle('bad',  body.budget.over_budget);
    } else {
      wrap.style.display = 'none';
    }

    // Banner
    const bCard = $('#usage-banner-card');
    const banner = $('#usage-banner');
    if (body.budget.over_budget) {
      bCard.hidden = false;
      banner.className = 'usage-banner bad';
      banner.innerHTML = '<strong>Đã vượt hạn mức ngân sách.</strong> Cron Worker tạm thời bị chặn. Việc tạo bài từ admin vẫn hoạt động (kèm hộp thoại xác nhận). Hãy tăng hạn mức trong Cài đặt hoặc chờ sang tháng sau.';
    } else if (body.budget.over_warn) {
      bCard.hidden = false;
      banner.className = 'usage-banner warn';
      banner.innerHTML = `<strong>Đã sử dụng ${body.budget.pct}% ngân sách hàng tháng.</strong> Hãy cân nhắc điều chỉnh các nhà cung cấp AI hoặc tạm dừng cron cho đến tháng mới.`;
    } else {
      bCard.hidden = true;
    }

    // By provider
    const tbP = $('#usage-by-provider');
    clearChildren(tbP);
    if (!body.by_provider.length) {
      const tr = document.createElement('tr'); const td_ = document.createElement('td');
      td_.colSpan = 4; td_.className = 'dim'; td_.textContent = 'Chưa có dữ liệu sử dụng trong khoảng thời gian này.';
      tr.appendChild(td_); tbP.appendChild(tr);
    } else {
      for (const p of body.by_provider) {
        const tr = document.createElement('tr');
        tr.appendChild(td(p.provider, 'cell-strong'));
        tr.appendChild(td(p.calls));
        tr.appendChild(td(fmtInt(p.tokens)));
        tr.appendChild(td(fmtUSD(p.cost)));
        tbP.appendChild(tr);
      }
    }

    // By kind
    const tbK = $('#usage-by-kind');
    clearChildren(tbK);
    if (!body.by_kind.length) {
      const tr = document.createElement('tr'); const td_ = document.createElement('td');
      td_.colSpan = 4; td_.className = 'dim'; td_.textContent = 'Chưa có dữ liệu sử dụng.';
      tr.appendChild(td_); tbK.appendChild(tr);
    } else {
      for (const k of body.by_kind) {
        const tr = document.createElement('tr');
        tr.appendChild(td(k.kind, 'cell-strong'));
        tr.appendChild(td(k.calls));
        tr.appendChild(td(fmtInt(k.tokens)));
        tr.appendChild(td(fmtUSD(k.cost)));
        tbK.appendChild(tr);
      }
    }

    // Daily bars
    const daily = $('#usage-daily');
    clearChildren(daily);
    if (!body.daily.length) {
      daily.textContent = 'Chưa có dữ liệu sử dụng.';
      daily.className = 'usage-daily dim';
    } else {
      daily.className = 'usage-daily';
      const max = Math.max(...body.daily.map((d) => d.cost), 0.001);
      for (const d of body.daily) {
        const row = document.createElement('div'); row.className = 'usage-day';
        const lbl = document.createElement('div'); lbl.className = 'usage-day-label'; lbl.textContent = d.date;
        const barWrap = document.createElement('div'); barWrap.className = 'usage-day-bar';
        const bar = document.createElement('div'); bar.className = 'usage-day-fill';
        bar.style.width = Math.max(2, (d.cost / max) * 100) + '%';
        barWrap.appendChild(bar);
        const val = document.createElement('div'); val.className = 'usage-day-val'; val.textContent = `${fmtUSD(d.cost)} · ${d.calls} lượt gọi`;
        row.append(lbl, barWrap, val);
        daily.appendChild(row);
      }
    }

    // Recent
    const tbR = $('#usage-recent');
    clearChildren(tbR);
    if (!body.recent.length) {
      const tr = document.createElement('tr'); const td_ = document.createElement('td');
      td_.colSpan = 7; td_.className = 'dim'; td_.textContent = 'Chưa có lượt gọi nào.';
      tr.appendChild(td_); tbR.appendChild(tr);
    } else {
      for (const r of body.recent) {
        const tr = document.createElement('tr');
        const when = new Date(r.created_at * 1000);
        tr.appendChild(td(when.toISOString().slice(5, 16).replace('T', ' ')));
        tr.appendChild(td(r.provider));
        tr.appendChild(td(r.kind));
        tr.appendChild(td(r.source || '—'));
        tr.appendChild(td(fmtInt(r.total_tokens)));
        tr.appendChild(td(fmtUSD(r.cost_usd)));
        const tdOk = document.createElement('td');
        const pill = document.createElement('span');
        pill.className = 'pill ' + (r.ok ? 'good' : 'bad');
        pill.textContent = r.ok ? 'ok' : 'err';
        if (!r.ok && r.error) tdOk.title = r.error;
        tdOk.appendChild(pill);
        tr.appendChild(tdOk);
        tbR.appendChild(tr);
      }
    }
  }

  // ── brand DNA ────────────────────────────────────────────────────
  // Project name used by the wrangler-secret-put hint. Inferred from
  // SITE_URL when possible (e.g. https://my-royal-bath.pages.dev → my-royal-bath).
  function inferProjectName(siteUrl) {
    try {
      const host = new URL(siteUrl).hostname;
      const m = host.match(/^([^.]+)\.pages\.dev$/);
      if (m) return m[1];
      return host.split('.')[0];
    } catch { return '<project-name>'; }
  }

  function fillBrand(brand) {
    $$('[data-brand]').forEach((el) => {
      const k = el.dataset.brand;
      el.value = brand?.[k] ?? '';
    });
    const ga = $('#brand-generated-at');
    if (ga) ga.value = brand?.generated_at || '';
  }

  async function loadBrand() {
    const { status, body } = await api('/api/admin/brand-dna');
    if (status !== 200) return;
    fillBrand(body?.brand || {});
    fillBrandIdentity(body?.brand || {});
    // Pre-seed the URL input with the saved source_url if any.
    const urlIn = $('#brand-url');
    if (urlIn && !urlIn.value) urlIn.value = body?.brand?.source_url || '';

    const curProj = _allProjects.find((p) => p.id === window.__psActiveProjectId)
      || _allProjects.find((p) => p.id === body?.project_id);
    const infoEl = $('#brand-project-info');
    if (infoEl) {
      if (curProj) {
        infoEl.textContent = `(${curProj.name}${curProj.website_url ? ' · ' + curProj.website_url : ''})`;
      } else {
        infoEl.textContent = '';
      }
    }
  }

  async function generateBrand() {
    const url = $('#brand-url').value.trim();
    const status = $('#brand-gen-status');
    if (!url) { status.className = 'status bad'; status.textContent = 'Vui lòng nhập URL trước.'; return; }
    const btn = $('#brand-generate');
    btn.disabled = true;
    status.className = 'status'; status.textContent = 'Đang cào & phân tích… ~10-30s';
    const { status: code, body } = await api('/api/admin/brand-dna', {
      method: 'POST',
      body: JSON.stringify({
        url,
        // Carry over any user-typed service-area / topics-to-avoid so the
        // model doesn't overwrite the operator's intent.
        service_area:    $('[data-brand="service_area"]').value.trim() || undefined,
        topics_to_avoid: $('[data-brand="topics_to_avoid"]').value.trim() || undefined,
      }),
    });
    btn.disabled = false;
    if (code !== 200 || !body?.ok) {
      status.className = 'status bad';
      status.textContent = (body?.error || code) + (body?.detail ? ' · ' + body.detail : '');
      return;
    }
    fillBrand(body.brand);
    // Also fill source_url field manually since the GET endpoint returns
    // it under a key the form-fill loop reads.
    const su = $('[data-brand="source_url"]');
    if (su) su.value = body.brand.source_url || '';
    status.className = 'status good';
    status.textContent = `Đã tạo · nhà cung cấp=${body.brand.provider}. Hãy xem lại rồi nhấn Lưu.`;
  }

  function clearBrandFields() {
    if (!confirm('Xóa trắng các trường Brand DNA ở giao diện hiện tại? (Nhấn Lưu sau đó để lưu trạng thái rỗng.)')) return;
    $$('[data-brand]').forEach((el) => { el.value = ''; });
    const ga = $('#brand-generated-at'); if (ga) ga.value = '';
    const su = $('#brand-url'); if (su) su.value = '';
    const status = $('#brand-save-status');
    status.className = 'status'; status.textContent = 'Đã xóa các trường. Nhấn Lưu để lưu thay đổi.';
  }

  async function runBrandFilter(dryRun) {
    const status = $('#brand-filter-status');
    const out = $('#brand-filter-results');
    const dryBtn = $('#brand-filter-dry');
    const goBtn = $('#brand-filter-go');
    dryBtn.disabled = true; goBtn.disabled = true;
    status.className = 'status';
    status.textContent = dryRun ? 'Đang chạy thử…' : 'Đang lọc (kết quả bị loại sẽ được ghi vào D1)…';
    const { status: code, body } = await api('/api/admin/brand-filter-queue', {
      method: 'POST',
      body: JSON.stringify({ dry_run: !!dryRun }),
    });
    dryBtn.disabled = false; goBtn.disabled = false;
    if (code !== 200 || !body?.ok) {
      status.className = 'status bad';
      status.textContent = (body?.error || code) + (body?.hint ? ' · ' + body.hint : '');
      out.hidden = true;
      return;
    }
    status.className = 'status good';
    status.textContent = `${dryRun ? '[thử nghiệm]' : '[áp dụng]'} đã đánh giá ${body.evaluated} · giữ lại ${body.kept} · loại bỏ ${body.dropped} · nhà cung cấp=${body.provider}`;
    if (!dryRun) loadQueue();
    // Render the dropped sample
    out.hidden = false;
    clearChildren(out);
    if (body.dropped_sample?.length) {
      const h = document.createElement('h4'); h.textContent = 'Bị loại (' + body.dropped_sample.length + ' mục đầu tiên)';
      out.appendChild(h);
      const ul = document.createElement('ul');
      for (const d of body.dropped_sample) {
        const li = document.createElement('li');
        const kw = document.createElement('span'); kw.className = 'kw'; kw.textContent = d.keyword;
        const reason = document.createElement('span'); reason.className = 'meta'; reason.textContent = d.reason;
        li.append(kw, reason);
        ul.appendChild(li);
      }
      out.appendChild(ul);
    } else {
      const p = document.createElement('p'); p.className = 'dim';
      p.textContent = 'Không có từ khóa nào sai lệch định hướng thương hiệu.';
      out.appendChild(p);
    }
  }

  async function saveBrand() {
    const status = $('#brand-save-status');
    status.className = 'status'; status.textContent = 'Đang lưu…';
    const payload = {};
    $$('[data-brand]').forEach((el) => {
      payload[el.dataset.brand] = (el.value || '').toString();
    });
    payload.theme_color = brandThemeHex();
    const { status: code, body } = await api('/api/admin/brand-dna', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (code !== 200 || !body?.ok) {
      status.className = 'status bad'; status.textContent = body?.error || code; return;
    }
    status.className = 'status good';
    if (body.planning) {
      status.innerHTML = `Đã lưu · ${body.saved} trường. Đang lên kế hoạch cho <a href="#" data-jump-cal>Lịch bài viết</a> ở chế độ nền…`;
      const link = status.querySelector('[data-jump-cal]');
      if (link) link.addEventListener('click', (e) => { e.preventDefault(); activateTab('calendar'); });
    } else {
      status.textContent = `Đã lưu · ${body.saved} trường. Tất cả bài viết mới sẽ áp dụng thông tin này.`;
    }
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 6000);
  }

  // ── brand identity (logo + theme colour) ──────────────────────
  const BRAND_HEX_RE = /^#[0-9a-fA-F]{6}$/;

  function setBrandLogoPreview(url) {
    const img = $('#brand-logo-preview');
    const rm = $('#brand-logo-remove');
    if (img) {
      img.hidden = !url;
      if (url) img.src = url; else img.removeAttribute('src');
    }
    if (rm) rm.hidden = !url;
  }

  function fillBrandIdentity(brand) {
    const hex = String(brand.theme_color || '').toLowerCase();
    const colorIn = $('#brand-theme-color');
    const hexIn = $('#brand-theme-hex');
    if (hexIn) hexIn.value = hex;
    if (colorIn) colorIn.value = BRAND_HEX_RE.test(hex) ? hex : '#e05a2b';
    setBrandLogoPreview(brand.logo_url || '');
  }

  function syncBrandColor(from) {
    const colorIn = $('#brand-theme-color');
    const hexIn = $('#brand-theme-hex');
    if (!colorIn || !hexIn) return;
    if (from === 'hex') {
      const typed = hexIn.value.trim();
      if (BRAND_HEX_RE.test(typed)) colorIn.value = typed.toLowerCase();
    } else {
      hexIn.value = colorIn.value;
    }
  }

  // Empty means "use the stylesheet default", which the API stores as NULL.
  function brandThemeHex() {
    const typed = ($('#brand-theme-hex')?.value || '').trim();
    if (typed === '') return '';
    if (BRAND_HEX_RE.test(typed)) return typed.toLowerCase();
    return $('#brand-theme-color')?.value || '';
  }

  async function uploadBrandLogo(file) {
    const status = $('#brand-logo-status');
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      status.className = 'status bad'; status.textContent = 'Ảnh quá lớn (tối đa 2 MB).'; return;
    }
    status.className = 'status'; status.textContent = 'Đang tải logo…';
    const dataUrl = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(file);
    });
    if (!dataUrl) {
      status.className = 'status bad'; status.textContent = 'Không đọc được tệp.'; return;
    }
    const { status: code, body } = await api('/api/admin/projects/logo', {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, content_type: file.type, base64: dataUrl }),
    });
    if (code !== 200 || !body?.ok) {
      status.className = 'status bad'; status.textContent = body?.error || code; return;
    }
    setBrandLogoPreview(body.logo_url);
    status.className = 'status good'; status.textContent = 'Đã cập nhật logo.';
  }

  async function removeBrandLogo() {
    const status = $('#brand-logo-status');
    const { status: code, body } = await api('/api/admin/brand-dna', {
      method: 'PUT',
      body: JSON.stringify({ logo_url: null }),
    });
    if (code !== 200 || !body?.ok) {
      status.className = 'status bad'; status.textContent = body?.error || code; return;
    }
    setBrandLogoPreview('');
    status.className = 'status good'; status.textContent = 'Đã xoá logo.';
  }

  // ── embeds ────────────────────────────────────────────────────
  // Manages the /api/admin/embeds CRUD endpoints. Each embed gives
  // the operator a `<div id="ps-blog"></div>` + `<script src=…>`
  // snippet they can paste on any external site to display the
  // toolkit's posts.
  async function loadEmbeds() {
    const list = $('#embed-list');
    if (!list) return;
    const { status, body } = await api('/api/admin/embeds');
    if (status !== 200) {
      list.textContent = 'Lỗi tải danh sách widget: ' + (body?.error || status);
      list.className = 'dim'; return;
    }
    clearChildren(list);
    list.className = '';
    if (!body.embeds?.length) {
      const d = document.createElement('div'); d.className = 'dim';
      d.textContent = 'Chưa có widget nào. Hãy tạo widget ở trên.';
      list.appendChild(d); return;
    }
    for (const e of body.embeds) {
      const row = document.createElement('div'); row.className = 'embed-row';

      const head = document.createElement('div'); head.className = 'embed-head';
      const name = document.createElement('div'); name.className = 'embed-name'; name.textContent = e.name;
      const meta = document.createElement('div'); meta.className = 'embed-meta';
      const settingsBits = [];
      if (e.settings?.title)  settingsBits.push('tiêu đề: ' + e.settings.title);
      if (e.settings?.accent) settingsBits.push('màu: ' + e.settings.accent);
      if (e.settings?.limit)  settingsBits.push('giới hạn: ' + e.settings.limit);
      meta.textContent = settingsBits.join(' · ') || 'mặc định';
      head.append(name, meta);
      row.appendChild(head);

      const snip = document.createElement('div'); snip.className = 'embed-snippet';
      snip.textContent = e.snippet;
      row.appendChild(snip);

      const actions = document.createElement('div'); actions.className = 'embed-actions';
      const copy = document.createElement('button'); copy.className = 'btn btn-sm';
      copy.textContent = 'Sao chép mã';
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(e.snippet);
          copy.textContent = 'Đã sao chép!';
          setTimeout(() => (copy.textContent = 'Sao chép mã'), 1500);
        } catch { copy.textContent = 'Bôi đen & chép thủ công'; }
      };
      const preview = document.createElement('button'); preview.className = 'btn btn-sm';
      preview.textContent = 'Xem trước';
      const previewBox = document.createElement('div'); previewBox.className = 'embed-preview'; previewBox.hidden = true;
      preview.onclick = () => {
        if (!previewBox.hidden) { previewBox.hidden = true; preview.textContent = 'Xem trước'; return; }
        clearChildren(previewBox);
        // Build an iframe so the host CSS doesn't leak in.
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;min-height:240px;border:0;background:#fff;border-radius:6px';
        iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>preview</title></head><body><div id="ps-blog"></div><script src="${e.embed_url}" defer></script></body></html>`;
        previewBox.appendChild(iframe);
        previewBox.hidden = false;
        preview.textContent = 'Ẩn xem trước';
      };
      const open = document.createElement('a'); open.className = 'btn btn-sm';
      open.textContent = 'Mở URL';
      open.href = e.embed_url; open.target = '_blank'; open.rel = 'noopener';
      const del = document.createElement('button'); del.className = 'btn btn-sm embed-del';
      del.textContent = 'Xóa';
      del.onclick = async () => {
        if (!confirm('Xóa widget "' + e.name + '"? Bất kỳ ai đang dùng đoạn mã này trên trang web sẽ thấy khung trống.')) return;
        await api('/api/admin/embeds?id=' + encodeURIComponent(e.id), { method: 'DELETE' });
        loadEmbeds();
      };
      actions.append(copy, preview, open, del);
      row.appendChild(actions);
      row.appendChild(previewBox);
      list.appendChild(row);
    }
  }

  async function createEmbed() {
    const status = $('#embed-create-status');
    const name = $('#embed-create-name').value.trim();
    if (!name) { status.className = 'status bad'; status.textContent = 'Tên không được để trống.'; return; }
    const settings = {};
    const title  = $('#embed-create-title').value.trim();
    const accent = $('#embed-create-accent').value;
    const limit  = parseInt($('#embed-create-limit').value, 10);
    if (title)  settings.title = title;
    if (accent) settings.accent = accent;
    if (Number.isFinite(limit) && limit > 0) settings.limit = limit;
    status.className = 'status'; status.textContent = 'Đang tạo…';
    const { status: code, body } = await api('/api/admin/embeds', {
      method: 'POST',
      body: JSON.stringify({ name, settings }),
    });
    if (code !== 200 || !body?.ok) {
      status.className = 'status bad';
      status.textContent = 'Thất bại: ' + (body?.error || code);
      return;
    }
    status.className = 'status good';
    status.textContent = 'Đã tạo thành công.';
    $('#embed-create-name').value = '';
    $('#embed-create-title').value = '';
    $('#embed-create-limit').value = '';
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 2500);
    loadEmbeds();
  }

  // ── provider status grid (Settings tab) ─────────────────────────
  // models: ordered most-powerful → least, first entry is the default.
  const PROVIDER_META = [
    {
      name: 'workers-ai', label: 'Cloudflare Workers AI', envKey: '(binding)',
      text: true, image: true, optional: false,
      modelEnvKey: 'WORKERS_AI_TEXT_MODEL',
      modelDefault: '@cf/qwen/qwen3-30b-a3b-fp8',
      models: [
        { id: '@cf/qwen/qwen3-30b-a3b-fp8',                label: 'Qwen3 30B A3B FP8 (khuyến nghị)' },
        { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',  label: 'Llama 3.3 70B FP8 Fast' },
        { id: '@cf/meta/llama-3.1-70b-instruct',           label: 'Llama 3.1 70B' },
        { id: '@cf/mistral/mistral-7b-instruct-v0.2',      label: 'Mistral 7B v0.2' },
      ],
    },
    {
      name: 'anthropic', label: 'Anthropic Claude', envKey: 'ANTHROPIC_API_KEY',
      text: true, image: false, optional: true,
      modelEnvKey: 'ANTHROPIC_TEXT_MODEL',
      modelDefault: 'claude-fable-5',
      models: [
        { id: 'claude-fable-5',       label: 'Claude Fable 5 (mạnh nhất)' },
        { id: 'claude-opus-4-8',      label: 'Claude Opus 4.8' },
        { id: 'claude-sonnet-4-6',    label: 'Claude Sonnet 4.6' },
        { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (nhanh nhất)' },
      ],
    },
    {
      name: 'openai', label: 'OpenAI', envKey: 'OPENAI_API_KEY',
      text: true, image: true, optional: true,
      modelEnvKey: 'OPENAI_TEXT_MODEL',
      modelDefault: 'gpt-5',
      models: [
        { id: 'gpt-5',         label: 'GPT-5 (mạnh nhất)' },
        { id: 'gpt-4.1',       label: 'GPT-4.1' },
        { id: 'gpt-4.1-mini',  label: 'GPT-4.1 Mini' },
        { id: 'o3',            label: 'o3 (suy luận)' },
        { id: 'o4-mini',       label: 'o4-mini (reasoning, fast)' },
      ],
    },
    {
      name: 'gemini', label: 'Google Gemini', envKey: 'GEMINI_API_KEY',
      text: true, image: true, optional: true,
      modelEnvKey: 'GEMINI_TEXT_MODEL',
      modelDefault: 'gemini-2.5-pro',
      models: [
        { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro (mạnh nhất)' },
        { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash' },
        { id: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro' },
      ],
    },
    {
      name: 'gurouter', label: 'GuRouter', envKey: 'GUROUTER_API_KEY',
      text: true, image: false, optional: true,
      modelEnvKey: 'GUROUTER_TEXT_MODEL',
      modelDefault: 'deepseek/deepseek-chat',
      models: [
        { id: 'deepseek/deepseek-chat',     label: 'DeepSeek V3 (qua GuRouter)' },
        { id: 'deepseek/deepseek-reasoner', label: 'DeepSeek R1 (Reasoning)' },
        { id: 'openai/gpt-4o',              label: 'GPT-4o (qua GuRouter)' },
        { id: 'openai/gpt-4o-mini',         label: 'GPT-4o Mini (nhanh)' },
        { id: 'anthropic/claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
      ],
    },
    {
      name: 'groq', label: 'Groq', envKey: 'GROQ_API_KEY',
      text: true, image: false, optional: true,
      modelEnvKey: 'GROQ_TEXT_MODEL',
      modelDefault: 'llama-3.3-70b-versatile',
      models: [
        { id: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 70B Versatile' },
        { id: 'llama-3.1-70b-versatile',  label: 'Llama 3.1 70B Versatile' },
        { id: 'mixtral-8x7b-32768',       label: 'Mixtral 8x7B' },
        { id: 'gemma2-9b-it',             label: 'Gemma 2 9B (nhanh nhất)' },
      ],
    },
    {
      name: 'deepseek', label: 'DeepSeek', envKey: 'DEEPSEEK_API_KEY',
      text: true, image: false, optional: true,
      modelEnvKey: 'DEEPSEEK_TEXT_MODEL',
      modelDefault: 'deepseek-chat',
      models: [
        { id: 'deepseek-chat',     label: 'DeepSeek V3 (mạnh nhất)' },
        { id: 'deepseek-reasoner', label: 'DeepSeek R1 (suy luận)' },
      ],
    },
    {
      name: 'mistral', label: 'Mistral', envKey: 'MISTRAL_API_KEY',
      text: true, image: false, optional: true,
      modelEnvKey: 'MISTRAL_TEXT_MODEL',
      modelDefault: 'mistral-large-latest',
      models: [
        { id: 'mistral-large-latest',   label: 'Mistral Large (mạnh nhất)' },
        { id: 'mistral-medium-latest',  label: 'Mistral Medium' },
        { id: 'mistral-small-latest',   label: 'Mistral Small (nhanh nhất)' },
        { id: 'codestral-latest',       label: 'Codestral (code-focused)' },
      ],
    },
    {
      name: 'together', label: 'Together AI', envKey: 'TOGETHER_API_KEY',
      text: true, image: false, optional: true,
      modelEnvKey: 'TOGETHER_TEXT_MODEL',
      modelDefault: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      models: [
        { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',   label: 'Llama 3.3 70B Turbo (mạnh nhất)' },
        { id: 'meta-llama/Llama-3.1-405B-Instruct-Turbo',  label: 'Llama 3.1 405B Turbo' },
        { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo',           label: 'Qwen2.5 72B Turbo' },
        { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1',     label: 'Mixtral 8x22B (nhanh nhất)' },
      ],
    },
    {
      name: 'cerebras', label: 'Cerebras', envKey: 'CEREBRAS_API_KEY',
      text: true, image: false, optional: true,
      modelEnvKey: 'CEREBRAS_TEXT_MODEL',
      modelDefault: 'llama-3.3-70b',
      models: [
        { id: 'llama-3.3-70b',    label: 'Llama 3.3 70B (mạnh nhất)' },
        { id: 'llama-3.1-70b',    label: 'Llama 3.1 70B' },
        { id: 'llama-3.1-8b',     label: 'Llama 3.1 8B (nhanh nhất)' },
      ],
    },
  ];

  async function loadProviderGrid() {
    const grid = $('#providers-grid');
    if (!grid) return;
    clearChildren(grid);
    const who = await api('/api/admin/whoami');
    const projectName = inferProjectName(who.body?.site_url || '');
    // /api/admin/secrets gives us per-key source: pages-secret | vault | unset.
    // /api/admin/providers gives us which providers are actually usable.
    const [secretsResp, providersResp] = await Promise.all([
      api('/api/admin/secrets'),
      api('/api/admin/providers'),
    ]);
    const sources = secretsResp.body?.keys || {};
    const usableText = new Set(providersResp.body?.text || []);

    for (const p of PROVIDER_META) {
      // workers-ai has no env-var key; it's bound via the [ai] block.
      const isWorkersAI = p.name === 'workers-ai';
      const source = isWorkersAI
        ? (usableText.has('workers-ai') ? 'binding' : 'unset')
        : (sources[p.envKey] || 'unset');
      const configured = source !== 'unset';

      const card = document.createElement('div');
      card.className = 'provider-card' + (configured ? ' configured' : '');

      const head = document.createElement('div'); head.className = 'provider-head';
      const dot = document.createElement('span'); dot.className = 'provider-dot' + (configured ? ' on' : '');
      const label = document.createElement('strong'); label.textContent = p.label;
      const badge = document.createElement('span'); badge.className = 'provider-status';
      badge.textContent = {
        'binding':       'binding',
        'pages-secret':  'pages secret',
        'vault':         'vault',
        'unset':         p.optional ? 'chưa thiết lập' : 'còn thiếu',
      }[source];
      head.append(dot, label, badge);

      const sub = document.createElement('div'); sub.className = 'provider-sub';
      const caps = [];
      if (p.text)  caps.push('văn bản');
      if (p.image) caps.push('hình ảnh');
      sub.textContent = `${p.envKey} · ${caps.join(' + ')}`;
      card.append(head, sub);

      if (isWorkersAI) {
        // No API key edit — it's a binding. But model is still selectable.
        const note = document.createElement('div'); note.className = 'provider-sub';
        note.style.color = 'var(--ink-faint)';
        note.textContent = 'Được cấu hình thông qua binding [ai] trong wrangler.toml.';
        card.append(note);
        if (p.models?.length) card.append(buildModelRow(p, sources));
        grid.appendChild(card);
        continue;
      }

      // Edit row: paste key inline, save to the encrypted vault.
      const editRow = document.createElement('div'); editRow.className = 'provider-edit';
      const input = document.createElement('input');
      input.type = 'password';
      input.placeholder = configured
        ? `Đã có giá trị ${source} — dán key mới để thay thế`
        : `Dán ${p.envKey} (lưu trữ mã hóa)`;
      input.autocomplete = 'off';
      const save = document.createElement('button');
      save.className = 'btn btn-primary btn-sm';
      save.textContent = 'Lưu';
      save.onclick = async () => {
        const val = input.value.trim();
        if (!val) { input.focus(); return; }
        save.disabled = true; save.textContent = 'Đang lưu…';
        const { status, body } = await api('/api/admin/secrets', {
          method: 'POST',
          body: JSON.stringify({ name: p.envKey, value: val }),
        });
        save.disabled = false; save.textContent = 'Lưu';
        if (status === 200 && body?.ok) {
          input.value = '';
          loadProviderGrid(); // refresh
        } else {
          save.textContent = body?.error || ('http ' + status);
          setTimeout(() => (save.textContent = 'Lưu'), 2500);
        }
      };
      editRow.append(input, save);
      card.append(editRow);

      // Model selector — always show so users can change without re-entering the key.
      if (p.models?.length) card.append(buildModelRow(p, sources));

      // Source-specific actions row.
      if (source === 'vault') {
        const actions = document.createElement('div'); actions.className = 'provider-actions';
        const del = document.createElement('button'); del.className = 'btn btn-ghost btn-sm provider-del';
        del.textContent = 'Xóa khỏi vault';
        del.onclick = async () => {
          if (!confirm(`Xóa ${p.envKey} khỏi vault đã mã hóa?`)) return;
          await api('/api/admin/secrets?name=' + encodeURIComponent(p.envKey), { method: 'DELETE' });
          loadProviderGrid();
        };
        actions.append(del);
        card.append(actions);
      } else if (source === 'unset') {
        const cmdRow = document.createElement('div'); cmdRow.className = 'provider-cmd';
        const cmd = `wrangler pages secret put ${p.envKey} --project-name=${projectName}`;
        const code = document.createElement('code'); code.textContent = cmd;
        const copy = document.createElement('button'); copy.className = 'btn btn-ghost btn-sm';
        copy.textContent = 'Sao chép lệnh CLI';
        copy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(cmd);
            copy.textContent = 'Đã sao chép';
            setTimeout(() => (copy.textContent = 'Sao chép lệnh CLI'), 1500);
          } catch {
            copy.textContent = 'Bôi đen & chép';
          }
        };
        cmdRow.append(code, copy);
        card.append(cmdRow);
      }

      grid.appendChild(card);
    }

    // Build the model-selector row for a provider card.
    function buildModelRow(p, sources) {
      const wrap = document.createElement('div'); wrap.className = 'provider-model-row';
      const lbl = document.createElement('span'); lbl.className = 'provider-model-label';
      lbl.textContent = 'Mô hình';
      const sel = document.createElement('select'); sel.className = 'provider-model-select';
      // Current value: the stored secret for this env key, else the default.
      const curVal = sources[p.modelEnvKey] || p.modelDefault;
      for (const m of p.models) {
        const o = document.createElement('option');
        o.value = m.id;
        o.textContent = m.label;
        if (m.id === curVal) o.selected = true;
        sel.appendChild(o);
      }
      // Show a custom-model input if the current value isn't in the list.
      const knownIds = new Set(p.models.map((m) => m.id));
      if (!knownIds.has(curVal)) {
        const o = document.createElement('option');
        o.value = curVal; o.textContent = curVal + ' (tùy chỉnh)'; o.selected = true;
        sel.insertBefore(o, sel.firstChild);
      }
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn-ghost btn-sm';
      saveBtn.textContent = 'Áp dụng';
      saveBtn.onclick = async () => {
        const val = sel.value;
        saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu…';
        // If the selected model is the hard-coded default, remove the override
        // so the binary default takes effect (cleaner state).
        let r;
        if (val === p.modelDefault) {
          r = await api('/api/admin/secrets?name=' + encodeURIComponent(p.modelEnvKey), { method: 'DELETE' });
        } else {
          r = await api('/api/admin/secrets', {
            method: 'POST',
            body: JSON.stringify({ name: p.modelEnvKey, value: val }),
          });
        }
        saveBtn.disabled = false;
        saveBtn.textContent = (r.status === 200) ? '✓ Đã áp dụng' : 'Lỗi';
        setTimeout(() => (saveBtn.textContent = 'Áp dụng'), 1800);
      };
      wrap.append(lbl, sel, saveBtn);

      if (p.name === 'gurouter') {
        const fetchBtn = document.createElement('button');
        fetchBtn.className = 'btn btn-ghost btn-sm';
        fetchBtn.textContent = '🔄 Lấy danh sách mô hình';
        fetchBtn.title = 'Lấy danh sách mô hình trực tiếp từ GuRouter API';
        fetchBtn.onclick = async () => {
          fetchBtn.disabled = true;
          fetchBtn.textContent = 'Đang lấy…';
          try {
            const resp = await api('/api/admin/providers/gurouter-models');
            if (resp.status === 200 && resp.body?.ok && Array.isArray(resp.body.models)) {
              const fetched = resp.body.models;
              const cur = sel.value;
              sel.innerHTML = '';
              for (const m of fetched) {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.label || m.id;
                if (m.id === cur) opt.selected = true;
                sel.appendChild(opt);
              }
              fetchBtn.textContent = `✓ ${fetched.length} mô hình`;
              setTimeout(() => (fetchBtn.textContent = '🔄 Lấy danh sách mô hình'), 2500);
            } else {
              alert(resp.body?.hint || resp.body?.error || 'Không thể lấy mô hình từ GuRouter. Hãy đảm bảo đã lưu GUROUTER_API_KEY.');
              fetchBtn.textContent = 'Thất bại';
              setTimeout(() => (fetchBtn.textContent = '🔄 Lấy danh sách mô hình'), 2000);
            }
          } catch (err) {
            alert('Lỗi lấy dữ liệu: ' + err.message);
            fetchBtn.textContent = 'Lỗi';
            setTimeout(() => (fetchBtn.textContent = '🔄 Lấy danh sách mô hình'), 2000);
          } finally {
            fetchBtn.disabled = false;
          }
        };
        wrap.append(fetchBtn);
      }

      return wrap;
    }
  }

  // ── settings ────────────────────────────────────────────────────
  async function loadSettings() {
    const { status, body } = await api('/api/admin/settings');
    if (status !== 200) return;
    // Stash the settings on window for read-only convenience access
    // by other modules (Status page's "repair this install" action
    // pre-fills the project slug from window.__psSettings.install_cf_project).
    // Anything that needs to MUTATE settings still goes via PUT.
    window.__psSettings = body.settings || {};
    // Populate the provider <select> from /api/admin/providers.
    const providers = await api('/api/admin/providers');
    const sel = $('select[data-setting="default_ai_provider"]');
    if (sel) {
      const cur = body.settings?.default_ai_provider || '';
      // Clear all but the first <option>.
      while (sel.options.length > 1) sel.remove(1);
      for (const name of (providers.body?.text || [])) {
        const o = document.createElement('option');
        o.value = name; o.textContent = name;
        if (name === cur) o.selected = true;
        sel.appendChild(o);
      }
    }
    // Populate every [data-setting] input/textarea with the loaded value.
    // Radio inputs (multiple with the same data-setting) are toggled by
    // matching their `value` against the stored setting; everything else
    // gets its `value` set directly.
    $$('[data-setting]').forEach((el) => {
      if (el.tagName === 'SELECT') return; // handled above
      const key = el.dataset.setting;
      const v = body.settings?.[key] ?? '';
      if (el.type === 'radio') {
        el.checked = (el.value === v);
      } else if (el.type === 'checkbox') {
        el.checked = v === 'true' || v === '1' || v === 'on';
      } else {
        el.value = v;
      }
    });
    // Apply hero-image-mode side effects (freeze the Covers tab if 'ai').
    applyHeroImageMode(body.settings?.hero_image_mode || 'ai');
    // Refresh the pricing snapshot whenever the Settings tab opens.
    loadPricingSnapshot();
    // Populate the GSC card with current state. The SA JSON itself is
    // never returned (vault-stored, write-only); we only show whether
    // it's configured and which client_email it's bound to.
    loadGsc().catch(() => {});
  }

  // Save the GSC card. sa_json is only sent if the textarea has
  // content — empty + Save means "don't touch the stored JSON".
  async function saveGsc() {
    const status = $('#gsc-status');
    const ta     = $('#gsc-sa-json');
    const propEl = $('#gsc-property');
    const apiEl  = $('#gsc-use-indexing-api');
    setText(status, 'đang lưu…');
    const payload = {};
    if (ta && ta.value.trim()) payload.sa_json = ta.value.trim();
    if (propEl) payload.property = propEl.value.trim();
    if (apiEl)  payload.use_indexing_api = apiEl.checked;
    const r = await api('/api/admin/google-search-console', { method: 'POST', body: JSON.stringify(payload) });
    if (r.status !== 200) {
      status.className = 'status bad';
      status.textContent = r.body?.detail || r.body?.error || `thất bại (${r.status})`;
      return;
    }
    if (ta) ta.value = ''; // clear textarea so it doesn't sit around
    status.className = 'status good';
    status.textContent = '✓ Đã lưu.';
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);
    loadGsc();
  }

  // Live test against Google. Submits the sitemap + (if toggled) pings
  // the homepage URL via the Indexing API.
  async function testGsc() {
    const status = $('#gsc-status');
    const btn = $('#gsc-test');
    btn.disabled = true;
    setText(status, 'đang kiểm tra…');
    const r = await api('/api/admin/google-search-console/test', { method: 'POST' });
    btn.disabled = false;
    if (r.status !== 200) {
      status.className = 'status bad';
      status.textContent = r.body?.detail || r.body?.error || `thất bại (${r.status})`;
      return;
    }
    const sm = r.body?.result?.sitemap;
    if (sm?.ok) {
      status.className = 'status good';
      status.textContent = `✓ Đã gửi sitemap tới ${sm.property}.`;
    } else {
      status.className = 'status bad';
      status.textContent = `Gửi sitemap thất bại: ${sm?.detail || sm?.error || 'không rõ'}`;
    }
  }

  async function clearGsc() {
    if (!confirm('Xóa thông tin xác thực Google Search Console? Quá trình tự động index khi xuất bản sẽ dừng lại.')) return;
    const status = $('#gsc-status');
    setText(status, 'đang xóa…');
    const r = await api('/api/admin/google-search-console', { method: 'DELETE' });
    if (r.status !== 200) {
      status.className = 'status bad';
      status.textContent = r.body?.detail || 'thất bại';
      return;
    }
    status.className = 'status';
    status.textContent = 'Đã xóa.';
    loadGsc();
  }

  // Google Search Console card — load current config status.
  async function loadGsc() {
    const r = await api('/api/admin/google-search-console');
    if (r.status !== 200) return;
    const b = r.body || {};
    const status = $('#gsc-sa-status');
    const propEl = $('#gsc-property');
    const apiEl  = $('#gsc-use-indexing-api');
    const ta     = $('#gsc-sa-json');
    if (ta) ta.value = ''; // never pre-fill — keeps it write-only
    if (b.configured) {
      const props = b.property ? ` · property ${b.property}` : '';
      if (status) {
        status.textContent = `✓ Đã cấu hình — ${b.client_email}${props}`;
        status.className = 'dim good';
      }
    } else if (status) {
      status.textContent = 'Chưa cấu hình. Dán nội dung JSON service-account ở trên để kích hoạt.';
      status.className = 'dim';
    }
    if (propEl) propEl.value = b.explicit_property || '';
    if (apiEl)  apiEl.checked = !!b.use_indexing_api;
  }

  async function saveSettings() {
    const status = $('#settings-status');
    setText(status, 'đang lưu…');
    const payload = {};
    // Collect by key. For radios there are multiple elements with the
    // same data-setting — only the checked one wins.
    const seen = new Set();
    $$('[data-setting]').forEach((el) => {
      const key = el.dataset.setting;
      if (el.type === 'radio') {
        if (el.checked) { payload[key] = el.value; seen.add(key); }
        else if (!seen.has(key)) { /* leave; might be set by a later checked sibling */ }
        return;
      }
      if (el.type === 'checkbox') {
        payload[key] = el.checked ? 'true' : ''; return;
      }
      payload[key] = (el.value || '').toString();
    });
    const r = await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (r.status === 200) {
      setText(status, `đã lưu ${r.body?.updated?.length || 0} trường`);
      setTimeout(() => setText(status, ''), 2500);
      // Re-apply the freeze state after save in case the user just
      // flipped the toggle.
      applyHeroImageMode(payload.hero_image_mode || 'ai');
    } else {
      setText(status, `lỗi: ${r.body?.error || r.status}`);
    }
  }

  // ── hero image mode (freeze Covers tab when 'ai') ──────────────
  function applyHeroImageMode(mode) {
    const banner  = $('#cover-frozen-banner');
    const content = $('#cover-content');
    const frozen  = mode !== 'cover';
    if (banner)  banner.hidden = !frozen;
    if (content) content.classList.toggle('frozen', frozen);
  }

  // ── pricing snapshot UI ────────────────────────────────────────
  async function loadPricingSnapshot() {
    const root = $('#pricing-current');
    if (!root) return;
    const { status, body } = await api('/api/admin/pricing');
    if (status !== 200) { root.textContent = 'Không thể tải bảng giá.'; return; }
    clearChildren(root);
    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Nhà cung cấp</th><th>Đầu vào / 1M</th><th>Đầu ra / 1M</th><th>Ảnh</th></tr>';
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const [name, p] of Object.entries(body.prices || {})) {
      const tr = document.createElement('tr');
      const cell = (txt, cls) => { const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = txt; return td; };
      tr.appendChild(cell(name));
      tr.appendChild(cell(p.in === 0 ? '—' : `$${Number(p.in).toFixed(2)}`, 'cost'));
      tr.appendChild(cell(p.out === 0 ? '—' : `$${Number(p.out).toFixed(2)}`, 'cost'));
      tr.appendChild(cell(p.image == null ? '—' : `$${Number(p.image).toFixed(3)}/ảnh`, 'cost'));
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    root.appendChild(tbl);
    const meta = document.createElement('span'); meta.className = 'pricing-meta';
    const when = body.fetched_at ? new Date(body.fetched_at * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'chưa bao giờ';
    meta.textContent = `Nguồn: ${body.source}${body.stale ? ' (cũ)' : ''} · làm mới lần cuối: ${when}`;
    root.appendChild(meta);
  }

  async function refreshPricing() {
    const status = $('#pricing-status');
    setText(status, 'đang lấy dữ liệu từ models.dev…');
    const { status: code, body } = await api('/api/admin/pricing', { method: 'POST', body: '{}' });
    if (code !== 200 || !body?.ok) {
      status.className = 'status bad';
      status.textContent = 'Làm mới thất bại: ' + (body?.error || body?.detail || code);
      return;
    }
    status.className = 'status good';
    status.textContent = `Đã cập nhật ${body.count_updated} nhà cung cấp từ ${body.source}.`;
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 4000);
    loadPricingSnapshot();
  }

  // ── overview ────────────────────────────────────────────────────
  async function loadOverview() {
    const posts = await api('/api/admin/blog/list');
    const publishedPosts = (posts.body?.posts || []).filter(p => p.status === 'published');
    const publishedCount = publishedPosts.length;
    setText($('#stat-blog-count'), publishedCount);

    // Update Quota Card
    const who = await whoamiStatus();
    const whoamiData = who?.info || {};
    const planTier = whoamiData.plan_tier || window.__psPlanTier || 'free';
    const isSuper = (whoamiData.role || window.__psRole) === 'super_admin';
    const postLimit = whoamiData.post_limit || 100;
    const usedCount = publishedCount;

    const planNameEl = $('#quota-plan-name');
    const usedEl = $('#quota-used');
    const limitEl = $('#quota-limit');
    const subEl = $('#quota-remaining-sub');
    const barEl = $('#quota-progress-bar');
    const cardEl = $('#overview-quota-card');
    const statBlogSub = $('#stat-blog-sub');

    if (isSuper) {
      if (planNameEl) planNameEl.textContent = 'Gói Doanh Nghiệp (Super Admin)';
      if (usedEl) usedEl.textContent = String(usedCount);
      if (limitEl) limitEl.textContent = 'Không giới hạn';
      if (subEl) subEl.textContent = 'Toàn quyền tạo & quản lý mọi dự án';
      if (barEl) { barEl.style.width = '100%'; barEl.style.background = 'linear-gradient(90deg, #3b82f6, #06b6d4)'; }
      if (statBlogSub) statBlogSub.textContent = 'Bài viết blog đã xuất bản';
    } else {
      const remaining = Math.max(0, postLimit - usedCount);
      const pct = Math.min(100, Math.round((usedCount / postLimit) * 100));
      
      if (planNameEl) planNameEl.textContent = 'Gói Cơ Bản (Free)';
      if (usedEl) usedEl.textContent = String(usedCount);
      if (limitEl) limitEl.textContent = String(postLimit);
      if (subEl) subEl.textContent = remaining > 0 
        ? `Còn lại ${remaining} bài viết SEO miễn phí` 
        : 'Đã hết hạn ngạch 100 bài miễn phí (Vui lòng liên hệ nâng cấp)';
      if (barEl) {
        barEl.style.width = `${pct}%`;
        barEl.style.background = pct >= 100 
          ? 'linear-gradient(90deg, #ef4444, #f87171)' 
          : 'linear-gradient(90deg, #10b981, #06b6d4)';
      }
      if (statBlogSub) statBlogSub.textContent = `Đã dùng ${usedCount}/${postLimit} bài gói Free`;
    }
    const prog = await api('/api/admin/prog/queue?status=done&limit=500');
    setText($('#stat-prog-count'), (prog.body?.keywords || []).length);
    const queue = await api('/api/admin/prog/queue?status=pending&limit=500');
    setText($('#stat-queue-count'), (queue.body?.keywords || []).length);
  }

  // ── blog chain ──────────────────────────────────────────────────
  async function runBlogChain(opts = {}) {
    const btn = $('#blog-go');
    const status = $('#blog-status');
    const log = $('#blog-log');
    btn.disabled = true;
    const setStatus = (text, cls) => {
      status.textContent = text;
      status.className = 'status' + (cls ? ' ' + cls : '');
    };
    const append = (line) => appendLog(log, line);
    log.hidden = true; log.textContent = '';

    try {
      setStatus('1/4 chọn chủ đề…');
      const start = await api('/api/admin/blog/start', {
        method: 'POST',
        body: JSON.stringify(opts.calendarSlotId ? { calendar_slot_id: opts.calendarSlotId } : {}),
      });
      const jobId = start.body?.job_id;
      if (!jobId) throw new Error(start.body?.error || 'start failed');
      append(`job_id: ${jobId}`);

      const payload = JSON.stringify({ job_id: jobId });
      setStatus('2/4 viết bài…');
      const text = await api('/api/admin/blog/text', { method: 'POST', body: payload });
      if (text.status !== 200) throw new Error(text.body?.detail || text.body?.error || 'text failed');
      append(`tiêu đề: ${text.body.title}`);
      append(`slug:    ${text.body.slug}`);
      append(`ai:      ${text.body.ai_provider}`);

      setStatus('3/4 tạo hình ảnh…');
      const img = await api('/api/admin/blog/image', { method: 'POST', body: payload });
      if (img.status !== 200) throw new Error(img.body?.detail || img.body?.error || 'image failed');
      append(`hình ảnh: ${img.body.image_uploaded ? 'ok' : '(bỏ qua)'}`);

      setStatus('4/4 xuất bản…');
      const pub = await api('/api/admin/blog/publish', { method: 'POST', body: payload });
      if (pub.status !== 200) throw new Error(pub.body?.error || 'publish failed');
      append(`đã xuất bản: ${activeProjectBase()}/blog/${pub.body.slug}`);

      setStatus('Đã xuất bản.', 'good');
      loadPosts();
      loadJobs();
    } catch (e) {
      setStatus('Thất bại: ' + e.message, 'bad');
      append('lỗi: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function runRefreshScan() {
    const btn = $('#refresh-scan');
    const statusEl = $('#refresh-status');
    const listEl = $('#refresh-list');
    if (!btn) return;
    btn.disabled = true;
    if (statusEl) statusEl.textContent = currentLang === 'vi' ? 'Đang quét bài cũ...' : 'Scanning stale posts...';
    try {
      const { status, body } = await api('/api/admin/refresh/scan', { method: 'POST', body: JSON.stringify({ limit: 10 }) });
      if (status !== 200 || !body?.ok) throw new Error(body?.error || 'scan failed');
      if (statusEl) statusEl.textContent = currentLang === 'vi' ? `Tìm thấy ${body.count || 0} bài cần refresh.` : `Found ${body.count || 0} stale posts.`;
      if (listEl) {
        clearChildren(listEl);
        listEl.classList.remove('dim');
        if (!body.jobs?.length) {
          listEl.textContent = currentLang === 'vi' ? 'Không có bài nào cần refresh.' : 'Nothing to refresh.';
          return;
        }
        for (const j of body.jobs) {
          const row = document.createElement('div');
          row.className = 'row';
          row.style.marginBottom = '8px';
          const label = document.createElement('span');
          label.textContent = j.title || j.slug;
          label.style.flex = '1';
          const go = document.createElement('button');
          go.className = 'btn btn-ghost btn-sm';
          go.textContent = currentLang === 'vi' ? 'Refresh bài này' : 'Refresh this post';
          go.addEventListener('click', async () => {
            go.disabled = true;
            try {
              const r = await api('/api/admin/refresh/run', { method: 'POST', body: JSON.stringify({ job_id: j.job_id }) });
              if (r.status === 200 && r.body?.ok) {
                label.textContent += currentLang === 'vi' ? ' — xong.' : ' — done.';
                loadPosts();
              } else {
                label.textContent += ` — lỗi: ${r.body?.error || r.status}`;
              }
            } catch (err) {
              label.textContent += ` — lỗi mạng: ${err.message}`;
            } finally {
              go.disabled = false;
            }
          });
          row.appendChild(label);
          row.appendChild(go);
          listEl.appendChild(row);
        }
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = `Error: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  }

  async function loadJobs() {
    const tbody = $('#jobs-table tbody');
    if (!tbody) return;
    clearChildren(tbody);
    const { status, body } = await api('/api/admin/blog/jobs');
    if (status !== 200 || !body?.jobs?.length) {
      const tr = document.createElement('tr');
      const tdE = document.createElement('td'); tdE.colSpan = 6; tdE.style.color = 'var(--ink-faint)';
      tdE.textContent = status === 200 ? 'Không có bản nháp hoặc tác vụ thất bại.' : 'Lỗi tải danh sách.';
      tr.appendChild(tdE); tbody.appendChild(tr); return;
    }
    for (const j of body.jobs) {
      const tr = document.createElement('tr');
      tr.appendChild(td(new Date((j.updated_at || 0) * 1000).toLocaleString('vi-VN')));
      tr.appendChild(td(j.topic_key || '—'));
      tr.appendChild(td(j.slug || '—'));
      const pill = document.createElement('span');
      pill.className = 'pill ' + (j.status === 'failed' ? 'bad' : j.status === 'image_done' ? 'good' : 'warn');
      const statusLabels = {
        failed: 'Thất bại',
        image_done: 'Đã tạo ảnh',
        text_done: 'Đã tạo văn bản',
        generating: 'Đang tạo',
        pending: 'Đang chờ',
      };
      pill.textContent = statusLabels[j.status] || j.status;
      const tdStatus = document.createElement('td'); tdStatus.appendChild(pill); tr.appendChild(tdStatus);
      tr.appendChild(td(j.error ? j.error.slice(0, 80) : '—'));
      const tdAct = document.createElement('td');
      const retry = mkBtn('Tiếp tục', 'btn-sm', () => resumeJob(j.id, retry));
      const del = mkBtn('Xóa', 'btn-sm btn-danger', async () => {
        if (!confirm('Xóa bản nháp này?')) return;
        await api('/api/admin/blog/delete-job', { method: 'POST', body: JSON.stringify({ id: j.id }) });
        loadJobs();
      });
      tdAct.append(retry, del); tr.appendChild(tdAct);
      tbody.appendChild(tr);
    }
  }
  async function resumeJob(id, btn) {
    btn.disabled = true; btn.textContent = 'Đang tiếp tục…';
    try {
      await api('/api/admin/blog/retry-job', { method: 'POST', body: JSON.stringify({ id }) });
      const payload = JSON.stringify({ job_id: id });
      let r = await api('/api/admin/blog/text', { method: 'POST', body: payload });
      if (r.status !== 200) throw new Error(r.body?.detail || r.body?.error || 'text');
      r = await api('/api/admin/blog/image', { method: 'POST', body: payload });
      if (r.status !== 200) throw new Error(r.body?.detail || r.body?.error || 'image');
      r = await api('/api/admin/blog/publish', { method: 'POST', body: payload });
      if (r.status !== 200) throw new Error(r.body?.error || 'publish');
      loadJobs(); loadPosts();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Tiếp tục';
      toast('Tiếp tục tác vụ thất bại: ' + e.message, 'bad');
    }
  }

  async function loadPosts() {
    const tbody = $('#posts-table tbody');
    if (!tbody) return;
    clearChildren(tbody);

    const card = $('#posts-table')?.closest('.card');
    const eyebrow = card?.querySelector('.card-eyebrow');
    const curProj = _allProjects.find((p) => p.id === window.__psActiveProjectId);
    if (eyebrow) {
      eyebrow.textContent = curProj ? `Bài viết đã xuất bản (${curProj.name})` : 'Bài viết đã xuất bản';
    }

    const { body } = await api('/api/admin/blog/list');
    const posts = body?.posts || [];
    if (!posts.length) {
      const tr = document.createElement('tr');
      const tdE = document.createElement('td'); tdE.colSpan = 5; tdE.style.color = 'var(--ink-faint)';
      tdE.textContent = 'Chưa có bài viết nào.';
      tr.appendChild(tdE); tbody.appendChild(tr); return;
    }
    for (const p of posts) {
      const tr = document.createElement('tr');
      tr.appendChild(td(new Date((p.published_at || 0) * 1000).toLocaleDateString('vi-VN')));
      const tdT = document.createElement('td'); tdT.className = 'cell-strong';
      const a = document.createElement('a'); a.href = activeProjectBase() + '/blog/' + p.slug; a.target = '_blank'; a.rel = 'noopener'; a.textContent = p.title;
      tdT.appendChild(a); tr.appendChild(tdT);
      tr.appendChild(td(p.slug));
      tr.appendChild(td(p.ai_provider || '—'));
      const tdAct = document.createElement('td');
      const toggle = mkBtn(p.status === 'hidden' ? 'Hiện' : 'Ẩn', 'btn-sm', async () => {
        await api('/api/admin/blog/post', { method: 'POST', body: JSON.stringify({ id: p.id, action: p.status === 'hidden' ? 'show' : 'hide' }) });
        loadPosts();
      });
      const isFreeTier = (window.__psPlanTier === 'free') && (window.__psRole !== 'super_admin');
      if (!isFreeTier) {
        const del = mkBtn('Xóa', 'btn-sm btn-danger', async () => {
          if (!confirm('Xóa bài ' + p.slug + '?')) return;
          const { status, body } = await api('/api/admin/blog/post', { method: 'POST', body: JSON.stringify({ id: p.id, action: 'delete' }) });
          if (status !== 200) { alert(body?.detail || body?.error || 'Không thể xóa bài'); }
          loadPosts();
        });
        tdAct.append(toggle, del);
      } else {
        tdAct.append(toggle);
      }
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    }
  }

  // ── programmatic ────────────────────────────────────────────────
  async function pullAndQueue(queue) {
    const seed = $('#pull-seed').value.trim();
    const limit = parseInt($('#pull-limit').value, 10) || 50;
    const out = $('#pull-out');
    if (!seed) { showLog(out, 'Vui lòng nhập cụm từ khóa mầm.'); return; }
    showLog(out, `Đang lấy gợi ý tự động hoàn thành cho "${seed}"…`);
    const { status, body } = await api('/api/admin/prog/pull-keywords', {
      method: 'POST', body: JSON.stringify({ seed, limit, queue }),
    });
    if (status !== 200) { showLog(out, 'Lỗi: ' + (body?.error || status)); return; }
    const head = `Đã lấy ${body.pulled} từ khóa (đã lọc trùng và loại bỏ rác)` +
      (queue ? ` · đã thêm ${body.inserted} · trùng lặp ${body.duplicate}` : ' (chỉ xem trước)');
    // Hide the log block and render a structured list instead.
    if (out) { out.hidden = true; }
    const host = out?.parentNode;
    if (!host) return;
    // Remove a previous preview list if present.
    const old = host.querySelector('.pull-preview-list');
    if (old) old.remove();
    const headline = document.createElement('p');
    headline.style.cssText = 'margin:10px 0 0;color:var(--ink-dim);font-size:13px';
    headline.textContent = head;
    // Insert headline + list right after the log placeholder so it sits in place.
    const ul = document.createElement('ul');
    ul.className = 'pull-preview-list';
    const items = (body.keywords || []);
    if (!items.length) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="kw">Không có từ khóa nào vượt qua bộ lọc rác/trùng lặp.</span>';
      ul.appendChild(li);
    } else {
      for (const k of items) {
        const li = document.createElement('li');
        const kw = document.createElement('span'); kw.className = 'kw'; kw.textContent = k.keyword;
        const meta = document.createElement('span'); meta.className = 'meta';
        meta.textContent = `${k.intent.padEnd(13)} · điểm ${String(k.score).padStart(2)}`;
        li.append(kw, meta);
        ul.appendChild(li);
      }
    }
    // Stick the headline + list right after the textarea / log.
    out.parentNode.insertBefore(headline, out.nextSibling);
    out.parentNode.insertBefore(ul, headline.nextSibling);
    if (queue) loadQueue();
  }

  async function uploadCsv() {
    const csv = $('#upload-csv').value;
    const status = $('#upload-status');
    if (!csv.trim()) { status.textContent = 'Dán ít nhất một từ khóa.'; status.className = 'status bad'; return; }
    const { status: code, body } = await api('/api/admin/prog/upload', {
      method: 'POST', body: JSON.stringify({ csv }),
    });
    if (code !== 200) { status.textContent = 'Lỗi: ' + (body?.error || code); status.className = 'status bad'; return; }
    status.textContent = `Đã thêm ${body.inserted}, bỏ qua ${body.duplicate} từ khóa trùng lặp.`;
    status.className = 'status good';
    $('#upload-csv').value = '';
    loadQueue();
  }

  const INTENT_PILL = {
    transactional: 'good',
    commercial:    'warn',
    informational: '',
    navigational:  '',
    junk:          'bad',
  };

  async function patchKeyword(id, patch) {
    return api('/api/admin/prog/queue', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function loadQueue() {
    const tbody = $('#queue-table tbody');
    if (!tbody) return;
    clearChildren(tbody);
    const statusFilter = $('#queue-status').value || 'pending';
    const { body } = await api('/api/admin/prog/queue?status=' + encodeURIComponent(statusFilter));
    const rows = body?.keywords || [];
    if (!rows.length) {
      const tr = document.createElement('tr');
      const tdE = document.createElement('td'); tdE.colSpan = 6; tdE.style.color = 'var(--ink-faint)';
      const filterLabels = {
        pending: 'đang chờ',
        done: 'đã hoàn thành',
        failed: 'thất bại',
      };
      tdE.textContent = `Không có từ khóa ${filterLabels[statusFilter] || statusFilter}.`;
      tr.appendChild(tdE); tbody.appendChild(tr); return;
    }
    for (const k of rows) {
      const tr = document.createElement('tr');
      tr.appendChild(td(k.keyword, 'cell-strong'));

      // Intent pill
      const intentPill = document.createElement('span');
      const intentClass = INTENT_PILL[k.intent] || '';
      intentPill.className = 'pill' + (intentClass ? ' ' + intentClass : '');
      const intentLabels = {
        transactional: 'giao dịch',
        commercial: 'thương mại',
        informational: 'thông tin',
        navigational: 'điều hướng',
        junk: 'rác',
      };
      intentPill.textContent = intentLabels[k.intent] || k.intent || '—';
      const tdI = document.createElement('td'); tdI.appendChild(intentPill); tr.appendChild(tdI);

      // Score
      const scoreCell = document.createElement('td');
      scoreCell.className = 'cell-num';
      scoreCell.textContent = (k.score != null ? k.score : '—');
      tr.appendChild(scoreCell);

      // Priority — editable inline for pending rows.
      const tdP = document.createElement('td'); tdP.className = 'cell-priority';
      if (statusFilter === 'pending') {
        const up = document.createElement('button');
        up.className = 'pri-btn'; up.title = 'Tăng ưu tiên +10'; up.textContent = '↑';
        up.onclick = async () => {
          await patchKeyword(k.id, { priority: (k.priority || 0) + 10 });
          loadQueue();
        };
        const down = document.createElement('button');
        down.className = 'pri-btn'; down.title = 'Giảm ưu tiên −10'; down.textContent = '↓';
        down.onclick = async () => {
          await patchKeyword(k.id, { priority: (k.priority || 0) - 10 });
          loadQueue();
        };
        const drop = document.createElement('button');
        drop.className = 'pri-btn pri-drop'; drop.title = 'Đánh dấu thất bại (bỏ qua)'; drop.textContent = '✕';
        drop.onclick = async () => {
          await patchKeyword(k.id, { status: 'failed' });
          loadQueue();
        };
        const val = document.createElement('span'); val.className = 'pri-val'; val.textContent = (k.priority != null ? k.priority : 0);
        tdP.append(val, up, down, drop);
      } else if (statusFilter === 'failed') {
        const retry = document.createElement('button');
        retry.className = 'pri-btn'; retry.title = 'Thử lại'; retry.textContent = '↻';
        retry.onclick = async () => {
          await patchKeyword(k.id, { status: 'pending' });
          loadQueue();
        };
        const val = document.createElement('span'); val.className = 'pri-val'; val.textContent = (k.priority != null ? k.priority : 0);
        tdP.append(val, retry);
      } else {
        tdP.textContent = k.priority != null ? k.priority : '—';
      }
      tr.appendChild(tdP);

      // Status pill
      const pill = document.createElement('span');
      pill.className = 'pill ' + (k.status === 'failed' ? 'bad' : k.status === 'done' ? 'good' : 'warn');
      const qStatusLabels = {
        failed: 'Thất bại',
        done: 'Hoàn thành',
        pending: 'Đang chờ',
      };
      pill.textContent = qStatusLabels[k.status] || k.status;
      const tdS = document.createElement('td'); tdS.appendChild(pill); tr.appendChild(tdS);

      tr.appendChild(td(k.page_id ? '/p/…' : '—'));
      tbody.appendChild(tr);
    }
  }

  async function runProgNext() {
    const btn = $('#prog-go');
    const status = $('#prog-status');
    btn.disabled = true; status.className = 'status'; status.textContent = 'Đang tạo… ~60-120s';
    const { status: code, body } = await api('/api/admin/prog/generate-next', { method: 'POST', body: '{}' });
    btn.disabled = false;
    if (code === 200 && body?.drained) { status.className = 'status'; status.textContent = 'Hàng đợi đang trống.'; return; }
    if (code !== 200 || !body?.ok) { status.className = 'status bad'; status.textContent = (body?.error || code) + ' ' + (body?.detail || ''); return; }
    status.className = 'status good';
    status.textContent = 'Đã tạo trang /p/' + body.slug;
    loadQueue();
    loadOverview();
  }

  // ── SEO tab ─────────────────────────────────────────────────────
  async function pingIndexNow() {
    const btn = $('#ping-go');
    const status = $('#ping-status');
    btn.disabled = true; status.className = 'status'; status.textContent = 'Đang gửi…';
    const { status: code, body } = await api('/api/admin/indexnow-ping', { method: 'POST', body: '{}' });
    btn.disabled = false;
    if (code !== 200 || !body?.ok) {
      status.className = 'status bad';
      status.textContent = (body?.error || `thất bại (${code})`);
      return;
    }
    status.className = 'status good';
    status.textContent = `Thành công · ${body.urls?.length || 0} URL (${body.source})`;
  }

  // Widget embed snippet UI. Three flavours (JS / iframe / link)
  // with live preview + Copy-to-clipboard. The "Customise" fields
  // edit the snippet in real time, and the preview re-mounts so
  // operators can see exactly what they'll ship.
  //
  // Wired ONCE on first activation of the SEO tab. Subsequent tab
  // visits just call build() to refresh the snippet (e.g. if the
  // hostname changed). Without this guard, each tab switch added
  // another set of input/click listeners — every keystroke would
  // re-inject a fresh widget.js <script>, which the browser
  // surfaced as "page is refreshing constantly".
  let _widgetWired = false;
  let _widgetFlavour = 'js';

  // Public origin the embed widget and sitemap are served from for the
  // project the operator is currently scoped to. Falls back to the
  // admin host when no project is active (single-site installs).
  function activeProjectOrigin() {
    const project = window.__psActiveProject;
    const raw = project?.publishing_url || project?.website_url || '';
    try { if (raw) return new URL(raw).origin; } catch { /* malformed url */ }
    return 'https://' + location.host;
  }

  function activeProjectSlug() {
    return window.__psActiveProject?.slug || '';
  }

  // Public base for the active project's blog: origin + optional /<slug>
  // path prefix, derived from its publishing_url (or website_url).
  function activeProjectBase() {
    const project = window.__psActiveProject;
    const raw = project?.publishing_url || project?.website_url || '';
    try {
      if (raw) {
        const u = new URL(raw);
        return u.origin + u.pathname.replace(/\/+$/, '');
      }
    } catch { /* malformed url */ }
    return 'https://' + location.host;
  }

  // Distribution overview for the active project: the public URLs its
  // content is served from, plus the publish target posts are pushed to.
  // One render so a project switch refreshes the whole page.
  const DIST_PUBLISHERS = {
    internal_d1: 'Blog của nền tảng',
    webhook: 'Webhook',
    custom_api: 'Custom API',
    wordpress: 'WordPress REST',
  };

  function renderDistribution() {
    renderWidgetSnippet();

    const base = activeProjectBase();
    const channels = {
      'dist-blog-url': base + '/blog',
      'dist-feed-url': base + '/feed.xml',
      'dist-sitemap-url': base + '/sitemap.xml',
    };
    for (const [id, url] of Object.entries(channels)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.textContent = url;
      if (el.tagName === 'A') el.href = url;
    }

    const project = window.__psActiveProject || {};
    const type = project.publisher_type || 'internal_d1';
    const target = document.getElementById('dist-publisher');
    if (target) {
      const label = DIST_PUBLISHERS[type] || type;
      target.textContent = project.endpoint_url ? label + ' — ' + project.endpoint_url : label;
    }
  }

  function renderWidgetSnippet() {
    const sitemap = $('#sitemap-link');
    if (sitemap) sitemap.href = activeProjectBase() + '/sitemap.xml';

    const snippetEl  = $('#widget-snippet');
    const previewEl  = $('#widget-preview-host');
    const copyBtn    = $('#widget-copy');
    if (!snippetEl || !previewEl || !copyBtn) return;

    const tabs       = $$('.widget-tab');
    const optId      = $('#widget-opt-id');
    const optTitle   = $('#widget-opt-title');
    const optCount   = $('#widget-opt-count');
    const optTheme   = $('#widget-opt-theme');

    function build() {
      const origin = activeProjectBase();
      const slug   = activeProjectSlug();
      const id    = (optId?.value || 'ps-blog').trim().replace(/[^a-z0-9-]/gi, '') || 'ps-blog';
      const title = (optTitle?.value || '').trim();
      const count = Math.min(50, Math.max(1, parseInt(optCount?.value, 10) || 5));
      const theme = (optTheme?.value || 'auto');
      const titleAttr = title ? `\n  data-title="${title.replace(/"/g, '&quot;')}"` : '';
      const themeAttr = theme !== 'auto' ? `\n  data-theme="${theme}"` : '';
      const projectAttr = slug ? `\n  data-project="${slug}"` : '';

      let s = '';
      if (_widgetFlavour === 'js') {
        s = `<div id="${id}"></div>\n` +
            `<script src="${activeProjectOrigin()}/widget.js"\n` +
            `  data-target="#${id}"\n` +
            `  data-count="${count}"${titleAttr}${themeAttr}${projectAttr}\n` +
            `  defer><\/script>`;
      } else if (_widgetFlavour === 'iframe') {
        const qs = new URLSearchParams();
        qs.set('count', count);
        if (title) qs.set('title', title);
        if (theme !== 'auto') qs.set('theme', theme);
        if (slug) qs.set('project', slug);
        s = `<iframe\n` +
            `  src="${activeProjectOrigin()}/embed?${qs.toString()}"\n` +
            `  style="width:100%;border:0;min-height:480px"\n` +
            `  loading="lazy"\n` +
            `  title="${(title || 'Blog').replace(/"/g, '&quot;')}"\n` +
            `></iframe>`;
      } else {
        s = `${origin}/blog`;
      }
      snippetEl.textContent = s;

      // Live preview — re-mount on every change so operators see
      // the current shape. For 'link' we just show the URL.
      while (previewEl.firstChild) previewEl.removeChild(previewEl.firstChild);
      if (_widgetFlavour === 'link') {
        const a = document.createElement('a');
        a.href = origin + '/blog'; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = origin + '/blog';
        previewEl.appendChild(a);
      } else {
        const host = document.createElement('div');
        host.id = id;
        previewEl.appendChild(host);
        // Always render the preview via the JS widget (same DOM,
        // less iframe overhead). Drop the existing widget.js if
        // we already mounted one (re-running build()) — appending
        // a fresh <script> each time would stack listeners and was
        // the cause of the "infinite refresh" bug in v1.0.2.
        const old = document.getElementById('ps-widget-preview-script');
        if (old) old.remove();
        const sc = document.createElement('script');
        sc.id = 'ps-widget-preview-script';
        // No cache-bust query — the widget.js is the same file every
        // build, and the cache-buster forced a fresh fetch on every
        // keystroke. With the listener-binding fix below the build()
        // is rate-controlled anyway, so a normal cached load is fine.
        sc.src = activeProjectOrigin() + '/widget.js';
        sc.defer = true;
        sc.dataset.target = '#' + id;
        sc.dataset.count  = String(count);
        if (title) sc.dataset.title = title;
        if (theme !== 'auto') sc.dataset.theme = theme;
        if (slug) sc.dataset.project = slug;
        previewEl.appendChild(sc);
      }
    }

    // Bind listeners ONCE. activateTab('seo') re-runs this function
    // every time the user switches to the SEO tab; without this
    // guard each visit would stack another set of input/click
    // listeners on the same elements. Within a few tab switches
    // every keystroke was triggering 5-10 build() calls, each of
    // which fetched a fresh widget.js (cache-busted), which the
    // browser surfaced as constant network/refresh activity.
    if (!_widgetWired) {
      _widgetWired = true;

      tabs.forEach((t) => {
        t.addEventListener('click', () => {
          tabs.forEach((x) => x.classList.toggle('is-active', x === t));
          _widgetFlavour = t.dataset.flavour;
          build();
        });
      });

      [optId, optTitle, optCount, optTheme].forEach((el) => {
        el?.addEventListener('input', build);
        el?.addEventListener('change', build);
      });

      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(snippetEl.textContent);
          copyBtn.classList.add('is-copied');
          copyBtn.textContent = '✓ Đã sao chép';
          setTimeout(() => {
            copyBtn.classList.remove('is-copied');
            copyBtn.textContent = 'Sao chép';
          }, 2000);
        } catch {
          // Clipboard denied — fall back to selecting the text
          const range = document.createRange();
          range.selectNode(snippetEl);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
          copyBtn.textContent = 'Nhấn ⌘C';
          setTimeout(() => { copyBtn.textContent = 'Sao chép'; }, 2500);
        }
      });
    }

    build();
  }

  // ── tiny helpers ────────────────────────────────────────────────
  function td(text, cls) {
    const e = document.createElement('td');
    e.textContent = String(text == null ? '' : text);
    if (cls) e.className = cls;
    return e;
  }
  function mkBtn(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = 'btn ' + (cls || '');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // ── cover editor ────────────────────────────────────────────────
  // The editor itself lives in /cover-editor.js. We give it the same
  // `api()` helper admin.js uses so authenticated requests share the
  // session cookie, and an onDirty callback so we could (later) warn
  // before navigating away with unsaved changes.
  const Cover = (() => {
    let booted = false;
    function init() {
      const mount = document.getElementById('ce-mount');
      if (!mount || !window.CoverEditor) return;
      if (booted) { window.CoverEditor.refresh && window.CoverEditor.refresh(); return; }
      booted = true;
      window.CoverEditor.init({
        root: mount,
        api,
        glue: { onDirty: () => { /* hook point */ } },
      });
    }
    return { init };
  })();



  // ── Projects tab (super_admin only) ──────────────────────────────
  const Projects = (() => {
    let mounted = false;

    function report(text, cls) {
      const list = $('#proj-list');
      if (!list) return;
      list.textContent = text;
      list.className = cls ? 'status ' + cls : 'dim';
    }

    function cell(text, bold) {
      const td = document.createElement('td');
      td.style.padding = '10px 8px';
      if (bold) td.style.fontWeight = '600';
      td.textContent = text || '—';
      return td;
    }

    async function removeProject(proj) {
      if (['gulagi', 'gurouter'].includes(proj.slug)) {
        alert('Dự án cốt lõi (' + proj.slug + ') được bảo vệ, không thể xóa.');
        return;
      }
      if (!confirm('Xóa hoàn toàn dự án "' + proj.name + '" (' + proj.slug + ')?\nMọi Brand DNA, lịch bài và cấu hình liên quan sẽ bị xóa.')) return;
      
      const { status, body } = await api('/api/admin/projects/' + encodeURIComponent(proj.id), {
        method: 'DELETE'
      });
      if (status !== 200 || !body?.ok) {
        alert(body?.detail || body?.error || 'Lỗi khi xóa dự án');
        return;
      }
      report('Đã xóa dự án ' + proj.name, 'good');
      load();
    }

    function renderRow(p) {
      const tr = document.createElement('tr');
      tr.appendChild(cell(p.name, true));
      
      const tdSlug = document.createElement('td');
      tdSlug.style.padding = '10px 8px';
      tdSlug.innerHTML = `<span style="font-family:var(--mono);font-size:12px;">${p.slug}</span><br/><a href="${p.publishing_url || ('/' + p.slug)}" target="_blank" style="font-size:11px;color:var(--text-muted);">${p.publishing_url || ('/' + p.slug)}</a>`;
      tr.appendChild(tdSlug);

      const tdWeb = document.createElement('td');
      tdWeb.style.padding = '10px 8px';
      tdWeb.innerHTML = p.website_url ? `<a href="${p.website_url}" target="_blank" style="color:var(--ink);">${p.website_url}</a>` : '—';
      tr.appendChild(tdWeb);

      tr.appendChild(cell(p.language === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'));
      
      const tdStatus = document.createElement('td');
      tdStatus.style.padding = '10px 8px';
      tdStatus.innerHTML = `<span class="status good" style="font-size:11px;">${p.status || 'active'}</span>`;
      tr.appendChild(tdStatus);

      const tdActions = document.createElement('td');
      tdActions.style.padding = '10px 8px';
      
      const switchBtn = document.createElement('button');
      switchBtn.type = 'button';
      switchBtn.className = 'btn btn-sm';
      switchBtn.style.marginRight = '6px';
      switchBtn.textContent = 'Chọn';
      switchBtn.onclick = () => {
        window.__psActiveProjectId = p.id;
        window.__psActiveProject = p;
        localStorage.setItem('ps_active_project_id', p.id);
        const switcher = $('#project-switcher');
        if (switcher) switcher.value = p.id;
        activateTab('overview');
      };

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = 'Xóa';
      if (['gulagi', 'gurouter'].includes(p.slug)) {
        delBtn.disabled = true;
        delBtn.title = 'Dự án cốt lõi được bảo vệ';
      } else {
        delBtn.onclick = () => removeProject(p);
      }

      tdActions.append(switchBtn, delBtn);
      tr.appendChild(tdActions);

      return tr;
    }

    async function load() {
      const rows = $('#proj-rows');
      if (!rows) return;
      const { status, body } = await api('/api/admin/projects');
      if (status !== 200 || !body?.ok) {
        report('Lỗi khi tải danh sách dự án: ' + (body?.error || status), 'bad');
        clearChildren(rows);
        return;
      }
      const list = body.projects || [];
      clearChildren(rows);
      for (const p of list) rows.appendChild(renderRow(p));
      report(`${list.length} dự án trong hệ thống.`, null);
    }

    async function create() {
      const msg = $('#proj-new-msg');
      const name = ($('#proj-new-name')?.value || '').trim();
      const slugInput = ($('#proj-new-slug')?.value || '').trim().toLowerCase();
      const website_url = ($('#proj-new-web')?.value || '').trim();
      const language = $('#proj-new-lang')?.value || 'vi';
      const btn = $('#proj-new-go');

      if (!name || !slugInput) {
        if (msg) { msg.textContent = 'Vui lòng nhập tên dự án và slug.'; msg.className = 'status bad'; }
        return;
      }

      if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slugInput)) {
        if (msg) { msg.textContent = 'Slug chỉ gồm chữ thường, số, dấu gạch ngang (2-40 ký tự).'; msg.className = 'status bad'; }
        return;
      }

      if (btn) { btn.disabled = true; btn.textContent = 'Đang khởi tạo dự án…'; }
      if (msg) { msg.textContent = ''; msg.className = 'status'; }

      try {
        const payload = {
          name,
          slug: slugInput,
          website_url,
          publishing_url: `${window.location.origin}/${slugInput}`,
          site_name: name,
          site_description: `Chuyên trang thông tin & giải pháp từ ${name}`,
          language,
          timezone: 'Asia/Ho_Chi_Minh',
          status: 'active',
          approval_mode: 'auto',
          brand: {
            business_type: `${name} cung cấp các sản phẩm và dịch vụ chuyên nghiệp.`,
            tone: 'Chuyên gia, tin cậy, hữu ích.',
            audience: 'Khách hàng quan tâm đến lĩnh vực hoạt động của doanh nghiệp.',
            key_themes: name,
            service_area: 'Toàn quốc'
          },
          ai_config: {
            default_text_provider: 'workers-ai',
            default_image_provider: 'workers-ai',
            text_model: '@cf/meta/llama-3.3-70b-instruct',
            image_model: '@cf/black-forest-labs/flux-1-schnell',
            min_words: 1200,
            max_words: 2500,
            temperature: 0.7
          },
          publishing_config: {
            publisher_type: 'internal_d1'
          },
          schedule: {
            frequency: 'daily',
            cron_expression: '0 1 * * *',
            preferred_time_utc: '01:00',
            is_active: 1
          }
        };

        const { status, body } = await api('/api/admin/projects', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (status !== 200 || !body?.ok) {
          if (msg) { msg.textContent = body?.detail || body?.error || 'Không thể tạo dự án'; msg.className = 'status bad'; }
          return;
        }

        if (msg) { msg.textContent = 'Đã tạo thành công dự án ' + name + '!'; msg.className = 'status good'; }
        if ($('#proj-new-name')) $('#proj-new-name').value = '';
        if ($('#proj-new-slug')) $('#proj-new-slug').value = '';
        if ($('#proj-new-web')) $('#proj-new-web').value = '';

        // Reload project list & switcher
        load();
        const who = await api('/api/admin/whoami');
        if (who?.status === 200 && who?.body) initProjectScope(who.body);

      } catch (e) {
        if (msg) { msg.textContent = 'Lỗi kết nối: ' + e.message; msg.className = 'status bad'; }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Tạo dự án mới'; }
      }
    }

    function init() {
      if (!mounted) {
        mounted = true;
        $('#proj-new-go')?.addEventListener('click', create);
      }
      load();
    }

    return { init, load };
  })();

  // ── Users tab (super_admin only) ─────────────────────────────────
  // Creates tenant accounts and binds each one to a project. Every other
  // admin page is project-scoped; this one is the privilege boundary
  // itself, so it stays hidden from project_admin and the API refuses
  // anything below super_admin.
  const Users = (() => {
    const ROLE_OPTIONS = [['project_admin', 'Quản trị dự án'], ['super_admin', 'Quản trị hệ thống']];
    const ERROR_TEXT = {
      invalid_email: 'Email không hợp lệ.',
      password_length: 'Mật khẩu phải có từ 8 đến 256 ký tự.',
      email_already_exists: 'Email này đã có tài khoản.',
      invalid_role: 'Vai trò không hợp lệ.',
      project_required: 'Phải chọn dự án cho vai trò Quản trị dự án.',
      unknown_project: 'Dự án không tồn tại.',
      user_not_found: 'Không tìm thấy tài khoản.',
      no_fields: 'Không có thay đổi nào để lưu.',
      cannot_delete_self: 'Không thể xoá tài khoản đang đăng nhập.',
      cannot_delete_last_user: 'Không thể xoá tài khoản cuối cùng.',
      cannot_delete_last_super_admin: 'Không thể xoá quản trị hệ thống cuối cùng.',
      forbidden: 'Chỉ quản trị hệ thống mới xem được trang này.',
    };
    let mounted = false;

    function errText(body) {
      return ERROR_TEXT[body?.error] || body?.error || 'Lỗi không xác định.';
    }

    function setMsg(el, text, cls) {
      if (!el) return;
      el.textContent = text || '';
      el.className = cls ? 'status ' + cls : 'status';
    }

    function td() {
      const el = document.createElement('td');
      el.style.padding = '8px';
      return el;
    }

    function tdText(text) {
      const el = td();
      el.textContent = text;
      return el;
    }

    function tdNode(node) {
      const el = td();
      el.appendChild(node);
      return el;
    }

    function dateCell(sec) {
      return tdText(sec
        ? new Date(sec * 1000).toLocaleDateString(currentLang === 'vi' ? 'vi-VN' : 'en-GB')
        : '—');
    }

    function makeSelect(value, options, blankLabel) {
      const sel = document.createElement('select');
      if (blankLabel) {
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = blankLabel;
        sel.appendChild(blank);
      }
      for (const [v, label] of options) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = label;
        if (v === value) opt.selected = true;
        sel.appendChild(opt);
      }
      return sel;
    }

    function projectOptions() {
      return _allProjects.map((p) => [p.id, p.name || p.slug || p.id]);
    }

    function actionButton(label) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = label;
      btn.style.marginRight = '6px';
      return btn;
    }

    function report(text, cls) {
      const list = $('#user-list');
      if (!list) return;
      list.textContent = text;
      list.className = cls ? 'status ' + cls : 'dim';
    }

    async function saveRow(user, roleSel, projSel, btn) {
      btn.disabled = true;
      const { status, body } = await api(
        '/api/admin/users?id=' + encodeURIComponent(user.id),
        { method: 'PUT', body: JSON.stringify({ role: roleSel.value, project_id: projSel.value || null }) }
      );
      btn.disabled = false;
      if (status !== 200 || !body?.ok) { report(errText(body), 'bad'); return; }
      report('Đã lưu ' + user.email + '.', 'good');
      load();
    }

    async function resetPassword(user) {
      const pw = window.prompt('Mật khẩu mới cho ' + user.email + ' (tối thiểu 8 ký tự):');
      if (pw === null) return;
      if (pw.length < 8) { report(ERROR_TEXT.password_length, 'bad'); return; }
      const { status, body } = await api(
        '/api/admin/users?id=' + encodeURIComponent(user.id),
        { method: 'PUT', body: JSON.stringify({ password: pw }) }
      );
      if (status !== 200 || !body?.ok) { report(errText(body), 'bad'); return; }
      report('Đã đổi mật khẩu cho ' + user.email + '.', 'good');
    }

    async function removeUser(user) {
      if (!window.confirm('Xoá tài khoản ' + user.email + '? Thao tác này không thể hoàn tác.')) return;
      const { status, body } = await api(
        '/api/admin/users?id=' + encodeURIComponent(user.id),
        { method: 'DELETE' }
      );
      if (status !== 200 || !body?.ok) { report(errText(body), 'bad'); return; }
      report('Đã xoá ' + user.email + '.', 'good');
      load();
    }

    function renderRow(user) {
      const tr = document.createElement('tr');
      tr.appendChild(tdText(user.email));

      const roleSel = makeSelect(user.role || 'project_admin', ROLE_OPTIONS, null);
      tr.appendChild(tdNode(roleSel));

      const projSel = makeSelect(user.project_id || '', projectOptions(), '— không gán —');
      tr.appendChild(tdNode(projSel));

      tr.appendChild(dateCell(user.created_at));
      tr.appendChild(dateCell(user.last_login_at));

      const save = actionButton('Lưu');
      save.addEventListener('click', () => saveRow(user, roleSel, projSel, save));
      const reset = actionButton('Đổi mật khẩu');
      reset.addEventListener('click', () => resetPassword(user));
      const del = actionButton('Xoá');
      del.addEventListener('click', () => removeUser(user));
      const actions = tdNode(save);
      actions.append(reset, del);
      tr.appendChild(actions);

      return tr;
    }

    async function load() {
      const rows = $('#user-rows');
      if (!rows) return;
      const { status, body } = await api('/api/admin/users');
      if (status !== 200 || !body?.ok) {
        clearChildren(rows);
        report(errText(body), 'bad');
        return;
      }
      const users = body.users || [];
      clearChildren(rows);
      for (const u of users) rows.appendChild(renderRow(u));
      report(users.length + ' tài khoản.', null);
    }

    async function create() {
      const msg = $('#user-new-msg');
      const email = ($('#user-new-email')?.value || '').trim();
      const password = $('#user-new-password')?.value || '';
      const role = $('#user-new-role')?.value || 'project_admin';
      const projectId = $('#user-new-project')?.value || '';
      if (!email) { setMsg(msg, 'Nhập email.', 'bad'); return; }
      if (password.length < 8) { setMsg(msg, ERROR_TEXT.password_length, 'bad'); return; }
      if (role === 'project_admin' && !projectId) { setMsg(msg, ERROR_TEXT.project_required, 'bad'); return; }
      const btn = $('#user-new-go');
      btn.disabled = true;
      const { status, body } = await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, role, project_id: projectId || null }),
      });
      btn.disabled = false;
      if (status !== 200 || !body?.ok) { setMsg(msg, errText(body), 'bad'); return; }
      setMsg(msg, 'Đã tạo ' + email + '.', 'good');
      const emailEl = $('#user-new-email'); if (emailEl) emailEl.value = '';
      const pwEl = $('#user-new-password'); if (pwEl) pwEl.value = '';
      load();
    }

    function fillProjects() {
      const sel = $('#user-new-project');
      if (!sel) return;
      const keep = sel.value;
      clearChildren(sel);
      for (const [v, label] of projectOptions()) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = label;
        sel.appendChild(opt);
      }
      if (keep) sel.value = keep;
    }

    function syncProjectEnabled() {
      const sel = $('#user-new-project');
      if (sel) sel.disabled = ($('#user-new-role')?.value) === 'super_admin';
    }

    async function init() {
      if (!_allProjects.length) {
        const { body } = await api('/api/admin/whoami');
        if (Array.isArray(body?.projects)) _allProjects = body.projects;
      }
      if (!mounted) {
        mounted = true;
        $('#user-new-role')?.addEventListener('change', syncProjectEnabled);
        $('#user-new-go')?.addEventListener('click', create);
      }
      fillProjects();
      syncProjectEnabled();
      load();
    }

    return { init, load };
  })();

  // ── Status tab ─────────────────────────────────────────────────
  // Three cards: health checks (D1, R2, AI, content, failures,
  // budget, providers, repair-secrets), provider liveness probes,
  // and a paginated audit-log viewer.
  const Status = (() => {
    let mounted = false;

    async function loadChecks() {
      const root = $('#status-checks');
      const summary = $('#status-summary');
      const btn = $('#status-refresh');
      if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
      summary.textContent = '';
      clearChildren(root);

      const { status: code, body } = await api('/api/admin/status');
      if (btn) { btn.disabled = false; btn.textContent = 'Chạy kiểm tra'; }
      if (code !== 200 || !body?.ok) {
        summary.textContent = 'Không thể chạy kiểm tra: ' + (body?.error || code);
        summary.className = 'status bad';
        return;
      }
      const failed = (body.checks || []).filter((c) => c.ok === false).length;
      summary.textContent = failed
        ? `${failed} mục kiểm tra không đạt`
        : 'Tất cả mục kiểm tra đều tốt';
      summary.className = 'status ' + (failed ? 'bad' : 'good');

      // Surface a tab-level badge when any check is failing so the
      // operator notices even when they're on another tab.
      const badge = document.getElementById('status-badge');
      if (badge) {
        if (failed) {
          badge.hidden = false;
          badge.textContent = String(failed);
        } else {
          badge.hidden = true;
        }
      }

      for (const c of body.checks) {
        const wrap = document.createElement('div');
        wrap.className = 'status-check ' + (c.ok === false ? 'bad' : 'good');
        const top = document.createElement('div');
        top.className = 'status-check-top';
        const icon = document.createElement('span');
        icon.className = 'status-check-icon';
        icon.textContent = c.ok === false ? '✗' : '✓';
        const label = document.createElement('span');
        label.className = 'status-check-label';
        label.textContent = c.label;
        top.append(icon, label);
        wrap.appendChild(top);

        if (c.detail) {
          const detail = document.createElement('div');
          detail.className = 'status-check-detail';
          detail.textContent = c.detail;
          wrap.appendChild(detail);
        }

        // Render extra structured fields the endpoint exposes.
        const extras = ['count', 'blogs', 'progs', 'pct', 'spent_usd', 'cap_usd', 'blogs_age_days'];
        const extraBits = [];
        for (const k of extras) {
          if (c[k] != null) extraBits.push(`${k}: ${c[k]}`);
        }
        if (c.providers?.length) {
          extraBits.push('nhà cung cấp: ' + c.providers.map((p) => `${p.key}${p.configured ? '✓' : ' ✗'}`).join(', '));
        }
        if (c.missing?.length) {
          extraBits.push('còn thiếu: ' + c.missing.join(', '));
        }
        if (extraBits.length) {
          const ex = document.createElement('div');
          ex.className = 'status-check-extras';
          ex.textContent = extraBits.join(' · ');
          wrap.appendChild(ex);
        }
        // Action button: when a check has a known fix path, expose
        // it inline. Today only 'repair' has one — deep-links to
        // the canonical /repair page with project pre-filled.
        if (c.id === 'repair' && c.ok === false) {
          const a = document.createElement('a');
          a.className = 'status-check-action';
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = '→ Sửa bản cài đặt này';
          // Try to pre-fill project slug. The install flow writes
          // settings.install_cf_project; failing that, we'll let
          // the user type it on the repair page.
          let project = '';
          try {
            // best-effort, sync inside the loop: pull from a recently
            // loaded settings cache if available, else leave blank.
            project = window.__psSettings?.install_cf_project || '';
          } catch { /* */ }
          a.href = 'https://seo.benjaminb.xyz/repair' + (project ? `?project=${encodeURIComponent(project)}` : '');
          wrap.appendChild(a);
        }
        root.appendChild(wrap);
      }
    }

    async function testProviders() {
      const ul = $('#providers-results');
      const btn = $('#providers-test');
      if (btn) { btn.disabled = true; btn.textContent = 'Đang kiểm tra…'; }
      clearChildren(ul);

      const { status: code, body } = await api('/api/admin/providers/test', { method: 'POST', body: '{}' });
      if (btn) { btn.disabled = false; btn.textContent = 'Kiểm tra tất cả nhà cung cấp'; }
      if (code !== 200 || !body?.ok) {
        const li = document.createElement('li');
        li.className = 'provider-result bad';
        li.textContent = 'Yêu cầu kiểm tra thất bại: ' + (body?.error || code);
        ul.appendChild(li);
        return;
      }
      for (const r of (body.results || [])) {
        const li = document.createElement('li');
        li.className = 'provider-result ' + (r.ok ? 'good' : 'bad');
        const name = document.createElement('strong'); name.textContent = r.name;
        const status = document.createElement('span');
        status.className = 'provider-status';
        status.textContent = r.ok
          ? `✓ ${r.ms != null ? r.ms + 'ms' : 'ok'}`
          : `✗ ${r.error || 'thất bại'}`;
        const detail = document.createElement('span');
        detail.className = 'provider-detail';
        detail.textContent = r.detail || r.sample || '';
        li.append(name, status, detail);
        ul.appendChild(li);
      }
    }

    async function loadAudit() {
      const tbody = $('#audit-rows');
      const filter = $('#audit-filter')?.value || '';
      clearChildren(tbody);

      const qs = new URLSearchParams({ limit: '50' });
      if (filter === 'fail') qs.set('only_failures', '1');
      else if (filter) qs.set('action', filter);

      const { status: code, body } = await api('/api/admin/audit?' + qs.toString());
      if (code !== 200 || !body?.ok) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4; td.textContent = 'Không thể tải nhật ký hoạt động: ' + (body?.error || code);
        td.style.color = 'var(--bad)';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      if (!body.entries?.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4; td.textContent = 'Chưa có bản ghi nào khớp bộ lọc này.';
        td.style.color = 'var(--ink-faint)';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      for (const e of body.entries) {
        const tr = document.createElement('tr');
        const isFail = /fail|error/i.test(e.action);
        if (isFail) tr.classList.add('audit-fail');
        const when = new Date(e.created_at * 1000).toLocaleString('en-GB', {
          year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
        });
        const c1 = document.createElement('td'); c1.textContent = when; c1.style.color = 'var(--ink-faint)';
        const c2 = document.createElement('td'); c2.textContent = e.actor || '—';
        const c3 = document.createElement('td'); c3.textContent = e.action;
        c3.style.fontFamily = 'var(--mono, monospace)';
        const c4 = document.createElement('td');
        c4.style.fontSize = '12px'; c4.style.color = 'var(--ink-dim)';
        // details may be parsed object or raw string; render either.
        if (e.details && typeof e.details === 'object') {
          c4.textContent = Object.entries(e.details)
            .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(' · ').slice(0, 200);
        } else if (e.details) {
          c4.textContent = String(e.details).slice(0, 200);
        }
        tr.append(c1, c2, c3, c4);
        tbody.appendChild(tr);
      }
    }

    // In-flight guard: if a previous loadChecks/loadAudit is still
    // in flight when init() is called again (e.g. user re-clicks
    // the System tab while the first run is mid-fetch), don't
    // start a second one. Concurrent overlapping calls were a
    // candidate source of the "infinite refresh" feel users
    // reported when bouncing between tabs.
    let inFlight = false;
    async function initialLoad() {
      if (inFlight) return;
      inFlight = true;
      try {
        await Promise.all([loadChecks(), loadAudit()]);
      } finally { inFlight = false; }
    }
    function init() {
      if (!mounted) {
        mounted = true;
        $('#status-refresh')?.addEventListener('click', loadChecks);
        $('#providers-test')?.addEventListener('click', testProviders);
        $('#audit-refresh')?.addEventListener('click', loadAudit);
        $('#audit-filter')?.addEventListener('change', loadAudit);
        wireAiHelp();
      }
      initialLoad();
    }

    // Personalise the "Set up with AI" card with the user's own
    // slug + site URL so the LLM gets concrete URLs to reference
    // instead of placeholders. Also wires a "Copy prompt" button
    // that fetches the prompt directly (avoids a tab roundtrip
    // when the user just wants the text on their clipboard).
    function wireAiHelp() {
      const settings = window.__psSettings || {};
      const slug = settings.install_cf_project || settings.site_slug || '';
      const site = (settings.site_url || location.origin).replace(/\/$/, '');
      const admin = site + '/admin';
      const version = (window.__psVersion?.short || '').slice(0, 12);
      const qs = new URLSearchParams();
      if (slug)    qs.set('slug', slug);
      if (site)    qs.set('site', site);
      if (admin)   qs.set('admin', admin);
      if (version) qs.set('version', version);
      const base = 'https://seo.benjaminb.xyz/ai-setup';
      const repairBtn = $('#ai-help-repair');
      const updateBtn = $('#ai-help-update');
      // Repair uses ?from=diagnose so /ai-setup runs the live scan
      // and emits a prompt that names the specific failures. Update
      // doesn't need a scan — the static prompt is correct.
      if (repairBtn) repairBtn.href = `${base}?from=diagnose&${qs.toString()}`;
      if (updateBtn) updateBtn.href = `${base}?mode=update&${qs.toString()}`;

      const copyBtn = $('#ai-help-copy');
      const statusEl = $('#ai-help-status');
      copyBtn?.addEventListener('click', async () => {
        statusEl.textContent = 'Đang quét trang web của bạn…';
        try {
          let text = null;
          if (site) {
            const dr = await fetch('https://seo.benjaminb.xyz/api/ai-prompt/diagnose?' + qs.toString(), { cache: 'no-store' });
            if (dr.ok) text = await dr.text();
          }
          if (!text) {
            const r2 = await fetch('https://seo.benjaminb.xyz/api/ai-prompt?mode=repair&' + qs.toString(), { cache: 'no-store' });
            if (!r2.ok) throw new Error('HTTP ' + r2.status);
            text = await r2.text();
          }
          await navigator.clipboard.writeText(text);
          statusEl.textContent = `✓ Đã sao chép (${Math.round(text.length / 1024)}k ký tự, tùy biến theo kết quả quét) — dán vào bất kỳ AI nào`;
          setTimeout(() => { statusEl.textContent = ''; }, 6000);
        } catch (e) {
          statusEl.textContent = 'Sao chép thất bại — hãy mở liên kết trực tiếp.';
        }
      });
    }
    return { init };
  })();


  let _allProjects = [];

  function initProjectScope(whoami) {
    const role = whoami?.role || 'super_admin';
    const projects = whoami?.projects || [];
    const projectId = whoami?.project_id || null;
    _allProjects = projects;
    window.__psRole = role;
    applyRoleVisibility(role);

    window.__psPlanTier = whoami?.plan_tier || 'free';
    const isFree = window.__psPlanTier === 'free' && role !== 'super_admin';
    const roleBadge = $('#role-badge');
    if (roleBadge) {
      roleBadge.hidden = false;
      if (role === 'super_admin') {
        roleBadge.textContent = 'Quản trị hệ thống';
      } else if (isFree) {
        const pCount = whoami?.post_count || 0;
        const pLimit = whoami?.post_limit || 100;
        roleBadge.textContent = `Gói Free · ${pCount}/${pLimit} bài`;
        roleBadge.title = `Tài khoản miễn phí được tạo tối đa ${pLimit} bài SEO. Không hỗ trợ xóa bài.`;
      } else {
        roleBadge.textContent = 'Quản trị dự án';
      }
    }

    const switcher = $('#project-switcher');
    const badge = $('#project-badge');
    const scope = $('#project-scope');
    if (!scope) return;

    if (role === 'project_admin') {
      if (switcher) switcher.hidden = true;
      if (badge) {
        badge.hidden = false;
        const current = projects.find((p) => p.id === projectId) || { name: whoami?.site_name || 'Dự án' };
        badge.textContent = `🏪 ${current.name}`;
      }
      window.__psActiveProjectId = projectId;
      window.__psActiveProject = projects.find((p) => p.id === projectId) || null;
      return;
    }

    if (role === 'super_admin') {
      if (badge) badge.hidden = true;
      if (!switcher) return;
      switcher.hidden = false;
      clearChildren(switcher);

      for (const p of projects) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        switcher.appendChild(opt);
      }

      const stored = localStorage.getItem('ps_active_project_id');
      const foundStored = projects.some((p) => p.id === stored);
      const selectedId = foundStored ? stored : (projects[0]?.id || null);

      if (selectedId) {
        switcher.value = selectedId;
        window.__psActiveProjectId = selectedId;
        window.__psActiveProject = projects.find((p) => p.id === selectedId) || null;
        localStorage.setItem('ps_active_project_id', selectedId);
      }

      switcher.onchange = () => {
        const newId = switcher.value;
        localStorage.setItem('ps_active_project_id', newId);
        window.__psActiveProjectId = newId;
        window.__psActiveProject = projects.find((p) => p.id === newId) || null;
        if (_activeTab) {
          const tabToReload = _activeTab;
          _activeTab = null;
          activateTab(tabToReload);
        }
      };
    }
  }

  // (Command palette + slash-DSL removed at user request, 2026-05-19.
  // The action handlers below — runBlogChain, runProgNext, pingIndexNow,
  // loadUsage, refreshPricing, generateBrand, saveBrand, runBrandFilter,
  // applyToTarget, etc. — remain wired to their tab buttons.)


  // ── Onboarding Quickstart Wizard (Aha! Moment in 60s) ───────────
  const Onboarding = (() => {
    let bound = false;
    let selectedTopic = null;
    let generatedSlug = null;

    function open() {
      const modal = $('#ob-modal');
      if (!modal) return;
      modal.hidden = false;
      showStep(1);

      // Pre-fill URL if project has one
      const cur = window.__psActiveProject;
      const urlInput = $('#ob-url');
      if (urlInput && !urlInput.value && cur?.website_url) {
        urlInput.value = cur.website_url;
      }
    }

    function close() {
      const modal = $('#ob-modal');
      if (modal) modal.hidden = true;
      localStorage.setItem('ps_onboarding_seen_' + (window.__psActiveProjectId || 'default'), 'true');
    }

    function showStep(stepNum) {
      for (let i = 1; i <= 4; i++) {
        const step = $(`#ob-step-${i}`);
        if (step) step.hidden = (i !== stepNum);
      }
    }

    async function scanWebsite() {
      const url = ($('#ob-url')?.value || '').trim();
      const status = $('#ob-scan-status');
      const btn = $('#ob-scan-btn');

      if (!url) {
        if (status) { status.textContent = 'Vui lòng nhập địa chỉ website hoặc link trang.'; status.className = 'status bad'; }
        return;
      }

      if (btn) { btn.disabled = true; btn.textContent = 'Đang phân tích website…'; }
      if (status) { status.textContent = 'Đang thu thập nội dung & trích xuất DNA (10–20s)…'; status.className = 'status'; }

      try {
        const { status: code, body } = await api('/api/admin/brand-dna', {
          method: 'POST',
          body: JSON.stringify({ url })
        });

        if (code !== 200 || !body?.ok) {
          if (status) { status.textContent = body?.detail || body?.error || 'Không thể cào website.'; status.className = 'status bad'; }
          return;
        }

        // Successfully generated Brand DNA, now load recommended topics
        await loadTopicsForStep2();
        showStep(2);
      } catch (e) {
        if (status) { status.textContent = 'Lỗi kết nối: ' + e.message; status.className = 'status bad'; }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Phân tích website →'; }
      }
    }

    async function loadTopicsForStep2() {
      const listEl = $('#ob-topic-list');
      if (!listEl) return;
      clearChildren(listEl);

      // Try reading project topics
      const pid = window.__psActiveProjectId;
      let topics = [];
      try {
        const { body } = await api('/api/admin/topics?limit=5');
        topics = body?.topics || [];
      } catch {}

      if (!topics.length) {
        // Fallback default suggestions for the brand
        const curName = window.__psActiveProject?.name || 'Doanh Nghiệp';
        topics = [
          { key: `Xu hướng và giải pháp phát triển cho ${curName} năm 2026`, angle: `Đánh giá toàn diện các cơ hội và chiến lược thực tiễn cho ${curName}.` },
          { key: `Kinh nghiệm tối ưu chi phí và tăng trưởng bền vững`, angle: `Phân tích chuyên sâu các bước triển khai hiệu quả.` },
          { key: `So sánh các giải pháp hàng đầu trong ngành`, angle: `Góc nhìn khách quan giúp khách hàng lựa chọn đúng đắn.` }
        ];
      }

      selectedTopic = topics[0] || null;

      topics.slice(0, 4).forEach((t, idx) => {
        const item = document.createElement('div');
        item.className = 'ob-topic-item' + (idx === 0 ? ' is-selected' : '');
        item.innerHTML = `
          <input type="radio" name="ob-topic-radio" class="ob-topic-radio" ${idx === 0 ? 'checked' : ''} />
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--ink);margin-bottom:4px;">${t.key || t.topic || t.title}</div>
            <div style="font-size:12.5px;color:var(--ink-dim);line-height:1.4;">${t.angle || t.brief || ''}</div>
          </div>
        `;
        item.addEventListener('click', () => {
          $$('.ob-topic-item').forEach(el => el.classList.remove('is-selected'));
          item.classList.add('is-selected');
          const radio = item.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;
          selectedTopic = t;
        });
        listEl.appendChild(item);
      });

      const genBtn = $('#ob-generate-btn');
      if (genBtn) genBtn.disabled = false;
    }

    async function generateFirstPost() {
      if (!selectedTopic) return;
      showStep(3);

      const heading = $('#ob-gen-heading');
      const bar = $('#ob-progress-bar');
      const log = $('#ob-gen-log');
      if (log) { log.hidden = false; log.textContent = ''; }
      const append = (msg) => { if (log) log.textContent += msg + '\n'; };

      try {
        // 1. Start Job
        if (heading) heading.textContent = '1/4 Chọn chủ đề & khởi tạo job…';
        if (bar) bar.style.width = '25%';
        append('Khởi tạo bài viết với chủ đề: ' + (selectedTopic.key || selectedTopic.title));

        const start = await api('/api/admin/blog/start', {
          method: 'POST',
          body: JSON.stringify({
            topic_key: selectedTopic.key || selectedTopic.title,
            angle: selectedTopic.angle || selectedTopic.brief || selectedTopic.key
          })
        });

        const jobId = start?.body?.job_id;
        if (!jobId) throw new Error(start?.body?.error || 'Không thể tạo job');
        append('Job ID: ' + jobId);

        // 2. Generate Text
        if (heading) heading.textContent = '2/4 AI đang viết 900–1.300 từ…';
        if (bar) bar.style.width = '50%';
        append('Đang sản xuất nội dung chuẩn SEO…');

        const text = await api('/api/admin/blog/text', {
          method: 'POST',
          body: JSON.stringify({ job_id: jobId })
        });
        if (text.status !== 200) throw new Error(text.body?.detail || text.body?.error || 'Lỗi viết bài');
        append('Tiêu đề: ' + text.body.title);
        generatedSlug = text.body.slug;

        // 3. Generate Cover Image
        if (heading) heading.textContent = '3/4 Đang sinh ảnh bìa Flux…';
        if (bar) bar.style.width = '75%';
        append('Sinh ảnh hero nghệ thuật…');

        await api('/api/admin/blog/image', {
          method: 'POST',
          body: JSON.stringify({ job_id: jobId })
        });

        // 4. Publish
        if (heading) heading.textContent = '4/4 Xuất bản & ping IndexNow…';
        if (bar) bar.style.width = '100%';
        append('Xuất bản thành công!');

        await api('/api/admin/blog/publish', {
          method: 'POST',
          body: JSON.stringify({ job_id: jobId })
        });

        // Step 4: Show Celebration
        showStep(4);
        const viewBtn = $('#ob-view-post-btn');
        if (viewBtn) {
          viewBtn.href = activeProjectBase() + '/blog/' + generatedSlug;
        }

        // Refresh overview counters
        loadOverview();

      } catch (err) {
        if (heading) heading.textContent = 'Lỗi trong quá trình tạo bài';
        if (bar) bar.style.background = 'var(--bad)';
        append('THẤT BẠI: ' + err.message);
      }
    }

    function init() {
      if (bound) return;
      bound = true;

      $('#ob-close')?.addEventListener('click', close);
      $('#ob-finish-btn')?.addEventListener('click', close);
      $('#ob-scan-btn')?.addEventListener('click', scanWebsite);
      $('#ob-skip-step-1')?.addEventListener('click', async () => {
        await loadTopicsForStep2();
        showStep(2);
      });
      $('#ob-back-1')?.addEventListener('click', () => showStep(1));
      $('#ob-generate-btn')?.addEventListener('click', generateFirstPost);

      // Auto trigger if user hasn't seen it and has 0 posts.
      // Skipped entirely when we just came from registration — that flow
      // opens the Brand setup wizard instead.
      setTimeout(async () => {
        const pid = window.__psActiveProjectId;
        if (!pid) return;
        try { if (localStorage.getItem('ps_open_wizard_after_mount') === '1') return; } catch {}
        const key = 'ps_onboarding_seen_' + pid;
        if (localStorage.getItem(key)) return;

        // Check if project has 0 posts
        try {
          const { body } = await api('/api/admin/blog/list?limit=1');
          if (!body?.posts || body.posts.length === 0) {
            open();
          } else {
            localStorage.setItem(key, 'true');
          }
        } catch {}
      }, 1500);
    }

    return { open, close, init };
  })();

  // ── mount ───────────────────────────────────────────────────────
  async function mount() {
    $('#gate').hidden = true;
    $('#dash').hidden = false;

    // A fresh registration should land in the Brand setup wizard, not on
    // an empty dashboard with a quickstart popup.
    let openWizardAfterMount = false;
    try {
      if (localStorage.getItem('ps_open_wizard_after_mount') === '1') {
        localStorage.removeItem('ps_open_wizard_after_mount');
        openWizardAfterMount = true;
      }
    } catch {}

    try {
      const { status, body } = await api('/api/admin/whoami');
      if (status === 200 && body?.ok) {
        initProjectScope(body);
      }
    } catch {}

    $$('.tab').forEach((t) => t.addEventListener('click', () => activateTab(t.dataset.tab)));
    $('#lock').addEventListener('click', doLogout);
    // Theme toggle. Applied early in <head> via the IIFE in
    // admin.html; this binding just handles click → swap → persist.
    $('#theme-toggle')?.addEventListener('click', toggleTheme);
    // Populate the version badge in the top bar. Runs on every
    // mount so a re-login after an update shows the fresh version.
    // Failures are silent — the badge stays hidden and the admin
    // is otherwise unaffected.
    populateVersionBadge().catch(() => {}); Onboarding.init();
    // Re-check every 10 minutes while the tab is open so users
    // notice an upstream release without manually refreshing.
    setInterval(() => { populateVersionBadge().catch(() => {}); Onboarding.init(); }, 10 * 60 * 1000);

    // Pull any active admin notices and render them as sticky
    // toasts. These are conditions detected by the backend (cover
    // template missing, provider budget exhausted, etc.) that the
    // SPA can't otherwise see. Re-check every 5 minutes so a notice
    // recorded mid-session surfaces without a refresh.
    loadAdminNotices().catch(() => {});
    setInterval(() => { loadAdminNotices().catch(() => {}); }, 5 * 60 * 1000);

    // overview quick-actions reuse the same handlers as their tabs.
    $('#qa-blog').addEventListener('click', () => { activateTab('blog'); runBlogChain(); });
    $('#qa-prog').addEventListener('click', () => { activateTab('prog'); runProgNext(); });
    $('#qa-ping').addEventListener('click', () => { activateTab('seo'); pingIndexNow(); });

    // blog tab
    $('#blog-go').addEventListener('click', runBlogChain);
    $('#refresh-scan').addEventListener('click', runRefreshScan);
    $('#jobs-refresh').addEventListener('click', loadJobs);

    // prog tab
    $('#pull-go').addEventListener('click', () => pullAndQueue(true));
    $('#pull-preview').addEventListener('click', () => pullAndQueue(false));
    $('#upload-go').addEventListener('click', uploadCsv);
    $('#queue-refresh').addEventListener('click', loadQueue);
    $('#queue-status').addEventListener('change', loadQueue);
    $('#prog-go').addEventListener('click', runProgNext);

    // seo tab
    $('#ping-go').addEventListener('click', pingIndexNow);

    // settings tab
    const saveBtn = $('#settings-save');
    if (saveBtn) saveBtn.addEventListener('click', saveSettings);
    // Google Search Console card. Wired once on mount; the inputs
    // themselves live inside the Settings card and only show when
    // the user hits that tab.
    $('#gsc-save')?.addEventListener('click', saveGsc);
    $('#gsc-test')?.addEventListener('click', testGsc);
    $('#gsc-clear')?.addEventListener('click', clearGsc);
    const pricingRefresh = $('#pricing-refresh');
    if (pricingRefresh) pricingRefresh.addEventListener('click', refreshPricing);

    // "Go to settings" jump from any [data-jump-to] link.
    $$('[data-jump-to]').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); activateTab(a.dataset.jumpTo); });
    });

    // usage tab
    const uRef = $('#usage-refresh');
    const uWin = $('#usage-window');
    if (uRef) uRef.addEventListener('click', loadUsage);
    if (uWin) uWin.addEventListener('change', loadUsage);

    // brand DNA tab
    const bGen = $('#brand-generate');
    const bSave = $('#brand-save');
    const bClear = $('#brand-clear');
    const bFilterDry = $('#brand-filter-dry');
    const bFilterGo  = $('#brand-filter-go');
    if (bGen)        bGen.addEventListener('click', generateBrand);
    if (bSave)       bSave.addEventListener('click', saveBrand);
    if (bClear)      bClear.addEventListener('click', clearBrandFields);
    if (bFilterDry)  bFilterDry.addEventListener('click', () => runBrandFilter(true));
    if (bFilterGo)   bFilterGo.addEventListener('click', () => runBrandFilter(false));

    // brand identity (logo + theme colour)
    const logoFile = $('#brand-logo-file');
    const logoRemove = $('#brand-logo-remove');
    const colorPick = $('#brand-theme-color');
    const hexInput = $('#brand-theme-hex');
    if (logoFile)   logoFile.addEventListener('change', () => uploadBrandLogo(logoFile.files?.[0]));
    if (logoRemove) logoRemove.addEventListener('click', removeBrandLogo);
    if (colorPick)  colorPick.addEventListener('input', () => syncBrandColor('picker'));
    if (hexInput)   hexInput.addEventListener('input', () => syncBrandColor('hex'));

    // embeds tab
    const eCreate = $('#embed-create-go');
    if (eCreate) eCreate.addEventListener('click', createEmbed);

    // calendar tab
    const cPrev = $('#cal-prev'); if (cPrev) cPrev.addEventListener('click', () => Calendar.shiftMonth(-1));
    const cNext = $('#cal-next'); if (cNext) cNext.addEventListener('click', () => Calendar.shiftMonth(1));
    const cToday = $('#cal-today'); if (cToday) cToday.addEventListener('click', () => Calendar.gotoToday());
    const cPlan = $('#cal-plan'); if (cPlan) cPlan.addEventListener('click', () => Calendar.regenerate());
    const cNew = $('#cal-new'); if (cNew) cNew.addEventListener('click', () => Calendar.openModal({ scheduled_for: Calendar.todayIso() }));

    // topbar
    const ow = $('#open-wizard'); if (ow) ow.addEventListener('click', () => Wizard.open());
    const langBtn = $('#lang-toggle');
    if (langBtn) {
      langBtn.addEventListener('click', () => {
        applyLanguage(currentLang === 'vi' ? 'en' : 'vi');
      });
    }
    applyLanguage(currentLang);

    const initialTab = (location.hash || '').replace(/^#/, '').trim();
    const validTabs = ['overview', 'blog', 'calendar', 'brand', 'prog', 'links', 'covers', 'analytics', 'seo', 'embeds', 'status', 'updates', 'usage', 'trends', 'settings']
      .filter((t) => !isTabBlocked(t));
    if (initialTab && validTabs.includes(initialTab)) {
      activateTab(initialTab);
    } else {
      activateTab('overview');
    }
    window.addEventListener('hashchange', () => {
      const h = (location.hash || '').replace(/^#/, '').trim();
      if (h && validTabs.includes(h)) activateTab(h);
    });
    // First-login auto-launch — check onboarding state and offer the
    // wizard if it hasn't been completed yet. A brand-new registration
    // goes straight into the wizard instead of the generic prompt.
    if (openWizardAfterMount) {
      Wizard.open();
    } else {
      Wizard.maybeAutoOpen();
    }
    // Background update check — paints the "N" badge on the Updates
    // tab if upstream has new commits. Doesn't block first paint.
    setTimeout(() => Updates.quietCheck(), 800);
  }

  // ── links / aliases ────────────────────────────────────────────
  // Manages the site_aliases table: named shortcuts the LLM uses
  // inside markdown links. Three flavours surface in the UI:
  //   - reserved (blog/home/rss/sitemap) — uneditable
  //   - manual                            — operator-curated, full CRUD
  //   - sitemap                           — auto-imported from blog/prog
  //                                          pages via /api/admin/aliases/sync
  const Links = (() => {
    let aliases = [];
    let editingName = null;

    async function load() {
      const { status, body } = await api('/api/admin/aliases');
      if (status !== 200) {
        $('#link-list-manual').innerHTML = '<div class="muted">Lỗi tải danh sách liên kết: ' + (body?.error || status) + '</div>';
        return;
      }
      aliases = body.aliases || [];
      render();
    }

    function render() {
      const escH = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]);
      const manual = aliases.filter((a) => a.kind === 'manual' || a.kind === 'reserved');
      const sitemap = aliases.filter((a) => a.kind === 'sitemap');

      const wrap = $('#link-list-manual');
      if (!manual.length) {
        wrap.innerHTML = '<div class="muted">Chưa có liên kết tùy chọn nào. Bấm <b>+ Thêm liên kết</b> để dạy AI về trang này.</div>';
      } else {
        wrap.innerHTML = '';
        for (const a of manual) {
          const row = document.createElement('div');
          row.className = 'link-row' + (a.kind === 'reserved' ? ' is-reserved' : '');
          row.innerHTML = `
            <div class="link-name">${escH(a.name)}</div>
            <div class="link-meta">
              <span class="link-url">${escH(a.url)}</span>
              ${a.description ? `<span class="link-desc">${escH(a.description)}</span>` : ''}
            </div>
            <span class="link-kind ${a.kind === 'reserved' ? 'is-reserved' : ''}">${escH(a.kind)}</span>
            <button class="link-edit" type="button" data-name="${escH(a.name)}">Sửa</button>
          `;
          wrap.appendChild(row);
        }
        wrap.querySelectorAll('.link-edit').forEach((btn) => {
          btn.addEventListener('click', () => {
            const name = btn.dataset.name;
            const a = aliases.find((x) => x.name === name);
            if (a && a.kind !== 'reserved') openModal(a);
          });
        });
      }

      const swrap = $('#link-list-sitemap');
      if (!sitemap.length) {
        swrap.innerHTML = '<div class="muted">Chưa có liên kết nào từ sitemap. Nhấn <b>Đồng bộ từ sitemap</b> sau khi xuất bản bài viết.</div>';
      } else {
        swrap.innerHTML = '';
        for (const a of sitemap.slice(0, 200)) {
          const row = document.createElement('div');
          row.className = 'link-row';
          row.innerHTML = `
            <div class="link-meta">
              <span class="link-url">${escH(a.url)}</span>
              ${a.description ? `<span class="link-desc">${escH(a.description)}</span>` : ''}
            </div>
            <span class="link-kind is-sitemap">sitemap</span>
          `;
          swrap.appendChild(row);
        }
        if (sitemap.length > 200) {
          const more = document.createElement('div');
          more.className = 'muted';
          more.textContent = `+ thêm ${sitemap.length - 200} liên kết nữa.`;
          swrap.appendChild(more);
        }
      }
    }

    function openModal(a) {
      editingName = a?.name || null;
      $('#link-modal-title').textContent = editingName ? 'Sửa liên kết' : 'Thêm liên kết';
      $('#link-mod-name').value = a?.name || '';
      $('#link-mod-name').disabled = !!editingName; // names are immutable once created
      $('#link-mod-url').value  = a?.url  || '';
      $('#link-mod-desc').value = a?.description || '';
      $('#link-mod-delete').hidden = !editingName;
      $('#link-mod-err').textContent = '';
      $('#link-modal').hidden = false;
      setTimeout(() => (editingName ? $('#link-mod-url') : $('#link-mod-name')).focus(), 30);
    }
    function closeModal() {
      $('#link-modal').hidden = true;
      editingName = null;
    }

    async function save() {
      const name = $('#link-mod-name').value.trim().toLowerCase();
      const url  = $('#link-mod-url').value.trim();
      const desc = $('#link-mod-desc').value.trim();
      const err  = $('#link-mod-err'); err.textContent = '';
      if (!editingName) {
        if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(name)) {
          err.textContent = 'Tên: chữ thường, số, _ hoặc -; tối đa 40 ký tự.'; return;
        }
      }
      if (!url) { err.textContent = 'URL không được để trống.'; return; }
      let res;
      if (editingName) {
        res = await api('/api/admin/aliases', {
          method: 'PATCH',
          body: JSON.stringify({ name: editingName, url, description: desc }),
        });
      } else {
        res = await api('/api/admin/aliases', {
          method: 'POST',
          body: JSON.stringify({ name, url, description: desc }),
        });
      }
      if (res.status !== 200) { err.textContent = res.body?.detail || res.body?.error || 'Lưu thất bại'; return; }
      closeModal();
      load();
    }

    async function remove() {
      if (!editingName) return;
      if (!confirm(`Xóa liên kết "${editingName}"?`)) return;
      const res = await api('/api/admin/aliases?name=' + encodeURIComponent(editingName), { method: 'DELETE' });
      if (res.status !== 200) { $('#link-mod-err').textContent = res.body?.error || 'Xóa thất bại'; return; }
      closeModal();
      load();
    }

    async function sync() {
      const btn = $('#link-sync'); const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Đang đồng bộ…';
      const res = await api('/api/admin/aliases/sync', { method: 'POST' });
      btn.disabled = false; btn.textContent = orig;
      if (res.status === 200) {
        const r = res.body;
        const msg = `Đã đồng bộ sitemap — thêm ${r.added || 0}, xóa ${r.removed || 0} (${r.total || 0} tổng cộng).`;
        btn.textContent = '✓ ' + msg.slice(0, 50);
        setTimeout(() => { btn.textContent = orig; }, 3000);
      } else {
        toast(res.body?.error || 'Đồng bộ thất bại', 'bad', { errorCode: res.body?.error });
      }
      load();
    }

    function bindOnce() {
      if (bindOnce.done) return;
      bindOnce.done = true;
      $('#link-add').addEventListener('click', () => openModal(null));
      $('#link-sync').addEventListener('click', sync);
      $('#link-mod-save').addEventListener('click', save);
      $('#link-mod-cancel').addEventListener('click', closeModal);
      $('#link-mod-delete').addEventListener('click', remove);
      $('#link-modal').addEventListener('click', (e) => { if (e.target.id === 'link-modal') closeModal(); });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('#link-modal').hidden) closeModal();
      });
    }

    function init() { bindOnce(); load(); }
    return { init };
  })();

  // ── first-run setup ───────────────────────────────────────────
  // Renders the one-time setup card on a fresh one-click deploy.
  // The server's /api/setup applies the schema, generates secrets,
  // and creates the first user; we then log the operator in with
  // their just-set password so they land in the onboarding wizard.
  const Setup = (() => {
    // The setup magic-link token from ?setup=<hex>. Saved here so
    // submit() can forward it to /api/setup.
    let setupToken = '';

    // Read the magic-link token from ?setup=<token>. The installer
    // at seo.benjaminb.xyz/install sets SETUP_TOKEN as a Pages env
    // var on the new project AND hands the operator a URL of the
    // form https://<their-site>/admin?setup=<token>. The server's
    // /api/setup matches the token against env.SETUP_TOKEN; only a
    // matching token allows the password to be set.
    function readSetupToken() {
      const params = new URLSearchParams(location.search);
      const t = params.get('setup') || '';
      return /^[0-9a-f]{20,128}$/.test(t) ? t : '';
    }

    // Read the GitHub-derived primary email the installer baked into
    // the magic link as `?email=<addr>`. Returns '' on missing or
    // malformed values so the form falls back to manual entry.
    function readPrefillEmail() {
      const e = new URLSearchParams(location.search).get('email') || '';
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : '';
    }

    // The terminal installer (install/run.{py,js,sh}) builds a magic
    // link of the form /admin#install=<base64({email, password,
    // site_name})>. We decode it here so the setup form can auto-fill
    // and auto-submit — the user lands straight in the dashboard
    // without retyping anything. Returns null on missing/malformed
    // payloads so the form falls back to manual entry.
    function readInstallHash() {
      const m = (location.hash || '').match(/[#&]install=([A-Za-z0-9_-]+)/);
      if (!m) return null;
      try {
        // urlsafe base64 with no padding (matches run.py's b64encode + rstrip('=')).
        let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const json = decodeURIComponent(escape(atob(b64)));
        const p = JSON.parse(json);
        if (!p || typeof p !== 'object') return null;
        const email = String(p.email || '').trim().toLowerCase();
        const password = String(p.password || '');
        const site_name = String(p.site_name || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
        if (password.length < 8) return null;
        return { email, password, site_name };
      } catch { return null; }
    }
    function clearInstallHash() {
      try {
        const url = new URL(location.href);
        url.hash = url.hash.replace(/[#&]?install=[A-Za-z0-9_-]+/, '');
        if (url.hash === '#') url.hash = '';
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch { /* */ }
    }

    function clearTokenFromUrl() {
      // Remove ?setup= AND ?email= so a refresh doesn't keep them
      // in the bar (and so the browser doesn't preserve them in
      // history). The email is the user's own, but there's no need
      // to leave it in the URL once the form has it.
      try {
        const url = new URL(location.href);
        url.searchParams.delete('setup');
        url.searchParams.delete('email');
        history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + (url.hash || ''));
      } catch { /* */ }
    }

    async function show() {
      $('#gate').hidden = true;
      $('#dash').hidden = true;
      $('#wiz').hidden = true;
      $('#setup').hidden = false;
      $('#setup-form-pane').hidden = false;
      $('#setup-success').hidden = true;

      // Capture the magic-link token (if present) and clear it from
      // the URL bar. We keep the value in setupToken for the POST.
      setupToken = readSetupToken();
      const prefillEmail = readPrefillEmail();
      clearTokenFromUrl();

      // Sensible defaults for the new operator.
      const siteUrlInput = $('#setup-site-url');
      if (siteUrlInput && !siteUrlInput.value) siteUrlInput.value = location.origin;
      // Prefill the email field with the GitHub primary email the
      // installer fetched. Saves the user a typing step; they can
      // overwrite it if they prefer a different admin address.
      const emailInput = $('#setup-email');
      if (emailInput && !emailInput.value && prefillEmail) emailInput.value = prefillEmail;
      // Try to populate site name from the SITE_NAME env var via
      // whoami — that's set by the installer at provision time.
      try {
        const w = await api('/api/admin/whoami');
        const name = w?.body?.site_name;
        if (name && !$('#setup-site-name').value) $('#setup-site-name').value = name;
      } catch { /* fine, leave blank for manual entry */ }

      setTimeout(() => {
        const target = (emailInput && emailInput.value) ? $('#setup-password') : $('#setup-email');
        if (target) target.focus();
      }, 50);

      // Terminal-installer magic link: if /admin#install=<base64({email,
      // password, site_name})> is present, fill the form and submit it
      // automatically so the user lands straight in the dashboard.
      const hashInstall = readInstallHash();
      if (hashInstall) {
        clearInstallHash();
        const errEl = $('#setup-err'); if (errEl) errEl.textContent = '';
        $('#setup-email').value = hashInstall.email;
        $('#setup-password').value = hashInstall.password;
        if (hashInstall.site_name) $('#setup-site-name').value = hashInstall.site_name;
        // Give the user a one-line status while we submit.
        if (errEl) {
          errEl.style.color = 'var(--ink-dim, #4b525e)';
          errEl.textContent = 'Đang hoàn tất cài đặt với thông tin từ terminal…';
        }
        // Tiny delay so the user can see what's happening before the
        // form replaces the screen with the dashboard.
        setTimeout(() => {
          const form = $('#setup-form');
          if (form) {
            if (typeof form.requestSubmit === 'function') form.requestSubmit();
            else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
        }, 250);
      }
    }

    function showSuccess() {
      $('#setup-form-pane').hidden = true;
      $('#setup-success').hidden = false;
    }

    async function submit(e) {
      e.preventDefault();
      const err = $('#setup-err'); err.textContent = '';
      const site_name = $('#setup-site-name').value.trim();
      const site_url  = $('#setup-site-url').value.trim();
      const email     = $('#setup-email').value.trim().toLowerCase();
      const password  = $('#setup-password').value;
      if (!site_name) { err.textContent = 'Tên trang web là bắt buộc.'; return; }
      if (!/^https?:\/\/.+/i.test(site_url)) { err.textContent = 'URL trang web phải bắt đầu bằng http(s)://'; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Vui lòng nhập địa chỉ email hợp lệ.'; return; }
      if (password.length < 8) { err.textContent = 'Mật khẩu phải có từ 8 ký tự trở lên.'; return; }

      const btn = $('#setup-go');
      btn.disabled = true; btn.textContent = 'Đang thiết lập…';

      // The magic-link token (if any) gates this POST server-side.
      // Browser-flow installs have one; CLI installs leave it empty
      // and the server's gate is then skipped (the user-empty-table
      // check still prevents anyone else from hijacking the install).
      const { status, body } = await api('/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          site_name, site_url, email, password,
          setup_token: setupToken,
        }),
      });
      if (status !== 200) {
        btn.disabled = false; btn.textContent = 'Hoàn tất thiết lập →';
        err.textContent = body?.detail || body?.error || 'Thiết lập thất bại.';
        return;
      }
      showSuccess();

      // Immediately log the operator in so the onboarding wizard can
      // take over without making them retype the password they just
      // chose.
      const loginR = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      btn.disabled = false; btn.textContent = 'Hoàn tất thiết lập →';
      if (loginR.status !== 200) {
        err.textContent = 'Tài khoản đã được tạo, nhưng đăng nhập tự động thất bại. Vui lòng đăng nhập thủ công.';
        $('#setup').hidden = true;
        const g = $('#gate'); g.hidden = false;
        return;
      }
      // Hide setup, reload so the SPA boots into the wizard.
      window.location.reload();
    }

    function bindOnce() {
      if (bindOnce.done) return;
      bindOnce.done = true;
      $('#setup-form').addEventListener('submit', submit);
    }

    bindOnce();
    return { show };
  })();

  // ── onboarding wizard ──────────────────────────────────────────
  // First-login guided setup. Walks new operators through:
  //   1. Welcome + paste your site URL
  //   2. Generate + review Brand DNA
  //   3. (Optional) paste cloud-provider API keys
  //   4. Auto-plan 28-day calendar, preview it, then mark complete
  // Reuses the existing /api/admin/brand-dna, /api/admin/secrets, and
  // /api/admin/calendar/plan endpoints — the wizard is just a flow,
  // not new server-side logic.
  const Wizard = (() => {
    let brand = {};

    // Each pane has a string id. The stepper shows four milestone
    // labels (1–4); beats are interstitials that don't move the
    // stepper. The map below tells the stepper which milestone the
    // current pane belongs to.
    //   pane '0'          → none yet (welcome)
    //   pane '1'          → milestone 1 (Hello/URL form)
    //   pane '2'          → milestone 2 (Brand DNA)
    //   pane 'beat-brand' → milestone 2 done
    //   pane '3'          → milestone 3 (Providers)
    //   pane '4'          → milestone 4 (Calendar)
    //   pane 'beat-done'  → milestone 4 done
    const PANE_TO_STEP = {
      '0': 0,
      '1': 1,
      '2': 2,
      'beat-brand': 2.5,
      '3': 3,
      '4': 4,
      'beat-done': 5,
    };

    function show(paneId) {
      const id = String(paneId);
      $$('.wiz-pane').forEach((el) => { el.hidden = el.dataset.pane !== id; });
      const step = PANE_TO_STEP[id] ?? 0;
      $$('.wiz-step').forEach((el) => {
        const k = parseInt(el.dataset.step, 10);
        el.classList.toggle('is-current', k === Math.floor(step) && step % 1 === 0 && step !== 0);
        el.classList.toggle('is-done', k < step);
      });
      // Scroll the wizard card into view in case the previous step left
      // the user scrolled mid-pane.
      $('#wiz').scrollTop = 0;
    }

    function open() {
      $('#wiz').hidden = false;
      show('0');
      // Pre-populate URL with the saved brand source_url if any.
      api('/api/admin/brand-dna').then(({ status, body }) => {
        if (status === 200 && body.brand?.source_url && !$('#wiz-url').value) {
          $('#wiz-url').value = body.brand.source_url;
        }
      }).catch(() => {});
    }

    function close() { $('#wiz').hidden = true; }

    async function maybeAutoOpen() {
      if (window.__psRole && window.__psRole !== 'super_admin') return;
      try {
        const { status, body } = await api('/api/admin/onboarding');
        if (status !== 200) return;
        if (!body.complete) open();
      } catch { /* offline / first-run db not ready */ }
    }

    // ── pane 0 → 1: just navigation, no work yet ──────────────────
    function welcomeNext() { show('1'); setTimeout(() => $('#wiz-url').focus(), 50); }

    // ── pane 1 → 2: generate brand DNA from URL ───────────────────
    async function step1Next() {
      const url = $('#wiz-url').value.trim();
      const err = $('#wiz-1-err');
      err.textContent = '';
      if (!/^https?:\/\/.+/i.test(url)) { err.textContent = 'Please enter a full URL starting with https://'; return; }
      const btn = $('#wiz-go-2');
      btn.disabled = true; btn.textContent = 'Đang đọc…';
      // Switch to pane 2 with loading state; populate fields once back.
      show('2');
      $('#wiz-brand-loading').hidden = false;
      $('#wiz-brand-fields').hidden = true;
      $('#wiz-loading-url').textContent = new URL(url).hostname;
      $('#wiz-go-3').disabled = true;
      const { status, body } = await api('/api/admin/brand-dna', {
        method: 'POST',
        body: JSON.stringify({
          url,
          service_area:     $('#wiz-service-area').value.trim(),
          topics_to_avoid:  $('#wiz-avoid').value.trim(),
        }),
      });
      btn.disabled = false; btn.textContent = 'Đọc trang web của tôi →';
      if (status !== 200 || !body?.brand) {
        $('#wiz-brand-loading').hidden = true;
        const msg = body?.detail || body?.error || 'Tạo thất bại.';
        $('#wiz-2-err').textContent = msg;
        show('1');
        err.textContent = msg;
        return;
      }
      brand = body.brand;
      brand.source_url = url;
      $('#wiz-b-business').value = brand.business_type || '';
      $('#wiz-b-voice').value    = brand.voice_tone || '';
      $('#wiz-b-audience').value = brand.target_audience || '';
      $('#wiz-b-themes').value   = brand.key_themes || '';
      $('#wiz-b-area').value     = brand.service_area || '';
      $('#wiz-b-avoid').value    = brand.topics_to_avoid || '';
      $('#wiz-brand-loading').hidden = true;
      $('#wiz-brand-fields').hidden = false;
      $('#wiz-go-3').disabled = false;
    }

    // ── pane 2 → beat-brand: save brand DNA ───────────────────────
    async function step2Next() {
      const errEl = $('#wiz-2-err'); errEl.textContent = '';
      const btn = $('#wiz-go-3'); btn.disabled = true; btn.textContent = 'Đang lưu…';
      const payload = {
        business_type:    $('#wiz-b-business').value.trim(),
        voice_tone:       $('#wiz-b-voice').value.trim(),
        target_audience:  $('#wiz-b-audience').value.trim(),
        key_themes:       $('#wiz-b-themes').value.trim(),
        service_area:     $('#wiz-b-area').value.trim(),
        topics_to_avoid:  $('#wiz-b-avoid').value.trim(),
        source_url:       brand.source_url || '',
        // The wizard fires its own /calendar/plan at step 4; tell the
        // server not to also auto-plan in the background, or we'd race.
        skip_auto_plan:   true,
      };
      const { status, body } = await api('/api/admin/brand-dna', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      btn.disabled = false; btn.textContent = 'Lưu & tiếp tục →';
      if (status !== 200) { errEl.textContent = body?.error || 'Lưu thất bại.'; return; }

      // Customise the beat's "your site" pill with the host.
      try { $('#wiz-beat-host').textContent = new URL(brand.source_url).hostname; }
      catch { /* leave the placeholder */ }

      show('beat-brand');
    }

    // ── beat-brand → 3: load providers, render the grid ───────────
    async function gotoProviders() {
      const secretsR = await api('/api/admin/secrets');
      const keys = secretsR.body?.keys || {};
      const configured = new Set(
        Object.entries(keys).filter(([, v]) => v && v !== 'unset').map(([k]) => k)
      );
      renderProviders(configured);
      show('3');
    }

    function renderProviders(configured) {
      const grid = $('#wiz-providers');
      grid.innerHTML = '';
      const opts = [
        { label: 'GuRouter (AI Gateway)', envKey: 'GUROUTER_API_KEY' },
        { label: 'OpenAI',           envKey: 'OPENAI_API_KEY' },
        { label: 'Anthropic Claude', envKey: 'ANTHROPIC_API_KEY' },
        { label: 'Google Gemini',    envKey: 'GEMINI_API_KEY' },
        { label: 'Groq',             envKey: 'GROQ_API_KEY' },
        { label: 'DeepSeek',         envKey: 'DEEPSEEK_API_KEY' },
        { label: 'Mistral',          envKey: 'MISTRAL_API_KEY' },
        { label: 'Together',         envKey: 'TOGETHER_API_KEY' },
        { label: 'Cerebras',         envKey: 'CEREBRAS_API_KEY' },
      ];
      // Workers AI banner always-on note.
      const banner = document.createElement('div');
      banner.className = 'wiz-prov is-set';
      banner.style.gridColumn = '1 / -1';
      banner.innerHTML = '<div class="wiz-prov-head"><b>Cloudflare Workers AI</b><span class="wiz-prov-pill">Tích hợp sẵn</span></div><div class="wiz-prov-hint">Llama 3.3 70B cho văn bản · Flux 1 schnell cho hình ảnh. Không cần API key — đã bao gồm trong gói miễn phí của Cloudflare.</div>';
      grid.appendChild(banner);

      for (const p of opts) {
        const isSet = configured.has(p.envKey);
        const card = document.createElement('div');
        card.className = 'wiz-prov' + (isSet ? ' is-set' : '');
        card.innerHTML = `
          <div class="wiz-prov-head">
            <b>${p.label}</b>
            <span class="wiz-prov-pill">${isSet ? 'Đã lưu' : 'Tùy chọn'}</span>
          </div>
          <input type="password" placeholder="${isSet ? '••••••••  (đã lưu)' : 'Dán API key'}" data-prov="${p.envKey}" autocomplete="off" />
        `;
        grid.appendChild(card);
      }
    }

    // ── pane 3 → 4: persist provider keys, kick off the planner ───
    async function step3Next() {
      const errEl = $('#wiz-3-err'); errEl.textContent = '';
      const inputs = $$('[data-prov]');
      const toSave = inputs
        .map((el) => ({ key: el.dataset.prov, val: el.value.trim() }))
        .filter((p) => p.val.length > 0);
      const btn = $('#wiz-go-4'); btn.disabled = true; btn.textContent = 'Đang lưu…';
      for (const p of toSave) {
        await api('/api/admin/secrets', {
          method: 'POST',
          body: JSON.stringify({ name: p.key, value: p.val }),
        }).catch(() => {});
      }
      btn.disabled = false; btn.textContent = 'Tiếp tục →';

      show('4');
      // Kick off the planner. We don't pass replace:true — if the
      // user re-runs the wizard later, we keep existing scheduled
      // slots and only top up gaps.
      $('#wiz-plan-loading').hidden = false;
      $('#wiz-plan-list').hidden = true;
      $('#wiz-go-done').disabled = true;
      const { status, body } = await api('/api/admin/calendar/plan', {
        method: 'POST',
        body: JSON.stringify({ days: 28, replace: false }),
      });
      $('#wiz-plan-loading').hidden = true;
      if (status !== 200) {
        $('#wiz-4-err').textContent = body?.detail || body?.error || 'Lên kế hoạch thất bại.';
        $('#wiz-go-done').disabled = false;
        return;
      }
      renderPlan(body.slots || []);
      $('#wiz-go-done').disabled = false;
    }

    function renderPlan(slots) {
      const list = $('#wiz-plan-list');
      list.innerHTML = '';
      if (!slots.length) {
        const li = document.createElement('li');
        li.innerHTML = '<span class="wiz-plan-title">Không cần thêm bài viết mới — lịch của bạn đã có sẵn nội dung sắp tới.</span>';
        list.appendChild(li);
      } else {
        const monthsShort = ['Thg 1','Thg 2','Thg 3','Thg 4','Thg 5','Thg 6','Thg 7','Thg 8','Thg 9','Thg 10','Thg 11','Thg 12'];
        for (const s of slots) {
          const li = document.createElement('li');
          const dt = new Date(s.scheduled_for + 'T00:00:00Z');
          const dateLabel = `${dt.getUTCDate()} ${monthsShort[dt.getUTCMonth()]}`;
          li.innerHTML = `<span class="wiz-plan-date">${dateLabel}</span><div class="wiz-plan-title">${escH(s.title)}${s.primary_keyword ? `<span class="wiz-plan-kw">→ ${escH(s.primary_keyword)}</span>` : ''}</div>`;
          list.appendChild(li);
        }
      }
      list.hidden = false;
    }

    function escH(s) {
      return String(s || '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]);
    }

    async function done() {
      await api('/api/admin/onboarding', { method: 'POST' }).catch(() => {});
      close();
      activateTab('calendar');
    }

    async function skip() {
      // Skipping still marks complete so we don't nag on every login.
      await api('/api/admin/onboarding', { method: 'POST' }).catch(() => {});
      close();
    }

    function bindOnce() {
      if (bindOnce.done) return;
      bindOnce.done = true;
      $('#wiz-start').addEventListener('click', welcomeNext);
      $('#wiz-go-2').addEventListener('click', step1Next);
      $('#wiz-go-3').addEventListener('click', step2Next);
      $('#wiz-go-4').addEventListener('click', step3Next);
      $('#wiz-go-done').addEventListener('click', () => show('beat-done'));
      $('#wiz-done').addEventListener('click', done);
      $('#wiz-skip').addEventListener('click', skip);

      // `data-wiz-back="<paneId>"` jumps to a previous pane without
      // re-running its work. `data-wiz-next="3"` advances from a beat
      // (no state to capture).
      $$('[data-wiz-back]').forEach((el) => {
        el.addEventListener('click', () => show(el.dataset.wizBack));
      });
      $$('[data-wiz-next]').forEach((el) => {
        const next = el.dataset.wizNext;
        if (next === '3') el.addEventListener('click', gotoProviders);
        else el.addEventListener('click', () => show(next));
      });

      // Enter on the URL field jumps forward.
      $('#wiz-url').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); step1Next(); }
      });
    }

    bindOnce();
    return { open, close, maybeAutoOpen };
  })();

  // ── updates ────────────────────────────────────────────────────
  // Shows the operator the upstream commits between what they
  // installed and the latest main. Browser installs get a one-click
  // "trigger rebuild" via the Cloudflare API; CLI installs see the
  // one-liner they need to re-run.
  const Updates = (() => {
    const PERMS = [
      { key: 'page',             type: 'edit' },
      { key: 'd1',               type: 'edit' },
      { key: 'workers_r2',       type: 'edit' },
      { key: 'ai',               type: 'edit' },
      { key: 'workers_scripts',  type: 'edit' },
      { key: 'account_settings', type: 'read' },
    ];
    const TOKEN_LINK = 'https://dash.cloudflare.com/?to=/:account/api-tokens' +
      '&permissionGroupKeys=' + encodeURIComponent(JSON.stringify(PERMS)) +
      '&name=' + encodeURIComponent('GU SEO update');

    let lastState = null;

    function esc(s) {
      return String(s || '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]);
    }
    function relativeDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      const dh = Math.round((Date.now() - d.getTime()) / 3600000);
      if (dh < 1) return 'vừa xong';
      if (dh < 24) return dh + ' giờ trước';
      const dd = Math.round(dh / 24);
      if (dd < 30) return dd + ' ngày trước';
      return d.toISOString().slice(0, 10);
    }

    function render(s) {
      lastState = s;
      const summary = $('#upd-summary');
      const changesCard = $('#upd-changes-card');
      const applyCard = $('#upd-apply-card');
      const cliCard = $('#upd-cli-card');
      const badge = $('#updates-badge');

      let pill, label, value;
      if (s.up_to_date) {
        pill = '<span class="upd-pill is-current">Đã cập nhật mới nhất</span>';
        label = 'Bạn đang chạy commit mới nhất trên nhánh chính upstream.';
        value = s.current ? esc(s.current.short) : 'không rõ';
        badge.hidden = true;
      } else if (!s.current) {
        pill = '<span class="upd-pill is-unknown">Không rõ</span>';
        label = 'Không xác định được commit cài đặt ban đầu. Hãy áp dụng bản cập nhật để tạo mốc chuẩn.';
        value = '—';
        badge.hidden = true;
      } else {
        pill = '<span class="upd-pill is-behind">Chậm hơn ' + s.ahead + ' commit</span>';
        label = 'Upstream đã có cập nhật mới. Hãy xem danh sách bên dưới và cập nhật khi bạn sẵn sàng.';
        value = esc(s.current.short);
        badge.hidden = false;
        badge.textContent = s.ahead;
      }
      summary.innerHTML = `
        <div class="upd-row"><span class="upd-label">Trạng thái</span>${pill}</div>
        <div class="upd-row"><span class="upd-label">Đã cài đặt</span><span class="upd-value">${value}</span></div>
        <div class="upd-row"><span class="upd-label">Mới nhất upstream</span><span class="upd-value">${esc(s.latest?.short || '—')}${s.latest?.date ? ' · ' + esc(relativeDate(s.latest.date)) : ''}</span></div>
        <div class="upd-row"><span class="upd-label">Phương thức cài đặt</span><span class="upd-value">${esc(s.install_method || 'không rõ')}</span></div>
        <div class="upd-row" style="margin-top:6px;color:var(--ink-dim);font-size:13px">${esc(label)}</div>
      `;

      if (s.commits && s.commits.length) {
        changesCard.hidden = false;
        $('#upd-changes-lede').textContent = `${s.commits.length} commit từ ${s.repo?.owner || 'Benjamin-Bloch'}/${s.repo?.name || 'pages-seo'} kể từ khi bạn cài đặt.`;
        const stats = $('#upd-diff-stats');
        if (s.files_changed) {
          stats.hidden = false;
          stats.innerHTML = `${s.files_changed} tệp · <span class="add">+${s.additions}</span> <span class="del">−${s.deletions}</span>`;
        } else {
          stats.hidden = true;
        }
        const list = $('#upd-commit-list');
        list.innerHTML = '';
        for (const c of s.commits) {
          const li = document.createElement('li');
          li.innerHTML = `
            <span class="upd-sha"><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.short)}</a></span>
            <span class="upd-msg">${esc(c.message)}</span>
            <span class="upd-author">${esc(c.author)} · ${esc(relativeDate(c.date))}</span>
          `;
          list.appendChild(li);
        }
      } else {
        changesCard.hidden = true;
      }

      // Show the right action card.
      if (s.can_apply) {
        applyCard.hidden = false;
        cliCard.hidden = true;
        const owner = s.repo?.owner || '';
        const repo  = s.repo?.name  || 'pages-seo';
        if (owner) {
          $('#upd-sync-link').href = `https://github.com/${owner}/${repo}`;
          $('#upd-sync-link').textContent = `${owner}/${repo}`;
        }
        $('#upd-token-link').href = TOKEN_LINK;
      } else if (s.install_method === 'cli') {
        applyCard.hidden = true;
        cliCard.hidden = false;
      } else {
        applyCard.hidden = true;
        cliCard.hidden = true;
      }
    }

    async function check() {
      const { status, body } = await api('/api/admin/update');
      if (status !== 200 || !body?.ok) {
        const detail = String(body?.detail || body?.error || status || 'unknown');
        const isTransient = /github_(unreachable|latest_failed|compare_failed)|HTTP (403|429|5\d\d)/.test(detail);
        const summary = $('#upd-summary');
        while (summary.firstChild) summary.removeChild(summary.firstChild);
        const div = document.createElement('div');
        div.className = isTransient ? 'status warn' : 'status bad';
        div.textContent = isTransient
          ? "GitHub chưa phản hồi — thường do giới hạn tần suất tạm thời. Hãy bấm kiểm tra lại sau 30 giây."
          : "Không thể kết nối tới endpoint cập nhật: " + detail;
        summary.appendChild(div);
        return;
      }
      render(body);
    }

    async function apply() {
      const token = $('#upd-token').value.trim();
      const status = $('#upd-apply-status');
      const btn = $('#upd-apply-go');
      if (!token) { status.className = 'status bad'; status.textContent = 'Yêu cầu token.'; return; }
      btn.disabled = true;
      status.className = 'status'; status.textContent = 'Đang kích hoạt tạo lại bản dựng…';
      const { status: code, body } = await api('/api/admin/update/apply', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      btn.disabled = false;
      if (code !== 200 || !body?.ok) {
        status.className = 'status bad';
        status.textContent = body?.detail || body?.error || ('HTTP ' + code);
        return;
      }
      status.className = 'status good';
      status.textContent = 'Đã kích hoạt tạo lại bản dựng. Cloudflare thường mất khoảng 1–3 phút để xuất bản.';
      $('#upd-token').value = '';
      // Re-check after a moment so the UI flips to "up to date".
      setTimeout(check, 3000);
    }

    function bindOnce() {
      if (bindOnce.done) return;
      bindOnce.done = true;
      $('#upd-apply-go').addEventListener('click', apply);
    }

    function init() {
      bindOnce();
      check();
    }

    // Light-weight check used by the boot path to populate the
    // header badge without rendering the full pane. We just hit the
    // GET endpoint and look at .ahead.
    async function quietCheck() {
      try {
        const { status, body } = await api('/api/admin/update');
        if (status !== 200 || !body?.ok) return;
        const badge = $('#updates-badge');
        if (!badge) return;
        if (body.ahead && body.ahead > 0) {
          badge.textContent = body.ahead;
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
      } catch { /* ignore */ }
    }

    return { init, quietCheck };
  })();

  // ── content calendar ───────────────────────────────────────────
  const Calendar = (() => {
    let current = startOfMonth(new Date());
    let slots = [];
    let loading = false;
    let editingId = null;

    function startOfMonth(d) {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      return x;
    }
    function addMonths(d, n) {
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
    }
    function isoOf(d) { return d.toISOString().slice(0, 10); }
    function todayIso() { return new Date().toISOString().slice(0, 10); }
    // Monday-first weekday index (0=Mon … 6=Sun).
    function dowMonFirst(d) { return (d.getUTCDay() + 6) % 7; }

    function fmtRange(monthStart) {
      // Show "Tháng 5 – Tháng 6 2026" if the visible grid spans across a month.
      const monthsShort = ['Thg 1','Thg 2','Thg 3','Thg 4','Thg 5','Thg 6','Thg 7','Thg 8','Thg 9','Thg 10','Thg 11','Thg 12'];
      const monthsLong  = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
      const start = gridStart(monthStart);
      const end = addDays(start, 41);
      const sm = start.getUTCMonth(), em = end.getUTCMonth();
      const sy = start.getUTCFullYear(), ey = end.getUTCFullYear();
      if (sy === ey && sm === em) return `${monthsLong[sm]} ${sy}`;
      const a = monthsShort[sm];
      const b = monthsShort[em];
      return sy === ey ? `${a} – ${b} ${sy}` : `${a} ${sy} – ${b} ${ey}`;
    }
    function addDays(d, n) {
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
    }
    function gridStart(monthStart) {
      // Start the grid on the Monday on/before the 1st of the month.
      return addDays(monthStart, -dowMonFirst(monthStart));
    }

    async function load() {
      if (loading) return;
      loading = true;
      const start = gridStart(current);
      const end   = addDays(start, 41);
      const { status, body } = await api(`/api/admin/calendar?from=${isoOf(start)}&to=${isoOf(end)}`);
      loading = false;
      if (status !== 200) {
        $('#cal-grid').innerHTML = '<div class="cal-empty">Không thể tải lịch bài viết.</div>';
        return;
      }
      slots = body.slots || [];
      render();
    }

    function slotsForDate(d) {
      const k = isoOf(d);
      return slots.filter((s) => s.scheduled_for === k);
    }

    function render() {
      $('#cal-range').textContent = fmtRange(current);
      const grid = $('#cal-grid');
      grid.innerHTML = '';
      const start = gridStart(current);
      const todayK = todayIso();

      for (let i = 0; i < 42; i++) {
        const day = addDays(start, i);
        const k = isoOf(day);
        const otherMonth = day.getUTCMonth() !== current.getUTCMonth();
        const isToday = k === todayK;

        const cell = document.createElement('div');
        cell.className = 'cal-cell' + (otherMonth ? ' cal-other-month' : '') + (isToday ? ' cal-today-cell' : '');

        const dayLabel = document.createElement('div');
        dayLabel.className = 'cal-day';
        const dayNum = document.createElement('span');
        const firstOfMonth = day.getUTCDate() === 1;
        const monthsShort = ['Thg 1','Thg 2','Thg 3','Thg 4','Thg 5','Thg 6','Thg 7','Thg 8','Thg 9','Thg 10','Thg 11','Thg 12'];
        dayNum.textContent = firstOfMonth ? `${monthsShort[day.getUTCMonth()]} ${day.getUTCDate()}` : day.getUTCDate();
        dayLabel.appendChild(dayNum);
        if (isToday) {
          const tag = document.createElement('span');
          tag.className = 'cal-day-tag';
          tag.textContent = 'Hôm nay';
          dayLabel.appendChild(tag);
        }
        cell.appendChild(dayLabel);

        const cellSlots = slotsForDate(day);
        for (const s of cellSlots) {
          if (s.status === 'published' && s.post?.hero_image_key) {
            const img = document.createElement('img');
            img.className = 'cal-thumb';
            img.src = '/image/' + s.post.hero_image_key;
            img.alt = s.title || '';
            img.loading = 'lazy';
            cell.appendChild(img);
          }
          const slot = document.createElement('button');
          slot.type = 'button';
          slot.className = 'cal-slot cal-slot-' + s.status;
          const icon = ({
            scheduled: '📅', generating: '⟳', draft: '📝', published: '✓', skipped: '—',
          })[s.status] || '•';
          const iconEl = document.createElement('span');
          iconEl.className = 'cal-slot-icon';
          iconEl.textContent = icon;
          const titleEl = document.createElement('span');
          titleEl.className = 'cal-slot-title';
          titleEl.textContent = s.title;
          slot.appendChild(iconEl);
          slot.appendChild(titleEl);
          slot.title = (s.angle || '') + (s.primary_keyword ? `\nTừ khóa: ${s.primary_keyword}` : '');
          slot.addEventListener('click', () => openModal(s));
          cell.appendChild(slot);
        }
        if (!cellSlots.length && !otherMonth) {
          const add = document.createElement('button');
          add.type = 'button';
          add.className = 'cal-add';
          add.textContent = '+';
          add.title = 'Thêm bài viết cho ngày này';
          add.addEventListener('click', () => openModal({ scheduled_for: k }));
          cell.appendChild(add);
        }

        grid.appendChild(cell);
      }
    }

    function openModal(slot) {
      editingId = slot.id || null;
      $('#cal-modal-title').textContent = editingId ? 'Sửa bài viết' : 'Bài viết mới';
      $('#cal-mod-title').value = slot.title || '';
      $('#cal-mod-date').value = slot.scheduled_for || todayIso();
      $('#cal-mod-keyword').value = slot.primary_keyword || '';
      $('#cal-mod-angle').value = slot.angle || '';
      const del = $('#cal-mod-delete');
      del.hidden = !editingId || slot.status === 'published';
      const gen = $('#cal-mod-generate');
      if (gen) {
        // Only a slot that the pipeline can still claim is runnable —
        // blog/start accepts 'scheduled' and 'draft' and nothing else.
        gen.hidden = !editingId || !['scheduled', 'draft'].includes(slot.status);
      }
      const save = $('#cal-mod-save');
      const isPub = slot.status === 'published';
      save.textContent = isPub ? 'OK' : 'Lưu';
      $('#cal-modal').hidden = false;
      setTimeout(() => $('#cal-mod-title').focus(), 30);
    }

    function closeModal() {
      $('#cal-modal').hidden = true;
      editingId = null;
    }

    async function save() {
      const title = $('#cal-mod-title').value.trim();
      const date  = $('#cal-mod-date').value.trim();
      const keyword = $('#cal-mod-keyword').value.trim();
      const angle = $('#cal-mod-angle').value.trim();
      if (!title) { $('#cal-mod-title').focus(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { $('#cal-mod-date').focus(); return; }

      const body = { title, scheduled_for: date, primary_keyword: keyword, angle };
      let res;
      if (editingId) {
        res = await api('/api/admin/calendar', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...body }),
        });
      } else {
        res = await api('/api/admin/calendar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      if (res.status !== 200) {
        toast(res.body?.detail || res.body?.error || 'Lưu thất bại', 'bad', { errorCode: res.body?.error });
        return;
      }
      closeModal();
      load();
    }

    async function del() {
      if (!editingId) return;
      if (!confirm('Xóa vị trí bài viết này?')) return;
      const res = await api('/api/admin/calendar?id=' + encodeURIComponent(editingId), { method: 'DELETE' });
      if (res.status !== 200) {
        toast(res.body?.detail || res.body?.error || 'Xóa thất bại', 'bad', { errorCode: res.body?.error });
        return;
      }
      closeModal();
      load();
    }

    async function regenerate() {
      const replace = confirm('Thay thế toàn bộ bài viết đã lên lịch tương lai bằng kế hoạch mới?\n\nOK = xóa và lên lịch lại.\nHủy = giữ nguyên và thêm vào phần còn trống.');
      const btn = $('#cal-plan');
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Đang lập kế hoạch…';
      const res = await api('/api/admin/calendar/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days: 28, replace }),
      });
      btn.disabled = false; btn.textContent = orig;
      if (res.status !== 200) {
        if (res.body?.error === 'no_brand_dna') {
          toast('Hãy lưu Brand DNA trước — trình lập kế hoạch cần thông tin này để chọn chủ đề.', 'warn', {
            action: { label: 'Mở Brand', onClick: () => activateTab('brand') },
          });
          activateTab('brand');
          return;
        }
        toast(res.body?.detail || res.body?.error || 'Lập kế hoạch thất bại', 'bad', { errorCode: res.body?.error });
        return;
      }
      load();
    }

    function shiftMonth(n) { current = addMonths(current, n); load(); }
    function gotoToday() { current = startOfMonth(new Date()); load(); }

    function bindModalOnce() {
      if (bindModalOnce.done) return;
      bindModalOnce.done = true;
      $('#cal-mod-save').addEventListener('click', save);
      $('#cal-mod-generate').addEventListener('click', () => {
        const slotId = editingId;
        if (!slotId) return;
        closeModal();
        activateTab('blog');
        runBlogChain({ calendarSlotId: slotId });
      });
      $('#cal-mod-delete').addEventListener('click', del);
      $('#cal-mod-cancel').addEventListener('click', closeModal);
      $('#cal-modal').addEventListener('click', (e) => { if (e.target.id === 'cal-modal') closeModal(); });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('#cal-modal').hidden) closeModal();
      });
    }

    function init() {
      bindModalOnce();
      load();
    }

    return { init, shiftMonth, gotoToday, regenerate, openModal, todayIso };
  })();

  // ── boot ────────────────────────────────────────────────────────
  // Bind the login form handler immediately, synchronously, before any
  // network call. That way even if whoamiStatus() is in flight when a
  // user hammers Enter on the password field, the submit is captured
  // and preventDefault'd. Earlier we attached it lazily inside
  // showGate() — which left a small window where a fast Enter press
  // would do a native form submission.
  bindLoginForm(); bindRegisterTabs(); checkRegisterHash();

  // When env.DB is missing, both whoami and setup return 503 — the
  // whole site is unreachable until the Cloudflare project's bindings
  // are re-asserted. The installer ships CF_API_TOKEN + CF_ACCOUNT_ID
  // + CF_PROJECT + SETUP_TOKEN as Pages secrets specifically so we
  // can self-repair. Try once at boot if bindings look missing.
  //
  // Returns true if a repair was attempted (success or fail), so the
  // caller can re-check whoami afterward.
  async function tryAutoRepair() {
    const url = new URL(window.location.href);
    const setupToken = url.searchParams.get('setup');
    if (!setupToken) return false; // no auth credential available
    try {
      const r = await fetch('/api/repair-bindings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ setup_token: setupToken }),
      });
      const body = await r.json().catch(() => ({}));
      if (body?.ok) {
        // Bindings landed. The deploy we triggered will take ~30–60s
        // to roll out; show a friendly waiting screen and poll whoami
        // until it stops returning a DB-missing 503.
        const err = document.getElementById('gate-err');
        if (err) err.textContent = 'Đang sửa kết nối cơ sở dữ liệu của trang web… việc này mất khoảng 1 phút.';
        for (let i = 0; i < 60; i++) {
          await new Promise((res) => setTimeout(res, 2000));
          // Poll /api/setup until it stops returning no_db_binding.
          try {
            const probe = await fetch('/api/setup', { credentials: 'same-origin' });
            if (probe.status !== 503) return true;
            const pb = await probe.json().catch(() => ({}));
            if (pb?.error !== 'no_db_binding') return true;
          } catch { /* keep polling */ }
        }
      }
    } catch { /* network / fetch failure — fall through to normal error UI */ }
    return false;
  }

  // Hits /api/setup; returns true iff the server reports no_db_binding.
  // We probe this directly (rather than infer from whoami's missing
  // list) because whoami's list is "SITE_NAME / SITE_URL / ADMIN_TOKEN"
  // when the DB is missing — those settings live in D1 and look absent
  // simply because the DB isn't reachable.
  async function isDbBindingMissing() {
    try {
      const r = await fetch('/api/setup', { credentials: 'same-origin' });
      if (r.status !== 503) return false;
      const body = await r.json().catch(() => ({}));
      return body?.error === 'no_db_binding';
    } catch { return false; }
  }

  (async () => {
    let r = await whoamiStatus();
    // DB binding missing → try self-repair before showing the dead-end
    // "missing secrets" message. Only the magic-link setup token can
    // authorise this at boot (no session exists yet).
    if (!r.ok && r.reason !== 'unauth') {
      if (await isDbBindingMissing()) {
        const repaired = await tryAutoRepair();
        if (repaired) r = await whoamiStatus();
      }
    }
    if (r.ok) { mount(); return; }
    if (r.reason === 'setup')  { Setup.show(); return; }
    if (r.reason === 'config') { showConfigError(r.missing); return; }
    showGate();
  })();
})();
