import type { ModuleCtx } from "../lib/module-ctx";
import { useMutation, type UseMutationResult } from "./useMutation";

/** Arguments for completing a Donetick chore. */
export interface CompleteDonetickTaskVariables {
    taskId: number;
    /** The circle member ID to record as having completed the task. */
    completedByUserId: number;
}

/** Options accepted by {@link useCompleteDonetickTask}. */
export interface UseCompleteDonetickTaskOptions {
    ctx: ModuleCtx;
    apiUrl: string;
    apiKey: string;
}

/**
 * Mutation hook for marking a Donetick chore complete, attributing it to a
 * specific circle member via the `completedBy` query parameter. Surfaces
 * Donetick's own error message (e.g. "User is not assigned to chore") when
 * the server rejects the request.
 */
export function useCompleteDonetickTask(
    options: UseCompleteDonetickTaskOptions
): UseMutationResult<CompleteDonetickTaskVariables, void> {
    return useMutation<CompleteDonetickTaskVariables, void>({
        ctx: options.ctx,
        mutationFn: async ({ taskId, completedByUserId }) => {
            const response = await options.ctx.fetch(
                `${options.apiUrl}/eapi/v1/chore/${taskId}/complete?completedBy=${completedByUserId}`,
                { method: "POST", headers: { secretkey: options.apiKey } }
            );
            if (!response.ok) {
                const errorBody = await response.json().catch(() => null);
                const serverMessage = errorBody && typeof errorBody.error === "string" ? errorBody.error : null;
                throw new Error(serverMessage || `complete HTTP ${response.status}`);
            }
        },
    });
}
