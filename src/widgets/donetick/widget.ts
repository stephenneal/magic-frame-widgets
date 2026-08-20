/**
 * Donetick Tasks — live task list with assignee names, actionable-state
 * colours, and a tap-to-complete flow that records who completed each task.
 * Can refresh on a fixed interval, or reactively when a chosen Home Assistant
 * entity changes state (via Magic Frame's SSE entity stream).
 *
 * Styling note: arbitrary-value Tailwind classes (e.g. `px-[1.4em]`,
 * `w-[3.2em]`, `text-[0.8em]`) are unreliable here — Magic Frame's Tailwind
 * build only scans its own source tree, not these widget files, so a
 * bracket-value class only works if that exact class string already happens
 * to be generated elsewhere in the app. ALL sizing, spacing, and font-size
 * values in this file use inline `style` instead. Plain utility classes
 * (`flex`, `rounded-full`, `border-white/10`, standard colour classes like
 * `bg-emerald-500`, the default spacing scale like `mt-2`) are fine, since
 * they're not arbitrary values. True `:hover` pseudo-class effects also
 * can't be expressed via inline `style` — toggle via
 * `onMouseEnter`/`onMouseLeave` state instead.
 *
 * Build:  node scripts/build-one.mjs donetick
 */

import type { Manifest, ModuleCtx } from "../../lib/module-ctx";
import { useDonetickTasks } from "../../hooks/useDonetickTasks";
import { useCompleteDonetickTask } from "../../hooks/useCompleteDonetickTask";
import { useHomeAssistantEntityStream } from "../../hooks/useHomeAssistantEntityStream";
import type { Task, TaskActionableState, TaskCompletionDate } from "../../lib/donetick-api";

const DEFAULT_DONE_COLOUR = "#999999";
const DEFAULT_NOW_COLOUR = "#22c55e";
const DEFAULT_NEAR_FUTURE_COLOUR = "#f97316";
const DEFAULT_FUTURE_COLOUR = "#ef4444";
const DEFAULT_OVERDUE_ALERT_COLOUR = "#ef4444";

/**
 * Widget metadata and configurable fields, read by Magic Frame to render
 * the settings/inspector panel and register this module.
 */
export const manifest: Manifest = {
    type: "donetick-tasks",
    label: "Donetick Tasks",
    description: "Live task list from Donetick with assignee, actionable-state colours, and tap-to-complete with attribution.",
    iconEmoji: "✅",
    version: "1.0.0",
    author: "Stephen Neal",
    fields: [
        { key: "title", label: "Title", type: "text", default: "Tasks" },
        { key: "apiUrl", label: "Donetick API URL", type: "text", placeholder: "http://192.168.20.10:2021" },
        { key: "apiKey", label: "Donetick API Key", type: "text", placeholder: "secretkey value" },
        { key: "assigneeFilter", label: "Filter by assignee (display name)", type: "text", placeholder: "leave empty for all" },
        { key: "usePanel", label: "Wrap in panel", type: "boolean", default: false },
        { key: "cardOpacity", label: "Panel opacity (0-100)", type: "number", default: 40 },
        { key: "nowColor", label: "Open task colour", type: "color", default: DEFAULT_NOW_COLOUR },
        { key: "nearFutureColor", label: "Opens later today colour", type: "color", default: DEFAULT_NEAR_FUTURE_COLOUR },
        { key: "futureDayColor", label: "Opens on a future day colour", type: "color", default: DEFAULT_FUTURE_COLOUR },
        { key: "anytimeColor", label: "Anytime task colour (no due date)", type: "color", default: DEFAULT_NOW_COLOUR },
        { key: "overdueColor", label: "Overdue task colour", type: "color", default: DEFAULT_NOW_COLOUR },
        { key: "overdueAlertColor", label: "Overdue alert colour", type: "color", default: DEFAULT_OVERDUE_ALERT_COLOUR },
        { key: "doneColor", label: "Completed task colour", type: "color", default: DEFAULT_DONE_COLOUR },
        { key: "completeButtonColor", label: "Complete button colour", type: "color", default: DEFAULT_NOW_COLOUR },
        { key: "useHaSensorRefresh", label: "Use Home Assistant sensor", type: "boolean", default: false },
        { key: "haRefreshSensor", label: "Home Assistant sensor (entity ID)", type: "text", placeholder: "sensor.donetick_task_list" },
        { key: "pollSeconds", label: "Poll interval seconds (when not using an HA sensor)", type: "number", default: 15 },
    ],
};

