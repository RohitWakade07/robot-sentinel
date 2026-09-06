import { useEffect, useState } from "react";
import type { FleetMode, RobotState } from "@/lib/fleet/types";
import { STALE_MS, STATUS_CLASS } from "@/lib/fleet/ui";

interface Props {
  robots: RobotState[];
  mode: FleetMode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function FleetTable({ robots, mode, selectedId, onSelect }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (robots.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        No robots reporting. {mode === "live" ? "Connect the bridge to see live telemetry." : ""}
      </div>
    );
  }

  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="hud-label border-b border-border">
          <th className="px-3 py-2">ID</th>
          <th className="px-2 py-2">Status</th>
          <th className="px-2 py-2">Battery</th>
          <th className="px-2 py-2">Speed</th>
          <th className="px-2 py-2">Task</th>
          {mode === "live" && <th className="px-2 py-2">HB</th>}
        </tr>
      </thead>
      <tbody className="font-mono">
        {robots.map((r) => {
          const age = now - r.lastUpdate;
          const stale = mode === "live" && age > STALE_MS;
          const speed = Math.hypot(r.vel[0], r.vel[1]);
          return (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-panel-2 ${
                selectedId === r.id ? "bg-panel-2" : ""
              }`}
            >
              <td className="px-3 py-2 font-semibold text-foreground">{r.id}</td>
              <td className="px-2 py-2">
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                    stale ? STATUS_CLASS.offline : STATUS_CLASS[r.status]
                  }`}
                >
                  {stale ? "stale" : r.status}
                </span>
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-12 overflow-hidden rounded-full bg-panel-2">
                    <div
                      className={`h-full ${
                        r.battery < 0.2 ? "bg-danger" : r.battery < 0.4 ? "bg-yield" : "bg-charge"
                      }`}
                      style={{ width: `${Math.round(r.battery * 100)}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground">{Math.round(r.battery * 100)}%</span>
                </div>
              </td>
              <td className="px-2 py-2 text-muted-foreground">{speed.toFixed(2)}</td>
              <td className="px-2 py-2 text-muted-foreground">{r.taskId ?? "—"}</td>
              {mode === "live" && (
                <td className={`px-2 py-2 ${stale ? "text-danger" : "text-muted-foreground"}`}>
                  {(age / 1000).toFixed(1)}s
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
