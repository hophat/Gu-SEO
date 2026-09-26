# Changelog

All notable changes to **pages-seo**. When you upgrade your install
via the Updates tab in the admin, the commit list shows the raw git
log — this file is the friendlier "what's new for me as an operator"
version.

The format is loosely Keep-a-Changelog, dates in ISO order.

## 1.24.0 — 2026-09-26

Gửi email qua Cloudflare Email Service, bỏ hoàn toàn SMTP.

### Changed
- **`functions/_lib/email_smtp.js` không còn nói SMTP nữa.** Toàn bộ client
  tự viết — mở `smtp.gmail.com:465` qua `cloudflare:sockets`, tự bắt tay
  EHLO/AUTH/MAIL FROM/RCPT TO/DATA, 207 dòng — đã bị xoá. Thay bằng một
  request `POST /accounts/{id}/email/sending/send`. Chữ ký `sendEmail()` và
  `sendOtpEmail()` giữ nguyên nên **không caller nào phải sửa dòng nào**.
- **Dùng REST API chứ không dùng `send_email` binding.** Binding là của
  Workers. Pages Functions chỉ hỗ trợ một tập binding cố định (KV,
  Durable Objects, R2, D1, Vectorize, Workers AI, service, queue, Hyperdrive,
  Analytics Engine) và không có email — wrangler từ chối cả config:
  `Configuration file for Pages projects does not support "send_email"`, làm
  hỏng **mọi** lệnh `wrangler pages`. Cách chính thức thay thế là service
  binding sang một Worker riêng; đó là thứ hai phải deploy, nên ở lại REST.
  Xem <https://developers.cloudflare.com/email-service/api/send-emails/rest-api/>
- Email nào có part `text/plain` đều được sinh tự động từ HTML. Trước đây
  gửi HTML-only: một số client không hiện gì, và thiếu text part làm tệ spam
  score.
- Mỗi lần gửi giờ mang `reply_to` / `from.address` — chính tả của REST, khác
  `replyTo` / `from.email` của binding.
- `MAIL_FROM` (tuỳ chọn) ghi đè địa chỉ gửi, nhận cả dạng `addr@domain` lẫn
  `"Tên" <addr@domain>`. Mặc định `no-reply@gulagi.com`.

### Removed
- **Secrets `GMAIL_USER` và `GMAIL_PASS` không còn được đọc.** Đã xoá khỏi
  Pages project `gu-seo`. Không cần app password nữa.
- `mailCredentials()` — helper chỉ dùng cho SMTP.

### Migration
1. Bật Email Sending cho domain gửi. **Phải làm trong Dashboard**:
   Compute & AI > Email Service > Email Sending > Onboard Domain. Lệnh
   `wrangler email sending enable <domain>` tương đương nhưng trả
   `Unauthorized [code: 2036]` trên account chưa bật beta.
2. Token `CF_API_TOKEN` phải có quyền **Email Sending: Send**. Cần thì tạo
   token mới:
   `wrangler pages secret put CF_API_TOKEN --project-name=<project>`.
   `CF_ACCOUNT_ID` đã có sẵn trong cách cài hiện tại.
3. Domain gửi không cần hộp thư. Email Service chỉ gửi, nên mọi địa chỉ
   `@<domain>` đều dùng được kể cả chưa tồn tại — nhưng mail gửi tới đó
   không nhận được. Muốn "Reply" tới hộp thư thật thì phải set `replyTo`.

Chưa cấu hình xong thì mọi lần gửi fail với `email_not_configured`, nêu rõ
thiếu gì.

## 1.23.0 — 2026-09-25

Hub-and-spoke, công cụ SEO nhúng được, và bộ tìm outreach.

### Added
- `/hubs` và `/hubs/<pillar>`: trang chủ đề theo `topic_seed`, mỗi pillar liệt kê toàn bộ bài trong cụm, có phân trang, breadcrumb và JSON-LD `ItemList`. Có wrapper `/<project>/hubs/...` cho host dùng chung.
- Mỗi bài viết trỏ ngược lên hub của nó ("Thuộc chủ đề: …"), breadcrumb JSON-LD thêm hub vào giữa Blog và bài, và `/blog` có rail chủ đề nổi bật. Header/footer mọi trang có link Chủ đề và Công cụ.
- `/tools/seo-check`: kiểm tra SEO on-page 16 tiêu chí, render server-side (không cần JavaScript), có chế độ `?embed=1` để nhúng iframe kèm link trở về. Mọi URL người dùng nhập đi qua `_lib/safe_fetch.js`: chặn IP nội bộ, chỉ cổng 80/443, kiểm tra lại từng chặng redirect, giới hạn 800KB/12s.
- `scripts/outreach.mjs`: tìm unlinked mention (trang nhắc tên thương hiệu nhưng không link) và broken link (link chết có thể thay bằng trang của bạn), tôn trọng `robots.txt`, một request cho mỗi URL duy nhất, xuất Markdown hoặc JSON. Không gửi email, không đăng comment.
- Index `idx_blog_topic_seed` trên `blog_posts` — `/hubs` và sitemap đều GROUP BY cột này.

