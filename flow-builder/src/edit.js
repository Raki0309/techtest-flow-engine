// Pure, immutable graph edits for the builder. Every function returns a new graph
// (or the same object when nothing changes) and never mutates its input.
import { gid, isEntryNode, boxHeight, canAddFrom, canAddFallbackFrom, nodeFootprint, endBoxHeight, endBoxText, snapUp, NODE_W, END_DROP } from './helpers.js';
import { effectiveWhen, nodeRows, isCaught } from './rows.js';
import { isEmptyWhen } from './describe.js';

// A filter's lines are on one of two sides: Passes, or the fallback ("caught") lines. Priorities,
// numbering and the duplicate check all work per side, decided by rows.js isCaught.
const sameSide = (a, b) => isCaught(a) === isCaught(b);
const hasLine = (graph, from, to, caught) => graph.edges.some((e) => e.from === from && e.to === to && isCaught(e) === caught);
const hasPriority = (e) => Number.isFinite(e.priority);
// Only a line with a real (effective) condition takes part in the priority order: its own `when`, or
// the `when` of the path / terminal filter it points at (rows.js effectiveWhen, like the engine).
// A line into a pixel never does (pixel lines are not rows).
const takesPriority = (graph, e) => (graph.nodes || {})[e.to]?.kind !== 'pixel' && !!effectiveWhen(graph, e);
const isNumbered = (graph, e) => hasPriority(e) && takesPriority(graph, e);
const withEdges = (graph, edges) => ({ ...graph, edges });
const mapEdge = (graph, edgeId, fn) => withEdges(graph, graph.edges.map((e) => (e.id === edgeId ? fn(e) : e)));
const without = (e, key) => { const { [key]: _drop, ...rest } = e; return rest; };

// Numbers fromId's conditional lines that have a priority 1..n per side (in their current order) and
// drops a leftover priority from any of its lines without an effective condition, so no hidden number remains.
export function renumberPriorities(graph, fromId) {
  const numbered = graph.edges.filter((e) => e.from === fromId && isNumbered(graph, e))
    .map((e, i) => ({ e, i }))
    .sort((x, y) => x.e.priority - y.e.priority || x.i - y.i);
  const next = new Map();
  for (const caught of [false, true]) numbered.filter(({ e }) => isCaught(e) === caught).forEach(({ e }, i) => next.set(e, i + 1));
  return withEdges(graph, graph.edges.map((e) => {
    if (e.from !== fromId) return e;
    if (next.has(e)) return e.priority === next.get(e) ? e : { ...e, priority: next.get(e) };
    return hasPriority(e) ? without(e, 'priority') : e;
  }));
}

export function addRowEdge(graph, fromId, toId) {
  if (toId === graph.entry || fromId === toId) return graph;
  if (hasLine(graph, fromId, toId, false)) return graph;
  return withEdges(graph, [...graph.edges, { id: gid(), from: fromId, to: toId, weight: 1, when: null }]);
}

export function retargetEdge(graph, edgeId, toId) {
  return mapEdge(graph, edgeId, (e) => ({ ...e, to: toId }));
}

// Deleting a filter's last fallback line brings its "no fallback offer yet" end box back, so the boxes
// under the filter make room for it (makeRoomForEndBox is a no-op for any other source).
export function deleteEdge(graph, edgeId) {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) return graph;
  const g = renumberPriorities(withEdges(graph, graph.edges.filter((e) => e.id !== edgeId)), edge.from);
  return makeRoomForEndBox(g, edge.from);
}

