# PERF — FSA real-folder autosave vs OPFS (Archie-b5c2, 2026-07-28)

**Verdict: NO. Web folder-canonical does not need a save-cadence change first.**

A debounced autosave against a real user folder costs a **median 1.2–2.7 ms** (125 samples per
config, 5 independent runs × 25 saves). Studio's debounce is **800 ms**
(`apps/studio/src/exhibit-session.svelte.ts:79`). The per-save constant is **0.15%–0.34%** of the
interval it has to fit inside, and it is within **0.5 ms** of the same flow on OPFS. That is not an
argument for a cadence change; it is not an argument for anything. The cadence question is closed
and the UX decision it was blocking never needs to be made.

## The number

`node scripts/perf/fsafolderrun.mjs`, 5 runs × 25 debounced saves per config. Both the picked
folder and the browser profile that carries OPFS sit on the **same ext4 device**
(`/dev/nvme1n1p2`) — see "the tmpfs trap" below for why that sentence is load-bearing.

| backend | notes | per-run medians (ms) | pooled median | p90 | max | N | first full save |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **real folder** | 10 | 1.20 1.20 1.50 1.20 1.20 | **1.20** | 1.70 | 5.30 | 125 | 6.3 ms |
| **real folder** | 50 | 1.40 1.60 1.40 1.80 1.50 | **1.50** | 1.90 | 2.40 | 125 | 8.3 ms |
| **real folder** | 200 | 2.50 2.60 2.60 2.70 2.90 | **2.70** | 3.80 | 9.00 | 125 | 50.3 ms |
| opfs | 10 | 1.10 1.20 1.40 1.20 1.40 | 1.30 | 1.60 | 1.90 | 125 | 3.3 ms |
| opfs | 50 | 1.30 1.40 1.50 1.60 1.70 | 1.50 | 1.80 | 5.80 | 125 | 9.8 ms |
| opfs | 200 | 2.20 2.30 2.10 2.30 2.20 | 2.20 | 3.20 | 7.90 | 125 | 45.1 ms |
| memory (floor) | 10 | 0.10 ×5 | 0.10 | 0.10 | 0.40 | 125 | 0.3 ms |
| memory (floor) | 50 | 0.20 0.20 0.20 0.20 0.30 | 0.20 | 0.30 | 0.50 | 125 | 0.4 ms |
| memory (floor) | 200 | 0.80 0.80 0.70 0.70 0.80 | 0.80 | 1.10 | 1.40 | 125 | 1.6 ms |

**Real folder ÷ OPFS: 0.92× / 1.00× / 1.23×.** The real-folder penalty is at most ~0.5 ms and at 10
notes it is *negative* — i.e. the two are indistinguishable at this scale, and run-to-run jitter is
larger than the gap. Note the direction that matters: the memory floor is 0.1–0.8 ms, so most of
the 1.2–2.7 ms is JSON projection work that **both** backends pay, not I/O the folder pays alone.

`first full save` is the post-open write of every page — a different event from the steady-state
autosave, measured separately and deliberately excluded from the samples. At 200 notes it is
~50 ms on a real folder against ~45 ms on OPFS; still not a cadence problem, but it is the number
to watch if exhibits ever get an order of magnitude bigger.

## What was measured, and why it is the flow rather than a primitive

The bench drives the **shipped** `AnnotationSession.save()`, not a transcription. One debounced
autosave is one `editNote` coalesced into one `save()`, which is what `scheduleSave`'s 800 ms timer
schedules. That save writes exactly three files (`spine/persist.ts#writeAnnotations`, `only`-gated
at `session/session.ts:312`):

- `heads.json` — whole-log projection, grows with note count
- `history/<logicalId>.json` — the ONE dirty page
- `history/index.json` — whole-log map, written LAST as the commit point

So the per-save cost is three small-JSON round trips, and the ticket's "per-save CONSTANT" framing
is right: what grows with the exhibit is the *size* of two of those three files, not their number.
That is why 200 notes is only ~2× the cost of 10.

**The temp-swap path was actually exercised — proven, not assumed.** Chromium implements FSA
`createWritable()` on a real folder by creating a sibling `<name>.crswap` and renaming it over the
destination on `close()`. Polling the target directory during a run caught **12 distinct
`.crswap` files** (the 10 history pages + `heads.json` + `history/index.json`):

```
+7.4s  CRSWAP  b5c2_10/history/01KYKYACFC4HXXZSKNRMVK9TC7.json.crswap
…
+7.4s  CRSWAP  b5c2_10/heads.json.crswap
+7.4s  CRSWAP  b5c2_10/history/index.json.crswap
```

Without that check the parity result would be indistinguishable from "the bench never wrote to the
folder at all", which is the failure mode this repo keeps meeting.

