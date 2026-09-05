# Product validation protocol

Status: ready to run; no participant sessions performed. Prepared from [the review](REVIEW-2026-09-05.md). No outreach or analytics deployment was performed.

## Decision to test

Working cohort hypothesis: individual scholars and small curatorial teams preparing a citable exhibit. The first activation outcome is an author importing their own media, adding an interpretation, reopening it, and giving a recipient a working citation. Existing code supports this workflow; it does not establish market demand.

Recruit five authors in that cohort for an initial formative round, plus a recipient for each handoff. Include a keyboard user and a participant who benefits from stronger text contrast. This is a practical initial sample, not a statistical prevalence estimate. Obtain consent for notes or recording; use participant-provided non-sensitive material or a supplied public sample. Do not upload their material without their agreement.

## Session script (45–60 minutes)

1. Ask what the author is trying to explain and who should read it. Record prior annotation/publishing experience and chosen delivery mode.
2. Give this task without describing controls: “Make a short exhibit with two of your sources and an interpretation another person can cite.” Start the timer.
3. Ask them to annotate both objects. Record first useful annotation time, errors, abandoned paths and facilitator interventions.
4. Ask them to change one note, undo that change, then revise the note they can see. Ask what they expect after closing. Close and reopen. Record prediction and actual outcome separately.
5. Ask “Where does this work live? Who can currently see it? What survives closing this window?” Record their words before explaining browser, folder or example status.
6. Ask them to publish or export a portable copy. Have the recipient open it and follow a Reading-specific note citation. Record arrival at the intended note and interpretation, including a reload.
7. Give the recipient the mobile gallery and ask them to choose an exhibit relevant to a stated interest. Record first meaningful selection, summary expansion and mistaken choices.
8. Ask what prevented completion and what they would use instead. Explain any mistaken storage or undo expectations before ending the session.

Pause if participant data could be lost. Mark any assisted completion as assisted. A facilitator rescue does not count as unassisted activation.

## Observation sheet

| Field | Record |
|---|---|
| Participant / date / environment | Anonymous ID; browser or desktop; device; input method |
| Goal and media | Intended recipient and source types |
| Activation | Unassisted / assisted / incomplete; specific stopping point |
| Time | Start, first useful note, save/reopen, publication, recipient arrival |
| Storage comprehension | Prediction, actual destination, discrepancy |
| Undo comprehension | Predicted reopen state, observed state, discrepancy |
| Citation success | Correct library, object, note and Reading before and after reload |
| Mobile discovery | Intended exhibit selected; time; wrong turns |
| Evidence | Verbatim observation or quote; distinguish interpretation |
| Next action | Defect, copy change, design experiment, or feature hypothesis |

Report task counts with denominators and uncertainty; do not invent a conversion target before this baseline. Repeat testing after changes to the largest observed obstacles. Test totals and viewport geometry do not substitute for task completion.

## Feature proposal template

- Cohort and task: who encounters what obstacle?
- Evidence: repeated observations, source and date; contrary cases.
- Outcome: task improvement and how it will be measured.
- Smallest experiment: prototype or workflow change; stopping rule.
- State combinations added: medium, storage Adapter, delivery surface, Reading state, pending work, failure/retry.
- Existing Module and Seam: where does the rule belong? Name actual callers or Adapters; avoid hypothetical extension points.
- Interface cost: new methods, ordering rules, error modes and configuration callers must learn.
- Verification: meaningful intersections and one real consumer path. Preserve existing contract fixtures.
- Removal plan: what becomes unnecessary; migration and rollback requirements.
- Decision: proceed, revise or stop; evidence owner and review date.

Track coordination cost during changes: callers changed for a new note field/resource/destination, regressions across packages, and contract-suite runtime. Use observations to choose the next investment; do not optimize for fewer source lines alone.
