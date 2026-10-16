import { isTerminalFilter, isCaught, effectiveWhen } from './rows.js';
import { setFilterAction, addFallbackOffer, deleteEdge } from './edit.js';
import { describeWhen } from './describe.js';
import { RuleEditor } from './RuleEditor.jsx';
import { RowList } from './RowEditor.jsx';

// A filter's side panel: what it catches, what happens to them (a bare 404, a challenge, or its
// fallback offer) and where everyone else goes. `head`, `name` and `actions` come from GraphInspector,
// so every box kind shares them.

const small = { fontSize: 12, marginTop: 8 };
const CHALLENGE_LABEL = { click: 'Click to continue', honeypot: 'Avoid a hidden button', timing: 'Wait before acting', motion: 'Move the mouse first' };
const FALLBACK_CHAINED = "Visitors this filter catches go to this offer instead of a 404. Visitors who don't match continue down the 'Passes' row.";
const FALLBACK_TERMINAL = 'This filter wins over every other matching row; the visitors it catches go to this offer.';

// A challenge filter's settings: type, timeout and what a failure looks like.
function ChallengeSettings({ n, setGraph }) {
  const ch = n.challenge || { type: 'click', timeout_ms: 8000, on_fail: '404' };
  const setCh = (patch) => setGraph((g) => ({ ...g, nodes: { ...g.nodes,
    [n.id]: { ...g.nodes[n.id], challenge: { ...ch, ...patch } } } }));
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
}

export function FilterPanel({ graph, setGraph, setSel, n, rules, offers = [], nameOf, patchNode, head, name, actions }) {
  const rowProps = { graph, setGraph, setSel, rules, nameOf, node: n };
  // like the engine: any line that isn't a fallback line lets visitors who don't match continue
  const chained = !isTerminalFilter(graph, n.id);
  const ins = graph.edges.filter((e) => e.to === n.id).length;
  const noCond = !n.when || typeof n.when !== 'object' || !Object.keys(n.when).length;
  const action = n.action === 'challenge' || n.action === 'fallback' ? n.action : '404';
  const lines = graph.edges.filter((e) => isCaught(e) && e.from === n.id && graph.nodes[e.to]);
  return (
    <>
      {head}
      {name}
      <label>What does this filter catch?</label>
      <RuleEditor key={n.id} when={n.when} rules={rules} onChange={(w) => patchNode({ when: w })} />

      <label style={{ marginTop: 12 }}>What happens to them?</label>
      <select value={action} onChange={(e) => setGraph((g) => setFilterAction(g, n.id, e.target.value))}>
        <option value="404">Bare 404, immediate, no page shown</option>
        <option value="challenge">Challenge first, a real page decides pass or fail</option>
        <option value="fallback">Send to a fallback offer</option>
      </select>

      {action === 'fallback' ? (
        <>
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn tiny" onClick={() => setGraph((g) => addFallbackOffer(g, n.id))}>+ New fallback offer</button>
          </div>
          <div className="dim" style={small}>To use an offer already in the flow, drag the red "+ fallback" handle on the filter onto it.</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            {lines.length ? <>
              <div className="dim" style={{ fontSize: 12 }}>Caught visitors go to:</div>
              {lines.map((e) => {
                const box = graph.nodes[e.to];
                // the offer picked in the box, named after the box's own name when that differs
                const picked = box.kind === 'offer' && offers.find((o) => o.id === box.ref)?.name;
                return (
                  <div key={e.id} style={{ marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <a href="#" onClick={(ev) => { ev.preventDefault(); setSel({ type: 'node', id: e.to }); }}>{nameOf(box)}</a>
                        {picked && picked !== nameOf(box) && <span className="dim">{' · '}{picked}</span>}
                        {effectiveWhen(graph, e) && <span className="dim">{' · only '}{describeWhen(effectiveWhen(graph, e), rules)}</span>}
                      </span>
                      <button type="button" className="btn tiny" aria-label="Remove this fallback offer" title="Remove" onClick={() => setGraph((g) => deleteEdge(g, e.id))}>{'✕'}</button>
                    </div>
                    {/* an offer box with nothing picked yet: pick it here, without opening the box */}
                    {box.kind === 'offer' && !box.ref && <>
                      <label style={{ marginTop: 8 }}>Which offer does it send to?</label>
                      <select value="" onChange={(ev) => setGraph((g) => ({ ...g, nodes: { ...g.nodes, [e.to]: { ...g.nodes[e.to], ref: ev.target.value } } }))}>
                        <option value="">Pick an offer{'…'}</option>
                        {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </>}
                  </div>
                );
              })}
            </> : <div className="dim">No fallback offer yet.</div>}
          </div>
          <div className="dim" style={small}>{chained ? FALLBACK_CHAINED : FALLBACK_TERMINAL}</div>
        </>
      ) : action === 'challenge' ? (
        <ChallengeSettings n={n} setGraph={setGraph} />
      ) : (
        <div className="dim" style={small}>
          A match gets a plain <b>404</b>, the same response as a link that never existed, and
          nothing is recorded: no click, no visit, no cost. {chained
            ? 'Anyone who doesn\'t match continues down this box\'s "Passes" row.'
            : 'This filter wins over every other matching row, so nothing leaks past it.'}
        </div>
      )}

      {chained && <>
        <label style={{ marginTop: 12 }}>Where do visitors who don't match go?</label>
        <RowList {...rowProps} rows={(r) => r.kind !== 'caught'} />
      </>}
      {noCond && <div className="err" style={{ marginTop: 8 }}>
        No condition: this filter would block every visitor</div>}
      {ins === 0 && <div className="err" style={{ marginTop: 8 }}>
        Nothing leads into this filter, so it filters nothing. Drag a row's dot onto it.</div>}
      <div className="dim" style={small}>
        {chained
          ? 'Visitors who don\'t match continue past it. Drag the "Passes" row\'s dot to change where they go.'
          : `Nothing continues past it: the row into it only lets matching visitors in, and they are ${action === 'fallback' ? 'sent to its fallback offer' : 'blocked'}. Drag from "+ add" to a page or offer to let the others continue through it instead.`}
      </div>
      {actions}
    </>
  );
}
