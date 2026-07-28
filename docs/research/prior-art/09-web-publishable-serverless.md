# Axis 09 — Web-Publishable / Serverless

## Focused question
How do prior-art repos publish to a static host with NO runtime server — folder→static-IIIF generation, GH-Pages/GH-Actions exhibit builds, zip-or-push distribution, and zero-build-on-consumer embeds? (Our model: zip download default OR GitHub OAuth push, CI-regenerated `exhibits.json`, PWA.)

## Sources surveyed
- `IIIF/tiny-iiif` — folder→IIIF generator — opened (y)
- `iiif-demo/biiif` + `BIIIF/biiif-cli` — canonical folder→IIIF builder — opened (y)
- `BIIIF/biiif-deploy` — biiif Vercel/Netlify deploy template — opened (y)
- `juncture` — Vue visual-essay static framework — opened (y)
- `quire` — multi-format static publishing — opened (workflow only, y)
- `BIIIF/canopy-export-2026-01-26` — built static IIIF site export — opened (dir only, y)
- `anvil/docs/PUBLISHING.md` + `anvil/template/.github/` — OUR planned design — opened (y)

## Findings by source

### IIIF/tiny-iiif — folder→IIIF, but server-bound at runtime
- **NOT serverless.** README markets a Docker stack: IIPImage/Cantaloupe image server + NGINX reverse proxy, "1 CPU / 2 GB RAM" — `IIIF/tiny-iiif/README.md:36-49`. COUPLED(Docker/Node-server).
- **Manifest generation is PURE.** `MANIFEST_TEMPLATE`/`IMAGE_ITEM_TEMPLATE` are plain object-builder functions: emit Presentation-3 `Manifest`/`Canvas`/`AnnotationPage` with `ImageService3` body — `IIIF/tiny-iiif/tiny/src/pages/api/_ops/_templates.ts:5-48`. PURE — the only `import.meta.env` dep is one path string; lift the builder, drop the Astro wrapper.
- **Writes happen via Astro API routes** (`src/pages/api/_ops/manifest-*.ts`) running on a Node dev/host server — `IIIF/tiny-iiif/tiny/src/pages/api/_ops/manifest-create.ts`. COUPLED(Astro/Node fs).

### iiif-demo/biiif (+biiif-cli) — the canonical folder→static-IIIF generator
- **Recursive folder→`index.json` tree.** `Directory.read()` globs `_*` canvas dirs + child dirs, classifies collection vs manifest, writes one `index.json` per folder — `iiif-demo/biiif/Directory.ts:55-160,295-301`. COUPLED(Node) — hard deps on `glob-promise`, `path`, `fs` `writeJson`. The *algorithm* (underscore=canvas, `info.yml` metadata, boilerplate-clone-and-fill) is liftable as a pattern but not the code.
- **URL is baked at build time**, not request time — every `id` is `urljoin(this.url.href, …)` — `iiif-demo/biiif/Directory.ts:106,199,268,289`. Genuinely static output (no server needed to *serve* it), but generation needs Node. PURE-output / COUPLED-generator.
- **Build entrypoint** `build(dir, url)` auto-detects `NETLIFY`/`VERCEL` env for the URL — `iiif-demo/biiif/index.ts:19-31`. COUPLED(platform env).

### BIIIF/biiif-deploy — deploy template for biiif
- **Build = `npx biiif collection -u <url>`** as the platform build command; output dir `collection/` served statically — `BIIIF/biiif-deploy/package.json:7`, `BIIIF/biiif-deploy/netlify.toml:10-13`, `vercel.json:3-7`. COUPLED(Netlify/Vercel) — uses `@vercel/static-build`, `netlify dev`; **not GH-Pages**.
- **Distribution = "Use this template" repo + 1-click Deploy buttons** (Vercel/Netlify), images committed to git — `BIIIF/biiif-deploy/README.md:14-37`. Closest prior-art analog to our "template repo" model, but it rebuilds on the platform (Node), not GH-Actions.
- **CORS + cache headers** for cross-origin manifest embeds — `netlify.toml:1-9` (`Access-Control-Allow-Origin = "*"`, `max-age=86400`). PURE pattern (lift to GH-Pages via a `_headers`/meta equivalent).

### juncture — Vue visual-essay, runtime-fetched (no build)
- **Zero-build consumer embed.** `index.html` loads Vue + components from CDN (`jsdelivr`, `cdnjs`); essays are markdown fetched and rendered *in the browser* — `juncture/index.html:1-30`. PURE pattern: zero-build-on-consumer, but client-side rendered (no static HTML per essay → bad SEO/first-paint).
- **Dev/build is netlify-lambda** (`netlify dev`, `netlify-lambda build functions`) — `juncture/package.json` scripts. COUPLED(Netlify functions) — implies *runtime* serverless functions, the opposite of our zero-server goal. `functions/` dir is empty in this checkout (inferred: `juncture/functions`).

### quire — static publishing, GH-Pages capable
- Ships a GH-Actions workflow (`quire/.github/workflows/deploy-ui.yml`) → confirms GH-Pages is a supported target. 11ty/Eleventy SSG (COUPLED(Node build)); multi-format (web/print/pdf) is out-of-axis. inferred: `quire/package.json`.

