import mqtt, { MqttClient } from "mqtt";
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

const TOPIC = "eyrc/holo_battalion/telemetry";

/**
 * MQTT client for the HiveMQ bridge.
 * Keeps last-known poses on disconnect and auto-reconnects.
 */
export class LiveFleetClient {
  private client: MqttClient | null = null;
  private robots: Record<string, RobotState> = {};
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
    this.handlers.onStatus("reconnecting", this.url);
    
    this.client = mqtt.connect(this.url, {
      reconnectPeriod: 2000,
    });

    this.client.on("connect", () => {
      this.handlers.onStatus("connected", this.url);
      this.handlers.onEvent("connection", `Connected to MQTT bridge ${this.url}`);
      this.client?.subscribe(TOPIC, (err) => {
        if (err) {
          this.handlers.onEvent("system", `Failed to subscribe to ${TOPIC}`);
        } else {
          this.handlers.onEvent("system", `Subscribed to ${TOPIC}`);
        }
      });
    });

    this.client.on("message", (topic, payload) => {
      if (topic !== TOPIC) return;
      let msg: BridgeMessage;
      try {
        msg = JSON.parse(payload.toString());
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
          `Bridge ready — router ${msg.router}, namespace ${msg.namespace}`,
        );
      }
    });

    this.client.on("error", (err) => {
       /* Handled by close/reconnect logic in mqtt library */
    });

    this.client.on("offline", () => {
      if (this.closed) return;
      this.handlers.onStatus("offline", this.url);
      this.handlers.onEvent("connection", "MQTT connection lost — last poses kept as stale");
    });
  }

  send(cmd: FleetCommand) {
    if (this.client && this.client.connected) {
      this.client.publish("eyrc/holo_battalion/commands", JSON.stringify(cmd));
      return true;
    }
    return false;
  }

  close() {
    this.closed = true;
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }
}
