import { useState } from 'react';
import { DEVICES, OSES, isT1Cond, isParamCond } from './helpers.js';
import { SIGNALS, describeCond, describeWhen, isEmptyWhen } from './describe.js';

const DEVICE_LABEL = { mobile: 'Phone', desktop: 'Desktop', tablet: 'Tablet' };
const OS_LABEL = { ios: 'iOS', android: 'Android', windows: 'Windows', macos: 'macOS', linux: 'Linux', other: 'Other' };
// lower-case the first letter for use mid-sentence, but keep a leading code such as "OS" or "US"
const midSentence = (s) => (!s || /^[A-Z]{2}/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
const Cap = ({ children }) => <div className="dim" style={{ fontSize: 11, fontWeight: 700, margin: '6px 0 3px' }}>{children}</div>;

// Condition editor (a connection's, a filter's or a path's `when`): pick a saved rule, or set the
// conditions here: visitor signals, device, OS, {t1} / a URL parameter, countries.
export function RuleEditor({ when, onChange, rules = [] }) {
  const w = when || {};
  const isRule = !!w.rule;
  // what the countries box shows while typing (so "US," keeps its comma); null = derived from `when`
  const [countryText, setCountryText] = useState(null);
  // clearing every chip can leave just `logical` behind: that is no condition, so emit null
  const emit = (next) => onChange(isEmptyWhen(next) ? null : next);
  const toggle = (k, val) => { const cur = w[k] || []; const next = { ...w, [k]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] }; if (!next[k].length) delete next[k]; emit(next); };
  const conds = w.conds || [];
  const t1 = conds.find(isT1Cond), par = conds.find(isParamCond);
  // one chip per visitor signal: on = a plain (not negated) `{ type }` condition is present
  const sig = Object.fromEntries(SIGNALS.map((s) => [s.type, conds.find((c) => c.type === s.type && !c.not)]));
  // isParamCond matches the first param-type cond regardless of key, so a `when.conds` authored
  // outside this builder (hand-edited JSON) can hold conditions these controls can't show or touch.
  // They're never destroyed (the toggles only ever touch their own cond by reference), but silently
  // invisible is still wrong, so they're listed below in plain words.
  const extra = conds.filter((c) => c !== t1 && c !== par && !Object.values(sig).includes(c));
  const setConds = (list) => { const next = { ...w }; if (list.length) next.conds = list; else delete next.conds; emit(next); };
  const toggleCond = (cur, blank) => setConds(cur ? conds.filter((c) => c !== cur) : [...conds, blank]);
  const patchCond = (cur, patch) => setConds(conds.map((c) => (c === cur ? { ...c, ...patch } : c)));
  const setCountries = (text) => {
    setCountryText(text);
    const v = text.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    const next = { ...w }; if (v.length) next.country = v; else delete next.country; emit(next);
  };
  const pair = (keyEl, cur) => (
    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
      {keyEl}
      <input className="mono" style={{ flex: 1 }} placeholder="equals, e.g. test" value={cur.value || ''} onChange={(e) => patchCond(cur, { value: e.target.value })} />
    </div>
  );
  const rule = isRule ? rules.find((r) => r.id === w.rule) : null;
  return (
    <>
      {rules.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <select value={isRule ? w.rule : ''} onChange={(e) => onChange(e.target.value ? { rule: e.target.value } : null)}>
            <option value="">Your own conditions (below)</option>
            {isRule && !rule && <option value={w.rule}>Missing rule '{w.rule}'</option>}
            {rules.map((r) => <option key={r.id} value={r.id}>Saved rule: {r.name}</option>)}
          </select>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>
            {isRule
              ? (rule ? `This rule checks: ${midSentence(describeWhen({ conds: rule.conds, logical: rule.logical }, rules)) || 'nothing yet'}.` : "This rule doesn't exist, so it matches nobody.")
              : 'Choosing a rule replaces the conditions below.'}
          </div>
        </div>
      )}
      {!isRule && <>
        <Cap>Visitor</Cap>
        <div className="chips" style={{ marginBottom: 4 }}>
          {SIGNALS.map((s) => (
            <button key={s.type} type="button" className={`chip ${sig[s.type] ? 'on' : ''}`} aria-pressed={!!sig[s.type]}
              onClick={() => toggleCond(sig[s.type], { type: s.type })}>{s.chip}</button>
          ))}
        </div>
        <Cap>Device</Cap>
        <div className="chips" style={{ marginBottom: 4 }}>{DEVICES.map((d) => <button key={d} type="button" className={`chip ${(w.device || []).includes(d) ? 'on' : ''}`} aria-pressed={(w.device || []).includes(d)} onClick={() => toggle('device', d)}>{DEVICE_LABEL[d] || d}</button>)}</div>
        <Cap>Operating system</Cap>
        <div className="chips" style={{ marginBottom: 4 }}>{OSES.map((o) => <button key={o} type="button" className={`chip ${(w.os || []).includes(o) ? 'on' : ''}`} aria-pressed={(w.os || []).includes(o)} onClick={() => toggle('os', o)}>{OS_LABEL[o] || o}</button>)}</div>
        <Cap>Link</Cap>
        <div className="chips" style={{ marginBottom: 6 }}>
          <button type="button" className={`chip ${t1 ? 'on' : ''}`} aria-pressed={!!t1} title="The campaign's 1st traffic-source token ({t1}) equals a value"
            onClick={() => toggleCond(t1, { type: 'token', slot: 1, op: 'equals', value: '' })}>{'{t1}'}</button>
          <button type="button" className={`chip ${par ? 'on' : ''}`} aria-pressed={!!par} title="A URL parameter of your choosing equals a value"
            onClick={() => toggleCond(par, { type: 'param', key: '', op: 'equals', value: '' })}>Custom UTM</button>
        </div>
        {t1 && pair(<input className="mono" style={{ flex: 1 }} value="{t1}" readOnly title="1st token on the campaign's traffic source" />, t1)}
        {par && pair(<input className="mono" style={{ flex: 1 }} placeholder="parameter, e.g. offer" value={par.key || ''} onChange={(e) => patchCond(par, { key: e.target.value.trim() })} />, par)}
        {extra.length > 0 && <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>
          +{extra.length} more condition{extra.length > 1 ? 's' : ''} not shown here
          ({extra.map((c) => describeCond(c, rules)).join('; ')}). {extra.length > 1 ? 'They still apply' : 'It still applies'}, but
          can only be changed in the flow file.</div>}
        <Cap>Country</Cap>
        <input placeholder="e.g. US, CA (blank = any country)" className="mono"
          value={countryText ?? (w.country || []).join(', ')}
          onChange={(e) => setCountries(e.target.value)} onBlur={() => setCountryText(null)} />
      </>}
    </>
  );
}
