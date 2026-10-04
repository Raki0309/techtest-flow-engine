// Sample catalog: a flow in production cites real landers/offers/pixels/rules by id, loaded from
// an API. There is no backend here, so this is a small static stand-in with the same shape
// (just {id, name, ...}) the builder components expect.
import checkpointFlow from '../../examples/checkpoint-flow.json';
export const LANDERS = [
  { id: 'ld_quiz_a', name: 'Quiz lander A', source: 'quiz funnel landing page' },
  { id: 'ld_quiz_b', name: 'Quiz lander B (variant)', source: 'quiz funnel landing page variant' },
  { id: 'ld_review', name: 'Product review page', source: 'review comparison article' },
  { id: 'ld_advertorial', name: 'Advertorial', source: 'native advertorial article' },
];

export const OFFERS = [
  { id: 'of_main', name: 'Everflow #1442 — Main offer' },
  { id: 'of_backup', name: 'Everflow #1443 — Backup offer' },
  { id: 'of_eu', name: 'Custom network — EU offer' },
];

export const PIXELS = [
  { id: 'px_meta', name: 'Meta pixel', platform: 'meta' },
  { id: 'px_google', name: 'Google Ads', platform: 'google' },
];

export const RULES = [
  { id: 'rl_mobile_us', name: 'US mobile', logical: 'and', conds: [{ type: 'country', values: ['US'] }] },
  { id: 'rl_reviewer', name: 'Known ad reviewer', logical: 'and', conds: [{ type: 'moderator' }] },
];

// The builder's starting flow is the checkpoint flow in examples/, so the two never drift apart.
export const SAMPLE_ROUTING = { graph: checkpointFlow.graph };