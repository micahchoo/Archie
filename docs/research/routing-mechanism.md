# Routing mechanism for Studio's place-addressable navigation

**Resolves:** seeds `Archie-7153` (the mechanism ADR-0024 deliberately deferred).
**Decision:** hand-rolled **hash routing** over a pure `place.ts` module. No router dependency.

Studio needs URLs that name a *place* (library / exhibit overview / object editor — ADR-0024) and
survive refresh + back/forward. It ships to three targets at once, and every one of them punishes the
History API's need for the server to rewrite unknown paths to `index.html`.

## Constraints

| Constraint | What it does to routing |
|---|---|
| Static host — GitHub Pages under `/studio/`, no server rewrites | A History-API deep link (`/studio/voynich/o/o1`) 404s on refresh: GH Pages serves the file at that path or nothing, and has no SPA fallback (only the `404.html` copy-hack). A hash fragment never reaches the server. |
| Base path `/studio/` | Routes must not fight the base. A hash is orthogonal to the pathname, so `pushState(_, "", "#/…")` keeps `/studio/` intact — base-agnostic by construction. |
| Dev front-door proxy `:5173 /studio → :5174` | The proxy forwards paths verbatim; a client-only hash needs nothing from it. History-API routes would need BOTH the proxy AND Vite to fall back to `index.html` for arbitrary depths. |
| Tauri webview — custom protocol, no real server, no address bar | History-API pushes to arbitrary paths are fragile to reload under `tauri://`; a hash reloads cleanly. No address bar means we drive back/forward with Alt+←/→ and restore the last place from `localStorage` — both indifferent to the URL style. |
| Places are personal + local (a Studio URL carries no content; sharing is the viewer's job — ADR-0024) | Pretty URLs have little value here: the URL only has to round-trip on the same machine. The one cosmetic cost of a hash (`#`) buys nothing back to avoid. |

## Options

- **Hash routing, hand-rolled (chosen).** A `#/…` fragment parsed/serialized by a pure module.
  *For:* zero server cooperation; identical code on all three targets; ~60 lines, fully unit-testable;
  reuses the grammar the viewer already speaks (below). *Against:* the visible `#` — irrelevant for a
  local, unshared address; no SSR — irrelevant for an SPA.
- **History API (hand-rolled or via `tinro`/`svelte-routing`).** Clean paths. *Against:* every target
  needs an SPA fallback the static-host constraint makes fragile — a refreshed deep link 404s on GH
  Pages without the `404.html` hack, and needs proxy + webview fallbacks too. Clean URLs are exactly the
  feature we can't cheaply keep here.
- **A router library.** `svelte-spa-router` is itself hash-based and would work, but adds a dependency
  and a route-component DSL to address a **three-shape** tree; `tinro`/`svelte-routing` are History-API
  (same fallback problem). For three places, a pure `place.ts` is lighter, more testable, and matches the
  repo's no-new-deps posture.

## Prior art (cited per repo rule)

The `<archie-viewer>` element already defines a **hash cite-ladder** `target` grammar and resolves it
with **degrade-upward** semantics — ADR-0021 (`#/{slug}` Exhibit, `#/{slug}/o/<id>` Object,
`#/{slug}/a/<id>` Note, `#/{slug}/s/<id>` Section) and its tests (`packages/archie-viewer/src/element.test.ts`:
`#/alpha`, `#/sonic/o/o12`, `#/does-not-exist` → degrade). Studio adopts the same fragment grammar for
its top two rungs (overview = Exhibit, editor = Object) and degrades a deeper viewer rung up to the
overview — so Studio and the viewer share one address vocabulary, and ADR-0024's "the viewer should
eventually mirror place grammar" is satisfied now rather than deferred. `place.ts`'s `resolvePlace`
degrade-to-nearest-surviving-ancestor is the same shape as ADR-0021's degrade-upward.

## Choice

Hand-rolled hash routing. The static-host + base-path + webview trio turns the History API's
server-rewrite requirement into a liability on all three targets, while a hash needs zero server
cooperation and runs one code path everywhere. Places are local-only, so the lone downside (the `#`)
costs nothing. Three route shapes don't earn a router dependency; the logic lives in a pure, tested
`apps/studio/src/place.ts` (parse / serialize / resolve), wired to `history.pushState` + `popstate` /
`hashchange` in `App.svelte`.