### Fixed
- Sitemap im lặng bỏ sót URL: `fetchEntries` giới hạn cứng 5.000 bài blog và 10.000 prog page, nên trên kho 10.000 bài thì một nửa site mất đường đi từ sitemap và Google không còn tìm thấy. Đã bỏ cap, đặt trần 50.000 đúng giới hạn của Google, và chia urlset theo từng khối 5.000 URL (`/sitemap-pages.xml?part=N`) mà `/sitemap.xml` liệt kê đủ.
- `dev-server.js` hardcode tên D1 là `pages-seo`, nên trên install đã đổi tên mọi query im lặng fail và mọi route trả về trang rỗng. Nay đọc `database_name` từ `wrangler.toml`.
- Biểu thức chính quy `(?is)` làm hỏng bundle trên Node/V8 của dev server; chuyển sang cờ đặt sau literal.

## 1.22.1 — 2026-09-25

Sửa lỗi kết nối Threads bằng luồng OAuth chính thức của Meta.

### Fixed
- Threads dùng Threads App ID/Secret riêng, `threads.com/oauth/authorize`, endpoint `graph.threads.com`, và grant `th_exchange_token`; không gửi quyền Threads qua Facebook Login.
- Callback Threads dùng redirect URI riêng và kiểm tra profile trước khi lưu token.
- Settings nhận Threads App ID/Secret; secret chỉ lưu vault, không trả về client.

## 1.22.0 — 2026-09-25

Video mặc định kể đủ bài, dùng hình thật và nhạc nền free.

### Changed
- Default video length lên 60 giây, band hợp lệ 15–90 giây; lời đọc tự co theo từng beat thay vì kéo dài video.
- Đọc toàn bộ nội dung bài viết và visible text của website; fallback phủ đủ 12 intent, có quality gate trước TTS.
- Auto BGM chọn track Mixkit theo template; fetch lỗi chuyển sang voice-only, không tổng hợp pad.
- Before/after, logo, background và scene asset được kiểm tra thật; retry TTS không dùng audio cũ.

### Fixed
- Duration beat cộng chính xác, CTA/source tail không bị cắt khi fitting.
- Lỗi asset key kế thừa, scene data rỗng, sparse source và whitespace-only source không làm hỏng fallback.

## 1.21.0 — 2026-09-22

Video kể chuyện theo intent — 20 giây, có hình thật, không còn slideshow.

### Changed
- **Video ngắn lại còn 20 giây (mặc định), tối đa 45.** Trước đây độ dài
  video do độ dài lời đọc quyết định, nên một ý 20 giây thành video 79
  giây. Giờ storyboard chốt thời lượng từng cảnh trước, rồi lời đọc phải
  vừa: cảnh nào đọc quá slot thì agent **nói ít lại và đọc lại**, không kéo
  dài video. Đặt `VIDEO_DURATION` trong `video-agent/.env` để đổi.
- **Một engine cho mọi loại video.** `post`, `business`, `website`,
  `explainer` không còn mỗi loại một cấu trúc cứng. Agent phân loại **intent**
  (product_demo, local_business, educational, listicle, storytelling,
  announcement, testimonial, before_after, product_promotion) rồi chọn beat
  theo intent đó. `explainer` giờ là một gợi ý cho bộ phân loại.

### Added
- **Cảnh có hình thật.** Ảnh chụp website đặt trong khung điện thoại (có
  cuộn/zoom), before/after bằng hai ảnh thật, bản đồ Google Maps chụp bằng
  Chrome sẵn có (không cần API key), thẻ đánh giá sao, thẻ sản phẩm.
- **Chữ trên màn hình tối đa 8 từ** — caption, không phải câu.

