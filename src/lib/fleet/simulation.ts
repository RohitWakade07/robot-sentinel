import type { EventKind, RobotState } from "./types";
import { CHOKEPOINT_NODE, DOCK, PICK_STATIONS, planPath } from "./warehouse";

export interface SimEmit {
  (kind: EventKind, message: string, robotId?: string): void;
}

interface SimRobot extends RobotState {
  goal: [number, number];
  goalLabel: string;
  yieldTimer: number;
  yieldCooldown: number;
  rerouted: boolean;
  targetSpeed: number;
}

const MAX_SPEED = 1.5; // m/s
const YIELD_RADIUS = 2.4;
const YIELD_MAX = 1.6; // s — never freeze longer than this
const DOCK_POS: [number, number] = [DOCK.x + DOCK.w + 0.9, DOCK.y + DOCK.h / 2];

let taskCounter = 40;

function nextTaskId() {
  taskCounter += 1;
  return `T${taskCounter}`;
}

export class FleetSimulation {
  robots: SimRobot[] = [];
  chokepointBlocked = false;
  private emit: SimEmit;

  constructor(emit: SimEmit, size = 5) {
    this.emit = emit;
    this.setSize(size);
  }

  private blockedNodes() {
    return this.chokepointBlocked ? new Set([CHOKEPOINT_NODE]) : new Set<string>();
  }

  setSize(size: number) {
    const prev = this.robots;
    this.robots = Array.from({ length: size }, (_, i) => {
      if (prev[i]) return prev[i];
      const id = `R${i + 1}`;
      const start: [number, number] = [DOCK_POS[0], 5 + i * 3.2];
      const robot: SimRobot = {
        id,
        pos: start,
        theta: 0,
        vel: [0, 0],
        battery: 0.55 + Math.random() * 0.45,
        status: "idle",
        taskId: null,
        path: [],
        trail: [start],
        lastUpdate: Date.now(),
        goal: start,
        goalLabel: "dock",
        yieldTimer: 0,
        yieldCooldown: 0,
        rerouted: false,
        targetSpeed: MAX_SPEED * (0.8 + Math.random() * 0.4),
      };
      this.assignTask(robot);
      return robot;
    });
  }

  setChokepointBlocked(blocked: boolean) {
    this.chokepointBlocked = blocked;
    this.emit("blocked", blocked ? "Chokepoint C2 blocked by operator" : "Chokepoint C2 cleared");
    for (const r of this.robots) {
      if (r.status !== "charging") this.replan(r);
    }
  }

  private assignTask(r: SimRobot) {
    if (r.battery < 0.2) {
      r.goal = DOCK_POS;
      r.goalLabel = "dock";
      r.taskId = null;
      this.emit("task", `${r.id} low battery — returning to dock`, r.id);
    } else {
      const station = PICK_STATIONS[Math.floor(Math.random() * PICK_STATIONS.length)];
      r.goal = [station.x, station.y];
      r.goalLabel = station.id;
      r.taskId = nextTaskId();
      this.emit("task", `${r.taskId} assigned to ${r.id} → pick station ${station.id}`, r.id);
    }
    this.replan(r);
    r.status = "moving";
  }

  private replan(r: SimRobot) {
    r.path = planPath(r.pos, r.goal, this.blockedNodes());
  }

  step(dt: number) {
    const now = Date.now();
    for (const r of this.robots) {
      r.yieldCooldown = Math.max(0, r.yieldCooldown - dt);

      if (r.status === "charging") {
        r.vel = [0, 0];
        r.battery = Math.min(1, r.battery + dt * 0.06);
        if (r.battery >= 0.95) {
          this.emit("dock", `${r.id} charged to ${Math.round(r.battery * 100)}% — leaving dock`, r.id);
          this.assignTask(r);
        }
        r.lastUpdate = now;
        continue;
      }

      // --- reactive yielding -------------------------------------------------
      let conflict: SimRobot | null = null;
      for (const o of this.robots) {
        if (o.id === r.id) continue;
        const dx = o.pos[0] - r.pos[0];
        const dy = o.pos[1] - r.pos[1];
        const dist = Math.hypot(dx, dy);
        if (dist > YIELD_RADIUS) continue;
        const ahead = Math.cos(r.theta) * dx + Math.sin(r.theta) * dy;
        if (ahead > 0.2) conflict = o;
      }
      // lower id has right of way; the other yields
      const mustYield = conflict !== null && r.id > conflict.id && r.yieldCooldown === 0;

      if (mustYield) {
        r.yieldTimer += dt;
        if (r.yieldTimer > YIELD_MAX && !r.rerouted) {
          // actively re-route instead of deadlocking
          r.rerouted = true;
          r.path = planPath(r.pos, r.goal, this.blockedNodes());
          r.yieldCooldown = 2.5;
          r.yieldTimer = 0;
          this.emit("blocked", `${r.id} re-routing around ${conflict!.id}`, r.id);
        }
        if (r.yieldTimer <= YIELD_MAX) {
          r.status = "yielding";
          r.vel = [0, 0];
          r.battery = Math.max(0, r.battery - dt * 0.0015);
          r.lastUpdate = now;
          continue;
        }
      } else {
        r.yieldTimer = 0;
        r.rerouted = false;
      }

      // --- follow path -------------------------------------------------------
      if (r.path.length === 0) {
        // arrived
        if (r.goalLabel === "dock") {
          r.status = "charging";
          r.vel = [0, 0];
          this.emit("dock", `${r.id} docked for charging`, r.id);
        } else {
          this.emit("task", `${r.taskId} completed by ${r.id} at ${r.goalLabel}`, r.id);
          this.assignTask(r);
        }
        r.lastUpdate = now;
        continue;
      }

      const wp = r.path[0];
      const dx = wp[0] - r.pos[0];
      const dy = wp[1] - r.pos[1];
      const dist = Math.hypot(dx, dy);
      if (dist < 0.25) {
        r.path.shift();
        r.lastUpdate = now;
        continue;
      }

      const desired = Math.atan2(dy, dx);
      let diff = desired - r.theta;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      r.theta += Math.max(-3 * dt, Math.min(3 * dt, diff));

      const speed = r.targetSpeed * (Math.abs(diff) > 0.8 ? 0.35 : 1);
      const vx = Math.cos(r.theta) * speed;
      const vy = Math.sin(r.theta) * speed;
      r.pos = [r.pos[0] + vx * dt, r.pos[1] + vy * dt];
      r.vel = [vx, vy];
      r.status = "moving";
      r.battery = Math.max(0, r.battery - dt * 0.006);
      r.lastUpdate = now;

      const last = r.trail[r.trail.length - 1];
      if (!last || Math.hypot(r.pos[0] - last[0], r.pos[1] - last[1]) > 0.4) {
        r.trail.push(r.pos);
        if (r.trail.length > 60) r.trail.shift();
      }

      if (r.battery < 0.15 && r.goalLabel !== "dock") {
        r.goal = DOCK_POS;
        r.goalLabel = "dock";
        r.taskId = null;
        this.replan(r);
        this.emit("task", `${r.id} battery critical — diverting to dock`, r.id);
      }
    }
  }

  snapshot(): RobotState[] {
    return this.robots.map((r) => ({
      id: r.id,
      pos: r.pos,
      theta: r.theta,
      vel: r.vel,
      battery: r.battery,
      status: r.status,
      taskId: r.taskId,
      path: r.path,
      trail: r.trail,
      lastUpdate: r.lastUpdate,
    }));
  }
}
