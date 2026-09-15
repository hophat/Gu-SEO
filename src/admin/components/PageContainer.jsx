// Shared page wrapper — title, description, breadcrumb, actions.
import { Typography, Space, Breadcrumb } from 'antd';
import { HomeOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function PageContainer({ title, description, breadcrumb, extra, children }) {
  return (
    <div>
      {breadcrumb && (
        <Breadcrumb
          style={{ marginBottom: 12 }}
          items={[{ href: '#overview', title: <><HomeOutlined /> Trang chủ</> }, ...(breadcrumb || [])]}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          {title && <Title level={3} style={{ margin: 0 }}>{title}</Title>}
          {description && <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>{description}</Text>}
        </div>
        {extra && <Space wrap>{extra}</Space>}
      </div>
      {children}
    </div>
  );
}
