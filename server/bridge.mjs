#!/usr/bin/env node
/**
 * AMR Fleet Bridge — Zenoh/ROS2 <-> WebSocket
 * ------------------------------------------
 * Subscribes to robot telemetry published over Zenoh (either native Zenoh
 * publishers or ROS 2 nodes running rmw_zenoh_cpp) and re-publishes it to the
 * browser dashboard as JSON over WebSocket. Commands from the dashboard are
 * published back onto Zenoh key expressions.
 *
 *   npm install            # ws + @eclipse-zenoh/zenoh-ts
 *   node bridge.mjs
 *
 * Env:
 *   PORT=8787                     WebSocket port for the dashboard
 *   ZENOH_ROUTER=tcp/127.0.0.1:7447
 *   ROS_NAMESPACE=robot_          topic prefix, robots are <prefix>1..N
 *   ROBOTS=R1,R2,R3
 *   DEMO=1                        run without Zenoh (loopback test publisher)
 *
 * Wire schema (bridge -> browser):
 *   { "type":"robot_state","id":"R1","pos":[x,y],"theta":0.0,"vel":[vx,vy],
 *     "battery":0.82,"status":"moving","task_id":"T42","path":[[x,y]],"stamp":1712345678.9 }
 *   { "type":"event","kind":"task|dock|blocked|connection|stale","robot_id":"R1","message":"..." }
 *   { "type":"hello","router":"tcp/127.0.0.1:7447","namespace":"robot_","robots":["R1"] }
 *
 * Wire schema (browser -> bridge):
 *   { "type":"command","command":"estop|resume|dock|block_chokepoint","robot_id":"R1","value":true }
 */

import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 8787);
const ZENOH_ROUTER = process.env.ZENOH_ROUTER ?? "tcp/127.0.0.1:7447";
const NAMESPACE = process.env.ROS_NAMESPACE ?? "robot_";
const ROBOTS = (process.env.ROBOTS ?? "R1,R2,R3").split(",").map((s) => s.trim());
const DEMO = process.env.DEMO === "1";
const STALE_MS = 2000;

/** id -> latest merged state */
const state = new Map();
const clients = new Set();

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

function publishState(id) {
  const s = state.get(id);
  if (!s) return;
  broadcast({
    type: "robot_state",
    id,
    pos: s.pos ?? [0, 0],
    theta: s.theta ?? 0,
    vel: s.vel ?? [0, 0],
    battery: s.battery ?? 0,
    status: s.status ?? "idle",
    task_id: s.task_id ?? null,
    path: s.path ?? [],
    stamp: Date.now() / 1000,
  });
}

function upsert(id, patch) {
  const prev = state.get(id) ?? { id };
  state.set(id, { ...prev, ...patch, lastSeen: Date.now() });
  publishState(id);
}

// ---------------------------------------------------------------------------
// ROS 2 message decoding helpers (CDR payloads coming from rmw_zenoh_cpp).
// If your publishers emit plain JSON over Zenoh, decodeJson is used instead.
// ---------------------------------------------------------------------------
function quaternionToYaw(q) {
  return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
}

function fromOdometry(msg) {
  const p = msg.pose?.pose?.position ?? msg.position ?? { x: 0, y: 0 };
  const q = msg.pose?.pose?.orientation ?? msg.orientation ?? { x: 0, y: 0, z: 0, w: 1 };
  const t = msg.twist?.twist?.linear ?? msg.linear ?? { x: 0, y: 0 };
  const yaw = quaternionToYaw(q);
  return {
    pos: [p.x, p.y],
    theta: yaw,
    vel: [Math.cos(yaw) * (t.x ?? 0), Math.sin(yaw) * (t.x ?? 0)],
  };
}

function fromBattery(msg) {
  if (typeof msg.percentage === "number") {
    return { battery: msg.percentage > 1 ? msg.percentage / 100 : msg.percentage };
  }
  return {};
}

function robotIdFromKey(key) {
  // e.g. "robot_1/odom" -> "R1"
  const m = key.match(new RegExp(`${NAMESPACE}(\\w+)/`));
  return m ? `R${m[1]}` : key.split("/")[0];
}

