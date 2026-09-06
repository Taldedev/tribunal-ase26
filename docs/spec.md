# Specification

The primary artefact. Module 10's five parts. When this document and the code
disagree, this document is what gets rewritten first, and the code follows.

Version 3 · written 06.09.2026 · rewritten before the code it describes

Version 2 was written after the fact, from a built system, which Module 10
permits and this project did. Version 3 is written the other way round: the
four changes below do not exist yet when this document is committed, and the
tests for them are written from this document by an agent that is not shown the
implementation. That order is the point. A specification revised to match code
that already runs cannot fail, and a document that cannot fail is not a
specification.

---

## 1. Goal, and its reason

**Goal.** Put one contested question to seven agents — four representatives who
address it and three judges who rule on it independently — and return three
verdicts side by side, with the reasoning behind each, the cost of producing
them, and no combined answer. Keep every deliberation, and the log of every
model call it made, in a database that outlives the browser that ran it.

**The reason, which settles the forks this document does not foresee.**
Disagreement is the output. Where the three judges split, the question was
genuinely hard, and that is the most useful thing the system can tell anyone.
Any change that makes the panel more likely to agree — one model for all three
judges, a shared draft, a judge shown another judge's answer, an averaged
confidence — destroys the product while appearing to improve it.

So: **when in doubt, preserve the disagreement and hand the decision to the
user.** That sentence decides cases this specification never anticipated.

**The second reason, which the record adds.** A deliberation that cannot be
found again is a deliberation that cannot be checked. The comparison between
the two arrangements happens across runs minutes or days apart, and an audit
trail that lives in one browser's local storage is an audit trail that a
cleared cache destroys. The record is infrastructure, not a feature.

## 2. Success criteria

Countable. Each has one true/false answer.

### The court

| # | Criterion | How it is checked |
|---|---|---|
| S1 | One deliberation makes exactly seven model calls | `CALLS_PER_RUN` is 7; the call log has 7 entries |
| S2 | Every judge's answer contains a verdict from the case's own vocabulary and at least `MINIMUM_REASONS` (2) reasons | `parseVerdict` returns `ok: false` otherwise |
| S3 | A judge's answer that is not in the required form is displayed as a failure, never as a verdict | The rulings panel shows `failure: "form"` distinctly |
| S4 | No judge's prompt contains any other judge's output | `buildJudgeMessages` takes speeches only |
| S5 | The four speaker calls overlap in time; the three judge calls overlap in time | `waveOneMs` < `sequentialMs` for those four calls |
| S6 | No judge call begins before all four speaker calls have settled | `await Promise.all` on wave one precedes wave two |
| S7 | A run whose worst-case cost exceeds the cap makes zero calls | `runCase` returns `refused: true` before the first call |
| S8 | The cap cannot be set above `MAX_BUDGET_USD` (5) | The budget control is bounded, and `runCase` bounds it again |
| S12 | Three verdicts are displayed without an aggregate | No majority, mean, or combined figure appears in the UI |
| S13 | A charge sheet's closing markers cannot escape their block | `neutralizeMarkers` replaces them |
| S14 | An answer cut off at the token limit is a failure | `finishReason === "length"` short-circuits parsing |
| S15 | Arrangement B assigns a model per seat, seven independently | `resolveAgentModels` reads `perAgent[agent.id]` |
| **S16** | **No judge is permitted to impose a sentence** | `judgeSystemPrompt` forbids it, in the persona segment and not only in the shared preamble — the preamble also reaches four representatives who were never going to sentence anyone |

S2, S3 and S14 are the same requirement seen three ways: **the court either
answers in the required form or it reports that it could not.**

S16 is new in version 3 and it comes from reading the dossier against the code.
The scope note has two halves — the Tribunal does not combine the three
opinions, and it does not impose a sentence. The architecture enforced the first
everywhere and nothing at all enforced the second.

### The secret

| # | Criterion | How it is checked |
|---|---|---|
| S9 | No API key or database credential appears in the client bundle | `npm run verify` greps `dist/` |
| S10 | No credential appears anywhere in git history | The pre-commit hook refuses it; `npm run verify` walks every commit |

### The record

| # | Criterion | How it is checked |
|---|---|---|
| S11 | Each call's model, verdict, tokens, cached tokens, cost and elapsed time are recorded | The call log carries all six fields |
| **S20** | A finished deliberation is stored server-side and can be read back by a different browser | `POST /api/cases` then `GET /api/cases` from a clean session |
| **S21** | Every model call in a run is stored as its own row, including the failed ones | Seven `model_calls` rows per completed run |
| **S22** | A deliberation the record refused is reported to the user as unrecorded, never dropped silently | The run panel shows the save failure beside the verdicts |
| **S23** | No database credential ever reaches the browser | The browser talks only to `/api/cases`; `SUPABASE_*` is read only inside functions |

