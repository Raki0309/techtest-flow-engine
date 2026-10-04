https://kommodo.ai/recordings/qwWqTiN8E1p3sUhxTFYo?onlyRecording=1

> **Tech test flow:** see [FLOW.md](FLOW.md) for the checkpoint flow added in this repo.

# Flow graph engine

A small, dependency-free engine that decides where a visitor goes. A campaign is a directed graph
of nodes and weighted edges. The engine walks it for one visitor and returns the pages they see
and the offer they end on, or says the visitor was filtered.

This folder has two parts:
- **`src/` and `test/`** (this README): the pure routing engine. Plain Node, ES modules, no
  packages to install. Needs Node 18 or newer.
- **`flow-builder/`**: the actual drag-and-drop editor that builds the graphs this engine runs,
  extracted as its own page. See `flow-builder/README.md`. Needs `npm install` (React + Vite).

## To use it

Needs [Node.js](https://nodejs.org) 18 or newer. Check with `node -v`.

**The engine** (no install needed):
```
npm test
```
Runs the three test files in `test/` and prints a pass/fail count for each.

**The flow builder** (the visual editor):
```
cd flow-builder
npm install
npm run dev
```
Then open the local URL it prints (typically `http://localhost:5173`). It starts with a small
sample flow already loaded; the rest is in `flow-builder/README.md`.

## The model

A graph is `{ entry, nodes, edges }`. `entry` is the id of the starting node.

| Node kind | Meaning |
| --- | --- |
| `traffic` | the entry point, no behavior of its own |
| `path` | a waypoint with an optional `when`, used to gate the edge into it |
| `lander` | a page the visitor sees on the way, can chain into more landers |
| `offer` | the destination, ends the walk |
| `filter` | denies visitors who match its `when` |
| `pixel` | an attachment, never a waypoint, ignored when walking |
| `matrix` | a lookup table authored as one node, expanded into ordinary nodes before walking |

An edge is `{ from, to, weight, when }`.

### How the walk chooses

At each node the engine looks at the outgoing edges:

1. Edges with a `when` that matches the visitor win. A `when` on the edge's target `path` or
   terminal `filter` node counts as the edge's own condition.
2. If none match, the edges with no `when` are used instead.
3. A weighted random pick chooses among those. `rng` returns a number in [0, 1) so tests can pin it.
4. A matching terminal filter always wins the pick. It is never given a weighted share.
5. The walk stops at an `offer`, at a filter, or at a dead end (returns `null`).

A filter with no outgoing edge is terminal: reaching it means the visitor matched. A filter with an
outgoing edge is chained: everyone reaches it, a match blocks, and a non-match continues down that
edge. A filter can answer `404` or `challenge`, which carries a challenge config back for the caller.

`resolveGraph` takes an optional `onVisit(id, node)` callback, called once for every node actually
reached, entry through the final node. It changes nothing about the walk, it just lets a caller
(a debugger, a visualizer) see the path without re-implementing the walk itself.

### Conditions

A `when` is `{ logical: 'and' | 'or', conds: [...] }` and/or dimension lists such as
`{ country: ['US'] }`. Conds and dimension lists AND together. Null or empty matches everyone.

Condition types: `country`, `device`, `os`, `suspicious`, `bot_ua`, `datacenter`, `moderator`,
`param` (a query key), `token` (a query value by slot number) and `role` (a query value by meaning).
`not: true` inverts a condition.

The visitor context passed to the engine looks like:

```js
{ country: 'US', device: 'mobile', os: 'ios', suspicious: false,
  signals: { bot_ua: false, datacenter: false, moderator: false },
  query: { sub1: 'a', cmp: 'summer' },
  tokenOrder: ['sub1'],              // slot 1 reads query.sub1
  roleParams: { utm_campaign: 'cmp' } }
```

## Layout

| File | What it does |
| --- | --- |
| `src/engine.js` | `resolveGraph`, `matchWhen`, `evalCond`, `pickWeighted`, `rngFor` |
| `flow-builder/` | the drag-and-drop UI that authors a graph, as its own Vite app |
| `src/expand-matrix.js` | `expandMatrix`, rewrites matrix nodes into paths, rows and ruled edges |
| `src/validate.js` | save-time checks: `validateGraph` and the checks it runs |
| `src/compile.js` | `compileGraph`, resolves ids and named rules into the shape the engine walks |
| `test/` | `engine`, `validate` and `compile` tests, plain scripts using `test/helpers.mjs` |
| `examples/campaign-flow.json` | a small authored graph with the lookups it needs |

Two shapes are in play. The authored graph is what a person builds: nodes cite ids (`ref: 'of_a'`)
and rules by name (`when: { rule: 'rl_1' }`). The compiled graph is what the engine walks: ids are
resolved to concrete values and rules are inlined. `compileGraph` turns the first into the second.
`kv_key` on a compiled lander is an opaque key for wherever the page is stored.

```js
import { compileGraph, resolveGraph, validateGraph } from './src/index.js';

const error = validateGraph(authored);               // string or null
const compiled = compileGraph(authored, refs);
const result = resolveGraph(compiled, visitor, Math.random);
// { landers: [...], offer: {...} }  or  { filtered: true, node_id, action, challenge }  or  null
```

## What is not here

Serving pages, storage, the database, HTTP, and detecting bots or reading the visitor's location.
The engine is handed an already-built visitor context and does nothing else.
