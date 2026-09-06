// tests/runCase.test.js — the orchestrator: call count, waves, budget refusal,
// failure handling.
//
// Sources: docs/spec.md §1, S1, S3, S4, S5, S6, S7, S8, S11, S12, S14, S15,
// S17, S18, S19, §3, §5 pitfalls 3, 5, 9, 10, 21; docs/coordination.md ("How
// work passes", "When an agent fails").
//
// Every model call is the injected `call` from docs/interfaces.md. Nothing
// here touches the network.
//
// The transport contract changed with spec version 3: `call` receives
// `{ model, segments: { shared, persona, user }, maxTokens, temperature }`.
// "There is no composed `system` string any more, because composing it is what
// destroyed the shared prefix" (docs/interfaces.md).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { runCase, planRun, resolveAgentModels, distinctModelCount } from "../src/tribunal/runCase.js";
import { SPEAKERS, JUDGES } from "../src/tribunal/personas.js";
import {
    CALLS_PER_RUN,
    CONFIG_SINGLE,
    CONFIG_SPLIT,
    MAX_BUDGET_USD,
    SPEECH_MAX_TOKENS,
    VERDICT_MAX_TOKENS,
} from "../src/constants.js";

import {
    JUSTIFICATION_CASE,
    judgeAnswer,
    makeFakeCall,
    model,
    perAgentModels,
    FREE_MODEL,
    ALL_AGENT_IDS,
    allKeys,
    AGGREGATE_KEY_PATTERN,
    defaultSpeech,
    wholePrompt,
} from "./helpers.js";

const SINGLE_MODEL = model("vendor/single");

async function run({
    behaviour = () => ({}),
    chargeSheet = JUSTIFICATION_CASE,
    config = CONFIG_SINGLE,
    budgetUsd = MAX_BUDGET_USD,
    singleModel = SINGLE_MODEL,
    perAgent = perAgentModels(),
    onProgress,
} = {}) {
    const call = makeFakeCall(behaviour, chargeSheet);
    let result;
    let threw = null;
    try {
        result = await runCase({
            chargeSheet,
            config,
            budgetUsd,
            singleModel,
            perAgentModels: perAgent,
            onProgress,
            call,
        });
    } catch (error) {
        threw = error;
    }
    return { call, result, threw };
}

// ---------------------------------------------------------------------------
// planRun
// ---------------------------------------------------------------------------

describe("runCase · planRun", () => {
    test("S1 · a plan is always seven calls", () => {
        const plan = planRun(JUSTIFICATION_CASE, CONFIG_SINGLE, SINGLE_MODEL, {});
        assert.equal(plan.calls, CALLS_PER_RUN);
        assert.equal(plan.calls, 7);
    });

    test("S15 · a plan seats every agent", () => {
        const plan = planRun(JUSTIFICATION_CASE, CONFIG_SPLIT, SINGLE_MODEL, perAgentModels());
        assert.deepEqual(Object.keys(plan.agentModels).sort(), [...ALL_AGENT_IDS].sort());
        assert.equal(plan.distinctModels, 7);
    });

    test("coordination.md · a judge prompt is larger than a speaker prompt", () => {
        // "each [judge] reads the charge sheet plus all four speeches, so judge
        // prompts run several times the size of speaker prompts."
        const plan = planRun(JUSTIFICATION_CASE, CONFIG_SINGLE, SINGLE_MODEL, {});
        assert.ok(plan.speakerPromptTokens > 0, "speaker prompt estimated at zero tokens");
        assert.ok(
            plan.judgePromptTokens > plan.speakerPromptTokens,
            `judge prompt estimated at ${plan.judgePromptTokens} tokens against a speaker's ${plan.speakerPromptTokens}`,
        );
    });

    test("S7 · the worst case is not an underestimate of four speeches and three rulings", () => {
        const m = model("vendor/paid", { promptPrice: 1e-6, completionPrice: 2e-6 });
        const plan = planRun(JUSTIFICATION_CASE, CONFIG_SINGLE, m, {});
        const floor =
            4 * (plan.speakerPromptTokens * m.promptPrice + SPEECH_MAX_TOKENS * m.completionPrice) +
            3 * (plan.judgePromptTokens * m.promptPrice + VERDICT_MAX_TOKENS * m.completionPrice);
        assert.ok(
            plan.worstCaseUsd >= floor - 1e-12,
            `worstCaseUsd ${plan.worstCaseUsd} is below the floor ${floor}; the cap cannot bind`,
        );
    });

    test("§5 pitfall 9 · a plan on free models costs nothing", () => {
        const plan = planRun(JUSTIFICATION_CASE, CONFIG_SINGLE, FREE_MODEL, {});
        assert.equal(plan.worstCaseUsd, 0);
    });
});

describe("runCase · resolveAgentModels and distinctModelCount", () => {
    test("arrangement A gives every one of the seven seats the same model", () => {
        const models = resolveAgentModels(CONFIG_SINGLE, SINGLE_MODEL, perAgentModels());
        assert.deepEqual(Object.keys(models).sort(), [...ALL_AGENT_IDS].sort());
        for (const id of ALL_AGENT_IDS) {
            assert.equal(models[id].id, SINGLE_MODEL.id, `${id} did not get the single model`);
        }
        assert.equal(distinctModelCount(models), 1);
    });

    test("S15 · arrangement B reads perAgent[agent.id] for all seven seats independently", () => {
        const perAgent = perAgentModels();
        const models = resolveAgentModels(CONFIG_SPLIT, SINGLE_MODEL, perAgent);
        assert.deepEqual(Object.keys(models).sort(), [...ALL_AGENT_IDS].sort());
        for (const id of ALL_AGENT_IDS) {
            assert.equal(models[id].id, perAgent[id].id, `${id} was not given its own model`);
        }
        assert.equal(distinctModelCount(models), 7);
    });

    test("§1 · arrangement B does not collapse the three judges onto one model", () => {
        // "one model for all three judges ... destroys the product while
        // appearing to improve it."
        const perAgent = perAgentModels();
        const models = resolveAgentModels(CONFIG_SPLIT, SINGLE_MODEL, perAgent);
        const judgeModels = JUDGES.map((j) => models[j.id].id);
        assert.equal(new Set(judgeModels).size, 3, `the judges share models: ${judgeModels.join(", ")}`);
    });

    test("no seat is ever left without a model", () => {
        const partial = { [SPEAKERS[0].id]: model("only-one") };
        const models = resolveAgentModels(CONFIG_SPLIT, SINGLE_MODEL, partial);
        for (const id of ALL_AGENT_IDS) {
            assert.ok(models[id], `${id} has no model at all`);
            assert.equal(typeof models[id].id, "string");
        }
    });

    test("distinctModelCount counts models, not seats", () => {
        const a = model("a");
        const b = model("b");
        assert.equal(
            distinctModelCount(Object.fromEntries(ALL_AGENT_IDS.map((id, i) => [id, i < 4 ? a : b]))),
            2,
        );
        assert.equal(distinctModelCount({}), 0);
    });
});

