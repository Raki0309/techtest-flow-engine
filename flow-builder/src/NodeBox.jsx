import { NODE_W, HEADER_H, ROW_H, ADD_H, PIXEL_BODY_H } from './helpers.js';
import { worstLevel } from './checks.js';

// One node on the canvas: a header (icon + type + name), then one row per outgoing connection, each
// with its own exit dot, then the "+ add" strip. Heights are fixed (helpers.js), so the canvas can
// place every line without measuring the DOM. Presentational only: GraphCanvas owns all state.
// A filter's blocked row has no exit dot: its end box hangs below the node instead.

export const PIXEL_TEXT = "Tells Meta when someone buys, so ads reach more buyers. Visitors don't pass through it.";

const KINDS = {
  entry: ['▶', 'Visitors arrive', 'entry'],
  traffic: ['▶', 'Visitors arrive', 'entry'],
  filter: ['⊘', 'Filter', 'filter'],
  route: ['⑃', 'Route', 'route'],
  split: ['⇉', 'A/B split', 'split'],
  path: ['⑃', 'Path', 'path'],
  lander: ['▢', 'Page', 'lander'],
  offer: ['◎', 'Offer', 'offer'],
  pixel: ['⊙', 'Tracking', 'pixel'],
  matrix: ['▦', 'Lookup table', 'matrix'],
};
const kindOf = (n) => {
  const [ic, type, cls] = KINDS[n.kind] || ['•', n.kind || 'Step', 'other'];
  return { ic, type, cls: n.kind === 'matrix' ? `matrix mx-${n.of === 'lander' ? 'lander' : 'offer'}` : cls };
};

// Ends of the flow have no rows by design (same test as rows.js).
const isEnd = (n) => n.kind === 'offer' || (n.kind === 'matrix' && n.of === 'offer');

// An offer shows its catalog name as a row-less subtitle (spec §6), so a note in the header never hides it.
const bodyText = (n, catalogName) => {
  if (n.kind === 'pixel') return PIXEL_TEXT;
  if (n.kind === 'offer' && catalogName) return catalogName;
  return isEnd(n) ? 'End: visitors are sent here' : 'Nothing comes after this yet';
};

export function NodeBox({ n, name, catalogName, rows, styles, height, add, selected, faded, problems, readOnly, onDown, onExitDown, onAddDown }) {
  const k = kindOf(n);
  const level = worstLevel(problems);
  const hint = [k.type, name, catalogName !== name ? catalogName : null].filter(Boolean).join(' · ');
  return (
    <div data-id={n.id} data-node-id={n.id} className={`gnode k-${k.cls}${selected ? ' sel' : ''}${faded ? ' faded' : ''}`}
      style={{ left: n.x, top: n.y, width: NODE_W, height }} onPointerDown={onDown}>
      <span className="gin" />
      <div className="ghead" style={{ height: HEADER_H }} title={hint}>
        <span className="gic">{k.ic}</span>
        <span className="gtype">{k.type}</span>
        {name && <span className="gname">{name}</span>}
      </div>
      {!rows.length && (
        <div className={`gbody${n.kind === 'pixel' ? ' pixel' : ''}`} style={{ height: n.kind === 'pixel' ? PIXEL_BODY_H : ROW_H }}>
          <span>{bodyText(n, catalogName)}</span>
        </div>
      )}
      {rows.map((r, i) => {
        const text = r.label || 'No condition yet';
        const shown = r.number ? `${r.number} · ${text}` : text;
        const draggable = !readOnly && !!r.edgeId && r.kind !== 'blocked';
        return (
          <div key={r.key} className={`grow k-${r.kind}`} style={{ height: ROW_H }} title={r.detail ? `${shown} (${r.detail})` : shown}>
            <span className="grow-txt">{shown}</span>
            {r.detail && <span className="grow-detail">{r.detail}</span>}
            {r.kind !== 'only' && r.kind !== 'blocked' && (
              <span className={`gexit${draggable ? ' drag' : ''}`} style={{ '--ec': styles[i]?.color }}
                title={draggable ? 'Drag to another node to change where this goes' : undefined}
                onPointerDown={draggable ? (e) => onExitDown(e, r, i) : undefined} />
            )}
          </div>
        );
      })}
      {add && (
        <div className="gadd" style={{ height: ADD_H }} onPointerDown={onAddDown} title="Drag to a node to add a connection">
          <span>+ add</span><span className="gexit drag add" />
        </div>
      )}
      {level && <span className={`gbadge ${level}`} title={problems.map((p) => p.text).join('\n')}>{problems.length}</span>}
    </div>
  );
}
