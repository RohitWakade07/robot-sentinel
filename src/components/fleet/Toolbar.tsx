import { Pause, Play, ShieldAlert } from "lucide-react";
import type { FleetMode, Overlays, RobotState } from "@/lib/fleet/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface Props {
  mode: FleetMode;
  running: boolean;
  setRunning: (v: boolean) => void;
  speed: number;
  setSpeed: (v: number) => void;
  fleetSize: number;
  setFleetSize: (v: number) => void;
  chokepointBlocked: boolean;
  setChokepointBlocked: (v: boolean) => void;
  overlays: Overlays;
  setOverlays: (o: Overlays) => void;
  robots: RobotState[];
  estopped: Record<string, boolean>;
  onCommand: (cmd: "estop" | "resume", id: string) => void;
}

const OVERLAY_LABELS: Record<keyof Overlays, string> = {
  paths: "paths",
  comms: "comm range",
  cones: "avoid cones",
  ids: "ids",
  navGraph: "nav graph",
  trails: "trails",
};

export function Toolbar(p: Props) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border bg-panel px-4 py-2">
      {p.mode === "sim" ? (
        <>
          <Button size="sm" variant="secondary" onClick={() => p.setRunning(!p.running)}>
            {p.running ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
            {p.running ? "Pause" : "Run"}
          </Button>
          <div className="flex items-center gap-1">
            <span className="hud-label">speed</span>
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={`speed-${s}`}
                onClick={() => p.setSpeed(s)}
                className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                  p.speed === s
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="hud-label">fleet</span>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button
                key={`fleet-${n}`}
                onClick={() => p.setFleetSize(n)}
                className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                  p.fleetSize === n
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="hud-label">e-stop</span>
          {p.robots.length === 0 && (
            <span className="text-xs text-muted-foreground">no robots online</span>
          )}
          {p.robots.map((r) => (
            <button
              key={r.id}
              onClick={() => p.onCommand(p.estopped[r.id] ? "resume" : "estop", r.id)}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] ${
                p.estopped[r.id]
                  ? "border-charge/50 bg-charge/15 text-charge"
                  : "border-danger/50 bg-danger/10 text-danger"
              }`}
            >
              <ShieldAlert className="h-3 w-3" />
              {r.id} {p.estopped[r.id] ? "resume" : "stop"}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="hud-label">chokepoint</span>
        <Switch
          checked={p.chokepointBlocked}
          onCheckedChange={(v) => p.setChokepointBlocked(v)}
        />
        <span className="font-mono text-[11px] text-muted-foreground">
          {p.chokepointBlocked ? "blocked" : "open"}
        </span>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1">
        {(Object.keys(OVERLAY_LABELS) as (keyof Overlays)[]).map((k) => (
          <button
            key={k}
            onClick={() => p.setOverlays({ ...p.overlays, [k]: !p.overlays[k] })}
            className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
              p.overlays[k]
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {OVERLAY_LABELS[k]}
          </button>
        ))}
      </div>
    </div>
  );
}
