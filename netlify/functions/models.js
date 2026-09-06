/*
 * models.js - hands the browser the live OpenRouter model catalogue.
 *
 * The catalogue is fetched rather than hard-coded because model names and
 * prices on OpenRouter change from week to week, and a stale price list would
 * make the cost report wrong. Only the fields the application needs are passed
 * on, and the answer is cached for a few minutes so the list does not cost a
 * request on every page load.
 */

const MODELS_URL = "https://openrouter.ai/api/v1/models";

function jsonResponse(body, status, cacheSeconds) {
    const headers = { "content-type": "application/json; charset=utf-8" };
    if (cacheSeconds) {
        headers["cache-control"] = "public, max-age=" + cacheSeconds;
    }
    return new Response(JSON.stringify(body), { status: status || 200, headers });
}

// OpenRouter gives prices as strings in dollars per single token.
function readPrice(value) {
    const price = Number(value);
    return isFinite(price) && price >= 0 ? price : null;
}

export default async function handler() {
    let upstream;
    try {
        upstream = await fetch(MODELS_URL, {
            headers: { Accept: "application/json" }
        });
    } catch (error) {
        return jsonResponse(
            { error: "The model list could not be fetched: " + error.message },
            502
        );
    }

    if (!upstream.ok) {
        return jsonResponse(
            { error: "OpenRouter returned " + upstream.status + " for the model list." },
            502
        );
    }

    const body = await upstream.json();
    const list = Array.isArray(body.data) ? body.data : [];

    const models = list
        .filter(function (entry) {
            /*
             * Only models that take text in and give nothing but text back.
             *
             * The zero-price test alone is not enough: OpenRouter's free tier
             * also carries media models such as google/lyria-3-pro-preview,
             * which is priced at zero and lists text among its outputs but
             * answers with audio. Offering one of those in a model picker for
             * a court produces a call that fails for reasons nobody can see
             * from the screen.
             */
            const architecture = entry.architecture || {};
            const input = architecture.input_modalities || [];
            const output = architecture.output_modalities || [];
            return input.indexOf("text") !== -1 && output.length === 1 && output[0] === "text";
        })
        .map(function (entry) {
            const pricing = entry.pricing || {};
            const promptPrice = readPrice(pricing.prompt);
            const completionPrice = readPrice(pricing.completion);
            if (promptPrice === null || completionPrice === null) {
                return null;
            }
            const architecture = entry.architecture || {};
            return {
                id: entry.id,
                name: entry.name || entry.id,
                /*
                 * A router is not a model. It forwards each call to whichever
                 * free model happens to be available, so seven calls through
                 * one router can reach seven different models - which is the
                 * opposite of what arrangement A is supposed to hold fixed.
                 */
                isRouter: architecture.tokenizer === "Router",
                contextLength: entry.context_length || 0,
                promptPrice: promptPrice,
                completionPrice: completionPrice,
                isFree: promptPrice === 0 && completionPrice === 0
            };
        })
        .filter(function (entry) {
            return entry !== null;
        });

    // Free models first, then the cheapest paid ones, so the pickers open on
    // exactly the models this project is supposed to prefer.
    models.sort(function (a, b) {
        if (a.isFree !== b.isFree) {
            return a.isFree ? -1 : 1;
        }
        const costA = a.promptPrice + a.completionPrice;
        const costB = b.promptPrice + b.completionPrice;
        if (costA !== costB) {
            return costA - costB;
        }
        return a.name.localeCompare(b.name);
    });

    return jsonResponse({ models: models, fetchedAt: new Date().toISOString() }, 200, 300);
}

export const config = { path: "/api/models" };
