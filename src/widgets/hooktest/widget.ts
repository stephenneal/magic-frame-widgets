/**
 * Hook Test — minimal widget used to verify React hooks work correctly in
 * Magic Frame's custom-module renderer (was used to isolate/confirm the fix
 * for jeremiaa/magic-frame#87).
 * Build:  node scripts/build-one.mjs hooktest
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
    type: "hook-test",
    label: "Hook Test",
    description: "Minimal hook test",
    iconEmoji: "🧪",
    version: "1.0.0",
    author: "Stephen Neal",
    fields: [],
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

export default function render(ctx: ModuleCtx) {
    const createElement = ctx.createElement;
    const [count, setCount] = ctx.useState(0);

    function updateCount() {
        const newCount = count + 1;
        console.log("update count", count, newCount);
        setCount(newCount);
    }

    return createElement(
        "div",
        { className: "w-full h-full flex flex-col items-center justify-center gap-[0.3em]" },
        createElement("div", { className: "text-[1.4em]" }, `Count: ${count}`),
        createElement("button", { onClick: updateCount }, "Increment")
    );
}
