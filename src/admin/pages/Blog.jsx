// Blog page — antd Table, Button, Modal, Tag, Steps, Spin, message, Empty, Card.
import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Button, Table, Tag, Steps, Spin, message, Empty, Space, Typography, Modal, Input, Tooltip, Popconfirm } from 'antd';
import { PlusOutlined, SyncOutlined, FileTextOutlined, PictureOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, ReloadOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost } from '../api.js';
import { useProjectUrl } from '../lib/projectUrl.js';

const { Text, Paragraph } = Typography;

const STATUS_TAG = {
  published: { color: 'success', icon: <CheckCircleOutlined />, text: 'Đã xuất bản' },
  text_done: { color: 'processing', icon: <ClockCircleOutlined />, text: 'Đã viết xong' },
  image_done: { color: 'processing', icon: <PictureOutlined />, text: 'Đã có hình' },
  created: { color: 'default', icon: <ClockCircleOutlined />, text: 'Đang tạo' },
  failed: { color: 'error', icon: <ExclamationCircleOutlined />, text: 'Thất bại' },
  review: { color: 'warning', icon: <ExclamationCircleOutlined />, text: 'Cần duyệt' },
  hidden: { color: 'default', icon: <EyeInvisibleOutlined />, text: 'Đang ẩn' },
};

