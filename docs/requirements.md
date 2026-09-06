# Requirements, and where each one is satisfied

The running project's requirements, module by module, each pointing at the
thing that satisfies it and the way to check that for yourself.

This document exists because of the grading rule: **only what can be opened and
verified in the repository counts, and a verbal claim counts for nothing.** A
map from requirement to evidence turns that rule from a hazard into the point.
Every row below names a file, a command, or both. Where something is not done,
the row says so rather than going missing.

Run these three first. Everything else in this document is reading.

```
npm install       # also installs the pre-commit gate
npm test          # the specification suite
npm run build
npm run verify    # the bundle and the whole git history
```

And once a Supabase project exists, the one that proves the fourth layer is
really there rather than merely configured:

```
npm run check:record
```

---

## The build assignment (Lesson 4)

| Asked for | Where it is | How to check |
|---|---|---|
| A browser screen with the three-part charge sheet — the defendant, the act, the exact question — and the opinion shown back | [`src/components/ChargeSheetForm.jsx`](../src/components/ChargeSheetForm.jsx), [`VerdictsPanel.jsx`](../src/components/VerdictsPanel.jsx) | Open the deployed site and read the form's three fields |
| A backend that checks the sheet, calls the model, and keeps the key on the server | [`netlify/functions/openrouter.js`](../netlify/functions/openrouter.js) | The key is `process.env.OPENROUTER_API_KEY`, read only there; `npm run verify` proves it is in no bundle and no commit |
| A database that stores every charge sheet and its opinion, so a past case can be found | [`supabase/schema.sql`](../supabase/schema.sql), [`netlify/functions/cases.js`](../netlify/functions/cases.js), [`src/lib/casesApi.js`](../src/lib/casesApi.js) | Run a case, then open Past cases in a different browser |
| A log of every model call — the model, the verdict, the tokens, the cost, the time | the `model_calls` table | Seven rows per completed run, failures included |
| Deployment: someone else can open it at a web address and put a case | [`netlify.toml`](../netlify.toml), and the address in [`README.md`](../README.md) | Open it |
| **SQL or NoSQL, and what makes you lean that way** — the question left open to the class | answered in [`spec.md`](spec.md) part 3 | The two-table split is the argument: aggregates over the call log, a document for the deliberation |

## Module 6 — the problem is found, not given

| Deliverable | Where | Its own test, applied |
|---|---|---|
| Problem statement | [`problem.md`](problem.md) §1 | Could several different solutions be proposed for it? Four are named |
| Stakeholder list | [`problem.md`](problem.md) §2 | Nobody discovers themselves on it too late — the last two rows are the ones this test added, and one of them changed the prompts |
| Definition of done | [`problem.md`](problem.md) §3 | Could two readers disagree? Item 6 is named as the one that could |
| Out-of-scope list | [`problem.md`](problem.md) §4 | Could someone reasonably have expected this in scope? Two entries are there for that reason |

## Module 7 — web application architecture

Four layers, drawn with each one's job in [`spec.md`](spec.md) part 3. The
browser holds no secret and enforces no rule that matters; both keys live in
functions; the database is behind a function and not inside the browser. The
per-call log is a table rather than a field.

## Module 8 — interface design

| Asked for | Where |
|---|---|
| Verdict first, reasons after, fuller argument below | [`VerdictsPanel.jsx`](../src/components/VerdictsPanel.jsx), then [`ProtocolPanel.jsx`](../src/components/ProtocolPanel.jsx), then [`SpeechesPanel.jsx`](../src/components/SpeechesPanel.jsx) |
| Three verdicts shown together, never buried | one row, always three seats, an empty one shown as empty |
| Only a form and a button — resist the controls an agent adds | the charge sheet form and Convene |
| The wrong paths named: an incomplete sheet, and what shows while the panel deliberates | `validateChargeSheet`, and [`CourtroomScene.jsx`](../src/components/CourtroomScene.jsx) — "The bench is deliberating" |
| **Failure shown as failure, never as verdict** | `NO RULING` in the verdict's own place, raw answer kept; criteria S3 and S14 |
| A failed save shown as a failed save and not as a failed court | the `recordError` banner beside the verdicts; criterion S22 |

## Module 9 — the model is a runtime component

| Lever, in the order the module gives them | Where |
|---|---|
| Choice of model — the biggest | live catalogue, free models first, per-seat in arrangement B: [`modelChoice.js`](../src/tribunal/modelChoice.js) |
| **Prompt caching for the repeated part** | the shared segment is first and identical: `buildSpeakerMessages` / `buildJudgeMessages` in [`protocol.js`](../src/tribunal/protocol.js); criteria S17, S18 |
| Parallelism for what does not depend | four speakers together, then three judges together: [`runCase.js`](../src/tribunal/runCase.js); criteria S5, S6 |
| Economic blast radius: a hard cap on calls and on spend per run | `CALLS_PER_RUN`, `MAX_BUDGET_USD`, refusal before the first call; criteria S1, S7, S8 |
| A check outside the model, because a form check cannot catch a fluent wrong answer | `parseVerdict` requires a verdict and two reasons; criterion S2 |
| The saving reported rather than asserted | `cachedTokens` on every call and in the totals; criterion S19 |

## Module 10 — the specification is the deliverable

[`spec.md`](spec.md), five parts, version 3, and **written before the code it
describes** — the four changes in it did not exist when it was committed. Its
history is the audit trail: `git log --follow docs/spec.md`.

"Verdict plus at least two reasons" is criterion S2. Twenty-six pitfalls are in
part 5, six of them written before the work rather than after it.

## Module 11 — context engineering

