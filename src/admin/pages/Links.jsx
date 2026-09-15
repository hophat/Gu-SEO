// Links page — antd Table, Card, Button, Tag, Modal, Form, Input, Tabs.
// API: /api/admin/aliases (GET/POST/PATCH/DELETE), /api/admin/aliases/sync
// Aliases are global site shortcuts the LLM uses. Three kinds:
//   - reserved: blog/home/rss/sitemap (read-only)
//   - manual: operator-curated (full CRUD)
//   - sitemap: auto-imported from published blog/prog pages
//
// URLs are stored root-relative (/blog/<slug>) but projects are served
// under /<project-slug>/. We prepend the project base path when displaying.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Table, Button, Tag, Space, Typography, message, Modal, Form, Input, Empty, Popconfirm, Row, Col, Statistic, Tabs, Tooltip, Alert } from 'antd';
import { PlusOutlined, ReloadOutlined, LinkOutlined, DeleteOutlined, EditOutlined, SyncOutlined, LockOutlined, GlobalOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost, api } from '../api.js';
import { useAuth, useProjects } from '../hooks/useTheme.jsx';
import { useProjectUrl, projectBasePath, projectHref } from '../lib/projectUrl.js';

const { Text } = Typography;

const KIND_TAG = {
  reserved: { color: 'default', text: 'Mặc định' },
  manual:   { color: 'blue',    text: 'Tùy chỉnh' },
  sitemap:  { color: 'green',   text: 'Sitemap' },
};

