import type { ModuleCtx } from "../lib/module-ctx";

/** A Home Assistant entity's state, as delivered over Magic Frame's `/api/ha/stream` SSE endpoint. */
export interface HomeAssistantEntityState {
    entity_id: string;
    state: string;
    last_changed?: string;
    last_updated?: string;
    attributes?: Record<string, unknown>;
}

/** Return value of {@link useHomeAssistantEntityStream}. */
export interface UseHomeAssistantEntityStreamResult {
    /** Latest known state for each subscribed entity, keyed by entity ID. */
    states: Record<string, HomeAssistantEntityState>;
    /** Whether Magic Frame's server currently reports a live connection to Home Assistant. */
    connected: boolean;
}

/**
 * Subscribes to one or more Home Assistant entities via Magic Frame's SSE
 * stream endpoint (`/api/ha/stream`), providing live push-based state
 * updates without polling.
 */
export function useHomeAssistantEntityStream(
    entityIds: string[],
    enabled: boolean,
    ctx: ModuleCtx
): UseHomeAssistantEntityStreamResult {
    const [states, setStates] = ctx.useState<Record<string, HomeAssistantEntityState>>({});
    const [connected, setConnected] = ctx.useState(false);

    ctx.useEffect(() => {
        if (!enabled || entityIds.length === 0) return;

        const streamUrl = `/api/ha/stream?ids=${encodeURIComponent(entityIds.join(","))}`;
        const eventSource = new EventSource(streamUrl);

        eventSource.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === "snapshot") {
                    setStates(payload.states || {});
                    setConnected(!!payload.connected);
                } else if (payload.type === "state") {
                    setStates((previous) => ({ ...previous, [payload.entity.entity_id]: payload.entity }));
                }
            } catch {
                // Malformed event — ignore, next event will self-correct state.
            }
        };

        eventSource.onerror = () => setConnected(false);

        return () => eventSource.close();
        // eslint-disable-next-line
    }, [entityIds.join(","), enabled]);

    return { states, connected };
}
