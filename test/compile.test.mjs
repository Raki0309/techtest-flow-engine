// compileGraph feeding resolveGraph: authored graph in, routing decision out.
// Run: node test/compile.test.mjs
import { readFileSync } from 'node:fs';
import { compileGraph, resolveGraph, validateGraph } from '../src/index.js';
import { ok, rng, done } from './helpers.mjs';

const refs = {
  landers: { ld_main: { kv_key: 'pages/main', source: 'repo' }, ld_alt: { kv_key: 'pages/alt', source: null } },
  offers: { of_a: { url_template: 'https://a.example/?c={click_id}' }, of_b: { url_template: 'https://b.example/' } },
  rules: { rl_us: { logical: 'and', conds: [{ type: 'country', values: ['US'] }] },
    rl_vip: { logical: 'and', conds: [{ type: 'param', key: 'src', op: 'equals', list_id: 'vl_vip' }] } },
  valueLists: { vl_vip: ['gold', 'platinum'] }
};
const visitor = (over = {}) => ({ country: 'US', device: 'mobile', signals: {}, query: {}, tokenOrder: [], roleParams: {}, ...over });

{
  const authored = {
    entry: 'entry',
    nodes: {
      entry: { id: 'entry', kind: 'traffic' },
      block: { id: 'block', kind: 'filter', when: { conds: [{ type: 'bot_ua' }] } },
      page: { id: 'page', kind: 'lander', ref: 'ld_main' },
      offer: { id: 'offer', kind: 'offer', ref: 'of_a' }
    },
    edges: [
      { from: 'entry', to: 'block', weight: 1 },
      { from: 'entry', to: 'page', weight: 1 },
      { from: 'page', to: 'offer', weight: 1 }
    ]
  };
  ok(validateGraph(authored) === null, 'compile: the authored graph is valid');
  const c = compileGraph(authored, refs);
  ok(c.nodes.page.kv_key === 'pages/main' && c.nodes.page.source === 'repo', 'compile: a lander ref resolves to its stored key and source');
  ok(c.nodes.offer.url_template === 'https://a.example/?c={click_id}', 'compile: an offer ref resolves to its url template');
  ok(c.nodes.block.action === '404' && c.nodes.block.challenge === null, 'compile: a filter defaults to a 404 action');
  const r = resolveGraph(c, visitor(), rng);
  ok(r.offer.id === 'of_a' && r.landers[0].id === 'ld_main', 'compile: a visitor routes through the lander to the offer');
  ok(resolveGraph(c, visitor({ signals: { bot_ua: true } }), rng).filtered === true, 'compile: a bot is filtered');
}
{
  // named rules are inlined; a value list cited by a rule is inlined into the rule
  const authored = {
    entry: 'entry',
    nodes: {
      entry: { id: 'entry', kind: 'traffic' },
      a: { id: 'a', kind: 'offer', ref: 'of_a' },
      b: { id: 'b', kind: 'offer', ref: 'of_b' }
    },
    edges: [
      { from: 'entry', to: 'a', weight: 1, when: { rule: 'rl_vip' } },
      { from: 'entry', to: 'b', weight: 1 }
    ]
  };
  const c = compileGraph(authored, refs);
  ok(c.edges[0].when.conds[0].values.join() === 'gold,platinum' && !('list_id' in c.edges[0].when.conds[0]),
    'rules: a value list is inlined into the rule and list_id is dropped');
  ok(resolveGraph(c, visitor({ query: { src: 'gold' } }), rng).offer.id === 'of_a', 'rules: a listed value takes the ruled edge');
  ok(resolveGraph(c, visitor({ query: { src: 'bronze' } }), rng).offer.id === 'of_b', 'rules: an unlisted value falls back to the unconditional edge');

  const missing = compileGraph({ ...authored, edges: [{ from: 'entry', to: 'a', weight: 1, when: { rule: 'rl_gone' } }, { from: 'entry', to: 'b', weight: 1 }] }, refs);
  ok(resolveGraph(missing, visitor(), rng).offer.id === 'of_b', 'rules: a missing rule matches nothing, so its edge never fires');
}
{
  // an offer matrix end to end
  const authored = {
    entry: 'entry',
    nodes: {
      entry: { id: 'entry', kind: 'traffic' },
      mx: { id: 'mx', kind: 'matrix', of: 'offer', key: { type: 'param', key: 'plan' },
        rows: [{ value: 'a', ref: 'of_a' }], fallback: 'of_b' }
    },
    edges: [{ from: 'entry', to: 'mx', weight: 1 }]
  };
  ok(validateGraph(authored) === null, 'matrix: the authored matrix graph is valid');
  const c = compileGraph(authored, refs);
  ok(resolveGraph(c, visitor({ query: { plan: 'a' } }), rng).offer.id === 'of_a', 'matrix: a matching row picks its offer');
  ok(resolveGraph(c, visitor({ query: { plan: 'zzz' } }), rng).offer.id === 'of_b', 'matrix: a non-matching value takes the fallback');
}
{
  // the bundled example graph compiles, validates and routes
  const example = JSON.parse(readFileSync(new URL('../examples/campaign-flow.json', import.meta.url), 'utf8'));
  ok(validateGraph(example.graph) === null, 'example: the bundled flow is valid');
  const c = compileGraph(example.graph, example.refs);
  const us = resolveGraph(c, visitor({ country: 'US' }), rng);
  ok(us && us.offer && us.landers.length === 1, 'example: a US visitor reaches an offer through a lander');
  ok(resolveGraph(c, visitor({ country: 'US', signals: { bot_ua: true } }), rng).filtered === true, 'example: a bot is filtered');
}
{
  // the checkpoint flow: reviewers, bots and datacenter traffic are stopped first, then split by audience
  const flow = JSON.parse(readFileSync(new URL('../examples/checkpoint-flow.json', import.meta.url), 'utf8'));
  ok(validateGraph(flow.graph) === null, 'checkpoint flow: valid');
  const c = compileGraph(flow.graph, flow.refs);
  const stoppedAt = (signals) => resolveGraph(c, visitor({ signals }), rng);
  ok(stoppedAt({ moderator: true }).node_id === 'stop_reviewers', 'checkpoint flow: an ad reviewer is stopped first');
  ok(stoppedAt({ moderator: true, bot_ua: true }).node_id === 'stop_reviewers', 'checkpoint flow: a reviewer who is also a bot counts as a reviewer');
  ok(stoppedAt({ bot_ua: true }).node_id === 'stop_bots', 'checkpoint flow: a bot is stopped');
  ok(stoppedAt({ datacenter: true }).action === 'challenge', 'checkpoint flow: datacenter traffic gets a challenge, not a 404');
  ok(resolveGraph(c, visitor({ signals: { datacenter: true } }), rng, { bypassFilterId: 'check_datacenter' }).offer.id === 'of_main',
    'checkpoint flow: passing the challenge continues to an offer');
  ok(resolveGraph(c, visitor(), rng).offer.id === 'of_main', 'checkpoint flow: US mobile reaches the main offer');
  ok(resolveGraph(c, visitor({ country: 'DE', device: 'desktop' }), rng).offer.id === 'of_eu', 'checkpoint flow: Europe reaches the EU offer');
  ok(resolveGraph(c, visitor({ device: 'desktop' }), rng).offer.id === 'of_backup', 'checkpoint flow: everyone else reaches the backup offer');
}
done();
