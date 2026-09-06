// tests/casesApi.test.js — the record: the deliberation as rows, and the one
// module that talks to it.
//
// Sources: docs/spec.md §1 ("the record is infrastructure, not a feature"),
// §3, S11, S19, S20, S21, S22, S23, §5 pitfalls 24 and 25;
// docs/interfaces.md (`src/lib/casesApi.js`, CaseRow, CallRow, CasesClient).
//
// `src/lib/casesApi.js` replaces `src/lib/casesDb.js`. `toCaseRow` and
// `toCallRows` are pure and are tested directly. The client is tested through
// an injected `fetchImpl` "for the same reason `runCase` takes an injected
// `call`: the network is not the unit under test."

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { toCaseRow, toCallRows, createCasesClient } from "../src/lib/casesApi.js";
import { CASES_ENDPOINT, CONFIG_SINGLE, CONFIG_SPLIT, MAX_BUDGET_USD } from "../src/constants.js";
import { runCase } from "../src/tribunal/runCase.js";
import { SPEAKERS, JUDGES } from "../src/tribunal/personas.js";

import {
    JUSTIFICATION_CASE,
    makeFakeCall,
    model,
    perAgentModels,
    allKeys,
    AGGREGATE_KEY_PATTERN,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// a completed deliberation, in the shape docs/interfaces.md declares for
// runCase's result. Built by hand rather than by running the court, so that a
// pure function is tested against the document and not against the
// orchestrator.
// ---------------------------------------------------------------------------

function callLogEntry(over = {}) {
    return {
        id: "call-0",
        stage: "speech",
        agent: "daenerys",
        agentTitle: "Representative, prosecution seat",
        role: "Prosecution",
        modelId: "vendor/one",
        modelName: "Vendor One",
        ok: true,
        error: null,
        promptTokens: 1000,
        completionTokens: 300,
        totalTokens: 1300,
        cachedTokens: 0,
        costUsd: 0.0016,
        elapsedMs: 2100,
        roundTripMs: 2250,
        verdict: null,
        ...over,
    };
}

const SPEECH_SEATS = SPEAKERS.map((s) => s.id);
const JUDGE_SEATS = JUDGES.map((j) => j.id);

const CALLS = [
    ...SPEECH_SEATS.map((agent, i) =>
        callLogEntry({
            id: `call-speech-${i}`,
            stage: "speech",
            agent,
            agentTitle: "Representative",
            role: i < 2 ? "Prosecution" : "Defence",
            modelId: `vendor/m${i}`,
            modelName: `Vendor M${i}`,
            cachedTokens: i * 50,
            // the third seat was dropped upstream: S21 keeps it in the record
            ...(i === 2
                ? {
                      ok: false,
                      error: "429 rate limited",
                      promptTokens: 0,
                      completionTokens: 0,
                      totalTokens: 0,
                      cachedTokens: 0,
                      costUsd: 0,
                  }
                : {}),
        }),
    ),
    ...JUDGE_SEATS.map((agent, i) =>
        callLogEntry({
            id: `call-verdict-${i}`,
            stage: "verdict",
            agent,
            agentTitle: "Judge",
            role: "Judge",
            modelId: `vendor/j${i}`,
            modelName: `Vendor J${i}`,
            promptTokens: 4000,
            completionTokens: 500,
            totalTokens: 4500,
            cachedTokens: 3200,
            costUsd: 0.005,
            elapsedMs: 5200,
            roundTripMs: 5400,
            verdict: i === 2 ? null : ["JUSTIFIED", "NOT JUSTIFIED"][i],
        }),
    ),
];

const COMPLETED_RUN = Object.freeze({
    ok: true,
    runId: "run-fixture-0001",
    createdAt: "2026-09-06T12:00:00.000Z",
    chargeSheet: JUSTIFICATION_CASE,
    config: CONFIG_SPLIT,
    agentModels: Object.fromEntries(
        [...SPEECH_SEATS, ...JUDGE_SEATS].map((id, i) => [id, model(`vendor/m${i}`)]),
    ),
    distinctModels: 7,
    budgetUsd: 2.5,
    speeches: SPEAKERS.map((s, i) => ({
        speakerId: s.id,
        speakerName: s.name,
        speakerTitle: s.title,
        role: s.role,
        side: s.side,
        ok: i !== 2,
        truncated: false,
        text: i === 2 ? "" : `SPEECH-${i}`,
        error: i === 2 ? "429 rate limited" : null,
        modelId: `vendor/m${i}`,
        elapsedMs: 2100,
    })),
    rulings: JUDGES.map((j, i) => ({
        judgeId: j.id,
        judgeName: j.name,
        judgeTitle: j.title,
        ok: i !== 2,
        modelId: `vendor/j${i}`,
        elapsedMs: 5200,
        ...(i === 2
            ? { failure: "form", problem: "no verdict line", raw: "I decline to rule." }
            : {
                  verdict: ["JUSTIFIED", "NOT JUSTIFIED"][i],
                  confidence: [70, 55][i],
                  reasons: ["one", "two"],
                  decisive: "Jon Snow",
                  reasoning: `REASONING-${i}`,
                  raw: `VERDICT: ${["JUSTIFIED", "NOT JUSTIFIED"][i]}`,
              }),
    })),
    calls: CALLS,
    totals: {
        promptTokens: 15000,
        completionTokens: 2400,
        totalTokens: 17400,
        cachedTokens: 9750,
        costUsd: 0.0198,
        sequentialMs: 27000,
        modelMs: 26000,
        callCount: 7,
        failedCalls: 1,
        wallMs: 11000,
        waveOneMs: 3000,
        waveTwoMs: 6000,
    },
    tally: {
        delivered: 2,
        failed: 1,
        positiveWord: "JUSTIFIED",
        negativeWord: "NOT JUSTIFIED",
        guilty: 1,
        notGuilty: 1,
        unanimous: false,
        split: true,
    },
});

const CASE_ROW_FIELDS = [
    "run_id",
    "created_at",
    "config",
    "charge_sheet",
    "speeches",
    "rulings",
    "totals",
    "tally",
    "budget_usd",
    "ok",
];

const CALL_ROW_FIELDS = [
    "run_id",
    "call_id",
    "stage",
    "agent",
    "agent_title",
    "role",
    "model_id",
    "model_name",
    "ok",
    "error",
    "verdict",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "cached_tokens",
    "cost_usd",
    "elapsed_ms",
];

// ---------------------------------------------------------------------------
// toCaseRow
// ---------------------------------------------------------------------------

describe("casesApi · S20 · toCaseRow · the deliberation as one row", () => {
    test("S20 · the row carries every field the interface declares", () => {
        const row = toCaseRow(COMPLETED_RUN);
        assert.equal(typeof row, "object");
        assert.notEqual(row, null);
        for (const field of CASE_ROW_FIELDS) {
            assert.ok(
                Object.prototype.hasOwnProperty.call(row, field),
                `CaseRow is missing ${field}`,
            );
        }
    });

    test("§3 · the row's columns are the database's names, not the browser's", () => {
        // "The relational half is where the questions are." A column named
        // runId cannot be queried as run_id.
        const row = toCaseRow(COMPLETED_RUN);
        const camel = Object.keys(row).filter((k) => /[A-Z]/.test(k));
        assert.deepEqual(camel, [], `CaseRow carries camelCase columns: ${camel.join(", ")}`);
    });

    test("S20 · the row is the run it was given, not a summary of it", () => {
        const row = toCaseRow(COMPLETED_RUN);
        assert.equal(row.run_id, COMPLETED_RUN.runId);
        assert.equal(row.config, COMPLETED_RUN.config);
        assert.equal(row.ok, COMPLETED_RUN.ok);
        assert.equal(row.budget_usd, COMPLETED_RUN.budgetUsd);
        assert.deepEqual(row.charge_sheet, COMPLETED_RUN.chargeSheet);
        assert.deepEqual(row.tally, COMPLETED_RUN.tally);
        assert.deepEqual(row.totals, COMPLETED_RUN.totals);
        assert.ok(row.created_at, "created_at is empty; the row cannot be ordered in time");
    });

    test("§1 · all four speeches and all three rulings are kept side by side", () => {
        // "Three verdicts are shown side by side and never merged." A record
        // that stored one of them would be a record of a different court.
        const row = toCaseRow(COMPLETED_RUN);
        assert.ok(Array.isArray(row.speeches), "speeches is not an array");
        assert.ok(Array.isArray(row.rulings), "rulings is not an array");
        assert.equal(row.speeches.length, 4);
        assert.equal(row.rulings.length, 3);
        assert.deepEqual(
            row.rulings.map((r) => r.judgeId ?? r.judge_id),
            JUDGES.map((j) => j.id),
        );
    });

    test("S3 · a judge's failure is stored as a failure, not dropped", () => {
        const row = toCaseRow(COMPLETED_RUN);
        const failed = row.rulings.filter((r) => r.ok === false);
        assert.equal(failed.length, 1, "the failed ruling was not stored as a failure");
        assert.ok(
            failed[0].verdict === undefined || failed[0].verdict === null,
            `a stored failure carries verdict "${failed[0].verdict}"`,
        );
    });

    test("S12 · the row publishes no majority, mean or combined figure", () => {
        const row = toCaseRow(COMPLETED_RUN);
        const offending = [...allKeys(row, 5)].filter((k) => AGGREGATE_KEY_PATTERN.test(k));
        assert.deepEqual(offending, [], `the stored row exposes an aggregate: ${offending.join(", ")}`);
    });

    test("toCaseRow is pure — it neither mutates the run nor varies between calls", () => {
        const before = JSON.stringify(COMPLETED_RUN);
        const first = toCaseRow(COMPLETED_RUN);
        const second = toCaseRow(COMPLETED_RUN);
        assert.deepEqual(first, second, "two calls on one run produced two different rows");
        assert.equal(JSON.stringify(COMPLETED_RUN), before, "toCaseRow mutated the run it was given");
    });

    test("the row survives JSON, because that is how it reaches the function", () => {
        const row = toCaseRow(COMPLETED_RUN);
        assert.deepEqual(JSON.parse(JSON.stringify(row)), row, "the row does not round-trip through JSON");
    });

    test("S23 · nothing credential-shaped reaches the row", () => {
        const dumped = JSON.stringify(toCaseRow(COMPLETED_RUN));
        const credential =
            /(SUPABASE_[A-Z_]+|service_role|eyJhbGciOi|supabase\.co|postgres(ql)?:\/\/|sk-or-|sk-ant-)/;
        const hit = dumped.match(credential);
        assert.equal(hit, null, `the row carries a credential-shaped value: "${hit?.[0]}"`);
    });

    test("§5 pitfall 24 · a run that was refused does not become a stored deliberation", () => {
        // "A record that fails to save must not be reported as a court that
        // failed to sit" — and the mirror of it: a court that never sat is not
        // a deliberation to record.
        const refused = { ok: false, refused: true, error: "the worst case exceeds the cap" };
        let row;
        assert.doesNotThrow(() => {
            row = toCaseRow(refused);
        }, "toCaseRow threw on a refused run instead of reporting it");
        if (row === null || row === undefined) return; // refusing to make a row is a valid answer
        assert.notEqual(row.ok, true, "a refused run was stored as a successful deliberation");
    });
});

// ---------------------------------------------------------------------------
// toCallRows
// ---------------------------------------------------------------------------

describe("casesApi · S21 · toCallRows · one row per model call", () => {
    test("S21 · a completed run produces exactly seven rows", () => {
        // "Every model call in a run is stored as its own row, including the
        // failed ones · Seven `model_calls` rows per completed run."
        const rows = toCallRows(COMPLETED_RUN);
        assert.ok(Array.isArray(rows), "toCallRows did not return an array");
        assert.equal(rows.length, 7, `toCallRows produced ${rows.length} rows for a seven-call run`);
    });

    test("S21 · the failed call is one of the seven", () => {
        const rows = toCallRows(COMPLETED_RUN);
        const failed = rows.filter((r) => r.ok === false);
        assert.equal(failed.length, 1, "the failed call was dropped from the record");
        assert.equal(typeof failed[0].error, "string");
        assert.ok(failed[0].error.length > 0, "a failed call was stored without saying why");
    });

    test("S21 · four speech rows and three verdict rows, and no other stage", () => {
        const rows = toCallRows(COMPLETED_RUN);
        assert.equal(rows.filter((r) => r.stage === "speech").length, 4);
        assert.equal(rows.filter((r) => r.stage === "verdict").length, 3);
        for (const row of rows) {
            assert.ok(["speech", "verdict"].includes(row.stage), `stage was "${row.stage}"`);
        }
    });

    test("S21 · every row is joined to the deliberation that made it", () => {
        // "a foreign key to the run that made them."
        for (const row of toCallRows(COMPLETED_RUN)) {
            assert.equal(row.run_id, COMPLETED_RUN.runId, `${row.call_id} is joined to the wrong run`);
        }
    });

    test("S21 · the seven rows are seven distinct calls, not one call seven times", () => {
        const ids = toCallRows(COMPLETED_RUN).map((r) => r.call_id);
        for (const id of ids) {
            assert.ok(id !== undefined && id !== null && id !== "", "a row has no call_id");
        }
        assert.equal(new Set(ids).size, 7, `duplicate call_ids: ${ids.join(", ")}`);
    });

    test("S21 · every seat appears exactly once", () => {
        const agents = toCallRows(COMPLETED_RUN).map((r) => r.agent);
        assert.deepEqual([...agents].sort(), [...SPEECH_SEATS, ...JUDGE_SEATS].sort());
    });

    test("S11 · every row carries model, verdict, tokens, cached tokens, cost and elapsed time", () => {
        // "Each call's model, verdict, tokens, cached tokens, cost and elapsed
        // time are recorded · The call log carries all six fields."
        for (const row of toCallRows(COMPLETED_RUN)) {
            for (const field of CALL_ROW_FIELDS) {
                assert.ok(
                    Object.prototype.hasOwnProperty.call(row, field),
                    `${row.call_id ?? row.agent}: CallRow is missing ${field}`,
                );
            }
            assert.equal(typeof row.model_id, "string", `${row.agent}: model_id`);
            assert.ok(row.model_id.length > 0, `${row.agent}: model_id is empty`);
            for (const numeric of [
                "prompt_tokens",
                "completion_tokens",
                "total_tokens",
                "cached_tokens",
                "cost_usd",
                "elapsed_ms",
            ]) {
                assert.equal(typeof row[numeric], "number", `${row.agent}: ${numeric} is not a number`);
                assert.ok(Number.isFinite(row[numeric]), `${row.agent}: ${numeric} is ${row[numeric]}`);
            }
        }
    });

    test("S19 · cached_tokens is a number on every row, zero when none", () => {
        const rows = toCallRows(COMPLETED_RUN);
        for (const row of rows) {
            assert.equal(typeof row.cached_tokens, "number", `${row.agent}: cached_tokens`);
            assert.ok(row.cached_tokens >= 0, `${row.agent}: cached_tokens is ${row.cached_tokens}`);
        }
        const zeroed = rows.filter((r) => r.cached_tokens === 0);
        assert.ok(zeroed.length > 0, "the fixture has an uncached call and no row reports zero");
    });

    test("§3 · the columns are the database's names, not the browser's", () => {
        for (const row of toCallRows(COMPLETED_RUN)) {
            const camel = Object.keys(row).filter((k) => /[A-Z]/.test(k));
            assert.deepEqual(camel, [], `CallRow carries camelCase columns: ${camel.join(", ")}`);
        }
    });

    test("S11 · a judge's row carries the verdict it delivered and a speaker's row does not invent one", () => {
        const rows = toCallRows(COMPLETED_RUN);
        const byAgent = Object.fromEntries(rows.map((r) => [r.agent, r]));
        assert.equal(byAgent[JUDGE_SEATS[0]].verdict, "JUSTIFIED");
        assert.equal(byAgent[JUDGE_SEATS[1]].verdict, "NOT JUSTIFIED");
        for (const seat of SPEECH_SEATS) {
            assert.ok(
                byAgent[seat].verdict === null || byAgent[seat].verdict === undefined,
                `a representative's row carries verdict "${byAgent[seat].verdict}"`,
            );
        }
    });

    test("S3 · a judge whose answer was not in the required form has no verdict on its row", () => {
        const rows = toCallRows(COMPLETED_RUN);
        const failedJudge = rows.find((r) => r.agent === JUDGE_SEATS[2]);
        assert.ok(
            failedJudge.verdict === null || failedJudge.verdict === undefined,
            `a form failure was stored as verdict "${failedJudge.verdict}"`,
        );
    });

    test("toCallRows is pure — it neither mutates the run nor varies between calls", () => {
        const before = JSON.stringify(COMPLETED_RUN);
        assert.deepEqual(toCallRows(COMPLETED_RUN), toCallRows(COMPLETED_RUN));
        assert.equal(JSON.stringify(COMPLETED_RUN), before, "toCallRows mutated the run it was given");
    });

    test("S21 · a run that stopped after wave one stores the calls it made and no more", () => {
        // All four speakers failing means the judges are never called. Four
        // calls were made, so four rows are the whole truth.
        const shortRun = {
            ...COMPLETED_RUN,
            ok: false,
            calls: CALLS.filter((c) => c.stage === "speech"),
            rulings: [],
        };
        const rows = toCallRows(shortRun);
        assert.equal(rows.length, 4, `${rows.length} rows for a run that made four calls`);
    });

    test("a run with no call log at all yields no rows rather than throwing", () => {
        let rows;
        assert.doesNotThrow(() => {
            rows = toCallRows({ ...COMPLETED_RUN, calls: undefined });
        });
        assert.deepEqual(rows, []);
    });

    test("S21 · a real runCase result converts to seven rows", async () => {
        // The fixture above is built from docs/interfaces.md. This one is
        // built by the orchestrator, so the two documents have to agree.
        const run = await runCase({
            chargeSheet: JUSTIFICATION_CASE,
            config: CONFIG_SINGLE,
            budgetUsd: MAX_BUDGET_USD,
            singleModel: model("vendor/single"),
            perAgentModels: perAgentModels(),
            call: makeFakeCall(() => ({}), JUSTIFICATION_CASE),
        });
        assert.equal(run.calls.length, 7, "the orchestrator did not make seven calls");
        const rows = toCallRows(run);
        assert.equal(rows.length, 7);
        const row = toCaseRow(run);
        assert.equal(row.run_id, run.runId);
        assert.equal(row.speeches.length, 4);
        assert.equal(row.rulings.length, 3);
    });
});

// ---------------------------------------------------------------------------
// createCasesClient — no method throws
// ---------------------------------------------------------------------------

/** A Response-like object. The client may read `ok`, `status`, `json` or `text`. */
function fakeResponse(body, { status = 200, contentType = "application/json" } = {}) {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : "Error",
        headers: {
            get(name) {
                return String(name).toLowerCase() === "content-type" ? contentType : null;
            },
        },
        async json() {
            return JSON.parse(text);
        },
        async text() {
            return text;
        },
        clone() {
            return fakeResponse(body, { status, contentType });
        },
    };
}

