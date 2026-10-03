// Matrix expansion and the save-time validators.
// Run: node test/validate.test.mjs
import {
  expandMatrix, badFilterChallenge, badFilterNodes, badMatrixNodes, badInlineWhens,
  graphHasOffer, validateGraph, validateRuleConds, canonicalRole, CHALLENGE_TYPES
} from '../src/index.js';
import { ok, done } from './helpers.mjs';

// ── matrix expansion ──────────────────────────────────────────────────────────────────────────
{
  const key = { type: 'token', slot: 1 };
  const g = {
    entry: 'entry',
    nodes: {
      entry: { id: 'entry', kind: 'traffic' },
      m1: { id: 'm1', kind: 'matrix', of: 'offer', key, rows: [{ value: 'a', ref: 'of_a' }, { value: 'b', ref: 'of_b' }], fallback: 'of_z' }
    },
    edges: [{ from: 'entry', to: 'm1', weight: 1 }]
  };
  const x = expandMatrix(g);
  ok(x.nodes.m1.kind === 'path' && x.nodes.m1.when === null, 'matrix: the matrix node becomes a pass-through path');
  ok(x.nodes.m1_r0.kind === 'offer' && x.nodes.m1_r0.ref === 'of_a' && x.nodes.m1_r1.ref === 'of_b',
    'matrix: each row becomes an offer node with its ref');
  const e0 = x.edges.find((e) => e.to === 'm1_r0');
  ok(e0 && e0.when.conds[0].type === 'token' && e0.when.conds[0].slot === 1 && e0.when.conds[0].value === 'a'
    && e0.when.conds[0].op === 'equals', 'matrix: a row edge is ruled on key equals value');
  const ed = x.edges.find((e) => e.to === 'm1_d');
  ok(ed && ed.when === null && x.nodes.m1_d.ref === 'of_z', 'matrix: the fallback is the one unconditional edge');
  ok(g.nodes.m1.kind === 'matrix' && g.edges.length === 1, 'matrix: the input graph is not mutated');
  ok(expandMatrix({ ...g, nodes: { ...g.nodes, m1: { ...g.nodes.m1, fallback: undefined } } }).nodes.m1_d === undefined,
    'matrix: no fallback means no unconditional edge');
}
{
  // lander matrix: every row continues down the matrix's own arrows; a pixel stays on the matrix
  const g = {
    entry: 'entry',
    nodes: {
      entry: { id: 'entry', kind: 'traffic' },
      m1: { id: 'm1', kind: 'matrix', of: 'lander', key: { type: 'param', key: 'lp' }, rows: [{ value: 'x', ref: 'ld_x' }] },
      o1: { id: 'o1', kind: 'offer', ref: 'of_1' },
      px: { id: 'px', kind: 'pixel' }
    },
    edges: [
      { from: 'entry', to: 'm1', weight: 1 },
      { from: 'm1', to: 'o1', weight: 3 },
      { from: 'm1', to: 'px', weight: 1 }
    ]
  };
  const x = expandMatrix(g);
  ok(x.nodes.m1_r0.kind === 'lander' && x.nodes.m1_r0.bind === 'm1', 'matrix: a lander row carries bind to its matrix');
  ok(x.edges.some((e) => e.from === 'm1_r0' && e.to === 'o1' && e.weight === 3), 'matrix: the outgoing arrow is copied onto the row');
  ok(!x.edges.some((e) => e.from === 'm1' && e.to === 'o1'), 'matrix: and removed from the pass-through matrix');
  ok(x.edges.some((e) => e.from === 'm1' && e.to === 'px'), 'matrix: the pixel edge stays on the matrix node');
  ok(x.edges.find((e) => e.to === 'm1_r0').when.conds[0].key === 'lp', 'matrix: a param key becomes a param cond');
}

// ── filter challenge shape ───────────────────────────────────────────────────────────────────
{
  ok(badFilterChallenge(undefined, undefined) === null, 'challenge: action absent is fine');
  ok(badFilterChallenge('404', undefined) === null, 'challenge: action 404 needs no config');
  ok(badFilterChallenge('404', { type: 'nonsense' }) === null, 'challenge: config on a 404 node is inert');
  ok(badFilterChallenge('nonsense', undefined) !== null, 'challenge: an unknown action is refused');
  ok(badFilterChallenge('challenge', undefined) !== null, 'challenge: action challenge with no config is refused');
  ok(badFilterChallenge('challenge', { type: 'click', timeout_ms: 8000 }) === null, 'challenge: a valid click challenge passes');
  ok(badFilterChallenge('challenge', { type: 'nope', timeout_ms: 8000 }) !== null, 'challenge: an unknown type is refused');
  ok(badFilterChallenge('challenge', { type: 'click', timeout_ms: 100 }) !== null, 'challenge: a timeout under 500ms is refused');
  ok(badFilterChallenge('challenge', { type: 'click', timeout_ms: 999999 }) !== null, 'challenge: a timeout over 120000ms is refused');
  ok(badFilterChallenge('challenge', { type: 'click', timeout_ms: 8000, on_fail: 'nope' }) !== null, 'challenge: an unknown on_fail is refused');
  for (const t of CHALLENGE_TYPES) {
    ok(badFilterChallenge('challenge', { type: t, timeout_ms: 5000 }) === null, `challenge: type "${t}" is accepted`);
  }
}

