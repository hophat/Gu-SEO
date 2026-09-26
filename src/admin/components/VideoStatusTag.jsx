import { Space } from 'antd';
import StatusChip from './StatusChip.jsx';
import { EXPLAINER_KIND } from '../lib/videoQueue.js';

// Status pill shared by the Video and Carousel pages. Kinds that are not
// the plain post teaser carry an extra badge, so the Video list can show
// teasers, explainers and promos side by side without them looking alike.
export default function VideoStatusTag({ status, kind }) {
  return (
    <Space size={4} wrap>
      <StatusChip status={status} table={kind === 'carousel' ? 'carousel' : 'video'} />
      {kind === 'business' && <span className="ps-chip ps-chip--plain">Doanh nghiệp</span>}
      {kind === EXPLAINER_KIND && <span className="ps-chip ps-chip--plain">Minh hoạ</span>}
    </Space>
  );
}
