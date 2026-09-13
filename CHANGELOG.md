# Changelog

All notable changes to **pages-seo**. When you upgrade your install
via the Updates tab in the admin, the commit list shows the raw git
log — this file is the friendlier "what's new for me as an operator"
version.

The format is loosely Keep-a-Changelog, dates in ISO order.

## 1.8.1 — 2026-09-13

### Changed
- **Cập nhật Logo nhận diện chính thức & Favicon đồng bộ từ `@public/logo-guseo.png`:**
  - Tích hợp ảnh logo gốc chất lượng cao cho biểu tượng nhận diện GU SEO.
  - Tối ưu tự động các kích thước:
    - `/favicon.png` (64×64px) & `/apple-touch-icon.png` (180×180px) hiển thị favicon sắc nét trên tab trình duyệt và bookmark điện thoại.
    - `/logo-guseo-sm.png` (128×128px, chỉ ~18KB) tải siêu tốc cho thanh Header và Footer của cả Trang chủ và Admin Console.
  - Thay thế icon cờ SVG quốc gia (Việt Nam `🇻🇳` / Anh `🇬🇧`) thay cho emoji cũ ở bộ chọn ngôn ngữ Header.

## 1.8.0 — 2026-09-13

### Added
- **Trụ cột 4: Growth & Onboarding Automation (Kích hoạt người dùng 60s):**
  - **Onboarding Quickstart Modal (Aha! Moment):** Tự động kích hoạt khi người dùng mới đăng nhập vào dự án chưa có bài viết:
    - *Bước 1:* Quét website/fanpage để AI tự động trích xuất Brand DNA trong 10-20 giây.
    - *Bước 2:* Đề xuất danh sách chủ đề SEO tiềm năng và cho phép chọn 1 chủ đề tâm đắc.
    - *Bước 3:* Tự động chạy toàn bộ quy trình viết bài, sinh ảnh bìa Flux, chèn link nội bộ và hiển thị thanh tiến trình trực quan.
    - *Bước 4:* Chúc mừng và cấp link trực tiếp để người dùng xem ngay bài viết vừa xuất bản.
  - **Hệ thống gửi Báo cáo hiệu quả tuần tự động (Weekly Digest):**
    - Endpoint `POST /api/admin/cron/weekly-digest` tự động thống kê số bài viết mới xuất bản, tổng số bài và lượt xem trong 7 ngày qua, gửi email thông báo định kỳ tới từng chủ dự án.

## 1.7.0 — 2026-09-13

### Added
- **Hiển thị trực quan Hạn mức & Số lượng bài viết của gói Free trên Dashboard:**
  - Bổ sung **Thẻ Quota Banner** ngay đầu trang Tổng quan (Overview):
    - Tên gói tài khoản: `Gói Cơ Bản (Free)` hoặc `Gói Doanh Nghiệp (Super Admin)`.
    - Số lượng bài viết đã tạo / Giới hạn: ví dụ `0 / 100 bài`.
    - Thông báo số bài viết còn lại chính xác: `Còn lại 100 bài viết SEO miễn phí`.
    - Thanh tiến trình trực quan (Visual Progress Bar) chuyển màu từ Xanh lá (an toàn) sang Đỏ cảnh báo khi chạm mốc 100%.
  - Cập nhật số liệu tức thì đồng bộ theo dự án và tài khoản đang đăng nhập.

## 1.6.0 — 2026-09-13

### Added
- **Xác thực OTP Email qua Gmail SMTP TLS cho Đăng ký Tài khoản:**
  - Tích hợp module gửi email SMTP trực tiếp qua TLS (`cloudflare:sockets`) kết nối an toàn tới máy chủ `smtp.gmail.com:465`.
  - Cấu hình tài khoản gửi thư hệ thống: `gulagi.com@gmail.com` với mật khẩu ứng dụng Gmail chuyên dụng.
  - Endpoint `POST /api/public/send-otp` tự động sinh mã OTP ngẫu nhiên 6 chữ số mã hóa an toàn, lưu bảng `email_verifications` (hạn dùng 10 phút) và gửi template HTML chuyên nghiệp về email người dùng.
  - Endpoint `POST /api/public/register` yêu cầu và kiểm tra nghiêm ngặt mã OTP hợp lệ trước khi kích hoạt tạo Project và cấp quyền tài khoản gói Free.
  - Giao diện đăng ký cập nhật nút **"Gửi OTP"** kèm bộ đếm ngược 60 giây (anti-spam) và ô nhập mã xác thực OTP 6 số.

## 1.5.0 — 2026-09-13

### Added
- **Tính năng Quản lý & Tạo Project dành cho Super Admin:**
  - Tab điều hướng **Dự án** (Projects) riêng biệt dành riêng cho `super_admin` (ẩn hoàn toàn với các tài khoản tenant `project_admin`).
  - Form tạo Project mới trực quan: Tự động khởi tạo cấu hình slug URL, website, publishing URL, Brand DNA mặc định, AI config (Workers AI) và lịch chạy cron tự động hàng ngày lúc 08:00 VN.
  - Bảng quản trị danh sách dự án trong hệ sinh thái: Tên, slug, đường dẫn public, ngôn ngữ, trạng thái.
  - Chức năng chuyển đổi nhanh dự án làm việc ngay trong bảng (`Chọn`) và bảo vệ an toàn cho các dự án cốt lõi (`gulagi`, `gurouter` không thể bị xóa nhầm).
  - Endpoint `DELETE /api/admin/projects/:id` hỗ trợ dọn dẹp sạch toàn bộ dữ liệu phụ thuộc (Brand DNA, AI configs, Publishing configs, Schedules, Topics, Embeds, Calendar) khi xóa dự án.
  - Bảo mật tuyệt đối: Khóa quyền truy cập API `/api/admin/projects` bằng `requireSuperAdmin` (chỉ super_admin mới có quyền xem, tạo và xóa dự án).

