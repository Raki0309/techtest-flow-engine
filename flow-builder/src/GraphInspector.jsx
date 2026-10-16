import { Sparkles } from 'lucide-react';
import { gid, suggestLanders, isEntryNode } from './helpers.js';
import { nodeRows, isCaught } from './rows.js';
import { deleteEdge, removeNode } from './edit.js';
import { PIXEL_TEXT } from './NodeBox.jsx';
import { MatrixInspector } from './MatrixInspector.jsx';
import { RuleEditor } from './RuleEditor.jsx';
import { RowCard, RowList } from './RowEditor.jsx';
import { FilterPanel } from './FilterPanel.jsx';

// The side panel, in plain words: picks the panel for the selected box's kind (a filter's lives in
// FilterPanel.jsx) or the selected line. A box's outgoing connections are edited as the same rows
// the canvas shows (RowEditor.jsx). Every change goes through the pure edits in edit.js.

const TYPE = {
  entry: ['▶', 'Visitors arrive'], traffic: ['▶', 'Visitors arrive'],
  filter: ['⊘', 'Filter'], route: ['⑃', 'Route'], split: ['⇉', 'A/B split'], path: ['⑃', 'Path'],
  lander: ['▢', 'Page'], offer: ['◎', 'Offer'], pixel: ['⊙', 'Tracking pixel'], matrix: ['▦', 'Lookup table'],
};
const typeLabel = (n) => (TYPE[n?.kind] || [null, 'Step'])[1];
const small = { fontSize: 12, marginTop: 8 };

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
    // any box that filters send caught visitors to says which ones
    const fbFrom = [...new Set((graph.edges || []).filter((e) => isCaught(e) && e.to === n.id && graph.nodes[e.from]?.kind === 'filter').map((e) => e.from))];
    const isOfferBox = n.kind === 'offer' || (n.kind === 'matrix' && n.of === 'offer');
    const fbNote = fbFrom.length > 0 && (
      <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>{isOfferBox ? 'Fallback offer for' : 'Fallback for'} {fbFrom.map((id) => `'${nameOf(graph.nodes[id])}'`).join(', ')}</div>);
    const head = <><div className="finspect-h">{icon} {type}</div>{fbNote}</>;
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
      return <FilterPanel graph={graph} setGraph={setGraph} setSel={setSel} n={n} rules={rules} offers={offers} nameOf={nameOf} patchNode={patchNode} head={head} name={name('e.g. Block reviewers')} actions={actions('filter')} />;
    }

    if (n.kind === 'matrix') return <>{fbNote}<MatrixInspector n={n} graph={graph} setGraph={setGraph} landers={landers} offers={offers} setNote={setNote} dup={dup} del={del} /></>;

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
  const rows = from ? nodeRows(graph, e.from, rules, nameOf) : [];
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
  // ↑/↓ count the rows on this line's side only (a filter numbers its fallback and Passes rows apart)
  const numbered = rows.filter((r) => r.number != null && (r.kind === 'caught') === (rows[i].kind === 'caught')).length;
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
