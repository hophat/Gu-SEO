# Changelog

All notable changes to **pages-seo**. When you upgrade your install
via the Updates tab in the admin, the commit list shows the raw git
log — this file is the friendlier "what's new for me as an operator"
version.

The format is loosely Keep-a-Changelog, dates in ISO order.

## 1.14.2 — 2026-09-15

"Không đọc được website" khi chạy Brand DNA. Website đọc được bình thường —
lỗi thật nằm ở tầng AI, và có hai bug code đứng sau nó.

### Fixed
- **Brand DNA tự viết lại bộ dispatch provider, và nó lệch với registry.**
  `brand-dna.js` có một `switch (name)` riêng chỉ phủ 5 trong 10 provider,
  trong khi `listProviders()` quảng cáo cả 10. Nên nó **offer `gurouter`, thử,
  rồi chết với `unknown_provider: gurouter`** — trong khi mọi tính năng khác
  dùng gurouter bình thường. Giờ dispatch qua `runTextProvider()` trong
  registry, một nguồn sự thật duy nhất, nên hai danh sách không thể lệch lại.
- **Model Gemini đã bị Google khai tử.** `gemini-2.5-pro` trả 404 "no longer
  available to new users". Lỗi 404 đọc lên như "key của bạn hỏng", trong khi
  thật ra chỉ là tên model đã bị bỏ. Giờ có thang fallback
  (`gemini-3.1-pro-preview` → `gemini-2.5-pro` → `gemini-2.5-flash`) và 404 thì
  nhảy sang model kế tiếp. Override qua `GEMINI_TEXT_MODEL` vẫn được tôn trọng
  và chỉ thử đúng model đó.
- **Thông báo lỗi trong wizard sai hướng.** Nó nói "Không đọc được website"
  cho MỌI lỗi, khiến người dùng đi kiểm tra URL trong khi website đã đọc tốt.
  Giờ phân biệt: scrape_failed (không truy cập được / timeout / không phải HTML),
  scrape_too_thin (trang ít nội dung), và generation_failed (hết quota, hết
  credit, 429, model sai) — mỗi cái một việc cần làm cụ thể.

### Added (tooling)
- **Platform tests: 102 checks** (was 97). Bất biến được ghim lại: **mọi provider
  mà `listProviders` offer đều phải có handler dispatch** — đúng cái đã vỡ.
  Cùng với: tên ngoài registry bị từ chối rõ ràng, provider chưa cấu hình báo
  đúng trạng thái, gemini nhảy model khi gặp 404, và brand-dna không được tự
  viết lại `switch (name)`.

### Notes for operators
- Sau khi deploy, chạy **Cài đặt → Provider → Kiểm tra** để xem provider nào
  thực sự dùng được. Lúc deploy bản này, cả 4 provider đều hết tiền/quota:
  Workers AI hết 10.000 neurons/ngày miễn phí, GuRouter và OpenAI hết credit,
  Gemini hết quota. Đó là vấn đề thanh toán, không phải code.
## 1.14.1 — 2026-09-15

Fewer D1 rows read per page view. Measured first: public pages already return
correct cache headers with no Set-Cookie and no Vary, so they are cacheable —
but Cloudflare reports `cf-cache-status: DYNAMIC` on all of them, meaning it
does not cache Pages Function responses without a zone Cache Rule. Until that
is added, every page view is a miss, so the miss path is what costs money.

### Changed
- **`loadSettings` is memoised per request.** It reads the ENTIRE settings
  table (35 rows, 555 bytes here) and a single blog page view called it more
  than once. D1 bills per row read, so this was the biggest avoidable cost on
  the public path. The memo lives on `env` — one object per request in Pages
  Functions — so it cannot leak between requests or tenants.
  `setSetting` invalidates it, otherwise an endpoint that writes a setting and
  reads it back in the same request would see the old value.
- **`resolveProjectBySlug` is memoised per request.** The `/<slug>/` wrapper
  resolved the project to validate the slug, then `renderBlogIndex` resolved it
  AGAIN — two identical queries for one page view. Negative lookups are cached
  too, so a bad slug does not re-query on every call.