/**
 * Renders the Donetick task list. Uses {@link useDonetickTasks} to fetch and
 * map chores into displayable tasks, {@link useCompleteDonetickTask} to
 * complete them with attribution, and refreshes either on a fixed interval
 * or reactively when a configured Home Assistant entity changes state.
 */
export default function render(ctx: ModuleCtx) {
    const createElement = ctx.createElement;

    const apiUrl = (ctx.config.apiUrl || "").replace(/\/$/, "");
    const apiKey = ctx.config.apiKey || "";
    const assigneeFilter = (ctx.config.assigneeFilter || "").trim().toLowerCase();
    const title = ctx.config.title || "";
    const cardOpacity = ctx.config.cardOpacity !== undefined ? Number(ctx.config.cardOpacity) : 40;
    const usePanel = ctx.config.usePanel === true;
    const overdueAlertColor = ctx.config.overdueAlertColor || DEFAULT_OVERDUE_ALERT_COLOUR;
    const taskStateColors = {
        anytimeColor: ctx.config.anytimeColor || DEFAULT_NOW_COLOUR,
        doneColor: ctx.config.doneColor || DEFAULT_DONE_COLOUR,
        futureDayColor: ctx.config.futureDayColor || DEFAULT_FUTURE_COLOUR,
        nearFutureColor: ctx.config.nearFutureColor || DEFAULT_NEAR_FUTURE_COLOUR,
        nowColor: ctx.config.nowColor || DEFAULT_NOW_COLOUR,
        overdueColor: ctx.config.overdueColor || DEFAULT_NOW_COLOUR,
    };
    const completeButtonColor = ctx.config.completeButtonColor || DEFAULT_NOW_COLOUR;
    const useHaSensorRefresh = ctx.config.useHaSensorRefresh === true;
    const pollSeconds = Number(ctx.config.pollSeconds) || 15;
    const haRefreshSensor = (ctx.config.haRefreshSensor || "").trim();

    const donetickEnabled = !!apiUrl && !!apiKey;

    const donetickTasksQuery = useDonetickTasks({
        ctx,
        apiUrl,
        apiKey,
        assigneeFilter,
        enabled: donetickEnabled,
        refetchInterval: useHaSensorRefresh ? 0 : pollSeconds * 1000,
    });

    const haStreamEnabled = useHaSensorRefresh && !!haRefreshSensor;
    const haEntityStream = useHomeAssistantEntityStream(
        haRefreshSensor ? [haRefreshSensor] : [],
        haStreamEnabled,
        ctx
    );

    const lastSeenSensorUpdateRef = ctx.useRef<string | null>(null);
    ctx.useEffect(() => {
        if (!haStreamEnabled) return;
        const sensorState = haEntityStream.states[haRefreshSensor];
        if (!sensorState) return;
        const currentUpdateMarker = sensorState.last_updated || sensorState.state;
        if (lastSeenSensorUpdateRef.current !== null && lastSeenSensorUpdateRef.current !== currentUpdateMarker) {
            donetickTasksQuery.refetch();
        }
        lastSeenSensorUpdateRef.current = currentUpdateMarker;
        // eslint-disable-next-line
    }, [haEntityStream.states[haRefreshSensor]?.last_updated, haEntityStream.states[haRefreshSensor]?.state]);

    const [, forceRerenderTick] = ctx.useState(0);
    ctx.useEffect(() => {
        const nextTransition = getNextTransitionTime(donetickTasksQuery.tasks);
        if (!nextTransition) return;

        const delayMs = Math.max(0, nextTransition.getTime() - Date.now()) + 10_000;
        const timeoutId = setTimeout(() => {
            forceRerenderTick((tick) => tick + 1);
        }, delayMs);

        return () => clearTimeout(timeoutId);
    }, [donetickTasksQuery.tasks]);

    const completeMutation = useCompleteDonetickTask({ ctx, apiUrl, apiKey });

    const completedAtRef = ctx.useRef<Map<number, number>>(new Map());
    const COMPLETE_GRACE_MS = 4000;

    const [expandedTaskId, setExpandedTaskId] = ctx.useState<number | null>(null);
    const [selectedCompleterId, setSelectedCompleterId] = ctx.useState<number | null>(null);
    const [completeErrorByTaskId, setCompleteErrorByTaskId] = ctx.useState<Record<number, string>>({});
    const [cancelHoveredTaskId, setCancelHoveredTaskId] = ctx.useState<number | null>(null);

    function openCompletionFor(task: Task) {
        if (expandedTaskId === task.id) {
            setExpandedTaskId(null);
            setSelectedCompleterId(null);
            return;
        }
        setExpandedTaskId(task.id);
        setSelectedCompleterId(task.assignees.length === 1 ? task.assignees[0].userId : null);
        setCompleteErrorByTaskId((previous) => {
            const next = { ...previous };
            delete next[task.id];
            return next;
        });
    }

    function closeCompletionPanel(taskId: number) {
        setExpandedTaskId(null);
        setSelectedCompleterId(null);
        setCompleteErrorByTaskId((previous) => {
            const next = { ...previous };
            delete next[taskId];
            return next;
        });
    }

    async function completeTask(taskId: number, completedByUserId: number) {
        completedAtRef.current.set(taskId, Date.now());
        setCompleteErrorByTaskId((previous) => {
            const next = { ...previous };
            delete next[taskId];
            return next;
        });
        try {
            await completeMutation.mutate({ taskId, completedByUserId });
            setExpandedTaskId(null);
            setSelectedCompleterId(null);
        } catch (err) {
            completedAtRef.current.delete(taskId);
            setCompleteErrorByTaskId((previous) => ({
                ...previous,
                [taskId]: String(err && (err as Error).message ? (err as Error).message : err),
            }));
        }
    }

    const tasksWithLocalCompletion: Task[] = (donetickTasksQuery.tasks || []).map((task) => {
        const completedAt = completedAtRef.current.get(task.id);
        if (completedAt && Date.now() - completedAt < COMPLETE_GRACE_MS) {
            return { ...task, actionableState: "done" };
        }
        if (completedAt) completedAtRef.current.delete(task.id);
        return task;
    });

    function dueParts(completionDate: TaskCompletionDate | null): { month: string; day: number } | null {
        if (!completionDate) return null;
        return {
            month: completionDate.due.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
            day: completionDate.due.getDate(),
        };
    }

    const renderCompletionPanel = (task: Task) => {
        const rowError = completeErrorByTaskId[task.id];
        const isCancelHovered = cancelHoveredTaskId === task.id;
        const color = actionableStateColor(task.actionableState, taskStateColors);

        return createElement(
            "div",
            {
                className: "border-t border-white/10 flex flex-col",
                style: {
                    marginTop: "0.6em",
                    paddingTop: "0.6em",
                    gap: "0.5em",
                },
                onClick: (event: any) => event.stopPropagation(),
            },
            createElement(
                "div",
                {
                    className: "flex flex-col",
                    style: {
                        paddingTop: "0.6em",
                        gap: "0.4em",
                    },
                },
                task.assignees.map((assignee) =>
                    createElement(
                        "button",
                        {
                            key: assignee.userId,
                            onClick: () => setSelectedCompleterId(assignee.userId),
                            className:
                                "flex items-center justify-between w-full text-left cursor-pointer" +
                                (selectedCompleterId === assignee.userId
                                    ? " bg-white/5 text-white font-semibold border border-emerald-500"
                                    : " bg-white/5 text-white/80"),
                            style: {
                                fontSize: "0.85em",
                                paddingLeft: "0.9em",
                                paddingRight: "0.9em",
                                paddingTop: "0.6em",
                                paddingBottom: "0.6em",
                            },
                        },
                        createElement("span", null, assignee.name),
                        selectedCompleterId === assignee.userId &&
                        createElement(
                            "span",
                            { style: { color, fontSize: "1.1em" } },
                            "✓"
                        )
                    )
                )
            ),
            rowError &&
            createElement("div", { className: "text-red-400/90", style: { fontSize: "0.7em" } }, rowError),
            createElement(
                "div",
                {
                    className: "flex items-center justify-between",
                    style: { paddingTop: "0.6em" },
                },
                selectedCompleterId === null
                    ? createElement(
                        "span",
                        { className: "text-white/50 italic", style: { fontSize: "0.8em" } },
                        "Choose a person..."
                    )
                    : createElement(
                        "button",
                        {
                            onClick: () => completeTask(task.id, selectedCompleterId),
                            className: "font-semibold rounded-full text-white cursor-pointer",
                            style: {
                                fontSize: "0.8em",
                                backgroundColor: completeButtonColor,
                                paddingLeft: "1.4em",
                                paddingRight: "1.4em",
                                paddingTop: "0.6em",
                                paddingBottom: "0.6em",
                            },
                        },
                        "Complete task"
                    ),
                createElement(
                    "button",
                    {
                        onClick: () => closeCompletionPanel(task.id),
                        onMouseEnter: () => setCancelHoveredTaskId(task.id),
                        onMouseLeave: () => setCancelHoveredTaskId(null),
                        className: "underline cursor-pointer",
                        style: {
                            padding: "0.6em",
                            fontSize: "0.8em",
                            color: isCancelHovered ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)",
                        },
                    },
                    "Cancel"
                )
            )
        );
    };

    const renderTask = (task: Task) => {
        const taskColor = actionableStateColor(task.actionableState, taskStateColors);
        const parts = dueParts(task.completionDate);
        const dueLabel = formatDueLabel(task);
        const canComplete = isActionableNow(task);
        const isDone = isCompleted(task);
        const isExpanded = expandedTaskId === task.id;

        return createElement(
            "div",
            {
                key: task.id,
                className: "flex flex-col w-full rounded-3xl shrink-0 backdrop-blur-md border border-white/10 shadow-xl",
                style: {
                    padding: "0.6em",
                    marginBottom: "0.6em",
                    backgroundColor: `rgba(0,0,0,${cardOpacity / 100})`,
                    boxShadow: `0 8px 32px ${taskColor}15`,
                    borderLeft: `0.3em solid ${taskColor}`,
                },
            },
            createElement(
                "div",
                {
                    onClick: () => {
                        if (canComplete) openCompletionFor(task);
                    },
                    className: "flex items-center justify-start w-full" + (canComplete ? " cursor-pointer" : ""),
                    style: { gap: "0.8em" },
                },
                createElement(
                    "div",
                    {
                        className: "shrink-0 flex flex-col items-center justify-center relative overflow-hidden border border-white/5",
                        style: {
                            backgroundColor: `rgba(0,0,0,${cardOpacity / 100})`,
                            width: "3.2em",
                            height: "3.2em",
                            borderRadius: "0.8em",
                        },
                    },
                    createElement("div", {
                        className: "absolute inset-0 opacity-20 blur-md",
                        style: { backgroundColor: taskColor },
                    }),
                    parts
                        ? [
                            createElement(
                                "span",
                                {
                                    key: "month",
                                    className: "relative z-10 uppercase tracking-wider opacity-80",
                                    style: { color: taskColor, fontSize: "0.6em" },
                                },
                                parts.month
                            ),
                            createElement(
                                "span",
                                {
                                    key: "day",
                                    className: "relative z-10 font-bold tracking-tight leading-none",
                                    style: { fontSize: "1.4em" },
                                },
                                String(parts.day)
                            ),
                        ]
                        : createElement("span", {
                            className: "relative z-10 rounded-full",
                            style: { backgroundColor: taskColor, width: "0.6em", height: "0.6em" },
                        })
                ),
                createElement(
                    "div",
                    { className: "flex flex-col min-w-0 flex-1" },
                    createElement(
                        "span",
                        {
                            className:
                                "font-bold tracking-tight leading-tight text-ellipsis whitespace-nowrap overflow-hidden" +
                                (isDone ? " line-through" : ""),
                            style: { fontSize: "0.9em" },
                        },
                        task.name
                    ),
                    createElement(
                        "div",
                        { className: "flex items-center justify-between", style: { gap: "0.4em", marginTop: "0.2em" } },
                        createElement(
                            "span",
                            {
                                className: "font-mono tracking-wider uppercase opacity-50",
                                style: { fontSize: "0.7em" },
                            },
                            [task.assignedToLabel, dueLabel].filter(Boolean).join(" · ")
                        ),
                        task.actionableState === "overdue" &&
                        createElement(
                            "span",
                            {
                                className: "shrink-0 rounded-full flex items-center justify-center text-white font-bold",
                                style: {
                                    backgroundColor: overdueAlertColor,
                                    width: "20px",
                                    height: "20px",
                                    fontSize: "12px",
                                    lineHeight: "20px",
                                },
                            },
                            "!"
                        )
                    )
                )
            ),
            isExpanded && renderCompletionPanel(task)
        );
    };

    const outerStyle = usePanel
        ? {
            color: "#fff",
            backgroundColor: `rgba(0,0,0,${cardOpacity / 100})`,
            backdropFilter: "blur(12px)",
        }
        : { color: "#fff" };
    const outerClassName =
        "w-full h-full overflow-hidden relative rounded-3xl flex flex-col" +
        (usePanel ? " backdrop-blur-md border border-white/10 shadow-xl" : "");

    const actionableNowTasks = tasksWithLocalCompletion.filter((task) => isActionableNow(task) || isCompleted(task));
    const actionableInFutureTasks = tasksWithLocalCompletion.filter((task) => isActionableInFuture(task));

    return createElement(
        "div",
        { className: outerClassName, style: outerStyle },
        createElement(
            "div",
            {
                className: "relative flex flex-col w-full h-full overflow-hidden",
                style: usePanel ? { padding: "0.7em" } : { marginTop: "1em" },
            },
            title &&
            createElement(
                "div",
                {
                    className: "font-bold",
                    style: { fontSize: "1.1em", marginBottom: "0.5em", paddingLeft: "0.1em", paddingRight: "0.1em" },
                },
                title
            ),
            donetickTasksQuery.error
                ? createElement(
                    "div",
                    { className: "text-red-400/80 mt-2", style: { fontSize: "0.8em" } },
                    donetickTasksQuery.error
                )
                : createElement(
                    "div",
                    {
                        className: "flex-1 overflow-y-auto no-scrollbar",
                        style: { scrollbarWidth: "none", msOverflowStyle: "none" },
                    },
                    tasksWithLocalCompletion.length === 0
                        ? createElement("div", { className: "opacity-50 mt-2", style: { fontSize: "0.8em" } }, "No tasks")
                        : [...actionableNowTasks.map(renderTask), ...actionableInFutureTasks.map(renderTask)].filter(Boolean)
                )
        )
    );
}

