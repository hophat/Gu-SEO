// GET /api/admin/attention — one list of everything that needs a human.
//
// Why this exists: failures were scattered across blog jobs, the programmatic
// queue, the social queue, provider config, domain setup and cron staleness.
// An operator had to remember to check five pages, so in practice nobody did —
// a Facebook post could sit failed for a week. This aggregates them into one
// ranked list where every item carries the action that clears it.
//
// Each item:
//   { id, severity, title, detail, count, action: { label, href } }
//
// severity: 'critical' blocks output, 'warning' degrades it, 'info' is
// optional polish. The UI sorts critical first and shows a badge count.
//
// Project-scoped: an operator only sees their own project's problems.

import { json } from '../../_lib/util.js';
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../_lib/auth.js';
import { loadSettings } from '../../_lib/settings.js';
import { listProviders } from '../../_lib/ai.js';
import { checkBudget } from '../../_lib/usage.js';

const CRON_STALE_HOURS = 36;
const STUCK_JOB_HOURS = 1;
const BUDGET_WARN_PCT = 80;

function item(id, severity, title, detail, action, count = null) {
  return { id, severity, title, detail, count, action };
}

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;

  const now = Math.floor(Date.now() / 1000);
  const items = [];
  const scope = (col = 'project_id') => (pid ? `${col} = ?` : '1=1');
  const binds = (extra = []) => (pid ? [pid, ...extra] : extra);

  const countOf = async (sql, args) => {
    const r = await env.DB.prepare(sql).bind(...args).first().catch(() => null);
    return r?.n ?? 0;
  };

  // ── 1. social channel needs reconnecting ─────────────────────────
  const reconnect = await countOf(
    `SELECT COUNT(*) AS n FROM social_posts WHERE ${scope()} AND needs_reconnect = 1`,
    binds()
  );
  if (reconnect) {
    items.push(item(
      'social_reconnect', 'critical',
      'Kênh mạng xã hội cần kết nối lại',
      `${reconnect} bài không đăng được vì token hoặc quyền đã hết hiệu lực. Kết nối lại rồi bấm "Đăng lại".`,
      { label: 'Mở Kênh xuất bản', href: '#publishing' }, reconnect
    ));
  }

  // ── 2. social jobs failed for other reasons ──────────────────────
  const socialFailed = await countOf(
    `SELECT COUNT(*) AS n FROM social_posts
      WHERE ${scope()} AND status = 'failed' AND needs_reconnect = 0`,
    binds()
  );
  if (socialFailed) {
    items.push(item(
      'social_failed', 'warning',
      'Bài đăng mạng xã hội thất bại',
      `${socialFailed} bài đang chờ thử lại tự động. Nếu lỗi lặp lại, xem chi tiết và đăng lại thủ công.`,
      { label: 'Xem bài đăng', href: '#social' }, socialFailed
    ));
  }

  // ── 3. blog jobs stuck mid-chain ─────────────────────────────────
  const stuck = await countOf(
    `SELECT COUNT(*) AS n FROM blog_jobs
      WHERE ${scope()} AND status NOT IN ('published','failed') AND updated_at < ?`,
    binds([now - STUCK_JOB_HOURS * 3600])
  );
  if (stuck) {
    items.push(item(
      'blog_stuck', 'critical',
      'Bài viết bị kẹt giữa chuỗi',
      `${stuck} job không hoàn tất sau ${STUCK_JOB_HOURS} giờ. Cron sẽ tự dọn và chạy lại, nhưng nên kiểm tra provider.`,
      { label: 'Mở Blog', href: '#blog' }, stuck
    ));
  }

  // ── 4. blog jobs failed ──────────────────────────────────────────
  const blogFailed = await countOf(
    `SELECT COUNT(*) AS n FROM blog_jobs
      WHERE ${scope()} AND status = 'failed' AND created_at > ?`,
    binds([now - 7 * 86400])
  );
  if (blogFailed) {
    items.push(item(
      'blog_failed', 'warning',
      'Bài viết tạo thất bại',
      `${blogFailed} job thất bại trong 7 ngày qua. Xem lỗi cụ thể ở bảng "Bản nháp & thất bại".`,
      { label: 'Mở Blog', href: '#blog' }, blogFailed
    ));
  }

  // ── 5. programmatic pages failed ─────────────────────────────────
  const progFailed = await countOf(
    `SELECT COUNT(*) AS n FROM prog_keywords WHERE ${scope()} AND status = 'failed'`,
    binds()
  );
  if (progFailed) {
    items.push(item(
      'prog_failed', 'warning',
      'Trang Programmatic SEO thất bại',
      `${progFailed} từ khóa không tạo được trang. Xem lỗi rồi bấm thử lại.`,
      { label: 'Mở Programmatic SEO', href: '#prog' }, progFailed
    ));
  }

  // ── 6. AI budget ─────────────────────────────────────────────────
  const budget = await checkBudget(env, 'admin').catch(() => null);
  if (budget?.budget > 0) {
    if (budget.spend >= budget.budget) {
      items.push(item(
        'budget_exceeded', 'critical',
        'Đã chạm ngân sách AI tháng này',
        `Chi ${budget.spend.toFixed(2)}$ / ${budget.budget}$. Cron đã dừng tạo nội dung cho tới khi tăng ngân sách hoặc sang tháng mới.`,
        { label: 'Mở Cài đặt', href: '#settings' }
      ));
    } else if (budget.pct >= BUDGET_WARN_PCT) {
      items.push(item(
        'budget_warning', 'warning',
        'Ngân sách AI sắp hết',
        `Đã dùng ${budget.pct}% (${budget.spend.toFixed(2)}$ / ${budget.budget}$).`,
        { label: 'Mở Cài đặt', href: '#settings' }
      ));
    }
  }

  // ── 7. no text provider configured ───────────────────────────────
  const providers = await listProviders(env).catch(() => ({ text: [] }));
  if (!(providers.text || []).length) {
    items.push(item(
      'no_provider', 'critical',
      'Chưa có AI provider nào hoạt động',
      'Không có provider nào sẵn sàng nên cron không thể tạo bài. Thêm API key hoặc bật Workers AI.',
      { label: 'Mở Cài đặt', href: '#settings' }
    ));
  }

  // ── 8. cron looks dead ───────────────────────────────────────────
  const last = await env.DB.prepare(
    `SELECT MAX(published_at) AS last FROM blog_posts
      WHERE status = 'published' AND ${scope()}`
  ).bind(...binds()).first().catch(() => null);
  const lastAt = last?.last || null;
  if (lastAt) {
    const ageH = Math.round((now - lastAt) / 3600);
    if (ageH > CRON_STALE_HOURS) {
      items.push(item(
        'cron_stale', 'critical',
        'Cron có vẻ đã dừng',
        `Bài mới nhất cách đây ${ageH} giờ. Kiểm tra cron worker và lịch nội dung.`,
        { label: 'Mở Lịch nội dung', href: '#calendar' }
      ));
    }
  }

  // ── 9. content pipeline gaps (info) ──────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = await countOf(
    `SELECT COUNT(*) AS n FROM content_calendar
      WHERE ${scope()} AND scheduled_for >= ? AND status IN ('scheduled','generating','draft')`,
    binds([today])
  );
  if (!upcoming) {
    items.push(item(
      'no_schedule', 'info',
      'Lịch nội dung đang trống',
      'Không còn slot nào trong tương lai. Lên lịch để cron tiếp tục tạo bài.',
      { label: 'Lên lịch', href: '#calendar' }
    ));
  }

  const s = await loadSettings(env).catch(() => ({}));
  // project_brands is the per-project source; the settings rows are the
  // legacy single-tenant fallback. Column is `audience`.
  const brandRow = pid
    ? await env.DB.prepare('SELECT business_type, audience FROM project_brands WHERE project_id = ? LIMIT 1')
        .bind(pid).first().catch(() => null)
    : null;
  if (!(brandRow?.business_type || brandRow?.audience
    || s.brand_business_type || s.brand_target_audience)) {
    items.push(item(
      'no_brand_dna', 'warning',
      'Chưa có Brand DNA',
      'Không có Brand DNA thì nội dung sẽ chung chung, không đúng giọng thương hiệu.',
      { label: 'Tạo Brand DNA', href: '#brand' }
    ));
  }

  // ── 10. custom domain (info) ─────────────────────────────────────
  if (pid) {
    const proj = await env.DB.prepare(
      'SELECT custom_domain FROM projects WHERE id = ? LIMIT 1'
    ).bind(pid).first().catch(() => null);
    if (proj && !proj.custom_domain) {
      items.push(item(
        'no_domain', 'info',
        'Chưa thiết lập tên miền riêng',
        'Blog đang chạy trên đường dẫn mặc định. Gắn tên miền riêng để thương hiệu chuyên nghiệp hơn.',
        { label: 'Thiết lập tên miền', href: '#overview' }
      ));
    }
  }

  // ── 11. no external channel (info) ───────────────────────────────
  const channel = await env.DB.prepare(
    'SELECT publisher_type FROM project_publishing_configs WHERE project_id = ? LIMIT 1'
  ).bind(pid).first().catch(() => null);
  if (!channel?.publisher_type || channel.publisher_type === 'internal_d1') {
    items.push(item(
      'no_channel', 'info',
      'Chưa kết nối kênh mạng xã hội',
      'Bài viết chỉ đăng lên blog. Kết nối Facebook Page để mỗi bài mới tự động được chia sẻ.',
      { label: 'Kết nối kênh', href: '#publishing' }
    ));
  }

  const rank = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const counts = items.reduce((acc, i) => {
    acc[i.severity] = (acc[i.severity] || 0) + 1;
    return acc;
  }, { critical: 0, warning: 0, info: 0 });

  return json(200, {
    ok: true,
    project_id: pid,
    generated_at: now,
    counts,
    total: items.length,
    items,
  });
};
