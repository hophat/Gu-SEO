// Programmatic SEO page.
//
// Job creation has three entry points:
//   1. Google Autocomplete — seed + limit → scored, deduped keywords queued
//   2. Paste a list       — one keyword per line, scored + deduped
//   3. Preview only       — score without queueing, so the operator can
//      eyeball the pull before committing AI budget.
//
// The queue itself supports status filtering, inline priority pinning and
// retry of failed rows. "Tạo trang" drains one keyword per call (the same
// endpoint the cron uses), and the bulk runner just loops it.
//
// API: /api/admin/prog/queue (GET/PATCH), /api/admin/prog/upload (POST),
//      /api/admin/prog/pull-keywords (POST), /api/admin/prog/generate-next (POST)
import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Tag, Space, Typography, message, Input, Modal, Form, Row, Col, Select, InputNumber, Statistic, Progress, Alert, Tooltip, Popconfirm, Image, Steps } from 'antd';
import { PlusOutlined, ReloadOutlined, ThunderboltOutlined, SearchOutlined, EyeOutlined, ArrowUpOutlined, ArrowDownOutlined, CloseOutlined, RedoOutlined, LinkOutlined, FireOutlined, CheckCircleOutlined, LoadingOutlined, PlayCircleOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost, api } from '../api.js';
import { useProjectUrl } from '../lib/projectUrl.js';

const { Text } = Typography;

const STATUS_META = {
  pending:    { color: 'default',    text: 'Đang chờ' },
  processing: { color: 'processing', text: 'Đang xử lý' },
  done:       { color: 'success',    text: 'Hoàn thành' },
  failed:     { color: 'error',      text: 'Thất bại' },
};

const INTENT_META = {
  transactional: { color: 'green',  text: 'giao dịch' },
  commercial:    { color: 'gold',   text: 'thương mại' },
  informational: { color: 'blue',   text: 'thông tin' },
  navigational:  { color: 'default', text: 'điều hướng' },
  junk:          { color: 'red',    text: 'rác' },
};