### Added (tooling)
- **Platform tests: 97 checks** (was 89). New coverage: both memos collapse to
  one query, `setSetting` invalidation, memoisation being scoped to `env` and
  not module scope, and a regression guard that public pages stay
  edge-cacheable (public + s-maxage, no no-store, no Set-Cookie) while the
  stable-named admin bundle stays no-store.
## 1.14.0 — 2026-09-15

Registration is now three fields, and the two placeholders that were quietly
defeating the mandatory setup are gone.

### Changed
- **Đăng ký chỉ còn email + OTP + mật khẩu.** Bỏ ô "Tên thương hiệu / Website"
  và ô website. Tên dự án tạm được suy ra từ phần trước @ của email
  (`nguyen.van.a@gmail.com` → `Nguyen van a`), và wizard bắt buộc sẽ hỏi tên
  thật cùng website ngay sau đó — nơi website thực sự được dùng để tạo Brand DNA.
  Hỏi ở bước đăng ký là ma sát vô ích: tên vốn chỉ là tạm.

### Fixed
- **Đăng ký tạo Brand DNA giả, vô hiệu hoá chính yêu cầu Brand DNA.** Câu
  "<tên> cung cấp các giải pháp và dịch vụ chuyên nghiệp hàng đầu" được ghi vào
  `project_brands` cho mọi tài khoản mới, nên kiểm tra "đã có Brand DNA" luôn
  đúng và bước Brand DNA **không bao giờ chặn**. Wizard bắt buộc giờ điền thật.
- **Đăng ký bịa ra `website_url = https://<slug>.com`.** Wizard prefill ô website
  bằng một domain không tồn tại, nên việc đầu tiên người dùng làm là bấm "đọc
  trang web của tôi" và nhận lỗi ở một địa chỉ họ chưa từng nhập. Giờ để trống.

### Added
- **`PATCH /api/admin/projects/profile`** — sửa tên / website / slug của dự án
  đang chọn (mọi admin, không cần super_admin). `site_name` đi kèm `name` vì nó
  quyết định branding công khai (tiêu đề widget, OG tags).
  **Slug bị khoá sau khi có bài xuất bản** — nó nằm trong link đến, sitemap và
  alias liên kết nội bộ của AI, đổi nữa là hỏng hết. Muốn đổi thì dùng tên miền
  riêng, và endpoint nói rõ điều đó thay vì âm thầm đổi.
- **Wizard bước 1 giờ hỏi cả tên thương hiệu** (prefill từ tên tạm) và lưu trước
  khi đọc website, để Brand DNA được tạo với tên thật.

### Added (tooling)
- **Platform tests: 89 checks** (was 79). New coverage: registration without a
  brand name, the provisional name derivation, no placeholder Brand DNA, a
  fresh signup gated on both steps, profile name/website updates, URL scheme
  validation, slug change before publish, slug lock after publish, and slug
  collision.
## 1.13.0 — 2026-09-15

Setup is now mandatory. A brand new account could previously skip the wizard
entirely and land in an admin that would never produce anything.

### Fixed
- **Onboarding state was GLOBAL, so new users skipped setup.** It lived in
  `settings.onboarding_complete` — a row with no `project_id`. The first
  project to finish the wizard marked EVERY project complete, which is why a
  freshly registered account sailed straight past it. Brand DNA and schedule
  were read from the same global settings row, so those checks were wrong for
  the same reason.
  State is now per project: `projects.onboarding_complete_at` (migration 004),
  and the checks read `project_brands` / `content_calendar` for the caller's
  project.
  The migration backfills already-set-up projects (Brand DNA **and** calendar
  slots) so an upgrade does not drop existing installs into the wizard — that
  would have looked like the upgrade broke their site.
- **The wizard was skippable.** It is now blocking while a project is
  incomplete: no close button, no mask click, no Esc, and no "Bỏ qua" button.
  It re-checks on project switch, so moving to a project that was never set up
  gates again.