// ---------------------------------------------------------------------------
// S1 — the call count
// ---------------------------------------------------------------------------

describe("runCase · S1 · exactly seven model calls", () => {
    test("S1 · a clean deliberation makes exactly seven calls, four then three", async () => {
        const { call, result } = await run();
        assert.equal(call.records.length, 7, `the injected call was invoked ${call.records.length} times`);
        assert.equal(call.speechCalls().length, 4);
        assert.equal(call.verdictCalls().length, 3);
        assert.equal(result.calls.length, 7, "the call log does not have seven entries");
        assert.equal(result.calls.filter((c) => c.stage === "speech").length, 4);
        assert.equal(result.calls.filter((c) => c.stage === "verdict").length, 3);
        assert.equal(result.totals.callCount, 7);
    });

    test("S1 · a run where every judge answers badly still makes exactly seven calls", async () => {
        const { call, result } = await run({
            behaviour: ({ stage }) => (stage === "verdict" ? { text: "No." } : {}),
        });
        assert.equal(call.records.length, 7);
        assert.equal(result.calls.length, 7);
    });

    test("S1 · §3 · the orchestrator does not retry a failed call itself", async () => {
        // "Exactly one module makes network calls ... Retry policy, timeout,
        // and the shape of a failure are decided once." A retry inside the
        // orchestrator would make a deliberation cost more than seven calls.
        const { call } = await run({
            behaviour: ({ stage }) => (stage === "verdict" ? { ok: false, error: "429 rate limited" } : {}),
        });
        assert.equal(
            call.records.length,
            7,
            `the orchestrator made ${call.records.length} calls; retries belong in client.js`,
        );
    });

    test("S1 · one seat per agent — every seat is called exactly once", async () => {
        const { call } = await run({ config: CONFIG_SPLIT });
        const seats = call.records.map((r) => r.agentId);
        assert.deepEqual([...seats].sort(), [...ALL_AGENT_IDS].sort(), `seats called: ${seats.join(", ")}`);
    });
});

// ---------------------------------------------------------------------------
// S5, S6 — the waves
// ---------------------------------------------------------------------------

describe("runCase · S5 and S6 · the wave structure", () => {
    test("S6 · no judge call begins before all four speaker calls have settled", async () => {
        const { call } = await run({ behaviour: () => ({ delayMs: 40 }) });
        const lastSpeechEnd = Math.max(...call.speechCalls().map((r) => r.endedAt));
        const firstVerdictStart = Math.min(...call.verdictCalls().map((r) => r.startedAt));
        assert.ok(
            firstVerdictStart >= lastSpeechEnd,
            `a judge call began ${(lastSpeechEnd - firstVerdictStart).toFixed(1)}ms before the last speech settled`,
        );
    });

    test("S5 · the four speaker calls overlap in time", async () => {
        const { call } = await run({ behaviour: () => ({ delayMs: 60 }) });
        const speeches = call.speechCalls();
        assert.equal(speeches.length, 4);
        const lastStart = Math.max(...speeches.map((r) => r.startedAt));
        const firstEnd = Math.min(...speeches.map((r) => r.endedAt));
        assert.ok(
            lastStart < firstEnd,
            "the fourth speaker call started only after the first had already finished: they ran in sequence",
        );
    });

    test("S5 · the three judge calls overlap in time", async () => {
        const { call } = await run({ behaviour: () => ({ delayMs: 60 }) });
        const verdicts = call.verdictCalls();
        assert.equal(verdicts.length, 3);
        const lastStart = Math.max(...verdicts.map((r) => r.startedAt));
        const firstEnd = Math.min(...verdicts.map((r) => r.endedAt));
        assert.ok(lastStart < firstEnd, "the judge calls ran in sequence");
    });

    test("S5 · waveOneMs is less than those four calls run end to end", async () => {
        const { call, result } = await run({ behaviour: () => ({ delayMs: 60 }) });
        const sequential = call
            .speechCalls()
            .reduce((sum, r) => sum + (r.endedAt - r.startedAt), 0);
        assert.ok(
            result.totals.waveOneMs < sequential,
            `waveOneMs ${result.totals.waveOneMs} is not less than the ${sequential.toFixed(1)}ms those calls took in total`,
        );
    });

    test("S5 · waveTwoMs is less than those three calls run end to end", async () => {
        const { call, result } = await run({ behaviour: () => ({ delayMs: 60 }) });
        const sequential = call
            .verdictCalls()
            .reduce((sum, r) => sum + (r.endedAt - r.startedAt), 0);
        assert.ok(
            result.totals.waveTwoMs < sequential,
            `waveTwoMs ${result.totals.waveTwoMs} is not less than ${sequential.toFixed(1)}ms`,
        );
    });

    test("S5 · the whole run takes less wall time than the calls took in sum", async () => {
        const { result } = await run({ behaviour: () => ({ delayMs: 60 }) });
        assert.ok(
            result.totals.wallMs < result.totals.sequentialMs,
            `wallMs ${result.totals.wallMs} against sequentialMs ${result.totals.sequentialMs}: parallelism bought nothing`,
        );
    });

    test("S6 · a slow speaker holds wave two back rather than being abandoned", async () => {
        const slowSeat = SPEAKERS[3].id;
        const { call } = await run({
            behaviour: ({ agentId }) => ({ delayMs: agentId === slowSeat ? 120 : 10 }),
        });
        const slow = call.records.find((r) => r.agentId === slowSeat);
        const firstVerdictStart = Math.min(...call.verdictCalls().map((r) => r.startedAt));
        assert.ok(
            firstVerdictStart >= slow.endedAt,
            "wave two started before the slow speaker had settled",
        );
    });
});

