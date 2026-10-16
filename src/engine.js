// Runtime: walks a compiled flow graph for one visitor and decides where they go.
// Pure functions, no I/O.

// Weighted random pick. `rng` returns [0, 1); pass a seeded one for repeatable results.
export function pickWeighted(items, rng) {
  const total = items.reduce((s, l) => s + (l.weight || 1), 0);
  let roll = (rng ? rng() : Math.random()) * total;
  for (const l of items) { roll -= (l.weight || 1); if (roll <= 0) return l; }
  return items[items.length - 1];
}

// Seeded PRNG: the same seed string always walks the same path.
export function rngFor(seedStr) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  let a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One condition. `not` inverts the result. ctx carries the visitor: country, device, os,
// suspicious, signals {bot_ua, datacenter, moderator}, query {param: value}, tokenOrder, roleParams.
export function evalCond(c, ctx) {
  let hit = false;
  if (c.type === 'country' || c.type === 'device' || c.type === 'os') {
    const v = String(ctx[c.type] || '').toLowerCase();
    hit = (c.values || []).map((x) => String(x).toLowerCase()).includes(v);
  } else if (c.type === 'suspicious') {
    hit = !!ctx.suspicious;
  } else if (c.type === 'bot_ua') {
    hit = !!ctx.signals?.bot_ua;
  } else if (c.type === 'datacenter') {
    hit = !!ctx.signals?.datacenter;
  } else if (c.type === 'moderator') {
    hit = !!ctx.signals?.moderator;
  } else if (c.type === 'param' || c.type === 'token' || c.type === 'role') {
    // Three ways to name the same captured query value:
    //   param: the literal query key
    //   role:  what the value means (utm_campaign, email_hash), survives slots being reordered
    //   token: the slot number, kept for older rules
    const key = c.type === 'role'
      ? (ctx.roleParams || {})[c.role]
      : c.type === 'token'
        ? (ctx.tokenOrder || [])[Number(c.slot) - 1]
        : c.key;
    const raw = key && ctx.query ? ctx.query[key] : undefined;
    const empty = raw === undefined || raw === '';
    // an absent value is not a match unless include_empty is set
    if (empty && !c.include_empty) hit = false;
    else if (c.op === 'exists') hit = !empty;
    else {
      const want = (c.values && c.values.length ? c.values : [c.value ?? '']).map((x) => String(x));
      const got = String(raw ?? '');
      hit = c.op === 'contains' ? want.some((w) => got.includes(w)) : want.includes(got);
    }
  }
  return c.not ? !hit : hit;
}

// A `when` is {logical:'and'|'or', conds:[...]} and/or dimension lists like {country:['US']}.
// Conds and dimension lists AND together. Null or empty matches everyone.
export function matchWhen(when, ctx) {
  if (!when) return true;
  if (Array.isArray(when.conds) && when.conds.length) {
    const hit = when.logical === 'or' ? when.conds.some((c) => evalCond(c, ctx)) : when.conds.every((c) => evalCond(c, ctx));
    if (!hit) return false;
  }
  for (const [k, list] of Object.entries(when)) {
    if (k === 'conds' || !Array.isArray(list) || list.length === 0) continue;
    const v = String(ctx[k] || '').toLowerCase();
    if (!list.map((x) => String(x).toLowerCase()).includes(v)) return false;
  }
  return true;
}

export const CHALLENGE_TYPES = ['click', 'honeypot', 'timing', 'motion'];

// The walk gives up after this many steps (a loop), and returns null like a dead end.
export const MAX_STEPS = 32;

