import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FleetMap } from "@/components/fleet/FleetMap";
import { FleetTable } from "@/components/fleet/FleetTable";
import { Inspector } from "@/components/fleet/Inspector";
import { Toolbar } from "@/components/fleet/Toolbar";
import { TopBar } from "@/components/fleet/TopBar";
import { EventLog } from "@/components/fleet/EventLog";
import { LiveConfigPanel } from "@/components/fleet/LiveConfigPanel";
import { useFleet } from "@/lib/fleet/useFleet";
import type { Overlays } from "@/lib/fleet/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AMR Fleet Console — Warehouse Robot Dashboard" },
      {
        name: "description",
        content:
          "Monitor warehouse autonomous mobile robots in simulation or live over a ROS2 Zenoh bridge: map, fleet status, telemetry inspector and event log.",
      },
      { property: "og:title", content: "AMR Fleet Console — Warehouse Robot Dashboard" },
      {
        property: "og:description",
        content:
          "Simulation and live ROS2/Zenoh fleet monitoring for warehouse AMRs with map, telemetry and e-stop controls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FleetConsole,
});

function FleetConsole() {
  const fleet = useFleet();
  const [overlays, setOverlays] = useState<Overlays>({
    paths: true,
    comms: false,
    cones: true,
    ids: true,
    navGraph: false,
    trails: true,
  });

  const liveWaiting = fleet.mode === "live" && fleet.robots.length === 0;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar
        mode={fleet.mode}
        onMode={fleet.switchMode}
        connection={fleet.connection}
        config={fleet.config}
        robotCount={fleet.robots.length}
      />

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <FleetMap
              robots={fleet.robots}
              selectedId={fleet.selectedId}
              onSelect={fleet.setSelectedId}
              overlays={overlays}
              chokepointBlocked={fleet.chokepointBlocked}
              stale={fleet.mode === "live" && fleet.connection !== "connected"}
              emptyMessage={
                liveWaiting
                  ? fleet.liveEnabled
                    ? `No telemetry from ${fleet.config.wsUrl}. Start the bridge service in /server.`
                    : "Enter the bridge address in the panel on the right and press Connect."
                  : undefined
              }
            />
          </div>
          <Toolbar
            mode={fleet.mode}
            running={fleet.running}
            setRunning={fleet.setRunning}
            speed={fleet.speed}
            setSpeed={fleet.setSpeed}
            fleetSize={fleet.fleetSize}
            setFleetSize={fleet.setFleetSize}
            chokepointBlocked={fleet.chokepointBlocked}
            setChokepointBlocked={fleet.setChokepointBlocked}
            overlays={overlays}
            setOverlays={setOverlays}
            robots={fleet.robots}
            estopped={fleet.estopped}
            onCommand={fleet.sendCommand}
          />
          <EventLog events={fleet.events} onClear={fleet.clearEvents} />
        </main>

        <aside className="flex w-[30%] min-w-[340px] flex-col overflow-y-auto border-l border-border bg-panel">
          {fleet.mode === "live" && (
            <LiveConfigPanel
              config={fleet.config}
              setConfig={fleet.setConfig}
              enabled={fleet.liveEnabled}
              setEnabled={fleet.setLiveEnabled}
              connection={fleet.connection}
            />
          )}
          <div className="border-b border-border">
            <div className="px-4 py-2">
              <p className="hud-label">fleet status</p>
            </div>
            <FleetTable
              robots={fleet.robots}
              mode={fleet.mode}
              selectedId={fleet.selectedId}
              onSelect={fleet.setSelectedId}
            />
          </div>
          <div>
            <div className="px-4 py-2">
              <p className="hud-label">inspector</p>
            </div>
            <Inspector
              robot={fleet.selected}
              mode={fleet.mode}
              estopped={!!(fleet.selected && fleet.estopped[fleet.selected.id])}
              onCommand={fleet.sendCommand}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
