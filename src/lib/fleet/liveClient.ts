import type {
  BridgeMessage,
  ConnectionStatus,
  EventKind,
  FleetCommand,
  RobotState,
} from "./types";

export interface LiveHandlers {
  onStatus: (s: ConnectionStatus, detail?: string) => void;
  onRobots: (robots: Record<string, RobotState>) => void;
  onEvent: (kind: EventKind, message: string, robotId?: string) => void;
}

/**
 * WebSocket client for the Zenoh bridge (see /server).
 * Keeps last-known poses on disconnect and auto-reconnects with backoff.
 */
export class LiveFleetClient {
  private ws: WebSocket | null = null;
  private robots: Record<string, RobotState> = {};
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private url: string,
    private handlers: LiveHandlers,
  ) {}

  connect() {
    this.closed = false;
    this.open();
  }

  private open() {
    if (this.closed) return;
    this.handlers.onStatus(this.retry === 0 ? "reconnecting" : "reconnecting", this.url);
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.handlers.onStatus("connected", this.url);
      this.handlers.onEvent("connection", `Connected to bridge ${this.url}`);
    };

    ws.onmessage = (ev) => {
      let msg: BridgeMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === "robot_state") {
        const prev = this.robots[msg.id];
        const trail = prev ? [...prev.trail, msg.pos].slice(-60) : [msg.pos];
        this.robots = {
          ...this.robots,
          [msg.id]: {
            id: msg.id,
            pos: msg.pos,
            theta: msg.theta ?? 0,
            vel: msg.vel ?? [0, 0],
            battery: msg.battery ?? 0,
            status: msg.status ?? "idle",
            taskId: msg.task_id ?? null,
            path: msg.path ?? [],
            trail,
            lastUpdate: msg.stamp ? msg.stamp * 1000 : Date.now(),
          },
        };
        this.handlers.onRobots(this.robots);
      } else if (msg.type === "event") {
        this.handlers.onEvent(msg.kind ?? "system", msg.message, msg.robot_id);
      } else if (msg.type === "hello") {
        this.handlers.onEvent(
          "connection",
          `Bridge ready — zenoh router ${msg.router}, namespace ${msg.namespace}`,
        );
      }
    };

    ws.onerror = () => {
      /* handled by onclose */
    };

    ws.onclose = () => {
      if (this.closed) return;
      this.handlers.onStatus("offline", this.url);
      this.handlers.onEvent("connection", "Bridge connection lost — last poses kept as stale");
      this.scheduleRetry();
    };
  }

  private scheduleRetry() {
    this.retry += 1;
    const delay = Math.min(10000, 800 * this.retry);
    this.handlers.onStatus("reconnecting", this.url);
    this.timer = setTimeout(() => this.open(), delay);
  }

  send(cmd: FleetCommand) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(cmd));
      return true;
    }
    return false;
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }
}
