---
paths:
  - "**/package.json"
  - "apps/**/*.ts"
  - "apps/**/*.svelte"
  - "packages/**/*.ts"
  - "packages/**/*.svelte"
  - "**/tsconfig*.json"
tags: [typescript, svelte, toolchain, verification]
priority: high
source: repository scripts and measured gate failures
---
# TypeScript and Svelte checks

The workspace uses `typescript-native` for `.ts` checks and `typescript` for tools that require the JavaScript compiler API.
Use the package scripts to select the compiler. Both packages expose a `tsc` executable, so a bare `tsc` is ambiguous.

When adding a package, use an explicit path to `typescript-native/bin/tsc` in its `typecheck` script.
Keep `typescript` available for Svelte and Astro tooling. Before changing this split, check compatibility with the installed tool versions.
For side-effect asset imports, provide an ambient module declaration when the compiler requires one.

## Choose the gate

| Changed code | Required type check |
| --- | --- |
| `.ts` files | `pnpm typecheck` |
| Studio `.svelte` files | `pnpm --filter @archie/studio run check` |
| Viewer `.svelte` files | `pnpm --filter @archie/viewer run check:svelte` |
| Shared `.svelte` components | Both app Svelte checks |
| Viewer `.astro` files | `pnpm --filter @archie/viewer run check` |

Studio's `tsconfig.svelte-check.json` relaxes `exactOptionalPropertyTypes`. Its Svelte check cannot replace the strict `.ts` gate.
Pass optional properties through conditional spreads when absence differs from `undefined`.
Vitest does not perform type checking. The native compiler does not check Svelte templates.

Keep the app Svelte checks at zero errors and warnings.
When suppressing `state_referenced_locally`, explain why that specific value must remain its initial value.

## Check the result

After changing component props, drive the affected control in a browser. Check that the control appears and its handler runs.
A typed prop can remain absent from `$props()` destructuring despite a successful check.
After changing a generator, regenerate its output and inspect the emitted artifact.
For browser and artifact gates, use [verification](../../hubs/verification.md).

Historical failures and compiler measurements: [archived guidance](../../ledgers/DOCS-agent-guidance-before-2026-09-05.md).