- **`POST /api/admin/onboarding` accepted completion unconditionally.** The UI
  blocked it but a direct call could fake activation and inflate the funnel.
  It now returns 409 with the missing steps. The UI surfaces that instead of
  reporting success.
- **A failed website scrape was a dead end.** With setup mandatory, bouncing
  back to step 1 would have trapped the operator. Brand DNA now falls back to
  manual entry (and there is an explicit "Điền thủ công" button), so a scrape
  failure still reaches a working schedule.

### Notes on the design
`complete` — the gate — is **derived** from the data (Brand DNA exists and a
future schedule exists), not from a stored flag. That makes it self-healing:
a project whose Brand DNA is later deleted gates again, because it genuinely
can no longer produce on-brand content. `onboarding_complete_at` is a
separate, informational record of when the operator last walked the wizard; it
feeds the `onboarding_complete` event and does not gate. A stored flag would
let a project that lost its setup data sail through — the exact class of bug
this release fixes.

### Added (tooling)
- **Platform tests: 79 checks** (was 71). New coverage: the required-step
  declaration, the API refusing to fake completion, Brand-DNA-without-schedule
  staying incomplete, per-project isolation (the regression), past-dated slots
  not counting, reset clearing only the confirmation, and losing the setup data
  re-opening the gate.

### Notes for operators
- `npm run migrate` applies migration 004 and backfills. On a live install it
  marked 13 of 16 projects complete and left the 3 that had Brand DNA but no
  schedule — exactly the accounts that were skipping setup.
## 1.12.0 — 2026-09-15

Product analytics. Answers the questions that decide whether the product
keeps its customers — where people drop off, how long activation takes, and
whether projects that activated are still publishing weeks later.

### Added
- **Trang Tăng trưởng** (`/admin#insights`, super_admin) with:
  - **Funnel kích hoạt** — đăng ký → Brand DNA → lịch → bài đầu tiên → kênh
    MXH → còn hoạt động tuần 2 → tuần 4, with the **step-to-step drop**
    shown alongside each bar. The cumulative percentage hides which step is
    actually losing people; the drop between two steps is the number worth
    acting on.
  - **Thời gian tới bài đầu tiên** — median, p25, p75, and the share under
    24h / 72h.
  - **Retention theo tuần đăng ký** — cohorts by ISO signup week, % that
    published in each of weeks 1-4, colour-coded as a heatmap.
  - **Sản lượng theo tuần** — posts and active projects per week.
  - **Sức khoẻ từng dự án** — posts, first-post latency, days since last
    post, and which setup steps are done, sorted by output.
- **`product_events` (migration 003)** — a narrow event log for the moments
  that are NOT derivable: signup, setup complete, onboarding, Brand DNA
  generated, calendar planned, first post published, channel
  connect/connected/failed/disconnected, social post published/failed.
  Unknown event names are rejected so a typo is a no-op rather than a junk
  row, oversized props are dropped, and every write is fire-and-forget — a
  failed insert must never fail the user action it describes.
  `trackOnce` emits a milestone at most once per project, so
  `first_post_published` cannot fire on every publish and skew the funnel.

### Notes on the design
Activation, retention and activity are **derived** from `projects.created_at`
and `blog_posts.published_at`, not logged as events. That is deliberate:
the numbers are retroactive (they exist for every project ever created,
including ones from before any instrumentation), they cannot drift from what
actually happened, and they cost nothing on the publish hot path. The event
log exists only to explain a drop-off, not to measure it.

### Fixed
- **A cohort too young to have reached a step was reported as 0%.** With a
  four-day-old install, "còn hoạt động tuần 2" showed 0% — which reads as
  "everyone churned" when the truth is "not measurable yet`. Funnel steps
  now carry `measurable` / `measurable_after_days` and the UI renders
  "chưa đủ dữ liệu" with the reason; retention cohorts expose
  `weeks_elapsed` so weeks that have not happened render as "—".