const STORED_CASE = {
    runId: COMPLETED_RUN.runId,
    run_id: COMPLETED_RUN.runId,
    createdAt: COMPLETED_RUN.createdAt,
    created_at: COMPLETED_RUN.createdAt,
    config: CONFIG_SPLIT,
    chargeSheet: JUSTIFICATION_CASE,
    charge_sheet: JUSTIFICATION_CASE,
    speeches: COMPLETED_RUN.speeches,
    rulings: COMPLETED_RUN.rulings,
    totals: COMPLETED_RUN.totals,
    tally: COMPLETED_RUN.tally,
    budgetUsd: 2.5,
    budget_usd: 2.5,
    ok: true,
    calls: CALLS,
};

const CASE_SUMMARY = {
    runId: COMPLETED_RUN.runId,
    createdAt: COMPLETED_RUN.createdAt,
    config: CONFIG_SPLIT,
    label: JUSTIFICATION_CASE.label,
    question: JUSTIFICATION_CASE.question,
    delivered: 2,
    failed: 1,
    verdicts: ["JUSTIFIED", "NOT JUSTIFIED"],
    totalTokens: 17400,
    cachedTokens: 9750,
    costUsd: 0.0198,
    distinctModels: 7,
};

/**
 * A fetch that records what it was asked for and answers with `reply(url,
 * options)`. The bodies below name the same value under both a camelCase and a
 * snake_case key, because docs/interfaces.md declares the client's return
 * shapes and says nothing about the wire format between the browser and
 * `/api/cases`.
 */