interface TaskStateColour {
    anytimeColor: string;
    doneColor: string;
    futureDayColor: string;
    nearFutureColor: string;
    nowColor: string;
    overdueColor: string;
}

function isCompleted(task: Task) {
    return task.actionableState === "done";
}

function isActionableNow(task: Task) {
    switch (task.actionableState) {
        case "anytime":
        case "now":
        case "overdue":
            return true;
        case "done":
        case "near_future":
        case "future":
            return false;
    }
}

function isActionableInFuture(task: Task) {
    if (task.actionableState === "done") {
        return false;
    }
    return !isActionableNow(task);
}

function actionableStateColor(actionableState: TaskActionableState, colours: TaskStateColour): string {
    switch (actionableState) {
        case "done":
            return colours.doneColor;
        case "anytime":
            return colours.anytimeColor;
        case "now":
            return colours.nowColor;
        case "overdue":
            return colours.overdueColor;
        case "near_future":
            return colours.nearFutureColor;
        case "future":
            return colours.futureDayColor;
    }
}

function formatDueLabel(task: Task): string | null {
    switch (task.actionableState) {
        case "done":
            return "Done";
        case "anytime":
            return null;
        case "now":
            return "Now";
        case "overdue":
        case "near_future":
        case "future":
            return formatCompletionDate(task.actionableState, task.completionDate);
    }
}

