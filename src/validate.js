// Save-time validators for a flow graph. Each returns an error string or null.
// They refuse graphs that save fine and then quietly route nobody.

import { matrixKeyCond } from './expand-matrix.js';
import { CHALLENGE_TYPES } from './engine.js';

export { CHALLENGE_TYPES };

export const RULE_COND_TYPES = new Set(['country', 'device', 'os', 'suspicious', 'bot_ua', 'datacenter', 'moderator', 'param', 'token', 'role']);

// roles name a captured value by meaning; 'source' and 'medium' are older spellings
export const ROLE_KEYS = ['utm_content', 'utm_placement', 'utm_campaign', 'utm_source', 'utm_medium',
  'ad', 'adset', 'campaign', 'placement', 'publisher', 'external_id', 'cost',
  'email', 'phone', 'email_hash', 'phone_hash', 'lead_hash'];
const ROLE_ALIASES = { source: 'utm_source', medium: 'utm_medium' };

export function canonicalRole(role) {
  const r = String(role || '').trim();
  if (!r) return '';
  if (ROLE_KEYS.includes(r)) return r;
  return ROLE_ALIASES[r] || '';
}

export function validateRuleConds(conds) {
  if (!Array.isArray(conds)) return 'conds must be an array';
  if (conds.length > 20) return 'max 20 conditions per rule';
  for (const c of conds) {
    if (!c || typeof c !== 'object') return 'each condition must be an object';
    if (!RULE_COND_TYPES.has(c.type)) return `unknown condition type "${c.type}"`;
    if (['country', 'device', 'os'].includes(c.type)) {
      if (!Array.isArray(c.values) || !c.values.length) return `${c.type} condition needs a non-empty values array`;
      if (c.values.length > 100) return `${c.type} condition: max 100 values`;
    }
    if (c.type === 'param' || c.type === 'token' || c.type === 'role') {
      if (c.type === 'param' && (!c.key || !/^[a-zA-Z0-9_.-]{1,64}$/.test(String(c.key)))) {
        return 'param condition needs a valid key';
      }
      if (c.type === 'token') {
        const slot = Number(c.slot);
        if (!Number.isInteger(slot) || slot < 1 || slot > 20) return 'token condition needs slot 1-20';
      }
      if (c.type === 'role' && !canonicalRole(c.role)) {
        return `role condition needs one of: ${ROLE_KEYS.join(', ')}`;
      }
      const op = c.op || 'equals';
      if (!['equals', 'contains', 'exists'].includes(op)) return `${c.type} op must be equals|contains|exists`;
      if (op !== 'exists' && !c.list_id && !c.value && !(Array.isArray(c.values) && c.values.length)) {
        return `${c.type} condition needs value, values[] or list_id`;
      }
      if (Array.isArray(c.values) && c.values.length > 500) return `${c.type} condition: max 500 values`;
    }
  }
  return null;
}

// A filter's action is "404" (default) or "challenge". The challenge config is only checked
// when the action is "challenge"; one left on a 404 node is inert.
export function badFilterChallenge(action, challenge) {
  if (action != null && action !== '404' && action !== 'challenge') {
    return `filter action must be "404" or "challenge" (got "${action}")`;
  }
  if (action !== 'challenge') return null;
  if (!challenge || typeof challenge !== 'object') return 'filter action "challenge" needs a challenge config';
  if (!CHALLENGE_TYPES.includes(challenge.type)) {
    return `challenge.type must be one of: ${CHALLENGE_TYPES.join(', ')} (got "${challenge.type}")`;
  }
  const t = Number(challenge.timeout_ms);
  if (!Number.isFinite(t) || t < 500 || t > 120000) {
    return 'challenge.timeout_ms must be a number of milliseconds between 500 and 120000';
  }
  if (challenge.on_fail != null && challenge.on_fail !== '404' && challenge.on_fail !== 'cosmetic') {
    return `challenge.on_fail must be "404" or "cosmetic" (got "${challenge.on_fail}")`;
  }
  return null;
}