## 1.4.0 — 2026-09-13

### Added
- **Tính năng Đăng Ký Tài Khoản Gói Free (Tự phục vụ - Self-serve):**
  - Endpoint đăng ký công khai `POST /api/public/register`.
  - Tự động tạo Project riêng, định hình Brand DNA mặc định, tạo Lịch xuất bản tự động (Daily 08:00 VN) và cấu hình xuất bản cho thương hiệu mới.
  - Cấp quyền `project_admin`, gán `plan_tier = 'free'` và hạn ngạch **100 bài viết SEO tự động miễn phí**.
  - Tự động đăng nhập và chuyển hướng ngay vào Console sau khi đăng ký thành công.
  - Tích hợp tab Chuyển đổi "Đăng nhập" / "Đăng ký (Free 100 bài)" tại màn hình Gate của Admin.
  - Nút "Đăng Ký Free" trên thanh Navigation trang chủ liên kết trực tiếp vào `/admin#register`.

### Security & Quota Controls
- **Bảo vệ toàn vẹn dữ liệu gói Free:**
  - **Khóa tính năng xóa bài viết:** Tài khoản gói Free không có quyền xóa bài viết blog (ẩn nút Xóa trong giao diện và trả mã lỗi `403 Forbidden` ở backend `/api/admin/blog/post`).
  - **Kiểm soát hạn mức 100 bài:** Kiểm tra số lượng bài viết đã tạo trước khi khởi chạy pipeline viết bài mới tại `/api/admin/blog/start`, chặn khi đạt mốc 100 bài kèm thông báo nâng cấp.
  - Hiển thị hạn ngạch minh bạch trên topbar: `Gói Free · X/100 bài`.

## 1.3.15 — 2026-09-13

### Changed
- **Nâng cấp giao diện trang Admin theo chuẩn thiết kế của Trang chủ (X.com / Global Dark Style):**
  - Đồng bộ bảng màu nền đen tuyệt đối (`--bg: #000000`, `--bg-card: #101114`).
  - Điểm nhấn chính chuyển sang nút bấm trắng tương phản cao chữ đen (`.btn-primary`), viền mỏng sắc nét `rgba(255,255,255,0.08)`.
  - Thay thế font sang bộ **Inter** đồng bộ với trang chủ.
  - Cập nhật định danh toàn diện từ "Gulagi Blogs" thành **GU SEO Console** kèm logo X-mark tối giản.

## 1.3.14 — 2026-09-13

### Added
- **Hỗ trợ song ngữ Tiếng Việt & Tiếng Anh trên Trang chủ (i18n):**
  - Tích hợp nút chuyển đổi ngôn ngữ tối giản `🌐 VI / EN` trên thanh Navigation bar (chuẩn phong cách X.com).
  - Tự động ghi nhớ lựa chọn ngôn ngữ qua `localStorage['ps_home_lang']`, mặc định Tiếng Việt cho người dùng Việt Nam.
  - Chuyển đổi toàn diện 100% nội dung (Title, Meta description, Navigation, Hero, Big Wordmark, 4-Step Workflow, 6 Tính năng công nghệ, Hệ sinh thái, Liên hệ & Footer) không cần tải lại trang.

## 1.3.13 — 2026-09-13

### Added
- **Thêm Section quy trình Step-by-Step chuẩn phong cách X.com:**
  - `STEP 01 — Thiết Kế DNA Brand Tự Động`: Dán URL domain, tự động trích xuất mô hình kinh doanh, tone giọng, độc giả & chủ đề cốt lõi.
  - `STEP 02 — Chọn Lọc & Chấm Điểm`: Topic Scoring v2 lọc intent, đo độ khó đối thủ và phân bổ vào cụm Topic Clusters (Pillars).
  - `STEP 03 — Lên Lịch Nội Dung`: Lưới lịch 28 ngày thông minh, xem trước hoặc kích hoạt tạo ngay khi cần.
  - `STEP 04 — Đăng Bài Hàng Ngày`: Tự động kích hoạt lúc 08:00 sáng mỗi ngày, viết bài 900-1.300 từ, sinh ảnh bìa, chèn link nội bộ & ping IndexNow.

## 1.3.12 — 2026-09-13

### Changed
- **Đổi định danh hệ thống thành GU SEO (thay cho Gulagi):**
  - Trang chủ hiện định nghĩa tên nền tảng chính thức là **GU SEO** (thay vì gọi chung là Gulagi).
  - Tích hợp icon/logo thực tế từ `gulagi.com` (biểu tượng G xanh lá) và `gurouter.com` (biểu tượng vòng xoáy đa sắc AI) vào cả Trust Bar và 2 thẻ Ecosystem card, tối ưu nhẹ (128×128px) tải cực nhanh.

## 1.3.11 — 2026-09-13

