/*
 * runCase.js - the orchestrator. One deliberation, seven calls, two waves.
 *
 * The shape of the run is fixed by what actually depends on what. The four
 * speakers depend on nothing but the charge sheet, so they are called at the
 * same time. Every judge needs all four speeches, so the judges wait for the
 * first wave and then go together. Run in sequence the same work takes
 * roughly three times as long and costs exactly the same, which is why the
 * report records both numbers.
 */

import {
    CONFIG_SINGLE,
    SPEECH_MAX_TOKENS,
    VERDICT_MAX_TOKENS,
    CALLS_PER_RUN,
    MAX_BUDGET_USD
} from "../constants.js";
import { SPEAKERS, JUDGES } from "./personas.js";
import {
    buildSharedSpeakerRecord,
    buildSharedJudgeRecord,
    buildSpeakerMessages,
    buildJudgeMessages,
    parseVerdict,
    tallyVerdicts
} from "./protocol.js";
import { callModel } from "./client.js";
import { computeCallCost, estimateTokens, estimateRunCost } from "../lib/money.js";

/*
 * How many prompt tokens the provider served from its cache.
 *
 * Providers report this in different places and some do not report it at all,
 * so a missing figure is zero rather than unknown: the run either has evidence
 * that caching happened or it has none, and "none" is the honest default. It
 * is never inferred from the prompt, because an inferred saving is a claim
 * about the bill rather than a reading of it.
 */
function cachedTokensOf(usage) {
    if (!usage) {
        return 0;
    }
    const details = usage.promptTokensDetails || {};
    const reported = usage.cachedTokens ?? details.cachedTokens;
    return typeof reported === "number" && reported > 0 ? reported : 0;
}

