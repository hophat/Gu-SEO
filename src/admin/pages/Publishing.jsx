// Publishing channel — where a project's posts are pushed in addition to
// the built-in blog.
//
// This lives outside Settings on purpose. Settings is super_admin-only
// (it holds platform-wide config), but connecting a Facebook Page is a
// per-tenant action: a project_admin must be able to wire up their own
// Page without seeing the rest of the platform's settings.
//
// What a tenant may do here:
//   - choose the channel for THEIR project
//   - run the Facebook OAuth flow, scoped to their project
//   - set post format / message template
// What only a super_admin may do:
//   - edit the shared Meta app credentials (App ID / Secret / API version)
//     → those stay in Settings, because the app is one credential shared
//       by every tenant.
//
// API: /api/admin/projects/publishing (GET/POST)
import { useState, useEffect, useCallback } from 'react';
import {
  Card, Form, Input, Select, Button, Space, Typography, message, Alert, Tag,
  Modal, Avatar, Spin, Collapse, Row, Col, Popconfirm, Descriptions, Divider,
} from 'antd';
import {
  SaveOutlined, ApiOutlined, ThunderboltOutlined, CheckCircleOutlined,
  LinkOutlined, WarningOutlined,
} from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost } from '../api.js';
import { useProjects } from '../hooks/useTheme.jsx';

const { Text } = Typography;

