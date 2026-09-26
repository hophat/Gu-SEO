# R&D: nền tảng cho phép đăng công khai lặp lại ~10.000 mục để lấy backlink

Khảo sát: **2026-09-25 UTC**. Mọi dòng "verify" = probe HTTP thật từ máy khảo sát hoặc
fetch tài liệu gốc của nền tảng (không phải blog SEO).

> Lưu ý phương pháp: `web_search` của harness lỗi 401 (endpoint search), Bing trả
> SERP giả cho scraper, DDG trả HTTP 202 rỗng. Nên toàn bộ số liệu dưới đây lấy
> bằng probe HTTP + fetch doc/API gốc (`curl`, `/tmp/fetch.py`).

## 0. Chuẩn hoá câu hỏi

"Đăng list ~10.000 mục lặp lại để lấy backlink" là 3 kịch bản khác nhau, rủi ro khác nhau:

| Mã | Kịch bản | Ai chịu rủi ro | Ví dụ |
|---|---|---|---|
| S1 | 10.000 bài list trên domain của nền tảng khác | Nền tảng + domain mình | dev.to, Medium, WP.com, Tumblr |
| S2 | 10.000 trang trên domain/subdomain mình | Mình | Cloudflare Pages, GitHub Pages, is-a.dev |
| S3 | 1 list page chứa 10.000 mục (+ 10.000 entry page) | Mình | Toolkit pages-seo hiện có |

S3 rẻ và ít rủi ro nhất, S2 trung thực nhất, S1 rủi ro + chi phí vận hành cao nhất.

## 1. Probe log (bằng chứng thô)

| Endpoint | Status | Đọc ra |
|---|---|---|
| `POST https://dev.to/api/articles` | 401 `{"error":"unauthorized"}` | API publish của Forem còn sống, cần API key |
| `POST https://gql.hashnode.com` | 301 → `hashnode.com/changelog/2026-05-13-graphql-api-paid-access` | Hashnode **đã bỏ free GraphQL API**, bắt buộc Pro |
| `POST https://api.tumblr.com/v2/blog/x/posts` | 401 `Unauthorized` | API còn sống |
| `POST https://api.pinterest.com/v5/pins` | 401 `Authentication failed` | API còn sống |
| `POST https://mastodon.social/api/v1/statuses` | 401 `access token is invalid` | API còn sống, giới hạn theo instance |
| `POST https://api.github.com/gists` | 401 | Còn sống |
| `POST https://write.as/api/posts` | 400 `Supply something to publish.` | Write.as **có API publish** (POST-only) |
| `POST https://api.telegra.ph/createAccount` | 200 `{"ok":false,"error":"SHORT_NAME_REQUIRED"}` | Telegra.ph: tạo account không cần auth |
| `POST https://api.telegra.ph/getPage` | 200 `UNKNOWN_METHOD` | Không có API publish thật |
| `POST https://neocities.org/api/site_settings` | 404 `the requested api call does not exist` | Neocities không có API |
| `POST https://public-api.wordpress.com/rest/v1.1/sites` | 404 | Cần đúng site + auth; chưa verify sâu |
| `https://api.medium.com/...` | 000 connection refused | Network khảo sát bị chặn, chưa verify live |
| `https://support.reddithelp.com/.../Spam` | 403 | Không đọc được policy Reddit |

## 2. Bảng nền tảng

`rel` = thuộc tính link ra ngoài trong body (NO-REL = dofollow), đo trực tiếp trên
trang thật bằng cách đếm `<a href="http…">` không có `rel`.

| Nền tảng | API publish | Free | Giới hạn tần suất | `rel` link body | Trần thực tế (bài/tuần) | Ghi chú chính sách |
|---|---|---|---|---|---|---|
| **dev.to** (Forem) | Có, `POST /api/articles` verify | Có | Không tài liệu hoá, chặn server-side (429) | **NO-REL → dofollow** (verify) | Vài chục bài chất lượng | Cộng đồng chống spam; lịch sử suspend account đăng hàng loạt |
| **Hashnode** | Có nhưng **đã thu phí** (Pro) | Không còn free | Yêu cầu Pro plan | NO-REL (verify, trang chủ) | 0 (bị chặn API free) | Changelog 2026-05-13 nói rõ lý do: scraper/spam farm mirror bài |
| **Medium** | Có, integration token (`POST /v1/users/{id}/posts`) | Có | Không có endpoint bulk | Chưa verify (network bị chặn) | Vài bài thật | Không có công cụ đẩy hàng loạt |
| **WordPress.com** | REST v1.1 | Có (nhiều site) | Rate limit theo site | NO-REL (verify trang chủ) | Trung bình, nhưng site dễ bị freeze khi spam | Automattic cấm spam; footprint nhiều site = dấu hiệu |
| **Blogger** | API v3 (OAuth) | Có | Quota Google chung | Dofollow (chưa đo trên post thật) | Trung bình | Giới hạn số blog/tài khoản (chưa verify) |
| **Tumblr** | API v2 verify | Có | 18.000 call/giờ/IP; 1.000 call/giờ/consumer key; giới hạn post/ngày (doc) | Chưa đo trên post thật | ~250–1.000 post/ngày / key | Nhiều blog mới = spam signal |
| **Pinterest** | API v5 verify | Có | Rate limit theo user | Trang chủ có 1 link `nofollow`; pin chưa đo | Hàng trăm pin/tuần | Pin link thường không mang anchor text kiểm soát |
| **Mastodon** | API v1 verify | Có | Theo instance | N/A (không kiểm soát) | Hàng trăm | Không có domain riêng kiểm soát |
| **Write.as** | `POST /api/posts` verify | Có | Chưa verify | NO-REL (verify) | Chưa rõ | Ít dùng, index yếu |
| **Telegra.ph** | Chỉ `createAccount`, không có API publish | Có | Không rõ | Chưa đo | ~0 (không lập trình được) | Không phải lựa chọn cho 10k |
| **Neocities** | Không có API (404 verify) | Có | Dung lượng site free | NO-REL (verify) | Phải upload tay | Không scale được bằng script |
| **is-a.dev** | Đăng ký subdomain qua PR GitHub | Có | Theo repo PR | NO-REL (verify) | Hàng nghìn subdomain | Chỉ dành cho dev tools, không phải blog |
| **Codeberg Pages / GitHub Pages** | Có (push = build) | Có | Theo quota build | Dofollow | Hàng nghìn trang | An toàn nhất về ToS trong nhóm "không phải nền tảng bên thứ ba" |

