---
name: product-copy
description: Product copy, microcopy, and UX writing for in-product UI text — button labels, errors, empty states, onboarding, notifications, tooltips. Use when writing or reviewing UI copy, or aligning it to product voice, especially when copy is generated alongside code.
---

> `[design tool]` and `[knowledge base]` are placeholders for the user's connected design and docs tools. For connected-tool and role/company context, see [REFERENCE.md](../../REFERENCE.md).

# Product Copy Skill

You write the words inside a product so they are clear, consistent, and indistinguishable from what a careful UX writer would ship.

Two facts shape everything below. Copy is part of the **system image**: users never see your code or your team's model of the product, only the UI, the behavior, and the words — so the words are how the intended model reaches them. And when copy is generated next to code, it gets written blind (no running UI) and one string at a time (no view of the whole), which causes specific, recognizable failures. **Before you write** and **Pitfalls** address those.

## Core rules

- **Clarity over cleverness.** Plain language, one idea per sentence, active voice, concrete verbs. The boring clear version usually wins.
- **Brevity with substance.** Short, but never at the cost of the next step. Cut filler, not information.
- **Describe the user's outcome, not the system.** "Your changes are saved" beats "The system has persisted the record."

## How copy builds the user's mental model

Users act on a _mental model_ — their belief about how the product works (Craik; central to UX through Don Norman and NN/g). Your job is to make that model accurate, and copy does much of the work, in the two directions Norman called the gulfs:

- **Execution (intent → action).** Before acting, the user asks "how do I do what I want?" CTAs, labels, hints, and onboarding answer it by mapping intent to an available action. Specific verbs (`Send invite`) narrow the gap; vague ones (`Submit`) widen it.
- **Evaluation (result → understanding).** After acting, the user asks "did that work, and where am I now?" Confirmations, status, and well-formed errors answer it. Timely, clear, proportional feedback reinforces the model; vague or missing feedback makes users retry and lose trust. Say what changed, not just "Done."

Three principles keep the model coherent:

- **Speak the user's language, not the system's.** People think in the words of their task; the code, schema, and tickets speak builder language. The UI is the translation layer — label things by what they mean to the user, never by the data structure behind them.
- **Name each thing once.** Every distinct object (`project`, `draft`) and action (`Delete`) gets exactly one name, used identically on every surface — empty state, tooltip, error, email, settings. Two words for one concept, or one word for two, makes users misread the product's structure. Generating strings one at a time is what breaks this.
- **Meet the model users arrive with; teach a new one only when you must.** People expect your product to work like the others they know, so conform where you can. When you do introduce a genuinely new concept, teach it in context and define the term the first time it appears — users absorb models by doing, not by reading a manual they will skip.

**The builder's trap:** designers form rich models of their own creation and assume every feature is obvious (Norman). An agent that can read the code is the extreme case — the fullest internal model, the least feel for a first-time user. Default to assuming the user knows none of the internal structure.

## Before you write

1. **Read the existing copy first.** Search the codebase, string catalog, `[design tool]`, and `[knowledge base]` for how the product already says things, and match it — terms, voice, capitalization. Reuse the existing string for the same concept; write a new one only when an existing label would read wrong here.
2. **Put the string where it belongs.** Into the i18n/string catalog with a key that follows the existing convention — not hardcoded in a component.
3. **Check the surface.** Button width, mobile truncation, title vs. paragraph. If you can't see it, state your assumption.
4. **Verify the fact.** Only describe behavior and guarantees that exist. Don't write "We'll never share your data" or "Saved to the cloud" unless it's true; inventing a promise is worse than awkward phrasing.

## Pitfalls (the coding-agent tells)

Patterns that immediately mark copy as machine-generated.

**Internal vocabulary leaking into the UI** — the most common and least obvious tell. The agent surfaces words from its source (code, schema, tickets, the prompt) as if users share them.

