<script lang="ts">
/**
 * @surface {in-dialog panel}
 * @composes {<archie-viewer> custom element, publish-flows previewTree}
 * @variants {loading, ready, error}
 * @constraint {single-scrim invariant — this is a PHASE of Publish, never a second scrim}
 */
  // Preview as reader (archie-ux Q-6). The author sees the actual published artifact, rendered by the
  // actual reader, before choosing where to put it.
  //
  // Two decisions are load-bearing and easy to undo by accident:
  //
  // 1. The element is LAZY-imported. A static import would pull the embed's graph into Studio's
  //    startup bundle — the same class of mistake .claude/rules/archie-viewer-eager-closure.md
  //    documents on the embed's own side. `import()` inside onMount keeps it in its own chunk,
  //    fetched the first time an author actually previews.
  //
  // 2. The tree is handed over as a Filesystem, never a URL or a Blob. previewTree() returns the
  //    in-memory published tree; openLibraryFs takes it directly. Minting a blob: URL would be
  //    refused on desktop anyway — the Tauri CSP allows https: on connect-src but not blob:
  //    (.claude/rules/tauri-csp.md).
  //
  // `offline` is set: a preview must not reach the network for a remote tile, both because the
  // author may be offline and because silently succeeding here would hide a broken publish.
  import type { Filesystem } from "@render/core";

  interface Props {
    /** Build the published tree in memory — publish-flows' previewTree. */
    previewtree: () => Promise<{ fs: Filesystem }>;
    /** Leave the preview and return to the chooser (the nested-flow back affordance). */
    onback: () => void;
  }
  let { previewtree, onback }: Props = $props();

  let host = $state<HTMLDivElement | null>(null);
  let phase = $state<"loading" | "ready" | "error">("loading");
  let errorMsg = $state("");

  // Build + mount once per open. The component is created fresh each time the phase is entered, so
  // there is no re-entrancy to guard here — the element is torn down with the component.
  $effect(() => {
    const mountPoint = host;
    if (!mountPoint) return;
    let cancelled = false;
    void (async () => {
      try {
        // Both halves in parallel: the element module and the tree projection are independent.
        const [, tree] = await Promise.all([import("@render/archie-viewer"), previewtree()]);
        if (cancelled) return;
        const el = document.createElement("archie-viewer") as HTMLElement & {
          openLibraryFs(fs: Filesystem): Promise<void>;
        };
        el.setAttribute("offline", "");
        el.style.display = "block";
        el.style.height = "100%";
        mountPoint.replaceChildren(el);
        await el.openLibraryFs(tree.fs);
        if (cancelled) return;
        phase = "ready";
      } catch (e) {
        if (cancelled) return;
        errorMsg = e instanceof Error ? e.message : "Couldn't build a preview of this library.";
        phase = "error";
      }
    })();
    return () => { cancelled = true; };
  });
</script>

<header>
  <p class="eyebrow">Preview</p>
  <h2>As a reader sees it</h2>
  <p class="lede">This is the finished site, rendered by the same viewer your readers use. Nothing has been published yet.</p>
</header>

<div class="stage" class:busy={phase !== "ready"}>
  {#if phase === "error"}
    <p class="err" role="alert">{errorMsg}</p>
  {:else if phase === "loading"}
    <p class="wait">Building the preview…</p>
  {/if}
  <div class="mount" bind:this={host}></div>
</div>

<div class="actions">
  <button type="button" class="ghost" onclick={onback}>← Back</button>
</div>

<style>
  /* The reader needs room — this is the one phase of the Publish surface that is not prose-width. */
  .stage { position: relative; height: min(70vh, 640px); border: 1px solid var(--rule, #d9cfc4); border-radius: 8px; overflow: hidden; background: var(--paper, #f6efe9); }
  .mount { height: 100%; }
  .stage.busy .mount { visibility: hidden; }
  .wait, .err { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 1rem; text-align: center; font-family: var(--font-ui); font-size: var(--text-ui-sm, 0.85rem); }
  .err { color: var(--ink-warn, #8a2f22); }
  .actions { display: flex; justify-content: flex-start; margin-top: 1rem; }
</style>
