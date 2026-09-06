# Module interfaces

The exported surface, so that tests can be written against this project without
reading its implementation. Signatures and data shapes only — what each
function *must do* is in [`spec.md`](spec.md), not here.

All modules are ESM. Import paths are relative to the repository root, e.g.
`../src/tribunal/protocol.js`.

Version 2 · 06.09.2026. Version 1 got two entries wrong — `pickDefaultModels`
was described as returning a `single` key, and the `find*` functions as
returning `undefined`. The suite written against it caught both; the code was
right and the document was guessing. This version reports what the functions
return, and the entries marked **new** describe functions that do not exist
yet.

---

## `src/constants.js`

```
CHAT_ENDPOINT, MODELS_ENDPOINT, ACCOUNT_ENDPOINT   string
CASES_ENDPOINT                                     string    // new
HISTORY_LIMIT                                      number    // new
SPEAKER_COUNT, JUDGE_COUNT, CALLS_PER_RUN          number
CONFIG_SINGLE, CONFIG_SPLIT                        string
CONFIG_LABELS                                      { SINGLE: string, SPLIT: string }
DEFAULT_BUDGET_USD, MAX_BUDGET_USD                 number
SPEECH_MAX_TOKENS, VERDICT_MAX_TOKENS              number
MINIMUM_REASONS                                    number
DEFAULT_VERDICT_SET                                string
VERDICT_SETS                                       { [key]: { positive: string, negative: string } }
FALLBACK_MODELS                                    Model[]

verdictsFor(chargeSheet) -> { positive: string, negative: string }
```

`DATABASE_NAME`, `DATABASE_VERSION` and `CASE_STORE` are **gone**. The record no
longer lives in the browser, so there is no local database to name or version.

## Data shapes

```
ChargeSheet = {
    label?:      string
    verdictSet?: "GUILT" | "JUSTIFICATION"     // absent means DEFAULT_VERDICT_SET
    defendant:   string
    act:         string
    question:    string
}

Model = {
    id:              string      // e.g. "vendor/name:free"
    name:            string
    contextLength:   number
    promptPrice:     number      // dollars per single token
    completionPrice: number      // dollars per single token
    isFree?:         boolean
    isRouter?:       boolean
}

Usage = {
    promptTokens:     number
    completionTokens: number
    totalTokens:      number
    cachedTokens:     number     // new; prompt tokens served from cache, 0 when none
    cacheDiscount?:   number|null // new; dollars the provider says caching saved
    reportedCost?:    number     // dollars, from upstream, when available
}

Segments = {                     // new; one agent's prompt, in three parts
    shared:  string              // identical for every agent in the same wave
    persona: string              // this agent's own instruction
    user:    string              // the instruction to act now
}

CallResult =                     // what a model call resolves to; it never throws
    { ok: true,  text: string, model: string, finishReason: string,
      usage: Usage, elapsedMs: number }
  | { ok: false, error: string }
```

`Segments` is the interface the cost lever lives behind. `shared` is sent
first, as its own system message, so a provider can match it as a prefix across
the calls in a wave; `persona` is sent second; `user` last. Nothing may be
prepended to `shared`.

## `src/tribunal/cases.js`

```
EXAMPLE_CASES   ChargeSheet[]    // the charge sheets that ship with the app
```

## `src/tribunal/personas.js`

```
SPEAKERS   Speaker[]   // Speaker = { id, name, role, side, title, blurb, character }
                       //   role: "Prosecution" | "Defence"    side: "PRO" | "CON"
JUDGES     Judge[]     // Judge   = { id, name, title, blurb, character }

INPUT_IS_DATA                            string    // new export; was internal
buildVerdictForm(verdicts)               -> string
speakerSystemPrompt(speaker, chargeSheet) -> string
judgeSystemPrompt(judge, chargeSheet)     -> string
findSpeaker(id) -> Speaker | null
findJudge(id)   -> Judge   | null
```

`speakerSystemPrompt` and `judgeSystemPrompt` return the **persona** segment
only. Neither contains the charge sheet; both take it because the answer
vocabulary comes from the case.

## `src/tribunal/protocol.js`

```
COURT_PREAMBLE   string      // new; the court's standing rules, identical for all seven
SPEAK_NOW        string      // new; the user segment given to a representative
RULE_NOW         string      // new; the user segment given to a judge

renderChargeSheet(chargeSheet)  -> string

buildSharedSpeakerRecord(chargeSheet)          -> string   // new; replaces buildSpeakerPrompt
buildSharedJudgeRecord(chargeSheet, speeches)  -> string   // new; replaces buildJudgePrompt

    speeches: Array<{
        speakerName: string, role: string, side: string,
        ok: boolean, text: string, truncated?: boolean, error?: string
    }>

buildSpeakerMessages(chargeSheet, speaker)         -> Segments   // new
buildJudgeMessages(chargeSheet, speeches, judge)   -> Segments   // new

parseVerdict(text, chargeSheet) ->
      { ok: true,  verdict: string, confidence: number|null, reasons: string[],
        decisive: string|null, reasoning: string, raw: string }
    | { ok: false, problem: string, raw: string }

tallyVerdicts(rulings, chargeSheet) ->
      { delivered: number, failed: number,
        positiveWord: string, negativeWord: string,
        guilty: number, notGuilty: number,
        unanimous: boolean, split: boolean }

    rulings: Array<{ ok: boolean, verdict?: string }>
```

