import type { ModuleCtx } from "../lib/module-ctx";

/** Options accepted by {@link useMutation}. */
export interface UseMutationOptions<TVariables, TData> {
    /** Performs the mutation and resolves with its result, or throws on failure. */
    mutationFn: (variables: TVariables) => Promise<TData>;
    /** The widget's {@link ModuleCtx}, used to access hooks. */
    ctx: ModuleCtx;
}

/** Return value of {@link useMutation}. */
export interface UseMutationResult<TVariables, TData> {
    /** Runs the mutation. Resolves with its result, or rejects (also updating `error`) on failure. */
    mutate: (variables: TVariables, options?: MutateOptions<TVariables, TData>) => Promise<TData>;
    /** Result of the most recent successful mutation. */
    data: TData | undefined;
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

export interface MutateOptions<
    TVariables = void,
    TData = unknown,
> {
    onError?: (error: string, variables: TVariables) => void
    onSuccess?: (data: TData, variables: TVariables) => void
}

/**
 * A small React-Query-inspired mutation hook for Magic Frame custom
 * modules: wraps an imperative async action with pending/error/data state.
 */
export function useMutation<TVariables = void, TData = unknown>(
    options: UseMutationOptions<TVariables, TData>
): UseMutationResult<TVariables, TData> {
    const [data, setData] = options.ctx.useState<TData | undefined>(undefined);
    const [error, setError] = options.ctx.useState<string | null>(null);
    const [isPending, setIsPending] = options.ctx.useState(false);

    async function mutate(variables: TVariables, mutateOptions?: MutateOptions<TVariables, TData>): Promise<TData> {
        setIsPending(true);
        setError(null);
        try {
            const result = await options.mutationFn(variables);
            setData(result);
            setIsPending(false);
            if (mutateOptions?.onSuccess) {
                mutateOptions.onSuccess(result, variables);
            }
            return result;
        } catch (err) {
            // setError(String(err && (err as Error).message ? (err as Error).message : err));
            setIsPending(false);
            const error = err as Error;
            const errStr = String(err && (err as Error).message ? (err as Error).message : err);
            setError(errStr);
            if (mutateOptions?.onError) {
                mutateOptions.onError(errStr, variables);
            }
            return Promise.reject(err);
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
