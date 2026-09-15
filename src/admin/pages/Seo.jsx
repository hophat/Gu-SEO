// SEO & IndexNow page.
//
// "Ping IndexNow" reads the project's sitemap-pages.xml, extracts every
// <loc> for that host, and submits them to api.indexnow.org (Bing, Yandex,
// Seznam…). The response shape is { ok, url_count, urls, source, host },
// with rate_limited=true when IndexNow throttles us.
//
// API: /api/admin/indexnow-ping (POST)
import { useState, useCallback } from 'react';
import { Card, Button, Alert, Tag, Statistic, Row, Col, Space, Typography, message, Descriptions, Collapse, List, Empty } from 'antd';
import { ThunderboltOutlined, GlobalOutlined, CheckCircleOutlined, WarningOutlined, FileTextOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiPost, apiGet } from '../api.js';
import { useProjectUrl } from '../lib/projectUrl.js';

const { Text, Link } = Typography;

const SOURCE_LABEL = {
  sitemap: 'Sitemap dự án',
  caller_supplied: 'Danh sách gửi kèm',
  failed: 'Không đọc được sitemap',
};

export default function Seo() {
  const { projectUrl } = useProjectUrl();
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [sitemap, setSitemap] = useState(null);

  const ping = async () => {
    setPinging(true);
    setPingResult(null);
    const { status, body } = await apiPost('/api/admin/indexnow-ping', {});
    setPinging(false);

    if (status === 200 && body?.ok) {
      setPingResult({
        type: body.rate_limited ? 'warning' : 'success',
        count: body.url_count ?? (body.urls || []).length,
        urls: body.urls || [],
        source: body.source,
        host: body.host,
        rateLimited: !!body.rate_limited,
        message: body.message,
      });
      if (body.rate_limited) message.warning('IndexNow đang giới hạn tần suất — Bing sẽ tự crawl');
      else message.success(`Đã ping ${body.url_count ?? (body.urls || []).length} URL tới IndexNow`);
      return;
    }

    // Explain the common "0 URLs" causes instead of a bare error code.
    let text = body?.detail || body?.error || 'Thất bại';
    if (body?.error === 'no_urls') {
      text = body?.source === 'failed'
        ? 'Không đọc được sitemap-pages.xml của dự án này. Kiểm tra dự án đã có bài viết/trang programmatic chưa.'
        : 'Sitemap của dự án chưa có URL nào. Xuất bản ít nhất một bài viết hoặc trang programmatic trước.';
    } else if (body?.error === 'indexnow_not_configured') {
      text = 'Chưa cấu hình INDEXNOW_KEY trên deployment.';
    }
    setPingResult({ type: 'error', text, source: body?.source, host: body?.host });
    message.error(text);
  };

  const checkSitemap = async () => {
    setChecking(true);
    const url = projectUrl('/sitemap-pages.xml');
    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      const xml = await r.text();
      const locs = (xml.match(/<loc>([^<]+)<\/loc>/g) || []).map((s) => s.replace(/<\/?loc>/g, '').trim());
      setSitemap({ url, status: r.status, count: locs.length, sample: locs.slice(0, 8) });
      if (r.ok && locs.length) message.success(`Sitemap có ${locs.length} URL`);
      else message.warning('Sitemap chưa có URL nào');
    } catch (e) {
      setSitemap({ url, status: 0, count: 0, error: e.message });
      message.error('Không đọc được sitemap: ' + e.message);
    }
    setChecking(false);
  };

  return (
    <PageContainer
      title="SEO & IndexNow"
      description="Ping công cụ tìm kiếm và quản lý SEO"
      breadcrumb={[{ title: 'Phân phối' }, { title: 'SEO & IndexNow' }]}
      extra={<Button type="primary" icon={<ThunderboltOutlined />} loading={pinging} onClick={ping}>Ping IndexNow</Button>}
    >
      {pingResult && pingResult.type === 'success' && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          style={{ marginBottom: 16 }}
          message={`Đã ping ${pingResult.count} URL tới IndexNow`}
          description={
            <Space direction="vertical" size={2}>
              <Text type="secondary">Nguồn: {SOURCE_LABEL[pingResult.source] || pingResult.source}{pingResult.host ? ` · host ${pingResult.host}` : ''}</Text>
              <Text type="secondary">Bing/Yandex/Seznam sẽ crawl các URL này trong vài giờ tới.</Text>
            </Space>
          }
        />
      )}

      {pingResult && pingResult.type === 'warning' && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message={`Đã gửi ${pingResult.count} URL nhưng IndexNow đang giới hạn tần suất`}
          description="IndexNow chặn khi ping quá thường xuyên. Đợi vài giờ rồi thử lại, hoặc để Bing tự crawl."
        />
      )}

      {pingResult && pingResult.type === 'error' && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message="Ping thất bại" description={pingResult.text} closable onClose={() => setPingResult(null)} />
      )}

      {pingResult?.urls?.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Collapse
            ghost
            items={[{
              key: 'urls',
              label: <Space><LinkOutlined /> {pingResult.count} URL đã ping</Space>,
              children: (
                <List
                  size="small"
                  dataSource={pingResult.urls}
                  renderItem={(u) => (
                    <List.Item><Link href={u} target="_blank" style={{ fontSize: 12 }}>{u}</Link></List.Item>
                  )}
                />
              ),
            }]}
          />
        </Card>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}><Card><Statistic title="Sitemap" value="Tự động" prefix={<GlobalOutlined />} /></Card></Col>
        <Col xs={24} sm={8}><Card><Statistic title="RSS Feed" value="Tự động" prefix={<FileTextOutlined />} /></Card></Col>
        <Col xs={24} sm={8}><Card><Statistic title="IndexNow" value="Đã cấu hình" prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} /></Card></Col>
      </Row>

      <Card
        title="Kiểm tra sitemap của dự án"
        size="small"
        extra={<Button size="small" icon={<ReloadOutlined />} loading={checking} onClick={checkSitemap}>Kiểm tra</Button>}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          IndexNow đọc sitemap-pages.xml của dự án đang chọn để lấy danh sách URL cần ping. Nếu sitemap trống, ping sẽ gửi 0 URL.
        </Text>
        {sitemap && (
          <div style={{ marginTop: 12 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="URL sitemap">
                <Link href={sitemap.url} target="_blank">{sitemap.url}</Link>
              </Descriptions.Item>
              <Descriptions.Item label="HTTP">
                <Tag color={sitemap.status === 200 ? 'success' : 'error'}>{sitemap.status || 'lỗi'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Số URL">
                <Tag color={sitemap.count > 0 ? 'blue' : 'warning'}>{sitemap.count}</Tag>
                {sitemap.count === 0 && <Text type="secondary" style={{ marginLeft: 8 }}>— chưa có bài viết/trang nào</Text>}
              </Descriptions.Item>
            </Descriptions>
            {sitemap.sample?.length > 0 && (
              <List
                size="small"
                header={<Text type="secondary" style={{ fontSize: 12 }}>Mẫu URL</Text>}
                dataSource={sitemap.sample}
                renderItem={(u) => <List.Item><Text style={{ fontSize: 12 }} ellipsis>{u}</Text></List.Item>}
              />
            )}
          </div>
        )}
      </Card>

      <Card title="Liên kết SEO" size="small" style={{ marginTop: 16 }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Sitemap"><Link href={projectUrl('/sitemap.xml')} target="_blank">{projectUrl('/sitemap.xml')}</Link></Descriptions.Item>
          <Descriptions.Item label="Sitemap (trang)"><Link href={projectUrl('/sitemap-pages.xml')} target="_blank">{projectUrl('/sitemap-pages.xml')}</Link></Descriptions.Item>
          <Descriptions.Item label="RSS Feed"><Link href={projectUrl('/feed.xml')} target="_blank">{projectUrl('/feed.xml')}</Link></Descriptions.Item>
          <Descriptions.Item label="Robots.txt"><Link href={projectUrl('/robots.txt')} target="_blank">{projectUrl('/robots.txt')}</Link></Descriptions.Item>
          <Descriptions.Item label="IndexNow"><Text type="secondary">Ping để thông báo cho Bing/Yandex biết nội dung mới</Text></Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Hướng dẫn" size="small" style={{ marginTop: 16 }}>
        <Space direction="vertical">
          <Text>1. Nhấn <Tag color="blue">Ping IndexNow</Tag> để thông báo URL mới cho Bing/Yandex</Text>
          <Text>2. Cấu hình Google Search Console trong <Link href="#settings">Cài đặt</Link> để tự động submit sitemap</Text>
          <Text>3. Sitemap tự động cập nhật mỗi khi xuất bản bài viết mới</Text>
          <Text>4. IndexNow tự động ping mỗi khi cron xuất bản bài — nút này để ping thủ công toàn bộ sitemap</Text>
        </Space>
      </Card>
    </PageContainer>
  );
}
