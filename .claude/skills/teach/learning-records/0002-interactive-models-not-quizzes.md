# Design pivot: interactive models, not quizzes; onboarding, not a course

Recorded 2026-06-20 from direct user feedback on Lesson 1: "remove the quizzes, favour
interactive models over text, and think of this as an onboarding tutorial."

What changed:
- **Quizzes removed** (`quiz.js` deleted). Retrieval-practice testing is out of scope — this
  is a get-started tutorial, not a graded course.
- **Interactive models are the teaching surface.** Replace prose-heavy explanation with small
  manipulable sandboxes the learner drives and watches respond (`models.js`: drill-down
  containment, grid⇄narrative flipper, click-to-expand spine). Text is captioning, not the
  lesson.
- **Onboarding framing.** Second-person, numbered "steps" (not "lessons"), each ending in a
  concrete first move in the real Studio.

Implication for every future step (see [[NOTES.md]]): before reaching for a paragraph, ask
"can a model show this?" — and verify the model actually works in a headless browser before
shipping (interactivity is now the product, so broken JS is a broken lesson). Supersedes the
quiz convention noted implicitly in [[0001-mission-is-a-docs-spine]].