// ---------------------------------------------------------------------------
// S4 — what a judge is shown
// ---------------------------------------------------------------------------

describe("runCase · S4 · no judge sees another judge's output", () => {
    test("S4 · no judge prompt contains any judge's answer", async () => {
        const answers = new Map();
        const { call } = await run({
            behaviour: ({ stage, agentId }) => {
                if (stage !== "verdict") return {};
                const text = judgeAnswer({
                    verdict: "NOT JUSTIFIED",
                    reasoning: `RULING-SENTINEL-${agentId} is the reasoning of this judge alone.`,
                });
                answers.set(agentId, text);
                return { text };
            },
        });
        const prompts = call.verdictCalls().map((r) => wholePrompt(r.options.segments));
        for (const judge of JUDGES) {
            for (const prompt of prompts) {
                assert.ok(
                    !prompt.includes(`RULING-SENTINEL-${judge.id}`),
                    `a judge prompt carried ${judge.id}'s ruling`,
                );
            }
        }
    });

    test("S4 · all three judges receive the identical record", async () => {
        // coordination.md, N-version: "The same complete record to three agents
        // that never see each other's work."
        const { call } = await run();
        const records = call.verdictCalls().map((r) => r.options.segments.shared);
        assert.equal(records.length, 3);
        assert.equal(new Set(records).size, 1, "the three judges were given different records");
    });

    test("§1 · the three judges are separated by persona segment, not by record", async () => {
        const { call } = await run();
        const personas = call.verdictCalls().map((r) => r.options.segments.persona);
        assert.equal(new Set(personas).size, 3, "two judges were given the same persona segment");
    });

    test("S4 · the record a judge receives holds all four speeches", async () => {
        const { call } = await run();
        const record = call.verdictCalls()[0].options.segments.shared;
        for (const speaker of SPEAKERS) {
            assert.ok(
                record.includes(`SENTINEL-${speaker.id}`),
                `${speaker.name}'s speech is missing from the judges' record`,
            );
        }
    });

    test("§1 · the speeches are handed on separately, never merged into one", async () => {
        const { result } = await run();
        assert.equal(result.speeches.length, 4);
        const texts = result.speeches.map((s) => s.text);
        assert.equal(new Set(texts).size, 4, "the four speeches were collapsed");
    });

    test("§3 · the orchestrator uses the personas module's prompts rather than building its own", async () => {
        // "The orchestrator owns the wave structure and nothing else. It does
        // not build prompts (protocol.js) or define personalities
        // (personas.js)."
        const { call } = await run();
        const unmatched = call.records.filter((r) => !r.matchedPersona);
        assert.deepEqual(
            unmatched.map((r) => String(r.options.segments?.persona).slice(0, 60)),
            [],
            "a call was sent with a persona segment that personas.js did not produce",
        );
    });
});

// ---------------------------------------------------------------------------
// S15 — a model per seat
// ---------------------------------------------------------------------------

describe("runCase · S15 · arrangement B assigns a model per seat", () => {
    test("S15 · each of the seven calls goes to that seat's own model id", async () => {
        const perAgent = perAgentModels();
        const { call, result } = await run({ config: CONFIG_SPLIT, perAgent });
        for (const record of call.records) {
            assert.equal(
                record.options.model,
                perAgent[record.agentId].id,
                `${record.agentId} was called on ${record.options.model}`,
            );
        }
        assert.equal(result.distinctModels, 7);
    });

    test("S15 · arrangement A sends all seven calls to the one model", async () => {
        const { call, result } = await run({ config: CONFIG_SINGLE });
        for (const record of call.records) {
            assert.equal(record.options.model, SINGLE_MODEL.id);
        }
        assert.equal(result.distinctModels, 1);
    });

    test("§3 · the two arrangements are the same seven calls with a different model map", () => {
        // "There is no second code path."
        return Promise.all([run({ config: CONFIG_SINGLE }), run({ config: CONFIG_SPLIT })]).then(
            ([a, b]) => {
                assert.equal(a.call.records.length, b.call.records.length);
                assert.deepEqual(
                    a.call.records.map((r) => r.stage),
                    b.call.records.map((r) => r.stage),
                );
                assert.deepEqual(
                    a.call.records.map((r) => r.options.segments.shared),
                    b.call.records.map((r) => r.options.segments.shared),
                );
                assert.deepEqual(
                    a.call.records.map((r) => r.options.segments.user),
                    b.call.records.map((r) => r.options.segments.user),
                );
            },
        );
    });

    test("the token allowance follows the stage, not the model", async () => {
        const { call } = await run({ config: CONFIG_SPLIT });
        for (const record of call.speechCalls()) {
            assert.equal(record.options.maxTokens, SPEECH_MAX_TOKENS, "a speech call used the wrong allowance");
        }
        for (const record of call.verdictCalls()) {
            assert.equal(record.options.maxTokens, VERDICT_MAX_TOKENS, "a verdict call used the wrong allowance");
        }
    });

    test("every call is given a numeric temperature", async () => {
        const { call } = await run();
        for (const record of call.records) {
            assert.equal(typeof record.options.temperature, "number", `${record.agentId} got no temperature`);
            assert.ok(Number.isFinite(record.options.temperature));
        }
    });
});

// ---------------------------------------------------------------------------
// S7, S8 — the budget
// ---------------------------------------------------------------------------

