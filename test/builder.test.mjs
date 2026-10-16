// Builder pure modules. Run: node test/builder.test.mjs
import { ok, done } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import { describeWhen, describeCond, SIGNALS, isEmptyWhen } from '../flow-builder/src/describe.js';
import { addRowEdge, retargetEdge, deleteEdge, setEdgeWhen, moveRow, renumberPriorities, setEdgeColor, setEdgeWeight, removeNode, setFilterAction, addFallbackOffer, addFallbackLine } from '../flow-builder/src/edit.js';
import { checkFlow, worstLevel } from '../flow-builder/src/checks.js';
import { simulateVisit, parseParams, challengeShort, DEFAULT_VISITOR } from '../flow-builder/src/simulate.js';
import { nodeRows, lineStyle, pixelLineStyle, effectiveWhen, isTerminalFilter, isCaught, fallbackLines, PALETTE, BLOCKED_RED, HIGHLIGHT } from '../flow-builder/src/rows.js';
import { layoutGraph, placeMissing, nodeHeight, rowPortY, addPortY, nodeFootprint, canAddFallbackFrom, endBoxHeight, endBoxText, snapUp, retargetAllowed, isEntryNode, toGraph, dropCurve, NODE_W, HEADER_H, ROW_H, ADD_H, END_W, END_DROP } from '../flow-builder/src/helpers.js';
import { boxName, problemLines } from '../flow-builder/src/names.js';

// --- describe.js ---
const R = [{ id: 'rl_reviewer', name: 'Known ad reviewer', logical: 'and', conds: [{ type: 'moderator' }] }];
const d = (w) => describeWhen(w, R);
ok(d({ conds: [{ type: 'bot_ua' }] }) === 'Is a bot', 'describe: bot');
ok(d({ conds: [{ type: 'bot_ua', not: true }] }) === 'Is not a bot', 'describe: not bot');
ok(d({ conds: [{ type: 'datacenter' }] }) === 'Uses a VPN / datacenter', 'describe: datacenter');
ok(d({ conds: [{ type: 'moderator' }] }) === 'Is an ad reviewer', 'describe: reviewer');
ok(d({ conds: [{ type: 'suspicious' }] }) === 'Looks suspicious', 'describe: suspicious');
ok(d({ country: ['US'], device: ['mobile'] }) === 'Country is US and device is phone', 'describe: country + device');
ok(d({ country: ['FR', 'DE', 'ES', 'IT', 'NL'] }) === 'Country is FR, DE, ES, IT or NL', 'describe: country list');
ok(d({ os: ['ios', 'android'] }) === 'OS is iOS or Android', 'describe: os words');
ok(d({ conds: [{ type: 'country', values: ['US'], not: true }] }) === 'Country is not US', 'describe: country not');
ok(d({ logical: 'or', conds: [{ type: 'bot_ua' }, { type: 'datacenter' }] }) === 'Is a bot or uses a VPN / datacenter', 'describe: or');
ok(d({ rule: 'rl_reviewer' }) === 'Known ad reviewer', 'describe: named rule');
ok(d({ rule: 'rl_gone' }) === "Missing rule 'rl_gone'", 'describe: missing rule');
ok(d({ conds: [{ type: 'param', key: 'offer', op: 'equals', value: 'test' }] }) === 'Link has offer = test', 'describe: param equals');
ok(d({ conds: [{ type: 'param', key: 'offer', op: 'exists' }] }) === 'Link has offer', 'describe: param exists');
ok(d({ conds: [{ type: 'param', key: 'offer', op: 'contains', value: 'x' }] }) === 'Link offer contains x', 'describe: param contains');
ok(d({ conds: [{ type: 'token', slot: 1, op: 'equals', value: 'abc' }] }) === 'Link token {t1} = abc', 'describe: token');
ok(d(null) === '' && d({}) === '', 'describe: empty');
ok(d({ conds: [{ type: 'role', role: 'utm_campaign', value: 'x' }] }) === 'Link utm_campaign = x', 'describe: role');
ok(d({ conds: [{ type: 'param', key: 'a', op: 'equals', values: ['x', 'y', 'z'] }] }) === 'Link has a = x, y or z', 'describe: param values');
ok(d({ conds: [{ type: 'device', values: ['mobile'] }, { type: 'os', values: ['ios'] }] }) === 'Device is phone and OS is iOS', 'describe: typed device/os');
ok(d({ conds: [{ type: 'weird' }] }) === 'weird', 'describe: unknown type');
ok(describeCond({ type: 'bot_ua' }) === 'Is a bot', 'describeCond: bot');
ok(SIGNALS.map((s) => s.chip).join('|') === 'Bot|VPN / datacenter|Ad reviewer|Suspicious' && SIGNALS.map((s) => s.type).join() === 'bot_ua,datacenter,moderator,suspicious', 'describe: SIGNALS');

// --- rows.js ---
const campaign = JSON.parse(readFileSync(new URL('../examples/campaign-flow.json', import.meta.url), 'utf8'));
const mk = (id, kind, extra = {}) => ({ id, kind, ...extra });
const F = {
  entry: 'entry',
  nodes: {
    entry: mk('entry', 'entry'),
    f1: mk('f1', 'filter', { when: { conds: [{ type: 'bot_ua' }] }, action: '404' }),
    r: mk('r', 'route'),
    a: mk('a', 'lander', { ref: 'x' }), b: mk('b', 'lander', { ref: 'x' }), c: mk('c', 'lander', { ref: 'x' }),
    s: mk('s', 'split'), l1: mk('l1', 'lander', { ref: 'x' }), l2: mk('l2', 'lander', { ref: 'x' }),
    o: mk('o', 'offer', { ref: 'x' }), px: mk('px', 'pixel'),
  },
  edges: [
    { id: 'e0', from: 'entry', to: 'f1' },
    { id: 'e1', from: 'f1', to: 'r' },
    { id: 'e2', from: 'r', to: 'a', when: { country: ['US'], device: ['mobile'] }, priority: 1 },
    { id: 'e3', from: 'r', to: 'b', when: { country: ['FR'] }, priority: 2 },
    { id: 'e4', from: 'r', to: 'c' },
    { id: 'e5', from: 'r', to: 'ghost' },
    { id: 'e6', from: 's', to: 'l1', weight: 50 },
    { id: 'e7', from: 's', to: 'l2', weight: 50 },
    { id: 'e8', from: 'a', to: 'o' },
    { id: 'e9', from: 'a', to: 'px' },
  ],
};
const Fzero = { entry: 's', nodes: { s: mk('s', 'split'), l1: mk('l1', 'lander'), l2: mk('l2', 'lander') },
  edges: [{ id: 'z1', from: 's', to: 'l1', weight: 0 }, { id: 'z2', from: 's', to: 'l2', weight: 1 }] };
const kinds = (rs) => rs.map((r) => r.kind).join(',');
ok(kinds(nodeRows(F, 'f1')) === 'blocked,next' && nodeRows(F, 'f1')[0].label === 'Is a bot' && nodeRows(F, 'f1')[1].label === 'Passes', 'rows: filter = blocked + passes');
const rr = nodeRows(F, 'r');
ok(kinds(rr) === 'condition,condition,otherwise', 'rows: route order (ghost edge skipped)');
ok(rr.map((r) => r.number ?? '-').join() === '1,2,-' && rr.map((r) => r.style).join() === 'priority1,priority,otherwise', 'rows: numbers + styles');
ok(rr[0].label === 'Country is US and device is phone' && rr[2].label === 'Otherwise', 'rows: labels');
ok(nodeRows(F, 's').map((r) => `${r.kind}:${r.share}:${r.label}`).join() === 'share:50:50%,share:50:50%', 'rows: split shares');
ok(nodeRows(F, 'entry')[0].label === 'All visitors', 'rows: entry label');
ok(kinds(nodeRows(F, 'a')) === 'next', 'rows: pixel edge is not a row');
ok(nodeRows(F, 'o').length === 0 && nodeRows(F, 'px').length === 0, 'rows: offer and pixel have none');
ok(nodeRows(Fzero, 's').map((r) => r.share).join() === '50,50', 'rows: weight 0 counts as 1');
const old = campaign.graph;
ok(kinds(nodeRows(old, 'entry')) === 'first,condition,otherwise' && nodeRows(old, 'entry')[0].style === 'blocked', 'rows: old flow entry (terminal filter first)');
ok(kinds(nodeRows(old, 'bots')) === 'blocked,only', 'rows: old terminal filter');
ok(lineStyle({ style: 'priority1' }).color === '#1D9E75' && lineStyle({ style: 'priority1' }, { color: 'coral' }).color === '#D85A30', 'style: priority1 + colour override');
ok(lineStyle({ style: 'otherwise' }).dash === '6 4' && lineStyle({ style: 'blocked' }).color === '#E24B4A', 'style: otherwise + blocked');
// extra coverage
ok(rr[0].edgeId === 'e2' && rr[0].targetId === 'a' && new Set(rr.map((r) => r.key)).size === 3, 'rows: edgeId, targetId, unique keys');
ok(nodeRows(F, 'f1')[0].targetId === null && nodeRows(F, 'f1')[0].style === 'blocked', 'rows: blocked row has null target');
ok(nodeRows(old, 'bots')[1].label === 'Only matching visitors arrive here' && nodeRows(old, 'entry')[0].detail === 'checked first', 'rows: old flow labels');
ok(effectiveWhen(old, old.edges[1]).country[0] === 'US' && effectiveWhen(old, old.edges[2]) === null, 'effectiveWhen: path gate, empty = null');
ok(effectiveWhen(F, F.edges[3]).country[0] === 'FR' && effectiveWhen(F, { from: 'r', to: 'c', when: {} }) === null, 'effectiveWhen: own when, empty object = null');
ok(isTerminalFilter(old, 'bots') === true && isTerminalFilter(F, 'f1') === false && isTerminalFilter(F, 'r') === false, 'isTerminalFilter');
const mixed = { entry: 'r', nodes: { r: mk('r', 'route'), a: mk('a', 'lander'), b: mk('b', 'lander'), c: mk('c', 'lander') },
  edges: [{ id: 'm1', from: 'r', to: 'a', when: { country: ['US'] } }, { id: 'm2', from: 'r', to: 'b' }, { id: 'm3', from: 'r', to: 'c' }] };
ok(nodeRows(mixed, 'r').map((r) => r.label).join('|') === 'Country is US|Otherwise · 50%|Otherwise · 50%', 'rows: several otherwise share');
const unnum = { entry: 'r', nodes: { r: mk('r', 'route'), a: mk('a', 'lander'), b: mk('b', 'lander') },
  edges: [{ id: 'u1', from: 'r', to: 'a', when: { country: ['US'] } }, { id: 'u2', from: 'r', to: 'b', when: { country: ['FR'] } }] };
ok(nodeRows(unnum, 'r').map((r) => `${r.number ?? '-'}:${r.style}`).join() === '-:priority,-:priority', 'rows: unnumbered conditions are plain priority');
const fch = { entry: 'f', nodes: { f: mk('f', 'filter', { when: { conds: [{ type: 'bot_ua' }] } }), a: mk('a', 'lander'), b: mk('b', 'lander') },
  edges: [{ id: 'c1', from: 'f', to: 'a', weight: 1 }, { id: 'c2', from: 'f', to: 'b', weight: 3 }] };
ok(nodeRows(fch, 'f').map((r) => r.label).join('|') === 'Is a bot|Passes · 25%|Passes · 75%', 'rows: filter share rows');
ok(nodeRows({ entry: 'x', nodes: {}, edges: [] }, 'nope').length === 0, 'rows: missing node');
ok(PALETTE.teal === '#1D9E75' && PALETTE.gray === '#888780' && Object.keys(PALETTE).length === 6 && BLOCKED_RED === '#E24B4A' && HIGHLIGHT.width === 4, 'style: constants');
ok(lineStyle({ style: 'priority1' }).width === 3 && lineStyle({ style: 'share' }).color === '#378ADD' && lineStyle({ style: 'plain' }, { color: 'purple' }).color === '#7F77DD', 'style: widths + colours');
ok(pixelLineStyle().dash === '2 4' && pixelLineStyle().color === '#7F77DD', 'style: pixel');

// fix round 1: engine-mirroring terminal filter + Passes prefix
const fpx = { entry: 'f', nodes: { f: mk('f', 'filter', { when: { conds: [{ type: 'bot_ua' }] } }), px: mk('px', 'pixel') }, edges: [{ id: 'p1', from: 'f', to: 'px' }] };
ok(isTerminalFilter(fpx, 'f') === false && kinds(nodeRows(fpx, 'f')) === 'blocked', 'rows: filter with only a pixel exit is chained (blocked row only)');
const fco = { entry: 'f', nodes: { f: mk('f', 'filter', { when: { conds: [{ type: 'bot_ua' }] } }), a: mk('a', 'lander'), b: mk('b', 'lander'), c: mk('c', 'lander') },
  edges: [{ id: 'q1', from: 'f', to: 'a', when: { country: ['US'] } }, { id: 'q2', from: 'f', to: 'b' }] };
