import mqtt, { MqttClient } from "mqtt";
import type {
  BridgeMessage,
  ConnectionStatus,
  EventKind,
  FleetCommand,
  RobotState,
  SystemState,
  FleetSummary,
  EnvironmentState,
} from "./types";

export interface LiveHandlers {
  onStatus: (s: ConnectionStatus, detail?: string) => void;
  onRobots: (robots: Record<string, RobotState>) => void;
  onSystem: (system: SystemState) => void;
  onEvent: (kind: EventKind, message: string, robotId?: string) => void;
}

const TOPIC_PREFIX = "eyrc/holo_battalion/fleet";

/**
 * MQTT client for the HiveMQ bridge.
 * Subscribes to telemetry topics and routes them to React state.
 */
export class LiveFleetClient {
  private client: MqttClient | null = null;
  private robots: Record<string, RobotState> = {};
  private system: SystemState = { summary: null, environment: null };
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
      
      const subTopic = `${TOPIC_PREFIX}/#`;
      this.client?.subscribe(subTopic, (err) => {
        if (err) {
          this.handlers.onEvent("system", `Failed to subscribe to ${subTopic}`);
        } else {
          this.handlers.onEvent("system", `Subscribed to ${subTopic}`);
        }
      });
    });

    this.client.on("message", (topic, payload) => {
      if (!topic.startsWith(TOPIC_PREFIX)) return;
      
      const subtopic = topic.replace(`${TOPIC_PREFIX}/`, "");
      let msg: any;
      try {
        msg = JSON.parse(payload.toString());
      } catch {
        return;
      }
      
      this.handleMessage(subtopic, msg);
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

  private handleMessage(subtopic: string, msg: any) {
    if (subtopic === "connection" && msg.type === "hello") {
      this.handlers.onEvent("connection", `Bridge ready — router ${msg.router}, namespace ${msg.namespace}`);
      return;
    }

    if (subtopic === "summary") {
      this.system.summary = msg as FleetSummary;
      this.handlers.onSystem({ ...this.system });
      return;
    }

    if (subtopic === "environment") {
      this.system.environment = msg as EnvironmentState;
      this.handlers.onSystem({ ...this.system });
      return;
    }

    if (subtopic === "alerts") {
      this.handlers.onEvent("alert", msg.message, msg.id);
      return;
    }

    // Per-robot topics
    const id = msg.id;
    if (!id) return;

    const prev = this.robots[id] || {
      id,
      pos: [0, 0],
      theta: 0,
      vel: [0, 0],
      battery: 0,
      status: "idle",
      taskId: null,
      path: [],
      trail: [],
      lastUpdate: 0,
    };

    const next = { ...prev };

    switch (subtopic) {
      case "robot_state":
        next.pos = [msg.x, msg.y];
        next.theta = msg.heading;
        next.vel = msg.velocity;
        next.status = msg.status;
        next.trail = [...prev.trail, next.pos].slice(-60);
        break;
      case "trajectory":
        next.path = msg.path;
        next.destination = msg.destination;
        next.eta = msg.eta;
        break;
      case "task_state":
        next.taskId = msg.task_id;
        break;
      case "battery":
        next.battery = msg.percentage;
        next.charging = msg.charging;
        next.low_battery = msg.low_battery;
        break;
      case "communication":
        next.communication = msg;
        break;
      case "controller_state":
        next.controller_mode = msg.mode;
        break;
      case "safety_state":
        next.safety = msg;
        break;
      case "system_health":
        next.health = msg;
        break;
    }

    next.lastUpdate = msg.stamp ? msg.stamp * 1000 : Date.now();
    this.robots = { ...this.robots, [id]: next };
    this.handlers.onRobots(this.robots);
  }

  send(cmd: FleetCommand) {
    if (this.client && this.client.connected) {
      this.client.publish(`${TOPIC_PREFIX}/commands`, JSON.stringify(cmd));
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
