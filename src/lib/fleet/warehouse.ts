/** Static warehouse layout + navigation graph shared by both modes. */

export const WORLD = { w: 24.384, h: 24.384 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

export const CORRIDOR_Y: number[] = [];
export const AISLE_X: number[] = [];

export const SHELVES: Rect[] = [
  { x: 1.62, y: 5.14, w: 2.57, h: 6.29, label: "P1" },
  { x: 20.19, y: 5.14, w: 2.57, h: 6.29, label: "P2" },
  { x: 1.62, y: 13.14, w: 2.57, h: 6.29, label: "P3" },
  { x: 20.19, y: 13.14, w: 2.57, h: 6.29, label: "P4" },
  { x: 9.72, y: 10.19, w: 4.95, h: 4.00, label: "D1" },
  { x: 6.19, y: 18.57, w: 4.00, h: 2.96, label: "D2" },
  { x: 14.19, y: 18.57, w: 4.00, h: 2.96, label: "D3" },
  { x: 12.19 - 1.5, y: 2.19 - 1.5, w: 3.00, h: 3.00, label: "CHG 0" },
  { x: 15.69 - 1.5, y: 2.19 - 1.5, w: 3.00, h: 3.00, label: "CHG 2" },
  { x: 8.69 - 1.5, y: 2.19 - 1.5, w: 3.00, h: 3.00, label: "CHG 4" },
];

export const DOCK: Rect = { x: -100, y: -100, w: 0, h: 0, label: "CHARGE DOCK" };

export interface NavNode {
  id: string;
  x: number;
  y: number;
  neighbors: string[];
}

export const NAV: Record<string, NavNode> = {};

export const CHOKEPOINT_NODE = "";
export const CHOKEPOINT = {
  x: -100,
  y: -100,
  r: 0,
};

export const PICK_STATIONS: {id: string, x: number, y: number}[] = [];

export function planPath(
  from: [number, number],
  to: [number, number],
  blocked = new Set<string>(),
): [number, number][] {
  // Perception mode: just go in a straight line
  return [from, to];
}
