---
scope: packages/render-core/src/fs/tauri.ts,apps/studio/src/tauri-fs.ts
tags: [durability, security, filesystem, tauri, atomic-write, path-traversal]
priority: high
source: hand-written
---

# The Tauri fs backend must re-establish the guarantees the browser gives for free

`TauriFilesystem` (`packages/render-core/src/fs/tauri.ts`) is the desktop analogue of the FSA/OPFS
backends, but path-based over `@tauri-apps/plugin-fs`. The browser handle APIs (`getFileHandle`,
`getDirectoryHandle`, `createWritable`) hand you **two safety properties for free** that a naive
path-join port silently drops:

1. **Atomic replace.** `createWritable()` commits on `close()` — a crash mid-write leaves the
   original file intact. plugin-fs `writeFile` truncates-then-writes, so writing straight to the
   destination can leave `library.json` / `manifest.json` truncated and unparseable.
2. **Name containment.** `getFileHandle`/`getDirectoryHandle` reject a name containing `/`. plugin-fs
   joins raw, so an untrusted segment (an exhibit slug carried in a `.archie.zip`) could `..`-traverse
   out of the library root — a desktop-only write-escape (web is saved only by the spec's `/` rule).

Both were introduced together in `42246f1` (go-iiif/iiifpreserve prior art: `blobstore.go` Put
temp+rename; `doctor.go` `safeBundleRelative`):

- `TauriFile.writable().close()` writes a **same-directory** `{path}.tmp-{seq}` then `bridge.rename`s
  over the destination (same fs → atomic), cleaning up the temp on failure.
- `assertSafeName()` rejects empty / `.` / `..` / separator / NUL in `getDirectory`, `getFile`,
  `remove` — parity with the FSA rule set.

**How to apply:**
- Any new write path on this backend goes through the temp-then-rename in `close()` — never add a
  second raw `bridge.writeFile` straight to a destination the app treats as durable state.
- Any new `TauriDir` method that joins a caller-supplied `name` onto a real path calls
  `assertSafeName(name)` first. Callers upstream must NOT be trusted to have sanitized the segment
  (slugs, object ids, and archive entry names are untrusted input — same trust boundary as
  [[untrusted-archive-open-seam]]).
- Adding a method to `TauriFsBridge` (e.g. `rename`) means updating **both** implementers or the
  build breaks: the real plugin-fs adapter (`apps/studio/src/tauri-fs.ts`) and the node:fs
  conformance bridge (`packages/render-core/src/fs/tauri.test.ts`). `tsc --noEmit` is the gate that
  catches a missed one.
- The conformance suite (`conformance.ts`) proves observable behavior only — it will stay green
  whether or not `close()` is atomic. The atomic-write and traversal-reject guarantees have their own
  targeted tests in `tauri.test.ts` (`TauriFilesystem hardening`); keep them.

The corrupt-sidecar guard is the OPFS-side sibling of the same durability concern — see
`apps/studio/src/store.ts` `snapshotIfUnparseable` (a corrupt authored sidecar reads as absent and
would be silently clobbered on the next save).
