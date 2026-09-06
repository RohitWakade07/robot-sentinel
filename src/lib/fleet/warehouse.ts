/** Static warehouse layout + navigation graph shared by both modes. */

export const WORLD = { w: 42, h: 26 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

export const CORRIDOR_Y = [3, 13, 23];
export const AISLE_X = [4, 10, 16, 22, 28, 34, 40];

/** Shelf blocks sit between aisles and corridors. */
export const SHELVES: Rect[] = (() => {
  const out: Rect[] = [];
  for (let i = 0; i < AISLE_X.length - 1; i++) {
    for (let j = 0; j < CORRIDOR_Y.length - 1; j++) {
      const x = AISLE_X[i] + 1.6;
      const y = CORRIDOR_Y[j] + 1.6;
      const w = AISLE_X[i + 1] - AISLE_X[i] - 3.2;
      const h = CORRIDOR_Y[j + 1] - CORRIDOR_Y[j] - 3.2;
      out.push({ x, y, w, h, label: `${String.fromCharCode(65 + i)}${j + 1}` });
    }
  }
  return out;
})();

export const DOCK: Rect = { x: 0.6, y: 9.5, w: 2.6, h: 7, label: "CHARGE DOCK" };

export interface NavNode {
  id: string;
  x: number;
  y: number;
  neighbors: string[];
}

function key(x: number, y: number) {
  return `${x}_${y}`;
}

export const NAV: Record<string, NavNode> = (() => {
  const nodes: Record<string, NavNode> = {};
  for (const x of AISLE_X) {
    for (const y of CORRIDOR_Y) {
      nodes[key(x, y)] = { id: key(x, y), x, y, neighbors: [] };
    }
  }
  for (let i = 0; i < AISLE_X.length; i++) {
    for (let j = 0; j < CORRIDOR_Y.length; j++) {
      const id = key(AISLE_X[i], CORRIDOR_Y[j]);
      if (i > 0) nodes[id].neighbors.push(key(AISLE_X[i - 1], CORRIDOR_Y[j]));
      if (i < AISLE_X.length - 1) nodes[id].neighbors.push(key(AISLE_X[i + 1], CORRIDOR_Y[j]));
      if (j > 0) nodes[id].neighbors.push(key(AISLE_X[i], CORRIDOR_Y[j - 1]));
      if (j < CORRIDOR_Y.length - 1) nodes[id].neighbors.push(key(AISLE_X[i], CORRIDOR_Y[j + 1]));
    }
  }
  // dock node wired into the leftmost aisle
  nodes["dock"] = {
    id: "dock",
    x: DOCK.x + DOCK.w + 0.9,
    y: DOCK.y + DOCK.h / 2,
    neighbors: [key(AISLE_X[0], CORRIDOR_Y[1])],
  };
  nodes[key(AISLE_X[0], CORRIDOR_Y[1])].neighbors.push("dock");
  return nodes;
})();

/** The single-lane chokepoint operators can block. */
export const CHOKEPOINT_NODE = key(AISLE_X[3], CORRIDOR_Y[1]);
export const CHOKEPOINT = {
  x: NAV[CHOKEPOINT_NODE].x,
  y: NAV[CHOKEPOINT_NODE].y,
  r: 1.8,
};

export const PICK_STATIONS = SHELVES.map((s, i) => ({
  id: `P${i + 1}`,
  x: s.x + s.w / 2,
  y: s.y > 13 ? s.y - 1.6 : s.y + s.h + 1.6,
}));

function nearestNode(x: number, y: number, blocked: Set<string>) {
  let best = "";
  let bestD = Infinity;
  for (const n of Object.values(NAV)) {
    if (blocked.has(n.id)) continue;
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

/** BFS over the nav graph; returns world-space waypoints from `from` to `to`. */
export function planPath(
  from: [number, number],
  to: [number, number],
  blocked: Set<string> = new Set(),
): [number, number][] {
  const start = nearestNode(from[0], from[1], blocked);
  const goal = nearestNode(to[0], to[1], blocked);
  if (!start || !goal) return [to];

  const prev: Record<string, string | null> = { [start]: null };
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === goal) break;
    for (const nb of NAV[cur].neighbors) {
      if (nb in prev || blocked.has(nb)) continue;
      prev[nb] = cur;
      queue.push(nb);
    }
  }
  if (!(goal in prev)) return [to];

  const nodes: string[] = [];
  let cur: string | null = goal;
  while (cur) {
    nodes.unshift(cur);
    cur = prev[cur];
  }
  const pts = nodes.map((id) => [NAV[id].x, NAV[id].y] as [number, number]);
  pts.push(to);
  return pts;
}