export function setEdgeWhen(graph, edgeId, when) {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) return graph;
  if (isEmptyWhen(when)) return renumberPriorities(mapEdge(graph, edgeId, (e) => without({ ...e, when: null }, 'priority')), edge.from);
  // a line that becomes conditional gets the next number, on every source except an A/B split
  // (and never a line into a pixel); a leftover number from before counts as none
  const numberable = (graph.nodes || {})[edge.from]?.kind !== 'split' && (graph.nodes || {})[edge.to]?.kind !== 'pixel';
  let priority = isNumbered(graph, edge) ? edge.priority : undefined;
  if (numberable && priority === undefined) {
    const used = graph.edges.filter((e) => e.from === edge.from && e.id !== edgeId && sameSide(e, edge) && isNumbered(graph, e)).map((e) => e.priority);
    priority = Math.max(0, ...used) + 1;
  }
  const g = mapEdge(graph, edgeId, (e) => (priority === undefined ? without({ ...e, when }, 'priority') : { ...e, when, priority }));
  return renumberPriorities(g, edge.from);
}

export function moveRow(graph, edgeId, dir) {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge || !isNumbered(graph, edge)) return graph;
  const sibs = graph.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.from === edge.from && sameSide(e, edge) && isNumbered(graph, e))
    .sort((x, y) => x.e.priority - y.e.priority || x.i - y.i).map(({ e }) => e);
  const at = sibs.findIndex((e) => e.id === edgeId);
  const other = sibs[at + dir];
  if (!other) return graph;
  const [pa, pb] = [edge.priority, other.priority];
  const g = withEdges(graph, graph.edges.map((e) => (e.id === edge.id ? { ...e, priority: pb } : e.id === other.id ? { ...e, priority: pa } : e)));
  return renumberPriorities(g, edge.from);
}

export function setEdgeColor(graph, edgeId, key) {
  return mapEdge(graph, edgeId, (e) => (key ? { ...e, color: key } : without(e, 'color')));
}

export function setEdgeWeight(graph, edgeId, n) {
  return mapEdge(graph, edgeId, (e) => ({ ...e, weight: n }));
}

// ── what a filter does with the visitors it catches: exactly one of 404, challenge, fallback lines ──
const DEFAULT_CHALLENGE = { type: 'click', timeout_ms: 8000, on_fail: '404' };
const mapNode = (graph, id, fn) => (graph.nodes?.[id] ? { ...graph, nodes: { ...graph.nodes, [id]: fn(graph.nodes[id]) } } : graph);
const outcomeOnly = (n) => without(n, 'challenge');

// When a filter shows its 404 / challenge end box again, the boxes under it in its column move down
// together, just enough to clear that box (20px, on the grid), so nothing hides behind it. Nothing else moves.
function makeRoomForEndBox(graph, filterId) {
  const f = graph.nodes[filterId];
  if (f?.kind !== 'filter' || !endBoxText(graph, filterId) || !Number.isFinite(f.x) || !Number.isFinite(f.y)) return graph;
  const boxBottom = f.y + boxHeight(f, nodeRows(graph, filterId).length, canAddFrom(f), canAddFallbackFrom(f));
  const need = snapUp(boxBottom + END_DROP + endBoxHeight(f) + 20);
  const below = Object.entries(graph.nodes).filter(([id, n]) => id !== filterId && n && Number.isFinite(n.x) && Number.isFinite(n.y)
    && n.x < f.x + NODE_W && n.x + NODE_W > f.x && n.y >= boxBottom);
  const top = Math.min(...below.map(([, n]) => n.y));
  if (!below.length || top >= need) return graph;
  return { ...graph, nodes: { ...graph.nodes, ...Object.fromEntries(below.map(([id, n]) => [id, { ...n, y: n.y + need - top }])) } };
}

// 404 and challenge drop the filter's fallback lines (the boxes stay). Fallback keeps any line it already
// has (none after a 404 or challenge, so the panel offers "+ New fallback offer") and drops the challenge.
export function setFilterAction(graph, id, action) {
  const dropLines = action !== 'fallback' && graph.edges.some((e) => e.from === id && isCaught(e));
  const g = dropLines ? withEdges(graph, graph.edges.filter((e) => !(e.from === id && isCaught(e)))) : graph;
  return makeRoomForEndBox(mapNode(g, id, (n) => {
    if (action === 'challenge') return { ...outcomeOnly(n), action, challenge: n.challenge || { ...DEFAULT_CHALLENGE } };
    return { ...outcomeOnly(n), action: action === 'fallback' ? action : '404' };
  }), id);
}

