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

    const BOT_PATH_COLORS: Record<string, string> = {
      "R0": "#ef4444", // red
      "R2": "#22c55e", // green
      "R4": "#3b82f6", // blue
      "R1": "#a855f7", // purple
      "R3": "#f97316", // orange
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

      // shelves
      for (const s of SHELVES) {
        ctx.fillStyle = colors.shelf;
        ctx.fillRect(X(s.x), Y(s.y), s.w * scale, s.h * scale);
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(X(s.x), Y(s.y), s.w * scale, s.h * scale);
        
        if (s.label && scale > 10) {
          ctx.fillStyle = colors.fg;
          ctx.font = "12px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(s.label, X(s.x + s.w / 2), Y(s.y + s.h / 2));
        }
      }

      const now = Date.now();
      if (overlays.comms) {
        ctx.strokeStyle = colors.cyan;
        ctx.fillStyle = colors.cyan;
        
        for (let i = 0; i < robots.length; i++) {
          const r1 = robots[i];
          if (stale || now - r1.lastUpdate > STALE_MS) continue;

          // Range circle
          ctx.globalAlpha = 0.04;
          ctx.beginPath();
          ctx.arc(X(r1.pos[0]), Y(r1.pos[1]), 8 * scale, 0, Math.PI * 2);
          ctx.fill();

          for (let j = i + 1; j < robots.length; j++) {
            const r2 = robots[j];
            if (stale || now - r2.lastUpdate > STALE_MS) continue;

            const dx = r2.pos[0] - r1.pos[0];
            const dy = r2.pos[1] - r1.pos[1];
            const dist = Math.hypot(dx, dy);

            if (dist < 12) { // 12 units P2P range
              // Draw pulsing line
              ctx.globalAlpha = 0.2 + Math.sin(now / 200) * 0.1;
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.moveTo(X(r1.pos[0]), Y(r1.pos[1]));
              ctx.lineTo(X(r2.pos[0]), Y(r2.pos[1]));
              ctx.stroke();
              ctx.setLineDash([]);

              // Animate data packet (r1 to r2)
              const offset1 = (now % 1500) / 1500;
              const px1 = r1.pos[0] + dx * offset1;
              const py1 = r1.pos[1] + dy * offset1;
              ctx.globalAlpha = 0.9;
              ctx.beginPath();
              ctx.arc(X(px1), Y(py1), 2.5, 0, Math.PI * 2);
              ctx.fill();

              // Animate data packet (r2 to r1)
              const offset2 = ((now + 750) % 1500) / 1500;
              const px2 = r2.pos[0] - dx * offset2;
              const py2 = r2.pos[1] - dy * offset2;
              ctx.beginPath();
              ctx.arc(X(px2), Y(py2), 2.5, 0, Math.PI * 2);
              ctx.fill();

              // Floating message text
              ctx.globalAlpha = 0.85;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              
              if (scale > 10) {
                 const midX = r1.pos[0] + dx / 2;
                 const midY = r1.pos[1] + dy / 2;
                 ctx.font = "9px ui-monospace, monospace";
                 
                 // Fake msg content alternating based on time
                 const showVel = Math.floor(now / 2000) % 2 === 0;
                 const msg = showVel 
                     ? `[V: ${r1.vel[0].toFixed(1)},${r1.vel[1].toFixed(1)}]` 
                     : `[P: ${r1.pos[0].toFixed(1)},${r1.pos[1].toFixed(1)}]`;
                 
                 // Draw a subtle background for text readability
                 const textWidth = ctx.measureText(msg).width;
                 ctx.fillStyle = colors.floor;
                 ctx.globalAlpha = 0.6;
                 ctx.fillRect(X(midX) - textWidth/2 - 2, Y(midY) - 15, textWidth + 4, 10);
                 
                 ctx.fillStyle = colors.cyan;
                 ctx.globalAlpha = 0.9;
                 ctx.fillText(msg, X(midX), Y(midY) - 10);
              }
            }
          }
        }
        ctx.globalAlpha = 1;
      }

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
          ctx.strokeStyle = BOT_PATH_COLORS[r.id] || colors.cyan;
          ctx.globalAlpha = selected ? 0.9 : 0.45;
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(X(r.pos[0]), Y(r.pos[1]));
          for (const p of r.path) ctx.lineTo(X(p[0]), Y(p[1]));
          ctx.stroke();
          ctx.setLineDash([]);
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
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(r.id, X(r.pos[0]) + rad + 4, Y(r.pos[1]) - rad);

          // Creative decentralized intent text
          const now = Date.now();
      if (overlays.comms) {
              ctx.fillStyle = colors.cyan;
              ctx.font = "10px ui-monospace, monospace";
              
              let intent = "Idle";
              if (r.status === "moving") {
                  if (r.pos[1] > 16) {
                      intent = r.pos[0] > 12 ? "» Approaching D3" : "» Approaching D2";
                  } else if (r.pos[1] > 9 && r.pos[1] <= 16 && r.pos[0] > 8 && r.pos[0] < 16) {
                      intent = "» Approaching D1";
                  } else if (r.pos[1] <= 9 && (r.pos[0] < 5 || r.pos[0] > 19)) {
                      intent = "» Targeting Pickup";
                  } else {
                      intent = "» Negotiating Path";
                  }
              } else if (r.status === "yielding") {
                  intent = "» Yielding P2P";
              }
              
              ctx.fillText(intent, X(r.pos[0]) + rad + 4, Y(r.pos[1]) - rad + 12);
          }
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
