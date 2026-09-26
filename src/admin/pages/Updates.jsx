// Updates page — antd Card, Button, Tag, Timeline, Alert, Typography.
// API: /api/admin/update (not /api/admin/version)
import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Tag, Timeline, Alert, Typography, Space, Skeleton, message, Statistic, Row, Col, Empty } from 'antd';
import { SyncOutlined, CheckCircleOutlined, ArrowUpOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost } from '../api.js';

const { Text } = Typography;

export default function Updates() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/update');
    if (status === 200 && body?.ok) setData(body);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const applyUpdate = async () => {
    setApplying(true);
    const { status, body } = await apiPost('/api/admin/update/apply', {});
    if (status === 200 && body?.ok) { message.success('Đã cập nhật'); load(); }
    else message.error(body?.error || 'Cập nhật thất bại');
    setApplying(false);
  };

  if (loading) return <Skeleton active paragraph={{ rows: 4 }} />;

  const upToDate = data?.up_to_date;
  const canApply = data?.can_apply;

  return (
    <PageContainer
      title="Cập nhật"
      description="Kiểm tra và áp dụng bản cập nhật pages-seo"
      breadcrumb={[{ title: 'Hệ thống' }, { title: 'Cập nhật' }]}
      extra={
        <Space>
          <Button icon={<SyncOutlined />} onClick={load} loading={loading}>Kiểm tra lại</Button>
          {!upToDate && canApply && (
            <Button type="primary" icon={<ArrowUpOutlined />} loading={applying} onClick={applyUpdate}>Cập nhật ngay</Button>
          )}
        </Space>
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Phiên bản hiện tại"
              value={data?.current?.short || '-'}
              prefix={<CheckCircleOutlined />}
            />
            {data?.current?.date && <Text type="secondary" style={{ fontSize: 12 }}>{new Date(data.current.date).toLocaleDateString('vi-VN')}</Text>}
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Phiên bản mới nhất"
              value={data?.latest?.short || '-'}
              prefix={<ArrowUpOutlined className="ps-stat-icon ps-stat-icon--info" />}
            />
            {data?.latest?.date && <Text type="secondary" style={{ fontSize: 12 }}>{new Date(data.latest.date).toLocaleDateString('vi-VN')}</Text>}
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Trạng thái"
              value={upToDate ? 'Mới nhất' : `${data?.ahead || 0} commit sau`}
              prefix={<SyncOutlined className={upToDate ? 'ps-stat-icon ps-stat-icon--good' : 'ps-stat-icon ps-stat-icon--warn'} />}
            />
          </Card>
        </Col>
      </Row>

      {!upToDate && (
        <Alert
          type={canApply ? 'info' : 'warning'}
          showIcon
          message={canApply ? `Có ${data?.ahead || 0} commit mới sẵn sàng cập nhật` : `${data?.ahead || 0} commit mới — ${data?.can_apply_reason || 'không thể tự cập nhật'}`}
          style={{ marginBottom: 16 }}
        />
      )}

      {data?.commits?.length > 0 ? (
        <Card title="Lịch sử thay đổi" size="small">
          <Timeline items={data.commits.map((c) => ({
            color: 'blue',
            children: (
              <div>
                <Tag>{c.short}</Tag>
                <Text>{c.message}</Text>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginLeft: 40 }}>
                  {c.author} · {c.date ? new Date(c.date).toLocaleDateString('vi-VN') : ''}
                </Text>
              </div>
            ),
          }))} />
        </Card>
      ) : (
        <Card title="Lịch sử thay đổi" size="small">
          <Empty description="Không có commit mới" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      )}

      {data?.changelog_chunks?.length > 0 && (
        <Card title="CHANGELOG" size="small" style={{ marginTop: 16 }}>
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {data.changelog_chunks.map((chunk, i) => (
              <pre key={i} style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: '0 0 12px 0' }}>{chunk}</pre>
            ))}
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
