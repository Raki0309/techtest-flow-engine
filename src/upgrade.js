// Converts the first version of filter fallbacks (a filter's fallback_to naming an offer node)
// into fallback lines (an edge marked caught: true from the filter to that box). Pure: returns a
// new graph, or the same object when there is nothing to convert.

export function upgradeFallbacks(graph) {
  if (!graph || !graph.nodes) return graph;
  const add = [];
  const nodes = {};
  let changed = false;
  for (const [nid, n] of Object.entries(graph.nodes)) {
    if (n && n.kind === 'filter' && n.action === 'fallback' && typeof n.fallback_to === 'string') {
      const id = n.id || nid;
      const { fallback_to, ...rest } = n;
      nodes[nid] = rest;
      changed = true;
      const have = (graph.edges || []).some((e) => e.caught && e.from === id && e.to === fallback_to);
      if (!have) add.push({ id: `fb_${id}`, from: id, to: fallback_to, weight: 1, when: null, caught: true });
    } else nodes[nid] = n;
  }
  if (!changed) return graph;
  return { ...graph, nodes, edges: [...(graph.edges || []), ...add] };
}
