import { lineStyle, pixelLineStyle, HIGHLIGHT } from './rows.js';

// What each line style means (spec §6). The samples take their values from rows.js, so the legend
// and the canvas can never disagree.
const SAMPLES = [
  { label: 'Priority 1', s: lineStyle({ style: 'priority1' }) },
  { label: 'Priority 2, 3 …', s: lineStyle({ style: 'priority' }) },
  { label: 'Otherwise', s: lineStyle({ style: 'otherwise' }) },
  { label: 'A/B share', s: lineStyle({ style: 'share' }), tag: '50%' },
  { label: 'Blocked', s: lineStyle({ style: 'blocked' }) },
  { label: 'Tracking (pixel)', s: pixelLineStyle() },
  { label: 'Test-a-visitor path', s: { color: HIGHLIGHT.color, width: HIGHLIGHT.width, dash: null } },
];

export function Legend() {
  return (
    <div className="glegend" aria-label="What the lines mean">
      <div className="glegend-h">What the lines mean</div>
      {SAMPLES.map(({ label, s, tag }) => (
        <div key={label} className="glegend-row">
          <svg width="40" height="12" aria-hidden="true">
            <line x1="2" y1="6" x2="38" y2="6" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash || undefined} />
          </svg>
          <span>{label}</span>
          {tag && <span className="glegend-tag" style={{ color: s.color }}>{tag}</span>}
        </div>
      ))}
    </div>
  );
}
