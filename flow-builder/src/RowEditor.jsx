import { useState } from 'react';
import { nodeRows, lineStyle, isTerminalFilter, effectiveWhen, PALETTE } from './rows.js';
import { setEdgeWhen, moveRow, deleteEdge, setEdgeColor, setEdgeWeight } from './edit.js';
import { describeWhen } from './describe.js';
import { RuleEditor } from './RuleEditor.jsx';

// A box's outgoing connections, edited as the same rows the canvas shows (rows.js): condition,
// order (↑/↓ rewrites priority 1..n), colour, A/B share, delete. Every change goes through edit.js.

const COLOUR_NAME = { teal: 'Teal', blue: 'Blue', purple: 'Purple', coral: 'Coral', amber: 'Amber', gray: 'Gray' };
const link = { background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 };

// One row of a node, editable: what it checks, where it goes, its order, colour and share.
export function RowCard({ graph, setGraph, setSel, row, edge, source, rules, nameOf, numbered, canDelete = true }) {
  const target = (graph.nodes || {})[row.targetId];
  // the engine reads the condition of a row into a path or an old-style terminal filter from that
  // target, never from the connection itself, so it is edited there
  const gated = !!target && (target.kind === 'path' || isTerminalFilter(graph, row.targetId));
  // "Next" / share rows can get a condition too (a fresh route starts with them); an A/B split's can't.
  // Fallback rows (kind 'caught') get no condition editor (decision L15).
  const condRow = row.kind === 'condition' || row.kind === 'otherwise'
    || (source.kind !== 'split' && (row.kind === 'next' || row.kind === 'share'));
  const hasCond = !!effectiveWhen(graph, edge);
  const [open, setOpen] = useState(hasCond);
  // what the share box shows while typing: an emptied box stores nothing until a number is typed
  const [shareText, setShareText] = useState(null);
  const typeShare = (v) => {
    setShareText(v);
    const n = Number(v);
    if (v.trim() !== '' && Number.isFinite(n)) setGraph((g) => setEdgeWeight(g, edge.id, Math.max(0, n)));
  };
  const text = row.label || 'No condition yet';
  // lineStyle ignores the colour of "Otherwise" (dashed gray), blocked and fallback (red) lines
  const colourable = row.style !== 'otherwise' && row.style !== 'blocked' && row.style !== 'caught';
  const pick = (id) => setSel({ type: 'node', id });
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden="true" style={{ flex: 'none', width: 10, height: 10, borderRadius: 999, background: lineStyle(row, edge).color }} />
        <b style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflowWrap: 'anywhere' }}>{row.number ? `${row.number} · ` : ''}{text}
          {row.detail && <span className="dim" style={{ fontWeight: 400 }}> ({row.detail})</span>}</b>
        {row.number != null && <>
          <button type="button" className="btn tiny ghost" disabled={row.number <= 1} style={{ opacity: row.number <= 1 ? 0.35 : 1 }} title="Check this row earlier" aria-label="Move this row up"
            onClick={() => setGraph((g) => moveRow(g, edge.id, -1))}>{'↑'}</button>
          <button type="button" className="btn tiny ghost" disabled={row.number >= numbered} style={{ opacity: row.number >= numbered ? 0.35 : 1 }} title="Check this row later" aria-label="Move this row down"
            onClick={() => setGraph((g) => moveRow(g, edge.id, 1))}>{'↓'}</button>
        </>}
        {canDelete && <button type="button" className="btn tiny ghost" title="Delete this row" aria-label="Delete this row"
          onClick={() => setGraph((g) => deleteEdge(g, edge.id))}>{'✕'}</button>}
      </div>
      <div style={{ fontSize: 12, marginTop: 3 }}>
        <span className="dim">Goes to </span>
        {target ? <button type="button" style={link} title="Select this box" onClick={() => pick(target.id)}>{nameOf(target)}</button>
          : <span className="err">a box that no longer exists</span>}
      </div>
      {row.share != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <span className="dim" style={{ fontSize: 12 }}>Share</span>
          <input type="number" min="0" step="1" style={{ width: 80 }} aria-label="Share of visitors"
            value={shareText ?? String(edge.weight ?? 1)} onChange={(ev) => typeShare(ev.target.value)} onBlur={() => setShareText(null)} />
          <b style={{ fontSize: 12.5 }}>= {row.share}%</b>
        </div>
      )}
      {gated ? (
        <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
          Condition is set on '{nameOf(target)}'{' '}
          <button type="button" style={link} onClick={() => pick(target.id)}>Edit it</button>
        </div>
      ) : row.kind === 'caught' ? (hasCond && (
        <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Only {describeWhen(effectiveWhen(graph, edge), rules)}</div>
      )) : condRow && (
        <details open={open} onToggle={(ev) => setOpen(ev.currentTarget.open)} style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--dim)' }}>{hasCond ? 'Condition' : 'Add a condition'}</summary>
          <div style={{ marginTop: 4 }}>
            <RuleEditor when={edge.when} rules={rules} onChange={(w) => setGraph((g) => setEdgeWhen(g, edge.id, w))} />
          </div>
        </details>
      )}
      {colourable ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <span className="dim" style={{ fontSize: 12 }}>Colour</span>
          {Object.entries(PALETTE).map(([k, hex]) => (
            <button key={k} type="button" title={COLOUR_NAME[k]} aria-label={`${COLOUR_NAME[k]} line`} aria-pressed={edge.color === k}
              onClick={() => setGraph((g) => setEdgeColor(g, edge.id, k))}
              style={{ width: 18, height: 18, padding: 0, border: 0, borderRadius: 999, background: hex, cursor: 'pointer',
                boxShadow: edge.color === k ? '0 0 0 2px var(--panel), 0 0 0 4px var(--text)' : 'none' }} />
          ))}
          <button type="button" className={`chip ${PALETTE[edge.color] ? '' : 'on'}`} style={{ padding: '1px 9px', fontSize: 11.5 }}
            aria-pressed={!PALETTE[edge.color]} onClick={() => setGraph((g) => setEdgeColor(g, edge.id, null))}>Default</button>
        </div>
      ) : row.kind === 'otherwise' && (
        <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>"Otherwise" lines are always dashed gray.</div>
      )}
    </div>
  );
}

// Every row of a node that `rows(row)` keeps (a filter's blocked row and the old terminal "only" row
// are never edited here), so a filter can list its fallback rows and its Passes rows apart. ↑/↓
// count only the listed rows. Under the list: a hint on how to add a row.
export function RowList({ graph, setGraph, setSel, node, rules, nameOf, rows: keep = () => true }) {
  const rows = nodeRows(graph, node.id, rules, nameOf).filter((r) => r.kind !== 'blocked' && r.kind !== 'only' && keep(r));
  const numbered = rows.filter((r) => r.number != null).length;
  const edgeById = new Map((graph.edges || []).filter((e) => e.id).map((e) => [e.id, e]));
  const note = `${rows.length ? '' : 'No rows yet. '}To add a row, drag from "+ add" on the box onto another box.`;
  return (
    <>
      {rows.map((r) => {
        const edge = r.edgeId && edgeById.get(r.edgeId);
        return edge
          ? <RowCard key={r.key} graph={graph} setGraph={setGraph} setSel={setSel} row={r} edge={edge} source={node} rules={rules} nameOf={nameOf} numbered={numbered} />
          : <div key={r.key} className="dim" style={{ fontSize: 12, marginBottom: 8 }}>{r.label}</div>;
      })}
      <div className="dim" style={{ fontSize: 12 }}>{note}</div>
    </>
  );
}