export default function Blog() {
  const { projectUrl, urlForProject } = useProjectUrl();
  const [posts, setPosts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [chainState, setChainState] = useState({ running: false, step: -1, log: [], error: null });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshJobs, setRefreshJobs] = useState([]);

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    const { status, body } = await apiGet('/api/admin/blog/list');
    if (status === 200) setPosts(body.posts || []);
    setLoadingPosts(false);
  }, []);

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    const { status, body } = await apiGet('/api/admin/blog/jobs');
    if (status === 200) setJobs(body.jobs || []);
    setLoadingJobs(false);
  }, []);

  useEffect(() => { loadPosts(); loadJobs(); }, [loadPosts, loadJobs]);

  const runChain = async () => {
    setChainState({ running: true, step: 0, log: [], error: null });
    const log = [];
    try {
      log.push('1/4 chọn chủ đề...');
      setChainState((s) => ({ ...s, step: 0, log: [...log] }));
      const start = await apiPost('/api/admin/blog/start', {});
      const jobId = start.body?.job_id;
      if (!jobId) throw new Error(start.body?.error || 'start failed');
      log.push(`job_id: ${jobId}`);

      log.push('2/4 viết bài...');
      setChainState((s) => ({ ...s, step: 1, log: [...log] }));
      const text = await apiPost('/api/admin/blog/text', { job_id: jobId });
      if (text.status !== 200) throw new Error(text.body?.error || 'text failed');
      log.push(`tiêu đề: ${text.body.title}`);

      log.push('3/4 tạo hình ảnh...');
      setChainState((s) => ({ ...s, step: 2, log: [...log] }));
      const img = await apiPost('/api/admin/blog/image', { job_id: jobId });
      if (img.status !== 200) throw new Error(img.body?.error || 'image failed');

      log.push('4/4 xuất bản...');
      setChainState((s) => ({ ...s, step: 3, log: [...log] }));
      const pub = await apiPost('/api/admin/blog/publish', { job_id: jobId });
      if (pub.status !== 200) throw new Error(pub.body?.error || 'publish failed');
      log.push(`Đã xuất bản: ${projectUrl('/blog/' + pub.body.slug)}`);

      setChainState({ running: false, step: 4, log, error: null });
      message.success('Bài viết đã xuất bản!');
      loadPosts(); loadJobs();
    } catch (e) {
      log.push('lỗi: ' + e.message);
      setChainState({ running: false, step: -1, log, error: e.message });
      message.error('Thất bại: ' + e.message);
    }
  };

  const runRefreshScan = async () => {
    setRefreshing(true);
    const { status, body } = await apiPost('/api/admin/refresh/scan', { limit: 10 });
    if (status === 200 && body?.ok) {
      setRefreshJobs(body.jobs || []);
      message.info(`Tìm thấy ${body.count || 0} bài cần refresh.`);
    } else {
      message.error(body?.error || 'Scan failed');
    }
    setRefreshing(false);
  };

  const refreshOne = async (jobId, idx) => {
    const r = await apiPost('/api/admin/refresh/run', { job_id: jobId });
    if (r.status === 200 && r.body?.ok) {
      setRefreshJobs((jobs) => jobs.map((j, i) => i === idx ? { ...j, done: true } : j));
      message.success('Đã refresh.');
      loadPosts();
    } else {
      message.error(r.body?.error || 'Refresh failed');
    }
  };

  const toggleVisibility = async (post) => {
    const action = post.status === 'hidden' ? 'show' : 'hide';
    const r = await apiPost('/api/admin/blog/post', { id: post.id, action });
    if (r.status === 200 && r.body?.ok) {
      message.success(action === 'hide' ? 'Đã ẩn bài viết.' : 'Đã hiện bài viết.');
      loadPosts();
    } else {
      message.error(r.body?.error || 'Đổi trạng thái thất bại.');
    }
  };

  const postColumns = [
    { title: 'Tiêu đề', dataIndex: 'title', key: 'title', ellipsis: true,
      render: (text, r) => <a href={urlForProject(r.project_id, '/blog/' + r.slug)} target="_blank" rel="noopener">{text}</a> },
    { title: 'Slug', dataIndex: 'slug', key: 'slug', ellipsis: true, render: (s) => <Text code>{s}</Text> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 120,
      render: (s) => { const t = STATUS_TAG[s] || STATUS_TAG.created; return <Tag color={t.color} icon={t.icon}>{t.text}</Tag>; } },
    { title: 'Ngày', dataIndex: 'published_at', key: 'published_at', width: 120,
      render: (t) => t ? new Date(t * 1000).toLocaleDateString('vi-VN') : '-' },
    { title: 'Thao tác', key: 'action', width: 110,
      render: (_, r) => (
        <Button size="small" icon={r.status === 'hidden' ? <EyeOutlined /> : <EyeInvisibleOutlined />} onClick={() => toggleVisibility(r)}>
          {r.status === 'hidden' ? 'Hiện' : 'Ẩn'}
        </Button>
      ) },
  ];

  const jobColumns = [
    { title: 'Topic', dataIndex: 'topic_key', key: 'topic_key', ellipsis: true },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 120,
      render: (s) => { const t = STATUS_TAG[s] || STATUS_TAG.created; return <Tag color={t.color} icon={t.icon}>{t.text}</Tag>; } },
    { title: 'Lỗi', dataIndex: 'error', key: 'error', ellipsis: true,
      render: (e) => e ? <Text type="danger" ellipsis={{ tooltip: e }}>{e}</Text> : '-' },
    { title: 'Tạo lúc', dataIndex: 'created_at', key: 'created_at', width: 120,
      render: (t) => new Date(t * 1000).toLocaleString('vi-VN') },
  ];

  return (
    <PageContainer
      title="Blog hàng ngày"
      description="Tạo và quản lý bài viết blog tự động"
      breadcrumb={[{ title: 'Bài viết' }, { title: 'Blog' }]}
    >
      <Row gutter={[16, 16]}>
        {/* Create */}
        <Col xs={24} lg={12}>
          <Card title={<><PlusOutlined /> Tạo bài viết mới</>} size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button type="primary" size="large" block icon={<FileTextOutlined />} loading={chainState.running} onClick={runChain}>
                Tạo ngay
              </Button>
              {chainState.running && (
                <Steps
                  size="small"
                  current={chainState.step}
                  items={[
                    { title: 'Chủ đề' },
                    { title: 'Viết bài' },
                    { title: 'Hình ảnh' },
                    { title: 'Xuất bản' },
                  ]}
                />
              )}
              {chainState.log.length > 0 && (
                <pre style={{ background: 'rgba(0,0,0,0.04)', padding: 12, borderRadius: 8, fontSize: 12, maxHeight: 200, overflow: 'auto', margin: 0 }}>
                  {chainState.log.join('\n')}
                </pre>
              )}
              {chainState.error && <Text type="danger">{chainState.error}</Text>}
            </Space>
          </Card>
        </Col>

        {/* Refresh */}
        <Col xs={24} lg={12}>
          <Card title={<><SyncOutlined /> Cập nhật bài viết cũ</>} size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button block icon={<ReloadOutlined />} loading={refreshing} onClick={runRefreshScan}>Quét bài viết cũ</Button>
              {refreshJobs.length === 0 ? (
                <Empty description="Chưa quét" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                refreshJobs.map((j, i) => (
                  <Card key={i} size="small" style={{ background: 'rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text ellipsis style={{ flex: 1 }}>{j.title || j.slug}</Text>
                      {j.done ? <Tag color="success">Xong</Tag> : (
                        <Button size="small" onClick={() => refreshOne(j.job_id, i)}>Refresh</Button>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </Space>
          </Card>
        </Col>

        {/* Jobs table */}
        <Col xs={24}>
          <Card title="Bản nháp & thất bại" size="small" extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadJobs} loading={loadingJobs} />}>
            <Table
              dataSource={jobs}
              columns={jobColumns}
              rowKey="id"
              size="small"
              loading={loadingJobs}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              locale={{ emptyText: 'Không có job nào' }}
            />
          </Card>
        </Col>

        {/* Published posts */}
        <Col xs={24}>
          <Card title="Bài viết đã xuất bản" size="small" extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadPosts} loading={loadingPosts} />}>
            <Table
              dataSource={posts}
              columns={postColumns}
              rowKey="id"
              size="small"
              loading={loadingPosts}
              pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }}
              locale={{ emptyText: 'Chưa có bài viết nào' }}
            />
          </Card>
        </Col>
      </Row>
    </PageContainer>
  );
}
