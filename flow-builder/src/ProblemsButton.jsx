import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { problemLines } from './names.js';

// "Problems (n)" in the top bar: red with any error, amber with only warnings, "No problems" when
// the flow is clean. It opens a list, one line per problem (errors first); clicking a line shows
// that box (onPick). The list hangs under the top bar's right edge (see .plist in styles.css).
export function ProblemsButton({ graph, problems, catalog, onPick }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const listId = useId();
  const lines = useMemo(() => problemLines(graph, problems, catalog), [graph, problems, catalog]);
  const level = lines.some((l) => l.level === 'error') ? 'error' : lines.length ? 'warning' : null;

  useEffect(() => { if (!lines.length) setOpen(false); }, [lines.length]);
  // close on a click elsewhere or Escape
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const pick = (id) => { setOpen(false); onPick(id); };
  const dot = (l) => <>
    <span className={`plist-dot ${l.level}`} aria-hidden="true" />
    <span className="sr-only">{l.level === 'error' ? 'Error: ' : 'Warning: '}</span>
  </>;

  return (
    <span ref={wrap}>
      <button type="button" className={`btn tiny plist-btn ${level || 'ghost'}`} disabled={!lines.length}
        aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen((o) => !o)}>
        {lines.length ? `Problems (${lines.length})` : 'No problems'}
      </button>
      {open && (
        <div className="plist" id={listId}>
          <div className="plist-h">Click a problem to show its box.</div>
          <ul>
            {lines.map((l, i) => (
              <li key={`${l.id}:${i}`}>
                {l.id ? (
                  <button type="button" className="plist-item" onClick={() => pick(l.id)}>
                    {dot(l)}<span><b>{l.name}</b>: {l.text}</span>
                  </button>
                ) : (
                  <div className="plist-item static">{dot(l)}<span>{l.text}</span></div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