| Asked for | Where |
|---|---|
| A `CLAUDE.md` under 200 lines, hand-written | [`CLAUDE.md`](../CLAUDE.md) — `wc -l` it |
| Rules at the beginning and the end, never the middle | standing rules first; the rules that cost most repeated at the end |
| Every correction written down as a rule, not a complaint | the closing section: "demand the fixed form twice", "test the negative word first" |
| Subtract before you add | the injection clause was removed from all seven personas into one shared preamble |
| **A file advises; a hook enforces** | [`.claude/settings.json`](../.claude/settings.json) → [`scripts/guard-secrets.sh`](../scripts/guard-secrets.sh), a `PreToolUse` hook that refuses a write carrying a credential |
| Hide the skills that commit, deploy or send | nothing here commits, deploys or sends, so there is nothing to hide with `disable-model-invocation`. If such a skill is ever added, that is the rule it takes |

## Module 12 — version control as safety infrastructure

| Asked for | How to check |
|---|---|
| Atomic commits whose message says *why* | `git log` — the diff says what, so each message says why, and each is one logical change |
| A pre-commit hook scanning for the key | [`scripts/pre-commit`](../scripts/pre-commit); it refuses the commit and runs the suite |
| **The hook installed rather than documented** | `npm install` sets it: criterion S24. `git config --get core.hooksPath` reads `scripts` |
| Never commit a secret | `npm run verify` walks every commit on every branch |
| A merge boundary | the branch this work was done on and its pull request; CI is the mechanical half |

## Module 13 — verification before trust

| Asked for | Where |
|---|---|
| Tests written from the specification by an agent that never saw the code | [`.claude/agents/spec-test-writer.md`](../.claude/agents/spec-test-writer.md) encodes the rule; `tests/` is its output; each test names its criterion |
| Shape-check the model's output | `parseVerdict`, plus `finishReason === "length"` treated as failure |
| Hand it broken responses on purpose | the parser blocks in `tests/protocol.test.js` — prose, echoed templates, truncation, markdown decoration |
| Cheap gates first, the human gate last | `npm test` → `npm run build` → `npm run verify`, then the pack |
| **No gate, no merge** | the pre-commit hook, and [`.github/workflows/gate.yml`](../.github/workflows/gate.yml) on every push and pull request; criterion S25 |
| No coverage measurement | deliberate, and stated in [`spec.md`](spec.md) part 4: coverage records which lines ran, not whether anything was checked |

## Modules 14 and 15 — decomposition and orchestration

[`coordination.md`](coordination.md): the patterns and where each applies, every
agent's role, input, output and boundary, how work passes, what happens when an
agent fails, and what the arrangement costs and buys.

The rule that shapes it: **never show an agent another agent's conclusion.**
Judges see speeches, never verdicts — criterion S4. The two arrangements exist
because three judges on one model share that model's blind spot, and the run
reports how many distinct models it actually reached rather than trusting the
label.

## Module 16 — review, quality and legacy code

| Asked for | Where |
|---|---|
| **The Merge-Readiness Pack, evidenced and not asserted** | [`merge-readiness.md`](merge-readiness.md), and [`.claude/skills/merge-readiness/`](../.claude/skills/merge-readiness/SKILL.md) to produce one |
| The five criteria written into the reviewer's instructions | [`.claude/agents/merge-reviewer.md`](../.claude/agents/merge-reviewer.md) |
| Whoever wrote the work cannot judge the work | the reviewer is a separate agent; the test writer cannot read `src/` |
| Judge your own early work as foreign | the two defects in commit `acdcb72` — a conditional with identical branches, and an error message naming a timeout the code does not use. Both survived a green suite; both were found by reading |
| Comments lie — where code and comment disagree, the code is true | that error message is the worked example, and it was in this repository |

## Module 17 — building secure software

| Asked for | Where |
|---|---|
| The charge sheet marked as data | `neutralizeMarkers` in [`protocol.js`](../src/tribunal/protocol.js) *and* the instruction in `COURT_PREAMBLE`; neither is sufficient alone; criterion S13 |
| No command built by joining strings | prompts are versioned source, never assembled from user input; the functions accept named capped fields, and there is no filter parameter to craft |
| Secrets kept outside and scanned before every commit | [`security-patterns.yaml`](../security-patterns.yaml), read by all three barriers |
| Dependencies pinned and reviewed | exact versions in [`package.json`](../package.json), with the lock file committed |
| Least privilege | row-level security enabled on both tables with no policies, so any key that is not the service role reads nothing |
| A human where the stakes are high | the user weighs the three verdicts; the court decides nothing and acts on nothing |
| The output gated before any action | there is no action to gate — the system produces text and takes no step in the world. Stated rather than claimed as a defence |
| **Make the standard repeatable: a subagent, a skill, and a hook** | [`.claude/agents/`](../.claude/agents), [`.claude/skills/merge-readiness/`](../.claude/skills/merge-readiness/SKILL.md), [`.claude/settings.json`](../.claude/settings.json) |

## What is not done

Stated here rather than left for someone to notice.

- **`client.js` and the four functions have no unit tests.** They perform
  `fetch`. `casesApi.js` is tested through an injected transport;
  `netlify/functions/cases.js` is exercised end to end by
  `npm run check:record`, and `openrouter.js` only by a live run.
  [`spec.md`](spec.md) part 4 lists this as owed.
- **Nothing in `src/components/` is tested.** That needs a DOM, and adding one
  means a new dependency and a new toolchain.
- **CI reports; it does not yet refuse.** Requiring the check is a branch
  protection setting in GitHub, not a file here. [`README.md`](../README.md)
  says which setting.
- **Every model call is verified against a live provider, not a fake.** There is
  no recorded-response harness, so the suite cannot prove anything about how a
  real model behaves — only about how this code treats what a model returns.