function newRunId() {
    return "case-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

/*
 * Which model each of the seven agents runs on.
 *
 * Arrangement A points every seat at one model, so the only thing separating
 * the seven voices is the system prompt. Arrangement B gives each seat its own
 * entry, and the familiar "one model for the speakers, another for the judges"
 * split is simply that map with two distinct values rather than seven.
 */
export function resolveAgentModels(config, singleModel, perAgent) {
    const map = {};
    const assign = function (agent) {
        if (config === CONFIG_SINGLE) {
            map[agent.id] = singleModel;
            return;
        }
        map[agent.id] = (perAgent && perAgent[agent.id]) || singleModel;
    };
    SPEAKERS.forEach(assign);
    JUDGES.forEach(assign);
    return map;
}

// How many distinct models a run will actually touch. Reported, because it is
// the number that says what the arrangement really did.
export function distinctModelCount(agentModels) {
    const ids = Object.keys(agentModels).map(function (key) {
        return agentModels[key] ? agentModels[key].id : null;
    });
    return new Set(ids.filter(Boolean)).size;
}

/*
 * Works out what the run would cost at worst, before anything is spent.
 * Exported so the screen can show the figure next to the budget cap while the
 * user is still choosing models.
 */
export function planRun(chargeSheet, config, singleModel, perAgent) {
    const agentModels = resolveAgentModels(config, singleModel, perAgent);
    const speakerPrompt = buildSharedSpeakerRecord(chargeSheet);
    const speakerPromptTokens = estimateTokens(speakerPrompt) + 400;

    // A judge reads the sheet plus four speeches, each of which can run to the
    // speech allowance, so its prompt is much the larger of the two.
    const judgePromptTokens = speakerPromptTokens + SPEECH_MAX_TOKENS * 4 + 400;

    const plan = [];
    SPEAKERS.forEach(function (speaker) {
        plan.push({
            model: agentModels[speaker.id],
            promptTokens: speakerPromptTokens,
            maxTokens: SPEECH_MAX_TOKENS
        });
    });
    JUDGES.forEach(function (judge) {
        plan.push({
            model: agentModels[judge.id],
            promptTokens: judgePromptTokens,
            maxTokens: VERDICT_MAX_TOKENS
        });
    });

    return {
        calls: CALLS_PER_RUN,
        worstCaseUsd: estimateRunCost(plan),
        speakerPromptTokens: speakerPromptTokens,
        judgePromptTokens: judgePromptTokens,
        agentModels: agentModels,
        distinctModels: distinctModelCount(agentModels)
    };
}

/*
 * Runs one complete deliberation.
 *
 * onProgress is called as each stage begins and ends, so the screen can show
 * the panel working instead of a spinner over a blank page. The function
 * never throws for an ordinary failure: a speaker or judge that fails comes
 * back marked as failed, and the run reports itself incomplete.
 *
 * options.call replaces the model call. It defaults to the real one and exists
 * so a test can drive a whole deliberation without a network, which is the
 * only way the wave structure and the budget refusal can be checked at all.
 */
export async function runCase(options) {
    const chargeSheet = options.chargeSheet;
    const config = options.config;
    const budgetUsd = options.budgetUsd;
    const onProgress = options.onProgress || function () {};
    const call = options.call || callModel;

    /*
     * A sheet with no question asks nothing, and a court that sits on it
     * spends seven calls to answer a question nobody put. On free models that
     * is seven of about fifty requests for the day, gone. Checked before the
     * budget, because this run is worth nothing at any price.
     */
    if (!chargeSheet || String(chargeSheet.question || "").trim() === "") {
        return {
            ok: false,
            refused: true,
            error:
                "This run was refused before any call was made. The charge " +
                "sheet carries no question, so there is nothing for the panel " +
                "to answer. State the exact question before the court."
        };
    }

    /*
     * The cap is bounded here rather than only on the control that sets it.
     * The screen is a convenience; a limit that only exists in the browser is
     * not a limit, because the browser is not where the rule has to hold.
     */
    const cap = Math.min(Number(budgetUsd) || 0, MAX_BUDGET_USD);

    const agentModels = resolveAgentModels(config, options.singleModel, options.perAgentModels);
    const plan = planRun(chargeSheet, config, options.singleModel, options.perAgentModels);

    // The cap binds before the first call, not after the last one.
    if (plan.worstCaseUsd > cap) {
        return {
            ok: false,
            refused: true,
            error:
                "This run was refused before any call was made. At worst it would cost " +
                plan.worstCaseUsd.toFixed(4) +
                " dollars, and the cap for one run is " +
                cap.toFixed(2) +
                ". Choose cheaper models or raise the cap."
        };
    }

    const runId = newRunId();
    const startedAt = Date.now();
    const calls = [];

    function recordCall(entry) {
        calls.push(entry);
        onProgress({ type: "call", call: entry, calls: calls.slice() });
    }

    // ---- Wave one: the four speeches, all at the same time ----------------
    onProgress({ type: "stage", stage: "speeches", status: "started" });

    const waveOneStarted = Date.now();

    const speeches = await Promise.all(
        SPEAKERS.map(async function (speaker) {
            const callStarted = Date.now();
            const result = await call({
                model: agentModels[speaker.id].id,
                segments: buildSpeakerMessages(chargeSheet, speaker),
                maxTokens: SPEECH_MAX_TOKENS,
                temperature: 0.8
            });

            const speakerModel = agentModels[speaker.id];
            const cost = result.ok ? computeCallCost(result.usage, speakerModel) : 0;

            recordCall({
                id: speaker.id,
                stage: "speech",
                agent: speaker.name,
                agentTitle: speaker.title,
                role: speaker.role,
                modelId: speakerModel.id,
                modelName: speakerModel.name,
                ok: result.ok,
                truncated: result.ok && result.finishReason === "length",
                error: result.ok ? null : result.error,
                promptTokens: result.ok ? result.usage.promptTokens : 0,
                completionTokens: result.ok ? result.usage.completionTokens : 0,
                totalTokens: result.ok ? result.usage.totalTokens : 0,
                cachedTokens: result.ok ? cachedTokensOf(result.usage) : 0,
                costUsd: cost,
                elapsedMs: result.ok ? result.elapsedMs : 0,
                roundTripMs: Date.now() - callStarted,
                verdict: null
            });

            /*
             * A speech that filled its allowance stopped mid-sentence. It is
             * still most of an argument, so it is kept rather than discarded -
             * throwing it away would silence one side entirely - but it is
             * marked, and the judges are told, so an abrupt ending is not read
             * as the advocate's conclusion.
             */
            return {
                speakerId: speaker.id,
                speakerName: speaker.name,
                speakerTitle: speaker.title,
                role: speaker.role,
                side: speaker.side,
                ok: result.ok,
                truncated: result.ok && result.finishReason === "length",
                text: result.ok ? result.text.trim() : "",
                error: result.ok ? null : result.error,
                modelId: speakerModel.id,
                elapsedMs: result.ok ? result.elapsedMs : 0
            };
        })
    );

    const waveOneMs = Date.now() - waveOneStarted;
    onProgress({ type: "stage", stage: "speeches", status: "finished", speeches: speeches });

    const spentSoFar = calls.reduce(function (sum, call) {
        return sum + call.costUsd;
    }, 0);

    // If every speech failed there is nothing for a judge to weigh, and
    // calling three judges on an empty record would only spend more.
    const delivered = speeches.filter(function (speech) {
        return speech.ok;
    });
    if (delivered.length === 0) {
        return {
            ok: false,
            runId: runId,
            error:
                "No speech was delivered, so the judges were not called. " +
                "The first failure was: " +
                speeches[0].error,
            chargeSheet: chargeSheet,
            config: config,
            agentModels: agentModels,
            distinctModels: distinctModelCount(agentModels),
            speeches: speeches,
            rulings: [],
            calls: calls,
            totals: summarise(calls, Date.now() - startedAt, waveOneMs, 0),
            createdAt: new Date().toISOString()
        };
    }

    // ---- Wave two: the three rulings, all at the same time ----------------
    onProgress({ type: "stage", stage: "verdicts", status: "started" });

    const waveTwoStarted = Date.now();

    const rulings = await Promise.all(
        JUDGES.map(async function (judge) {
            const callStarted = Date.now();
            const result = await call({
                model: agentModels[judge.id].id,
                segments: buildJudgeMessages(chargeSheet, speeches, judge),
                maxTokens: VERDICT_MAX_TOKENS,
                temperature: 0.4
            });

            const judgeModel = agentModels[judge.id];
            const cost = result.ok ? computeCallCost(result.usage, judgeModel) : 0;

            if (!result.ok) {
                recordCall({
                    id: judge.id,
                    stage: "verdict",
                    agent: judge.name,
                    agentTitle: judge.title,
                    role: "Judge",
                    modelId: judgeModel.id,
                    modelName: judgeModel.name,
                    ok: false,
                    error: result.error,
                    promptTokens: 0,
                    completionTokens: 0,
                    cachedTokens: 0,
                    totalTokens: 0,
                    costUsd: 0,
                    elapsedMs: 0,
                    roundTripMs: Date.now() - callStarted,
                    verdict: null
                });

                return {
                    judgeId: judge.id,
                    judgeName: judge.name,
                    judgeTitle: judge.title,
                    ok: false,
                    failure: "call",
                    problem: result.error,
                    modelId: judgeModel.id,
                    elapsedMs: 0
                };
            }

            /*
             * An answer cut off at the token limit is not a short ruling, it
             * is an unfinished one. Reasoning models spend the allowance
             * thinking aloud and stop before they reach the form, and what is
             * left behind reads like an answer without being one.
             */
            const truncated = result.finishReason === "length";
            const parsed = truncated
                ? {
                      ok: false,
                      problem:
                          "The answer was cut off at the token limit before the judge " +
                          "finished. This model reasons at length before it writes its " +
                          "ruling; give it a larger allowance or choose another.",
                      raw: result.text
                  }
                : parseVerdict(result.text, chargeSheet);

            recordCall({
                id: judge.id,
                stage: "verdict",
                agent: judge.name,
                agentTitle: judge.title,
                role: "Judge",
                modelId: judgeModel.id,
                modelName: judgeModel.name,
                ok: parsed.ok,
                error: parsed.ok ? null : parsed.problem,
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                totalTokens: result.usage.totalTokens,
                cachedTokens: cachedTokensOf(result.usage),
                costUsd: cost,
                elapsedMs: result.elapsedMs,
                roundTripMs: Date.now() - callStarted,
                verdict: parsed.ok ? parsed.verdict : null
            });

            if (!parsed.ok) {
                return {
                    judgeId: judge.id,
                    judgeName: judge.name,
                    judgeTitle: judge.title,
                    ok: false,
                    failure: "form",
                    problem: parsed.problem,
                    raw: parsed.raw,
                    modelId: judgeModel.id,
                    elapsedMs: result.elapsedMs
                };
            }

            return {
                judgeId: judge.id,
                judgeName: judge.name,
                judgeTitle: judge.title,
                ok: true,
                verdict: parsed.verdict,
                confidence: parsed.confidence,
                reasons: parsed.reasons,
                decisive: parsed.decisive,
                reasoning: parsed.reasoning,
                raw: parsed.raw,
                modelId: judgeModel.id,
                elapsedMs: result.elapsedMs
            };
        })
    );

    const waveTwoMs = Date.now() - waveTwoStarted;
    onProgress({ type: "stage", stage: "verdicts", status: "finished", rulings: rulings });

    const totals = summarise(calls, Date.now() - startedAt, waveOneMs, waveTwoMs);

    return {
        ok: true,
        runId: runId,
        createdAt: new Date().toISOString(),
        chargeSheet: chargeSheet,
        config: config,
        agentModels: agentModels,
        distinctModels: distinctModelCount(agentModels),
        speeches: speeches,
        rulings: rulings,
        calls: calls,
        totals: totals,
        tally: tallyVerdicts(rulings, chargeSheet),
        budgetUsd: cap,
        spentBeforeJudges: spentSoFar
    };
}

// Adds up the call log into the figures the cost report shows.
function summarise(calls, wallMs, waveOneMs, waveTwoMs) {
    const totals = calls.reduce(
        function (sum, call) {
            return {
                promptTokens: sum.promptTokens + call.promptTokens,
                completionTokens: sum.completionTokens + call.completionTokens,
                totalTokens: sum.totalTokens + call.totalTokens,
                cachedTokens: sum.cachedTokens + (call.cachedTokens || 0),
                costUsd: sum.costUsd + call.costUsd,
                /*
                 * Two different clocks, and confusing them makes parallelism
                 * look like a loss.
                 *
                 * sequentialMs sums the full round trip of each call as the
                 * browser saw it, so it is the honest answer to "what if these
                 * had been run one after another".
                 *
                 * modelMs sums only the time the model itself spent, measured
                 * inside the server. The gap between the two is the platform:
                 * cold starts and queueing, which a sequential run would also
                 * have paid, once per call.
                 */
                sequentialMs: sum.sequentialMs + (call.roundTripMs || 0),
                modelMs: sum.modelMs + call.elapsedMs
            };
        },
        {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            cachedTokens: 0,
            costUsd: 0,
            sequentialMs: 0,
            modelMs: 0
        }
    );

    totals.callCount = calls.length;
    totals.failedCalls = calls.filter(function (call) {
        return !call.ok;
    }).length;
    totals.wallMs = wallMs;
    totals.waveOneMs = waveOneMs;
    totals.waveTwoMs = waveTwoMs;
    return totals;
}