- `Auth token expired. Re-authenticate.` → `Your session ended. Sign in again.`
- `Field 'email' cannot be null` → `Enter your email.`
- `Status: PENDING_REVIEW` → `Status: In review`
- Raw engineering terms — `payload`, `endpoint`, `cache`, `400 Bad Request`, `boolean`, `record` — and internal codenames (`Project Falcon`) → the user-facing word, or the shipped product name.
- Don't paste a ticket's or spec's wording, with its internal acronyms, straight onto the screen.

**Fake apologies and "Oops."** `Oops! Something went wrong. Please try again later.` → `Couldn't save your changes. Check your connection and try again.`

**Over-explaining.** `In order to proceed with the deletion, please confirm you would like to continue.` → heading `Delete this item?`, button `Delete`.

**Blaming the user.** `You entered an invalid email address.` → `Enter a valid email, like name@example.com.`

**Forced cheer, exclamation marks, emoji.** `Awesome! 🎉 Your profile is all set!` → `Profile saved.`

**Redundant "successfully."** `Changes successfully saved!` → `Changes saved.`

**Vague CTAs.** `Submit` / `OK` / `Click here` → the specific outcome: `Create account`, `Send invite`, `Delete file`.

**Cleverness that doesn't translate.** `Whoopsie — our hamsters fell off the wheel!` → `Something went wrong on our end. Try again in a few minutes.`

**Punctuation tells.** Em-dashes and semicolons rarely belong in short UI strings; use a period, a comma, or two sentences. Keep straight vs. curly quotes consistent with the existing copy.

**Directional or color-dependent references.** `Click the green button on the right.` → refer to the label: `Select Continue.` (Also fails for screen readers.)

**Placeholder leftovers.** Never ship `Lorem ipsum`, `TODO`, `Your text here`, or a default framework string. If you don't have the real copy, flag it rather than invent filler that looks final.

## Writing copy in code

- **No hardcoded English** — strings go in the catalog with a key, or they can't be localized or reviewed.
- **No sentence concatenation.** `"You have " + n + " messages"` breaks translation and pluralization; use the framework's plural/interpolation API.
- **Handle zero, one, and many** — `No messages`, `1 message`, `{count} messages`. Never ship "1 messages."
- **Leave ~30% length headroom** for languages that run longer than English.
- **One capitalization convention,** applied everywhere. Sentence case is the safe default; match the product if it chose Title Case.
- **One key, one meaning** — don't share a key across diverging contexts, even if the English happens to match.

## Microcopy patterns

- **Errors:** what happened in user terms, then the next step. Offer retry or a path to help; push detail to a tooltip or link.
- **Empty states:** why it's empty and what to do about it, with a primary action when one exists. Guide, don't decorate.
- **CTAs:** action verb plus object, specific, short enough to fit and read aloud — `Save changes`, `Add payment method`.
- **Onboarding:** lead with value and the next action, one concept per step, with a skip where reasonable.
- **Notifications and confirmations:** state the outcome plainly (`Invite sent`). For destructive actions, name the consequence and make the button match the verb (`Delete`, not `OK`).

## Voice, tone, and ownership

Align with product and brand guidelines when they exist (check the `[knowledge base]`). Tone can shift by context — errors more empathetic, success states neutral — while the underlying voice stays coherent. When guidance is missing, default to clear and helpful over personality.

Copy written directly in the `[design tool]` is the source of truth for flows and components until handoff. Use a separate copy doc (in the `[knowledge base]`) for longer or reusable strings — onboarding sequences, emails, the error catalog, the glossary — or anything needing copy/localization review. At handoff, make sure engineering has the final copy and that acceptance criteria flag any string that must match exactly.

## Final pass

- [ ] Every word is one the user would recognize — nothing leaked from code, schema, tickets, or status enums
- [ ] Each concept and action is named identically on every surface
- [ ] After each action, copy says what changed and the new state
- [ ] CTAs are specific verbs; errors say what to do next without blaming
- [ ] Every claim about the product is true
- [ ] Strings are in the catalog; plurals, zero-states, and translation headroom handled
- [ ] No "Oops," redundant "successfully," emoji, or placeholder text (unless the product's voice genuinely calls for it)
