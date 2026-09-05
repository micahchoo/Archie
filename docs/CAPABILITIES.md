# Archie delivery capabilities

Status: implemented capabilities and verification scope, 2026-09-05. This describes delivery differences, not a guarantee for every browser or library size. Validation results live in [the implementation ledger](../ledgers/IMPLEMENT-review-2026-09-05.md).

| Capability | Browser Studio | Desktop Studio | Hosted Viewer | Embedded reader | Static pages / portable files |
|---|---|---|---|---|---|
| Create and edit notes | Yes; own exhibits persist in browser storage | Yes; resident filesystem | Read only | Read only | Read only until imported into Studio |
| Sample edits persist | No; keep a copy first | No; keep a copy first | Not applicable | Not applicable | Not applicable |
| Save destination | Browser storage; chosen folder where supported | Resident folder; chosen destinations | Does not author | Does not author | Files belong to their holder |
| Undo | Temporary session projection; explicit subsequent edits create durable versions | Same note contract | Not applicable | Not applicable | Published history is unaffected by temporary undo |
| Readings and citations | Author notes and interpretations | Same data model | Object, note, section, region/time links; source preserved | Target contract supports applicable Readings and note arrival | Static prose and links; interactive presentation requires the reader |
| Portable exchange | Export/import `.archie.zip`; corrupt history adoption refused | Same format | Open local file or source URL | Source URL or library object | Embedded assets travel; remote assets still need their origin |
| Offline reading | Local authored assets remain available; no universal remote cache | Local resident assets remain available | Depends on app and media availability | `offline` permits blob/data resources, blocks URL library loads (including same-origin), and suppresses remote media. Open an archive locally | Static/local assets can be served locally; remote media is not included automatically |
| Publishing | File/folder destinations depend on browser support | Files plus GitHub integration | Consumes published trees | Consumes published trees or archives | Static hosting needs no application server |
| Failure handling | Save errors remain visible; concurrent note edits remain dirty until saved | Same persistence contract plus filesystem checks | Broken sources report failure; navigation preserves identity | New navigation cancels pending readers | Pages precede indexes; in-place folders have no whole-tree snapshot isolation |

Evidence is layered. Core tests cover data and filesystem contracts. Studio and Viewer Playwright suites cover real Chromium interactions. Embed recipes exercise built JavaScript in a browser. Desktop verification must state whether it checked Rust compilation, an actual packaged launch, or a complete save/open/publish workflow; these are different claims.

No cross-browser certification, universal offline cache, multi-file atomic folder transaction, or validated large-library memory ceiling is claimed. Local-only work can still be lost when its storage is removed. Export a portable copy when a separate copy is needed.
