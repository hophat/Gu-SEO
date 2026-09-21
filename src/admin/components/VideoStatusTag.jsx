import { Space, Tag } from 'antd';
import { statusMeta } from '../lib/videoQueue.js';

// Status pill shared by the Video and Carousel pages. Non-post jobs
// (business promos) carry an extra badge.
export default function VideoStatusTag({ status, kind }) {
  const m = statusMeta(kind, status);
  return (
    <Space size={4}>
      <Tag color={m.color}>{m.text}</Tag>
      {kind === 'business' && <Tag color="gold">Doanh nghiệp</Tag>}
    </Space>
  );
}
