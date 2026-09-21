// Video 9:16 page.
//
// The operator's view of the video_jobs queue (see
// functions/api/admin/video/*). Videos are rendered off-platform by the
// HyperFrames agent on the render VPS; this page shows what exists,
// what failed and why, and links the MP4 for download / social posting.
import { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Typography, Tag, message, Row, Col, Statistic, Tooltip, Alert, Popconfirm, Input, Modal,
} from 'antd';
import {
  ReloadOutlined, VideoCameraOutlined, CheckCircleOutlined,
  ClockCircleOutlined, WarningOutlined, DownloadOutlined, FacebookOutlined,
  AppstoreOutlined, DeleteOutlined, GlobalOutlined, PlayCircleOutlined,
} from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost, getActiveProject } from '../api.js';

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
  const [busyId, setBusyId] = useState(null);
  const [siteUrl, setSiteUrl] = useState('');
  const [viewing, setViewing] = useState(null);
  const [brandForm, setBrandForm] = useState({ video_tagline: '', brand_accent: '', address: '', phone: '' });
  const [brandOpen, setBrandOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/video/list');
    if (status === 200 && body?.ok) setJobs(body.jobs || []);
    else message.error(body?.error || 'Không tải được danh sách video');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadBrand = useCallback(async () => {
    const pid = getActiveProject();
    if (!pid) return;
    const { status, body } = await apiGet(`/api/admin/video/brand?project_id=${pid}`);
    if (status === 200 && body?.ok) {
      setBrandForm({
        video_tagline: body.brand?.video_tagline || '',
        brand_accent: body.brand.brand_accent || body.brand.theme_color || '',
        address: body.brand.address || '',
        phone: body.brand.phone || '',
      });
    }
  }, []);

  useEffect(() => { loadBrand(); }, [loadBrand]);

  const saveBrand = async () => {
    setBusyId('__brand__');
    const { status, body } = await apiPost('/api/admin/video/brand', { project_id: getActiveProject(), ...brandForm });
    setBusyId(null);
    if (status === 200 && body?.ok) {
      message.success('Đã lưu Brand video — video tiếp theo sẽ dùng DNA mới');
    } else {
      message.error(body?.error || 'Lưu thất bại');
    }
  };

  const enqueueMissing = async () => {
    setBusyId('__all__');
    const { status, body } = await apiPost('/api/admin/video/enqueue-missing', { project_id: getActiveProject(), limit: 30 });
    setBusyId(null);
    if (status === 200 && body?.ok) {
      message.success(body.enqueued ? `Đã thêm ${body.enqueued} bài vào hàng chờ` : 'Không có bài nào thiếu video');
      load();
    } else {
      message.error(body?.error || 'Không enqueue được');
    }
  };

  const statusTag = (s, kind) => {
    const m = STATUS_META[s] || { color: 'default', text: s };
    return (
      <Space size={4}>
        <Tag color={m.color}>{m.text}</Tag>
        {kind === 'business' && <Tag color="gold">Doanh nghiệp</Tag>}
      </Space>
    );
  };

  const createBusiness = async () => {
    setBusyId('__biz__');
    const { status, body } = await apiPost('/api/admin/video/business', { project_id: getActiveProject() });
    setBusyId(null);
    if (status === 200 && body?.ok) {
      message.success('Đã tạo job video doanh nghiệp — agent sẽ render trong chu kỳ 5 phút');
      load();
    } else if (status === 409) {
      message.info('Video doanh nghiệp đang được render — tải lại sau vài phút');
    } else {
      message.error(body?.error || 'Không tạo được job');
    }
  };

  const createWebsite = async () => {
    const url = (siteUrl || '').trim();
    if (!url) { message.warning('Nhập URL website trước'); return; }
    setBusyId('__site__');
    const { status, body } = await apiPost('/api/admin/video/website', { project_id: getActiveProject(), url });
    setBusyId(null);
    if (status === 200 && body?.ok) {
      message.success('Đã tạo job — agent sẽ chụp trang, viết storyboard và render');
      setSiteUrl('');
      load();
    } else if (status === 409) {
      message.info('URL này đang được render — tải lại sau vài phút');
    } else {
      message.error(body?.hint || body?.error || 'Không tạo được job');
    }
  };

  const deleteVideo = async (id) => {
    setBusyId(id);
    const { status, body } = await apiPost('/api/admin/video/delete', { id });
    setBusyId(null);
    if (status === 200 && body?.ok) {
      message.success('Đã xóa video (cả file trên R2)');
      load();
    } else {
      message.error(body?.detail || body?.error || 'Xóa thất bại');
    }
  };

  const columns = [
    {
      title: 'Bài viết', dataIndex: 'title', ellipsis: true,
      render: (t, r) => <Text strong={false} ellipsis={{ tooltip: t }} style={{ maxWidth: 320 }}>{t || r.slug}</Text>,
    },
    { title: 'Trạng thái', dataIndex: 'status', width: 170, render: (s, r) => statusTag(s, r.kind) },
    {
      title: 'Video', dataIndex: 'video_url', width: 240,
      render: (url, r) => url ? (
        <Space>
          <Button size="small" icon={<PlayCircleOutlined />} onClick={() => setViewing(r)}>Xem</Button>
          <Tooltip title="Tải MP4 (9:16)">
            <Button size="small" icon={<DownloadOutlined />} href={url} download={`${r.slug}.mp4`} />
          </Tooltip>
          <Popconfirm
            title="Đăng video này lên Facebook Page?"
            description="Tạo video post kèm link bài viết trong mô tả."
            onConfirm={() => publishFb(r.id)}
          >
            <Button size="small" icon={<FacebookOutlined />} loading={busyId === r.id}>Đăng FB</Button>
          </Popconfirm>
          <Popconfirm
            title="Xóa video này?"
            description="Xóa cả file MP4 trên R2 — không thể hoàn tác."
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteVideo(r.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === r.id} />
          </Popconfirm>
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
      <Card
        title={<Space><VideoCameraOutlined /> Hàng chờ video</Space>}
        extra={
          <Space>
            <Input
              placeholder="https://website-khach.com — tạo video giới thiệu"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              onPressEnter={createWebsite}
              style={{ width: 240 }}
              allowClear
            />
            <Button icon={<GlobalOutlined />} loading={busyId === '__site__'} onClick={createWebsite}>
              Video từ URL
            </Button>
            <Button icon={<AppstoreOutlined />} loading={busyId === '__biz__'} onClick={createBusiness}>
              Video doanh nghiệp
            </Button>
            <Button icon={<ClockCircleOutlined />} loading={busyId === '__all__'} onClick={enqueueMissing}>
              Render tất cả bài thiếu
            </Button>
            <Button icon={<ReloadOutlined />} onClick={load}>Tải lại</Button>
          </Space>
        }
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
      <Card
        title="Brand video (DNA hiển thị trên mọi video)"
        style={{ marginTop: 16 }}
        extra={
          <Button type="link" onClick={() => setBrandOpen(!brandOpen)}>
            {brandOpen ? 'Thu gọn' : 'Chỉnh sửa'}
          </Button>
        }
      >
        {brandOpen ? (
          <Row gutter={16}>
            <Col span={12}>
              <Input addonBefore="Tagline" value={brandForm.video_tagline}
                onChange={(e) => setBrandForm({ ...brandForm, video_tagline: e.target.value })}
                placeholder="Khẩu hiệu hiện trên video" style={{ marginBottom: 12 }} />
              <Input addonBefore="#" addonAfter="màu brand" value={brandForm.brand_accent}
                onChange={(e) => setBrandForm({ ...brandForm, brand_accent: e.target.value })}
                placeholder="1677ff" style={{ marginBottom: 12 }} />
            </Col>
            <Col span={12}>
              <Input addonBefore="📍" value={brandForm.address}
                onChange={(e) => setBrandForm({ ...brandForm, address: e.target.value })}
                placeholder="Địa chỉ" style={{ marginBottom: 12 }} />
              <Input addonBefore="☎" value={brandForm.phone}
                onChange={(e) => setBrandForm({ ...brandForm, phone: e.target.value })}
                placeholder="Số điện thoại" style={{ marginBottom: 16 }} />
              <Button type="primary" loading={busyId === '__brand__'} onClick={saveBrand}>Lưu Brand video</Button>
            </Col>
          </Row>
        ) : (
          <Text type="secondary">
            Tagline: {brandForm.video_tagline || '(chưa đặt)'} · Màu: {brandForm.brand_accent || '(mặc định)'} · Địa chỉ: {brandForm.address || '(trống)'} · ĐT: {brandForm.phone || '(trống)'}
          </Text>
        )}
      </Card>
      <Modal
        open={!!viewing}
        title={viewing?.title || viewing?.slug}
        onCancel={() => setViewing(null)}
        footer={
          <Space>
            <Button icon={<DownloadOutlined />} href={viewing?.video_url} download={`${viewing?.slug || 'video'}.mp4`}>
              Tải MP4
            </Button>
            <Button type="primary" onClick={() => setViewing(null)}>Đóng</Button>
          </Space>
        }
        width={420}
        destroyOnClose
      >
        {viewing?.video_url && (
          <video
            src={viewing.video_url}
            controls
            autoPlay
            playsInline
            style={{ width: '100%', aspectRatio: '9 / 16', maxHeight: '70vh', background: '#000', borderRadius: 8 }}
          />
        )}
        <Space style={{ marginTop: 12 }} direction="vertical" size={0}>
          <Text strong>{viewing?.title || viewing?.slug}</Text>
          <Text type="secondary">{viewing?.slug} · {statusTag(viewing?.status, viewing?.kind)}</Text>
        </Space>
      </Modal>
    </PageContainer>
  );
}
