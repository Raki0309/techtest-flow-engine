// Runtime engine: filters (terminal, chained, challenge), rule matching, matrix output.
// Run: node test/engine.test.mjs
import { resolveGraph, matchWhen, evalCond, pickWeighted, rngFor, CHALLENGE_TYPES } from '../src/index.js';
import { ok, rng, done } from './helpers.mjs';

const US_ONLY = { logical: 'and', conds: [{ type: 'country', values: ['US'] }] };
const BOT = { logical: 'and', conds: [{ type: 'bot_ua' }] };

// traffic -> (filter | lander) -> offer
const graph = {
  entry: 'n_traffic',
  nodes: {
    n_traffic: { kind: 'traffic' },
    n_block: { kind: 'filter', when: BOT },
    n_lander: { kind: 'lander', ref_id: 'ld_1', kv_key: 'k1' },
    n_offer: { kind: 'offer', ref_id: 'of_1', url_template: 'https://o/?c={click_id}' },
    n_pixel: { kind: 'pixel' }
  },
  edges: [
    { from: 'n_traffic', to: 'n_block', weight: 1 },
    { from: 'n_traffic', to: 'n_lander', weight: 1 },
    { from: 'n_lander', to: 'n_offer', weight: 1 },
    { from: 'n_lander', to: 'n_pixel', weight: 1 }
  ]
};

const human = { country: 'US', device: 'mobile', signals: {} };
const bot = { country: 'US', device: 'desktop', signals: { bot_ua: true } };

{
  const r = resolveGraph(graph, bot, rng);
  ok(r && r.filtered === true, 'filter: a visitor matching the rule is filtered, not routed');
  ok(r && !r.offer, 'filter: a filtered visitor gets no offer to send them to');
}
{
  const r = resolveGraph(graph, human, rng);
  ok(r && !r.filtered && r.offer?.id === 'of_1', 'filter: a visitor NOT matching it reaches the offer');
  ok(r && r.landers.length === 1 && r.landers[0].id === 'ld_1', 'filter: the lander chain is unaffected');
}
{
  // The filter shares the pool with a second matching ruled edge. A weighted pick would let some
  // matching traffic through, which is the whole failure the filter exists to prevent.
  const g2 = {
    ...graph,
    nodes: { ...graph.nodes, n_alt: { kind: 'lander', ref_id: 'ld_2', kv_key: 'k2' } },
    edges: [
      { from: 'n_traffic', to: 'n_block', weight: 1 },
      { from: 'n_traffic', to: 'n_alt', weight: 99, when: BOT },
      { from: 'n_lander', to: 'n_offer', weight: 1 },
      { from: 'n_alt', to: 'n_offer', weight: 1 }
    ]
  };
  let leaked = 0;
  for (let i = 0; i < 200; i++) {
    if (!resolveGraph(g2, bot, () => i / 200)?.filtered) leaked++;
  }
  ok(leaked === 0, 'filter: beats every other matching edge, every time', `${leaked}/200 leaked`);
}
{
  const r = resolveGraph(graph, bot, rng, { skipFilters: true });
  ok(r && !r.filtered && r.offer?.id === 'of_1', 'filter: preview walks past it so the owner sees the page');
}
{
  const g3 = { ...graph, nodes: { ...graph.nodes, n_block: { kind: 'filter', when: null } } };
  ok(resolveGraph(g3, human, rng)?.filtered === true,
    'filter: an unconditional one really does swallow everything (hence the save-time check)');
}

