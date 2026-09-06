/*
 * cases.js - the record. The only place the database credential exists.
 *
 * The browser holds no database key at all, not even an anonymous one. It
 * posts a finished deliberation here and asks here for the ones that came
 * before; this function holds the service-role key, and that key bypasses
 * row-level security by design. That is the whole reason it lives on this side
 * of the wire.
 *
 * Everything the browser sends is treated as untrusted, and the endpoint
 * accepts a named, capped set of fields rather than anything resembling a
 * query. A crafted request must not be able to select, filter or delete
 * outside the run it names - which is why there is no filter parameter here to
 * craft.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The most cases a listing will return. The history panel reads newest first
// and nobody scrolls a thousand deliberations; an unbounded list is a way to
// make one request expensive.
const MAX_LIST = 100;

/*
 * The most calls one saved run may carry.
 *
 * A deliberation is seven calls and cannot be more - that is a standing rule
 * of the project. The cap is set a little above seven rather than at it, so a
 * legitimate future change to the panel size fails loudly here instead of
 * silently dropping rows, while a request claiming ten thousand calls is
 * refused before it reaches the database.
 */
const MAX_CALLS_PER_RUN = 16;

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function jsonResponse(body, status) {
    return new Response(JSON.stringify(body), {
        status: status || 200,
        headers: { "content-type": "application/json; charset=utf-8" }
    });
}

function configured() {
    return Boolean(SUPABASE_URL && SERVICE_KEY);
}

function notConfigured() {
    return jsonResponse(
        {
            error:
                "The record is not configured. Set SUPABASE_URL and " +
                "SUPABASE_SERVICE_ROLE_KEY - locally in .env, and on Netlify under " +
                "Site configuration -> Environment variables. Deliberations still " +
                "run; they are simply not kept."
        },
        503
    );
}

// One request to Supabase's REST interface. The key never leaves this function.
async function supabase(path, init) {
    const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
        ...init,
        headers: {
            apikey: SERVICE_KEY,
            Authorization: "Bearer " + SERVICE_KEY,
            "Content-Type": "application/json",
            ...(init && init.headers ? init.headers : {})
        }
    });

    const raw = await response.text();
    let body = null;
    if (raw) {
        try {
            body = JSON.parse(raw);
        } catch (error) {
            return {
                ok: false,
                error: "The database answered with something that was not JSON."
            };
        }
    }

    if (!response.ok) {
        /*
         * The database's own message is passed through because it is the only
         * thing that distinguishes "the tables do not exist yet" from "this
         * row already exists", and a reader who cannot tell those apart cannot
         * fix either. It is a message about schema, never about data.
         */
        const detail =
            (body && (body.message || body.hint || body.details)) ||
            "status " + response.status;
        return { ok: false, error: "The database refused the write: " + detail };
    }

    return { ok: true, body: body };
}

// ---------------------------------------------------------------------------
// Validation. Named fields, checked shapes, capped sizes.

function readText(value, limit) {
    if (typeof value !== "string") {
        return null;
    }
    const text = value.trim();
    return text === "" || text.length > limit ? null : text;
}

function readNumber(value) {
    const number = Number(value);
    return isFinite(number) ? number : 0;
}

function readBoolean(value) {
    return value === true;
}

/*
 * Rebuilds the case row from the request rather than trusting it.
 *
 * The browser sends a row already shaped by toCaseRow, and this could simply
 * be forwarded. It is not, because forwarding an object into a database is how
 * a field nobody designed ends up stored, and because the shape is the one
 * thing this endpoint can be certain about.
 */
function readCaseRow(input) {
    if (!input || typeof input !== "object") {
        return { error: "A case is required." };
    }
    const runId = readText(input.run_id, 64);
    if (!runId || !RUN_ID_PATTERN.test(runId)) {
        return { error: "A run id of letters, digits, dashes or underscores is required." };
    }
    const config = readText(input.config, 32);
    if (!config) {
        return { error: "The arrangement the run used is required." };
    }
    if (!input.charge_sheet || typeof input.charge_sheet !== "object") {
        return { error: "A charge sheet is required." };
    }
    return {
        row: {
            run_id: runId,
            created_at: readText(input.created_at, 64) || new Date().toISOString(),
            config: config,
            charge_sheet: input.charge_sheet,
            speeches: Array.isArray(input.speeches) ? input.speeches : [],
            rulings: Array.isArray(input.rulings) ? input.rulings : [],
            totals: input.totals && typeof input.totals === "object" ? input.totals : null,
            tally: input.tally && typeof input.tally === "object" ? input.tally : null,
            budget_usd: readNumber(input.budget_usd),
            ok: readBoolean(input.ok)
        }
    };
}

function readCallRows(input, runId) {
    if (!Array.isArray(input)) {
        return { error: "The call log must be a list." };
    }
    if (input.length > MAX_CALLS_PER_RUN) {
        return {
            error:
                "A deliberation is seven calls. " +
                input.length +
                " were sent, which is more than this endpoint will store."
        };
    }
    const rows = [];
    for (const call of input) {
        if (!call || typeof call !== "object") {
            continue;
        }
        const callId = readText(call.call_id, 64);
        const stage = call.stage === "speech" || call.stage === "verdict" ? call.stage : null;
        if (!callId || !stage) {
            return { error: "Every logged call needs an id and a stage." };
        }
        rows.push({
            run_id: runId,
            call_id: callId,
            stage: stage,
            agent: readText(call.agent, 120) || "unnamed",
            agent_title: readText(call.agent_title, 240),
            role: readText(call.role, 60),
            model_id: readText(call.model_id, 200) || "unknown",
            model_name: readText(call.model_name, 200),
            ok: readBoolean(call.ok),
            // A failed call is a row. Module 7 asks for a log of every model
            // call, and the ones that did not answer are the ones worth
            // counting when a free model is chosen again.
            error: readText(call.error, 2000),
            verdict: readText(call.verdict, 120),
            prompt_tokens: readNumber(call.prompt_tokens),
            completion_tokens: readNumber(call.completion_tokens),
            total_tokens: readNumber(call.total_tokens),
            cached_tokens: readNumber(call.cached_tokens),
            cost_usd: readNumber(call.cost_usd),
            elapsed_ms: readNumber(call.elapsed_ms)
        });
    }
    return { rows: rows };
}

