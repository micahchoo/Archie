# 12 decisions, batched — read this in one sitting

Every one of these is blocking work. None needs you to design anything: each is **a default I'd
ship, why, and what it costs you to say no**. Say "yes to A, B, C; redirect D" and the whole board
moves.

They're grouped so related calls happen together — deciding #1 alone answers half of group A.

---

## Group A — Where published things live (4 decisions, 1 of them the keystone)

### A1. `Archie-3504` · How does publish learn its own URL? ⭐ **decide this one first**

A GitHub push can work it out (`owner/repo` → `owner.github.io/repo/`). A folder or zip publish
can't — nobody knows where it'll be served from.

> **Default: relative-first.** The tree uses relative paths everywhere except the four things that
> genuinely need an absolute URL — `og:url`, JSON-LD `url`, IIIF ids, and the canonical link. GitHub
> derives its base; folder/zip get "leave it relative" unless you type one in.
>
> **Why:** one tree then works at any base — served from a laptop, a USB stick, or a university
> subdirectory — without republishing. The alternative (always ask) puts a URL prompt in front of
> someone who just wants a folder.
>
> **Cost of no:** if you'd rather always ask, that's fine but every export grows a required field.

**Unblocks 4 tickets** (`19c5`, `fde8`, `c85f`, and `8d3d` behind them). Nothing else on the board
unblocks that much.

### A2. `Archie-19c5` · The same setting does two jobs, and that's a live bug

`baseUrl` both *mints published ids* and *is the namespace annotations are grouped by*. So the day
you set a real Pages URL, publish silently drops **every annotation** — it looks for them under the
new namespace and finds none. Narrative sections don't have this problem, so it can look fine on one
exhibit and be empty on another.

> **Default: split them.** Keep an internal authoring namespace for grouping, and rebase to the
> public base at publish. Annotations get found; ids stay citable.
>
> **Cost of no:** there isn't a viable no. This is a correctness bug wearing a design question's
> clothes — the only choice is *which* shape of fix, and rebase-at-publish is the one that doesn't
> touch stored data.

### A3. `Archie-33bf` · Should viewer links look like Studio links?

Studio uses real paths (`library/slug/object`); the viewer uses `#/slug/object`. The ticket already
corrected itself once — the hash is a *deliberate* choice, not a defect, because it needs no server
config to work on any host.

> **Default: no, keep the hash.** Changing it buys visual symmetry and costs the "works on any static
> host with zero config" property, which is the whole premise.

### A4. `Archie-babe` · Should a self-contained export ship the full Astro viewer?

Today it ships the small `<archie-viewer>` embed. The Astro app derives its routes at *build* time,
so shipping it means shipping a build step.

> **Default: no, keep the embed.** You flagged this to revisit; my read after `5582`'s research is
> that the embed is the right artifact and the Astro app is the *hosted* experience.

---

## Group B — What "export" and "quality" actually mean (3)

### B1. `Archie-c367` · The final export option set

Three destinations all call the same `publishLibrary`. The only real differences are the sink, plus
"include originals" (folder only) and "pick exhibits" (zip only) — **and the ticket notes those are
backwards from what the names suggest.**

> **Default: one dialog, destination as a choice, both options available everywhere they make sense.**
> The current split is an implementation detail leaking into the UI.

### B2. `Archie-4b0a` · What's a "quality tier"?

TIFF→WebP already measured **8–15× smaller** at visually equivalent quality on 375 real museum
masters.

> **Default: three named tiers — Archival / Balanced / Web — applied to images now, AV later.**
> Name them by intent, not by codec, so the choice survives changing formats.

### B3. `Archie-ebe7` · AV posters: cheap or proper?

**A:** grab a video frame with canvas — zero new dependencies, already the documented plan.
**B:** `mediabunny` — real duration/dimensions/rotation, audio support, worker-side.

> **Default: A now, B when audio waveforms or rotation actually bite.** A is free and unblocks
> `0c7f`; B is a dependency you can add the day you need what it gives.

---

## Group C — How much to trust a file someone hands you (3)

### C1. `Archie-fc75` · Version-stamp `archie.json`?

~20 lines. tldraw does it and old files load cleanly forever after.

> **Default: yes, do it now.** It's cheap *today* and impossible to retrofit onto files already in
> the wild. This is the one on the list with the worst regret curve if skipped.

### C2. `Archie-5fb5` · How hard should import validate a `.archie.zip`?

In tension with render-core's "corrupt ≠ empty, skip the bad item" policy.

> **Default: marker + structure, not full content.** Refuse a file that isn't an Archie library;
> keep per-item tolerance inside one that is. Full-content validation would reject archives that
> currently open fine with one bad note.

### C3. `Archie-be3a` · The desktop CSP allows plain `http://**`

Every caller uses `https:`.

> **Default: tighten to `https:`** — unless you know of institutions serving IIIF over plain http,
> which does still happen in the sector. **This is the one I'd most like you to sanity-check**, since
> you know the field and I'm inferring.

---

## Group D — Getting a catalogue in (1)

### D1. `Archie-3754` · The spreadsheet door

CSV import today is **annotations only**. An institution arrives with a spreadsheet of titles, dates,
creators, identifiers and rights — and there's no way in except typing.

> **Default: build it, mapping columns to Dublin Core, matching rows to objects by filename.**
> This is the biggest gap between Archie and "a small museum can actually use this" on the whole
> board. Not a small job.

---

## Group E — Does it still look like one thing? (1)

### E1. `Archie-05e4` · Palette, typography, radius after the rewrite

> **Default: you walk it and give an opinion.** This is explicitly the judgment half — the mechanical
> selector sweep is already split off as `1244`, which I can do. This half needs your eye.

---

## If you only have ten minutes

Do **A1** (`3504`). It unblocks four tickets and it's the one thing every other publishing decision
waits on. **C1** (`fc75`) is second — cheap now, impossible later.

## If you have an hour

A1 → A2 → C1 → C3, then skim the rest. That clears the whole publishing spine and the two
trust decisions, and leaves only genuinely optional taste calls.
