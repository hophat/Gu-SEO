// Video 9:16 page.
//
// The operator's view of the video_jobs queue (see
// functions/api/admin/video/*). Videos are rendered off-platform by the
// HyperFrames agent on the render VPS; this page shows what exists,
// what failed and why, and links the MP4 for download / social posting.
//
// Creation goes through ONE wizard ("Tạo video"): pick a source (bài
// viết / URL / doanh nghiệp), pick a template from the catalog the
// templates endpoint serves, pick a duration when overriding the template.
// The endpoint stores template + optional duration; null lets the agent choose
// its default.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Card, Table, Button, Space, Typography, message, Row, Col, Tooltip, Alert, Popconfirm, Input, Modal, Select,
  Segmented, Slider, Upload, Spin,
} from 'antd';
import {
  ReloadOutlined, VideoCameraOutlined,
  ClockCircleOutlined, DownloadOutlined, FacebookOutlined, YoutubeOutlined,
  DeleteOutlined, PlayCircleOutlined, PauseCircleOutlined, UploadOutlined,
} from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import VideoStatusTag from '../components/VideoStatusTag.jsx';
import { apiGet, apiPost, getActiveProject } from '../api.js';
import { CAROUSEL_KIND, useVideoJobs, fmtDateTime } from '../lib/videoQueue.js';

const { Text } = Typography;

const SOURCE_OPTIONS = [
  { label: 'Bài viết', value: 'post' },
  { label: 'URL', value: 'url' },
  { label: 'Doanh nghiệp', value: 'business' },
];