// ---------------------------------------------------------------------------
// The summary a listing returns.
//
// The full speeches are not sent to build a list nobody has opened yet: four
// speeches and three reasoned rulings are most of the payload, and the panel
// shows a row with a date, an arrangement and the three verdicts.

function summarise(row) {
    const rulings = Array.isArray(row.rulings) ? row.rulings : [];
    const totals = row.totals || {};
    const sheet = row.charge_sheet || {};
    return {
        runId: row.run_id,
        createdAt: row.created_at,
        config: row.config,
        label: sheet.label || null,
        question: sheet.question || null,
        delivered: rulings.filter(function (ruling) {
            return ruling && ruling.ok;
        }).length,
        failed: rulings.filter(function (ruling) {
            return ruling && !ruling.ok;
        }).length,
        verdicts: rulings.map(function (ruling) {
            return ruling && ruling.ok ? ruling.verdict : null;
        }),
        totalTokens: readNumber(totals.totalTokens),
        cachedTokens: readNumber(totals.cachedTokens),
        costUsd: readNumber(totals.costUsd),
        distinctModels: readNumber(row.distinct_models) || null,
        ok: row.ok !== false
    };
}

// ---------------------------------------------------------------------------

export default async function handler(request) {
    if (!configured()) {
        return notConfigured();
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/cases\/([^/]+)$/);
    const runId = match ? decodeURIComponent(match[1]) : null;

    if (runId !== null && !RUN_ID_PATTERN.test(runId)) {
        return jsonResponse({ error: "That is not a run id." }, 400);
    }

    if (request.method === "GET" && runId === null) {
        const result = await supabase(
            "cases?select=run_id,created_at,config,charge_sheet,rulings,totals,ok" +
                "&order=created_at.desc&limit=" +
                MAX_LIST
        );
        if (!result.ok) {
            return jsonResponse({ error: result.error }, 502);
        }
        return jsonResponse({ cases: (result.body || []).map(summarise) });
    }

    if (request.method === "GET") {
        const found = await supabase(
            "cases?select=*&run_id=eq." + encodeURIComponent(runId) + "&limit=1"
        );
        if (!found.ok) {
            return jsonResponse({ error: found.error }, 502);
        }
        const row = (found.body || [])[0];
        if (!row) {
            return jsonResponse({ error: "No such case." }, 404);
        }
        const calls = await supabase(
            "model_calls?select=*&run_id=eq." + encodeURIComponent(runId) + "&order=id.asc"
        );
        if (!calls.ok) {
            return jsonResponse({ error: calls.error }, 502);
        }
        return jsonResponse({ case: row, calls: calls.body || [] });
    }

    if (request.method === "POST" && runId === null) {
        let payload;
        try {
            payload = await request.json();
        } catch (error) {
            return jsonResponse({ error: "The request body was not valid JSON." }, 400);
        }

        const caseRow = readCaseRow(payload.case);
        if (caseRow.error) {
            return jsonResponse({ error: caseRow.error }, 400);
        }
        const callRows = readCallRows(payload.calls, caseRow.row.run_id);
        if (callRows.error) {
            return jsonResponse({ error: callRows.error }, 400);
        }

        /*
         * The case first, then its calls, and both on conflict-update.
         *
         * A run saved twice must correct itself rather than duplicate, because
         * the retry that saves it twice is exactly what happens when the first
         * attempt looked like it failed and did not. There is no transaction
         * across the two statements: if the calls fail after the case is
         * written, the run is present with an incomplete log, and the response
         * says so. That is a better failure than a deliberation that vanishes
         * because one of its seven rows was rejected.
         */
        const saved = await supabase("cases?on_conflict=run_id", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify([caseRow.row])
        });
        if (!saved.ok) {
            return jsonResponse({ error: saved.error }, 502);
        }

        if (callRows.rows.length > 0) {
            const logged = await supabase("model_calls?on_conflict=run_id,call_id", {
                method: "POST",
                headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
                body: JSON.stringify(callRows.rows)
            });
            if (!logged.ok) {
                return jsonResponse(
                    {
                        runId: caseRow.row.run_id,
                        error:
                            "The deliberation was stored but its call log was not: " +
                            logged.error
                    },
                    502
                );
            }
        }

        return jsonResponse({ runId: caseRow.row.run_id, calls: callRows.rows.length }, 201);
    }

    if (request.method === "DELETE" && runId !== null) {
        // model_calls cascades on the foreign key, so one delete is enough and
        // a half-deleted case is not a state this can reach.
        const result = await supabase("cases?run_id=eq." + encodeURIComponent(runId), {
            method: "DELETE",
            headers: { Prefer: "return=minimal" }
        });
        if (!result.ok) {
            return jsonResponse({ error: result.error }, 502);
        }
        return jsonResponse({ runId: runId, deleted: true });
    }

    return jsonResponse({ error: "Use GET, POST or DELETE." }, 405);
}

export const config = { path: ["/api/cases", "/api/cases/:runId"] };