ok(nodeRows(fco, 'f').map((r) => r.label).join('|') === 'Is a bot|Passes · Country is US|Passes · otherwise', 'rows: filter condition + otherwise carry Passes');
const fco2 = { ...fco, edges: [...fco.edges, { id: 'q3', from: 'f', to: 'c' }] };
ok(nodeRows(fco2, 'f').map((r) => r.label).slice(2).join('|') === 'Passes · otherwise · 50%|Passes · otherwise · 50%', 'rows: filter several otherwise carry Passes');
const fterm = { entry: 'r', nodes: { r: mk('r', 'route'), t: mk('t', 'filter', { when: { country: ['US'] } }), a: mk('a', 'lander') }, edges: [{ id: 't1', from: 'r', to: 't' }, { id: 't2', from: 'r', to: 'a' }] };
ok(nodeRows(fterm, 'r')[0].label === 'Country is US' && nodeRows(fterm, 'r')[0].kind === 'first', 'rows: first row on non-filter keeps plain label');
const fchain = { entry: 'f', nodes: { f: mk('f', 'filter', { when: { conds: [{ type: 'bot_ua' }] } }), t: mk('t', 'filter', { when: { country: ['US'] } }), a: mk('a', 'lander') }, edges: [{ id: 'k1', from: 'f', to: 't' }, { id: 'k2', from: 'f', to: 'a' }] };
ok(nodeRows(fchain, 'f')[1].label === 'Passes · Country is US' && nodeRows(fchain, 'f')[1].kind === 'first', 'rows: filter first row carries Passes');
const pe = { entry: 'r', nodes: { r: mk('r', 'route'), p: mk('p', 'path', { when: {} }) }, edges: [{ id: 'w1', from: 'r', to: 'p' }] };
ok(effectiveWhen(pe, pe.edges[0]) === null && nodeRows(pe, 'r')[0].kind === 'next', 'rows: path with empty when is unconditional');

// --- edit.js ---
const R3 = { entry: 'entry', nodes: { entry: mk('entry', 'entry'), r: mk('r', 'route'), a: mk('a', 'lander'), b: mk('b', 'lander'), c: mk('c', 'lander') },
  edges: [{ id: 'e_0', from: 'entry', to: 'r', weight: 1, when: null },
    { id: 'e_a', from: 'r', to: 'a', weight: 1, when: { country: ['US'] }, priority: 1 },
    { id: 'e_b', from: 'r', to: 'b', weight: 1, when: { country: ['FR'] }, priority: 2 },
    { id: 'e_c', from: 'r', to: 'c', weight: 1, when: null }] };
const R3snap = JSON.stringify(R3);
const pr = (g, id) => g.edges.find((e) => e.id === id).priority;
let g = setEdgeWhen(R3, 'e_c', { country: ['DE'] });
ok(g.edges.find((e) => e.id === 'e_c').priority === 3, 'edit: new condition gets the next priority');
g = moveRow(g, 'e_c', -1);
ok(['e_a', 'e_c', 'e_b'].every((id, i) => g.edges.find((e) => e.id === id).priority === i + 1), 'edit: move up swaps and renumbers');
g = deleteEdge(g, 'e_a');
ok(g.edges.find((e) => e.id === 'e_c').priority === 1 && g.edges.find((e) => e.id === 'e_b').priority === 2, 'edit: delete renumbers');
g = setEdgeWhen(g, 'e_b', null);
ok(!('priority' in g.edges.find((e) => e.id === 'e_b')) && g.edges.find((e) => e.id === 'e_b').when === null, 'edit: clearing the condition drops the priority');
ok(addRowEdge(R3, 'r', 'entry') === R3 && addRowEdge(R3, 'r', 'a').edges.length === R3.edges.length, 'edit: refuses entry target + duplicates');
ok(R3.edges.find((e) => e.id === 'e_c').when === null, 'edit: input graph not mutated');
ok(JSON.stringify(R3) === R3snap, 'edit: nothing mutated after all edits');
const gn = { ...R3, nodes: { ...R3.nodes, d: mk('d', 'lander') } };
const gd = addRowEdge(gn, 'r', 'd');
const ne = gd.edges[gd.edges.length - 1];
ok(gd.edges.length === gn.edges.length + 1 && ne.from === 'r' && ne.to === 'd' && ne.weight === 1 && ne.when === null && typeof ne.id === 'string' && !('priority' in ne), 'edit: add row appends unconditional edge');
ok(addRowEdge(R3, 'r', 'r') === R3, 'edit: refuses self loop');
ok(moveRow(R3, 'e_a', -1) === R3 || JSON.stringify(moveRow(R3, 'e_a', -1)) === R3snap, 'edit: move at top is a no-op');
ok(JSON.stringify(moveRow(R3, 'e_b', 1)) === R3snap, 'edit: move at bottom is a no-op');
ok(JSON.stringify(moveRow(R3, 'e_c', -1)) === R3snap, 'edit: unnumbered row cannot move');
const gm = moveRow(R3, 'e_b', -1);
ok(pr(gm, 'e_b') === 1 && pr(gm, 'e_a') === 2, 'edit: move swaps neighbours');
const gz = setEdgeWhen(R3, 'e_a', {});
ok(gz.edges.find((e) => e.id === 'e_a').when === null && !('priority' in gz.edges.find((e) => e.id === 'e_a')) && pr(gz, 'e_b') === 1, 'edit: empty when clears and renumbers');
const gr = renumberPriorities({ ...R3, edges: R3.edges.map((e) => e.id === 'e_a' ? { ...e, priority: 5 } : e.id === 'e_b' ? { ...e, priority: 9 } : e) }, 'r');
ok(pr(gr, 'e_a') === 1 && pr(gr, 'e_b') === 2 && !('priority' in gr.edges.find((e) => e.id === 'e_c')), 'edit: renumber gives 1..n, unnumbered stay');
const gt = retargetEdge(R3, 'e_c', 'b');
ok(gt.edges.find((e) => e.id === 'e_c').to === 'b' && R3.edges.find((e) => e.id === 'e_c').to === 'c', 'edit: retarget changes to only');
const gc = setEdgeColor(R3, 'e_a', 'teal');
ok(gc.edges.find((e) => e.id === 'e_a').color === 'teal' && !('color' in R3.edges.find((e) => e.id === 'e_a')), 'edit: colour set');
ok(!('color' in setEdgeColor(gc, 'e_a', null).edges.find((e) => e.id === 'e_a')), 'edit: colour cleared');
ok(setEdgeWeight(R3, 'e_c', 3).edges.find((e) => e.id === 'e_c').weight === 3 && R3.edges.find((e) => e.id === 'e_c').weight === 1, 'edit: weight set');

// --- checks.js ---
const CAT = {
  landers: [{ id: 'lp_a', name: 'Quiz lander A' }],
  offers: [{ id: 'of_main', name: 'Main offer' }],
  pixels: [{ id: 'px_1', name: 'Pixel 1' }],
  rules: [{ id: 'rl_reviewer', name: 'Known ad reviewer', logical: 'and', conds: [{ type: 'moderator' }] }],
};
const E = (id, from, to, extra = {}) => ({ id, from, to, weight: 1, when: null, ...extra });
const G = (nodes, edges, entry = 'entry') => ({ entry, nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges });
const nEntry = { id: 'entry', kind: 'entry' };
const nOffer = { id: 'o', kind: 'offer', ref: 'of_main' };
const has = (res, id, text, level) => (res.byNode[id] || []).some((p) => p.text === text && p.level === level);
const BOT = { conds: [{ type: 'bot_ua' }] };
const gFilterNoWhen = G([nEntry, { id: 'f', kind: 'filter' }, nOffer], [E('e1', 'entry', 'f'), E('e2', 'f', 'o')]);
const gMissingRule = G([nEntry, { id: 'f', kind: 'filter', when: { rule: 'rl_gone' } }, nOffer], [E('e1', 'entry', 'f'), E('e2', 'f', 'o')]);
const gEmptyRefs = G([nEntry, { id: 'l', kind: 'lander', ref: '' }, { id: 'o', kind: 'offer' }, { id: 'px', kind: 'pixel', ref: '' }],
  [E('e1', 'entry', 'l'), E('e2', 'l', 'o'), E('e3', 'o', 'px')]);
const gLanderDeadEnd = G([nEntry, { id: 'l', kind: 'lander', ref: 'lp_a' }], [E('e1', 'entry', 'l')]);
const gEntryAlone = G([nEntry], []);
const gOrphan = G([nEntry, nOffer, { id: 'lost', kind: 'offer', ref: 'of_main' }, { id: 'px', kind: 'pixel', ref: 'px_1' }],
  [E('e1', 'entry', 'o'), E('e2', 'lost', 'px')]);
const gNoOtherwise = G([nEntry, { id: 'r', kind: 'route' }, nOffer], [E('e1', 'entry', 'r'), E('e2', 'r', 'o', { when: { country: ['US'] } })]);
const gTwoUnnumbered = G([nEntry, { id: 'r', kind: 'route' }, nOffer, { id: 'o2', kind: 'offer', ref: 'of_main' }],
  [E('e1', 'entry', 'r'), E('e2', 'r', 'o', { when: { country: ['US'] } }), E('e3', 'r', 'o2', { when: { country: ['DE'] } })]);
const gFRA = G([nEntry, { id: 'r', kind: 'route' }, nOffer], [E('e1', 'entry', 'r'), E('e2', 'r', 'o', { when: { country: ['US', 'FRA'] } })]);
const gZeroShare = G([nEntry, { id: 's', kind: 'route' }, nOffer, { id: 'o2', kind: 'offer', ref: 'of_main' }],
  [E('e1', 'entry', 's'), E('e2', 's', 'o', { weight: 0 }), E('e3', 's', 'o2')]);
const gBadChallenge = G([nEntry, { id: 'f', kind: 'filter', when: BOT, action: 'challenge', challenge: { type: 'click', timeout_ms: 10 } }, nOffer],
  [E('e1', 'entry', 'f'), E('e2', 'f', 'o')]);
const gBadCond = G([nEntry, { id: 'f', kind: 'filter', when: { conds: [{ type: 'country', values: [] }] } }, nOffer], [E('e1', 'entry', 'f'), E('e2', 'f', 'o')]);
const gEmptyMatrix = G([nEntry, { id: 'm', kind: 'matrix', of: 'offer', key: { type: 'param', key: 'plan' }, rows: [] }], [E('e1', 'entry', 'm')]);
const gNoOffer = G([nEntry, { id: 'l', kind: 'lander', ref: 'lp_a' }], [E('e1', 'entry', 'l')]);
const blankOfferId = 'o1';
const blankFlow = { entry: 'entry', nodes: { entry: { id: 'entry', kind: 'entry' }, o1: { id: 'o1', kind: 'offer', ref: '' } }, edges: [{ id: 'e1', from: 'entry', to: 'o1', weight: 1, when: null }] };
const gGhostEdge = G([nEntry, nOffer], [E('e1', 'entry', 'o'), E('e2', 'entry', 'gone')]);
const gLoop = G([nEntry, { id: 'a', kind: 'route' }, { id: 'b', kind: 'route' }], [E('e1', 'entry', 'a'), E('e2', 'a', 'b'), E('e3', 'b', 'a')]);

