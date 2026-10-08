import { useEffect, useId, useRef, useState } from 'react';
import { simulateVisit, DEFAULT_VISITOR } from './simulate.js';

// "Test a visitor": describe one visitor, Run sends them through the flow with the real engine
// (simulate.js), and the canvas lights up where they went. The result lives in App (result /
// onResult), which clears it whenever the flow changes, so a lit path is never out of date.

const DEVICES = [['mobile', 'Phone'], ['desktop', 'Desktop'], ['tablet', 'Tablet']];
const OSES = [['ios', 'iOS'], ['android', 'Android'], ['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux'], ['other', 'Other']];
const TICKS = [['bot', 'Bot'], ['vpn', 'VPN / datacenter'], ['reviewer', 'Ad reviewer'], ['suspicious', 'Suspicious']];

export function TestVisitorPanel({ graph, catalog, result, onResult, onClose }) {
  const [v, setV] = useState(DEFAULT_VISITOR);
  const runs = useRef(0);   // each Run gets a new seed, so an A/B split can pick the other side
  const box = useRef(null);
  const id = useId();
  const set = (key, value) => setV((old) => ({ ...old, [key]: value }));
  const run = () => { runs.current += 1; onResult(simulateVisit(graph, catalog, v, `run-${runs.current}`)); };

  useEffect(() => { box.current?.scrollIntoView?.({ block: 'nearest' }); }, []);   // in view when opened

  return (
    <section className="tvp" ref={box} aria-labelledby={`${id}-h`}>
      <div className="tvp-head">
        <b id={`${id}-h`}>Test a visitor</b>
        <button type="button" className="btn tiny ghost" title="Close" aria-label="Close test a visitor" onClick={onClose}>{'✕'}</button>
      </div>
      <p className="tvp-intro dim">Describe a visitor, then press Run to see where the flow sends them.</p>
      <form onSubmit={(e) => { e.preventDefault(); run(); }}>
        <div className="tvp-row">
          <div>
            <label htmlFor={`${id}-country`}>Country</label>
            <input id={`${id}-country`} value={v.country} maxLength={2} placeholder="US" autoComplete="off" spellCheck={false}
              onChange={(e) => set('country', e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${id}-device`}>Device</label>
            <select id={`${id}-device`} value={v.device} onChange={(e) => set('device', e.target.value)}>
              {DEVICES.map(([val, text]) => <option key={val} value={val}>{text}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-os`}>Operating system</label>
            <select id={`${id}-os`} value={v.os} onChange={(e) => set('os', e.target.value)}>
              {OSES.map(([val, text]) => <option key={val} value={val}>{text}</option>)}
            </select>
          </div>
        </div>
        <div className="tvp-ticks">
          {TICKS.map(([key, text]) => (
            <label key={key} className="tvp-tick">
              <input type="checkbox" checked={!!v[key]} onChange={(e) => set(key, e.target.checked)} />{text}
            </label>
          ))}
        </div>
        <label htmlFor={`${id}-params`}>Link parameters</label>
        <textarea id={`${id}-params`} rows={3} value={v.params} placeholder="offer=test" spellCheck={false}
          aria-describedby={`${id}-params-hint`} onChange={(e) => set('params', e.target.value)} />
        <div id={`${id}-params-hint`} className="tvp-hint dim">One name=value per line</div>
        <div className="tvp-actions">
          <button type="submit" className="btn tiny">Run</button>
          <button type="button" className="btn tiny ghost" onClick={() => onResult(null)}>Clear</button>
        </div>
      </form>
      <div aria-live="polite">
        {result && (
          <div className={`tvp-result ${result.outcome === 'offer' ? 'good' : 'bad'}`}>
            <div className="tvp-text">{result.text}</div>
            {result.passText && <div className="tvp-pass">{result.passText}</div>}
            {result.random && <div className="tvp-note dim">(random A/B pick: run again to see the other side)</div>}
          </div>
        )}
      </div>
    </section>
  );
}
