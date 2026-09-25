// Social distribution page.
//
// Every published post with an external channel gets a durable job row
// (see functions/_lib/publishing/social_queue.js). This page is the
// operator's view of that queue: what went out, what is retrying, what
// needs a human.
//
// It lives under "Phân phối" rather than inside Embeds because it is a
// distribution channel in its own right — a sibling of Embeds and Kênh
// xuất bản — and because a failed post is an operational issue the
// operator needs to find in one click, not a tab buried in another page.
//
// API: /api/admin/social (GET list + counts, POST retry/cancel)
import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Space, Typography, message, Select, Row, Col,
  Statistic, Tooltip, Popconfirm, Alert, Empty, Segmented,
} from 'antd';
import {
  ReloadOutlined, RedoOutlined, CloseOutlined, LinkOutlined, WarningOutlined,
  CheckCircleOutlined, ClockCircleOutlined, SendOutlined, PictureOutlined,
} from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost } from '../api.js';
import { useProjectUrl } from '../lib/projectUrl.js';

const { Text } = Typography;

const STATUS_META = {
  pending:    { color: 'default',    text: 'Chờ đăng',   icon: <ClockCircleOutlined /> },
  publishing: { color: 'processing', text: 'Đang đăng',  icon: <SendOutlined /> },
  published:  { color: 'success',    text: 'Đã đăng',    icon: <CheckCircleOutlined /> },
  failed:     { color: 'error',      text: 'Thất bại',   icon: <WarningOutlined /> },
  skipped:    { color: 'warning',    text: 'Đã huỷ',     icon: <CloseOutlined /> },
};

const CHANNEL_META = {
  facebook:  { color: 'blue',   text: 'Facebook' },
  facebook_video: { color: 'geekblue', text: 'Facebook Video' },
  youtube_video: { color: 'red', text: 'YouTube Video' },
  instagram: { color: 'magenta', text: 'Instagram' },
  threads:   { color: 'purple', text: 'Threads' },
  x:         { color: 'black',  text: 'X (Twitter)' },
  wordpress: { color: 'cyan',   text: 'WordPress' },
  webhook:   { color: 'default', text: 'Webhook' },
  custom_api: { color: 'default', text: 'Custom API' },
};

