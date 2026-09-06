import { Radio, Cpu } from "lucide-react";
import type { ConnectionStatus, FleetMode, LiveConfig } from "@/lib/fleet/types";

interface Props {
  mode: FleetMode;
  onMode: (m: FleetMode) => void;
  connection: ConnectionStatus;
  config: LiveConfig;
  robotCount: number;
}

const DOT: Record<ConnectionStatus, string> = {
  connected: "bg-charge",
  reconnecting: "bg-yield animate-pulse",
  offline: "bg-danger",
};

export function TopBar({ mode, onMode, connection, config, robotCount }: Props) {
  return (
    <header className="flex items-center gap-4 border-b border-border bg-panel px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        <h1 className="font-mono text-sm font-semibold tracking-wide">AMR FLEET CONSOLE</h1>
      </div>

      <div className="flex rounded-md border border-border p-0.5">
        {(["sim", "live"] as FleetMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onMode(m)}
            className={`rounded px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
              mode === m
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "sim" ? "Simulation" : "Live Fleet"}
          </button>
        ))}
      </div>

      {mode === "live" && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-panel-2 px-3 py-1">
          <span className={`h-2 w-2 rounded-full ${DOT[connection]}`} />
          <span className="font-mono text-[11px] uppercase tracking-wider">{connection}</span>
          <span className="hud-label">zenoh</span>
          <span className="font-mono text-[11px] text-muted-foreground">{config.zenohRouter}</span>
          <Radio className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-[11px] text-muted-foreground">{config.wsUrl}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
        <span>
          robots <span className="text-foreground">{robotCount}</span>
        </span>
        <span>
          source{" "}
          <span className="text-foreground">
            {mode === "sim" ? "client sim loop" : "zenoh bridge ws"}
          </span>
        </span>
      </div>
    </header>
  );
}