ok(has(checkFlow(gFilterNoWhen, CAT), 'f', 'No condition: this filter would block every visitor', 'error'), 'checks: filter without condition');
ok(has(checkFlow(gMissingRule, CAT), 'f', "Uses rule 'rl_gone', which doesn't exist, so it matches nobody", 'error'), 'checks: missing rule');
ok(has(checkFlow(gEmptyRefs, CAT), 'l', 'No page picked', 'error') && has(checkFlow(gEmptyRefs, CAT), 'o', 'No offer picked', 'error') && has(checkFlow(gEmptyRefs, CAT), 'px', 'No pixel picked', 'error'), 'checks: nothing picked');
ok(has(checkFlow(gLanderDeadEnd, CAT), 'l', 'Visitors stop here: connect what comes after this page', 'error'), 'checks: page with no exit');
ok(has(checkFlow(gEntryAlone, CAT), 'entry', 'Nothing happens to visitors yet', 'error'), 'checks: entry with no exit');
ok(has(checkFlow(gOrphan, CAT), 'lost', 'Nothing leads here, so it never runs', 'warning') && !checkFlow(gOrphan, CAT).byNode.px, 'checks: unreachable (pixels exempt)');
ok(has(checkFlow(gNoOtherwise, CAT), 'r', "No 'Otherwise': visitors who match no row are lost", 'warning'), 'checks: no otherwise');
ok(has(checkFlow(gTwoUnnumbered, CAT), 'r', 'Several rows could match the same visitor: set priorities so the order is clear', 'warning'), 'checks: unnumbered overlap');
ok(!has(checkFlow(campaign.graph, CAT), 'entry', 'Several rows could match the same visitor: set priorities so the order is clear', 'warning'), 'checks: terminal-filter rows do not count');
ok(has(checkFlow(gFRA, CAT), 'r', "'FRA' isn't a 2-letter country code (use e.g. FR)", 'warning'), 'checks: country code');
ok(has(checkFlow(gZeroShare, CAT), 's', 'A share of 0 counts as 1 in the engine, so it still gets traffic', 'warning'), 'checks: zero share');
ok(has(checkFlow(gBadChallenge, CAT), 'f', 'challenge.timeout_ms must be a number of milliseconds between 500 and 120000', 'error'), 'checks: challenge settings');
ok(has(checkFlow(gBadCond, CAT), 'f', 'country condition needs a non-empty values array', 'error'), 'checks: invalid inline condition');
ok(has(checkFlow(gEmptyMatrix, CAT), 'm', 'matrix "m": needs at least one row', 'error'), 'checks: matrix');
ok(checkFlow(gNoOffer, CAT).global.some((p) => p.text === 'The flow never reaches an offer'), 'checks: global no offer');
ok(checkFlow(blankFlow, CAT).byNode[blankOfferId].some((p) => p.text === 'No offer picked'), 'checks: blank flow lists the gap');
ok(typeof checkFlow(gGhostEdge, CAT).count === 'number', 'checks: edge to a missing node does not throw');
ok(typeof checkFlow(gLoop, CAT).count === 'number', 'checks: a loop terminates');
{
  const r = checkFlow(gOrphan, CAT);
  ok(r.count === Object.values(r.byNode).flat().length + r.global.length, 'checks: count totals every problem');
  ok(worstLevel([{ level: 'warning', text: 'a' }]) === 'warning' && worstLevel([{ level: 'warning', text: 'a' }, { level: 'error', text: 'b' }]) === 'error' && worstLevel([]) === null, 'checks: worstLevel');
}

// --- simulate.js ---
{
  const CAT = {
    landers: [{ id: 'ld_quiz_a', name: 'Quiz lander A' }, { id: 'ld_quiz_b', name: 'Quiz lander B (variant)' }, { id: 'ld_review', name: 'Product review page' }, { id: 'ld_advertorial', name: 'Advertorial' }],
    offers: [{ id: 'of_main', name: 'Everflow #1442 — Main offer' }, { id: 'of_backup', name: 'Everflow #1443 — Backup offer' }, { id: 'of_safe', name: 'Everflow #1450 — Safe offer' }, { id: 'of_eu', name: 'Custom network — EU offer' }],
    pixels: [{ id: 'px_meta', name: 'Meta pixel' }],
    rules: [{ id: 'rl_reviewer', name: 'Known ad reviewer', logical: 'and', conds: [{ type: 'moderator' }] }],
  };
  const e = (id, from, to, extra = {}) => ({ id, from, to, weight: 1, when: null, ...extra });
  const g = (nodes, edges) => ({ entry: 'entry', nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges });
  const S = g([
    { id: 'entry', kind: 'entry' },
    { id: 'stop_reviewers', kind: 'filter', note: 'Block reviewers', when: { rule: 'rl_reviewer' }, action: '404' },
    { id: 'stop_bots', kind: 'filter', note: 'Block bots', when: { conds: [{ type: 'bot_ua' }] }, action: '404' },
    { id: 'check_datacenter', kind: 'filter', note: 'Check VPN', when: { conds: [{ type: 'datacenter' }] }, action: 'challenge', challenge: { type: 'click', timeout_ms: 8000, on_fail: '404' } },
    { id: 'route_audience', kind: 'route', note: 'Who is the visitor?' },
    { id: 'split_quiz', kind: 'split' },
    { id: 'page_quiz_a', kind: 'lander', ref: 'ld_quiz_a' },
    { id: 'page_quiz_b', kind: 'lander', ref: 'ld_quiz_b' },
    { id: 'page_advertorial', kind: 'lander', ref: 'ld_advertorial' },
    { id: 'page_review', kind: 'lander', ref: 'ld_review' },
    { id: 'offer_main', kind: 'offer', ref: 'of_main', note: 'Main offer' },
    { id: 'offer_eu', kind: 'offer', ref: 'of_eu', note: 'EU offer' },
    { id: 'offer_backup', kind: 'offer', ref: 'of_backup', note: 'Backup offer' },
    { id: 'px_meta', kind: 'pixel', ref: 'px_meta' },
  ], [
    e('e1', 'entry', 'stop_reviewers'), e('e2', 'stop_reviewers', 'stop_bots'), e('e3', 'stop_bots', 'check_datacenter'), e('e4', 'check_datacenter', 'route_audience'),
    e('e5', 'route_audience', 'split_quiz', { when: { country: ['US'], device: ['mobile'] }, priority: 1 }),
    e('e6', 'route_audience', 'page_advertorial', { when: { country: ['FR', 'DE', 'ES', 'IT', 'NL'] }, priority: 2 }),
    e('e7', 'route_audience', 'page_review'),
    e('e8', 'split_quiz', 'page_quiz_a', { weight: 50 }), e('e9', 'split_quiz', 'page_quiz_b', { weight: 50 }),
    e('e10', 'page_quiz_a', 'offer_main'), e('e11', 'page_quiz_b', 'offer_main'),
    e('e12', 'page_advertorial', 'offer_eu'), e('e13', 'page_review', 'offer_backup'),
  ]);
  const Mx = g([{ id: 'entry', kind: 'entry' }, { id: 'mx', kind: 'matrix', of: 'offer', key: { type: 'param', key: 'plan' }, rows: [{ value: 'a', ref: 'of_main' }], fallback: 'of_backup' }], [e('e1', 'entry', 'mx')]);
  const RouteNoOtherwise = g([{ id: 'entry', kind: 'entry' }, { id: 'r', kind: 'route' }, { id: 'l', kind: 'lander', ref: 'ld_review' }, { id: 'o', kind: 'offer', ref: 'of_main' }],
    [e('e1', 'entry', 'r'), e('e2', 'r', 'l', { when: { country: ['US'] } }), e('e3', 'l', 'o')]);
  const gLoop = g([{ id: 'entry', kind: 'entry' }, { id: 'a', kind: 'route' }, { id: 'b', kind: 'route' }], [e('e1', 'entry', 'a'), e('e2', 'a', 'b'), e('e3', 'b', 'a')]);
  const blankFlow = { entry: 'entry', nodes: { entry: { id: 'entry', kind: 'entry' }, o1: { id: 'o1', kind: 'offer', ref: '' } }, edges: [{ id: 'e1', from: 'entry', to: 'o1', weight: 1, when: null }] };

  const sim = (v) => simulateVisit(S, CAT, { ...DEFAULT_VISITOR, ...v }, 'fixed');
  const bot = sim({ bot: true });
  ok(bot.outcome === 'blocked' && bot.text === "Blocked at 'Block bots' → 404 page" && bot.endFor === 'stop_bots', 'simulate: bot blocked');
  const us = sim({});
  ok(us.outcome === 'offer' && us.text.endsWith('→ Main offer') && us.random === true, 'simulate: US phone reaches main offer via the A/B split');
  ok(us.edges.length === us.nodes.length - 1, 'simulate: one edge per step');
  const vpn = sim({ vpn: true });
  ok(vpn.outcome === 'challenge' && vpn.text === "Challenge at 'Check VPN' (click within 8s)" && vpn.passText.startsWith('If they pass: ') && vpn.passText.endsWith('→ Main offer'), 'simulate: challenge + pass branch');
  ok(sim({ country: ' de ', device: 'desktop' }).text.endsWith('→ EU offer'), 'simulate: country is trimmed and upper-cased');
  ok(parseParams('\n offer = test \n\n').query.offer === 'test', 'simulate: params trimmed, blanks skipped');
  const mx = simulateVisit(Mx, CAT, { ...DEFAULT_VISITOR, params: 'plan=a' });
  ok(mx.nodes.includes('mx') && !mx.nodes.some((id) => id.startsWith('mx_')), 'simulate: matrix rows map back');
  ok(mx.text === '→ Everflow #1442 — Main offer', 'simulate: matrix offer name from the row ref', mx.text);
  ok(simulateVisit(blankFlow, CAT, DEFAULT_VISITOR).text === '→ Offer (nothing picked)', 'simulate: blank flow');
  ok(sim({ country: 'BR', device: 'desktop' }).outcome === 'offer' && simulateVisit(RouteNoOtherwise, CAT, { ...DEFAULT_VISITOR, country: 'BR' }).outcome === 'dead_end', 'simulate: dead end reported');
  ok(simulateVisit(RouteNoOtherwise, CAT, { ...DEFAULT_VISITOR, country: 'BR' }).text === "Stops at 'Route': nowhere to go (dead end)", 'simulate: dead end text');
  ok(simulateVisit(gLoop, CAT, DEFAULT_VISITOR).outcome === 'dead_end', 'simulate: loop ends as dead end');
  ok(simulateVisit(gLoop, CAT, DEFAULT_VISITOR).text === "Goes round in a loop at 'Route'", 'simulate: a loop is worded as a loop, at the first box reached twice', simulateVisit(gLoop, CAT, DEFAULT_VISITOR).text);
  ok(challengeShort({ type: 'click', timeout_ms: 8000 }) === 'click within 8s', 'simulate: challengeShort click');
  ok(challengeShort({ type: 'honeypot', timeout_ms: 8000 }) === 'hidden-button check', 'simulate: challengeShort honeypot');
  ok(challengeShort({ type: 'timing', timeout_ms: 3000 }) === 'wait 3s before clicking', 'simulate: challengeShort timing');
  ok(challengeShort({ type: 'motion', timeout_ms: 8000 }) === 'move the mouse first', 'simulate: challengeShort motion');
  ok(challengeShort({ type: 'click' }) === 'click within 8s' && challengeShort(null) === 'click within 8s', 'simulate: challengeShort missing timeout defaults to 8');
  const MxNote = g([{ id: 'entry', kind: 'entry' }, { ...Mx.nodes.mx, note: 'Plan lookup' }], [e('e1', 'entry', 'mx')]);
  ok(simulateVisit(MxNote, CAT, { ...DEFAULT_VISITOR, params: 'plan=a' }).text === '→ Everflow #1442 — Main offer', 'simulate: noted matrix does not rename its rows');
  ok(parseParams('a=1').tokenOrder.length === 20 && parseParams('').tokenOrder[0] === 't1', 'simulate: tokenOrder t1..t20');
}

