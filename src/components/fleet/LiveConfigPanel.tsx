import { useState } from "react";
import type { ConnectionStatus, LiveConfig } from "@/lib/fleet/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  config: LiveConfig;
  setConfig: (c: LiveConfig) => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  connection: ConnectionStatus;
}

export function LiveConfigPanel({ config, setConfig, enabled, setEnabled, connection }: Props) {
  const [draft, setDraft] = useState(config);

  const apply = () => {
    setConfig(draft);
    setEnabled(true);
  };

  return (
    <div className="space-y-2 border-b border-border px-4 py-3">
      <p className="hud-label">bridge configuration</p>
      <label className="block">
        <span className="hud-label">websocket bridge url</span>
        <Input
          value={draft.wsUrl}
          onChange={(e) => setDraft({ ...draft, wsUrl: e.target.value })}
          className="mt-1 h-8 font-mono text-xs"
          placeholder="ws://localhost:8787"
        />
      </label>
      <label className="block">
        <span className="hud-label">zenoh router (host/port)</span>
        <Input
          value={draft.zenohRouter}
          onChange={(e) => setDraft({ ...draft, zenohRouter: e.target.value })}
          className="mt-1 h-8 font-mono text-xs"
          placeholder="tcp/127.0.0.1:7447"
        />
      </label>
      <label className="block">
        <span className="hud-label">ros2 topic namespace prefix</span>
        <Input
          value={draft.namespace}
          onChange={(e) => setDraft({ ...draft, namespace: e.target.value })}
          className="mt-1 h-8 font-mono text-xs"
          placeholder="robot_"
        />
      </label>
      <p className="text-[11px] text-muted-foreground">
        Subscribes to <span className="font-mono">/{draft.namespace}N/odom</span>,{" "}
        <span className="font-mono">/battery_state</span>, <span className="font-mono">/cmd_vel</span>,{" "}
        <span className="font-mono">/fleet/task_status</span>.
      </p>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={apply} className="flex-1">
          {enabled ? "Reconnect" : "Connect"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEnabled(false)} disabled={!enabled}>
          Disconnect
        </Button>
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">status: {connection}</p>
    </div>
  );
}
