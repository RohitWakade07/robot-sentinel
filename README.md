# Fleet Command Hub

Build a fleet management dashboard for warehouse AMRs (autonomous mobile robots) with two operating modes: a Simulation Mode (self-contained, runs entirely in-browser) and a Real-Time Mode (connects to actual ROS2 robots via a Zenoh bridge). Same UI shell for both — only the data source changes.

Mode switcher

A toggle in the top bar: Simulation / Live Fleet. Switching modes swaps the data layer but keeps the map, sidebar, and inspector identical. In Live mode, show a connection status indicator (connected / reconnecting / offline) and the Zenoh router endpoint being used.

Architecture (be explicit about this so it's buildable, not just mocked)

Frontend: React app, dark-themed fleet dashboard (see UI spec below).

Simulation Mode: physics/task-assignment loop runs client-side (requestAnimationFrame), generating synthetic robot poses, battery, status, and task events — no backend needed.

Real-Time Mode: the browser cannot speak Zenoh/DDS directly, so it needs a small bridge service:

A lightweight backend (Node.js or Python) running zenoh-py/zenoh-node or rmw_zenoh that subscribes to the robots' ROS2 topics (e.g. /robot_1/odom, /robot_1/battery_state, /robot_1/cmd_vel, /fleet/task_status, /tf) published over Zenoh (either native Zenoh pub/sub or ROS2 nodes using rmw_zenoh_cpp as the RMW implementation).

The bridge re-publishes this data to the frontend over a WebSocket (JSON messages: robot pose, velocity, battery %, status, task assignment) and accepts commands back the same way (pause/resume a robot, send it to dock, block a chokepoint).

Document this bridge as a separate /server service with a clear message schema, e.g.:

json

{ "type": "robot_state", "id": "R1", "pos": [x,y], "theta": 0.0, "vel": [vx,vy], "battery": 0.82, "status": "moving", "task_id": "T42" }

Include a config panel (Live mode only) for the Zenoh router address/port and which ROS2 topic namespace/prefix to subscribe under per robot.

Keep the frontend data model mode-agnostic: one RobotState interface consumed by the map/table/inspector regardless of whether it came from the sim loop or the WebSocket feed.

UI (applies to both modes)

Full-screen dark UI — near-black background, slate-blue panels, cyan for paths/comms, amber for yielding/caution, green for charging, red for blocked/collision/offline.

Map (left, ~70%): top-down 2D warehouse — aisles, shelf blocks, charge dock, chokepoints. Robots as colored circles with heading arrow + ID, with a short trail. Toggle overlays: planned paths, comm range, collision-avoidance cones (selected robot), robot IDs, nav graph.

Sidebar (right, ~30%): Fleet Status table — ID, Status pill (moving/idle/yielding/charging/offline), Battery bar, Speed, Task, and in Live mode a last-heartbeat / staleness column (flag a robot red if no update in >2s).

Inspector: click a robot for its path, velocity vector, and local avoidance geometry; in Live mode this reflects the real published odometry/velocity, not a simulated one.

Bottom toolbar: run/pause (Simulation only), speed multiplier (Simulation only), fleet size selector (Simulation only, 2–8 robots), chokepoint block toggle. In Live mode, replace run/pause with per-robot "e-stop"/"resume" commands sent through the bridge.

Event log (collapsible): task assignments, dock arrivals, blocked aisles, and in Live mode connection/reconnection events and stale-data warnings.

Behavior requirements

Simulation Mode should visibly yield and resume near other robots — never freeze indefinitely; a "yielding" badge should only show while actively re-routing.

Live Mode must handle disconnects gracefully: keep last-known poses visible but dimmed/marked stale, auto-reconnect the WebSocket, and never crash the map if a robot's topic goes silent.

Don't fabricate live telemetry — if Live mode isn't connected, show an empty/"waiting for connection" state, not fake numbers.

This should be built as a real, working app: a React frontend plus a documented lightweight Node/Python bridge service and message schema for the ROS2/Zenoh side, not just a static mockup.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://robot-sentinel.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/709fdb3f-5c63-4733-9aaa-f10a64d22a65).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
