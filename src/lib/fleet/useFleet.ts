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
  wsUrl: "ws://localhost:8787",
  zenohRouter: "tcp/127.0.0.1:7447",
  namespace: "robot_",
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
  };
}
