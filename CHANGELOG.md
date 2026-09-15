# Changelog

All notable changes to **pages-seo**. When you upgrade your install
via the Updates tab in the admin, the commit list shows the raw git
log — this file is the friendlier "what's new for me as an operator"
version.

The format is loosely Keep-a-Changelog, dates in ISO order.

## 1.10.0 — 2026-09-15

Reliability release. No new headline features; this makes the existing
ones survive contact with production.

### Added
- **Schema migration runner (`schema/migrations/` + `schema_migrations`).**
  `schema/init.sql` was being piped straight into D1 as the update path, but
  it contains `ALTER TABLE … ADD COLUMN`, which SQLite rejects with
  `duplicate column name` on any database that already has the column. Updating
  an existing install therefore failed. Now:
  - `init.sql` stays the canonical schema for a *fresh* database and is applied
    as an idempotent baseline.
  - Incremental DDL lives in `schema/migrations/NNN_*.sql`, applied in order and
    recorded so a re-run is a no-op.
  - A database created before the runner existed converges on first run instead
    of erroring — `social_posts` is the first migration.
  - Three ways to run it, all the same code path: `/api/setup` on install,
    `npm run migrate` against a deployed site, `POST /api/admin/migrate`
    (super_admin) during an incident.
  - `npm run migrate -- --dry-run` lists pending migrations without touching
    anything.
- **Facebook Page publishing** (`functions/_lib/publishing/facebook.js`).
  Official Graph API, no App Review needed for pages you administer:
  - One-click connect via Facebook Login for Business
    (`/api/admin/projects/fb-connect` → `fb-callback`). The operator approves
    once; the server exchanges code → long-lived user token → `/me/accounts`
    and stores the chosen Page token. **A Page token minted from a long-lived
    user token has no expiry**, which is what makes the daily cron durable.
  - Multi-Page accounts get a picker; a single-Page account is connected
    automatically.
  - Link posts (Facebook unfurls the article's OG tags) or large photo posts.
  - Graph errors are translated into operator actions — a 190 says "create a
    new Page Access Token", not "Session has expired".
  - Page tokens are AES-GCM encrypted in the vault, per project. They never
    reach the browser and are never written to `project_publishing_configs`.
- **Social publishing queue** (`social_posts` + `social_queue.js`).
  External posting used to be fire-and-forget inside `waitUntil()`: a dropped
  connection or a Facebook 5xx lost the post with nothing but an audit line.
  Now publishing enqueues a durable job that the cron drains with retry:
  - At most one row per `(blog_post, channel)` — a retried publish cannot
    double-post.
  - Atomic conditional claim, so overlapping drains send once.
  - Exponential backoff (1m → 2m → 4m → 8m, capped at 1h, 5 attempts).
  - Credential failures stop retrying immediately and raise `needs_reconnect`
    instead of burning the attempt budget.
- **"Bài đăng mạng xã hội" page** under Phân phối, plus a dashboard section
  showing recent Facebook posts. List and gallery views, per-status filters,
  manual retry and cancel.
- **"Kênh xuất bản" page** so a `project_admin` can connect their own project's
  Page. Settings keeps the platform-wide Meta app credentials (super_admin
  only) — previously any admin could overwrite them, which would have pointed
  the whole deployment at an attacker's app.
- **`Graph API version` setting.** Meta retires versions on a ~2-year clock;
  the version was hardcoded, so a deprecation meant a redeploy to fix.
- **Platform tests** (`npm run test:platform`, 36 checks) running the real SQL
  against `node:sqlite` instead of a hand-written matcher: migration
  idempotency, queue claim/backoff/exhaustion/cross-project isolation, OAuth
  state signing, embed settings whitelisting, and cron schedule routing.

### Changed
- **Cron collapsed to a single `*/15 * * * *` trigger.** The three separate
  schedules meant the social retry queue was drained once a day, so its backoff
  ladder was decorative — nothing looked at `next_attempt_at` until the next
  morning. Now every tick drains the queue and the worker decides from the
  invocation's UTC hour what else to run (01:00 blog, 09:00 programmatic SEO,
  Mon 07:00 refresh). Also frees two slots of the account-wide trigger cap.
  Hours are overridable with `BLOG_HOUR` / `PROG_HOUR` / `REFRESH_HOUR`.
- **Cron worker failures are no longer silent.** A rejected `waitUntil` is
  invisible in the dashboard; the worker now logs a one-line summary (processed
  / failed / per-project errors) so `wrangler tail` shows what happened. A
  single dropped connection no longer aborts the whole fan-out.
- **Widget CSS targets `.ps-blog` instead of `#ps-blog`.** Each embed now gets
  its own container id (previously every embed on a page shared `#ps-blog`, so
  two widgets fought over one node). The id-based rules would have silently
  stopped applying.
