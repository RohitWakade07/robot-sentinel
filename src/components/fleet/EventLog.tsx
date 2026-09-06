import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FleetEvent } from "@/lib/fleet/types";

const KIND_COLOR: Record<string, string> = {
  task: "text-moving",
  dock: "text-charge",
  blocked: "text-yield",
  connection: "text-moving",
  stale: "text-danger",
  command: "text-foreground",
  system: "text-muted-foreground",
};

export function EventLog({ events, onClear }: { events: FleetEvent[]; onClear: () => void }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border-t border-border bg-panel">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 hud-label hover:text-foreground"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          event log · {events.length}
        </button>
        <button onClick={onClear} className="hud-label hover:text-foreground">
          clear
        </button>
      </div>
      {open && (
        <div className="h-40 overflow-y-auto border-t border-border/60 px-4 py-2 font-mono text-[11px]">
          {events.length === 0 && <p className="text-muted-foreground">No events yet.</p>}
          {events.map((e) => (
            <div key={e.id} className="flex gap-3 py-0.5">
              <span className="text-muted-foreground">
                {new Date(e.t).toLocaleTimeString("en-GB", { hour12: false })}
              </span>
              <span className={`w-20 shrink-0 uppercase ${KIND_COLOR[e.kind] ?? ""}`}>{e.kind}</span>
              <span className="text-foreground/90">{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
