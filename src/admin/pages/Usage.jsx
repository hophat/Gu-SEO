// Usage page — antd Statistic, Card, Table, Progress, Tag.
import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Table, Progress, Tag, Typography, Skeleton, Empty } from 'antd';
import { DollarOutlined, ThunderboltOutlined, BarChartOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet } from '../api.js';

const { Text } = Typography;

export default function Usage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/usage');
    if (status === 200 && body?.ok) setData(body);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (!data) return <Empty />;

  const pct = data.cap_usd ? Math.min(100, Math.round((data.spent_usd / data.cap_usd) * 100)) : 0;

  const columns = [
    { title: 'Provider', dataIndex: 'provider', key: 'provider' },
    { title: 'Calls', dataIndex: 'calls', key: 'calls', render: (v) => <Text strong>{v || 0}</Text> },
    { title: 'Tokens in', dataIndex: 'tokens_in', key: 'tokens_in', render: (v) => (v || 0).toLocaleString() },
    { title: 'Tokens out', dataIndex: 'tokens_out', key: 'tokens_out', render: (v) => (v || 0).toLocaleString() },
    { title: 'Chi phí', dataIndex: 'cost_usd', key: 'cost', render: (v) => <Tag color={v > 0 ? 'blue' : 'default'}>${(v || 0).toFixed(4)}</Tag> },
  ];

  return (
    <PageContainer title="Sử dụng" description="Thống kê sử dụng AI và chi phí" breadcrumb={[{ title: 'Hệ thống' }, { title: 'Sử dụng' }]}>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}><Card><Statistic title="Chi phí tháng này" value={`$${(data.spent_usd || 0).toFixed(2)}`} prefix={<DollarOutlined />} /></Card></Col>
        <Col xs={24} sm={8}><Card><Statistic title="Hạn mức" value={`$${(data.cap_usd || 0).toFixed(2)}`} /></Card></Col>
        <Col xs={24} sm={8}><Card><Statistic title="Tổng calls" value={data.total_calls || 0} prefix={<ThunderboltOutlined />} /></Card></Col>
      </Row>

      <Card title="Hạn mức chi phí" style={{ marginBottom: 24 }}>
        <Progress percent={pct} status={pct >= 100 ? 'exception' : 'active'} strokeColor={pct >= 100 ? '#ff4d4f' : '#1677ff'} />
        <Text type="secondary">{(data.spent_usd || 0).toFixed(2)} / {(data.cap_usd || 0).toFixed(2)} USD ({pct}%)</Text>
      </Card>

      <Card title="Theo provider" size="small">
        <Table dataSource={data.by_provider || []} columns={columns} rowKey="provider" size="small" pagination={false} locale={{ emptyText: 'Chưa có dữ liệu' }} />
      </Card>
    </PageContainer>
  );
}
