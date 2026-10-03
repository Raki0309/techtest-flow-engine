// Shared helpers for the graph builder. Extracted verbatim from RoninConv's apps/ui/src/App.jsx.

export const DEVICES = ['mobile', 'desktop', 'tablet'];
export const OSES = ['ios', 'android', 'windows', 'macos', 'linux', 'other'];
export const gid = () => 'n' + crypto.randomUUID().slice(0, 8);
export const GNODE_W = 172, GNODE_H = 58;

// Build an editable graph from any stored routing (graph | tree | legacy paths | empty).
export function toGraph(routing) {
  if (routing?.graph?.nodes) {
    const g = structuredClone(routing.graph);
    let i = 0;
    for (const n of Object.values(g.nodes)) { if (typeof n.x !== 'number') { n.x = 60 + (i % 4) * 200; n.y = 40 + Math.floor(i / 4) * 130; } i++; }
    g.edges = (g.edges || []).map((e) => ({ id: e.id || gid(), ...e }));
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

// BFS layered layout for initial positions (user drags freely afterward)
export function layoutGraph(nodes, edges) {
  const depth = { entry: 0 };
  const q = ['entry'];
  while (q.length) { const n = q.shift(); for (const e of edges.filter((x) => x.from === n)) { if (depth[e.to] == null) { depth[e.to] = depth[n] + 1; q.push(e.to); } } }
  const byDepth = {};
  for (const id of Object.keys(nodes)) { const d = depth[id] ?? 1; (byDepth[d] = byDepth[d] || []).push(id); }
  for (const [d, ids] of Object.entries(byDepth)) ids.forEach((id, i) => { nodes[id].x = 60 + i * (GNODE_W + 40); nodes[id].y = 40 + Number(d) * (GNODE_H + 70); });
}

// module-level cache of named rules, lets ruleText() name a referenced rule
let _rulesById = {};
export function setRulesCache(rules) { _rulesById = Object.fromEntries((rules || []).map((r) => [r.id, r])); }

export function ruleText(when, full) {
  if (!when || !Object.keys(when).length) return '';
  if (when.rule) return _rulesById[when.rule]?.name || 'rule';
  const p = [];
  if (when.device && when.device.length && when.device.length < DEVICES.length) p.push(when.device.join('/'));
  if (when.os && when.os.length && when.os.length < OSES.length) p.push(when.os.join('/'));
  if (when.country && when.country.length) p.push(when.country.join(','));
  for (const c of when.conds || []) p.push(inlineCondText(c));
  if (!p.length) return 'any';
  const s = p.join(' · ');
  return full || s.length <= 26 ? s : s.slice(0, 24) + '…';
}

// One inline cond as the builder shows it: `offer=test`, `{t1}=abc`.
export function inlineCondText(c) {
  const key = c.type === 'param' ? c.key : c.type === 'token' ? `{t${c.slot}}` : c.type === 'role' ? `{${c.role}}` : null;
  if (key == null) return condText(c);
  const val = c.op === 'exists' ? '' : (c.values && c.values.length ? c.values.join('|') : c.value ?? '');
  return `${c.not ? '!' : ''}${key}${c.op === 'exists' ? '?' : c.op === 'contains' ? '~' : '='}${val}`;
}

export function condText(c) {
  const n = c.not ? 'NOT ' : '';
  if (c.type === 'suspicious') return `${n}suspicious`;
  if (c.type === 'param') return `${n}param ${c.key} ${c.op || 'equals'}${c.op === 'exists' ? '' : ` "${c.value ?? ''}"`}`;
  return `${n}${c.type} in ${(c.values || []).join('/')}`;
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
