import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { gid, suggestLanders, isEntryNode } from './helpers.js';
import { nodeRows, lineStyle, isTerminalFilter, effectiveWhen, PALETTE } from './rows.js';
import { setEdgeWhen, moveRow, deleteEdge, setEdgeColor, setEdgeWeight, removeNode } from './edit.js';
import { PIXEL_TEXT } from './NodeBox.jsx';
import { MatrixInspector } from './MatrixInspector.jsx';
import { RuleEditor } from './RuleEditor.jsx';

// The side panel, in plain words. A node's outgoing connections are edited as the same rows the
// canvas shows (rows.js): condition, order (↑/↓ rewrites priority 1..n), colour, A/B share, delete.
// Every change goes through the pure edits in edit.js.

const TYPE = {
  entry: ['▶', 'Visitors arrive'], traffic: ['▶', 'Visitors arrive'],
  filter: ['⊘', 'Filter'], route: ['⑃', 'Route'], split: ['⇉', 'A/B split'], path: ['⑃', 'Path'],
  lander: ['▢', 'Page'], offer: ['◎', 'Offer'], pixel: ['⊙', 'Tracking pixel'], matrix: ['▦', 'Lookup table'],
};
const typeLabel = (n) => (TYPE[n?.kind] || [null, 'Step'])[1];
const COLOUR_NAME = { teal: 'Teal', blue: 'Blue', purple: 'Purple', coral: 'Coral', amber: 'Amber', gray: 'Gray' };
const small = { fontSize: 12, marginTop: 8 };
const link = { background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 };