export default function Publishing() {
  const { activeProject } = useProjects();
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [type, setType] = useState('internal_d1');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [authHeader, setAuthHeader] = useState('');
  const [asPhoto, setAsPhoto] = useState(false);
  const [messageTemplate, setMessageTemplate] = useState('');
  const [token, setToken] = useState('');
  const [pageId, setPageId] = useState('');

  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [pages, setPages] = useState([]);
  const [pagesExpired, setPagesExpired] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/projects/publishing');
    if (status === 200 && body?.ok) {
      setCfg(body);
      setType(body.publisher_type || 'internal_d1');
      setEndpointUrl(body.endpoint_url || '');
      setPageId(body.config?.page_id || '');
      setAsPhoto(body.config?.as_photo === true);
      setMessageTemplate(body.config?.message_template || '');

      const lr = body.last_result;
      if (lr?.status === 'connected') message.success(`Đã kết nối Facebook: ${lr.detail}`);
      else if (lr?.status === 'pick_page') setPagePickerOpen(true);
      else if (lr?.status === 'no_pages') message.warning(lr.detail || 'Không tìm thấy Page nào');
      else if (lr?.status === 'denied') message.warning('Bạn đã huỷ cấp quyền Facebook');
      else if (lr?.status === 'error') message.error(lr.detail || 'Kết nối Facebook thất bại');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { if (cfg?.pending_pages > 0) setPagePickerOpen(true); }, [cfg?.pending_pages]);

  useEffect(() => {
    if (!pagePickerOpen) return;
    setLoadingPages(true);
    apiPost('/api/admin/projects/publishing', { action: 'pages' }).then((r) => {
      if (r.status === 200) {
        setPages(r.body?.pages || []);
        setPagesExpired(r.body?.expired === true);
      }
      setLoadingPages(false);
    });
  }, [pagePickerOpen]);

  const connect = () => {
    setConnecting(true);
    const pid = activeProject?.id || '';
    window.location.href = `/api/admin/projects/fb-connect?project_id=${encodeURIComponent(pid)}`;
  };

  const selectPage = async (id) => {
    const r = await apiPost('/api/admin/projects/publishing', { action: 'select_page', page_id: id });
    if (r.status === 200 && r.body?.ok) {
      message.success(`Đã kết nối: ${r.body.page?.name}`);
      setPagePickerOpen(false);
      load();
    } else message.error(r.body?.detail || r.body?.error || 'Không chọn được Page');
  };

  const disconnect = async () => {
    const r = await apiPost('/api/admin/projects/publishing', { action: 'disconnect' });
    if (r.status === 200) { message.success('Đã ngắt kết nối'); load(); }
    else message.error(r.body?.error || 'Lỗi');
  };

  const payload = () => ({
    publisher_type: type,
    endpoint_url: endpointUrl,
    auth_header: authHeader,
    config: { page_id: pageId, as_photo: asPhoto, message_template: messageTemplate },
  });

  const save = async () => {
    setSaving(true);
    const body = { ...payload(), ...(token.trim() ? { token: token.trim() } : {}) };
    const r = await apiPost('/api/admin/projects/publishing', body);
    setSaving(false);
    if (r.status === 200 && r.body?.ok) { message.success('Đã lưu kênh xuất bản'); setToken(''); load(); }
    else message.error(r.body?.error || 'Lưu thất bại');
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const r = await apiPost('/api/admin/projects/publishing', {
      action: 'test', page_id: pageId,
      ...(token.trim() ? { token: token.trim() } : {}),
    });
    setTesting(false);
    if (r.status === 200 && r.body?.ok) {
      setTestResult({ ok: true, page: r.body.page });
      message.success(`Kết nối OK: ${r.body.page?.name}`);
    } else {
      setTestResult({ ok: false, error: r.body?.error || 'Không kết nối được' });
      message.error(r.body?.error || 'Không kết nối được');
    }
  };

  const fbConnected = cfg?.publisher_type === 'facebook' && cfg?.token?.set;
  const appReady = cfg?.app?.id_set && cfg?.app?.secret_set;
  const canManageApp = cfg?.can_manage_app;

  return (
    <PageContainer
      title="Kênh xuất bản"
      description="Nơi bài viết được đẩy thêm sau khi xuất bản lên blog"
      breadcrumb={[{ title: 'Phân phối' }, { title: 'Kênh xuất bản' }]}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={<>Dự án: <Text strong>{activeProject?.site_name || activeProject?.slug || '—'}</Text></>}
        description="Bài viết luôn được đăng lên blog của dự án trước. Kênh dưới đây chỉ là nơi đẩy thêm. Nếu kênh lỗi, bài trên blog vẫn nguyên vẹn và job được retry tự động."
      />

      {!appReady && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Nền tảng chưa cấu hình Meta App"
          description={canManageApp
            ? 'Vào Cài đặt → Kênh xuất bản → Thông tin Meta App để nhập App ID và App Secret trước.'
            : 'Quản trị viên nền tảng cần cấu hình Meta App trước khi bạn có thể kết nối Facebook.'}
        />
      )}

      <Card loading={loading}>
        <Form layout="vertical" style={{ maxWidth: 760 }}>
          <Form.Item label="Kênh xuất bản">
            <Select
              value={type}
              onChange={setType}
              options={[
                { value: 'internal_d1', label: 'Chỉ blog nội bộ (mặc định)' },
                { value: 'facebook', label: 'Facebook Page của tôi' },
                { value: 'wordpress', label: 'WordPress' },
                { value: 'webhook', label: 'Webhook (tùy chỉnh)' },
                { value: 'custom_api', label: 'Custom API' },
              ]}
            />
          </Form.Item>

          {type === 'facebook' && (
            <>
              {fbConnected ? (
                <Card
                  type="inner"
                  size="small"
                  title={<Space><CheckCircleOutlined style={{ color: '#52c41a' }} /> Đã kết nối Facebook</Space>}
                  style={{ marginBottom: 16 }}
                >
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Page">
                      <Text strong>{cfg?.config?.page_name || cfg?.config?.page_id}</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Page ID"><Text code>{cfg?.config?.page_id}</Text></Descriptions.Item>
                    <Descriptions.Item label="Token">
                      <Tag color="green">Dài hạn, đã lưu mã hoá</Tag>
                    </Descriptions.Item>
                  </Descriptions>
                  <Space>
                    <Button icon={<ThunderboltOutlined />} loading={testing} onClick={test}>Kiểm tra kết nối</Button>
                    <Button onClick={connect} disabled={!appReady}>Kết nối lại</Button>
                    <Popconfirm title="Ngắt kết nối Facebook? Bài viết sẽ chỉ đăng lên blog." onConfirm={disconnect}>
                      <Button danger>Ngắt kết nối</Button>
                    </Popconfirm>
                  </Space>
                </Card>
              ) : (
                <Card type="inner" size="small" title="Kết nối Facebook Page" style={{ marginBottom: 16 }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Nhấn nút bên dưới, đăng nhập Facebook và cấp quyền cho Page của bạn.
                      Hệ thống tự lấy Page token — bạn không cần copy token thủ công.
                    </Text>
                    <Button
                      type="primary"
                      size="large"
                      icon={<ApiOutlined />}
                      loading={connecting}
                      disabled={!appReady}
                      onClick={connect}
                    >
                      Kết nối Facebook
                    </Button>
                    <Collapse
                      ghost
                      items={[{
                        key: 'req',
                        label: <Text type="secondary" style={{ fontSize: 13 }}>Điều kiện để kết nối được</Text>,
                        children: (
                          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                            <li>Bạn phải là <b>admin của Page</b> đó.</li>
                            <li>
                              Khi Meta App còn ở chế độ <b>Development</b>, chỉ admin/developer/tester của app
                              kết nối được. Muốn <b>mọi khách hàng</b> tự kết nối Page của họ, chủ nền tảng phải
                              nộp <b>App Review</b> cho <Text code>pages_manage_posts</Text>.
                            </li>
                            <li>App cần được cấp <Text code>pages_show_list</Text>, <Text code>pages_read_engagement</Text>, <Text code>pages_manage_posts</Text>.</li>
                          </ul>
                        ),
                      }]}
                    />
                  </Space>
                </Card>
              )}

              <Card type="inner" size="small" title="Định dạng bài đăng">
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item label="Kiểu bài" style={{ marginBottom: 8 }}>
                      <Select
                        value={asPhoto ? 'photo' : 'link'}
                        onChange={(v) => setAsPhoto(v === 'photo')}
                        options={[
                          { value: 'link', label: 'Link + thẻ preview (khuyến nghị)' },
                          { value: 'photo', label: 'Ảnh lớn + caption' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="Mẫu nội dung" extra="Để trống sẽ dùng mô tả SEO. Biến: {title}, {description}" style={{ marginBottom: 8 }}>
                  <Input.TextArea rows={2} value={messageTemplate} onChange={(e) => setMessageTemplate(e.target.value)} placeholder="{title}" />
                </Form.Item>
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>Lưu cài đặt</Button>
              </Card>

              <Collapse
                ghost
                style={{ marginTop: 8 }}
                items={[{
                  key: 'manual',
                  label: <Text type="secondary" style={{ fontSize: 13 }}>Cách khác: dán token thủ công</Text>,
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Dùng khi nền tảng chưa có App Secret. Token lấy từ Graph API Explorer sẽ hết hạn sau ~1-2 giờ.
                      </Text>
                      <Form.Item label="Page ID" style={{ marginBottom: 8 }}>
                        <Input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="123456789012345" />
                      </Form.Item>
                      <Form.Item label="Page Access Token" style={{ marginBottom: 8 }}>
                        <Input.Password value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg?.token?.set ? '•••••••• (để trống nếu giữ nguyên)' : 'EAAG...'} />
                      </Form.Item>
                      {testResult && (
                        <Alert
                          type={testResult.ok ? 'success' : 'error'}
                          showIcon
                          message={testResult.ok ? `Kết nối OK — ${testResult.page?.name}` : 'Không kết nối được'}
                          description={testResult.ok ? `${testResult.page?.fan_count ?? 0} người theo dõi` : testResult.error}
                        />
                      )}
                      <Space>
                        <Button icon={<ThunderboltOutlined />} loading={testing} onClick={test}>Kiểm tra</Button>
                        <Button icon={<SaveOutlined />} loading={saving} onClick={save}>Lưu token</Button>
                      </Space>
                    </Space>
                  ),
                }]}
              />
            </>
          )}

          {(type === 'wordpress' || type === 'webhook' || type === 'custom_api') && (
            <>
              <Form.Item label="Endpoint URL" required>
                <Input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://..." />
              </Form.Item>
              <Form.Item label="Authorization header" extra="Để trống nếu không cần. Ví dụ: Bearer xxx">
                <Input value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} placeholder="Bearer ..." />
              </Form.Item>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>Lưu kênh xuất bản</Button>
            </>
          )}

          {type === 'internal_d1' && (
            <>
              <Alert type="success" showIcon message="Bài viết chỉ đăng lên blog của dự án" />
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save} style={{ marginTop: 12 }}>Lưu</Button>
            </>
          )}
        </Form>
      </Card>

      <Modal
        title="Chọn Facebook Page để đăng bài"
        open={pagePickerOpen}
        onCancel={() => setPagePickerOpen(false)}
        footer={null}
        width={520}
      >
        {loadingPages ? <Spin /> : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {cfg?.configured_page_seen === false && (
              <Alert
                type="warning"
                showIcon
                message="Page đang kết nối không có trong danh sách Meta trả về"
                description={`Meta không liệt kê Page "${cfg?.config?.page_name || cfg?.config?.page_id}" cho tài khoản Facebook vừa đăng nhập — tài khoản đó không còn vai trò trên Page, hoặc bạn đăng nhập nhầm tài khoản. Kiểm tra lại quyền trên Page rồi Kết nối lại, hoặc dùng "Cách khác: dán token thủ công".`}
              />
            )}
            {pages.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                message={pagesExpired ? 'Danh sách Page đã hết hạn' : 'Meta không trả về Page nào'}
                description={pagesExpired
                  ? 'Bấm Kết nối Facebook lại để lấy danh sách mới.'
                  : 'Tài khoản Facebook vừa dùng không quản trị Page nào, hoặc chưa cấp quyền pages_show_list.'}
              />
            ) : pages.map((p) => (
              <Card key={p.id} size="small" hoverable onClick={() => selectPage(p.id)}>
                <Space>
                  {p.picture ? <Avatar src={p.picture} /> : <Avatar icon={<ApiOutlined />} />}
                  <Space direction="vertical" size={0}>
                    <Text strong>{p.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      ID {p.id} · {p.fan_count ?? 0} người theo dõi
                      {Array.isArray(p.tasks) && p.tasks.includes('CREATE_CONTENT') ? '' : ' · thiếu quyền đăng bài'}
                    </Text>
                  </Space>
                </Space>
              </Card>
            ))}
          </Space>
        )}
      </Modal>
    </PageContainer>
  );
}
