/*
 * openrouter.js - the only place in the project that holds the API key.
 *
 * The browser never sees OPENROUTER_API_KEY. It posts a model name and the
 * three segments of one prompt here, this function assembles the messages,
 * adds the key, forwards the call to OpenRouter and hands back the answer
 * together with the token usage.
 *
 * The assembly is deliberate and it is where the cost lever lives. The shared
 * segment goes first, as its own message, because every agent in a wave sends
 * the identical one: four representatives read the same charge sheet, and the
 * three judges read the same charge sheet plus the same four speeches, which
 * is the largest block in the run. A provider that caches prefixes can then
 * charge for it once. Assembling the segments into a single string here - the
 * obvious simplification - is exactly what would destroy that.
 *
 * Everything the browser sends is treated as untrusted: the model name, the
 * message contents and the length limit are all checked before the call is
 * made, so a crafted request cannot turn this endpoint into a general
 * purpose proxy paid for by the site owner.
 */

import { readModelKey } from "../shared/keys.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// A single call may never ask for more than this many completion tokens.
// It is the last line of defence for the run budget: even if the browser is
// tampered with, one call cannot become arbitrarily expensive.
const MAX_COMPLETION_TOKENS = 2000;

// The longest charge sheet plus speeches a single call may carry.
const MAX_MESSAGE_CHARACTERS = 60000;

// The persona and the word to act are both short by construction. Capping them
// separately keeps the shared segment's allowance from being spent on either.
const MAX_PERSONA_CHARACTERS = 20000;
const MAX_USER_CHARACTERS = 4000;

/*
 * The upstream call is abandoned after this long.
 *
 * It sits below the platform's own function timeout on purpose. When the
 * platform kills a function it replies with its own error page, which is not
 * the JSON shape the browser is parsing, so the run reports "status 502" and
 * nobody can tell a slow model from a broken one. Cutting the call off here
 * means a slow model produces a clear sentence instead.
 */
const UPSTREAM_TIMEOUT_MS = 24000;

// What the deadline race resolves with. A unique symbol, so it can never be
// mistaken for anything a provider might legitimately send back.
const DEADLINE = Symbol("deadline");

function jsonResponse(body, status) {
    return new Response(JSON.stringify(body), {
        status: status || 200,
        headers: { "content-type": "application/json; charset=utf-8" }
    });
}

// Returns a trimmed string, or null when the value is not a usable string.
function readString(value, limit) {
    if (typeof value !== "string") {
        return null;
    }
    const text = value.trim();
    if (text === "" || text.length > limit) {
        return null;
    }
    return text;
}

/*
 * Providers report cached prompt tokens in more than one place, and several do
 * not report them at all. A missing figure is zero, not unknown.
 */
function readCachedTokens(usage) {
    const details = usage.prompt_tokens_details || usage.promptTokensDetails || {};
    const candidates = [
        details.cached_tokens,
        details.cachedTokens,
        usage.cached_tokens,
        usage.cache_read_input_tokens
    ];
    for (const value of candidates) {
        if (typeof value === "number" && value > 0) {
            return value;
        }
    }
    return 0;
}