// Compiled graph: {entry, nodes:{id:{kind, ...}}, edges:[{id?, from, to, weight, when, caught?}]}.
// Walks from entry, picking among the eligible outgoing edges (matching ruled edges first, else the
// unconditional ones by weight), until an offer node. Returns:
//   {landers, offer}                                         never caught
//   {filtered, node_id, action, challenge}                   caught by a 404 / challenge filter
//   {filtered, node_id, action: 'fallback', landers, offer}  caught by a fallback filter, then sent
//                                                            down one of its fallback lines to an offer
//   null                                                     dead end
// A filter with action 'fallback' picks among its fallback lines (edges with caught: true) by the
// same rules as any other edge and the walk continues from there; with no line that fits it
// answers 404. A caught edge that doesn't leave a filter is never taken.
// skipFilters: preview only, ignores every filter.
// bypassFilterId: ignores exactly one named filter, every other filter still applies.
// onVisit(id, node): optional, called once for every node actually reached, entry through the
// final node, in order. onEdge(edge): optional, called once for every edge taken, in order.
// Pure instrumentation, changes nothing about the walk or the return value.
export function resolveGraph(graph, ctx, rng, { skipFilters = false, bypassFilterId = null, onVisit = null, onEdge = null } = {}) {
  const nodes = graph.nodes || {};
  const edges = graph.edges || [];
  let cur = graph.entry, guard = 0, lastCatch = null;
  const landers = [];
  // fallback lines are only ever taken by a caught filter; anywhere else they are never walked
  const isCaughtLine = (e) => !!e.caught;
  // A filter with an outgoing edge that isn't a fallback line is chained: everyone reaches it, and a
  // match is caught while a non-match continues down that edge. A filter with no such edge gates the
  // edge INTO it, so reaching it at all means a match.
  const chained = (id) => nodes[id]?.kind === 'filter' && edges.some((e) => e.from === id && !isCaughtLine(e));
  // an edge's condition is its own `when`, or the `when` of the path / terminal filter it points at
  const isGated = (id) => { const k = nodes[id]?.kind; return k === 'path' || (k === 'filter' && !chained(id)); };
  const edgeWhen = (e) => { const t = isGated(e.to) ? nodes[e.to] : null; return (t ? t.when : e.when) || null; };
  const dropFilter = (id) => skipFilters || id === bypassFilterId;
  // pixel nodes are attachment points, never waypoints
  const usable = (e) => nodes[e.to]?.kind !== 'pixel'
    && !(nodes[e.to]?.kind === 'filter' && !chained(e.to) && dropFilter(e.to));
  // one chooser for every pool: ruled edges that match win; otherwise the unconditional edges split by weight
  const choose = (outs) => {
    const ruled = outs.filter((e) => { const w = edgeWhen(e); return w && Object.keys(w).length; });
    const matchingRuled = ruled.filter((e) => matchWhen(edgeWhen(e), ctx));
    // an optional numeric priority narrows the matching ruled edges to the lowest number, unless a
    // terminal filter is among them (a blocker always wins). Equal priorities still split by weight.
    const prio = (e) => (Number.isFinite(e.priority) ? e.priority : Infinity);
    let ruledPool = matchingRuled;
    const hasBlocker = ruledPool.some((e) => nodes[e.to]?.kind === 'filter' && !chained(e.to));
    if (!hasBlocker && ruledPool.some((e) => Number.isFinite(e.priority))) {
      const top = Math.min(...ruledPool.map(prio));
      ruledPool = ruledPool.filter((e) => prio(e) === top);
    }
    const pool = ruledPool.length ? ruledPool : outs.filter((e) => { const w = edgeWhen(e); return !w || !Object.keys(w).length; });
    if (!pool.length) return null;
    // a matching terminal filter beats every other matching edge instead of taking a weighted share
    return pool.find((e) => nodes[e.to]?.kind === 'filter' && !chained(e.to)) || pickWeighted(pool, rng);
  };
  // the answer of a 404 / challenge filter that caught the visitor
  const stopAt = (id, n) => ({ filtered: true, node_id: id, action: n.action === 'challenge' ? 'challenge' : '404', challenge: n.challenge || null });
  while (cur && guard++ < MAX_STEPS) {
    const curNode = nodes[cur];
    if (onVisit) onVisit(cur, curNode);
    // caught here: a chained filter whose condition matches, or a terminal filter the walk reached
    const caughtHere = curNode?.kind === 'filter' && !dropFilter(cur) && (!chained(cur) || matchWhen(curNode.when, ctx));
    let pick;
    if (caughtHere) {
      if (curNode.action !== 'fallback') return stopAt(cur, curNode);
      pick = choose(edges.filter((e) => e.from === cur && isCaughtLine(e) && usable(e)));
      if (!pick) return { filtered: true, node_id: cur, action: '404', challenge: null };
      lastCatch = cur;
    } else {
      pick = choose(edges.filter((e) => e.from === cur && !isCaughtLine(e) && usable(e)));
      if (!pick) break;
    }
    const t = nodes[pick.to];
    if (!t) break;
    if (onEdge) onEdge(pick);
    // a terminal filter: a 404 / challenge one answers at once; a fallback one catches on the next step
    if (t.kind === 'filter' && !chained(pick.to)) {
      if (t.action !== 'fallback') { if (onVisit) onVisit(pick.to, t); return stopAt(pick.to, t); }
      cur = pick.to; continue;
    }
    if (t.kind === 'offer') {
      if (onVisit) onVisit(pick.to, t);
      const offer = { id: t.ref_id, url_template: t.url_template };
      return lastCatch ? { filtered: true, node_id: lastCatch, action: 'fallback', landers, offer } : { landers, offer };
    }
    // `bind` names the matrix node a lander row was expanded from
    if (t.kind === 'lander') landers.push({ id: t.ref_id, kv_key: t.kv_key, source: t.source, node_id: t.bind || pick.to });
    cur = pick.to;
  }
  return null;
}
