# PROBE — pull-merge: is a published tree a mergeable remote? (Archie-30ff)

Branch `probe/pull-merge`, base `b240a0e5f485b08f639e13fef4488ead3eb7d3f7`, probe committed at
`d19043121347fa81b7445f9e20e6c74232a2f6cc`. Script: `scripts/probe/pull-merge.mjs`. Node v24.14.0.

## Question

docs/research/next-level-2026-07-26.md rank 2 ("Pull-merge: every published exhibit is already a
fetchable annotation remote") proposed a one-day, decisive 0→1 probe: publish the Voynich seed,
serve it statically, read it back through `HttpFilesystem` + `readAnnotations`, and classify every
`logicalId` against the local log with `classifyLogical`. *"If it prints merge classifications, the
whole feature is a dialog over `MergeReview`."*

## What the probe does

1. `publishLibrary` (pure, no browser) bakes the same `apps/viewer/fixtures/sample-data.ts` seed
   `apps/viewer/scripts/gen-published.mts` bakes, into a `MemoryFilesystem`.
2. `collectFiles` flattens it, and the probe writes every file to a real temp dir on disk.
3. A plain `node:http` static server serves that dir — **deliberately with no
   `Access-Control-Allow-Origin` header**, mimicking "most static hosts don't send one" (the
   research doc's own framing) rather than GitHub Pages' `*`.
4. `new HttpFilesystem(base)` reads `voynich/annotations` back over real HTTP with `readAnnotations`.
5. **PASS 1 (echo):** classify the local in-memory log against that remote log, one call per
   `logicalId`, with `classifyLogical`.
6. **PASS 2 (mutate):** edit ONE local note with `appendEdit` (a genuine new revision — new `rev`,
   `version: 2`, `parent` = the old head) and reclassify the *same* `logicalId` set against the
   *same* remote log.
7. Separately, fetch `https://micahchoo.github.io/test/` and print its response headers, as ground
   truth for what a real published-elsewhere GitHub Pages tree actually sends.

Two runs, both green, both reproducible (see "Run 2" below is what's pasted; a third rerun before
writing this ledger matched it structurally — 55 identical, then 1 fast-forward + 54 identical).

## Full output (Run 2, `d190431` on `probe/pull-merge`)

```
=== Archie-30ff pull-merge probe ===

publishLibrary: 6 exhibits, 0 broken link(s)
collectFiles: 321 files flattened from the memory tree
wrote tree to disk: /tmp/archie-pull-merge-WTIDYA
  annotations dir on disk: /tmp/archie-pull-merge-WTIDYA/voynich/annotations/history
serving /tmp/archie-pull-merge-WTIDYA
  on http://127.0.0.1:4462/ (no ACAO header)

HttpFilesystem(http://127.0.0.1:4462/) -> readAnnotations(voynich/annotations): 55 record(s)

raw response headers for http://127.0.0.1:4462/voynich/annotations/history/index.json:
  connection: keep-alive
  content-length: 6437
  content-type: application/json
  date: Tue, 28 Jul 2026 03:43:20 GMT
  keep-alive: timeout=5
  (access-control-allow-origin present: false)

local log (unmutated): 55 record(s), 55 distinct logicalId(s)

=== PASS 1: echo (local log, unmutated) ===
  0000000001SEBWXFTSHHP00TVY  {"kind":"identical","rev":"0000000001P5KER16WWQVJZJCS"}
  0000000002PNFACD4MNDPM9VAP  {"kind":"identical","rev":"0000000002PEP8AKF7XTA76G9R"}
  0000000003PQ6V55D5Z1D18V9C  {"kind":"identical","rev":"0000000003BC7R2KW1RWNSDBGF"}
  0000000004GBAH24KSG4V3RSHM  {"kind":"identical","rev":"0000000004VJ5VJJFRRPQ9D7FK"}
  0000000005CF2T3QMEE31ES9F2  {"kind":"identical","rev":"0000000005M83NMH1H96HE9XNV"}
  0000000006S77HDTPH81NP53N7  {"kind":"identical","rev":"00000000063EDPDDYM928DJDCF"}
  0000000007MWQ9YKRF08XFYKVY  {"kind":"identical","rev":"000000000738C5PQHXRK79FCJT"}
  0000000008Y2AH240G0XN2MWM5  {"kind":"identical","rev":"0000000008M35QS7WM5N7E41AJ"}
  0000000009XRYSFH35VWAC69FV  {"kind":"identical","rev":"0000000009D3FXAD6R5KMZTB8V"}
  000000000AMXE4WG1X54PPBDJX  {"kind":"identical","rev":"000000000AYHSSHW3K4V29QSCA"}
  000000000BYTP7TPG5V4D9DPJJ  {"kind":"identical","rev":"000000000BABQ8VZQJBT961S7X"}
  000000000C5M05B5H33KBKENTM  {"kind":"identical","rev":"000000000CXYWNAYDVXP3XB4HM"}
  000000000DKQD59F90D974X5WA  {"kind":"identical","rev":"000000000DXDJEVSJSAMG9JHVS"}
  000000000EZ2GX4QGJ9FNE2B6F  {"kind":"identical","rev":"000000000EJGXZKH87ZTKB9GBH"}
  000000000FE50KW4748NGA2KYD  {"kind":"identical","rev":"000000000F0JXR7Y9GS8X5ZNGJ"}
  000000000G436SZYRM7SJAE27C  {"kind":"identical","rev":"000000000G0KBVG0H18SG7WZHR"}
  000000000HY1WADHAMBE6MCBNE  {"kind":"identical","rev":"000000000HEHASHF8TADBND9W6"}
  000000000JFNHTRNFTF2DY3CDW  {"kind":"identical","rev":"000000000JKFSZ80CT1KWH6MF5"}
  000000000KYYPDPDJWC5NB5GC8  {"kind":"identical","rev":"000000000K80FX8RVP7YX67YWY"}
  000000000MHEF5135Q5KRX196F  {"kind":"identical","rev":"000000000M0FY5WW996HTFWH84"}
  000000000NG4F6028SPW29955T  {"kind":"identical","rev":"000000000NG00NQSP954DT5ZW6"}
  000000000PDGPWFVGVN3CC6EMA  {"kind":"identical","rev":"000000000PQ2ZXZ4Z09CCCGTVZ"}
  000000000QWBG4NZWFZNXHQT6G  {"kind":"identical","rev":"000000000Q1KMY2AFKA8NFHFTW"}
  000000000RNTQ3V249WJ79A5FZ  {"kind":"identical","rev":"000000000RZE0ATWNW4F62ENJ3"}
  000000000SF0RA69D1AEDPS92K  {"kind":"identical","rev":"000000000SMN0DN8X2TY107D6W"}
  000000000T0XB8RZ1YNFM23KZB  {"kind":"identical","rev":"000000000T0E2YE41CPBRZW3NS"}
  000000000VKG82BA5ZSFEY2FTQ  {"kind":"identical","rev":"000000000VTF559RC1FKQEZZWS"}
  000000000WGKNWDZXHKB22A3ST  {"kind":"identical","rev":"000000000WMDS02TT6MZ4N14M3"}
  000000000XRA5BNY6QAT2HA232  {"kind":"identical","rev":"000000000X218B8WGWMQ14NENP"}
  000000000YQK89P2KV9HVRR38G  {"kind":"identical","rev":"000000000YD1JVT00ACK7Q1QHD"}
  000000000ZGXTAAFT6XTG2RT90  {"kind":"identical","rev":"000000000Z4W5923JD9706ER0F"}
  0000000010S2ZQ3DEVF3085WT9  {"kind":"identical","rev":"00000000108WFBMMS6A72EESNJ"}
  00000000117E4BNKCXE4VVRZMZ  {"kind":"identical","rev":"0000000011HFVP2HER6KAKF327"}
  0000000012GE6PD2GXHQT97QRP  {"kind":"identical","rev":"00000000120CCFVNTBFW1HHRT8"}
  0000000013GWFH6C0NQGSEMZAR  {"kind":"identical","rev":"0000000013WG6N1FBWYJCSWN0Z"}
  0000000014TTFB8JQD3TJZXQP5  {"kind":"identical","rev":"0000000014HP4FDM9C28114500"}
  000000001593P1SMMCBTNKFBY8  {"kind":"identical","rev":"0000000015483218Z8CTWAQX54"}
  000000001679CRY8HDE68SGJYD  {"kind":"identical","rev":"0000000016YG3CD8HJ0KCEB732"}
  00000000178YRD8K083X2R1ZAP  {"kind":"identical","rev":"0000000017EYJPN7ZB03Q5D7MD"}
  00000000182PPJRSQD27G3ABSS  {"kind":"identical","rev":"00000000180Y54PXQ3B3RVK244"}
  0000000019SSWKP8YK68S9VDKR  {"kind":"identical","rev":"0000000019QHQ1GPXSK527XMY0"}
  000000001A887SGR8A6T0X4W71  {"kind":"identical","rev":"000000001AQRSS9BNJZH0QQ74W"}
  000000001BVGJV1ZWJDXXPQ9N5  {"kind":"identical","rev":"000000001BE5N7M25W6WP8MKMG"}
  000000001CN6PM1BKMW882JETG  {"kind":"identical","rev":"000000001CFDYRZFC3TYQ2N74P"}
  000000001DFPWFPFGJ595GZAEF  {"kind":"identical","rev":"000000001DT8VREZRH4YVSPSYW"}
  000000001EAKR8CK72QS39B2GR  {"kind":"identical","rev":"000000001EDEPCVRXX29EQTYVY"}
  000000001F81TR8PT6F3DP2W59  {"kind":"identical","rev":"000000001FKFAQKCT84JWJYST4"}
  000000001GM6W8WT9HYJF7G88C  {"kind":"identical","rev":"000000001GAQTHZ0TDQZ6GJA41"}
  000000001HZRM9NQJ7RS6HH4PQ  {"kind":"identical","rev":"000000001HKJZAEJ6GXVM29F7D"}
  000000001JPVQXJ8KWYHKWFCZA  {"kind":"identical","rev":"000000001JVH4X7W9Y5YB9B2SQ"}
  000000001KF44F5CVRY6CV4YPM  {"kind":"identical","rev":"000000001K0YWSVE4F16E2Y57X"}
  000000001MMY3QT0A8TC42SNZK  {"kind":"identical","rev":"000000001M6SD5C4A8QD9H2JKR"}
  000000001N4RWYX076AQQ349VE  {"kind":"identical","rev":"000000001NMS83QQXZXYV5H66C"}
  000000001PJ5QR5J3JFFZCM9GS  {"kind":"identical","rev":"000000001PQEVZ2WFPRBTWG0V7"}
  000000001Q0S2A8K599BEA4KW1  {"kind":"identical","rev":"000000001Q8273QDE9B7VDVH1K"}
  tally: {"identical":55}

=== PASS 2: local mutation on 0000000001SEBWXFTSHHP00TVY ===
  new local rev 01KYKD3R97EDCT0WHTHGS30HJC (version 2, parent 0000000001P5KER16WWQVJZJCS)
  old local head was 0000000001P5KER16WWQVJZJCS (version 1) — identical to the remote head, since PASS 1 above classified it "identical"
  0000000001SEBWXFTSHHP00TVY  {"kind":"fast-forward","ahead":"01KYKD3R97EDCT0WHTHGS30HJC","behind":"0000000001P5KER16WWQVJZJCS"}  <-- mutated
  0000000002PNFACD4MNDPM9VAP  {"kind":"identical","rev":"0000000002PEP8AKF7XTA76G9R"}
  0000000003PQ6V55D5Z1D18V9C  {"kind":"identical","rev":"0000000003BC7R2KW1RWNSDBGF"}
  0000000004GBAH24KSG4V3RSHM  {"kind":"identical","rev":"0000000004VJ5VJJFRRPQ9D7FK"}
  0000000005CF2T3QMEE31ES9F2  {"kind":"identical","rev":"0000000005M83NMH1H96HE9XNV"}
  0000000006S77HDTPH81NP53N7  {"kind":"identical","rev":"00000000063EDPDDYM928DJDCF"}
  0000000007MWQ9YKRF08XFYKVY  {"kind":"identical","rev":"000000000738C5PQHXRK79FCJT"}
  0000000008Y2AH240G0XN2MWM5  {"kind":"identical","rev":"0000000008M35QS7WM5N7E41AJ"}
  0000000009XRYSFH35VWAC69FV  {"kind":"identical","rev":"0000000009D3FXAD6R5KMZTB8V"}
  000000000AMXE4WG1X54PPBDJX  {"kind":"identical","rev":"000000000AYHSSHW3K4V29QSCA"}
  000000000BYTP7TPG5V4D9DPJJ  {"kind":"identical","rev":"000000000BABQ8VZQJBT961S7X"}
  000000000C5M05B5H33KBKENTM  {"kind":"identical","rev":"000000000CXYWNAYDVXP3XB4HM"}
  000000000DKQD59F90D974X5WA  {"kind":"identical","rev":"000000000DXDJEVSJSAMG9JHVS"}
  000000000EZ2GX4QGJ9FNE2B6F  {"kind":"identical","rev":"000000000EJGXZKH87ZTKB9GBH"}
  000000000FE50KW4748NGA2KYD  {"kind":"identical","rev":"000000000F0JXR7Y9GS8X5ZNGJ"}
  000000000G436SZYRM7SJAE27C  {"kind":"identical","rev":"000000000G0KBVG0H18SG7WZHR"}
  000000000HY1WADHAMBE6MCBNE  {"kind":"identical","rev":"000000000HEHASHF8TADBND9W6"}
  000000000JFNHTRNFTF2DY3CDW  {"kind":"identical","rev":"000000000JKFSZ80CT1KWH6MF5"}
  000000000KYYPDPDJWC5NB5GC8  {"kind":"identical","rev":"000000000K80FX8RVP7YX67YWY"}
  000000000MHEF5135Q5KRX196F  {"kind":"identical","rev":"000000000M0FY5WW996HTFWH84"}
  000000000NG4F6028SPW29955T  {"kind":"identical","rev":"000000000NG00NQSP954DT5ZW6"}
  000000000PDGPWFVGVN3CC6EMA  {"kind":"identical","rev":"000000000PQ2ZXZ4Z09CCCGTVZ"}
  000000000QWBG4NZWFZNXHQT6G  {"kind":"identical","rev":"000000000Q1KMY2AFKA8NFHFTW"}
  000000000RNTQ3V249WJ79A5FZ  {"kind":"identical","rev":"000000000RZE0ATWNW4F62ENJ3"}
  000000000SF0RA69D1AEDPS92K  {"kind":"identical","rev":"000000000SMN0DN8X2TY107D6W"}
  000000000T0XB8RZ1YNFM23KZB  {"kind":"identical","rev":"000000000T0E2YE41CPBRZW3NS"}
  000000000VKG82BA5ZSFEY2FTQ  {"kind":"identical","rev":"000000000VTF559RC1FKQEZZWS"}
  000000000WGKNWDZXHKB22A3ST  {"kind":"identical","rev":"000000000WMDS02TT6MZ4N14M3"}
  000000000XRA5BNY6QAT2HA232  {"kind":"identical","rev":"000000000X218B8WGWMQ14NENP"}
  000000000YQK89P2KV9HVRR38G  {"kind":"identical","rev":"000000000YD1JVT00ACK7Q1QHD"}
  000000000ZGXTAAFT6XTG2RT90  {"kind":"identical","rev":"000000000Z4W5923JD9706ER0F"}
  0000000010S2ZQ3DEVF3085WT9  {"kind":"identical","rev":"00000000108WFBMMS6A72EESNJ"}
  00000000117E4BNKCXE4VVRZMZ  {"kind":"identical","rev":"0000000011HFVP2HER6KAKF327"}
  0000000012GE6PD2GXHQT97QRP  {"kind":"identical","rev":"00000000120CCFVNTBFW1HHRT8"}
  0000000013GWFH6C0NQGSEMZAR  {"kind":"identical","rev":"0000000013WG6N1FBWYJCSWN0Z"}
  0000000014TTFB8JQD3TJZXQP5  {"kind":"identical","rev":"0000000014HP4FDM9C28114500"}
  000000001593P1SMMCBTNKFBY8  {"kind":"identical","rev":"0000000015483218Z8CTWAQX54"}
  000000001679CRY8HDE68SGJYD  {"kind":"identical","rev":"0000000016YG3CD8HJ0KCEB732"}
  00000000178YRD8K083X2R1ZAP  {"kind":"identical","rev":"0000000017EYJPN7ZB03Q5D7MD"}
  00000000182PPJRSQD27G3ABSS  {"kind":"identical","rev":"00000000180Y54PXQ3B3RVK244"}
  0000000019SSWKP8YK68S9VDKR  {"kind":"identical","rev":"0000000019QHQ1GPXSK527XMY0"}
  000000001A887SGR8A6T0X4W71  {"kind":"identical","rev":"000000001AQRSS9BNJZH0QQ74W"}
  000000001BVGJV1ZWJDXXPQ9N5  {"kind":"identical","rev":"000000001BE5N7M25W6WP8MKMG"}
  000000001CN6PM1BKMW882JETG  {"kind":"identical","rev":"000000001CFDYRZFC3TYQ2N74P"}
  000000001DFPWFPFGJ595GZAEF  {"kind":"identical","rev":"000000001DT8VREZRH4YVSPSYW"}
  000000001EAKR8CK72QS39B2GR  {"kind":"identical","rev":"000000001EDEPCVRXX29EQTYVY"}
  000000001F81TR8PT6F3DP2W59  {"kind":"identical","rev":"000000001FKFAQKCT84JWJYST4"}
  000000001GM6W8WT9HYJF7G88C  {"kind":"identical","rev":"000000001GAQTHZ0TDQZ6GJA41"}
  000000001HZRM9NQJ7RS6HH4PQ  {"kind":"identical","rev":"000000001HKJZAEJ6GXVM29F7D"}
  000000001JPVQXJ8KWYHKWFCZA  {"kind":"identical","rev":"000000001JVH4X7W9Y5YB9B2SQ"}
  000000001KF44F5CVRY6CV4YPM  {"kind":"identical","rev":"000000001K0YWSVE4F16E2Y57X"}
  000000001MMY3QT0A8TC42SNZK  {"kind":"identical","rev":"000000001M6SD5C4A8QD9H2JKR"}
  000000001N4RWYX076AQQ349VE  {"kind":"identical","rev":"000000001NMS83QQXZXYV5H66C"}
  000000001PJ5QR5J3JFFZCM9GS  {"kind":"identical","rev":"000000001PQEVZ2WFPRBTWG0V7"}
  000000001Q0S2A8K599BEA4KW1  {"kind":"identical","rev":"000000001Q8273QDE9B7VDVH1K"}
  tally: {"fast-forward":1,"identical":54}

PASS 1 vs PASS 2 tallies differ: true

server stopped (port 4462 released), temp dir removed

=== live CORS check: https://micahchoo.github.io/test/ ===
  status: 200
  accept-ranges: bytes
  access-control-allow-origin: *
  age: 0
  cache-control: max-age=600
  connection: keep-alive
  content-encoding: gzip
  content-length: 852
  content-type: text/html; charset=utf-8
  date: Tue, 28 Jul 2026 03:43:20 GMT
  etag: W/"6a669ff4-6ce"
  expires: Tue, 28 Jul 2026 03:53:20 GMT
  last-modified: Mon, 27 Jul 2026 00:01:56 GMT
  server: GitHub.com
  strict-transport-security: max-age=31556952
  vary: Accept-Encoding
  via: 1.1 varnish
  x-cache: MISS
  x-cache-hits: 0
  x-fastly-request-id: d93fa94549f4c444954bb2f1aacc6b048a20c303
  x-github-request-id: 2404:39BC9D:D81440:E0852C:6A682557
  x-proxy-cache: MISS
  x-served-by: cache-bur-kbur8200149-BUR
  x-timer: S1785210200.431502,VS0,VE119
  access-control-allow-origin present: true
```

(Every row above is the script's raw stdout, unedited except for terminal formatting; nothing was
trimmed. The `identical` count of 55/55 in PASS 1 and 54/55 + 1 `fast-forward` in PASS 2 is copied
verbatim from the script's own `tally` line, not derived — see
`.claude/rules/post-review-fixes-are-unreviewed.md` on reporting counts you actually read rather than
inferred ones.)

## The probe is not vacuous — proof it can change

Per `.claude/rules/post-review-fixes-are-unreviewed.md` ("a probe whose output is identical in the
world you fear and the world you expect has zero information content"): PASS 1 and PASS 2 classify
the exact same 55 `logicalId`s against the exact same remote log, and differ in exactly one entry —
the one that was mutated. The script itself asserts this (`PASS 1 vs PASS 2 tallies differ: true`,
and would print a `*** WARNING ***` and exit 1 if they didn't). This rules out the failure mode where
a probe prints a plausible-looking classification for every input regardless of whether anything
actually changed.

The mutated entry classifies as `fast-forward` (local `ahead`, remote `behind`) rather than
`conflict`, because `appendEdit` was applied on top of the CURRENT head — a single-sided advance, not
a divergent one. That is itself informative: it demonstrates `classifyMerge`'s three-way split
(`identical` / `fast-forward` / `conflict`) is reachable from a single local edit, and a `conflict`
classification (both sides advance from a common base) is one more edit away — pull-merge would need
BOTH a local edit AND an out-of-band remote edit to reach it, which this probe didn't stage (out of
scope for a one-day 0→1 check; `merge.test.ts` already covers the `conflict` branch directly).

## CORS notes

- **The local static server sent NO `Access-Control-Allow-Origin` header, and the probe succeeded
  anyway.** This is expected and NOT evidence that CORS doesn't matter: **Node's `fetch` performs no
  CORS enforcement at all** — CORS is a browser-only security policy, enforced by the user agent, not
  by the server or by `fetch()` itself (`.claude/rules/bound-fetch-defaults.md` documents the sibling
  fact that Node's `fetch` is also structurally more permissive on the *receiver-brand-check* axis;
  this is the same "Node is more permissive than a browser" shape on the CORS axis). So this probe's
  green run says nothing about whether a **browser-hosted** Studio could pull from an arbitrary static
  host — only that the read-path plumbing (`HttpFilesystem` → `readAnnotations` → `classifyLogical`)
  is correct once bytes are in hand.
- **The live check against `https://micahchoo.github.io/test/` is the ground truth for the browser
  case**, and confirms the research doc's claim: GitHub Pages sends `access-control-allow-origin: *`
  unconditionally, on every response (verified above, a plain `index.html`). A Studio running in a
  browser CAN pull-merge from any GH-Pages-published Archie tree with zero server-side change.
- **A static host that does NOT send ACAO (the doc's "most static hosts" case) blocks the browser
  path outright**, with no workaround available to a web-only Studio — the fetch fails before
  `HttpFilesystem` ever sees a response. This is real friction, already known and already scoped: the
  research doc names the Tauri native-http bridge as "the desktop-only escape hatch," and it already
  exists for a structurally identical problem — `.claude/rules/tauri-csp.md` documents
  `fetchRemoteAsBlobUrl` / `fetchRemoteJson` (Archie-fada) routing remote image/`info.json` fetches
  through Tauri's native HTTP specifically because the webview's CORS enforcement (unlike a CORS-blind
  Node fetch) blocks a CORS-restricted host. The same bridge would need to grow a JSON-fetch path for
  `annotations/history/*.json` to give desktop Studio the same universal reach a browser gets only
  from ACAO-friendly hosts.

## Verdict

**Confirmed: the whole feature is a dialog over `MergeReview`.** Every piece the research doc named
as "verified present" held up under an actual end-to-end run, not just a read of the source:

- `HttpFilesystem(base)` + `readAnnotations` reads a real published tree over real HTTP with zero
  new code — both already existed, wired exactly as `openLibraryFromTree` uses them.
- `classifyLogical(local, incoming, logicalId)` needs nothing but two `AnnotationLog`s and a
  `logicalId` — it doesn't care that "incoming" came from `fetch` instead of a dropped zip.
- The classification output is exactly the shape `MergeReview`'s existing conflict-card UI already
  consumes (`MergeClassification` ∪ `only-local` ∪ `only-incoming`), per `merge.ts`'s own
  `LogicalMergeResult` type — no new data shape is needed between "pasted a URL" and "review this."

**What is NOT yet built, and is the real remaining effort** (matches the research doc's own
"effort-fit 4… identity-fit 5" discount and the "not a nicety" flag on identity):

1. **A UI surface in Studio** that takes a pasted URL, does what this script does (construct
   `HttpFilesystem`, `readAnnotations`, `classifyLogical` per note), and feeds the result into the
   existing `MergeReview` component instead of a raw zip's `mergeLogs` input — genuinely "a dialog
   over `MergeReview`," not a new merge engine.
2. **The CORS edge, closed for GH Pages, open elsewhere.** Confirmed real above, not hypothetical.
   Ships fine for the GH-Pages-hosted classroom case with zero extra work; a non-ACAO host needs
   either the Tauri native-http bridge extended to cover this fetch (desktop-only, per existing
   precedent) or acceptance that web-only Studio can't reach it.
3. **Issue 13 identity capture**, already flagged in the research doc as "a hard dependency for
   attributed classroom merges" — this probe used a single hardcoded `lastEditor` (`probe-agent`) and
   didn't touch attribution at all; that's out of scope for what this probe was built to answer.

None of the three is a research question — the probe answered the one research question the ticket
asked, and answered it decisively.
