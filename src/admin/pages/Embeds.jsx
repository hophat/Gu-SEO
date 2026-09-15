// Embeds page — distribution surface.
//
// Jobs this page has to do:
//   1. Produce the copy-paste snippet for a host site.
//   2. Prove it works before the operator ships it  → live preview.
//   3. Match the host site's look                    → theme + palette.
//   4. Tell the operator where to paste it           → per-platform guide.
//   5. Expose the non-JS distribution channels       → RSS / sitemap / robots.
//
// API: /api/admin/embeds (GET/POST/PUT/DELETE),
//      /api/admin/embed-preview (GET, iframe src)
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Card, Tabs, Typography, Input, Button, Tag, Space, message, Form, Alert, Table,
  Modal, Popconfirm, Row, Col, Statistic, Select, InputNumber, Drawer,
  Segmented, Divider, Tooltip,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, CopyOutlined, DeleteOutlined, EditOutlined,
  CodeOutlined, LinkOutlined, FileTextOutlined, EyeOutlined, BgColorsOutlined,
} from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost, api } from '../api.js';
import { useProjectUrl } from '../lib/projectUrl.js';

const { Text, Paragraph } = Typography;

// Ready-made palettes so an operator can match a host site in one click
// instead of hand-picking five colours.
const PALETTE_PRESETS = [
  { key: 'default', label: 'Mặc định', palette: null },
  { key: 'slate',   label: 'Slate',    palette: { bg: '#ffffff', fg: '#0f172a', muted: '#64748b', line: '#e2e8f0', accent: '#0f172a' } },
  { key: 'blue',    label: 'Xanh dương', palette: { bg: '#ffffff', fg: '#0b1220', muted: '#5b6b85', line: '#dbe4f0', accent: '#1677ff' } },
  { key: 'warm',    label: 'Ấm',       palette: { bg: '#fffdf8', fg: '#2b2118', muted: '#8a7c6b', line: '#efe6d8', accent: '#c2410c' } },
  { key: 'green',   label: 'Xanh lá',  palette: { bg: '#ffffff', fg: '#0b1f14', muted: '#5d7a6a', line: '#d8e8de', accent: '#15803d' } },
  { key: 'dark',    label: 'Tối',      palette: { bg: '#0e0f12', fg: '#f0eee8', muted: '#a09c93', line: '#262932', accent: '#e8b04b' } },
];

const PLATFORMS = [
  {
    key: 'html',
    label: 'HTML / Website',
    hint: 'Dán trực tiếp vào bất kỳ đâu trong HTML của trang.',
    code: (s) => s,
  },
  {
    key: 'wordpress',
    label: 'WordPress',
    hint: 'Thêm khối "Custom HTML" (Gutenberg) hoặc dùng Elementor widget "HTML", rồi dán mã.',
    code: (s) => s,
  },
  {
    key: 'shopify',
    label: 'Shopify',
    hint: 'Vào Themes → Edit code, hoặc thêm section "Custom Liquid" và dán mã. Shopify chặn <script> trong mô tả sản phẩm nên phải dùng Liquid/section.',
    code: (s) => s,
  },
  {
    key: 'webflow',
    label: 'Webflow',
    hint: 'Kéo phần tử "Embed" vào trang, rồi dán mã vào ô Code.',
    code: (s) => s,
  },
  {
    key: 'react',
    label: 'React / Next.js',
    hint: 'Chèn qua dangerouslySetInnerHTML, hoặc thêm <script> bằng useEffect để tránh bị hydrate lại.',
    code: (s) => {
      const m = s.match(/src="([^"]+)"/);
      const t = s.match(/data-target="#([^"]+)"/);
      const src = m ? m[1] : '';
      const id = t ? t[1] : 'ps-blog';
      return `import { useEffect, useRef } from 'react';

export default function BlogWidget() {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || document.getElementById('ps-blog-script')) return;
    const el = document.createElement('script');
    el.id = 'ps-blog-script';
    el.src = '${src}';
    el.defer = true;
    el.dataset.target = '#${id}';
    document.body.appendChild(el);
  }, []);

  return <div id="${id}" ref={ref} />;
}`;
    },
  },
];

