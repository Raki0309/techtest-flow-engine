# Flow builder

The actual campaign flow editor, extracted from the production dashboard as its own page. This
is not a reimplementation; `GraphCanvas.jsx`, `GraphInspector.jsx`, `RuleEditor.jsx`,
`MatrixInspector.jsx` and `helpers.js` are the real components (ported, not rewritten), with the
backend-specific parts cut:

- **Cut:** the campaign-settings modal around it (name, domain, traffic source, lead endpoint,
  advertiser, workflow status), everything that called a live API (loading landers/offers/pixels
  from a server, saving, a filter's live "turned away N visitors" stat), and the dashboard's
  design-system skins.
- **Kept:** the canvas (drag nodes, draw arrows, weighted splits, copy/paste, keyboard shortcuts,
  auto-arrange), the node inspector for every kind (path, filter with challenge config, lander
  with AI-suggest keyword matching, offer, pixel, matrix lookup table), and the rule editor.

```
npm install
npm run dev
```

Opens with a small sample flow (bots filtered, US mobile sees one lander, everyone else another,
both reach an offer). **New blank flow** clears it. **Validate** runs the real engine's
`validateGraph` (from `../src`) against the graph you've built, the same pre-save check the
production dashboard runs before it will let you save. **View JSON** shows exactly what the
canvas is building: an authored graph, `{ entry, nodes, edges }`, the same shape `compileGraph`
in `../src` takes.

The graph state autosaves to `localStorage`, so a reload doesn't lose work. There is no backend:
`LANDERS`/`OFFERS`/`PIXELS`/`RULES` in `catalog.js` are a small static stand-in for what a real
deployment loads from an API.

## Why this, and not the engine's own demo

The graph shape this builder writes is exactly what `../src/validate.js` and `../src/compile.js`
expect: an offer/lander node's target is `ref`, a matrix's rows cite `ref`, a filter's condition
is `when`. Nothing here needs to know about that contract on purpose, it just happens to produce
graphs the pure engine can already validate and run.
