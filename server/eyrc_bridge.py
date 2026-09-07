#!/usr/bin/env python3
import json
import time
import math
import random
import sys

import rclpy
from rclpy.node import Node
from hb_interfaces.msg import Poses2D
from std_msgs.msg import String

import paho.mqtt.client as mqtt

BROKER = "broker.hivemq.com"
PORT = 1883
BASE_TOPIC = "eyrc/holo_battalion/fleet"
ROBOTS = ["R0", "R2", "R4"]

class EYRCBridge(Node):
    def __init__(self):
        super().__init__('eyrc_dashboard_bridge')

        # Setup MQTT Client
        self.mqtt_client = mqtt.Client()
        self.mqtt_client.on_connect = self.on_mqtt_connect

        self.get_logger().info(f"Connecting to MQTT broker at {BROKER}:{PORT}...")
        try:
            self.mqtt_client.connect(BROKER, PORT, 60)
            self.mqtt_client.loop_start()
        except Exception as e:
            self.get_logger().error(f"Failed to connect to MQTT: {e}")

        # Local state storage
        self.robot_states = {
            bot_id: {
                "x": 0.0, "y": 0.0, "heading": 0.0, "velocity": [0.0, 0.0],
                "status": "idle", "battery": 100 - random.randint(0, 20),
                "cpu": random.randint(30, 60), "latency": random.randint(5, 20)
            } for bot_id in ROBOTS
        }

        self.subscription = self.create_subscription(
            Poses2D,
            '/bot_pose',
            self.bot_pose_cb,
            10
        )
        self.get_logger().info('EYRC Bridge subscribed to /bot_pose')

        self.path_sub = self.create_subscription(
            String,
            '/bot_paths',
            self.bot_paths_cb,
            10
        )
        self.bot_paths = {}

        # Publish rich telemetry at 2Hz
        self.telemetry_timer = self.create_timer(0.5, self.publish_telemetry)

    def on_mqtt_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.get_logger().info("Connected to HiveMQ successfully!")
            # Publish a hello message so the dashboard knows we're alive
            hello_msg = {"type": "hello", "router": "hivemq", "namespace": BASE_TOPIC, "robots": ROBOTS}
            self.mqtt_client.publish(f"{BASE_TOPIC}/connection", json.dumps(hello_msg))
        else:
            self.get_logger().error(f"MQTT connection failed with code {rc}")

    def bot_pose_cb(self, msg: Poses2D):
        for pose in msg.poses:
            bot_id = f"R{pose.id}"
            if bot_id not in ROBOTS:
                continue

            dash_x = pose.x / 100.0
            dash_y = pose.y / 100.0

            # Calculate mock velocity based on pos change
            prev = self.robot_states[bot_id]
            vx = (dash_x - prev["x"]) / 0.1 # rough estimate
            vy = (dash_y - prev["y"]) / 0.1
            
            self.robot_states[bot_id].update({
                "x": dash_x,
                "y": dash_y,
                "heading": pose.w,
                "velocity": [vx, vy],
                "status": "moving" if (abs(vx) > 0.1 or abs(vy) > 0.1) else "idle"
            })

            payload = {
                "id": bot_id,
                "x": dash_x,
                "y": dash_y,
                "heading": pose.w,
                "velocity": [vx, vy],
                "status": self.robot_states[bot_id]["status"],
                "stamp": time.time(),
            }
            self.mqtt_client.publish(f"{BASE_TOPIC}/robot_state", json.dumps(payload))

    def bot_paths_cb(self, msg: String):
        try:
            paths = json.loads(msg.data)
            for bot_id, path in paths.items():
                if bot_id in ROBOTS:
                    # Scale path from mm to decimeters for the dashboard ( / 100.0)
                    scaled_path = [[pt[0] / 100.0, pt[1] / 100.0] for pt in path]
                    self.bot_paths[bot_id] = scaled_path
        except Exception as e:
            self.get_logger().error(f"Failed to parse paths: {e}")

    def publish_telemetry(self):
        stamp = time.time()
        moving_count = sum(1 for s in self.robot_states.values() if s["status"] == "moving")

        # 1. Summary
        summary = {
            "total": len(ROBOTS),
            "moving": moving_count,
            "idle": len(ROBOTS) - moving_count,
            "waiting": 0, "charging": 0,
            "active_tasks": moving_count,
            "alerts": 0,
            "stamp": stamp
        }
        self.mqtt_client.publish(f"{BASE_TOPIC}/summary", json.dumps(summary))

        # 2. Environment (Mock obstacles)
        env = {
            "obstacles": [[5.0, 5.0], [10.0, 8.0]],
            "blocked_aisles": [],
            "restricted_areas": [],
            "stamp": stamp
        }
        self.mqtt_client.publish(f"{BASE_TOPIC}/environment", json.dumps(env))

        for bot_id, state in self.robot_states.items():
            # Update varying mock metrics
            state["battery"] = max(5.0, state["battery"] - random.uniform(0.01, 0.05))
            state["cpu"] = max(20, min(90, state["cpu"] + random.randint(-5, 5)))
            state["latency"] = max(2, min(50, state["latency"] + random.randint(-2, 2)))

            # Trajectory
            bot_path = self.bot_paths.get(bot_id, [])
            traj = {
                "id": bot_id,
                "path": bot_path, "waypoint": [state["x"] + 1, state["y"] + 1],
                "destination": [12.0, 12.0], "eta": 15.5, "stamp": stamp
            }
            self.mqtt_client.publish(f"{BASE_TOPIC}/trajectory", json.dumps(traj))

            # Task State
            task = {
                "task_id": f"TASK_{bot_id}",
                "assigned_amr": bot_id,
                "pickup": [2.0, 2.0], "destination": [12.0, 12.0],
                "status": "in_progress" if state["status"] == "moving" else "pending",
                "stamp": stamp
            }
            self.mqtt_client.publish(f"{BASE_TOPIC}/task_state", json.dumps(task))

            # Battery
            batt = {
                "id": bot_id, "percentage": state["battery"],
                "charging": False, "low_battery": state["battery"] < 20, "stamp": stamp
            }
            self.mqtt_client.publish(f"{BASE_TOPIC}/battery", json.dumps(batt))

            # Communication
            comm = {
                "id": bot_id, "p2p_connected": True, "latency_ms": state["latency"],
                "message_age_ms": state["latency"] * 1.5, "connectivity": 100 if state["latency"] < 20 else 80,
                "stamp": stamp
            }
            self.mqtt_client.publish(f"{BASE_TOPIC}/communication", json.dumps(comm))

            # Odom
            odom = {
                "id": bot_id, "actual_pos": [state["x"], state["y"]],
                "commanded_pos": [state["x"] + 0.1, state["y"] + 0.1], "stamp": stamp
            }
            self.mqtt_client.publish(f"{BASE_TOPIC}/odom", json.dumps(odom))

            # Controller State
            ctrl = {
                "id": bot_id, "mode": "auto", "cmd_vel": state["velocity"],
                "actual_vel": state["velocity"], "status": "ok", "stamp": stamp
            }
            self.mqtt_client.publish(f"{BASE_TOPIC}/controller_state", json.dumps(ctrl))

            # Safety State
            safe = {
                "id": bot_id, "collision_risk": "low", "proximity_warning": False,
                "estop": False, "stamp": stamp
            }
            self.mqtt_client.publish(f"{BASE_TOPIC}/safety_state", json.dumps(safe))

            # System Health
            health = {
                "id": bot_id, "lidar": "ok", "imu": "ok", "stm32": "ok",
                "ros2": "ok", "cpu_usage": state["cpu"], "comms": "ok", "stamp": stamp
            }
            self.mqtt_client.publish(f"{BASE_TOPIC}/system_health", json.dumps(health))

            # Random chance for an alert
            if random.random() < 0.005:
                alert = {
                    "id": bot_id, "kind": "blocked", "message": f"{bot_id} encountered an unexpected obstacle.",
                    "recovery": True, "estop": False, "stamp": stamp
                }
                self.mqtt_client.publish(f"{BASE_TOPIC}/alerts", json.dumps(alert))

def main():
    rclpy.init()
    node = EYRCBridge()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.mqtt_client.loop_stop()
        node.mqtt_client.disconnect()
        node.destroy_node()
        rclpy.shutdown()

if __name__ == "__main__":
    main()
