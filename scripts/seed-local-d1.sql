INSERT OR REPLACE INTO projects (id, slug, name, description, website_url, publishing_url, language, timezone, status, approval_mode, created_at, updated_at)
VALUES (
  'proj_gulagi_001',
  'gulagi',
  'Gulagi',
  'Nền tảng giải pháp bán lẻ, website shop và SEO Google Maps',
  'https://gulagi.com',
  'https://docs.gulagi.com',
  'vi',
  'Asia/Ho_Chi_Minh',
  'active',
  'auto',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO project_brands (project_id, business_type, tone, audience, key_themes, topics_to_avoid, service_area, cta, created_at, updated_at)
VALUES (
  'proj_gulagi_001',
  'Phần mềm bán hàng & Giải pháp tăng trưởng doanh thu cho cửa hàng',
  'Chuyên nghiệp, thực chiến, dễ hiểu, hướng tới chủ shop và nhà bán lẻ',
  'Chủ shop thời trang, F&B, mỹ phẩm, tạp hóa, chuỗi bán lẻ vừa và nhỏ',
  'shop bán hàng, cửa hàng bán lẻ, website cho shop, Google Maps, SEO local, marketing cho cửa hàng, bán hàng online, thương mại điện tử, xây dựng thương hiệu, tăng khách hàng, chuyển đổi khách hàng',
  'chính trị, tin đồn thất thiệt, so sánh tiêu cực thiếu căn cứ',
  'Toàn quốc (Việt Nam)',
  'Dùng thử giải pháp tối ưu bán hàng và website cho shop tại Gulagi.com ngay hôm nay.',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
VALUES (
  'proj_gulagi_001',
  'custom_api',
  'https://docs.gulagi.com/api/webhooks/content-sync',
  'Bearer gulagi_publish_secret_key',
  '{"target_section":"blog","auto_index":true}',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO projects (id, slug, name, description, website_url, publishing_url, language, timezone, status, approval_mode, created_at, updated_at)
VALUES (
  'proj_gurouter_002',
  'gurouter',
  'GuRouter',
  'AI Gateway, LLM infrastructure, AI Coding & Agent developer tools',
  'https://gurouter.com',
  'https://blogs.gurouter.com',
  'vi',
  'Asia/Ho_Chi_Minh',
  'active',
  'auto',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO project_brands (project_id, business_type, tone, audience, key_themes, topics_to_avoid, service_area, cta, created_at, updated_at)
VALUES (
  'proj_gurouter_002',
  'AI Infrastructure & Smart Router Gateway cho Developers & AI Startups',
  'Kỹ thuật sâu, khách quan, cập nhật nhanh, phân tích kiến trúc chuẩn senior',
  'AI engineers, developers, tech leads, startup founders, CTOs',
  'AI, LLM, AI agents, AI coding, AI API, AI infrastructure, OpenAI, Anthropic, Gemini, DeepSeek, AI startup, AI market, technology, AI news, developer tools, AI business',
  'crypto speculation, tin đồn giật gân chưa xác thực',
  'Global & Việt Nam',
  'Tối ưu chi phí và độ trễ gọi AI API đa mô hình với GuRouter.com ngay.',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
VALUES (
  'proj_gurouter_002',
  'webhook',
  'https://blogs.gurouter.com/api/v1/articles/import',
  'Bearer gurouter_publish_secret_key',
  '{"site":"blogs.gurouter.com","format":"markdown"}',
  unixepoch(),
  unixepoch()
);
