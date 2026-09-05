# @archie/studio

Studio is the authoring app, built with Svelte and Vite (ADR-0002 / Q-2).
Authors create libraries and exhibits, annotate media, arrange narrative sections,
resolve conflicting edits, and publish or export their work.

Studio uses the shared `@render/svelte`, `@render/mount`, and `@render/core` packages.
The Viewer consumes its published contract.

> See [capabilities](../../docs/CAPABILITIES.md) for supported workflows and [verification](../../hubs/verification.md) for the test gates.

## Run it

From the repository root, run:

```bash
pnpm dev
```

The shared development server opens Studio at `http://localhost:5173/studio/`
and Viewer at `http://localhost:5173/viewer/`. Both apps share browser storage
through this origin.

For Studio alone or a production build, run:

```bash
pnpm --filter @archie/studio dev      # http://localhost:5174/studio/
pnpm --filter @archie/studio build
```

## Entry points

| File | Role |
|------|------|
| `src/App.svelte` | Application shell and navigation |
| `src/LibraryHome.svelte` | Library gallery and exhibit creation |
| `src/ExhibitOverview.svelte` | Object grid, list, selection, and order |
| `src/editor-model.svelte.ts` | Derived editor state |
| `src/AvEditor.svelte` | Audio and video annotation |
| `src/NarrativeEditor.svelte` | Narrative section authoring |
| `src/store.ts`, `src/resident-store.ts` | Working library storage in the browser or native filesystem |
| `src/binding-store.svelte.ts`, `src/binding.ts` | Save destinations and archive bindings |
| `src/Publish.svelte`, `src/publish-machine.svelte.ts` | Site publishing and exports |
| `src/deploy/deploy-flows.svelte.ts` | Desktop GitHub sign-in and deployment |
| `../../packages/render-svelte/src/` | Shared canvas and reader components |

The [user guide](../../docs/guide/README.md) explains the authoring workflow.
The [desktop shell](../../src-tauri/README.md) provides native filesystem access
and GitHub integration.