### An toàn nội dung
- **Video không được bịa số.** Mọi con số hiển thị phải có trong nguồn.
- **Cổng chống slideshow.** Storyboard bị từ chối nếu phần thân chủ yếu là
  chữ không có gì để nhìn, hoặc nếu video giới thiệu sản phẩm mà không dùng
  asset thật nào.
- **Không lặp cảnh cùng loại liền nhau**; video ≥5 cảnh phải có ≥4 loại.

### Vận hành
- Agent nay gồm `render-video.mjs` + `storyboard.mjs` + `scenes.mjs` +
  `assets.mjs` — dùng `video-agent/deploy.sh`, đừng copy tay.

## 1.20.0 — 2026-09-22

Video minh hoạ nội dung bài viết — biểu đồ, sơ đồ, icon thay vì chỉ chữ.

### Added
- **Loại video `explainer`.** Cùng một bài viết, nhưng thay vì 4 câu tóm tắt
  trên ảnh nền, video dựng thành 5–9 cảnh có đồ hoạ: biểu đồ cột, vòng
  donut, đường xu hướng, thẻ số lớn, sơ đồ các bước, timeline, lưới icon,
  bảng so sánh nên/tránh, thẻ trích dẫn. Dài 45–75 giây. Video tóm tắt cũ
  vẫn nguyên — đây là loại thứ hai, chọn theo từng bài.
- **Nút "Video minh hoạ" trong tab Video 9:16.** Chọn bài viết đã xuất bản
  rồi tạo job; mỗi bài một video, tạo lại thì thay bản cũ.
- **Đồ hoạ vẽ bằng SVG/CSS tất định** — không thư viện chart, không CDN,
  không ảnh do AI sinh. Cùng một bài luôn ra cùng một video.

### An toàn nội dung
- **Video không được bịa số.** Mọi con số hiển thị phải xuất hiện trong
  chính bài viết (so khớp sau khi bỏ dấu phân cách, nên `1.000.000` trong
  bài khớp `1000000` trên biểu đồ). Cảnh vi phạm bị loại chứ không render.
- **GuRouter chết vẫn có video.** Không gọi được model thì agent tự rút
  cảnh từ bài viết (số liệu, danh sách, câu chốt) — job không hỏng vì thiếu
  model.

### Vận hành
- **`video-agent/deploy.sh`** — copy agent lên VPS rồi **so sha256 hai bên**
  trước khi báo thành công. Trước đây không có đường deploy nào cho agent,
  và đó là lý do một bản sửa nhạc nền nằm im trên `main` trong khi VPS vẫn
  render bản cũ.
- Agent cần thêm file `video-agent/explainer.mjs` — dùng `deploy.sh`, đừng
  copy tay.

## 1.19.0 — 2026-09-21

Video 9:16 cho bài blog — render HyperFrames trên VPS riêng.

### Added
- **Pipeline video 9:16 tự động.** Mỗi bài mới xuất bản được tạo job trong
  bảng `video_jobs` (migration 007, additive). Agent trên VPS render
  (Node 22 + HyperFrames + FFmpeg + headless Chrome) claim bài qua
  `POST /api/admin/video/claim` (atomic, job failed tự hồi phục ở tick
  sau), viết kịch bản tiếng Việt qua GuRouter, lồng tiếng bằng edge-tts
  (free, không key), dựng composition 720×1280 với ảnh hero làm nền rồi
  trả MP4 về R2 qua `POST /api/admin/video/deliver`.
- **Tab Video 9:16 trong admin** — hàng chờ video: trạng thái, xem/tải
  MP4, lỗi render, thống kê. Backend `GET /api/admin/video/list`.
- **Đăng video lên Facebook.** Kênh Facebook có cờ cấu hình `as_video`:
  khi bài đã có video, social queue upload MP4 lên `/{page-id}/videos`
  (URL bài viết nằm trong description). Mặc định tắt — không bật thì
  vẫn đăng link như cũ.
- **systemd timer trên VPS** — agent poll mỗi 15 phút, không cần chạy tay.

### Fixed
- Kịch bản JSON bị model cắt cụt (max_tokens) không còn giết job —
  agent tự vá chuỗi hở rồi fallback regex theo schema 3 trường.

### Vận hành
- VPS cần: Node 22 + FFmpeg + Chromium deps + `pip3 install edge-tts`
  (xem `video-agent/setup.sh`). Agent auth bằng ADMIN_TOKEN trong
  `video-agent/.env` (0600).

## 1.18.5 — 2026-09-20

