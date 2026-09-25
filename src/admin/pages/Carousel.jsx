// Carousel page.
//
// A carousel is a POST format, not a video: 5 static 1080×1350 (4:5)
// slides rendered from one published blog article and published to
// Facebook as a multi-photo post. It rides the same video_jobs queue as
// the 9:16 videos, so it lives on its own page instead of the Video page
// where it would sit next to an unrelated product.
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card, Table, Button, Space, Typography, message, Row, Col, Statistic,
  Tooltip, Alert, Popconfirm, Select, Modal,
} from 'antd';
import {
  ReloadOutlined, FileImageOutlined, FacebookOutlined, DeleteOutlined,
  PlusOutlined, ClockCircleOutlined, CheckCircleOutlined, WarningOutlined,
  EyeOutlined, ShareAltOutlined,
} from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import VideoStatusTag from '../components/VideoStatusTag.jsx';
import { apiGet, apiPost, getActiveProject } from '../api.js';
import { CAROUSEL_KIND, IN_PROGRESS, statusMeta, useVideoJobs, fmtDateTime } from '../lib/videoQueue.js';

const { Text, Paragraph } = Typography;

// Slide 1 = bìa, slides giữa = ý chính, slide cuối = kêu gọi — khớp với
// mẫu mà agent dựng (cover / 3 points / CTA).
function slideRole(index, total) {
  if (index === 0) return 'Bìa';
  if (index === total - 1) return 'Kêu gọi';
  return `Ý ${index}`;
}

