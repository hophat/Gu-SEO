// SetupWizard — guided onboarding: brand identity → Brand DNA → calendar plan.
//
// Deliberately NO AI provider step. Provider keys are platform configuration:
// one deployment has one set of keys shared by every project, so letting each
// tenant paste their own would either be ignored or overwrite the platform's.
// Only a super_admin configures them, in Settings.
//
// Reuses /api/admin/brand-dna, /api/admin/calendar/plan, /api/admin/onboarding,
// /api/admin/projects/profile.
import { useState, useEffect, useCallback } from 'react';
import { Modal, Steps, Button, Form, Input, Alert, Spin, Card, Space, Typography, message, Row, Col, List } from 'antd';
import {
  RocketOutlined, GlobalOutlined, GiftOutlined, CalendarOutlined,
  CheckCircleOutlined, LoadingOutlined, ArrowRightOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import { apiGet, apiPost, api } from '../api.js';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;


const MONTHS_SHORT = ['Thg 1','Thg 2','Thg 3','Thg 4','Thg 5','Thg 6','Thg 7','Thg 8','Thg 9','Thg 10','Thg 11','Thg 12'];

// Turn a brand-DNA failure into something that points at the real cause.
// The API distinguishes these; the UI used to collapse them all into
// "couldn't read your website", which is only true for the first one.
function describeFailure(body, status) {
  const code = body?.error || '';
  const detail = String(body?.detail || '');

  if (code === 'scrape_failed') {
    // The Worker's own fetch failed. `detail` is the raw reason.
    if (/timeout/i.test(detail)) return 'Website phản hồi quá chậm (quá 12 giây).';
    if (/not_html_content_type/i.test(detail)) return 'URL đó không trả về trang HTML (có thể là file hoặc ảnh).';
    if (/^http_\d/.test(detail)) return `Website trả về lỗi ${detail.replace('http_', '')}.`;
    return 'Không truy cập được website — kiểm tra lại URL hoặc thử thêm www.';
  }
  if (code === 'scrape_too_thin') {
    return 'Trang quá ít nội dung để phân tích (có thể là site chỉ chạy JavaScript). Thử URL trang Giới thiệu/Dịch vụ.';
  }
  if (code === 'generation_failed') {
    // The scrape worked; the AI is the problem. This is the common one, and
    // the least obvious from the outside.
    if (/no_text_providers_configured/.test(detail)) {
      return 'Chưa có AI provider nào được cấu hình. Vào Cài đặt để thêm API key hoặc bật Workers AI.';
    }
    if (/4006|neurons/i.test(detail)) {
      return 'Workers AI đã hết hạn mức miễn phí hôm nay (10.000 neurons/ngày). Thêm API key cho provider khác hoặc nâng cấp gói Cloudflare.';
    }
    if (/429/.test(detail)) return 'Provider AI đang bị giới hạn tần suất (429). Thử lại sau hoặc đổi provider.';
    if (/404/.test(detail)) return 'Model AI không tồn tại với key hiện tại (404). Kiểm tra lại model trong Cài đặt.';
    return 'AI không tạo được Brand DNA. Kiểm tra provider trong Cài đặt.';
  }
  if (status === 401) return 'Phiên đăng nhập đã hết hạn.';
  return detail || 'Tạo Brand DNA thất bại.';
}

export default function SetupWizard({ open, onClose, onComplete, blocking = false }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [manualMode, setManualMode] = useState(false);

  // Step 1: brand identity + website
  const [projectName, setProjectName] = useState('');
  const [url, setUrl] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [topicsAvoid, setTopicsAvoid] = useState('');

  // Step 2: Brand DNA fields
  const [brand, setBrand] = useState(null);
  const [brandFields, setBrandFields] = useState({
    business_type: '', voice_tone: '', target_audience: '',
    key_themes: '', service_area: '', topics_to_avoid: '',
  });

  // Step 4: Calendar plan
  const [planSlots, setPlanSlots] = useState([]);

  // Prefill from the project's current identity. Registration only collects
  // email/OTP/password and derives a provisional name from the email local
  // part, so this step is where the real brand name and website are captured.
  useEffect(() => {
    if (!open) return;
    apiGet('/api/admin/projects/profile').then(({ status, body }) => {
      if (status !== 200 || !body?.project) return;
      setProjectName((n) => n || body.project.name || '');
      setUrl((u) => u || body.project.website_url || '');
    }).catch(() => {});
    apiGet('/api/admin/brand-dna').then(({ status, body }) => {
      if (status === 200 && body?.brand?.source_url) setUrl((u) => u || body.brand.source_url);
    }).catch(() => {});
  }, [open]);

  // Persist identity before generating Brand DNA — the scrape uses the URL, and
  // the name should be real before the AI reads the site.
  const saveIdentity = async () => {
    const name = projectName.trim();
    if (!name) { setError('Nhập tên thương hiệu / dự án'); return false; }
    const r = await api('/api/admin/projects/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name, website_url: url.trim() }),
    });
    if (r.status !== 200) { setError(r.body?.detail || r.body?.error || 'Không lưu được tên dự án'); return false; }
    return true;
  };

  // Step 1 → 2: Generate Brand DNA from URL
  const generateBrandDna = async () => {
    if (!/^https?:\/\/.+/i.test(url)) { setError('Nhập URL đầy đủ bắt đầu bằng https://'); return; }
    setError(null);
    setLoading(true);
    if (!(await saveIdentity())) { setLoading(false); return; }
    setStep(1);
    const { status, body } = await api('/api/admin/brand-dna', {
      method: 'POST',
      body: JSON.stringify({ url, service_area: serviceArea, topics_to_avoid: topicsAvoid }),
    });
    setLoading(false);
    if (status !== 200 || !body?.brand) {
      // Falling back to manual entry rather than bouncing back to step 0 is
      // deliberate: setup is mandatory, so a failure must not become a dead
      // end. The operator can describe their business by hand and still reach
      // a working schedule.
      //
      // The message must name the ACTUAL cause. It used to say "không đọc được
      // website" for every failure, which sent people off to check their URL
      // when the real problem was that no AI provider was usable — the
      // website had been read fine.
      setError(`${describeFailure(body, status)} Bạn có thể điền Brand DNA thủ công bên dưới.`);
      setManualMode(true);
      setBrand({ source_url: url });
      return;
    }
    const b = body.brand;
    b.source_url = url;
    setBrand(b);
    setBrandFields({
      business_type: b.business_type || '',
      voice_tone: b.voice_tone || '',
      target_audience: b.target_audience || '',
      key_themes: b.key_themes || '',
      service_area: b.service_area || serviceArea || '',
      topics_to_avoid: b.topics_to_avoid || topicsAvoid || '',
    });
  };

  // Skip AI entirely — same destination, operator-supplied copy.
  const startManual = async () => {
    setError(null);
    setLoading(true);
    if (!(await saveIdentity())) { setLoading(false); return; }
    setLoading(false);
    setManualMode(true);
    setBrand({ source_url: url });
    setBrandFields({
      business_type: '', voice_tone: '', target_audience: '',
      key_themes: '', service_area: serviceArea, topics_to_avoid: topicsAvoid,
    });
    setStep(1);
  };

  // Step 2 → 3: Save Brand DNA
  const saveBrandDna = async () => {
    setError(null);
    // The API refuses to mark onboarding complete without Brand DNA, so
    // catching it here gives a better message than a 409 at the last step.
    if (!brandFields.business_type.trim()) {
      setError('Nhập loại hình kinh doanh — đây là phần bắt buộc để AI viết đúng nội dung.');
      return;
    }
    setLoading(true);
    const { status, body } = await api('/api/admin/brand-dna', {
      method: 'PUT',
      body: JSON.stringify({
        ...brandFields,
        source_url: brand?.source_url || url,
        skip_auto_plan: true,
      }),
    });
    setLoading(false);
    if (status !== 200) { setError(body?.error || 'Lưu thất bại'); return; }

    // Straight to the calendar planner, not to the preview: the preview
    // renders planSlots, which is still empty until /calendar/plan runs.
    // Jumping to step 2 directly showed "0 bài viết" and the final
    // "Hoàn tất" then failed with 409 because no future slots existed.
    await planCalendar();
  };

  // Step 2 → 3: plan the calendar.
  //
  // This used to also write provider keys. It no longer does: provider keys are
  // platform configuration owned by a super_admin, and a tenant pasting their
  // own here would overwrite the deployment's shared keys for every other
  // project.
  const planCalendar = async () => {
    setError(null);
    setLoading(true);
    const { status, body } = await api('/api/admin/calendar/plan', {
      method: 'POST',
      body: JSON.stringify({ days: 28, replace: false }),
    });
    setLoading(false);
    if (status !== 200) { setError(body?.detail || body?.error || 'Lên lịch thất bại'); return; }
    setPlanSlots(body.slots || []);
    setStep(2);
  };

  // Complete. The API validates that the required steps are actually done, so
  // a failure here means something is genuinely missing — surface it rather
  // than pretending setup finished.
  const finish = async () => {
    setError(null);
    setLoading(true);
    const r = await apiPost('/api/admin/onboarding', {});
    setLoading(false);
    if (r.status !== 200) {
      setError(r.body?.detail || r.body?.error || 'Chưa thể hoàn tất thiết lập.');
      return;
    }
    message.success('Thiết lập hoàn tất!');
    onComplete?.();
    reset();
  };

  const reset = () => {
    setStep(0);
    setError(null);
    setBrand(null);
    setPlanSlots([]);
    setManualMode(false);
  };

  const handleClose = () => {
    // Blocking mode has no close path — setup is mandatory, so the only way
    // out is finishing it.
    if (blocking) return;
    reset();
    onClose();
  };

  const steps = [
    { title: 'Thương hiệu', icon: <GlobalOutlined /> },
    { title: 'Brand DNA', icon: <GiftOutlined /> },
    { title: 'Lịch nội dung', icon: <CalendarOutlined /> },
  ];

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      width={680}
      footer={null}
      destroyOnClose
      // In blocking mode there is no dismiss affordance at all: no X, no mask
      // click, no Esc. Setup is required before the product can do anything
      // useful, so allowing an escape just produces a dead account.
      closable={!blocking}
      maskClosable={!blocking}
      keyboard={!blocking}
      title={
        <Space>
          <RocketOutlined className="ps-stat-icon ps-stat-icon--info" />
          <span>Trình thiết lập{blocking ? ' — bắt buộc' : ''}</span>
        </Space>
      }
    >
      {blocking && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Cần hoàn tất 2 bước để hệ thống bắt đầu tạo bài"
          description="Brand DNA để AI viết đúng giọng thương hiệu, và lịch nội dung để cron biết mỗi ngày viết gì. Không có hai thứ này thì tài khoản sẽ không tạo được bài nào."
        />
      )}
      <Steps current={step} items={steps.map((s, i) => ({
        title: s.title,
        icon: i < step ? <CheckCircleOutlined className="ps-stat-icon ps-stat-icon--good" /> : s.icon,
      }))} style={{ marginBottom: 32 }} />

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />}

      {/* Step 0: Brand identity + website */}
      {step === 0 && (
        <div>
          <Paragraph>
            <Text strong>Bước 1 — Thương hiệu của bạn. </Text>
            <Text type="secondary">
              Cho chúng tôi biết tên dự án và website; AI sẽ đọc website để tạo Brand DNA, rồi lên lịch bài viết.
            </Text>
          </Paragraph>
          <Form layout="vertical">
            <Form.Item label="Tên thương hiệu / dự án" required>
              <Input
                size="large"
                prefix={<RocketOutlined />}
                placeholder="vd: Bảo Bì Nhựa Đạt Thành Dũng"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </Form.Item>
            <Form.Item label="URL website" required>
              <Input
                size="large"
                prefix={<GlobalOutlined />}
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onPressEnter={generateBrandDna}
              />
            </Form.Item>
            <Form.Item label="Khu vực phục vụ (tùy chọn)">
              <Input placeholder="Hà Nội, Việt Nam" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} />
            </Form.Item>
            <Form.Item label="Chủ đề tránh nhắc (tùy chọn)">
              <Input placeholder="chính trị, tôn giáo..." value={topicsAvoid} onChange={(e) => setTopicsAvoid(e.target.value)} />
            </Form.Item>
          </Form>
          <div style={{ textAlign: 'right' }}>
            {!blocking && <Button onClick={handleClose} style={{ marginRight: 8 }}>Để sau</Button>}
            <Button onClick={startManual} loading={loading} style={{ marginRight: 8 }}>Điền thủ công</Button>
            <Button type="primary" icon={<ArrowRightOutlined />} onClick={generateBrandDna} loading={loading}>
              Đọc trang web của tôi
            </Button>
          </div>
        </div>
      )}

      {/* Step 1: Brand DNA loading / review */}
      {step === 1 && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
              <p className="ps-wizard-note">
                Đang đọc <Text strong>{url && new URL(url).hostname}</Text> và tạo Brand DNA...
              </p>
            </div>
          ) : (
            <>
              <Paragraph>
                <Text strong>Brand DNA </Text>
                <Text type="secondary">— xem lại và chỉnh sửa trước khi lưu</Text>
              </Paragraph>
              {manualMode && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="Đang điền thủ công"
                  description="Chỉ cần mô tả ngắn gọn cũng đủ để AI viết đúng hướng. Có thể chỉnh lại sau ở tab Thương hiệu."
                />
              )}
              <Form layout="vertical">
                <Form.Item label="Loại hình kinh doanh" required>
                  <Input
                    placeholder="vd: công ty sản xuất bao bì nhựa"
                    value={brandFields.business_type}
                    onChange={(e) => setBrandFields({ ...brandFields, business_type: e.target.value })}
                  />
                </Form.Item>
                <Form.Item label="Giọng văn & phong cách">
                  <Input value={brandFields.voice_tone} onChange={(e) => setBrandFields({ ...brandFields, voice_tone: e.target.value })} />
                </Form.Item>
                <Form.Item label="Khách hàng mục tiêu">
                  <TextArea rows={2} value={brandFields.target_audience} onChange={(e) => setBrandFields({ ...brandFields, target_audience: e.target.value })} />
                </Form.Item>
                <Form.Item label="Chủ đề chính">
                  <TextArea rows={2} value={brandFields.key_themes} onChange={(e) => setBrandFields({ ...brandFields, key_themes: e.target.value })} />
                </Form.Item>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="Khu vực phục vụ">
                      <Input value={brandFields.service_area} onChange={(e) => setBrandFields({ ...brandFields, service_area: e.target.value })} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="Chủ đề tránh">
                      <Input value={brandFields.topics_to_avoid} onChange={(e) => setBrandFields({ ...brandFields, topics_to_avoid: e.target.value })} />
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
              <div style={{ textAlign: 'right' }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(0)} style={{ marginRight: 8 }}>Quay lại</Button>
                <Button type="primary" icon={<ArrowRightOutlined />} onClick={saveBrandDna} loading={loading}>
                  Lưu & tiếp tục
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2: Calendar plan preview */}
      {step === 2 && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
              <p className="ps-wizard-note">Đang lên lịch 28 ngày...</p>
            </div>
          ) : (
            <>
              <Paragraph>
                <CheckCircleOutlined className="ps-stat-icon ps-stat-icon--good" />
                <Text strong>Đã lên lịch {planSlots.length} bài viết!</Text>
              </Paragraph>
              <Card size="small" style={{ maxHeight: 300, overflow: 'auto' }}>
                <List
                  size="small"
                  dataSource={planSlots}
                  renderItem={(s) => {
                    const dt = new Date(s.scheduled_for + 'T00:00:00Z');
                    const dateLabel = `${dt.getUTCDate()} ${MONTHS_SHORT[dt.getUTCMonth()]}`;
                    return (
                      <List.Item>
                        <Space>
                          <span className="ps-chip ps-chip--plain ps-chip-xs">{dateLabel}</span>
                          <Text>{s.title}</Text>
                          {s.primary_keyword && <span className="ps-chip ps-chip--plain ps-chip-xs">{s.primary_keyword}</span>}
                        </Space>
                      </List.Item>
                    );
                  }}
                  locale={{ emptyText: 'Không cần thêm bài viết mới — lịch đã có sẵn nội dung.' }}
                />
              </Card>
              <Alert type="success" message="Hệ thống sẽ tự động tạo bài viết theo lịch. Cron chạy mỗi ngày." style={{ marginTop: 16 }} showIcon />
              <div style={{ textAlign: 'right', marginTop: 16 }}>
                {planSlots.length === 0 && (
                  <Button onClick={planCalendar} loading={loading} style={{ marginRight: 8 }}>
                    Lên lịch lại
                  </Button>
                )}
                <Button type="primary" size="large" icon={<CheckCircleOutlined />} onClick={finish}>
                  Hoàn tất thiết lập
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
