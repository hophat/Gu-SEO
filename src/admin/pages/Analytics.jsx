// Analytics page — antd Statistic, Card, Table, Tag.
import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography, Skeleton, Empty, Space } from 'antd';
import { FileTextOutlined, UserOutlined, DollarOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet } from '../api.js';

const { Text } = Typography;

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/analytics');
    if (status === 200 && body?.ok) setData(body);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (!data) return <Empty />;

  const viewColumns = [
    { title: 'Bài viết', dataIndex: 'blog_slug', key: 'slug' },
    { title: 'Lượt xem', dataIndex: 'view_count', key: 'views', render: (v) => <Text strong>{v || 0}</Text> },
    { title: 'Thời gian đọc TB', key: 'avg', render: (_, r) => {
      const ms = r.view_count ? Math.round((r.total_read_time_ms || 0) / r.view_count) : 0;
      return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
    }},
  ];

  const leadColumns = [
    { title: 'Tên', dataIndex: 'name', key: 'name' },
    { title: 'Liên hệ', key: 'contact', render: (_, r) => [r.email, r.phone].filter(Boolean).join(' / ') || '-' },
    { title: 'Nguồn', dataIndex: 'source', key: 'source' },
    { title: 'Bài viết', dataIndex: 'blog_slug', key: 'slug' },
    { title: 'Thời gian', key: 'time', render: (_, r) => r.created_at ? new Date(r.created_at * 1000).toLocaleString('vi-VN') : '-' },
  ];

  return (
    <PageContainer title="Phân tích" description="Thống kê lượt xem, leads, và chi phí AI" breadcrumb={[{ title: 'Phân tích' }]}>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}><Card><Statistic title="Tổng bài viết" value={data.total_posts || 0} prefix={<FileTextOutlined />} /></Card></Col>
        <Col xs={24} sm={8}><Card><Statistic title="Tổng leads" value={data.total_leads || 0} prefix={<UserOutlined />} /></Card></Col>
        <Col xs={24} sm={8}><Card><Statistic title="Chi phí AI (30 ngày)" value={`$${(Number(data.ai_cost_30d) || 0).toFixed(2)}`} prefix={<DollarOutlined />} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Top bài viết xem nhiều" size="small">
            <Table dataSource={data.top_views || []} columns={viewColumns} rowKey="blog_slug" size="small" pagination={{ pageSize: 5 }} locale={{ emptyText: 'Chưa có dữ liệu' }} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Leads gần đây" size="small">
            <Table dataSource={data.latest_leads || []} columns={leadColumns} rowKey={(r, i) => i} size="small" pagination={{ pageSize: 5 }} locale={{ emptyText: 'Chưa có leads' }} />
          </Card>
        </Col>
        <Col xs={24}>
          <Card title="Phản hồi độc giả" size="small">
            {(data.feedback || []).length === 0 ? <Empty description="Chưa có phản hồi" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <Space wrap>
                {data.feedback.map((f, i) => (
                  <Tag key={i} color={f.rating === 'yes' ? 'success' : f.rating === 'no' ? 'error' : 'default'}>
                    {f.rating === 'yes' ? '👍' : f.rating === 'no' ? '👎' : f.rating}: {f.n || 0}
                  </Tag>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
}