Tạo ảnh hero miễn phí vĩnh viễn.

### Added
- **Provider ảnh Pollinations.ai — free, không cần API key.** Đăng ký cuối
  trong `IMAGE_PROVIDERS` làm lưới an toàn vĩnh viễn: khi Workers AI lỗi hoặc
  thiếu binding, ảnh hero vẫn được tạo qua GET thuần đến
  `image.pollinations.ai` (model Flux, 1200×630), không cần key nào cả.
  Chi phí ghi vào `ai_usage` là 0. Lưu ý: tier ẩn danh có watermark nhỏ —
  đăng ký free Pollinations để bỏ.
- **Platform tests: 154 checks** (thêm 2). Bất biến mới: `pollinations` phải
  luôn có mặt trong `listProviders().image` kể cả trên env rỗng (chuỗi image
  provider không bao giờ cạn), và phải đứng cuối để provider có key giữ ưu
  tiên.

### Không cần làm gì
- Đường chính vẫn là Workers AI free tier (10.000 Neurons/ngày ≈ 57–170 ảnh).
- Muốn chi phí 0 tuyệt đối + hero mang brand: Settings → `hero_image_mode`
  = `cover` và thiết kế 1 template mặc định trong tab Covers.

## 1.18.4 — 2026-09-16

Duyệt custom domain + misc UI.

### Added
- **Luồng duyệt custom domain.** Tenant lưu domain chỉ tạo yêu cầu pending
  (kèm notice cho admin + hướng dẫn CNAME ngay lúc submit, nhấn mạnh domain
  chỉ chạy khi vừa được duyệt vừa có CNAME). Page **Duyệt domain**
  (super_admin) liệt kê hàng chờ — Duyệt thì hệ thống tự gắn hostname lên
  Pages project bằng key global rồi flip live, Từ chối thì hủy. Migration 006.
- **Tab API keys trong Cài đặt** (bị sót ở bản trước, gộp vào release này).

### Fixed
- **Page Người dùng hiện tên project** thay vì id thô.

## 1.18.3 — 2026-09-16

Tự gắn domain trên production + tab API keys.

### Fixed
- **Auto-attach domain đọc thêm credentials `CLOUDFLARE_*`.** Production chỉ có
  secrets của CLI installer nên bản trước im lặng bỏ qua. Thiếu `CF_PROJECT`
  thì tự tìm project đang serve hostname (URL `*.pages.dev` suy trực tiếp,
  custom domain khớp qua list projects).
- **Tab API keys trong Cài đặt (super_admin).** Backend `/api/admin/secrets`
  có sẵn nhưng chưa có UI nào gọi — giờ nhập/xóa key và model override ngay
  trong Settings, key mã hoá trong D1, không bao giờ hiện plaintext.

## 1.18.2 — 2026-09-15

Sửa wizard kẹt ở bước lịch nội dung.

### Fixed
- **Lưu Brand DNA xong giờ lên lịch thật trước khi sang preview.** `planCalendar`
  tồn tại nhưng không ai gọi, nên bước Lịch hiện "0 bài viết" và nút Hoàn tất
  luôn 409. Giờ `saveBrandDna` gọi planner rồi mới chuyển bước; lỗi plan thì ở
  lại kèm lý do, bấm Lưu lại để thử tiếp.
- **Nút "Lên lịch lại"** khi danh sách rỗng — popup blocking mode không có
  đường thoát nên không được để kẹt.

## 1.18.1 — 2026-09-15

Tự gắn custom domain lên Cloudflare khi lưu.

### Fixed
- **Lưu tên miền giờ tự gắn hostname vào Pages project.** Trước đây
  `POST /api/admin/projects/domain` chỉ ghi D1 nên domain nhập xong vẫn
  không chạy — user phải mò vào dashboard gắn tay mà không được báo. Giờ
  endpoint tự gọi CF API bằng secrets self-repair có sẵn (idempotent, xóa
  domain thì tự gỡ nếu không ai dùng nữa). Lỗi CF không làm mất bản lưu,
  chỉ báo trạng thái để UI hướng dẫn thêm tay.
- **Admin hiện trạng thái gắn Cloudflare** sau khi lưu và trong hộp domain:
  đã gắn / đã lưu nhưng phải thêm tay / site thiếu quyền tự gắn.

## 1.18.0 — 2026-09-15

Chặn farm tài khoản bằng biến thể dot của Gmail + chống spam OTP.

