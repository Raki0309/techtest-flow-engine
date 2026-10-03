// Sample catalog: a flow in production cites real landers/offers/pixels/rules by id, loaded from
// an API. There is no backend here, so this is a small static stand-in with the same shape
// (just {id, name, ...}) the builder components expect.

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

// A small starter flow: bots filtered, US mobile sees the quiz lander, everyone else the review page.
export const SAMPLE_ROUTING = {
  graph: {
    entry: 'entry',
    nodes: {
      entry: { id: 'entry', kind: 'entry', x: 40, y: 140 },
      bots: { id: 'bots', kind: 'filter', when: { conds: [{ type: 'bot_ua' }] }, x: 280, y: 20 },
      us: { id: 'us', kind: 'path', when: { country: ['US'] }, note: 'US mobile', x: 280, y: 140 },
      quiz: { id: 'quiz', kind: 'lander', ref: 'ld_quiz_a', x: 520, y: 140 },
      review: { id: 'review', kind: 'lander', ref: 'ld_review', x: 280, y: 260 },
      offer: { id: 'offer', kind: 'offer', ref: 'of_main', x: 760, y: 200 },
      meta_px: { id: 'meta_px', kind: 'pixel', ref: 'px_meta', x: 520, y: 20 },
    },
    edges: [
      { id: 'e1', from: 'entry', to: 'bots', weight: 1, when: null },
      { id: 'e2', from: 'entry', to: 'us', weight: 1, when: null },
      { id: 'e3', from: 'entry', to: 'review', weight: 1, when: null },
      { id: 'e4', from: 'us', to: 'quiz', weight: 1, when: null },
      { id: 'e5', from: 'quiz', to: 'offer', weight: 1, when: null },
      { id: 'e6', from: 'quiz', to: 'meta_px', weight: 1, when: null },
      { id: 'e7', from: 'review', to: 'offer', weight: 1, when: null },
    ],
  },
};