### Changed
- **Trang chủ redesign theo phong cách X.com (Twitter):**
  - **Aesthetic thuần X:** Pure black (#000000), monochrome trắng/xám, không gradient/glow/màu cyan.
  - **Logo mark đúng chuẩn X:** Hai đường chéo đơn giản, không bo khung.
  - **Typography:** Plus Jakarta Sans 800-weight, line-height 0.95, letter-spacing -0.045em cho display.
  - **Sections theo style X:** Logo Wall strip (brand trust), Big Type Wordmark (centered hero type), Stats Strip (proof metrics), Feature Grid (hairline borders), Ecosystem Cards (transparent + 1px border), Contact CTA (X-style minimal).
  - **Ambient video:** WebM mô phỏng particle dynamics, opacity 18% + grayscale để tích hợp subtle không phá minimalist aesthetic.
  - **Copy toàn cầu:** Số điện thoại format quốc tế `+84 989 511 431`, terminology enterprise.

## 1.3.10 — 2026-09-13

### Changed
- **Trang chủ Welcome được R&D thiết kế lại toàn diện theo phong cách OpenAI / Linear:**
  - **Motion & Ambient Video/Canvas:** Nền video mô phỏng mạng lưới thần kinh (Neural Network WebM) kết hợp canvas hạt tương tác thời gian thực và lưới toạ độ ánh sáng tinh tế.
  - **Tận dụng icon & biểu tượng thay cho chữ dài:** 24+ biểu tượng SVG chuyên dụng phân bổ trực quan cho từng công đoạn pipeline (01 Khám phá, 02 Multi-Agent, 03 Hero Cover, 04 Publish/IndexNow).
  - **Terminal Execution Box:** Mô phỏng luồng chạy thực tế của engine trên Cloudflare Edge với log màu sinh động.
  - **Hệ sinh thái:** Card tương tác trực quan cho `gulagi.com` và `gurouter.com` kèm tag tính năng.
  - **Liên hệ:** Banner nổi bật với số điện thoại `0989 511 431` và liên kết gọi trực tiếp.

## 1.3.9 — 2026-09-13

### Changed
- **The install root leads with the service.** The landing page was an ecosystem overview in a Google-style blue/white layout; it is now built around the product — what the automation does, the four steps it runs unattended, and what it handles without an editor — followed by the two brands and the contact number. Restyled to OpenAI's monochrome system: hairline borders, black CTAs, Inter throughout, no gradients. Still Vietnamese, still `noindex`.

## 1.3.8 — 2026-09-13

### Fixed
- **Admin UI changes took up to four hours to appear.** `/admin.html` is served `no-store`, but `/admin.js`, `/admin.css` and the cover-editor bundle had no rule at all. This zone sets `browser_cache_ttl=14400`, so Cloudflare rewrote their origin `max-age` to 4 hours and a project admin kept seeing the System, Settings and Users tabs long after those were hidden for that role — the deployed code was correct, the browser was running a stale bundle. Those four files are now `no-store`; `no-cache` is not enough here, because the same zone setting strips it and substitutes the 4-hour TTL.

## 1.3.7 — 2026-09-13

### Fixed
- **Posts shipped with no internal links.** The injector only turns a phrase into a link when that phrase already appears in the body, which in practice almost never happens: 17 of the 18 published posts had zero internal links. A post that matches nothing now ends with a **Bài viết liên quan** list of its project's freshest posts, so every post links onward and older posts keep earning links. Existing bodies were backfilled the same way — 14 posts, one section each, same-project links only.
- **Two blocks were headed "Bài viết liên quan".** Adding the in-body list above meant every post showed that heading twice; the read-next aside (which keeps its thumbnails) is now headed **Đọc tiếp**, matching the `read-next` class it always had.

## 1.3.6 — 2026-09-13

### Added
- **"Tạo ngay" from the content calendar.** Opening a scheduled or draft slot in the calendar now offers a button that runs the whole blog pipeline for that slot — claim the slot, write, cover, publish — instead of waiting for the daily cron. It uses the same `/api/admin/blog/start` slot path the cron uses, so the slot is claimed and linked to the job exactly as a scheduled run would be; the button only appears for slots the pipeline can still claim.
- **The install root is an ecosystem landing page.** The root of a non-maintainer install served a bare "Welcome." card. It is now a Vietnamese landing page describing the system, the two brands it runs (gulagi.com, gurouter.com) as product cards, and the contact number — Google-style white/blue layout, sign-in kept small in the corner. Blurbs come from each project's own `site_description`.

## 1.3.5 — 2026-09-13

### Fixed
- **Project logos rendered at full size.** The global `img { height: auto }` rule overrode the `height="28"` attribute on the blog header logo, so an uploaded logo stretched across the header. `.header-logo-img` now pins the height and caps the width.

### Changed
- **The header bar uses the project's theme colour.** It was painted `--surface` (white), so setting a theme colour only tinted links and buttons while the bar itself stayed white — the colour looked like it never applied. A project with a theme colour now paints the header with it and flips the brand, nav and CTA to white-on-accent. Gulagi has no theme colour and keeps the plain surface header.

## 1.3.4 — 2026-09-13

### Fixed
- **Internal links 404'd on tenant blogs.** `injectInternalLinks` hardcoded a root-relative `/blog/<slug>`, so a project published under a path prefix (like `/usasglobal`) pointed its own links at the root project's blog, which holds none of that project's posts. Links are now written under the project's public path prefix, and the alias-expansion path in `sanitiseMarkdownLinks` applies the same prefix — the prefix is also added to the internal-link whitelist, otherwise the sanitiser would strip the now-correct link. Gulagi is unaffected: published at the origin root, its prefix is empty.
- **Already-published tenant posts healed.** Bodies written before the fix are rewritten at render time (`/blog/`, `/p/` → `/<slug>/blog/`, `/<slug>/p/`), and the four affected USaS posts were also repaired in D1 so copies sent out by Webhook / Custom API / publisher carry working links.

## 1.3.3 — 2026-09-13

### Added
- **Per-project theme colour.** The Brand tab takes a single hex value and stores it on the new `projects.theme_color` column (additive). The public blog paints it as `--brand` and the embed widget as `--ps-accent`; the light and dark tints are derived in CSS with `color-mix()`, so there is only ever one value to maintain. Empty means the stylesheet default.
- **Per-project logo upload.** The Brand tab uploads a PNG/JPG/WebP/SVG (≤ 2 MB) to R2 and points `projects.logo_url` at it, and can clear it again. Scoped to the caller's active project, so a project admin can only replace their own logo.

### Changed
- **The blog index header renders the project logo.** `/<slug>/blog` showed a plain wordmark even when the project had a logo; it now uses the same logo-or-wordmark markup as single posts, and picks up the project's theme colour too.

## 1.3.2 — 2026-09-13

### Added
- **User management.** A new **Người dùng** tab (super-admin only) creates tenant accounts with a role and a project binding, and can change a user's role/project, reset their password, or delete the account.
- **Widget title follows the project.** The embed widget takes its heading from the project's `site_name` and its interface copy from the project's `language`, instead of a fixed label.

### Fixed
- **Other brands' blogs no longer credit Gulagi.** Every post rendered a hardcoded author box (`Đội ngũ Gulagi` plus a retail-shop bio) whichever project owned it, and the blog-list description fell back to a hardcoded "…từ Gulagi." Tenants now use their own `site_name` / `site_description`; Gulagi keeps its existing copy.
- **Tenant blog creation ignored the tenant.** `POST /api/admin/blog/start` fell back to the install-wide SEO topic pool, so a study-abroad brand got topics like internal linking, and the article prompt used the install's brand voice instead of the project's. A named project now picks from its own `project_topics` (falling back to AI-generated on-brand topics) and writes with that project's `project_brands` DNA.

### Security
- **`/api/admin/users` now requires super_admin.** The endpoint only called `adminGate`, which does not inspect roles, so any project admin with a session could create accounts. Bearer `ADMIN_TOKEN` still works as the bootstrap/recovery credential, and deleting the last super-admin — or the account you are signed in as — is refused.

## 1.3.1 — 2026-09-13

### Fixed
- **Project admins could not reach Distribution.** The tab (and the embeds page) was hidden for `project_admin`, so a tenant like USaS Global had no way to grab their embed snippet or submit their sitemap. Distribution is project-scoped, so it is now visible; Settings, System, Updates and Usage stay super-admin only.
- **Embeds rendered the wrong tenant's posts.** `blog_embeds` had no `project_id`, so the embed bundle resolved posts from the host it was pasted on — the customer's own site — and fell back to an unfiltered query. Embeds are now created against the active project, listed/updated/deleted inside that project only, and the widget bundle bakes the embed's project in, so a USaS snippet shows USaS posts anywhere it is pasted.
- **IndexNow pinged Gulagi for every project.** `/api/admin/indexnow-ping` hardcoded `https://gulagi.com/sitemap-pages.xml` and pings with host `gulagi.com`. It now reads the active project's own sitemap and pings with that project's host.

### Added
- **Distribution overview.** The Distribution page opens with the project's channels — public blog, RSS feed, sitemap, embed widget — each with a copy-ready absolute URL, plus the publish target currently configured (platform blog / Webhook / Custom API / WordPress).

### Changed
- **Admin UI is fully Vietnamese.** All remaining English copy in `admin.html` and `admin.js` is translated, using the glossary already present in `public/i18n.js` for shared terms.

## 1.3.0 — 2026-09-12

### Added
- **Per-project blogs on a shared host.** Each project can publish under `https://<host>/<slug>/blog` (`…/blog/page/N`, `…/blog/<post>`, `…/p/<slug>`, `…/feed.xml`, `…/sitemap.xml`) alongside its own domain. Canonical, og, JSON-LD, pagination and related-post links all carry the path prefix.
- **Per-project public branding.** `projects.site_name`, `site_description` and `logo_url` drive the blog header/footer, `<title>`, meta description, og:site_name and RSS feed, falling back to the global `SITE_NAME`/`SITE_DESCRIPTION`/`SITE_LOGO_URL`.
- **Multi-tenant cron fan-out.** `/api/admin/cron/tick` runs each scheduled task across every active project: daily post, programmatic batch (up to 10 pages per project) and weekly refresh (up to 2 per project). The cron Worker now makes one call per schedule.

### Fixed
- **Scheduled publishing only ever ran for one project.** The cron Worker called the blog pipeline without a `project_id`, so only the host-matched project auto-published; USaS Global and GuRouter never generated anything automatically.
- **JIT calendar planning ignored the tenant.** `planSingleForToday` used global settings, matched slots across all projects and inserted without `project_id`, so a named project could claim another tenant's topic.
- **Duplicate detection compared across tenants.** Blog dedup now scopes its embedding search to the project.
- **IndexNow / Search Console advertised unreachable URLs.** Publish and refresh pings now use each project's publishing base (origin + path prefix); programmatic pings no longer leak the internal `gu-seo.pages.dev` hostname.

### Changed
- **Shared-host resolution matches host + path.** Projects resolve by host and longest matching path prefix, so `seo.gulagi.com/usasglobal` cannot shadow the root project on `seo.gulagi.com`. An explicit `?project=<slug>` still wins.
- **Gulagi's `publishing_url`** is now `https://gulagi.com` (was `https://docs.gulagi.com`).
- **Cron Worker renamed to `gulagi-cron-worker`** in `cron-worker/wrangler.jsonc` to match the deployment; `BLOG_URL` also derives the tick endpoint (optional `TICK_URL` overrides).

## 1.2.0 — 2026-09-12

### Added
- **Competitor scan.** Admin → Trends → "So sánh đối thủ" measures rival pages (word count, H2s, links) with SSRF validation and a 7-day snapshot cache.
- **Topic scoring v2.** Five-factor ranking (relevance, business value, freshness, competition, intent fit) with auto-archive under 60; the daily picker takes the top score.
- **Content clusters.** Topics auto-assign to brand-derived pillars; new and refreshed posts prefer same-cluster internal links.
- **Auto-refresh.** Stale posts (>90 days) rewrite in place with slug preservation, 301 redirects on rename, and IndexNow/GSC re-pings. Capped at 2 per week.
- **Vietnamese-aware internal linking.** Diacritic folding makes phrase matching work on Vietnamese bodies.
- **Weekly refresh cron.** `0 7 * * 1` on the cron Worker plus a manual `/run/refresh` route.

### Fixed
- **Cron schedules actually attached.** No Worker had cron triggers, so scheduled posts never auto-generated; daily/prog/refresh schedules are now set on `gulagi-cron-worker`.
- **Exported `sniffImageFormat`** from the blog image step so the test-image endpoint builds.

### Changed
- **Admin menus.** New Analytics tab and Trends section with usage guides; leads/views list endpoints now require admin auth.

## 1.1.0 — 2026-06-10

### Added
- **Claude Fable 5 support.** The Anthropic provider now defaults to
  `claude-fable-5`, Anthropic's newest model ($10/M in, $50/M out —
  bundled price snapshot updated to match). Override with
  `ANTHROPIC_TEXT_MODEL` as before.
