// Platform mirror of the agent's template catalog (video-agent/templates.mjs).
//
// The agent owns RENDERING; the platform owns the CHOICES. The admin wizard
// offers these templates, stores the picked id on the video_jobs row, and
// the claim hands it to the agent — which reads the same catalog on its
// side. The two files must carry the same ids: scripts/run-platform-tests.js
// regex-syncs this list against video-agent/templates.mjs, so a drift fails
// the suite instead of silently shipping a template the agent cannot render.
//
//   sources        — which create.js source types the template accepts
//                    ('post' | 'url' | 'business'); 'auto' accepts all.
//   needsPresenter — the template draws a talking head, so it stays
//                    disabled until the project uploads presenter_image_url.
//   defaultDuration— seconds; NULL (auto) lets the engine decide.
//   intent         — display hint only; the API does not consume it.

export const VIDEO_TEMPLATES = [
  {
    id: 'auto',
    label: 'Tự động',
    desc: 'Engine tự chọn cách kể theo nội dung',
    intent: null,
    sources: ['post', 'url', 'business'],
    needsPresenter: false,
    defaultDuration: null,
  },
  {
    id: 'news_anchor',
    label: 'Thời sự',
    desc: 'Bản tin có người dẫn, chữ chạy dưới màn hình',
    intent: 'news',
    sources: ['post'],
    needsPresenter: true,
    defaultDuration: 30,
  },
  {
    id: 'story',
    label: 'Kể chuyện',
    desc: 'Vấn đề → chuyển biến → kết quả',
    intent: 'storytelling',
    sources: ['post', 'url', 'business'],
    needsPresenter: false,
    defaultDuration: 25,
  },
  {
    id: 'summary',
    label: 'Tóm tắt',
    desc: '3 ý chính của bài viết, nhanh gọn',
    intent: 'summary',
    sources: ['post'],
    needsPresenter: false,
    defaultDuration: 20,
  },
  {
    id: 'product',
    label: 'Giới thiệu sản phẩm',
    desc: 'Cho xem sản phẩm/website thật',
    intent: 'product',
    sources: ['url', 'business', 'post'],
    needsPresenter: false,
    defaultDuration: 20,
  },
  {
    id: 'local',
    label: 'Doanh nghiệp địa phương',
    desc: 'Quán/cửa hàng: ảnh, bản đồ, đánh giá',
    intent: 'local_business',
    sources: ['business', 'post'],
    needsPresenter: false,
    defaultDuration: 20,
  },
  {
    id: 'explainer',
    label: 'Minh hoạ nội dung',
    desc: 'Biểu đồ, sơ đồ, số liệu từ bài viết',
    intent: 'educational',
    sources: ['post'],
    needsPresenter: false,
    defaultDuration: 30,
  },
  {
    id: 'listicle',
    label: 'Danh sách',
    desc: 'N điều/bước/mẹo đếm được',
    intent: 'listicle',
    sources: ['post'],
    needsPresenter: false,
    defaultDuration: 25,
  },
  {
    id: 'launch',
    label: 'Ra mắt',
    desc: 'Công bố cái mới, có demo',
    intent: 'announcement',
    sources: ['post', 'url', 'business'],
    needsPresenter: false,
    defaultDuration: 20,
  },
  {
    id: 'review',
    label: 'Khách hàng nói',
    desc: 'Trích lời khách hàng + sao',
    intent: 'testimonial',
    sources: ['post', 'business'],
    needsPresenter: false,
    defaultDuration: 20,
  },
  {
    id: 'before_after',
    label: 'Trước / Sau',
    desc: 'Hai ảnh thật cạnh nhau',
    intent: 'before_after',
    sources: ['post', 'url', 'business'],
    needsPresenter: false,
    defaultDuration: 20,
  },
  {
    id: 'qa',
    label: 'Hỏi – Đáp',
    desc: 'Câu hỏi rồi trả lời bằng hình',
    intent: 'qa',
    sources: ['post'],
    needsPresenter: false,
    defaultDuration: 25,
  },
];

export function videoTemplateById(id) {
  return VIDEO_TEMPLATES.find((t) => t.id === id) || null;
}

// Request-body parsing shared by every job-creating endpoint. 'auto' and
// an absent value both store NULL — the catalog keeps 'auto' as a display
// row, but a NULL column is what tells the agent's engine to pick.
export function parseTemplateParam(value) {
  if (value === undefined || value === null || value === '' || value === 'auto') {
    return { ok: true, template: null };
  }
  const t = videoTemplateById(String(value));
  return t ? { ok: true, template: t.id, def: t } : { ok: false };
}

// 15–90s covers legacy short templates and the 60s comprehensive default.
// Values outside the band are clamped rather than rejected.
export function clampVideoDuration(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(90, Math.max(15, n));
}
