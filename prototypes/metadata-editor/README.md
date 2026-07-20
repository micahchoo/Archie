# Prototype: pick-from-vocab metadata editor (Archie-e100)

Throwaway static prototype — open `index.html` in a browser, no build step.

**Question it answers:** what does the pick-from-vocab metadata editor FEEL like in the
DetailsEditor drawer — is the default-set + add-field model pleasant at real vocab scale
(all 50 pickable `dcterms` properties, labels + comments from
`docs/research/dublin-core-vocab.md`)?

**What's in it**

- The DetailsEditor context echoed (title / description / attribution / license), with the
  metadata block below, at all three levels via the top-right level switcher
  (Library / Exhibit / Object — each keeps its own seeded state).
- Fixed decisions honored: entry `{ property?, label?, value }`; default rows per level;
  repeats = repeated entries (per-row `+`); array order = display order (hover `↑`/`↓`,
  or Alt+↑/↓ from anywhere in a row); empty rows persist nothing (see the
  "What this level saves" inspector at the bottom).
- Add-a-field: searchable flat alphabetical list of the remaining dcterms properties,
  label + one-line comment each; fully arrow-key navigable (type, ↑/↓, Enter, Esc);
  "Custom label" footer adds a property-less entry.
- The relabel probe: click any row label to override it (seeded example: `dcterms:source`
  relabeled "Archive" on Folio 2r). An amber `dcterms:` spine mark + reset appears only
  while a label is overridden — this affordance's fate is what the prototype tests.
- Excluded from the picker (Archie owns them natively): title, description, abstract,
  rights, license.
