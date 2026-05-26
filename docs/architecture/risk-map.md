# Risk Map — Archie

**Synthesis** | **Confidence: MEDIUM** | **Source: subsystem analysis, HANDOFF.md known issues, CONTEXT.md invention inventory**

## Risk Dimensions

Each risk rated on: **Spatial** (where), **Temporal** (when it fires), **Flow** (impact radius), **Tangle** (coupling complexity), **Readiness** (test coverage), **Constraint** (ordering dependency).

## Severity Tiers

### Fatal (blocks action)

None identified. The architecture has no known fatal risks.

### Warning (flag but proceed)

| ID | Risk | Location | Dimensions | Mitigation |
|----|------|----------|------------|------------|
| **R1** | **Merge UI comprehension gate** | Studio → MergeReview | Flow: HIGH, Tangle: MEDIUM | Prototype-gated (invention #4). Build → user test → iterate. Failure mode: non-technical author can't grok conflict cards. |
| **R2** | **Overview-as-canvas UX** | Studio | Flow: MEDIUM, Tangle: LOW | Prototype-gated (invention #1). Fallback: explicit overview/object mode toggle (1b). Failure mode: feels like a list pretending to be a canvas. |
| **R3** | **Playground→Project conversion** | Studio → Storage | Flow: HIGH, Tangle: MEDIUM | Prototype-gated (invention #2). "The likely week-8 surprise time-sink — sounds simple, encodes heavy mental-model work." |
| **R4** | **Three-configs-as-"Project"** | Studio → Storage | Flow: MEDIUM, Tangle: LOW | Prototype-gated (invention #3). Failure mode: non-Chromium users don't grok zip-as-canonical-file → "Start a project again" instead of "Open." |
| **R5** | **Bundle size unvalidated** | All | Flow: HIGH, Readiness: LOW | 240KB budget was aspirational (never validated). OSD+Annotorious = ~223KB before Archie code. Real measurement on v1 prototype replaces this figure. |
| **R6** | **Svelte 5 `$effect` reactivity** | Rendering | Flow: MEDIUM, Tangle: LOW | Known failure mode (draw bug root cause). Mitigation: documented rule. Risk: new contributors unaware of the pattern. |
| **R7** | **Body sanitization (XSS)** | Rendering → Viewer | Flow: HIGH | DOMPurify in place. Gate: before first published exhibit with user-authored HTML. Cross-Library links: `archie:` scheme stripped by DOMPurify → rewrite must run BEFORE sanitize. |

### Info (note and continue)

| ID | Risk | Location | Notes |
|----|------|----------|-------|
| **R8** | **Cross-origin images** | Studio | `addObject` with arbitrary URL may fail OSD tile-fetch without CORS. Author resolves. |
| **R9** | **Empty/error/loading states** | Studio + Viewer | Orphan gate §89. Studio object rail empty-state done. Viewer Gallery/Grid empty-states done. Remaining: error states for fetch failures. |
| **R10** | **EXIF orientation** | Rendering → Publish | Mapping built; pixel-push deferred. Gate: 8-orientation test-fixture before first phone-photo public exhibit. |
| **R11** | **AV ingest** | Studio → Annotation Spine | AV annotation is grilled; AV ingest (codec/size/format/duration) is unscoped. Gate: before first AV-bearing exhibit. |
| **R12** | **No CI configured** | Infrastructure | Pre-initial-commit. Tests exist (245) but no automated run on change. |
| **R13** | **No linters/formatters** | Infrastructure | Pre-initial-commit. TypeScript strict mode provides some guardrails. |

## Risk Concentration

| Subsystem | Warning | Info | Primary Concern |
|-----------|---------|------|-----------------|
| Annotation Spine | 0 | 0 | **Lowest risk** — pure logic, 209 tests, well-gated |
| Rendering | 1 (R6) | 2 (R7,R10) | Svelte 5 discipline + sanitization ordering |
| Storage | 2 (R3,R4) | 0 | UX inventions (config hiding) |
| Publish | 1 (R5) | 0 | Bundle budget |
| Studio | 3 (R1,R2,R3) | 2 (R8,R11) | **Highest concentration** — 5 of 6 inventions live here |
| Viewer | 0 | 0 | **Low risk** — adopted patterns (annomea reader) |

## Priority-Ordered Action Items

1. **Validate all 6 inventions** (R1–R4) — build prototype → STOP for user gate
2. **Real bundle measurement** (R5) — against v1 prototype, replace aspirational 240KB
3. **EXIF test fixture** (R10) — before public exhibit with phone photos
4. **Body sanitization gate** (R7) — before user-authored HTML ships
5. **CI + linter setup** (R12–R13) — post-initial-commit