### Added (tooling)
- **Platform tests: 71 checks** (was 54). New coverage: event whitelist,
  props bounding, `trackOnce` idempotency, track never throwing on DB
  failure, funnel counts/percentages, measurability flags, time-to-first-post
  percentiles, retention cohort maths, weekly trend accounting, per-project
  health, `insights` being super_admin-only, and ISO week labels.

### Notes for operators
- `npm run migrate` to create `product_events` (migration 003). Existing
  data is untouched; the derived metrics work immediately and retroactively.

## 1.11.0 — 2026-09-15

Activation release. Adds the two things an operator needs once setup is
done: one place that says what is broken, and one that says what is left
to do. Plus a cross-tenant alias leak.

### Added
- **"Cần xử lý" — a single action list on the dashboard**
  (`/api/admin/attention`). Failures used to live in five places (blog jobs,
  programmatic queue, social queue, provider config, domain, cron staleness)
  and an operator had to remember to check each one, so in practice a failed
  Facebook post could sit for a week. Now every issue is ranked
  critical → warning → info, carries a count, and links straight to the page
  that clears it. Project-scoped.
  Checks: social channel needs reconnecting, failed social posts, blog jobs
  stuck mid-chain, failed blog jobs, failed programmatic pages, AI budget
  exceeded/near limit, no AI provider, cron looks dead, empty schedule,
  missing Brand DNA, no custom domain, no social channel.
- **Activation checklist** (`/api/admin/activation`). The wizard tells an
  operator what to do once; after that the most common failure mode is an
  account set up halfway that quietly produces nothing. The dashboard now
  keeps a checklist until the required steps are done, and reports the
  activation metric that matters — hours from project creation to the first
  published post — derived from existing data, no analytics pipeline needed.

### Fixed
- **Cross-tenant alias leak (migration 002).** `site_aliases` had no
  `project_id` and `buildAliasMap()` returned every row to every project, so
  the AI writing for one tenant was told it could link to another tenant's
  pages and the sanitiser would expand those names into the article. The
  table is rebuilt as `(id, project_id, name)` with a composite unique index,
  so two projects can each own a `login` alias — impossible before, since
  `name` was the primary key for the whole database.
  The legacy table is **renamed, not dropped**, to `site_aliases_legacy` and
  every row is copied forward as shared (`project_id = ''`), so existing
  installs keep working until an operator re-syncs per project. Shared rows
  are read-only for everyone — editing one would silently change every
  tenant's prompt vocabulary.
  `POST /api/admin/aliases/sync` is now per project and only touches the
  caller's rows.
- **`schema/init.sql` was missing `project_id` on five core tables**
  (`blog_posts`, `blog_jobs`, `content_calendar`, `prog_keywords`, `users`)
  plus `blog_posts.category` and `users.role`. A fresh install therefore
  produced a schema with no project scoping anywhere and the whole
  multi-project layer would have failed; production only worked because it
  had been migrated incrementally. Found by the new drift check below.
- **Brand DNA was read from the wrong column** in the attention and
  activation checks (`target_audience` instead of `audience`), and a
  `.catch(() => null)` swallowed the resulting SQL error so the check
  silently always reported "missing". Both now read `project_brands` with the
  legacy settings rows as a fallback.

### Added (tooling)
- **`npm run check:drift`** — compares a live D1 schema against what
  `schema/init.sql` produces on a fresh database and reports tables or columns
  present in one but not the other. This is what caught the missing
  `project_id` columns. Run it after any schema edit.
- **Platform tests: 54 checks** (was 36). New coverage: migration 002 data
  preservation and isolation, cross-project alias patch/delete refusal,
  shared-row read-only enforcement, attention ranking/CTA/project scoping,
  activation completion and time-to-first-post.

### Notes for operators
- `npm run migrate` to apply migration 002. It renames `site_aliases` to
  `site_aliases_legacy` and copies all rows forward — nothing is deleted, and
  the backup table stays for rollback.
- After migrating, open **Thương hiệu → Internal Links** and press
  **Đồng bộ sitemap** once per project to create that project's own rows.
  Until then the shared rows keep working as before.
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
