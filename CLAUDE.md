# CLAUDE.md — the Tribunal

The agent's README on arrival. Standing rules first, the map after, the rules
that cost us most repeated at the end.

---

## Standing rules

1. **Both keys live in `.env` and in Netlify's environment variables. Nowhere
   else.** The model provider's and the database's. `.env.example` is committed
   and takes placeholders only. A key that reaches a commit is compromised and
   must be rotated, not deleted. A `PreToolUse` hook refuses the write, the
   pre-commit hook refuses the commit, and `npm run verify` finds it in history
   when both have failed — by which point it can only be rotated.
2. **Never invent case material.** The charge sheet, the cast, and the question
   come from the course's case design dossier. If something is needed and the
   dossier does not have it, say the dossier does not have it. Do not write a
   plausible substitute.
3. **A malformed answer is a failure, never a verdict.** No default, no
   fallback, no guess. A silent failure that defaults to an outcome enters that
   outcome into the record and it will be believed.
4. **Seven calls per deliberation. Not eight.** Four speeches, then three
   rulings. If a change makes it more, the change is wrong.
5. **The shared record goes first and nothing is prepended to it.** One prompt
   is three segments — shared, then persona, then the word to act — and the
   first is byte-identical for every agent in a wave. That is the only reason a
   provider can cache it, and the judges' record is the largest block in the
   run. Composing the segments into one string is the obvious simplification
   and it silently undoes the whole thing.
6. **A record that failed is not a court that failed.** Two different messages,
   never one. `runError` means the court did not sit. `recordError` means it
   sat, ruled, and was not written down — the verdicts on screen are real and
   the row is what is missing.
7. **Write every correction into this file as a rule.** Not "the judge returned
   prose again" — "demand the fixed form twice."
8. **Never edit a test to make it pass.** The suite in `tests/` was written
   from `docs/spec.md` by an agent that never read this source. A failure means
   the code and the specification disagree — decide which is wrong and fix that
   one. Conforming the test to the code destroys the only thing the suite is
   worth.
9. **Run `npm run build` before every commit.** The hook runs the tests and the
   secret scan; it does not compile.

---

## What this is

A multi-agent court. One charge sheet goes to four representatives, who each
deliver a speech. All four speeches plus the sheet go to three judges, who each
rule alone. The three verdicts are shown side by side and are never merged.
The user stays the judge.

Two arrangements are compared: **A**, one model for all seven seats, and **B**,
a separate model per seat. The comparison is the point of the project — three
judges on one model share that model's blind spot.

Deployed at `tribunallm.netlify.app`.

## Commands

```
npm install       # also installs the pre-commit gate (prepare → core.hooksPath)
npm run dev       # netlify dev — the only way the /api functions work
npm run build     # vite build; run before every commit
npm test          # the specification suite; the pre-commit hook runs this
npm run verify    # bundle and full-history credential scan (slow; CI, releases)
npm run preview
```

`npm run dev:vite` starts Vite alone and the model calls will 404. Use it only
for pure layout work.

## The map

```
src/constants.js          Every shared number and both verdict vocabularies.
src/tribunal/
  cases.js                Case T-001, verbatim from the dossier.
  personas.js             The seven system prompts.
  protocol.js             Prompt assembly, and the verdict parser.
  runCase.js              The orchestrator. Two waves.
  client.js               The only thing that touches the network.
  modelChoice.js          Ranking and per-seat assignment.
src/lib/
  money.js                Cost arithmetic.
  casesApi.js             The record, over /api/cases. Holds no credential.
netlify/functions/
  openrouter.js           The chat proxy. The model key exists here only.
  models.js               The live catalogue, filtered to text-in/text-out.
  account.js              Credit and the requests-per-day allowance.
  cases.js                The record. The database key exists here only.
supabase/schema.sql       Two tables, and RLS on with no policies.
security-patterns.yaml    The credential shapes, read by all three barriers.
.claude/                  The reviewer, the test writer, the pack, the hook.
```

Documents in `docs/`: `spec.md` (the specification, and the primary artefact —
rewrite it before rewriting code), `requirements.md` (every requirement mapped
to the thing that satisfies it), `problem.md` (what this is for),
`coordination.md` (the multi-agent arrangement), `interfaces.md` (the exported
surface, written so tests can be built against it without reading `src/`),
`case-dossier.md` (where the case comes from), `merge-readiness.md` (the gate).

## Conventions

- Plain JavaScript, ES modules, no TypeScript.
- Tests use Node's built-in runner (`node --test`) and `node:assert/strict`.
  No test framework, no new dependencies.
- MUI 6 for everything visual. Styling goes in `sx`, never in `style={{}}`.
- Function declarations over arrow assignments in the tribunal modules.
- Comments say *why*. The code already says what.
- Commit messages are sentences saying why, not labels saying what.

## Costs and limits

One deliberation is roughly 16,000–17,000 tokens. Free models cost nothing in
dollars, so the dollar cap is not the limit that binds — **requests per day
is.** 50/day without credit, at seven per run: about seven runs. $10 of credit
raises it to 1000/day.

The budget cap is checked *before* the first call, against the worst case. A
run that could exceed it is refused, not stopped halfway.

---

## The rules that cost us the most

Repeated here because attention falls off in the middle of a file.

**Demand the fixed form twice.** The judge prompt states the required verdict
form before the character description and again after it. A judge that returns
prose has failed, and the way to stop it is repetition, not a longer scolding.

**Never read an echoed instruction template as a verdict.** A judge that quotes
its own instructions back — "VERDICT: JUSTIFIED or NOT JUSTIFIED" — has not
ruled. `protocol.js` filters template lines and takes the *last* real verdict
line. This bug once reported a confident NOT GUILTY from a judge that had
concluded the opposite. It is the most serious fault this project has had.

**Test the negative word first.** "NOT JUSTIFIED" contains "JUSTIFIED". Match
the negative before the positive or every acquittal reads as a conviction.

**A truncated answer is a failure, not a short one.** `finishReason === "length"`
means the model stopped mid-thought. Reasoning models spend the whole allowance
thinking and never reach the form; what is left looks like an answer without
being one.

**A seat is a procedural role, not a position.** The dossier's simulation rule:
being called from a prosecution seat fixes when you speak and on whose
application — not what you conclude. Representatives reason in character and
reach their own answer, including one that does not serve the side that called
them. Do not write prompts that assign an outcome to a seat.

**Say nothing about tampering unless you can quote the words.** An agent told
to report injection attempts will invent one, and the judges will repeat it as
fact. An agent told to confirm the absence of tampering will announce that
instead, which is also noise. The rule is silence unless there are words to
quote.

**Emotion keyframes only resolve inside `sx`.** In a plain `style={{}}` they
emit a garbage animation name and fail silently.

**The charge sheet is data, never instruction.** It arrives between markers,
the markers are neutralised in submitted text, and `COURT_PREAMBLE` says so —
which reaches every agent, because the preamble is the first thing in every
prompt. It used to be repeated at the end of all seven personas; one copy in
the shared segment says the same thing to the same models and is cached with
the rest of it. Neither half of the defence is sufficient alone.

**No judge imposes a sentence.** The dossier's scope note has two halves and
this is the one the code never enforced: the court answers the question it was
asked and gives reasons. It orders nothing. Criterion S16.