// the graph needs an offer (a matrix of offers counts) and at least one edge
export function graphHasOffer(g) {
  if (!g || !g.nodes) return false;
  const hasOffer = Object.values(g.nodes).some((n) => (n.kind === 'offer' && n.ref)
    || (n.kind === 'matrix' && n.of === 'offer' && (n.rows || []).length));
  return hasOffer && (g.edges || []).length > 0;
}

export function badFilterNodes(g) {
  if (!g || !g.nodes) return null;
  const entries = Object.entries(g.nodes).filter(([, n]) => n && n.kind === 'filter');
  if (!entries.length) return null;
  for (const [nid, n] of entries) {
    const id = n.id || nid;
    // an unconditional filter would 404 every visitor
    const when = n.when;
    const empty = !when || (typeof when === 'object' && !Object.keys(when).length);
    if (empty) return `filter node "${id}" has no condition: it would 404 all traffic`;
    const badChallenge = badFilterChallenge(n.action, n.challenge);
    if (badChallenge) return `filter node "${id}": ${badChallenge}`;
    if (!(g.edges || []).some((e) => e.to === id)) {
      return `filter node "${id}" is not connected: nothing routes into it, so it filters nothing`;
    }
  }
  return null;
}

// an inline `when` may carry rule-format conds next to its dimension lists
export function badInlineWhens(g) {
  const whens = [
    ...Object.entries(g.nodes || {}).map(([id, n]) => [`node "${n?.id || id}"`, n?.when]),
    ...(g.edges || []).map((e, i) => [`edge "${e?.id || i}"`, e?.when])
  ];
  for (const [where, when] of whens) {
    if (!when || typeof when !== 'object' || when.conds === undefined) continue;
    // a rule reference replaces the whole `when` at compile time, so inline conds beside it would be lost
    if (when.rule) return `${where}: a condition cites a rule or carries inline conds, not both`;
    // an empty list is no condition, but its presence would make a filter look conditional
    if (Array.isArray(when.conds) && !when.conds.length) return `${where}: conds is empty, drop it or add a condition`;
    const bad = validateRuleConds(when.conds);
    if (bad) return `${where}: ${bad}`;
  }
  return null;
}

const MATRIX_OF = new Set(['lander', 'offer']);
export function badMatrixNodes(g) {
  if (!g || !g.nodes) return null;
  for (const [nid, n] of Object.entries(g.nodes)) {
    if (!n || n.kind !== 'matrix') continue;
    const id = n.id || nid, where = `matrix "${id}"`;
    if (!MATRIX_OF.has(n.of)) return `${where}: "of" must be lander or offer`;
    const badKey = validateRuleConds([{ ...matrixKeyCond(n.key), op: 'exists' }]);
    if (badKey) return `${where}: key, ${badKey}`;
    if (!Array.isArray(n.rows) || !n.rows.length) return `${where}: needs at least one row`;
    if (n.rows.length > 200) return `${where}: max 200 rows`;
    const seen = new Set();
    for (const r of n.rows) {
      const v = String(r?.value ?? '').trim();
      if (!v) return `${where}: every row needs a value`;
      if (seen.has(v)) return `${where}: value "${v}" appears twice`;
      seen.add(v);
      if (!r.ref) return `${where}: row "${v}" has no ${n.of}`;
    }
    const outs = (g.edges || []).filter((e) => e.from === id && g.nodes[e.to]?.kind !== 'pixel');
    if (n.of === 'offer' && outs.length) return `${where}: an offer matrix is terminal, nothing can follow it`;
    if (n.of === 'lander' && !outs.length) return `${where}: a lander matrix needs an arrow to what comes next`;
    if (!(g.edges || []).some((e) => e.to === id)) return `${where} is not connected: nothing routes into it`;
  }
  return null;
}

// Everything checked on save, in order. Returns an error string or null.
export function validateGraph(g) {
  const badFilter = badFilterNodes(g);
  if (badFilter) return badFilter;
  const badWhen = badInlineWhens(g);
  if (badWhen) return badWhen;
  const badMatrix = badMatrixNodes(g);
  if (badMatrix) return badMatrix;
  return graphHasOffer(g) ? null : 'flow needs an offer node connected from traffic';
}
