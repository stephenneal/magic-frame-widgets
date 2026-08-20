/** Where a task currently sits relative to its due/actionable dates. */
export type TaskActionableState = "overdue" | "now" | "near_future" | "future" | "anytime" | "done";

/** A circle member eligible to complete a task. */
export interface Assignee {
    userId: number;
    name: string;
}

/** A Donetick chore, mapped into the shape the widget renders and reasons about. */
export interface Task {
    id: number;
    name: string;
    /** Display label for the task's primary assignment ("Anyone" if unassigned). */
    assignedToLabel: string;
    /** Circle members eligible to mark this task complete. */
    assignees: Assignee[];
    /** The date / time this task is expected to be done / done by. */
    completionDate: TaskCompletionDate | null;
    actionableState: TaskActionableState;
}

export interface TaskCompletionDate {
    due: Date;
    /**
     * Earliest date / time the task can be completed, `null` if no due date.
     * Donetick rejects attempts to complete before.
     */
    earliest: Date;
    // dueDate: string | null;
    // Flag to work around Donetick defaulting time when no explicit time is set.
    hasExplicitDueTime: boolean;
}
