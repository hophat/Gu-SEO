// Multi-channel cards — the "đa nền tảng" surface.
//
// One card per channel: connection state, enable switch, per-channel
// config and a test button. Data comes from GET /api/admin/projects/channels
// (see functions/api/admin/projects/channels.js); every mutation posts an
// action there. Tokens never come back to the browser — the card shows
// set/unset booleans only.
//
// Instagram's model deserves its own note: it publishes with the Facebook
// Page token (the linked IG Business account rides on the Page), so its
// card offers "dùng Page đã kết nối" instead of a separate OAuth dance.
import { useState } from 'react';
import {
  Card, Button, Space, Switch, Input, Form, Alert, Typography, Popconfirm, Collapse, Select,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined, ApiOutlined,
  SaveOutlined, LinkOutlined,
} from '@ant-design/icons';
import { apiPost } from '../api.js';

const { Text } = Typography;

const CHANNEL_INFO = {
  facebook: {
    color: '#1877f2',
    connectHint: 'Kết nối Facebook Page bằng tài khoản Meta của bạn. Hệ thống tự lấy Page token dài hạn.',
    requirements: [
      'Bạn phải là admin của Page.',
      'Meta App cần quyền pages_show_list, pages_read_engagement, pages_manage_posts.',
      'App ở chế độ Development: chỉ admin/developer/tester của app kết nối được.',
    ],
  },
  instagram: {
    color: '#e1306c',
    connectHint: 'Instagram đăng bài bằng token của Facebook Page đã liên kết với tài khoản IG Business/Creator.',
    requirements: [
      'Tài khoản Instagram phải ở chế độ Business hoặc Creator.',
      'IG phải được liên kết với Facebook Page (Instagram → Settings → Business tools).',
      'Meta App cần quyền instagram_basic, instagram_content_publish.',
      'Bài thiếu ảnh bìa sẽ bị bỏ qua — Instagram không đăng được bài chỉ có chữ.',
    ],
  },
  threads: {
    color: '#101010',
    connectHint: 'Kết nối tài khoản Threads bằng Threads App riêng. Token được đổi sang loại dài hạn và lưu mã hoá.',
    requirements: [
      'Trong Settings nhập Threads App ID và Threads App Secret.',
      'Meta App cần use case Access the Threads API và quyền threads_basic, threads_content_publish.',
      'Redirect URI: /api/admin/projects/channels-callback.',
      'Threads App ID khác Facebook App ID; dùng nhầm sẽ báo Invalid Scopes.',
      'Mỗi bài giới hạn 500 ký tự — hệ thống tự cắt đủ dài.',
    ],
  },
  x: {
    color: '#0f1419',
    connectHint: 'Tạo app tại developer.x.com, cấp quyền "Read and write", rồi dán 4 thông tin bên dưới. Lưu mã hoá, không bao giờ hiển thị lại.',
    requirements: [
      'Cần đủ 4 thông tin: API Key, API Secret, Access Token, Access Token Secret.',
      'Access Token phải sinh sau khi bật quyền "Read and write".',
      'Free tier của X rất hẹp — lỗi 429 nghĩa là cần giảm tần suất hoặc nâng gói.',
    ],
  },
  youtube: {
    color: '#ff0000',
    connectHint: 'Kết nối kênh YouTube bằng Google OAuth. Video chỉ đăng từ hàng đợi video đã render xong.',
    requirements: [
      'Google Cloud project bật YouTube Data API v3.',
      'OAuth redirect URI: /api/admin/projects/youtube-callback.',
      'Scope youtube.upload là scope nhạy cảm; app public có thể cần Google OAuth verification.',
      'Video mặc định để riêng tư. Chọn Unlisted/Public trước khi bật tự động đăng.',
    ],
  },
};

const CONNECT_ROUTE = {
  facebook: '/api/admin/projects/channels-connect?channel=facebook',
  threads: '/api/admin/projects/channels-connect?channel=threads',
  instagram: '/api/admin/projects/channels-connect?channel=instagram',
  youtube: '/api/admin/projects/youtube-connect',
};