describe("runCase · S7 and S8 · the budget", () => {
    test("S7 · a run whose worst case exceeds the cap makes zero calls", async () => {
        const pricey = model("vendor/pricey", { promptPrice: 0.01, completionPrice: 0.02 });
        const { call, result } = await run({ singleModel: pricey, budgetUsd: 0.01 });
        assert.equal(result.refused, true, "the run was not refused");
        assert.equal(result.ok, false);
        assert.equal(typeof result.error, "string");
        assert.ok(result.error.length > 0);
        assert.equal(call.records.length, 0, `${call.records.length} calls were made before refusing`);
    });

    test("S7 · a run inside the cap is not refused", async () => {
        const { call, result } = await run({ budgetUsd: MAX_BUDGET_USD });
        assert.notEqual(result.refused, true);
        assert.equal(call.records.length, 7);
    });

    test("S7 · the refusal happens before the first call, not partway through", async () => {
        const pricey = model("vendor/pricey", { promptPrice: 0.01, completionPrice: 0.02 });
        const { call, result } = await run({ singleModel: pricey, budgetUsd: 0.5 });
        assert.equal(result.refused, true);
        assert.equal(call.speechCalls().length, 0, "speeches were bought before the refusal");
    });

    test("S8 · a budget above MAX_BUDGET_USD is bounded by MAX_BUDGET_USD", async () => {
        // §3: "The browser holds no secret and enforces no rule that matters."
        // A cap enforced only by the budget slider is not enforced.
        const probe = model("probe", { promptPrice: 1e-6, completionPrice: 1e-6 });
        const probePlan = planRun(JUSTIFICATION_CASE, CONFIG_SINGLE, probe, {});
        assert.ok(probePlan.worstCaseUsd > 0, "cannot scale prices: the probe plan costs nothing");
        const scale = (MAX_BUDGET_USD * 2) / probePlan.worstCaseUsd;
        const pricey = model("vendor/over-cap", {
            promptPrice: 1e-6 * scale,
            completionPrice: 1e-6 * scale,
        });
        const plan = planRun(JUSTIFICATION_CASE, CONFIG_SINGLE, pricey, {});
        assert.ok(
            plan.worstCaseUsd > MAX_BUDGET_USD,
            `the scaled plan costs ${plan.worstCaseUsd}, which is not above the cap`,
        );

        const { call, result } = await run({ singleModel: pricey, budgetUsd: MAX_BUDGET_USD * 100 });
        assert.equal(
            result.refused,
            true,
            `a caller-supplied budget of $${MAX_BUDGET_USD * 100} bought a run worth $${plan.worstCaseUsd.toFixed(2)}`,
        );
        assert.equal(call.records.length, 0);
    });

    test("§5 pitfall 9 · free models are never refused on cost", async () => {
        // "Free models are rationed by requests per day, not by dollars. The
        // dollar cap will never fire on free models."
        const { call, result } = await run({ singleModel: FREE_MODEL, budgetUsd: 0 });
        assert.notEqual(result.refused, true, "a zero-dollar run on free models was refused on cost");
        assert.equal(call.records.length, 7);
    });

    test("S7 · the run records the budget it was held to", async () => {
        const { result } = await run({ budgetUsd: 3 });
        assert.equal(result.budgetUsd, 3);
    });
});

// ---------------------------------------------------------------------------
// §5 pitfall 5 — a sheet with no question
// ---------------------------------------------------------------------------

describe("runCase · §5 pitfall 5 · a charge sheet with no question", () => {
    for (const [name, question] of [
        ["missing", undefined],
        ["empty", ""],
        ["blank", "   \n  "],
    ]) {
        test(`§5 pitfall 5 · a ${name} question buys no calls`, async () => {
            // "A charge sheet may lack its question, in which case nothing is
            // being asked and the run should not start."
            const { call } = await run({
                chargeSheet: { ...JUSTIFICATION_CASE, question },
            });
            assert.equal(
                call.records.length,
                0,
                `${call.records.length} model calls were made for a sheet that asks nothing`,
            );
        });
    }

    test("§5 pitfall 5 · a sheet with no question is refused, not thrown", async () => {
        const { result, threw } = await run({
            chargeSheet: { ...JUSTIFICATION_CASE, question: "" },
        });
        assert.equal(threw, null, `runCase threw instead of refusing: ${threw?.message}`);
        assert.equal(result.ok, false);
        assert.equal(typeof result.error, "string");
        assert.ok(result.error.length > 0);
    });
});

// ---------------------------------------------------------------------------
// S3, S14 — failures
// ---------------------------------------------------------------------------