### Added
- **Phát hiện trùng mailbox, không chỉ trùng chuỗi email.** Gmail bỏ qua dấu
  chấm (`g.u.l.a.g.i@gmail.com` = `gulagi@gmail.com`) nên check
  `email_already_exists` cũ so sánh chuỗi là lọt. Cột mới
  `users.email_canonical` lưu dạng gộp (chỉ Gmail/googlemail — Outlook và các
  nhà khác giữ nguyên vì dấu chấm ở đó là thật), check ở cả 3 cửa: gửi OTP,
  đăng ký, admin tạo user. `users.email` vẫn là địa chỉ thật để gửi mail.
- **Migration 005 + endpoint recanonicalize.** Backfill an toàn (`lower(email)`
  trong SQL, phần gộp dot chạy bằng đúng hàm JS của app qua
  `POST /api/admin/users/recanonicalize`, super_admin only). Endpoint báo cáo
  các mailbox bị trùng sau khi gộp để operator xử lý tay — không tự xóa.
- **Chống spam/farm OTP ở `send-otp`:** cooldown 60s mỗi email
  (`429 otp_cooldown`) và tối đa 10 OTP/giờ mỗi IP (`429 otp_rate_limited`,
  tái dùng bảng `login_attempts`, không cần migration mới).
- **Check song song không lọt:** UNIQUE index trên `email_canonical` là chốt
  chặn cuối, lỗi race trả 409 thân thiện thay vì 500. Mọi query đều fallback
  về exact-email khi DB chưa chạy migration 005 — cột thiếu không bao giờ
  cho qua lén.

### Notes for operators
- Sau deploy, gọi một lần `POST /api/admin/users/recanonicalize` để gộp các
  row Gmail cũ và xem báo cáo `duplicates`.
- Verify trên production: `g.u.l.a.g.i@gmail.com` khi `gulagi@gmail.com` đã
  tồn tại → 409 `email_already_exists`; spam OTP 2 lần trong 60s → 429.

## 1.17.0 — 2026-09-15

Chặn đăng ký bằng địa chỉ dạng tên+phụ (plus-addressing).

### Added
- **Từ chối email dạng `ten+phu@domain`.** Mọi nhà cung cấp lớn đều giao
  `ban+batky@` về cùng một hộp thư, nên đây là cách rẻ nhất để biến một hộp
  thư thành vô số tài khoản free. Trả `400 subaddress_not_allowed` kèm giải
  thích, không phải chỉ "email không hợp lệ".
- **Kiểm tra ngay trên form đăng ký** để người dùng biết trước khi mất một
  lượt OTP, thay vì chỉ biết sau khi bấm gửi.

### Changed
- **`functions/_lib/email_rules.js` — một chỗ duy nhất cho luật email.**
  `validEmail` trước đây bị copy y hệt ở **3 file** (`public/register.js`,
  `public/send-otp.js`, `admin/users.js`). Cùng loại trùng lặp đã làm bộ
  dispatch provider lệch ba lần. Một luật về việc ai được tạo tài khoản thì
  phải giống nhau ở mọi cửa.
- **Áp dụng ở cả 3 cửa tạo tài khoản:** gửi OTP, đăng ký, và admin tạo user.
  `send-otp` chặn trước khi sinh OTP (không tốn công, không ghi row).

### Added (tooling)
- **Platform tests: 146 checks** (was 136). Kiểm tra: dấu `+` chỉ bị chặn ở
  phần local (dấu `+` trong domain là hợp lệ — vài host dùng thật),
  `send-otp` từ chối trước khi sinh OTP, đăng ký từ chối **kể cả khi đã có
  OTP hợp lệ**, admin tạo user cũng bị chặn, không file nào tự viết lại
  `validEmail`, và cả 3 cửa đều dùng policy chung.

### Notes for operators
- Verify trên production: `gulagi.com+secretcheck@gmail.com` → 400
  `subaddress_not_allowed`; email thường vẫn nhận OTP bình thường.
- Đã dọn row `email_verifications` dạng `%+%` còn sót từ lúc test.

### Điều còn hở (chưa làm vì bạn chưa yêu cầu)
- **Dấu chấm trong Gmail** vẫn lách được: `g.u.l.a.g.i@gmail.com` và
  `gulagi@gmail.com` là **cùng một hộp thư** với Gmail, nhưng hiện vẫn được
  coi là hai tài khoản. Chặn dấu chấm sẽ từ chối cả người dùng thật có dấu
  chấm trong địa chỉ, nên cách đúng thường là **chuẩn hoá để kiểm tra trùng**
  (bỏ dấu chấm + bỏ phần sau `+` khi so trùng) thay vì từ chối. Nói rõ ở đây
  để không ai tưởng đã chặn hết.
