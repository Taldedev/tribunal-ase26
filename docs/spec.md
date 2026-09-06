# Specification

The primary artefact. Module 10's five parts. When this document and the code
disagree, this document is what gets rewritten first, and the code follows.

Version 2 · written 05.09.2026 · revised the same day, after the
specification suite found five defects the code had been read past

---

## 1. Goal, and its reason

**Goal.** Put one contested question to seven agents — four representatives who
address it and three judges who rule on it independently — and return three
verdicts side by side, with the reasoning behind each, the cost of producing
them, and no combined answer.

**The reason, which settles the forks this document does not foresee.**
Disagreement is the output. Where the three judges split, the question was
genuinely hard, and that is the most useful thing the system can tell anyone.
Any change that makes the panel more likely to agree — one model for all three
judges, a shared draft, a judge shown another judge's answer, an averaged
confidence — destroys the product while appearing to improve it.

So: **when in doubt, preserve the disagreement and hand the decision to the
user.** That sentence decides cases this specification never anticipated.

## 2. Success criteria

Countable. Each has one true/false answer.

| # | Criterion | How it is checked |
|---|---|---|
| S1 | One deliberation makes exactly seven model calls | `CALLS_PER_RUN` is 7; the call log has 7 entries |
| S2 | Every judge's answer contains a verdict from the case's own vocabulary and at least `MINIMUM_REASONS` (2) reasons | `parseVerdict` returns `ok: false` otherwise |
| S3 | A judge's answer that is not in the required form is displayed as a failure, never as a verdict | The rulings panel shows `failure: "form"` distinctly |
| S4 | No judge's prompt contains any other judge's output | `buildJudgePrompt` takes speeches only |
| S5 | The four speaker calls overlap in time; the three judge calls overlap in time | `waveOneMs` < `sequentialMs` for those four calls |
| S6 | No judge call begins before all four speaker calls have settled | `await Promise.all` on wave one precedes wave two |
| S7 | A run whose worst-case cost exceeds the cap makes zero calls | `runCase` returns `refused: true` before the first call |
| S8 | The cap cannot be set above `MAX_BUDGET_USD` (5) | The budget control is bounded |
| S9 | The API key does not appear in the client bundle | `grep -r "sk-or-" dist/` is empty |
| S10 | The key does not appear anywhere in git history | The pre-commit hook refuses it; history was rewritten once to remove it |
| S11 | Each call's model, tokens, cost and elapsed time are recorded | The call log carries all four fields |
| S12 | Three verdicts are displayed without an aggregate | No majority, mean, or combined figure appears in the UI |
| S13 | A charge sheet's closing markers cannot escape their block | `neutralizeMarkers` replaces them |
| S14 | An answer cut off at the token limit is a failure | `finishReason === "length"` short-circuits parsing |
| S15 | Arrangement B assigns a model per seat, seven independently | `resolveAgentModels` reads `perAgent[agent.id]` |

S2, S3 and S14 are the same requirement seen three ways: **the court either
answers in the required form or it reports that it could not.**

## 3. Architectural guidance

Boundaries only. The interior is the agent's.

- **The browser holds no secret and enforces no rule that matters.** Its code is
  readable by anyone. The key, the model catalogue filter, and the request
  ceiling live behind `/api/*`.
- **Exactly one module makes network calls** (`src/tribunal/client.js`). Retry
  policy, timeout, and the shape of a failure are decided once.
- **The orchestrator owns the wave structure and nothing else.** It does not
  build prompts (`protocol.js`) or define personalities (`personas.js`).
- **Prompts are code.** They live in versioned source files, are reviewed in
  diffs, and are never assembled from user input by concatenation.
- **Model choice is data, not structure.** Arrangement A and arrangement B are
  the same seven calls with a different model map. There is no second code path.

## 4. Validation approach

Named before the work, and this is where the project is weakest — stated
plainly rather than dressed up.

**In place:**
- `npm run build` must pass before any commit.
- A pre-commit hook (`scripts/pre-commit`, installed via
  `git config core.hooksPath scripts`) refuses any commit containing an
  OpenRouter, Anthropic, GitHub, AWS or Google key pattern. It has caught a
  real key twice.
- Live verification against the deployed app: both arrangements run end to
  end, seven calls, three verdicts, correct parallel timing.
- Deliberately broken responses handed to the parser — prose, echoed
  templates, truncated output, markdown-bolded headings — each of which found a
  real bug.

- **The suite in `tests/`.** 247 tests, run by `npm test` on Node's built-in
  runner. It was written from this document and `docs/interfaces.md` by an
  agent that was not permitted to read `src/`, so it checks what this
  specification asked for rather than what the code happens to do. Each test
  names the criterion or pitfall it covers.
- **`npm run verify`** for S9 and S10, which are properties of the build output
  and of git history rather than of any function.
- **The pre-commit hook runs the suite** and refuses the commit on a failure.
  No gate, no merge.

