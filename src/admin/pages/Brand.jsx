// Brand page — antd Form, Input, Button, Card, Alert, message.
import { useState, useEffect, useCallback } from 'react';
import { Card, Form, Input, Button, Space, Typography, Alert, message, Divider, Row, Col, Tag } from 'antd';
import { SaveOutlined, ThunderboltOutlined, GiftOutlined, FilterOutlined, DeleteOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost, api } from '../api.js';

const { Text } = Typography;
const { TextArea } = Input;

export default function Brand() {
  const [brand, setBrand] = useState({});
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState(null);
  const [filtering, setFiltering] = useState(false);
  const [filterResult, setFilterResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/brand-dna');
    if (status === 200) {
      setBrand(body.brand || {});
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
      setBrand(body.brand);
      setGenStatus({ type: 'success', text: `Đã tạo · provider=${body.brand.provider}` });
    } else {
      setGenStatus({ type: 'error', text: body?.error || 'Thất bại' });
    }
    setGenerating(false);
  };

  const save = async () => {
    setSaving(true);
    const r = await api('/api/admin/brand-dna', { method: 'PUT', body: JSON.stringify(brand) });
    if (r.status === 200) message.success('Đã lưu Brand DNA');
    else message.error(r.body?.error || 'Lưu thất bại');
    setSaving(false);
  };

  const runFilter = async (dryRun) => {
    setFiltering(true);
    const { status, body } = await apiPost('/api/admin/brand-filter-queue', { dry_run });
    if (status === 200 && body?.ok) {
      setFilterResult(body);
      message.success(`Đánh giá ${body.evaluated} · giữ ${body.kept} · loại ${body.dropped}`);
    } else {
      message.error(body?.error || 'Thất bại');
    }
    setFiltering(false);
  };

  const set = (key, val) => setBrand((b) => ({ ...b, [key]: val }));

  return (
    <PageContainer title="Brand DNA" description="Cấu hình thương hiệu và giọng văn cho AI" breadcrumb={[{ title: 'Thương hiệu' }, { title: 'Brand DNA' }]}>
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
          <Form.Item label="Giọng văn & tone"><TextArea rows={2} value={brand.tone || ''} onChange={(e) => set('tone', e.target.value)} /></Form.Item>
          <Form.Item label="Đối tượng mục tiêu"><TextArea rows={2} value={brand.audience || ''} onChange={(e) => set('audience', e.target.value)} /></Form.Item>
          <Form.Item label="Chủ đề chính"><TextArea rows={3} value={brand.key_themes || ''} onChange={(e) => set('key_themes', e.target.value)} placeholder="Mỗi dòng một chủ đề" /></Form.Item>
          <Form.Item label="Chủ đề tránh"><TextArea rows={2} value={brand.topics_to_avoid || ''} onChange={(e) => set('topics_to_avoid', e.target.value)} /></Form.Item>
          <Form.Item label="CTA"><Input value={brand.cta || ''} onChange={(e) => set('cta', e.target.value)} /></Form.Item>
          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>Lưu</Button>
            <Button icon={<FilterOutlined />} loading={filtering} onClick={() => runFilter(true)}>Lọc thử (dry run)</Button>
            <Button icon={<FilterOutlined />} loading={filtering} onClick={() => runFilter(false)}>Lọc & áp dụng</Button>
          </Space>
        </Form>
      </Card>

      {filterResult?.dropped_sample?.length > 0 && (
        <Card title="Bị loại" size="small" style={{ marginTop: 16 }}>
          {filterResult.dropped_sample.map((d, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <Tag color="error">{d.keyword}</Tag>
              <Text type="secondary">{d.reason}</Text>
            </div>
          ))}
        </Card>
      )}
    </PageContainer>
  );
}
