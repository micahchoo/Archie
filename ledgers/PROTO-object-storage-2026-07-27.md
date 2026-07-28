# PROTO: object storage publish (Archie-c85f), 2026-07-27

Branch `proto/object-storage`, base `d15b928`. Prototype for `sd show Archie-c85f`.

## Scope correction — read this before the rest

The brief that spawned this prototype asked the ORIGINAL ticket questions (browser-direct S3 PUT
via presigned URLs vs access keys, Archie-owned incremental sync). **`sd show Archie-c85f` — the
spec, which overrides the brief where they differ — was grilled on 2026-07-26 and the fork was
decided the other way.** Verbatim from the ticket:

> ARCHIE NEVER HANDLES CREDENTIALS, on any platform. ... no S3 client, no keyring entry, no direct
> upload even on desktop where Tauri's native HTTP would have made it easy. Archie writes the folder
> and hands over a copyable command: `rclone sync ./out r2:my-archive`.
>
> CONSEQUENCE 1 — INCREMENTAL SYNC IS NO LONGER OURS. `rclone sync` diffs source against bucket
> itself... What REPLACES it is a sharper constraint: Archie's folder output must be
> BYTE-DETERMINISTIC across publishes, or rclone sees churn and re-uploads gigabytes.

So this ledger answers the CORRECTED questions: does Archie's folder output stay byte-stable across
publishes (so rclone's own diff can skip files), what does rclone actually transfer on a two-publish
sequence, what does the bucket-CORS / marker-ordering risk actually look like under real transfer
tooling, and the cost table (still in scope, for the Archie-c367 destination card).

Direct-PUT mechanism (the brief's Q1) is answered minimally, because the grilling explicitly took it
out of scope — see "§4 — why credentials-in-browser was declined" below for the one measurement kept.

## Mechanism used, honestly

**Real MinIO** (`docker run minio/minio:latest`, S3-compatible, SigV4 auth), not a hand-rolled stub —
docker had network access in this sandbox, confirmed by a successful `docker pull`. Real `rclone`
(`/usr/bin/rclone`, already installed) configured with an `s3`/`Minio` provider remote against it.
Port 19000 (data) / 19001 (console) — fresh, not the shared e2e port; container removed at the end of
the session (`docker rm -f archie-proto-minio`), confirmed via `ss -ltnp` showing the ports clear.

Bootstrap commands (for reproduction):

```sh
docker run -d --name archie-proto-minio -p 19000:9000 -p 19001:9001 \
  -e MINIO_ROOT_USER=archieprobe -e MINIO_ROOT_PASSWORD=archieprobe123 \
  minio/minio server /data --console-address ":9001"

cat > /tmp/rclone.conf <<'EOF'
[archieprobe]
type = s3
provider = Minio
env_auth = false
access_key_id = archieprobe
secret_access_key = archieprobe123
endpoint = http://127.0.0.1:19000
region = us-east-1
EOF
rclone --config /tmp/rclone.conf mkdir archieprobe:archie-test-bucket
```

## §1 — byte-determinism (the constraint that REPLACED "does Archie own the diff")

New code: `packages/render-core/src/publish/delta.ts` (`computeDelta`, pure — no fs) + 6 unit tests in
`delta.test.ts`. Probe: `scripts/probe/object-storage-publish.mts` — publishes a 3-exhibit fixture
(`alpha`/`beta`/`gamma`, remote-image sources, one authored note each on alpha/beta) via
`publishLibrary` into `MemoryFilesystem`, dumps it to a real disk folder (the `collectFiles` +
`writeFileSync` pattern donor-cited from `apps/viewer/scripts/gen-published.mts`), and diffs.

**Run:** `S3_ENDPOINT=... RCLONE_CONFIG=... ARCHIE_PROBE_BUCKET=... pnpm --filter @archie/viewer exec
vite-node scripts/probe/object-storage-publish.mts`

Measured:

| run | files | unchanged | changed | added |
| --- | --- | --- | --- | --- |
| same input, published TWICE | 22 | **22** | 0 | 0 |
| one exhibit (`beta`) gets a second note, republished FULL | 23 | 18 | 4 | 1 |

**Finding: Studio's current publish wiring is already byte-stable.** The ticket flagged
`StaticPageOptions.publishedAt` as a "known violator to check first" (it stamps `datePublished` /
`dateModified` / sitemap `<lastmod>` on every publish, which would bust every file's bytes on every
republish). Checked rather than assumed: `grep -rn publishedAt apps/studio/src/` — **zero hits**.
`STATIC_PAGE_OPTS` in `apps/studio/src/publish-flows.svelte.ts:26` never sets it. `site.ts`'s own
generation-id fallback (`generationHash`, `site.ts:685`) is a pure hash of `exhibitsJson +
imageIndex + publishedAt`, and with `publishedAt` absent that's a hash of content alone — so
`archie.json`'s `generation` field is ALSO stable across a no-op republish. Both halves of the
"known violator" are, today, non-violations. This is worth pinning with a regression test (not done
here — out of prototype scope, flagged as a follow-up below) so a future PR that starts threading
`publishedAt` through doesn't reintroduce full-tree churn silently.

The 4 changed files on a one-note edit are exactly the ones that SHOULD change:
`beta/manifest.json`, `beta/canvas/o1/annotations.json` (the heads page the edited canvas
references), `beta/annotations/history/index.json`, `beta/index.html` (the static archival page,
which inlines note text) — plus 1 **added** file, the new history page for the new record
(`beta/annotations/history/<ulid>.json`). The library-global projections (`collection.json`,
`exhibits.json`, `images.json`, `sitemap.txt`, `sitemap.xml`, root `index.html`, `archie.json`) came
back byte-identical, because the edit didn't touch the library-level title/summary/exhibit list that
feeds them — they're cheap and always rewritten (`site.ts:118`'s own comment), but "always rewritten"
and "always different" are not the same claim, and this run measures the second one directly.

Original fixture bug caught and fixed mid-probe, left in the code as a comment: the notes were first
targeted at the object's raw `source` URL (the shape a couple of render-core unit tests use for their
own narrower purpose). `site.ts`'s heads filter matches by EXACT canvas-IRI equality against the
publish base (`rebaseCanvasId`'s own doc comment: a target minted against a different base "matches
nothing and every note is dropped — silently, with a successful, healthy-looking publish", citing the
real 182-record bug this fixed). Targeting `canvasIdFor(BASE_URL, slug, objId)` directly is what makes
the probe's edit actually land in `canvas/o1/annotations.json` — the first run (wrong target) under-
reported the change set (2 changed instead of 4) and would have been a wrong finding if shipped.