// --- sample flow (examples/checkpoint-flow.json) ---
{
  const sample = JSON.parse(readFileSync(new URL('../examples/checkpoint-flow.json', import.meta.url), 'utf8'));
  const SCAT = {
    landers: [{ id: 'ld_quiz_a', name: 'Quiz lander A' }, { id: 'ld_quiz_b', name: 'Quiz lander B (variant)' }, { id: 'ld_review', name: 'Product review page' }, { id: 'ld_advertorial', name: 'Advertorial' }],
    offers: [{ id: 'of_main', name: 'Everflow #1442 — Main offer' }, { id: 'of_backup', name: 'Everflow #1443 — Backup offer' }, { id: 'of_safe', name: 'Everflow #1450 — Safe offer' }, { id: 'of_eu', name: 'Custom network — EU offer' }],
    pixels: [{ id: 'px_meta', name: 'Meta pixel' }],
    rules: [{ id: 'rl_reviewer', name: 'Known ad reviewer', logical: 'and', conds: [{ type: 'moderator' }] }],
    valueLists: [],
  };
  ok(checkFlow(sample.graph, SCAT).count === 0, 'sample: no problems');
  ok(!/\([^)]*\(/.test(sample.description) && sample.description.includes('a safe fallback offer instead of a 404'), 'sample: the description has no brackets inside brackets');
  ok(sample.graph.nodes.route_audience.kind === 'route', 'sample: uses a route node');
  const last = (v) => { const r = simulateVisit(sample.graph, SCAT, { ...DEFAULT_VISITOR, ...v }, 'fixed'); return r.nodes[r.nodes.length - 1]; };
  ok(last({}) === 'offer_main' && last({ country: 'DE', device: 'desktop' }) === 'offer_eu', 'sample: US phone ends on main offer, DE desktop on EU offer');
  const sr = simulateVisit(sample.graph, SCAT, { ...DEFAULT_VISITOR, reviewer: true }, 'fixed');
  ok(sr.outcome === 'fallback' && sr.text === "Caught at 'Block Reviewers' → Fallback offer" && sr.lines[0] === "Caught at 'Block Reviewers': Known ad reviewer", 'sample: a caught reviewer goes to the fallback offer', JSON.stringify([sr.outcome, sr.text, sr.lines]));
  ok(simulateVisit(sample.graph, SCAT, { ...DEFAULT_VISITOR, bot: true }, 'fixed').text === "Blocked at 'Block Bots' → 404 page", 'sample: a bot still gets the 404');
  const sc = simulateVisit(sample.graph, SCAT, { ...DEFAULT_VISITOR, vpn: true }, 'fixed');
  ok(sc.lines[0] === "Challenge at 'Check VPN': Uses a VPN / datacenter" && sc.lines[1] === '→ click within 8s' && sc.lines[2] === sc.passText, 'sample: the challenge result reads in lines', JSON.stringify(sc.lines));
}

// --- canvas layout + geometry (helpers.js) ---
{
  const sample = JSON.parse(readFileSync(new URL('../examples/checkpoint-flow.json', import.meta.url), 'utf8'));
  const gLoop = G([nEntry, { id: 'a', kind: 'route' }, { id: 'b', kind: 'route' }], [E('e1', 'entry', 'a'), E('e2', 'a', 'b'), E('e3', 'b', 'a')]);
  const L = structuredClone(sample.graph.nodes); layoutGraph(L, sample.graph.edges, () => 120);
  ok(L.entry.x === 40 && L.stop_reviewers.x === 340, 'layout: columns 300 apart');
  ok(Object.values(L).filter((n) => n.kind === 'pixel').every((n) => n.x > L.offer_main.x), 'layout: pixels in a lane on the right');
  const cols = {}; Object.values(L).forEach((n) => (cols[n.x] ||= []).push(n.y));
  ok(Object.values(cols).every((ys) => ys.sort((a, b) => a - b).every((y, i) => i === 0 || y - ys[i - 1] >= 160)), 'layout: no overlap in a column');
  const loopNodes = structuredClone(gLoop.nodes); layoutGraph(loopNodes, gLoop.edges);
  ok(Object.values(loopNodes).every((n) => Number.isFinite(n.x)), 'layout: a loop terminates');
  // extra coverage
  ok(loopNodes.entry.x === 40 && loopNodes.a.x === 340 && loopNodes.b.x === 640 && loopNodes.a.y === 40, 'layout: loop depths 0, 1, 2 (visited set)');
  ok(L.px_meta.x === 40 + 8 * 300 && L.px_meta.y === 40 && L.offer_main.x === 40 + 7 * 300, 'layout: pixel lane is one column after the deepest, top');
  ok(L.split_quiz.y === 40 && L.page_advertorial.y === 200 && L.page_review.y === 360, 'layout: a column stacks in row order from 40');
  const orphan = structuredClone(gOrphan.nodes); layoutGraph(orphan, gOrphan.edges);
  ok(orphan.lost.x === 340 && orphan.o.x === 340 && orphan.lost.y !== orphan.o.y && orphan.px.x === 640, 'layout: unreachable nodes go to column 1');
  const tall = { entry: { ...nEntry }, a: { id: 'a', kind: 'lander' }, b: { id: 'b', kind: 'lander' } };
  layoutGraph(tall, [E('t1', 'entry', 'a'), E('t2', 'entry', 'b')], (id) => (id === 'a' ? 200 : 100));
  ok(tall.a.y === 40 && tall.b.y === 40 + 200 + 40, 'layout: heightOf drives the stacking');
  const prio = { entry: { ...nEntry }, r: { id: 'r', kind: 'route' }, x: { id: 'x', kind: 'lander' }, y: { id: 'y', kind: 'lander' }, z: { id: 'z', kind: 'lander' } };
  layoutGraph(prio, [E('p0', 'entry', 'r'), E('p1', 'r', 'x'), E('p2', 'r', 'y', { when: { country: ['FR'] }, priority: 2 }), E('p3', 'r', 'z', { when: { country: ['US'] }, priority: 1 })]);
  ok(prio.z.y < prio.y.y && prio.y.y < prio.x.y, 'layout: children stack in the order of the parent\'s rows');
  const ghost = { entry: { ...nEntry }, o: { ...nOffer } };
  layoutGraph(ghost, [E('g1', 'entry', 'o'), E('g2', 'entry', 'gone')]);
  ok(ghost.o.x === 340 && !('gone' in ghost), 'layout: edges to missing nodes are ignored');
  ok(NODE_W === 240 && HEADER_H === 40 && ROW_H === 34 && ADD_H === 20, 'geometry: constants');
  ok(nodeHeight(3, true) === 40 + 102 + 20 && nodeHeight(3, false) === 40 + 102, 'geometry: nodeHeight');
  ok(nodeHeight(0, false) === 40 + 34 && nodeHeight(0, true) === 40 + 34 + 20, 'geometry: a node with no rows keeps one row of body');
  ok(addPortY({ y: 100 }, 2, 0) === 100 + 40 + 68 + 10 && addPortY({ y: 100 }, 2, 1) === 100 + 40 + 68 + 20 + 10 && addPortY({ y: 0 }, 0, 0) === 40 + 34 + 10, 'geometry: addPortY, the middle of "+ add" (0) and "+ fallback" (1), one row at least');
  ok(rowPortY({ x: 0, y: 100 }, 1) === 100 + 40 + 34 + 17 && rowPortY({ x: 5, y: 0 }, 0) === 57, 'geometry: rowPortY');
  // old flows saved without positions (review focus 1)
  const camp = structuredClone(campaign.graph); const campSnap = JSON.stringify(camp);
  const placed = placeMissing(camp.nodes, camp.edges);
  ok(Object.values(placed).every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)) && JSON.stringify(camp) === campSnap, 'placeMissing: old flow gets positions, input untouched');
  ok(placed.entry.x === 40 && placed.bots.x === 340 && placed.px.x > placed.offer_a.x, 'placeMissing: uses the left-to-right layout');
  ok(placeMissing(sample.graph.nodes, sample.graph.edges) === sample.graph.nodes, 'placeMissing: fully positioned nodes come back as is');
  const half = placeMissing({ entry: { ...nEntry, x: 500, y: 500 }, o: { ...nOffer } }, [E('m1', 'entry', 'o')]);
  ok(half.entry.x === 500 && half.entry.y === 500 && half.o.x === 340 && half.o.y === 40, 'placeMissing: only nodes without a position move');

  // follow-up rulings: longest-path depth, end box under each filter, retarget guard
  const lp = { entry: { ...nEntry }, a: { id: 'a', kind: 'route' }, b: { id: 'b', kind: 'lander' } };
  layoutGraph(lp, [E('l1', 'entry', 'a'), E('l2', 'a', 'b'), E('l3', 'entry', 'b')]);
  ok(lp.b.x > lp.a.x && lp.a.x === 340 && lp.b.x === 640, 'layout: longest path from entry, so every arrow points right');
  const lps = { entry: { ...nEntry }, a: { id: 'a', kind: 'route' }, b: { id: 'b', kind: 'route' } };
  layoutGraph(lps, [E('s1', 'entry', 'a'), E('s2', 'a', 'b'), E('s3', 'b', 'a'), E('s4', 'entry', 'b')]);
  ok(lps.a.x === 340 && lps.b.x === 640, 'layout: a loop with a shortcut terminates (back edge ignored)');
  const FP = { entry: 'entry', nodes: {
    entry: { id: 'entry', kind: 'entry' }, f: { id: 'f', kind: 'filter', when: BOT, action: '404' },
    c: { id: 'c', kind: 'filter', when: BOT, action: 'challenge', challenge: { type: 'click', timeout_ms: 8000 } },
    r: { id: 'r', kind: 'route' }, o: { id: 'o', kind: 'offer', ref: 'x' }, px: { id: 'px', kind: 'pixel' } },
  edges: [E('f1', 'entry', 'f'), E('f2', 'f', 'c'), E('f3', 'c', 'r'), E('f4', 'r', 'o')] };
  ok(nodeFootprint(FP, 'f') === 40 + 2 * 34 + 20 + 24 + 30, 'footprint: a 404 filter reserves its end box below');
  ok(nodeFootprint(FP, 'c') === 40 + 2 * 34 + 20 + 24 + 44, 'footprint: a challenge box is taller');
  ok(nodeFootprint(FP, 'r') === 40 + 34 + 20 && nodeFootprint(FP, 'o') === 40 + 34 && nodeFootprint(FP, 'px') === 40 + 60, 'footprint: other nodes are just their box');
  ok(nodeFootprint(FP, 'f', [], true) === 40 + 68 + 24 + 30 && nodeFootprint(FP, 'nope') === 0, 'footprint: readOnly has no + add, a missing node is 0');
  ok(endBoxHeight(FP.nodes.f) === 30 && endBoxHeight(FP.nodes.c) === 44 && endBoxHeight(FP.nodes.r) === 0 && END_DROP === 24 && END_W === 170, 'end box: sizes');
  // every end box (centred under its filter, END_DROP below) stays clear of every node
  // (a filter with a valid fallback offer has no end box: its footprint is just its box)
  const hasEndBox = (g, id) => g.nodes[id].kind === 'filter' && endBoxText(g, id) !== null;
  const own = (g, id) => nodeFootprint(g, id) - (hasEndBox(g, id) ? END_DROP + endBoxHeight(g.nodes[id]) : 0);
  const boxesClear = (g) => {
    const ids = Object.keys(g.nodes);
    return ids.filter((id) => hasEndBox(g, id)).every((fid) => {
      const f = g.nodes[fid];
      const b = { x: f.x + (NODE_W - END_W) / 2, y: f.y + own(g, fid) + END_DROP, w: END_W, h: endBoxHeight(f) };
      return ids.every((id) => {
        const n = g.nodes[id];
        return n.x >= b.x + b.w || n.x + NODE_W <= b.x || n.y >= b.y + b.h || n.y + own(g, id) <= b.y;
      });
    });
  };
  // no two boxes overlap (a parked fallback offer included)
  const boxesApart = (g) => {
    const ids = Object.keys(g.nodes);
    return ids.every((a, i) => ids.slice(i + 1).every((b) => {
      const p = g.nodes[a], q = g.nodes[b];
      return p.x >= q.x + NODE_W || p.x + NODE_W <= q.x || p.y >= q.y + own(g, b) || p.y + own(g, a) <= q.y;
    }));
  };
  ok(boxesClear(sample.graph), 'end box: the stored sample has room under every filter');
  const arranged = structuredClone(sample.graph); layoutGraph(arranged.nodes, arranged.edges, (id) => nodeFootprint(arranged, id));
  ok(boxesClear(arranged), 'end box: Arrange with nodeFootprint keeps every end box clear');
  ok(!!sample.graph.nodes.offer_fallback && boxesApart(sample.graph), 'sample: the fallback box overlaps nothing');
  const mainBottom = Math.max(...Object.keys(arranged.nodes).filter((id) => id !== 'offer_fallback').map((id) => arranged.nodes[id].y + own(arranged, id)));
  ok(arranged.nodes.offer_fallback.y >= mainBottom && boxesApart(arranged), 'arrange: offer_fallback is in the lane (below every main box) and overlaps nothing', JSON.stringify([arranged.nodes.offer_fallback.y, mainBottom]));
  const stack = { entry: 'entry', nodes: { entry: { id: 'entry', kind: 'entry' }, f: { id: 'f', kind: 'filter', when: BOT }, g: { id: 'g', kind: 'filter', when: BOT, action: 'challenge' }, o: { id: 'o', kind: 'offer' } },
    edges: [E('k1', 'entry', 'f'), E('k2', 'entry', 'g'), E('k3', 'entry', 'o')] };
  layoutGraph(stack.nodes, stack.edges, (id) => nodeFootprint(stack, id));
  ok(stack.nodes.f.x === stack.nodes.g.x && boxesClear(stack), 'end box: two filters in one column do not cover each other');
  const RT = { entry: 'entry', nodes: { entry: { id: 'entry', kind: 'entry' }, r: { id: 'r', kind: 'route' }, a: { id: 'a', kind: 'lander' }, b: { id: 'b', kind: 'lander' }, c: { id: 'c', kind: 'lander' }, px: { id: 'px', kind: 'pixel' } },
    edges: [E('t0', 'entry', 'r'), E('t1', 'r', 'a'), E('t2', 'r', 'b')] };
  ok(retargetAllowed(RT, 't1', 'px') === false, 'guard: a row cannot be dropped on a pixel');
  ok(!retargetAllowed(RT, 't1', 'entry') && !retargetAllowed(RT, 't1', 'r') && !retargetAllowed(RT, 't1', 'b') && !retargetAllowed(RT, 't1', 'a') && !retargetAllowed(RT, 't1', 'gone') && !retargetAllowed(RT, 'nope', 'c'),
    'guard: entry, own node, existing target, missing node or edge are refused');
  ok(retargetAllowed(RT, 't1', 'c') === true, 'guard: a fresh node is allowed');
}