export default function Links() {
  const { user } = useAuth();
  const { activeProject } = useProjects();
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/aliases');
    if (status === 200 && body?.ok) setAliases(body.aliases || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Compute project base path for URL display
  const basePath = useMemo(() => projectBasePath(activeProject), [activeProject]);

  // Build the correct href for the active project (custom domain → absolute,
  // shared host → /<slug>/…).
  const displayUrl = useCallback((url) => projectHref(activeProject, url), [activeProject]);

  const manualAliases = aliases.filter((a) => a.kind === 'manual' || a.kind === 'reserved');
  const sitemapAliases = aliases.filter((a) => a.kind === 'sitemap');

  const sync = async () => {
    setSyncing(true);
    const { status, body } = await apiPost('/api/admin/aliases/sync', {});
    if (status === 200) {
      message.success(`Đã đồng bộ: thêm ${body.added || 0}, xóa ${body.removed || 0} (tổng ${body.total || 0})`);
      load();
    } else message.error(body?.error || 'Lỗi');
    setSyncing(false);
  };

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (a) => {
    setEditing(a);
    form.setFieldsValue({ name: a.name, url: a.url, description: a.description || '' });
    setModalOpen(true);
  };

  const onSubmit = async (values) => {
    if (editing) {
      const r = await api('/api/admin/aliases', { method: 'PATCH', body: JSON.stringify({ name: editing.name, url: values.url, description: values.description }) });
      if (r.status === 200) { message.success('Đã cập nhật'); setModalOpen(false); load(); }
      else message.error(r.body?.detail || r.body?.error || 'Lỗi');
    } else {
      const r = await apiPost('/api/admin/aliases', { name: values.name, url: values.url, description: values.description });
      if (r.status === 200) { message.success('Đã thêm alias'); setModalOpen(false); load(); }
      else message.error(r.body?.detail || r.body?.error || 'Lỗi');
    }
  };

  const deleteAlias = async (name) => {
    const r = await api(`/api/admin/aliases?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (r.status === 200) { message.success('Đã xóa'); load(); }
    else message.error(r.body?.error || 'Lỗi');
  };

  const manualColumns = [
    { title: 'Tên', dataIndex: 'name', key: 'name', width: 140,
      render: (n, r) => (
        <Space>
          <Text code>{n}</Text>
          {r.kind === 'reserved' && <LockOutlined style={{ color: '#00000045', fontSize: 12 }} />}
        </Space>
      ) },
    { title: 'URL lưu', dataIndex: 'url', key: 'url-stored', width: 180, ellipsis: true,
      render: (u) => <Text code style={{ fontSize: 12 }}>{u}</Text> },
    { title: 'URL thực tế', key: 'url-full', ellipsis: true,
      render: (_, r) => {
        const full = displayUrl(r.url);
        const tag = activeProject?.custom_domain
          ? { color: 'green', text: activeProject.custom_domain }
          : (basePath && full !== r.url ? { color: 'blue', text: basePath } : null);
        return (
          <Space>
            <a href={full} target="_blank" rel="noopener">{full}</a>
            {tag && <Tag color={tag.color} style={{ fontSize: 10 }}>{tag.text}</Tag>}
          </Space>
        );
      } },
    { title: 'Mô tả', dataIndex: 'description', key: 'desc', ellipsis: true,
      render: (d) => d ? <Text type="secondary">{d}</Text> : '-' },
    { title: 'Loại', dataIndex: 'kind', key: 'kind', width: 100,
      render: (k) => { const t = KIND_TAG[k] || KIND_TAG.manual; return <Tag color={t.color}>{t.text}</Tag>; } },
    { title: '', key: 'actions', width: 80,
      render: (_, r) => r.kind === 'manual' ? (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title={`Xóa alias "${r.name}"?`} onConfirm={() => deleteAlias(r.name)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ) : null,
    },
  ];

  const sitemapColumns = [
    { title: 'URL lưu', dataIndex: 'url', key: 'url-stored', width: 180, ellipsis: true,
      render: (u) => <Text code style={{ fontSize: 12 }}>{u}</Text> },
    { title: 'URL thực tế', key: 'url-full', ellipsis: true,
      render: (_, r) => {
        const full = displayUrl(r.url);
        const tag = activeProject?.custom_domain
          ? { color: 'green', text: activeProject.custom_domain }
          : (basePath && full !== r.url ? { color: 'blue', text: basePath } : null);
        return (
          <Space>
            <a href={full} target="_blank" rel="noopener">{full}</a>
            {tag && <Tag color={tag.color} style={{ fontSize: 10 }}>{tag.text}</Tag>}
          </Space>
        );
      } },
    { title: 'Mô tả', dataIndex: 'description', key: 'desc', ellipsis: true,
      render: (d) => d ? <Text type="secondary">{d}</Text> : '-' },
    { title: 'Loại', dataIndex: 'kind', key: 'kind', width: 100,
      render: () => <Tag color="green">Sitemap</Tag> },
  ];

  return (
    <PageContainer
      title="Internal Links"
      description="Alias liên kết nội bộ — dạy AI cách liên kết tới các trang"
      breadcrumb={[{ title: 'Thương hiệu' }, { title: 'Internal Links' }]}
      extra={
        <Space>
          <Button icon={<SyncOutlined />} loading={syncing} onClick={sync}>Đồng bộ sitemap</Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm alias</Button>
        </Space>
      }
    >
      {/* Project path info banner */}
      {activeProject && (
        <Alert
          type="info"
          showIcon
          icon={<GlobalOutlined />}
          style={{ marginBottom: 16 }}
          message={
            <Space>
              <Text>Liên kết hiển thị cho dự án: </Text>
              <Text strong>{activeProject.site_name || activeProject.slug}</Text>
              {basePath ? (
                <Tag color="blue">Đường dẫn: {basePath}/</Tag>
              ) : (
                <Tag color="green">Domain riêng: {activeProject.custom_domain || 'root'}</Tag>
              )}
            </Space>
          }
          description={
            basePath
              ? 'URL lưu là root-relative (/blog/...), URL thực tế đã thêm tiền tố dự án để truy cập đúng.'
              : 'Dự án dùng domain riêng — URL lưu và URL thực tế giống nhau.'
          }
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={8}><Card><Statistic title="Tùy chỉnh" value={manualAliases.filter((a) => a.kind === 'manual').length} prefix={<EditOutlined />} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col xs={8}><Card><Statistic title="Mặc định" value={manualAliases.filter((a) => a.kind === 'reserved').length} prefix={<LockOutlined />} /></Card></Col>
        <Col xs={8}><Card><Statistic title="Sitemap" value={sitemapAliases.length} prefix={<LinkOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Tabs items={[
        {
          key: 'manual',
          label: `Liên kết tùy chỉnh (${manualAliases.length})`,
          children: (
            <Card>
              <Table
                dataSource={manualAliases}
                columns={manualColumns}
                rowKey="name"
                loading={loading}
                pagination={{ pageSize: 15 }}
                locale={{ emptyText: 'Chưa có alias tùy chỉnh. Nhấn "Thêm alias" để dạy AI về trang của bạn.' }}
                scroll={{ x: 800 }}
              />
            </Card>
          ),
        },
        {
          key: 'sitemap',
          label: `Liên kết từ sitemap (${sitemapAliases.length})`,
          children: (
            <Card>
              <Table
                dataSource={sitemapAliases}
                columns={sitemapColumns}
                rowKey="name"
                loading={loading}
                pagination={{ pageSize: 20 }}
                locale={{ emptyText: 'Chưa có liên kết từ sitemap. Nhấn "Đồng bộ sitemap" sau khi xuất bản bài viết.' }}
                scroll={{ x: 600 }}
              />
            </Card>
          ),
        },
      ]} />

      <Modal title={editing ? 'Sửa alias' : 'Thêm alias'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} width={520}>
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item name="name" label="Tên (a-z0-9-_, tối đa 40 ký tự)" rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9_-]{0,40}$/ }]}>
            <Input placeholder="my-shop" disabled={!!editing} />
          </Form.Item>
          <Form.Item
            name="url"
            label="URL (root-relative, tự thêm tiền tố dự án)"
            rules={[{ required: true }]}
            extra={basePath ? `Sẽ hiển thị: ${basePath}/<url>` : 'URL tuyệt đối hoặc root-relative'}
          >
            <Input placeholder="/blog/example hoặc https://..." />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input placeholder="Trang chủ" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