- **`RSS` reserved alias pointed at `/rss.xml`, which does not exist.** It now
  points at `/feed.xml`, and `/rss.xml` 301s there for feed readers that expect
  it.

### Fixed
- **Admin bundle was cached for 4 hours** (`/admin-dist/main.js` had no
  `_headers` rule, so Cloudflare rewrote it to `max-age=14400`). Fixes silently
  served a stale build — stale role menus, stale project links. Now `no-store`,
  same treatment as the legacy `/admin.js`.
- **`/admin.html` did not load the admin stylesheet**, so the vanilla cover
  editor rendered without the CSS variables it reads.
- **IndexNow reported "0 URL" after a successful ping.** The admin page read
  `body.pinged`, which the API never returned; the real count is `url_count`.
  Errors now explain the cause (empty sitemap, unreadable sitemap, missing key)
  instead of showing a bare code.
- **"Kiểm tra kết nối" reported "Thiếu Page ID"** on a connected project: the
  test action did not fall back to the saved config.
- **Cover editor was missing entirely** from the React admin. It is back,
  mounted from the same `/cover-editor.js`, with a live preview.
- **`src/admin/` was gitignored**, so a fresh clone could not build the admin
  panel. Source is tracked again; only `public/admin-dist/` (build output) is
  ignored.

### Notes for operators
- After upgrading, run `npm run migrate` (or it runs automatically on the next
  `/api/setup`). It is idempotent.
- The cron Worker must be redeployed for the new schedule to take effect:
  `npm run cron:deploy`.
- Existing Facebook connections keep working; the token format is unchanged.

## 1.9.10 — 2026-09-14

### Fixed
- **Cron hàng ngày chỉ xử lý được ~2 dự án rồi chết ngầm:**
  - `POST /api/admin/cron/tick` trước đây chạy tuần tự toàn bộ chuỗi start→text→image→publish của mọi dự án trong MỘT request HTTP. Mỗi chuỗi mất ~55s trong khi edge của Cloudflare cắt kết nối sau ~100-120s không có byte phản hồi → tick bị giết sau ~2 dự án, các dự án còn lại (kể cả dự án đã có slot lịch đến hạn) không bao giờ được chạm tới.
  - Cron Worker (`gulagi-cron-worker`) giờ tự fan-out: gọi tick `dry_run` để lấy danh sách dự án, rồi gọi tick MỘT LẦN CHO MỖI dự án (`project_id`), chạy song song theo lô 4 — mỗi call ≤ ~90s, nằm gọn trong ngân sách 15 phút của scheduled handler.
  - `tick` nhận thêm `body.project_id` (id hoặc slug) và trả `partial:true` + ngừng khởi chạy chuỗi mới khi gần chạm trần thời gian, thay vì chết không dấu vết ở chế độ all-projects.
  - `/run/*` của cron Worker hỗ trợ `?project=<slug|id>` để chạy tay một dự án; nếu Pages chưa kịp deploy bản có `project_id`, Worker phát hiện qua `projects_processed > 1` và dừng fan-out (không bắn N call trùng lặp).
  - `blog/start` claim slot bằng `UPDATE … WHERE status IN ('scheduled','draft')` nguyên tử — hai call song song không thể cùng chiếm một slot dùng chung (`project_id IS NULL`), tránh đăng trùng bài.

## 1.9.1 — 2026-09-13

### Changed
- **Admin chuyển sang layout Ant Design Admin nhưng dùng hệ màu X.com (bỏ SaaS blue):**
  - **Bỏ màu xanh SaaS:** accent trở về đơn sắc — trắng `#ffffff` (dark mode) và gần-đen `#0f1419` (light mode). Kiểm tra computed style: **0 phần tử còn ánh xanh**.
  - **Giảm mạnh bo cong:** thang radius hạ còn `2–4px` (card, button, input đều 4px). Chỉ còn 3 chỗ bo tròn hợp lý: logo tròn, chấm status, thanh progress bar.
  - **Phẳng hoá bề mặt:** bỏ toàn bộ `box-shadow` trên card/nút; phân tầng bằng viền hairline 1px theo đúng cách X.com làm.
  - **Sidebar Ant Design Admin:** cao 232px, header 56px, mục menu cao 40px vuông vắn, tab active là khối nền mờ + vạch accent 2px bên trái (bỏ pill bo tròn). Sub-menu dạng cây với đường kẻ dọc 1px, mục con active có vạch định vị.
  - **Mật độ hiển thị:** nút/ô nhập cao 32px chuẩn Ant Design, bảng dữ liệu header 11px uppercase + padding 11/12px, card padding 20/22px, vùng nội dung max-width 1400px.
  - **Icon Ant Design** cho cả 9 tab, label tách riêng nên chuyển VI/EN vẫn hoạt động.