// --- deleting a node (edit.js removeNode) + the entry test (helpers.js isEntryNode) ---
{
  const US = { country: ['US'] };
  const RM = { entry: 'entry', nodes: { entry: { id: 'entry', kind: 'entry' }, r: { id: 'r', kind: 'route' }, a: { id: 'a', kind: 'lander' }, b: { id: 'b', kind: 'lander' }, c: { id: 'c', kind: 'lander' }, o: { id: 'o', kind: 'offer' } },
    edges: [E('m0', 'entry', 'r'), E('m1', 'r', 'a', { when: US, priority: 1 }), E('m2', 'r', 'b', { when: US, priority: 2 }), E('m3', 'r', 'c', { when: US, priority: 3 }), E('m4', 'b', 'o')] };
  const before = JSON.stringify(RM);
  const out = removeNode(RM, 'b');
  ok(!out.nodes.b && out.edges.every((e) => e.from !== 'b' && e.to !== 'b') && out.edges.length === 3, 'removeNode: removes the node and every connection touching it');
  const pr = Object.fromEntries(out.edges.filter((e) => e.from === 'r').map((e) => [e.to, e.priority]));
  ok(pr.a === 1 && pr.c === 2, "removeNode: a route's remaining priorities are renumbered (c: 3 -> 2)", JSON.stringify(pr));
  ok(JSON.stringify(RM) === before, 'removeNode: does not mutate its input');
  ok(removeNode(RM, 'entry') === RM && removeNode(RM, 'gone') === RM, 'removeNode: refuses the entry and a missing node');
  ok(isEntryNode({ entry: 'entry', nodes: { entry: { id: 'entry', kind: 'entry' } } }, 'entry') === true, "isEntryNode: kind 'entry'");
  ok(isEntryNode({ entry: 'start', nodes: { t: { id: 't', kind: 'traffic' } } }, 't') === true, "isEntryNode: old kind 'traffic'");
  ok(isEntryNode({ entry: 'start', nodes: { start: { id: 'start', kind: 'lander' } } }, 'start') === true, 'isEntryNode: the graph.entry id');
  ok(isEntryNode(RM, 'a') === false, 'isEntryNode: false for a lander');
}

// --- fix round: priorities on every source except a split; only real conditions hold a number ---
{
  const US = { country: ['US'] }, FR = { country: ['FR'] };
  const P = (g, id) => g.edges.find((e) => e.id === id).priority;
  const TR = { entry: 'entry', nodes: { entry: { id: 'entry', kind: 'traffic' }, a: { id: 'a', kind: 'lander' }, b: { id: 'b', kind: 'lander' }, px: { id: 'px', kind: 'pixel' } },
    edges: [E('x1', 'entry', 'a'), E('x2', 'entry', 'b'), E('x3', 'entry', 'px')] };
  const t1 = setEdgeWhen(TR, 'x1', US);
  ok(P(t1, 'x1') === 1 && P(setEdgeWhen(t1, 'x2', FR), 'x2') === 2, "priority: a condition on a 'traffic' entry's line gets the next number");
  ok(!('priority' in setEdgeWhen(TR, 'x3', US).edges.find((e) => e.id === 'x3')), 'priority: a line into a pixel never gets a number');
  const FL = { entry: 'entry', nodes: { entry: { id: 'entry', kind: 'entry' }, f: { id: 'f', kind: 'filter', when: { conds: [{ type: 'bot_ua' }] } }, a: { id: 'a', kind: 'lander' }, b: { id: 'b', kind: 'lander' } },
    edges: [E('y0', 'entry', 'f'), E('y1', 'f', 'a'), E('y2', 'f', 'b')] };
  ok(P(setEdgeWhen(FL, 'y1', US), 'y1') === 1, "priority: a condition on a filter's continue line gets a number");
  const SP = { entry: 'entry', nodes: { entry: { id: 'entry', kind: 'entry' }, s: { id: 's', kind: 'split' }, a: { id: 'a', kind: 'lander' }, b: { id: 'b', kind: 'lander' } },
    edges: [E('z0', 'entry', 's'), E('z1', 's', 'a'), E('z2', 's', 'b', { priority: 4 })] };
  const sp = setEdgeWhen(SP, 'z1', US);
  ok(!('priority' in sp.edges.find((e) => e.id === 'z1')) && !('priority' in setEdgeWhen(SP, 'z2', US).edges.find((e) => e.id === 'z2')),
    "priority: a condition on a split's line gets no number (and a leftover one is dropped)");
  const ST = { entry: 'entry', nodes: { entry: { id: 'entry', kind: 'entry' }, r: { id: 'r', kind: 'route' }, a: { id: 'a', kind: 'lander' }, p: { id: 'p', kind: 'lander' }, c: { id: 'c', kind: 'lander' }, q: { id: 'q', kind: 'path', when: null }, g: { id: 'g', kind: 'path', when: FR } },
    edges: [E('s1', 'r', 'a', { when: US, priority: 3 }), E('s2', 'r', 'p', { priority: 1 }), E('s3', 'r', 'q', { priority: 2 }), E('s4', 'r', 'g', { priority: 7 })] };
  const rn = renumberPriorities(ST, 'r');
  ok(!('priority' in rn.edges.find((e) => e.id === 's2')) && !('priority' in rn.edges.find((e) => e.id === 's3')) && P(rn, 's1') === 1 && P(rn, 's4') === 2,
    'priority: renumber drops leftover numbers (no condition, unconditional path) and numbers the rest 1..n');
  const MV = { entry: 'entry', nodes: { entry: { id: 'entry', kind: 'entry' }, r: { id: 'r', kind: 'route' }, a: { id: 'a', kind: 'lander' }, p: { id: 'p', kind: 'lander' }, c: { id: 'c', kind: 'lander' } },
    edges: [E('A', 'r', 'a', { when: US, priority: 1 }), E('Pp', 'r', 'p', { priority: 2 }), E('C', 'r', 'c', { when: FR, priority: 3 })] };
  const mvSnap = JSON.stringify(MV);
  const mv = moveRow(MV, 'C', -1);
  ok(P(mv, 'C') === 1 && P(mv, 'A') === 2 && !('priority' in mv.edges.find((e) => e.id === 'Pp')), 'priority: moveRow skips a line without a condition (C up: C=1, A=2, P none)');
  ok(JSON.stringify(MV) === mvSnap && moveRow(MV, 'Pp', -1) === MV, 'priority: moveRow does not mutate, and a line without a condition does not move');
}

// --- names.js: box names and the "Problems" list ---
{
  const CAT = { landers: [{ id: 'ld_a', name: 'Quiz lander A' }], offers: [{ id: 'of_m', name: 'Main offer' }], pixels: [{ id: 'px_m', name: 'Meta pixel' }] };
  const NG = { entry: 'entry', nodes: {
    entry: { id: 'entry', kind: 'entry' }, t: { id: 't', kind: 'traffic' },
    f: { id: 'f', kind: 'filter', note: 'Block bots' }, f2: { id: 'f2', kind: 'filter' },
    p: { id: 'p', kind: 'lander', ref: 'ld_a' }, p2: { id: 'p2', kind: 'lander', ref: 'ld_gone' }, p3: { id: 'p3', kind: 'lander', ref: '' },
    o: { id: 'o', kind: 'offer', ref: 'of_m' }, px: { id: 'px', kind: 'pixel', ref: 'px_m' }, px2: { id: 'px2', kind: 'pixel' },
    m: { id: 'm', kind: 'matrix' }, s: { id: 's', kind: 'split' }, q: { id: 'q', kind: 'path' }, w: { id: 'w', kind: 'weird' },
  }, edges: [] };
  const nm = (id) => boxName(NG, id, CAT);
  ok(nm('f') === 'Block bots' && nm('p') === 'Quiz lander A' && nm('o') === 'Main offer' && nm('px') === 'Meta pixel',
    'boxName: the note, else the catalog name of what the box picked');
  ok([nm('entry'), nm('t'), nm('f2'), nm('p2'), nm('p3'), nm('px2'), nm('m'), nm('s'), nm('q')].join('|')
    === 'Visitors arrive|Visitors arrive|Filter|Page|Page|Tracking|Lookup table|A/B split|Path', 'boxName: else the type label');
  ok(nm('w') === 'Step' && nm('gone') === '' && boxName(null, 'x') === '', 'boxName: unknown kind, missing box, no flow');
  const PL = problemLines(NG, {
    byNode: { p3: [{ level: 'warning', text: 'W1' }, { level: 'error', text: 'E2' }], f: [{ level: 'warning', text: 'W0' }], f2: [{ level: 'error', text: 'E1' }] },
    global: [{ level: 'error', text: 'The flow never reaches an offer' }, { level: 'warning', text: 'G warn' }],
  }, CAT);
  const shown = PL.map((l) => (l.name ? `${l.name}: ${l.text}` : l.text));
  ok(shown.join('|') === 'The flow never reaches an offer|Filter: E1|Page: E2|G warn|Block bots: W0|Page: W1',
    'problemLines: errors first, flow-wide ones without a box name, then flow order', shown.join('|'));
  ok(PL[0].id === null && PL[1].id === 'f2' && PL[2].id === 'p3', 'problemLines: each line knows the box to show');
  ok(problemLines(NG, null).length === 0 && problemLines(NG, { byNode: {}, global: [] }).length === 0, 'problemLines: no problems, no lines');
  const BL = { entry: 'entry', nodes: { entry: { id: 'entry', kind: 'entry' }, o: { id: 'o', kind: 'offer' } }, edges: [{ id: 'e', from: 'entry', to: 'o' }] };
  const real = checkFlow(BL, CAT);
  ok(real.count > 0 && problemLines(BL, real, CAT).length === real.count, "problemLines: one line per problem in checkFlow's count");
}

