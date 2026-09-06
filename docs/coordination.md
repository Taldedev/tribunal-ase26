# Coordination design

Module 15's artefact: the arrangement written down, so it can be reviewed while
correction is still free. Seven agents is more than "a few lines" and far less
than a dozen, so this is proportionate — one page.

---

## The patterns, and where each applies

| Pattern | Where |
|---|---|
| **Parallelization** | Within each wave. The four speeches depend only on the charge sheet, so they are dispatched together. The three rulings depend only on wave one's output, so they are also dispatched together. |
| **Chaining** | Between the waves. Speakers → judges, one ordered handoff, once. |
| **N-version** | The three judges. The same complete record to three agents that never see each other's work. Their differences are the product. |

**Not used:** orchestrator-workers (the division is known in advance and fixed
at seven, so delegating the division would buy nothing) and evaluator-optimizer
(nothing here is revised toward a target — a judge rules once and that ruling
stands, including a ruling we dislike).

## The agents

| Agent | Role | Input | Output | Boundary |
|---|---|---|---|---|
| Daenerys Targaryen | Representative, prosecution seat | Charge sheet | ≤5 paragraphs | Never sees another speech or any ruling |
| Grey Worm | Representative, prosecution seat | Charge sheet | ≤5 paragraphs | as above |
| Jon Snow | Representative, defence seat | Charge sheet | ≤5 paragraphs | as above |
| Tyrion Lannister | Representative, defence seat | Charge sheet | ≤5 paragraphs | as above |
| Aharon Barak | Judge | Charge sheet + all four speeches | Verdict, ≥2 reasons, decisive point, reasoning | Never sees another ruling |
| Menachem Elon | Judge | as above | as above | as above |
| Meir Shamgar | Judge | as above | as above | as above |

Every agent differs from every other by **system prompt** in both arrangements,
and additionally by **model** in arrangement B.

**The seat does not fix the position.** A representative called from a
prosecution seat argues where the record takes them, including to a conclusion
that does not help the side that called them. This follows the dossier's
simulation rule and is the single most consequential line in the prompts.

## How work passes

In code, not in prose instructions. `runCase.js` awaits `Promise.all` over wave
one, then builds one shared judge record from the structured speech objects and
awaits `Promise.all` over wave two. No agent hands anything to another agent;
the orchestrator holds every result and decides what the next wave sees.

**One record, three judges, and that is now visible in the interface rather
than only in the code.** Each judge receives the same `shared` segment and its
own `persona`, so "all three judges saw the identical record" is a property a
test can assert instead of a claim about how the orchestrator happens to be
written.

The handoff carries structure — speaker name, role, text, and a truncation
flag — assembled into the shared record by `buildSharedJudgeRecord`, and stored
in the record's `model_calls` rows the same way. It is never flattened to prose
that the next agent would have to parse back apart.

**The rule that shapes all of this: never show an agent another agent's
conclusion.** Judges see speeches, which are arguments. Judges never see
verdicts. Two views asked for and one view received twice is the failure this
guards against.

## When an agent fails

| Failure | Response |
|---|---|
| A call is rate-limited or dropped (429/502/503/504) | Retried, three attempts total, then declared failed |
| A call times out (35s client, 24s upstream) | Declared failed, with a message saying so |
| A speaker fails | The seat is empty. The run continues; the judges are told that seat is empty rather than being given silence to interpret |
| **All four speakers fail** | The judges are **not** called. There is nothing to weigh and calling them would only spend more |
| A judge's answer is not in the required form | Shown as a failure, with the raw text available. Never coerced into a verdict |
| A judge's answer is cut off at the token limit | Same — an unfinished ruling, not a short one |
| The worst-case cost exceeds the cap | The run is refused **before the first call**, not stopped partway |

No failure is retried by escalating to a stronger model, and no failure falls
back to a default answer. An empty seat is reported as an empty seat.

## What it costs, and what it buys

**Costs.** Seven calls, roughly 24,500 tokens per deliberation, measured on a real run. The
judges dominate: each reads the charge sheet plus all four speeches, so judge
prompts run several times the size of speaker prompts. Cost grows faster than
the agent count for exactly that reason.

**Parallelism saves time and saves no tokens at all.** The prompt structure is
what saves tokens, and it saves them in the same place the cost is: the three
judges read the identical record, so that record is sent as a shared prefix a
provider can charge for once rather than three times. The four representatives
share a smaller one.

**And the two pull against each other, which is worth saying plainly.** A
prefix is cached when a request is processed, and the three judges are
dispatched together - none has landed when the others start, so none of them
warms the prefix for its siblings. The saving lands across runs instead: a
second deliberation on the same charge sheet meets a prefix the provider has
already seen. So a first run of a fresh sheet reporting `cachedTokens: 0` is
this arrangement working as designed, and serialising the waves to change that
would trade the 40 seconds a user waits for a token count that on free models
is not even the currency that binds. Pitfall 31 in [`spec.md`](spec.md).

On free models the dollar cost is zero and the real currency is **requests per
day** — seven per run against an allowance of about 50, so roughly seven runs
before the day is spent.

**Buys.** Wall-clock time of about 40s instead of about 97s sequential,
measured on a real run. Independent review as a property of the arrangement
rather than a step someone remembers to do. And, in arrangement B, judges whose
disagreement comes from genuinely different models rather than three samples of
one model's blind spot — which is the entire reason the project compares two
arrangements instead of shipping one.

## What the comparison actually returned

The claim above is the project's thesis and it deserves to be reported against
rather than restated. Three deliberations on case T-001:

| arrangement | judges' models | the bench |
|---|---|---|
| A | one, all three seats | unanimous, NOT JUSTIFIED |
| A, again | one, all three seats | unanimous, NOT JUSTIFIED |
| B | three, two of them different providers | the two that ruled: **both** NOT JUSTIFIED; the third timed out |

**The bench did not divide, on either arrangement.** Two judges on genuinely
different models — MiniMax and NVIDIA — reached the same answer, and read
together their reasons were nearly the same reason: the agreed factual record
is silent on whether any safer course was attempted, and the burden of showing
necessity rests on the one who kills.

Three readings of that, and the honest position is that this project cannot
yet distinguish between them.

1. **The case is not close.** T-001's agreed record contains five facts and the
   fifth — unarmed, not attacking, no council, no attempted detention, no
   public surrender sought — is close to dispositive on the question as the
   dossier words it. A question with a clear answer produces agreement whatever
   is on the bench, and agreement then says nothing about the models.
2. **Two is not three, and three is not a sample.** One judge timed out, so
   arrangement B was never observed at full strength, and one case is one case.
3. **The prediction may simply be weaker than stated.** Different models may
   agree more often on reasoning tasks with a well-specified record than the
   module implies.

What can be said without hedging: **the arrangement worked and the claim did
not reproduce here.** The seats were genuinely distinct, the run reported `3 of
7` rather than calling itself B, no judge saw another's ruling, and the answers
matched anyway. Reporting that is worth more than a project that only ever ran
the arrangement predicted to agree — and it is why the comparison is built as
an experiment rather than as a feature that ships one way.

**What would settle it** is seven distinct models and a harder case, and seven
distinct models need paid ones: three of the nineteen free models answered on
the day this was measured. That is a constraint of the free tier, recorded in
[`merge-readiness.md`](merge-readiness.md), and not a gap in the arrangement.