## 3. Số học cho ngưỡng 10.000

- **dev.to**: không có limit publish công khai. 10.000 bài/ngày = spam lộ liễu, dễ bị
  khóa ngay. Thực tế dùng để syndicate nội dung thật: 5–20 bài/tuần.
- **Tumblr**: 1.000 call/giờ/key. 1 post = 1 call ⇒ cần ≥ 10 key + 10+ blog mới để đạt
  10.000 trong 1 ngày. Hệ số rủi ro phát hiện gần như 1.
- **WordPress.com / Blogger**: cần 10.000 bài trên vài site ⇒ dấu vết spam rõ, vài tuần là
  mất site.
- **Neocities/Telegra.ph**: không có đường lập trình ⇒ loại.

Kết luận ngưỡng 10.000: **S1 không khả thi bền vững**. Tối đa bền được là vài trăm bài
trải trên nhiều nền tảng, mà mỗi bài vẫn phải có giá trị đọc.

## 4. Chính sách Google (trích nguyên văn, nguồn gốc)

Từ `https://developers.google.com/search/docs/essentials/spam-policies` (fetch 2026-09-25):

> Link spam … includes: Buying or selling links for ranking purposes … **Using automated
> programs or services to create links to your site** … **Low-quality directory or bookmark
> site links** … Widely distributed links in the footers or templates of various sites …
> Creating low-value content primarily for the purposes of manipulating linking and ranking
> signals.

> Scaled content abuse is when many pages are generated for the primary purpose of
> manipulating search rankings and not helping users … Examples include: … **Scraping feeds,
> search results, or other content to generate many pages** … **Creating multiple sites with
> the intent of hiding the scaled nature of the content** …

→ 10.000 list post tự động rơi đúng vào 3 mục: automated link creation, low-quality
directory link, scaled content abuse. Bing không đọc được tài liệu (render bằng JS từ
network này) nhưng chính sách tương đương.

## 5. Khuyến nghị

1. **Đổi hướng chính**: dùng **S2/S3** — 10.000 entry trên domain của mình. Toolkit
   `pages-seo` trong repo này đã làm đúng việc đó; không cần bên thứ ba.
2. **S1 chỉ dùng làm kênh distribution cho nội dung thật**: 1 bài/tuần trên dev.to/Medium
   có insight thật, link về 1 landing page cụ thể. Tính như brand mention, không tính
   như nguồn link chính.
3. **Tránh tuyệt đối**: Fiverr/Upwork gig bán backlink, guest post network, PBN, expired
   domain, link widget/footer, comment signature — Google ghi tên từng loại.
4. **Đo thay vì đoán**: sau khi đẩy bất kỳ nhóm link nào, kiểm tra IndexNow/Google
   Search Console coverage + `site:` trước khi scale thêm.

## 6. Open items (chưa verify được từ network này)

- Rate limit publish chính xác của dev.to (không có trong Redoc công khai).
- Hashnode Pro giá bao nhiêu (page changelog chặn JS).
- Automattic API Terms hiện hành (URL cũ trả 404).
- `rel` link thật trong post Medium / Pinterest pin / Tumblr (cần account hoặc bị chặn).
- Telegra.ph có chống lạm dụng ở mức nào.

## 7. Nguồn

- `https://developers.google.com/search/docs/essentials/spam-policies`
- `https://hashnode.com/changelog/2026-05-13-graphql-api-paid-access`
- `https://github.com/Medium/medium-api-docs` (README)
- `https://developers.forem.com/api/v1`
- `https://www.tumblr.com/docs/en/api/v2` (mục Rate Limits)
- `https://is-a.dev/`
- Probe HTTP trực tiếp vào các endpoint ở mục 1.