### The cost lever

| # | Criterion | How it is checked |
|---|---|---|
| **S17** | Within one wave, the shared segment is byte-identical for every agent in it | `buildSpeakerMessages` and `buildJudgeMessages` return the same `shared` for every agent given the same inputs |
| **S18** | The shared segment is sent before any agent-specific text | `Segments` declares its keys in the order `shared`, `persona`, `user`, and that is the order `client.js` sends them in |
| **S19** | Every call records how many prompt tokens were served from cache | `cachedTokens` is a number on every log entry, zero when none |

S17 and S18 are one requirement split so each can fail on its own. A prefix is
only cacheable if it is identical **and** first; the previous design satisfied
neither, because each agent's own persona came first and the shared charge
sheet came after it.

**S18 is the weakest criterion here and it is worth saying why.** What has to
be true is a property of the message array, and that array is built in
`client.js`, which performs `fetch` and is not unit-testable in this process.
So the suite checks the declared key order of `Segments` — which is a real
check, since it fails if a builder is rewritten to put the persona first — and
the send order itself is verified by reading `client.js` and by a live run
reporting a non-zero cached-token count. A criterion whose mechanical check is
one step removed from the thing it wants should say so rather than look as firm
as the rest.

### The gate

| # | Criterion | How it is checked |
|---|---|---|
| **S24** | The pre-commit gate installs itself on `npm install` | `package.json` `prepare` sets `core.hooksPath`; a fresh clone is gated without anyone reading the README |
| **S25** | Tests, build and the credential scan run on every push and every pull request | `.github/workflows/gate.yml` |

S24 exists because version 2's gate was real and uninstalled. The hook was
written, it worked, it had caught a live key twice — and it was activated by a
line in the README that a fresh clone does not run. A control that depends on
someone remembering is the thing Module 13 says is not a control.

## 3. Architectural guidance

Boundaries only. The interior is the agent's.

**Four layers, and each one's job.** Module 7's request cycle is the anchor: a
part that cannot be placed is a part nobody has understood yet.

```
browser        the form, the panels, the arithmetic that only displays
   |           holds no secret and enforces no rule that matters
   v
functions      /api/openrouter  the chat proxy; the model key lives here
   |           /api/models      the catalogue, filtered
   |           /api/account     the tier and the day's allowance
   |           /api/cases       the record; the database key lives here
   v
database       cases         one row per deliberation
   |           model_calls   one row per call, seven per deliberation
   v
deployment     a web address someone else can open and put a case to
```

- **The browser holds no secret and enforces no rule that matters.** Its code is
  readable by anyone. The model key, the database key, the catalogue filter and
  the request ceiling all live behind `/api/*`.
- **Exactly one module makes model calls** (`src/tribunal/client.js`) and
  **exactly one module reads or writes the record** (`src/lib/casesApi.js`).
  Retry policy, timeout, and the shape of a failure are each decided once.
- **The functions are not a general proxy.** Each accepts a named, length-capped
  set of fields and nothing else. A crafted request must not be able to send
  arbitrary messages to a model, or arbitrary filters to the database, at the
  site owner's expense.
- **The orchestrator owns the wave structure and nothing else.** It does not
  build prompts (`protocol.js`) or define personalities (`personas.js`) or write
  to the record (`casesApi.js`).
- **Prompts are code.** They live in versioned source files, are reviewed in
  diffs, and are never assembled from user input by concatenation.
- **Model choice is data, not structure.** Arrangement A and arrangement B are
  the same seven calls with a different model map. There is no second code path.

**Why SQL, which the class was asked to argue.** Two shapes of question are put
to this data. "Show me case T-001 as it was decided on Tuesday" wants one
document, and a document store would serve it well. "What did the judges cost,
per model, across every run of arrangement B" wants an aggregate over a fixed
set of columns, and that is the question the project exists to answer. The call
log has seven identical-shaped rows per run, a stable set of numeric fields, and
a foreign key to the run that made them. The deliberation itself is nested and
irregular, so it is stored as `jsonb` inside a relational row. **The relational
half is where the questions are; the document half is where the reading is.**

## 4. Validation approach

Named before the work.