// ---------------------------------------------------------------------------
// Zenoh session
// ---------------------------------------------------------------------------
async function startZenoh() {
  let zenoh;
  try {
    zenoh = await import("@eclipse-zenoh/zenoh-ts");
  } catch {
    console.warn(
      "[bridge] @eclipse-zenoh/zenoh-ts not installed. Run `npm install` or start with DEMO=1.",
    );
    return null;
  }

  const session = await zenoh.Session.open(
    new zenoh.Config(`{"connect":{"endpoints":["${ZENOH_ROUTER}"]}}`),
  );
  console.log(`[bridge] zenoh session open -> ${ZENOH_ROUTER}`);
  broadcast({ type: "event", kind: "connection", message: `Zenoh session open (${ZENOH_ROUTER})` });

  const parse = (sample) => {
    const text = sample.payload().toString();
    try {
      return JSON.parse(text);
    } catch {
      return null; // CDR payload: plug in your own deserializer here
    }
  };

  await session.declare_subscriber(`${NAMESPACE}*/odom`, (sample) => {
    const msg = parse(sample);
    if (msg) upsert(robotIdFromKey(String(sample.keyexpr())), { ...fromOdometry(msg), status: "moving" });
  });

  await session.declare_subscriber(`${NAMESPACE}*/battery_state`, (sample) => {
    const msg = parse(sample);
    if (msg) upsert(robotIdFromKey(String(sample.keyexpr())), fromBattery(msg));
  });

  await session.declare_subscriber(`${NAMESPACE}*/cmd_vel`, (sample) => {
    const msg = parse(sample);
    if (!msg) return;
    const id = robotIdFromKey(String(sample.keyexpr()));
    const lin = msg.linear?.x ?? 0;
    upsert(id, { status: Math.abs(lin) < 0.01 ? "idle" : "moving" });
  });

  await session.declare_subscriber("fleet/task_status", (sample) => {
    const msg = parse(sample);
    if (!msg) return;
    upsert(msg.robot_id, { task_id: msg.task_id, status: msg.status ?? "moving" });
    broadcast({
      type: "event",
      kind: "task",
      robot_id: msg.robot_id,
      message: `${msg.task_id} ${msg.status} (${msg.robot_id})`,
    });
  });

  const cmdPub = {};
  for (const id of ROBOTS) {
    const n = id.replace(/\D/g, "");
    cmdPub[id] = await session.declare_publisher(`${NAMESPACE}${n}/fleet_cmd`);
  }
  return { session, cmdPub };
}

// ---------------------------------------------------------------------------
// Demo publisher (DEMO=1) — lets you exercise Live mode without real robots.
// ---------------------------------------------------------------------------
function startDemo() {
  console.log("[bridge] DEMO mode: synthesising telemetry (not real robot data)");
  let t = 0;
  setInterval(() => {
    t += 0.1;
    ROBOTS.forEach((id, i) => {
      const r = 6 + i * 2;
      upsert(id, {
        pos: [21 + Math.cos(t / 2 + i) * r, 13 + Math.sin(t / 2 + i) * (r * 0.4)],
        theta: t / 2 + i + Math.PI / 2,
        vel: [Math.cos(t / 2 + i) * 0.9, Math.sin(t / 2 + i) * 0.9],
        battery: Math.max(0.1, 1 - ((t / 200 + i / 10) % 1)),
        status: "moving",
        task_id: `T${100 + i}`,
      });
    });
  }, 100);
}

// ---------------------------------------------------------------------------
// Staleness watchdog
// ---------------------------------------------------------------------------
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of state) {
    if (now - (s.lastSeen ?? 0) > STALE_MS && !s.staleReported) {
      s.staleReported = true;
      broadcast({
        type: "event",
        kind: "stale",
        robot_id: id,
        message: `${id} telemetry stale (> ${STALE_MS} ms without an update)`,
      });
    } else if (now - (s.lastSeen ?? 0) <= STALE_MS) {
      s.staleReported = false;
    }
  }
}, 500);

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------
const zen = DEMO ? null : await startZenoh();
if (DEMO) startDemo();

const wss = new WebSocketServer({ port: PORT });
console.log(`[bridge] websocket listening on ws://localhost:${PORT}`);

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(
    JSON.stringify({
      type: "hello",
      router: ZENOH_ROUTER,
      namespace: NAMESPACE,
      robots: ROBOTS,
    }),
  );
  for (const id of state.keys()) publishState(id);

  ws.on("message", (raw) => {
    let cmd;
    try {
      cmd = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (cmd.type !== "command") return;
    console.log("[bridge] command", cmd);

    const payload = JSON.stringify({
      command: cmd.command,
      value: cmd.value ?? true,
      stamp: Date.now() / 1000,
    });

    if (zen && cmd.robot_id && zen.cmdPub[cmd.robot_id]) {
      zen.cmdPub[cmd.robot_id].put(payload);
    }
    broadcast({
      type: "event",
      kind: "command",
      robot_id: cmd.robot_id,
      message: `${cmd.command} -> ${cmd.robot_id ?? "fleet"}`,
    });
  });

  ws.on("close", () => clients.delete(ws));
});
