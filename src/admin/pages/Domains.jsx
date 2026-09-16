// Domains approval page (super_admin only) — antd Table, Button, Tag.
// Tenants submit custom domains from Tổng quan; requests wait here as
// pending until approved. Approving attaches the hostname on Cloudflare
// with the platform's global key and flips it live.
import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Tag, Popconfirm, Space, Typography, message, Alert } from 'antd';
import { ReloadOutlined, CheckOutlined, CloseOutlined, LinkOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost } from '../api.js';

const { Text, Link } = Typography;

export default function Domains() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/domains/requests');
    if (status === 200) setRequests(body.requests || []);
    else if (status === 403) message.error('Chỉ super_admin mới duyệt được domain');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (projectId, action) => {
    setActing((a) => ({ ...a, [projectId]: action }));
    const r = await apiPost('/api/admin/domains/requests', { project_id: projectId, action });
    setActing((a) => ({ ...a, [projectId]: null }));
    if (r.status === 200) {
      message.success(action === 'approve' ? `Đã duyệt và gắn ${r.body?.custom_domain || ''} lên Cloudflare` : 'Đã từ chối yêu cầu');
      load();
    } else {
      message.error(r.body?.detail || r.body?.error || 'Thất bại');
    }
  };

  const columns = [
    { title: 'Dự án', dataIndex: 'project_name', key: 'project_name',
      render: (_, r) => (<Space direction="vertical" size={0}><Text strong>{r.project_name || r.project_slug}</Text><Text code style={{ fontSize: 11 }}>{r.project_slug}</Text></Space>) },
    { title: 'Domain xin duyệt', dataIndex: 'pending_custom_domain', key: 'pending',
      render: (d) => <Link href={`https://${d}`} target="_blank"><LinkOutlined /> {d}</Link> },
    { title: 'Đang live', dataIndex: 'live_custom_domain', key: 'live',
      render: (d) => d || <Text type="secondary">—</Text> },
    { title: 'Gửi lúc', dataIndex: 'requested_at', key: 'requested_at', width: 130,
      render: (t) => t ? new Date(t * 1000).toLocaleString('vi-VN') : '-' },
    { title: '', key: 'actions', width: 210,
      render: (_, r) => (
        <Space>
          <Popconfirm title={`Duyệt ${r.pending_custom_domain}? Hệ thống sẽ tự gắn lên Cloudflare.`} onConfirm={() => act(r.project_id, 'approve')}>
            <Button size="small" type="primary" icon={<CheckOutlined />} loading={acting[r.project_id] === 'approve'}>Duyệt</Button>
          </Popconfirm>
          <Popconfirm title={`Từ chối ${r.pending_custom_domain}?`} onConfirm={() => act(r.project_id, 'reject')}>
            <Button size="small" danger icon={<CloseOutlined />} loading={acting[r.project_id] === 'reject'}>Từ chối</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title="Duyệt domain"
      description="Yêu cầu custom domain đang chờ — duyệt để tự gắn lên Cloudflare"
      breadcrumb={[{ title: 'Duyệt domain' }]}
      extra={<Button icon={<ReloadOutlined />} onClick={load} loading={loading} />}
    >
      {requests.length === 0 && !loading && (
        <Alert type="success" showIcon message="Không có yêu cầu nào đang chờ" style={{ marginBottom: 16 }} />
      )}
      <Card>
        <Table
          dataSource={requests}
          columns={columns}
          rowKey="project_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Chưa có yêu cầu nào' }}
        />
      </Card>
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 16 }}
        message="Sau khi duyệt"
        description="Hostname được gắn vào Pages project bằng key global, domain flip thành live ngay. Nhớ dặn tenant tạo bản ghi CNAME về <target>.pages.dev tại DNS của họ."
      />
    </PageContainer>
  );
}