**Cheap gates, and they run without anyone present:**
- `npm test` — the specification suite on Node's built-in runner. Written from
  this document and [`interfaces.md`](interfaces.md) by an agent that was not
  permitted to read `src/`, so it checks what this specification asked for
  rather than what the code happens to do. Each test names the criterion or
  pitfall it covers.
- `npm run build` — the bundle must compile.
- `npm run verify` — S9 and S10, which are properties of the build output and of
  git history rather than of any function.
- **The pre-commit hook runs the suite and the credential scan, and installs
  itself** (S24). No gate, no merge.
- **CI runs all three on every push and pull request** (S25), because a hook is
  local and a hook can be bypassed with `--no-verify`.

**The human gate, last:** the Merge-Readiness Pack in
[`merge-readiness.md`](merge-readiness.md), five criteria each shown by evidence
that can be opened. Never spend attention on work the cheap gates reject.

**Live verification, because a model is a runtime component:** both arrangements
run end to end against the deployed site — seven calls, three verdicts, correct
parallel timing, a stored case read back in a browser that did not create it,
and a non-zero cached-token count on the second run of the same sheet.

**Deliberately broken responses handed to the parser** — prose, echoed
templates, truncated output, markdown-bolded headings — each of which found a
real bug. This continues to be the most productive test in the project.

**What version 2's first suite run found, kept here because it is the argument
for the method.** Sixteen failures, of which five were real defects in the code
— including a judge's ruling being published as its exact opposite. Two more
were errors in `interfaces.md` rather than in the code. Every one of them had
been read past by someone who already knew what the code did.

**Missing, and owed:**
- `client.js` is untested — it performs `fetch`, so it needs a stub server or an
  injected transport of the kind `runCase` has.
- `casesApi.js` is tested only through an injected transport; the function that
  talks to the database is verified live, not in the suite.
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
9. **Free models are rationed by requests per day, not by dollars.** The dollar
   cap will never fire on free models. Roughly 50 requests/day without credit,
   at 7 per run.
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
15. **Pitfall 1 was only half fixed, and the unfixed half inverted verdicts.**
    Template lines were filtered when choosing *where to start reading*, so a
    judge that restated the form before ruling was handled. A judge that ruled
    and then restated the form afterwards was not: the parse loop overwrote the
    real verdict with the template, and because a template line names both
    answers, the negative-first rule of pitfall 2 resolved it to the negative
    every time. `JUSTIFIED` was published as `NOT JUSTIFIED`, with `ok: true`
    and no sign anything had gone wrong.
16. **`[JUSTIFIED / NOT JUSTIFIED]` is a template too.** The pattern only knew
    the word "or", so a slash- or pipe-separated placeholder was read as an
    answer.
17. **A charge sheet with no question bought seven model calls.** The sheet was
    never checked for its third part, so a court sat and answered a question
    nobody asked.
18. **The budget cap was enforced only by the browser control that set it.**
    `runCase` refused correctly against whatever number it was handed, but never
    bounded that number by `MAX_BUDGET_USD`.
19. **Ranking routers last still let them be chosen.** A catalogue that offered
    nothing else seated all seven agents on routers, and arrangement B then
    reported seven distinct models that were one model wearing seven names. A
    router must be excluded, not merely disfavoured.
20. **`## VERDICT: JUSTIFIED` was read as no verdict at all.** Bolding had been
    fixed; heading hashes, blockquote markers and list dashes had not.

### Written before the work, for the four changes in this version

21. **A cacheable prefix must be identical *and* first, and the old order was
    neither.** Putting the persona first meant the shared charge sheet began at
    a different token offset in all seven calls, so no provider could match a
    prefix. Moving the shared block first is the whole change; anything that
    prepends per-agent text to it silently undoes it.
22. **A cache breakpoint is not portable.** Some providers cache long prefixes
    automatically and ignore the marker; others require it; others may reject a
    request that carries a field they do not know. Send the breakpoint, and on a
    rejection that names it, retry once without it. Never let a cache
    optimisation turn into a failed deliberation.
23. **Cached tokens make the fallback price list wrong in the safe direction.**
    The catalogue price cannot know what fraction was served from cache, so the
    estimate is a worst case and must be labelled as one. Prefer the charge the
    provider reports.
24. **A record that fails to save must not be reported as a court that failed
    to sit.** The deliberation happened, the verdicts are on screen, and the
    only thing lost is the row. Two different failures, two different messages —
    and neither of them silence.
25. **A service-role database key bypasses every row-level policy by design.**
    It is the reason the browser must never hold it and the reason the function
    must accept named fields rather than a filter. Row-level security is
    enabled on both tables so that a key which is *not* the service role gets
    nothing at all.