function recordingFetch(reply) {
    const calls = [];
    const impl = async (url, options) => {
        calls.push({ url: String(url), options: options ?? {} });
        return reply({ url: String(url), options: options ?? {} }, calls.length - 1);
    };
    impl.calls = calls;
    return impl;
}

const OK_REPLIES = {
    add: () => fakeResponse({ ok: true, runId: COMPLETED_RUN.runId, run_id: COMPLETED_RUN.runId }),
    list: () =>
        fakeResponse({
            ok: true,
            cases: [CASE_SUMMARY],
            data: [CASE_SUMMARY],
            items: [CASE_SUMMARY],
        }),
    get: () => fakeResponse({ ok: true, case: STORED_CASE, data: STORED_CASE, ...STORED_CASE }),
    remove: () => fakeResponse({ ok: true, deleted: true, runId: COMPLETED_RUN.runId }),
};

function clientWith(reply) {
    const fetchImpl = recordingFetch(reply);
    return { client: createCasesClient({ fetchImpl }), fetchImpl };
}

/** Every method, so "no method throws" is checked on all four each time. */
function everyMethod(client) {
    return [
        ["addCase", () => client.addCase(COMPLETED_RUN)],
        ["listCases", () => client.listCases()],
        ["getCase", () => client.getCase(COMPLETED_RUN.runId)],
        ["deleteCase", () => client.deleteCase(COMPLETED_RUN.runId)],
    ];
}

