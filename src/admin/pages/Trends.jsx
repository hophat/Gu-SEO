// Trends page — a work-queue, not just a list.
//
// Every discovered topic can be turned into work in one click:
//   • "Thêm vào lịch"  → creates a content_calendar slot (the daily cron
//                        then writes it) and marks the topic 'scheduled'.
//   • "Tạo bài ngay"   → runs the full blog chain (start → text → image →
//                        publish) and marks the topic 'published'.
// Multi-select supports scheduling a whole batch across consecutive days.
//
// API: /api/admin/trend-discover (GET/POST/PATCH), /api/admin/competitors (GET),
//      /api/admin/calendar (POST), /api/admin/blog/{start,text,image,publish}
import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Table, Button, Typography, Space, Empty, message, Modal, Form, Input, DatePicker, Select, Statistic, Steps, Alert, Tooltip, Progress } from 'antd';
import { RiseOutlined, ReloadOutlined, ThunderboltOutlined, CalendarOutlined, PlusOutlined, CheckCircleOutlined, FireOutlined, ArrowRightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageContainer from '../components/PageContainer.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { scoreTone } from '../lib/status.js';
import { apiGet, apiPost, api } from '../api.js';
import { useProjectUrl } from '../lib/projectUrl.js';

const { Text } = Typography;

// Topic status labels come from lib/status.js (`trend` table), as does
// scoreTone — a score is a scale, not a state, so it maps to chip tones
// with the number always shown beside it.

export default function Trends() {
  const { urlForProject } = useProjectUrl();
  const [topics, setTopics] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);

  // Schedule modal
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedTargets, setSchedTargets] = useState([]);
  const [schedForm] = Form.useForm();

  // "Create now" job progress
  const [job, setJob] = useState({ active: false, topic: '', step: -1, log: [], failed: null, slug: null });

  const load = useCallback(async () => {
    setLoading(true);
    const [t, c] = await Promise.all([apiGet('/api/admin/trend-discover'), apiGet('/api/admin/competitors')]);
    if (t.status === 200 && t.body?.ok) setTopics(t.body.topics || []);
    if (c.status === 200 && c.body?.ok) setCompetitors(c.body.competitors || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    const { status, body } = await apiPost('/api/admin/trend-discover', {});
    if (status === 200 && body?.ok) {
      message.success(`Đã tạo ${body.generated || 0} chủ đề`);
      load();
    } else {
      message.error(body?.error || 'Thất bại');
    }
    setGenerating(false);
  };

  const patchStatus = async (id, status) => {
    const r = await api('/api/admin/trend-discover', { method: 'PATCH', body: JSON.stringify({ id, status }) });
    if (r.status !== 200) message.error(r.body?.error || 'Không cập nhật được trạng thái');
    return r.status === 200;
  };

  // ── add to calendar ─────────────────────────────────────────────
  const openSchedule = (targets) => {
    setSchedTargets(targets);
    schedForm.setFieldsValue({
      scheduled_for: dayjs().add(1, 'day'),
      title: targets.length === 1 ? targets[0].topic : '',
      primary_keyword: targets.length === 1 ? targets[0].topic : '',
      angle: '',
    });
    setSchedOpen(true);
  };

  const onSchedule = async (values) => {
    const base = values.scheduled_for;
    const single = schedTargets.length === 1;
    let created = 0;
    for (let i = 0; i < schedTargets.length; i++) {
      const t = schedTargets[i];
      const payload = {
        // Batch mode: one slot per consecutive day so the cron drains
        // them in order instead of piling several onto one date.
        scheduled_for: base.add(i, 'day').format('YYYY-MM-DD'),
        title: (single ? values.title : t.topic)?.slice(0, 200),
        primary_keyword: (single ? values.primary_keyword : t.topic)?.slice(0, 120),
        angle: single ? values.angle : '',
      };
      const r = await apiPost('/api/admin/calendar', payload);
      if (r.status === 200 && r.body?.ok) {
        created++;
        await patchStatus(t.id, 'scheduled');
      }
    }
    setSchedOpen(false);
    setSelectedKeys([]);
    if (created) message.success(`Đã thêm ${created} chủ đề vào lịch`);
    else message.error('Không thêm được vào lịch');
    load();
  };

  // ── create post now (full chain) ────────────────────────────────
  const createNow = async (topic) => {
    setJob({ active: true, topic: topic.topic, step: 0, log: ['Đang khởi tạo job…'], failed: null, slug: null });
    try {
      const start = await apiPost('/api/admin/blog/start', { topic_key: topic.topic, angle: topic.topic });
      const jobId = start.body?.job_id;
      if (start.status !== 200 || !jobId) throw new Error(start.body?.detail || start.body?.error || 'Không tạo được job');

      setJob((j) => ({ ...j, step: 1, log: [...j.log, 'Đang viết nội dung…'] }));
      const text = await apiPost('/api/admin/blog/text', { job_id: jobId });
      if (text.status !== 200) throw new Error(text.body?.detail || text.body?.error || 'Viết nội dung thất bại');

      setJob((j) => ({ ...j, step: 2, log: [...j.log, 'Đang tạo ảnh bìa…'] }));
      const img = await apiPost('/api/admin/blog/image', { job_id: jobId });
      if (img.status !== 200) throw new Error(img.body?.detail || img.body?.error || 'Tạo ảnh thất bại');

      setJob((j) => ({ ...j, step: 3, log: [...j.log, 'Đang xuất bản…'] }));
      const pub = await apiPost('/api/admin/blog/publish', { job_id: jobId });
      if (pub.status !== 200) throw new Error(pub.body?.detail || pub.body?.error || 'Xuất bản thất bại');

      await patchStatus(topic.id, 'published');
      setJob((j) => ({ ...j, active: false, step: 4, slug: pub.body?.slug, log: [...j.log, `Đã xuất bản: /blog/${pub.body?.slug}`] }));
      message.success('Đã tạo bài viết');
      load();
    } catch (err) {
      setJob((j) => ({ ...j, active: false, failed: err.message }));
      message.error(err.message);
    }
  };

  // ── columns ─────────────────────────────────────────────────────
  const columns = [
    { title: 'Chủ đề', dataIndex: 'topic', key: 'topic', ellipsis: true,
      render: (t, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{t}</Text>
          <Space size={4}>
            <span className={`ps-chip ps-chip--${scoreTone(r.relevance_score ?? 80)}`}>{r.relevance_score ?? 80}/100</span>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.source || 'ai'}</Text>
          </Space>
        </Space>
      ) },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130,
      render: (s) => <StatusChip status={s || 'pending'} table="trend" /> },
    { title: 'Thời gian', dataIndex: 'created_at', key: 'time', width: 110,
      render: (t) => t ? new Date(t * 1000).toLocaleDateString('vi-VN') : '-' },
    { title: 'Hành động', key: 'actions', width: 250,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Thêm vào lịch nội dung">
            <Button size="small" icon={<CalendarOutlined />} onClick={() => openSchedule([r])}>Vào lịch</Button>
          </Tooltip>
          <Tooltip title="Tạo bài viết ngay (~60-120s)">
            <Button size="small" type="primary" icon={<ThunderboltOutlined />} disabled={job.active} onClick={() => createNow(r)}>Tạo bài</Button>
          </Tooltip>
        </Space>
      ) },
  ];

  const selectedTopics = topics.filter((t) => selectedKeys.includes(t.id));

  return (
    <PageContainer
      title="Xu hướng"
      description="Khám phá xu hướng và đưa thẳng vào lịch / tạo bài"
      breadcrumb={[{ title: 'Bài viết' }, { title: 'Xu hướng' }]}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button type="primary" icon={<ThunderboltOutlined />} loading={generating} onClick={generate}>Khám phá xu hướng</Button>
        </Space>
      }
    >
      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Chủ đề" value={topics.length} prefix={<RiseOutlined />} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Chưa dùng" value={topics.filter((t) => (t.status || 'pending') === 'pending').length} prefix={<FireOutlined className="ps-stat-icon ps-stat-icon--warn" />} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Đã lên lịch" value={topics.filter((t) => t.status === 'scheduled').length} prefix={<CalendarOutlined className="ps-stat-icon ps-stat-icon--info" />} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Đã tạo bài" value={topics.filter((t) => t.status === 'published').length} prefix={<CheckCircleOutlined className="ps-stat-icon ps-stat-icon--good" />} /></Card></Col>
      </Row>

      {/* Job progress */}
      {job.topic && (
        <Card size="small" style={{ marginBottom: 16 }} title={<Space><ThunderboltOutlined /> Đang tạo bài: <Text type="secondary">{job.topic}</Text></Space>}>
          <Steps
            size="small"
            current={job.step}
            status={job.failed ? 'error' : job.active ? 'process' : 'finish'}
            items={[
              { title: 'Khởi tạo' },
              { title: 'Viết nội dung' },
              { title: 'Tạo ảnh' },
              { title: 'Xuất bản' },
            ]}
          />
          {job.failed && <Alert type="error" showIcon style={{ marginTop: 12 }} message="Tạo bài thất bại" description={job.failed} />}
          {job.slug && (
            <Alert
              type="success" showIcon style={{ marginTop: 12 }}
              message="Đã xuất bản"
              action={<Button size="small" href={urlForProject(undefined, '/blog/' + job.slug)} target="_blank">Xem bài</Button>}
            />
          )}
        </Card>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title={<Space><RiseOutlined /> Chủ đề xu hướng</Space>}
            size="small"
            extra={
              <Space>
                {selectedKeys.length > 0 && (
                  <Button size="small" type="primary" icon={<CalendarOutlined />} onClick={() => openSchedule(selectedTopics)}>
                    Thêm {selectedKeys.length} vào lịch
                  </Button>
                )}
                <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading} />
              </Space>
            }
          >
            <Table
              dataSource={topics}
              columns={columns}
              rowKey="id"
              size="small"
              loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 760 }}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: setSelectedKeys,
                getCheckboxProps: (r) => ({ disabled: r.status === 'published' }),
              }}
              locale={{ emptyText: 'Chưa có chủ đề. Nhấn "Khám phá xu hướng".' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Đối thủ cạnh tranh" size="small">
            {competitors.length === 0 ? <Empty description="Chưa có đối thủ" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <Table
                dataSource={competitors}
                rowKey={(r, i) => r.domain || i}
                size="small"
                pagination={false}
                columns={[
                  { title: 'Domain', dataIndex: 'domain', key: 'domain', render: (d) => <Text code>{d}</Text> },
                  { title: 'Điểm', dataIndex: 'score', key: 'score', width: 80, render: (s) => <span className={`ps-chip ps-chip--${scoreTone(s || 0)}`}>{s || 0}</span> },
                ]}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Schedule modal */}
      <Modal
        title={schedTargets.length === 1 ? 'Thêm chủ đề vào lịch' : `Thêm ${schedTargets.length} chủ đề vào lịch`}
        open={schedOpen}
        onCancel={() => setSchedOpen(false)}
        onOk={() => schedForm.submit()}
        okText="Thêm vào lịch"
        width={520}
      >
        <Form form={schedForm} layout="vertical" onFinish={onSchedule}>
          <Form.Item name="scheduled_for" label="Ngày bắt đầu" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          {schedTargets.length > 1 ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={`${schedTargets.length} chủ đề sẽ được xếp mỗi ngày một bài, liên tiếp từ ngày đã chọn.`}
            />
          ) : (
            <>
              <Form.Item name="title" label="Tiêu đề bài viết" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="primary_keyword" label="Từ khóa chính">
                <Input />
              </Form.Item>
              <Form.Item name="angle" label="Góc tiếp cận">
                <Input.TextArea rows={2} placeholder="Góc khai thác riêng (tùy chọn)" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </PageContainer>
  );
}
