// A matrix node is a lookup table authored as one node:
//   {kind:'matrix', of:'lander'|'offer', key:{type:'token',slot}|{type:'param',key},
//    rows:[{value, ref}], fallback?: ref}
// expandMatrix rewrites it into ordinary nodes the engine already understands. The matrix becomes a
// pass-through path, each row a lander/offer node behind a ruled edge, the fallback the one
// unconditional edge (no fallback means non-matching traffic dead-ends). A lander matrix's outgoing
// edges are copied onto every row so the funnel continues; its rows carry bind:<matrix id>.
// Pure. Row ids are deterministic: <matrix>_r<i> and <matrix>_d.

export const matrixKeyCond = (key) => key?.type === 'param'
  ? { type: 'param', key: key.key } : { type: 'token', slot: key?.slot };

export function expandMatrix(g) {
  if (!g || !g.nodes) return g;
  const src = g.nodes;
  const nodes = { ...src };
  let edges = [...(g.edges || [])];
  for (const [nid, n] of Object.entries(src)) {
    if (!n || n.kind !== 'matrix') continue;
    const id = n.id || nid;
    const isOut = (e) => e.from === id && src[e.to]?.kind !== 'pixel';
    const outs = edges.filter(isOut);
    edges = edges.filter((e) => !isOut(e));
    const rowIds = [];
    (n.rows || []).forEach((r, i) => {
      const rid = `${id}_r${i}`;
      nodes[rid] = { id: rid, kind: n.of, ref: r.ref, bind: id };
      edges.push({ from: id, to: rid, weight: 1,
        when: { conds: [{ ...matrixKeyCond(n.key), op: 'equals', value: String(r.value) }] } });
      rowIds.push(rid);
    });
    if (n.fallback) {
      const did = `${id}_d`;
      nodes[did] = { id: did, kind: n.of, ref: n.fallback, bind: id };
      edges.push({ from: id, to: did, weight: 1, when: null });
      rowIds.push(did);
    }
    // copied lines keep their priority, so a numbered order still decides after expansion
    for (const rid of rowIds) for (const e of outs) edges.push({ from: rid, to: e.to, weight: e.weight, when: e.when,
      ...(Number.isFinite(e.priority) ? { priority: e.priority } : {}) });
    nodes[id] = { id, kind: 'path', when: null };
  }
  return { ...g, nodes, edges };
}
