---
name: run-app
description: Stand up the Archie dev stack (Studio + Viewer behind the single front door) and drive it in a real browser to confirm it renders. Use this whenever the user says run / launch / start / "stand up" / "boot" the app, wants a screenshot of Studio or the Viewer, or wants to confirm a code change works in the actual running app (not just tests or typecheck). This is the repo's verified launch path — follow it instead of rediscovering the commands.
---

# Run the Archie app

Archie is a browser app, not a CLI or a plain server. "Running" it means the
dev stack is up **and** you have driven at least one surface in a real browser
and looked at the pixels — a 200 response proves the route resolves, not that
the app renders. The two failure modes this skill exists to prevent are
(1) declaring success off an HTTP status without a screenshot, and (2) burning
a session rediscovering the proxy/gen/port topology that's already known below.

## Topology (why there's one command, not three)

`pnpm dev` (→ `scripts/dev.sh`) starts three processes and one URL:

| Process | Port | Serves |
| --- | --- | --- |
| Front door proxy (`scripts/dev-proxy.mjs`) | **5173** | the ONLY URL you open |
| Studio (Vite) | 5174 | `/studio/*` |
| Viewer (Astro) | 4321 | everything else (`/viewer/*`, published tree) |

Single origin is load-bearing, not cosmetic: because Studio and Viewer share
`localhost:5173`, the Viewer's live source reads Studio's OPFS working store —
author in `/studio/`, open `/viewer/`, it's there with no publish step. Always
open **5173**; never open 5174 or 4321 directly (you'd lose that seam and hit
cross-origin behavior the deployed app never has).

## Launch

```bash
pnpm dev > /tmp/archie-dev.log 2>&1 &   # background; front door on :5173
```

Then wait for **both** binds before driving. The front door and Vite come up in
~2 s, but Astro runs a `gen` step (`predev` → `gen-published.mts`) that bakes the
sample tree into `apps/viewer/public/published/` **before** it binds — this is a
few seconds and is not optional (skip-the-wait → the Viewer 404s on a stale or
missing public tree). Poll instead of guessing:

```bash
for p in 5173 4321; do
  for i in $(seq 1 60); do
    (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null && { echo "$p up"; break; }
    sleep 1
  done
done
```

`[eval: both-bound]` Both 5173 and 4321 report up, and the log shows
`Wrote NNN published files → .../public/published` before you drive anything.

Preconditions (check once if launch misbehaves): Node 24 / pnpm 11
(`node -v`, `pnpm -v`); `node_modules` present at root (`pnpm install` if not);
ports 5173/5174/4321 free. See the [Archie dev toolchain] memory for the Node
24 / pnpm 11 baseline.

**inotify watch limit — a real precondition, not a footnote.** Vite watches the
whole monorepo tree (plus the `.svelte.tmp.*` files svelte-check spins up). On a
low default (`cat /proc/sys/fs/inotify/max_user_watches` → `65536` here) it
exhausts the kernel's watch budget *mid-session*: Studio's Vite comes up clean,
runs for minutes, then dies on `ENOSPC: System limit for number of file watchers
reached` (an FSWatcher `error` event nothing catches). `dev.sh` does NOT
supervise its children, so Studio silently vanishes while the front door keeps
answering — the failure looks like the app, and is the OS. Raise it to ≥ 524288
once (persists across reboots, needs sudo):
```bash
echo 'fs.inotify.max_user_watches=524288' | sudo tee /etc/sysctl.d/60-inotify.conf && sudo sysctl --system
```
`[eval: watch-headroom]` `max_user_watches` ≥ 524288 before a long dev session —
below that, Studio is a time bomb, not a launch failure.

## Drive it and look — don't stop at launch

Load both surfaces in a real browser, screenshot each, and **read the
screenshots**. Playwright is a root devDependency; the one non-obvious catch is
Node ESM resolves `import 'playwright'` from the **script file's** directory
upward — a script in `/tmp` throws `ERR_MODULE_NOT_FOUND`. Put the script in the
repo (git-ignore or delete it after), and run `node` from the repo root:

```js
// save as .archie-smoke.mjs IN THE REPO ROOT, then: node .archie-smoke.mjs ; rm .archie-smoke.mjs
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
for (const [url, file] of [
  ['http://localhost:5173/studio/', '/tmp/archie-studio.png'],
  ['http://localhost:5173/viewer/', '/tmp/archie-viewer.png'],
]) {
  const r = await p.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForSelector('body', { timeout: 8000 });
  await p.screenshot({ path: file });
  console.log(`${url}  status=${r.status()}  title=${JSON.stringify(await p.title())}`);
}
console.log('console errors:', errs.length ? errs.slice(0, 8) : 'none');
await b.close();
```