// ── rule conditions ───────────────────────────────────────────────────────────────────────────
{
  const ctx = { country: 'US', device: 'mobile', signals: {}, query: { p_camp: 'summer' },
    tokenOrder: ['', '', 'p_camp'], roleParams: { utm_campaign: 'p_camp' } };
  ok(evalCond({ type: 'role', role: 'utm_campaign', op: 'equals', value: 'summer' }, ctx),
    'role condition: resolves through the token carrying the role');
  ok(evalCond({ type: 'token', slot: 3, op: 'equals', value: 'summer' }, ctx),
    'token condition: resolves by slot');
  const moved = { ...ctx, tokenOrder: ['', '', '', 'p_camp'] };
  ok(evalCond({ type: 'role', role: 'utm_campaign', op: 'equals', value: 'summer' }, moved),
    'role condition: survives the token moving to another slot');
  ok(!evalCond({ type: 'token', slot: 3, op: 'equals', value: 'summer' }, moved),
    'token condition: stops matching when the token moves, the fragility roles replace');
  ok(!evalCond({ type: 'role', role: 'email_hash', op: 'exists' }, ctx),
    'role condition: an unassigned role matches nothing rather than everything');
  ok(matchWhen(US_ONLY, ctx) && !matchWhen({ logical: 'and', conds: [{ type: 'country', values: ['CA'] }] }, ctx),
    'matchWhen: country conditions behave');
  ok(evalCond({ type: 'country', values: ['CA'], not: true }, ctx), 'not: inverts a condition');
}

// ── inline conds sit next to dimension lists; both AND together ─────────────────────────────────
{
  const ctx = { country: 'US', device: 'mobile', signals: {}, query: { offer: 'test', p_camp: 'summer' },
    tokenOrder: ['p_camp'], roleParams: {} };
  const utm = { conds: [{ type: 'param', key: 'offer', op: 'equals', value: 'test' }] };
  ok(matchWhen(utm, ctx), 'inline conds: a param condition matches ?offer=test');
  ok(!matchWhen(utm, { ...ctx, query: { offer: 'other' } }), 'inline conds: misses a different value');
  ok(!matchWhen(utm, { ...ctx, query: {} }), 'inline conds: misses an absent param');
  ok(matchWhen({ conds: [{ type: 'token', slot: 1, op: 'equals', value: 'summer' }] }, ctx),
    'inline conds: slot 1 resolves through the token order');
  ok(matchWhen({ device: ['mobile'], ...utm }, ctx) && !matchWhen({ device: ['desktop'], ...utm }, ctx),
    'inline conds: AND with the dimension lists beside them');
  ok(matchWhen({ device: ['mobile'], conds: [] }, ctx), 'inline conds: an empty conds list is no condition');
  ok(matchWhen({ logical: 'or', conds: [{ type: 'country', values: ['CA'] }, { type: 'device', values: ['mobile'] }] }, ctx),
    'logical or: short-circuits on any hit');
}

// ── matrix output: a path plus ruled rows, nothing new for the engine ─────────────────────────
{
  const cond = (v) => ({ conds: [{ type: 'token', slot: 1, op: 'equals', value: v }] });
  const g = {
    entry: 'n_traffic',
    nodes: {
      n_traffic: { kind: 'traffic' },
      m1: { kind: 'path', when: null },
      m1_r0: { kind: 'offer', ref_id: 'of_a', url_template: 'https://a/' },
      m1_r1: { kind: 'offer', ref_id: 'of_b', url_template: 'https://b/' },
      m1_d: { kind: 'offer', ref_id: 'of_z', url_template: 'https://z/' },
      l1: { kind: 'lander', ref_id: 'ld_1', kv_key: 'k1', bind: 'mx' }
    },
    edges: [
      { from: 'n_traffic', to: 'l1', weight: 1 },
      { from: 'l1', to: 'm1', weight: 1 },
      { from: 'm1', to: 'm1_r0', weight: 1, when: cond('a') },
      { from: 'm1', to: 'm1_r1', weight: 1, when: cond('b') },
      { from: 'm1', to: 'm1_d', weight: 1, when: null }
    ]
  };
  const ctx = (v) => ({ country: 'US', device: 'mobile', signals: {}, query: { sub1: v }, tokenOrder: ['sub1'], roleParams: {} });
  ok(resolveGraph(g, ctx('a'), rng)?.offer?.id === 'of_a', 'matrix: slot 1 = a picks row a');
  ok(resolveGraph(g, ctx('b'), rng)?.offer?.id === 'of_b', 'matrix: slot 1 = b picks row b');
  ok(resolveGraph(g, ctx('nope'), rng)?.offer?.id === 'of_z', 'matrix: no row matches, fallback');
  ok(resolveGraph(g, ctx('a'), rng)?.landers[0]?.node_id === 'mx', 'matrix: a lander row reports its matrix (bind)');
  const noFallback = { ...g, edges: g.edges.filter((e) => e.to !== 'm1_d') };
  ok(resolveGraph(noFallback, ctx('nope'), rng) === null, 'matrix: no fallback and no match is a dead end');
}

