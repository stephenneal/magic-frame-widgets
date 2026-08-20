/**
 * A React-style state setter: accepts either a new value or an updater function.
 */
export interface SetState<StateValue> {
    (value: StateValue | ((previous: StateValue) => StateValue)): void;
}

/**
 * The API surface Magic Frame passes into a custom module's `render(ctx)`
 * function. Provides React primitives without requiring `import React` in
 * the module itself (see module-development.md).
 */
export interface ModuleCtx {
    /** React's `createElement`, for building elements without JSX. */
    createElement: (type: any, props?: any, ...children: any[]) => any;
    /** React's `useState`, bound to the host's React instance. */
    useState: <StateValue>(initial: StateValue) => [StateValue, SetState<StateValue>];
    /** React's `useEffect`, bound to the host's React instance. */
    useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
    /** React's `useRef`, bound to the host's React instance. */
    useRef: <RefValue>(initial: RefValue) => { current: RefValue };
    /** The widget instance's current configuration, as filled in by the user. */
    config: Record<string, any>;
    /** The ID of the dashboard/view this widget instance is rendered on, if any. */
    dashboardId?: string;
    /** The browser's `fetch`, for calling APIs (including Magic Frame's own routes). */
    fetch: typeof fetch;
}

/** A single configurable field shown in a widget's settings/inspector panel. */
export interface ManifestField {
    /** Config key this field writes to (accessed via `ctx.config[key]`). */
    key: string;
    /** Label shown above the field in the inspector. */
    label: string;
    /** Input type rendered for this field. */
    type: "text" | "number" | "boolean" | "color";
    /** Default value used when the user hasn't set one. */
    default?: string | number | boolean;
    /** Placeholder text shown in empty text/number fields. */
    placeholder?: string;
}

/**
 * Metadata and configurable fields for a custom module, as required by Magic Frame.
 */
export interface Manifest {
    /** Unique identifier for this module type (auto-prefixed with `custom:` on upload). */
    type: string;
    /** Display name shown in the widget picker. */
    label: string;
    /** Short description shown alongside the label. */
    description: string;
    /** Emoji used as the widget's icon. */
    iconEmoji: string;
    /** Semantic version string for this module. */
    version: string;
    /** Module author's name. */
    author: string;
    /** Configurable fields shown in the widget's settings panel. */
    fields: ManifestField[];
}
