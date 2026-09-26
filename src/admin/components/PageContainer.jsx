// Shared page wrapper — title, description, breadcrumb, actions.
import { Typography, Space, Breadcrumb } from 'antd';
import { HomeOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function PageContainer({ title, description, breadcrumb, extra, children }) {
  return (
    <div className="ps-page">
      {breadcrumb && (
        <Breadcrumb
          className="ps-page-crumb"
          items={[{ href: '#overview', title: <><HomeOutlined /> Trang chủ</> }, ...(breadcrumb || [])]}
        />
      )}
      <div className="ps-page-head">
        <div>
          {title && <Title level={3} className="ps-page-title">{title}</Title>}
          {description && <Text className="ps-page-desc">{description}</Text>}
        </div>
        {extra && <Space wrap>{extra}</Space>}
      </div>
      {children}
    </div>
  );
}
