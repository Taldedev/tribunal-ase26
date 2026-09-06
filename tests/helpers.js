// Shared fixtures and fakes for the Tribunal test suite.
//
// Written from docs/spec.md, docs/interfaces.md, docs/problem.md and
// docs/coordination.md only. No implementation source was read.
//
// One deliberate exception, disclosed: the *shape* of a well-formed judge
// answer used as test INPUT is taken from `buildVerdictForm`, which is an
// exported function listed in docs/interfaces.md. The spec quotes only a
// fragment of that form ("VERDICT: JUSTIFIED or NOT JUSTIFIED", pitfall 1)
// and coordination.md names its parts ("Verdict, >=2 reasons, decisive point,
// reasoning"). Every ASSERTION below comes from the specification; only the
// scaffolding of the fabricated model answers comes from the declared form.

import {
    SPEAKERS,
    JUDGES,
    speakerSystemPrompt,
    judgeSystemPrompt,
} from "../src/tribunal/personas.js";

// ---------------------------------------------------------------- charge sheets

// Facts, not conclusions (spec §5 pitfall 13).
export const JUSTIFICATION_CASE = Object.freeze({
    label: "Test · the mooring line",
    verdictSet: "JUSTIFICATION",
    defendant: "Elior Navon",
    act: "Cut the mooring line of a neighbour's moored boat during a rising flood, setting the boat adrift downriver, where it was later recovered damaged.",
    question: "Was cutting the mooring line justified?",
});

export const GUILT_CASE = Object.freeze({
    label: "Test · the ledger",
    verdictSet: "GUILT",
    defendant: "Rina Kessler",
    act: "Altered three entries in a shared ledger after the audit window closed, and told no one.",
    question: "Is she guilty of falsifying the ledger?",
});

// verdictSet absent: docs/interfaces.md says absent means DEFAULT_VERDICT_SET.
export const UNSET_CASE = Object.freeze({
    label: "Test · no verdict set named",
    defendant: "Ari Peled",
    act: "Withheld a spare key from a locksmith who asked for it.",
    question: "Was withholding the key justified?",
});

// ---------------------------------------------------------------- answers

const DEFAULT_REASONS = [
    "The record does not establish that any lesser step was tried first.",
    "The harm caused was foreseeable and out of proportion to the danger avoided.",
];

/**
 * A judge answer in the declared form. Options let a test bend one part of it.
 */
export function judgeAnswer({
    verdict = "NOT JUSTIFIED",
    confidence = 70,
    reasons = DEFAULT_REASONS,
    decisive = "Jon Snow",
    reasoning = "I accepted the account of the rising water and set aside the argument from ownership, because ownership does not answer the question of necessity.",
    before = "",
    after = "",
} = {}) {
    const lines = [];
    if (before) lines.push(before, "");
    if (verdict !== null) lines.push(`VERDICT: ${verdict}`);
    if (confidence !== null) lines.push(`CONFIDENCE: ${confidence}`);
    if (reasons !== null) {
        lines.push("REASONS:");
        for (const reason of reasons) lines.push(`- ${reason}`);
    }
    if (decisive !== null) lines.push(`DECISIVE: ${decisive}`);
    if (reasoning !== null) lines.push(`REASONING: ${reasoning}`);
    if (after) lines.push("", after);
    return lines.join("\n");
}

/**
 * The instruction template a judge may echo back verbatim. spec §5 pitfall 1:
 * "'VERDICT: JUSTIFIED or NOT JUSTIFIED' is a template, not a ruling."
 */
export const ECHOED_TEMPLATE = [
    "Answer in exactly this form and add nothing outside it:",
    "",
    "VERDICT: JUSTIFIED or NOT JUSTIFIED",
    "CONFIDENCE: a whole number from 0 to 100",
    "REASONS:",
    "- first reason",
    "- second reason",
    "- further reasons if you have them",
    "DECISIVE: the name of the speaker who moved you most, or NONE",
    "REASONING: one paragraph saying how you arrived at the verdict.",
].join("\n");

// ---------------------------------------------------------------- models

export function model(id, over = {}) {
    return {
        id,
        name: id,
        contextLength: 128000,
        promptPrice: 1e-6,
        completionPrice: 2e-6,
        ...over,
    };
}

export const FREE_MODEL = model("vendor/free:free", {
    promptPrice: 0,
    completionPrice: 0,
    isFree: true,
});

export const ROUTER_MODEL = model("vendor/router", { isRouter: true });

export const ALL_AGENT_IDS = [...SPEAKERS, ...JUDGES].map((a) => a.id);

/** A distinct model per seat — arrangement B (S15). */
export function perAgentModels(over = {}) {
    const map = {};
    for (const id of ALL_AGENT_IDS) map[id] = model(`m-${id}`, over[id]);
    return map;
}

// ---------------------------------------------------------------- fake call