export default async function handler(request) {
    if (request.method !== "POST") {
        return jsonResponse({ error: "Use POST." }, 405);
    }

    const credential = readModelKey();
    if (credential.error) {
        return jsonResponse({ error: credential.error }, 500);
    }
    const apiKey = credential.key;

    let payload;
    try {
        payload = await request.json();
    } catch (error) {
        return jsonResponse({ error: "The request body was not valid JSON." }, 400);
    }

    const model = readString(payload.model, 200);
    if (!model) {
        return jsonResponse({ error: "A model name is required." }, 400);
    }

    const shared = readString(payload.shared, MAX_MESSAGE_CHARACTERS);
    const userPrompt = readString(payload.user, MAX_USER_CHARACTERS);
    if (!shared || !userPrompt) {
        return jsonResponse(
            { error: "A shared record and a user segment are both required." },
            400
        );
    }

    /*
     * The persona is the only optional segment. A ping has none, and a ping
     * goes through this same endpoint because there is no second path to the
     * network worth maintaining.
     */
    const persona = readString(payload.persona, MAX_PERSONA_CHARACTERS) || null;

    let maxTokens = Number(payload.maxTokens);
    if (!isFinite(maxTokens) || maxTokens <= 0) {
        maxTokens = 900;
    }
    maxTokens = Math.min(Math.round(maxTokens), MAX_COMPLETION_TOKENS);

    let temperature = Number(payload.temperature);
    if (!isFinite(temperature) || temperature < 0 || temperature > 2) {
        temperature = 0.7;
    }

    /*
     * OpenRouter attributes traffic by this header. When the variable is not
     * set the function's own origin is used, which is right on the deployed
     * site and right under `netlify dev`, rather than reporting production
     * traffic as localhost because nobody set an optional variable.
     */
    let referer = process.env.OPENROUTER_APP_URL;
    if (!referer) {
        try {
            referer = new URL(request.url).origin;
        } catch (error) {
            referer = "http://localhost:8888";
        }
    }

    /*
     * The messages, in the order that makes the prefix cacheable.
     *
     * The breakpoint on the shared segment is a request, not a guarantee.
     * Some providers cache a long prefix on their own and ignore the marker;
     * some require it; some reject a payload carrying a field they do not
     * recognise. So it is sent, and a rejection that names it is retried once
     * without it. A cost optimisation must never be able to turn into a failed
     * deliberation - the run is the product, the saving is not.
     */
    function buildMessages(withBreakpoint) {
        const messages = [
            withBreakpoint
                ? {
                      role: "system",
                      content: [
                          {
                              type: "text",
                              text: shared,
                              cache_control: { type: "ephemeral" }
                          }
                      ]
                  }
                : { role: "system", content: shared }
        ];
        if (persona) {
            messages.push({ role: "system", content: persona });
        }
        messages.push({ role: "user", content: userPrompt });
        return messages;
    }

    /*
     * One deadline for the whole handler, not one per attempt.
     *
     * The cache-breakpoint retry can send twice, and two 24s attempts is 48s
     * against a platform that kills the function at 30. So the budget is
     * computed once here and each attempt gets whatever is left of it.
     */
    const deadline = Date.now() + UPSTREAM_TIMEOUT_MS;

    /*
     * Races a promise against the handler's deadline.
     *
     * This exists because aborting the controller does not stop a body read
     * that has already begun. Measured, with the function instrumented:
     * headers arrived at 794ms, the abort fired exactly on schedule at
     * 24,001ms, and `upstream.text()` then neither resolved nor rejected - it
     * kept waiting until the platform killed the function at 30s and answered
     * with its own error page, which is not JSON. That is pitfall 6's failure
     * happening through the fix written to prevent it, because the fix guarded
     * the half of the call that was never the problem.
     *
     * The signal is still sent, since it does release the socket where the
     * runtime honours it. The race is what guarantees this handler answers.
     */
    function withDeadline(promise, ms) {
        let timer;
        const expired = new Promise(function (resolve) {
            timer = setTimeout(function () {
                resolve(DEADLINE);
            }, Math.max(ms, 0));
        });
        return Promise.race([promise, expired]).finally(function () {
            clearTimeout(timer);
        });
    }

    function timedOut() {
        return {
            failed: jsonResponse(
                {
                    error:
                        "The model did not answer within " +
                        Math.round(UPSTREAM_TIMEOUT_MS / 1000) +
                        " seconds and the call was cut off. Free models are often " +
                        "queued behind other traffic; try again or pick another model."
                },
                504
            )
        };
    }

    async function send(withBreakpoint) {
        const startedAt = Date.now();
        const remaining = deadline - startedAt;
        if (remaining <= 500) {
            return timedOut();
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(function () {
            controller.abort();
        }, remaining);

        // Both halves of the call are bounded: the open, and the read. A
        // reasoning model sends headers at once and then thinks, so the read
        // is the half that actually runs long.
        let upstream;
        let raw;
        try {
            upstream = await withDeadline(
                fetch(OPENROUTER_URL, {
                signal: controller.signal,
                method: "POST",
                headers: {
                    Authorization: "Bearer " + apiKey,
                    "Content-Type": "application/json",
                    "HTTP-Referer": referer,
                    "X-Title": process.env.OPENROUTER_APP_TITLE || "Tribunal"
                },
                body: JSON.stringify({
                    model: model,
                    messages: buildMessages(withBreakpoint),
                    max_tokens: maxTokens,
                    temperature: temperature,
                    usage: { include: true }
                })
                }),
                deadline - Date.now()
            );
            if (upstream === DEADLINE) {
                clearTimeout(timeoutId);
                controller.abort();
                return timedOut();
            }

            raw = await withDeadline(upstream.text(), deadline - Date.now());
            if (raw === DEADLINE) {
                clearTimeout(timeoutId);
                controller.abort();
                return timedOut();
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === "AbortError") {
                return timedOut();
            }
            return {
                failed: jsonResponse(
                    { error: "The call to OpenRouter did not go through: " + error.message },
                    502
                )
            };
        }

        clearTimeout(timeoutId);
        const elapsedMs = Date.now() - startedAt;

        let body;
        try {
            body = JSON.parse(raw);
        } catch (error) {
            return {
                failed: jsonResponse(
                    {
                        error: "OpenRouter answered with something that was not JSON.",
                        detail: raw.slice(0, 400)
                    },
                    502
                )
            };
        }

        return { upstream: upstream, body: body, elapsedMs: elapsedMs };
    }

    // Whether a refusal is the provider objecting to the cache breakpoint
    // rather than to the call. Only then is it worth sending again.
    function refusedTheBreakpoint(upstream, body) {
        if (upstream.status !== 400) {
            return false;
        }
        const message = String((body.error && body.error.message) || "").toLowerCase();
        return message.indexOf("cache") !== -1 || message.indexOf("unsupported") !== -1;
    }

    let attempt = await send(true);
    if (attempt.failed) {
        return attempt.failed;
    }
    if (
        (!attempt.upstream.ok || attempt.body.error) &&
        refusedTheBreakpoint(attempt.upstream, attempt.body)
    ) {
        attempt = await send(false);
        if (attempt.failed) {
            return attempt.failed;
        }
    }

    const upstream = attempt.upstream;
    const body = attempt.body;
    const elapsedMs = attempt.elapsedMs;

    if (!upstream.ok || body.error) {
        const failure = body.error || {};
        let detail = failure.message || upstream.statusText || "no reason given";

        /*
         * "Provider returned error" on its own tells the user nothing, and it
         * is the message free tiers return most. The provider's own text sits
         * in the metadata, so it is appended when there is one.
         */
        const metadata = failure.metadata || {};
        const providerText = metadata.raw || metadata.provider_name || null;
        if (providerText && String(providerText).indexOf(detail) === -1) {
            detail += " (" + String(providerText).slice(0, 300) + ")";
        }

        return jsonResponse(
            { error: "OpenRouter refused the call: " + detail, status: upstream.status },
            upstream.status === 429 ? 429 : 502
        );
    }

    const choice = body.choices && body.choices[0];
    const text = choice && choice.message ? choice.message.content : "";
    const usage = body.usage || {};

    if (typeof text !== "string" || text.trim() === "") {
        return jsonResponse(
            { error: "The model returned an empty answer.", model: body.model || model },
            502
        );
    }

    return jsonResponse({
        text: text,
        model: body.model || model,
        finishReason: choice.finish_reason || null,
        elapsedMs: elapsedMs,
        usage: {
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0,
            /*
             * How much of the prompt was served from cache. Read from the
             * provider's own report and never inferred: an inferred saving is
             * a claim about the bill rather than a reading of it, and this
             * figure exists so the run can show that caching worked instead of
             * asserting that it should have.
             */
            cachedTokens: readCachedTokens(usage),
            // OpenRouter returns the real charge here when it can work it out.
            // The browser falls back to the price list when it is missing.
            reportedCost: typeof usage.cost === "number" ? usage.cost : null
        }
    });
}

export const config = { path: "/api/openrouter" };