export default function Video() {
  // The shared queue hook owns loading, polling, publish and delete. This
  // page shows only videos — carousels are a post format on their own page.
  const { jobs: allJobs, loading, reload: load, publish, remove } = useVideoJobs({ poll: false });
  const jobs = allJobs.filter((j) => j.kind !== CAROUSEL_KIND);
  const [busyId, setBusyId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [brandForm, setBrandForm] = useState({
    video_tagline: '', brand_accent: '', address: '', phone: '',
    presenter_name: '', presenter_image_url: '',
  });
  const [brandOpen, setBrandOpen] = useState(false);
  const [presenterUploading, setPresenterUploading] = useState(false);

  // Create wizard — one modal covers what used to be three separate
  // affordances (post select, URL input, business button).
  const [posts, setPosts] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [srcType, setSrcType] = useState('post');
  const [createSlug, setCreateSlug] = useState(undefined);
  const [siteUrl, setSiteUrl] = useState('');
  const [tplId, setTplId] = useState('auto');
  const [duration, setDuration] = useState(null);

  // Background music: 'auto' (claim picks a matching free catalog track) | 'none' | a catalog id.
  // playingBgm is the track id currently previewing — one shared <audio>
  // element so two previews can never overlap.
  const [bgmId, setBgmId] = useState('auto');
  const [playingBgm, setPlayingBgm] = useState(null);
  const audioRef = useRef(null);

  // The template catalog is per-project only because of hasPresenter —
  // the list itself is static. Cached per project so reopening the modal
  // (and the table's id→label lookup) never refetches.
  const tplCache = useRef({});
  const [tplData, setTplData] = useState({ templates: [], hasPresenter: false, music: [] });
  const [tplLoading, setTplLoading] = useState(false);

  const loadTemplates = useCallback(async (force = false) => {
    const pid = getActiveProject();
    if (!pid) return;
    if (!force && tplCache.current[pid]) { setTplData(tplCache.current[pid]); return; }
    setTplLoading(true);
    const { status, body } = await apiGet(`/api/admin/video/templates?project_id=${pid}`);
    if (status === 200 && body?.ok) {
      tplCache.current[pid] = {
        templates: body.templates || [],
        hasPresenter: !!body.hasPresenter,
        music: body.music || [],
      };
      setTplData(tplCache.current[pid]);
    }
    setTplLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const loadPosts = useCallback(async () => {
    const { status, body } = await apiGet('/api/admin/blog/list');
    if (status === 200) setPosts((body?.posts || []).filter((p) => p.status === 'published'));
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const postOptions = useMemo(
    () => posts.map((p) => ({ value: p.slug, label: p.title || p.slug })),
    [posts]
  );

  const tplLabel = useCallback(
    (id) => {
      if (!id || id === 'auto') return 'Tự động';
      return tplData.templates.find((t) => t.id === id)?.label || id;
    },
    [tplData]
  );

  const openCreate = () => {
    setSrcType('post');
    setCreateSlug(undefined);
    setTplId('auto');
    setDuration(null);
    setBgmId('auto');
    setPlayingBgm(null);
    setCreateOpen(true);
    loadTemplates();
  };

  // One shared player: clicking a row's play button swaps the src, clicking
  // the playing row pauses. destroyOnClose unmounts the element, so a closed
  // modal can never keep playing.
  const togglePreview = (t) => {
    const el = audioRef.current;
    if (!el) return;
    if (playingBgm === t.id) {
      el.pause();
      setPlayingBgm(null);
      return;
    }
    el.src = t.url;
    el.play().catch(() => setPlayingBgm(null));
    setPlayingBgm(t.id);
  };

  const pickTemplate = (t) => {
    setTplId(t.id);
    setDuration(t.defaultDuration ?? null);
  };

  // Switching the source can invalidate the picked template — fall back
  // to 'auto', which accepts every source, instead of leaving a disabled
  // card selected.
  const onSourceChange = (v) => {
    setSrcType(v);
    const t = tplData.templates.find((x) => x.id === tplId);
    if (t && t.id !== 'auto' && !t.sources.includes(v)) {
      setTplId('auto');
      setDuration(null);
    }
  };

  const submitCreate = async () => {
    const source = { type: srcType };
    if (srcType === 'post') {
      if (!createSlug) { message.warning('Chọn một bài viết trước'); return; }
      source.slug = createSlug;
    }
    if (srcType === 'url') {
      const url = (siteUrl || '').trim();
      if (!url) { message.warning('Nhập URL website trước'); return; }
      source.url = url;
    }
    setBusyId('__create__');
    const { status, body } = await apiPost('/api/admin/video/create', {
      project_id: getActiveProject(), source, template: tplId || 'auto', bgm: bgmId || 'auto',
      ...(duration === null ? {} : { duration }),
    });
    setBusyId(null);
    if (status === 200 && body?.ok) {
      message.success(body.hint || 'Đã tạo job video');
      setCreateOpen(false);
      setSiteUrl('');
      load();
    } else if (status === 409) {
      message.info('Đang render — đợi vài phút rồi tải lại');
    } else if (body?.error === 'template_source_mismatch') {
      message.error(body.hint || 'Template không hỗ trợ nguồn này');
    } else if (status === 404) {
      message.error('Không tìm thấy bài viết');
    } else {
      message.error(body?.hint || body?.error || 'Không tạo được job');
    }
  };

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
        presenter_name: body.brand.presenter_name || '',
        presenter_image_url: body.brand.presenter_image_url || '',
      });
    }
  }, []);

  useEffect(() => { loadBrand(); }, [loadBrand]);

  const saveBrand = async () => {
    setBusyId('__brand__');
    // presenter_image_url is server-assigned (the upload endpoint owns it)
    // — echoing it back through the save would be ignored anyway, so it
    // never leaves the form state.
    const { presenter_image_url: _dropped, ...savable } = brandForm;
    const { status, body } = await apiPost('/api/admin/video/brand', { project_id: getActiveProject(), ...savable });
    setBusyId(null);
    if (status === 200 && body?.ok) {
      message.success('Đã lưu Brand video — video tiếp theo sẽ dùng DNA mới');
    } else {
      message.error(body?.error || 'Lưu thất bại');
    }
  };

  // Same file-reading helper as the logo upload (Brand.jsx / Overview.jsx):
  // FileReader → data URL → JSON base64 POST. Returning false keeps antd
  // Upload from POSTing the file itself — beforeUpload owns the send.
  const uploadPresenter = async (file) => {
    if (!file) return false;
    if (file.size > 2 * 1024 * 1024) { message.error('Ảnh quá lớn (tối đa 2 MB).'); return false; }
    setPresenterUploading(true);
    const dataUrl = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(file);
    });
    if (!dataUrl) { message.error('Không đọc được tệp.'); setPresenterUploading(false); return false; }
    const { status, body } = await apiPost('/api/admin/video/presenter', {
      filename: file.name, content_type: file.type, base64: dataUrl,
    });
    setPresenterUploading(false);
    if (status === 200 && body?.ok) {
      setBrandForm((b) => ({ ...b, presenter_image_url: body.presenter_image_url }));
      // hasPresenter just flipped — let the wizard refetch on next open.
      tplCache.current = {};
      setTplData((d) => ({ ...d, hasPresenter: true }));
      message.success('Đã cập nhật ảnh người dẫn — template Thời sự đã mở khoá.');
    } else {
      message.error(body?.hint || body?.error || `Tải ảnh thất bại (${status})`);
    }
    return false;
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

  // Row actions: the page owns the per-row spinner, the shared hook owns
  // the request and the copy.
  const publishFb = async (id) => { setBusyId(id); await publish(id); setBusyId(null); };
  const publishYoutube = async (id) => { setBusyId(id); await publish(id, 'youtube'); setBusyId(null); };
  const deleteVideo = async (id) => { setBusyId(id); await remove(id); setBusyId(null); };

  const columns = [
    {
      title: 'Thumbnail', dataIndex: 'video_url', width: 76,
      render: (url, r) => {
        return url ? (
          <Tooltip title="Bấm để xem video">
            <video
              src={`${url}#t=2`}
              preload="metadata"
              muted
              playsInline
              onClick={() => setViewing(r)}
              style={{ width: 64, height: 114, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', background: '#000', display: 'block' }}
            />
          </Tooltip>
        ) : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Bài viết', dataIndex: 'title', ellipsis: true,
      render: (t, r) => <Text strong={false} ellipsis={{ tooltip: t }} style={{ maxWidth: 320 }}>{t || r.slug}</Text>,
    },
    {
      title: 'Template', dataIndex: 'template', width: 110,
      render: (v) => <Text type="secondary">{tplLabel(v)}</Text>,
    },
    { title: 'Trạng thái', dataIndex: 'status', width: 170, render: (s, r) => <VideoStatusTag status={s} kind={r.kind} /> },
    {
      // 390px, not 300px: two publish actions plus the existing controls
      // need enough room under the fixed table layout.
      title: 'Hành động', key: 'actions', width: 390,
      render: (url, r) => {
        return url ? (
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
            {r.blog_post_id && !String(r.blog_post_id).match(/^(project|url|carousel):/)
              && r.kind !== 'carousel' && !String(r.video_key || '').startsWith('carousel/') && (
              <Popconfirm
                title="Đăng video này lên YouTube?"
                description="Video được đưa vào hàng chờ upload resumable. Cron sẽ xử lý và có thể mất vài phút."
                onConfirm={() => publishYoutube(r.id)}
              >
                <Button size="small" icon={<YoutubeOutlined />} loading={busyId === r.id}>Đăng YT</Button>
              </Popconfirm>
            )}
            <Popconfirm
              title="Xóa video này?"
              description="Xóa cả file MP4 trên R2 — không thể hoàn tác."
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteVideo(r.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === r.id} />
            </Popconfirm>
          </Space>
        ) : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Lỗi render', dataIndex: 'error', ellipsis: true, responsive: ['lg'],
      render: (e) => e ? <Tooltip title={e}><Text type="danger">{e}</Text></Tooltip> : '—',
    },
    {
      title: 'Cập nhật', dataIndex: 'updated_at', width: 140, responsive: ['lg'],
      render: (v) => <Text type="secondary">{fmtDateTime(v)}</Text>,
    },
  ];

  return (
    <PageContainer
      title="Video 9:16"
      description="Video dọc cho mạng xã hội — render tự động trên VPS bằng HyperFrames + giọng đọc AI."
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          <Space>
            <span>Đăng carousel 5 slide ảnh? Đây là một dạng bài đăng, không phải video —</span>
            <Button type="link" style={{ padding: 0 }} onClick={() => { window.location.hash = 'carousel'; }}>
              mở trang Carousel ảnh
            </Button>
          </Space>
        }
      />
      <Card
        title={<Space><VideoCameraOutlined /> Hàng chờ video</Space>}
        extra={
          <Space>
            <Button type="primary" icon={<VideoCameraOutlined />} onClick={openCreate}>
              Tạo video
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
              <Input addonBefore="Người dẫn" value={brandForm.presenter_name}
                onChange={(e) => setBrandForm({ ...brandForm, presenter_name: e.target.value })}
                placeholder="Tên hiện trên bản tin (template Thời sự)" maxLength={120} style={{ marginBottom: 12 }} />
              <Space align="center">
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={uploadPresenter}
                >
                  <Button icon={<UploadOutlined />} loading={presenterUploading}>Ảnh người dẫn</Button>
                </Upload>
                {brandForm.presenter_image_url ? (
                  <Tooltip title="Ảnh người dẫn hiện tại">
                    <img
                      src={brandForm.presenter_image_url}
                      alt="Người dẫn"
                      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                    />
                  </Tooltip>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>Chưa có — template Thời sự cần ảnh này</Text>
                )}
              </Space>
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
            Tagline: {brandForm.video_tagline || '(chưa đặt)'} · Màu: {brandForm.brand_accent || '(mặc định)'} · Địa chỉ: {brandForm.address || '(trống)'} · ĐT: {brandForm.phone || '(trống)'} · Người dẫn: {brandForm.presenter_name || '(chưa có)'}{brandForm.presenter_image_url ? ' · có ảnh' : ''}
          </Text>
        )}
      </Card>
      <Modal
        open={createOpen}
        title="Tạo video mới"
        onCancel={() => setCreateOpen(false)}
        onOk={submitCreate}
        okText="Tạo video"
        cancelText="Huỷ"
        confirmLoading={busyId === '__create__'}
        width={560}
        destroyOnClose
      >
        <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Nguồn nội dung</Text>
            <Segmented value={srcType} onChange={onSourceChange} options={SOURCE_OPTIONS} />
            <div style={{ marginTop: 12 }}>
              {srcType === 'post' && (
                <Select
                  showSearch
                  allowClear
                  placeholder="Chọn bài viết đã xuất bản"
                  style={{ width: '100%' }}
                  value={createSlug}
                  onChange={setCreateSlug}
                  options={postOptions}
                  optionFilterProp="label"
                />
              )}
              {srcType === 'url' && (
                <Input
                  placeholder="https://website-khach.com — agent sẽ chụp trang làm video"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  allowClear
                />
              )}
              {srcType === 'business' && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Video giới thiệu doanh nghiệp — dùng sẵn Brand video (tagline, màu, địa chỉ, số điện thoại)
                  trong khối Brand video bên dưới trang.
                </Text>
              )}
            </div>
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Template</Text>
            {tplLoading ? <Spin size="small" /> : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {tplData.templates.map((t) => {
                  const srcOk = t.id === 'auto' || (t.sources || []).includes(srcType);
                  const presenterOk = !t.needsPresenter || tplData.hasPresenter;
                  const disabled = !srcOk || !presenterOk;
                  const selected = tplId === t.id;
                  const card = (
                    <div
                      onClick={() => { if (!disabled) pickTemplate(t); }}
                      style={{
                        border: `1px solid ${selected ? '#1677ff' : '#d9d9d9'}`,
                        borderRadius: 8,
                        padding: '8px 10px',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.45 : 1,
                        background: selected ? '#e6f4ff' : '#fff',
                      }}
                    >
                      <Text strong style={{ fontSize: 13, display: 'block' }}>
                        {t.id === 'auto' ? 'Tự động (để engine chọn)' : t.label}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{t.desc}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {t.defaultDuration ? `~${t.defaultDuration}s` : 'Thời lượng tự động'}
                      </Text>
                    </div>
                  );
                  return !presenterOk ? (
                    <Tooltip key={t.id} title="Chưa có ảnh người dẫn — thêm trong Brand video bên dưới">
                      {card}
                    </Tooltip>
                  ) : (
                    <div key={t.id} style={{ display: 'contents' }}>{card}</div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Nhạc nền</Text>
            <audio ref={audioRef} onEnded={() => setPlayingBgm(null)} style={{ display: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              {[
                { id: 'auto', label: 'Tự động', desc: 'Chọn nhạc free từ thư viện' },
                { id: 'none', label: 'Không nhạc', desc: 'Chỉ giọng đọc' },
              ].map((o) => {
                const selected = bgmId === o.id;
                return (
                  <div
                    key={o.id}
                    onClick={() => setBgmId(o.id)}
                    style={{
                      border: `1px solid ${selected ? '#1677ff' : '#d9d9d9'}`,
                      borderRadius: 8,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      background: selected ? '#e6f4ff' : '#fff',
                    }}
                  >
                    <Text strong style={{ fontSize: 13 }}>{o.label}</Text>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{o.desc}</Text>
                  </div>
                );
              })}
            </div>
            <div style={{ maxHeight: 168, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8 }}>
              {(tplData.music || []).map((t) => {
                const selected = bgmId === t.id;
                const playing = playingBgm === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setBgmId(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', cursor: 'pointer',
                      background: selected ? '#e6f4ff' : '#fff',
                      borderBottom: '1px solid #f5f5f5',
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                      onClick={(e) => { e.stopPropagation(); togglePreview(t); }}
                      aria-label={`Nghe thử ${t.label}`}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong style={{ fontSize: 13 }}>{t.label}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}> — {t.artist} · {t.mood} · {t.duration}</Text>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{t.desc}</Text>
                    </div>
                    {selected && <Text style={{ color: '#1677ff', fontSize: 11 }}>✓</Text>}
                  </div>
                );
              })}
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Nhạc miễn phí Mixkit — dùng thương mại được, không cần ghi credit.
            </Text>
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Thời lượng: {duration ?? 60}s</Text>
            <Slider
              min={15}
              max={90}
              step={5}
              value={duration ?? 60}
              onChange={setDuration}
              tooltip={{ formatter: (v) => `${v}s` }}
            />
          </div>
        </Space>
      </Modal>
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
          <Text type="secondary">{viewing?.slug} · <VideoStatusTag status={viewing?.status} kind={viewing?.kind} /></Text>
        </Space>
      </Modal>
    </PageContainer>
  );
}
