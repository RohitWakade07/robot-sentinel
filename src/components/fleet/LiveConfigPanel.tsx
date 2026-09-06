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
        <span className="hud-label">mqtt websocket url</span>
        <Input
          value={draft.wsUrl}
          onChange={(e) => setDraft({ ...draft, wsUrl: e.target.value })}
          className="mt-1 h-8 font-mono text-xs"
          placeholder="ws://broker.hivemq.com:8000/mqtt"
        />
      </label>
      <label className="block">
        <span className="hud-label">mqtt broker (backend)</span>
        <Input
          value={draft.zenohRouter}
          onChange={(e) => setDraft({ ...draft, zenohRouter: e.target.value })}
          className="mt-1 h-8 font-mono text-xs"
          placeholder="broker.hivemq.com:1883"
        />
      </label>
      <label className="block">
        <span className="hud-label">mqtt telemetry topic</span>
        <Input
          value={draft.namespace}
          onChange={(e) => setDraft({ ...draft, namespace: e.target.value })}
          className="mt-1 h-8 font-mono text-xs"
          placeholder="eyrc/holo_battalion/telemetry"
        />
      </label>
      <p className="text-[11px] text-muted-foreground">
        Connects via <span className="font-mono">HiveMQ</span> to receive live dashboard data.
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