export default function Social() {
  const { urlForProject } = useProjectUrl();
  const [jobs, setJobs] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [view, setView] = useState('list');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (channelFilter) params.set('channel', channelFilter);
    const { status, body } = await apiGet(`/api/admin/social${params.toString() ? '?' + params.toString() : ''}`);
    if (status === 200 && body?.ok) {
      setJobs(body.jobs || []);
      setCounts(body.counts || {});
    }
    setLoading(false);
  }, [statusFilter, channelFilter]);

  useEffect(() => { load(); }, [load]);

  const act = async (action, id) => {
    setBusyId(id);
    const r = await apiPost('/api/admin/social', { action, id });
    setBusyId(null);
    if (r.status === 200) {
      const res = r.body?.result;
      if (action === 'retry' && res && res.ok === false) message.error(res.error || 'Đăng lại thất bại');
      else message.success(action === 'retry' ? 'Đã đăng lại' : 'Đã huỷ');
      load();
    } else {
      message.error(r.body?.error || 'Lỗi');
    }
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const needsReconnect = jobs.some((j) => j.needs_reconnect);
  const published = jobs.filter((j) => j.status === 'published');

  const columns = [
    { title: 'Bài viết', key: 'post', ellipsis: true,
      render: (_, r) => (
        <Space>
          {r.hero_image_key
            ? <img src={`/image/${r.hero_image_key}`} alt="" loading="lazy" style={{ width: 48, height: 32, objectFit: 'cover', borderRadius: 4 }} />
            : <div style={{ width: 48, height: 32, borderRadius: 4, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PictureOutlined style={{ color: '#bfbfbf' }} /></div>}
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 13 }}>{r.post_title || r.video_slug || r.blog_post_id || '—'}</Text>
            {r.post_slug && <Text type="secondary" style={{ fontSize: 11 }}>/blog/{r.post_slug}</Text>}
          </Space>
        </Space>
      ) },
    { title: 'Kênh', dataIndex: 'channel', key: 'channel', width: 110,
      render: (c) => { const m = CHANNEL_META[c] || { color: 'default', text: c }; return <Tag color={m.color}>{m.text}</Tag>; } },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 140,
      render: (s, r) => {
        const m = STATUS_META[s] || STATUS_META.pending;
        return (
          <Space size={4}>
            <Tag color={m.color} icon={m.icon}>{m.text}</Tag>
            {r.needs_reconnect ? <Tooltip title="Cần kết nối lại kênh"><WarningOutlined style={{ color: '#ff4d4f' }} /></Tooltip> : null}
          </Space>
        );
      } },
    { title: 'Lần thử', key: 'attempts', width: 90,
      render: (_, r) => <Text type="secondary">{r.attempts}/{r.max_attempts}</Text> },
    { title: 'Thử lại lúc', key: 'next', width: 120,
      render: (_, r) => r.status === 'failed' && r.next_attempt_at
        ? <Text type="secondary" style={{ fontSize: 12 }}>{new Date(r.next_attempt_at * 1000).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
        : '—' },
    { title: 'Bài đăng', key: 'link', width: 120,
      render: (_, r) => r.external_url
        ? <a href={r.external_url} target="_blank" rel="noopener"><LinkOutlined /> Xem</a>
        : '—' },
    { title: 'Lỗi', dataIndex: 'error', key: 'error', ellipsis: true,
      render: (e) => e ? <Tooltip title={e}><Text type="danger" style={{ fontSize: 12 }} ellipsis>{e}</Text></Tooltip> : '—' },
    { title: '', key: 'actions', width: 150,
      render: (_, r) => (r.status === 'failed' || r.status === 'pending') ? (
        <Space size={4}>
          <Button size="small" icon={<RedoOutlined />} loading={busyId === r.id} onClick={() => act('retry', r.id)}>Đăng lại</Button>
          <Popconfirm title="Huỷ job này?" onConfirm={() => act('cancel', r.id)}>
            <Button size="small" danger icon={<CloseOutlined />} />
          </Popconfirm>
        </Space>
      ) : null },
  ];

  return (
    <PageContainer
      title="Bài đăng mạng xã hội"
      description="Trạng thái đăng bài lên Facebook Page và các kênh khác"
      breadcrumb={[{ title: 'Phân phối' }, { title: 'Bài đăng mạng xã hội' }]}
      extra={
        <Space>
          <Select
            allowClear
            placeholder="Tất cả kênh"
            style={{ minWidth: 150 }}
            value={channelFilter || undefined}
            onChange={(v) => setChannelFilter(v || '')}
            options={[
              { value: 'facebook', label: 'Facebook' },
              { value: 'facebook_video', label: 'Facebook Video' },
              { value: 'youtube_video', label: 'YouTube Video' },
              { value: 'instagram', label: 'Instagram' },
              { value: 'threads', label: 'Threads' },
              { value: 'x', label: 'X (Twitter)' },
              { value: 'wordpress', label: 'WordPress' },
              { value: 'webhook', label: 'Webhook' },
              { value: 'custom_api', label: 'Custom API' },
            ]}
          />
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: 'Danh sách' },
              { value: 'gallery', label: 'Thư viện' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
        </Space>
      }
    >
      {needsReconnect && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Có bài không đăng được vì kênh cần kết nối lại"
          description={<span>Token hoặc quyền đã hết hiệu lực. Vào <a href="#publishing">Kênh xuất bản</a> để kết nối lại, rồi bấm “Đăng lại”.</span>}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Đã đăng" value={counts.published || 0} prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Chờ đăng" value={counts.pending || 0} prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Thất bại" value={counts.failed || 0} valueStyle={{ color: counts.failed ? '#ff4d4f' : undefined }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Đã huỷ" value={counts.skipped || 0} /></Card></Col>
      </Row>

      {view === 'gallery' ? (
        <Card>
          {published.length === 0 ? (
            <Empty description="Chưa có bài nào đăng thành công" />
          ) : (
            <Row gutter={[16, 16]}>
              {published.map((j) => (
                <Col xs={24} sm={12} lg={8} xl={6} key={j.id}>
                  <Card
                    size="small"
                    hoverable
                    cover={j.hero_image_key
                      ? <img src={`/image/${j.hero_image_key}`} alt="" loading="lazy" style={{ height: 150, objectFit: 'cover' }} />
                      : <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.03)' }}><PictureOutlined style={{ fontSize: 28, color: '#bfbfbf' }} /></div>}
                    actions={[
                      j.external_url
                        ? <a href={j.external_url} target="_blank" rel="noopener" key="view"><LinkOutlined /> Xem bài</a>
                        : <Text type="secondary" key="none">Không có link</Text>,
                    ]}
                  >
                    <Card.Meta
                      title={<Text style={{ fontSize: 13 }} ellipsis>{j.post_title || '—'}</Text>}
                      description={
                        <Space direction="vertical" size={2} style={{ width: '100%' }}>
                          <Space size={4}>
                            <Tag color={(CHANNEL_META[j.channel] || {}).color || 'default'} style={{ margin: 0 }}>
                              {(CHANNEL_META[j.channel] || {}).text || j.channel}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {j.published_at ? new Date(j.published_at * 1000).toLocaleDateString('vi-VN') : ''}
                            </Text>
                          </Space>
                          {j.post_slug && (
                            <a href={urlForProject(j.project_id, '/blog/' + j.post_slug)} target="_blank" rel="noopener" style={{ fontSize: 11 }}>
                              /blog/{j.post_slug}
                            </a>
                          )}
                        </Space>
                      }
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Card>
      ) : (
        <Card
          title="Hàng đợi đăng bài"
          size="small"
          extra={
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 190 }}
              options={[
                { value: '', label: `Tất cả (${total})` },
                { value: 'pending', label: `Chờ đăng (${counts.pending || 0})` },
                { value: 'published', label: `Đã đăng (${counts.published || 0})` },
                { value: 'failed', label: `Thất bại (${counts.failed || 0})` },
                { value: 'skipped', label: `Đã huỷ (${counts.skipped || 0})` },
              ]}
            />
          }
        >
          <Table
            dataSource={jobs}
            columns={columns}
            rowKey="id"
            size="small"
            loading={loading}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            scroll={{ x: 1050 }}
            locale={{ emptyText: 'Chưa có bài đăng mạng xã hội. Bài viết xuất hiện ở đây sau khi đăng nếu dự án có cấu hình kênh.' }}
          />
        </Card>
      )}
    </PageContainer>
  );
}
