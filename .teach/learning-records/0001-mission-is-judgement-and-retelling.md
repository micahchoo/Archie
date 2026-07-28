# The mission is judgement AND retelling — teach the rejected alternative every time

Asked whether he was learning this to direct agents better or to explain Archie to others, Micah
answered **both** (2026-07-24, at workspace creation).

That combination has a concrete consequence for lesson design: **the reasoning is not optional
colour, it's half the payload.** A lesson that teaches only how a thing works serves judgement but
not retelling. Every lesson from here carries the decision *and* the alternative that lost — which
this repo makes easy, because the ADRs record rejected alternatives explicitly (ADR-0003 lists six).

**Implications**
- Lead each lesson with the *problem in ordinary words*, per [[NOTES.md]] — that framing doubles as
  the opening line when he retells it to someone else.
- `docs/adr/*.md` "Rejected alternatives" sections are prime lesson material, not background.
- Don't teach a mechanism whose motivating problem hasn't been felt yet. Retelling requires the
  problem; judgement only requires the rule. Serve the harder master.