export default function Embeds() {
  const { projectUrl } = useProjectUrl();
  const [embeds, setEmbeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  // Preview drawer (list → full preview + platform snippets)
  const [previewEmbed, setPreviewEmbed] = useState(null);
  const [platform, setPlatform] = useState('html');
  const [palettePreset, setPalettePreset] = useState('default');

  // Live preview inside the modal, driven by the (unsaved) form values.
  const [formValues, setFormValues] = useState({});
  const previewTimer = useRef(null);
  const [previewKey, setPreviewKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/embeds');
    if (status === 200 && body?.ok) setEmbeds(body.embeds || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    message.success(`Đã copy ${label}`);
  };

  const openCreate = () => {
    setEditing(null);
    setPalettePreset('default');
    form.resetFields();
    form.setFieldsValue({ per_page: 10, theme: 'auto' });
    setFormValues({ per_page: 10, theme: 'auto' });
    setModalOpen(true);
  };

  const openEdit = (e) => {
    setEditing(e);
    const s = e.settings || {};
    const preset = PALETTE_PRESETS.find((p) => p.palette && s.palette
      && p.palette.bg === s.palette.bg && p.palette.accent === s.palette.accent);
    setPalettePreset(s.palette ? (preset?.key || 'custom') : 'default');
    const values = {
      name: e.name,
      title: s.title || '',
      accent: s.accent || '',
      per_page: s.per_page || s.limit || 10,
      theme: s.theme || 'auto',
      palette: s.palette || null,
    };
    form.setFieldsValue(values);
    setFormValues(values);
    setModalOpen(true);
  };

  const onSubmit = async (values) => {
    const settings = {
      title: values.title,
      accent: values.accent || undefined,
      per_page: values.per_page,
      theme: values.theme,
      palette: values.palette || undefined,
    };
    if (editing) {
      const r = await api(`/api/admin/embeds?id=${editing.id}`, { method: 'PUT', body: JSON.stringify({ name: values.name, settings }) });
      if (r.status === 200) { message.success('Đã cập nhật'); setModalOpen(false); load(); }
      else message.error(r.body?.error || 'Lỗi');
    } else {
      const r = await apiPost('/api/admin/embeds', { name: values.name, settings });
      if (r.status === 200) { message.success('Đã tạo embed'); setModalOpen(false); load(); }
      else message.error(r.body?.error || 'Lỗi');
    }
  };

  const deleteEmbed = async (id) => {
    const r = await api(`/api/admin/embeds?id=${id}`, { method: 'DELETE' });
    if (r.status === 200) { message.success('Đã xóa'); load(); }
    else message.error(r.body?.error || 'Lỗi');
  };

  const applyPreset = (key) => {
    setPalettePreset(key);
    const preset = PALETTE_PRESETS.find((p) => p.key === key);
    const palette = preset?.palette || null;
    form.setFieldsValue({ palette });
    setFormValues((v) => ({ ...v, palette }));
    if (palette?.accent) form.setFieldsValue({ accent: palette.accent });
    setFormValues((v) => ({ ...v, palette, accent: palette?.accent ?? v.accent }));
  };

  // ── live preview URL ────────────────────────────────────────────
  // /api/admin/embed-preview renders the real widget with the form's
  // current values, so unsaved colour/theme edits are visible.
  const previewSrc = useMemo(() => {
    const v = formValues;
    const p = new URLSearchParams();
    if (editing?.id) p.set('id', editing.id);
    p.set('name', v.name || 'Blog');
    if (v.title) p.set('title', v.title);
    if (v.accent) p.set('accent', v.accent);
    if (v.theme) p.set('theme', v.theme);
    if (v.per_page) p.set('per_page', String(v.per_page));
    if (v.palette) {
      for (const k of ['bg', 'fg', 'muted', 'line']) if (v.palette[k]) p.set(k, v.palette[k]);
      if (v.palette.accent) p.set('palette_accent', v.palette.accent);
    }
    return `/api/admin/embed-preview?${p.toString()}`;
  }, [formValues, editing]);

  const onValuesChange = (_, all) => {
    // Debounce so dragging a colour picker doesn't hammer the iframe.
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      setFormValues({ ...all });
      setPreviewKey((k) => k + 1);
    }, 350);
  };

  const columns = [
    { title: 'Tên', dataIndex: 'name', key: 'name', width: 180,
      render: (n, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{n}</Text>
          <Space size={4}>
            <Tag style={{ margin: 0, fontSize: 11 }}>{r.settings?.theme || 'auto'}</Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.settings?.per_page || r.settings?.limit || 10} bài</Text>
            {r.settings?.palette && <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>palette</Tag>}
          </Space>
        </Space>
      ) },
    { title: 'Embed URL', dataIndex: 'embed_url', key: 'url', ellipsis: true,
      render: (u) => <a href={u} target="_blank" rel="noopener"><Text code style={{ fontSize: 12 }}>{u}</Text></a> },
    { title: '', key: 'actions', width: 200,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Xem trước"><Button size="small" icon={<EyeOutlined />} onClick={() => { setPreviewEmbed(r); setPlatform('html'); }} /></Tooltip>
          <Tooltip title="Copy snippet"><Button size="small" type="primary" icon={<CopyOutlined />} onClick={() => copy(r.snippet, 'snippet')} /></Tooltip>
          <Tooltip title="Sửa"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Popconfirm title="Xóa embed?" onConfirm={() => deleteEmbed(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ) },
  ];

  const distribution = [
    { label: 'Blog công khai', desc: 'Trang blog đọc trực tiếp', url: projectUrl('/blog') },
    { label: 'RSS Feed', desc: 'Cho Feedly, Inoreader…', url: projectUrl('/feed.xml') },
    { label: 'Sitemap', desc: 'Google đọc để lập chỉ mục', url: projectUrl('/sitemap.xml') },
    { label: 'Sitemap (trang)', desc: 'Bài blog + trang programmatic', url: projectUrl('/sitemap-pages.xml') },
    { label: 'Robots.txt', desc: 'Quy tắc crawl', url: projectUrl('/robots.txt') },
  ];

  return (
    <PageContainer
      title="Embeds"
      description="Mã nhúng widget blog và liên kết phân phối"
      breadcrumb={[{ title: 'Phân phối' }, { title: 'Embeds' }]}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Tạo embed</Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={8}><Card><Statistic title="Embeds" value={embeds.length} prefix={<CodeOutlined />} /></Card></Col>
        <Col xs={8}><Card><Statistic title="RSS Feed" value={projectUrl('/feed.xml')} prefix={<FileTextOutlined />} /></Card></Col>
        <Col xs={8}><Card><Statistic title="Sitemap" value={projectUrl('/sitemap.xml')} prefix={<LinkOutlined />} /></Card></Col>
      </Row>

      <Tabs items={[
        {
          key: 'embeds',
          label: 'Widget Embeds',
          children: (
            <Card>
              <Table
                dataSource={embeds}
                columns={columns}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                scroll={{ x: 720 }}
                locale={{ emptyText: 'Chưa có embed. Nhấn "Tạo embed" để tạo mã nhúng.' }}
              />
            </Card>
          ),
        },
        {
          key: 'feeds',
          label: 'Feeds & Sitemap',
          children: (
            <Card>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {distribution.map((d) => (
                  <div key={d.label}>
                    <Text strong>{d.label}: </Text>
                    <Text code>{d.url}</Text>
                    <Button size="small" icon={<CopyOutlined />} onClick={() => copy(d.url, d.label)} style={{ marginLeft: 8 }}>Copy</Button>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>{d.desc}</Text></div>
                  </div>
                ))}
              </Space>
            </Card>
          ),
        },
      ]} />

      {/* Create / edit — split form + live preview */}
      <Modal
        title={editing ? 'Sửa embed' : 'Tạo embed mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? 'Lưu' : 'Tạo embed'}
        width={960}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onSubmit} onValuesChange={onValuesChange}>
          <Row gutter={20}>
            <Col xs={24} lg={11}>
              <Form.Item name="name" label="Tên embed" rules={[{ required: true }]}>
                <Input placeholder="Blog widget trang chủ" />
              </Form.Item>
              <Form.Item name="title" label="Tiêu đề hiển thị" extra="Để trống sẽ dùng tên site của dự án">
                <Input placeholder="Bài viết mới nhất" />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="theme" label="Chế độ màu">
                    <Select
                      options={[
                        { value: 'auto', label: 'Tự động (theo hệ thống)' },
                        { value: 'light', label: 'Sáng' },
                        { value: 'dark', label: 'Tối' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="per_page" label="Số bài hiển thị">
                    <InputNumber min={1} max={50} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="accent" label="Màu accent" extra="Mặc định lấy màu thương hiệu của dự án">
                <Input placeholder="#1677ff" />
              </Form.Item>

              <Divider style={{ margin: '8px 0 16px' }}><Text type="secondary" style={{ fontSize: 12 }}><BgColorsOutlined /> Bảng màu</Text></Divider>
              <Segmented
                block
                value={palettePreset}
                onChange={applyPreset}
                options={[...PALETTE_PRESETS.map((p) => ({ value: p.key, label: p.label })), { value: 'custom', label: 'Tùy chỉnh' }]}
                style={{ marginBottom: 12 }}
              />
              {palettePreset === 'custom' && (
                <Form.Item name={['palette']} noStyle>
                  <PaletteEditor />
                </Form.Item>
              )}
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 8 }}
                message="Bảng màu chỉ áp dụng khi host site cho phép CSS tùy biến"
                description="Widget vẫn kế thừa prefers-color-scheme khi chế độ màu là 'Tự động'."
              />
            </Col>

            <Col xs={24} lg={13}>
              <div style={{ position: 'sticky', top: 0 }}>
                <Space style={{ marginBottom: 8 }}>
                  <EyeOutlined />
                  <Text strong>Xem trước trực tiếp</Text>
                  <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => setPreviewKey((k) => k + 1)}>Tải lại</Button>
                </Space>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                  <iframe
                    key={previewKey}
                    title="embed-preview"
                    src={previewSrc}
                    style={{ width: '100%', height: 460, border: 0, display: 'block' }}
                  />
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Đây là widget thật. Thay đổi màu/tiêu đề ở bên trái sẽ cập nhật ngay, kể cả trước khi lưu.
                </Text>
              </div>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Full preview + install guide */}
      <Drawer
        title={<Space><EyeOutlined /> {previewEmbed?.name}</Space>}
        open={!!previewEmbed}
        onClose={() => setPreviewEmbed(null)}
        width={720}
      >
        {previewEmbed && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Text strong>Widget</Text>
              <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginTop: 8, background: '#fff' }}>
                <iframe
                  title="embed-full-preview"
                  src={`/api/admin/embed-preview?id=${previewEmbed.id}`}
                  style={{ width: '100%', height: 480, border: 0, display: 'block' }}
                />
              </div>
            </div>

            <div>
              <Text strong>Dán mã vào đâu?</Text>
              <Segmented
                block
                value={platform}
                onChange={setPlatform}
                options={PLATFORMS.map((p) => ({ value: p.key, label: p.label }))}
                style={{ margin: '8px 0' }}
              />
              {(() => {
                const p = PLATFORMS.find((x) => x.key === platform) || PLATFORMS[0];
                const code = p.code(previewEmbed.snippet);
                return (
                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    <Alert type="info" showIcon message={p.hint} />
                    <Input.TextArea value={code} readOnly autoSize={{ minRows: 4, maxRows: 12 }} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
                    <Space>
                      <Button type="primary" icon={<CopyOutlined />} onClick={() => copy(code, 'mã nhúng')}>Copy mã nhúng</Button>
                      <Button icon={<LinkOutlined />} onClick={() => copy(previewEmbed.embed_url, 'embed URL')}>Copy URL</Button>
                      <Button icon={<CodeOutlined />} href={previewEmbed.embed_url} target="_blank">Xem file JS</Button>
                    </Space>
                  </Space>
                );
              })()}
            </div>

            <div>
              <Text strong>Kiểm tra sau khi dán</Text>
              <Paragraph type="secondary" style={{ fontSize: 13, marginTop: 4 }}>
                Mở trang host và tìm trong DevTools console. Nếu thấy
                <Text code style={{ margin: '0 4px' }}>pages-seo embed: no mount element found</Text>
                thì container <Text code>&lt;div&gt;</Text> chưa được dán, hoặc <Text code>data-target</Text> trỏ sai id.
                Mỗi embed có container id riêng nên có thể dán nhiều widget trên cùng một trang.
              </Paragraph>
            </div>
          </Space>
        )}
      </Drawer>
    </PageContainer>
  );
}

// Five hex inputs that write straight into the form's `palette` object.
function PaletteEditor() {
  const KEYS = [
    { key: 'bg', label: 'Nền' },
    { key: 'fg', label: 'Chữ' },
    { key: 'muted', label: 'Chữ mờ' },
    { key: 'line', label: 'Đường kẻ' },
    { key: 'accent', label: 'Nhấn' },
  ];
  return (
    <Row gutter={[8, 8]}>
      {KEYS.map((k) => (
        <Col span={12} key={k.key}>
          <Form.Item name={['palette', k.key]} label={k.label} style={{ marginBottom: 8 }}>
            <Input placeholder="#ffffff" />
          </Form.Item>
        </Col>
      ))}
    </Row>
  );
}
