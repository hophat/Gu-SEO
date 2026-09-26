// Projects page — the super-admin tenant list.
import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Space, Statistic, Row, Col, Typography, message, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined, ProjectOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost, api } from '../api.js';

const { Text } = Typography;

// This is the super-admin console, so the labels stay in English. The tones
// still come from lib/status.js so a state looks the same everywhere.
const PROJECT_STATUS = {
  active: { tone: 'good', text: 'Active' },
  paused: { tone: 'warn', text: 'Paused' },
  archived: { tone: 'muted', text: 'Archived' },
};

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/projects');
    if (status === 200) setProjects(body.projects || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (p) => { setEditing(p); form.setFieldsValue(p); setModalOpen(true); };

  const onSubmit = async (values) => {
    if (editing) {
      const r = await api(`/api/admin/projects/${editing.id}`, { method: 'PUT', body: JSON.stringify(values) });
      if (r.status === 200) { message.success('Đã cập nhật'); setModalOpen(false); load(); }
      else message.error(r.body?.error || 'Lỗi');
    } else {
      const r = await apiPost('/api/admin/projects', values);
      if (r.status === 200) { message.success('Đã tạo project'); setModalOpen(false); load(); }
      else message.error(r.body?.error || 'Lỗi');
    }
  };

  const columns = [
    { title: 'Site', dataIndex: 'site_name', key: 'site_name',
      render: (name, r) => {
        const href = r.custom_domain ? `https://${r.custom_domain}/blog` : `/${r.slug}/blog`;
        return <a href={href} target="_blank">{name || r.slug}</a>;
      } },
    { title: 'Slug', dataIndex: 'slug', key: 'slug', render: (s) => <Text code>{s}</Text> },
    { title: 'Domain', dataIndex: 'custom_domain', key: 'custom_domain',
      render: (d) => d ? <span className="ps-chip ps-chip--plain">{d}</span> : <Text type="secondary">—</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s) => {
        const t = PROJECT_STATUS[s] || PROJECT_STATUS.active;
        return <span className={`ps-chip ps-chip--${t.tone}`}>{t.text}</span>;
      } },
    { title: 'Mode', dataIndex: 'approval_mode', key: 'approval_mode', width: 100,
      render: (m) => <span className="ps-chip ps-chip--plain">{m === 'approval' ? 'Duyệt' : 'Auto'}</span> },
    { title: '', key: 'actions', width: 100,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title="Dự án"
      description="Quản lý dự án SaaS multi-tenant"
      breadcrumb={[{ title: 'Dự án' }]}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Tạo dự án</Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={8}><Card><Statistic title="Tổng dự án" value={projects.length} prefix={<ProjectOutlined />} /></Card></Col>
        <Col xs={8}><Card><Statistic title="Active" value={projects.filter((p) => p.status === 'active').length} /></Card></Col>
        <Col xs={8}><Card><Statistic title="Có domain riêng" value={projects.filter((p) => p.custom_domain).length} /></Card></Col>
      </Row>

      <Card>
        <Table
          dataSource={projects}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Chưa có dự án' }}
        />
      </Card>

      <Modal
        title={editing ? 'Sửa dự án' : 'Tạo dự án mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item name="site_name" label="Tên site"><Input /></Form.Item>
          <Form.Item name="slug" label="Slug" rules={[{ required: true }]}><Input placeholder="my-project" /></Form.Item>
          <Form.Item name="custom_domain" label="Custom domain"><Input placeholder="blog.example.com" /></Form.Item>
          <Form.Item name="status" label="Status">
            <Select options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'archived', label: 'Archived' }]} />
          </Form.Item>
          <Form.Item name="approval_mode" label="Approval mode">
            <Select options={[{ value: 'auto', label: 'Auto publish' }, { value: 'approval', label: 'Require approval' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
