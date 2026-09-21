// Covers page — mounts the legacy Canva-style cover editor and keeps a
// template manager alongside it. The editor itself lives in
// /cover-editor.js (vanilla JS) and is loaded on demand.
import { useState, useEffect, useCallback } from 'react';
import { Card, Tabs, Alert, Button, Table, Tag, Space, Typography, message, Modal, Form, Input, Select, Popconfirm, Statistic, Row, Col } from 'antd';
import { PlusOutlined, ReloadOutlined, PictureOutlined, DeleteOutlined, EditOutlined, WarningOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import CoverEditor from '../components/CoverEditor.jsx';
import { apiGet, apiPost, api } from '../api.js';

const { Text } = Typography;

// A template is only useful if it can paint something. A spec with no
// background and no layers renders as a black rectangle with no text —
// the bug users reported. The create form used to POST `spec: {}`,
// which persisted exactly that.
function isRenderableSpec(spec) {
  if (!spec || typeof spec !== 'object') return false;
  if (spec.background && spec.background.url) return true;
  return Array.isArray(spec.layers) && spec.layers.length > 0;
}

// Editorial starter card, mirrored from the server's fallback cover
// spec (functions/_lib/cover_svg.js). New templates start from this so
// they render a real branded cover before the operator designs them in
// the editor.
const STARTER_COVER_SPEC = {
  width: 1200,
  height: 630,
  background: null,
  layers: [
    { id: 'bg', kind: 'box', x: 0, y: 0, w: 1200, h: 630, fill: '#0a0c10', radius: 0 },
    { id: 'rule', kind: 'box', x: 80, y: 60, w: 200, h: 2, fill: '#d4af62', radius: 0 },
    { id: 'eyebrow', kind: 'text', x: 80, y: 80, w: 700, h: 30, text: '{brand.name|upper}',
      size: 22, family: '"JetBrains Mono", monospace', weight: '600', align: 'left', color: '#d4af62' },
    { id: 'title', kind: 'text', x: 80, y: 280, w: 1040, h: 240, text: '{title}',
      size: 76, family: '"Playfair Display", Georgia, serif', weight: '700', align: 'left', color: '#f5f0e6' },
    { id: 'sig', kind: 'text', x: 80, y: 560, w: 600, h: 30, text: '{pub_date|date:long} · {reading_time}',
      size: 16, family: '"JetBrains Mono", monospace', weight: '400', align: 'left', color: 'rgba(245,245,230,0.55)' },
  ],
};

export default function Covers() {
  const [heroMode, setHeroMode] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/cover/templates');
    if (status === 200 && body?.ok) setTemplates(body.templates || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTemplates();
    apiGet('/api/admin/settings').then(({ status, body }) => {
      if (status === 200) setHeroMode(body?.settings?.hero_image_mode || body?.hero_image_mode || 'ai');
    }).catch(() => setHeroMode('ai'));
  }, [loadTemplates]);

  const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (t) => { setEditing(t); form.setFieldsValue({ name: t.name, is_default: t.is_default }); setModalOpen(true); };

  const onSubmit = async (values) => {
    if (editing) {
      const r = await api(`/api/admin/cover/templates?id=${editing.id}`, { method: 'PUT', body: JSON.stringify(values) });
      if (r.status === 200) { message.success('Đã cập nhật'); setModalOpen(false); loadTemplates(); }
      else message.error(r.body?.error || 'Lỗi');
    } else {
      // Start from the existing default's design when it's usable, else
      // the editorial starter. Never `{}` — an empty spec renders as a
      // black, textless cover if it becomes the default.
      const currentDefault = templates.find((t) => t.is_default && isRenderableSpec(t.spec));
      const spec = currentDefault ? currentDefault.spec : STARTER_COVER_SPEC;
      const r = await apiPost('/api/admin/cover/templates', { ...values, spec });
      if (r.status === 200) { message.success('Đã tạo template'); setModalOpen(false); loadTemplates(); }
      else message.error(r.body?.error || 'Lỗi');
    }
  };

  const deleteTemplate = async (id) => {
    const r = await api(`/api/admin/cover/templates?id=${id}`, { method: 'DELETE' });
    if (r.status === 200) { message.success('Đã xóa'); loadTemplates(); }
    else message.error(r.body?.error || 'Lỗi');
  };

  const columns = [
    { title: 'Tên', dataIndex: 'name', key: 'name',
      render: (name, r) => (
        <Space size={6}>
          {name}
          {!isRenderableSpec(r.spec) && (
            <Tag color="red" icon={<WarningOutlined />} title="Template trống — sẽ hiển thị ảnh bìa đen nếu đặt làm mặc định">Trống</Tag>
          )}
        </Space>
      ) },

    { title: 'Mặc định', dataIndex: 'is_default', key: 'default', width: 110,
      render: (d) => d ? <Tag color="blue">Mặc định</Tag> : '-' },
    { title: 'Cập nhật', dataIndex: 'updated_at', key: 'updated', width: 120,
      render: (t) => t ? new Date(t * 1000).toLocaleDateString('vi-VN') : '-' },
    { title: '', key: 'actions', width: 100,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Xóa template?" onConfirm={() => deleteTemplate(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const frozen = heroMode !== null && heroMode !== 'cover';

  return (
    <PageContainer
      title="Cover Editor"
      description="Thiết kế ảnh bìa bằng AI hoặc chỉnh sửa thủ công"
      breadcrumb={[{ title: 'Thương hiệu' }, { title: 'Cover Editor' }]}
    >
      {frozen && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message="Trình chỉnh sửa ảnh bìa đang ở chế độ chỉ đọc"
          description={
            <span>
              Trang web đang dùng <b>hình ảnh do AI tạo</b> làm ảnh bìa blog. Để dùng trình chỉnh sửa,
              chuyển chế độ trong <a href="#settings">Cài đặt → Chế độ tạo ảnh bìa</a>.
            </span>
          }
        />
      )}

      <Tabs
        defaultActiveKey="editor"
        items={[
          {
            key: 'editor',
            label: 'Trình chỉnh sửa',
            children: <CoverEditor />,
          },
          {
            key: 'templates',
            label: `Templates (${templates.length})`,
            children: (
              <Card>
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col xs={12}><Card size="small"><Statistic title="Templates" value={templates.length} prefix={<PictureOutlined />} /></Card></Col>
                  <Col xs={12}><Card size="small"><Statistic title="Mặc định" value={templates.filter((t) => t.is_default).length} /></Card></Col>
                </Row>
                <Space style={{ marginBottom: 12 }}>
                  <Button icon={<ReloadOutlined />} onClick={loadTemplates} loading={loading}>Tải lại</Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Tạo template</Button>
                </Space>
                <Table
                  dataSource={templates}
                  columns={columns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                  locale={{ emptyText: 'Chưa có template' }}
                />
              </Card>
            ),
          },
        ]}
      />

      <Modal title={editing ? 'Sửa template' : 'Tạo cover template'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item name="name" label="Tên template" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="is_default" label="Đặt làm mặc định">
            <Select options={[{ value: false, label: 'Không' }, { value: true, label: 'Có' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
