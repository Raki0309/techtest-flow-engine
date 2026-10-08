// Turns an authored graph (nodes cite lander/offer/rule ids) into the compiled shape the engine
// walks: matrices expanded, ids resolved to concrete values, named rules inlined. Pure: the
// lookups are passed in.
//
//   compileGraph(graph, {
//     landers:    { ld_1: { kv_key, source } },
//     offers:     { of_1: { url_template } },
//     rules:      { rl_1: { logical, conds } },
//     valueLists: { vl_1: ['a', 'b'] }
//   })

import { expandMatrix } from './expand-matrix.js';

export function compileGraph(graph, { landers = {}, offers = {}, rules = {}, valueLists = {} } = {}) {
  // the engine evaluates plain arrays only, so a cond citing a value list gets the list inlined
  const ruleById = {};
  for (const [id, r] of Object.entries(rules)) {
    ruleById[id] = { logical: r.logical, conds: (r.conds || []).map((c) => {
      if (!c.list_id) return c;
      const { list_id, ...rest } = c;
      return { ...rest, values: [...(rest.values || []), ...(valueLists[list_id] || [])] };
    }) };
  }
  // a missing rule compiles to match-nothing, so its edge never fires
  const compileWhen = (when) => {
    if (!when || !when.rule) return when || null;
    return ruleById[when.rule] || { logical: 'and', conds: [{ type: 'param', key: '__missing_rule__', op: 'exists' }] };
  };

  const g = expandMatrix(graph);
  const nodes = {};
  for (const [nid, n] of Object.entries(g.nodes || {})) {
    const id = n.id || nid;
    if (n.kind === 'offer') nodes[id] = { kind: 'offer', ref_id: n.ref, url_template: offers[n.ref]?.url_template };
    else if (n.kind === 'lander') nodes[id] = { kind: 'lander', ref_id: n.ref, kv_key: landers[n.ref]?.kv_key,
      source: landers[n.ref]?.source || null, ...(n.bind ? { bind: n.bind } : {}) };
    else if (n.kind === 'path') nodes[id] = { kind: 'path', when: compileWhen(n.when) };
    else if (n.kind === 'filter') nodes[id] = { kind: 'filter', when: compileWhen(n.when),
      action: n.action === 'challenge' ? 'challenge' : '404',
      challenge: n.action === 'challenge' ? (n.challenge || null) : null };
    else nodes[id] = { kind: n.kind };
  }
  const edges = (g.edges || []).map((e) => ({ from: e.from, to: e.to, weight: e.weight || 1, when: compileWhen(e.when),
    ...(Number.isFinite(e.priority) ? { priority: e.priority } : {}) }));
  return { entry: g.entry, nodes, edges };
}
