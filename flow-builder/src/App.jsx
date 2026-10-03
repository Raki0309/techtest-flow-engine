import { useEffect, useState } from 'react';
import { GraphCanvas } from './GraphCanvas.jsx';
import { GraphInspector } from './GraphInspector.jsx';
import { toGraph, setRulesCache } from './helpers.js';
import { LANDERS, OFFERS, PIXELS, RULES, SAMPLE_ROUTING } from './catalog.js';
import { validateGraph } from '../../src/index.js';

const STORAGE_KEY = 'flow-builder.graph';

function loadInitialGraph() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* corrupt or unavailable, fall through to the sample */ }
  return toGraph(SAMPLE_ROUTING);
}

export default function App() {
  const [graph, setGraph] = useState(loadInitialGraph);
  const [sel, setSel] = useState(null);
  const [showJson, setShowJson] = useState(false);
  const [validation, setValidation] = useState(null);

  useEffect(() => { setRulesCache(RULES); }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(graph)); } catch { /* best effort */ }
  }, [graph]);

  const newBlankFlow = () => { setGraph(toGraph(null)); setSel(null); setValidation(null); };
  const loadSample = () => { setGraph(toGraph(SAMPLE_ROUTING)); setSel(null); setValidation(null); };
  const runValidate = () => setValidation(validateGraph(graph) || 'Valid — reaches an offer, no filter or matrix is misconfigured.');

  return (
    <div className="shell">
      <header className="topbar">
        <b>Flow builder</b>
        <span className="dim">drag nodes, draw arrows, edit rules</span>
        <div className="spacer" />
        <button className="btn ghost tiny" onClick={newBlankFlow}>New blank flow</button>
        <button className="btn ghost tiny" onClick={loadSample}>Load sample flow</button>
        <button className="btn ghost tiny" onClick={runValidate}>Validate</button>
        <button className="btn ghost tiny" onClick={() => setShowJson(true)}>View JSON</button>
      </header>
      {validation && <div className={`validation ${validation.startsWith('Valid') ? 'ok' : 'bad'}`}>{validation}</div>}

      <div className="floweditor-body">
        <GraphCanvas graph={graph} setGraph={setGraph} sel={sel} setSel={setSel}
          landers={LANDERS} offers={OFFERS} pixels={PIXELS} />
        <div className="finspect">
          <GraphInspector graph={graph} setGraph={setGraph} sel={sel} setSel={setSel}
            landers={LANDERS} offers={OFFERS} pixels={PIXELS} context={{ rules: RULES }} />
        </div>
      </div>

      {showJson && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowJson(false)}>
          <div className="modal wide">
            <h2>Flow JSON</h2>
            <p className="dim" style={{ marginTop: 0 }}>This is what the canvas is actually building. Paste it into the engine's
              <code> compileGraph(graph, refs)</code> to run it for real.</p>
            <pre className="jsonview">{JSON.stringify(graph, null, 2)}</pre>
            <div className="foot"><button className="btn" onClick={() => setShowJson(false)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