describe("runCase · S3 and S14 · a ruling that is not a ruling", () => {
    test("S3 · a judge answering in prose is a form failure, not a verdict", async () => {
        const prose = "On balance I lean towards saying it was justified, but I would not press the point.";
        const { result } = await run({
            behaviour: ({ stage, agentId }) =>
                stage === "verdict" && agentId === JUDGES[0].id ? { text: prose } : {},
        });
        const ruling = result.rulings.find((r) => r.judgeId === JUDGES[0].id);
        assert.equal(ruling.ok, false, "prose was accepted as a ruling");
        assert.equal(ruling.failure, "form", `failure was "${ruling.failure}"`);
        assert.equal(typeof ruling.problem, "string");
        assert.equal(ruling.raw, prose, "the raw text was not kept for inspection");
    });

    test("S3 · a form failure never carries a verdict", async () => {
        const { result } = await run({
            behaviour: ({ stage }) => (stage === "verdict" ? { text: "no." } : {}),
        });
        for (const ruling of result.rulings) {
            assert.equal(ruling.ok, false);
            assert.ok(
                ruling.verdict === undefined || ruling.verdict === null,
                `a failed ruling still published verdict "${ruling.verdict}"`,
            );
        }
    });

    test("S3 · a dropped call is a call failure, distinct from a form failure", async () => {
        const { result } = await run({
            behaviour: ({ stage, agentId }) =>
                stage === "verdict" && agentId === JUDGES[1].id
                    ? { ok: false, error: "504 gateway timeout" }
                    : {},
        });
        const ruling = result.rulings.find((r) => r.judgeId === JUDGES[1].id);
        assert.equal(ruling.ok, false);
        assert.equal(ruling.failure, "call", `a dropped call was reported as "${ruling.failure}"`);
    });

    test("S14 · an answer cut off at the token limit is a failure even if it looks complete", async () => {
        // "finishReason === 'length' short-circuits parsing."
        const { result } = await run({
            behaviour: ({ stage, agentId }) =>
                stage === "verdict" && agentId === JUDGES[2].id
                    ? { text: judgeAnswer({ verdict: "JUSTIFIED" }), finishReason: "length" }
                    : {},
        });
        const ruling = result.rulings.find((r) => r.judgeId === JUDGES[2].id);
        assert.equal(
            ruling.ok,
            false,
            "a ruling cut off at the token limit was published as a completed verdict",
        );
        assert.ok(ruling.verdict === undefined || ruling.verdict === null);
    });

    test("S14 · a truncated ruling is reported as a form failure", async () => {
        const { result } = await run({
            behaviour: ({ stage }) =>
                stage === "verdict"
                    ? { text: judgeAnswer({ verdict: "JUSTIFIED" }), finishReason: "length" }
                    : {},
        });
        for (const ruling of result.rulings) {
            assert.equal(ruling.failure, "form", `a truncated ruling was reported as "${ruling.failure}"`);
        }
    });

    test("§5 pitfall 3 · a reasoning model that thinks past the limit is a failure, not a blank verdict", async () => {
        // "That is a failure with an answer-shaped residue."
        const residue = "Let me think about this carefully. First I should consider whether the";
        const { result } = await run({
            behaviour: ({ stage }) => (stage === "verdict" ? { text: residue, finishReason: "length" } : {}),
        });
        assert.equal(result.rulings.length, 3);
        for (const ruling of result.rulings) {
            assert.equal(ruling.ok, false);
            assert.ok(ruling.verdict === undefined || ruling.verdict === null);
        }
    });

    test("§5 pitfall 10 · every judge still appears, so an empty seat is visible", async () => {
        // "Most free models do not answer ... Empty seats are normal and must
        // be shown as failures."
        const { result } = await run({
            behaviour: ({ stage }) => (stage === "verdict" ? { ok: false, error: "no response" } : {}),
        });
        assert.equal(result.rulings.length, 3, "a failed judge vanished from the panel");
        assert.deepEqual(
            result.rulings.map((r) => r.judgeId).sort(),
            JUDGES.map((j) => j.id).sort(),
        );
        for (const ruling of result.rulings) {
            assert.equal(ruling.ok, false);
            assert.equal(typeof ruling.judgeName, "string");
        }
    });

    test("a mixed panel keeps the delivered rulings and marks only the failures", async () => {
        const { result } = await run({
            behaviour: ({ stage, agentId }) => {
                if (stage !== "verdict") return {};
                if (agentId === JUDGES[0].id) return { text: judgeAnswer({ verdict: "JUSTIFIED" }) };
                if (agentId === JUDGES[1].id) return { text: judgeAnswer({ verdict: "NOT JUSTIFIED" }) };
                return { ok: false, error: "dropped" };
            },
        });
        const byId = Object.fromEntries(result.rulings.map((r) => [r.judgeId, r]));
        assert.equal(byId[JUDGES[0].id].ok, true, byId[JUDGES[0].id].problem);
        assert.equal(byId[JUDGES[0].id].verdict, "JUSTIFIED");
        assert.equal(byId[JUDGES[1].id].verdict, "NOT JUSTIFIED");
        assert.equal(byId[JUDGES[2].id].ok, false);
        assert.equal(result.tally.delivered, 2);
        assert.equal(result.tally.failed, 1);
        assert.equal(result.tally.split, true);
    });
});

describe("runCase · coordination.md · when a speaker fails", () => {
    test("one failed speaker leaves an empty seat and the run continues", async () => {
        const emptySeat = SPEAKERS[1].id;
        const { call, result } = await run({
            behaviour: ({ agentId }) =>
                agentId === emptySeat ? { ok: false, error: "502 bad gateway" } : {},
        });
        assert.equal(call.records.length, 7, "the judges were not called after one speaker failed");
        const speech = result.speeches.find((s) => s.speakerId === emptySeat);
        assert.equal(speech.ok, false);
        assert.ok(!speech.text, `a failed seat was given text: ${JSON.stringify(speech.text)}`);
        assert.equal(typeof speech.error, "string");
    });

    test("the judges are told which seat is empty rather than being handed silence", async () => {
        const emptySeat = SPEAKERS[1].id;
        const emptyName = SPEAKERS[1].name;
        const { call } = await run({
            behaviour: ({ agentId }) => (agentId === emptySeat ? { ok: false, error: "502" } : {}),
        });
        const record = call.verdictCalls()[0].options.segments.shared;
        assert.ok(record.includes(emptyName), `${emptyName}'s empty seat is not mentioned in the record`);
        assert.ok(
            /(empty|did not|no speech|failed|unavailable|no answer|silent|absent)/i.test(record),
            `the record does not say the seat is empty:\n${record}`,
        );
    });

    test("all four speakers failing means the judges are not called at all", async () => {
        // "There is nothing to weigh and calling them would only spend more."
        const { call, result } = await run({
            behaviour: ({ stage }) => (stage === "speech" ? { ok: false, error: "no response" } : {}),
        });
        assert.equal(
            call.verdictCalls().length,
            0,
            `${call.verdictCalls().length} judge calls were made with nothing to weigh`,
        );
        assert.equal(call.records.length, 4);
        assert.equal(result.ok, false);
        for (const ruling of result.rulings ?? []) {
            assert.notEqual(ruling.ok, true, "a verdict appeared without any speech to weigh");
        }
    });

    test("no failure falls back to a default answer", async () => {
        // "No failure is retried by escalating to a stronger model, and no
        // failure falls back to a default answer."
        const { result } = await run({
            behaviour: () => ({ ok: false, error: "no response" }),
        });
        for (const speech of result.speeches) {
            assert.equal(speech.ok, false);
            assert.ok(!speech.text);
        }
    });

    test("§5 pitfall 3 · a truncated speech is delivered with a truncation flag, not discarded", async () => {
        const seat = SPEAKERS[2].id;
        const { result } = await run({
            behaviour: ({ agentId }) =>
                agentId === seat
                    ? { text: defaultSpeech(seat) + " and then it stopped mid-", finishReason: "length" }
                    : {},
        });
        const speech = result.speeches.find((s) => s.speakerId === seat);
        assert.equal(speech.ok, true, "a truncated speech was thrown away; a partial argument is still an argument");
        assert.equal(speech.truncated, true, "the truncation flag was not set");
    });
});

