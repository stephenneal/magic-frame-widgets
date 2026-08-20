# magic-frame-widgets

Custom widgets for [Magic Frame](https://github.com/jeremiaa/magic-frame), built using its
[custom module system](https://magicframe.dev/docs/module-development/) (`manifest` + `render(ctx)`,
no JSX, no framework build step beyond the bundler below).

## Structure

```
src/
  <widget-name>/
    widget.ts # manifest + render(ctx) — the widget source

build/
  <widget-name>/
    module.json # extracted manifest
    bundle.js # built, uploadable bundle
```


## Setup

```bash
npm install
```

## Building

Build a single widget by name:

```bash
npm run build -- <widget-name>
```

Build every widget under `src/`:

```bash
npm run build:all
```

Output for each widget lands in `build/<widget-name>/module.json` and `build/<widget-name>/bundle.js`.

## Installing a widget in Magic Frame

Upload the built `module.json` and `bundle.js` for a widget via
**Settings → Modules → Upload module** in the Magic Frame UI. No container restart needed —
modules are hot-loaded.

## Widgets

| Widget | Description |
|---|---|
| `donetick` | Live task list from [Donetick](https://donetick.com), with assignee, priority colour, and complete action. |
| `hooktest` | Minimal widget used to isolate a React hooks bug in Magic Frame's custom-module renderer ([jeremiaa/magic-frame#87](https://github.com/jeremiaa/magic-frame/issues/87)). |

## Notes

- Widgets use `ctx.createElement`/`ctx.useState`/`ctx.useEffect`/etc. — no `import React` (see
  [module-development.md](https://github.com/jeremiaa/magic-frame/blob/main/docs/module-development.md)
  for why).
- `build/` is gitignored — build output is disposable and regenerated from source.
