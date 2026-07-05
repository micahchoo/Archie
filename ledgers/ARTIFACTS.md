# ARTIFACTS — tracked-artifact audit (ISSUES.md Issue 3)

Inventory taken 2026-07-05 against `main` @ `8de4a8f`. Deletion sweep adapted to tracked
artifacts, plus the byte-exact NUL fix. Classify everything before touching anything.

| artifact | tracked? | why it exists | class | action | commit | verified |
|---|---|---|---|---|---|---|
| `--output` (repo root, 113 KB) | yes, committed `5d5bf50` | shell-redirect residue — a command's stdout was accidentally redirected into a literal file named `--output` instead of a flag being consumed | accident | `git rm`; add `/--output` to `.gitignore` so the same typo can't recommit it | `d8017be` | verified: `git ls-files -- --output` empty |
| `anti-pattern-report.txt` (repo root, 40 KB, 351 lines) | yes, committed `0c3717e`, last touched `e45f38b` | one-shot dump from an external lint/anti-pattern scan tool; no generator script exists anywhere in this repo (checked `.agents/`, `qa/`, `scripts/` — none produce this format), so it can only drift the moment code changes and can never be regenerated in-repo | accident | `git rm`; add `anti-pattern-report.txt` to `.gitignore` | `df866c8` | verified: `git ls-files anti-pattern-report.txt` empty |
| `dist/` (repo root, 6 files) | yes, committed `c471b93` + sync commit `a656cda` ("publish dist/ at repo root to match the jsDelivr @v1/dist embed URL") | deliberate hand-sync twin of `packages/archie-viewer/dist/`, required because the README's jsDelivr recipe (`README.md:260`) pins `cdn.jsdelivr.net/gh/.../dist/archie-viewer.js` at the **repo root**, not the package subpath | deliberate | keep (no repo-root build step exists to replace it); confirmed byte-identical to `packages/archie-viewer/dist/` today (`diff -rq` → no output); added `scripts/sync-dist.mjs` (+ `pnpm sync-dist` / `pnpm sync-dist:check`) and documented the release rule in ADR-0019 + README so a future `archie-viewer` rebuild can't silently diverge the root copy | `9242d3f` | verified byte-identical pre-fix (`diff -rq`); `pnpm sync-dist:check` passes post-fix |
| `node-compile-cache/` (repo root, untracked) | no | Node/tsc compile cache, disk-only | generated | none — `.gitignore:27` already covers `node-compile-cache/` | n/a | verified: `git ls-files` empty, `.gitignore` line present |
| `v8-compile-cache-1000/` (repo root, untracked) | no | V8 compile cache, PID-scoped, disk-only | generated | none — `.gitignore:28` already covers `v8-compile-cache-*/` | n/a | verified: `git ls-files` empty, `.gitignore` line present |
| `gh-pages-dist/` (repo root, untracked) | no | local output of `scripts/build-gh-pages.sh`, disk-only | generated | none — `.gitignore:15` already covers `gh-pages-dist/` | n/a | verified: `git ls-files` empty, `.gitignore` line present |
| NUL byte in `apps/studio/src/App.svelte` (line 654, byte offset 48001) | yes (part of a tracked source file, not a standalone artifact) | a dedup-key builder in `addPendingNotes` — `` `${p.objectId}\x00${p.comment}` `` — needed a separator character guaranteed not to appear in real data; the author (or a paste) put a **literal raw NUL byte** in the source text instead of writing the JS/TS escape sequence `\0`. Runtime behavior is identical either way, but the raw byte makes grep, ripgrep, `git grep`, and the fff tools treat the entire 2147-line file as binary and silently report zero matches — confirmed as the root cause of every "grep is unreliable in this repo" experience, and independently confirmed by `anti-pattern-report.txt`'s own `[unpaired-resource]` false-positive at the identical byte offset 48001 | accident | byte-exact edit: replace the single raw `0x00` byte with the two ASCII characters `\` `0` (the `\0` escape) — zero behavior change, same runtime string | `c96b787` | verified: `file(1)` now reports text, `git grep`/plain `grep` match inside the file, studio suite green (148/148) |

## Notes

- `node-compile-cache/`, `v8-compile-cache-1000/`, `gh-pages-dist/` are disk clutter but not
  a tracked-artifact problem — left in place; deleting rebuildable local caches is out of this
  loop's scope (nothing to commit, nothing a fresh clone would inherit).
- Zero accident rows remaining is the done-when for this ledger; the deliberate `dist/` row
  now carries its reason and a verifiable sync-check (`pnpm sync-dist:check`).

**Done 2026-07-05.** Zero accident rows remain; the one deliberate row (`dist/`) carries its
reason and a sync-check; the three generated rows are confirmed already `.gitignore`d.
