---
paths:
  - "README.md"
  - "PRFAQ.md"
  - "DIVERGENCES.md"
  - "docs/GOAL.md"
  - "docs/adr/**"
  - "docs/decisions/**"
  - "docs/guide/**"
updated: 2026-09-05
---
# product
> *what is Archie and why is it shaped this way?*

Archie lets authors annotate images, maps, audio, and video, then publish a static exhibit.
Notes use W3C Web Annotation. Exhibits use IIIF Presentation 3.

## Current guidance

- `README.md` is the introduction. `docs/guide/` holds user workflows. `docs/CAPABILITIES.md` defines delivery limits.
- `CONTEXT.md` defines domain terms. `docs/adr/` and `docs/decisions/` hold architecture and product decisions.
- `PRFAQ.md` and `DIVERGENCES.md` record product proposals. Check the linked seed before treating a proposal as shipped or queued.
- For an explicitly requested product loop, read `docs/GOAL.md`. Its gates and locked frames apply to that workflow.
- Q-15 separates **Publish** for a website from **Export a copy** for a portable artifact. Preserve those user intentions.
- Q-12/Q-13 use desktop device authentication, OS keyring persistence, and a Git pack push. Browser advanced-token publishing has a separate path.
- For the current embed attributes, read `recipes/EMBED.md`. The original three-attribute ADR records the earlier contract.

## Binding rules

- [[prior-art-citation-discipline]] — verify the cited source before using a product or architecture claim.

## Evidence

- Review 2026-09-05 → Capabilities are documented. Audience fit still needs observed user sessions. Protocol: `ledgers/PRODUCT-validation-2026-09-05.md`.
- Documentation refresh 2026-09-05 → Short README and task guides replace feature lists and outdated status claims. Evidence: `ledgers/DOCS-refresh-2026-09-05.md`.

Earlier decisions and measurements: [archived hub](../ledgers/DOCS-hubs-before-2026-09-05.md#product).
