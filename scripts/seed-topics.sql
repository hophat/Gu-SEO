INSERT OR REPLACE INTO project_topics (id, project_id, key, angle, category, source, relevance_score, business_value_score, status, times_used, created_at, updated_at)
VALUES
(
  'top_gulagi_01',
  'proj_gulagi_001',
  'SEO Google Maps cho cửa hàng bán lẻ',
  'Hướng dẫn tối ưu Google Business Profile tăng gấp 3 lượt khách ghé cửa hàng',
  'Google Maps',
  'manual',
  95,
  90,
  'candidate',
  0,
  unixepoch(),
  unixepoch()
),
(
  'top_gulagi_02',
  'proj_gulagi_001',
  'Tối ưu website bán hàng chuyển đổi cao',
  '7 yếu tố giao diện và trải nghiệm thanh toán giúp shop giữ chân khách',
  'E-commerce',
  'manual',
  92,
  95,
  'candidate',
  0,
  unixepoch(),
  unixepoch()
),
(
  'top_gulagi_03',
  'proj_gulagi_001',
  'Chiến lược marketing tại điểm bán cho shop',
  'Kết hợp online và offline để khách hàng quay lại mua hàng thường xuyên',
  'Marketing',
  'manual',
  88,
  85,
  'candidate',
  0,
  unixepoch(),
  unixepoch()
),
(
  'top_gurouter_01',
  'proj_gurouter_002',
  'Kiến trúc Multi-Agent trong lập trình phần mềm',
  'So sánh hiệu quả giữa single agent và multi-agent team khi code dự án lớn',
  'AI Agents',
  'manual',
  98,
  95,
  'candidate',
  0,
  unixepoch(),
  unixepoch()
),
(
  'top_gurouter_02',
  'proj_gurouter_002',
  'Tối ưu chi phí inference với Smart AI Gateway',
  'Chiến lược định tuyến request thông minh giữa DeepSeek, Claude và GPT-4o',
  'AI Infrastructure',
  'manual',
  96,
  98,
  'candidate',
  0,
  unixepoch(),
  unixepoch()
),
(
  'top_gurouter_03',
  'proj_gurouter_002',
  'DeepSeek R1 và cuộc cách mạng reasoning models',
  'Phân tích kỹ thuật và tác động đến chi phí xây dựng ứng dụng AI',
  'LLM News',
  'manual',
  95,
  90,
  'candidate',
  0,
  unixepoch(),
  unixepoch()
);

-- Seed initial content calendar slots for both projects
INSERT OR REPLACE INTO content_calendar (id, scheduled_for, title, primary_keyword, angle, status, source, created_at, updated_at)
VALUES
(
  'cal_gulagi_01',
  strftime('%Y-%m-%d', 'now'),
  'SEO Google Maps cho cửa hàng bán lẻ: Hướng dẫn tăng khách từ tìm kiếm địa phương',
  'SEO Google Maps cho cửa hàng bán lẻ',
  'Chiến lược toàn diện thiết lập và tối ưu Google Business Profile cho cửa hàng vật lý',
  'scheduled',
  'manual',
  unixepoch(),
  unixepoch()
),
(
  'cal_gurouter_01',
  strftime('%Y-%m-%d', 'now'),
  'Kiến trúc Multi-Agent trong AI Coding: Tương lai phát triển phần mềm tự động hóa',
  'Kiến trúc Multi-Agent trong lập trình phần mềm',
  'Phân tích sâu mô hình phân rã nhiệm vụ và phối hợp giữa các agent chuyên trách',
  'scheduled',
  'manual',
  unixepoch(),
  unixepoch()
);
