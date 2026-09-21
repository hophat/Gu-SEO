import { Space, Tag } from 'antd';
import { statusMeta, EXPLAINER_KIND } from '../lib/videoQueue.js';

// Status pill shared by the Video and Carousel pages. Kinds that are not
// the plain post teaser carry an extra badge, so the Video list can show
// teasers, explainers and promos side by side without them looking alike.
export default function VideoStatusTag({ status, kind }) {
  const m = statusMeta(kind, status);
  return (
    <Space size={4}>
      <Tag color={m.color}>{m.text}</Tag>
      {kind === 'business' && <Tag color="gold">Doanh nghiệp</Tag>}
      {kind === EXPLAINER_KIND && <Tag color="purple">Minh hoạ</Tag>}
    </Space>
  );
}
