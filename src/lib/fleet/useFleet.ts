import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FleetSimulation } from "./simulation";
import { LiveFleetClient } from "./liveClient";
import type {
  ConnectionStatus,
  EventKind,
  FleetEvent,
  FleetMode,
  LiveConfig,
  RobotState,
} from "./types";

const DEFAULT_CONFIG: LiveConfig = {
  wsUrl: "wss://broker.hivemq.com:8884/mqtt",
  zenohRouter: "broker.hivemq.com:1883",
  namespace: "eyrc/holo_battalion/telemetry",
};

let eventId = 0;

export function useFleet() {
  const [mode, setMode] = useState<FleetMode>("sim");
  const [robots, setRobots] = useState<RobotState[]>([]);
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [fleetSize, setFleetSize] = useState(5);
  const [chokepointBlocked, setChokepointBlocked] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("offline");
  const [config, setConfig] = useState<LiveConfig>(DEFAULT_CONFIG);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [estopped, setEstopped] = useState<Record<string, boolean>>({});
  const [systemState, setSystemState] = useState<SystemState | null>(null);

  const simRef = useRef<FleetSimulation | null>(null);
  const clientRef = useRef<LiveFleetClient | null>(null);
  const runRef = useRef({ running, speed, mode });
  runRef.current = { running, speed, mode };

  const log = useCallback((kind: EventKind, message: string, robotId?: string) => {
    eventId += 1;
    setEvents((prev) => [{ id: eventId, t: Date.now(), kind, message, robotId }, ...prev].slice(0, 200));
  }, []);

  // ---- simulation loop -----------------------------------------------------
  useEffect(() => {
    const sim = new FleetSimulation(log, fleetSize);
    simRef.current = sim;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { running, speed, mode } = runRef.current;
      if (mode === "sim" && running) {
        sim.step(dt * speed);
        setRobots(sim.snapshot());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    log("system", "Simulation engine started");
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    simRef.current?.setSize(fleetSize);
  }, [fleetSize]);

  useEffect(() => {
    if (runRef.current.mode === "sim") simRef.current?.setChokepointBlocked(chokepointBlocked);
    else clientRef.current?.send({ type: "command", command: "block_chokepoint", value: chokepointBlocked });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chokepointBlocked]);

  // ---- live connection -----------------------------------------------------
  useEffect(() => {
    if (mode !== "live" || !liveEnabled) return;
    setRobots([]);
    const client = new LiveFleetClient(config.wsUrl, {
      onStatus: (s) => setConnection(s),
      onRobots: (map) => setRobots(Object.values(map)),
      onSystem: (system) => setSystemState(system),
      onEvent: (kind, message, robotId) => log(kind, message, robotId),
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      clientRef.current = null;
      setConnection("offline");
    };
  }, [mode, liveEnabled, config.wsUrl, log]);

  const switchMode = useCallback(
    (next: FleetMode) => {
      setMode(next);
      setSelectedId(null);
      if (next === "sim") {
        setRobots(simRef.current?.snapshot() ?? []);
        setConnection("offline");
        log("system", "Switched to Simulation Mode");
      } else {
        setRobots([]);
        log("system", "Switched to Live Fleet Mode");
      }
    },
    [log],
  );

  const sendCommand = useCallback(
    (command: "estop" | "resume" | "dock", robotId: string) => {
      const ok = clientRef.current?.send({ type: "command", command, robot_id: robotId }) ?? false;
      setEstopped((prev) => ({ ...prev, [robotId]: command === "estop" }));
      log(
        "command",
        ok
          ? `${command.toUpperCase()} sent to ${robotId} via bridge`
          : `${command.toUpperCase()} for ${robotId} failed — bridge not connected`,
        robotId,
      );
    },
    [log],
  );

  const selected = useMemo(
    () => robots.find((r) => r.id === selectedId) ?? null,
    [robots, selectedId],
  );

  // ---- simulated P2P communications log ------------------------------------
  useEffect(() => {
    if (!running) return;

    const interval = setInterval(() => {
      // Find a random pair of robots that are close to each other
      const botList = runRef.current.mode === "sim" ? simRef.current?.snapshot() ?? [] : robots;
      
      for (let i = 0; i < botList.length; i++) {
        for (let j = i + 1; j < botList.length; j++) {
          const r1 = botList[i];
          const r2 = botList[j];
          
          const dx = r2.pos[0] - r1.pos[0];
          const dy = r2.pos[1] - r1.pos[1];
          const dist = Math.hypot(dx, dy);

          // If within P2P range and some random chance
          if (dist < 12 && Math.random() < 0.3) {
            const msgsR1 = [
              { msg: `Picking the crate ${Math.floor(Math.random()*20 + 20)} in P1 zone`, payload: { action: "pick", zone: "P1", crate_id: Math.floor(Math.random()*20 + 20), status: "in_progress" } },
              { msg: `Approaching D1 zone to place the crate`, payload: { action: "drop", zone: "D1", target_pose: [9.72, 10.19], eta_sec: 4.5 } },
              { msg: `Coordinated with Bot ${r2.id.replace('R','')} to take the zone`, payload: { type: "negotiation", peer: r2.id, resolution: "yield_right_of_way", priority: "high" } },
              { msg: `Sent payload dimensions to ${r2.id}`, payload: { size: [1.2, 0.8, 1.0], weight_kg: 4.5, sender: r1.id } },
            ];
            
            const msgsR2 = [
              { msg: `Received trajectory update from ${r1.id}`, payload: { sender: r1.id, trajectory_points: 12, conflict: false } },
              { msg: `Coordinated with Bot ${r1.id.replace('R','')} to take the crates`, payload: { type: "task_allocation", peer: r1.id, strategy: "distance_based_split" } },
              { msg: `Acknowledged yield request from ${r1.id}`, payload: { sender: r1.id, action: "hold_position", duration_sec: 3.2 } },
            ];
            
            // Log for R1
            const r1Event = msgsR1[Math.floor(Math.random() * msgsR1.length)];
            log("comms", r1Event.msg, r1.id, r1Event.payload);
            
            // Log for R2
            const r2Event = msgsR2[Math.floor(Math.random() * msgsR2.length)];
            log("comms", r2Event.msg, r2.id, r2Event.payload);
            
            // Only do one pair per interval to avoid spam
            return;
          }
        }
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [running, robots, log]);

  return {
    mode,
    switchMode,
    robots,
    selected,
    selectedId,
    setSelectedId,
    events,
    clearEvents: () => setEvents([]),
    running,
    setRunning,
    speed,
    setSpeed,
    fleetSize,
    setFleetSize,
    chokepointBlocked,
    setChokepointBlocked,
    connection,
    config,
    setConfig,
    liveEnabled,
    setLiveEnabled,
    sendCommand,
    estopped,
    systemState,
  };
}
