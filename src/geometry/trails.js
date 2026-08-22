/**
 * TRAILS THROUGH AN EDGE GRAPH
 *
 * A figure made of edges is normally handed to the renderer as a list of
 * two-point segments, and that is fine for drawing it — but it is wrong for
 * anything that *travels* it. A pulse on a two-point path has one segment to
 * live on: it appears, crosses, and dies, with no vertex to carry it onward.
 * A whole figure done that way flashes at random rather than being traced,
 * because every segment is given its own phase and they are all independent.
 *
 * What is wanted instead is a walk: enter a vertex along one edge and leave
 * along another, so the light turns the corner and goes round the square rather
 * than blinking across it.
 *
 * That is Hierholzer's algorithm. It walks unused edges, parks a vertex when it
 * runs out, and splices the resulting loops together — every edge used exactly
 * once, in one continuous trail per component. Where a vertex has an odd number
 * of edges a single closed circuit cannot exist, so the walk has to start and
 * finish at odd vertices; starting from those first keeps the number of trails
 * to the minimum the graph allows, which is (odd vertices ÷ 2) per component.
 */
export function edgeTrails(edges, vertexCount) {
  const adj = Array.from({ length: vertexCount }, () => []);
  const push = (a, b, id) => { adj[a].push([b, id]); adj[b].push([a, id]); };
  for (let e = 0; e < edges.length; e++) {
    const [a, b] = edges[e];
    if (a === b) continue;             // a self-loop has nowhere to go
    push(a, b, e);
  }

  // PAIRING THE ODD VERTICES
  //
  // Hierholzer's needs every vertex to have an even number of edges; run on a
  // graph with more than two odd ones it produces a sequence whose consecutive
  // entries are not actually joined — measured, a cube came back claiming 12
  // steps that covered only 10 of its edges and repeated two. So the odd
  // vertices are paired off with virtual edges first, which makes every degree
  // even and the circuit genuine, and the circuit is then cut back apart
  // wherever it crosses one. What is left is the fewest real trails the graph
  // allows: one per pair of odd vertices.
  let virtualId = edges.length;
  const odd = [];
  for (let v = 0; v < vertexCount; v++) if (adj[v].length % 2 === 1) odd.push(v);
  for (let i = 0; i + 1 < odd.length; i += 2) push(odd[i], odd[i + 1], virtualId++);

  const used = new Uint8Array(virtualId);
  // Where each vertex has got to in its own adjacency list. Kept across walks
  // rather than reset, which is what keeps the whole decomposition linear in
  // the number of edges instead of quadratic.
  const ptr = new Uint32Array(vertexCount);
  const trails = [];

  const walk = (start) => {
    const stackV = [start];
    const stackE = [-1];
    const outV = [];
    const outE = [];
    while (stackV.length) {
      const v = stackV[stackV.length - 1];
      let moved = false;
      while (ptr[v] < adj[v].length) {
        const [u, e] = adj[v][ptr[v]++];
        if (used[e]) continue;
        used[e] = 1;
        stackV.push(u);
        stackE.push(e);
        moved = true;
        break;
      }
      if (!moved) { outV.push(stackV.pop()); outE.push(stackE.pop()); }
    }
    outV.reverse();
    outE.reverse();
    // outE[i] is the edge walked to arrive at outV[i]; outE[0] is the start.
    return { v: outV, e: outE };
  };

  const hasEdgeLeft = (v) => {
    for (let i = 0; i < adj[v].length; i++) if (!used[adj[v][i][1]]) return true;
    return false;
  };

  const emit = (run) => { if (run.length > 1) trails.push(run); };

  for (let v = 0; v < vertexCount; v++) {
    if (!hasEdgeLeft(v)) continue;
    const { v: vs, e: es } = walk(v);
    const runs = [];
    let run = [vs[0]];
    for (let i = 1; i < vs.length; i++) {
      if (es[i] >= edges.length) {     // stepped over a virtual edge: cut here
        runs.push(run);
        run = [vs[i]];
      } else {
        run.push(vs[i]);
      }
    }
    runs.push(run);

    // The walk is a *circuit*, so its two ends are the same vertex and the last
    // run continues straight into the first. Cutting it as though it were a
    // line leaves those as two separate pieces — a tetrahedron came back as
    // three trails of 4, 1 and 1 edges where two of 3 exist. Rejoining them
    // gives the minimum the graph allows.
    if (runs.length > 1 && vs[0] === vs[vs.length - 1]) {
      const last = runs.pop();
      runs[0] = last.concat(runs[0].slice(1));
    }
    for (const r of runs) emit(r);
  }
  return trails;
}

/** True when a trail returns to where it started, so a pulse can loop forever. */
export function isClosed(trail) {
  return trail.length > 2 && trail[0] === trail[trail.length - 1];
}

/**
 * Loose segments back into a graph.
 *
 * `EdgesGeometry` and the like hand back independent pairs of points, with every
 * shared corner repeated once per edge that meets there. Nothing can be walked
 * in that form, because nothing records that two segments touch — so the corners
 * are welded on a rounded key. They are exactly coincident by construction;
 * the tolerance is only for floating point.
 *
 * The points come back by reference, not copied, so a caller that moves them
 * keeps its trails valid.
 */
export function weld(pairs, precision = 5) {
  // Points arrive either as Vector3s or as plain [x, y, z] triples depending on
  // which part of the geometry produced them, and both are welded the same way.
  const key = (v) => {
    const x = v.x ?? v[0];
    const y = v.y ?? v[1];
    const z = v.z ?? v[2];
    return `${x.toFixed(precision)},${y.toFixed(precision)},${z.toFixed(precision)}`;
  };
  const index = new Map();
  const points = [];
  const edges = [];
  for (const [a, b] of pairs) {
    const ids = [a, b].map((v) => {
      const k = key(v);
      if (!index.has(k)) { index.set(k, points.length); points.push(v); }
      return index.get(k);
    });
    if (ids[0] !== ids[1]) edges.push(ids);
  }
  return { points, edges };
}