- **`scripts/optimize-hero-images.sh`** — one-command maintenance
  script that recompresses existing AI hero PNGs in R2 to WebP
  (~97% smaller; a 10-post /blog page drops from ~14 MB of images
  to under 600 KB) and repoints `blog_posts` at the new keys.
- **Proper 404s.** A branded `public/404.html` replaces the previous
  SPA fallback that returned the homepage with HTTP 200 for unknown
  URLs (a classic soft-404 that wastes crawl budget).
- **Marketing site redesign.** Editorial press-sheet look: serif
  display headlines, highlighter-yellow accents, provider ticker,
  ghost folio numerals, full-bleed nav, closing CTA band, dark mode.

### Changed
- **Hero images store their real format.** The image step now sniffs
  the provider's bytes (JPEG/WebP/PNG) and writes the matching
  extension + content-type instead of assuming PNG.
- **All public pages self-host fonts.** Blog index, posts,
  programmatic pages, and docs no longer call Google Fonts — fonts
  load from `/_fonts/` with preload hints (faster first paint, one
  fewer third-party origin).
- **Blog index LCP.** The first card image loads eagerly with
  `fetchpriority=high` (plus a preload hint and og:image); the rest
  stay lazy. Page-1 now ships `twitter:card=summary_large_image`.

### Security
- **Constant-time admin-token comparison.** Bearer/X-Admin-Token
  checks no longer short-circuit on the first differing byte.
