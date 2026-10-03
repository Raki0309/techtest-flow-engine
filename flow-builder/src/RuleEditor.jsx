import { DEVICES, OSES, isT1Cond, isParamCond, condText } from './helpers.js';

// edge/path condition editor: reference a named rule, or set inline filters
export function RuleEditor({ when, onChange, rules = [] }) {
  const w = when || {};
  const isRule = !!w.rule;
  const toggle = (k, val) => { const cur = w[k] || []; const next = { ...w, [k]: cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val] }; if (!next[k].length) delete next[k]; onChange(Object.keys(next).length ? next : null); };
  const conds = w.conds || [];
  const t1 = conds.find(isT1Cond), par = conds.find(isParamCond);
  // isParamCond matches the first param-type cond regardless of key, so a `when.conds` authored
  // outside this builder (hand-edited JSON) with more than one can leave extras this editor can't
  // show or touch. They're never destroyed — toggleCond/patchCond only ever touch t1/par by
  // reference — but silently invisible is still wrong, so surface them below instead.
  const extra = conds.filter((c) => c !== t1 && c !== par);
  const setConds = (list) => { const next = { ...w }; if (list.length) next.conds = list; else delete next.conds; onChange(Object.keys(next).length ? next : null); };
  const toggleCond = (cur, blank) => setConds(cur ? conds.filter((c) => c !== cur) : [...conds, blank]);
  const patchCond = (cur, patch) => setConds(conds.map((c) => (c === cur ? { ...c, ...patch } : c)));
  const pair = (keyEl, cur) => (
    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
      {keyEl}
      <input className="mono" style={{ flex: 1 }} placeholder="value e.g. test" value={cur.value || ''} onChange={(e) => patchCond(cur, { value: e.target.value })} />
    </div>
  );
  return (
    <>
      {rules.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <select value={isRule ? w.rule : ''} onChange={(e) => onChange(e.target.value ? { rule: e.target.value } : null)}>
            <option value="">&mdash; inline filter &mdash;</option>
            {rules.map((r) => <option key={r.id} value={r.id}>Rule: {r.name}</option>)}
          </select>
        </div>
      )}
      {!isRule && <>
        <div className="chips" style={{ marginBottom: 4 }}>{DEVICES.map((d) => <button key={d} type="button" className={`chip ${(w.device || []).includes(d) ? 'on' : ''}`} onClick={() => toggle('device', d)}>{d}</button>)}</div>
        <div className="chips" style={{ marginBottom: 6 }}>{OSES.map((o) => <button key={o} type="button" className={`chip ${(w.os || []).includes(o) ? 'on' : ''}`} onClick={() => toggle('os', o)}>{o}</button>)}</div>
        <div className="chips" style={{ marginBottom: 6 }}>
          <button type="button" className={`chip ${t1 ? 'on' : ''}`} title="the campaign's 1st traffic-source token ({t1}) equals a value"
            onClick={() => toggleCond(t1, { type: 'token', slot: 1, op: 'equals', value: '' })}>{'{t1}'}</button>
          <button type="button" className={`chip ${par ? 'on' : ''}`} title="a URL parameter of your choosing equals a value"
            onClick={() => toggleCond(par, { type: 'param', key: '', op: 'equals', value: '' })}>custom UTM</button>
        </div>
        {t1 && pair(<input className="mono" style={{ flex: 1 }} value="{t1}" readOnly title="1st token on the campaign's traffic source" />, t1)}
        {par && pair(<input className="mono" style={{ flex: 1 }} placeholder="param e.g. offer" value={par.key || ''} onChange={(e) => patchCond(par, { key: e.target.value.trim() })} />, par)}
        {extra.length > 0 && <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>
          +{extra.length} more condition{extra.length > 1 ? 's' : ''} on this rule not shown here
          ({extra.map(condText).join('; ')}) &mdash; still enforced, just edit it as JSON rather than
          these chips.</div>}
        <input placeholder="countries e.g. US,CA (blank = any)" className="mono" value={(w.country || []).join(',')}
          onChange={(e) => { const v = e.target.value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean); const next = { ...w }; if (v.length) next.country = v; else delete next.country; onChange(Object.keys(next).length ? next : null); }} />
      </>}
    </>
  );
}