`buildSpeakerPrompt` and `buildJudgePrompt` are **gone**. Each of them returned
the shared record with the "act now" instruction glued to the end; the two
parts are now separate, because only the first half is shared and only a shared
half can be cached.

## `src/tribunal/runCase.js`

```
resolveAgentModels(config, singleModel, perAgent) -> { [agentId]: Model }
distinctModelCount(agentModels)                   -> number

planRun(chargeSheet, config, singleModel, perAgent) ->
      { calls: number, worstCaseUsd: number,
        speakerPromptTokens: number, judgePromptTokens: number,
        agentModels: { [agentId]: Model }, distinctModels: number }

await runCase({
    chargeSheet, config, budgetUsd,
    singleModel:     Model,
    perAgentModels:  { [agentId]: Model },     // arrangement B
    onProgress:      (event) => void,          // optional
    call:            (options) => Promise<CallResult>   // optional; replaces the
                                               // real model call, for tests
}) ->
      { ok: false, refused: true, error: string }        // budget refusal
    | { ok: boolean, runId, createdAt, chargeSheet, config,
        agentModels, distinctModels,
        speeches: Speech[], rulings: Ruling[], calls: CallLogEntry[],
        totals, tally?, budgetUsd?, spentBeforeJudges? }

    call receives { model: string (a model id), segments: Segments,
                    maxTokens: number, temperature: number }

    Speech = { speakerId, speakerName, speakerTitle, role, side,
               ok, truncated, text, error, modelId, elapsedMs }

    Ruling = { judgeId, judgeName, judgeTitle, ok, modelId, elapsedMs,
               verdict?, confidence?, reasons?, decisive?, reasoning?, raw?,
               failure?: "call" | "form", problem?: string }

    CallLogEntry = { id, stage: "speech"|"verdict", agent, agentTitle, role,
                     modelId, modelName, ok, error, truncated?,
                     promptTokens, completionTokens, totalTokens,
                     cachedTokens, costUsd, elapsedMs, roundTripMs, verdict }

    totals = { promptTokens, completionTokens, totalTokens, cachedTokens,
               costUsd, sequentialMs, modelMs, callCount, failedCalls,
               wallMs, waveOneMs, waveTwoMs }
```

The transport contract changed: `call` now receives `segments` where it used to
receive `system` and `user`. There is no composed `system` string any more,
because composing it is what destroyed the shared prefix.

## `src/lib/casesApi.js` — new, replaces `src/lib/casesDb.js`

```
toCaseRow(run)   -> CaseRow     // pure; the deliberation as one database row
toCallRows(run)  -> CallRow[]   // pure; one row per model call, failures included

    CaseRow = { run_id, created_at, config, charge_sheet, speeches, rulings,
                totals, tally, budget_usd, ok }
    CallRow = { run_id, call_id, stage, agent, agent_title, role,
                model_id, model_name, ok, error, verdict,
                prompt_tokens, completion_tokens, total_tokens, cached_tokens,
                cost_usd, elapsed_ms }

createCasesClient(options?) -> CasesClient
    options: { fetchImpl?: typeof fetch, endpoint?: string }

CasesClient = {                             // no method throws
    await addCase(run)       -> { ok: true, runId: string } | { ok: false, error: string }
    await listCases()        -> { ok: true, cases: CaseSummary[] } | { ok: false, error: string }
    await getCase(runId)     -> { ok: true, case: StoredCase } | { ok: false, error: string }
    await deleteCase(runId)  -> { ok: true } | { ok: false, error: string }
}

    CaseSummary = { runId, createdAt, config, label, question,
                    delivered, failed, verdicts: string[],
                    totalTokens, cachedTokens, costUsd, distinctModels }
    StoredCase  = CaseRow's fields, camel-cased, plus calls: CallLogEntry[]
```

`toCaseRow` and `toCallRows` are pure and are where the record's correctness is
actually testable. `createCasesClient` takes an injected `fetchImpl` for the
same reason `runCase` takes an injected `call`: the network is not the unit
under test.

## `src/lib/money.js`

```
estimateTokens(text)          -> number
computeCallCost(usage, model) -> number     // dollars
estimateRunCost(plan)         -> number     // dollars
    plan: Array<{ model: Model, promptTokens: number, maxTokens: number }>
formatUsd(value)      -> string
formatTokens(value)   -> string
formatDuration(ms)    -> string
```

`computeCallCost` prefers `usage.reportedCost` when the provider sent one. Its
fallback charges every prompt token at full price, including tokens that were
served from cache, so the fallback is a **worst case** and never an estimate of
what was actually charged.

## `src/tribunal/modelChoice.js`

```
pickDefaultModels(models)              -> { speakerModel: Model|null, judgeModel: Model|null }
assignDistinctModels(models, agentIds) -> { [agentId]: Model }
```

## Not unit-testable in this process

`src/tribunal/client.js` performs `fetch`, and everything in `src/components/`
needs a DOM. The four functions in `netlify/functions/` run on the platform.
Criteria that concern the bundle, git history, the installed hook or CI are
repository checks rather than unit tests.
