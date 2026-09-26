// One source of truth for how a status reads on screen.
//
// Every queue in this app writes a different set of raw status strings to
// D1 — blog_jobs, video_jobs, social_posts, prog_keywords, content_calendar,
// projects, domains. Each page used to translate them on its own, with
// antd colour names scattered around ("gold", "purple", "processing").
//
// `statusMeta` returns a tone (one of the .ps-chip--* classes) plus a
// Vietnamese label. The tone drives the colour; the label is what actually
// communicates the state, so nothing here relies on colour alone.

export const TONE_GOOD = 'good';
export const TONE_WARN = 'warn';
export const TONE_BAD = 'bad';
export const TONE_INFO = 'info';
export const TONE_MUTED = 'muted';

const UNKNOWN = { tone: TONE_MUTED, text: '' };

// blog_jobs — the 4-step generation chain
const BLOG = {
  created:     { tone: TONE_MUTED, text: 'Chờ bắt đầu' },
  text_done:   { tone: TONE_INFO,  text: 'Đã có chữ' },
  image_done:  { tone: TONE_INFO,  text: 'Đã có ảnh' },
  published:   { tone: TONE_GOOD,  text: 'Đã đăng' },
  failed:      { tone: TONE_BAD,   text: 'Lỗi' },
};

// blog_posts — `review` means the quality score came back too low
const POST = {
  published: { tone: TONE_GOOD,  text: 'Đã đăng' },
  review:    { tone: TONE_WARN,  text: 'Cần duyệt' },
  hidden:    { tone: TONE_MUTED, text: 'Đã ẩn' },
};

// video_jobs — the agent claims, renders, then delivers
const VIDEO = {
  pending:   { tone: TONE_MUTED, text: 'Chờ render' },
  claimed:   { tone: TONE_INFO,  text: 'Đang render' },
  rendering: { tone: TONE_INFO,  text: 'Đang render' },
  done:      { tone: TONE_GOOD,  text: 'Đã có video' },
  failed:    { tone: TONE_BAD,   text: 'Lỗi render' },
};

// carousel slides read differently from a rendered MP4
const CAROUSEL = {
  pending:   { tone: TONE_MUTED, text: 'Chờ tạo slide' },
  claimed:   { tone: TONE_INFO,  text: 'Đang tạo slide' },
  rendering: { tone: TONE_INFO,  text: 'Đang tạo slide' },
  done:      { tone: TONE_GOOD,  text: 'Sẵn sàng đăng' },
  failed:    { tone: TONE_BAD,   text: 'Lỗi' },
};

// social_posts — a durable fan-out queue
const SOCIAL = {
  pending:    { tone: TONE_MUTED, text: 'Chờ đăng' },
  publishing: { tone: TONE_INFO,  text: 'Đang đăng' },
  published:  { tone: TONE_GOOD,  text: 'Đã đăng' },
  failed:     { tone: TONE_BAD,   text: 'Lỗi đăng' },
  skipped:    { tone: TONE_MUTED, text: 'Bỏ qua' },
};

// prog_keywords — the programmatic SEO queue
const PROG = {
  pending:    { tone: TONE_MUTED, text: 'Chờ tạo' },
  processing: { tone: TONE_INFO,  text: 'Đang tạo' },
  done:       { tone: TONE_GOOD,  text: 'Đã tạo' },
  failed:     { tone: TONE_BAD,   text: 'Lỗi' },
};

// content_calendar
const CALENDAR = {
  scheduled:  { tone: TONE_MUTED, text: 'Đã lên lịch' },
  generating: { tone: TONE_INFO,  text: 'Đang tạo' },
  draft:      { tone: TONE_INFO,  text: 'Bản nháp' },
  published:  { tone: TONE_GOOD,  text: 'Đã đăng' },
  skipped:    { tone: TONE_MUTED, text: 'Bỏ qua' },
};

// projects
const PROJECT = {
  active:   { tone: TONE_GOOD,  text: 'Hoạt động' },
  paused:   { tone: TONE_WARN,  text: 'Tạm dừng' },
  archived: { tone: TONE_MUTED, text: 'Lưu trữ' },
};

// custom domains waiting on a super-admin decision
const DOMAIN = {
  pending:  { tone: TONE_WARN,  text: 'Chờ duyệt' },
  live:     { tone: TONE_GOOD,  text: 'Đang chạy' },
  rejected: { tone: TONE_BAD,   text: 'Bị từ chối' },
};

// trend_topics
const TREND = {
  pending:   { tone: TONE_MUTED, text: 'Chờ duyệt' },
  scheduled: { tone: TONE_INFO,  text: 'Đã lên lịch' },
  published: { tone: TONE_GOOD,  text: 'Đã dùng' },
  archived:  { tone: TONE_MUTED, text: 'Lưu trữ' },
  failed:    { tone: TONE_BAD,   text: 'Lỗi' },
};

// refresh_jobs
const REFRESH = {
  created:   { tone: TONE_INFO,  text: 'Đang làm mới' },
  published: { tone: TONE_GOOD,  text: 'Đã làm mới' },
  failed:    { tone: TONE_BAD,   text: 'Lỗi' },
};

const TABLES = {
  blog: BLOG,
  post: POST,
  video: VIDEO,
  carousel: CAROUSEL,
  social: SOCIAL,
  prog: PROG,
  calendar: CALENDAR,
  project: PROJECT,
  domain: DOMAIN,
  trend: TREND,
  refresh: REFRESH,
};

/**
 * Resolve a raw DB status to a tone + Vietnamese label.
 *
 * @param {string} status  raw value from the API, e.g. 'published'
 * @param {string} [table] one of the TABLES keys; omit to auto-detect
 * @returns {{ tone: string, text: string }}
 */
export function statusMeta(status, table) {
  if (!status) return UNKNOWN;
  const name = String(status).trim().toLowerCase();
  if (table && TABLES[table]) {
    const hit = TABLES[table][name];
    if (hit) return hit;
  }
  // Auto-detect: `published`/`failed` mean the same thing everywhere, so a
  // shared vocabulary comes first and the per-table tables refine it.
  const COMMON = {
    published: POST.published,
    failed: { tone: TONE_BAD, text: 'Lỗi' },
    pending: { tone: TONE_MUTED, text: 'Chờ' },
  };
  if (COMMON[name]) return COMMON[name];
  for (const t of Object.values(TABLES)) {
    if (t[name]) return t[name];
  }
  // Nothing matched: show the raw value rather than hiding it. A status the
  // UI does not recognise is a fact the operator should see.
  return { tone: TONE_MUTED, text: String(status) };
}

/**
 * Map a 0–100 relevance/opportunity score to a chip tone.
 *
 * A score is a scale, not a state, so it borrows the tones without the
 * status vocabulary. Callers must still render the number — the tone is a
 * reading aid, never the message on its own.
 */
export function scoreTone(score) {
  const s = Number(score) || 0;
  if (s >= 80) return TONE_GOOD;
  if (s >= 60) return TONE_WARN;
  return TONE_BAD;
}

export default TABLES;
