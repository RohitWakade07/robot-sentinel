import { useState, useMemo } from "react";
import type { FleetEvent } from "@/lib/fleet/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2 } from "lucide-react";

const KIND_COLOR: Record<string, string> = {
  task: "text-moving",
  dock: "text-charge",
  blocked: "text-yield",
  connection: "text-moving",
  comms: "text-cyan-400",
  stale: "text-danger",
  command: "text-foreground",
  system: "text-muted-foreground",
};

export function EventLog({ events, onClear }: { events: FleetEvent[]; onClear: () => void }) {
  // Extract unique robot IDs from events
  const robotIds = useMemo(() => {
    const ids = new Set<string>();
    events.forEach((e) => {
      if (e.robotId) ids.add(e.robotId);
    });
    return Array.from(ids).sort();
  }, [events]);

  const [activeTab, setActiveTab] = useState<string>("system");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filteredEvents = useMemo(() => {
    if (activeTab === "system") {
      return events.filter((e) => !e.robotId || e.kind === "system");
    }
    return events.filter((e) => e.robotId === activeTab);
  }, [events, activeTab]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <p className="hud-label font-bold text-primary">Decentralized Event Stream</p>
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          <Trash2 className="h-3 w-3" />
          <span className="hud-label">clear</span>
        </button>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="w-full justify-start overflow-x-auto bg-background/50 backdrop-blur-md rounded-lg p-1">
            <TabsTrigger value="system" className="text-xs font-mono">System</TabsTrigger>
            {robotIds.map((id) => (
              <TabsTrigger key={id} value={id} className="text-xs font-mono">
                {id}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="flex-1 overflow-y-auto mt-4 pr-2 outline-none">
            {filteredEvents.length === 0 && (
              <p className="text-muted-foreground font-mono text-[11px]">No events for {activeTab}.</p>
            )}
            <div className="space-y-1 font-mono text-[11px]">
              {filteredEvents.map((e) => {
                const isExpanded = expandedId === e.id;
                return (
                  <div key={e.id} className="flex flex-col border-b border-white/5 last:border-0 pb-1">
                    <div 
                      className={`flex gap-3 hover:bg-background/50 rounded px-2 py-1 transition-colors ${e.payload ? 'cursor-pointer' : ''}`}
                      onClick={() => e.payload && setExpandedId(isExpanded ? null : e.id)}
                    >
                      <span className="text-muted-foreground shrink-0">
                        {new Date(e.t).toLocaleTimeString("en-GB", { hour12: false })}
                      </span>
                      <span className={`w-20 shrink-0 uppercase ${KIND_COLOR[e.kind] ?? ""}`}>{e.kind}</span>
                      <span className="text-foreground/90 break-words flex-1">
                        {e.message}
                        {e.payload && <span className="ml-2 text-cyan-500/70 opacity-50 text-[9px]">(JSON)</span>}
                      </span>
                    </div>
                    {isExpanded && e.payload && (
                      <div className="pl-[104px] pr-2 pb-2 pt-1 animate-in slide-in-from-top-1 fade-in duration-200">
                        <pre className="bg-black/60 border border-white/10 rounded-md p-2 overflow-x-auto text-cyan-300 font-mono text-[10px]">
                          {JSON.stringify(e.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
