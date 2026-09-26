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
              <CheckCircleOutlined className="ps-health-mark ps-health-mark--good" />
            ) : (
              <CloseCircleOutlined className="ps-health-mark ps-health-mark--bad" />
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
            <Card size="small" className={`ps-check-card ${c.ok === false ? 'ps-check-card--bad' : 'ps-check-card--good'}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>{c.label}</Text>
                <span className={`ps-chip ps-chip--${c.ok === false ? 'bad' : 'good'}`}>
                  {c.ok === false ? <CloseCircleOutlined /> : <CheckCircleOutlined />}
                  {c.ok === false ? 'Lỗi' : 'OK'}
                </span>
              </div>
              {c.detail && <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>{c.detail}</Text>}
              <Space size={[4, 4]} wrap>
                {c.count != null && <span className="ps-chip ps-chip--plain ps-chip-xs">{`count: ${c.count}`}</span>}
                {c.blogs != null && <span className="ps-chip ps-chip--plain ps-chip-xs">{`blogs: ${c.blogs}`}</span>}
                {c.progs != null && <span className="ps-chip ps-chip--plain ps-chip-xs">{`progs: ${c.progs}`}</span>}
                {c.pct != null && <span className="ps-chip ps-chip--plain ps-chip-xs">{`pct: ${c.pct}`}</span>}
                {c.spent_usd != null && <span className="ps-chip ps-chip--plain ps-chip-xs">{`spent: $${c.spent_usd}`}</span>}
                {c.cap_usd != null && <span className="ps-chip ps-chip--plain ps-chip-xs">{`cap: $${c.cap_usd}`}</span>}
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
                <Card size="small" className="ps-inset-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong>{p.name}</Text>
                    <span className={`ps-chip ps-chip--${p.ok ? 'good' : 'bad'}`}>
                      {p.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                      {p.ok ? (p.ms != null ? `${p.ms}ms` : 'OK') : (p.error || 'thất bại')}
                    </span>
                  </div>
                  {p.detail && <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>{p.detail}</Text>}
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* Audit log */}
      <Card title="Nhật ký hoạt động" size="small" extra={<Button size="small" icon={<ReloadOutlined />} loading={loadingAudit} onClick={loadAudit} aria-label="Tải lại nhật ký" title="Tải lại nhật ký" />}>
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
