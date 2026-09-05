# Implementation strategy

This page records the method for new work. The [historical strategy](archive/IMPLEMENTATION-STRATEGY-2026-08-08.md) preserves the original phases and deferred-work snapshot.

## Current authorities

- [CONTEXT.md](../CONTEXT.md) defines the product and domain terms.
- [Architecture decisions](adr/) record architectural choices and their reasons.
- [Hubs](../hubs/INDEX.md) point to relevant rules and evidence.
- [The issue tracker](agents/issue-tracker.md) holds current work, blockers, and completion records in `.seeds/`.
- [TRACKERS.md](TRACKERS.md) maps legacy issue and decision identifiers. `ISSUES.md` is frozen.
- [Verification](../hubs/verification.md) defines the checks for a change.

## Method

1. Read the relevant decisions and hub before you define the work.
2. Build the authoritative source before its projections or adapters.
3. Preserve proven behavior before you add an invented interaction.
4. Resolve the largest unknown first within each dependent sequence.
5. Give each task a bounded scope, dependencies, and an observable completion criterion.
6. Use representative users for acceptance criteria that require human comprehension.
7. Run the relevant checks before you report completion.
8. Record the result in the issue and dated evidence, with a pointer from the relevant hub.

The historical phases explain the original build sequence. Current task selection comes from `.seeds/` and the user's request.
