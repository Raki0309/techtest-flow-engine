// Checks EVERY node and returns all problems per node, in plain words. Pure: the canvas only renders it.
// Edge problems are reported on the edge's SOURCE node.
import { badFilterChallenge, validateRuleConds, badMatrixNodes, graphHasOffer, upgradeFallbacks } from '../../src/index.js';
import { nodeRows, effectiveWhen, fallbackLines, isCaught } from './rows.js';
import { isEmptyWhen } from './describe.js';
import { isEntryNode, nodeFootprint, NODE_W } from './helpers.js';

const err = (text) => ({ level: 'error', text });
const warn = (text) => ({ level: 'warning', text });

export function worstLevel(problems) {
  if (!problems || !problems.length) return null;
  return problems.some((p) => p.level === 'error') ? 'error' : 'warning';
}

const EMPTY_REF = { lander: 'No page picked', offer: 'No offer picked', pixel: 'No pixel picked' };

export function checkFlow(rawGraph, catalog = {}) {
  const graph = upgradeFallbacks(rawGraph);   // an old-style fallback_to flow is read as fallback lines
  const nodes = (graph && graph.nodes) || {};
  const edges = (graph && graph.edges) || [];
  const rules = catalog.rules || [];
  const byNode = {};
  const global = [];
  const add = (id, p) => {
    const list = byNode[id] || (byNode[id] = []);
    if (!list.some((q) => q.level === p.level && q.text === p.text)) list.push(p);
  };

  // every box reachable from `start` through any line (loop-safe), `start` included
  const reach = (start) => {
    const seen = new Set([start]);
    for (const cur of seen) for (const l of edges) if (l.from === cur && nodes[l.to]) seen.add(l.to);
    return seen;
  };

  // does this edge lead somewhere real (an existing, non-pixel node)?
  const isExit = (e) => nodes[e.to] && nodes[e.to].kind !== 'pixel';
  const exitsOf = (id) => edges.filter((e) => e.from === id && isExit(e) && !isCaught(e));

  // whens: the node's own, plus every outgoing edge's (attributed to this node)
  const whensOf = (id) => [nodes[id]?.when, ...edges.filter((e) => e.from === id).map((e) => e.when)].filter((w) => w && typeof w === 'object');

  for (const [id, n] of Object.entries(nodes)) {
    if (!n) continue;
    const whens = whensOf(id);

    if (n.kind === 'filter') {
      if (isEmptyWhen(n.when)) add(id, err('No condition: this filter would block every visitor'));
      const bad = badFilterChallenge(n.action, n.challenge);
      if (bad) add(id, err(bad));
      const lines = fallbackLines(graph, id);
      if (n.action === 'fallback') {
        if (!lines.length) add(id, err('No fallback offer yet: caught visitors get a 404 for now'));
        else {
          const cond = lines.filter((e) => effectiveWhen(graph, e));
          if (cond.length && cond.length === lines.length) add(id, warn("No 'Otherwise' among the fallback offers: caught visitors who match none get a 404"));
          if (cond.filter((e) => !Number.isFinite(e.priority)).length >= 2) add(id, warn('Several rows could match the same visitor: set priorities so the order is clear'));
        }
        // a fallback line whose box leads back (through any lines) to this filter
        if (lines.some((e) => reach(e.to).has(id))) add(id, warn("This filter's fallback leads back to it (a loop)"));
      } else if (edges.some((e) => e.from === id && isCaught(e))) {
        add(id, warn("This filter's fallback offer isn't used: 'What happens to them?' isn't set to 'Send to a fallback offer'"));
      }
    } else if (edges.some((e) => e.from === id && isCaught(e))) {
      add(id, warn('Only a filter can have a fallback offer'));
    }

    for (const w of whens) {
      if (w.rule && !rules.some((r) => r.id === w.rule)) add(id, err(`Uses rule '${w.rule}', which doesn't exist, so it matches nobody`));
      if (!w.rule && Array.isArray(w.conds)) {
        const bad = validateRuleConds(w.conds);
        if (bad) add(id, err(bad));
      }
    }

    if (EMPTY_REF[n.kind] && !n.ref) add(id, err(EMPTY_REF[n.kind]));

    const landerLike = n.kind === 'lander' || (n.kind === 'matrix' && n.of === 'lander');
    if (landerLike && !exitsOf(id).length) add(id, err('Visitors stop here: connect what comes after this page'));
    if (id === graph.entry && !exitsOf(id).length) add(id, err('Nothing happens to visitors yet'));
    // rows hide such a line, but the engine still picks it and the visitor dead-ends there
    if (edges.some((e) => e.from === id && !nodes[e.to])) add(id, warn('A line goes to a box that no longer exists'));

    if (n.kind === 'matrix') {
      const only = { ...graph, nodes: Object.fromEntries(Object.entries(nodes).filter(([k, v]) => v && (v.kind !== 'matrix' || k === id))) };
      const bad = badMatrixNodes(only);
      if (bad) add(id, err(bad));
    }

    // forks: a share of 0 is counted as 1 by the engine
    const plain = exitsOf(id).filter((e) => !effectiveWhen(graph, e));
    if (plain.length >= 2 && plain.some((e) => e.weight !== undefined && e.weight !== null && e.weight !== '' && Number(e.weight) === 0)) {
      add(id, warn('A share of 0 counts as 1 in the engine, so it still gets traffic'));
    }

    // rows (the entry may be an old-style 'traffic' node)
    if (['route', 'path', 'lander'].includes(n.kind) || isEntryNode(graph, id)) {
      const rows = nodeRows(graph, id, rules);
      if (rows.some((r) => r.kind === 'condition' || r.kind === 'first') && !rows.some((r) => r.kind === 'otherwise')) {
        add(id, warn("No 'Otherwise': visitors who match no row are lost"));
      }
    }
    if (nodeRows(graph, id, rules).filter((r) => r.kind === 'condition' && r.number === undefined).length >= 2) {
      add(id, warn('Several rows could match the same visitor: set priorities so the order is clear'));
    }

    // country codes: first bad one per node
    const codes = [];
    for (const w of whens) {
      if (Array.isArray(w.country)) codes.push(...w.country);
      if (Array.isArray(w.conds)) w.conds.forEach((c) => { if (c && c.type === 'country' && Array.isArray(c.values)) codes.push(...c.values); });
    }
    const badCode = codes.find((v) => !/^[A-Za-z]{2}$/.test(String(v)));
    if (badCode !== undefined) add(id, warn(`'${badCode}' isn't a 2-letter country code (use e.g. FR)`));
  }

  // reachability from "Visitors arrive", through every line; pixels are never warned about
  const seen = graph && nodes[graph.entry] ? reach(graph.entry) : new Set();
  for (const [id, n] of Object.entries(nodes)) {
    if (n && n.kind !== 'pixel' && id !== graph.entry && !seen.has(id)) add(id, warn('Nothing leads here, so it never runs'));
  }

  // two positioned boxes (each with the end box hanging under it) that overlap are both flagged
  const rects = Object.entries(nodes)
    .filter(([, n]) => n && Number.isFinite(n.x) && Number.isFinite(n.y))
    .map(([id, n]) => ({ id, x: n.x, y: n.y, h: nodeFootprint(graph, id, rules) }));
  rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => {
    if (a.x < b.x + NODE_W && b.x < a.x + NODE_W && a.y < b.y + b.h && b.y < a.y + a.h) {
      add(a.id, warn('Overlaps another box: press Arrange or move it'));
      add(b.id, warn('Overlaps another box: press Arrange or move it'));
    }
  }));

  if (!graphHasOffer(graph)) global.push(err('The flow never reaches an offer'));

  const count = Object.values(byNode).reduce((s, l) => s + l.length, 0) + global.length;
  return { byNode, global, count };
}
