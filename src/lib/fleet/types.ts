export type RobotStatus =
  | "moving"
  | "idle"
  | "yielding"
  | "charging"
  | "blocked"
  | "offline";

/**
 * Mode-agnostic robot state. Produced either by the in-browser simulation loop
 * or by the Zenoh->WebSocket bridge. The UI never knows which.
 */
export interface RobotState {
  id: string;
  pos: [number, number];
  theta: number;
  vel: [number, number];
  battery: number; // 0..1
  status: RobotStatus;
  taskId: string | null;
  /** Remaining planned path in world coordinates. */
  path: [number, number][];
  /** Recent positions, newest last. */
  trail: [number, number][];
  /** ms epoch of the last state update (used for staleness in live mode). */
  lastUpdate: number;
}

export type EventKind =
  | "task"
  | "dock"
  | "blocked"
  | "connection"
  | "stale"
  | "command"
  | "system";

export interface FleetEvent {
  id: number;
  t: number;
  kind: EventKind;
  robotId?: string;
  message: string;
}

export type ConnectionStatus = "connected" | "reconnecting" | "offline";

export type FleetMode = "sim" | "live";

export interface FleetCommand {
  type: "command";
  command: "estop" | "resume" | "dock" | "block_chokepoint";
  robot_id?: string;
  value?: boolean;
}

/** Wire message emitted by the bridge for each robot update. */
export interface RobotStateMessage {
  type: "robot_state";
  id: string;
  pos: [number, number];
  theta: number;
  vel: [number, number];
  battery: number;
  status: RobotStatus;
  task_id: string | null;
  path?: [number, number][];
  stamp?: number;
}

export interface BridgeEventMessage {
  type: "event";
  kind: EventKind;
  robot_id?: string;
  message: string;
  stamp?: number;
}

export interface BridgeHelloMessage {
  type: "hello";
  router: string;
  namespace: string;
  robots: string[];
}

export type BridgeMessage =
  | RobotStateMessage
  | BridgeEventMessage
  | BridgeHelloMessage;

export interface Overlays {
  paths: boolean;
  comms: boolean;
  cones: boolean;
  ids: boolean;
  navGraph: boolean;
  trails: boolean;
}

export interface LiveConfig {
  wsUrl: string;
  zenohRouter: string;
  namespace: string;
}