// ── filter challenge: pass/fail and the bypass the pass path relies on ──────────────────────
{
  ok(resolveGraph(graph, bot, rng).action === '404', 'challenge: a node with no action defaults to 404');

  const chGraph = { ...graph, nodes: { ...graph.nodes,
    n_block: { kind: 'filter', when: BOT, action: 'challenge',
      challenge: { type: 'click', timeout_ms: 8000, on_fail: '404' } } } };

  const hit = resolveGraph(chGraph, bot, rng);
  ok(hit.filtered === true && hit.action === 'challenge', 'challenge: a challenge-action match is reported, not 404d');
  ok(hit.challenge && hit.challenge.type === 'click' && hit.challenge.timeout_ms === 8000,
    'challenge: its config rides back with the result');

  const passed = resolveGraph(chGraph, bot, rng, { bypassFilterId: 'n_block' });
  ok(!passed.filtered && passed.offer?.id === 'of_1', 'challenge: bypassing the matched node reaches the real offer');

  const wrongBypass = resolveGraph(chGraph, bot, rng, { bypassFilterId: 'not_a_real_node' });
  ok(wrongBypass.filtered === true, 'challenge: bypassing an unrelated node id changes nothing');

  const twoFilters = {
    entry: 'n_traffic',
    nodes: {
      n_traffic: { kind: 'traffic' },
      n_a: { kind: 'filter', when: BOT, action: 'challenge', challenge: { type: 'click', timeout_ms: 1000 } },
      n_b: { kind: 'filter', when: US_ONLY },
      n_offer: { kind: 'offer', ref_id: 'of_1', url_template: 'https://o/?c={click_id}' }
    },
    edges: [
      { from: 'n_traffic', to: 'n_a', weight: 1 },
      { from: 'n_traffic', to: 'n_b', weight: 1 },
      { from: 'n_traffic', to: 'n_offer', weight: 1 }
    ]
  };
  const bothMatch = { country: 'US', device: 'desktop', signals: { bot_ua: true } };
  const bypassA = resolveGraph(twoFilters, bothMatch, rng, { bypassFilterId: 'n_a' });
  ok(bypassA.filtered === true && bypassA.node_id === 'n_b',
    'challenge: passing one filter still leaves a second, unrelated filter standing');
}

