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

export const SHELVES: Rect[] = [];

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
