import type { ModuleCtx } from "../lib/module-ctx";
import { useQuery } from "./useQuery";
import {
    type Assignee,
    type Task,
    type TaskActionableState,
    TaskCompletionDate,
} from '../lib/donetick-api';

/** Return value of {@link useDonetickTasks}. */
export interface UseDonetickTasksResult {
    tasks: Task[];
    error: string | null;
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => void;
}

/** Options accepted by {@link useDonetickTasks}. */
export interface UseDonetickTasksOptions {
    ctx: ModuleCtx;
    apiUrl: string;
    apiKey: string;
    /** Lower-cased display name to filter tasks by (matches any eligible assignee). */
    assigneeFilter?: string;
    enabled: boolean;
    refetchInterval: number;
}

/**
 * Fetches chores and circle members from Donetick's eAPI and maps them into
 * displayable {@link Task}s (assignee names, actionable state, eligible
 * completers), refreshing on the given interval.
 */
export function useDonetickTasks(options: UseDonetickTasksOptions): UseDonetickTasksResult {
    const query = useQuery<DonetickApiResponse, Task[]>({
        ctx: options.ctx,
        enabled: options.enabled,
        refetchInterval: options.refetchInterval,
        queryFn: () => fetchDonetickData(options.ctx, options.apiUrl, options.apiKey),
        select: (apiResponse) => mapApiResponseToTasks(apiResponse, options.assigneeFilter),
    });

    return {
        tasks: query.data ?? [],
        error: query.error,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        refetch: query.refetch,
    };
}

// Raw Donetick API shapes — only used within this hook's fetch/mapping.

interface DonetickChoreAssignee {
    userId: number;
}

interface DonetickChore {
    id: number;
    name: string;
    assignedTo: number | null;
    assignees: DonetickChoreAssignee[];
    nextDueDate: string | null;
    completionWindow: number | null;
    isActive: boolean;
    status: number;
}

interface DonetickCircleMember {
    userId: number;
    displayName: string;
    username: string;
}

interface DonetickApiResponse {
    chores: DonetickChore[];
    members: DonetickCircleMember[];
}

async function fetchDonetickData(ctx: ModuleCtx, apiUrl: string, apiKey: string): Promise<DonetickApiResponse> {
    const authHeaders = { secretkey: apiKey };
    const [choresResponse, membersResponse] = await Promise.all([
        ctx.fetch(`${apiUrl}/eapi/v1/chore`, { headers: authHeaders, cache: "no-store" }),
        ctx.fetch(`${apiUrl}/eapi/v1/circle/members`, { headers: authHeaders, cache: "no-store" }),
    ]);
    if (!choresResponse.ok) throw new Error(`chore HTTP ${choresResponse.status}`);
    if (!membersResponse.ok) throw new Error(`members HTTP ${membersResponse.status}`);
    const chores: DonetickChore[] = await choresResponse.json();
    const members: DonetickCircleMember[] = await membersResponse.json();
    return { chores, members };
}

function mapApiResponseToTasks(apiResponse: DonetickApiResponse, assigneeFilter?: string): Task[] {
    const memberNamesById = new Map<number, string>();
    for (const member of apiResponse.members) {
        memberNamesById.set(member.userId, member.displayName || member.username);
    }
    const allMemberIds = apiResponse.members.map((member) => member.userId);

    let tasks: Task[] = apiResponse.chores
        .filter((chore) => chore.isActive)
        .map((chore) => mapChoreToTask(chore, allMemberIds, memberNamesById))
        .sort(taskOrderComparator);

    if (assigneeFilter) {
        tasks = tasks.filter((task) =>
            task.assignees.some((assignee) => (assignee.name || "").toLowerCase() === assigneeFilter)
        );
    }

    return tasks;
}

function mapChoreToTask(chore: DonetickChore, allMemberIds: number[], memberNamesById: Map<number, string>): Task {
    const completionDate = getCompletionDate(chore);
    const actionableState = getActionableState(chore, completionDate);
    const eligibleCompleterIds = getEligibleCompleterIds(chore, allMemberIds);
    const assignees: Assignee[] = eligibleCompleterIds.map((userId) => ({
        userId,
        name: memberNamesById.get(userId) || `User ${userId}`,
    }));

    return {
        id: chore.id,
        name: chore.name,
        assignedToLabel: chore.assignedTo == null ? "Anyone" : memberNamesById.get(chore.assignedTo) || "Anyone",
        assignees: assignees,
        completionDate: completionDate,
        actionableState: actionableState,
    };
}


