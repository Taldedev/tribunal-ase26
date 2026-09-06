---
name: merge-readiness
description: Produce the Tribunal's Merge-Readiness Pack for the current change - the five criteria, each with evidence that can be opened. Use before merging into main, before opening a pull request, or when asked whether a change is ready.
---

# Merge-Readiness Pack

Module 16's gate, in the form this project uses. Five criteria, **each shown by
evidence and never by claim.**

The pack is the human gate and it comes last. The cheap gates — the suite, the
build, the credential scan — need nobody present and have already run. Never
spend a person's attention on work the tests reject.

## Run the cheap gates first

```
npm test          # the specification suite
npm run build     # the bundle must compile
npm run verify    # S9 and S10: the bundle and the whole history
```

If any of the three fails, stop. Report the failure and do not produce a pack.
A pack for a change that does not pass its own tests is theatre.

## Then produce the pack

Dispatch the `merge-reviewer` subagent on the change. It holds the five
criteria in its own instructions, which is where they belong: a reviewer told
the standard at review time is a reviewer working from whatever it remembers.

Give it the diff under review — `git diff main...HEAD`, or the branch name, or
the commit range.

## The five criteria

| # | Criterion | What counts as evidence |
|---|---|---|
| 1 | **Functional completeness** — it matches the specification | The numbered criteria in `docs/spec.md` this change touches, and the thing that makes each true |
| 2 | **Sound verification** — the tests came from the specification | Tests naming their criterion; written by `spec-test-writer`, which cannot read `src/`; the `npm test` tally |
| 3 | **Engineering hygiene** — it fits this project's standards | The rules in `CLAUDE.md`, checked against the diff |
| 4 | **Rationale** — someone wrote down why | Commit messages that would still explain the change in six months; corrections written as rules, not complaints |
| 5 | **Auditability** — the whole trail can be followed | Specification → tests → commits → gate, with `docs/requirements.md` still pointing at things that exist |

## The rule about evidence

A criterion with nothing behind it is **NO EVIDENCE**, never PASS. A gate that
reports a pass it cannot show is worse than no gate at all, because someone
will trust it. The same goes for anything that could not be checked here —
a live deployment, a database migration, anything needing credentials: say it
is unchecked and say who has to check it.

## Where the pack goes

Into the pull request body, and into `docs/merge-readiness.md` when the change
is large enough that the pack itself is part of the record. The point of
writing it down is that it is reviewable by someone who was not present.
