// Brand page — antd Form, Input, Button, Card, Alert, message.
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Form, Input, Button, Space, Typography, Alert, message, Divider, Row, Col, Tag } from 'antd';
import { SaveOutlined, ThunderboltOutlined, FilterOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost, api } from '../api.js';

const { Text } = Typography;
const { TextArea } = Input;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_THEME = '#e05a2b';

// The GET endpoint returns canonical keys (voice_tone, target_audience)
// but older saves may have stored the aliases (tone, audience). Normalise
// to canonical keys so the form never renders empty after a load.
function normaliseBrand(raw = {}) {
  return {
    business_type: raw.business_type || '',
    voice_tone: raw.voice_tone || raw.tone || '',
    target_audience: raw.target_audience || raw.audience || '',
    key_themes: raw.key_themes || '',
    topics_to_avoid: raw.topics_to_avoid || '',
    service_area: raw.service_area || '',
    cta: raw.cta || '',
    source_url: raw.source_url || '',
    theme_color: String(raw.theme_color || '').toLowerCase(),
    logo_url: raw.logo_url || '',
  };
}

function errText(body, fallback) {
  if (!body) return fallback;
  return [body.error || fallback, body.detail || body.hint].filter(Boolean).join(' · ');
}

export default function Brand() {
  const [brand, setBrand] = useState(() => normaliseBrand());
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState(null);
  const [filtering, setFiltering] = useState(false);
  const [filterResult, setFilterResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/brand-dna');
    if (status === 200) {
      setBrand(normaliseBrand(body.brand || {}));
      setUrl(body.brand?.source_url || '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    if (!url.trim()) { message.error('Vui lòng nhập URL'); return; }
    setGenerating(true);
    setGenStatus({ type: 'info', text: 'Đang cào & phân tích... ~10-30s' });
    const { status, body } = await apiPost('/api/admin/brand-dna', { url, service_area: brand.service_area, topics_to_avoid: brand.topics_to_avoid });
    if (status === 200 && body?.ok) {
      // POST returns generated DNA only (no logo_url/theme_color) — merge
      // so the saved identity is never wiped from the form state.
      const fresh = normaliseBrand(body.brand);
      setBrand((prev) => ({ ...fresh, logo_url: prev.logo_url, theme_color: prev.theme_color }));
      setGenStatus({ type: 'success', text: `Đã tạo · provider=${body.brand.provider}. Hãy xem lại rồi nhấn Lưu.` });
    } else {
      setGenStatus({ type: 'error', text: errText(body, `Thất bại (${status})`) });
    }
    setGenerating(false);
  };

  // logo_url is server-assigned (only set via /projects/logo upload or
  // cleared with an empty value). A normal save must NOT include the key —
  // echoing it back is what produced `logo_url_is_server_assigned`.
  const buildSavePayload = (b) => {
    const { logo_url: _dropped, tone: _t, audience: _a, ...rest } = b;
    return { ...rest };
  };

  const save = async (extra = {}) => {
    setSaving(true);
    const r = await api('/api/admin/brand-dna', { method: 'PUT', body: JSON.stringify({ ...buildSavePayload(brand), ...extra }) });
    if (r.status === 200) {
      if (!('logo_url' in extra)) message.success('Đã lưu Brand DNA');
      return true;
    }
    message.error(errText(r.body, `Lưu thất bại (${r.status})`));
    return false;
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { message.error('Ảnh quá lớn (tối đa 2 MB).'); return; }
    setUploading(true);
    const dataUrl = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(file);
    });
    if (!dataUrl) { message.error('Không đọc được tệp.'); setUploading(false); return; }
    const r = await api('/api/admin/projects/logo', {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, content_type: file.type, base64: dataUrl }),
    });
    if (r.status === 200 && r.body?.ok) {
      setBrand((b) => ({ ...b, logo_url: r.body.logo_url }));
      message.success('Đã cập nhật logo.');
    } else {
      message.error(errText(r.body, `Tải logo thất bại (${r.status})`));
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeLogo = async () => {
    // Send the full payload plus an empty logo_url: the backend clears the
    // logo on a falsy value, and a logo-only body would wipe the DNA fields.
    const ok = await save({ logo_url: '' });
    if (ok) {
      setBrand((b) => ({ ...b, logo_url: '' }));
      message.success('Đã xoá logo.');
    }
  };

  const runFilter = async (dryRun) => {
    setFiltering(true);
    const { status, body } = await apiPost('/api/admin/brand-filter-queue', { dry_run: dryRun });
    if (status === 200 && body?.ok) {
      setFilterResult(body);
      message.success(`Đánh giá ${body.evaluated} · giữ ${body.kept} · loại ${body.dropped}`);
    } else {
      message.error(errText(body, `Thất bại (${status})`));
    }
    setFiltering(false);
  };

  const set = (key, val) => setBrand((b) => ({ ...b, [key]: val }));

  const themeHex = (brand.theme_color || '').toLowerCase();
  const pickerValue = HEX_RE.test(themeHex) ? themeHex : DEFAULT_THEME;

  return (
    <PageContainer title="Brand DNA" description="Cấu hình thương hiệu và giọng văn cho AI" breadcrumb={[{ title: 'Thương hiệu' }, { title: 'Brand DNA' }]}>
      <Card loading={loading} title="Nhận diện thương hiệu" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Logo">
              <Space direction="vertical">
                {brand.logo_url ? (
                  <img src={brand.logo_url} alt="Logo" style={{ height: 40, maxWidth: '100%', objectFit: 'contain' }} />
                ) : (
                  <Text type="secondary">Chưa có logo.</Text>
                )}
                <Space>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    hidden
                    onChange={(e) => uploadLogo(e.target.files?.[0])}
                  />
                  <Button icon={<UploadOutlined />} loading={uploading} onClick={() => fileRef.current?.click()}>
                    Tải logo lên
                  </Button>
                  {brand.logo_url && (
                    <Button icon={<DeleteOutlined />} danger onClick={removeLogo}>
                      Xoá logo
                    </Button>
                  )}
                </Space>
              </Space>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Màu chủ đạo (theme color)" extra="Để trống = dùng màu mặc định của giao diện.">
              <Space>
                <input
                  type="color"
                  value={pickerValue}
                  onChange={(e) => set('theme_color', e.target.value.toLowerCase())}
                  style={{ width: 44, height: 32, padding: 2, cursor: 'pointer' }}
                />
                <Input
                  value={brand.theme_color || ''}
                  maxLength={7}
                  placeholder="#e05a2b"
                  style={{ width: 120, fontFamily: 'monospace' }}
                  onChange={(e) => set('theme_color', e.target.value.trim().toLowerCase())}
                />
                {brand.theme_color && (
                  <Button size="small" type="link" onClick={() => set('theme_color', '')}>
                    Về mặc định
                  </Button>
                )}
              </Space>
              {brand.theme_color && !HEX_RE.test(themeHex) && (
                <Alert type="warning" showIcon message="Mã màu chưa đúng định dạng #rrggbb — sẽ không được lưu." style={{ marginTop: 8 }} />
              )}
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card loading={loading}>
        <Form layout="vertical">
          <Form.Item label="URL phân tích">
            <Space.Compact style={{ width: '100%' }}>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
              <Button type="primary" icon={<ThunderboltOutlined />} loading={generating} onClick={generate}>Phân tích</Button>
            </Space.Compact>
          </Form.Item>
          {genStatus && <Alert type={genStatus.type === 'error' ? 'error' : genStatus.type === 'success' ? 'success' : 'info'} message={genStatus.text} style={{ marginBottom: 16 }} closable />}
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Loại hình kinh doanh"><Input value={brand.business_type || ''} onChange={(e) => set('business_type', e.target.value)} /></Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Khu vực phục vụ"><Input value={brand.service_area || ''} onChange={(e) => set('service_area', e.target.value)} /></Form.Item>
            </Col>
          </Row>
          <Form.Item label="Giọng văn & tone"><TextArea rows={2} value={brand.voice_tone || ''} onChange={(e) => set('voice_tone', e.target.value)} /></Form.Item>
          <Form.Item label="Đối tượng mục tiêu"><TextArea rows={2} value={brand.target_audience || ''} onChange={(e) => set('target_audience', e.target.value)} /></Form.Item>
          <Form.Item label="Chủ đề chính"><TextArea rows={3} value={brand.key_themes || ''} onChange={(e) => set('key_themes', e.target.value)} placeholder="Mỗi dòng một chủ đề" /></Form.Item>
          <Form.Item label="Chủ đề tránh"><TextArea rows={2} value={brand.topics_to_avoid || ''} onChange={(e) => set('topics_to_avoid', e.target.value)} /></Form.Item>
          <Form.Item label="CTA"><Input value={brand.cta || ''} onChange={(e) => set('cta', e.target.value)} /></Form.Item>
          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => save()}>Lưu</Button>
            <Button icon={<FilterOutlined />} loading={filtering} onClick={() => runFilter(true)}>Lọc thử (dry run)</Button>
            <Button icon={<FilterOutlined />} loading={filtering} onClick={() => runFilter(false)}>Lọc & áp dụng</Button>
          </Space>
        </Form>
      </Card>

      {filterResult?.dropped_sample?.length > 0 && (
        <Card title="Bị loại" size="small" style={{ marginTop: 16 }}>
          {filterResult.dropped_sample.map((d) => (
            <div key={d.keyword || d.reason} style={{ marginBottom: 8 }}>
              <Tag color="error">{d.keyword}</Tag>
              <Text type="secondary">{d.reason}</Text>
            </div>
          ))}
        </Card>
      )}
      <Divider />
    </PageContainer>
  );
}
