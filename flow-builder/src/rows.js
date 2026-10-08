// Turns a node's outgoing connections into rows (with plain-words conditions) and line styles.
// Pure: the canvas only renders what this returns.
import { describeWhen } from './describe.js';

export const PALETTE = { teal: '#1D9E75', blue: '#378ADD', purple: '#7F77DD', coral: '#D85A30', amber: '#EF9F27', gray: '#888780' };
export const BLOCKED_RED = '#E24B4A';
export const HIGHLIGHT = { color: '#EF9F27', width: 4 };

const nonEmpty = (w) => (w && typeof w === 'object' && Object.keys(w).length ? w : null);
const outsOf = (graph, id) => (graph.edges || []).filter((e) => e.from === id);

// Mirrors the engine's `chained`: ANY outgoing edge (pixel edges included) makes a filter chained.
// Terminal (old style, gates the connection INTO it) = a filter with no outgoing edge at all.
export function isTerminalFilter(graph, id) {
  return (graph.nodes || {})[id]?.kind === 'filter' && outsOf(graph, id).length === 0;
}

// Mirrors the engine: a path / terminal filter target supplies the condition, else the edge's own.
export function effectiveWhen(graph, edge) {
  const nodes = graph.nodes || {};
  const t = nodes[edge.to];
  const gated = t && (t.kind === 'path' || isTerminalFilter(graph, edge.to));
  return nonEmpty(gated ? t.when : edge.when);
}

export function nodeRows(graph, nodeId, rules = []) {
  const nodes = graph.nodes || {};
  const node = nodes[nodeId];
  if (!node) return [];
  if (node.kind === 'offer' || node.kind === 'pixel' || (node.kind === 'matrix' && node.of === 'offer')) return [];

  const isFilter = node.kind === 'filter';
  const lab = (s) => (isFilter ? `Passes · ${s}` : s);
  const rows = [];
  if (isFilter) {
    rows.push({ key: 'blocked', kind: 'blocked', label: describeWhen(node.when, rules), targetId: null, style: 'blocked' });
    if (isTerminalFilter(graph, nodeId)) {
      rows.push({ key: 'only', kind: 'only', label: 'Only matching visitors arrive here', style: 'plain' });
      return rows;
    }
  }

  const outs = outsOf(graph, nodeId).filter((e) => nodes[e.to] && nodes[e.to].kind !== 'pixel');
  const info = outs.map((e) => ({ e, when: effectiveWhen(graph, e) }));
  const row = (e, x) => ({ key: e.id || `${e.from}>${e.to}`, edgeId: e.id, targetId: e.to, ...x });

  // 1. rows into an old-style terminal filter: the engine lets a matching one win, so they come first
  const first = info.filter((x) => x.when && isTerminalFilter(graph, x.e.to));
  // 2. conditional rows: numbered (by priority) first, then unnumbered in file order
  const cond = info.filter((x) => x.when && !first.includes(x));
  const prio = (x) => (Number.isFinite(x.e.priority) ? x.e.priority : null);
  const numbered = cond.filter((x) => prio(x) !== null).sort((a, b) => prio(a) - prio(b));
  const ordered = [...numbered, ...cond.filter((x) => prio(x) === null)];
  // 3. unconditional rows last
  const plain = info.filter((x) => !x.when);

  first.forEach((x) => rows.push(row(x.e, { kind: 'first', label: lab(describeWhen(x.when, rules)), detail: 'checked first', style: 'blocked' })));
  ordered.forEach((x) => {
    const n = numbered.indexOf(x);
    rows.push(row(x.e, { kind: 'condition', label: lab(describeWhen(x.when, rules)), number: n >= 0 ? n + 1 : undefined, style: n === 0 ? 'priority1' : 'priority' }));
  });

  const hasCond = first.length + ordered.length > 0;
  const total = plain.reduce((s, x) => s + (Number(x.e.weight) || 1), 0);
  const pct = (x) => Math.round(((Number(x.e.weight) || 1) / total) * 100);
  const isEntry = nodeId === graph.entry || node.kind === 'entry' || node.kind === 'traffic';
  plain.forEach((x) => {
    if (hasCond) {
      rows.push(row(x.e, plain.length > 1
        ? { kind: 'otherwise', label: isFilter ? `Passes · otherwise · ${pct(x)}%` : `Otherwise · ${pct(x)}%`, share: pct(x), style: 'otherwise' }
        : { kind: 'otherwise', label: isFilter ? 'Passes · otherwise' : 'Otherwise', style: 'otherwise' }));
    } else if (plain.length === 1) {
      rows.push(row(x.e, { kind: 'next', label: isFilter ? 'Passes' : isEntry ? 'All visitors' : 'Next', style: 'plain' }));
    } else {
      rows.push(row(x.e, { kind: 'share', label: lab(`${pct(x)}%`), share: pct(x), style: 'share' }));
    }
  });
  return rows;
}

export function lineStyle(row, edge) {
  const c = (def) => PALETTE[edge?.color] || PALETTE[def];
  switch (row.style) {
    case 'priority1': return { color: c('teal'), width: 3, dash: null };
    case 'priority': return { color: c('gray'), width: 1.5, dash: null };
    case 'otherwise': return { color: PALETTE.gray, width: 1.2, dash: '6 4' };
    case 'share': return { color: c('blue'), width: 2, dash: null };
    case 'blocked': return { color: BLOCKED_RED, width: 2, dash: null };
    default: return { color: c('gray'), width: 1.5, dash: null };
  }
}

export function pixelLineStyle() {
  return { color: PALETTE.purple, width: 1.5, dash: '2 4' };
}
