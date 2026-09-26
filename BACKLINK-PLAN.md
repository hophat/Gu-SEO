# BACKLINK-PLAN

Plan cho phần còn thiếu sau v1.24.0. Mục tiêu: biến hạ tầng đã xong thành link thật.

Bối cảnh đã xác minh (2026-09-26):

- Production: `gulagi.com` đi qua Worker `gulagi-blog-router`; Pages project `gu-seo` phục vụ `seo.gulagi.com` + 8 domain khác.
- `/hubs` và `/tools/*` đã có trong allowlist route của Worker (thêm 2026-09-26).
- 43 project trong D1; phần lớn dùng path-style `seo.gulagi.com/<slug>`. Wrapper `[project]/hubs` chạy đúng thật.
- Sitemap ở domain apex là view của 1 project; ở `gu-seo.pages.dev` là view toàn bộ. Không phải lỗi.

## P0 · Outreach trên dữ liệu thật

Lane C mới chỉ chạy trên fixture. Chạy trên URL thật, xuất Markdown + CSV, rồi gửi email thủ công.

1. Dựng corpus ứng viên từ site cùng ngành (sitemap + kết quả tìm kiếm).
2. `node scripts/outreach.mjs --brand <từ khóa> --urls <file> --out outreach/<ngày>.md`.
3. Rà lại output: bỏ mention trùng lặp, bỏ site không thật.
4. Viết email theo từng loại: unlinked mention (nhỏ, trực tiếp) vs broken link (đề nghị thay thế).

Không gửi hàng loạt. Mỗi nhắn phải chỉ đúng trang đang nói.

## P1 · Ghi trạng thái hạ tầng vào repo

Route Worker nằm ngoài git, mất là 404. Ghi vào repo để lần set up sau không lặp lại:

- `docs/cloudflare-routes.md` — bảng route của `gulagi-blog-router` và cách thêm route mới.
- Nhắc trong README hoặc docs của `/tools`.

## P1 · Tài liệu hub + công cụ

`public/docs` không tồn tại trong repo (AGENTS.md có nhắc tới nó). Viết tài liệu ngắn cho:

- `/hubs`: chủ đề lấy từ `topic_seed`, đổi cụm = đổi URL (link cũ chết).
- `/tools/seo-check`: 16 tiêu chí, chế độ `?embed=1`, quy tắc link trở về bắt buộc.

## P2 · Test sitemap chunk

`?part=N` chỉ kích hoạt trên 5.000 URL; production hiện 850 nên chưa từng chạy. Test bằng dữ liệu giả >5.000 URL, kiểm tra index liệt kê đủ chunk và mỗi chunk hợp lệ.

## P3 · Xác minh 5 điểm còn mở trong BACKLINK-PLATFORMS-RESEARCH.md

dev.to rate limit khi publish · giá Hashnode Pro · URL Automattic API Terms đang 404 · `rel` trên body bài Medium/Pinterest/Tumblr · Telegra.ph xử lý abuse.

## P4 · Release

Repo chưa có tag từ v1.21.0, code đang 1.24.0. Tag + push tag. Không mirror upstream — đó là fork riêng của bạn.

## Không làm trong đợt này

- SSRF guard cho `scrapeUrl` trong `functions/_lib/scrape.js` — luồng admin-gated, đã thống nhất bỏ qua.
- Admin UI quản lý pillar — hiện sửa `topic_seed` tay qua D1, chấp nhận được.