const DEFAULT_USAGE = { promptTokens: 400, completionTokens: 200, totalTokens: 600 };

/**
 * Builds the injected `call` that docs/interfaces.md provides for tests.
 *
 * `behaviour({ stage, agentId, options, order })` may return:
 *   { text, ok, error, finishReason, usage, delayMs, result }
 *
 * Calls are attributed to a seat by matching the system prompt against the
 * personas module's own output — which also proves the boundary in spec §3
 * ("the orchestrator ... does not build prompts or define personalities").
 */
export function makeFakeCall(behaviour = () => ({}), chargeSheet = JUSTIFICATION_CASE) {
    const bySystem = new Map();
    for (const s of SPEAKERS) {
        bySystem.set(speakerSystemPrompt(s, chargeSheet), { agentId: s.id, stage: "speech" });
    }
    for (const j of JUDGES) {
        bySystem.set(judgeSystemPrompt(j, chargeSheet), { agentId: j.id, stage: "verdict" });
    }

    const records = [];

    const call = async (options) => {
        const known = bySystem.get(options?.system);
        const stage = known
            ? known.stage
            : /VERDICT/.test(String(options?.system ?? ""))
              ? "verdict"
              : "speech";
        const record = {
            order: records.length,
            options,
            stage,
            agentId: known ? known.agentId : null,
            matchedPersona: Boolean(known),
            startedAt: performance.now(),
        };
        records.push(record);

        const plan = behaviour({ stage, agentId: record.agentId, options, order: record.order }) ?? {};
        if (plan.delayMs) await new Promise((r) => setTimeout(r, plan.delayMs));
        record.endedAt = performance.now();
        const measured = Math.max(1, Math.round(record.endedAt - record.startedAt));

        if (plan.result) {
            record.result = plan.result;
            return plan.result;
        }
        if (plan.ok === false) {
            const failure = { ok: false, error: plan.error ?? "upstream refused" };
            record.result = failure;
            return failure;
        }

        const result = {
            ok: true,
            text: plan.text ?? (stage === "verdict" ? judgeAnswer() : defaultSpeech(record.agentId)),
            model: options.model,
            finishReason: plan.finishReason ?? "stop",
            usage: plan.usage ?? DEFAULT_USAGE,
            elapsedMs: plan.elapsedMs ?? measured,
        };
        record.result = result;
        return result;
    };

    call.records = records;
    call.speechCalls = () => records.filter((r) => r.stage === "speech");
    call.verdictCalls = () => records.filter((r) => r.stage === "verdict");
    return call;
}

export function defaultSpeech(agentId) {
    return `Speech from ${agentId ?? "an unattributed seat"}. SENTINEL-${agentId ?? "x"}. The water was rising and the boat was tethered to a fixed cleat.`;
}

// ---------------------------------------------------------------- utilities

/** Every key name reachable from an object, to depth `depth`. */
export function allKeys(value, depth = 4, out = new Set(), seen = new Set()) {
    if (depth < 0 || value === null || typeof value !== "object") return out;
    if (seen.has(value)) return out;
    seen.add(value);
    if (Array.isArray(value)) {
        for (const item of value) allKeys(item, depth - 1, out, seen);
        return out;
    }
    for (const [k, v] of Object.entries(value)) {
        out.add(k);
        allKeys(v, depth - 1, out, seen);
    }
    return out;
}

/**
 * Words that would mean the panel had been merged, averaged or reduced to a
 * headline. spec §1: "no combined answer"; S12: "No majority, mean, or
 * combined figure".
 */
export const AGGREGATE_KEY_PATTERN =
    /^(majority|consensus|average|averaged|avg|mean|aggregate|combined|overall|winner|merged|finalVerdict|finalAnswer|finalRuling|meanConfidence|averageConfidence|aggregateConfidence|score)$/i;

export function countOccurrences(haystack, needle) {
    if (!needle) return 0;
    let count = 0;
    let at = haystack.indexOf(needle);
    while (at !== -1) {
        count += 1;
        at = haystack.indexOf(needle, at + needle.length);
    }
    return count;
}

/**
 * The delimiters a rendered block uses to open and close itself — S13's
 * "closing markers": XML-ish tags, code fences, horizontal rules and
 * bracketed END labels. Section headings inside a block are deliberately not
 * counted: they label a part, they do not close the block.
 */
export function structuralTokens(rendered) {
    const found = new Set();
    const patterns = [
        /<\/?[A-Za-z][\w:.-]*>/g,
        /```+/g,
        /^\s*[-=~]{3,}\s*$/gm,
        /\[\s*\/?\s*(END|BEGIN|START)[^\]\n]{0,40}\]/gi,
    ];
    for (const pattern of patterns) {
        for (const match of rendered.match(pattern) ?? []) {
            const token = match.trim();
            if (token.length >= 3) found.add(token);
        }
    }
    return [...found];
}
