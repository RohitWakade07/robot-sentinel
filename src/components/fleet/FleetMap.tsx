import { useEffect, useRef } from "react";
import type { Overlays, RobotState } from "@/lib/fleet/types";
import { statusColor, STALE_MS } from "@/lib/fleet/ui";
import {
  CHOKEPOINT,
  DOCK,
  NAV,
  PICK_STATIONS,
  SHELVES,
  WORLD,
} from "@/lib/fleet/warehouse";

interface Props {
  robots: RobotState[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  overlays: Overlays;
  chokepointBlocked: boolean;
  stale: boolean;
  emptyMessage?: string | undefined;
}

function css(name: string) {
  if (typeof document === "undefined") return "#888";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export function FleetMap({
  robots,
  selectedId,
  onSelect,
  overlays,
  chokepointBlocked,
  stale,
  emptyMessage,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ robots, selectedId, overlays, chokepointBlocked, stale });
  stateRef.current = { robots, selectedId, overlays, chokepointBlocked, stale };
  const viewRef = useRef({ scale: 20, ox: 0, oy: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const colors = {
      floor: css("--floor"),
      grid: css("--grid"),
      shelf: css("--shelf"),
      border: css("--border"),
      muted: css("--muted-foreground"),
      cyan: css("--moving"),
      amber: css("--yield"),
      green: css("--charge"),
      red: css("--danger"),
      fg: css("--foreground"),
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = box.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      const scale = Math.min(r.width / (WORLD.w + 2), r.height / (WORLD.h + 2));
      viewRef.current = {
        scale,
        ox: (r.width - WORLD.w * scale) / 2,
        oy: (r.height - WORLD.h * scale) / 2,
      };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    const draw = () => {
      const { robots, selectedId, overlays, chokepointBlocked, stale } = stateRef.current;
      const { scale, ox, oy } = viewRef.current;
      const X = (x: number) => ox + x * scale;
      const Y = (y: number) => oy + y * scale;
      const W = canvas.width / (window.devicePixelRatio || 1);
      const H = canvas.height / (window.devicePixelRatio || 1);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = colors.floor;
      ctx.fillRect(X(0), Y(0), WORLD.w * scale, WORLD.h * scale);

      // grid
      ctx.strokeStyle = colors.grid;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      for (let x = 0; x <= WORLD.w; x += 2) {
        ctx.beginPath();
        ctx.moveTo(X(x), Y(0));
        ctx.lineTo(X(x), Y(WORLD.h));
        ctx.stroke();
      }
      for (let y = 0; y <= WORLD.h; y += 2) {
        ctx.beginPath();
        ctx.moveTo(X(0), Y(y));
        ctx.lineTo(X(WORLD.w), Y(y));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const now = Date.now();

      for (const r of robots) {
        const isStale = stale || now - r.lastUpdate > STALE_MS;
        const color = isStale ? colors.red : statusColor(r.status);
        const selected = r.id === selectedId;
        ctx.globalAlpha = isStale ? 0.45 : 1;

        if (overlays.trails && r.trail.length > 1) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = isStale ? 0.15 : 0.3;
          ctx.lineWidth = 2;
          ctx.beginPath();
          r.trail.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
          ctx.stroke();
          ctx.globalAlpha = isStale ? 0.45 : 1;
        }

        if (overlays.paths && r.path.length) {
          ctx.strokeStyle = colors.cyan;
          ctx.globalAlpha = selected ? 0.9 : 0.35;
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(X(r.pos[0]), Y(r.pos[1]));
          for (const p of r.path) ctx.lineTo(X(p[0]), Y(p[1]));
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = isStale ? 0.45 : 1;
        }

        if (overlays.comms) {
          ctx.strokeStyle = colors.cyan;
          ctx.globalAlpha = 0.12;
          ctx.beginPath();
          ctx.arc(X(r.pos[0]), Y(r.pos[1]), 6 * scale, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = isStale ? 0.45 : 1;
        }

        if (overlays.cones && selected) {
          const spread = 0.5;
          ctx.beginPath();
          ctx.moveTo(X(r.pos[0]), Y(r.pos[1]));
          ctx.arc(X(r.pos[0]), Y(r.pos[1]), 3 * scale, r.theta - spread, r.theta + spread);
          ctx.closePath();
          ctx.fillStyle = colors.amber;
          ctx.globalAlpha = 0.18;
          ctx.fill();
          ctx.globalAlpha = isStale ? 0.45 : 1;
        }

        // body
        const rad = Math.max(6, scale * 0.42);
        if (selected) {
          ctx.beginPath();
          ctx.arc(X(r.pos[0]), Y(r.pos[1]), rad + 6, 0, Math.PI * 2);
          ctx.strokeStyle = colors.fg;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(X(r.pos[0]), Y(r.pos[1]), rad, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = isStale ? 0.35 : 0.9;
        ctx.fill();
        ctx.globalAlpha = isStale ? 0.5 : 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // heading arrow
        ctx.beginPath();
        ctx.moveTo(X(r.pos[0]), Y(r.pos[1]));
        ctx.lineTo(
          X(r.pos[0] + Math.cos(r.theta) * 1.2),
          Y(r.pos[1] + Math.sin(r.theta) * 1.2),
        );
        ctx.strokeStyle = colors.fg;
        ctx.lineWidth = 2;
        ctx.stroke();

        if (overlays.ids) {
          ctx.fillStyle = colors.fg;
          ctx.font = "11px ui-monospace, monospace";
          ctx.fillText(r.id, X(r.pos[0]) + rad + 4, Y(r.pos[1]) - rad);
        }
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { scale, ox, oy } = viewRef.current;
    const wx = (e.clientX - rect.left - ox) / scale;
    const wy = (e.clientY - rect.top - oy) / scale;
    let hit: string | null = null;
    for (const r of robots) {
      if (Math.hypot(r.pos[0] - wx, r.pos[1] - wy) < 1) hit = r.id;
    }
    onSelect(hit);
  };

  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden bg-floor">
      <canvas ref={canvasRef} onClick={handleClick} className="block h-full w-full cursor-crosshair" />
      {emptyMessage && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-md border border-border bg-panel/90 px-6 py-4 text-center">
            <p className="hud-label">waiting for connection</p>
            <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
