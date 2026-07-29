<script lang="ts">
/**
 * @surface {dialog}
 * @composes {Spinner, ZipExportFields, publish-machine, modality helper}
 * @variants {step 1 one-flow chooser (choose/zip-options/working/done-folder/done-object/done-download/done-deposit/error), wizard}
 * @constraint {single-scrim invariant; surface is mounted for app lifetime, machine state survives close; in-surface "← Back" for nested flow}
 */
  // Publish & Share — the ONE merged surface (Archie-1921, decision Archie-7d9b) for every "Library → the
  // world" path. Formerly two dialogs that opened one behind the other (PublishDialog.svelte → Publish.svelte);
  // now a single scrimmed surface with an in-surface step sequence:
  //   Step 1 (`menuPhase === "choose"`) — the destination chooser: web / local folder / zip download. This is
  //   PublishDialog.svelte's old content, folded in unchanged (Local/zip destinations are unchanged per spec).
  //   Choosing "Publish to the web" enters the GitHub wizard (`menuPhase === "wizard"`) IN THE SAME surface —
  //   no second modal opens over/behind the first. The wizard's entry screens (intro-desktop / web-intro) get
  //   an in-surface "← Back" that returns to step 1 — the modality contract's nested-flow rule (CONTEXT.md →
  //   Surfaces: "opening one from inside another replaces it — in-surface back affordance if the flow is
  //   nested"). The wizard state machine + all its copy live in publish-machine.svelte.ts (typechecked +
  //   headlessly testable — see that file's header + Publish.test.ts); this file is the thin view.
  //
  // Session-resumable auth (Archie-7d9b, requirement 2): Esc / scrim-click mid-device-code-auth is a clean,
  // non-destructive cancel — no warning (CONTEXT.md's no-close-confirmation rule: "autosave makes dismissal
  // lossless" — the same posture applies here: a pending device code is cheap state, not user work, but the
  // principle is the same — fix the cost of re-doing the flow, not the exit). The machine is constructed
  // exactly ONCE: this component is mounted for the app's lifetime once `ensurePub()` has resolved — App.svelte
  // only ever toggles `open`, it never remounts <Publish>. So the machine's `$state` — including a pending
  // device code and its expiry — lives OUTSIDE the `{#if open}` block that gates the visible surface, and
  // survives a close untouched. `open()` (called every time the surface opens) resumes into it instead of
  // recomputing the entry screen whenever real progress is pending; see `isResumableState` in
  // publish-machine.svelte.ts. Device-code polling and the GitHub push are plain async functions with no
  // cancellation wired to component lifecycle, so they keep running in the background across a close — a
  // publish that finishes while the surface is closed lands on success/manual-pages/error and is reflected
  // the moment the surface reopens (requirement 3).
  import { viewerShareLink, viewerEmbedSnippet } from "./share-link.js";
  import type { GitHubTarget, BrokenLink, IncompleteCanvas, MissingAsset, GitHubPublishResult, PublishProgress, UnscaledSelector } from "@render/core";
  // The export surface's option set (Archie-c367): ONE FLOW with the probe's recommendation
  // pre-selected, and an unavailable destination GREYED WITH ITS REASON rather than silently swapped.
  // The decision layer is `export-surface.ts` so it can be driven headlessly; this file draws it.
  import type { ArchiveProbe, DestinationId, QualityTier } from "./archive-probe.js";
  import { humanBytes } from "./archive-probe.js";
  import {
    BUCKET_CORS_NOTE, RCLONE_REMOTE_PLACEHOLDER, TIER_BLURB, TIER_LABEL,
    chooseInitial, isPublishable, rcloneCommands, rowsFor,
  } from "./export-surface.js";
  import type { CorruptLogFinding } from "./publish-warnings.js";
  import { blocksPublish, REPO_SIZE_SOFT_LIMIT_BYTES, type PreflightFinding } from "@render/core";
  import type { DeploySession, DeployTarget, DeployProgress } from "./deploy/types.js";
  import type { DeployResult } from "./deploy/deploy-flows.svelte.js";
  import { untrack } from "svelte";
  import { createPublishMachine, isResumableState } from "./publish-machine.svelte.js";
  import Spinner from "./Spinner.svelte";
  import ViewerPreview from "./ViewerPreview.svelte";
  import { isTauri } from "./tauri-fs.js";
  // Scrimmed surface via the shared helper (Archie-5968): scrim-click + Esc + focus trap/return, single-scrim
  // invariant. ONE `use:scrimmed` now (was two, one per dialog) — merging removes the unmount/remount that
  // used to happen when the old chooser closed and the wizard dialog opened in its place.
  import { scrimmed, trapFocus, modality } from "./modality.svelte";
  // ?src= share path (contributor-broadening ④, Archie-fd32): the zero-GitHub publish — host the .archie.zip
  // anywhere public, share one link into the canonical Viewer instance (ADR-0009). ONE config source
  // (ADR-0013 amendment): archie.config.json — build-gh-pages.sh reads the same file via node -p.
  import archieConfig from "../../../archie.config.json";
  import ZipExportFields from "./ZipExportFields.svelte";
  import { allSelected, baseNameOf, canExport, exportOpts } from "./zip-export-opts.js";

  let {
    open = false,
    onclose,
    onfolder,
    ondownload,
    onenterweb,
    previewtree,
    onexportselfcontained,
    ondeposit,
    probe = null,
    probing = false,
    onprobe,
    tier = "archival",
    ontier,
    unscaledSelectors = [],
    exhibits = [],
    suggestedZipName = "",
    // --- desktop device-flow seams (App.svelte wires these from deploy-flows in Task 13) ---
    library = { id: "", title: "" },
    deviceFlowAvailable = false,
    remembered = null,
    initialSession = null,
    signIn,
    persistSession,
    signOut,
    deploy,
    checkRepoExists,
    listRepos,
    recheckPages,
    // --- legacy advanced (token) form — verbatim, unchanged interface ---
    onpublish,
    brokenLinks = [],
    incompleteCanvases = [],
    corruptLogs = [],
    missingAssets = [],
    preflight = [],
  }: {
    open?: boolean;
    onclose: () => void;
    onfolder: () => Promise<string | null>;
    /** Save the library as a portable .archie.zip — a copy to keep, re-open, or hand to someone.
     *  `opts` from the working-copy chooser: a custom file name and/or the exhibit subset to include.
     *  Resolves true only if a save actually happened (false = size-guard declined / picker cancelled). */
    ondownload: (opts?: { name?: string; slugs?: string[] }) => Promise<boolean>;
    /** Entering the GitHub wizard step from the chooser: runs the size-guard confirm + caches the site
     *  projection (publish-flows' openPublish). Resolves false if the author declined the guard — stay put. */
    onenterweb: () => Promise<boolean>;
    /** Build the published tree in memory for the "as a reader sees it" preview (publish-flows'
     *  previewTree). Optional: absent ⇒ the preview affordance is not offered at all, which is how a
     *  host that cannot project a site (no library open) degrades — not a button that errors. */
    previewtree?: () => Promise<{ fs: import("@render/core").Filesystem }>;
    /** Write the self-contained single-file export (publish-flows' exportSelfContained). Optional for
     *  the same reason previewtree is: a host that can't build one offers no card, never a broken one. */
    onexportselfcontained?: () => Promise<{ ok: true } | { ok: false; reason: "too-large"; mb: number }>;
    /** Write the library as a BagIt deposit bag (publish-flows' `depositBag`, Archie-039e). Optional
     *  for the same reason the two above are: a host that cannot build one offers no action. */
    ondeposit?: () => Promise<{ saved: boolean; name?: string; oxum?: string; payloadFiles?: number }>;
    /** The archive probe (Archie-7280) — what the library weighs, which destinations it fits, and the
     *  (destination, tier) pair to pre-select. Null until the first probe lands. */
    probe?: ArchiveProbe | null;
    /** True while the inventory pass is walking the library's assets. */
    probing?: boolean;
    /** Run a probe, reporting inventory progress. Called once per open; absent ⇒ no recommendation and
     *  the surface says so, which is a stated absence and never a silent swap. */
    onprobe?: (onProgress: (done: number, total: number) => void) => Promise<ArchiveProbe | null>;
    /** The quality tier the next publish will run at — read from the engine (`publish-flows.tier`), so
     *  the pre-checked control cannot disagree with the bytes that ship. */
    tier?: QualityTier;
    /** Move the tier. Archie-4b0a made this a publish-time choice and the projection cache is keyed on
     *  it, so switching re-projects by construction. */
    ontier?: (t: QualityTier) => void;
    /** Selectors the last projection could NOT rescale exactly — the residual correctness finding of a
     *  web-tier publish (Archie-4b0a). Shown when non-empty; empty is the normal case and says nothing. */
    unscaledSelectors?: UnscaledSelector[];
    /** The exportable (non-template) exhibits, for the working-copy chooser's include list. */
    exhibits?: { slug: string; title: string }[];
    /** The name the export starts from — the bound zip's name, else derived from the library title. */
    suggestedZipName?: string;
    library?: { id: string; title: string };
    deviceFlowAvailable?: boolean;
    remembered?: { target: DeployTarget; url: string } | null;
    initialSession?: DeploySession | null;
    signIn?: (onCode: (c: { userCode: string; verificationUri: string; expiresIn: number }) => void) => Promise<DeploySession>;
    persistSession?: (s: DeploySession) => Promise<boolean>;
    /** Forget the stored token (sign out) — the return-visit "Sign out" affordance. Wired in Task 13. */
    signOut?: () => Promise<void>;
    deploy?: (session: DeploySession, target: DeployTarget, onProgress: (p: DeployProgress) => void) => Promise<DeployResult>;
    /** Pre-flight name check for a NEW site (never force-overwrites an existing repo). Wired in Task 13. */
    checkRepoExists?: (session: DeploySession, target: DeployTarget) => Promise<boolean>;
    /** The author's repo names, for the "update an existing site" picker. Wired in Task 13. */
    listRepos?: (session: DeploySession) => Promise<string[]>;
    /** Re-attempt the Pages enable for the manual-pages fallback ([recheck]). Wired in Task 13. */
    recheckPages?: (session: DeploySession, target: DeployTarget) => Promise<boolean>;
    onpublish: (target: GitHubTarget, opts: { includeOriginals: boolean }, onProgress: (p: PublishProgress) => void) => Promise<GitHubPublishResult>;
    /** Intra-Library links that won't resolve in the published site — they degrade to plain text. */
    brokenLinks?: BrokenLink[];
    /** Image objects publishing with no width/height (IIIF Pres 3 §5.3) — usually a failed ingest-time probe. */
    incompleteCanvases?: IncompleteCanvas[];
    /** Exhibits whose annotation/section history reads from a torn store — the readable subset (or, when
     *  all-corrupt, nothing) ships. Surfaced as a pre-publish advisory (Archie-a690). */
    corruptLogs?: CorruptLogFinding[];
    /** Pre-push findings over the BUILT tree + rights coverage (Archie-0cd6 / Archie-8772). The
     *  severity model is render-core's; this dialog only renders it and honours `block`. */
    preflight?: PreflightFinding[];
    /** Imported images whose bytes the library's storage couldn't produce — the publish references
     *  them but doesn't contain them (the round-trip loss, 2026-07-19). Post-save advisory. */
    missingAssets?: MissingAsset[];
  } = $props();

  const isTauriEnv = isTauri();

  /** Open a URL in the system browser: opener plugin on desktop, a new tab on web. */
  async function defaultOpenUrl(url: string): Promise<void> {
    if (isTauriEnv) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } else if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener");
    }
  }
  async function defaultCopy(text: string): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.clipboard) await navigator.clipboard.writeText(text);
  }

  /** Desktop click-intercept for the wizard's external anchors (Archie-2139): in the Tauri webview a
   *  plain `target="_blank"` anchor is unreliable (no window.open handler → a silently dead link), so
   *  route the click through the machine's openExternal seam — same opener path as "Open my site", same
   *  visible `openUrlFailed` note when the opener refuses. On web builds this is a no-op and the anchor
   *  opens a tab like any link (the openUrl path is desktop-only). */
  function externalAnchor(e: MouseEvent, url: string | undefined): void {
    if (!isTauriEnv || !url) return;
    e.preventDefault();
    void machine.openExternal(url);
  }

  // The machine is constructed ONCE (this component is mounted for the app's lifetime; App.svelte only
  // toggles `open`) — see the file header for why that's what makes auth session-resumable. Every data/seam
  // dep is read through a GETTER (a session restored after mount, a library switch) so it stays live on
  // every `machine.open()` call; capturing prop snapshots here would freeze first-render values.
  const machine = createPublishMachine({
    isTauriEnv,
    get deviceFlowAvailable() { return deviceFlowAvailable; },
    get library() { return library; },
    get remembered() { return remembered; },
    get initialSession() { return initialSession; },
    get signIn() { return signIn ?? (async () => { throw { kind: "device-flow-disabled", message: "GitHub sign-in isn't available in this build." }; }); },
    get persistSession() { return persistSession ?? (async () => false); },
    get signOut() { return signOut ?? (async () => {}); },
    get deploy() { return deploy ?? (async () => { throw { kind: "push", message: "Publishing to the web isn't available here." }; }); },
    get checkRepoExists() { return checkRepoExists; },
    get listRepos() { return listRepos; },
    get recheckPages() { return recheckPages; },
    openUrl: defaultOpenUrl,
    copy: defaultCopy,
  });

  // === step 1: the destination chooser (former PublishDialog.svelte) ===================================
  // "preview" is a PHASE of this surface, not a second scrim — the modality contract's nested-flow
  // rule (see this file's header): opening one surface from inside another replaces it, with an
  // in-surface back affordance. A preview overlay on top of the dialog would break the single-scrim
  // invariant.
  //
  // `local` is GONE (Archie-c367). It was the screen that, on a browser with no folder picker, quietly
  // turned "to a local folder" into a .zip download — the fallback collision that made two buttons
  // produce the identical file on Firefox and Safari, and the thing this ticket exists to kill. The
  // folder row is now greyed with its reason instead, and nothing anywhere swaps a destination.
  type MenuPhase = "choose" | "zip-options" | "working" | "done-folder" | "done-object" | "done-download" | "done-deposit" | "error" | "wizard" | "preview";
  let menuPhase = $state<MenuPhase>("choose");
  let folderName = $state("");
  let destErrorMsg = $state("");
  let depositName = $state("");
  let depositFiles = $state(0);

  // === the one-flow option set (Archie-c367) ===========================================================
  /** The destination the author has selected. Null until the probe lands and pre-selects one. */
  let destination = $state<DestinationId | null>(null);
  /** Inventory progress, so a big library shows a number rather than an indeterminate spinner. */
  let probeDone = $state(0);
  let probeTotal = $state(0);
  /** The author's `remote:bucket` for the rclone hand-off. Placeholder until they type their own. */
  let rcloneRemote = $state("");
  let copiedRclone = $state(false);

  const rows = $derived(probe ? rowsFor(probe, tier) : []);
  const chosenRow = $derived(rows.find((r) => r.id === destination) ?? null);
  /** Publish is live only on an AVAILABLE destination. A refusal, never a redirect — the greyed row's
   *  own reason is already on screen saying why. */
  const canPublishHere = $derived(!!probe && !!destination && isPublishable(probe, destination, tier) && !blocksPublish(preflight));
  /** Non-empty exactly when NO (destination, tier) pair fits — the honest dead end, shown instead of a
   *  menu of four things that all refuse. */
  const deadEnd = $derived(probe !== null && probe.blockers.length > 0);

  /** Pre-select the probe's recommendation — the surface CONFIRMS a decision rather than posing a fresh
   *  one. Also pushes the tier into the ENGINE: a pre-checked control the engine cannot see would
   *  publish at a tier the surface never showed. */
  function applyRecommendation(p: ArchiveProbe): void {
    const initial = chooseInitial(p);
    if (!initial) { destination = null; return; }
    destination = initial.destination;
    if (initial.tier !== tier) ontier?.(initial.tier);
  }
  function selectDestination(id: DestinationId): void {
    destination = id;
    destErrorMsg = "";
  }
  /** Switching quality re-states every number on every row AND re-projects the next publish (the cache
   *  is keyed on the tier). A destination that stops fitting at the new tier is DESELECTED rather than
   *  silently carried — pressing Publish on a row whose own text says it does not fit is the swap in
   *  miniature. */
  function selectTier(t: QualityTier): void {
    ontier?.(t);
    if (probe && destination && !isPublishable(probe, destination, t)) destination = null;
  }

  const rcloneLines = $derived(rcloneCommands(folderName || "./my-library", rcloneRemote));
  function copyRclone() {
    navigator.clipboard.writeText(rcloneLines.join("\n"))
      .then(() => { copiedRclone = true; setTimeout(() => (copiedRclone = false), 1500); })
      .catch(() => { copiedRclone = false; });
  }

  // Feature flag (Task 13): when the build offers the one-motion desktop deploy, "Publish to the web" LEADS
  // the chooser (durability-first, Q-3). Off (a fork with no deploy infra) → today's quieter "To GitHub
  // Pages" card as the escape hatch; both route into the same wizard (the machine self-degrades honestly —
  // web-intro on the web, the token form via "I already use GitHub").
  const CANONICAL_VIEWER = `${archieConfig.canonicalOrigin}${archieConfig.viewerPath}`;
  const CANONICAL_HOST = new URL(CANONICAL_VIEWER).host;
  let zipUrl = $state("");
  let copied = $state(false);
  // Archie-4f7c: the grammar is `#/?src=` (INSIDE the hash), not `?src=`. Minted by share-link.ts so
  // it can be round-tripped against the viewer's own parseRoute in a test — a real query param is
  // invisible to the viewer, which reads only location.hash, so every link this emitted was dead.
  const shareLink = $derived(viewerShareLink(CANONICAL_VIEWER, zipUrl));
  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;
  function copyShareLink() {
    navigator.clipboard.writeText(shareLink)
      .then(() => { copied = true; setTimeout(() => (copied = false), 1500); })
      .catch(() => { copied = false; }); // permission denied — the link is still selectable above
  }
  // Embed snippet (contributor-broadening ⑩ slice A): TWO ways to embed, per the locked v1 contract
  // (ADR-0021) and the iframe floor (anvil ADR-0006).
  // @v1.1, NOT @v1: the v1 tag's dist/ predates the av-player chunk (git ls-tree v1 dist/ = 3 files)
  // — a copied snippet at @v1 loads a runtime with no audio/video. @v1.1 is what every recipe pins.
  const CDN_RUNTIME = "https://cdn.jsdelivr.net/gh/micahchoo/Archie@v1.1/dist/archie-viewer.js";
  // The closing script tag is split (`</scr" + "ipt>`) so the literal doesn't terminate THIS Svelte
  // <script> block — the snippet text is identical to recipes/README.md §1.
  const wcSnippet = $derived(zipUrl.trim() === "" ? "" :
`<script type="module" src="${CDN_RUNTIME}" crossorigin="anonymous"></scr` + `ipt>
<archie-viewer src="${zipUrl.trim()}"></archie-viewer>`);
  const embedSnippet = $derived(viewerEmbedSnippet(shareLink));
  let copiedWc = $state(false);
  let copiedEmbed = $state(false);
  function copyWc() {
    navigator.clipboard.writeText(wcSnippet)
      .then(() => { copiedWc = true; setTimeout(() => (copiedWc = false), 1500); })
      .catch(() => { copiedWc = false; });
  }
  function copyEmbed() {
    navigator.clipboard.writeText(embedSnippet)
      .then(() => { copiedEmbed = true; setTimeout(() => (copiedEmbed = false), 1500); })
      .catch(() => { copiedEmbed = false; });
  }

  // Whenever the surface (re)opens: reset the chooser's transient bits, then resume the wizard exactly
  // where it was left (a pending device code, an in-flight/finished publish) — or land fresh on step 1.
  //
  // MUST depend on `open` ONLY. `machine.open()` reads `machine.state` (its resumable-state guard), and
  // the menuPhase line reads it again directly — in Svelte 5 either read registers as an effect
  // dependency unless shielded, so every in-wizard transition (intro→advanced, a device-code poll landing
  // on name-site, a name-taken re-seed) would re-run this effect and call machine.open() again, which
  // recomputes/reseeds any non-resumable state right out from under the wizard. `untrack()` around
  // everything past the `open` check keeps those reads out of the dependency set, so this effect only
  // ever re-fires on an actual open/close of the surface — never on internal wizard transitions.
  // UNTESTABLE headlessly: vitest compiles runes for SSR here (no DOM/mount harness), so `$effect` never
  // runs in this suite — this class of bug (a self-resetting effect) only surfaces under a real Svelte
  // runtime. Verify in-browser post-merge; publish-machine.svelte.ts's own transition tests (Publish.test.ts)
  // are what stay headlessly testable.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      destErrorMsg = ""; zipUrl = ""; copied = false; copiedWc = false; copiedEmbed = false;
      machine.open();
      menuPhase = isResumableState(machine.state) ? "wizard" : "choose";
      // Probe the library on every open (Archie-c367). Not once-ever: the author edits between opens,
      // and a recommendation computed against a library three imports ago is worse than none. The pass
      // is chunked and yields (archive-inventory.ts), so this cannot wedge the surface while it opens.
      probeDone = 0; probeTotal = 0;
      void onprobe?.((done, total) => { probeDone = done; probeTotal = total; }).then((p) => { if (p) applyRecommendation(p); }).catch((e) => {
        // A failed probe degrades to "no recommendation" — every destination then draws as available
        // and the author picks. Logged rather than swallowed; a surface that silently shows a menu
        // where it promised a recommendation should say so somewhere.
        console.error("Publish: archive probe failed", e);
      });
    });
  });
  // Tick the device-code countdown once a second while it's showing AND the surface is open — no point
  // ticking a countdown nobody can see, and it keeps this effect quiet while the surface is closed.
  $effect(() => {
    if (!open || machine.state !== "device-code") return;
    const id = setInterval(() => machine.tick(), 1000);
    return () => clearInterval(id);
  });

  /** The folder sink, shared by the `folder` and `object-storage` destinations — object storage IS a
   *  folder plus an upload command (Archie-c85f decided Archie never handles credentials), so there is
   *  one writer and two success panels. `then` says which panel. A cancelled picker returns to the
   *  chooser rather than to a folder-specific screen; there is no folder-specific screen any more. */
  async function chooseFolder(then: "done-folder" | "done-object") {
    menuPhase = "working"; destErrorMsg = "";
    try {
      const name = await onfolder();
      if (name === null) { menuPhase = "choose"; return; } // cancelled the picker
      folderName = name;
      menuPhase = then;
    } catch (e) { destErrorMsg = e instanceof Error ? e.message : "Couldn't write to the folder."; menuPhase = "error"; }
  }
  /** The single Publish button's dispatch. Every branch here goes to the destination the author
   *  SELECTED — there is deliberately no `else` that falls back to another one. An unavailable
   *  destination cannot be selected (its radio is disabled and `canPublishHere` is false), so this is
   *  never reached with one. */
  function publishChosen() {
    if (!canPublishHere || !destination) return;
    if (destination === "github-pages") { void enterWizard(); return; }
    if (destination === "folder") { void chooseFolder("done-folder"); return; }
    if (destination === "object-storage") { void chooseFolder("done-object"); return; }
    openZipOptions();
  }
  /** "Deposit a copy" (Archie-039e) — an additional export action, not a destination row, exactly as
   *  this ticket's charting placed it. It answers a different question ("give me something a repository
   *  will accept") rather than a different where. */
  let depositing = $state(false);
  async function deposit() {
    if (!ondeposit) return;
    depositing = true; destErrorMsg = "";
    try {
      const r = await ondeposit();
      if (!r.saved) return; // guard declined / picker cancelled — say nothing, they already know
      depositName = r.name ?? "";
      depositFiles = r.payloadFiles ?? 0;
      menuPhase = "done-deposit";
    } catch (e) {
      destErrorMsg = e instanceof Error ? e.message : "Couldn't build the deposit copy.";
      menuPhase = "error";
    } finally { depositing = false; }
  }
  /** Step 1 → the GitHub wizard: run the size-guard + cache the projection, then enter — the guard's own
   *  confirm dialog is the feedback, so declining it just leaves the author on the chooser. */
  async function enterWizard() {
    if (await onenterweb()) menuPhase = "wizard";
  }
  /** In-surface "← Back" from the wizard's entry screens to step 1 (the modality contract's nested-flow
   *  rule) — NOT a close, so it never touches machine state. */
  function backToChooser() { menuPhase = "choose"; }
  // The single-file export reuses the working/error phases the other destinations use — same shape,
  // same recovery. `false` means the size guard declined, which already told the author why: return
  // to the chooser rather than showing a second, emptier message.
  async function exportSelfContained() {
    if (!onexportselfcontained) return;
    menuPhase = "working"; destErrorMsg = "";
    try {
      const r = await onexportselfcontained();
      if (r.ok) { menuPhase = "done-download"; return; }
      // A refusal, not a failure. The error phase is the honest home for it (it has the Back
      // affordance), but the copy must STEER rather than apologise — the author has a working
      // route, it just isn't this one.
      destErrorMsg = `This library is about ${r.mb} MB. A single file that size opens on a blank screen for several seconds, which reads as broken — so Archie doesn't make one. Use “Locally” or “Share a working copy” instead, or link large media by URL so the library references it rather than copying it in.`;
      menuPhase = "error";
    } catch (e) { destErrorMsg = e instanceof Error ? e.message : "Couldn't build the single-file export."; menuPhase = "error"; }
  }

  // === the zip export fields (ZipExportFields): name the file, pick the exhibits =======================
  // ONE state pair serves both zip surfaces (the working-copy panel and the local-publish fallback) —
  // they're re-armed on entry and never shown at once.
  let exportBase = $state(""); // file name without the .archie.zip suffix (shown as a fixed adornment)
  let exportSel = $state<Record<string, boolean>>({});
  let exporting = $state(false);
  const canExportNow = $derived(canExport(exportSel, exhibits));
  function armExportFields() {
    exportBase = baseNameOf(suggestedZipName);
    exportSel = allSelected(exhibits);
    destErrorMsg = "";
  }
  function openZipOptions() {
    armExportFields();
    menuPhase = "zip-options";
  }
  /** Save via the OS picker. Stay on the panel when nothing was saved (guard declined / picker
   *  cancelled) — done-download must never claim a save that didn't happen. */
  async function saveWorkingCopy() {
    exporting = true; destErrorMsg = "";
    try {
      if (await ondownload(exportOpts(exportBase, exportSel, exhibits))) menuPhase = "done-download";
    } catch (e) {
      destErrorMsg = e instanceof Error ? e.message : "Couldn't save the file.";
    } finally { exporting = false; }
  }

  function close() {
    menuPhase = "choose";
    destErrorMsg = "";
    zipUrl = ""; copied = false; copiedWc = false; copiedEmbed = false;
    token = ""; // never retain the advanced-form secret across a close
    advPhase = "idle";
    advProgress = null;
    onclose();
  }
  /** Dismiss a FINISHED wizard attempt (Done on success / Cancel on error) — unlike `close()`, this
   *  acknowledges the result so the next open recomputes a fresh entry screen (e.g. the return-visit
   *  update-confirm) instead of showing the same stale success/error screen forever. A close mid-flight —
   *  Esc, scrim-click, "← Back", or manual-pages' "I'll do it later" — must NEVER call this; only an
   *  explicit, deliberate dismissal of a completed attempt does. */
  function finishWizard() { machine.dismissResult(); close(); }

  // === the GitHub wizard (former Publish.svelte) ==========================================================
  // The commit link on the success screen (the ▸ Details disclosure).
  const commitUrl = $derived(
    machine.result ? `https://github.com/${machine.owner.trim()}/${machine.repo.trim()}/commit/${machine.result.commitSha}` : "",
  );
  // The return-visit confirm headline reads as a sentence, so show the bare host/path (no scheme/trailing
  // slash) — e.g. "micah.github.io/voynich-folios".
  const updateHost = $derived(machine.updateUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""));
  let showDetails = $state(false);
  let showDomain = $state(false); // success: the collapsed "Use your own domain" guidance (copy only)
  // The embed snippet for the LIVE SITE (Archie-c367 decided 2026-07-27: it moves onto the success
  // panel, because it is only meaningful once a URL exists). A published tree is self-contained and
  // served from its own origin, so the iframe points at the site itself — no `?src=` hop through the
  // canonical viewer, which is what the done-download panel's snippet is for (a zip has no address).
  let showEmbed = $state(false);
  let copiedSiteEmbed = $state(false);
  const sitEmbedSnippet = $derived(viewerEmbedSnippet(machine.result?.url ?? ""));
  function copySiteEmbed() {
    navigator.clipboard.writeText(sitEmbedSnippet)
      .then(() => { copiedSiteEmbed = true; setTimeout(() => (copiedSiteEmbed = false), 1500); })
      .catch(() => { copiedSiteEmbed = false; });
  }
  // GitHub's own custom-domain walkthrough — we point at it rather than automating CNAME (PRFAQ item 5).
  const CUSTOM_DOMAIN_DOCS = "https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages";

  // ===========================================================================================
  // Advanced (token) form — VERBATIM from the pre-Task-10 dialog. Its own local state + the legacy
  // `onpublish` prop; the machine above does not touch these. (CONTEXT: token not stored — it lives
  // only here for the duration of one publish and is dropped after.)
  // ===========================================================================================
  let includeOriginals = $state(false); // opt-in: ship preserved source originals for citation (CONTEXT §89.1)

  // A broken link's target, typed for display (the cited exhibit/note that isn't in this library).
  const tgt = (b: BrokenLink) => b.target as { exhibitSlug?: string; noteLogicalId?: string };

  // Torn-store advisory (Archie-a690), split on the load-bearing distinction: an all-corrupt store
  // drops that content from the export entirely (reads as never-authored); a partial one still ships
  // its readable pages. Reader-facing family words.
  // Preflight (Archie-0cd6 / Archie-8772), split by what the author can do about it. The severity
  // model is decided in render-core's preflight.ts and is NOT re-litigated here — this dialog groups
  // by it and honours `block`, which is the whole point of deciding it once.
  const blockers = $derived(preflight.filter((f) => f.severity === "block"));
  const preflightWarns = $derived(preflight.filter((f) => f.severity === "warn"));
  const rightsGap = $derived(preflight.find((f) => f.code === "rights-gap"));
  const gb = (bytes: number | undefined) => `${((bytes ?? 0) / 1e9).toFixed(2)} GB`;

  const lostLogs = $derived(corruptLogs.filter((c) => c.allCorrupt));
  const partialLogs = $derived(corruptLogs.filter((c) => !c.allCorrupt));
  const familyWord = (f: CorruptLogFinding["family"]) => (f === "annotations" ? "annotations" : "section history");

  let owner = $state("");
  let repo = $state("");
  let branch = $state("gh-pages");
  let token = $state("");
  let advPhase = $state<"idle" | "publishing" | "done" | "error">("idle");
  let commitUrlAdv = $state("");
  let pagesUrl = $state("");          // visitor-facing URL, returned by publishToGitHub (project- vs user-site aware)
  let pagesEnabled = $state(false);   // false ⇒ the push landed but Pages must be enabled manually
  let advErrorMsg = $state("");
  let advProgress = $state<PublishProgress | null>(null); // live step from publishToGitHub while publishing

  // Human-readable progress for the long push (media upload is one request per asset → show the count).
  // The republish case says what it SKIPPED as well as what it's sending: a publish that uploads 3 of
  // 4,132 files and one that uploads all 4,132 look identical without it (Archie-53e3).
  const progressText = $derived(
    advProgress?.phase === "comparing" ? "Checking what's already published…"
    : advProgress?.phase === "uploading"
      ? `Uploading media — ${advProgress.done} of ${advProgress.total}…${advProgress.unchanged > 0 ? ` (${advProgress.unchanged} already up to date)` : ""}`
    : advProgress?.phase === "committing" ? "Creating the commit…"
    : advProgress?.phase === "enabling-pages" ? "Turning on GitHub Pages…"
    : "Preparing the library…",
  );

  // Owner/repo are bare names — reject a pasted URL or "owner/repo" before it becomes a confusing 404.
  const nameError = $derived(
    /[/\s]/.test(owner.trim()) || /[/\s]/.test(repo.trim()) ? "Enter just the names — no slashes, spaces, or full URLs." : "",
  );
  // A `block` finding refuses the publish outright — the ONLY severity that does. `blocksPublish`
  // is render-core's single definition of that, not a second predicate written here.
  const canPublish = $derived(owner.trim() !== "" && repo.trim() !== "" && token.trim() !== "" && nameError === "" && advPhase !== "publishing" && !blocksPublish(preflight));
  // Where the author flips Pages on if we couldn't (private repo / token without Pages scope).
  const pagesSettingsUrl = $derived(`https://github.com/${owner.trim()}/${repo.trim()}/settings/pages`);

  async function advPublish() {
    advPhase = "publishing";
    advErrorMsg = "";
    advProgress = null;
    try {
      const target: GitHubTarget = { owner: owner.trim(), repo: repo.trim(), branch: branch.trim() || "gh-pages", token: token.trim() };
      const res = await onpublish(target, { includeOriginals }, (p) => (advProgress = p));
      commitUrlAdv = res.commitUrl;
      pagesUrl = res.pagesUrl;
      pagesEnabled = res.pagesEnabled;
      advPhase = "done";
      token = ""; // drop the secret the instant we're done with it
    } catch (e) {
      advErrorMsg = e instanceof Error ? e.message : "Couldn't publish. Check the repository name and that your token has Contents and Pages write access.";
      advPhase = "error";
      token = ""; // never retain the secret across an error either
    }
  }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={() => modality.dismiss()}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Publish" tabindex="-1"
    use:scrimmed={{ onClose: close }} onkeydown={trapFocus}>

    {#if menuPhase === "choose" && exhibits.length === 0}
      <!-- Refuse-and-explain on a library with nothing publishable in it. `exhibits` IS the publishable
           set — App passes `exportableExhibits`, the same `!isTemplate(slug)` filter `buildFullLibrary`
           applies via `workingToLibrary` — so this cannot drift from what a publish would actually ship;
           one predicate, read twice, rather than a second count that could disagree.
           Before this, every destination happily built a site with zero exhibits and said nothing: a
           fresh install (examples only) published an empty gallery and reported success. The working-copy
           panel was already unreachable here (its export button disables on an empty selection) but gave
           no reason, so this screen is also that missing explanation. -->
      <header>
        <p class="eyebrow">Publish</p>
        <h2>There's nothing to publish yet</h2>
        <p class="lede">The examples Archie ships with are a playground, not your content — publishing leaves them out. Right now that would build an empty site, so Archie won't build one.</p>
      </header>
      <p class="empty-note">Two ways on: start an exhibit of your own, or open an example and press <strong>Keep a copy</strong>. A copy belongs to you, and it publishes.</p>
      <div class="actions">
        <button type="button" class="ghost" onclick={close}>Close</button>
      </div>

    {:else if menuPhase === "choose"}
      <!-- ONE FLOW (Archie-c367). Four destinations, always all four, in a fixed order; the probe's
           recommendation arrives pre-selected; an unavailable one is greyed and carries its own reason.
           The old three-cards chooser is gone with its `local` sub-screen — three buttons that produced
           the same artifact read as three features, which is what caused the confusion this closes. -->
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Publish your library</h2>
        {#if probe}
          <p class="lede">{probe.folder.mediaFiles.toLocaleString()} {probe.folder.mediaFiles === 1 ? "item" : "items"} across {exhibits.length} {exhibits.length === 1 ? "exhibit" : "exhibits"}. Archie builds the same finished site whichever you pick — the differences are below.</p>
        {:else}
          <p class="lede">Archie builds the same finished site whichever you pick.</p>
        {/if}
      </header>

      {#if !probe && probing}
        <p class="note probe-status" role="status">
          <Spinner size={16} />
          Sizing your library{#if probeTotal > 0} — {probeDone.toLocaleString()} of {probeTotal.toLocaleString()} items{/if}…
        </p>
      {:else if deadEnd && probe}
        <!-- Nothing fits anywhere. A menu of four refusals is worse than one honest sentence, so the
             probe's own blockers replace the list. Every one of them names a number. -->
        <div class="broken blocker" role="alert">
          <p class="b-head">There's no route out for a library this size yet</p>
          {#each probe.blockers as b}<p class="b-sub">{b}</p>{/each}
        </div>
      {:else if probe}
        <fieldset class="dests">
          <legend>{probe.recommendation ? "Recommended for your archive" : "Where should this go?"}</legend>
          {#if probe.recommendation}<p class="rec-why">{probe.recommendation.why}</p>{/if}
          {#each rows as row (row.id)}
            <!-- The greyed row is a real, visible row with its real reason. It is NEVER dropped and
                 NEVER replaced by another destination — see export-surface.ts's header for the
                 defect that decided it. -->
            <label class="dest" class:unavailable={!row.available} class:chosen={destination === row.id}
              data-destination={row.id} data-available={row.available}>
              <input type="radio" name="destination" value={row.id} checked={destination === row.id}
                disabled={!row.available} onchange={() => selectDestination(row.id)} />
              <span class="d-main">
                <span class="d-title">
                  {row.label}
                  {#if row.recommended}<span class="d-rec">Recommended</span>{/if}
                </span>
                <span class="d-reason" class:refusal={!row.available}>{row.reason}</span>
                <span class="d-blurb">{row.blurb}</span>
                {#if row.available}<span class="d-facts">{row.facts}</span>{/if}
              </span>
            </label>
          {/each}
        </fieldset>

        <fieldset class="tiers">
          <legend>Quality</legend>
          {#each ["archival", "web"] as const as t}
            <label class="tier" class:chosen={tier === t}>
              <input type="radio" name="quality" value={t} checked={tier === t} onchange={() => selectTier(t)} />
              <span class="d-main">
                <span class="d-title">{TIER_LABEL[t]}{#if probe}<span class="t-size">{humanBytes(probe.tiers[t].publishedBytes)}</span>{/if}</span>
                <span class="d-blurb">{TIER_BLURB[t]}</span>
              </span>
            </label>
          {/each}
        </fieldset>

        {#if unscaledSelectors.length > 0}
          <!-- The web tier's residual correctness finding (Archie-4b0a): a selector the scaler refused
               to move rather than mangle. Rare, specific, and the author can act on it — so it is said
               here, before they publish, rather than only in the console. -->
          <div class="broken" role="status">
            <p class="b-head">{unscaledSelectors.length} {unscaledSelectors.length === 1 ? "note lands" : "notes land"} in the wrong place at Web quality</p>
            <p class="b-sub">These were drawn with a shape Archie can't resize exactly, so on a resized image they'll sit off their subject. Publishing at Archival quality places them correctly.</p>
            <ul>
              {#each unscaledSelectors.slice(0, 5) as u}<li><code>/{u.exhibitSlug}</code> · {u.reason}</li>{/each}
              {#if unscaledSelectors.length > 5}<li class="more">…and {unscaledSelectors.length - 5} more</li>{/if}
            </ul>
          </div>
        {/if}
      {:else}
        <!-- No probe seam at all (a host that did not wire one). A stated absence, not a fake menu. -->
        <p class="note">Archie couldn't size your library, so there's no recommendation this time. Pick a destination and it will tell you if it doesn't fit.</p>
        <div class="choices">
          <button class="choice" onclick={enterWizard}><span class="c-title">GitHub Pages</span></button>
          <button class="choice" onclick={openZipOptions}><span class="c-title">One .zip file</span></button>
        </div>
      {/if}

      <div class="actions">
        {#if previewtree}
          <!-- Not a destination — a secondary action. Reads as "see it before you decide." -->
          <button type="button" class="ghost" onclick={() => (menuPhase = "preview")}>Preview as reader</button>
        {/if}
        <button type="button" class="ghost" onclick={close}>Cancel</button>
        {#if probe && !deadEnd}
          <button class="primary" disabled={!canPublishHere} onclick={publishChosen}>Publish</button>
        {/if}
      </div>

      {#if probe && !deadEnd && (ondeposit || onexportselfcontained)}
        <!-- ADDITIONAL EXPORT ACTIONS, deliberately not destination rows (this ticket's charting).
             They answer "give me a file of a particular shape", not "where does the site go" — folding
             them into the radio list would put four wheres and two whats in one column. -->
        <div class="extras">
          <p class="x-head">Also, whenever you need one:</p>
          {#if ondeposit}
            <button type="button" class="x-btn" data-action="deposit" disabled={depositing} onclick={deposit}>
              <span class="x-title">{depositing ? "Building the deposit copy…" : "Deposit a copy"}</span>
              <span class="x-desc">Every published file with a checksum beside it, in the BagIt layout repositories ask for. What you hand an archive when they need to prove nothing changed.</span>
            </button>
          {/if}
          {#if onexportselfcontained}
            <button type="button" class="x-btn" data-action="single-file" onclick={exportSelfContained}>
              <span class="x-title">One <code>.html</code> file</span>
              <span class="x-desc">The library <em>and</em> a reader in a single file that opens by double-click — no server, no account, no internet. Search isn't in it. Best for a USB stick or an attachment.</span>
            </button>
          {/if}
        </div>
      {/if}

    {:else if menuPhase === "preview" && previewtree}
      <ViewerPreview {previewtree} onback={backToChooser} />

    {:else if menuPhase === "zip-options"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Share a working copy</h2>
        <p class="lede">Name the file and choose what goes in it.</p>
      </header>
      <div class="body">
        <ZipExportFields {exhibits} bind:name={exportBase} bind:selected={exportSel}
          subsetWarning="Notes that link to an exhibit you've left out will show as plain text in the copy." />
        {#if destErrorMsg}<p class="err">⚠ {destErrorMsg}</p>{/if}
        <div class="actions">
          <button type="button" class="ghost" onclick={backToChooser}>← Back</button>
          <!-- Stay here until the save actually happens (the OS picker is modal anyway) — done-download
               must never claim a save the user cancelled. -->
          <button class="primary" disabled={exporting || !canExportNow} onclick={saveWorkingCopy}>{exporting ? "Saving…" : "Save copy"}</button>
        </div>
      </div>

    {:else if menuPhase === "done-download"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Share a working copy</h2>
        <p class="lede">A copy of your library, ready to hand off — someone else can open it, add their own notes, and send it back to you.</p>
      </header>
      <div class="result">
        <p class="ok">Downloaded your <code>.archie.zip</code>.</p>
        {#if missingAssets.length > 0}
          <!-- The round-trip-loss advisory (2026-07-19): a saved zip that references images it
               doesn't contain must say so HERE, on the flow that produced it — the console warn
               alone let an assetless export pass for a complete one. -->
          <div class="broken" role="status">
            <p class="b-head">{missingAssets.length} {missingAssets.length === 1 ? "image isn't" : "images aren't"} in the saved file</p>
            <p class="b-sub">Their files weren't in this library's storage, so anyone opening the copy will see broken images there. This usually means the library was opened from a copy that didn't carry its image files — re-add the originals, then save again.</p>
            <ul>
              {#each missingAssets.slice(0, 5) as m}
                <li><code>/{m.exhibitSlug}</code> · {m.name}</li>
              {/each}
              {#if missingAssets.length > 5}<li class="more">…and {missingAssets.length - 5} more</li>{/if}
            </ul>
          </div>
        {/if}
        <p class="line"><strong>Working with someone?</strong> Send them the file — they open it in their own Archie, annotate their pass, and send it back. Open their copy here and Archie shows who added what.</p>
        <p class="line">Keep it yourself too, as a backup or to re-open here any time.</p>
        <p class="line"><strong>Share it as a link (no install for the reader):</strong> upload the zip anywhere public — your site, a GitHub release, the Internet Archive — then paste its URL:</p>
        <input class="share-url" type="url" placeholder="https://…/my-library.archie.zip" bind:value={zipUrl} aria-label="Public URL of the uploaded .archie.zip" />
        {#if shareLink}
          <pre class="cmd"><code>{shareLink}</code></pre>
          <p class="line">Or embed the exhibit in a blog, LMS page, or site. Two ways:</p>
          <p class="line"><strong>Web Component</strong> <span class="muted">— the recommended embed: a one-time script tag plus an <code>&lt;archie-viewer&gt;</code> element. Paste both into an HTML/code block.</span></p>
          <pre class="cmd"><code>{wcSnippet}</code></pre>
          <p class="line"><strong>iframe</strong> <span class="muted">— the fallback for hosts that strip scripts / custom elements (Notion, Substack, Squarespace, locked-down WordPress).</span></p>
          <pre class="cmd"><code>{embedSnippet}</code></pre>
          {#if canCopy}
            <div class="actions share-actions">
              <button type="button" class="ghost" onclick={copyShareLink}>{copied ? "Copied" : "Copy link"}</button>
              <button type="button" class="ghost" onclick={copyWc}>{copiedWc ? "Copied" : "Copy Web Component"}</button>
              <button type="button" class="ghost" onclick={copyEmbed}>{copiedEmbed ? "Copied" : "Copy iframe"}</button>
            </div>
          {:else}
            <p class="line muted">Select the link or embed code above to copy it.</p>
          {/if}
        {/if}
        <p class="line muted">This link depends on two things staying online: the place you uploaded the zip, and the Archie viewer at <code>{CANONICAL_HOST}</code>. If either moves or goes away, the link stops working — so it's best for sharing a draft, not for a permanent citation. To publish something that stands on its own, use "To GitHub Pages" instead.</p>
        <div class="actions"><button class="primary" onclick={close}>Done</button></div>
      </div>

    {:else if menuPhase === "done-folder"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Your site is in <code>{folderName}</code>.</h2>
        <p class="lede">A finished website — every page, image and note, no server needed to build it.</p>
      </header>
      <div class="result">
        <p class="ok">Written.</p>
        <p class="line">Upload the whole folder to any web host and it works as it is. Re-publish here any time — Archie replaces what's there and clears out what you deleted.</p>
        <p class="line">To look at it first, serve the folder locally:</p>
        <pre class="cmd"><code>pnpm --filter @archie/viewer dev</code></pre>
        <p class="line muted">Then open <code>http://localhost:4321</code>.</p>
        {#if missingAssets.length > 0}
          <div class="broken" role="status">
            <p class="b-head">{missingAssets.length} {missingAssets.length === 1 ? "image isn't" : "images aren't"} in the folder</p>
            <p class="b-sub">Their files weren't in this library's storage, so those images will be broken for anyone reading the site. Re-add the originals, then publish again.</p>
          </div>
        {/if}
        <div class="actions"><button class="primary" onclick={close}>Done</button></div>
      </div>

    {:else if menuPhase === "done-object"}
      <!-- OBJECT STORAGE (Archie-c85f): Archie writes the folder and hands over the command. It never
           holds a credential on any platform — no S3 client, no keyring, not even on desktop where
           Tauri's native HTTP would have made it easy. That was decided, and this panel is the whole
           of what Archie does about it. -->
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Your site is ready to upload.</h2>
        <p class="lede">Archie wrote it into <code>{folderName}</code>. Two commands send it to your bucket — Archie never sees your keys.</p>
      </header>
      <div class="result">
        <label class="field remote-field">Your bucket
          <input class="filter" bind:value={rcloneRemote} placeholder={RCLONE_REMOTE_PLACEHOLDER}
            autocomplete="off" spellcheck="false" aria-label="Your rclone remote and bucket" />
        </label>
        <p class="line">That's the remote name you set up in rclone, then a colon, then your bucket.</p>
        <!-- TWO passes, and the order is the point: `archie.json` is the marker that says the tree is
             complete, so it must land LAST. A plain `rclone sync` transfers concurrently with no
             ordering guarantee and was measured putting the marker FIRST — a reader mid-sync then sees
             a valid-looking marker over half a library. -->
        <pre class="cmd"><code>{rcloneLines[0]}
{rcloneLines[1]}</code></pre>
        <p class="line muted">The second line is not optional. It sends the one small file that tells a reader the library is complete, and it has to arrive after everything else.</p>
        {#if canCopy}
          <div class="actions share-actions">
            <button type="button" class="ghost" onclick={copyRclone}>{copiedRclone ? "Copied" : "Copy both commands"}</button>
          </div>
        {/if}
        <p class="line"><strong>One setting on the bucket.</strong> {BUCKET_CORS_NOTE}</p>
        <p class="line muted">Changed something later? Publish into the same folder and run the two commands again — rclone works out what actually moved and sends only that.</p>
        <p class="line muted">New to rclone? It's a free command-line tool for copying files to storage buckets. Its own docs walk through connecting a bucket once, after which these two lines are all you ever run.</p>
        <div class="actions"><button class="primary" onclick={close}>Done</button></div>
      </div>

    {:else if menuPhase === "done-deposit"}
      <header>
        <p class="eyebrow">Publish</p>
        <h2>Your deposit copy is saved.</h2>
        <p class="lede">The whole library, with a checksum recorded for every file in it.</p>
      </header>
      <div class="result">
        <p class="ok">Saved {depositName || "the deposit copy"}.</p>
        {#if depositFiles > 0}<p class="line">{depositFiles.toLocaleString()} files, each with its own SHA-256.</p>{/if}
        <p class="line">It's a <strong>BagIt bag</strong> — the layout most repositories ask for. Whoever receives it can check every file against its checksum and prove nothing changed on the way, years later.</p>
        <p class="line muted">Your files are under <code>data/</code>. <code>manifest-sha256.txt</code> holds the checksums and <code>bag-info.txt</code> says where it came from.</p>
        <div class="actions"><button class="primary" onclick={close}>Done</button></div>
      </div>

    {:else if menuPhase === "wizard"}
      {#if machine.state === "intro-desktop"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>Put this on the web — free, and it's yours.</h2>
          <p class="lede">Archie publishes your library as a real website on GitHub Pages. It's free, permanent, and the address belongs to you.</p>
        </header>
        <div class="stack">
          {#if machine.canContinueWithGitHub}
            <button class="primary big" onclick={() => machine.continueWithGitHub()}>Continue with GitHub</button>
          {/if}
          <div class="quiet-links">
            <button type="button" class="text-link linkish" onclick={() => defaultOpenUrl("https://github.com/signup")}>No GitHub account? Make one free</button>
            <button type="button" class="text-link linkish" onclick={() => machine.openAdvanced()}>I already use GitHub →</button>
          </div>
        </div>
        <div class="actions"><button type="button" class="ghost" onclick={backToChooser}>← Back</button></div>

      {:else if machine.state === "device-code"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>One quick step to connect.</h2>
        </header>
        <div class="stack">
          <div class="code-row">
            <span class="code" aria-label="Your one-time code">{machine.code?.userCode}</span>
            <button type="button" class="ghost" onclick={() => machine.copyCode()}>Copy code</button>
          </div>
          <button class="primary" onclick={() => machine.openDevicePage()}>Open GitHub to enter it</button>
          <p class="note">Paste the code there and click Authorize. We'll pick it up automatically — come back here.</p>
          <p class="waiting" role="status">
            <Spinner size={16} />
            Waiting for you to authorize… <span class="muted">(expires {machine.countdownLabel})</span>
          </p>
        </div>
        <!-- ‹Back› (SHOULD-FIX 1): the parked device code is otherwise a dead end for the rest of the
             session — reopening always resumes straight back here (isResumableState), so without an
             in-surface escape the local/zip destinations become unreachable until the code is abandoned
             or expires. Back only swaps the visible phase — the machine (and the pending code) is
             untouched, matching Cancel's resumability. Cancel itself is a CLEAN, session-resumable cancel
             (Archie-7d9b): the machine keeps this pending code, and reopening lands right back on this
             screen with the same code — no warning needed. -->
        <div class="actions">
          <button type="button" class="ghost" onclick={backToChooser}>← Back</button>
          <button type="button" class="ghost" onclick={close}>Cancel</button>
        </div>

      {:else if machine.state === "auth-expired"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>That sign-in code expired.</h2>
          <p class="lede">Start again to get a new one.</p>
        </header>
        <div class="actions">
          <button type="button" class="ghost" onclick={backToChooser}>← Back</button>
          <!-- The code is dead — nothing left here to resume, so Cancel ACKNOWLEDGES (finishWizard) rather
               than just closing, so the next open computes a fresh entry screen instead of re-showing this
               same dead-end sentinel forever. -->
          <button type="button" class="ghost" onclick={finishWizard}>Cancel</button>
          <button class="primary" onclick={() => machine.retryAuth()}>Start again</button>
        </div>

      {:else if machine.state === "auth-cancelled"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>Sign-in was cancelled.</h2>
          <p class="lede">No problem — try again when you're ready.</p>
        </header>
        <div class="actions">
          <button type="button" class="ghost" onclick={close}>Cancel</button>
          <button class="primary" onclick={() => machine.retryAuth()}>Try again</button>
        </div>

      {:else if machine.state === "auth-config-error"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>GitHub sign-in isn't set up.</h2>
          <p class="lede">{machine.errorCopy.message}</p>
        </header>
        <div class="actions">
          <button type="button" class="ghost" onclick={close}>Cancel</button>
          <button class="primary" onclick={() => machine.openAdvanced()}>I already use GitHub →</button>
        </div>

      {:else if machine.state === "update-confirm"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>Update {updateHost} with your latest changes?</h2>
          <p class="lede">One click republishes everything in your library right now to the site you already made — no re-typing, no signing in again.</p>
        </header>
        <div class="stack">
          <div class="quiet-links">
            <button type="button" class="text-link linkish" onclick={() => machine.publishElsewhere()}>Publish somewhere else…</button>
          </div>
          {#if machine.session}
            <p class="signed-in">Signed in as <span class="handle">@{machine.session.login}</span> · <button type="button" class="text-link linkish inline" onclick={() => machine.signOut()}>Sign out</button></p>
          {/if}
        </div>
        <div class="actions">
          <button type="button" class="ghost" onclick={close}>Cancel</button>
          <button class="primary" onclick={() => machine.publishUpdate()}>Publish update</button>
        </div>

      {:else if machine.state === "name-site"}
        <header>
          <p class="eyebrow">Publish{#if machine.session}<span class="handle"> · @{machine.session.login}</span>{/if}</p>
          <h2>Name your site.</h2>
        </header>
        <div class="stack">
          <label class="field">Site name<input bind:value={machine.repo} autocomplete="off" spellcheck="false" /></label>
          {#if machine.nameError}
            <p class="err">{machine.nameError}</p>
          {:else}
            <p class="note">Letters, numbers and dashes. This becomes part of your web address.</p>
          {/if}
          {#if machine.sitePreview}
            <div class="preview">
              <span class="preview-label">Your site will live at</span>
              <span class="preview-url">{machine.sitePreview.url}{#if machine.sitePreview.isUserSite} <span class="muted">(your main site)</span>{/if}</span>
              {#if !machine.sitePreview.isUserSite}
                <span class="preview-tip">Name it <code>{machine.sitePreview.userSiteName}</code> to publish to your top-level address.</span>
              {/if}
            </div>
          {/if}
          <!-- Public-only at launch (PRFAQ): shown as a checked, non-editable reassurance — never the word "private". -->
          <label class="cb"><input type="checkbox" checked disabled /><span class="cb-text">Anyone with the link can see it <span class="cb-sub">— published sites are public for now</span></span></label>
          <label class="cb"><input type="checkbox" bind:checked={machine.staySignedIn} /><span class="cb-text">Stay signed in on this computer</span></label>
          {#if listRepos}
            <button type="button" class="text-link linkish" onclick={() => machine.openPicker()}>Update an existing site instead…</button>
          {/if}
        </div>
        <div class="actions">
          <button type="button" class="ghost" onclick={close}>Cancel</button>
          <button class="primary" disabled={!machine.canPublish} onclick={() => machine.publish()}>Publish</button>
        </div>

      {:else if machine.state === "name-taken"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>You already have a site called {machine.repo}.</h2>
          <p class="lede">Pick another name, or update the site that's already there with your latest changes.</p>
        </header>
        <div class="actions">
          <button type="button" class="ghost" onclick={() => machine.useNewName()}>Use a new name</button>
          <button class="primary" onclick={() => machine.updateExisting()}>Update the existing site</button>
        </div>

      {:else if machine.state === "repo-picker"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>Update an existing site.</h2>
          <p class="lede">Pick one of your GitHub repositories to publish this library into.</p>
        </header>
        <div class="stack">
          <input class="filter" placeholder="Search your repositories…" bind:value={machine.repoFilter} autocomplete="off" />
          <ul class="repo-list">
            {#each machine.filteredRepos as name}
              <li><button type="button" class="repo-item" onclick={() => machine.chooseRepo(name)}>{name}</button></li>
            {:else}
              <li class="repo-empty">No repositories match.</li>
            {/each}
          </ul>
        </div>
        <div class="actions"><button type="button" class="ghost" onclick={() => machine.useNewName()}>← Back</button></div>

      {:else if machine.state === "publishing"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>Publishing…</h2>
        </header>
        <ul class="checklist">
          {#each machine.steps as step}
            <li class={step.status}>
              <span class="tick" aria-hidden="true">{step.status === "done" ? "✓" : step.status === "active" ? "" : "○"}</span>
              {#if step.status === "active"}<Spinner size={13} />{/if}
              <span class="step-label">{step.label}</span>
            </li>
          {/each}
          {#if machine.buildingPages}
            <li class="active"><Spinner size={13} /><span class="step-label">GitHub is building your site…</span></li>
          {/if}
        </ul>
        <p class="note">This usually takes under a minute. You can leave this open.</p>

      {:else if machine.state === "success"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>Your site is live.</h2>
        </header>
        <div class="stack">
          <a class="text-link hero-url" href={machine.result?.url} target="_blank" rel="noopener" onclick={(e) => externalAnchor(e, machine.result?.url)}>{machine.result?.url}</a>
          <div class="hero-actions">
            <button class="primary" onclick={() => machine.openSite()}>Open my site</button>
            <button type="button" class="ghost" onclick={() => machine.copyLink()}>Copy link</button>
          </div>
          <p class="note">GitHub may take a minute to finish the first build — if it's blank, refresh in a moment.</p>
          <p class="note">Made changes? Just hit <strong>Publish</strong> again — it updates the same site.</p>
          <!-- THE EMBED SNIPPET LIVES HERE (Archie-c367, decided 2026-07-27), and only here: it is
               meaningless until a URL exists, so the chooser was the wrong home for it. The site's own
               address is what goes in the iframe, so this is the first moment it can be written. -->
          {#if machine.result?.url}
            <div class="details">
              <button type="button" class="text-link linkish" onclick={() => (showEmbed = !showEmbed)}>{showEmbed ? "▾" : "▸"} Put an exhibit inside another page</button>
              {#if showEmbed}
                <p class="note">Paste this into a blog post, a course page, or your own site — readers get the exhibit without leaving the page.</p>
                <pre class="cmd"><code>{sitEmbedSnippet}</code></pre>
                {#if canCopy}
                  <div class="actions share-actions">
                    <button type="button" class="ghost" onclick={copySiteEmbed}>{copiedSiteEmbed ? "Copied" : "Copy embed code"}</button>
                  </div>
                {:else}
                  <p class="note muted">Select the code above to copy it.</p>
                {/if}
              {/if}
            </div>
          {/if}
          {#if machine.persistFailed}
            <p class="note muted">We couldn't keep you signed in on this computer — you'll sign in again next time.</p>
          {/if}
          <div class="details">
            <button type="button" class="text-link linkish" onclick={() => (showDomain = !showDomain)}>{showDomain ? "▾" : "▸"} Use your own domain</button>
            {#if showDomain}
              <p class="note">Want <code>library.yoursite.com</code> instead? GitHub Pages lets you point your own domain at this site — you add the domain in the repository's Pages settings and a matching record at your domain host. <a href={CUSTOM_DOMAIN_DOCS} target="_blank" rel="noopener" onclick={(e) => externalAnchor(e, CUSTOM_DOMAIN_DOCS)}>GitHub's guide walks through it.</a></p>
            {/if}
          </div>
          <div class="details">
            <button type="button" class="text-link linkish" onclick={() => (showDetails = !showDetails)}>{showDetails ? "▾" : "▸"} Details</button>
            {#if showDetails}
              <p class="note"><a href={commitUrl} target="_blank" rel="noopener" onclick={(e) => externalAnchor(e, commitUrl)}>Commit {machine.result?.commitSha.slice(0, 7)}</a></p>
            {/if}
          </div>
        </div>
        <!-- Done ACKNOWLEDGES this result (finishWizard, not close) — the next open recomputes the normal
             entry screen (a return-visit lands on update-confirm) instead of re-showing this success screen. -->
        <div class="actions"><button type="button" class="ghost" onclick={finishWizard}>Done</button></div>

      {:else if machine.state === "manual-pages"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>Almost done — one quick switch on GitHub.</h2>
          <p class="lede">Your library is uploaded. GitHub couldn't turn the site on automatically for this repository, so flip it on yourself — it takes about thirty seconds.</p>
        </header>
        <div class="stack">
          <ol class="steps">
            <li>Open <a href={machine.pagesSettingsUrl} target="_blank" rel="noopener" onclick={(e) => externalAnchor(e, machine.pagesSettingsUrl)}>your repository's Settings › Pages</a>.</li>
            <li>Under <strong>Build and deployment</strong>, set <em>Source</em> to <strong>Deploy from a branch</strong>.</li>
            <li>Choose the <code>gh-pages</code> branch and the <code>/ (root)</code> folder, then <strong>Save</strong>.</li>
          </ol>
          {#if machine.recheckSaysOff}
            <p class="note warn">GitHub still shows the site as off. Give it a moment after saving, then check again.</p>
          {/if}
          <p class="note">Once you've saved, your site will live at <a href={machine.result?.url} target="_blank" rel="noopener" onclick={(e) => externalAnchor(e, machine.result?.url)}>{machine.result?.url}</a>.</p>
        </div>
        <div class="actions">
          <!-- "Later" is a plain close (stays resumable) — the site IS live, but Pages isn't flipped on
               yet, so reopening should remind the author, not silently drop them into a fresh entry. -->
          <button type="button" class="ghost" onclick={close}>I'll do it later</button>
          {#if machine.canRecheck}
            <button class="primary" disabled={machine.recheckPending} onclick={() => machine.recheck()}>{machine.recheckPending ? "Checking…" : "I did it — recheck"}</button>
          {/if}
        </div>

      {:else if machine.state === "error"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>Something went wrong.</h2>
          <p class="lede">{machine.errorCopy.message}</p>
        </header>
        <div class="actions">
          <button type="button" class="ghost" onclick={finishWizard}>Cancel</button>
          {#if machine.errorCopy.offerSignInAgain}
            <button class="primary" onclick={() => machine.signInAgain()}>Sign in again</button>
          {:else}
            <button class="primary" onclick={() => machine.retryPublish()}>Try again</button>
          {/if}
        </div>

      {:else if machine.state === "web-intro"}
        <header>
          <p class="eyebrow">Publish</p>
          <h2>Share your library.</h2>
          <p class="lede">GitHub sign-in can't run safely from a browser tab, so the one-button publish lives in the Archie desktop app. From here you can still share your library as a link.</p>
        </header>
        <div class="stack">
          <button class="primary" onclick={backToChooser}>Share with a link</button>
          <p class="note">Want a permanent site you own? Open Archie on your desktop to publish straight to GitHub Pages.</p>
          <div class="quiet-links">
            <button type="button" class="text-link linkish" onclick={() => machine.openAdvanced()}>I already use GitHub →</button>
          </div>
        </div>
        <div class="actions"><button type="button" class="ghost" onclick={backToChooser}>← Back</button></div>

      {:else if machine.state === "advanced"}
        <!-- ADVANCED (token) form — verbatim pre-Task-10 dialog. -->
        <header>
          <p class="eyebrow">Publish</p>
          <h2>Connect to GitHub</h2>
          <p class="lede">Publish your whole library, every exhibit, to a GitHub Pages branch. Your token is used once to publish and is never stored.</p>
        </header>

        {#if advPhase === "done"}
          <div class="result">
            <p class="ok">Published to GitHub Pages.</p>
            <p class="line">Commit · <a href={commitUrlAdv} target="_blank" rel="noopener" onclick={(e) => externalAnchor(e, commitUrlAdv)}>{commitUrlAdv}</a></p>
            {#if pagesEnabled}
              <p class="line">Pages · <a href={pagesUrl} target="_blank" rel="noopener" onclick={(e) => externalAnchor(e, pagesUrl)}>{pagesUrl}</a> <span class="muted">(may take a minute to go live)</span></p>
            {:else}
              <p class="line">Your files are on the <code>{branch}</code> branch. One step left to put them on the web: turn on GitHub Pages for this repository.</p>
              <p class="line">Open <a href={pagesSettingsUrl} target="_blank" rel="noopener" onclick={(e) => externalAnchor(e, pagesSettingsUrl)}>Settings, then Pages</a>, choose <em>Deploy from a branch</em>, and pick the <code>{branch}</code> branch. Your site then appears at <a href={pagesUrl} target="_blank" rel="noopener" onclick={(e) => externalAnchor(e, pagesUrl)}>{pagesUrl}</a>.</p>
            {/if}
            <p class="line muted">A published Pages site is read-only. To keep editing, open your library in Studio.</p>
            <button class="primary" onclick={close}>Done</button>
          </div>
        {:else}
          <form onsubmit={(e) => { e.preventDefault(); if (canPublish) void advPublish(); }}>
            {#if brokenLinks.length > 0}
              <div class="broken" role="status">
                <p class="b-head">{brokenLinks.length} cited {brokenLinks.length === 1 ? "link" : "links"} will publish as plain text</p>
                <p class="b-sub">These links point to a note or exhibit that isn't in this library, so they have nowhere to go. Publishing continues — the words stay readable, just without the link.</p>
                <ul>
                  {#each brokenLinks.slice(0, 5) as b}
                    <li>in <code>/{b.exhibitSlug}</code>{#if tgt(b).exhibitSlug} → <code>/{tgt(b).exhibitSlug}</code>{/if}{#if tgt(b).noteLogicalId} · a cited note{/if}</li>
                  {/each}
                  {#if brokenLinks.length > 5}<li class="more">…and {brokenLinks.length - 5} more</li>{/if}
                </ul>
              </div>
            {/if}
            {#if missingAssets.length > 0}
              <div class="broken" role="status">
                <p class="b-head">{missingAssets.length} {missingAssets.length === 1 ? "image isn't" : "images aren't"} in this library's storage</p>
                <p class="b-sub">The published site will reference these images but can't show them. This usually means the library was opened from a copy that didn't carry its image files — re-add the originals to fix it, or publish anyway with those images broken.</p>
                <ul>
                  {#each missingAssets.slice(0, 5) as m}
                    <li><code>/{m.exhibitSlug}</code> · {m.name}</li>
                  {/each}
                  {#if missingAssets.length > 5}<li class="more">…and {missingAssets.length - 5} more</li>{/if}
                </ul>
              </div>
            {/if}
            {#if incompleteCanvases.length > 0}
              <div class="broken" role="status">
                <p class="b-head">{incompleteCanvases.length} {incompleteCanvases.length === 1 ? "image has" : "images have"} no known width/height</p>
                <p class="b-sub">Some IIIF viewers need an image's pixel dimensions to display it — these will still publish, but may not render correctly outside Archie. This usually means the image couldn't be loaded when added; try re-adding it.</p>
                <ul>
                  {#each incompleteCanvases.slice(0, 5) as c}
                    <li>{c.label}</li>
                  {/each}
                  {#if incompleteCanvases.length > 5}<li class="more">…and {incompleteCanvases.length - 5} more</li>{/if}
                </ul>
              </div>
            {/if}
            <!-- PREFLIGHT (Archie-0cd6 / Archie-8772), rendered into the advisory surface this dialog
                 already has rather than a panel of its own — the batch note's whole point. The three
                 severities read differently on purpose: a blocker states what will happen and that
                 Publish is off; a warn states the degradation and lets you through; the rights report
                 states a fact and asks nothing. -->
            {#each blockers as b}
              <div class="broken blocker" role="alert">
                {#if b.code === "lfs-pointer"}
                  <p class="b-head">{b.count} {b.count === 1 ? "file is" : "files are"} a Git LFS placeholder, not the real image</p>
                  <p class="b-sub">These files hold a few lines of text pointing at an image stored elsewhere, not the image itself — and a published site serves that text, so every one of them would appear broken to your readers. Publishing is off until they're replaced. This usually means the library came from a checkout that didn't download its large files; fetch them, then re-add the images.</p>
                {/if}
                <ul>
                  {#each b.examples as e}<li><code>{e}</code></li>{/each}
                  {#if b.count > b.examples.length}<li class="more">…and {b.count - b.examples.length} more</li>{/if}
                </ul>
              </div>
            {/each}
            {#each preflightWarns as w}
              <div class="broken" role="status">
                {#if w.code === "tree-size"}
                  <p class="b-head">This library is {gb(w.bytes)} — over GitHub's {gb(REPO_SIZE_SOFT_LIMIT_BYTES)} guideline</p>
                  <p class="b-sub">Publishing will still work. GitHub asks repositories to stay under this size and may email you about it; if that becomes a problem, publishing fewer exhibits at a time is the usual answer.</p>
                {:else if w.code === "no-404"}
                  <p class="b-head">No “page not found” page</p>
                  <p class="b-sub">Your site works without one. A reader who mistypes a link will see your host's default error page instead of yours.</p>
                {/if}
              </div>
            {/each}
            {#if rightsGap}
              <!-- REPORT, never a gate: which items carry a licence is a curatorial decision, and a
                   tool that blocked on it would be asserting an editorial policy it has no standing
                   to assert. It says what is missing and gets out of the way. -->
              <div class="broken report" role="status">
                <p class="b-head">{rightsGap.count} {rightsGap.count === 1 ? "item has" : "items have"} no credit or licence</p>
                <p class="b-sub">Nothing is wrong — this is just what your published site will say about who owns what. Add a credit or a licence in each item's details if you want it shown.</p>
                <ul>
                  {#each rightsGap.examples as e}<li><code>{e}</code></li>{/each}
                  {#if rightsGap.count > rightsGap.examples.length}<li class="more">…and {rightsGap.count - rightsGap.examples.length} more</li>{/if}
                </ul>
              </div>
            {/if}
            {#if lostLogs.length > 0}
              <div class="broken" role="status">
                <p class="b-head">Some saved work won't be in the published site</p>
                <p class="b-sub">These histories can't be read at all, so the site will look as if that content was never made. Publishing goes ahead without them — your local copy is untouched, so you can repair it and publish again.</p>
                <ul>
                  {#each lostLogs.slice(0, 5) as c}
                    <li><code>/{c.slug}</code> · {familyWord(c.family)}</li>
                  {/each}
                  {#if lostLogs.length > 5}<li class="more">…and {lostLogs.length - 5} more</li>{/if}
                </ul>
              </div>
            {/if}
            {#if partialLogs.length > 0}
              <div class="broken" role="status">
                <p class="b-head">Some saved work is partly unreadable — the readable part still publishes</p>
                <p class="b-sub">A few history pages couldn't be read and are skipped; everything readable publishes as usual. Your local copy is untouched.</p>
                <ul>
                  {#each partialLogs.slice(0, 5) as c}
                    <li><code>/{c.slug}</code> · {familyWord(c.family)} · {c.corruptCount} unreadable {c.corruptCount === 1 ? "page" : "pages"}</li>
                  {/each}
                  {#if partialLogs.length > 5}<li class="more">…and {partialLogs.length - 5} more</li>{/if}
                </ul>
              </div>
            {/if}
            <div class="row">
              <label>Owner<input bind:value={owner} placeholder="your-username" autocomplete="off" /></label>
              <label>Repository<input bind:value={repo} placeholder="my-exhibit" autocomplete="off" /></label>
            </div>
            {#if nameError}<p class="err">{nameError}</p>{/if}
            <label>Branch<input bind:value={branch} placeholder="gh-pages" autocomplete="off" /></label>
            <p class="note">Publishing <strong>replaces everything</strong> on this branch with the current library — use a branch you keep for the published site (<code>gh-pages</code> by default).</p>
            <label>Access token (fine-grained, with Contents and Pages write access)
              <input type="password" bind:value={token} placeholder="github_pat_…" autocomplete="off" />
            </label>
            <label class="cb"><input type="checkbox" bind:checked={includeOriginals} /><span class="cb-text">Include source originals for citation <span class="cb-sub">— preserved un-edited uploads, published beside the exhibit</span></span></label>
            <p class="note">Your token stays in this browser — it's sent only to GitHub to publish, then dropped the moment it's done. Archie never stores it. Giving the token <strong>Pages</strong> write access lets Archie switch on your live site for you; without it, publishing still works and you flip the switch yourself (we'll show you where).</p>
            {#if advPhase === "publishing"}<p class="note" role="status">{progressText} <span class="muted">Keep this tab open.</span></p>{/if}
            {#if advPhase === "error"}<p class="err">{advErrorMsg}</p>{/if}
            <div class="actions">
              <button type="button" class="ghost" onclick={() => machine.backToIntro()}>← Back</button>
              <button type="submit" class="primary" disabled={!canPublish}>{advPhase === "publishing" ? "Publishing…" : "Publish"}</button>
            </div>
          </form>
        {/if}
      {/if}
      <!-- One shared status line for EVERY browser-open in the wizard (Archie-2139): "Open my site",
           "Open GitHub to enter it", and the desktop-routed anchors all funnel through the machine's
           openExternal, so a rejected open surfaces here instead of dying silently. Honest and
           non-fatal — the link stays on screen to copy. -->
      {#if machine.openUrlFailed}
        <p class="note warn" role="status">We couldn't open your browser — copy the link and go there yourself.</p>
      {/if}

    {:else}
      <!-- menuPhase: working | error. The old `local` screen — the one that quietly downloaded a .zip
           when the browser could not pick a folder — is gone; the folder row states that refusal on the
           chooser instead, where the author can still see the destinations they DO have. -->
      <header>
        <p class="eyebrow">Publish</p>
        <h2>{menuPhase === "working" ? "Building your site…" : "That didn't work."}</h2>
      </header>
      <div class="body">
        {#if menuPhase === "working"}
          <p class="note" role="status"><Spinner size={16} /> Writing the files. You can leave this open.</p>
        {:else}
          <p class="err">⚠ {destErrorMsg}</p>
          <div class="actions">
            <button type="button" class="ghost" onclick={() => (menuPhase = "choose")}>← Back</button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Soft Static: warm paper modal floating on a warm-charcoal scrim, soft lift shadow, generous rounded
     corners, no hard border. The single publish action carries the rationed signal-orange; everything
     else stays quiet. */
  .scrim { position: fixed; inset: 0; background: rgba(59,49,56,0.55); backdrop-filter: blur(2px); z-index: 40; }
  .dialog {
    position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(34rem, calc(100vw - var(--space-8))); box-sizing: border-box;
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift-mid); padding: var(--space-6);
    /* A centred fixed dialog with no height cap overflows BOTH edges once its content exceeds the
       viewport, and nothing can scroll it back — the content above the top edge is unreachable, not
       merely off-screen. Latent since the surface was built; the chooser crossed the threshold when
       it grew a fourth destination card. Caught by e2e/preview.spec.ts ("element is outside of the
       viewport" with scroll-into-view already attempted), which is the only gate that could see it. */
    max-height: calc(100vh - var(--space-8)); overflow-y: auto; overscroll-behavior: contain;
  }
  header { margin-bottom: var(--space-5); }
  .eyebrow { color: var(--ink-paper-muted); }
  .handle { color: var(--ink-paper-secondary); }
  h2 { font-family: var(--font-display); font-size: 1.75rem; font-weight: 400; line-height: 1.15; margin: var(--space-1) 0 var(--space-2); color: var(--ink-paper-primary); text-shadow: var(--shadow-text-haze); }
  .lede { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; }

  /* Step 1 — the destination chooser. */
  /* The nothing-to-publish screen's one paragraph: the way FORWARD, held apart from the lede (which
     says why there's nothing) so the reader's next action isn't buried in the explanation. */
  .empty-note {
    font-family: var(--font-body); font-size: 1rem; line-height: 1.6; margin: 0;
    color: var(--ink-paper-primary);
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--border-paper); border-radius: var(--radius-lg);
    background: var(--surface-paper-hover);
  }
  /* The one-flow option set (Archie-c367): four destination rows, always all four. */
  .dests, .tiers {
    display: flex; flex-direction: column; gap: var(--space-2);
    border: none; margin: 0 0 var(--space-4); padding: 0; min-width: 0;
  }
  .dests legend, .tiers legend {
    font-family: var(--font-ui); font-size: 0.68rem; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--ink-paper-muted); padding: 0; margin-bottom: var(--space-2);
  }
  .rec-why { font-family: var(--font-body); font-size: 0.875rem; line-height: 1.55; color: var(--ink-paper-secondary); margin: 0 0 var(--space-2); }
  .dest, .tier {
    display: flex; gap: var(--space-3); align-items: flex-start; cursor: pointer;
    padding: var(--space-3) var(--space-4);
    background: var(--surface-paper-card); border: 1px solid transparent; border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  .dest:hover:not(.unavailable), .tier:hover { background: var(--surface-paper-hover); }
  .dest.chosen, .tier.chosen { border-color: var(--accent-2); box-shadow: var(--shadow-lift-mid); }
  /* GREYED WITH ITS REASON. Dimmed and not selectable — but still drawn, still legible, and its
     reason line keeps full contrast, because the reason is the entire point of leaving it on screen. */
  .dest.unavailable { cursor: not-allowed; opacity: 0.62; box-shadow: none; background: transparent; }
  .dest input, .tier input { margin-top: 0.28rem; flex: none; accent-color: var(--accent-2); }
  .d-main { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
  .d-title { font-family: var(--font-display); font-size: 1.1rem; font-weight: 400; color: var(--ink-paper-primary); display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
  .d-rec { font-family: var(--font-ui); font-size: 0.62rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent-2); }
  .t-size { font-family: var(--font-mono); font-size: 0.8rem; color: var(--ink-paper-muted); }
  .d-reason { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.5; color: var(--ink-paper-primary); }
  /* The refusal keeps FULL opacity against the dimmed row — the author must be able to read why. */
  .d-reason.refusal { color: var(--semantic-error); opacity: 1; }
  .d-blurb { font-family: var(--font-body); font-size: 0.82rem; line-height: 1.5; color: var(--ink-paper-secondary); }
  .d-facts { font-family: var(--font-mono); font-size: 0.76rem; color: var(--ink-paper-muted); }
  .probe-status { display: flex; align-items: center; gap: var(--space-2); }
  .remote-field { text-transform: none; letter-spacing: normal; font-size: 0.8rem; }

  /* The additional export actions — deliberately quieter than a destination row, because they answer a
     different question ("a file of this shape") rather than a different where. */
  .extras { margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--border-paper); display: flex; flex-direction: column; gap: var(--space-2); }
  .x-head { font-family: var(--font-ui); font-size: 0.68rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-muted); margin: 0; }
  .x-btn { display: flex; flex-direction: column; gap: var(--space-1); text-align: left; cursor: pointer; padding: var(--space-3) var(--space-4); background: transparent; border: 1px solid var(--border-paper); border-radius: var(--radius-md); }
  .x-btn:hover:not(:disabled) { background: var(--surface-paper-hover); }
  .x-btn:disabled { cursor: progress; opacity: 0.7; }
  .x-title { font-family: var(--font-display); font-size: 1rem; color: var(--ink-paper-primary); }
  .x-desc { font-family: var(--font-body); font-size: 0.82rem; line-height: 1.5; color: var(--ink-paper-secondary); }

  .choices { display: flex; flex-direction: column; gap: var(--space-3); }
  .choice {
    display: flex; flex-direction: column; gap: var(--space-1); text-align: left; cursor: pointer;
    padding: var(--space-4) var(--space-5);
    background: var(--surface-paper-card); border: none; border-radius: var(--radius-md);
    transition: background 160ms ease, transform 160ms ease;
  }
  .choice:hover { background: var(--surface-paper-hover); transform: translateY(-1px); }
  /* The leading card — marked with the CALM accent (accent-2), not the rationed signal-orange (that stays
     reserved for the publish action inside the wizard). A hairline + eyebrow, not a loud fill. */
  .choice.lead { border: 1px solid var(--accent-2); }
  .c-eyebrow { font-family: var(--font-ui); font-size: 0.66rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent-2); }
  .c-title { font-family: var(--font-display); font-size: 1.25rem; font-weight: 400; color: var(--ink-paper-primary); }
  .c-desc { font-family: var(--font-body); font-size: 0.875rem; line-height: 1.5; color: var(--ink-paper-secondary); }

  .body, .result { display: flex; flex-direction: column; gap: var(--space-3); }
  .result a { color: var(--accent-2); }
  .result .primary { align-self: flex-end; margin-top: var(--space-2); }
  .share-url {
    width: 100%; box-sizing: border-box; font-family: var(--font-mono); font-size: 0.8rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
  }
  .share-url:focus { outline: none; border-color: var(--accent-2); }
  .share-actions { justify-content: flex-start; margin: 0; }
  .line { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; word-break: break-all; }
  .line.muted { color: var(--ink-paper-muted); font-size: 0.82rem; }
  code { font-family: var(--font-mono); font-size: 0.8rem; color: var(--ink-paper-primary); }
  .cmd { margin: 0; padding: var(--space-3) var(--space-4); background: var(--surface-canvas-overlay); border-radius: var(--radius-sm); box-shadow: var(--shadow-inset-fog); font-family: var(--font-mono); font-size: 0.8rem; color: var(--ink-paper-primary); white-space: pre-wrap; word-break: break-all; }
  .ok { font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; color: var(--semantic-success); margin: 0; }
  .err { font-family: var(--font-ui); font-size: 0.8rem; line-height: 1.5; color: var(--semantic-error); margin: 0; }

  /* Vertical stack used by the wizard states (intro / device-code / name-site / success / web). */
  .stack { display: flex; flex-direction: column; gap: var(--space-3); }
  .quiet-links { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
  /* Chrome comes from .text-link (this class was one of three hand-rolled copies of that recipe);
     only the body font + left alignment are local. */
  .linkish { text-align: left; font-family: var(--font-body); font-size: 0.875rem; }
  .linkish.inline { display: inline; font-size: inherit; }

  /* return-visit "Signed in as @handle · Sign out" — a quiet footer under the confirm. */
  .signed-in { font-family: var(--font-body); font-size: 0.8125rem; color: var(--ink-paper-muted); margin: 0; }
  .signed-in .handle { color: var(--ink-paper-secondary); }

  /* manual-pages fallback — the three numbered switches on GitHub. */
  .steps { margin: 0; padding-left: var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); }
  .steps li { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .steps a { color: var(--accent-2); }

  .field { display: flex; flex-direction: column; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-paper-muted); }

  /* name-site live preview — the calm "your site will live at ___" address. */
  .preview { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-3) var(--space-4); background: var(--surface-canvas-overlay); border-radius: var(--radius-sm); box-shadow: var(--shadow-inset-fog); }
  .preview-label { font-family: var(--font-ui); font-size: 0.68rem; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-muted); }
  .preview-url { font-family: var(--font-mono); font-size: 1rem; color: var(--accent-2); word-break: break-all; }
  .preview-tip { font-family: var(--font-body); font-size: 0.78rem; line-height: 1.5; color: var(--ink-paper-muted); }

  /* repo picker — a filterable list of the author's existing sites. */
  .filter {
    width: 100%; box-sizing: border-box; font-family: var(--font-body); font-size: 0.95rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
  }
  .filter:focus { outline: none; border-color: var(--accent-2); }
  .repo-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); max-height: 16rem; overflow-y: auto; }
  .repo-item {
    width: 100%; text-align: left; cursor: pointer; font-family: var(--font-mono); font-size: 0.9rem;
    padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
    background: var(--surface-paper-card); color: var(--ink-paper-primary); border: 1px solid transparent;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .repo-item:hover { background: var(--surface-paper-hover); border-color: var(--border-canvas); }
  .repo-empty { font-family: var(--font-body); font-size: 0.85rem; color: var(--ink-paper-muted); padding: var(--space-2) var(--space-3); }

  /* Device-code screen — a large, calm monospace code the user copies to GitHub. */
  .code-row { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .code {
    font-family: var(--font-mono); font-size: 2rem; font-weight: 600; letter-spacing: 0.2em;
    padding: var(--space-3) var(--space-4); color: var(--ink-paper-primary);
    background: var(--surface-canvas-overlay); border-radius: var(--radius-sm); box-shadow: var(--shadow-inset-fog);
  }
  .waiting { display: flex; align-items: center; gap: var(--space-2); font-family: var(--font-body); font-size: 0.9rem; color: var(--ink-paper-secondary); margin: 0; }
  /* (Ring spinner: the shared <Spinner> primitive now — see Spinner.svelte.) */

  /* Publishing checklist — steps tick in order. */
  .checklist { list-style: none; margin: 0 0 var(--space-4); padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .checklist li { display: flex; align-items: center; gap: var(--space-2); font-family: var(--font-body); font-size: 0.95rem; color: var(--ink-paper-muted); }
  .checklist li.done { color: var(--ink-paper-secondary); }
  .checklist li.active { color: var(--ink-paper-primary); }
  .checklist .tick { width: 1rem; text-align: center; color: var(--semantic-success); }
  .checklist li.pending .tick { color: var(--ink-paper-muted); }

  /* Success hero — the live URL is the focal element. */
  /* Chrome comes from .text-link; the mono face + wrapping are local. It no longer suppresses its
     underline at rest — this is the published URL, the one thing on the panel meant to be clicked. */
  .hero-url { display: block; font-family: var(--font-mono); font-size: 1.15rem; word-break: break-all; }
  .hero-actions { display: flex; gap: var(--space-3); }
  .details { margin-top: var(--space-1); }

  .note { font-family: var(--font-body); font-size: 0.78rem; line-height: 1.6; color: var(--ink-paper-muted); margin: 0; }
  .note.warn { color: var(--ink-paper-secondary); }
  .note a { color: var(--accent-2); }
  /* Checkbox rows (stay-signed-in + citation opt-in). */
  .cb { flex-direction: row; align-items: flex-start; gap: var(--space-2); text-transform: none; letter-spacing: 0; font-weight: 400; }
  .cb input { margin-top: 2px; accent-color: var(--accent-2); }
  .cb-text { font-family: var(--font-body); font-size: 0.8125rem; color: var(--ink-paper-primary); }
  .cb-sub { color: var(--ink-paper-secondary); }


  /* --- advanced (token) form — verbatim styles --- */
  form { display: flex; flex-direction: column; gap: var(--space-3); }
  .row { display: flex; gap: var(--space-3); }
  .row label { flex: 1; }
  label { display: flex; flex-direction: column; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-paper-muted); }
  input {
    font-family: var(--font-body); font-size: 1rem; padding: var(--space-2) var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
  }
  input:focus { outline: none; border-color: var(--accent-2); }

  /* Broken-link warning — quiet warm tint (degradation is recoverable, not an error). */
  .broken { padding: var(--space-3) var(--space-4); background: var(--surface-canvas-overlay); border-left: 3px solid var(--semantic-warning); border-radius: var(--radius-sm); }
  .broken .b-head { margin: 0; font-family: var(--font-ui); font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-paper-secondary); }
  .broken .b-sub { margin: var(--space-1) 0 var(--space-2); font-family: var(--font-body); font-size: 0.78rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .broken ul { margin: 0; padding-left: var(--space-4); }
  .broken li { font-family: var(--font-body); font-size: 0.78rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .broken code { font-family: var(--font-mono); font-size: 0.7rem; color: var(--ink-paper-primary); }
  .broken .more { list-style: none; color: var(--ink-paper-muted); }
  /* The severity model, in three weights of the SAME block — a blocker must not look like a fourth
     kind of thing. Warning tint is the middle case above; a blocker escalates the stripe to danger,
     a report drops it to a neutral rule since nothing is wrong. */
  .broken.blocker { border-left-color: var(--semantic-error); }
  .broken.report { border-left-color: var(--ink-paper-muted); }

  .actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-4); }
  /* The ONE focal action → rationed signal-orange, soft rounded, signal glow. */
  .primary {
    font-family: var(--font-body); font-size: 0.9rem; font-weight: 600;
    letter-spacing: 0.01em;
    padding: var(--space-2) var(--space-5); border-radius: var(--radius-sm); cursor: pointer;
    background: var(--accent); color: var(--ink-on-accent); border: none;
    box-shadow: var(--shadow-signal-glow);
    transition: background 160ms ease, box-shadow 160ms ease;
  }
  .primary.big { padding: var(--space-3) var(--space-5); font-size: 1rem; }
  .primary:hover { background: var(--accent-hover); }
  .primary:disabled { background: var(--accent-muted); color: var(--ink-paper-muted); box-shadow: none; cursor: default; }
  /* Quiet secondary → warm paper, soft border, ink text (the .soft-btn shape). */
  .ghost {
    font-family: var(--font-body); font-size: 0.9rem; font-weight: 500;
    letter-spacing: 0.01em;
    padding: var(--space-2) var(--space-5); border-radius: var(--radius-sm); cursor: pointer;
    background: var(--surface-paper-card); color: var(--ink-paper-primary); border: 1px solid var(--border-canvas);
    transition: background 160ms ease, border-color 160ms ease;
  }
  .ghost:hover { background: var(--surface-paper-hover); border-color: var(--border-canvas-emphasis); }

  .muted { color: var(--ink-paper-muted); }
</style>