- **Baseline security headers.** `X-Content-Type-Options: nosniff` +
  `Referrer-Policy` on static assets and rendered pages;
  `X-Frame-Options: DENY` + `Cache-Control: no-store` on the admin
  SPA and sign-in page (clickjacking defence).

## 1.0.6 — 2026-06-07

### Removed
- **The "Deploy to Cloudflare" 1-click button.** Cloudflare's auto-
  generated CI token for new Pages projects doesn't include
  `Pages:Edit`, so the very first build fails with
  `Authentication error [code: 10000]`. Until Cloudflare ships a
  fix, the button created more confusion than convenience —
  every install hit the wall, half the users abandoned. The
  browser installer at `/install` now becomes the no-terminal
  path, and it actually works end-to-end. Removed from the
  marketing hero CTA row, the install-page section, the
  `/install` chooser, and the README. The
  `err-deploy-button-auth-10000` entry in `/docs#errors`
  documents the trace for anyone who already had a half-broken
  project.

### Added
- **First-run zero-secret install.** The deploy flow no longer
  requires any user-supplied secrets. `ADMIN_TOKEN` and
  `INDEXNOW_KEY` auto-generate on first `/api/setup` call;
  `SITE_NAME` / `SITE_URL` auto-resolve from the request host or
  the operator's input in the first-run setup card. The full
  list of "optional" Pages secrets in `.env.example` is now
  commented out by default so Cloudflare's deploy UI shows zero
  required fields. `package.json` ships a `cloudflare.bindings`
  block with descriptions so any forker who DOES uncomment a key
  gets context.