// ---------------------------------------------------------------------------
// S11 — the call log
// ---------------------------------------------------------------------------

describe("runCase · S11 · the call log", () => {
    test("S11 · every entry records model, tokens, cost and elapsed time", async () => {
        const { result } = await run({
            behaviour: () => ({
                usage: { promptTokens: 1200, completionTokens: 400, totalTokens: 1600 },
                delayMs: 5,
            }),
        });
        assert.equal(result.calls.length, 7);
        for (const entry of result.calls) {
            assert.equal(typeof entry.modelId, "string", "modelId missing");
            assert.ok(entry.modelId.length > 0);
            assert.equal(entry.promptTokens, 1200, `promptTokens was ${entry.promptTokens}`);
            assert.equal(entry.completionTokens, 400);
            assert.equal(entry.totalTokens, 1600);
            assert.equal(typeof entry.costUsd, "number");
            assert.ok(Number.isFinite(entry.costUsd), `costUsd was ${entry.costUsd}`);
            assert.equal(typeof entry.elapsedMs, "number");
            assert.ok(Number.isFinite(entry.elapsedMs));
            assert.ok(["speech", "verdict"].includes(entry.stage), `stage was "${entry.stage}"`);
            assert.equal(typeof entry.agent, "string");
            // S11 counts six fields, and cached tokens is the sixth: "Each
            // call's model, verdict, tokens, cached tokens, cost and elapsed
            // time are recorded."
            assert.equal(typeof entry.cachedTokens, "number", "cachedTokens missing");
            assert.ok(Number.isFinite(entry.cachedTokens), `cachedTokens was ${entry.cachedTokens}`);
        }
    });

    test("S11 · each entry's cost is the model's price applied to its own tokens", async () => {
        const m = model("vendor/priced", { promptPrice: 1e-6, completionPrice: 2e-6 });
        const { result } = await run({
            singleModel: m,
            behaviour: () => ({ usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 } }),
        });
        for (const entry of result.calls) {
            assert.equal(entry.costUsd, 0.002, `entry ${entry.agent} cost ${entry.costUsd}`);
        }
    });

    test("S11 · the totals are the sum of the call log", async () => {
        const { result } = await run({
            behaviour: () => ({ usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 } }),
        });
        const sum = (field) => result.calls.reduce((n, c) => n + (c[field] ?? 0), 0);
        assert.equal(result.totals.promptTokens, sum("promptTokens"));
        assert.equal(result.totals.completionTokens, sum("completionTokens"));
        assert.equal(result.totals.totalTokens, sum("totalTokens"));
        assert.ok(
            Math.abs(result.totals.costUsd - sum("costUsd")) < 1e-9,
            `totals.costUsd ${result.totals.costUsd} against ${sum("costUsd")}`,
        );
        assert.equal(result.totals.callCount, 7);
    });

    test("S11 · a failed call is logged as a failed call, not omitted", async () => {
        const { result } = await run({
            behaviour: ({ agentId }) =>
                agentId === SPEAKERS[0].id ? { ok: false, error: "429 rate limited" } : {},
        });
        assert.equal(result.calls.length, 7, "a failed call vanished from the log");
        const entry = result.calls.find((c) => c.agent === SPEAKERS[0].id || c.agent === SPEAKERS[0].name);
        assert.ok(entry, `no log entry for ${SPEAKERS[0].id}`);
        assert.equal(entry.ok, false);
        assert.equal(typeof entry.error, "string");
        assert.equal(result.totals.failedCalls, 1);
    });

    test("S11 · a failed call costs nothing rather than an invented amount", async () => {
        const { result } = await run({ behaviour: () => ({ ok: false, error: "no response" }) });
        for (const entry of result.calls) {
            assert.equal(entry.costUsd, 0, `a failed call was billed ${entry.costUsd}`);
        }
    });
});

// ---------------------------------------------------------------------------
// S17, S18 — the cacheable shared prefix, seen at the transport
// ---------------------------------------------------------------------------

