#!/usr/bin/env python3
import json
import time
import sys

import rclpy
from rclpy.node import Node
from hb_interfaces.msg import Poses2D

import paho.mqtt.client as mqtt

BROKER = "broker.hivemq.com"
PORT = 1883
TOPIC = "eyrc/holo_battalion/telemetry"
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
            
        self.subscription = self.create_subscription(
            Poses2D,
            '/bot_pose',
            self.bot_pose_cb,
            10
        )
        self.get_logger().info('EYRC Bridge subscribed to /bot_pose')
        
    def on_mqtt_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.get_logger().info("Connected to HiveMQ successfully!")
            # Publish a hello message so the dashboard knows we're alive
            hello_msg = {"type": "hello", "router": "hivemq", "namespace": "", "robots": ROBOTS}
            self.mqtt_client.publish(TOPIC, json.dumps(hello_msg))
        else:
            self.get_logger().error(f"MQTT connection failed with code {rc}")

    def bot_pose_cb(self, msg: Poses2D):
        for pose in msg.poses:
            # Map eYRC ID to Dashboard ID
            bot_id = f"R{pose.id}"
            if bot_id not in ROBOTS:
                continue
                
            # Map coordinates:
            # eYRC Arena: 2438.4 x 2438.4
            # Dashboard: w=24.384, h=24.384
            dash_x = pose.x / 100.0
            dash_y = pose.y / 100.0
            
            payload = {
                "type": "robot_state",
                "id": bot_id,
                "pos": [dash_x, dash_y],
                "theta": pose.w,
                "vel": [0, 0], 
                "battery": 1.0,
                "status": "moving",
                "task_id": "active",
                "stamp": time.time(),
            }
            
            self.mqtt_client.publish(TOPIC, json.dumps(payload))

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