### Changed
- **`/install` step 3 redesigned for token paste.** Three numbered
  cards (open token page → paste token → name site), each visually
  locked/active/done as the user progresses. Big animated CTA on
  the create-token step, real-time validation on the token field
  (regex-match + status line), auto-paste detection on
  tab-refocus, auto-focus on the site-name input once the token
  validates. The Install button stays disabled until all three
  steps are done — no more "submit then learn what's wrong".

### Fixed
- **IndexNow never worked on browser installs.** Both the ping
  client and the site-verification file route read `env.INDEXNOW_KEY`
  with no D1 fallback, so installs that never set the secret
  silently never pinged Bing/Yandex/Seznam. Added
  `functions/_lib/indexnow_key.js` mirroring the `admin_token.js`
  resolution pattern; both call sites now use it.
- **Site name fell back to "pages-seo" forever on browser installs.**
  `feed.xml`, `blog/index`, `page_render`, `widget.js`, and the
  admin generate endpoints read `settings.site_name`, but
  `/api/setup` was writing `site_name_db`. Added a derived alias
  in `loadSettings()` that resolves `site_name` from
  (env-or-`site_name_db`). One fix unblocked 5 call sites.
- **`getHost()` in IndexNow** also only checked `env.SITE_URL`. Now
  resolves through `getSiteIdentity()` (env-or-D1).
- **Workers Builds deploy command broke on `wrangler: command not found`.**
  `deploy.sh` called bare `wrangler`; Workers Builds CI doesn't
  install wrangler globally. Added wrangler as a `devDependency`,
  rewrote the `deploy` script to use `npx wrangler pages deploy`,
  added a `cloudflare-deploy.sh` wrapper that turns auth-10000
  errors into actionable build-log messages instead of a generic
  stack trace. The old script lives at `deploy:cli`.

## 1.0.5 — 2026-06-06

### Added
- **AI duplicate detection** (`functions/_lib/dedup.js`). Every
  candidate topic is embedded via Workers AI's BGE base model and
  cosine-compared against the 50 most recent published posts. The
  cron repicks on near-duplicates (similarity ≥ 0.80) up to 5 times,
  then falls back to the least-similar option. Calibrated against
  real posts: rewrites of an existing topic score ~0.83 (blocked);
  family-related but distinct topics score ~0.77 (allowed).
- **Pre-publish quality scoring** (`functions/_lib/quality.js`).
  Deterministic 0–100 check on word count, headings, lists,
  internal links, title/meta length. Posts scoring 'bad' (< 45)
  go to a new `status='review'` state instead of going live.
  Public site treats 'review' as 404; admin still sees them. The
  operator can `force_publish: true` to override.
- **Internal-link injection** (`functions/_lib/internal_links.js`).
  After generation, scan the body for phrases matching titles and
  keywords of other published posts, and inject up to 3 markdown
  links — skipping code blocks and existing links. Big SEO + reader-
  retention win; every new post becomes a link upgrade for older ones.
- **Slug cleanup + 301 redirects.** The AI occasionally prepended
  "Blog" to its own title/slug field, producing URLs like
  `/blog/blogoptimize-...`. Text generation now strips this via a
  title-level check (the AI's tell is a capital letter immediately
  after "Blog"), then re-slugifies. A new admin endpoint
  `POST /api/admin/blog/rename-slug` migrates broken legacy slugs
  with automatic 301 redirects (via a new `blog_post_redirects`
  table created on first use).
- **Category-aware topic rotation.** `functions/_lib/topics.js` now
  tags each topic with a `category` (on-page, technical, content,
  links, off-page, analytics, platform, ai). The cron picker
  prefers categories not used in the last 7 days, preventing the
  "three Cloudflare Pages posts in five days" clustering pattern.
- **Public RSS feed** at `/feed.xml`. RSS 2.0 with the 30 most
  recent posts, advertised via `<link rel="alternate">` in every
  blog page's `<head>` and a `Feed:` line in `robots.txt`. No
  config required — uses the request's own host.
- **Richer `/api/version`.** External tools and other installs now
  get `recent_commits[]` (last 20 on main), `release_notes` (body
  of the latest GH release), and `commits_since_tag` (count of
  main commits ahead of the latest tag). Backward-compatible: all
  v1 fields preserved.
- **Beefier `/api/health`.** Adds `posts.count`,
  `posts.last_published`, `posts.hours_since_last`,
  `posts.cron_likely_alive`, and `jobs.in_flight_stuck` so an
  uptime monitor can detect a silently-dead cron without you having
  to look at the admin UI.
- **Cron Worker `/diag`** (`pages-seo-cron`). Unauthenticated
  config probe that reports whether each secret is configured,
  whether the BLOG_URL/PROG_URL endpoints answer, the current UK
  offset, and the next scheduled run times. Doesn't leak any
  secret values.

### Fixed
- **Cron's `ADMIN_TOKEN` was stale.** The cron Worker had a
  different `ADMIN_TOKEN` from the Pages project, so every cron
  hour returned `{"error":"unauthorized"}`. Rotated to a fresh
  64-hex token on both sides — diagnosed via the new `/diag`.