## §2 — what rclone ACTUALLY transfers, on the same two-publish sequence

```
-- sync 1 (full, empty bucket) --
22 files "Copied (new)", 22.812 KiB transferred

-- sync 2 (edited republish, bucket already has publish 1) --
beta/annotations/history/<new-ulid>.json:  Copied (new)
beta/index.html:                            Copied (replaced existing)
beta/manifest.json:                         Copied (replaced existing)
beta/annotations/history/index.json:        Copied (replaced existing)
beta/canvas/o1/annotations.json:            Copied (replaced existing)
[all 17 other files]:                       Updated modification time in destination
7.829 KiB transferred, 5/23 files
```

**5 of 23 files actually transfer their bytes on the second sync — exactly the delta §1 computed**
(1 added + 4 changed). The other 18 get `Updated modification time in destination`: rclone's S3
backend does a lightweight metadata-only server-side copy (mtime tag refresh) because size matched,
NOT a body re-upload — confirmed by the transferred-bytes total (7.829 KiB, matching the size of the
5 real files, not the ~23 KiB of the full tree). This is the direct, measured answer to "how does the
second publish avoid re-uploading everything": **it doesn't have to be anything Archie does** — full
republish + byte-stable output is sufficient for rclone's own compare to do the right thing. (A
`--size-only` or `--checksum` rclone flag would suppress even the mtime-touch churn; not explored
further here — the transferred-bytes number is what actually matters for a 74 GB archive's bandwidth
bill, and that number is already right.)