// ── chained filter: has its own outgoing edge, continues on a non-match ───────────────────────
{
  const chained = {
    entry: 'n_traffic',
    nodes: {
      n_traffic: { kind: 'traffic' },
      n_block: { kind: 'filter', when: BOT },
      n_lander: { kind: 'lander', ref_id: 'ld_1', kv_key: 'k1' },
      n_offer: { kind: 'offer', ref_id: 'of_1', url_template: 'https://o/?c={click_id}' }
    },
    edges: [
      { from: 'n_traffic', to: 'n_block', weight: 1 },
      { from: 'n_block', to: 'n_lander', weight: 1 },
      { from: 'n_lander', to: 'n_offer', weight: 1 }
    ]
  };

  const blocked = resolveGraph(chained, bot, rng);
  ok(blocked && blocked.filtered === true && blocked.node_id === 'n_block',
    'chained filter: a match still blocks exactly like a terminal one');

  const through = resolveGraph(chained, human, rng);
  ok(through && !through.filtered && through.offer?.id === 'of_1' && through.landers[0]?.id === 'ld_1',
    'chained filter: a non-match continues down its own outgoing edge');

  ok(resolveGraph(chained, bot, rng, { skipFilters: true })?.offer?.id === 'of_1',
    'chained filter: preview walks past a match');
  ok(resolveGraph(chained, bot, rng, { bypassFilterId: 'n_block' })?.offer?.id === 'of_1',
    'chained filter: bypassing it continues past it');

  // a chained filter has no "beats every matching edge" priority: it is a normal waypoint
  const g2 = {
    ...chained,
    nodes: { ...chained.nodes, n_alt: { kind: 'lander', ref_id: 'ld_2', kv_key: 'k2' } },
    edges: [
      { from: 'n_traffic', to: 'n_block', weight: 1, when: BOT },
      { from: 'n_traffic', to: 'n_alt', weight: 1, when: BOT },
      { from: 'n_block', to: 'n_lander', weight: 1 },
      { from: 'n_lander', to: 'n_offer', weight: 1 },
      { from: 'n_alt', to: 'n_offer', weight: 1 }
    ]
  };
  let sawAlt = false;
  for (let i = 0; i < 200 && !sawAlt; i++) {
    const r = resolveGraph(g2, bot, () => i / 200);
    if (r && !r.filtered && r.landers[0]?.id === 'ld_2') sawAlt = true;
  }
  ok(sawAlt, 'chained filter: does not win the pool outright, a matching sibling edge can be picked');

  const mixed = {
    entry: 'n_traffic',
    nodes: { ...chained.nodes, n_term: { kind: 'filter', when: US_ONLY } },
    edges: [...chained.edges, { from: 'n_traffic', to: 'n_term', weight: 1 }]
  };
  const usBot = { country: 'US', device: 'desktop', signals: { bot_ua: true } };
  let sawTerm = false;
  for (let i = 0; i < 200 && !sawTerm; i++) {
    const r = resolveGraph(mixed, usBot, () => i / 200);
    if (r?.filtered && r.node_id === 'n_term') sawTerm = true;
  }
  ok(sawTerm, 'chained filter: coexists with an unrelated terminal filter in the same graph');
}

// ── weighted picks and seeded randomness ───────────────────────────────────────────────────
{
  const items = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }];
  ok(pickWeighted(items, () => 0).id === 'a' && pickWeighted(items, () => 0.99).id === 'b',
    'pickWeighted: low roll picks the first item, high roll the heavier one');
  const r1 = rngFor('click-1'), r2 = rngFor('click-1'), r3 = rngFor('click-2');
  ok(r1() === r2() && r1() === r2(), 'rngFor: the same seed gives the same sequence');
  ok(rngFor('click-1')() !== r3(), 'rngFor: a different seed gives a different sequence');
  ok(CHALLENGE_TYPES.length === 4 && CHALLENGE_TYPES.includes('honeypot'), 'challenge: the four types are registered');
}

// ── onVisit: optional trace hook, must not change the walk itself ─────────────────────────────
{
  const visited = [];
  const r = resolveGraph(graph, human, rng, { onVisit: (id) => visited.push(id) });
  ok(JSON.stringify(visited) === JSON.stringify(['n_traffic', 'n_lander', 'n_offer']),
    'onVisit: records entry, the lander, and the final offer in order');
  ok(r.offer?.id === 'of_1', 'onVisit: the return value is unaffected');

  const blockedVisits = [];
  resolveGraph(graph, bot, rng, { onVisit: (id) => blockedVisits.push(id) });
  ok(JSON.stringify(blockedVisits) === JSON.stringify(['n_traffic', 'n_block']),
    'onVisit: a terminal filter match is the last node recorded');

  const chainedG = { ...graph, nodes: { ...graph.nodes, n_block: { kind: 'filter', when: BOT } },
    edges: [{ from: 'n_traffic', to: 'n_block', weight: 1 }, { from: 'n_block', to: 'n_lander', weight: 1 }, { from: 'n_lander', to: 'n_offer', weight: 1 }] };
  const chainedVisits = [];
  resolveGraph(chainedG, human, rng, { onVisit: (id) => chainedVisits.push(id) });
  ok(JSON.stringify(chainedVisits) === JSON.stringify(['n_traffic', 'n_block', 'n_lander', 'n_offer']),
    'onVisit: a chained filter that lets the visitor through is recorded like any waypoint');
}

done();
