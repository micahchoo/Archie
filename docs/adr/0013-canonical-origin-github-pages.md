# ADR-0013 — Canonical origin = GitHub Pages, swappable in one place, breakage observable

- **Status:** accepted (2026-06-09, user-confirmed in /grill-with-docs)
- **Context:** Two distinct origins were conflated as "the origin": (a) the **canonical Viewer
  instance** — where `?src=` share links and embed snippets point (ADR-0009; hardcoded in
  `PublishDialog.svelte` + mirror comment in `build-gh-pages.sh`); (b) the **publish base** for
  minted IRIs inside a published exhibit (demo publishes use the `https://archie.demo/`
  placeholder; real deploys pass `PUBLISH_BASE`). Four backlog features (og:image, sitemap,
  IIIF Change Discovery, oEmbed) mint **absolute URLs** and were blocked on naming (a).
- **Decision:** The project's canonical origin is **`https://micahchoo.github.io/Archie/`**
  (Viewer instance at `…/Archie/viewer/`). Chosen over waiting for a custom domain because the
  cost of moving is at its lifetime minimum while there are no users (GOAL §1), and the constant
  already exists in shipped code. Two riders the user attached:
  1. **Swappable in one place.** The origin must live in ONE configuration source consumed by
     everything that mints URLs — Studio share/embed UI, viewer page heads (og:image), sitemap/
     oEmbed/Change Discovery emitters, and `build-gh-pages.sh` — replacing today's
     constant-plus-mirror-comment pattern. Changing domains later = one edit.
  2. **Breakage observable, in code and UI.** Anywhere a minted absolute URL can break when the
     origin moves, the breakage must surface rather than silently 404: the share/embed UI labels
     which origin links are minted against (the durability caveat names the actual host); the
     deployed Viewer compares `window.location.origin` against its built-in canonical origin and
     surfaces a mismatch (the "deployed elsewhere but forgot to update the config" drift case);
     the link-integrity sweep includes minted-origin URLs.
- **Amendment (2026-06-09, grill):** the config source is a checked-in **`archie.config.json`**
  at repo root (`canonicalOrigin`, `viewerPath`, `studioPath`); TS/Astro/Vite import it directly,
  bash reads it via `node -p`. Existing `SITE_BASE`/`PUBLISH_BASE` env vars become deploy-time
  OVERRIDES defaulting from it. Observability shape: the share/embed UI labels the minted host
  from the config; canonical-instance builds bake the expected origin and the running Viewer
  warns (console + quiet topbar badge) on `window.location.origin` mismatch — third-party
  publishes bake no canonical flag and skip the check.
- **Consequences:** og:image (Archie-717d), sitemap (Archie-b4f2), ⑪ Change Discovery, and
  ⑭ oEmbed are unblocked and must all consume the single config source — none may hardcode.
  Old unfurl caches and third-party embeds break on any future domain move (accepted, per the
  ADR-0009 durability posture: Publish of a self-contained tree remains the citation gold path).
  `archie.demo` remains strictly a demo-publish placeholder, never the deploy origin.
