// Deliberate CI tripwire test (ISSUES.md Issue 1) — proves the typecheck job catches a real error.
// Reverted in the next commit.
const shouldBeAString: string = 12345;
export { shouldBeAString };
