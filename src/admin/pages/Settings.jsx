// Settings page — antd Form, Input, Select, Switch, Button, Card, Tabs, message.
import { useState, useEffect, useCallback } from 'react';
import { Card, Tabs, Form, Input, Select, Switch, Button, Space, Typography, message, InputNumber, Divider, Alert, Tag, Table, Tooltip, Collapse, Row, Col } from 'antd';
import { SaveOutlined, GoogleOutlined, ApiOutlined, CheckCircleOutlined, CopyOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost, api } from '../api.js';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gsc, setGsc] = useState({ configured: false, client_email: '', property: '', use_indexing_api: false });
  const [gscSaving, setGscSaving] = useState(false);
  const [gscSaJson, setGscSaJson] = useState('');
  const [gscProperty, setGscProperty] = useState('');
  const [gscUseApi, setGscUseApi] = useState(false);
  const [pricing, setPricing] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, p, g, pr] = await Promise.all([
      apiGet('/api/admin/settings'),
      apiGet('/api/admin/providers'),
      apiGet('/api/admin/google-search-console'),
      apiGet('/api/admin/pricing'),
    ]);
    if (s.status === 200) setSettings(s.body?.settings || {});
    if (p.status === 200) setProviders(p.body?.text || []);
    if (g.status === 200) {
      setGsc(g.body || {});
      setGscProperty(g.body?.explicit_property || '');
      setGscUseApi(!!g.body?.use_indexing_api);
    }
    if (pr.status === 200) setPricing(pr.body?.pricing || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (payload) => {
    setSaving(true);
    const r = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
    if (r.status === 200) {
      message.success(`Đã lưu ${r.body?.updated?.length || 0} trường`);
      setSettings((s) => ({ ...s, ...payload }));
    } else {
      message.error(r.body?.error || 'Lưu thất bại');
    }
    setSaving(false);
  };

  const saveGsc = async () => {
    setGscSaving(true);
    const payload = {};
    if (gscSaJson.trim()) payload.sa_json = gscSaJson.trim();
    if (gscProperty) payload.property = gscProperty;
    payload.use_indexing_api = gscUseApi;
    const r = await apiPost('/api/admin/google-search-console', payload);
    if (r.status === 200) {
      message.success('Đã lưu GSC');
      setGscSaJson('');
      load();
    } else {
      message.error(r.body?.error || 'Lưu thất bại');
    }
    setGscSaving(false);
  };

  const testGsc = async () => {
    const r = await apiPost('/api/admin/google-search-console/test', {});
    if (r.status === 200 && r.body?.result?.sitemap?.ok) {
      message.success(`Đã gửi sitemap tới ${r.body.result.sitemap.property}`);
    } else {
      message.error(r.body?.result?.sitemap?.error || 'Test thất bại');
    }
  };

  const pricingColumns = [
    { title: 'Provider', dataIndex: 'provider', key: 'provider' },
    { title: 'Input / 1M', dataIndex: 'input_per_1m', key: 'input', render: (v) => v != null ? `$${v}` : '-' },
    { title: 'Output / 1M', dataIndex: 'output_per_1m', key: 'output', render: (v) => v != null ? `$${v}` : '-' },
    { title: 'Image', dataIndex: 'image', key: 'image' },
  ];

  return (
    <PageContainer
      title="Cài đặt"
      description="Cấu hình AI provider, Google Search Console, và thiết lập chung"
      breadcrumb={[{ title: 'Cài đặt' }]}
    >
      <Tabs
        items={[
          {
            key: 'general',
            label: 'Chung',
            children: (
              <Card loading={loading}>
                <Form layout="vertical">
                  <Form.Item label="AI Provider mặc định">
                    <Select
                      value={settings.default_ai_provider || ''}
                      onChange={(v) => setSettings((s) => ({ ...s, default_ai_provider: v }))}
                      options={providers.map((p) => ({ value: p, label: p }))}
                      placeholder="Chọn provider"
                    />
                  </Form.Item>
                  <Form.Item label="Site name">
                    <Input value={settings.site_name || ''} onChange={(e) => setSettings((s) => ({ ...s, site_name: e.target.value }))} />
                  </Form.Item>
                  <Form.Item label="Site URL">
                    <Input value={settings.site_url || ''} onChange={(e) => setSettings((s) => ({ ...s, site_url: e.target.value }))} />
                  </Form.Item>
                  <Form.Item label="Site CTA">
                    <Input value={settings.site_cta || ''} onChange={(e) => setSettings((s) => ({ ...s, site_cta: e.target.value }))} />
                  </Form.Item>
                  <Form.Item label="Số từ tối thiểu (article)">
                    <InputNumber value={settings.article_min_words || 2500} onChange={(v) => setSettings((s) => ({ ...s, article_min_words: v }))} min={300} />
                  </Form.Item>
                  <Form.Item label="Số từ tối đa (article)">
                    <InputNumber value={settings.article_max_words || 4000} onChange={(v) => setSettings((s) => ({ ...s, article_max_words: v }))} min={500} />
                  </Form.Item>
                  <Form.Item label="Hero image mode">
                    <Select
                      value={settings.hero_image_mode || 'ai'}
                      onChange={(v) => setSettings((s) => ({ ...s, hero_image_mode: v }))}
                      options={[{ value: 'ai', label: 'AI generated' }, { value: 'cover', label: 'Cover template' }]}
                    />
                  </Form.Item>
                  <Form.Item label="Monthly budget (USD)">
                    <InputNumber value={settings.monthly_budget_usd || 10} onChange={(v) => setSettings((s) => ({ ...s, monthly_budget_usd: v }))} min={0} />
                  </Form.Item>
                  <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => save(settings)}>Lưu cài đặt</Button>
                </Form>
              </Card>
            ),
          },
          {
            key: 'gsc',
            label: 'Google Search Console',
            children: (
              <Card>
                {gsc.configured ? (
                  <Alert type="success" showIcon message={`Đã cấu hình — ${gsc.client_email}`} style={{ marginBottom: 16 }} />
                ) : (
                  <Alert type="info" showIcon message="Chưa cấu hình. Dán JSON service-account để kích hoạt." style={{ marginBottom: 16 }} />
                )}
                <Form layout="vertical">
                  <Form.Item label="Service Account JSON">
                    <TextArea rows={6} value={gscSaJson} onChange={(e) => setGscSaJson(e.target.value)} placeholder='{ "type": "service_account", ... }' />
                  </Form.Item>
                  <Form.Item label="Property (sc-domain: hoặc https://)">
                    <Input value={gscProperty} onChange={(e) => setGscProperty(e.target.value)} placeholder="sc-domain:example.com" />
                  </Form.Item>
                  <Form.Item label="Use Indexing API">
                    <Switch checked={gscUseApi} onChange={setGscUseApi} />
                  </Form.Item>
                  <Space>
                    <Button type="primary" icon={<SaveOutlined />} loading={gscSaving} onClick={saveGsc}>Lưu GSC</Button>
                    <Button icon={<GoogleOutlined />} onClick={testGsc}>Test sitemap</Button>
                  </Space>
                </Form>
              </Card>
            ),
          },
          {
            key: 'pricing',
            label: 'Bảng giá AI',
            children: (
              <Card>
                <Table dataSource={pricing} columns={pricingColumns} rowKey="provider" size="small" pagination={false} />
              </Card>
            ),
          },
          {
            key: 'publishing',
            label: 'Kênh xuất bản',
            children: <FacebookAppConfig />,
          },
        ]}
      />
    </PageContainer>
  );
}

