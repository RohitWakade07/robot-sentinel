import type { FleetMode, RobotState } from "@/lib/fleet/types";
import { STATUS_CLASS } from "@/lib/fleet/ui";
import { Button } from "@/components/ui/button";

interface Props {
  robot: RobotState | null;
  mode: FleetMode;
  estopped: boolean;
  onCommand: (cmd: "estop" | "resume" | "dock", id: string) => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/50 py-1.5">
      <span className="hud-label">{label}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

export function Inspector({ robot, mode, estopped, onCommand }: Props) {
  if (!robot) {
    return (
      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        Select a robot on the map or in the table to inspect its pose, velocity and local
        avoidance geometry.
      </div>
    );
  }

  const speed = Math.hypot(robot.vel[0], robot.vel[1]);
  const heading = ((robot.theta * 180) / Math.PI + 360) % 360;

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-sm font-semibold">{robot.id}</h3>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_CLASS[robot.status]}`}
        >
          {robot.status}
        </span>
      </div>
      <Row label="position" value={`${robot.pos[0].toFixed(2)}, ${robot.pos[1].toFixed(2)} m`} />
      <Row label="heading" value={`${heading.toFixed(1)}°`} />
      <Row label="velocity" value={`${robot.vel[0].toFixed(2)}, ${robot.vel[1].toFixed(2)} m/s`} />
      <Row label="speed" value={`${speed.toFixed(2)} m/s`} />
      <Row label="battery" value={`${robot.battery.toFixed(0)} % ${robot.charging ? '(Charging)' : ''} ${robot.low_battery ? '⚠️' : ''}`} />
      <Row label="task" value={robot.taskId ?? "—"} />
      
      {robot.eta !== undefined && <Row label="eta" value={`${robot.eta.toFixed(1)} s`} />}
      {robot.path.length > 0 && <Row label="waypoints" value={String(robot.path.length)} />}
      
      {robot.communication && (
        <>
          <div className="mt-4 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Network</div>
          <Row label="latency" value={`${robot.communication.latency_ms} ms`} />
          <Row label="connectivity" value={`${robot.communication.connectivity}%`} />
        </>
      )}

      {robot.health && (
        <>
          <div className="mt-4 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">System Health</div>
          <Row label="cpu" value={`${robot.health.cpu_usage}%`} />
          <Row label="ros2" value={robot.health.ros2} />
          <Row label="lidar" value={robot.health.lidar} />
        </>
      )}

      {robot.safety && (
        <>
          <div className="mt-4 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Safety</div>
          <Row label="collision risk" value={robot.safety.collision_risk} />
          {robot.safety.proximity_warning && <Row label="warning" value="Proximity Alert ⚠️" />}
        </>
      )}

      <div className="mt-4 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Update Status</div>
      <Row
        label="last update"
        value={`${((Date.now() - robot.lastUpdate) / 1000).toFixed(1)} s ago`}
      />

      {mode === "live" && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            className="flex-1"
            onClick={() => onCommand("estop", robot.id)}
            disabled={estopped}
          >
            E-STOP
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => onCommand("resume", robot.id)}
            disabled={!estopped}
          >
            Resume
          </Button>
          <Button size="sm" variant="outline" onClick={() => onCommand("dock", robot.id)}>
            Dock
          </Button>
        </div>
      )}
    </div>
  );
}
