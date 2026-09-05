# @archie/viewer

Viewer is the read-only site, built with Astro and Svelte islands (ADR-0002 / Q-2).
It reads published W3C Web Annotations and IIIF Presentation 3 manifests.
Its static build needs no application backend.

Viewer uses the shared `@render/svelte`, `@render/mount`, and `@render/core` packages.
Hosted Viewer and the embeddable reader are separate delivery surfaces.

> See [capabilities](../../docs/CAPABILITIES.md) for supported workflows and [verification](../../hubs/verification.md) for the test gates.

## Run it

From the repository root, run:

```bash
pnpm dev
```

Viewer opens at `http://localhost:5173/viewer/`. Studio shares this origin at
`http://localhost:5173/studio/`, so Viewer can read the browser working library.

For Viewer alone or a production build, run:

```bash
pnpm --filter @archie/viewer dev      # http://localhost:4321
pnpm --filter @archie/viewer build
```

The `predev` and `prebuild` hooks generate `public/published/` from the configured
libraries. To generate this tree separately, run:

```bash
pnpm --filter @archie/viewer gen
```

## Reading and navigation

Viewer offers an exhibit gallery, object views, narrative sections, notes, and
media playback. Visitors can open a local `.archie.zip` or read from a source URL.
Source availability determines access to remote media.

A note route has the form `#/<slug>/a/<logical-id>`. Object and section routes
retain the exhibit slug too. Navigation and citation links preserve the active
source. Breadcrumbs let visitors return to the exhibit or library.

## Entry points

| File | Role |
|------|------|
| `src/pages/index.astro` | Viewer landing page |
| `src/pages/[slug].astro` | Generated exhibit pages |
| `src/components/ViewerShell.svelte` | Source loading, routes, and navigation shell |
| `src/components/ExhibitView.svelte` | Exhibit context and reading modes |
| `src/components/Reader.svelte` | Canvas and note reader |
| `src/components/NarrativeReader.svelte` | Narrative layout |
| `src/components/MediaPlayer.svelte` | Audio/video playback and transcript cues |
| `src/published.ts` | Published and working library sources |
| `src/viewer-address.ts` | Addresses that preserve the source |
| `scripts/gen-published.mts` | Static data generation |

The [embeddable reader](../../packages/archie-viewer/) supplies the reader
that portable sites include.