function getCompletionDate(chore: DonetickChore): TaskCompletionDate | null {
    if (isChoreDone(chore)) return null;
    if (!chore.nextDueDate) return null;

    const choreDueDate = new Date(chore.nextDueDate);
    const hasExplicitTime = !isEndOfDay(choreDueDate);
    const earliestCompletionDate: Date = getEarliestCompletionDate(choreDueDate, chore.completionWindow, hasExplicitTime);
    return {
        due: choreDueDate,
        earliest: earliestCompletionDate,
        hasExplicitDueTime: hasExplicitTime,
    }
}

/**
 * The earliest date / time the task can be completed, applies only when the task has a due date. Replicates the
 * behaviour in Donetick in determining whether a task is allowed to be completed at a given point in time. It
 * honours an explicit `completionWindow` (hours before due date) when set; otherwise, a task with no explicit time
 * (Donetick's end-of-day default) is completable from the start of its due day.
 */
function getEarliestCompletionDate(choreDueDate: Date, completionWindow: number | null, hasExplicitTime: boolean): Date {
    if (completionWindow) {
        const completionWindowMs = completionWindow * 60 * 60 * 1000;
        return new Date(choreDueDate.getTime() - completionWindowMs);
    }
    // For a task with no explicit time set in Donetick (time returned by API is the end of the day), the earliest
    // completion is the start of the day.
    if (!hasExplicitTime) {
        return startOfDay(choreDueDate);
    }
    return choreDueDate;
}

function getActionableState(chore: DonetickChore, completionDate: TaskCompletionDate | null): TaskActionableState {
    if (isChoreDone(chore)) return "done";
    if (!completionDate) return "anytime";

    const now = new Date();
    const isActionableNow = now >= completionDate.earliest;
    if (isActionableNow) {
        return now > completionDate.due ? "overdue" : "now";
    }
    // Actionable state is based on the earliest time the task can be completed.
    return isSameCalendarDay(completionDate.earliest, now) ? "near_future" : "future";
}

/** Resolves which circle member IDs may complete a chore, per its assignment. */
function getEligibleCompleterIds(chore: DonetickChore, allMemberIds: number[]): number[] {
    if (isChoreDone(chore)) return [];
    if (chore.assignedTo === null) return allMemberIds;
    if (chore.assignees.length > 0) return chore.assignees.map((assignee) => assignee.userId);
    return [chore.assignedTo];
}

function isChoreDone(chore: DonetickChore): boolean {
    return chore.status !== 0;
}

function isEndOfDay(date: Date): boolean {
    return date.getHours() === 23 && date.getMinutes() === 59 && date.getSeconds() === 59;
}

function isSameCalendarDay(dateA: Date, dateB: Date): boolean {
    return (
        dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth() &&
        dateA.getDate() === dateB.getDate()
    );
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Sort order for the task list: actionable tasks first (soonest due date
 * first, dateless last within that group), then not-yet-actionable tasks
 * (same date ordering).
 */
function taskOrderComparator(taskA: Task, taskB: Task): number {
    const taskAActionable = isTaskActionable(taskA.actionableState);
    const taskBActionable = isTaskActionable(taskB.actionableState);
    if (taskAActionable && !taskBActionable) return -1;
    if (!taskAActionable && taskBActionable) return 1;

    if (taskA.completionDate && !taskB.completionDate) return -1;
    if (!taskA.completionDate && taskB.completionDate) return 1;
    if (taskA.completionDate && taskB.completionDate) {
        // If due date is the same, prioritise based on earliest completion time.
        const dueDiff = taskA.completionDate.due.getTime() - taskB.completionDate.due.getTime();
        if (dueDiff === 0) {
            return taskA.completionDate.earliest.getTime() - taskB.completionDate.earliest.getTime();
        }
        return dueDiff;
    }
    return 0;
}

/** Whether a task in the given state can be completed right now. */
function isTaskActionable(actionableState: TaskActionableState): boolean {
    return actionableState === "overdue" || actionableState === "now" || actionableState === "anytime";
}