describe("casesApi · createCasesClient · the four methods", () => {
    test("the client exposes exactly the four methods the interface declares", () => {
        const { client } = clientWith(() => OK_REPLIES.list());
        for (const name of ["addCase", "listCases", "getCase", "deleteCase"]) {
            assert.equal(typeof client[name], "function", `the client has no ${name}`);
        }
    });

    test("createCasesClient does not throw when it is given nothing", () => {
        assert.doesNotThrow(() => createCasesClient(), "createCasesClient() threw");
        assert.doesNotThrow(() => createCasesClient({}), "createCasesClient({}) threw");
    });

    test("S20 · a saved deliberation reports back the run it saved", async () => {
        const { client } = clientWith(() => OK_REPLIES.add());
        const out = await client.addCase(COMPLETED_RUN);
        assert.equal(out.ok, true, `addCase failed on a 200: ${out.error}`);
        assert.equal(typeof out.runId, "string");
        assert.ok(out.runId.length > 0);
    });

    test("S20 · the history reads back as a list of summaries", async () => {
        const { client } = clientWith(() => OK_REPLIES.list());
        const out = await client.listCases();
        assert.equal(out.ok, true, `listCases failed on a 200: ${out.error}`);
        assert.ok(Array.isArray(out.cases), "listCases did not return an array of cases");
    });

    test("S20 · one deliberation reads back with its call log", async () => {
        const { client } = clientWith(() => OK_REPLIES.get());
        const out = await client.getCase(COMPLETED_RUN.runId);
        assert.equal(out.ok, true, `getCase failed on a 200: ${out.error}`);
        assert.equal(typeof out.case, "object", "getCase returned no case");
        assert.notEqual(out.case, null);
    });

    test("a delete that succeeds reports success", async () => {
        const { client } = clientWith(() => OK_REPLIES.remove());
        const out = await client.deleteCase(COMPLETED_RUN.runId);
        assert.equal(out.ok, true, `deleteCase failed on a 200: ${out.error}`);
    });

    test("S20 · a deliberation is saved with POST and the history is read with GET", async () => {
        // S20's own check: "`POST /api/cases` then `GET /api/cases` from a
        // clean session."
        const add = clientWith(() => OK_REPLIES.add());
        await add.client.addCase(COMPLETED_RUN);
        assert.equal(add.fetchImpl.calls.length, 1, "addCase made no request");
        assert.equal(
            String(add.fetchImpl.calls[0].options.method ?? "GET").toUpperCase(),
            "POST",
            "a deliberation was saved with something other than POST",
        );

        const list = clientWith(() => OK_REPLIES.list());
        await list.client.listCases();
        assert.equal(list.fetchImpl.calls.length, 1, "listCases made no request");
        assert.equal(
            String(list.fetchImpl.calls[0].options.method ?? "GET").toUpperCase(),
            "GET",
            "the history was read with something other than GET",
        );
    });

    test("S21 · the saved body carries the deliberation and all seven of its calls", () => {
        // "Every model call in a run is stored as its own row." The rows have
        // to leave the browser for that to be possible.
        const { client, fetchImpl } = clientWith(() => OK_REPLIES.add());
        return client.addCase(COMPLETED_RUN).then(() => {
            const body = String(fetchImpl.calls[0].options.body ?? "");
            assert.ok(body.length > 0, "addCase sent no body");
            assert.ok(body.includes(COMPLETED_RUN.runId), "the saved body does not name the run");
            for (const entry of CALLS) {
                assert.ok(
                    body.includes(entry.id),
                    `the saved body does not carry the call ${entry.id}; S21 wants all seven rows`,
                );
            }
        });
    });
});