## 1.16.1 — 2026-09-15

Thông tin đăng nhập hộp thư gửi chuyển từ hardcode sang Pages secrets.

### Security
- **Bỏ hardcode `GMAIL_USER` / `GMAIL_PASS` khỏi `functions/_lib/email_smtp.js`.**
  Trước đây ai đọc được repo là gửi được mail dưới địa chỉ đó. Giờ đọc từ
  `env.GMAIL_USER` / `env.GMAIL_PASS`, và thiếu thì báo lỗi có tên
  (`email_not_configured: missing GMAIL_USER`) thay vì lỗi SMTP 535 khó hiểu.
  Đã set secret trên Pages project.
- **Mật khẩu này vẫn nằm trong git history (3 commit).** Xoá khỏi file KHÔNG
  xoá khỏi lịch sử, nên **bắt buộc phải rotate** App Password trong Google
  Account. Việc chuyển sang secret chỉ có ý nghĩa sau khi rotate.

### Changed
- **`sendEmail(env, {...})` và `sendOtpEmail(env, {...})` nhận `env`.** Không
  có `env` thì secret không bao giờ tới được hàm gửi. Cả 4 caller đã cập nhật:
  `send-otp`, `weekly-digest`, `report/test`, `publishing/report`.
- **App Password có khoảng trắng được chuẩn hoá.** Google hiển thị dạng
  `abcd efgh ijkl mnop` nhưng SMTP cần dạng liền. Giờ dán nguyên văn bản hiển
  thị vẫn chạy, thay vì fail auth với 535.

### Added (tooling)
- **Platform tests: 136 checks** (was 129). Kiểm tra: đọc từ env, chuẩn hoá
  khoảng trắng, thiếu cấu hình thì báo đúng tên biến thiếu, **không file nào
  trong `functions/`, `src/` hay `wrangler.template.toml` còn chứa mật khẩu
  hoặc địa chỉ hộp thư**, và cả 4 caller đều truyền `env`.

### Notes for operators
- Đã verify trên production: `POST /api/admin/report/test` → 200, và
  `POST /api/public/send-otp` → 200. Cả hai đường email chạy từ secret.
- **Việc cần làm:** rotate App Password tại
  https://myaccount.google.com/apppasswords rồi cập nhật lại:
  `wrangler pages secret put GMAIL_PASS --project-name=gu-seo`
## 1.16.0 — 2026-09-15

Email báo cáo sau khi bài viết lên sóng.

### Added
- **Gửi email khi bài đã đăng, kèm tình trạng phân phối lên Facebook.**
  Người nhận là **toàn bộ người dùng của dự án** (`users.project_id`), không
  phải super_admin đang đăng nhập. Nội dung: tiêu đề, mô tả, liên kết bài trên
  blog, và một dòng cho mỗi kênh mạng xã hội với trạng thái thật + link bài
  đăng + lý do lỗi nếu thất bại.
- **Chỉ gửi cho bài được tạo từ lịch nội dung.** Lịch là chỉ thị thường trực
  của người vận hành ("viết và đăng bài này vào ngày đó"); bài họ tự đăng tay
  là bài họ đã tận mắt xem, gửi thêm chỉ là nhiễu. Tín hiệu đáng báo là "thứ
  bạn đặt lịch từ mấy tuần trước đã lên sóng".
- **Công tắc tắt/bật trong Cài đặt** (`publish_report_email`). Mặc định bật.
  Email là thứ duy nhất ở đây đi ra ngoài hệ thống, nên cần một cách dừng lại
  mà không phải deploy.
- **`POST /api/admin/report/test`** (super_admin) — hai chế độ: không tham số
  thì gửi email mẫu để kiểm tra SMTP; có `blog_post_id` + `project_id` thì chạy
  **báo cáo thật** cho bài đó, đầy đủ các điều kiện. Đây là thứ biến tính năng
  từ "code trông có vẻ đúng" thành "đã chạy thật".

### Changed
- **`email_smtp.js` tách hàm `sendEmail({ to, subject, html })`.** Trước đây
  `sendOtpEmail` làm toàn bộ phần bắt tay SMTP ngay trong thân hàm, nên thêm
  một loại email thứ hai đồng nghĩa với việc copy lại toàn bộ. `sendOtpEmail`
  giờ chỉ còn là phần nội dung.
