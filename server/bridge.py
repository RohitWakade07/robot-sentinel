#!/usr/bin/env python3
"""
AMR Fleet Bridge (Python variant) — Zenoh/ROS2 <-> WebSocket.

Equivalent to bridge.mjs. Use this one if your robots publish native ROS 2
messages through rmw_zenoh and you want rclpy deserialization.

    pip install eclipse-zenoh websockets
    python bridge.py

Env:
    PORT=8787
    ZENOH_ROUTER=tcp/127.0.0.1:7447
    ROS_NAMESPACE=robot_
    ROBOTS=R1,R2,R3

Bridge -> browser messages:
    {"type":"robot_state","id":"R1","pos":[x,y],"theta":0.0,"vel":[vx,vy],
     "battery":0.82,"status":"moving","task_id":"T42","stamp":1712345678.9}
    {"type":"event","kind":"task","robot_id":"R1","message":"..."}
    {"type":"hello","router":"...","namespace":"robot_","robots":["R1"]}

Browser -> bridge messages:
    {"type":"command","command":"estop|resume|dock|block_chokepoint",
     "robot_id":"R1","value":true}
"""

import asyncio
import json
import math
import os
import time

import websockets

try:
    import zenoh
except ImportError:  # allows running the WS layer without zenoh installed
    zenoh = None

PORT = int(os.environ.get("PORT", "8787"))
ZENOH_ROUTER = os.environ.get("ZENOH_ROUTER", "tcp/127.0.0.1:7447")
NAMESPACE = os.environ.get("ROS_NAMESPACE", "robot_")
ROBOTS = [r.strip() for r in os.environ.get("ROBOTS", "R1,R2,R3").split(",")]
STALE_S = 2.0

clients: set = set()
state: dict[str, dict] = {}
loop: asyncio.AbstractEventLoop | None = None


def yaw_from_quaternion(q: dict) -> float:
    return math.atan2(
        2 * (q["w"] * q["z"] + q["x"] * q["y"]),
        1 - 2 * (q["y"] ** 2 + q["z"] ** 2),
    )


async def broadcast(msg: dict) -> None:
    payload = json.dumps(msg)
    dead = []
    for ws in clients:
        try:
            await ws.send(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)


def robot_id_from_key(key: str) -> str:
    part = key.split("/")[0]
    return "R" + part.replace(NAMESPACE, "")


def upsert(robot_id: str, patch: dict) -> None:
    s = state.setdefault(robot_id, {"id": robot_id})
    s.update(patch)
    s["last_seen"] = time.time()
    msg = {
        "type": "robot_state",
        "id": robot_id,
        "pos": s.get("pos", [0, 0]),
        "theta": s.get("theta", 0.0),
        "vel": s.get("vel", [0, 0]),
        "battery": s.get("battery", 0.0),
        "status": s.get("status", "idle"),
        "task_id": s.get("task_id"),
        "path": s.get("path", []),
        "stamp": time.time(),
    }
    if loop:
        asyncio.run_coroutine_threadsafe(broadcast(msg), loop)


def on_odom(sample) -> None:
    try:
        msg = json.loads(bytes(sample.payload).decode())
    except Exception:
        return  # plug a CDR deserializer in here for rmw_zenoh raw payloads
    pose = msg.get("pose", {}).get("pose", msg)
    p = pose.get("position", {"x": 0, "y": 0})
    q = pose.get("orientation", {"x": 0, "y": 0, "z": 0, "w": 1})
    lin = msg.get("twist", {}).get("twist", {}).get("linear", {"x": 0})
    yaw = yaw_from_quaternion(q)
    upsert(
        robot_id_from_key(str(sample.key_expr)),
        {
            "pos": [p["x"], p["y"]],
            "theta": yaw,
            "vel": [math.cos(yaw) * lin.get("x", 0), math.sin(yaw) * lin.get("x", 0)],
            "status": "moving" if abs(lin.get("x", 0)) > 0.01 else "idle",
        },
    )


def on_battery(sample) -> None:
    try:
        msg = json.loads(bytes(sample.payload).decode())
    except Exception:
        return
    pct = msg.get("percentage", 0.0)
    upsert(robot_id_from_key(str(sample.key_expr)), {"battery": pct / 100 if pct > 1 else pct})


def on_task(sample) -> None:
    try:
        msg = json.loads(bytes(sample.payload).decode())
    except Exception:
        return
    upsert(msg["robot_id"], {"task_id": msg.get("task_id"), "status": msg.get("status", "moving")})
    if loop:
        asyncio.run_coroutine_threadsafe(
            broadcast(
                {
                    "type": "event",
                    "kind": "task",
                    "robot_id": msg["robot_id"],
                    "message": f"{msg.get('task_id')} {msg.get('status')} ({msg['robot_id']})",
                }
            ),
            loop,
        )


async def watchdog() -> None:
    while True:
        now = time.time()
        for rid, s in state.items():
            if now - s.get("last_seen", 0) > STALE_S and not s.get("stale_reported"):
                s["stale_reported"] = True
                await broadcast(
                    {
                        "type": "event",
                        "kind": "stale",
                        "robot_id": rid,
                        "message": f"{rid} telemetry stale (> {STALE_S}s without an update)",
                    }
                )
            elif now - s.get("last_seen", 0) <= STALE_S:
                s["stale_reported"] = False
        await asyncio.sleep(0.5)


async def handler(ws, session=None, publishers=None):
    clients.add(ws)
    await ws.send(
        json.dumps(
            {"type": "hello", "router": ZENOH_ROUTER, "namespace": NAMESPACE, "robots": ROBOTS}
        )
    )
    try:
        async for raw in ws:
            try:
                cmd = json.loads(raw)
            except Exception:
                continue
            if cmd.get("type") != "command":
                continue
            print("[bridge] command", cmd)
            payload = json.dumps(
                {"command": cmd["command"], "value": cmd.get("value", True), "stamp": time.time()}
            )
            rid = cmd.get("robot_id")
            if publishers and rid in publishers:
                publishers[rid].put(payload)
            await broadcast(
                {
                    "type": "event",
                    "kind": "command",
                    "robot_id": rid,
                    "message": f"{cmd['command']} -> {rid or 'fleet'}",
                }
            )
    finally:
        clients.discard(ws)


async def main() -> None:
    global loop
    loop = asyncio.get_running_loop()

    session = None
    publishers = {}
    if zenoh is not None:
        conf = zenoh.Config()
        conf.insert_json5("connect/endpoints", json.dumps([ZENOH_ROUTER]))
        session = zenoh.open(conf)
        session.declare_subscriber(f"{NAMESPACE}*/odom", on_odom)
        session.declare_subscriber(f"{NAMESPACE}*/battery_state", on_battery)
        session.declare_subscriber("fleet/task_status", on_task)
        for rid in ROBOTS:
            n = "".join(ch for ch in rid if ch.isdigit())
            publishers[rid] = session.declare_publisher(f"{NAMESPACE}{n}/fleet_cmd")
        print(f"[bridge] zenoh session open -> {ZENOH_ROUTER}")
    else:
        print("[bridge] eclipse-zenoh not installed; websocket layer only")

    asyncio.create_task(watchdog())
    async with websockets.serve(lambda ws: handler(ws, session, publishers), "0.0.0.0", PORT):
        print(f"[bridge] websocket listening on ws://localhost:{PORT}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
