# Module interfaces

The exported surface, so that tests can be written against this project without
reading its implementation. Signatures and data shapes only — what each
function *must do* is in [`spec.md`](spec.md), not here.

All modules are ESM. Import paths are relative to the repository root, e.g.
`../src/tribunal/protocol.js`.

Two entries here were wrong in the first version of this file — `pickDefaultModels`
was described as returning a `single` key, and the `find*` functions as returning
`undefined`. The suite written against it caught both. The code was right and this
document was guessing; it now reports what the functions actually return.

---

## `src/constants.js`

```
CHAT_ENDPOINT, MODELS_ENDPOINT, ACCOUNT_ENDPOINT   string
DATABASE_NAME, CASE_STORE                          string
DATABASE_VERSION                                   number
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
    reportedCost?:    number     // dollars, from upstream, when available
}

CallResult =                     // what a model call resolves to; it never throws
    { ok: true,  text: string, model: string, finishReason: string,
      usage: Usage, elapsedMs: number }
  | { ok: false, error: string }
```

## `src/tribunal/cases.js`

```
EXAMPLE_CASES   ChargeSheet[]    // the charge sheets that ship with the app
```

## `src/tribunal/personas.js`

```
SPEAKERS   Speaker[]   // Speaker = { id, name, role, side, title, blurb, character }
                       //   role: "Prosecution" | "Defence"    side: "PRO" | "CON"
JUDGES     Judge[]     // Judge   = { id, name, title, blurb, character }

buildVerdictForm(verdicts)              -> string
speakerSystemPrompt(speaker, chargeSheet) -> string
judgeSystemPrompt(judge, chargeSheet)     -> string
findSpeaker(id) -> Speaker | null
findJudge(id)   -> Judge   | null
```

## `src/tribunal/protocol.js`

```
renderChargeSheet(chargeSheet)        -> string
buildSpeakerPrompt(chargeSheet)       -> string
buildJudgePrompt(chargeSheet, speeches) -> string

    speeches: Array<{
        speakerName: string, role: string, side: string,
        ok: boolean, text: string, truncated?: boolean, error?: string
    }>

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

    call receives { model: string (a model id), system: string, user: string,
                    maxTokens: number, temperature: number }

    Speech = { speakerId, speakerName, speakerTitle, role, side,
               ok, truncated, text, error, modelId, elapsedMs }

    Ruling = { judgeId, judgeName, judgeTitle, ok, modelId, elapsedMs,
               verdict?, confidence?, reasons?, decisive?, reasoning?, raw?,
               failure?: "call" | "form", problem?: string }

    CallLogEntry = { id, stage: "speech"|"verdict", agent, agentTitle, role,
                     modelId, modelName, ok, error, truncated?,
                     promptTokens, completionTokens, totalTokens,
                     costUsd, elapsedMs, roundTripMs, verdict }

    totals = { promptTokens, completionTokens, totalTokens, costUsd,
               sequentialMs, modelMs, callCount, failedCalls,
               wallMs, waveOneMs, waveTwoMs }
```

## `src/lib/money.js`

```
estimateTokens(text)        -> number
computeCallCost(usage, model) -> number     // dollars
estimateRunCost(plan)       -> number       // dollars
    plan: Array<{ model: Model, promptTokens: number, maxTokens: number }>
formatUsd(value)      -> string
formatTokens(value)   -> string
formatDuration(ms)    -> string
```

## `src/tribunal/modelChoice.js`

```
pickDefaultModels(models)            -> { speakerModel: Model|null, judgeModel: Model|null }
assignDistinctModels(models, agentIds) -> { [agentId]: Model }
```

## Not unit-testable in this process

`src/tribunal/client.js` performs `fetch`, `src/lib/casesDb.js` needs
IndexedDB, and everything in `src/components/` needs a DOM. Criteria that
concern the bundle or git history are repository checks rather than unit tests.