- **`cloudflare:sockets` được import lazy.** Nó chỉ resolve trong Workers, nên
  import tĩnh khiến module không load được ở bất kỳ đâu khác — kể cả test.

### Notes on the design
Báo cáo được gửi **sau khi** hàng đợi phân phối chạy xong, không phải trước.
Gửi trước thì lúc nào cũng báo "đang chờ đăng" — đúng thứ một báo cáo không
được phép làm. Nếu kênh vẫn đang thử lại, email nói thẳng là đang thử lại,
kèm số lần đã thử.

Mọi lỗi gửi mail đều bị nuốt có chủ đích: email là thông báo, một SMTP hỏng
không được biến một lần đăng bài thành công thành lỗi.

### Added (tooling)
- **Platform tests: 129 checks** (was 117). Kiểm tra: người nhận đúng là user
  của dự án (và không ai khác), dự án không có user thì không gửi chứ không
  fallback, chỉ bài từ lịch mới tính là "đã lên lịch", bài đăng tay không gửi,
  bài đang chờ duyệt không gửi, công tắc tắt hoạt động, và phần render: tên
  kênh, trạng thái thật, link bài đăng, lý do lỗi, số lần thử, và escape HTML.

### Notes for operators
- Thử ngay: `POST /api/admin/report/test` (không tham số) → email mẫu về hộp
  thư của bạn.
- **Thông tin bảo mật:** thông tin đăng nhập hộp thư gửi (`gulagi.com@gmail.com`)
  vẫn đang **hardcode trong `functions/_lib/email_smtp.js`**. Đây là tình trạng
  có trước, không phải thay đổi của bản này, nhưng nghĩa là ai đọc được repo là
  gửi được mail dưới địa chỉ đó. Nên chuyển sang Pages secrets.
## 1.15.1 — 2026-09-15

"Lên lịch thất bại" khi bấm qua bước cuối của trình thiết lập. Cùng một loại
bug đã sửa ở v1.14.2, nhưng còn hai bản sao nữa chưa tìm ra.

### Fixed
- **`raw_llm.js` có bản sao thứ ba của bộ dispatch provider.** Nó tự viết
  `switch (name)` phủ 5 trong 10 provider, thiếu `gurouter` — nên bộ lập lịch
  (dùng `callRawLLM`) chết với `unknown_provider: gurouter` dù key hợp lệ.
  Comment trong file tự thú: *"same shape as brand-dna.js but trimmed...
  refactoring touches too much"*. Giờ dispatch qua `runTextProvider()`.
- **`raw_llm.js` không đọc `default_ai_provider`.** Trình thiết lập gọi nó
  không kèm provider, nên nó rơi về thứ tự registry — **Workers AI trước** —
  tức đúng cái provider mà người vận hành đặt mặc định để tránh, vì nó đã hết
  quota miễn phí.
- **`brand-filter-queue.js` có bản sao thứ tư.** Cùng bệnh, cùng cách sửa.

### Fixed (audit trail)
- **`audit()` không được `await` khi ghi secret, nên bản ghi bị mất.** Promise
  không await và không đưa vào `waitUntil()` có thể bị huỷ khi response được
  gửi đi — và D1 write là đúng loại bị rơi. Hậu quả thực tế: khi key GuRouter
  bị đổi thành giá trị 15 ký tự lúc 14:34, **không có cách nào biết ai đổi và
  đổi lúc nào**. Giờ `await` cho `secret_set` / `secret_delete`, kèm `length`
  của giá trị (không bao giờ ghi giá trị).

### Added
- **`providers/test` báo `key_length` khi lỗi xác thực.** `401 Invalid token`
  đọc lên như "key sai", nhưng nguyên nhân phổ biến hơn nhiều là **dán thiếu**.
  Giờ response kèm độ dài key đã lưu (không kèm giá trị) và một gợi ý, nên
  "Invalid token" thành "key dài 15 ký tự — đó không phải là key".

### Added (tooling)
- **Platform tests: 117 checks** (was 112). Thay vì kiểm tra từng file, test
  quét **cả cây `functions/`** cho hai bất biến:
  - chỉ **một** file được định nghĩa provider dispatch, và nó là registry;
  - **không file nào** được tự viết lại thứ tự ưu tiên provider.
  Đây là loại bug đã ship ba lần; kiểm tra theo file sẽ bỏ sót bản sao thứ tư.
