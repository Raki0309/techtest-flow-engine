// Shared helpers for the graph builder. Extracted verbatim from RoninConv's apps/ui/src/App.jsx.
import { nodeRows } from './rows.js';

export const DEVICES = ['mobile', 'desktop', 'tablet'];
export const OSES = ['ios', 'android', 'windows', 'macos', 'linux', 'other'];
export const gid = () => 'n' + crypto.randomUUID().slice(0, 8);
// The flow's start ("Visitors arrive"): new kind 'entry', old 'traffic' entries, or graph.entry.
// It can't be deleted, duplicated or copied.
export const isEntryNode = (graph, id) => id === (graph.entry || 'entry') || ['entry', 'traffic'].includes(graph.nodes?.[id]?.kind);

// Canvas geometry is fixed, so every port can be calculated without measuring the DOM.
export const NODE_W = 240, HEADER_H = 40, ROW_H = 34, ADD_H = 20;
export const nodeHeight = (rowCount, canAdd) => HEADER_H + Math.max(1, rowCount) * ROW_H + (canAdd ? ADD_H : 0);
export const rowPortY = (node, i) => node.y + HEADER_H + ROW_H * i + ROW_H / 2;
export const PIXEL_BODY_H = 60;
// A filter's automatic end box hangs END_DROP below the node, centred under it.
export const END_W = 170, END_DROP = 24;
export const endBoxHeight = (n) => (n?.kind === 'filter' ? (n.action === 'challenge' ? 44 : 30) : 0);

// Nodes that get a "+ add" exit (path and page lookup tables too: the old canvas let them connect).
const ADD_KINDS = new Set(['entry', 'traffic', 'route', 'split', 'lander', 'filter', 'path']);
export const canAddFrom = (n) => ADD_KINDS.has(n.kind) || (n.kind === 'matrix' && n.of === 'lander');
// The node box itself: pixels have a fixed explanation body, everything else is rows.
export const boxHeight = (n, rowCount, add) => (n.kind === 'pixel' ? HEADER_H + PIXEL_BODY_H : nodeHeight(rowCount, add));
// The height a node occupies in its column: its box, plus a filter's end box hanging below it.
export function nodeFootprint(graph, id, rules = [], readOnly = false) {
  const n = (graph.nodes || {})[id];
  if (!n) return 0;
  const box = boxHeight(n, nodeRows(graph, id, rules).length, !readOnly && canAddFrom(n));
  return n.kind === 'filter' ? box + END_DROP + endBoxHeight(n) : box;
}

// May a row's connection be re-pointed at `to`? Never at the entry, back at its own node, at a node
// the source already connects to, or at a pixel (pixel lines are not rows, so the row would vanish).
export function retargetAllowed(graph, edgeId, to) {
  const nodes = graph.nodes || {}, edges = graph.edges || [];
  const edge = edges.find((e) => e.id === edgeId);
  const t = nodes[to];
  if (!edge || !t || to === edge.from || t.kind === 'pixel') return false;
  if (to === (graph.entry || 'entry') || t.kind === 'entry' || t.kind === 'traffic') return false;
  return !edges.some((e) => e.from === edge.from && e.to === to);
}

// Build an editable graph from any stored routing (graph | tree | legacy paths | empty).
export function toGraph(routing) {
  if (routing?.graph?.nodes) {
    const g = structuredClone(routing.graph);
    g.edges = (g.edges || []).map((e) => ({ ...e, id: e.id || gid() }));
    g.nodes = placeMissing(g.nodes, g.edges);
    if (!g.entry) g.entry = 'entry';
    return g;
  }
  const nodes = { entry: { id: 'entry', kind: 'entry', x: 60, y: 40 } };
  const edges = [];
  const addEdge = (from, to, weight, when) => edges.push({ id: gid(), from, to, weight: weight || 1, when: when || null });
  const walkTree = (t, parent, weight, when) => {
    if (!t) return;
    if (t.type === 'split') { for (const b of t.branches || []) walkTree(b.node, parent, b.weight, b.when); return; }
    if (t.type === 'lander') { const id = gid(); nodes[id] = { id, kind: 'lander', ref: t.lander_id || '' }; addEdge(parent, id, weight, when); walkTree(t.next, id, 1, null); return; }
    if (t.type === 'offer') { const id = gid(); nodes[id] = { id, kind: 'offer', ref: t.offer_id || '' }; addEdge(parent, id, weight, when); }
  };
  const pathsWalk = (paths) => {
    for (const p of paths) {
      const offers = p.offers || [];
      const landers = p.landers || [];
      const mkOffer = () => { const oid = gid(); nodes[oid] = { id: oid, kind: 'offer', ref: (offers[0] || {}).id || '' }; return oid; };
      if (!landers.length) { const oid = mkOffer(); addEdge('entry', oid, p.weight, p.when); }
      else { const lid = gid(); nodes[lid] = { id: lid, kind: 'lander', ref: landers[0].id }; addEdge('entry', lid, p.weight, p.when); const oid = mkOffer(); addEdge(lid, oid, 1, null); }
    }
  };
  if (routing?.tree) walkTree(routing.tree, 'entry', 1, null);
  else if (routing?.paths?.length) pathsWalk(routing.paths);
  else if (routing?.offer_id) { const oid = gid(); nodes[oid] = { id: oid, kind: 'offer', ref: routing.offer_id }; addEdge('entry', oid, 1, null); }
  else { const oid = gid(); nodes[oid] = { id: oid, kind: 'offer', ref: '' }; addEdge('entry', oid, 1, null); }
  layoutGraph(nodes, edges);
  return { entry: 'entry', nodes, edges };
}

