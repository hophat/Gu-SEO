import { upsertProject } from '../functions/_lib/projects.js';
import { addProjectTopic } from '../functions/_lib/project_topics.js';

export const GULAGI_PROJECT = {
  id: 'proj_gulagi_001',
  slug: 'gulagi',
  name: 'Gulagi',
  description: 'Nền tảng giải pháp bán lẻ, website shop và SEO Google Maps',
  website_url: 'https://gulagi.com',
  publishing_url: 'https://docs.gulagi.com',
  language: 'vi',
  timezone: 'Asia/Ho_Chi_Minh',
  status: 'active',
  approval_mode: 'auto',
  brand: {
    business_type: 'Phần mềm bán hàng & Giải pháp tăng trưởng doanh thu cho cửa hàng',
    tone: 'Chuyên nghiệp, thực chiến, dễ hiểu, hướng tới chủ shop và nhà bán lẻ',
    audience: 'Chủ shop thời trang, F&B, mỹ phẩm, tạp hóa, chuỗi bán lẻ vừa và nhỏ',
    key_themes: 'shop bán hàng, cửa hàng bán lẻ, website cho shop, Google Maps, SEO local, marketing cho cửa hàng, bán hàng online, thương mại điện tử, xây dựng thương hiệu, tăng khách hàng, chuyển đổi khách hàng',
    topics_to_avoid: 'chính trị, tin đồn thất thiệt, so sánh tiêu cực thiếu căn cứ',
    service_area: 'Toàn quốc (Việt Nam)',
    cta: 'Dùng thử giải pháp tối ưu bán hàng và website cho shop tại Gulagi.com ngay hôm nay.',
  },
  ai_config: {
    default_text_provider: 'workers-ai',
    default_image_provider: 'workers-ai',
    text_model: '@cf/meta/llama-3.3-70b-instruct',
    image_model: '@cf/black-forest-labs/flux-1-schnell',
    min_words: 2000,
    max_words: 3500,
    temperature: 0.7,
  },
  publishing_config: {
    publisher_type: 'custom_api',
    endpoint_url: 'https://docs.gulagi.com/api/webhooks/content-sync',
    auth_header: 'Bearer gulagi_publish_secret_key',
    config_json: { target_section: 'blog', auto_index: true },
  },
  schedule: {
    frequency: 'daily',
    cron_expression: '0 2 * * *', // 09:00 AM UTC+7 = 02:00 UTC
    preferred_time_utc: '02:00',
    is_active: 1,
  },
};

export const GUROUTER_PROJECT = {
  id: 'proj_gurouter_002',
  slug: 'gurouter',
  name: 'GuRouter',
  description: 'AI Gateway, LLM infrastructure, AI Coding & Agent developer tools',
  website_url: 'https://gurouter.com',
  publishing_url: 'https://blogs.gurouter.com',
  language: 'vi',
  timezone: 'Asia/Ho_Chi_Minh',
  status: 'active',
  approval_mode: 'auto',
  brand: {
    business_type: 'AI Infrastructure & Smart Router Gateway cho Developers & AI Startups',
    tone: 'Kỹ thuật sâu, khách quan, cập nhật nhanh, phân tích kiến trúc chuẩn senior',
    audience: 'AI engineers, developers, tech leads, startup founders, CTOs',
    key_themes: 'AI, LLM, AI agents, AI coding, AI API, AI infrastructure, OpenAI, Anthropic, Gemini, DeepSeek, AI startup, AI market, technology, AI news, developer tools, AI business',
    topics_to_avoid: 'crypto speculation, tin đồn giật gân chưa xác thực',
    service_area: 'Global & Việt Nam',
    cta: 'Tối ưu chi phí và độ trễ gọi AI API đa mô hình với GuRouter.com ngay.',
  },
  ai_config: {
    default_text_provider: 'workers-ai',
    default_image_provider: 'workers-ai',
    text_model: '@cf/meta/llama-3.3-70b-instruct',
    image_model: '@cf/black-forest-labs/flux-1-schnell',
    min_words: 2500,
    max_words: 4000,
    temperature: 0.65,
  },
  publishing_config: {
    publisher_type: 'webhook',
    endpoint_url: 'https://blogs.gurouter.com/api/v1/articles/import',
    auth_header: 'Bearer gurouter_publish_secret_key',
    config_json: { site: 'blogs.gurouter.com', format: 'markdown' },
  },
  schedule: {
    frequency: 'daily',
    cron_expression: '0 3 * * *', // 10:00 AM UTC+7 = 03:00 UTC
    preferred_time_utc: '03:00',
    is_active: 1,
  },
};

export async function seedProjects(env) {
  const p1 = await upsertProject(env, GULAGI_PROJECT);
  const p2 = await upsertProject(env, GUROUTER_PROJECT);

  const gulagiTopics = [
    { key: 'SEO Google Maps cho cửa hàng bán lẻ', angle: 'Hướng dẫn tối ưu Google Business Profile tăng gấp 3 lượt khách ghé cửa hàng', category: 'Google Maps' },
    { key: 'Tối ưu website bán hàng chuyển đổi cao', angle: '7 yếu tố giao diện và trải nghiệm thanh toán giúp shop giữ chân khách', category: 'E-commerce' },
    { key: 'Chiến lược marketing tại điểm bán cho shop', angle: 'Kết hợp online và offline để khách hàng quay lại mua hàng thường xuyên', category: 'Marketing' },
  ];

  for (const t of gulagiTopics) {
    await addProjectTopic(env, {
      projectId: p1.id,
      key: t.key,
      angle: t.angle,
      category: t.category,
      source: 'manual',
    });
  }

  const gurouterTopics = [
    { key: 'Kiến trúc Multi-Agent trong lập trình phần mềm', angle: 'So sánh hiệu quả giữa single agent và multi-agent team khi code dự án lớn', category: 'AI Agents' },
    { key: 'Tối ưu chi phí inference với Smart AI Gateway', angle: 'Chiến lược định tuyến request thông minh giữa DeepSeek, Claude và GPT-4o', category: 'AI Infrastructure' },
    { key: 'DeepSeek R1 và cuộc cách mạng reasoning models', angle: 'Phân tích kỹ thuật và tác động đến chi phí xây dựng ứng dụng AI', category: 'LLM News' },
  ];

  for (const t of gurouterTopics) {
    await addProjectTopic(env, {
      projectId: p2.id,
      key: t.key,
      angle: t.angle,
      category: t.category,
      source: 'manual',
    });
  }

  return { gulagi: p1, gurouter: p2 };
}