// Exists to handle a deficiency in our type system
function formatCompletionDate(actionableState: TaskActionableState, completionDate: TaskCompletionDate | null): string {
    // This should never happen but our type system does not enforce it.
    if (completionDate === null) {
        throw new Error("completionDate is null");
    }
    switch (actionableState) {
        case "overdue":
            return formatOverdueLabel(completionDate);
        case "near_future":
            return formatActionableLaterToday(completionDate);
        case "future":
            return formatActionableAfterToday(completionDate);
        default:
            throw new Error(`Invalid actionable state: ${actionableState}`);
    }
}

function formatOverdueLabel(completionDate: TaskCompletionDate): string {
    const diff = diffDays(completionDate);
    if (diff === 0) return formatOverdueTodayLabel(completionDate);
    if (diff === 1) return "yesterday";
    else if (diff !== null && diff > 5) return "more than 5 days ago";
    else return `${diff} days ago`;
}

function formatOverdueTodayLabel(completionDate: TaskCompletionDate): string {
    const diff = diffHours(completionDate.due);
    if (diff === 0) {
        return "Now";
    }
    return `${diff} hours ago`;
}

function formatActionableLaterToday(completionDate: TaskCompletionDate): string {
    // Show the earliest completion time to encourage completion at the earliest opportunity.
    const earliestTime = formatTimeOfDay(completionDate.earliest);
    return `${earliestTime} today`;
}

