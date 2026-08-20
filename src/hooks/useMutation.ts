import type { ModuleCtx } from "../lib/module-ctx";

/** Options accepted by {@link useMutation}. */
export interface UseMutationOptions<Variables, Data> {
    /** Performs the mutation and resolves with its result, or throws on failure. */
    mutationFn: (variables: Variables) => Promise<Data>;
    /** The widget's {@link ModuleCtx}, used to access hooks. */
    ctx: ModuleCtx;
}

/** Return value of {@link useMutation}. */
export interface UseMutationResult<Variables, Data> {
    /** Runs the mutation. Resolves with its result, or rejects (also updating `error`) on failure. */
    mutate: (variables: Variables) => Promise<Data>;
    /** Result of the most recent successful mutation. */
    data: Data | undefined;
    /** Message from the most recent failed mutation, or `null`. */
    error: string | null;
    /** `true` while a mutation is in flight. */
    isPending: boolean;
    /** Convenience alias for `error !== null`. */
    isError: boolean;
    /** Convenience alias for having a successful result with no current error. */
    isSuccess: boolean;
    /** Clears `data`/`error`/`isPending` back to their initial state. */
    reset: () => void;
}

/**
 * A small React-Query-inspired mutation hook for Magic Frame custom
 * modules: wraps an imperative async action with pending/error/data state.
 */
export function useMutation<Variables, Data>(
    options: UseMutationOptions<Variables, Data>
): UseMutationResult<Variables, Data> {
    const [data, setData] = options.ctx.useState<Data | undefined>(undefined);
    const [error, setError] = options.ctx.useState<string | null>(null);
    const [isPending, setIsPending] = options.ctx.useState(false);

    async function mutate(variables: Variables): Promise<Data> {
        setIsPending(true);
        setError(null);
        try {
            const result = await options.mutationFn(variables);
            setData(result);
            setIsPending(false);
            return result;
        } catch (err) {
            setError(String(err && (err as Error).message ? (err as Error).message : err));
            setIsPending(false);
            throw err;
        }
    }

    function reset() {
        setData(undefined);
        setError(null);
        setIsPending(false);
    }

    return {
        mutate,
        data,
        error,
        isPending,
        isError: error !== null,
        isSuccess: data !== undefined && error === null,
        reset,
    };
}