export default function ChannelCards({ data, reload }) {
  const [busy, setBusy] = useState({});
  const [testResult, setTestResult] = useState({});
  const [xForm] = Form.useForm();

  const setBusyKey = (k, v) => setBusy((s) => ({ ...s, [k]: v }));

  const act = async (payload, key, onOk) => {
    setBusyKey(key, true);
    const r = await apiPost('/api/admin/projects/channels', payload);
    setBusyKey(key, false);
    if (r.status === 200 && r.body?.ok) {
      if (onOk) onOk(r.body);
      reload();
    } else if (r.body?.error) {
      const detail = r.body.detail ? `${r.body.error} — ${r.body.detail}` : r.body.error;
      import('antd').then(({ message }) => message.error(detail));
    }
    return r;
  };

  const toggle = (channel, enabled) =>
    act({ action: enabled ? 'enable' : 'disable', channel }, `toggle-${channel}`);

  const test = async (channel) => {
    setTestResult((s) => ({ ...s, [channel]: null }));
    setBusyKey(`test-${channel}`, true);
    const r = await apiPost('/api/admin/projects/channels', { action: 'test', channel });
    setBusyKey(`test-${channel}`, false);
    const ok = r.status === 200 && r.body?.ok;
    setTestResult((s) => ({
      ...s,
      [channel]: ok
        ? { ok: true, text: r.body.page?.name || r.body.profile?.title || r.body.profile?.username || 'Kết nối OK' }
        : { ok: false, text: r.body?.error || 'Không kết nối được' },
    }));
  };

  const disconnect = (channel) =>
    act({ action: 'disconnect', channel }, `disconnect-${channel}`);

  const saveX = async () => {
    const v = await xForm.validateFields();
    await act(
      { action: 'save', channel: 'x', credentials: v },
      'save-x',
      () => { xForm.resetFields(); },
    );
    await act({ action: 'enable', channel: 'x' }, 'toggle-x');
  };

  const saveIgHashtags = async (cfg) => {
    const { hashtags } = cfg || {};
    await act({ action: 'save', channel: 'instagram', config: { hashtags: hashtags || '' } }, 'save-instagram');
  };

  const saveYoutube = async (cfg) => {
    await act({
      action: 'save',
      channel: 'youtube',
      config: {
        ...(cfg || {}),
        privacy_status: cfg?.privacy_status || 'private',
        tags: cfg?.tags || '',
        as_video: cfg?.as_video === true,
      },
    }, 'save-youtube');
  };

  const appReady = data?.meta_app?.id_set && data?.meta_app?.secret_set;

  const channelAppReady = (channel) => channel === 'youtube'
    ? !!(data?.youtube_app?.id_set && data?.youtube_app?.secret_set)
    : !!appReady;

  const renderCard = (c) => {
    const info = CHANNEL_INFO[c.channel];
    if (!info) return null;
    const token = c.token || { set: false };
    const connected = !!token.set;
    const busyKey = (s) => busy[`${s}-${c.channel}`];
    const tr = testResult[c.channel];

    return (
      <Card
        key={c.channel}
        size="small"
        style={{ borderColor: c.enabled ? info.color : undefined }}
        title={
          <Space>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: info.color, display: 'inline-block' }} />
            <Text strong>{c.label}</Text>
            {connected
              ? <span className="ps-chip ps-chip--good"><CheckCircleOutlined /> Đã kết nối</span>
              : <span className="ps-chip ps-chip--muted"><CloseCircleOutlined /> Chưa kết nối</span>}
            {c.enabled && <span className="ps-chip ps-chip--info">Đang đẩy bài</span>}
          </Space>
        }
        extra={
          <Space size={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>Tự động đăng</Text>
            <Switch
              aria-label={`Tự động đăng ${c.label}`}
              checkedChildren="Bật"
              unCheckedChildren="Tắt"
              checked={c.enabled}
              loading={!!busyKey('toggle')}
              onChange={(v) => toggle(c.channel, v)}
              disabled={!connected && ['facebook', 'instagram', 'threads', 'x', 'youtube'].includes(c.channel)}
            />
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Text type="secondary" style={{ fontSize: 13 }}>{info.connectHint}</Text>

          {c.channel === 'facebook' && connected && (
            <Text>
              Page: <Text strong>{c.config?.page_name || c.config?.page_id || '—'}</Text>
              {c.config?.page_id && <Text code style={{ marginLeft: 8 }}>{c.config.page_id}</Text>}
            </Text>
          )}
          {c.channel === 'instagram' && connected && (
            <Text>
              Page nguồn: <Text strong>{c.config?.page_name || '(tự tìm Page có IG liên kết)'}</Text>
              {token.source === 'global' && <span className="ps-chip ps-chip--plain ps-chip-xs" style={{ marginInlineStart: 8 }}>token toàn cục</span>}
            </Text>
          )}
          {c.channel === 'threads' && connected && c.config?.username && (
            <Text>@<Text strong>{c.config.username}</Text></Text>
          )}
          {c.channel === 'youtube' && connected && (
            <Text>
              Kênh: <Text strong>{c.config?.channel_title || c.config?.channel_id || '—'}</Text>
            </Text>
          )}

          {/* X credentials form — the only channel without an OAuth flow. */}
          {c.channel === 'x' && (
            <Form form={xForm} layout="vertical" style={{ maxWidth: 520 }} size="small">
              <Form.Item name="api_key" label="API Key" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Input.Password placeholder={token.set ? '•••• (đã lưu — dán mới để thay)' : 'Nhập API Key'} autoComplete="off" />
              </Form.Item>
              <Form.Item name="api_secret" label="API Key Secret" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Input.Password placeholder={token.set ? '•••• (đã lưu — dán mới để thay)' : 'Nhập API Key Secret'} autoComplete="off" />
              </Form.Item>
              <Form.Item name="access_token" label="Access Token" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Input.Password placeholder={token.set ? '•••• (đã lưu — dán mới để thay)' : 'Nhập Access Token'} autoComplete="off" />
              </Form.Item>
              <Form.Item name="access_secret" label="Access Token Secret" rules={[{ required: true, message: 'Bắt buộc' }]}>
                <Input.Password placeholder={token.set ? '•••• (đã lưu — dán mới để thay)' : 'Nhập Access Token Secret'} autoComplete="off" />
              </Form.Item>
              <Space>
                <Button icon={<SaveOutlined />} loading={busy['save-x']} onClick={saveX}>Lưu &amp; bật kênh</Button>
                {connected && <Button icon={<ThunderboltOutlined />} loading={busyKey('test')} onClick={() => test('x')}>Kiểm tra</Button>}
                {connected && (
                  <Popconfirm title="Xoá 4 thông tin và tắt kênh X?" onConfirm={() => disconnect('x')}>
                    <Button danger size="small">Ngắt kết nối</Button>
                  </Popconfirm>
                )}
              </Space>
            </Form>
          )}

          {/* Instagram hashtag config */}
          {c.channel === 'instagram' && connected && (
            <IgConfigForm cfg={c.config} busy={busy['save-instagram']} onSave={saveIgHashtags} />
          )}

          {c.channel === 'youtube' && connected && (
            <YoutubeConfigForm cfg={c.config} busy={busy['save-youtube']} onSave={saveYoutube} />
          )}

          {c.channel !== 'x' && (
            <Space wrap>
              {connected ? (
                <>
                  <Button icon={<ThunderboltOutlined />} loading={busyKey('test')} onClick={() => test(c.channel)}>Kiểm tra</Button>
                  {CONNECT_ROUTE[c.channel] && (
                    <Button icon={<ApiOutlined />} disabled={!channelAppReady(c.channel)} onClick={() => { window.location.href = CONNECT_ROUTE[c.channel]; }}>
                      Kết nối lại
                    </Button>
                  )}
                  <Popconfirm title={`Ngắt kết nối ${c.label}?`} onConfirm={() => disconnect(c.channel)}>
                    <Button danger size="small">Ngắt kết nối</Button>
                  </Popconfirm>
                </>
              ) : CONNECT_ROUTE[c.channel] ? (
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  disabled={!channelAppReady(c.channel)}
                  onClick={() => { window.location.href = CONNECT_ROUTE[c.channel]; }}
                >
                  Kết nối {c.label}
                </Button>
              ) : null}
            </Space>
          )}

          {tr && <Alert type={tr.ok ? 'success' : 'error'} showIcon message={tr.text} style={{ marginTop: 4 }} />}

          <Collapse
            ghost
            size="small"
            items={[{
              key: 'req',
              label: <Text type="secondary" style={{ fontSize: 12 }}>Điều kiện & giới hạn</Text>,
              children: (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                  {info.requirements.map((r) => <li key={r}>{r}</li>)}
                </ul>
              ),
            }]}
          />
        </Space>
      </Card>
    );
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      {(data?.channels || []).map(renderCard)}
    </Space>
  );
}