export default function Prog() {
  const { urlForProject, activeProject } = useProjectUrl();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [rows, setRows] = useState([]);
  const [generatedPages, setGeneratedPages] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, processing: 0, done: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [bulk, setBulk] = useState({ running: false, done: 0, total: 0 });
  const [job, setJob] = useState({ active: false, keyword: '', completed: [], failed: null });

  // Collect form
  const [seed, setSeed] = useState('');
  const [limit, setLimit] = useState(50);
  const [pulling, setPulling] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewSeed, setPreviewSeed] = useState('');
  const [selectedKeywords, setSelectedKeywords] = useState([]);

  // Paste form
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteForm] = Form.useForm();

  const loadRows = useCallback(async (status) => {
    setLoading(true);
    const { status: code, body } = await apiGet(`/api/admin/prog/queue?status=${status}&limit=500`);
    if (code === 200) setRows(body?.keywords || []);
    setLoading(false);
  }, []);

  const loadCounts = useCallback(async () => {
    const statuses = ['pending', 'processing', 'done', 'failed'];
    const results = await Promise.all(statuses.map((s) => apiGet(`/api/admin/prog/queue?status=${s}&limit=500`)));
    const next = {};
    statuses.forEach((s, i) => { next[s] = (results[i].body?.keywords || []).length; });
    setCounts(next);
    setGeneratedPages(results[2].body?.keywords || []);
  }, []);

  const refresh = useCallback(() => {
    loadRows(statusFilter);
    loadCounts();
  }, [statusFilter, loadRows, loadCounts]);

  useEffect(() => { loadRows(statusFilter); }, [statusFilter, loadRows]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  // ── collect: Google Autocomplete ────────────────────────────────
  const pull = async () => {
    if (!seed.trim()) { message.error('Nhập cụm từ khóa mầm'); return; }
    setPulling(true);
    setPreview(null);
    setSelectedKeywords([]);
    const { status, body } = await apiPost('/api/admin/prog/pull-keywords', { seed: seed.trim(), limit, queue: false });
    setPulling(false);
    if (status !== 200) { message.error(body?.detail || body?.error || 'Không lấy được từ khóa'); return; }
    const keywords = body.keywords || [];
    setPreview(keywords);
    setPreviewSeed(body.seed || seed.trim());
    setSelectedKeywords(keywords.map((k) => k.canonical || k.keyword));
    message.success(`Đã thu thập ${body.pulled} từ khóa — chọn các mục cần đưa vào hàng đợi`);
  };

  const queueSelected = async () => {
    const selected = (preview || []).filter((k) => selectedKeywords.includes(k.canonical || k.keyword));
    if (!selected.length) { message.warning('Chọn ít nhất một từ khóa'); return; }
    setQueueing(true);
    const r = await apiPost('/api/admin/prog/upload', { keywords: selected.map((k) => k.keyword) });
    setQueueing(false);
    if (r.status !== 200 || !r.body?.ok) {
      message.error(r.body?.error || 'Không thể thêm vào hàng đợi');
      return;
    }
    message.success(`Đã thêm ${r.body.inserted || 0} từ khóa vào hàng đợi (${r.body.duplicate || 0} trùng)`);
    setPreview((current) => (current || []).filter((k) => !selectedKeywords.includes(k.canonical || k.keyword)));
    setSelectedKeywords([]);
    setStatusFilter('pending');
    refresh();
  };

  // ── paste list ──────────────────────────────────────────────────
  const onPaste = async (values) => {
    const keywords = values.keywords.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!keywords.length) { message.error('Nhập ít nhất 1 keyword'); return; }
    const r = await apiPost('/api/admin/prog/upload', { keywords });
    if (r.status === 200 && r.body?.ok) {
      message.success(`Đã thêm ${r.body.inserted || 0} keyword (${r.body.duplicate || 0} trùng, ${r.body.dropped_junk || 0} rác)`);
      setPasteOpen(false); pasteForm.resetFields(); refresh();
    } else message.error(r.body?.error || 'Lỗi');
  };

  // ── queue actions ───────────────────────────────────────────────
  const patch = async (id, patchBody) => {
    const r = await api('/api/admin/prog/queue', { method: 'PATCH', body: JSON.stringify({ id, ...patchBody }) });
    if (r.status === 200) refresh();
    else message.error(r.body?.error || 'Lỗi');
  };

  // ── generate ────────────────────────────────────────────────────
  const generateOne = async (silent = false) => {
    const { status, body } = await apiPost('/api/admin/prog/generate-next', {});
    if (status === 200 && body?.drained) {
      if (!silent) message.info('Hàng đợi đang trống');
      return { drained: true };
    }
    if (status !== 200 || !body?.ok) {
      const detail = body?.detail || body?.error || 'Tạo thất bại';
      if (!silent) message.error(detail);
      return { ok: false, error: detail };
    }
    if (!silent) message.success(`Đã tạo trang /p/${body.slug}`);
    return { ok: true, slug: body.slug, keyword: body.keyword, pageId: body.page_id, status: body.status, dupReason: body.dup_reason };
  };

  const runNext = async () => {
    setRunning(true);
    setJob({ active: true, keyword: '', completed: [], failed: null });
    const r = await generateOne(true);
    setRunning(false);
    if (r.ok) {
      setJob({ active: false, keyword: '', completed: [{ slug: r.slug, keyword: r.keyword, status: r.status, dupReason: r.dupReason }], failed: null });
      message.success(`Đã tạo trang /p/${r.slug}`);
    } else if (r.drained) {
      setJob({ active: false, keyword: '', completed: [], failed: null });
      message.info('Hàng đợi đang trống');
    } else {
      setJob({ active: false, keyword: '', completed: [], failed: r.error });
      message.error(r.error);
    }
    refresh();
  };

  const runBulk = async (n) => {
    setBulk({ running: true, done: 0, total: n });
    setJob({ active: true, keyword: '', completed: [], failed: null });
    const completed = [];
    for (let i = 0; i < n; i++) {
      const r = await generateOne(true);
      if (r.drained || r.ok === false) {
        setJob({ active: false, keyword: '', completed: [...completed], failed: r.ok === false ? r.error : null });
        break;
      }
      completed.push({ slug: r.slug, keyword: r.keyword, status: r.status, dupReason: r.dupReason });
      setJob((j) => ({ ...j, completed: [...completed] }));
      setBulk((b) => ({ ...b, done: i + 1 }));
    }
    setBulk({ running: false, done: 0, total: 0 });
    setJob((j) => (j.active ? { ...j, active: false } : j));
    refresh();
    message.success(`Đã tạo ${completed.length} trang`);
  };

  // ── columns ─────────────────────────────────────────────────────
  const columns = [
    { title: 'Từ khóa', dataIndex: 'keyword', key: 'keyword', ellipsis: true,
      render: (k) => <Text strong>{k}</Text> },
    { title: 'Ý định', dataIndex: 'intent', key: 'intent', width: 110,
      render: (i) => { const m = INTENT_META[i]; return m ? <Tag color={m.color}>{m.text}</Tag> : <Text type="secondary">—</Text>; } },
    { title: 'Điểm', dataIndex: 'score', key: 'score', width: 70,
      render: (s) => s != null ? <Tag color={s >= 60 ? 'green' : s >= 40 ? 'gold' : 'default'}>{s}</Tag> : '—' },
    { title: 'Ưu tiên', dataIndex: 'priority', key: 'priority', width: 150,
      render: (p, r) => {
        if (statusFilter === 'pending') {
          return (
            <Space size={2}>
              <Text style={{ width: 28, display: 'inline-block', textAlign: 'right' }}>{p ?? 0}</Text>
              <Tooltip title="Tăng ưu tiên +10"><Button size="small" type="text" icon={<ArrowUpOutlined />} onClick={() => patch(r.id, { priority: (p || 0) + 10 })} /></Tooltip>
              <Tooltip title="Giảm ưu tiên −10"><Button size="small" type="text" icon={<ArrowDownOutlined />} onClick={() => patch(r.id, { priority: (p || 0) - 10 })} /></Tooltip>
              <Tooltip title="Bỏ qua (đánh dấu thất bại)"><Button size="small" type="text" danger icon={<CloseOutlined />} onClick={() => patch(r.id, { status: 'failed' })} /></Tooltip>
            </Space>
          );
        }
        if (statusFilter === 'failed') {
          return (
            <Space size={2}>
              <Text style={{ width: 28, display: 'inline-block', textAlign: 'right' }}>{p ?? 0}</Text>
              <Tooltip title="Thử lại"><Button size="small" type="text" icon={<RedoOutlined />} onClick={() => patch(r.id, { status: 'pending' })} /></Tooltip>
            </Space>
          );
        }
        return p != null ? p : '—';
      } },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 120,
      render: (s) => { const m = STATUS_META[s] || STATUS_META.pending; return <Tag color={m.color}>{m.text}</Tag>; } },
    { title: 'Trang', key: 'page', width: 150, ellipsis: true,
      render: (_, r) => r.page_slug
        ? <a href={urlForProject(r.project_id, '/p/' + r.page_slug)} target="_blank" rel="noopener"><LinkOutlined /> /p/{r.page_slug}</a>
        : r.page_id ? <Text type="secondary"><LinkOutlined /> /p/…</Text> : <Text type="secondary">—</Text> },
    { title: 'Lỗi', dataIndex: 'error', key: 'error', ellipsis: true,
      render: (e) => e ? <Tooltip title={e}><Text type="danger" style={{ fontSize: 12 }} ellipsis>{e}</Text></Tooltip> : '—' },
  ];

  const previewColumns = [
    { title: 'Từ khóa', dataIndex: 'keyword', key: 'keyword', ellipsis: true },
    { title: 'Ý định', dataIndex: 'intent', key: 'intent', width: 110,
      render: (i) => { const m = INTENT_META[i]; return m ? <Tag color={m.color}>{m.text}</Tag> : '—'; } },
    { title: 'Điểm', dataIndex: 'score', key: 'score', width: 70,
      render: (s) => <Tag color={s >= 60 ? 'green' : s >= 40 ? 'gold' : 'default'}>{s}</Tag> },
  ];

  return (
    <PageContainer
      title="Programmatic SEO"
      description="Thu thập từ khóa và tạo trang SEO hàng loạt"
      breadcrumb={[{ title: 'Thương hiệu' }, { title: 'Programmatic SEO' }]}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading} />
          <Button icon={<PlusOutlined />} onClick={() => setPasteOpen(true)}>Dán danh sách</Button>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={running} disabled={bulk.running} onClick={runNext}>Tạo trang tiếp</Button>
        </Space>
      }
    >
      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Đang chờ" value={counts.pending} prefix={<FireOutlined style={{ color: '#faad14' }} />} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Đang xử lý" value={counts.processing} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Hoàn thành" value={counts.done} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Thất bại" value={counts.failed} valueStyle={{ color: counts.failed ? '#ff4d4f' : undefined }} /></Card></Col>
      </Row>

      {/* 1. Collect from Google Autocomplete */}
      <Card
        title={<Space><SearchOutlined /> Bước 1 · Thu thập từ khóa từ Google Autocomplete</Space>}
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          Nhập cụm từ khóa gốc — hệ thống lấy gợi ý tự động hoàn thành, chấm điểm và lọc trùng. Sau đó tick chọn các từ khóa cần đưa vào hàng đợi.
        </Text>
        <Row gutter={[8, 8]} style={{ marginTop: 12 }} align="middle">
          <Col xs={24} sm={12} md={16}>
            <Input
              size="large"
              placeholder="vd: báo bì nhựa"
              prefix={<SearchOutlined />}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              onPressEnter={pull}
            />
          </Col>
          <Col xs={12} sm={5} md={4}>
            <InputNumber size="large" min={1} max={200} value={limit} onChange={setLimit} addonAfter="từ" style={{ width: '100%' }} />
          </Col>
          <Col xs={24} sm={7} md={4}>
            <Button type="primary" size="large" block loading={pulling} icon={<SearchOutlined />} onClick={pull}>Thu thập</Button>
          </Col>
        </Row>

        {preview && (
          <div style={{ marginTop: 16 }}>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={`Bước 2 · Đã thu thập ${preview.length} từ khóa cho "${previewSeed}" — đã chọn sẵn tất cả`}
              description="Bỏ tick những từ không phù hợp, rồi bấm “Thêm vào hàng đợi”."
            />
            <Table
              dataSource={preview}
              columns={previewColumns}
              rowKey={(k) => k.canonical || k.keyword}
              size="small"
              pagination={{ pageSize: 10, showSizeChanger: false }}
              rowSelection={{
                selectedRowKeys: selectedKeywords,
                onChange: (keys) => setSelectedKeywords(keys),
                selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT, Table.SELECTION_NONE],
              }}
              locale={{ emptyText: 'Không có từ khóa nào vượt qua bộ lọc' }}
            />
            <Space style={{ marginTop: 12 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                loading={queueing}
                disabled={!selectedKeywords.length}
                onClick={queueSelected}
              >
                Thêm {selectedKeywords.length} từ khóa vào hàng đợi
              </Button>
              <Button onClick={() => { setPreview(null); setSelectedKeywords([]); }}>Đóng</Button>
            </Space>
          </div>
        )}
      </Card>

      {/* 2. Job — generating pages */}
      {(job.active || job.completed.length > 0 || job.failed) && (
        <Card
          title={<Space><PlayCircleOutlined /> Job tạo trang Programmatic SEO</Space>}
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Steps
            size="small"
            current={job.failed ? 2 : job.active ? 1 : 2}
            status={job.failed ? 'error' : job.active ? 'process' : 'finish'}
            items={[
              { title: 'Chọn từ khóa', description: `${job.completed.length + (job.active ? 1 : 0)} trong hàng đợi` },
              { title: 'Đang tạo trang', description: job.active ? 'AI viết nội dung + ảnh…' : 'Hoàn tất' },
              { title: 'Xuất bản', description: job.failed ? 'Có lỗi' : `${job.completed.length} trang` },
            ]}
          />
          {bulk.running && (
            <Progress
              percent={Math.round((bulk.done / bulk.total) * 100)}
              status="active"
              style={{ marginTop: 12 }}
              format={() => `${bulk.done}/${bulk.total}`}
            />
          )}
          {job.failed && <Alert type="error" showIcon style={{ marginTop: 12 }} message="Tạo trang thất bại" description={job.failed} />}
          {job.completed.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Trang đã tạo trong job này:</Text>
              <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 6 }}>
                {job.completed.map((p) => (
                  <Space key={p.slug}>
                    <CheckCircleOutlined style={{ color: p.status === 'hidden' ? '#faad14' : '#52c41a' }} />
                    <a href={urlForProject(activeProject?.id, '/p/' + p.slug)} target="_blank" rel="noopener">/p/{p.slug}</a>
                    {p.keyword && <Text type="secondary" style={{ fontSize: 12 }}>{p.keyword}</Text>}
                    {p.status === 'hidden' && <Tooltip title={p.dupReason}><Tag color="gold">ẩn · trùng</Tag></Tooltip>}
                  </Space>
                ))}
              </Space>
            </div>
          )}
        </Card>
      )}

      {/* 3. Queue */}
      <Card
        title={<Space><FireOutlined /> Hàng đợi từ khóa</Space>}
        size="small"
        extra={
          <Space>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 170 }}
              options={[
                { value: 'pending', label: `Đang chờ (${counts.pending})` },
                { value: 'processing', label: `Đang xử lý (${counts.processing})` },
                { value: 'done', label: `Hoàn thành (${counts.done})` },
                { value: 'failed', label: `Thất bại (${counts.failed})` },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading} />
          </Space>
        }
      >
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          scroll={{ x: 900 }}
          locale={{ emptyText: `Không có từ khóa ${STATUS_META[statusFilter]?.text?.toLowerCase() || ''}` }}
        />
      </Card>

      {/* 4. Generated pages */}
      <Card
        title={<Space><LinkOutlined /> Trang Programmatic SEO đã tạo ({generatedPages.length})</Space>}
        size="small"
        style={{ marginTop: 16 }}
      >
        {generatedPages.length === 0 ? (
          <Text type="secondary">Chưa có trang nào. Chạy job tạo trang để bắt đầu.</Text>
        ) : (
          <Row gutter={[16, 16]}>
            {generatedPages.map((p) => {
              const href = urlForProject(p.project_id, '/p/' + (p.page_slug || ''));
              return (
                <Col xs={24} sm={12} lg={8} xl={6} key={p.id}>
                  <Card
                    size="small"
                    hoverable
                    cover={
                      p.page_image_key
                        ? <img src={`/image/${p.page_image_key}`} alt={p.page_title || p.keyword} loading="lazy" style={{ height: 140, objectFit: 'cover' }} />
                        : <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.03)' }}><LinkOutlined style={{ fontSize: 28, color: '#bfbfbf' }} /></div>
                    }
                  >
                    <Card.Meta
                      title={
                        <Space size={4}>
                          {p.page_status === 'hidden' ? <Tag color="gold" style={{ margin: 0 }}>ẩn</Tag> : <Tag color="green" style={{ margin: 0 }}>đã đăng</Tag>}
                          <a href={href} target="_blank" rel="noopener" style={{ fontSize: 13 }}>{(p.page_title || p.keyword || '').slice(0, 40)}</a>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={2} style={{ width: '100%' }}>
                          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>{p.keyword}</Text>
                          <Text code style={{ fontSize: 11 }} ellipsis>/p/{p.page_slug}</Text>
                        </Space>
                      }
                    />
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Card>

      {/* 5. Bulk generate */}
      <Card title={<Space><ThunderboltOutlined /> Tạo trang hàng loạt</Space>} size="small" style={{ marginTop: 16 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Mỗi trang mất ~60-120 giây. Cron tự động tạo 10 trang/ngày — dùng nút dưới để đẩy nhanh thủ công.
        </Text>
        {bulk.running && (
          <Progress
            percent={Math.round((bulk.done / bulk.total) * 100)}
            status="active"
            style={{ marginTop: 12 }}
            format={() => `${bulk.done}/${bulk.total}`}
          />
        )}
        <Space style={{ marginTop: 12 }}>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={running} disabled={bulk.running} onClick={runNext}>Tạo trang tiếp</Button>
          <Popconfirm
            title="Tạo 5 trang liên tiếp?"
            description="Mỗi trang mất 60-120s. Không đóng tab trong lúc chạy."
            onConfirm={() => runBulk(5)}
          >
            <Button icon={<ThunderboltOutlined />} disabled={bulk.running || !counts.pending}>Tạo 5 trang</Button>
          </Popconfirm>
          <Popconfirm
            title="Tạo 10 trang liên tiếp?"
            description="Mỗi trang mất 60-120s. Không đóng tab trong lúc chạy."
            onConfirm={() => runBulk(10)}
          >
            <Button icon={<ThunderboltOutlined />} disabled={bulk.running || !counts.pending}>Tạo 10 trang</Button>
          </Popconfirm>
        </Space>
      </Card>

      {/* Paste modal */}
      <Modal title="Dán danh sách từ khóa" open={pasteOpen} onCancel={() => setPasteOpen(false)} onOk={() => pasteForm.submit()} width={560}>
        <Form form={pasteForm} layout="vertical" onFinish={onPaste}>
          <Form.Item name="keywords" label="Mỗi dòng 1 keyword — sẽ được chấm điểm & lọc trùng tự động" rules={[{ required: true }]}>
            <Input.TextArea rows={10} placeholder={'cách tối ưu seo\ntop 10 công cụ seo\n...'} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
