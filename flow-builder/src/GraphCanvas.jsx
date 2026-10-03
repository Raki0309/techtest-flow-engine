import { useEffect, useMemo, useRef, useState } from 'react';
import { GNODE_W, GNODE_H, gid, layoutGraph, ruleText, matrixText } from './helpers.js';

// The canvas: draggable nodes, connection handles, edges, live connect line.
// Nodes are variable-height (notes + full criteria wrap), so we measure each node's real height
// with a ResizeObserver and anchor edges to the measured bottom. `fit` scales the whole graph to
// fit the container (used by a read-only inline preview so every node is always visible).
// module-level node clipboard: a copied node survives closing the builder, so it can be pasted
// into another flow too (refs are catalog-global lander/offer ids)
let _gClip = null;

export function GraphCanvas({ graph, setGraph, sel, setSel, landers, offers, pixels = [], sourceName, readOnly = false, fit = false }) {
  const landerName = useMemo(() => Object.fromEntries(landers.map((l) => [l.id, l.name])), [landers]);
  const offerName = useMemo(() => Object.fromEntries(offers.map((o) => [o.id, o.name])), [offers]);
  const pixelName = useMemo(() => Object.fromEntries(pixels.map((p) => [p.id, p.name])), [pixels]);
  const wrapRef = useRef(null);
  const [drag, setDrag] = useState(null);       // {id, dx, dy} moving a node
  const [conn, setConn] = useState(null);       // {from, x, y} drawing an edge
  const [sizes, setSizes] = useState({});       // node id -> measured layout height (px)
  const [wrap, setWrap] = useState({ w: 0, h: 0 });  // canvas viewport size (for fit-scale)

  // One ResizeObserver watches every node (for real heights) and the wrapper (for fit-scaling).
  const nodeEls = useRef(new Map());
  const roRef = useRef(null);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      let ws = null; const hs = {};
      for (const en of entries) {
        if (en.target === wrapRef.current) ws = { w: en.target.clientWidth, h: en.target.clientHeight };
        else { const id = en.target.dataset.id; if (id) hs[id] = en.target.offsetHeight; }
      }
      if (ws) setWrap((p) => (p.w === ws.w && p.h === ws.h ? p : ws));
      if (Object.keys(hs).length) setSizes((p) => {
        const n = { ...p }; let ch = false;
        for (const k in hs) if (n[k] !== hs[k]) { n[k] = hs[k]; ch = true; }
        return ch ? n : p;
      });
    });
    roRef.current = ro;
    if (wrapRef.current) ro.observe(wrapRef.current);
    for (const el of nodeEls.current.values()) ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const setNodeRef = (id) => (el) => {
    const prev = nodeEls.current.get(id);
    if (prev && prev !== el) roRef.current?.unobserve(prev);
    if (el) { nodeEls.current.set(id, el); roRef.current?.observe(el); }
    else nodeEls.current.delete(id);
  };
  const hOf = (n) => sizes[n.id] || GNODE_H;
  const GRID = 20, snap = (v) => Math.round(v / GRID) * GRID;   // tidy alignment on drop

  const relPos = (e) => { const r = wrapRef.current.getBoundingClientRect(); return { x: e.clientX - r.left + wrapRef.current.scrollLeft, y: e.clientY - r.top + wrapRef.current.scrollTop }; };

  const onNodeDown = (e, id) => {
    if (readOnly) { setSel({ type: 'node', id }); return; }
    if (e.target.closest('.ghandle')) return;   // handle starts a connection, not a move
    e.stopPropagation();
    const n = graph.nodes[id]; const p = relPos(e);
    setDrag({ id, dx: p.x - n.x, dy: p.y - n.y }); setSel({ type: 'node', id });
  };
  const onHandleDown = (e, id) => { if (readOnly) return; e.stopPropagation(); const p = relPos(e); setConn({ from: id, x: p.x, y: p.y }); };

  const onMove = (e) => {
    if (drag) { const p = relPos(e); setGraph((g) => ({ ...g, nodes: { ...g.nodes, [drag.id]: { ...g.nodes[drag.id], x: Math.max(0, p.x - drag.dx), y: Math.max(0, p.y - drag.dy) } } })); }
    else if (conn) { const p = relPos(e); setConn((c) => ({ ...c, x: p.x, y: p.y })); }
  };
  const onUp = (e) => {
    if (conn) {
      const tgt = e.target.closest('.gnode');
      const to = tgt?.dataset?.id;
      if (to && to !== conn.from && to !== 'entry' && !graph.edges.some((ed) => ed.from === conn.from && ed.to === to)) {
        setGraph((g) => ({ ...g, edges: [...g.edges, { id: gid(), from: conn.from, to, weight: 1, when: null }] }));
      }
      setConn(null);
    }
    if (drag) setGraph((g) => { const n = g.nodes[drag.id]; if (!n) return g;   // snap to grid on release
      return { ...g, nodes: { ...g.nodes, [drag.id]: { ...n, x: snap(n.x), y: snap(n.y) } } }; });
    setDrag(null);
  };

  const addNode = (kind) => {
    const id = gid();
    const x = snap(80 + (wrapRef.current?.scrollLeft || 0)), y = snap(120 + (wrapRef.current?.scrollTop || 0));
    const node = (kind === 'path' || kind === 'filter') ? { id, kind, when: null, x, y }
      : kind === 'matrix' ? { id, kind, of: 'offer', key: { type: 'token', slot: 1 }, rows: [], x, y }
      : { id, kind, ref: '', x, y };
    setGraph((g) => ({ ...g, nodes: { ...g.nodes, [id]: node } }));
    setSel({ type: 'node', id });
  };

  const delNode = (id) => setGraph((g) => ({ ...g,
    nodes: Object.fromEntries(Object.entries(g.nodes).filter(([k]) => k !== id)),
    edges: g.edges.filter((e) => e.from !== id && e.to !== id) }));

  const dupNode = (id) => {
    const n = graph.nodes[id]; if (!n || n.kind === 'entry') return;
    const nid = gid();
    setGraph((g) => ({ ...g, nodes: { ...g.nodes, [nid]: { ...n, id: nid, x: snap(n.x + 40), y: snap(n.y + 40) } } }));
    setSel({ type: 'node', id: nid });
  };

  // auto-arrange: re-run the layered layout and scroll back to the graph
  const arrange = () => {
    setGraph((g) => { const nodes = structuredClone(g.nodes); layoutGraph(nodes, g.edges); return { ...g, nodes }; });
    setSel(null);
    requestAnimationFrame(() => wrapRef.current?.scrollTo?.({ left: 0, top: 0, behavior: 'smooth' }));
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
        if (n && n.kind !== 'entry') {
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
        const x = snap(120 + 30 * pasteBump.current + (wrapRef.current?.scrollLeft || 0));
        const y = snap(140 + 30 * pasteBump.current + (wrapRef.current?.scrollTop || 0));
        setGraph((g) => ({ ...g, nodes: { ...g.nodes, [id]: { ...structuredClone(_gClip), id, x, y } } }));
        setSel({ type: 'node', id });
        return;
      }
      if (!sel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (sel.type === 'edge') setGraph((g) => ({ ...g, edges: g.edges.filter((x) => x.id !== sel.id) }));
        else if (sel.type === 'node' && graph.nodes[sel.id]?.kind !== 'entry') delNode(sel.id);
        setSel(null);
      } else if (mod && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (sel.type === 'node') dupNode(sel.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [readOnly, sel, graph]);

  const nodeMeta = (n) => n.kind === 'entry' ? { ic: '▶', kind: (sourceName || 'Flow traffic'), label: '', cls: 'entry' }
    : n.kind === 'lander' ? { ic: '▢', kind: 'Lander', label: landerName[n.ref] || 'pick lander…', cls: 'lander' }
    : n.kind === 'path' ? { ic: '⑃', kind: 'Path', label: ruleText(n.when, true) || 'any traffic', cls: 'path' }
    : n.kind === 'filter' ? { ic: '⊘', kind: (n.action === 'challenge' ? 'Filter (challenge)' : 'Filter (404)')
        + (graph.edges.some((e) => e.from === n.id) ? ' · chained' : ''),
        label: ruleText(n.when, true) || 'no condition — blocks everyone', cls: 'path' }
    : n.kind === 'pixel' ? { ic: '⊙', kind: 'Pixel', label: pixelName[n.ref] || 'pick pixel…', cls: 'pixel' }
    : n.kind === 'matrix' ? { ic: '▦', kind: n.of === 'lander' ? 'Lander matrix' : 'Offer matrix', label: matrixText(n), cls: `matrix ${n.of === 'lander' ? 'mx-lander' : 'mx-offer'}` }
    : { ic: '◎', kind: 'Offer', label: offerName[n.ref] || 'pick offer…', cls: 'offer' };
  const anchorOut = (n) => ({ x: n.x + GNODE_W / 2, y: n.y + hOf(n) });
  const anchorIn = (n) => ({ x: n.x + GNODE_W / 2, y: n.y });
  const curve = (a, b) => `M ${a.x} ${a.y} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`;
  const nodesArr = Object.values(graph.nodes);
  const bounds = nodesArr.reduce((m, n) => ({ w: Math.max(m.w, n.x + GNODE_W + 80), h: Math.max(m.h, n.y + hOf(n) + 120) }), { w: 600, h: 400 });
  // weight label only where a node has >1 outgoing unconditional edge (a real split)
  const outCount = {};
  graph.edges.forEach((e) => { outCount[e.from] = (outCount[e.from] || 0) + 1; });

  // Fit-to-view: scale the whole graph so every node shows inside the preview box.
  let innerStyle = { width: bounds.w, height: bounds.h };
  if (fit && nodesArr.length && wrap.w && wrap.h) {
    const minX = Math.min(...nodesArr.map((n) => n.x)), minY = Math.min(...nodesArr.map((n) => n.y));
    const maxX = Math.max(...nodesArr.map((n) => n.x + GNODE_W)), maxY = Math.max(...nodesArr.map((n) => n.y + hOf(n)));
    const cw = Math.max(1, maxX - minX), ch = Math.max(1, maxY - minY), PAD = 18;
    const s = Math.min((wrap.w - PAD * 2) / cw, (wrap.h - PAD * 2) / ch, 1);
    innerStyle = { width: bounds.w, height: bounds.h,
      transform: `translate(${PAD}px,${PAD}px) scale(${s}) translate(${-minX}px,${-minY}px)`, transformOrigin: '0 0' };
  }

  return (
    <div className={`gcanvas${fit ? ' fit' : ''}`} ref={wrapRef} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
      onClick={(e) => { if (e.target === wrapRef.current || e.target.classList.contains('gcanvas-inner') || e.target.tagName === 'svg') setSel(null); }}>
      <div className="gcanvas-inner" style={innerStyle}>
        <svg width={bounds.w} height={bounds.h} className="gsvg">
          <defs><marker id="arw" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 z" fill="var(--faint)" /></marker></defs>
          {graph.edges.map((e) => {
            const a = anchorOut(graph.nodes[e.from] || {}), b = anchorIn(graph.nodes[e.to] || {});
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const isSel = sel?.type === 'edge' && sel.id === e.id;
            const lbl = e.when ? ruleText(e.when) : (outCount[e.from] > 1 ? `${e.weight}` : '');
            return (
              <g key={e.id} onClick={(ev) => { ev.stopPropagation(); setSel({ type: 'edge', id: e.id }); }} style={{ cursor: 'pointer' }}>
                <path d={curve(a, b)} fill="none" stroke={isSel ? 'var(--accent)' : 'var(--faint)'} strokeWidth={isSel ? 3 : 2} markerEnd="url(#arw)" />
                <path d={curve(a, b)} fill="none" stroke="transparent" strokeWidth="14" />
                {lbl && <foreignObject x={mid.x - 80} y={mid.y - 13} width="160" height="26" style={{ overflow: 'visible' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}><span className="gedge-lbl">{lbl}</span></div>
                </foreignObject>}
              </g>
            );
          })}
          {conn && (() => { const a = anchorOut(graph.nodes[conn.from] || {}); return <path d={curve(a, { x: conn.x, y: conn.y })} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 4" />; })()}
        </svg>
        {nodesArr.map((n) => {
          const m = nodeMeta(n);
          return (
            <div key={n.id} data-id={n.id} ref={setNodeRef(n.id)} className={`gnode ${m.cls} ${sel?.type === 'node' && sel.id === n.id ? 'sel' : ''}`}
              style={{ left: n.x, top: n.y, width: GNODE_W }} onPointerDown={(e) => onNodeDown(e, n.id)}>
              <div className={`gnode-kind${n.note ? ' noted' : ''}`}><span className="gnode-ic">{m.ic}</span>{n.note || m.kind}</div>
              {m.label && <div className="gnode-label">{m.label}</div>}
              {!readOnly && n.kind !== 'offer' && n.kind !== 'pixel' && !(n.kind === 'matrix' && n.of !== 'lander') && <div className="ghandle" title="drag to connect" onPointerDown={(e) => onHandleDown(e, n.id)} />}
            </div>
          );
        })}
      </div>
      {!readOnly && (
        <div className="gpalette">
          <span className="dim" style={{ fontSize: 11, fontWeight: 700 }}>ADD</span>
          <button className="btn tiny" onClick={() => addNode('path')}>{'⑃'} Path</button>
          <button className="btn tiny" onClick={() => addNode('filter')}>{'⊘'} Filter</button>
          <button className="btn tiny" onClick={() => addNode('lander')}>{'▢'} Lander</button>
          <button className="btn tiny" onClick={() => addNode('offer')}>{'◎'} Offer</button>
          <button className="btn tiny" onClick={() => addNode('pixel')}>{'⊙'} Pixel</button>
          <button className="btn tiny" onClick={() => addNode('matrix')}>{'▦'} Matrix</button>
          <span className="gpalette-sep" />
          <button className="btn tiny ghost" title="Auto-arrange & recenter" onClick={arrange}>{'⤢'} Arrange</button>
        </div>
      )}
    </div>
  );
}