// ── rule conditions ───────────────────────────────────────────────────────────────────────────
{
  ok(validateRuleConds([{ type: 'country', values: ['US'] }]) === null, 'conds: a country list is valid');
  ok(validateRuleConds([{ type: 'country', values: [] }]) !== null, 'conds: an empty country list is refused');
  ok(validateRuleConds([{ type: 'nope' }]) !== null, 'conds: an unknown type is refused');
  ok(validateRuleConds([{ type: 'token', slot: 21, op: 'exists' }]) !== null, 'conds: token slot 21 is refused');
  ok(validateRuleConds([{ type: 'param', key: 'bad key!', op: 'exists' }]) !== null, 'conds: a malformed param key is refused');
  ok(validateRuleConds([{ type: 'param', key: 'k', op: 'equals' }]) !== null, 'conds: equals with no value is refused');
  ok(validateRuleConds([{ type: 'role', role: 'source', op: 'exists' }]) === null, 'conds: the older "source" role spelling is accepted');
  ok(canonicalRole('medium') === 'utm_medium' && canonicalRole('bogus') === '', 'roles: aliases resolve, unknown roles are empty');
}

// ── save-time graph checks ────────────────────────────────────────────────────────────────────
{
  const BOT = { conds: [{ type: 'bot_ua' }] };
  const base = {
    entry: 'n_traffic',
    nodes: {
      n_traffic: { id: 'n_traffic', kind: 'traffic' },
      n_filter: { id: 'n_filter', kind: 'filter', when: BOT },
      n_offer: { id: 'n_offer', kind: 'offer', ref: 'of_1' }
    },
    edges: [
      { from: 'n_traffic', to: 'n_filter', weight: 1 },
      { from: 'n_traffic', to: 'n_offer', weight: 1 }
    ]
  };
  ok(validateGraph(base) === null, 'graph: a filtered flow to an offer is valid');
  ok(graphHasOffer({ nodes: { a: { kind: 'traffic' } }, edges: [] }) === false, 'graph: no offer is refused');
  ok(validateGraph({ ...base, edges: [] }) !== null, 'graph: an offer with no edges is refused');

  const noCond = { ...base, nodes: { ...base.nodes, n_filter: { id: 'n_filter', kind: 'filter', when: null } } };
  ok(/no condition/.test(badFilterNodes(noCond)), 'filter: an unconditional filter is refused');
  const dangling = { ...base, edges: [{ from: 'n_traffic', to: 'n_offer', weight: 1 }] };
  ok(/not connected/.test(badFilterNodes(dangling)), 'filter: a filter nothing routes into is refused');
  const badCh = { ...base, nodes: { ...base.nodes, n_filter: { id: 'n_filter', kind: 'filter', when: BOT, action: 'challenge' } } };
  ok(/challenge/.test(badFilterNodes(badCh)), 'filter: a challenge action with no config is refused');

  const emptyConds = { ...base, edges: [{ from: 'n_traffic', to: 'n_offer', weight: 1, when: { conds: [] } }] };
  ok(/empty/.test(badInlineWhens(emptyConds)), 'inline when: an empty conds list is refused');
  const both = { ...base, edges: [{ from: 'n_traffic', to: 'n_offer', weight: 1, when: { rule: 'rl_1', conds: [{ type: 'bot_ua' }] } }] };
  ok(/not both/.test(badInlineWhens(both)), 'inline when: a rule reference plus inline conds is refused');
}
{
  const m = (over = {}, edges) => ({
    entry: 'n_traffic',
    nodes: {
      n_traffic: { id: 'n_traffic', kind: 'traffic' },
      m1: { id: 'm1', kind: 'matrix', of: 'offer', key: { type: 'token', slot: 1 },
        rows: [{ value: 'a', ref: 'of_a' }], ...over }
    },
    edges: edges || [{ from: 'n_traffic', to: 'm1', weight: 1 }]
  });
  ok(badMatrixNodes(m()) === null, 'matrix: a valid offer matrix passes');
  ok(/of/.test(badMatrixNodes(m({ of: 'nope' }))), 'matrix: "of" must be lander or offer');
  ok(/at least one row/.test(badMatrixNodes(m({ rows: [] }))), 'matrix: no rows is refused');
  ok(/needs a value|every row/.test(badMatrixNodes(m({ rows: [{ value: '', ref: 'of_a' }] }))), 'matrix: a row with no value is refused');
  ok(/twice/.test(badMatrixNodes(m({ rows: [{ value: 'a', ref: 'of_a' }, { value: 'a', ref: 'of_b' }] }))), 'matrix: a duplicate value is refused');
  ok(/has no/.test(badMatrixNodes(m({ rows: [{ value: 'a' }] }))), 'matrix: a row with no target is refused');
  ok(/terminal/.test(badMatrixNodes(m({}, [{ from: 'n_traffic', to: 'm1', weight: 1 }, { from: 'm1', to: 'n_traffic', weight: 1 }]))),
    'matrix: an offer matrix cannot have an outgoing arrow');
  ok(/needs an arrow/.test(badMatrixNodes(m({ of: 'lander' }))), 'matrix: a lander matrix needs somewhere to go next');
  ok(/not connected/.test(badMatrixNodes(m({}, []))), 'matrix: an unconnected matrix is refused');
  ok(badMatrixNodes(m({ key: { type: 'token', slot: 99 } })) !== null, 'matrix: an invalid key is refused');
}

done();