describe("casesApi · S22 · no method throws, so a refused save can be reported", () => {
    // "A deliberation the record refused is reported to the user as
    // unrecorded, never dropped silently · The run panel shows the save
    // failure beside the verdicts." A method that threw would be caught
    // somewhere else or nowhere, and §5 pitfall 24 forbids silence.
    const failures = {
        "a non-2xx response": () => fakeResponse({ error: "row level security" }, { status: 403 }),
        "a 500 with no body at all": () => fakeResponse("", { status: 500 }),
        "a body that is not JSON": () =>
            fakeResponse("<!doctype html><title>Function timed out</title>", {
                status: 200,
                contentType: "text/html",
            }),
        "a network rejection": () => Promise.reject(new Error("fetch failed")),
        "a transport that throws synchronously": () => {
            throw new TypeError("Failed to fetch");
        },
        "a transport that resolves to nothing": () => undefined,
    };

    for (const [description, reply] of Object.entries(failures)) {
        test(`S22 · every method reports ${description} as { ok: false, error }`, async () => {
            const { client } = clientWith(reply);
            for (const [name, invoke] of everyMethod(client)) {
                let out;
                try {
                    out = await invoke();
                } catch (error) {
                    assert.fail(`${name} threw on ${description}: ${error?.message ?? error}`);
                }
                assert.equal(out?.ok, false, `${name} reported success on ${description}`);
                assert.equal(typeof out?.error, "string", `${name} reported no error string`);
                assert.ok(out.error.length > 0, `${name} reported an empty error`);
            }
        });
    }

    test("§5 pitfall 24 · a refused save says the record refused, not that the court failed", () => {
        // "The deliberation happened, the verdicts are on screen, and the only
        // thing lost is the row. Two different failures, two different
        // messages — and neither of them silence."
        const { client } = clientWith(() => fakeResponse({ error: "row level security" }, { status: 403 }));
        return client.addCase(COMPLETED_RUN).then((out) => {
            assert.equal(out.ok, false);
            assert.ok(
                !/(court|deliberation|judges?|verdicts?) (failed|did not sit)/i.test(out.error),
                `the save failure reads as a failed deliberation: "${out.error}"`,
            );
        });
    });

    test("S22 · a run the court refused is reported as unrecorded, not thrown", async () => {
        // runCase's other documented return is
        // `{ ok: false, refused: true, error: string }` — a run with no runId,
        // no calls and no rulings. Handing it to the one module that writes
        // the record must produce a result, because "no method throws" and
        // because pitfall 24 forbids silence in either direction.
        const { client } = clientWith(() => OK_REPLIES.add());
        const refused = { ok: false, refused: true, error: "the worst case exceeds the cap" };
        let out;
        try {
            out = await client.addCase(refused);
        } catch (error) {
            assert.fail(`addCase threw on a refused run: ${error?.message ?? error}`);
        }
        assert.equal(typeof out?.ok, "boolean", "addCase resolved to something that is not a result");
    });

    test("S22 · a method given nothing at all still resolves rather than throwing", async () => {
        const { client } = clientWith(() => OK_REPLIES.add());
        for (const invoke of [
            () => client.addCase(undefined),
            () => client.addCase(null),
            () => client.getCase(undefined),
            () => client.deleteCase(undefined),
        ]) {
            let out;
            try {
                out = await invoke();
            } catch (error) {
                assert.fail(`a method threw on a missing argument: ${error?.message ?? error}`);
            }
            assert.equal(typeof out?.ok, "boolean", "a method resolved to something that is not a result");
        }
    });

    test("S22 · a client built with no fetch at all still resolves", async () => {
        const client = createCasesClient({ fetchImpl: null });
        for (const [name, invoke] of everyMethod(client)) {
            let out;
            try {
                out = await invoke();
            } catch (error) {
                assert.fail(`${name} threw when there was no transport: ${error?.message ?? error}`);
            }
            assert.equal(typeof out?.ok, "boolean", `${name} resolved to something that is not a result`);
        }
    });
});

