import { Sparkles } from 'lucide-react';
import { gid, ruleText, suggestLanders } from './helpers.js';
import { MatrixInspector } from './MatrixInspector.jsx';
import { RuleEditor } from './RuleEditor.jsx';

export function GraphInspector({ graph, setGraph, sel, setSel, landers, offers, pixels = [], context }) {
  if (!sel) return <div className="finspect-empty dim">Select a node or arrow to edit it.<br /><br />Drag the dot under a node to draw an arrow to another node. Two arrows out = a weighted split.<br /><br /><b>Shortcuts:</b> Del/{'⌫'} delete {'·'} {'⌘'}/Ctrl+C copy {'·'} {'⌘'}/Ctrl+V paste (works across flows) {'·'} {'⌘'}/Ctrl+D duplicate {'·'} Esc deselect {'·'} {'⤢'} Arrange to auto-tidy.</div>;
  if (sel.type === 'node') {
    const n = graph.nodes[sel.id];
    if (!n || n.kind === 'entry') return <div className="finspect-empty dim">This is the flow's traffic entry. Drag its dot to your first node.</div>;
    const setRef = (ref) => setGraph((g) => ({ ...g, nodes: { ...g.nodes, [n.id]: { ...g.nodes[n.id], ref } } }));
    const setNote = (note) => setGraph((g) => ({ ...g, nodes: { ...g.nodes, [n.id]: { ...g.nodes[n.id], note: note || undefined } } }));
    const setEvent = (event) => setGraph((g) => ({ ...g, nodes: { ...g.nodes, [n.id]: { ...g.nodes[n.id], event: event || undefined } } }));
    const del = () => { setGraph((g) => ({ ...g, nodes: Object.fromEntries(Object.entries(g.nodes).filter(([k]) => k !== n.id)), edges: g.edges.filter((e) => e.from !== n.id && e.to !== n.id) })); setSel(null); };
    const dup = () => { const nid = gid(); setGraph((g) => ({ ...g, nodes: { ...g.nodes, [nid]: { ...g.nodes[n.id], id: nid, x: (g.nodes[n.id].x || 0) + 40, y: (g.nodes[n.id].y || 0) + 40 } } })); setSel({ type: 'node', id: nid }); };
    if (n.kind === 'path') {
      const outs = graph.edges.filter((e) => e.from === n.id).length;
      return (
        <>
          <div className="finspect-h">{'⑃'} Path (filter + split)</div>
          <label>Note (shown on the node)</label>
          <input value={n.note || ''} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Tier-1 mobile" />
          <label>Only visitors matching this filter enter this path (blank = everyone)</label>
          <RuleEditor when={n.when} rules={context?.rules || []} onChange={(w) => setGraph((g) => ({ ...g, nodes: { ...g.nodes, [n.id]: { ...g.nodes[n.id], when: w } } }))} />
          <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>Drag this node's dot to landers/offers, {outs > 1 ? `splitting ${outs} ways by weight` : 'add more arrows to split'}.</div>
          <div className="finspect-actions">
            <button className="btn tiny ghost" onClick={dup}>{'⧉'} Duplicate</button>
            <button className="btn tiny danger" onClick={del}>Delete path</button>
          </div>
        </>
      );
    }
    if (n.kind === 'filter') {
      const outs = graph.edges.filter((e) => e.from === n.id).length;
      const ins = graph.edges.filter((e) => e.to === n.id).length;
      return (
        <>
          <div className="finspect-h">{'⊘'} Filter (returns 404)</div>
          <label>Note (shown on the node)</label>
          <input value={n.note || ''} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Block reviewers" />
          <label>Visitors matching this are turned away</label>
          <RuleEditor when={n.when} rules={context?.rules || []} onChange={(w) => setGraph((g) => ({ ...g, nodes: { ...g.nodes, [n.id]: { ...g.nodes[n.id], when: w } } }))} />

          <label style={{ marginTop: 10 }}>What happens to them</label>
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
                  <option value="cosmetic">Looks like a 404, but stays a 200, no second request</option>
                </select>
                <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
                  {ch.type === 'click' && 'Shows a Continue button. No click before the timeout, fail.'}
                  {ch.type === 'honeypot' && 'A real button plus one only a script would find. Touch the decoy, immediate fail. Never touch anything, passes; a slow human is not a bot.'}
                  {ch.type === 'timing' && 'The button is live immediately, but a click before the timeout fails, catching a script that never waited for the page to actually render.'}
                  {ch.type === 'motion' && 'A click with no prior mouse movement (or a touch scroll, on mobile) fails, catching a click fired programmatically with no real pointer behind it.'}
                </div>
              </>
            );
          })() : (
            <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
              A match gets a plain <b>404</b>, the same response as a link that never existed, and
              nothing is recorded: no click, no visit, no cost. {outs > 0
                ? "Anyone who doesn't match continues down this node's arrow."
                : 'This filter wins over every other matching route, so nothing leaks past it.'}
            </div>
          )}
          {!ruleText(n.when, true) && <div className="err" style={{ marginTop: 8 }}>
            No condition set, this would 404 every visitor. The flow will not validate until you add one.</div>}
          {ins === 0 && <div className="err" style={{ marginTop: 8 }}>
            Nothing routes into this filter, so it filters nothing. Drag an arrow into it.</div>}
          <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
            {outs > 0
              ? "Chained, visitors who don't match continue past it. Drag this node's dot to change where."
              : "Terminal, nothing continues past it. Drag this node's dot to a lander or offer to chain it instead of blocking outright."}
          </div>
          <div className="finspect-actions">
            <button className="btn tiny ghost" onClick={dup}>{'⧉'} Duplicate</button>
            <button className="btn tiny danger" onClick={del}>Delete filter</button>
          </div>
        </>
      );
    }
    if (n.kind === 'matrix') return <MatrixInspector n={n} graph={graph} setGraph={setGraph} landers={landers} offers={offers} setNote={setNote} dup={dup} del={del} />;
    if (n.kind === 'pixel') {
      return (
        <>
          <div className="finspect-h">{'⊙'} Pixel (fires on conversion)</div>
          <label>Note (shown on the node)</label>
          <input value={n.note || ''} onChange={(e) => setNote(e.target.value)} placeholder="e.g. US iOS pixel" />
          <label>Pixel, fired when this flow converts</label>
          <select value={n.ref || ''} onChange={(e) => setRef(e.target.value)}>
            <option value="">pick pixel{'…'}</option>
            {pixels.map((p) => <option key={p.id} value={p.id}>{p.name}{p.platform ? ` · ${p.platform}` : ''}</option>)}
          </select>
          {!pixels.length && <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>No pixels in this sample catalog.</div>}
          <label style={{ marginTop: 8 }}>Event override <span className="dim">(optional; used over the pixel's default event)</span></label>
          <input value={n.event || ''} onChange={(e) => setEvent(e.target.value)}
            placeholder={(pixels.find((p) => p.id === n.ref)?.platform === 'google') ? "conversion action id (blank = the pixel's)" : 'e.g. Lead, Purchase, order_created (blank = default)'} />
          <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>No wiring needed, every pixel node in this flow fires when a conversion lands. Add more nodes to fire multiple pixels (or the same pixel with a different event).</div>
          <div className="finspect-actions">
            <button className="btn tiny ghost" onClick={dup}>{'⧉'} Duplicate</button>
            <button className="btn tiny danger" onClick={del}>Delete pixel</button>
          </div>
        </>
      );
    }
    const isLander = n.kind === 'lander';
    const offerNames = isLander ? Object.values(graph.nodes)
      .filter((x) => x.kind === 'offer' && x.ref)
      .map((x) => (offers.find((o) => o.id === x.ref) || {}).name || '').join(' ') : '';
    const ranked = isLander ? suggestLanders(landers, [
      [n.note, 3], [offerNames, 2], [context?.campaignName, 2], [context?.sourceName, 1],
    ]) : [];
    const suggested = ranked.filter((r) => r.score > 0).slice(0, 5);
    const rest = ranked.slice(suggested.length);
    return (
      <>
        <div className="finspect-h">{n.kind === 'lander' ? '▢ Lander node' : '◎ Offer node'}</div>
        <label>Note (shown on the node)</label>
        <input value={n.note || ''} onChange={(e) => setNote(e.target.value)} placeholder={n.kind === 'lander' ? 'e.g. Quiz lander A' : 'e.g. Everflow #1442'} />
        <label>{n.kind === 'lander' ? 'Lander (shown before the offer)' : 'Offer (redirect target)'}</label>
        {isLander && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 6px', flexWrap: 'wrap' }}>
            <button className="btn tiny" disabled={!suggested.length}
              title="Pick the best keyword match against this flow's offers, the flow name, the traffic source and this node's note"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={() => setRef(suggested[0].l.id)}><Sparkles size={12} strokeWidth={2.25} /> AI suggest</button>
            {suggested.length > 0
              ? <span className="dim" style={{ fontSize: 11.5 }}>
                  {'→'} {suggested[0].l.name} <span className="faint">({suggested[0].hits.slice(0, 3).join(', ')})</span>
                </span>
              : <span className="dim" style={{ fontSize: 11.5 }}>no keyword matches yet, wire an offer or add a note</span>}
          </div>
        )}
        <select value={n.ref || ''} onChange={(e) => setRef(e.target.value)}>
          <option value="">pick {n.kind}{'…'}</option>
          {!isLander && offers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          {isLander && suggested.length > 0 && (
            <optgroup label={'✦ Suggested, keyword match'}>
              {suggested.map(({ l, hits }) => (
                <option key={l.id} value={l.id}>{l.name} {'·'} {hits.slice(0, 3).join(', ')}</option>
              ))}
            </optgroup>
          )}
          {isLander && (suggested.length > 0
            ? <optgroup label="All landers">{rest.map(({ l }) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
            : landers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>))}
        </select>
        <div className="finspect-actions">
          <button className="btn tiny ghost" onClick={dup}>{'⧉'} Duplicate</button>
          <button className="btn tiny danger" onClick={del}>Delete node</button>
        </div>
      </>
    );
  }
  // edge
  const e = graph.edges.find((x) => x.id === sel.id);
  if (!e) return null;
  const patch = (fn) => setGraph((g) => ({ ...g, edges: g.edges.map((x) => (x.id === e.id ? fn(x) : x)) }));
  const del = () => { setGraph((g) => ({ ...g, edges: g.edges.filter((x) => x.id !== e.id) })); setSel(null); };
  const siblings = graph.edges.filter((x) => x.from === e.from);
  return (
    <>
      <div className="finspect-h">{'→'} Connection</div>
      {siblings.length > 1 && <>
        <label>Weight (split share among {siblings.length} arrows)</label>
        <input type="number" min="0" value={e.weight} onChange={(ev) => patch((x) => ({ ...x, weight: Number(ev.target.value) || 0 }))} />
      </>}
      <label>Rule (optional, routes matching visitors here first; blank = fallback)</label>
      <RuleEditor when={e.when} rules={context?.rules || []} onChange={(w) => patch((x) => ({ ...x, when: w }))} />
      <div className="finspect-actions"><button className="btn tiny danger" onClick={del}>Delete connection</button></div>
    </>
  );
}
