import { useEffect, useMemo, useRef, useState } from 'react';
import { NODE_W, HEADER_H, ROW_H, ADD_H, END_W, END_DROP, gid, layoutGraph, placeMissing, matrixText, rowPortY,
  canAddFrom, boxHeight, endBoxHeight, nodeFootprint, retargetAllowed, isEntryNode } from './helpers.js';
import { nodeRows, lineStyle, pixelLineStyle, HIGHLIGHT, BLOCKED_RED, PALETTE } from './rows.js';
import { addRowEdge, retargetEdge, deleteEdge, removeNode } from './edit.js';
import { challengeShort } from './simulate.js';
import { NodeBox } from './NodeBox.jsx';
import { Legend } from './Legend.jsx';

// The canvas. Every node lists its outgoing connections as rows (rows.js), each row has its own
// exit dot, lines are styled by meaning, every filter gets an automatic 404 / challenge end box that
// hangs below it ("falls out of the flow"), and the flow reads left to right. Geometry is fixed
// (helpers.js), so nothing is measured.
// Module-level node clipboard: a copied node survives closing the builder, so it can be pasted
// into another flow too (refs are catalog-global lander/offer ids).
let _gClip = null;

const GRID = 20, snap = (v) => Math.round(v / GRID) * GRID;
const ARROW_COLORS = [...new Set([...Object.values(PALETTE), BLOCKED_RED])];
const arrowId = (color) => `garw-${String(color).replace('#', '')}`;
// horizontal S-curve: both tangents horizontal
const sCurve = (a, b) => {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
};
// pixel lines leave a node's bottom centre downwards, then arrive horizontally
const dropCurve = (a, b) => {
  const dy = Math.max(40, Math.abs(b.y - a.y) / 2), dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
};
const inSet = (s, v) => !!s && (typeof s.has === 'function' ? s.has(v) : Array.isArray(s) && s.includes(v));

// Rows, box height and column footprint (box + a filter's end box below it) of every node.
function measure(graph, rules, readOnly) {
  const rowsOf = {}, hOf = {}, fpOf = {};
  for (const [id, n] of Object.entries(graph.nodes || {})) {
    if (!n) continue;
    rowsOf[id] = nodeRows(graph, id, rules);
    hOf[id] = boxHeight(n, rowsOf[id].length, !readOnly && canAddFrom(n));
    fpOf[id] = nodeFootprint(graph, id, rules, readOnly);
  }
  return { rowsOf, hOf, fpOf };
}

// retargetEdge has no guards: helpers.retargetAllowed refuses entry, own node, existing target, pixel.
const retargetGuarded = (g, edgeId, to) => (retargetAllowed(g, edgeId, to) ? retargetEdge(g, edgeId, to) : g);
// "+ add" may still draw a tracking line to a pixel.
const addGuarded = (g, from, to) => (!g.nodes[to] || isEntryNode(g, to) ? g : addRowEdge(g, from, to));
// Fill in what old flows may lack (edge ids, node positions), laid out with the real footprints.
function completeGraph(g, rules, readOnly) {
  const g1 = { ...g, edges: (g.edges || []).map((e) => (e.id ? e : { ...e, id: gid() })) };
  return { ...g1, nodes: placeMissing(g1.nodes || {}, g1.edges, (id) => nodeFootprint(g1, id, rules, readOnly)) };
}
const hasPos = (n) => !n || (Number.isFinite(n.x) && Number.isFinite(n.y));