// --- final-review fixes ---
{
  const FCAT = {
    landers: [{ id: 'ld_quiz_a', name: 'Quiz lander A' }, { id: 'ld_quiz_b', name: 'Quiz lander B (variant)' }, { id: 'ld_review', name: 'Product review page' }, { id: 'ld_advertorial', name: 'Advertorial' }],
    offers: [{ id: 'of_main', name: 'Everflow #1442 — Main offer' }, { id: 'of_backup', name: 'Everflow #1443 — Backup offer' }, { id: 'of_safe', name: 'Everflow #1450 — Safe offer' }, { id: 'of_eu', name: 'Custom network — EU offer' }],
    pixels: [{ id: 'px_meta', name: 'Meta pixel' }],
    rules: [{ id: 'rl_reviewer', name: 'Known ad reviewer', logical: 'and', conds: [{ type: 'moderator' }] }],
  };
  const noThrow = (fn) => { try { fn(); return true; } catch { return false; } };
  const sample = JSON.parse(readFileSync(new URL('../examples/checkpoint-flow.json', import.meta.url), 'utf8'));
  const filterWith = (when) => G([nEntry, { id: 'f', kind: 'filter', when }, nOffer], [E('e1', 'entry', 'f'), E('e2', 'f', 'o')]);
  const NO_COND = 'No condition: this filter would block every visitor';
  const GHOST = 'A line goes to a box that no longer exists';

  // 2. a malformed condition must not throw: checkFlow runs on every render, so a throw blanks the page
  ok(noThrow(() => describeWhen({ conds: [{ type: 'bot_ua' }, {}] })) && describeWhen({ conds: [{ type: 'bot_ua' }, {}] }) === 'Is a bot',
    'fix 2: a typeless cond after the first is skipped, not a crash');
  ok(noThrow(() => describeWhen({ country: 'US' })) && describeWhen({ country: 'US' }) === 'Country is US', 'fix 2: a country string reads as one value');
  ok(noThrow(() => describeWhen({ conds: [null, { type: 'datacenter' }] })) && describeWhen({ conds: [null, { type: 'datacenter' }] }) === 'Uses a VPN / datacenter',
    'fix 2: a null cond is skipped');
  ok(noThrow(() => describeCond({ type: 'country', values: 'US' })) && describeCond({ type: 'country', values: 'US' }) === 'Country is US', 'fix 2: a cond with a values string reads as one value');
  ok(noThrow(() => describeCond(null)) && describeCond(null) === '' && describeCond({}) === '', 'fix 2: a null or typeless cond describes as nothing');
  ok(noThrow(() => checkFlow(filterWith({ conds: [{}] }), CAT)), 'fix 2: checkFlow on a filter with when {conds:[{}]} does not throw');
  ok(noThrow(() => checkFlow(filterWith({ conds: [{ type: 'bot_ua' }, {}] }), CAT)) && noThrow(() => checkFlow(filterWith({ country: 'US' }), CAT)),
    'fix 2: checkFlow on a typeless second cond or a country string does not throw');
  // the builder's saved flow goes through toGraph({ graph }) on load (App.jsx loadInitialGraph)
  const savedNoEdges = toGraph({ graph: { entry: 'entry', nodes: { entry: { ...nEntry, x: 40, y: 40 } } } });
  const savedNoIds = toGraph({ graph: { entry: 'entry', nodes: { entry: { ...nEntry, x: 40, y: 40 }, o: { ...nOffer, x: 340, y: 40 } }, edges: [{ from: 'entry', to: 'o' }] } });
  ok(Array.isArray(savedNoEdges.edges) && savedNoEdges.edges.length === 0 && typeof savedNoIds.edges[0].id === 'string' && savedNoIds.nodes.o.x === 340,
    'fix 2: a saved flow is normalised on load (edges array, edge ids), positions kept');

  // 3. the challenge's "If they pass" branch shows the random A/B pick it goes through
  const vpn = simulateVisit(sample.graph, FCAT, { ...DEFAULT_VISITOR, vpn: true }, 'fixed');
  ok(vpn.outcome === 'challenge' && vpn.passText.includes('Quiz lander') && vpn.random === true,
    'fix 3: a VPN visitor whose pass path crosses the A/B split gets the random note', JSON.stringify({ random: vpn.random, passText: vpn.passText }));

  // 4. a when left with only `logical` (and/or empty conds) is no condition at all
  ok(has(checkFlow(filterWith({ logical: 'or' }), CAT), 'f', NO_COND, 'error'), "fix 4: a filter whose when is only { logical: 'or' } has no condition");
  ok(has(checkFlow(filterWith({ logical: 'and', conds: [] }), CAT), 'f', NO_COND, 'error'), 'fix 4: logical + empty conds is no condition either');
  ok(!has(checkFlow(filterWith({ logical: 'or', conds: [{ type: 'bot_ua' }] }), CAT), 'f', NO_COND, 'error'), 'fix 4: logical with a real cond is a condition');
  const lg = setEdgeWhen(R3, 'e_a', { logical: 'and' });
  ok(lg.edges.find((e) => e.id === 'e_a').when === null && !('priority' in lg.edges.find((e) => e.id === 'e_a')) && pr(lg, 'e_b') === 1,
    "fix 4: setEdgeWhen with only { logical: 'and' } clears the condition and the priority");
  // the same test the rule editor uses before it emits (RuleEditor.jsx can't be imported here)
  ok([null, undefined, {}, { logical: 'or' }, { logical: 'and', conds: [] }, { conds: [] }].every(isEmptyWhen)
    && ![{ logical: 'or', conds: [{ type: 'bot_ua' }] }, { country: ['US'] }, { rule: 'rl_reviewer' }].some(isEmptyWhen),
  'fix 4: isEmptyWhen: only logical and/or empty conds is empty; a cond, a list or a rule is not');

  // 5. old 'traffic' entries are entries everywhere
  const trafficNoOtherwise = { ...campaign.graph, edges: campaign.graph.edges.filter((e) => !(e.from === 'entry' && e.to === 'page_alt')) };
  ok(has(checkFlow(trafficNoOtherwise, CAT), 'entry', "No 'Otherwise': visitors who match no row are lost", 'warning'),
    "fix 5: a 'traffic' entry with conditional rows and no Otherwise is warned");
  const trafficDead = { entry: 'start', nodes: { start: { id: 'start', kind: 'traffic' }, l: { id: 'l', kind: 'lander', ref: 'ld_review' } },
    edges: [{ id: 't1', from: 'start', to: 'l', weight: 1, when: { country: ['US'] } }] };
  const td = simulateVisit(trafficDead, FCAT, { ...DEFAULT_VISITOR, country: 'BR' });
  ok(td.outcome === 'dead_end' && td.text === "Stops at 'Visitors arrive': nowhere to go (dead end)", "fix 5: a dead end at a 'traffic' entry names it 'Visitors arrive'", td.text);

  // 6. the random note only when the step actually taken was an unconditional share pick
  const RO = G([nEntry, { id: 'r', kind: 'route' }, { id: 'a', kind: 'lander', ref: 'ld_quiz_a' }, { id: 'b', kind: 'lander', ref: 'ld_quiz_b' },
    { id: 'c', kind: 'lander', ref: 'ld_review' }, { id: 'o', kind: 'offer', ref: 'of_main' }],
  [E('r0', 'entry', 'r'), E('r1', 'r', 'a', { when: { country: ['US'] }, priority: 1 }), E('r2', 'r', 'b'), E('r3', 'r', 'c'),
    E('r4', 'a', 'o'), E('r5', 'b', 'o'), E('r6', 'c', 'o')]);
  const ro = simulateVisit(RO, FCAT, DEFAULT_VISITOR, 'fixed');
  ok(ro.nodes.includes('a') && ro.random === false, 'fix 6: matching a numbered row next to two Otherwise rows is not a random pick', JSON.stringify({ nodes: ro.nodes, random: ro.random }));
  ok(simulateVisit(RO, FCAT, { ...DEFAULT_VISITOR, country: 'BR' }, 'fixed').random === true, 'fix 6: falling through to two Otherwise rows is a random pick');

  // 7. a line into a deleted box is reported on the box it leaves from
  ok(has(checkFlow(gGhostEdge, CAT), 'entry', GHOST, 'warning'), 'fix 7: a line to a deleted box is reported');
  const ghostSplit = G([nEntry, { id: 's', kind: 'split' }, nOffer], [E('e1', 'entry', 's'), E('e2', 's', 'o'), E('e3', 's', 'gone')]);
  const gs = checkFlow(ghostSplit, CAT);
  ok(has(gs, 's', GHOST, 'warning') && !has(gs, 'entry', GHOST, 'warning'), 'fix 7: only the box the line leaves from is flagged');
  ok(!has(checkFlow(gNoOtherwise, CAT), 'r', GHOST, 'warning') && checkFlow(sample.graph, FCAT).count === 0, 'fix 7: flows without such a line are not flagged');
}

