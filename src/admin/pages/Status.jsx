// Status page — antd Result, Card, Tag, Table, Button, Skeleton, Badge, Statistic.
import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Tag, Table, Button, Skeleton, Badge, Statistic, Typography, Space, Empty, Tooltip, Descriptions, Alert } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, SyncOutlined, WarningOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost } from '../api.js';

const { Text, Paragraph } = Typography;

export default function Status() {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [testingProviders, setTestingProviders] = useState(false);
  const [audit, setAudit] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const loadChecks = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/status');
    if (status === 200 && body?.ok) {
      setChecks(body.checks || []);
    } else {
      setChecks([]);
    }
    setLoading(false);
  }, []);

  const testProviders = useCallback(async () => {
    setTestingProviders(true);
    const { status, body } = await apiPost('/api/admin/providers/test', {});
    if (status === 200 && body?.ok) {
      setProviders(body.results || []);
    }
    setTestingProviders(false);
  }, []);

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true);
    const { status, body } = await apiGet('/api/admin/audit?limit=50');
    if (status === 200 && body?.ok) {
      setAudit(body.entries || []);
    }
    setLoadingAudit(false);
  }, []);

  useEffect(() => { loadChecks(); loadAudit(); }, [loadChecks, loadAudit]);

  const failed = checks.filter((c) => c.ok === false).length;
  const allOk = failed === 0;

  const auditColumns = [
    { title: 'Thời gian', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (t) => <Text type="secondary">{new Date(t * 1000).toLocaleString('vi-VN')}</Text> },
    { title: 'Người thực hiện', dataIndex: 'actor', key: 'actor', width: 100 },
    { title: 'Hành động', dataIndex: 'action', key: 'action', width: 140,
      render: (a) => <Text code>{a}</Text> },
    { title: 'Chi tiết', dataIndex: 'details', key: 'details', ellipsis: true,
      render: (d) => {
        if (!d) return '-';
        if (typeof d === 'object') return <Text type="secondary" ellipsis={{ tooltip: JSON.stringify(d) }}>{Object.entries(d).map(([k, v]) => `${k}=${v}`).join(', ')}</Text>;
        return <Text type="secondary" ellipsis={{ tooltip: String(d) }}>{String(d)}</Text>;
      } },
  ];

  return (
    <PageContainer
      title="Trạng thái hệ thống"
      description="Kiểm tra sức khỏe D1, R2, Workers AI, hạn mức và bảo mật"
      breadcrumb={[{ title: 'Hệ thống' }, { title: 'Trạng thái' }]}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={loadChecks}>Chạy lại</Button>
          <Button icon={<SyncOutlined />} loading={testingProviders} onClick={testProviders}>Test providers</Button>
        </Space>
      }
    >
      {/* Hero status banner */}
      <Card style={{ marginBottom: 24 }}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {allOk ? (
              <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />
            ) : (
              <CloseCircleOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />
            )}
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                {allOk ? 'Tất cả hệ thống hoạt động tốt' : `${failed} mục kiểm tra không đạt`}
              </h2>
              <Text type="secondary">
                {checks.length - failed}/{checks.length} mục đạt · Cập nhật {new Date().toLocaleTimeString('vi-VN')}
              </Text>
            </div>
          </div>
        )}
      </Card>

      {/* Check tiles */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <Col key={i} xs={24} sm={12} lg={8}>
            <Card><Skeleton active paragraph={{ rows: 2 }} /></Card>
          </Col>
        ))}
        {!loading && checks.map((c, i) => (
          <Col key={i} xs={24} sm={12} lg={8}>
            <Card size="small" style={{ borderLeft: `4px solid ${c.ok === false ? '#ff4d4f' : '#52c41a'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>{c.label}</Text>
                <Tag color={c.ok === false ? 'error' : 'success'} icon={c.ok === false ? <CloseCircleOutlined /> : <CheckCircleOutlined />}>
                  {c.ok === false ? 'Lỗi' : 'OK'}
                </Tag>
              </div>
              {c.detail && <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>{c.detail}</Text>}
              <Space size={[4, 4]} wrap>
                {c.count != null && <Tag>{`count: ${c.count}`}</Tag>}
                {c.blogs != null && <Tag>{`blogs: ${c.blogs}`}</Tag>}
                {c.progs != null && <Tag>{`progs: ${c.progs}`}</Tag>}
                {c.pct != null && <Tag>{`pct: ${c.pct}`}</Tag>}
                {c.spent_usd != null && <Tag>{`spent: $${c.spent_usd}`}</Tag>}
                {c.cap_usd != null && <Tag>{`cap: $${c.cap_usd}`}</Tag>}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Provider results */}
      {providers.length > 0 && (
        <Card title="Kết quả test providers" size="small" style={{ marginBottom: 24 }}>
          <Row gutter={[16, 16]}>
            {providers.map((p, i) => (
              <Col key={i} xs={24} sm={12} lg={8}>
                <Card size="small" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong>{p.name}</Text>
                    <Tag color={p.ok ? 'success' : 'error'} icon={p.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
                      {p.ok ? `✓ ${p.ms != null ? p.ms + 'ms' : 'ok'}` : `✗ ${p.error || 'thất bại'}`}
                    </Tag>
                  </div>
                  {p.detail && <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>{p.detail}</Text>}
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* Audit log */}
      <Card title="Nhật ký hoạt động" size="small" extra={<Button size="small" icon={<ReloadOutlined />} loading={loadingAudit} onClick={loadAudit} />}>
        <Table
          dataSource={audit}
          columns={auditColumns}
          rowKey={(r, i) => i}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: 'Chưa có bản ghi' }}
        />
      </Card>
    </PageContainer>
  );
}