describe("runCase · S17 and S18 · the shared segment as the calls actually receive it", () => {
    test("S18 · every call receives segments and no composed system string", async () => {
        // docs/interfaces.md: "`call` now receives `segments` where it used to
        // receive `system` and `user`. There is no composed `system` string
        // any more."
        const { call } = await run();
        assert.equal(call.records.length, 7);
        for (const record of call.records) {
            const { segments } = record.options;
            assert.equal(typeof segments, "object", `${record.agentId} was called without segments`);
            assert.notEqual(segments, null);
            assert.deepEqual(
                Object.keys(segments),
                ["shared", "persona", "user"],
                `${record.agentId}: the segments are not shared-first`,
            );
            for (const key of ["shared", "persona", "user"]) {
                assert.equal(typeof segments[key], "string", `${record.agentId}: segments.${key}`);
                assert.ok(segments[key].length > 0, `${record.agentId}: segments.${key} is empty`);
            }
            assert.equal(
                record.options.system,
                undefined,
                `${record.agentId} was still sent a composed system string`,
            );
            assert.equal(record.options.user, undefined, `${record.agentId} was still sent a bare user string`);
        }
    });

    test("S17 · within wave one all four calls receive the same shared segment", async () => {
        const { call } = await run();
        const shared = call.speechCalls().map((r) => r.options.segments.shared);
        assert.equal(shared.length, 4);
        assert.equal(
            new Set(shared).size,
            1,
            "the four speaker calls carried different shared segments; no prefix can be cached",
        );
    });

    test("S17 · within wave two all three calls receive the same shared segment", async () => {
        const { call } = await run();
        const shared = call.verdictCalls().map((r) => r.options.segments.shared);
        assert.equal(shared.length, 3);
        assert.equal(
            new Set(shared).size,
            1,
            "the three judge calls carried different shared segments; no prefix can be cached",
        );
    });

    test("S17 · the wave-two shared record is not the wave-one one", async () => {
        const { call } = await run();
        const waveOne = call.speechCalls()[0].options.segments.shared;
        const waveTwo = call.verdictCalls()[0].options.segments.shared;
        assert.notEqual(waveOne, waveTwo, "the judges were sent wave one's record, without the speeches");
        for (const speaker of SPEAKERS) {
            assert.ok(
                waveTwo.includes(`SENTINEL-${speaker.id}`),
                `wave two's shared record is missing ${speaker.name}'s speech`,
            );
            assert.ok(
                !waveOne.includes(`SENTINEL-${speaker.id}`),
                "wave one's shared record already contains a speech that had not been made",
            );
        }
    });

    test("S17 · the shared segment survives one seat failing", async () => {
        // A failure in wave one changes the record for all three judges
        // together, or for none of them.
        const { call } = await run({
            behaviour: ({ agentId }) =>
                agentId === SPEAKERS[1].id ? { ok: false, error: "502 bad gateway" } : {},
        });
        const shared = call.verdictCalls().map((r) => r.options.segments.shared);
        assert.equal(new Set(shared).size, 1, "one empty seat split the judges' shared record");
    });

    test("S18 · no call has agent-specific text prepended to its shared segment", async () => {
        // §5 pitfall 21: "anything that prepends per-agent text to it silently
        // undoes it."
        const { call } = await run({ config: CONFIG_SPLIT });
        for (const record of call.records) {
            const { shared, persona } = record.options.segments;
            const agent = [...SPEAKERS, ...JUDGES].find((a) => a.id === record.agentId);
            assert.ok(agent, `a call was made for an unknown seat: ${record.agentId}`);
            assert.ok(
                !shared.includes(agent.character),
                `${agent.name}'s character is inside the shared segment`,
            );
            assert.ok(
                !shared.includes(agent.name),
                `${agent.name} is named inside the shared segment of their own call`,
            );
            assert.ok(!shared.includes(persona), `${agent.name}'s persona segment is inside the shared one`);
        }
    });

    test("S18 · the persona segment is the agent-specific half, and it differs for all seven", async () => {
        const { call } = await run({ config: CONFIG_SPLIT });
        const personas = call.records.map((r) => r.options.segments.persona);
        assert.equal(
            new Set(personas).size,
            7,
            "two seats were sent the same persona segment; the arrangement then buys nothing",
        );
    });

    test("S18 · the user segment is the same act-now instruction for every agent in a wave", async () => {
        const { call } = await run();
        const speechUsers = call.speechCalls().map((r) => r.options.segments.user);
        const verdictUsers = call.verdictCalls().map((r) => r.options.segments.user);
        assert.equal(new Set(speechUsers).size, 1, "the representatives were told to act in different words");
        assert.equal(new Set(verdictUsers).size, 1, "the judges were told to rule in different words");
        assert.notEqual(
            speechUsers[0],
            verdictUsers[0],
            "a representative and a judge were given the same instruction to act",
        );
    });
});

// ---------------------------------------------------------------------------
// S19 — every call records how many prompt tokens were served from cache
// ---------------------------------------------------------------------------

describe("runCase · S19 · cached tokens are recorded on every call", () => {
    test("S19 · every entry carries cachedTokens as a number", async () => {
        const { result } = await run({
            behaviour: () => ({
                usage: { promptTokens: 1200, completionTokens: 400, totalTokens: 1600, cachedTokens: 900 },
            }),
        });
        assert.equal(result.calls.length, 7);
        for (const entry of result.calls) {
            assert.equal(typeof entry.cachedTokens, "number", `${entry.agent}: cachedTokens is not a number`);
            assert.equal(entry.cachedTokens, 900, `${entry.agent}: cachedTokens was ${entry.cachedTokens}`);
        }
    });

    test("S19 · cachedTokens is zero when none, never undefined and never NaN", async () => {
        // "`cachedTokens` is a number on every log entry, zero when none."
        // A provider that reports nothing is the normal case on the first run
        // of a sheet, and it must read as zero rather than as absent.
        const { result } = await run({
            behaviour: () => ({ usage: { promptTokens: 500, completionTokens: 100, totalTokens: 600 } }),
        });
        for (const entry of result.calls) {
            assert.equal(
                entry.cachedTokens,
                0,
                `${entry.agent}: a provider that reported no cache produced cachedTokens ${entry.cachedTokens}`,
            );
        }
    });

    test("S19 · a failed call still carries cachedTokens as a number", async () => {
        const { result } = await run({ behaviour: () => ({ ok: false, error: "no response" }) });
        assert.equal(result.calls.length, 4, "wave two was called with nothing to weigh");
        for (const entry of result.calls) {
            assert.equal(typeof entry.cachedTokens, "number", `${entry.agent}: cachedTokens is not a number`);
            assert.equal(entry.cachedTokens, 0, `a failed call reported ${entry.cachedTokens} cached tokens`);
        }
    });

    test("S19 · totals.cachedTokens is the sum of the call log", async () => {
        const { result } = await run({
            behaviour: ({ order }) => ({
                usage: {
                    promptTokens: 1000,
                    completionTokens: 200,
                    totalTokens: 1200,
                    cachedTokens: order * 100,
                },
            }),
        });
        const sum = result.calls.reduce((n, c) => n + (c.cachedTokens ?? 0), 0);
        assert.equal(typeof result.totals.cachedTokens, "number", "totals.cachedTokens is not a number");
        assert.equal(
            result.totals.cachedTokens,
            sum,
            `totals.cachedTokens ${result.totals.cachedTokens} against ${sum} in the log`,
        );
        assert.ok(sum > 0, "the fixture reported no cached tokens at all, so the sum proves nothing");
    });

    test("S19 · cached prompt tokens are never counted as extra prompt tokens", async () => {
        // A cached token is a prompt token that was served from cache, not an
        // eighth token category. Reporting more cached than prompt tokens
        // would mean the two are being added rather than nested.
        const { result } = await run({
            behaviour: () => ({
                usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200, cachedTokens: 800 },
            }),
        });
        for (const entry of result.calls) {
            assert.ok(
                entry.cachedTokens <= entry.promptTokens,
                `${entry.agent}: ${entry.cachedTokens} cached against ${entry.promptTokens} prompt tokens`,
            );
        }
        assert.ok(result.totals.cachedTokens <= result.totals.promptTokens);
    });

    test("§5 pitfall 23 · the fallback price is a worst case, so cached tokens do not reduce the estimate", async () => {
        // "Cached tokens make the fallback price list wrong in the safe
        // direction ... the estimate is a worst case and must be labelled as
        // one." Two runs, identical but for the cache, must not be billed
        // differently by the fallback arithmetic.
        const priced = model("vendor/priced", { promptPrice: 1e-6, completionPrice: 2e-6 });
        const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
        const cold = await run({ singleModel: priced, behaviour: () => ({ usage: { ...usage, cachedTokens: 0 } }) });
        const warm = await run({ singleModel: priced, behaviour: () => ({ usage: { ...usage, cachedTokens: 900 } }) });
        assert.ok(
            warm.result.totals.costUsd >= cold.result.totals.costUsd - 1e-12,
            `a cached run was estimated cheaper (${warm.result.totals.costUsd}) than an uncached one ` +
                `(${cold.result.totals.costUsd}); the fallback must charge every prompt token at full price`,
        );
    });
});