// Connects a filter's fallback to a box and makes fallback the filter's outcome. One fallback offer per
// filter: this removes the filter's other fallback lines (their boxes stay). Refused (same graph) for the
// entry, a pixel, the filter itself or a missing box. A box the filter's only fallback line already goes
// to keeps that line (it only makes sure fallback is the outcome).
export function addFallbackLine(graph, filterId, toId, id = gid()) {
  const nodes = graph.nodes || {};
  if (nodes[filterId]?.kind !== 'filter' || !nodes[toId] || nodes[toId].kind === 'pixel' || toId === filterId || isEntryNode(graph, toId)) return graph;
  const toFallback = (g) => mapNode(g, filterId, (n) => ({ ...outcomeOnly(n), action: 'fallback' }));
  const old = graph.edges.filter((e) => e.from === filterId && isCaught(e));
  if (old.length === 1 && old[0].to === toId) return nodes[filterId].action === 'fallback' ? graph : toFallback(graph);
  const kept = graph.edges.filter((e) => !(e.from === filterId && isCaught(e)));
  return toFallback(withEdges(graph, [...kept, { id, from: filterId, to: toId, weight: 1, when: null, caught: true }]));
}

// "+ New fallback offer": a new offer box one column right of the filter, with a fallback line from it.
// It takes the first free grid slot from the filter's top down, stepping past any box there (20px clearance).
export function addFallbackOffer(graph, filterId, newId = gid()) {
  const f = graph.nodes?.[filterId];
  if (f?.kind !== 'filter') return graph;
  const x = (f.x || 0) + 300, h = boxHeight({ kind: 'offer' }, 0, false);
  let y = snapUp(f.y || 0);
  const inColumn = Object.entries(graph.nodes).filter(([id, n]) => id !== filterId && n
    && Number.isFinite(n.x) && Number.isFinite(n.y) && n.x < x + NODE_W && n.x + NODE_W > x);
  for (let moved = true; moved;) {   // y only grows, so this ends
    moved = false;
    for (const [id, n] of inColumn) {
      const bottom = n.y + nodeFootprint(graph, id);
      if (n.y < y + h + 20 && bottom + 20 > y) { y = snapUp(bottom + 40); moved = true; }
    }
  }
  const box = { id: newId, kind: 'offer', ref: '', note: 'Fallback offer', x, y };
  return addFallbackLine({ ...graph, nodes: { ...graph.nodes, [newId]: box } }, filterId, newId);
}

// Removes a node and every connection touching it, then renumbers the priorities of every node that
// had a connection into it, so their numbered rows stay 1..n. Filters that had a fallback line into
// it keep the fallback choice, so Problems shows it, and get room for the 404 box that comes back.
// The entry (and a missing id) is refused.
export function removeNode(graph, nodeId) {
  if (!graph.nodes?.[nodeId] || isEntryNode(graph, nodeId)) return graph;
  const edges = graph.edges || [];
  const sources = [...new Set(edges.filter((e) => e.to === nodeId && e.from !== nodeId).map((e) => e.from))];
  const unlinked = [...new Set(edges.filter((e) => isCaught(e) && e.to === nodeId && e.from !== nodeId).map((e) => e.from))];
  const rest = { ...graph,
    nodes: Object.fromEntries(Object.entries(graph.nodes).filter(([k]) => k !== nodeId)),
    edges: edges.filter((e) => e.from !== nodeId && e.to !== nodeId) };
  const roomy = unlinked.reduce((g, id) => makeRoomForEndBox(g, id), rest);
  return sources.reduce((g, from) => renumberPriorities(g, from), roomy);
}
