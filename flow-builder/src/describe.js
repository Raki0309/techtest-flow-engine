// Turns a routing condition (`when`) into plain English. Pure, no imports.

export const SIGNALS = [
  { type: 'bot_ua', chip: 'Bot' },
  { type: 'datacenter', chip: 'VPN / datacenter' },
  { type: 'moderator', chip: 'Ad reviewer' },
  { type: 'suspicious', chip: 'Suspicious' },
];

const DEVICE = { mobile: 'phone', desktop: 'desktop', tablet: 'tablet' };
const OS = { ios: 'iOS', android: 'Android', windows: 'Windows', macos: 'macOS', linux: 'Linux', other: 'other' };

// hand-edited flows can hold one value as a plain string ({ country: 'US' }); anything else that
// isn't a list says nothing
const list = (vals, map = {}) => {
  const v = (Array.isArray(vals) ? vals : typeof vals === 'string' && vals ? [vals] : []).map((x) => map[x] || x);
  return v.length < 2 ? v.join('') : `${v.slice(0, -1).join(', ')} or ${v[v.length - 1]}`;
};
const vals = (c) => (c.values ? list(c.values) : c.value);
const is = (label, text, not) => `${label} is ${not ? 'not ' : ''}${text}`;

const SIGNAL_TEXT = {
  bot_ua: ['Is a bot', 'Is not a bot'],
  datacenter: ['Uses a VPN / datacenter', "Doesn't use a VPN / datacenter"],
  moderator: ['Is an ad reviewer', 'Is not an ad reviewer'],
  suspicious: ['Looks suspicious', "Doesn't look suspicious"],
};

// A `when` that holds no condition: null, not an object, no keys, or only `logical` and/or an empty
// `conds` (the rule editor leaves `{ logical: 'or' }` behind when every chip is cleared). The engine
// matches everyone on it, so it is treated as no condition (shared by RuleEditor, checks.js, edit.js).
export const isEmptyWhen = (w) => !w || typeof w !== 'object'
  || Object.entries(w).every(([k, v]) => k === 'logical' || (k === 'conds' && Array.isArray(v) && !v.length));

export function describeCond(c, rules = []) {
  if (!c || typeof c !== 'object' || !c.type) return '';   // malformed: says nothing, never throws
  const t = c.type;
  if (SIGNAL_TEXT[t]) return SIGNAL_TEXT[t][c.not ? 1 : 0];
  if (t === 'country') return is('Country', list(c.values), c.not);
  if (t === 'device') return is('Device', list(c.values, DEVICE), c.not);
  if (t === 'os') return is('OS', list(c.values, OS), c.not);
  const neg = c.not ? 'not ' : '';
  if (t === 'param' || t === 'token') {
    const name = t === 'param' ? c.key : `token {t${c.slot}}`;
    if (c.op === 'exists') return `Link ${c.not ? "doesn't have" : 'has'} ${name}`;
    if (c.op === 'contains') return `Link ${name} ${c.not ? "doesn't contain" : 'contains'} ${vals(c)}`;
    if (t === 'token') return `Link ${name} ${c.not ? '!=' : '='} ${vals(c)}`;
    return `Link ${c.not ? "doesn't have" : 'has'} ${name} = ${vals(c)}`;
  }
  if (t === 'role') return `Link ${c.role} ${c.not ? '!=' : '='} ${vals(c)}`;
  return neg ? `Not ${t}` : t;
}

export function describeWhen(when, rules = []) {
  if (!when) return '';
  if (when.rule) {
    const r = rules.find((x) => x.id === when.rule);
    return r ? r.name : `Missing rule '${when.rule}'`;
  }
  const parts = [];
  if (list(when.country)) parts.push(`Country is ${list(when.country)}`);
  if (list(when.device)) parts.push(`Device is ${list(when.device, DEVICE)}`);
  if (list(when.os)) parts.push(`OS is ${list(when.os, OS)}`);
  const lower = (p) => (!p || /^[A-Z]{2}/.test(p) ? p : p[0].toLowerCase() + p.slice(1));
  // empty parts (a null or typeless cond) are skipped, so the text never has a dangling "and"
  const conds = (Array.isArray(when.conds) ? when.conds : []).map((c) => describeCond(c, rules)).filter(Boolean);
  const sep = when.logical === 'or' ? ' or ' : ' and ';
  const head = parts.map((p, i) => (i ? lower(p) : p)).join(' and ');
  const tail = conds.map((p, i) => (i || head ? lower(p) : p)).join(sep);
  return [head, tail].filter(Boolean).join(' and ');
}