export default function Carousel() {
  // The shared queue hook owns loading, polling, publish and delete; this
  // page keeps only its create flow and its presentation.
  const { jobs: allJobs, loading, reload: load, publish, remove } = useVideoJobs({ noun: 'carousel' });
  const jobs = allJobs.filter((j) => j.kind === CAROUSEL_KIND);
  const [posts, setPosts] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [selectedSlug, setSelectedSlug] = useState(undefined);
  const [viewing, setViewing] = useState(null);

  const loadPosts = useCallback(async () => {
    const { status, body } = await apiGet('/api/admin/blog/list');
    if (status === 200) setPosts((body?.posts || []).filter((p) => p.status === 'published'));
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const postOptions = useMemo(
    () => posts.map((p) => ({ value: p.slug, label: p.title || p.slug })),
    [posts]
  );

  const createCarousel = async () => {
    if (!selectedSlug) { message.warning('Chọn một bài viết trước'); return; }
    setBusyId('__new__');
    const { status, body } = await apiPost('/api/admin/video/carousel', {
      project_id: getActiveProject(), slug: selectedSlug,
    });
    setBusyId(null);
    if (status === 200 && body?.ok) {
      message.success(body.hint || 'Đã tạo carousel — agent sẽ xuất 5 slide trong ~5 phút');
      setSelectedSlug(undefined);
      load();
    } else if (status === 409) {
      message.info('Carousel cho bài này đang được tạo — đợi vài phút rồi tải lại');
    } else if (status === 404) {
      message.error('Không tìm thấy bài viết đã xuất bản với slug này');
    } else {
      message.error(body?.hint || body?.error || 'Không tạo được carousel');
    }
  };

  // Row actions: the page owns the per-row spinner, the shared hook owns
  // the request and the copy.
  const publishFb = async (id) => { setBusyId(id); await publish(id); setBusyId(null); };
  const publishThreads = async (id) => { setBusyId(id); await publish(id, 'threads'); setBusyId(null); };
  const deleteJob = async (id) => { setBusyId(id); await remove(id); setBusyId(null); };

  const counts = {
    rendering: jobs.filter((j) => IN_PROGRESS.includes(j.status)).length,
    done: jobs.filter((j) => j.status === 'done').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };

  const columns = [
    {
      title: 'Slide', dataIndex: 'slides', width: 84,
      render: (slides, r) => {
        if (slides?.length) {
          return (
            <Tooltip title="Bấm để xem bộ 5 slide">
              <img src={slides[0]} alt="slide 1" onClick={() => setViewing(r)}
                style={{ width: 64, height: 80, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', display: 'block', border: '1px solid #333' }} />
            </Tooltip>
          );
        }
        return (
          <Tooltip title={statusMeta(CAROUSEL_KIND, r.status).text}>
            <div style={{ width: 64, height: 80, borderRadius: 6, border: '1px dashed #555', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
              <FileImageOutlined />
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'Bài viết', dataIndex: 'title', ellipsis: true,
      render: (t, r) => (
        <Space direction="vertical" size={0}>
          <Text ellipsis={{ tooltip: t || r.slug }} style={{ maxWidth: 320 }}>{t || r.slug}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.slug}</Text>
        </Space>
      ),
    },
    {
      title: 'Trạng thái', dataIndex: 'status', width: 170,
      render: (s, r) => {
        const tag = <VideoStatusTag status={s} kind={CAROUSEL_KIND} />;
        return s === 'failed' && r.error ? <Tooltip title={r.error}>{tag}</Tooltip> : tag;
      },
    },
    {
      title: 'Cập nhật', dataIndex: 'updated_at', width: 140, responsive: ['lg'],
      render: (v) => <Text type="secondary">{fmtDateTime(v)}</Text>,
    },
    {
      title: 'Hành động', key: 'actions', width: 380,
      render: (_, r) => {
        const ready = r.status === 'done' && !!r.slides?.length;
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} disabled={!ready} onClick={() => setViewing(r)}>Xem slide</Button>
            <Popconfirm
              title="Đăng carousel lên Facebook Page?"
              description="Đăng 5 slide dưới dạng multi-photo post kèm link bài viết."
              disabled={!ready}
              onConfirm={() => publishFb(r.id)}
            >
              <Button size="small" icon={<FacebookOutlined />} disabled={!ready} loading={busyId === r.id}>Đăng FB</Button>
            </Popconfirm>
            <Popconfirm
              title="Đăng carousel này lên Threads?"
              description="Threads đăng bài chữ kèm link bài viết — 5 slide không được đính kèm."
              disabled={!ready}
              onConfirm={() => publishThreads(r.id)}
            >
              <Button size="small" icon={<ShareAltOutlined />} disabled={!ready} loading={busyId === r.id}>Đăng Thread</Button>
            </Popconfirm>
            <Popconfirm
              title="Xóa carousel này?"
              description="Xóa cả các slide trên R2 — không thể hoàn tác."
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteJob(r.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === r.id} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <PageContainer
      title="Carousel ảnh"
      description="Bài đăng 5 slide ảnh (4:5) cho Facebook, dựng tự động từ một bài viết."
    >
      <Alert
        type="info"
        showIcon
        icon={<FileImageOutlined />}
        style={{ marginBottom: 16 }}
        message="Carousel là một dạng bài đăng, không phải video"
        description={
          <Space direction="vertical" size={2}>
            <span>① Chọn một bài viết đã xuất bản · ② Bấm “Tạo carousel” · ③ Chờ ~5 phút để agent xuất slide · ④ Xem trước rồi Đăng Facebook.</span>
            <span>Bố cục mỗi bộ: 1 slide bìa · 3 slide ý chính · 1 slide kêu gọi — kích thước 1080×1350.</span>
          </Space>
        }
      />

      <Card title={<Space><PlusOutlined /> Tạo carousel mới</Space>} style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Chọn bài viết để tạo carousel…"
            value={selectedSlug}
            onChange={setSelectedSlug}
            options={postOptions}
            style={{ minWidth: 320 }}
            notFoundContent={posts.length ? 'Không có bài viết khớp' : 'Chưa có bài viết đã xuất bản'}
            allowClear
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={busyId === '__new__'}
            disabled={!selectedSlug}
            onClick={createCarousel}
          >
            Tạo carousel
          </Button>
        </Space>
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          Chỉ chọn được bài đã xuất bản. Nếu bài đã có carousel, hệ thống sẽ báo đang tạo và bạn chỉ cần đợi.
        </Paragraph>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small"><Statistic title="Đang tạo" value={counts.rendering} prefix={<ClockCircleOutlined />} /></Card>
        </Col>
        <Col xs={8}>
          <Card size="small"><Statistic title="Sẵn sàng đăng" value={counts.done} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} /></Card>
        </Col>
        <Col xs={8}>
          <Card size="small"><Statistic title="Lỗi" value={counts.failed} valueStyle={{ color: '#ff4d4f' }} prefix={<WarningOutlined />} /></Card>
        </Col>
      </Row>

      <Card
        title={<Space><FileImageOutlined /> Carousel đã tạo</Space>}
        extra={<Button icon={<ReloadOutlined />} onClick={load}>Tải lại</Button>}
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={jobs}
          columns={columns}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: 'Chưa có carousel nào — chọn một bài viết ở trên rồi bấm “Tạo carousel”.' }}
        />
      </Card>

      <Modal
        open={!!viewing}
        title={viewing?.title || viewing?.slug}
        onCancel={() => setViewing(null)}
        width={760}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={() => setViewing(null)}>Đóng</Button>
            <Popconfirm
              title="Đăng carousel lên Facebook Page?"
              description="Đăng 5 slide dưới dạng multi-photo post kèm link bài viết."
              onConfirm={() => { publishFb(viewing.id); setViewing(null); }}
            >
              <Button type="primary" icon={<FacebookOutlined />} loading={busyId === viewing?.id}>Đăng Facebook</Button>
            </Popconfirm>
            <Popconfirm
              title="Đăng carousel này lên Threads?"
              description="Threads đăng bài chữ kèm link bài viết — 5 slide không được đính kèm."
              onConfirm={() => { publishThreads(viewing.id); setViewing(null); }}
            >
              <Button icon={<ShareAltOutlined />} loading={busyId === viewing?.id}>Đăng Threads</Button>
            </Popconfirm>
          </Space>
        }
      >
        {viewing?.slides?.length ? (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
            {viewing.slides.map((s, n) => (
              <div key={n} style={{ textAlign: 'center', flex: '0 0 auto' }}>
                <img src={s} alt={`Slide ${n + 1}`}
                  style={{ height: 300, borderRadius: 8, border: '1px solid #333', display: 'block' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>{n + 1}. {slideRole(n, viewing.slides.length)}</Text>
              </div>
            ))}
          </div>
        ) : (
          <Text type="secondary">Slide chưa sẵn sàng.</Text>
        )}
      </Modal>
    </PageContainer>
  );
}
