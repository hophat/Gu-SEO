// GET /api/admin/activation — onboarding progress for the active project.
//
// The wizard tells an operator what to do ONCE. After that they are on their
// own, and the most common failure mode for a content product is an account
// that was set up halfway and then quietly produces nothing. This endpoint
// turns the setup journey into a checklist with a completion state, so the
// dashboard can keep nudging until the project is actually producing.
//
// It also reports the activation metric that matters: how long it took from
// project creation to the first published post. That number is the single
// best predictor of whether a trial converts, and it is derived from data we
// already have — no separate analytics pipeline needed.
//
// Steps are ordered by dependency: brand DNA shapes the content, the schedule
// feeds the cron, the first post proves the chain works.

import { json } from '../../_lib/util.js';
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../_lib/auth.js';
import { loadSettings } from '../../_lib/settings.js';
import { listProviders } from '../../_lib/ai.js';

const SITE_ORIGIN = 'https://seo.gulagi.com';

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  if (!pid) return json(200, { ok: true, steps: [], complete: false });

  const now = Math.floor(Date.now() / 1000);
  const today = new Date().toISOString().slice(0, 10);

  const project = await env.DB.prepare(
    'SELECT id, slug, name, custom_domain, publishing_url, created_at FROM projects WHERE id = ? LIMIT 1'
  ).bind(pid).first().catch(() => null);

  const one = async (sql, args) => env.DB.prepare(sql).bind(...args).first().catch(() => null);

  const settings = await loadSettings(env).catch(() => ({}));
  const providers = await listProviders(env).catch(() => ({ text: [] }));

  // Brand DNA lives in project_brands (column `audience`, not `target_audience`)
  // with the legacy settings rows as a fallback for single-tenant installs.
  const brandRow = await one('SELECT business_type, audience FROM project_brands WHERE project_id = ?', [pid]);
  const hasBrandDna = !!(brandRow?.business_type || brandRow?.audience
    || settings.brand_business_type || settings.brand_target_audience);

  const slots = await one(
    `SELECT COUNT(*) AS n FROM content_calendar
      WHERE project_id = ? AND scheduled_for >= ? AND status IN ('scheduled','generating','draft')`,
    [pid, today]
  );
  const hasSchedule = (slots?.n || 0) > 0;

  const firstPost = await one(
    `SELECT published_at FROM blog_posts
      WHERE project_id = ? AND status = 'published'
      ORDER BY published_at ASC LIMIT 1`,
    [pid]
  );
  const postCount = await one(
    "SELECT COUNT(*) AS n FROM blog_posts WHERE project_id = ? AND status = 'published'",
    [pid]
  );
  const hasPost = !!firstPost?.published_at;

  const hasDomain = !!project?.custom_domain;

  const channel = await one(
    'SELECT publisher_type FROM project_publishing_configs WHERE project_id = ? LIMIT 1',
    [pid]
  );
  const hasChannel = !!channel?.publisher_type && channel.publisher_type !== 'internal_d1';
  const hasProviders = (providers.text || []).length > 0;

  const steps = [
    {
      key: 'brand_dna',
      title: 'Tạo Brand DNA',
      detail: 'AI đọc website của bạn để lấy giọng văn, khách hàng mục tiêu và chủ đề.',
      done: hasBrandDna,
      action: { label: 'Tạo Brand DNA', href: '#brand' },
    },
    {
      key: 'providers',
      title: 'Kiểm tra AI provider',
      detail: 'Workers AI đã bật sẵn. Thêm key riêng nếu muốn chất lượng cao hơn.',
      done: hasProviders,
      optional: true,
      action: { label: 'Mở Cài đặt', href: '#settings' },
    },
    {
      key: 'schedule',
      title: 'Lên lịch nội dung 28 ngày',
      detail: 'Cron dùng lịch này để biết mỗi ngày viết bài gì.',
      done: hasSchedule,
      action: { label: 'Lên lịch', href: '#calendar' },
    },
    {
      key: 'first_post',
      title: 'Xuất bản bài đầu tiên',
      detail: 'Bước này chứng minh toàn bộ chuỗi tạo nội dung chạy được.',
      done: hasPost,
      action: { label: 'Tạo bài ngay', href: '#blog' },
    },
    {
      key: 'domain',
      title: 'Gắn tên miền riêng',
      detail: 'Blog chạy trên domain của bạn thay vì đường dẫn mặc định.',
      done: hasDomain,
      optional: true,
      action: { label: 'Thiết lập tên miền', href: '#overview' },
    },
    {
      key: 'channel',
      title: 'Kết nối kênh mạng xã hội',
      detail: 'Tự động đăng bài mới lên Facebook Page của bạn.',
      done: hasChannel,
      optional: true,
      action: { label: 'Kết nối kênh', href: '#publishing' },
    },
  ];

  const required = steps.filter((s) => !s.optional);
  const doneRequired = required.filter((s) => s.done).length;

  // Activation metric: creation → first published post.
  let timeToFirstPostHours = null;
  if (firstPost?.published_at && project?.created_at) {
    timeToFirstPostHours = Math.round(((firstPost.published_at - project.created_at) / 3600) * 10) / 10;
  }

  return json(200, {
    ok: true,
    project_id: pid,
    project_slug: project?.slug || null,
    steps,
    required_total: required.length,
    required_done: doneRequired,
    complete: doneRequired === required.length,
    optional_done: steps.filter((s) => s.optional && s.done).length,
    metrics: {
      time_to_first_post_hours: timeToFirstPostHours,
      published_posts: postCount?.n || 0,
      scheduled_slots: slots?.n || 0,
      days_since_created: project?.created_at ? Math.floor((now - project.created_at) / 86400) : null,
    },
    blog_url: project?.custom_domain
      ? `https://${project.custom_domain}`
      : `${SITE_ORIGIN}/${project?.slug || ''}`.replace(/\/$/, ''),
  });
};