Then `Read` both PNGs. What "up" looks like:

- **Studio** (`title="Archie Studio"`): the Library header with an exhibit count
  and a grid of exhibit cards (the seed ships 6 — Voynich folios et al.).
- **Viewer** (`title="The Archie Library"`): the gallery with exhibit cards
  (`assets`, `Archie, Annotated`, `The Rosettes`, …).

A blank frame with a 200 status is a **failure to launch**, not a success —
that's the exact trap this skill guards against.

`[eval: rendered]` Both screenshots show populated content (header + cards),
verified by looking, not by status code.

### Known-benign noise
A single `Failed to load resource: … 400` in the console is expected — one
image/tile/IIIF fetch, not a page break. If every surface still renders, don't
chase it. (Escalate only if content is missing.) The seed loads folios from a
remote IIIF service and users add media by URL, so remote-data directives matter
— see [tauri-csp] for why `img-src`/`connect-src`/`media-src` allow `https:`.

## Verifying a specific change
Driving both front doors proves the stack. To confirm a *change*, also drive the
surface it touches: navigate into the affected exhibit/section/reading, do the
action a user would, and screenshot the result — same "look at the pixels" bar.

## Teardown
```bash
kill %1 2>/dev/null   # graceful: dev.sh's EXIT trap kills its children
```
But if `pnpm dev` was killed abruptly (SIGTERM/SIGKILL, or the harness reaping a
background task on session end), the EXIT trap does NOT reliably cascade to the
grandchild processes — **Vite/Astro/proxy orphan and keep their ports bound**.
Before any relaunch, check the ports and sweep orphans first:
```bash
for p in 5173 5174 4321; do (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null && echo "$p BUSY" || echo "$p free"; done
pkill -f scripts/dev-proxy.mjs; pkill -f 'astro dev'; pkill -f 'apps/studio.*vite'
```
`[eval: ports-clean]` All three ports read free before `pnpm dev` — relaunching
onto a bound port silently gives you the STALE previous process, not your code.

## Troubleshooting: a surface is down but the front door answers

The proxy (5173) and the three servers have independent lifecycles — the front
door happily stays up while a backend child is dead, so a partial failure reads
as a working app until you hit the affected path. Diagnose by *which* backend:

- **`/studio/` → ECONNREFUSED (5174 down), `/viewer/` fine.** Vite crashed after
  starting — do NOT read this as "never launched." Grep the dev log
  (`/tmp/archie-dev.log`) for the cause before relaunching: `ENOSPC` /
  `file watchers reached` is the inotify limit above (raise it, don't just
  restart — it'll die again); a stack trace from `App.svelte.tmp.*` is the same
  thing. Confirm with `(exec 3<>/dev/tcp/127.0.0.1/5174) 2>/dev/null && echo up || echo DOWN`.
- **`/viewer/` broken (4321 down or 404s), `/studio/` fine.** Astro died or the
  `gen` bake didn't finish — check the log for the `Wrote NNN published files`
  line and any `gen-published.mts` throw.
- **Everything ECONNREFUSED including 5173.** The whole `pnpm dev` was reaped
  (see Teardown) — relaunch from clean.

`[eval: diagnose-by-port]` A down surface is diagnosed from the dev log's actual
error, not assumed to be a fresh-launch problem — a crashed child and an
unstarted one look identical from the proxy but need opposite fixes.

## Desktop (Tauri) — different target, not covered here
This skill is the **web dev stack**. The packaged desktop app (Flatpak
`digital.compost.archie`) is a separate build/run path with its own CSP and fs
seam — see the [Tauri/Flatpak desktop target] memory and [tauri-csp] /
[tauri-fs-seam] rules. Don't reach for `pnpm dev` to validate a desktop-only
concern.

## Input / Output Contract

**Requires:**
- Repo root as CWD; Node 24 + pnpm 11; `node_modules` installed.
- Ports 5173 / 5174 / 4321 free.
- `fs.inotify.max_user_watches` ≥ 524288 (else Studio's Vite dies mid-session).
- Bash (background process + `/dev/tcp` poll) and a Playwright-capable browser.

**Produces:**
- A running dev stack reachable at `http://localhost:5173/` (Studio `/studio/`,
  Viewer `/viewer/`), backgrounded with logs at `/tmp/archie-dev.log`.
- Screenshots at `/tmp/archie-studio.png` and `/tmp/archie-viewer.png`, each
  read and confirmed to show rendered content.
- A one-line status per surface (URL · HTTP status · page title) plus the
  console-error list.

<!-- Cross-refs: [tauri-csp], [tauri-fs-seam], [Archie dev toolchain] memory,
     [Tauri/Flatpak desktop target] memory. This skill is the web-run sibling of
     those desktop/CSP rules. -->
