// Users page — antd Table, Modal, Form, Button, Tag, Popconfirm.
import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Tag, Popconfirm, Space, Typography, message } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost, api } from '../api.js';

const { Text } = Typography;

const ROLE_TAG = {
  super_admin: { color: 'purple', text: 'Super Admin' },
  project_admin: { color: 'blue', text: 'Project Admin' },
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/users');
    if (status === 200) setUsers(body.users || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (user) => {
    setEditing(user);
    form.setFieldsValue(user);
    setModalOpen(true);
  };

  const onSubmit = async (values) => {
    if (editing) {
      const r = await api(`/api/admin/users/${editing.id}`, { method: 'PUT', body: JSON.stringify(values) });
      if (r.status === 200) { message.success('Đã cập nhật'); setModalOpen(false); load(); }
      else message.error(r.body?.error || 'Lỗi');
    } else {
      const r = await apiPost('/api/admin/users', values);
      if (r.status === 200) { message.success('Đã tạo user'); setModalOpen(false); load(); }
      else message.error(r.body?.error || 'Lỗi');
    }
  };

  const deleteUser = async (id) => {
    const r = await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (r.status === 200) { message.success('Đã xóa'); load(); }
    else message.error(r.body?.error || 'Lỗi');
  };

  const columns = [
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Role', dataIndex: 'role', key: 'role', width: 140,
      render: (r) => { const t = ROLE_TAG[r] || { color: 'default', text: r }; return <Tag color={t.color}>{t.text}</Tag>; } },
    { title: 'Project', dataIndex: 'project_id', key: 'project_id', width: 140, render: (p) => p ? <Text code>{p}</Text> : '-' },
    { title: 'Tạo lúc', dataIndex: 'created_at', key: 'created_at', width: 140,
      render: (t) => t ? new Date(t * 1000).toLocaleDateString('vi-VN') : '-' },
    { title: '', key: 'actions', width: 100,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Xóa user này?" onConfirm={() => deleteUser(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title="Người dùng"
      description="Quản lý tài khoản admin"
      breadcrumb={[{ title: 'Người dùng' }]}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Tạo user</Button>
        </Space>
      }
    >
      <Card>
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Chưa có user nào' }}
        />
      </Card>

      <Modal
        title={editing ? 'Sửa user' : 'Tạo user mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          {!editing && (
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
              <Input />
            </Form.Item>
          )}
          {!editing && (
            <Form.Item name="password" label="Mật khẩu" rules={[{ required: true }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={[{ value: 'super_admin', label: 'Super Admin' }, { value: 'project_admin', label: 'Project Admin' }]} />
          </Form.Item>
          <Form.Item name="project_id" label="Project ID (cho Project Admin)">
            <Input placeholder="proj_xxx" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
