// Where a library last deployed — split out of `deploy-flows.svelte.ts` so the PUBLISH path can read
// it without pulling the deploy module in.
//
// WHY THE SPLIT. `deploy-flows.svelte.ts` is lazily imported on purpose (App.svelte's `ensurePub`),
// because it drags the GitHub REST + Tauri seams. Publishing now needs the remembered URL to bake
// real canvas ids (see `publishBaseFor`), and that read must not be the thing that makes the deploy
// bundle eager again. This module imports only `persisted.ts`.
//
// Storage shape and key are unchanged — `deploy-flows` re-exports these, so existing callers and the
// persisted data both keep working.
import { readJson, writeJson } from "../persisted.js";
import type { DeployTarget } from "./types.js";

const rememberKey = (libraryId: string) => `archie:deploy:${libraryId}`;

/** Remember where this library last deployed, for the update-confirm return visit AND for the publish
 *  base. Stores `{ target, url }` ONLY — never the token/session. A persist failure is not worth
 *  failing a landed deploy over (writeJson swallows it); the remembered target is a convenience. */
export function rememberTarget(libraryId: string, target: DeployTarget, url: string): void {
  writeJson(rememberKey(libraryId), { target, url });
}

/** The remembered target for a library, or null if it has never deployed (or the store is unreadable).
 *  No shape validation (trust-the-parse, matching the original behavior) — only absence/corruption
 *  collapse to null. */
export function rememberedTarget(libraryId: string): { target: DeployTarget; url: string } | null {
  return readJson<{ target: DeployTarget; url: string }>(rememberKey(libraryId));
}

/**
 * The base URL a publish should bake into manifest / canvas / annotation ids.
 *
 * THE RULE (decided 2026-07-26). A published id should say where the thing actually lives, or say
 * nothing — never a placeholder. `WORKING_IRI_BASE` (`https://archie.demo/`) is the Studio's internal
 * identifier namespace and its own doc says it is "never published"; it was in fact being baked into
 * every published tree, so every deployed site carried manifest and canvas ids on a domain nobody
 * owns, and ADR-0021's cite ladder resolved to nothing.
 *
 * So:
 *   - deployed before → that library's live URL (absolute ids, IIIF-correct, cites resolve)
 *   - never deployed  → `""`, i.e. RELATIVE ids (`voynich/canvas/o1`)
 *
 * Relative is the honest answer for a zip nobody has a destination for yet: the tree is
 * self-contained and correct wherever it lands, and if the author later deploys it, publish re-mints
 * every id against the real origin (`rebaseCanvasId`) — including the annotation targets, which is
 * what makes changing the base non-destructive at all.
 *
 * A first-time DEPLOY does not come through here: it knows its URL from `pagesUrlFor(owner, repo)`
 * before it stages, and passes it explicitly.
 */
export function publishBaseFor(libraryId: string): string {
  const url = rememberedTarget(libraryId)?.url;
  if (!url) return "";
  return url.endsWith("/") ? url : `${url}/`; // publishLibrary joins `${base}${slug}/…`
}
