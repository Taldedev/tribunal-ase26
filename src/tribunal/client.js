/*
 * client.js - the browser side of one model call.
 *
 * Nothing else in the application talks to the network. Everything goes
 * through callModel, so the retry rule, the timeout and the shape of a
 * failure are decided in exactly one place.
 */

import {
    CHAT_ENDPOINT,
    MODELS_ENDPOINT,
    ACCOUNT_ENDPOINT,
    FALLBACK_MODELS
} from "../constants.js";

// A single call is abandoned after this long. A judge that never answers must
// become a visible failure rather than a run that hangs.
const CALL_TIMEOUT_MS = 35000;

/*
 * A call is tried this many times in total before it is declared failed.
 *
 * Three rather than two because free models on OpenRouter rate-limit and drop
 * calls often enough that a single retry leaves seats empty in a run that
 * would otherwise have completed. A refusal that will not change on a second
 * attempt is still not retried.
 */
const MAX_ATTEMPTS = 3;

// Statuses worth trying again: a rate limit, and an upstream provider that
// dropped this particular call.
const RETRYABLE = [429, 502, 503, 504];

function wait(milliseconds) {
    return new Promise(function (resolve) {
        setTimeout(resolve, milliseconds);
    });
}

/*
 * Runs one model call. Resolves with { ok: true, text, usage, ... } or with
 * { ok: false, error }. It does not throw, because a failed call is an
 * ordinary outcome the panel has to display rather than an exception that
 * takes the run down with it.
 */
export async function callModel(options) {
    let lastError = "The call was never attempted.";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(function () {
            controller.abort();
        }, CALL_TIMEOUT_MS);

        try {
            const response = await fetch(CHAT_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: options.model,
                    system: options.system,
                    user: options.user,
                    maxTokens: options.maxTokens,
                    temperature: options.temperature
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const body = await response.json().catch(function () {
                return { error: "The server answered with something that was not JSON." };
            });

            if (response.ok && body.text) {
                return {
                    ok: true,
                    text: body.text,
                    model: body.model,
                    finishReason: body.finishReason,
                    elapsedMs: body.elapsedMs,
                    usage: body.usage
                };
            }

            /*
             * body.error is this application's own message. A body carrying
             * errorMessage instead came from the hosting platform, which means
             * the function itself was killed rather than the model refusing.
             */
            lastError =
                body.error ||
                (body.errorMessage
                    ? "The server was cut off while waiting for this model (" +
                      body.errorMessage +
                      "). It is usually a model that is queued or unavailable."
                    : "The call failed with status " + response.status + ".");

            if (RETRYABLE.indexOf(response.status) === -1) {
                return { ok: false, error: lastError };
            }
            if (attempt === MAX_ATTEMPTS) {
                return { ok: false, error: lastError };
            }
            await wait(1200 * attempt);
        } catch (error) {
            clearTimeout(timeoutId);
            lastError =
                error.name === "AbortError"
                    ? "The model did not answer within " +
                      Math.round(CALL_TIMEOUT_MS / 1000) +
                      " seconds and the call was abandoned."
                    : "The call could not be made: " + error.message;
        }
    }

    return { ok: false, error: lastError };
}

/*
 * Reads the live model catalogue. Falls back to a small list of free models
 * so the pickers are never empty, and says which of the two happened so the
 * screen can be honest about it.
 */
export async function loadModels() {
    try {
        const response = await fetch(MODELS_ENDPOINT);
        const body = await response.json();
        if (response.ok && Array.isArray(body.models) && body.models.length > 0) {
            return { ok: true, models: body.models, fetchedAt: body.fetchedAt };
        }
        return {
            ok: false,
            models: FALLBACK_MODELS,
            error: body.error || "The catalogue came back empty."
        };
    } catch (error) {
        return {
            ok: false,
            models: FALLBACK_MODELS,
            error: "The catalogue could not be reached: " + error.message
        };
    }
}

/*
 * Sends the smallest possible call to one model, so a model can be tried
 * before a run of seven commits to it.
 *
 * Roughly half the free models on OpenRouter refuse, rate-limit or answer
 * empty at any given moment, and finding that out through a failed
 * deliberation costs four speeches. Finding it out here costs eight tokens.
 */
export async function pingModel(modelId) {
    const startedAt = Date.now();
    const result = await callModel({
        model: modelId,
        system: "Reply with exactly the word OK and nothing else.",
        user: "Reply now.",
        maxTokens: 8,
        temperature: 0
    });
    return {
        ok: result.ok,
        error: result.ok ? null : result.error,
        elapsedMs: Date.now() - startedAt
    };
}

/*
 * Reads what the key is allowed to do, so the screen can show the limit that
 * actually binds on free models. A failure here is not worth reporting to the
 * user: it costs them nothing, and the panel simply falls back to stating the
 * request cost of a run without the account figures.
 */
export async function loadAccount() {
    try {
        const response = await fetch(ACCOUNT_ENDPOINT);
        const body = await response.json();
        if (!response.ok || body.error) {
            return { ok: false, error: body.error || "status " + response.status };
        }
        return { ok: true, account: body };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}
