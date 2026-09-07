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
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { Menu, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Full Screen Map */}
      <div className="absolute inset-0 z-0">
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

      {/* Floating TopBar */}
      <div className="absolute top-4 left-4 right-4 z-40 pointer-events-none">
        <div className="pointer-events-auto rounded-2xl border border-border/50 bg-panel/60 backdrop-blur-xl shadow-xl shadow-black/40 transition-all hover:bg-panel/80">
          <TopBar
            mode={fleet.mode}
            onMode={fleet.switchMode}
            connection={fleet.connection}
            config={fleet.config}
            robotCount={fleet.robots.length}
            systemState={fleet.systemState}
          />
        </div>
      </div>

      {/* Floating Toolbar (Bottom Center) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40">
        <div className="flex items-center gap-2 rounded-2xl border border-border/50 bg-panel/60 backdrop-blur-xl p-2 shadow-2xl shadow-black/50 hover:bg-panel/80 transition-all">
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

          {/* Drawer Trigger for Event Log */}
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-xl border-border/50 bg-background/50 backdrop-blur-md">
                <ScrollText className="h-4 w-4" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="bg-panel/90 backdrop-blur-xl border-border/50 h-[50vh]">
              <div className="overflow-y-auto h-full p-4">
                <EventLog events={fleet.events} onClear={fleet.clearEvents} />
              </div>
            </DrawerContent>
          </Drawer>

          {/* Sheet Trigger for Command Center (formerly aside) */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="default" className="rounded-xl ml-2 shadow-lg shadow-primary/20">
                <Menu className="mr-2 h-4 w-4" />
                Command Center
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[400px] sm:w-[540px] border-l-border/50 bg-panel/90 backdrop-blur-2xl p-0 overflow-y-auto">
              <div className="flex flex-col h-full">
                {fleet.mode === "live" && (
                  <LiveConfigPanel
                    config={fleet.config}
                    setConfig={fleet.setConfig}
                    enabled={fleet.liveEnabled}
                    setEnabled={fleet.setLiveEnabled}
                    connection={fleet.connection}
                  />
                )}
                <div className="border-b border-border/50">
                  <div className="px-6 py-4 bg-background/20">
                    <p className="hud-label font-bold text-primary">Fleet Status</p>
                  </div>
                  <div className="px-2">
                    <FleetTable
                      robots={fleet.robots}
                      mode={fleet.mode}
                      selectedId={fleet.selectedId}
                      onSelect={fleet.setSelectedId}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="px-6 py-4 bg-background/20">
                    <p className="hud-label font-bold text-primary">Inspector</p>
                  </div>
                  <div className="px-2 pb-6">
                    <Inspector
                      robot={fleet.selected}
                      mode={fleet.mode}
                      estopped={!!(fleet.selected && fleet.estopped[fleet.selected.id])}
                      onCommand={fleet.sendCommand}
                    />
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}