function formatActionableAfterToday(completionDate: TaskCompletionDate): string {
    const diff = diffDays(completionDate);
    if (diff === -1) return "Tomorrow";
    return `in ${Math.abs(diff)} days`;
}

function formatTimeOfDay(date: Date): string {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

function diffDays(completionDate: TaskCompletionDate): number {
    const dueDate = completionDate.due;
    const now = new Date();
    return Math.round((startOfDay(now).getTime() - startOfDay(dueDate).getTime()) / 86400000);
}

function diffHours(dueDate: Date): number {
    const now = new Date();
    return Math.round((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60));
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getNextTransitionTime(tasks: Task[]): Date | null {
    const now = Date.now();
    let earliestUpcoming: number | null = null;

    const consider = (candidate: Date) => {
        const candidateMs = candidate.getTime();
        if (candidateMs > now && (earliestUpcoming === null || candidateMs < earliestUpcoming)) {
            earliestUpcoming = candidateMs;
        }
    };

    const nextMidnight = getNextMidnight();
    for (const task of tasks) {
        if (!task.completionDate) continue;
        consider(task.completionDate.earliest);
        consider(task.completionDate.due);
        if (task.actionableState === "overdue" || task.actionableState === "future") {
            consider(nextMidnight);
        }
    }

    return earliestUpcoming !== null ? new Date(earliestUpcoming) : null;
}

function getNextMidnight(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
}