// --- fallback lines ---
{
  // rows, footprint, layout (rows.js + helpers.js)
  const L = (id, from, to, x = {}) => E(id, from, to, { caught: true, ...x });
  const REVW = { conds: [{ type: 'moderator' }] };
  const nF = (x = {}) => ({ id: 'f', kind: 'filter', when: REVW, action: 'fallback', ...x });
  const nFb = { id: 'fb', kind: 'offer', ref: 'of_main', note: 'Fallback offer' }, nPg = { id: 'pg', kind: 'lander', ref: 'lp_a', note: 'Review page' };
  const R1 = G([nEntry, nF(), nOffer, nFb], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c', 'f', 'fb')]);
  const r1 = nodeRows(R1, 'f');
  ok(r1.length === 2 && r1[0].kind === 'caught' && r1[0].label === 'Is an ad reviewer' && r1[0].detail === '→ Fallback offer' && r1[0].edgeId === 'c' && !r1[0].sub && r1[1].label === 'Passes', 'rows: one unconditional fallback line is merged into the caught row, with the box named');
  const R2 = G([nEntry, nF(), nOffer, nFb, nPg], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c1', 'f', 'fb', { when: { country: ['GB'] }, priority: 1 }), L('c2', 'f', 'pg')]);
  const r2 = nodeRows(R2, 'f');
  ok(r2.map((r) => r.kind).join() === 'blocked,caught,caught,next' && r2[0].edgeId === undefined && r2[1].sub && r2[1].number === 1 && r2[1].label === 'Country is GB' && r2[1].detail === '→ Fallback offer' && r2[2].label === 'Otherwise' && r2[2].detail === '→ Review page', 'rows: several fallback lines get their own rows under the caught row');
  ok(nodeRows(G([nEntry, nF(), nOffer], [E('a', 'entry', 'f'), E('p', 'f', 'o')]), 'f')[0].detail === 'no fallback offer yet', 'rows: a fallback filter with no line says so');
  ok(nodeRows({ ...R1, nodes: { ...R1.nodes, f: nF({ action: '404' }) } }, 'f').map((r) => r.kind).join() === 'blocked,next', 'rows: fallback lines on a 404 filter are not rows');
  const TF = G([nEntry, nF(), nFb], [E('a', 'entry', 'f'), L('c', 'f', 'fb')]);
  ok(isTerminalFilter(TF, 'f') && nodeRows(TF, 'f').map((r) => r.kind).join() === 'caught,only', 'rows: a filter with only fallback lines is terminal');
  ok(nodeRows(R1, 'f', [], (n) => `#${n.id}`)[0].detail === '→ #fb' && isCaught(R1.edges[2]) && !isCaught(R1.edges[1]) && fallbackLines(R2, 'f').length === 2, 'rows: nameOf names the target; isCaught / fallbackLines');
  const ls = lineStyle({ style: 'caught' });
  ok(ls.color === BLOCKED_RED && ls.width === 2 && ls.dash === null, 'rows: fallback lines are solid red');
  const NR = G([nEntry, { id: 'r', kind: 'route' }, nOffer, nFb], [E('a', 'entry', 'r'), E('n', 'r', 'o'), L('cx', 'r', 'fb')]);
  ok(nodeRows(NR, 'r').length === 1 && !nodeRows(NR, 'r').some((r) => r.edgeId === 'cx'), 'rows: a caught line on a non-filter box is not a row');
  ok(endBoxHeight({ kind: 'filter', action: 'fallback' }) === 30, 'end box: a fallback filter without a box shows the one-line 404 box');
  const CHB = { type: 'click', timeout_ms: 8000, on_fail: '404' };
  const ET = (x, lines = []) => G([nEntry, nF(x), nOffer, nFb], [E('a', 'entry', 'f'), E('p', 'f', 'o'), ...lines]);
  ok(JSON.stringify(endBoxText(ET({ action: '404' }), 'f')) === JSON.stringify(['404 page · nothing recorded'])
    && JSON.stringify(endBoxText(ET({ action: 'challenge', challenge: CHB }), 'f')) === JSON.stringify(['Challenge · click within 8s', 'pass → continues · fail → 404'])
    && JSON.stringify(endBoxText(ET({}), 'f')) === JSON.stringify(['404 page · no fallback offer yet'])
    && endBoxText(ET({}, [L('c', 'f', 'fb')]), 'f') === null && endBoxText(ET({}), 'o') === null, 'endBoxText: 404, challenge, no line yet, none with lines, none for other boxes');
  ok(nodeFootprint(ET({}, [L('c', 'f', 'fb')]), 'f') === 40 + 2 * 34 + 20 + 20 && nodeFootprint(ET({}), 'f') === 40 + 2 * 34 + 20 + 20 + 24 + 30, 'footprint: fallback lines reserve no end box, none yet does (both have the "+ fallback" strip)');
  ok(snapUp(241) === 260 && snapUp(240) === 240 && snapUp(0) === 0, 'snapUp: next 20px grid line');
  // lane: entry → f (Passes → o); f's fallback line → fb; a second main box m under o's column
  const LN = G([nEntry, nF(), nOffer, nFb, { id: 'm', kind: 'lander', ref: 'lp_a' }], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c', 'f', 'fb'), E('q', 'entry', 'm'), E('r', 'm', 'o')]);
  const LL = structuredClone(LN.nodes); layoutGraph(LL, LN.edges, (id) => nodeFootprint(LN, id));
  const mainBottom = Math.max(...['entry', 'f', 'o', 'm'].map((id) => LL[id].y + nodeFootprint(LN, id)));
  ok(LL.fb.x === 40 + 2 * 300 && LL.fb.y === mainBottom + 80 && LL.o.y < LL.fb.y, 'layout: a fallback-only box goes to the lane under the main flow, one column after its filter', JSON.stringify({ fb: [LL.fb.x, LL.fb.y], mainBottom }));
  // a box a fallback line AND a later route's Otherwise reach stacks in the route's row order, not first
  const LR = G([nEntry, nF(), { id: 'r', kind: 'route' }, { id: 'a', kind: 'lander', ref: 'lp_a' }, { id: 'x', kind: 'lander', ref: 'lp_a' }, nOffer],
    [E('a1', 'entry', 'f'), E('a2', 'f', 'r'), L('c', 'f', 'x'), E('r1', 'r', 'a', { when: { country: ['US'] }, priority: 1 }), E('r2', 'r', 'x'), E('a3', 'a', 'o'), E('a4', 'x', 'o')]);
  const LRL = structuredClone(LR.nodes); layoutGraph(LRL, LR.edges, (id) => nodeFootprint(LR, id));
  ok(LRL.a.x === LRL.x.x && LRL.a.y < LRL.x.y, 'layout: a fallback line does not reorder the main flow (the route rows come first)', JSON.stringify([LRL.a, LRL.x]));
  const LB = { ...LN, edges: [...LN.edges, E('s', 'm', 'fb')] };
  const LBB = structuredClone(LB.nodes); layoutGraph(LBB, LB.edges, (id) => nodeFootprint(LB, id));
  ok(LBB.fb.y < mainBottom, 'layout: a box reached by a normal line too stays in the main flow');
  ok(retargetAllowed(G([nEntry, nF(), nOffer, nFb], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c', 'f', 'fb')]), 'c', 'o')
    && !retargetAllowed(G([nEntry, nF(), nOffer, nFb], [E('a', 'entry', 'f'), E('p', 'f', 'o'), E('p2', 'f', 'fb')]), 'p2', 'o'), 'retargetAllowed: a fallback line may join a Passes target; duplicates refused per side');
  const TG = toGraph({ graph: { entry: 'entry', nodes: { entry: { ...nEntry, x: 40, y: 40 }, f: { ...nF({ fallback_to: 'fb' }), x: 340, y: 40 }, fb: { ...nFb, x: 340, y: 300 } }, edges: [E('a', 'entry', 'f')] } });
  ok(!('fallback_to' in TG.nodes.f) && TG.edges.some((e) => e.caught && e.from === 'f' && e.to === 'fb'), 'toGraph: a v1 flow is upgraded to a fallback line');
  ok(dropCurve({ x: 0, y: 0 }, { x: 100, y: 100 }) === 'M 0 0 C 0 50, 50 100, 100 100' && dropCurve({ x: 0, y: 0 }, { x: 10, y: 10 }) === 'M 0 0 C 0 40, -30 10, 10 10',
    'dropCurve: the pixel-line curve (leaves downwards, arrives horizontally)');
  // edits (edit.js)
  const PS = G([nEntry, { ...nF(), x: 340, y: 40 }, nOffer, nFb, nPg], [E('a', 'entry', 'f'), E('p', 'f', 'o', { when: { country: ['US'] }, priority: 1 }), L('c1', 'f', 'fb', { when: { country: ['GB'] }, priority: 1 })]);
  const PS2 = { ...PS, edges: [...PS.edges, L('c2', 'f', 'pg')] };   // two fallback lines (the builder adds one per filter, but the engine and old flows may have several)
  const ps2 = setEdgeWhen(PS2, 'c2', { country: ['FR'] });
  const pr = (g, id) => g.edges.find((e) => e.id === id).priority;
  ok(pr(ps2, 'c2') === 2 && pr(ps2, 'p') === 1, 'edit: fallback lines are numbered among themselves');
  const ps3 = moveRow(ps2, 'c2', -1);
  ok(pr(ps3, 'c2') === 1 && pr(ps3, 'c1') === 2 && pr(ps3, 'p') === 1 && pr(deleteEdge(ps3, 'c2'), 'c1') === 1, 'edit: moving and deleting renumber one side only');
  const added = addFallbackLine(G([nEntry, nF({ action: 'challenge', challenge: CHB }), nOffer, nFb], [E('a', 'entry', 'f'), E('p', 'f', 'o')]), 'f', 'o', 'cx');
  ok(added.edges.find((e) => e.id === 'cx').caught === true && added.nodes.f.action === 'fallback' && !('challenge' in added.nodes.f), 'edit: addFallbackLine adds a caught line (even to the Passes box) and makes fallback the outcome');
  ok(['entry', 'f', 'gone'].every((to) => addFallbackLine(R1, 'f', to) === R1) && addFallbackLine(R1, 'f', 'fb') === R1, 'edit: no fallback line to the entry, itself, a missing box, or the box it already goes to');
  ok(addRowEdge(R1, 'f', 'fb').edges.length === R1.edges.length + 1, 'edit: "+ add" may add a Passes line to a box that has a fallback line');
  // one fallback offer per filter: a new line moves the old one
  const mv = addFallbackLine(R1, 'f', 'o', 'c9');
  ok(mv.edges.filter((e) => e.caught).length === 1 && mv.edges.find((e) => e.caught).id === 'c9' && mv.edges.find((e) => e.caught).to === 'o' && mv.nodes.fb, 'edit: a new fallback line replaces the old one; the old box stays');
  ok(addFallbackLine(R1, 'f', 'fb') === R1, 'edit: re-connecting to the same box changes nothing');
  const NO2m = addFallbackOffer(R1, 'f', 'n2');
  ok(NO2m.edges.filter((e) => e.caught).map((e) => e.to).join() === 'n2' && NO2m.nodes.fb && NO2m.nodes.n2.note === 'Fallback offer', 'edit: "+ New fallback offer" moves the line to the new box');
  // the red "+ fallback" strip
  ok(canAddFallbackFrom(nF()) && !canAddFallbackFrom(nF({ action: '404' })) && !canAddFallbackFrom(nOffer), 'helpers: only a filter set to fallback gets the "+ fallback" strip');
  ok(nodeFootprint(R1, 'f') === 40 + 2 * 34 + 20 + 20 && nodeFootprint(R1, 'f', [], true) === 40 + 2 * 34, 'helpers: the "+ fallback" strip adds one strip of height (not when read-only)');
  // toggling: lines go, boxes stay, room for the end box (snapped)
  const TO = G([nEntry, { ...nF(), x: 340, y: 40 }, { ...nOffer, x: 640, y: 40 }, { ...nFb, x: 340, y: 208 }, { id: 'u', kind: 'lander', ref: 'lp_a', x: 340, y: 322 }],
    [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c', 'f', 'fb'), E('k', 'u', 'o')]);
  const TOsnap = JSON.stringify(TO);
  const t404 = setFilterAction(TO, 'f', '404');
  ok(!t404.edges.some((e) => e.caught) && t404.nodes.fb && t404.nodes.fb.y === snapUp(168 + 24 + 30 + 20) && t404.nodes.u.y - t404.nodes.fb.y === 322 - 208, 'edit: back to 404 removes fallback lines, keeps boxes, makes snapped room', JSON.stringify([t404.nodes.fb.y, t404.nodes.u.y]));
  ok(setFilterAction(TO, 'f', 'fallback').edges.some((e) => e.caught) && setFilterAction(TO, 'f', 'challenge').nodes.f.challenge.type === 'click', 'edit: fallback keeps the lines; challenge gets its default');
  // "+ New fallback offer": one column right, first free grid slot from the filter's top
  const NO1 = addFallbackOffer(TO, 'f', 'n1');
  ok(NO1.nodes.n1.x === 640 && NO1.nodes.n1.y === snapUp(40 + 74 + 40) && NO1.nodes.n1.note === 'Fallback offer' && NO1.nodes.n1.ref === '' && NO1.edges.some((e) => e.caught && e.to === 'n1'), 'edit: a new fallback offer goes one column right, below what is there, on the grid, with a fallback line', JSON.stringify(NO1.nodes.n1));
  // the fallback box sits elsewhere and another box sits right under the filter: deleting the box brings the end box back over it
  const FAR2 = { ...TO, nodes: { ...TO.nodes, fb: { ...TO.nodes.fb, x: 940, y: 40 }, u: { ...TO.nodes.u, y: 208 } } };
  const gone = removeNode(FAR2, 'fb');
  ok(!gone.edges.some((e) => e.caught) && gone.nodes.f.action === 'fallback' && gone.nodes.u.y === snapUp(168 + 20 + 24 + 30 + 20), 'edit: deleting the only fallback box leaves "no line yet" and makes room for its end box', JSON.stringify(gone.nodes.u));
  // removing the last fallback line (the panel's x) brings the 404 end box back: make room for it
  const rmv = deleteEdge(FAR2, 'c');
  ok(!rmv.edges.some((e) => e.caught) && rmv.nodes.f.action === 'fallback' && rmv.nodes.u.y === snapUp(168 + 20 + 24 + 30 + 20), 'edit: deleteEdge of the last fallback line makes room for the 404 box that comes back', JSON.stringify(rmv.nodes.u));
  // finding 1: a Passes-line or entry-line delete moves nothing
  ok(deleteEdge(FAR2, 'p').nodes.u.y === 208 && deleteEdge(FAR2, 'a').nodes.u.y === 208, 'edit: deleting a Passes or entry line moves nothing');
  // review round 1
  const PXG = { ...R1, nodes: { ...R1.nodes, px: { id: 'px', kind: 'pixel' } } };
  ok(addFallbackLine(PXG, 'f', 'px') === PXG, 'edit: no fallback line to a pixel (it would be invisible and unnumbered)');
  const CHM = { type: 'motion', timeout_ms: 5000, on_fail: '404' };
  const TOch = { ...TO, nodes: { ...TO.nodes, f: { ...TO.nodes.f, action: 'challenge', challenge: CHM } } };
  ok(!('challenge' in setFilterAction(TOch, 'f', 'fallback').nodes.f) && setFilterAction(TOch, 'f', 'challenge').nodes.f.challenge.type === 'motion', 'edit: fallback drops the challenge config; choosing challenge again keeps an existing one');
  ok(setFilterAction(TO, 'f', 'challenge').nodes.fb.y === snapUp(168 + 24 + 44 + 20), 'edit: the challenge end box (44px) makes its own, taller room');
  const ROOMY = { ...FAR2, nodes: { ...FAR2.nodes, u: { ...FAR2.nodes.u, y: 300 } } };
  ok(setFilterAction(ROOMY, 'f', '404').nodes.u.y === 300, 'edit: a box already below the end box stays put');
  const NO2 = addFallbackOffer(NO1, 'f', 'n2');
  ok(NO2.nodes.n2.y === snapUp(NO1.nodes.n1.y + 74 + 40) && NO2.nodes.n2.y % 20 === 0 && NO2.nodes.n2.x === NO1.nodes.n1.x, 'edit: "+ New fallback offer" twice puts the second box below the first, on the grid', JSON.stringify([NO1.nodes.n1.y, NO2.nodes.n2.y]));
  const TWO = { ...FAR2, nodes: { ...FAR2.nodes, pg: { ...nPg, x: 940, y: 400 } }, edges: [...FAR2.edges, L('c2', 'f', 'pg')] };
  const keepOne = removeNode(TWO, 'fb');
  ok(keepOne.edges.some((e) => e.id === 'c2') && endBoxText(keepOne, 'f') === null && keepOne.nodes.u.y === 208, 'edit: deleting one of two fallback boxes shows no end box and moves nothing');
  ok(deleteEdge(TWO, 'c2').nodes.u.y === 208 && deleteEdge(FAR2, 'nope') === FAR2, 'edit: removing one of two lines moves nothing; a missing line changes nothing');
  ok(pr(deleteEdge(ps2, 'p'), 'c1') === 1 && pr(deleteEdge(ps2, 'p'), 'c2') === 2 && pr(setEdgeWhen(ps2, 'p', { country: ['FR'] }), 'c1') === 1 && pr(setEdgeWhen(ps2, 'p', { country: ['FR'] }), 'c2') === 2, 'edit: editing a Passes line leaves the fallback priorities alone');
  ok(JSON.stringify(TO) === TOsnap, 'edit: fallback edits never mutate the input');

  // problems + test a visitor (checks.js, simulate.js)
  const T = {
    noLine: 'No fallback offer yet: caught visitors get a 404 for now',
    noElse: "No 'Otherwise' among the fallback offers: caught visitors who match none get a 404",
    unused: "This filter's fallback offer isn't used: 'What happens to them?' isn't set to 'Send to a fallback offer'",
    notF: 'Only a filter can have a fallback offer',
    loop: "This filter's fallback leads back to it (a loop)",
    over: 'Overlaps another box: press Arrange or move it',
  };
  const ck = (g) => checkFlow(g, CAT);
  ok(has(ck(G([nEntry, nF(), nOffer], [E('a', 'entry', 'f'), E('p', 'f', 'o')])), 'f', T.noLine, 'error') && !has(ck(R1), 'f', T.noLine, 'error'), 'checks: a fallback filter needs a line');
  ok(has(ck(G([nEntry, nF(), nOffer, nFb], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c', 'f', 'fb', { when: { country: ['GB'] }, priority: 1 })])), 'f', T.noElse, 'warning') && !has(ck(R2), 'f', T.noElse, 'warning'), 'checks: conditional fallback lines want an Otherwise');
  ok(has(ck({ ...R1, nodes: { ...R1.nodes, f: nF({ action: '404' }) } }), 'f', T.unused, 'warning'), 'checks: fallback lines on a 404 filter are flagged as unused');
  ok(has(ck(G([nEntry, { id: 'r', kind: 'route' }, nOffer], [E('a', 'entry', 'r'), E('b', 'r', 'o'), L('c', 'r', 'o')])), 'r', T.notF, 'warning'), 'checks: only filters have fallback lines');
  ok(has(ck(G([nEntry, nF(), nOffer, nPg], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c', 'f', 'pg'), E('b', 'pg', 'f')])), 'f', T.loop, 'warning'), 'checks: a fallback line that leads back is a loop');
  const OV = G([{ ...nEntry, x: 40, y: 40 }, { ...nOffer, x: 60, y: 60 }, { id: 'o2', kind: 'offer', ref: 'of_main', x: 600, y: 600 }], [E('a', 'entry', 'o'), E('b', 'entry', 'o2')]);
  ok(has(ck(OV), 'entry', T.over, 'warning') && has(ck(OV), 'o', T.over, 'warning') && !has(ck(OV), 'o2', T.over, 'warning'), 'checks: overlapping boxes are flagged on both, others not');
  ok(!has(ck(R1), 'fb', 'Nothing leads here, so it never runs', 'warning'), 'checks: a box reached by a fallback line is reached');
  // simulate
  const J = (x) => JSON.stringify(x);
  const rv = { ...DEFAULT_VISITOR, reviewer: true };
  const R2n = { ...R2, nodes: { ...R2.nodes, f: nF({ note: 'Block Reviewers' }), o2: { id: 'o2', kind: 'offer', ref: 'of_main', note: 'Backup offer' } }, edges: [...R2.edges, E('q', 'pg', 'o2')] };
  const sUS = simulateVisit(R2n, CAT, rv, 'fixed');
  ok(sUS.outcome === 'fallback' && sUS.text === "Caught at 'Block Reviewers' → Review page → Backup offer" && J(sUS.edges) === J(['a', 'c2', 'q']) && !('links' in sUS), 'simulate: a caught visitor follows the fallback line; edges are the lines taken', J([sUS.text, sUS.edges]));
  ok(J(sUS.lines) === J(["Caught at 'Block Reviewers': Is an ad reviewer", '→ Review page → Backup offer', 'If not caught here: → Main offer']), 'simulate: fallback lines read catch, path, and what happens otherwise', J(sUS.lines));
  ok(simulateVisit(R2n, CAT, { ...rv, country: 'GB' }, 'fixed').text === "Caught at 'Block Reviewers' → Fallback offer", 'simulate: GB takes fallback line 1');
  const R2d = { ...R2n, edges: R2n.edges.filter((e) => e.id !== 'q') };
  ok(J(simulateVisit(R2d, CAT, rv, 'fixed').lines.slice(0, 2)) === J(["Caught at 'Block Reviewers': Is an ad reviewer", "Stops at 'Review page': nowhere to go (dead end)"]), 'simulate: a fallback into a dead end says so after the catch');
  const R2b = { ...R2n, nodes: { ...R2n.nodes, b2: { id: 'b2', kind: 'filter', note: 'Block Bots', when: { conds: [{ type: 'bot_ua' }] } } }, edges: [...R2n.edges.filter((e) => e.id !== 'q'), E('q1', 'pg', 'b2'), E('q2', 'b2', 'o2')] };
  ok(J(simulateVisit(R2b, CAT, { ...rv, bot: true }, 'fixed').lines.slice(0, 3)) === J(["Caught at 'Block Reviewers': Is an ad reviewer", "Blocked at 'Block Bots': Is a bot", '→ 404 page']), 'simulate: a second catch after a fallback gets its own lines');
  const SAME2 = G([nEntry, nF({ note: 'Block Reviewers' }), nFb], [E('e1', 'entry', 'f'), E('e2', 'f', 'fb'), L('c', 'f', 'fb')]);
  ok(J(simulateVisit(SAME2, CAT, rv, 'fixed').edges) === J(['e1', 'c']), 'simulate: the fallback line is lit, never the Passes line to the same box');
  ok(simulateVisit(R2n, CAT, DEFAULT_VISITOR, 'fixed').outcome === 'offer', 'simulate: a visitor who is not caught is unaffected');
  const noWhy = simulateVisit(G([nEntry, { id: 'f', kind: 'filter', note: 'Empty', action: '404' }, nOffer], [E('e1', 'entry', 'f'), E('e2', 'f', 'o')]), CAT, rv, 'fixed');
  ok(noWhy.lines?.[0] === "Blocked at 'Empty'", 'simulate: a filter without a condition leaves out the why', J(noWhy.lines));

  // --- leftovers: engine and format consistency ---
  ok(isCaught({ caught: 1 }) && isCaught({ caught: 'yes' }) && !isCaught({ caught: 0 }) && !isCaught({}) && !isCaught(null) && !isCaught(undefined), 'isCaught: any truthy caught counts, like the engine');
  const R1one = { ...R1, edges: R1.edges.map((e) => (e.id === 'c' ? { ...e, caught: 1 } : e)) };
  ok(fallbackLines(R1one, 'f').length === 1 && nodeRows(R1one, 'f')[0].detail === '→ Fallback offer', 'rows: a hand-edited "caught": 1 reads as a fallback line');
  const R1off = { ...R1, nodes: { ...R1.nodes, f: nF({ action: '404' }) } };
  const reOn = addFallbackLine(R1off, 'f', 'fb');
  ok(reOn.nodes.f.action === 'fallback' && reOn.edges.filter((e) => e.caught).length === 1 && JSON.stringify(reOn.edges) === JSON.stringify(R1off.edges), 'edit: re-connecting the same box on a 404 filter makes fallback its outcome, lines unchanged');

  // --- leftovers: test a visitor on a loop (the fallback page leads back to the filter) ---
  const LPg = G([nEntry, nF({ note: 'Block Reviewers' }), nOffer, nPg], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c', 'f', 'pg'), E('b', 'pg', 'f')]);
  const lp = simulateVisit(LPg, CAT, rv, 'fixed');
  ok(J(lp.lines) === J(["Caught at 'Block Reviewers': Is an ad reviewer", "Goes round in a loop at 'Block Reviewers'", 'If not caught here: → Main offer']), 'simulate: a loop lists its catch once and says it is a loop', J(lp.lines));
  ok(lp.outcome === 'dead_end' && lp.text === "Goes round in a loop at 'Block Reviewers'" && !('firstCatch' in lp), 'simulate: the loop is the result text; nothing internal leaks out', J([lp.outcome, lp.text]));

  // --- leftovers: layout gaps (the lane under the main flow) ---
  // entry → f1, f2 (both Passes → o); f1 caught → fa, f2 caught → fb (column 2, both in the lane);
  // fa → pg → o2: a lane chain (pg and o2 are reached only through f1's fallback line)
  const nF2 = (id) => ({ ...nF(), id });
  const LG = (first) => G([nEntry, nF2('f1'), nF2('f2'), nOffer, { id: 'fa', kind: 'lander', ref: 'lp_a' }, { id: 'fb', kind: 'offer', ref: 'of_main' }, nPg, { id: 'o2', kind: 'offer', ref: 'of_main' }],
    [...(first === 'f1' ? [E('e1', 'entry', 'f1'), E('e2', 'entry', 'f2')] : [E('e2', 'entry', 'f2'), E('e1', 'entry', 'f1')]),
      E('p1', 'f1', 'o'), E('p2', 'f2', 'o'), L('c1', 'f1', 'fa'), L('c2', 'f2', 'fb'), E('q1', 'fa', 'pg'), E('q2', 'pg', 'o2')]);
  const lay = (g) => { const n = structuredClone(g.nodes); layoutGraph(n, g.edges, (id) => nodeFootprint(g, id)); return n; };
  const L1 = lay(LG('f1')), L2 = lay(LG('f2'));
  const laneTop = (g, n) => Math.max(...['entry', 'f1', 'f2', 'o'].map((id) => n[id].y + nodeFootprint(g, id))) + 80;
  ok(L1.fa.x === 640 && L1.fb.x === 640 && L1.fa.y === laneTop(LG('f1'), L1) && L1.fb.y === L1.fa.y + nodeFootprint(LG('f1'), 'fa') + 40, 'layout: two lane boxes in one column stack from the lane top', J([L1.fa, L1.fb]));
  ok(L2.fb.y === laneTop(LG('f2'), L2) && L2.fa.y > L2.fb.y, 'layout: inside the lane, boxes follow the reading order of their filters', J([L2.fa, L2.fb]));
  ok(L1.pg.x === L1.fa.x + 300 && L1.o2.x === L1.pg.x + 300 && L1.pg.y === laneTop(LG('f1'), L1) && L1.o2.y === L1.pg.y, 'layout: a lane chain continues column by column in the lane', J([L1.pg, L1.o2]));
  // the sample: the lane starts 80px under the lowest main box, end boxes included
  const sampleG = JSON.parse(readFileSync(new URL('../examples/checkpoint-flow.json', import.meta.url), 'utf8')).graph;
  const SA = lay(sampleG);
  const sampleMain = Object.keys(SA).filter((id) => id !== 'offer_fallback' && SA[id].kind !== 'pixel');
  ok(SA.offer_fallback.y === Math.max(...sampleMain.map((id) => SA[id].y + nodeFootprint(sampleG, id))) + 80, 'layout: the sample lane is the lowest main footprint + 80', J(SA.offer_fallback));

  // --- leftovers: rows gaps ---
  const nT = { id: 't', kind: 'filter', note: 'Block bots', when: BOT };
  const RT = nodeRows(G([nEntry, nF(), nOffer, nT], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c', 'f', 't')]), 'f');
  ok(RT[0].kind === 'blocked' && RT[1].kind === 'caught' && RT[1].label === 'Is a bot' && RT[1].detail === '→ Block bots', 'rows: a fallback line into a terminal filter takes its condition and names it', J(RT));
  const RS = nodeRows(G([nEntry, nF(), nOffer, nFb, nPg], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c1', 'f', 'fb'), L('c2', 'f', 'pg', { weight: 3 })]), 'f');
  ok(J(RS.map((r) => [r.kind, r.label, r.share, r.detail])) === J([['blocked', 'Is an ad reviewer', undefined, undefined], ['caught', '25%', 25, '→ Fallback offer'], ['caught', '75%', 75, '→ Review page'], ['next', 'Passes', undefined, undefined]]), 'rows: unconditional fallback lines split by share', J(RS));
  const nP = { id: 'pa', kind: 'path', when: { country: ['GB'] } };
  const RP = nodeRows(G([nEntry, nF(), nOffer, nP], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c', 'f', 'pa')]), 'f');
  ok(RP.length === 3 && RP[0].kind === 'blocked' && RP[1].label === 'Country is GB' && RP[1].detail === '→ Path', 'rows: one fallback line into a path takes the path\'s condition, so it is not merged into the caught row', J(RP));

  // --- leftovers: edits gaps ---
  ok(addFallbackOffer(R1, 'o', 'n9') === R1 && addFallbackOffer(R1, 'gone', 'n9') === R1, 'edit: "+ New fallback offer" is refused for a box that is not a filter');
  const MU = G([nEntry, { ...nF(), x: 340, y: 40 }, { ...nOffer, x: 640, y: 40 }, { ...nFb, x: 340, y: 300 }], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c', 'f', 'fb')]);
  const MUsnap = J(MU);
  [addFallbackLine(MU, 'f', 'o', 'x1'), addFallbackLine(MU, 'f', 'fb'), addFallbackOffer(MU, 'f', 'x2'), setFilterAction(MU, 'f', '404'), setFilterAction(MU, 'f', 'challenge'), deleteEdge(MU, 'c'), removeNode(MU, 'fb')];
  ok(J(MU) === MUsnap, 'edit: the fallback edits leave their input exactly as it was before the call');

  // --- leftovers: checks and test-a-visitor gaps ---
  const TWOC = G([nEntry, nF(), nOffer, nFb, nPg], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c1', 'f', 'fb', { when: { country: ['GB'] } }), L('c2', 'f', 'pg', { when: { country: ['FR'] } }), E('q', 'pg', 'o')]);
  ok(has(ck(TWOC), 'f', 'Several rows could match the same visitor: set priorities so the order is clear', 'warning'), 'checks: two unnumbered conditional fallback lines want priorities');
  ok(has(ck(G([nEntry, nPg, nOffer], [E('a', 'entry', 'pg'), L('c', 'pg', 'o')])), 'pg', 'Visitors stop here: connect what comes after this page', 'error'), 'checks: a caught line is not an exit for a page');
  const CHF = G([nEntry, nF({ note: 'Block Reviewers' }), nOffer, nPg, { id: 'ch', kind: 'filter', note: 'Check VPN', when: { conds: [{ type: 'datacenter' }] }, action: 'challenge', challenge: { type: 'click', timeout_ms: 8000, on_fail: '404' } }, { id: 'o2', kind: 'offer', ref: 'of_main', note: 'Backup offer' }],
    [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c', 'f', 'pg'), E('q1', 'pg', 'ch'), E('q2', 'ch', 'o2')]);
  const sCh = simulateVisit(CHF, CAT, { ...rv, vpn: true }, 'fixed');
  ok(sCh.outcome === 'challenge' && J(sCh.lines) === J(["Caught at 'Block Reviewers': Is an ad reviewer", "Challenge at 'Check VPN': Uses a VPN / datacenter", '→ click within 8s',
    "If they pass: Caught at 'Block Reviewers' → Review page → Backup offer", 'If not caught here: → Main offer']), 'simulate: a challenge after a catch reads catch, challenge, pass, and otherwise', J(sCh.lines));
  ok(J(simulateVisit(R2b, CAT, { ...rv, bot: true }, 'fixed').lines) === J(["Caught at 'Block Reviewers': Is an ad reviewer", "Blocked at 'Block Bots': Is a bot", '→ 404 page', 'If not caught here: → Main offer']), 'simulate: a block after a catch still says what happens without the catch');
  const SHR = G([nEntry, nF({ note: 'Block Reviewers' }), nOffer, nFb, nPg], [E('a', 'entry', 'f'), E('p', 'f', 'o'), L('c1', 'f', 'fb'), L('c2', 'f', 'pg'), E('q', 'pg', 'o')]);
  ok(simulateVisit(SHR, CAT, rv, 'fixed').random === true && simulateVisit(R1, CAT, rv, 'fixed').random === false, 'simulate: fallback shares are a random A/B pick, one fallback line is not');
}

done();
