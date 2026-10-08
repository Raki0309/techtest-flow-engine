// Pure, immutable graph edits for the builder. Every function returns a new graph
// (or the same object when nothing changes) and never mutates its input.
import { gid, isEntryNode } from './helpers.js';
import { effectiveWhen } from './rows.js';
import { isEmptyWhen } from './describe.js';

const hasPriority = (e) => Number.isFinite(e.priority);
// Only a line with a real (effective) condition takes part in the priority order: its own `when`, or
// the `when` of the path / terminal filter it points at (rows.js effectiveWhen, like the engine).
// A line into a pixel never does (pixel lines are not rows).
const takesPriority = (graph, e) => (graph.nodes || {})[e.to]?.kind !== 'pixel' && !!effectiveWhen(graph, e);
const isNumbered = (graph, e) => hasPriority(e) && takesPriority(graph, e);
const withEdges = (graph, edges) => ({ ...graph, edges });
const mapEdge = (graph, edgeId, fn) => withEdges(graph, graph.edges.map((e) => (e.id === edgeId ? fn(e) : e)));
const without = (e, key) => { const { [key]: _drop, ...rest } = e; return rest; };

// Numbers fromId's conditional lines that have a priority 1..n (in their current order) and drops a
// leftover priority from any of its lines without an effective condition, so no hidden number remains.
export function renumberPriorities(graph, fromId) {
  const numbered = graph.edges.filter((e) => e.from === fromId && isNumbered(graph, e))
    .map((e, i) => ({ e, i }))
    .sort((x, y) => x.e.priority - y.e.priority || x.i - y.i);
  const next = new Map(numbered.map(({ e }, i) => [e, i + 1]));
  return withEdges(graph, graph.edges.map((e) => {
    if (e.from !== fromId) return e;
    if (next.has(e)) return e.priority === next.get(e) ? e : { ...e, priority: next.get(e) };
    return hasPriority(e) ? without(e, 'priority') : e;
  }));
}

export function addRowEdge(graph, fromId, toId) {
  if (toId === graph.entry || fromId === toId) return graph;
  if (graph.edges.some((e) => e.from === fromId && e.to === toId)) return graph;
  return withEdges(graph, [...graph.edges, { id: gid(), from: fromId, to: toId, weight: 1, when: null }]);
}

export function retargetEdge(graph, edgeId, toId) {
  return mapEdge(graph, edgeId, (e) => ({ ...e, to: toId }));
}

export function deleteEdge(graph, edgeId) {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) return graph;
  return renumberPriorities(withEdges(graph, graph.edges.filter((e) => e.id !== edgeId)), edge.from);
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
    const used = graph.edges.filter((e) => e.from === edge.from && e.id !== edgeId && isNumbered(graph, e)).map((e) => e.priority);
    priority = Math.max(0, ...used) + 1;
  }
  const g = mapEdge(graph, edgeId, (e) => (priority === undefined ? without({ ...e, when }, 'priority') : { ...e, when, priority }));
  return renumberPriorities(g, edge.from);
}

export function moveRow(graph, edgeId, dir) {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge || !isNumbered(graph, edge)) return graph;
  const sibs = graph.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.from === edge.from && isNumbered(graph, e))
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

// Removes a node and every connection touching it, then renumbers the priorities of every node that
// had a connection into it, so their numbered rows stay 1..n. The entry (and a missing id) is refused.
export function removeNode(graph, nodeId) {
  if (!graph.nodes?.[nodeId] || isEntryNode(graph, nodeId)) return graph;
  const edges = graph.edges || [];
  const sources = [...new Set(edges.filter((e) => e.to === nodeId && e.from !== nodeId).map((e) => e.from))];
  const rest = { ...graph,
    nodes: Object.fromEntries(Object.entries(graph.nodes).filter(([k]) => k !== nodeId)),
    edges: edges.filter((e) => e.from !== nodeId && e.to !== nodeId) };
  return sources.reduce((g, from) => renumberPriorities(g, from), rest);
}