Direction check: this validates the "rclone sync diffs source against bucket itself" half of the
ticket's own claim. It was measured, not assumed — the alternative (rclone re-uploading everything
because e.g. it can't see S3 ETags, or Archie's output isn't actually byte-stable) was a live
possibility until this run.

## §3 — the marker-last risk (the ticket's stated "main risk"), measured

`.claude/rules/render-core-data-integrity.md` rule 1: `archie.json` is written LAST *locally* — the
commit point, so a torn LOCAL write leaves a tree that reads as stale, never as complete. The ticket
asks whether that survives "a third-party sync tool that does not know archie.json is the commit
point." **Measured: it does not, by default.**

A plain `rclone sync <folder> <bucket>` (§2's sync 1 log, first lines) uploaded in this order:

```
archie.json          <- FIRST, not last
exhibits.json
images.json
collection.json
index.html
gamma/index.html
...
```

Checked against the full log (not just the excerpt above): the order is NOT a simple alphabetical
directory walk — `alpha/index.html` lands well after `gamma/manifest.json`, for instance — consistent
with rclone's default of several CONCURRENT transfer workers racing rather than one deterministic
walk order. That's the honest mechanism claim: not "archie.json sorts first," but "a plain sync gives
no ordering guarantee at all, and this run's first completion happened to be the marker." Either
framing lands at the same risk: **a viewer fetching mid-sync could see a fresh `archie.json` —
"this tree is current" — pointing at a generation whose exhibit files haven't landed yet: a torn read
that LOOKS committed**, which is worse than the local torn-write case the existing discipline already
guards (that one fails closed — no marker, reader rejects the tree; this one fails open).

**Mitigation, verified working:**

```sh
rclone sync ./out r2:my-archive --exclude "archie.json"   # everything except the marker
rclone copyto ./out/archie.json r2:my-archive/archie.json  # marker LAST, its own request
```

Verified: pass 1 with `--exclude "archie.json"` genuinely excludes it (`--dry-run` transfer log has
zero `archie.json` lines — grepped, not assumed); pass 2 is a single-file `copyto` that necessarily
completes after pass 1's sync call returns (sequential shell commands, not concurrent), so the marker
is provably the last object landed. This preserves the local marker-last discipline through the sync
layer instead of only up to the folder boundary.

**How to apply:** the "what is rclone?" copyable command in the Archie-c367 UI should ship as this
two-line form, not the ticket's single-line illustrative `rclone sync ./out r2:my-archive` — the
single-line form is correct for FIRST publish (empty bucket, no reader can be mid-fetch of a tree that
doesn't exist yet) but wrong for every republish after that, which is the common case for an archive
that keeps growing. Flagged as a product-copy follow-up, not fixed in this prototype (out of scope —
UI copy lives on Archie-c367).

## §4 — why credentials-in-browser was declined (kept minimal, per the scope cut)

One measurement, against the same MinIO bucket: an unauthenticated `fetch(..., { method: "PUT" })`
with no `Authorization` header (simulating what a browser-embedded, unsigned write would look like)
returned **HTTP 403 Forbidden**. S3-compatible servers reject unsigned writes by design — the only way
a browser-only "OWN IT" path could work is embedding a long-lived secret key in the shipped app (the
`app.security.csp`-adjacent worry the grilling declined) or standing up Archie's own signing backend
(a server Archie doesn't have and the FACILITATE-side decision explicitly avoids). rclone sidesteps
this entirely: it holds the credentials in the USER's own `rclone.conf`, signs requests locally, and
Archie never sees a key. That's the concrete shape of "Archie never handles credentials" — not a
policy statement, a real mechanism difference measured against a real bucket.

Desktop-native-http (Tauri bridge) is not measured here — it's moot under the current scope (Archie
doesn't upload on ANY platform now), and re-litigating it would contradict the ticket's own decided
fork.

## §5 — bucket CORS (still in scope, per the ticket — documentation, not code)

Not for Archie's publish step (it never touches the bucket) — for the **Viewer**, which fetches
`collection.json` / `exhibits.json` / per-exhibit `manifest.json` / tile pyramids over `https://` from
whatever the bucket's public URL is (same `img-src`/`connect-src: https:` shape as
`.claude/rules/tauri-csp.md` already documents for IIIF). A bucket with no CORS config serves those
fetches with no `Access-Control-Allow-Origin` header, and the browser's cross-origin fetch fails
silently into the Viewer's existing "some notes couldn't load" / failed-fetch degradation path
(`render-core-data-integrity.md` rule 2 — absent-vs-failed) rather than a clear "turn on CORS" message
the author could act on.

Minimum bucket CORS config (documented beside the `rclone sync` command, per the ticket's "STILL IN
SCOPE... as DOCUMENTATION beside the command" instruction):

```json
[{
  "AllowedOrigins": ["*"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}]
```

`GET`/`HEAD` only — the Viewer never writes to the bucket. `AllowedOrigins: ["*"]` is appropriate here
specifically because the content is a PUBLIC archive with no auth of its own (same posture as a public
GitHub Pages site); a private/access-controlled archive would need this scoped to the Viewer's actual
origin(s) instead, which is a per-deployment decision outside what a copy-paste snippet can cover.

## §6 — cost table (10 / 30 / 74 GB, the c367 mock's own size points)

Sources and fetch dates below. AWS's own pricing page (`ctx_fetch_and_index`, fetched 2026-07-27)
renders its numeric tables via client-side JS — the static HTML fetch captured the surrounding prose
but not the table cells (checked with 4 follow-up `ctx_search` queries against the indexed content,
all came back with prose only). Cloudflare's and Backblaze's pricing pages ARE static and the numbers
below for R2/B2 are copied directly from that fetch. For S3, fell back to `WebSearch` against
secondary sources that themselves cite AWS's page; flagged as secondary, not primary.

| provider | storage $/GB-mo | source | egress | source |
| --- | --- | --- | --- | --- |
| **AWS S3 Standard** (us-east-1) | $0.023 (first 50 TB/mo tier) | WebSearch, 2026-07-27 (secondary — cloudchipr.com/blog/amazon-s3-pricing-explained, costimizer.ai/blogs/aws-s3-storage; AWS's own page's pricing table didn't render in the static fetch, see above) | 100 GB/mo free, then $0.09/GB (first 10 TB, us/EU) | WebSearch, 2026-07-27 (secondary — egresscost.com/aws/data-transfer-pricing, besharp.it) |
| **Cloudflare R2** Standard | $0.015 | `ctx_fetch_and_index` https://developers.cloudflare.com/r2/pricing/ — page states "Last updated May 28, 2026", fetched 2026-07-27 | **Free, unconditionally** — page's own words: *"There are no charges for egress bandwidth for any storage class"* | same fetch |
| **Backblaze B2** pay-as-you-go | ≈$0.00695 ($6.95/TB/30-day) | `ctx_fetch_and_index` https://www.backblaze.com/cloud-storage/pricing, fetched 2026-07-27 (their own FAQ: "billed... at a rate of $6.95/TB/30-day") | Free up to 3x average monthly storage, then $0.01/GB | same fetch |

Monthly storage cost at the c367 mock's three sizes (storage only, gross rate — R2's 10 GB/mo free
tier and B2's free-egress allowance are separate and not netted into these numbers):

| | 10 GB | 30 GB | 74 GB |
| --- | --- | --- | --- |
| S3 Standard | $0.23 | $0.69 | $1.70 |
| R2 Standard | $0.15 | $0.45 | **$1.11** |
| B2 pay-as-you-go | $0.07 | $0.21 | $0.51 |

**Citation-consistency check, worth flagging:** the c367 mock's own copy says *"Object storage
~$1.10/mo... archival, ~74 GB"* and the c85f ticket's prose says *"roughly $0.30/month for 20 GB"*.
74 × $0.015 (R2) = **$1.11** and 20 × $0.015 (R2) = **$0.30** — both match R2 almost exactly, and
neither matches S3 or B2 at those sizes. **The product's own existing cost estimates were evidently
built assuming R2**, even though neither ticket names a provider explicitly. Worth stating outright
in the c367 UI copy (or picking R2 as the actually-recommended remote in the `rclone` snippet) rather
than leaving the provider implicit — the free-egress property (§ below) is the stronger reason to
default there anyway.

**R2's zero egress is load-bearing, verified.** For a PUBLIC archive (no auth, served to any reader,
IIIF viewers routinely re-fetch tiles), egress is the cost that scales with AUDIENCE, not archive
size, and it's the one most likely to surprise an author who sized their budget off storage alone.
S3's $0.09/GB after 100 GB/mo free means a single popular exhibit's image tiles could plausibly burn
through the free tier in normal traffic; R2 removes that risk entirely, unconditionally, per its own
pricing page. B2's "3x storage" free egress is generous at small sizes (74 GB storage → 222 GB/mo free
egress) but is a CAP, not unconditional, unlike R2's.

## §7 — the c367 grey-out reason string (draft, not decided — c367's call)

Per Archie-c85f's own UI/UX-decided section: *"Firefox and Safari... have NO uncapped path at all...
Archie-c367 must state this reason in the greyed-out destination, never hide it."* Proposing text
(the c367 ticket is `/product-copy`-tagged and blocked on a separate probe ticket — this is a draft
for that ticket to adopt or revise, not a decision made here):

> **Object storage** — greyed, with: *"Needs a folder this browser can write to — open Archie on
> desktop, or use Chrome or Edge."*

Same reason, same wording, as the Folder destination's grey-out (both share the identical cause —
`folderSinkSupported() = isTauri() || supportsFolderPicker()` — so a reader who's already read one
reason doesn't need a second explanation for a second-feeling cause).

## Gates run

`packages/render-core`:
- `pnpm exec vitest run` → **99 files / 1266 tests passed**, including the 1 new file
  (`delta.test.ts`, 6 tests) this branch adds.
- `pnpm run typecheck` (`tsc --noEmit` via `typescript-native`, per `.claude/rules/two-typescript-compilers.md`
  — never bare `tsc`) → **clean, zero output, zero errors.**

No `.svelte` files touched (studio/viewer wiring untouched — this is a render-core + probe-script
prototype only), so `svelte-check` is not applicable per `.claude/rules/svelte-no-typecheck-net.md`.

## Follow-ups (not done here — prototype scope, not shipped fix)

1. A regression test pinning "publishLibrary with no `publishedAt`/`generation` given is byte-stable
   across two identical publishes" — `computeDelta` + the fixture in this probe could become a real
   `site.test.ts` case in ~20 lines, closing the gap the ticket flagged rather than just measuring it
   once.
2. The two-pass `rclone sync --exclude` / `copyto` sequence belongs in the Archie-c367 copy-paste
   snippet, not just this ledger.
3. `docs/bundle-size.json`-style drift risk: if a FUTURE change threads `publishedAt` through
   `STATIC_PAGE_OPTS` (there's a real reason to want it — Q-8's dated citations), it will reintroduce
   full-tree churn on every republish. That change should come with the byte-stability regression test
   from (1) already in place, so the tradeoff is visible in the PR rather than discovered later against
   a live 74 GB archive.
