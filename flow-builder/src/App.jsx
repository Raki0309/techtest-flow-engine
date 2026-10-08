import { useEffect, useMemo, useState } from 'react';
import { GraphCanvas } from './GraphCanvas.jsx';
import { GraphInspector } from './GraphInspector.jsx';
import { ProblemsButton } from './ProblemsButton.jsx';
import { TestVisitorPanel } from './TestVisitorPanel.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { toGraph } from './helpers.js';
import { checkFlow } from './checks.js';
import { LANDERS, OFFERS, PIXELS, RULES, SAMPLE_ROUTING } from './catalog.js';
import { validateGraph } from '../../src/index.js';

const STORAGE_KEY = 'flow-builder.graph';
const CATALOG = { landers: LANDERS, offers: OFFERS, pixels: PIXELS, rules: RULES };

function loadInitialGraph() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    // a hand-edited or old save may lack the edges array or edge ids: toGraph fills them in
    if (saved && typeof saved === 'object') return toGraph({ graph: saved });
  } catch { /* corrupt, unavailable or unreadable: fall through to the sample */ }
  return toGraph(SAMPLE_ROUTING);
}

// What the flow does, without where its boxes sit: clicking, dragging or arranging boxes keeps a
// test result; any real edit clears it.
const flowKey = (g) => JSON.stringify({ ...g,
  nodes: Object.fromEntries(Object.entries(g.nodes || {}).map(([id, n]) => [id, n && { ...n, x: undefined, y: undefined }])) });

export default function App() {
  const [graph, setGraph] = useState(loadInitialGraph);
  const [sel, setSel] = useState(null);
  const [showJson, setShowJson] = useState(false);
  const [validation, setValidation] = useState(null);
  const [testing, setTesting] = useState(false);   // the "Test a visitor" panel is open
  const [visit, setVisit] = useState(null);        // its last result (simulateVisit)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(graph)); } catch { /* best effort */ }
  }, [graph]);

  // runs while drawing, outside the error boundary: a flow it can't read shows no badges, never a blank page
  const problems = useMemo(() => {
    try { return checkFlow(graph, CATALOG); } catch { return { byNode: {}, global: [], count: 0 }; }
  }, [graph]);
  const key = useMemo(() => flowKey(graph), [graph]);
  useEffect(() => { setVisit(null); }, [key]);   // the flow changed: the lit path is out of date
  const highlight = useMemo(() => visit && { nodes: new Set(visit.nodes), edges: new Set(visit.edges), endFor: visit.endFor }, [visit]);

  const newBlankFlow = () => { setGraph(toGraph(null)); setSel(null); setValidation(null); };
  const loadSample = () => { setGraph(toGraph(SAMPLE_ROUTING)); setSel(null); setValidation(null); };
  const runValidate = () => setValidation(validateGraph(graph) || 'Valid — reaches an offer, no filter or matrix is misconfigured.');
  const closeTest = () => { setTesting(false); setVisit(null); };
  const showBox = (id) => {
    setSel({ type: 'node', id });
    document.querySelector(`[data-node-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  };

  return (
    <div className="shell">
      <header className="topbar">
        <b>Flow builder</b>
        <span className="dim">drag boxes, connect rows, test a visitor</span>
        <div className="spacer" />
        <button className="btn ghost tiny" onClick={newBlankFlow}>New blank flow</button>
        <button className="btn ghost tiny" onClick={loadSample}>Load sample flow</button>
        <button className={`btn ghost tiny${testing ? ' on' : ''}`} aria-pressed={testing}
          onClick={() => (testing ? closeTest() : setTesting(true))}>Test a visitor</button>
        <ProblemsButton graph={graph} problems={problems} catalog={CATALOG} onPick={showBox} />
        <button className="btn ghost tiny" onClick={runValidate}>Validate</button>
        <button className="btn ghost tiny" onClick={() => setShowJson(true)}>View JSON</button>
      </header>
      {validation && <div className={`validation ${validation.startsWith('Valid') ? 'ok' : 'bad'}`}>{validation}</div>}

      <div className="floweditor-body">
        <ErrorBoundary resetKey={graph} onLoadSample={loadSample} onNewBlank={newBlankFlow}>
          <GraphCanvas graph={graph} setGraph={setGraph} sel={sel} setSel={setSel}
            landers={LANDERS} offers={OFFERS} pixels={PIXELS} rules={RULES}
            problems={problems.byNode} highlight={highlight} />
          <div className="finspect">
            {testing && <TestVisitorPanel graph={graph} catalog={CATALOG} result={visit} onResult={setVisit} onClose={closeTest} />}
            <GraphInspector graph={graph} setGraph={setGraph} sel={sel} setSel={setSel}
              landers={LANDERS} offers={OFFERS} pixels={PIXELS} context={{ rules: RULES }} />
          </div>
        </ErrorBoundary>
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