- **Installer (`run.py`/`run.js`/`run.sh`) D1 parsing.** Wrangler
  changed its `d1 create` output from a TOML snippet to JSON;
  installers now accept both, with a bare-UUID fallback for any
  future format change.
- **Installer source archive missing `wrangler.toml`.** Releases
  ship `wrangler.template.toml` so the demo's real D1/R2 IDs
  aren't carried into installs. All three installers now copy
  the template into place when the working file is absent.
- **Installer password input was fully hidden.** Both `run.py` and
  `run.sh` now read from `/dev/tty` (so curl-piped invocations
  don't swallow script bytes as input) and show the last typed
  character in plain before masking on the next keystroke —
  clearer than blind input without exposing the password.
- **Markdown rendering — full GFM support.** Tables, fenced code
  blocks, blockquotes, horizontal rules, nested lists, underscore
  bold/italic, strikethrough, images, and bare-URL autolinks all
  now render. Replaced the NUL-byte sentinel in the inline-code
  protection (which made the source a binary file) with a split-
  based approach. Bare-URL autolinks now correctly strip trailing
  sentence punctuation.
- **Cover SVGs serve the cream/sage background** for posts without
  a stored hero image. Falls back to the live `/cover/<slug>.svg`
  template via a `?v=<template_updated_at>` cache-buster, so
  template edits invalidate cached covers immediately.
- **`/install` page restyled** to match the marketing palette
  (was inheriting admin dashboard's dark/cyan theme). Black primary
  button + cream background. The "Stuck? Use AI" pill no longer
  overlaps the step list. Re-instated the Browser-vs-Terminal
  chooser as the first step.
- **README/CLI docs replaced `npx pages-seo-install`** with the
  real working install one-liners. The CLI was never published to
  npm.

### Changed
- Migration: `blog_posts` gains `embedding`, `embedding_model`,
  `embedding_at` columns (all nullable; backfilled via the new
  `POST /api/admin/blog/embed-backfill` endpoint).
- Migration: `blog_post_redirects` table created lazily by the
  rename-slug endpoint. No separate migration needed.
- `/api/version` cache headers now include
  `stale-while-revalidate=86400` so a GitHub blip never breaks
  external consumers.

## 1.0.4 — 2026-05-21

### Added
- **Google Search Console auto-indexing.** On every blog publish and
  programmatic-page generation, pages-seo now also re-submits your
  sitemap to GSC and (optionally) pings each new URL via the
  Indexing API.
  - Configure via /admin → Settings → Search engines. Paste your
    service-account JSON; the rest is auto-detected.
  - Sitemap re-submit is on by default — ToS-compliant for any
    content type. Indexing API is opt-in via a checkbox (faster
    crawl pickup but technically against Google's ToS for non-job
    posting content).
  - Credentials live in the vault (AES-GCM, keyed off ADMIN_TOKEN)
    — never written to the D1 settings table directly.
  - "Test connection" button runs a live sitemap submission so you
    can verify the service account has Owner permission in GSC
    before the next cron run.
- New endpoints:
  - `GET /api/admin/google-search-console` — describe current config
  - `POST /api/admin/google-search-console` — save JSON + options
  - `DELETE /api/admin/google-search-console` — clear all
  - `POST /api/admin/google-search-console/test` — live test

### Changed
- Blog publish + programmatic generate-next now fire BOTH IndexNow
  (Bing/Yandex/Seznam) AND GSC (Google) auto-indexing when the
  respective credentials are configured. Best-effort, non-blocking
  — failures don't block the publish.

## 1.0.3 — 2026-05-21

Hotfix for v1.0.2.

### Fixed
- **Infinite-refresh bug** when visiting `/admin → Distribution → SEO`
  multiple times. The new widget-snippet UI in v1.0.2 was binding
  click/input listeners every time the SEO tab was activated, and
  the live preview was cache-busting `widget.js` on every keystroke.
  After a few tab switches every keystroke triggered N stacked
  `build()` calls each fetching a fresh widget.js — the browser
  surfaced this as constant network activity / "page is refreshing".
  Listeners are now bound once via a `_widgetWired` guard; the
  preview script loads from the normal cached URL.

## 1.0.2 — 2026-05-21

Content-quality + admin-UX release.

### Added
- **Light/dark mode** in /admin. Topbar toggle (☀ / ☾), persisted in
  localStorage. Applied before first paint so there's no
  flash-of-wrong-theme. Same accent + status colours in both modes.
- **Widget copy-paste, three flavours.** /admin → Distribution → SEO
  now has a proper embed-snippet card with:
  - tabs for JavaScript, iframe, and link-only flavours
  - inline Copy button with ⌘C fallback when clipboard is denied
  - "Customise" options panel (container id, heading, post count,
    light/dark/auto theme)
  - live preview that re-mounts on every change

### Changed
- **Workers AI default text model upgraded** from `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
  to `@cf/qwen/qwen3-30b-a3b-fp8`. Qwen3 is an MoE model that only
  activates ~3B params per token (latency similar to a 7B dense model)
  but produces noticeably better long-form prose. Set
  `env.WORKERS_AI_TEXT_MODEL` to override.
- **Default article length bumped** from 900–1300 words → **2500–4000 words**.
  Long-form ranks better for long-tail queries and has more share value.
  Operators who prefer shorter posts can edit `article_min_words`
  and `article_max_words` in /admin → Settings.
- **`max_tokens` raised** from 4096 → 8192 across all providers
  (Workers AI, Anthropic, OpenAI-compat chat completions). 4096 was
  truncating the longer articles mid-section.
- **Prompt threads length targets** properly now. Previous prompts
  hardcoded "900-1300 words" regardless of settings; new prompts
  read from `article_min_words`/`article_max_words` and scale H2
  count + FAQ depth to match (≥3000 words → 6-10 H2s, 5-8 FAQ Qs).
- **Explicit length enforcement** in the prompt — the model is told to
  count its own words before returning JSON and to expand the weakest
  H2 if it finishes short.

## 1.0.1 — 2026-05-21

Patch release. Fixes Update flow regressions surfaced while smoke-testing 1.0.0.

### Fixed
- `/api/admin/update/apply` was POSTing an empty JSON body to Cloudflare's
  Pages deployments endpoint, which returned 400 *"A 'manifest' field was
  expected in the request body"*. The endpoint actually wants a
  `multipart/form-data` body with a `branch` field for Git-linked projects
  (the manifest path is for Direct Upload only). Now sends the right shape.
- `install_method='maintainer'` installs (i.e. `seo.benjaminb.xyz` itself)
  couldn't trigger an in-app update — `can_apply` was hard-gated on
  `'browser'`. Both `'browser'` and `'maintainer'` produce Git-linked
  Pages projects, so both now share the redeploy hook.
- Admin Updates tab shows transient GitHub 502/403/429 as a yellow
  "try again in 30s" warning instead of a red broken-system error.
  (Cloudflare edge IPs share the 60 req/hr unauth GitHub pool;
  occasional 502s are expected on busy edges.)
- `/api/version`, `/api/changes`, `/api/admin/update` no longer attempt
  the deprecated OAuth-client-credentials Basic-auth path. Only
  `env.GITHUB_TOKEN` is honoured (deployments without one fall back to
  Cloudflare's shared unauth pool).

## 1.0.0 — 2026-05-21

First stable release. Everything below has shipped and is considered the
supported surface; future 1.x releases are bug fixes + additive features
that won't break existing installs.

### Highlights for new users
- **One-click browser install** at `seo.benjaminb.xyz/install` — sign in
  with GitHub, paste a Cloudflare API token, click Install. The full
  D1 + R2 + Pages + schema + admin user flow runs in ~3 minutes.
- **One-line CLI install**: `curl -fsSL seo.benjaminb.xyz/install/run.sh | bash`
  (also `.py` / `.js`). Idempotent — re-running on an existing install
  upgrades it in place without losing data.
- **AI bootstrap**: `seo.benjaminb.xyz/ai-setup` generates a self-contained
  prompt you paste into ChatGPT/Claude/Gemini if you'd rather hand the
  install to an LLM than do it yourself.
- **Diagnose-then-fix**: the AI prompt for /repair scans your live site
  before generating the prompt, so the LLM gets a punch-list of what's
  actually broken instead of running through a generic playbook.

### Added (this release)
- **Updates tab** in the admin dashboard. Shows the commit list
  between your installed version and upstream main, with diff stats
  and a one-click "trigger rebuild" for browser-installed sites.
- **System → Status** page with 12 health checks (D1 binding, R2 binding,
  Workers AI, self-repair secrets, GitHub source, fork sync, last deploy,
  etc.) and per-check "Fix" buttons.
- **/repair** page (public, no admin needed) — black-box-diagnoses any
  install when you paste a Cloudflare API token. Auto-detects the
  project, runs the full check suite, offers one-click fixes.
- **`/api/health`** liveness endpoint (200 if the worker + D1 are up).
- **`/api/version`** + **`/api/changes`** canonical endpoints used by
  the admin Updates tab — cached at the edge so all installs share a
  warm cache.
- **AI help card** on /admin → System → Stuck? Personalises a one-click
  link to /ai-setup with the user's own slug + URLs.

### Changed
- Browser installer now creates a fork automatically (rather than
  requiring the user to fork first), as long as the Cloudflare Workers
  and Pages GitHub App has access to the user's account.
- Admin password minimum lowered from 12 to 8 characters.
- `wrangler.toml` is no longer tracked in git; copy
  `wrangler.template.toml` to `wrangler.toml` after install if you
  want to deploy from CLI.

### Fixed
- `curl … | bash|python|node` installers now read from `/dev/tty`
  so prompts work when the script is piped from curl.
- Pages-create silently dropping D1/R2 bindings — installer now
  PATCHes the project config after creation as a belt-and-braces.
- `/api/version`, `/api/changes`, and `/api/admin/update` now
  authenticate against GitHub via `GITHUB_OAUTH_CLIENT_ID/SECRET` (or
  `GITHUB_TOKEN`) so Cloudflare edge IPs don't burn through the 60/hr
  unauth limit and start returning 502.
- Cover SVGs now ship base64-inlined backgrounds so the live `/cover/<slug>.svg`
  endpoint doesn't break when the R2 bucket has CORS oddities.
- Client-side WebP compression in the cover editor (10–15× smaller
  uploads).
- Multiple CodeQL findings (workflow permissions, error-stack leakage,
  double-escaping in scrape, command-injection in CLI).