describe("casesApi · S23 · the browser talks only to /api/cases", () => {
    test("S23 · every request goes to CASES_ENDPOINT", async () => {
        // "No database credential ever reaches the browser · The browser talks
        // only to /api/cases; SUPABASE_* is read only inside functions."
        const { client, fetchImpl } = clientWith(({ options }) =>
            String(options.method ?? "GET").toUpperCase() === "POST"
                ? OK_REPLIES.add()
                : OK_REPLIES.list(),
        );
        for (const [, invoke] of everyMethod(client)) await invoke();
        assert.equal(fetchImpl.calls.length, 4, "not every method made a request");
        for (const { url } of fetchImpl.calls) {
            const path = url.startsWith("/") ? url : new URL(url, "http://localhost").pathname + new URL(url, "http://localhost").search;
            assert.ok(
                path.startsWith(CASES_ENDPOINT),
                `a request went to "${url}", which is not ${CASES_ENDPOINT}`,
            );
            assert.ok(
                !/supabase|postgres|\.co\/rest\/v1|service_role/i.test(url),
                `a request addressed the database directly: "${url}"`,
            );
        }
    });

    test("S23 · nothing the client sends carries a database credential", async () => {
        const { client, fetchImpl } = clientWith(({ options }) =>
            String(options.method ?? "GET").toUpperCase() === "POST"
                ? OK_REPLIES.add()
                : OK_REPLIES.list(),
        );
        for (const [, invoke] of everyMethod(client)) await invoke();
        const credential =
            /(SUPABASE_[A-Z_]+|service_role|eyJhbGciOi|apikey|postgres(ql)?:\/\/|sk-or-|sk-ant-|Bearer )/i;
        for (const { url, options } of fetchImpl.calls) {
            const sent = JSON.stringify({
                url,
                method: options.method,
                headers: options.headers,
                body: options.body,
            });
            const hit = sent.match(credential);
            assert.equal(hit, null, `a request carried a credential-shaped value: "${hit?.[0]}"`);
        }
    });

    test("S23 · nothing the client returns carries a database credential", async () => {
        // The function answers; whatever it answers with must not be handed
        // on unfiltered if it names a key.
        const leaky = () =>
            fakeResponse({
                ok: true,
                cases: [CASE_SUMMARY],
                data: [CASE_SUMMARY],
                SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.leak",
            });
        const { client } = clientWith(leaky);
        const out = await client.listCases();
        const dumped = JSON.stringify(out);
        assert.ok(
            !/SUPABASE_[A-Z_]+|eyJhbGciOi|service_role/.test(dumped),
            "the client handed a credential from the function on to its caller",
        );
    });

    test("§3 · a named endpoint can be injected, and it is still the only one used", async () => {
        // "createCasesClient takes an injected fetchImpl for the same reason
        // runCase takes an injected call." The endpoint option is declared
        // beside it.
        const fetchImpl = recordingFetch(() => OK_REPLIES.list());
        const client = createCasesClient({ fetchImpl, endpoint: "/api/cases-under-test" });
        await client.listCases();
        assert.equal(fetchImpl.calls.length, 1);
        assert.ok(
            fetchImpl.calls[0].url.startsWith("/api/cases-under-test"),
            `the injected endpoint was ignored: "${fetchImpl.calls[0].url}"`,
        );
    });
});
