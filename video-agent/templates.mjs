// Template catalog — the story shapes a user can pick for a video.
//
// This is the single source of truth: the platform mirrors this list in the
// job payload (`job.template`), and the agent turns it into a forced intent.
// 'auto' is the default and means the engine picks the intent from content
// signals exactly as before. A chosen template pins the intent, and the
// intent pins the beat template (storyboard.mjs) — so a template is a
// promise about the video's shape, not a hint the model may override.
//
// `sources` says which job kinds the template makes sense for, `needsPresenter`
// marks the one template that wants job.project.presenter_image_url, and
// `defaultDuration` is the target a picked template brings when the job
// itself does not say how long the video should be.
export const TEMPLATES = [
  { id: 'auto', label: 'Tự động', desc: 'Engine tự chọn cách kể theo nội dung', intent: null, sources: ['post', 'url', 'business'], needsPresenter: false, defaultDuration: null },
  { id: 'news_anchor', label: 'Thời sự', desc: 'Bản tin có người dẫn, chữ chạy dưới màn hình', intent: 'news', sources: ['post'], needsPresenter: true, defaultDuration: 30 },
  { id: 'story', label: 'Kể chuyện', desc: 'Vấn đề → chuyển biến → kết quả', intent: 'storytelling', sources: ['post', 'url', 'business'], needsPresenter: false, defaultDuration: 25 },
  { id: 'summary', label: 'Tóm tắt', desc: '3 ý chính của bài viết, nhanh gọn', intent: 'summary', sources: ['post'], needsPresenter: false, defaultDuration: 20 },
  { id: 'product', label: 'Giới thiệu sản phẩm', desc: 'Cho xem sản phẩm/website thật', intent: 'product', sources: ['url', 'business', 'post'], needsPresenter: false, defaultDuration: 20 },
  { id: 'local', label: 'Doanh nghiệp địa phương', desc: 'Quán/cửa hàng: ảnh, bản đồ, đánh giá', intent: 'local_business', sources: ['business', 'post'], needsPresenter: false, defaultDuration: 20 },
  { id: 'explainer', label: 'Minh hoạ nội dung', desc: 'Biểu đồ, sơ đồ, số liệu từ bài viết', intent: 'educational', sources: ['post'], needsPresenter: false, defaultDuration: 30 },
  { id: 'listicle', label: 'Danh sách', desc: 'N điều/bước/mẹo đếm được', intent: 'listicle', sources: ['post'], needsPresenter: false, defaultDuration: 25 },
  { id: 'launch', label: 'Ra mắt', desc: 'Công bố cái mới, có demo', intent: 'announcement', sources: ['post', 'url', 'business'], needsPresenter: false, defaultDuration: 20 },
  { id: 'review', label: 'Khách hàng nói', desc: 'Trích lời khách hàng + sao', intent: 'testimonial', sources: ['post', 'business'], needsPresenter: false, defaultDuration: 20 },
  { id: 'before_after', label: 'Trước / Sau', desc: 'Hai ảnh thật cạnh nhau', intent: 'before_after', sources: ['post', 'url', 'business'], needsPresenter: false, defaultDuration: 20 },
  { id: 'qa', label: 'Hỏi – Đáp', desc: 'Câu hỏi rồi trả lời bằng hình', intent: 'qa', sources: ['post'], needsPresenter: false, defaultDuration: 25 },
];

export function templateById(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

// The intent a template forces, or null when the engine should still decide
// (auto/absent/unknown template — the caller falls back to intentFromSignals).
// 'product' forks on whether there is a live URL to show: a demo when there
// is, a promo when there is not.
export function intentForTemplate(tpl, job = {}) {
  if (!tpl || tpl.id === 'auto') return null;
  if (tpl.id === 'product') return job.source_url ? 'product_demo' : 'product_promotion';
  return tpl.intent;
}
