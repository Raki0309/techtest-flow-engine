// Box names in plain words, for places outside the canvas (the "Problems" list). Pure.

// Also used by simulate.js, so a dead end at any kind of box (old 'traffic' entries too) has a name.
export const TYPE_LABEL = {
  entry: 'Visitors arrive', traffic: 'Visitors arrive', filter: 'Filter', route: 'Route', split: 'A/B split',
  path: 'Path', lander: 'Page', offer: 'Offer', pixel: 'Tracking', matrix: 'Lookup table',
};
const CATALOG_LIST = { lander: 'landers', offer: 'offers', pixel: 'pixels' };

// The box's note, else the catalog name of what it picked, else its type ("Filter", "Page" …).
export function boxName(graph, id, catalog = {}) {
  const n = graph?.nodes?.[id];
  if (!n) return '';
  if (n.note) return n.note;
  const hit = n.ref && (catalog[CATALOG_LIST[n.kind]] || []).find((x) => x.id === n.ref);
  if (hit && hit.name) return hit.name;
  return TYPE_LABEL[n.kind] || 'Step';
}

// checkFlow's result as one list: flow-wide problems first (no box), then each box's in the flow's
// order, with every error before any warning. A line reads `${name}: ${text}` (just the text when
// there is no box); `id` is the box to show, or null.
export function problemLines(graph, problems, catalog = {}) {
  const byNode = problems?.byNode || {};
  const order = Object.keys(graph?.nodes || {});
  const lines = (problems?.global || []).map((p) => ({ id: null, level: p.level, name: '', text: p.text }));
  Object.keys(byNode)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .forEach((id) => byNode[id].forEach((p) => lines.push({ id, level: p.level, name: boxName(graph, id, catalog), text: p.text })));
  const rank = (l) => (l.level === 'error' ? 0 : 1);
  return lines.sort((a, b) => rank(a) - rank(b));   // stable: keeps the order above within a level
}
