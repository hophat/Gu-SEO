// Video 9:16 page.
//
// The operator's view of the video_jobs queue (see
// functions/api/admin/video/*). Videos are rendered off-platform by the
// HyperFrames agent on the render VPS; this page shows what exists,
// what failed and why, and links the MP4 for download / social posting.
import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Typography, Tag, message, Row, Col, Statistic, Tooltip, Alert,
} from 'antd';
import {
  ReloadOutlined, VideoCameraOutlined, CheckCircleOutlined,
  ClockCircleOutlined, WarningOutlined, DownloadOutlined,
} from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet } from '../api.js';

const { Text } = Typography;

const STATUS_META = {
  done:      { color: 'success',    text: 'Đã có video' },
  claimed:   { color: 'processing', text: 'Đang render' },
  rendering: { color: 'processing', text: 'Đang render' },
  pending:   { color: 'default',    text: 'Chờ render' },
  failed:    { color: 'error',      text: 'Lỗi render' },
};

function fmtDate(sec) {
  if (!sec) return '—';
  return new Date(sec * 1000).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function Video() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/video/list');
    if (status === 200 && body?.ok) setJobs(body.jobs || []);
    else message.error(body?.error || 'Không tải được danh sách video');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusTag = (s) => {
    const m = STATUS_META[s] || { color: 'default', text: s };
    return <Tag color={m.color}>{m.text}</Tag>;
  };

  const columns = [
    {
      title: 'Bài viết', dataIndex: 'title', ellipsis: true,
      render: (t, r) => <Text strong={false} ellipsis={{ tooltip: t }} style={{ maxWidth: 320 }}>{t || r.slug}</Text>,
    },
    { title: 'Trạng thái', dataIndex: 'status', width: 130, render: statusTag },
    {
      title: 'Video', dataIndex: 'video_url', width: 170,
      render: (url, r) => url ? (
        <Space>
          <a href={url} target="_blank" rel="noopener"><Button size="small" icon={<VideoCameraOutlined />}>Xem</Button></a>
          <Tooltip title="Tải MP4 (9:16)">
            <Button size="small" icon={<DownloadOutlined />} href={url} download={`${r.slug}.mp4`} />
          </Tooltip>
        </Space>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: 'Lỗi render', dataIndex: 'error', ellipsis: true, responsive: ['lg'],
      render: (e) => e ? <Tooltip title={e}><Text type="danger">{e}</Text></Tooltip> : '—',
    },
    {
      title: 'Cập nhật', dataIndex: 'updated_at', width: 140, responsive: ['lg'],
      render: (v) => <Text type="secondary">{fmtDate(v)}</Text>,
    },
  ];

  const done = jobs.filter((j) => j.status === 'done').length;
  const rendering = jobs.filter((j) => j.status === 'claimed' || j.status === 'rendering').length;
  const failed = jobs.filter((j) => j.status === 'failed').length;

  return (
    <PageContainer
      title="Video 9:16"
      description="Video dọc cho mạng xã hội — render tự động trên VPS bằng HyperFrames + giọng đọc AI."
    >
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="Mỗi bài mới trong 48 giờ được agent claim theo chu kỳ 15 phút."
        description="Bài cũ hơn 48 giờ: chạy tay trên VPS — node render-video.mjs --slug <slug>."
      />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="Đã có video" value={done} valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="Đang render" value={rendering} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="Lỗi" value={failed} valueStyle={{ color: done ? undefined : '#cf1322' }} /></Card></Col>
      </Row>
      <Card
        title={<Space><VideoCameraOutlined /> Hàng chờ video</Space>}
        extra={<Button icon={<ReloadOutlined />} onClick={load}>Tải lại</Button>}
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={jobs}
          columns={columns}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: 'Chưa có video nào — agent sẽ tự render cho bài mới trong 48 giờ tới.' }}
        />
      </Card>
    </PageContainer>
  );
}
