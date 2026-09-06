import type { RobotStatus } from "./types";

export const STATUS_TOKEN: Record<RobotStatus, string> = {
  moving: "--moving",
  idle: "--idle",
  yielding: "--yield",
  charging: "--charge",
  blocked: "--danger",
  offline: "--danger",
};

export function statusColor(status: RobotStatus, el?: HTMLElement | null) {
  const root = el ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!root) return "#7dd3fc";
  return getComputedStyle(root).getPropertyValue(STATUS_TOKEN[status]).trim() || "#7dd3fc";
}

export const STATUS_CLASS: Record<RobotStatus, string> = {
  moving: "bg-moving/15 text-moving border-moving/40",
  idle: "bg-idle/15 text-idle border-idle/40",
  yielding: "bg-yield/15 text-yield border-yield/40",
  charging: "bg-charge/15 text-charge border-charge/40",
  blocked: "bg-danger/15 text-danger border-danger/40",
  offline: "bg-danger/15 text-danger border-danger/40",
};

export const STALE_MS = 2000;
