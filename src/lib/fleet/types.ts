export type RobotStatus =
  | "moving"
  | "idle"
  | "yielding"
  | "charging"
  | "blocked"
  | "offline";

export interface SystemHealth {
  lidar: string;
  imu: string;
  stm32: string;
  ros2: string;
  cpu_usage: number;
  comms: string;
}

export interface CommunicationState {
  p2p_connected: boolean;
  latency_ms: number;
  message_age_ms: number;
  connectivity: number;
}

export interface SafetyState {
  collision_risk: "low" | "medium" | "high";
  proximity_warning: boolean;
  estop: boolean;
}

/**
 * Mode-agnostic robot state. Produced either by the in-browser simulation loop
 * or by the Zenoh->WebSocket bridge. The UI never knows which.
 */
export interface RobotState {
  id: string;
  pos: [number, number];
  theta: number;
  vel: [number, number];
  battery: number; // 0..100
  charging?: boolean;
  low_battery?: boolean;
  status: RobotStatus;
  taskId: string | null;
  /** Remaining planned path in world coordinates. */
  path: [number, number][];
  destination?: [number, number];
  eta?: number;
  /** Recent positions, newest last. */
  trail: [number, number][];
  
  // Extended state
  communication?: CommunicationState;
  health?: SystemHealth;
  safety?: SafetyState;
  controller_mode?: string;

  /** ms epoch of the last state update (used for staleness in live mode). */
  lastUpdate: number;
}

export interface FleetSummary {
  total: number;
  moving: number;
  idle: number;
  waiting: number;
  charging: number;
  active_tasks: number;
  alerts: number;
}

export interface EnvironmentState {
  obstacles: [number, number][];
  blocked_aisles: [number, number][];
  restricted_areas: [number, number][];
}

export interface SystemState {
  summary: FleetSummary | null;
  environment: EnvironmentState | null;
}

export type EventKind =
  | "task"
  | "dock"
  | "blocked"
  | "connection"
  | "comms"
  | "stale"
  | "command"
  | "system"
  | "alert";

export interface FleetEvent {
  id: number;
  t: number;
  kind: EventKind;
  message: string;
  robotId?: string;
  payload?: any;
}

export type ConnectionStatus = "connected" | "reconnecting" | "offline";

export type FleetMode = "sim" | "live";

export interface FleetCommand {
  type: "command";
  command: "estop" | "resume" | "dock" | "block_chokepoint";
  robot_id?: string;
  value?: boolean;
}

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
