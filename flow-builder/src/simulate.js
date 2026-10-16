// Test a visitor: pure logic. The REAL engine walks the flow (compileGraph + resolveGraph);
// nothing is re-implemented here. This module only builds the visitor context, records the
// visited nodes, and words the result.
import { compileGraph, resolveGraph, rngFor, upgradeFallbacks, MAX_STEPS } from '../../src/index.js';
import { effectiveWhen, isCaught } from './rows.js';
import { describeWhen } from './describe.js';
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
  const authoredEdges = graph.edges || [];
  const compiled = compileGraph(graph, refsFromCatalog(catalog));
  const matrixIds = Object.keys(authored).filter((id) => authored[id].kind === 'matrix');
  const toCanvas = (id) => {
    if (authored[id]) return id;
    const m = matrixIds.find((mid) => id === `${mid}_d` || new RegExp(`^${mid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_r\\d+$`).test(id));
    return m || id;
  };
  // the walk: nodes reached, and lines taken (with how many nodes had been reached when each was taken)
  const visited = [];
  const taken = [];
  const result = resolveGraph(compiled, ctx, rngFor(seed), {
    bypassFilterId, onVisit: (id) => visited.push(id), onEdge: (e) => taken.push({ e, at: visited.length }),
  });

  const nodes = [];
  visited.forEach((id) => { const c = toCanvas(id); if (!nodes.includes(c)) nodes.push(c); });

  // the authored line behind a taken one: its own id, else (lines inside lookup tables) the pair of canvas boxes
  const authoredOf = ({ e }) => authoredEdges.find((x) => e.id && x.id === e.id)
    || authoredEdges.find((x) => x.from === toCanvas(e.from) && x.to === toCanvas(e.to) && isCaught(x) === !!e.caught);
  const edges = [];
  let random = false;
  taken.forEach((t) => {
    const hit = authoredOf(t);
    if (!hit) return;
    if (hit.id !== undefined && !edges.includes(hit.id)) edges.push(hit.id);
    // a random A/B pick only when the line taken was itself an unconditional share among two or more of its kind
    const peers = authoredEdges.filter((x) => x.from === hit.from && isCaught(x) === isCaught(hit) && authored[x.to] && authored[x.to].kind !== 'pixel' && !effectiveWhen(graph, x));
    if (!effectiveWhen(graph, hit) && peers.length >= 2) random = true;
  });

  // name of a visited (compiled) id; matrix rows take the name of the thing they point at
  const nameFor = (rawId) => {
    const c = toCanvas(rawId);
    const a = authored[c];
    const cn = compiled.nodes[rawId];
    if (a && a.kind !== 'matrix') return nameOf(a.kind, a.note, a.ref, catalog);
    if (cn && (cn.kind === 'lander' || cn.kind === 'offer')) return nameOf(cn.kind, null, cn.ref_id, catalog);
    return nameOf(a ? a.kind : cn && cn.kind, a && a.note, null, catalog);
  };

  // "<verb> at '<filter>': <its condition in words>" (the condition is left out when there is none)
  const at = (verb, rawId) => {
    const why = describeWhen(authored[toCanvas(rawId)]?.when, catalog.rules || []);
    return `${verb} at '${nameFor(rawId)}'${why ? `: ${why}` : ''}`;
  };

  // catches: every filter that sent the visitor down a fallback line, in order (a loop repeats them,
  // so each filter is listed once)
  const catches = taken.filter((t) => t.e.caught).map((t) => ({ filter: t.e.from, at: t.at }));
  const last = catches[catches.length - 1];
  const caughtBy = [...new Set(catches.map((c) => c.filter))];
  const out = { outcome: 'dead_end', text: '', lines: caughtBy.map((id) => at('Caught', id)), nodes, edges, endFor: null, random };
  const pagesAfter = (from) => visited.slice(from).filter((id) => compiled.nodes[id] && compiled.nodes[id].kind === 'lander').map(nameFor);
  if (result && result.filtered && result.action !== 'fallback') {
    const name = nameFor(result.node_id);
    out.endFor = toCanvas(result.node_id);
    if (result.action === 'challenge') {
      out.outcome = 'challenge';
      out.text = `Challenge at '${name}' (${challengeShort(result.challenge)})`;
      out.lines.push(at('Challenge', result.node_id), `→ ${challengeShort(result.challenge)}`);
    } else {
      out.outcome = 'blocked';
      out.text = `Blocked at '${name}' → 404 page`;
      out.lines.push(at('Blocked', result.node_id), '→ 404 page');
    }
  } else if (result && result.offer) {
    const path = [...pagesAfter(last ? last.at : 0), nameFor(visited[visited.length - 1])].join(' → ');
    if (last) {
      out.outcome = 'fallback';
      out.text = `Caught at '${nameFor(last.filter)}' → ${path}`;
      out.lines.push(`→ ${path}`);
    } else {
      out.outcome = 'offer';
      out.text = pagesAfter(0).length ? path : `→ ${path}`;
      out.lines = [out.text];
    }
  } else {
    // the engine gives up after MAX_STEPS steps: the visitor went round a loop, named by the first box reached twice
    const again = visited.length >= MAX_STEPS ? visited.find((id, i) => visited.indexOf(id) < i) : undefined;
    const stop = nodes.length ? nameFor(visited[visited.length - 1]) : TYPE_LABEL.entry;
    out.text = again !== undefined ? `Goes round in a loop at '${nameFor(again)}'` : `Stops at '${stop}': nowhere to go (dead end)`;
    out.lines.push(out.text);
  }
  // firstCatch: the canvas id of the first filter that caught the visitor (simulateVisit asks what
  // happens without it), kept apart from the result shown
  return { res: out, firstCatch: catches.length ? toCanvas(catches[0].filter) : null };
}

export function simulateVisit(rawGraph, catalog, visitor, seed = 'test') {
  const graph = upgradeFallbacks(rawGraph);   // an old-style fallback_to flow is read as fallback lines
  const cat = catalog || {};
  const ctx = toContext(visitor);
  const { res, firstCatch } = run(graph, cat, ctx, seed, null);
  // the other side of a catch: where the visitor goes when this one filter lets them through
  if (res.outcome === 'challenge') {
    const after = run(graph, cat, ctx, seed, res.endFor).res;
    res.passText = `If they pass: ${after.text}`;
    res.lines.push(res.passText);
    res.random = res.random || after.random;   // the pass branch may go through an A/B split
  }
  if (firstCatch) {
    const after = run(graph, cat, ctx, seed, firstCatch).res;
    res.lines.push(`If not caught here: ${after.text}`);
    res.random = res.random || after.random;
  }
  return res;
}