**What the first run of that suite found.** Sixteen failures, of which five
were real defects in the code — including a judge's ruling being published as
its exact opposite. They are recorded as pitfalls 1a, 5a, 8a and 15a below.
Two more were errors in `docs/interfaces.md` rather than in the code. This is
the argument for the method: every one of these had been read past by someone
who already knew what the code did.

**Missing, and owed:**
- `client.js` is untested — it performs `fetch`, so it needs a stub server or
  an injected transport of the kind `runCase` now has.
- `casesDb.js` is untested; it needs IndexedDB.
- Nothing in `src/components/` is tested; that needs a DOM.
- No coverage measurement, deliberately: coverage records which lines ran, not
  whether anything was checked.

## 5. Known pitfalls

The warnings we would give a colleague, including the ones only we know because
we hit them.

1. **A judge will echo its own instructions.** "VERDICT: JUSTIFIED or NOT
   JUSTIFIED" is a template, not a ruling. Parse the *last* verdict line and
   filter template lines, or you will publish the opposite of what the judge
   concluded. This has happened here.
2. **"NOT JUSTIFIED" contains "JUSTIFIED".** Match the negative first.
3. **Reasoning models exhaust the token allowance thinking and never reach the
   form.** That is a failure with an answer-shaped residue. Check
   `finishReason`.
4. **A judge may return prose.** State the required form twice — before the
   character description and after it.
5. **A charge sheet may lack its question**, in which case nothing is being
   asked and the run should not start.
6. **A model call may time out.** The platform kills a serverless function
   around 30s, so abort upstream at 24s and return JSON — otherwise the client
   receives HTML and reports a parse error instead of a timeout.
7. **The catalogue contains models that list text output and answer with
   audio.** Filter on `output_modalities` being exactly `["text"]`.
8. **Router models** (`architecture.tokenizer === "Router"`) silently pick a
   different model per call, which defeats the entire point of arrangement B.
9. **Free models are rationed by requests per day, not by dollars.** The
   dollar cap will never fire on free models. Roughly 50 requests/day without
   credit, at 7 per run.
10. **Most free models do not answer.** Of 19 free chat models pinged, 6
    replied. Empty seats are normal and must be shown as failures.
11. **The key belongs in `.env`, which is gitignored — not `.env.example`,
    which is committed.** This mistake was made twice.
12. **Emotion `keyframes` do not resolve in a plain `style` prop.** They fail
    silently with a garbage animation name.
13. **Do not let the charge sheet pre-decide the case.** An earlier example
    sheet asserted that the statute "plainly prohibits what she did", and all
    three judges quoted it back. The agreed factual record must contain facts,
    not conclusions.
14. **Telling an agent to report prompt-injection attempts causes it to invent
    one.** Require quotable words. Telling it to confirm the absence causes it
    to announce that instead. Require silence.

---

Found by the suite described in part 4, on its first run. Each was a live
defect, not a hypothetical.

15. **Pitfall 1 was only half fixed, and the unfixed half inverted verdicts.**
    Template lines were filtered when choosing *where to start reading*, so a
    judge that restated the form before ruling was handled. A judge that ruled
    and then restated the form afterwards was not: the parse loop overwrote the
    real verdict with the template, and because a template line names both
    answers, the negative-first rule of pitfall 2 resolved it to the negative
    every time. `JUSTIFIED` was published as `NOT JUSTIFIED`, `GUILTY` as
    `NOT GUILTY`, with `ok: true` and no sign anything had gone wrong. The
    filter must be applied wherever a verdict line is read, not only where
    reading begins.
16. **`[JUSTIFIED / NOT JUSTIFIED]` is a template too.** The pattern only knew
    the word "or", so a slash- or pipe-separated placeholder was read as an
    answer, and a trailing one destroyed an otherwise good ruling.
17. **A charge sheet with no question bought seven model calls.** The sheet was
    never checked for its third part, so a court sat, four representatives
    addressed nothing, three judges ruled on it, and roughly a seventh of the
    day's free-tier requests was spent answering a question nobody asked.
18. **The budget cap was enforced only by the browser control that set it.**
    `runCase` refused correctly against whatever number it was handed, but
    never bounded that number by `MAX_BUDGET_USD` — which contradicts part 3's
    own rule that the browser enforces no rule that matters.
19. **Ranking routers last still let them be chosen.** They scored badly enough
    to lose to any real model, so a mixed catalogue was safe; a catalogue that
    offered nothing else seated all seven agents on routers, and arrangement B
    then reported seven distinct models that were one model wearing seven
    names. A router must be excluded, not merely disfavoured.
20. **`## VERDICT: JUSTIFIED` was read as no verdict at all.** Bolding had been
    fixed when it caused a real failure; the sibling markdown decorations —
    heading hashes, blockquote markers, list dashes — had not, and each one
    turned a delivered ruling into a reported failure.