// One row of a node, editable: what it checks, where it goes, its order, colour and share.
function RowCard({ graph, setGraph, setSel, row, edge, source, rules, nameOf, numbered, canDelete = true }) {
  const target = (graph.nodes || {})[row.targetId];
  // the engine reads the condition of a row into a path or an old-style terminal filter from that
  // target, never from the connection itself, so it is edited there
  const gated = !!target && (target.kind === 'path' || isTerminalFilter(graph, row.targetId));
  // "Next" / share rows can get a condition too (a fresh route starts with them); an A/B split's can't
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
  // lineStyle ignores the colour of "Otherwise" (dashed gray) and blocked (red) lines
  const colourable = row.style !== 'otherwise' && row.style !== 'blocked';
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
      ) : condRow && (
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

// Every row of a node (a filter's blocked row and the old terminal "only" row are not edited here).
function RowList({ graph, setGraph, setSel, node, rules, nameOf }) {
  const rows = nodeRows(graph, node.id, rules).filter((r) => r.kind !== 'blocked' && r.kind !== 'only');
  const numbered = rows.filter((r) => r.number != null).length;
  const edgeById = new Map((graph.edges || []).filter((e) => e.id).map((e) => [e.id, e]));
  return (
    <>
      {rows.map((r) => {
        const edge = r.edgeId && edgeById.get(r.edgeId);
        return edge
          ? <RowCard key={r.key} graph={graph} setGraph={setGraph} setSel={setSel} row={r} edge={edge} source={node} rules={rules} nameOf={nameOf} numbered={numbered} />
          : <div key={r.key} className="dim" style={{ fontSize: 12, marginBottom: 8 }}>{r.label}</div>;
      })}
      <div className="dim" style={{ fontSize: 12 }}>
        {rows.length ? '' : 'No rows yet. '}To add a row, drag from "+ add" on the box onto another box.
      </div>
    </>
  );
}

export function GraphInspector({ graph, setGraph, sel, setSel, landers, offers, pixels = [], context }) {
  const rules = context?.rules || [];
  const catalogName = (n) => (n.kind === 'lander' ? landers : n.kind === 'offer' ? offers : n.kind === 'pixel' ? pixels : [])
    .find((x) => x.id === n.ref)?.name;
  const nameOf = (n) => (n ? n.note || catalogName(n) || typeLabel(n) : '');
  const rowProps = { graph, setGraph, setSel, rules, nameOf };

  if (!sel) return (
    <div className="finspect-empty dim">
      Select a box or a line to edit it.<br /><br />
      Drag a row's dot onto another box to change where that row goes.<br /><br />
      Drag from "+ add" onto another box to make a new row.<br /><br />
      <b>Shortcuts:</b> Del/{'⌫'} delete {'·'} {'⌘'}/Ctrl+C copy {'·'} {'⌘'}/Ctrl+V paste (works across flows) {'·'} {'⌘'}/Ctrl+D duplicate {'·'} Esc deselect {'·'} {'⤢'} Arrange to tidy the layout.
    </div>
  );

  if (sel.type === 'node') {
    const n = graph.nodes[sel.id];
    if (!n) return <div className="finspect-empty dim">Select a box or a line to edit it.</div>;
    const patchNode = (p) => setGraph((g) => ({ ...g, nodes: { ...g.nodes, [n.id]: { ...g.nodes[n.id], ...p } } }));
    const setRef = (ref) => patchNode({ ref });
    const setNote = (note) => patchNode({ note: note || undefined });
    const setEvent = (event) => patchNode({ event: event || undefined });
    // deleting renumbers the rows of every box that pointed here; the entry can't be deleted
    const del = () => { setGraph((g) => removeNode(g, n.id)); setSel(null); };
    const dup = () => { const nid = gid(); setGraph((g) => ({ ...g, nodes: { ...g.nodes, [nid]: { ...g.nodes[n.id], id: nid, x: (g.nodes[n.id].x || 0) + 40, y: (g.nodes[n.id].y || 0) + 40 } } })); setSel({ type: 'node', id: nid }); };
    const [icon, type] = TYPE[n.kind] || ['•', typeLabel(n)];
    const head = <div className="finspect-h">{icon} {type}</div>;
    const name = (placeholder) => <>
      <label>Name (shown on the box)</label>
      <input value={n.note || ''} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
    </>;
    const actions = (what) => (
      <div className="finspect-actions">
        <button className="btn tiny ghost" onClick={dup}>{'⧉'} Duplicate</button>
        <button className="btn tiny danger" onClick={del}>Delete {what}</button>
      </div>
    );
    const rowList = <RowList {...rowProps} node={n} />;

    if (isEntryNode(graph, n.id)) {
      return (
        <>
          <div className="finspect-h">{'▶'} Visitors arrive</div>
          <div className="dim" style={{ fontSize: 12 }}>Every visitor starts here. This box can't be deleted.</div>
          <label>Where do visitors go first?</label>
          {rowList}
        </>
      );
    }

    if (n.kind === 'route') {
      return (
        <>
          {head}
          {name('e.g. Who is the visitor?')}
          <label>Who goes where?</label>
          <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>Numbered rows are checked in order, 1 first. Visitors who match none of them take "Otherwise".</div>
          {rowList}
          {actions('route')}
        </>
      );
    }

    if (n.kind === 'split') {
      return (
        <>
          {head}
          {name('e.g. Quiz A/B test')}
          <label>How are visitors shared?</label>
          <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>Each visitor goes down one row, picked at random by share. Shares are relative: 70 and 30 give 70% and 30%.</div>
          {rowList}
          {actions('A/B split')}
        </>
      );
    }

    if (n.kind === 'path') {
      return (
        <>
          {head}
          {name('e.g. Tier-1 mobile')}
          <label>Who enters this path? (blank = everyone)</label>
          <RuleEditor key={n.id} when={n.when} rules={rules} onChange={(w) => patchNode({ when: w })} />
          <label style={{ marginTop: 12 }}>Where do they go next?</label>
          {rowList}
          {actions('path')}
        </>
      );
    }

    if (n.kind === 'filter') {
      const outs = graph.edges.filter((e) => e.from === n.id).length;
      const ins = graph.edges.filter((e) => e.to === n.id).length;
      const noCond = !n.when || typeof n.when !== 'object' || !Object.keys(n.when).length;
      return (
        <>
          {head}
          {name('e.g. Block reviewers')}
          <label>What does this filter catch?</label>
          <RuleEditor key={n.id} when={n.when} rules={rules} onChange={(w) => patchNode({ when: w })} />

          <label style={{ marginTop: 12 }}>What happens to them?</label>
          <select value={n.action === 'challenge' ? 'challenge' : '404'}
            onChange={(e) => setGraph((g) => ({ ...g, nodes: { ...g.nodes, [n.id]: { ...g.nodes[n.id],
              action: e.target.value, challenge: e.target.value === 'challenge'
                ? (g.nodes[n.id].challenge || { type: 'click', timeout_ms: 8000, on_fail: '404' }) : undefined } } }))}>
            <option value="404">Bare 404, immediate, no page shown</option>
            <option value="challenge">Challenge first, a real page decides pass or fail</option>
          </select>

          {n.action === 'challenge' ? (() => {
            const ch = n.challenge || { type: 'click', timeout_ms: 8000, on_fail: '404' };
            const setCh = (patch) => setGraph((g) => ({ ...g, nodes: { ...g.nodes,
              [n.id]: { ...g.nodes[n.id], challenge: { ...ch, ...patch } } } }));
            const CHALLENGE_LABEL = { click: 'Click to continue', honeypot: 'Avoid a hidden button', timing: 'Wait before acting', motion: 'Move the mouse first' };
            return (
              <>
                <label style={{ marginTop: 8 }}>Challenge type</label>
                <select value={ch.type} onChange={(e) => setCh({ type: e.target.value })}>
                  {Object.entries(CHALLENGE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <label style={{ marginTop: 8 }}>
                  {ch.type === 'timing' ? 'Minimum time before a click counts (seconds)'
                    : 'Give up after (seconds)'}
                </label>
                <input type="number" min="0.5" max="120" step="0.5"
                  value={(ch.timeout_ms / 1000).toString()}
                  onChange={(e) => setCh({ timeout_ms: Math.round((Number(e.target.value) || 8) * 1000) })} />
                <label style={{ marginTop: 8 }}>On failure</label>
                <select value={ch.on_fail || '404'} onChange={(e) => setCh({ on_fail: e.target.value })}>
                  <option value="404">Genuine 404, the visitor never actually reaches the page</option>
                  <option value="cosmetic">Looks like a 404 to the visitor, but nothing is recorded</option>
                </select>
                <div className="dim" style={small}>
                  {ch.type === 'click' && 'Shows a Continue button. No click before the timeout, fail.'}
                  {ch.type === 'honeypot' && 'A real button plus one only a script would find. Touch the decoy, immediate fail. Never touch anything, passes; a slow human is not a bot.'}
                  {ch.type === 'timing' && 'The button is live immediately, but a click before the timeout fails, catching a script that never waited for the page to actually render.'}
                  {ch.type === 'motion' && 'A click with no prior mouse movement (or a touch scroll, on mobile) fails, catching a click fired programmatically with no real pointer behind it.'}
                </div>
              </>
            );
          })() : (
            <div className="dim" style={small}>
              A match gets a plain <b>404</b>, the same response as a link that never existed, and
              nothing is recorded: no click, no visit, no cost. {outs > 0
                ? 'Anyone who doesn\'t match continues down this box\'s "Passes" row.'
                : 'This filter wins over every other matching row, so nothing leaks past it.'}
            </div>
          )}
          {noCond && <div className="err" style={{ marginTop: 8 }}>
            No condition: this filter would block every visitor</div>}
          {ins === 0 && <div className="err" style={{ marginTop: 8 }}>
            Nothing leads into this filter, so it filters nothing. Drag a row's dot onto it.</div>}
          <div className="dim" style={small}>
            {outs > 0
              ? 'Visitors who don\'t match continue past it. Drag the "Passes" row\'s dot to change where they go.'
              : 'Nothing continues past it: the row into it only lets matching visitors in, and they are blocked. Drag from "+ add" to a page or offer to let the others continue through it instead.'}
          </div>
          {actions('filter')}
        </>
      );
    }

    if (n.kind === 'matrix') return <MatrixInspector n={n} graph={graph} setGraph={setGraph} landers={landers} offers={offers} setNote={setNote} dup={dup} del={del} />;

    if (n.kind === 'pixel') {
      return (
        <>
          {head}
          <div className="dim" style={{ fontSize: 12 }}>{PIXEL_TEXT}</div>
          {name('e.g. US iOS pixel')}
          <label>Which pixel?</label>
          <select value={n.ref || ''} onChange={(e) => setRef(e.target.value)}>
            <option value="">Pick a pixel{'…'}</option>
            {pixels.map((p) => <option key={p.id} value={p.id}>{p.name}{p.platform ? ` · ${p.platform}` : ''}</option>)}
          </select>
          {!pixels.length && <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>No pixels in this sample catalog.</div>}
          <label style={{ marginTop: 8 }}>Event to send <span className="dim">(optional, used instead of the pixel's usual event)</span></label>
          <input value={n.event || ''} onChange={(e) => setEvent(e.target.value)}
            placeholder={(pixels.find((p) => p.id === n.ref)?.platform === 'google') ? "conversion action id (blank = the pixel's)" : 'e.g. Lead, Purchase, order_created (blank = default)'} />
          <div className="dim" style={small}>No lines needed: every tracking pixel in this flow fires when someone buys. Add more to fire several pixels (or the same pixel with a different event).</div>
          {actions('pixel')}
        </>
      );
    }

    if (n.kind === 'lander' || n.kind === 'offer') {
      const isLander = n.kind === 'lander';
      const offerNames = isLander ? Object.values(graph.nodes)
        .filter((x) => x && x.kind === 'offer' && x.ref)
        .map((x) => (offers.find((o) => o.id === x.ref) || {}).name || '').join(' ') : '';
      const ranked = isLander ? suggestLanders(landers, [
        [n.note, 3], [offerNames, 2], [context?.campaignName, 2], [context?.sourceName, 1],
      ]) : [];
      const suggested = ranked.filter((r) => r.score > 0).slice(0, 5);
      const rest = ranked.slice(suggested.length);
      return (
        <>
          {head}
          {name(isLander ? 'e.g. Quiz lander A' : 'e.g. Everflow #1442')}
          <label>{isLander ? 'Which page do visitors see?' : 'Where are visitors sent?'}</label>
          {isLander && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 6px', flexWrap: 'wrap' }}>
              <button className="btn tiny" disabled={!suggested.length}
                title="Pick the best keyword match against this flow's offers, the flow name, the traffic source and this box's name"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                onClick={() => setRef(suggested[0].l.id)}><Sparkles size={12} strokeWidth={2.25} /> AI suggest</button>
              {suggested.length > 0
                ? <span className="dim" style={{ fontSize: 11.5 }}>
                    {'→'} {suggested[0].l.name} <span className="faint">({suggested[0].hits.slice(0, 3).join(', ')})</span>
                  </span>
                : <span className="dim" style={{ fontSize: 11.5 }}>No keyword matches yet: connect an offer or add a name</span>}
            </div>
          )}
          <select value={n.ref || ''} onChange={(e) => setRef(e.target.value)}>
            <option value="">{isLander ? 'Pick a page' : 'Pick an offer'}{'…'}</option>
            {!isLander && offers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            {isLander && suggested.length > 0 && (
              <optgroup label={'✦ Suggested, keyword match'}>
                {suggested.map(({ l, hits }) => (
                  <option key={l.id} value={l.id}>{l.name} {'·'} {hits.slice(0, 3).join(', ')}</option>
                ))}
              </optgroup>
            )}
            {isLander && (suggested.length > 0
              ? <optgroup label="All pages">{rest.map(({ l }) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
              : landers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>))}
          </select>
          {isLander ? <>
            <label style={{ marginTop: 12 }}>What happens after this page?</label>
            {rowList}
          </> : <div className="dim" style={small}>End of the flow: visitors are sent to this offer.</div>}
          {actions(isLander ? 'page' : 'offer')}
        </>
      );
    }

    // any other kind (hand-edited JSON): name, duplicate, delete
    return (
      <>
        {head}
        {name('')}
        {actions('box')}
      </>
    );
  }

  // a line
  const e = (graph.edges || []).find((x) => x.id === sel.id);
  if (!e) return <div className="finspect-empty dim">Select a box or a line to edit it.</div>;
  const from = graph.nodes[e.from], to = graph.nodes[e.to];
  const delLine = (what) => (
    <div className="finspect-actions">
      <button className="btn tiny danger" onClick={() => { setGraph((g) => deleteEdge(g, e.id)); setSel(null); }}>Delete {what}</button>
    </div>
  );
  if (to?.kind === 'pixel') {
    return (
      <>
        <div className="finspect-h">Tracking line</div>
        <div className="dim" style={{ fontSize: 12 }}>
          Links '{nameOf(from) || e.from}' to the tracking pixel '{nameOf(to)}'. Visitors don't follow it.
        </div>
        {delLine('line')}
      </>
    );
  }
  const rows = from ? nodeRows(graph, e.from, rules) : [];
  const i = rows.findIndex((r) => r.edgeId === e.id);
  if (i < 0) {
    return (
      <>
        <div className="finspect-h">Line</div>
        <div className="dim" style={{ fontSize: 12 }}>
          {from && to ? "This line isn't one of the rows of the box it leaves." : 'This line is attached to a box that no longer exists.'}
        </div>
        {delLine('line')}
      </>
    );
  }
  const numbered = rows.filter((r) => r.number != null).length;
  return (
    <>
      <div className="finspect-h">Row {i + 1} of '{nameOf(from)}'</div>
      <div style={{ marginTop: 8 }}>
        <RowCard key={e.id} {...rowProps} row={rows[i]} edge={e} source={from} numbered={numbered} canDelete={false} />
      </div>
      {delLine('row')}
    </>
  );
}
