// Test a visitor: pure logic. The REAL engine walks the flow (compileGraph + resolveGraph);
// nothing is re-implemented here. This module only builds the visitor context, records the
// visited nodes, and words the result.
import { compileGraph, resolveGraph, rngFor } from '../../src/index.js';
import { effectiveWhen } from './rows.js';
import { TYPE_LABEL } from './names.js';

export const DEFAULT_VISITOR = { country: 'US', device: 'mobile', os: 'ios', bot: false, vpn: false, reviewer: false, suspicious: false, params: '' };

const TOKEN_ORDER = Array.from({ length: 20 }, (_, i) => `t${i + 1}`);

export function parseParams(text) {
  const query = {};
  String(text || '').split(/\r?\n/).forEach((line) => {
    const l = line.trim();
    if (!l) return;
    const i = l.indexOf('=');
    if (i < 0) { query[l] = ''; return; }
    const k = l.slice(0, i).trim();
    if (k) query[k] = l.slice(i + 1).trim();
  });
  return { query, tokenOrder: [...TOKEN_ORDER] };
}

export function toContext(visitor) {
  const v = { ...DEFAULT_VISITOR, ...(visitor || {}) };
  const { query, tokenOrder } = parseParams(v.params);
  return {
    country: String(v.country || '').trim().toUpperCase(),
    device: v.device,
    os: v.os,
    suspicious: !!v.suspicious,
    signals: { bot_ua: !!v.bot, datacenter: !!v.vpn, moderator: !!v.reviewer },
    query,
    tokenOrder,
    roleParams: {},
  };
}

export function refsFromCatalog(catalog) {
  const c = catalog || {};
  const refs = { landers: {}, offers: {}, rules: {}, valueLists: {} };
  (c.landers || []).forEach((l) => { refs.landers[l.id] = { kv_key: l.id, source: null }; });
  (c.offers || []).forEach((o) => { refs.offers[o.id] = { url_template: '#' }; });
  (c.rules || []).forEach((r) => { refs.rules[r.id] = { logical: r.logical, conds: r.conds }; });
  return refs;
}

function nameOf(kind, note, ref, catalog) {
  if (note) return note;
  if (ref) {
    const list = kind === 'lander' ? catalog.landers : kind === 'offer' ? catalog.offers : null;
    const hit = (list || []).find((x) => x.id === ref);
    if (hit && hit.name) return hit.name;
  } else if (kind === 'lander') return 'Page (nothing picked)';
  else if (kind === 'offer') return 'Offer (nothing picked)';
  return TYPE_LABEL[kind] || 'Step';
}

// Plain-words description of a filter's challenge; shared with the canvas end box.
export function challengeShort(challenge) {
  const ms = challenge && Number(challenge.timeout_ms);
  const secs = Number.isFinite(ms) && challenge.timeout_ms !== null && challenge.timeout_ms !== '' ? ms / 1000 : 8;
  const type = challenge && challenge.type;
  if (type === 'honeypot') return 'hidden-button check';
  if (type === 'timing') return `wait ${secs}s before clicking`;
  if (type === 'motion') return 'move the mouse first';
  return `click within ${secs}s`;
}

function run(graph, catalog, ctx, seed, bypassFilterId) {
  const authored = graph.nodes || {};
  const compiled = compileGraph(graph, refsFromCatalog(catalog));
  const matrixIds = Object.keys(authored).filter((id) => authored[id].kind === 'matrix');
  const toCanvas = (id) => {
    if (authored[id]) return id;
    const m = matrixIds.find((mid) => id === `${mid}_d` || new RegExp(`^${mid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_r\\d+$`).test(id));
    return m || id;
  };
  const visited = [];
  const result = resolveGraph(compiled, ctx, rngFor(seed), { bypassFilterId, onVisit: (id) => visited.push(id) });

  const nodes = [];
  visited.forEach((id) => { const c = toCanvas(id); if (!nodes.includes(c)) nodes.push(c); });

  // name of a visited (compiled) id; matrix rows take the name of the thing they point at
  const nameFor = (rawId) => {
    const c = toCanvas(rawId);
    const a = authored[c];
    const cn = compiled.nodes[rawId];
    if (a && a.kind !== 'matrix') return nameOf(a.kind, a.note, a.ref, catalog);
    if (cn && (cn.kind === 'lander' || cn.kind === 'offer')) return nameOf(cn.kind, null, cn.ref_id, catalog);
    return nameOf(a ? a.kind : cn && cn.kind, a && a.note, null, catalog);
  };

  // unconditional, non-pixel exits of a node: the ones the engine splits by share
  const sharesOf = (id) => (graph.edges || []).filter((e) => e.from === id && authored[e.to] && authored[e.to].kind !== 'pixel' && !effectiveWhen(graph, e));
  const edges = [];
  let random = false;
  for (let i = 0; i + 1 < nodes.length; i++) {
    const hit = (graph.edges || []).find((e) => e.from === nodes[i] && e.to === nodes[i + 1]);
    if (!hit) continue;
    edges.push(hit.id);
    // a random A/B pick only when the step taken was itself an unconditional share among two or more
    if (!effectiveWhen(graph, hit) && sharesOf(nodes[i]).length >= 2) random = true;
  }

  const out = { outcome: 'dead_end', text: '', nodes, edges, endFor: null, random };
  if (result && result.filtered) {
    const name = nameFor(result.node_id);
    out.endFor = toCanvas(result.node_id);
    if (result.action === 'challenge') {
      out.outcome = 'challenge';
      out.text = `Challenge at '${name}' (${challengeShort(result.challenge)})`;
    } else {
      out.outcome = 'blocked';
      out.text = `Blocked at '${name}' → 404 page`;
    }
  } else if (result && result.offer) {
    const pages = visited.filter((id) => compiled.nodes[id] && compiled.nodes[id].kind === 'lander').map(nameFor);
    const offer = nameFor(visited[visited.length - 1]);
    out.outcome = 'offer';
    out.text = [...pages, offer].join(' → ');
    if (!pages.length) out.text = `→ ${offer}`;
  } else {
    const last = nodes.length ? nameFor(visited[visited.length - 1]) : TYPE_LABEL.entry;
    out.text = `Stops at '${last}': nowhere to go (dead end)`;
  }
  return out;
}

export function simulateVisit(graph, catalog, visitor, seed = 'test') {
  const cat = catalog || {};
  const ctx = toContext(visitor);
  const res = run(graph, cat, ctx, seed, null);
  if (res.outcome === 'challenge') {
    const after = run(graph, cat, ctx, seed, res.endFor);
    res.passText = `If they pass: ${after.text}`;
    res.random = res.random || after.random;   // the pass branch may go through an A/B split
  }
  return res;
}