26. **`git config core.hooksPath` is local configuration and does not clone.**
    A hook committed to the repository is not a hook installed in a checkout.
    `npm install` has to do it, and CI has to not depend on it.

### Found by the suite described in part 4, on its first run against version 3

Four of these were defects and four were faults in the documents. Recorded
separately from the ones above because the method that found them is the
argument for the method.

27. **A field declared on a data shape and stored nowhere is a lie about the
    record.** `CaseSummary` reported `distinctModels`, read back from storage,
    and `CaseRow` had no column to store it in - so every stored case reported
    that one model had sat in all seven seats. The comparison panel, whose
    entire subject is how many distinct models a run reached, would have said
    "1 of 7 seats" for every past run of arrangement B. Nothing failed; the
    figure was simply wrong, and it was wrong in the direction that makes
    arrangement B look pointless. The per-seat model map is now stored.
28. **"No method throws" carries no qualification.** `addCase(undefined)` threw,
    because a guard against a missing run had never been written - every caller
    passes one. The discipline exists so that a failed save is always
    reportable, and a method that throws on the way to reporting a failure has
    defeated it.
29. **A truncated speech was recorded as an ordinary one.** The call log carried
    a truncation flag in the browser and dropped it at the database boundary, so
    the stored log could not distinguish a speech that ended from a speech that
    ran out of tokens. Pitfall 3 makes that distinction a first-class failure
    everywhere else.
30. **An unused declaration is worse than a missing one.** `Usage.cacheDiscount`
    was read from the provider, declared in the interfaces, and consumed by
    nothing. It is removed. `cachedTokens` is the evidence that caching worked;
    a second figure that nothing reads only invites a later reader to trust it.

### Found while writing the instructions for verifying the caching

31. **Two of Module 9's own levers pull against each other, and this project
    uses both.** A prefix is cached when a request is *processed*; the calls
    within a wave are dispatched together by `Promise.all` and are therefore
    all in flight before any of them has finished. So the second and third
    judge do not read a prefix the first judge warmed - none of the three has
    landed yet when the others start. Parallelism is what makes a deliberation
    take 40 seconds instead of 97; it is also what stops the shared prefix
    paying off *inside* one deliberation.

    **Measured, and the sentence that used to stand here was too strong.** A
    first run of a fresh sheet on `minimax/minimax-m3:free` reported **896 of
    20,076 prompt tokens from cache**, so some of it does land inside one
    deliberation. The calls in a wave are dispatched together but do not land
    together - the four speeches returned across 1.7s to 2.8s - and a provider
    writes its prefix cache when the prompt is processed rather than when
    generation finishes, so a sibling starting a moment behind can still hit
    it. The effect is real and small: 4% here, not the threefold saving a fully
    warmed prefix across three judges would give.

    So: a small figure on a first run, a larger one on an immediate second run
    of the same sheet, and neither is evidence of anything the bill does not
    show. Lock what use confirmed, not what argument confirmed.

    **This is not a reason to serialise the waves.** Wall-clock time is the
    thing the user waits for, the tokens are counted either way, and on free
    models the currency that binds is requests per day rather than tokens at
    all. It is a reason for the run report to say which of the two it bought,
    which it now can, and a reason not to claim a saving the arrangement
    structurally cannot make on a single run.

### Found by running the thing

32. **A figure recorded everywhere and displayed nowhere is not evidence.**
    `cachedTokens` was read from the provider, carried on every call log entry,
    summed into the totals, stored in the database, and shown on exactly one
    screen - the history list - while The bill, the panel whose whole job is
    reporting what a run cost, never mentioned it. The README claimed it was
    there. S19 was satisfied in the data and unsatisfied everywhere anyone
    would look.
33. **The case lost its own name at the moment it was loaded.** Clicking the
    T-001 chip rebuilt the charge sheet from four of its five fields and
    dropped `label`, so every stored deliberation read "Untitled charge sheet"
    and the record could not say which case it had heard. The dossier's case
    identifier is the one field that makes a stored run findable by anything
    other than its timestamp.
34. **The documented token figure was wrong by half.** The specification and
    `CLAUDE.md` both said a deliberation is "roughly 16,000-17,000 tokens". A
    measured run is **24,496** - 20,076 read, 4,420 written. Part of the gap is
    the shared preamble this version adds to all seven prompts; the rest is
    that the number had never been measured on this model. A cost document
    carrying a figure nobody has checked is worse than one carrying none,
    because the budget cap is reasoned against it.
