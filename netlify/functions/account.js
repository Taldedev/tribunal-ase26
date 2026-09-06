/*
 * account.js - what the key is actually allowed to do.
 *
 * The budget control on the screen is measured in dollars, but a run on free
 * models costs nothing and can still be refused, because free models are
 * rationed by requests per day rather than by money. Those are two different
 * limits and only one of them was visible, so a run could be reported as
 * costing nothing right up until it failed on a quota the screen never showed.
 *
 * This reports the second limit. The key itself never leaves the server; only
 * the account's own description of its allowance is passed on.
 */

import { readModelKey } from "../shared/keys.js";

const KEY_URL = "https://openrouter.ai/api/v1/auth/key";

function jsonResponse(body, status) {
    return new Response(JSON.stringify(body), {
        status: status || 200,
        headers: {
            "content-type": "application/json; charset=utf-8",
            // Short cache: the figure moves as the day is spent, but not so
            // fast that every page load needs to ask.
            "cache-control": "public, max-age=60"
        }
    });
}

function readNumber(value) {
    const number = Number(value);
    return isFinite(number) ? number : null;
}

export default async function handler() {
    const credential = readModelKey();
    if (credential.error) {
        return jsonResponse({ error: credential.error }, 500);
    }
    const apiKey = credential.key;

    let upstream;
    try {
        upstream = await fetch(KEY_URL, {
            headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" }
        });
    } catch (error) {
        return jsonResponse({ error: "The account could not be reached: " + error.message }, 502);
    }

    let body;
    try {
        body = await upstream.json();
    } catch (error) {
        return jsonResponse({ error: "The account endpoint did not return JSON." }, 502);
    }

    if (!upstream.ok || body.error) {
        const detail = body.error && body.error.message ? body.error.message : upstream.statusText;
        return jsonResponse({ error: "OpenRouter rejected the key: " + detail }, upstream.status);
    }

    const data = body.data || {};
    const usage = readNumber(data.usage);
    const limit = readNumber(data.limit);

    /*
     * OpenRouter's own message when the daily free allowance runs out names
     * the threshold that lifts it, so the two figures below are the ones the
     * user will be told about if they hit it.
     */
    const freeTier = data.is_free_tier !== false;

    return jsonResponse({
        isFreeTier: freeTier,
        usageUsd: usage,
        limitUsd: limit,
        creditRemainingUsd: limit !== null && usage !== null ? Math.max(0, limit - usage) : null,
        rateLimit: data.rate_limit || null,
        // What the account gets per day on free models, and what lifts it.
        freeRequestsPerDay: freeTier ? 50 : 1000,
        unlockThresholdUsd: 10
    });
}

export const config = { path: "/api/account" };
