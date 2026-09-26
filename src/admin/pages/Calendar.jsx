// Calendar page — antd Calendar component with date cells showing slots,
// drawer for day detail, modal for create/edit.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Calendar, Button, Space, Typography, message, Modal, Form, Input, Select, Drawer, Empty, Popconfirm, Tooltip, Row, Col, Statistic, Steps } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined, CalendarOutlined, ThunderboltOutlined, ClockCircleOutlined, CheckCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { statusMeta } from '../lib/status.js';
import { apiGet, apiPost, api } from '../api.js';
import { useProjectUrl } from '../lib/projectUrl.js';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

const STATUS_OPTIONS = ['scheduled', 'generating', 'draft', 'published', 'skipped']
  .map((k) => ({ value: k, label: statusMeta(k, 'calendar').text }));

export default function CalendarPage() {
  const { urlForProject } = useProjectUrl();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [gen, setGen] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Load a 3-month window centered on today for the calendar view
    const from = dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
    const to   = dayjs().add(2, 'month').endOf('month').format('YYYY-MM-DD');
    const { status, body } = await apiGet(`/api/admin/calendar?from=${from}&to=${to}`);
    if (status === 200 && body?.ok) setSlots(body.slots || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Group slots by date string for O(1) lookup
  const slotsByDate = useMemo(() => {
    const map = {};
    for (const s of slots) {
      const d = s.scheduled_for;
      if (!map[d]) map[d] = [];
      map[d].push(s);
    }
    return map;
  }, [slots]);

  // Stats
  const stats = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD');
    return {
      total: slots.length,
      published: slots.filter((s) => s.status === 'published').length,
      scheduled: slots.filter((s) => s.status === 'scheduled').length,
      today: (slotsByDate[today] || []).length,
    };
  }, [slots, slotsByDate]);

  const plan = async () => {
    setPlanning(true);
    const { status, body } = await apiPost('/api/admin/calendar/plan', { days: 28 });
    if (status === 200 && body?.ok) {
      message.success(`Đã lên lịch ${body.slots?.length || 0} bài viết`);
      load();
    } else {
      message.error(body?.error || 'Thất bại');
    }
    setPlanning(false);
  };

  const onDateSelect = (date) => {
    setSelectedDate(date);
    setDrawerOpen(true);
  };

  const openCreate = (date) => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ scheduled_for: date.format('YYYY-MM-DD') });
    setModalOpen(true);
  };

  const openEdit = (slot) => {
    setEditing(slot);
    form.setFieldsValue({
      scheduled_for: slot.scheduled_for,
      title: slot.title,
      primary_keyword: slot.primary_keyword || '',
      angle: slot.angle || '',
      status: slot.status,
    });
    setModalOpen(true);
  };

  const onSubmit = async (values) => {
    if (editing) {
      const r = await api('/api/admin/calendar', { method: 'PATCH', body: JSON.stringify({ id: editing.id, ...values }) });
      if (r.status === 200) { message.success('Đã cập nhật'); setModalOpen(false); load(); }
      else message.error(r.body?.error || 'Lỗi');
    } else {
      const r = await apiPost('/api/admin/calendar', values);
      if (r.status === 200) { message.success('Đã tạo lịch'); setModalOpen(false); load(); }
      else message.error(r.body?.error || 'Lỗi');
    }
  };

  const deleteSlot = async (id) => {
    const r = await api(`/api/admin/calendar?id=${id}`, { method: 'DELETE' });
    if (r.status === 200) { message.success('Đã xóa'); load(); }
    else message.error(r.body?.error || 'Không thể xóa slot đã xuất bản');
  };

  const runSlotNow = async (slot) => {
    setGen({ slot, step: 0, log: ['1/4 giữ lịch & tạo job...'], error: null, done: false, url: null });
    const pushLog = (line) => setGen((g) => (g ? { ...g, log: [...g.log, line] } : g));
    const setStep = (step) => setGen((g) => (g ? { ...g, step } : g));
    try {
      const start = await apiPost('/api/admin/blog/start', { calendar_slot_id: slot.id });
      const jobId = start.body?.job_id;
      if (!jobId) throw new Error(start.body?.error || 'start failed');
      pushLog(`job_id: ${jobId}`);

      pushLog('2/4 viết bài...');
      setStep(1);
      const text = await apiPost('/api/admin/blog/text', { job_id: jobId });
      if (text.status !== 200) throw new Error(text.body?.error || 'text failed');
      pushLog(`tiêu đề: ${text.body.title}`);

      pushLog('3/4 tạo hình ảnh...');
      setStep(2);
      const img = await apiPost('/api/admin/blog/image', { job_id: jobId });
      if (img.status !== 200) throw new Error(img.body?.error || 'image failed');

      pushLog('4/4 xuất bản...');
      setStep(3);
      const pub = await apiPost('/api/admin/blog/publish', { job_id: jobId });
      if (pub.status !== 200) throw new Error(pub.body?.error || 'publish failed');
      const url = urlForProject(slot.project_id, '/blog/' + pub.body.slug);
      pushLog(`Đã xuất bản: ${url}`);

      setGen((g) => (g ? { ...g, step: 4, done: true, url } : g));
      message.success('Bài viết đã xuất bản!');
      load();
    } catch (e) {
      pushLog('lỗi: ' + e.message);
      setGen((g) => (g ? { ...g, error: e.message } : g));
      message.error('Thất bại: ' + e.message);
      load();
    }
  };

  // Render slots inside each calendar date cell
  const dateCellRender = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    const daySlots = slotsByDate[dateStr] || [];
    if (!daySlots.length) return null;
    // Show up to 3 slots per cell, then "+N more"
    const visible = daySlots.slice(0, 3);
    const extra = daySlots.length - visible.length;
    return (
      <div style={{ padding: '2px 4px' }}>
        {visible.map((s) => {
          const img = s.post?.hero_image_key ? `/image/${s.post.hero_image_key}` : null;
          const isDone = s.status === 'published';
          return (
            <div key={s.id} style={{ marginBottom: 3 }}>
              {img ? (
                // Published slot with a hero image — show the thumbnail and
                // strike through the title so it reads as "already generated".
                <div style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', lineHeight: 0 }}>
                  <img
                    src={img}
                    alt={s.title}
                    loading="lazy"
                    style={{ width: '100%', height: 44, objectFit: 'cover', display: 'block' }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.65) 100%)',
                    display: 'flex', alignItems: 'flex-end', padding: '2px 4px',
                  }}>
                    <Text
                      ellipsis
                      style={{
                        fontSize: 10, color: '#fff', lineHeight: 1.2,
                        textDecoration: isDone ? 'line-through' : 'none',
                        textDecorationColor: 'rgba(255,255,255,0.85)',
                      }}
                    >
                      {s.title}
                    </Text>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <StatusChip status={s.status} table="calendar" className="ps-cal-chip" />
                  <Text
                    ellipsis
                    style={{
                      fontSize: 11, minWidth: 0,
                      textDecoration: isDone ? 'line-through' : 'none',
                      color: isDone ? 'var(--ink-faint)' : undefined,
                    }}
                  >
                    {s.title}
                  </Text>
                </div>
              )}
            </div>
          );
        })}
        {extra > 0 && (
          <Text type="secondary" style={{ fontSize: 11 }}>+{extra} nữa</Text>
        )}
      </div>
    );
  };

  // Selected day's slots for the drawer
  const selectedDateStr = selectedDate.format('YYYY-MM-DD');
  const selectedSlots = slotsByDate[selectedDateStr] || [];

  return (
    <PageContainer
      title="Lịch nội dung"
      description="Lên lịch và quản lý bài viết theo lịch"
      breadcrumb={[{ title: 'Bài viết' }, { title: 'Lịch nội dung' }]}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button icon={<PlusOutlined />} onClick={() => openCreate(selectedDate)}>Thêm lịch</Button>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={planning} onClick={plan}>Lên lịch 28 ngày</Button>
        </Space>
      }
    >
      {/* Stats row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}><Card><Statistic title="Tổng lịch" value={stats.total} prefix={<CalendarOutlined />} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="Hôm nay" value={stats.today} prefix={<ClockCircleOutlined className="ps-stat-icon ps-stat-icon--info" />} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="Đã lên lịch" value={stats.scheduled} prefix={<ClockCircleOutlined className="ps-stat-icon ps-stat-icon--warn" />} valueStyle={{ color: 'var(--warn)' }} /></Card></Col>
        <Col xs={12} sm={6}><Card><Statistic title="Đã xuất bản" value={stats.published} prefix={<CheckCircleOutlined className="ps-stat-icon ps-stat-icon--good" />} valueStyle={{ color: 'var(--good)' }} /></Card></Col>
      </Row>

      {/* Calendar */}
      <Card loading={loading}>
        <Calendar
          value={selectedDate}
          onSelect={onDateSelect}
          cellRender={(date, info) => {
            if (info.type === 'date') return dateCellRender(date);
            return null;
          }}
        />
      </Card>

      {/* Drawer for selected date */}
      <Drawer
        title={
          <Space>
            <CalendarOutlined />
            <span>{selectedDate.format('DD/MM/YYYY')}</span>
            <span className="ps-chip ps-chip--plain">{selectedSlots.length} bài viết</span>
          </Space>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate(selectedDate)}>
            Thêm bài cho ngày này
          </Button>
        }
      >
        {selectedSlots.length === 0 ? (
          <Empty description="Không có bài viết nào cho ngày này" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate(selectedDate)}>Tạo lịch</Button>
          </Empty>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {selectedSlots.map((slot) => {
              const isDone = slot.status === 'published';
              const img = slot.post?.hero_image_key ? `/image/${slot.post.hero_image_key}` : null;
              return (
                <Card
                  key={slot.id}
                  size="small"
                  cover={img ? (
                    <img
                      src={img}
                      alt={slot.title}
                      loading="lazy"
                      style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                    />
                  ) : null}
                  actions={[
                    (slot.status === 'scheduled' || slot.status === 'draft') && (
                      <Popconfirm
                        key="run"
                        title="Tạo bài viết ngay cho lịch này?"
                        description="Bài viết sẽ được AI viết và xuất bản luôn, không chờ tới ngày đã lên lịch."
                        okText="Tạo ngay"
                        cancelText="Để sau"
                        onConfirm={() => runSlotNow(slot)}
                      >
                        <Button
                          size="small"
                          type="text"
                          icon={<ThunderboltOutlined />}
                          loading={gen?.slot?.id === slot.id && !gen.done && !gen.error}
                        >
                          Tạo ngay
                        </Button>
                      </Popconfirm>
                    ),
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(slot)} key="edit">Sửa</Button>,
                    <Popconfirm title="Xóa lịch này?" onConfirm={() => deleteSlot(slot.id)} key="del">
                      <Button size="small" type="text" danger icon={<DeleteOutlined />}>Xóa</Button>
                    </Popconfirm>,
                  ].filter(Boolean)}
                >
                  <div style={{ marginBottom: 8 }}>
                    <Text
                      strong
                      ellipsis
                      style={{
                        display: 'block',
                        textDecoration: isDone ? 'line-through' : 'none',
                        color: isDone ? 'var(--ink-faint)' : undefined,
                      }}
                    >
                      {slot.title}
                    </Text>
                  </div>
                  <Space size={[4, 4]} wrap>
                    <StatusChip status={slot.status} table="calendar" />
                    {slot.primary_keyword && <span className="ps-chip ps-chip--plain">{slot.primary_keyword}</span>}
                    <span className="ps-chip ps-chip--plain">{slot.source || 'manual'}</span>
                  </Space>
                  {slot.angle && (
                    <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>{slot.angle}</Text>
                  )}
                  {slot.post && (
                    <div className="ps-cal-post">
                      <Text type="secondary" style={{ fontSize: 12 }}>Đã xuất bản: </Text>
                      <a href={urlForProject(slot.project_id, '/blog/' + slot.post.slug)} target="_blank" rel="noopener noreferrer">{slot.post.title}</a>
                    </div>
                  )}
                </Card>
              );
            })}
          </Space>
        )}
      </Drawer>

      <Modal
        title={`Đang tạo bài: ${gen?.slot?.title || ''}`}
        open={!!gen}
        closable={gen?.done || !!gen?.error}
        maskClosable={false}
        onCancel={() => setGen(null)}
        footer={
          <Space>
            {gen?.url && (
              <Button type="link" href={gen.url} target="_blank" rel="noopener noreferrer">
                Xem bài viết
              </Button>
            )}
            <Button onClick={() => setGen(null)} disabled={!gen?.done && !gen?.error}>
              Đóng
            </Button>
          </Space>
        }
      >
        {gen && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Steps
              size="small"
              current={gen.done ? 4 : gen.step}
              status={gen.error ? 'error' : undefined}
              items={[
                { title: 'Giữ lịch' },
                { title: 'Viết bài' },
                { title: 'Tạo hình' },
                { title: 'Xuất bản' },
              ]}
            />
            <Card size="small" style={{ background: 'rgba(0,0,0,0.02)', maxHeight: 200, overflowY: 'auto' }}>
              {gen.log.map((line) => (
                <Text key={line} style={{ display: 'block', fontSize: 12, fontFamily: 'monospace' }}>{line}</Text>
              ))}
            </Card>
            {gen.error && <Text type="danger">Thất bại: {gen.error}</Text>}
          </Space>
        )}
      </Modal>

      {/* Create / Edit modal */}      <Modal
        title={editing ? 'Sửa lịch' : 'Tạo lịch mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item name="scheduled_for" label="Ngày xuất bản" rules={[{ required: true }]}>
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="title" label="Tiêu đề bài viết" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Cách tối ưu SEO kỹ thuật..." />
          </Form.Item>
          <Form.Item name="primary_keyword" label="Từ khóa chính">
            <Input placeholder="seo kỹ thuật" />
          </Form.Item>
          <Form.Item name="angle" label="Góc tiếp cận">
            <Input.TextArea rows={2} placeholder="Hướng dẫn từng bước cho người mới bắt đầu..." />
          </Form.Item>
          {editing && (
            <Form.Item name="status" label="Trạng thái">
              <Select options={STATUS_OPTIONS} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </PageContainer>
  );
}