// ---------------------------------------------------------------------------
// §1 and S12 — disagreement is the output
// ---------------------------------------------------------------------------

describe("runCase · §1 and S12 · disagreement is the output", () => {
    test("S12 · three verdicts are returned side by side", async () => {
        const verdicts = ["JUSTIFIED", "NOT JUSTIFIED", "JUSTIFIED"];
        const { result } = await run({
            behaviour: ({ stage, agentId }) => {
                if (stage !== "verdict") return {};
                const i = JUDGES.findIndex((j) => j.id === agentId);
                return { text: judgeAnswer({ verdict: verdicts[i] }) };
            },
        });
        assert.equal(result.rulings.length, 3);
        assert.deepEqual(
            JUDGES.map((j) => result.rulings.find((r) => r.judgeId === j.id).verdict),
            verdicts,
        );
        assert.equal(result.tally.split, true);
        assert.equal(result.tally.unanimous, false);
    });

    test("S12 · the run publishes no majority, mean or combined figure anywhere", async () => {
        const verdicts = ["JUSTIFIED", "NOT JUSTIFIED", "JUSTIFIED"];
        const { result } = await run({
            behaviour: ({ stage, agentId }) => {
                if (stage !== "verdict") return {};
                const i = JUDGES.findIndex((j) => j.id === agentId);
                return { text: judgeAnswer({ verdict: verdicts[i], confidence: 30 + i * 20 }) };
            },
        });
        const offending = [...allKeys(result, 5)].filter((k) => AGGREGATE_KEY_PATTERN.test(k));
        assert.deepEqual(offending, [], `the run exposes an aggregate: ${offending.join(", ")}`);
    });

    test("§1 · confidences are never averaged into one figure", async () => {
        const { result } = await run({
            behaviour: ({ stage, agentId }) => {
                if (stage !== "verdict") return {};
                const i = JUDGES.findIndex((j) => j.id === agentId);
                return { text: judgeAnswer({ confidence: [10, 50, 90][i] }) };
            },
        });
        assert.deepEqual(
            JUDGES.map((j) => result.rulings.find((r) => r.judgeId === j.id).confidence),
            [10, 50, 90],
            "the individual confidences did not survive",
        );
        const confidenceKeys = [...allKeys(result.totals ?? {})].filter((k) => /confidence/i.test(k));
        assert.deepEqual(confidenceKeys, [], `totals carries a confidence figure: ${confidenceKeys.join(", ")}`);
        assert.ok(
            result.tally === undefined || !("confidence" in result.tally),
            "the tally carries an aggregate confidence",
        );
    });

    test("§1 · each judge's reasoning is kept whole and attributed", async () => {
        const { result } = await run({
            behaviour: ({ stage, agentId }) =>
                stage === "verdict"
                    ? { text: judgeAnswer({ reasoning: `REASONING-OF-${agentId} stands alone.` }) }
                    : {},
        });
        for (const judge of JUDGES) {
            const ruling = result.rulings.find((r) => r.judgeId === judge.id);
            assert.equal(ruling.ok, true, ruling.problem);
            assert.ok(
                ruling.reasoning.includes(`REASONING-OF-${judge.id}`),
                `${judge.name}'s reasoning was lost or swapped`,
            );
            assert.equal(ruling.judgeName, judge.name);
            assert.ok(ruling.reasons.length >= 2);
        }
    });

    test("§1 · a unanimous panel is reported as unanimous without becoming one answer", async () => {
        const { result } = await run();
        assert.equal(result.rulings.length, 3);
        assert.equal(result.tally.unanimous, true);
        assert.equal(result.tally.split, false);
        assert.equal(new Set(result.rulings.map((r) => r.judgeId)).size, 3);
    });
});

// ---------------------------------------------------------------------------
// the run envelope
// ---------------------------------------------------------------------------

describe("runCase · the run envelope", () => {
    test("a completed run carries its identity, sheet and arrangement", async () => {
        const { result } = await run({ config: CONFIG_SPLIT });
        assert.equal(typeof result.runId, "string");
        assert.ok(result.runId.length > 0);
        assert.ok(result.createdAt !== undefined && result.createdAt !== null);
        assert.deepEqual(result.chargeSheet, JUSTIFICATION_CASE);
        assert.equal(result.config, CONFIG_SPLIT);
        assert.equal(Object.keys(result.agentModels).length, 7);
    });

    test("two runs do not share a run id", async () => {
        const [a, b] = await Promise.all([run(), run()]);
        assert.notEqual(a.result.runId, b.result.runId);
    });

    test("onProgress is called and never breaks the run", async () => {
        const events = [];
        const { result } = await run({ onProgress: (event) => events.push(event) });
        assert.ok(events.length > 0, "onProgress was never called");
        assert.equal(result.calls.length, 7);
    });

    test("the run works without onProgress at all", async () => {
        const call = makeFakeCall();
        const result = await runCase({
            chargeSheet: JUSTIFICATION_CASE,
            config: CONFIG_SINGLE,
            budgetUsd: MAX_BUDGET_USD,
            singleModel: SINGLE_MODEL,
            perAgentModels: perAgentModels(),
            call,
        });
        assert.equal(result.calls.length, 7);
    });

    test("S9 · nothing in a run result carries an API key", async () => {
        const { result } = await run();
        assert.ok(!/sk-or-|sk-ant-/.test(JSON.stringify(result)));
    });
});