// Left-to-right layout (mutates `nodes`). Column = the LONGEST path from 'entry' (x = 40 + depth·300),
// so every arrow points right; edges that close a loop (back edges found while walking from entry)
// are ignored, so loops terminate. Each column stacks from y = 40 in reading order (breadth-first,
// children in the parent's row order). Unreachable nodes go to column 1, pixels to one extra column.
export function layoutGraph(nodes, edges = [], heightOf = () => 120) {
  const graph = { entry: 'entry', nodes, edges };
  const ids = Object.keys(nodes).filter((id) => nodes[id] && typeof nodes[id] === 'object');
  const isPixel = (id) => nodes[id].kind === 'pixel';
  const kids = {};
  const childrenOf = (id) => (kids[id] ||= (() => {
    const byRow = nodeRows(graph, id).map((r) => r.targetId).filter(Boolean);
    const rest = edges.filter((e) => e.from === id).map((e) => e.to);
    return [...new Set([...byRow, ...rest])].filter((to) => nodes[to] && !isPixel(to));
  })());

  // depth-first walk from entry: keep the edges that don't close a loop, collect a finishing order
  const state = {}, forward = {}, finished = [];
  const walk = (id) => {
    state[id] = 'open'; forward[id] = [];
    for (const to of childrenOf(id)) {
      if (state[to] === 'open') continue;   // back edge
      forward[id].push(to);
      if (!state[to]) walk(to);
    }
    state[id] = 'done'; finished.push(id);
  };
  const depth = {};
  if (nodes.entry && !isPixel('entry')) { walk('entry'); depth.entry = 0; }
  // reverse finishing order is a topological order of the loop-free edges: longest path in one pass
  for (const id of finished.reverse()) for (const to of forward[id]) depth[to] = Math.max(depth[to] ?? 0, depth[id] + 1);

  // reading order inside a column: breadth-first from entry, children in row order
  const order = depth.entry === 0 ? ['entry'] : [];
  const seen = new Set(order);
  for (let i = 0; i < order.length; i++) for (const to of childrenOf(order[i])) if (!seen.has(to)) { seen.add(to); order.push(to); }
  const main = [...order, ...ids.filter((id) => depth[id] == null && !isPixel(id))];
  const dOf = (id) => depth[id] ?? 1;
  const deepest = main.reduce((m, id) => Math.max(m, dOf(id)), 0);
  const nextY = new Map();
  const place = (id, d) => {
    const y = nextY.get(d) ?? 40;
    nodes[id].x = 40 + d * 300;
    nodes[id].y = y;
    nextY.set(d, y + (Number(heightOf(id)) || 120) + 40);
  };
  main.forEach((id) => place(id, dOf(id)));
  ids.filter(isPixel).forEach((id) => place(id, deepest + 1));
}

// Old flows can be saved without positions. Returns `nodes` itself when every node has one, else a
// copy where only the missing positions are filled in from the layout (the input is not mutated).
export function placeMissing(nodes, edges = [], heightOf) {
  const has = (n) => !n || (Number.isFinite(n.x) && Number.isFinite(n.y));
  if (Object.values(nodes).every(has)) return nodes;
  const laid = structuredClone(nodes);
  layoutGraph(laid, edges, heightOf);
  return Object.fromEntries(Object.entries(nodes).map(([id, n]) => [id, has(n) ? n : { ...n, x: laid[id].x, y: laid[id].y }]));
}

// The two URL-parameter chips write one cond each, in the rules-system format.
export const isT1Cond = (c) => c.type === 'token' && Number(c.slot) === 1 && (c.op || 'equals') === 'equals';
export const isParamCond = (c) => c.type === 'param' && (c.op || 'equals') === 'equals';

// ── AI suggest (lander nodes) — quick keyword matching, fully client-side ─────────────────────
const SUGGEST_STOP = new Set(['the', 'and', 'for', 'with', 'lander', 'landers', 'page', 'offer',
  'new', 'copy', 'html', 'index']);
const sugTokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/)
  .filter((t) => t.length >= 3 && !SUGGEST_STOP.has(t) && !/^\d+$/.test(t));
export function suggestLanders(landers, signals) {
  const sig = new Map();
  for (const [text, w] of signals) for (const t of sugTokens(text)) sig.set(t, Math.max(sig.get(t) || 0, w));
  return landers.map((l) => {
    const seen = new Set(); const hits = []; let score = 0;
    for (const t of sugTokens(`${l.name} ${l.source || ''}`)) {
      if (seen.has(t)) continue; seen.add(t);
      if (sig.has(t)) { score += sig.get(t); hits.push(t); }
    }
    return { l, score, hits };
  }).sort((a, b) => b.score - a.score || a.l.name.localeCompare(b.l.name));
}

// ── Matrix node ───────────────────────────────────────────────────────────────────────────────
export const matrixKeyText = (k) => k?.type === 'param' ? (k.key || 'param?') : `{t${k?.slot || 1}}`;
export function matrixText(n) {
  const rows = (n.rows || []).length;
  return `${matrixKeyText(n.key)} → ${rows} ${n.of === 'lander' ? 'lander' : 'offer'}${rows === 1 ? '' : 's'}${n.fallback ? ' + fallback' : ''}`;
}
