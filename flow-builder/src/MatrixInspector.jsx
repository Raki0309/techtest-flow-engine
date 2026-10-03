// A matrix node: one key ({t1} or a custom param), N rows of value -> lander/offer. Authored as
// one node; the engine's expandMatrix (../src/expand-matrix.js) rewrites it at compile time into
// a path + ruled rows, so the router and reports see ordinary lander/offer nodes.
export function MatrixInspector({ n, graph, setGraph, landers, offers, setNote, dup, del }) {
  const patch = (p) => setGraph((g) => ({ ...g, nodes: { ...g.nodes, [n.id]: { ...g.nodes[n.id], ...p } } }));
  const rows = n.rows || [];
  const setRow = (i, p) => patch({ rows: rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const isParam = n.key?.type === 'param';
  const targets = n.of === 'lander' ? landers : offers;
  const outs = graph.edges.filter((e) => e.from === n.id && graph.nodes[e.to]?.kind !== 'pixel').length;
  const ins = graph.edges.filter((e) => e.to === n.id).length;
  const dupe = rows.map((r) => String(r.value || '').trim()).find((v, i, a) => v && a.indexOf(v) !== i);
  return (
    <>
      <div className="finspect-h">{'▦'} Matrix (lookup table)</div>
      <label>Note (shown on the node)</label>
      <input value={n.note || ''} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Offer by sub-id" />
      <label>Routes to</label>
      <div className="chips" style={{ marginBottom: 6 }}>
        {['offer', 'lander'].map((of) => (
          <button key={of} type="button" className={`chip ${n.of === of ? 'on' : ''}`}
            onClick={() => {
              if (n.of === of) return;
              // An offer matrix is terminal — dropping to 'offer' while an outgoing arrow survives
              // from when this was a lander matrix would leave the node in a shape validateGraph
              // refuses. Strip it here instead of erroring on save.
              setGraph((g) => ({ ...g,
                nodes: { ...g.nodes, [n.id]: { ...g.nodes[n.id], of, rows: rows.map((r) => ({ ...r, ref: '' })), fallback: undefined } },
                edges: of === 'offer' ? g.edges.filter((e) => !(e.from === n.id && g.nodes[e.to]?.kind !== 'pixel')) : g.edges
              }));
            }}>{of}s</button>
        ))}
      </div>
      <label>Key, the URL value each row is matched against</label>
      <div className="chips" style={{ marginBottom: 6 }}>
        <button type="button" className={`chip ${!isParam ? 'on' : ''}`} title="the campaign's 1st traffic-source token"
          onClick={() => patch({ key: { type: 'token', slot: 1 } })}>{'{t1}'}</button>
        <button type="button" className={`chip ${isParam ? 'on' : ''}`} title="a URL parameter of your choosing"
          onClick={() => !isParam && patch({ key: { type: 'param', key: '' } })}>custom UTM</button>
      </div>
      {isParam && <input className="mono" style={{ marginBottom: 6 }} placeholder="param e.g. offer" value={n.key.key || ''}
        onChange={(e) => patch({ key: { type: 'param', key: e.target.value.trim() } })} />}
      <label>Rows, value {'→'} {n.of}</label>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input className="mono" style={{ flex: 1 }} placeholder="value" value={r.value || ''} onChange={(e) => setRow(i, { value: e.target.value })} />
          <select style={{ flex: 1.4 }} value={r.ref || ''} onChange={(e) => setRow(i, { ref: e.target.value })}>
            <option value="">pick {n.of}{'…'}</option>
            {targets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <button type="button" className="btn tiny ghost" onClick={() => patch({ rows: rows.filter((_, j) => j !== i) })}>{'✕'}</button>
        </div>
      ))}
      <button type="button" className="btn tiny ghost" onClick={() => patch({ rows: [...rows, { value: '', ref: '' }] })}>+ row</button>
      <label style={{ marginTop: 10 }}>No match {'→'} (blank = those visitors dead-end)</label>
      <select value={n.fallback || ''} onChange={(e) => patch({ fallback: e.target.value || undefined })}>
        <option value="">none</option>
        {targets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {!rows.length && <div className="err" style={{ marginTop: 8 }}>No rows, the flow will not validate until you add one.</div>}
      {dupe && <div className="err" style={{ marginTop: 8 }}>Value "{dupe}" appears twice.</div>}
      {ins === 0 && <div className="err" style={{ marginTop: 8 }}>Nothing routes into this matrix. Drag an arrow into it.</div>}
      {n.of === 'lander' && outs === 0 && <div className="err" style={{ marginTop: 8 }}>A lander matrix needs an arrow to what comes next (an offer, or another matrix).</div>}
      <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
        {n.of === 'lander'
          ? 'Every row continues down this node\'s arrow. A pixel edged to this node fires on whichever lander the row picks.'
          : 'Terminal, the matched offer is the redirect target.'}
      </div>
      <div className="finspect-actions">
        <button className="btn tiny ghost" onClick={dup}>{'⧉'} Duplicate</button>
        <button className="btn tiny danger" onClick={del}>Delete matrix</button>
      </div>
    </>
  );
}
