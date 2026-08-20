/**
 * HA Stream Test — subscribes to one or more Home Assistant entities via
 * Magic Frame's SSE stream endpoint and shows live state + a raw event log.
 * Useful for verifying push-based HA updates work, and as a reference
 * implementation for other widgets that want live entity state.
 * Build:  node scripts/build-one.mjs ha-stream-test
 */

interface ManifestField {
    key: string;
    label: string;
    type: "text" | "number" | "boolean" | "color";
    default?: string | number | boolean;
    placeholder?: string;
}

interface Manifest {
    type: string;
    label: string;
    description: string;
    iconEmoji: string;
    version: string;
    author: string;
    fields: ManifestField[];
}

export const manifest: Manifest = {
    type: "ha-stream-test",
    label: "HA Stream Test",
    description: "Diagnostic widget: subscribes to HA entities via SSE and shows live state + event log.",
    iconEmoji: "🛰️",
    version: "1.0.0",
    author: "Stephen Neal",
    fields: [
        { key: "entityIds", label: "Entity IDs (comma-separated)", type: "text", placeholder: "sensor.donetick_last_updated" },
        { key: "maxLogLines", label: "Max log lines", type: "number", default: 20 },
    ],
};

interface SetState<StateValue> {
    (value: StateValue | ((previous: StateValue) => StateValue)): void;
}

interface ModuleCtx {
    createElement: (type: any, props?: any, ...children: any[]) => any;
    useState: <StateValue>(initial: StateValue) => [StateValue, SetState<StateValue>];
    useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
    useRef: <RefValue>(initial: RefValue) => { current: RefValue };
    config: Record<string, any>;
    dashboardId?: string;
    fetch: typeof fetch;
}

interface LogEntry {
    time: string;
    text: string;
}

export default function render(ctx: ModuleCtx) {
    const createElement = ctx.createElement;
    const { useState, useEffect } = ctx;

    const entityIds = (ctx.config.entityIds || "")
        .split(",")
        .map((entityId: string) => entityId.trim())
        .filter(Boolean);
    const maxLogLines = Number(ctx.config.maxLogLines) || 20;

    const [states, setStates] = useState<Record<string, any>>({});
    const [connected, setConnected] = useState(false);
    const [log, setLog] = useState<LogEntry[]>([]);

    function appendLog(text: string) {
        setLog((previous) => [{ time: new Date().toLocaleTimeString(), text }, ...previous].slice(0, maxLogLines));
    }

    useEffect(() => {
        if (entityIds.length === 0) return;
        const streamUrl = `/api/ha/stream?ids=${encodeURIComponent(entityIds.join(","))}`;
        const eventSource = new EventSource(streamUrl);

        eventSource.onopen = () => appendLog("Connection opened");

        eventSource.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === "snapshot") {
                    setStates(payload.states || {});
                    setConnected(!!payload.connected);
                    appendLog(`Snapshot received (connected: ${payload.connected})`);
                } else if (payload.type === "state") {
                    setStates((previous) => ({ ...previous, [payload.entity.entity_id]: payload.entity }));
                    appendLog(`State update: ${payload.entity.entity_id} → ${payload.entity.state}`);
                }
            } catch (err) {
                appendLog(`Parse error: ${String(err)}`);
            }
        };

        eventSource.onerror = () => {
            setConnected(false);
            appendLog("Connection error");
        };

        return () => {
            eventSource.close();
            appendLog("Connection closed");
        };
        // eslint-disable-next-line
    }, [entityIds.join(",")]);

    return createElement(
        "div",
        { className: "w-full h-full overflow-hidden flex flex-col p-[0.7em] text-white gap-[0.5em]" },
        createElement(
            "div",
            { className: "flex items-center gap-[0.5em]" },
            createElement("span", {
                className: "shrink-0 w-[0.7em] h-[0.7em] rounded-full",
                style: { backgroundColor: connected ? "#22c55e" : "#ef4444" },
            }),
            createElement("span", { className: "text-[0.9em] font-bold" }, "HA Stream Test")
        ),
        entityIds.length === 0
            ? createElement("div", { className: "text-[0.8em] opacity-50" }, "No entity IDs configured")
            : createElement(
                "div",
                { className: "flex flex-col gap-[0.3em]" },
                entityIds.map((entityId: string) =>
                    createElement(
                        "div",
                        { key: entityId, className: "text-[0.75em] font-mono bg-white/5 rounded-md p-[0.4em]" },
                        `${entityId}: ${states[entityId]?.state ?? "—"}`
                    )
                )
            ),
        createElement(
            "div",
            { className: "flex-1 overflow-y-auto no-scrollbar text-[0.65em] font-mono opacity-70 flex flex-col gap-[0.15em]" },
            log.map((entry: LogEntry, index: number) =>
                createElement("div", { key: index }, `${entry.time} — ${entry.text}`)
            )
        )
    );
}