function IgConfigForm({ cfg, busy, onSave }) {
  const [hashtags, setHashtags] = useState(cfg?.hashtags || '');
  return (
    <Form layout="vertical" style={{ maxWidth: 520 }} size="small">
      <Form.Item
        label="Hashtag thêm (phân tách bằng dấu phẩy)"
        extra="Tối đa 5 hashtag. Bộ lọc bài viết tự thêm tag theo từ khoá."
        style={{ marginBottom: 8 }}
      >
        <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="gulagi,ISR,du-lich" />
      </Form.Item>
      <Button icon={<SaveOutlined />} size="small" loading={busy} onClick={() => onSave({ hashtags })}>Lưu</Button>
    </Form>
  );
}

function YoutubeConfigForm({ cfg, busy, onSave }) {
  const [privacy, setPrivacy] = useState(
    ['private', 'unlisted', 'public'].includes(cfg?.privacy_status) ? cfg.privacy_status : 'private'
  );
  const [tags, setTags] = useState(cfg?.tags || '');
  const [asVideo, setAsVideo] = useState(cfg?.as_video === true);
  return (
    <Form layout="vertical" style={{ maxWidth: 520 }} size="small">
      <Form.Item label="Quyền hiển thị" style={{ marginBottom: 8 }}>
        <Select
          value={privacy}
          onChange={setPrivacy}
          options={[
            { value: 'private', label: 'Riêng tư (mặc định)' },
            { value: 'unlisted', label: 'Không công khai' },
            { value: 'public', label: 'Công khai' },
          ]}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item label="Tag (phân tách bằng dấu phẩy)" style={{ marginBottom: 8 }}>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="gulagi, SEO, marketing" />
      </Form.Item>
      <Form.Item label="Tự đăng video khi render xong" style={{ marginBottom: 8 }}>
        <Switch checked={asVideo} onChange={setAsVideo} />
      </Form.Item>
      <Button
        icon={<SaveOutlined />}
        size="small"
        loading={busy}
        onClick={() => onSave({ ...(cfg || {}), privacy_status: privacy, tags, as_video: asVideo })}
      >
        Lưu
      </Button>
    </Form>
  );
}