### BIIIF/canopy-export — a *built* static IIIF site
- Export contains pre-rendered `site/` with `site/iiif/`, `site/works/`, `site/api/` static dirs + `.github/` workflow — `BIIIF/canopy-export-2026-01-26/` (dir listing). Demonstrates SSG→static-IIIF→GH output, but Canopy/Gatsby build is heavy. COUPLED(Gatsby/Node). Study, don't lift.

### anvil (OURS) — the target design, already specified
- **GH-Pages template repo + GH-Actions deploy**, `Source: GitHub Actions` — `anvil/docs/PUBLISHING.md:7-30`.
- **CI regenerates `exhibits.json`** by scanning `exhibits/*/exhibit.json`, jq-merging `{slug}` from dirname — `anvil/template/.github/workflows/scripts/build-manifest.sh:14-24`. PURE (pure bash+jq, no Node, no install). This is our gallery-index generator.
- **Deploy workflow commits regenerated `exhibits.json` then `deploy-pages`** — *no `npm install`, no Vite build*; `editor/` + `reader/` dist are committed pre-built (ADR-0005) — `anvil/template/.github/workflows/deploy.yml:1-48`. This is the zero-build-on-consumer contract done right.
- **Zip is the universal default; OAuth push is a later UX optimization** — `anvil/docs/PUBLISHING.md:88-96`. Three publish paths (GH-Pages / any static host / self-hosted), all consuming the same portable `<slug>.zip` artifact — `PUBLISHING.md:32-46`.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Extraction effort | Maps to our need |
|---|---|---|---|---|---|
| Presentation-3 Manifest/Canvas/AnnotationPage builder (object templates) | `IIIF/tiny-iiif/tiny/src/pages/api/_ops/_templates.ts:5-48` | PURE | one env path string (inline it) | Low — copy 2 fns | Generate our static manifest/`index.json` from project images, no server |
| Gallery-index generator: scan `exhibits/*/exhibit.json` → merge `{slug}` → `exhibits.json` | `anvil/template/.github/workflows/scripts/build-manifest.sh:14-24` | PURE | bash + jq only | None (ours) | The CI-regenerated `exhibits.json` gallery, verbatim |
| GH-Actions deploy w/ committed pre-built dist (no install/build) | `anvil/template/.github/workflows/deploy.yml:1-48` | PURE | GH Actions only | None (ours) | Zero-build-on-consumer GH-Pages deploy |
| Folder→IIIF tree algorithm (underscore=canvas, `info.yml` metadata, boilerplate-fill) | `iiif-demo/biiif/Directory.ts:55-160` | COUPLED(Node) | glob, fs, path | High (rewrite for FSA/browser) | In-browser folder→static-IIIF (must be reimplemented browser-side) |
| Cross-origin embed headers (CORS `*` + cache) | `BIIIF/biiif-deploy/netlify.toml:1-9` | PURE | host header config | Low (translate to GH-Pages) | Let third parties embed our manifests |

## Gaps — what NO surveyed repo solves
1. **In-browser, server-free folder→static-IIIF generation.** Every generator (biiif, tiny-iiif, canopy, quire) is **Node-bound** — runs in a build step or a host server. NONE generate the static manifest/`index.json` *client-side* from a File System Access / OPFS folder. Our PWA model (generate manifest in the browser, then zip or push) has **no prior art** here; the biiif algorithm must be reimplemented against FSA, not lifted.
2. **GitHub OAuth push from a static SPA** (no backend) to commit an exhibit into a GH-Pages repo. biiif-deploy uses platform 1-click buttons; tiny-iiif uses a Node server; anvil itself flags OAuth as *not yet built* (`PUBLISHING.md:90,96`). Zero surveyed code demonstrates browser-only OAuth-device-flow → contents API push.
3. **Static-HTML-per-exhibit with good first-paint.** juncture proves zero-build embeds but is client-rendered (CDN Vue); no surveyed repo produces pre-rendered per-exhibit HTML *without* a heavy SSG (Gatsby/11ty).

## Verdict for our build (lift / study / avoid, and why)
- **LIFT:** anvil's own `build-manifest.sh` + `deploy.yml` (pure bash/jq + committed-dist GH-Actions) — already the cleanest serverless pattern in the survey; nothing external beats it. Lift tiny-iiif's `_templates.ts` Manifest/Canvas builders as a starting object shape for our in-browser generator.
- **STUDY:** biiif `Directory.read()` as the *reference algorithm* (folder classification + `info.yml` metadata merge + per-dir `index.json`) — reimplement against FSA, don't import (Node-coupled). biiif-deploy's CORS/cache headers → translate to GH-Pages.
- **AVOID:** tiny-iiif as a whole (Docker + Cantaloupe + Astro API routes = a runtime server, contradicts PWA/zero-server). juncture's netlify-lambda (runtime serverless functions — opposite of our goal) and its CDN-CSR rendering (poor first-paint). canopy/quire SSG stacks (heavy Node builds for what our committed-dist + jq approach does server-free).
- **Net:** the serverless *deploy/distribution* half is essentially solved by anvil's existing design; the **unsolved frontier is the generation half — doing it in-browser** (Gap 1) and **OAuth push** (Gap 2). No surveyed repo de-risks either; both are net-new build, not lift.