// ── Facebook platform app ─────────────────────────────────────────
// The Meta app is ONE credential shared by every tenant, so it lives in
// Settings (super_admin-only) rather than on the per-project "Kênh xuất
// bản" page. Tenants connect their own Pages; they never see this.
function FacebookAppConfig() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [apiVersion, setApiVersion] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/projects/publishing');
    if (status === 200 && body?.ok) {
      setCfg(body);
      setAppId(body.app?.app_id || '');
      setApiVersion(body.app?.api_version || '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const body = { action: 'save_app', app_id: appId, api_version: apiVersion };
    if (appSecret.trim()) body.app_secret = appSecret.trim();
    const r = await apiPost('/api/admin/projects/publishing', body);
    setSaving(false);
    if (r.status === 200 && r.body?.ok) {
      message.success('Đã lưu thông tin Meta App');
      setAppSecret('');
      load();
    } else message.error(r.body?.detail || r.body?.error || 'Lưu thất bại');
  };

  const redirectUri = `${window.location.origin}/api/admin/projects/fb-callback`;
  const appReady = cfg?.app?.id_set && cfg?.app?.secret_set;

  return (
    <Card loading={loading}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Thông tin Meta App dùng chung cho toàn nền tảng"
        description="Mỗi dự án kết nối Facebook Page riêng ở trang Kênh xuất bản. App ID/Secret dưới đây là của nền tảng, không phải của từng khách hàng."
      />

      <Row gutter={12}>
        <Col xs={24} md={10}>
          <Form.Item label="App ID" style={{ marginBottom: 8 }}>
            <Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="1234567890" />
          </Form.Item>
        </Col>
        <Col xs={24} md={14}>
          <Form.Item label="App Secret" style={{ marginBottom: 8 }} extra="Lưu mã hoá AES-GCM, không hiển thị lại">
            <Input.Password
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={cfg?.app?.secret_set ? '•••••••• (để trống nếu giữ nguyên)' : 'App secret'}
            />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item
        label="Graph API version"
        extra="Chỉ đổi khi Meta thông báo version cũ sắp hết hỗ trợ. Để trống dùng mặc định."
        style={{ maxWidth: 240 }}
      >
        <Input value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} placeholder="v23.0" />
      </Form.Item>

      <Space>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>Lưu thông tin Meta App</Button>
        <Tag color={appReady ? 'success' : 'warning'}>{appReady ? 'Đã cấu hình' : 'Chưa cấu hình'}</Tag>
      </Space>

      <Divider />

      <Collapse
        items={[
          {
            key: 'setup',
            label: <Text strong style={{ fontSize: 13 }}>📖 Thiết lập Meta App (làm 1 lần)</Text>,
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%', fontSize: 13 }}>
                <div>
                  <Text strong>1. Tạo Meta App</Text>
                  <div style={{ marginTop: 4 }}>
                    Mở <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> → <b>Create App</b>.
                    Chọn use case <Text code>Manage everything on your Page</Text>.
                  </div>
                  <Text type="secondary">Use case này tự thêm <Text code>pages_show_list</Text> + <Text code>business_management</Text>.</Text>
                </div>
                <div>
                  <Text strong>2. Thêm quyền đăng bài</Text>
                  <div style={{ marginTop: 4 }}>
                    <b>App Dashboard → Use cases → Manage everything on your Page → Customize</b> → <b>Add</b>:
                  </div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                    <li><Text code>pages_manage_posts</Text></li>
                    <li><Text code>pages_read_engagement</Text></li>
                  </ul>
                </div>
                <div>
                  <Text strong>3. Thêm Facebook Login + Redirect URI</Text>
                  <div style={{ marginTop: 4 }}>
                    <b>Products → Add product → Facebook Login → Set up</b>, rồi vào <b>Facebook Login → Settings</b>, dán vào <b>Valid OAuth Redirect URIs</b>:
                  </div>
                  <Space.Compact style={{ width: '100%', marginTop: 6 }}>
                    <Input readOnly value={redirectUri} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
                    <Button icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(redirectUri); message.success('Đã copy'); }}>Copy</Button>
                  </Space.Compact>
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginTop: 8 }}
                    message="Phải khớp tuyệt đối (Meta Strict Mode)"
                    description="Sai một ký tự — thừa / cuối, http vs https — là bị chặn."
                  />
                </div>
                <div>
                  <Text strong>4. Lấy App ID + App Secret</Text>
                  <div style={{ marginTop: 4 }}>
                    <b>App settings → Basic</b>. App ID hiện trên đầu trang; App Secret bấm <b>Show</b> (có thể phải nhập lại mật khẩu Facebook).
                  </div>
                </div>
              </Space>
            ),
          },
          {
            key: 'review',
            label: <Text strong style={{ fontSize: 13 }}>🚦 Mở cho khách hàng tự kết nối (App Review)</Text>,
            children: (
              <Space direction="vertical" size={10} style={{ width: '100%', fontSize: 13 }}>
                <Alert
                  type="warning"
                  showIcon
                  message="Hiện tại chỉ admin/developer/tester của app kết nối được"
                  description="App đang ở chế độ Development. Khách hàng bấm Kết nối sẽ gặp lỗi cho tới khi app được duyệt."
                />
                <Text strong>Checklist nộp App Review</Text>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>App ở chế độ <b>Live</b> (App Dashboard → toggle trên đầu trang)</li>
                  <li><b>Privacy Policy URL</b> — bắt buộc</li>
                  <li><b>Terms of Service URL</b></li>
                  <li><b>App icon</b> 1024×1024</li>
                  <li><b>Data Deletion Callback</b> hoặc Instructions URL</li>
                  <li><b>App Category</b> + <b>Business Verification</b> (nếu Meta yêu cầu)</li>
                  <li>Quyền cần xin: <Text code>pages_manage_posts</Text>, <Text code>pages_show_list</Text>, <Text code>pages_read_engagement</Text></li>
                  <li>
                    <b>Screencast</b> cho mỗi quyền — quay đúng luồng: người dùng đăng nhập → cấp quyền →
                    bài viết được đăng lên Page → hiện bài trên Page. Meta từ chối rất nhiều hồ sơ thiếu phần này.
                  </li>
                  <li>Giải thích use case: công cụ tự động đăng bài blog lên Page của chính khách hàng</li>
                </ul>
                <Text type="secondary">
                  Thời gian duyệt thường 3-10 ngày làm việc. Bị từ chối thì được nộp lại; đọc kỹ lý do vì thường
                  là thiếu screencast hoặc mô tả use case chưa rõ.
                </Text>
                <Alert
                  type="info"
                  showIcon
                  message="Chưa duyệt xong vẫn dùng được"
                  description="Super admin và các tài khoản được thêm vào Roles của app vẫn kết nối và đăng bài bình thường."
                />
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
