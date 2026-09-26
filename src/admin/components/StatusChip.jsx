// Status chip — the single way this app shows a state.
//
// The chip always renders a word. The dot and the tint are secondary, which
// keeps the state readable for colour-blind users and in a monochrome print.
// Callers pass the raw DB status, never an antd colour name.
import { statusMeta } from '../lib/status.js';

export default function StatusChip({ status, table, title, className = '' }) {
  if (!status) return null;
  const { tone, text } = statusMeta(status, table);
  const cls = ['ps-chip', `ps-chip--${tone}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls} title={title || text}>
      {text}
    </span>
  );
}
