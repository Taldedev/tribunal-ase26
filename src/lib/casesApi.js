/*
 * casesApi.js - the browser's side of the record.
 *
 * This replaced an IndexedDB store, and the reason is not that IndexedDB was
 * badly written. It is that a deliberation kept in one browser is a
 * deliberation that a cleared cache destroys, that a second machine cannot
 * read, and that nobody else can be shown. The comparison this project exists
 * to make happens across runs minutes or days apart, so the record is
 * infrastructure rather than a convenience.
 *
 * Nothing here holds a database credential. It talks to /api/cases, and the
 * key lives in the function on the other side of that path.
 *
 * The two exported pure functions are where the record's correctness is
 * actually testable: a run in, the rows that should be stored out, with no
 * network anywhere near it.
 */

import { CASES_ENDPOINT, HISTORY_LIMIT } from "../constants.js";

/*
 * One deliberation as one row.
 *
 * The nested, irregular half of the run - prose speeches, rulings with lists
 * of reasons - is stored as it is rather than flattened into columns. Module
 * 15's warning about handoffs applies to storage too: structure lost on the
 * way in has to be guessed back on the way out, sometimes wrongly and quietly.
 */
export function toCaseRow(run) {
    return {
        run_id: run.runId,
        created_at: run.createdAt,
        config: run.config,
        charge_sheet: run.chargeSheet,
        speeches: run.speeches || [],
        rulings: run.rulings || [],
        totals: run.totals || null,
        tally: run.tally || null,
        budget_usd: typeof run.budgetUsd === "number" ? run.budgetUsd : null,
        ok: run.ok !== false,
        agent_models: run.agentModels || null,
        distinct_models:
            typeof run.distinctModels === "number" ? run.distinctModels : null
    };
}

/*
 * One row per model call, including the calls that failed.
 *
 * Module 7 asks for a log of every model call with the model, the verdict, the
 * tokens, the cost and the time. The failures matter most of the set: they are
 * what tells you, next week, that a free model which looked available answers
 * one call in three.
 */
export function toCallRows(run) {
    return (run.calls || []).map(function (call) {
        return {
            run_id: run.runId,
            call_id: call.id,
            stage: call.stage,
            agent: call.agent,
            agent_title: call.agentTitle || null,
            role: call.role || null,
            model_id: call.modelId,
            model_name: call.modelName || null,
            ok: call.ok === true,
            error: call.error || null,
            verdict: call.verdict || null,
            truncated: call.truncated === true,
            prompt_tokens: call.promptTokens || 0,
            completion_tokens: call.completionTokens || 0,
            total_tokens: call.totalTokens || 0,
            cached_tokens: call.cachedTokens || 0,
            cost_usd: call.costUsd || 0,
            elapsed_ms: call.elapsedMs || 0
        };
    });
}

// A stored row read back, in the shape the rest of the application speaks.
function fromCaseRow(row, calls) {
    return {
        runId: row.run_id,
        createdAt: row.created_at,
        config: row.config,
        chargeSheet: row.charge_sheet,
        speeches: row.speeches || [],
        rulings: row.rulings || [],
        totals: row.totals || null,
        tally: row.tally || null,
        budgetUsd: row.budget_usd,
        ok: row.ok !== false,
        agentModels: row.agent_models || {},
        distinctModels: row.distinct_models || null,
        calls: (calls || []).map(function (call) {
            return {
                id: call.call_id,
                stage: call.stage,
                agent: call.agent,
                agentTitle: call.agent_title,
                role: call.role,
                modelId: call.model_id,
                modelName: call.model_name,
                ok: call.ok === true,
                error: call.error,
                verdict: call.verdict,
                truncated: call.truncated === true,
                promptTokens: call.prompt_tokens || 0,
                completionTokens: call.completion_tokens || 0,
                totalTokens: call.total_tokens || 0,
                cachedTokens: call.cached_tokens || 0,
                costUsd: Number(call.cost_usd) || 0,
                elapsedMs: call.elapsed_ms || 0
            };
        })
    };
}

/*
 * The client.
 *
 * No method throws. A record that cannot be reached is an ordinary outcome the
 * screen has to state - the court still sat, the verdicts are still on the
 * screen, and the only thing lost is the row - so a failure here returns
 * { ok: false, error } in the same way a failed model call does. An exception
 * would take down a run that had already succeeded.
 *
 * fetchImpl is injectable for the same reason runCase takes an injected call:
 * the network is not the unit under test.
 */
export function createCasesClient(options) {
    const settings = options || {};
    const endpoint = settings.endpoint || CASES_ENDPOINT;
    const fetchImpl =
        settings.fetchImpl ||
        (typeof fetch === "function" ? fetch.bind(globalThis) : null);

    async function request(path, init) {
        if (!fetchImpl) {
            return { ok: false, error: "This environment has no fetch, so the record is unreachable." };
        }
        let response;
        try {
            response = await fetchImpl(endpoint + (path || ""), init);
        } catch (error) {
            return {
                ok: false,
                error: "The record could not be reached: " + (error && error.message ? error.message : String(error))
            };
        }

        let body = null;
        try {
            const raw = await response.text();
            body = raw ? JSON.parse(raw) : null;
        } catch (error) {
            return { ok: false, error: "The record answered with something that was not JSON." };
        }

        if (!response.ok) {
            return {
                ok: false,
                error: (body && body.error) || "The record refused the request (status " + response.status + ")."
            };
        }
        return { ok: true, body: body || {} };
    }

    return {
        async addCase(run) {
            /*
             * No method throws, on any argument, including none.
             *
             * Every caller passes a run, which is why this guard was missing
             * and why the suite written from the specification found it: the
             * discipline exists so a failed save is always reportable, and a
             * method that throws on the way to reporting a failure has
             * defeated its own reason for existing.
             */
            if (!run || typeof run !== "object" || !run.runId) {
                return { ok: false, error: "There is no finished run to store." };
            }
            const result = await request("", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ case: toCaseRow(run), calls: toCallRows(run) })
            });
            if (!result.ok) {
                return { ok: false, error: result.error };
            }
            return { ok: true, runId: result.body.runId || run.runId };
        },

        async listCases() {
            const result = await request("?limit=" + HISTORY_LIMIT);
            if (!result.ok) {
                return { ok: false, error: result.error };
            }
            return { ok: true, cases: Array.isArray(result.body.cases) ? result.body.cases : [] };
        },

        async getCase(runId) {
            if (!runId) {
                return { ok: false, error: "No case was named." };
            }
            const result = await request("/" + encodeURIComponent(runId));
            if (!result.ok) {
                return { ok: false, error: result.error };
            }
            if (!result.body.case) {
                return { ok: false, error: "That case is not in the record." };
            }
            return { ok: true, case: fromCaseRow(result.body.case, result.body.calls) };
        },

        async deleteCase(runId) {
            if (!runId) {
                return { ok: false, error: "No case was named." };
            }
            const result = await request("/" + encodeURIComponent(runId), { method: "DELETE" });
            if (!result.ok) {
                return { ok: false, error: result.error };
            }
            return { ok: true };
        }
    };
}
