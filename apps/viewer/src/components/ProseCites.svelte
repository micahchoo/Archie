<script lang="ts">
  // Renders note/section prose, promoting BLOCK exhibit cites to rich cards (ExhibitCiteCard) while
  // every other span stays plain sanitized HTML. Drop-in for `{@html renderMarkdown(text)}` in the
  // viewer prose sites. The gallery index (for cover/title lookup + the known-slug set) comes from
  // context (ViewerShell), so this stays prop-free at each call site.
  import { getContext } from "svelte";
  import { renderMarkdown } from "@render/core";
  import { splitProseCites } from "../cite-cards.js";
  import { CITE_GALLERY, type GalleryRef } from "../cite-context.js";
  import ExhibitCiteCard from "./ExhibitCiteCard.svelte";

  let { text }: { text: string } = $props();

  const galleryRef = getContext<GalleryRef | undefined>(CITE_GALLERY);
  const cards = $derived(galleryRef?.value?.exhibits ?? []);
  const slugs = $derived(new Set(cards.map((e) => e.slug)));
  const segments = $derived(splitProseCites(renderMarkdown(text ?? ""), slugs));
</script>

{#each segments as seg}{#if seg.kind === "html"}{@html seg.html}{:else}<ExhibitCiteCard slug={seg.slug} label={seg.label} entry={cards.find((e) => e.slug === seg.slug)} />{/if}{/each}