export function GraphCanvas({ graph, setGraph, sel, setSel, landers = [], offers = [], pixels = [], rules = [], problems = null, highlight = null, readOnly = false }) {
  const catalog = useMemo(() => ({
    lander: Object.fromEntries(landers.map((l) => [l.id, l.name])),
    offer: Object.fromEntries(offers.map((o) => [o.id, o.name])),
    pixel: Object.fromEntries(pixels.map((p) => [p.id, p.name])),
  }), [landers, offers, pixels]);
  const scrollRef = useRef(null);
  const [drag, setDrag] = useState(null);   // {id, dx, dy}: moving a node
  const [conn, setConn] = useState(null);   // {from, edgeId|null, ax, ay, x, y}: dragging an exit
  const edges = graph.edges || [];
  const { rowsOf, hOf, fpOf } = useMemo(() => measure(graph, rules, readOnly), [graph, rules, readOnly]);
  // first paint of an old flow without positions: the same layout the effect below stores
  const nodes = useMemo(() => placeMissing(graph.nodes || {}, graph.edges || [], (id) => fpOf[id]), [graph.nodes, graph.edges, fpOf]);

  // old flows may lack edge ids and node positions: fill them in ONCE (on load, or whenever they
  // appear) and store them, so rows can be selected, dragged and deleted and nodes never jump
  useEffect(() => {
    if (readOnly) return;
    if (Object.values(graph.nodes || {}).every(hasPos) && edges.every((e) => e.id)) return;
    setGraph((g) => completeGraph(g, rules, readOnly));
  }, [graph, readOnly]);

  const relPos = (e) => {
    const el = scrollRef.current, r = el.getBoundingClientRect();
    return { x: e.clientX - r.left + el.scrollLeft, y: e.clientY - r.top + el.scrollTop };
  };

  const onNodeDown = (e, id) => {
    if (readOnly) { setSel({ type: 'node', id }); return; }
    if (e.target.closest('.gexit.drag, .gadd')) return;   // exits start a connection, not a move
    e.stopPropagation();
    const n = nodes[id], p = relPos(e);
    setDrag({ id, dx: p.x - n.x, dy: p.y - n.y }); setSel({ type: 'node', id });
  };
  const startConn = (e, from, edgeId, a) => {
    if (readOnly) return;
    e.stopPropagation(); e.preventDefault();
    const p = relPos(e);
    setConn({ from, edgeId, ax: a.x, ay: a.y, x: p.x, y: p.y });
  };
  const onMove = (e) => {
    if (drag) {
      const p = relPos(e);
      setGraph((g) => ({ ...g, nodes: { ...g.nodes, [drag.id]: { ...g.nodes[drag.id], x: Math.max(0, p.x - drag.dx), y: Math.max(0, p.y - drag.dy) } } }));
    } else if (conn) { const p = relPos(e); setConn((c) => ({ ...c, x: p.x, y: p.y })); }
  };
  const onUp = (e) => {
    if (conn) {
      const to = e.target?.closest?.('.gnode')?.dataset?.id;
      if (to) setGraph((g) => (conn.edgeId ? retargetGuarded(g, conn.edgeId, to) : addGuarded(g, conn.from, to)));
      setConn(null);
    }
    if (drag) setGraph((g) => { const n = g.nodes[drag.id]; if (!n) return g;   // snap to grid on release
      return { ...g, nodes: { ...g.nodes, [drag.id]: { ...n, x: snap(n.x), y: snap(n.y) } } }; });
    setDrag(null);
  };

  const addNode = (kind) => {
    const id = gid();
    const x = snap(80 + (scrollRef.current?.scrollLeft || 0)), y = snap(120 + (scrollRef.current?.scrollTop || 0));
    const node = kind === 'filter' ? { id, kind, when: null, x, y }
      : kind === 'matrix' ? { id, kind, of: 'offer', key: { type: 'token', slot: 1 }, rows: [], x, y }
      : (kind === 'route' || kind === 'split') ? { id, kind, x, y }
      : { id, kind, ref: '', x, y };   // lander (page), offer, pixel
    setGraph((g) => ({ ...g, nodes: { ...g.nodes, [id]: node } }));
    setSel({ type: 'node', id });
  };

  const delNode = (id) => setGraph((g) => removeNode(g, id));   // refuses the entry, renumbers priorities

  const dupNode = (id) => {
    const n = nodes[id]; if (!n || isEntryNode(graph, id)) return;
    const nid = gid();
    setGraph((g) => ({ ...g, nodes: { ...g.nodes, [nid]: { ...n, id: nid, x: snap(n.x + 40), y: snap(n.y + 40) } } }));
    setSel({ type: 'node', id: nid });
  };

  // Arrange: left-to-right layout using each node's real footprint (a filter's end box included),
  // then scroll back to the start
  const arrange = () => {
    setGraph((g) => {
      const laid = structuredClone(g.nodes); layoutGraph(laid, g.edges || [], (id) => nodeFootprint(g, id, rules, readOnly));
      return { ...g, nodes: laid };
    });
    setSel(null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo?.({ left: 0, top: 0, behavior: 'smooth' }));
  };

  // keyboard: Del/Backspace delete, Cmd/Ctrl+D duplicate, Cmd/Ctrl+C copy, Cmd/Ctrl+V paste, Esc
  const pasteBump = useRef(0);   // fans repeated pastes out so they don't stack exactly
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Escape') { setSel(null); return; }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'c' || e.key === 'C')) {
        if (String(window.getSelection() || '').length) return;  // real text copy wins
        const n = sel?.type === 'node' ? graph.nodes[sel.id] : null;
        if (n && !isEntryNode(graph, sel.id)) {
          e.preventDefault();
          const { id, x, y, ...cfg } = n;   // config only, paste mints id + position
          _gClip = structuredClone(cfg);
          pasteBump.current = 0;
        }
        return;
      }
      if (mod && (e.key === 'v' || e.key === 'V')) {
        if (!_gClip) return;
        e.preventDefault();
        const id = gid();
        pasteBump.current += 1;
        const x = snap(120 + 30 * pasteBump.current + (scrollRef.current?.scrollLeft || 0));
        const y = snap(140 + 30 * pasteBump.current + (scrollRef.current?.scrollTop || 0));
        setGraph((g) => ({ ...g, nodes: { ...g.nodes, [id]: { ...structuredClone(_gClip), id, x, y } } }));
        setSel({ type: 'node', id });
        return;
      }
      if (!sel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (sel.type === 'edge') setGraph((g) => deleteEdge(g, sel.id));   // renumbers the source's priorities
        else if (sel.type === 'node' && !isEntryNode(graph, sel.id)) delNode(sel.id);
        setSel(null);
      } else if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (sel.type === 'node') dupNode(sel.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [readOnly, sel, graph]);

  // ── what to draw ──────────────────────────────────────────────────────────
  const nodeList = Object.values(nodes).filter(Boolean);
  const hiOn = !!highlight;
  const nameOf = (n) => n.note || catalog[n.kind]?.[n.ref] || (n.kind === 'matrix' ? matrixText(n) : '');

  // lines: one per row, then pixel lines, then any other edge (so nothing is ever hidden)
  const lines = [];
  const drawn = new Set();
  const edgeById = new Map(edges.filter((e) => e.id).map((e) => [e.id, e]));
  const styleOf = {};
  for (const n of nodeList) {
    styleOf[n.id] = [];
    (rowsOf[n.id] || []).forEach((r, i) => {
      const edge = (r.edgeId && edgeById.get(r.edgeId)) || edges.find((e) => e.from === n.id && e.to === r.targetId && !drawn.has(e));
      const s = r.kind === 'blocked' ? lineStyle(r) : lineStyle(r, edge);
      styleOf[n.id][i] = s;
      const t = r.targetId && nodes[r.targetId];
      if (!t) return;
      if (edge) drawn.add(edge);
      const a = { x: n.x + NODE_W, y: rowPortY(n, i) };
      lines.push({ key: `r:${n.id}:${r.key}`, d: sCurve(a, { x: t.x, y: t.y + HEADER_H / 2 }), s, edgeId: edge?.id,
        label: r.share != null ? { x: a.x + 12, y: a.y - 6, text: `${r.share}%` } : null });
    });
  }
  for (const e of edges) {
    const f = nodes[e.from], t = nodes[e.to];
    if (drawn.has(e) || !f || !t) continue;
    const key = `x:${e.id || `${e.from}>${e.to}`}`;
    // pixel lines leave the bottom centre (a filter's: its bottom-left quarter, the centre is the drop line)
    const px = f.x + (f.kind === 'filter' ? NODE_W / 4 : NODE_W / 2);
    if (t.kind === 'pixel') lines.push({ key, edgeId: e.id, s: pixelLineStyle(), d: dropCurve({ x: px, y: f.y + hOf[f.id] }, { x: t.x, y: t.y + hOf[t.id] / 2 }) });
    else lines.push({ key, edgeId: e.id, s: lineStyle({ style: 'plain' }, e), d: sCurve({ x: f.x + NODE_W, y: f.y + HEADER_H / 2 }, { x: t.x, y: t.y + HEADER_H / 2 }) });
  }

  // automatic end box under every filter (not stored, cannot be dragged): the blocked visitors
  // "fall out of the flow" down a red line from the node's bottom centre to the box's top centre
  const ends = nodeList.filter((n) => n.kind === 'filter').map((n) => {
    const cx = n.x + NODE_W / 2, bottom = n.y + hOf[n.id];
    return { id: n.id, cx, bottom, top: bottom + END_DROP, h: endBoxHeight(n), hi: hiOn && highlight.endFor === n.id,
      text: n.action === 'challenge' ? [`Challenge · ${challengeShort(n.challenge)}`, 'pass → continues · fail → 404'] : ['404 page · nothing recorded'] };
  });

  const bounds = nodeList.reduce((m, n) => ({
    w: Math.max(m.w, n.x + NODE_W + 80),
    h: Math.max(m.h, n.y + (fpOf[n.id] || 0) + 200),
  }), { w: 600, h: 400 });

  const line = (L) => {
    const hi = hiOn && !!L.edgeId && inSet(highlight.edges, L.edgeId);
    const faded = (hiOn && !hi) || (!!conn?.edgeId && conn.edgeId === L.edgeId);
    const isSel = sel?.type === 'edge' && !!L.edgeId && sel.id === L.edgeId;
    return (
      <g key={L.key} className={faded ? 'faded' : ''} style={{ cursor: L.edgeId ? 'pointer' : 'default' }}
        onClick={(ev) => { ev.stopPropagation(); if (L.edgeId) setSel({ type: 'edge', id: L.edgeId }); }}>
        {isSel && <path d={L.d} fill="none" stroke="var(--accent)" strokeOpacity=".35" strokeWidth={L.s.width + 6} />}
        <path d={L.d} fill="none" stroke={L.s.color} strokeWidth={L.s.width} strokeDasharray={L.s.dash || undefined} markerEnd={`url(#${arrowId(L.s.color)})`} />
        {hi && <path d={L.d} fill="none" stroke={HIGHLIGHT.color} strokeWidth={HIGHLIGHT.width} strokeOpacity=".9" strokeLinecap="round" />}
        <path d={L.d} fill="none" stroke="transparent" strokeWidth="14" />
        {L.label && <text x={L.label.x} y={L.label.y} className="gline-lbl" fill={L.s.color}>{L.label.text}</text>}
      </g>
    );
  };

  return (
    <div className="gwrap" onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      <div className="gcanvas" ref={scrollRef}
        onClick={(e) => { if (e.target === scrollRef.current || e.target.classList.contains('gcanvas-inner') || e.target.tagName === 'svg') setSel(null); }}>
        <div className="gcanvas-inner" style={{ width: bounds.w, height: bounds.h }}>
          <svg width={bounds.w} height={bounds.h} className="gsvg">
            <defs>
              {ARROW_COLORS.map((c) => (
                <marker key={c} id={arrowId(c)} viewBox="0 0 8 8" markerWidth="8" markerHeight="8" refX="12" refY="4" markerUnits="userSpaceOnUse" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill={c} />
                </marker>
              ))}
            </defs>
            {lines.map(line)}
            {ends.map((en) => (
              <g key={`end:${en.id}`} className={hiOn && !en.hi ? 'faded' : ''}>
                <path d={`M ${en.cx} ${en.bottom} V ${en.top}`} stroke={BLOCKED_RED} strokeWidth="2" markerEnd={`url(#${arrowId(BLOCKED_RED)})`} />
                {en.hi && <path d={`M ${en.cx} ${en.bottom} V ${en.top}`} stroke={HIGHLIGHT.color} strokeWidth={HIGHLIGHT.width} strokeLinecap="round" />}
              </g>
            ))}
            {conn && <path d={sCurve({ x: conn.ax, y: conn.ay }, { x: conn.x, y: conn.y })} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 4" pointerEvents="none" />}
          </svg>
          {nodeList.map((n) => {
            const rows = rowsOf[n.id] || [];
            const add = !readOnly && canAddFrom(n);
            const rowCount = Math.max(1, rows.length);
            return (
              <NodeBox key={n.id} n={n} name={nameOf(n)} catalogName={catalog[n.kind]?.[n.ref]} rows={rows} styles={styleOf[n.id] || []} height={hOf[n.id]}
                add={add} selected={sel?.type === 'node' && sel.id === n.id} faded={hiOn && !inSet(highlight.nodes, n.id)}
                problems={problems?.[n.id]} readOnly={readOnly}
                onDown={(e) => onNodeDown(e, n.id)}
                onExitDown={(e, r, i) => startConn(e, n.id, r.edgeId, { x: n.x + NODE_W, y: rowPortY(n, i) })}
                onAddDown={(e) => startConn(e, n.id, null, { x: n.x + NODE_W, y: n.y + HEADER_H + rowCount * ROW_H + ADD_H / 2 })} />
            );
          })}
          {ends.map((en) => (
            <div key={`endbox:${en.id}`} className={`gend${en.hi ? ' hi' : ''}${hiOn && !en.hi ? ' faded' : ''}`}
              style={{ left: en.cx, top: en.top, minWidth: END_W, height: en.h }}>
              {en.text.map((t, i) => <div key={i} className={i ? 'gend-2' : 'gend-1'}>{t}</div>)}
            </div>
          ))}
        </div>
      </div>
      <div className="gdock">
        {!readOnly && (
          <div className="gpalette">
            <span className="dim" style={{ fontSize: 11, fontWeight: 700 }}>Add</span>
            <button className="btn tiny" onClick={() => addNode('filter')}>{'⊘'} Filter</button>
            <button className="btn tiny" onClick={() => addNode('route')}>{'⑃'} Route</button>
            <button className="btn tiny" onClick={() => addNode('split')}>{'⇉'} A/B split</button>
            <button className="btn tiny" onClick={() => addNode('lander')}>{'▢'} Page</button>
            <button className="btn tiny" onClick={() => addNode('offer')}>{'◎'} Offer</button>
            <button className="btn tiny" onClick={() => addNode('pixel')}>{'⊙'} Tracking pixel</button>
            <button className="btn tiny" onClick={() => addNode('matrix')}>{'▦'} Lookup table</button>
            <span className="gpalette-sep" />
            <button className="btn tiny ghost" title="Lay the flow out left to right" onClick={arrange}>{'⤢'} Arrange</button>
          </div>
        )}
        <Legend />
      </div>
    </div>
  );
}