## The tmpfs trap — the first run was a RAM benchmark

The first five runs used `mkdtempSync(tmpdir())`. **`/tmp` on this machine is tmpfs**, so the
"real folder" was a RAM disk. It reported clean parity with OPFS across all three note counts and
looked entirely healthy. Nothing in the output said the word tmpfs.

Worse, the two halves were not even comparable: OPFS lives in the browser profile, and Playwright
puts that in `/tmp` too, so *both* sides were in RAM. The corrected run pins the target under
`$HOME` and places the profile beside it, so the comparison is same-device by construction, and the
runner now **prints the device of both** in its first three lines:

```
• folder under test: /home/micah/.archie-b5c2-Cue2jj   [/dev/nvme1n1p2 ext4]
• browser profile (carries OPFS): /home/micah/.archie-b5c2-Cue2jj-profile   [/dev/nvme1n1p2 ext4]
```

The verdict did not change — which is exactly why this is worth writing down rather than quietly
fixing. A wrong measurement that happens to agree with the right one is the one nobody re-runs.

## The two blockers this ticket asked to be recorded alongside the number

Both are unchanged by the measurement, and **both are larger obstacles to web folder-canonical than
the write cost is.**

**1. The FSA permission gesture on every session reopen.** `apps/studio/src/folder-backend.ts:57`:

```ts
const handle = await getHandle(key);
if (!handle || (await requestPermission(handle)) !== "granted") return null;
```

A declined handle means **NO store at all**, where OPFS always exists. Tauri is exempt two lines
above ("the key IS the path; native fs needs no permission gesture"). This is a correctness/UX
cliff, not a latency one, and no cadence change addresses it.

The drive found the sharp edge of it empirically: picking the folder is **not** the end of the
flow. Chromium then raises its own readwrite bubble ("Allow this site to edit files?"), which is
browser UI and not page DOM — Playwright can neither see nor click it. On the web lane every
reopen of a bound library sits behind that bubble.

**2. Main-thread `createWritable` vs freecut's `SyncAccessHandle`-in-a-worker.**
`docs/research/freecut-lessons.md` row 10:

> | 10 | Fastest OPFS path = `SyncAccessHandle` in a dedicated worker | `opfs-worker.ts`
> (`createSyncAccessHandle` ×5 sites) | Archie uses async main-thread `createWritable`
> (`fs/fsa.ts:15`) — fine for its small-JSON write profile; revisit only if large AV blobs cause
> jank |

That "fine for its small-JSON write profile" was a judgement call when written. It is now
measured: 1.2–2.7 ms on the main thread per autosave. The revisit condition ("large AV blobs")
is untouched by this ticket — asset bytes do not go through the autosave path.

## Corrections to the ticket's own framing

- The premise correction of 2026-07-27 was right, and the surviving question is now answered
  negatively. `fs/fsa.ts:15` calls `createWritable()` with no options, so `keepExistingData`
  defaults to `false` and there is no copy of the existing file — confirmed against the source
  again here.
- `docs/research/freecut-lessons.md` row 2 cites the debounce at `exhibit-session.svelte.ts:74`
  and the ticket cites `:79`. Both are correct: `:74` is the doc comment, `:79` is the
  `setTimeout(…, 800)`.

## What was NOT measured

- **Only the annotation autosave.** `binding-store.svelte.ts#mirrorToFolder` (the folder mirror
  that runs *after* the OPFS save, and whose first mirror of a session forces a FULL resync) is a
  separate and much larger write. If web folder-canonical removes the OPFS hop, that path changes
  shape entirely and needs its own number.
- **One machine, one disk** (ext4 on NVMe). A spinning disk, a network mount, or a
  fuse/`gvfs` folder could be orders of magnitude slower, and a user's "folder" can be any of
  those. The verdict is safe by ~300× margin at 200 notes, but that margin is not infinite.
- **No contention.** Measured on an otherwise-idle-ish machine; a publish or an ingest running
  concurrently was not simulated.
- **The 1033-tile publish sweep was not run against a real folder** — a different flow, and not
  this ticket's question.

## Reproducing

```
node scripts/perf/fsafolderrun.mjs                     # defaults: 10,50,200 notes × 25 saves
FSA_TARGET=/some/real/folder FSA_SAVES=50 node scripts/perf/fsafolderrun.mjs
```

Needs `Xvfb`, `xdotool`, `xclip`. The runner starts and tears down its own Xvfb. Its header
documents six silent-failure gotchas in the drive — four found here (Wayland ozone override,
xdg-desktop-portal hang, no-WM `windowactivate`, resident `xclip`) and two re-confirmed from
`scripts/desktop-smoke.sh` (inline autocompletion corrupts `xdotool type`; Enter does not commit
the location bar). Every one of them fails by hanging with no message.
