import type { ModuleCtx } from "../lib/module-ctx";

/** Lifecycle status of a `useQuery` call. */
export type QueryStatus = "pending" | "error" | "success";

/** Options accepted by {@link useQuery}. */
export interface UseQueryOptions<QueryFnData, MappedData = QueryFnData> {
    /** Async function that fetches and returns the raw data. */
    queryFn: () => Promise<QueryFnData>;
    /** Optional transform applied to the raw data before it's returned as `data`. */
    select?: (data: QueryFnData) => MappedData;
    /** When `false`, the query never runs (no initial fetch, no polling). Defaults to `true`. */
    enabled?: boolean;
    /** Polling interval in milliseconds. `0` (default) disables polling. */
    refetchInterval?: number;
    /** The widget's {@link ModuleCtx}, used to access hooks. */
    ctx: ModuleCtx;
}

/** Return value of {@link useQuery}. */
export interface UseQueryResult<MappedData> {
    /** The most recently fetched (and mapped) data, or `undefined` before the first success. */
    data: MappedData | undefined;
    /** The most recent error message, or `null` if the last fetch succeeded. */
    error: string | null;
    /** Current lifecycle status. */
    status: QueryStatus;
    /** `true` only before the very first fetch has resolved. */
    isLoading: boolean;
    /** `true` while any fetch (including background/polling fetches) is in flight. */
    isFetching: boolean;
    /** Convenience alias for `status === "error"`. */
    isError: boolean;
    /** Convenience alias for `status === "success"`. */
    isSuccess: boolean;
    /** Triggers an immediate fetch, outside the normal polling schedule. */
    refetch: () => void;
}

/**
 * A small React-Query-inspired data-fetching hook for Magic Frame custom
 * modules: runs `queryFn` on mount (when `enabled`), optionally polls on an
 * interval, and exposes loading/error state plus a manual `refetch`.
 */
export function useQuery<QueryFnData, MappedData = QueryFnData>(
    options: UseQueryOptions<QueryFnData, MappedData>
): UseQueryResult<MappedData> {
    const enabled = options.enabled !== false;
    const refetchInterval = options.refetchInterval ?? 0;

    const [data, setData] = options.ctx.useState<MappedData | undefined>(undefined);
    const [error, setError] = options.ctx.useState<string | null>(null);
    const [status, setStatus] = options.ctx.useState<QueryStatus>("pending");
    const [isFetching, setIsFetching] = options.ctx.useState(false);
    const reloadTimeoutRef = options.ctx.useRef<ReturnType<typeof setTimeout> | null>(null);

    async function runQuery(isBackground: boolean) {
        if (!enabled) return;
        if (isBackground) setIsFetching(true);
        try {
            const queryFnData = await options.queryFn();
            const mappedData = options.select ? options.select(queryFnData) : (queryFnData as unknown as MappedData);
            setData(mappedData);
            setStatus("success");
            setError(null);
        } catch (err) {
            setStatus("error");
            setError(String(err && (err as Error).message ? (err as Error).message : err));
        } finally {
            if (isBackground) setIsFetching(false);
        }
    }

    function refetch() {
        if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
        runQuery(true);
    }

    options.ctx.useEffect(() => {
        if (!enabled) return;
        runQuery(false);
        if (refetchInterval > 0) {
            const intervalId = setInterval(() => refetch(), refetchInterval);
            return () => clearInterval(intervalId);
        }
        return undefined;
        // eslint-disable-next-line
    }, [enabled, refetchInterval]);

    return {
        data,
        error,
        status,
        isLoading: status === "pending",
        isFetching,
        isError: status === "error",
        isSuccess: status === "success",
        refetch,
    };
}
