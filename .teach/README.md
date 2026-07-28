# `.teach/` — your private workspace for learning this codebase

Gitignored. Nothing in here ships. This is study material written for exactly one
reader, so it can be blunt, informal, and full of "here's the bit that will bite you."

**Not to be confused with `.claude/skills/teach/`** — that's a different teaching
workspace with a different mission: it produces `docs/learn/`, the onboarding tutorial
for *Archie users*. This one teaches *you* the code behind it.

## How to use it

Ask for the next lesson:

```
/teach next lesson, use .teach/
```

or name a topic:

```
/teach how the annotation spine merges two edits, use .teach/
```

The `/teach` skill treats a directory as a teaching workspace. Point it here.

## What's in here

| Path | What it is |
|---|---|
| `MISSION.md` | Why you're learning this. Every lesson traces back to it. |
| `NOTES.md` | How you like to be taught. Read before writing a lesson. |
| `RESOURCES.md` | Trusted sources — mostly files in this repo, plus the specs it implements. |
| `GLOSSARY.md` | The project's vocabulary, defined once. |
| `lessons/*.html` | The lessons. Open in a browser. |
| `reference/*.html` | Cheat sheets you'll come back to. Lessons get read once; these get reread. |
| `learning-records/*.md` | What you've proven you know — so lessons don't repeat it. |
| `assets/` | Shared stylesheet + widgets. Lessons reuse these, never inline their own. |

## Open a lesson

```bash
xdg-open .teach/lessons/0001-the-shape-of-the-repo.html
```