## 1.15.0 — 2026-09-15

Cấu hình AI provider trở thành quyền của super_admin, và bỏ hẳn khỏi trình
thiết lập.

### Changed
- **Bỏ bước "AI Provider" khỏi trình thiết lập.** Wizard còn 3 bước:
  Thương hiệu → Brand DNA → Lịch nội dung. Cả bản React (`/admin`) và bản cũ
  (`/admin-old`) đều bỏ.
  Lý do: khoá provider là **cấu hình nền tảng** — một deployment có một bộ khoá
  dùng chung cho mọi dự án. Tenant dán khoá riêng vào đây sẽ ghi đè khoá của
  toàn bộ deployment, hoặc bị bỏ qua. Không có trường hợp nào đúng.

### Security
- **`/api/admin/secrets` giờ yêu cầu super_admin cho cả GET, POST và DELETE.**
  Trước đây chỉ có `adminGate`, nghĩa là **bất kỳ project_admin nào cũng đọc
  và ghi được khoá provider của nền tảng**. Ghi thì phá mọi tenant khác; đọc
  thì lộ nền tảng đang chạy provider nào.
- **`/api/admin/providers` (GET) và `/api/admin/providers/test` (POST) cũng
  vậy.** `providers/test` đặc biệt quan trọng: mỗi lần gọi là một request
  **có tính tiền** tới provider, nên tenant không được phép tiêu credit của
  nền tảng.
- Bearer `ADMIN_TOKEN` vẫn tương đương super_admin (đúng như thiết kế — đó là
  credential bootstrap/recovery).

### Added (tooling)
- **Platform tests: 112 checks** (was 105). Test lockdown dùng **session thật**
  (user row + session row + cookie đã ký) chứ không dùng bearer — bearer bỏ qua
  kiểm tra role theo thiết kế, nên test bằng bearer sẽ không chứng minh được gì.
  Kiểm tra: tenant không ghi/đọc được khoá, không list được provider, không
  chạy được test tính tiền, super_admin vẫn vào được, và cả hai wizard đều
  không còn bước provider.

### Notes for operators
- Không cần migrate. Chỉ cần deploy.
- Nếu bạn đăng nhập bằng tài khoản có `role` trống, tài khoản đó được coi là
  super_admin (giữ tương thích ngược với các tài khoản tạo trước khi có cột
  `role`).
## 1.14.3 — 2026-09-15

Brand DNA giờ tuân theo provider mặc định do người vận hành đặt.

### Fixed
- **`default_ai_provider` bị bỏ qua ở đúng màn hình cần nó nhất.** Setting này
  đã tồn tại và được `blog/text`, `prog/generate-next`, `refresh/run`,
  `preview-sample` dùng — nhưng `brand-dna.js` thì không, nó chỉ đọc provider
  từ request body rồi rơi về thứ tự registry (Workers AI trước).
  Nghĩa là: người vận hành đặt provider mặc định **chính vì** Workers AI hết
  quota, rồi vào trình thiết lập và vẫn nhận lỗi Workers AI — không có cách
  nào đoán ra tại sao.
  Giờ `callForBrandDNA` đọc setting, và `generateContent` cũng đọc nó như một
  fallback để caller lỡ quên truyền vẫn đúng.
  Thứ tự ưu tiên: request rõ ràng → setting → thứ tự registry.

### Added (tooling)
- **Platform tests: 105 checks** (was 102). `orderProviders` được export để test
  trực tiếp: ưu tiên rõ ràng nhảy lên đầu, không có ưu tiên thì giữ thứ tự
  registry, ưu tiên không tồn tại không được làm lỗi hay đổi thứ tự, và
  provider chưa cấu hình bị loại khỏi danh sách. Cùng với: cả hai entry point
  (`brand-dna`, `generateContent`) đều phải đọc `default_ai_provider`.

### Notes for operators
- Đặt provider mặc định ở **Cài đặt → AI → Provider mặc định**. Trên bản triển
  khai này nó đang là `gurouter`.
- Nếu key provider bị từ chối, `Cài đặt → Provider → Kiểm tra` cho biết lý do
  thật. Key GuRouter (new-api) dài **48 ký tự**, có tiền tố `sk-` — key 15 ký
  tự là bị cắt khi dán, và nó trả về `401 Invalid token` chứ không phải lỗi
  rõ ràng về định dạng.
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
