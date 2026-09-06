#!/bin/sh
#
# Is the free tier available, and which free models actually answer?
#
# Two questions that look like one. "Rate limit exceeded: free-models-per-day"
# is the day's allowance being spent; "empty answer" or "Provider returned
# error" is pitfall 10 - most free models simply do not answer at any given
# moment, whatever the allowance says. Telling them apart decides whether to
# wait or to pick differently, and OpenRouter exposes no reset time to read
# (limit_reset comes back null), so the only honest answer is to ask.
#
#     npm run models          one call - is the day's allowance gone?
#     npm run models -- --all every free model, and who answers
#
# The sweep costs one request per model, which is roughly a fifth of a free
# day's allowance. That is why it is not the default: this script has itself
# spent an afternoon's remaining quota discovering what was available.

set -e
cd "$(dirname -- "$0")/.."

if [ ! -f .env ]; then
    echo "No .env file. Copy .env.example to .env and put your key in it."
    exit 1
fi
KEY=$(grep -E '^OPENROUTER_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
case "$KEY" in ""|*replace-me*) echo "OPENROUTER_API_KEY is not set in .env."; exit 1;; esac

export OR_KEY="$KEY"
export OR_ALL="${1:-}"
node --input-type=module -e '
const KEY = process.env.OR_KEY;
const all = process.env.OR_ALL === "--all";

async function ping(id, maxTokens) {
    const t0 = Date.now();
    try {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ model: id, messages: [{ role: "user", content: "Reply with the single word OK." }], max_tokens: maxTokens || 8 }),
            signal: AbortSignal.timeout(30000)
        });
        const b = await r.json();
        const text = b.choices && b.choices[0] && b.choices[0].message && b.choices[0].message.content;
        return { ms: Date.now() - t0, ok: Boolean(text && text.trim()), error: (b.error && b.error.message) || "empty answer" };
    } catch (e) {
        return { ms: Date.now() - t0, ok: false, error: e.name === "TimeoutError" ? "timed out" : e.message };
    }
}

const catalogue = await (await fetch("https://openrouter.ai/api/v1/models")).json();
const free = catalogue.data
    .filter(m => m.id.endsWith(":free"))
    .filter(m => !(m.architecture && m.architecture.tokenizer === "Router"))
    .map(m => m.id)
    .sort();

console.log("");
if (!all) {
    /*
     * Three models from three different providers, not one.
     *
     * A single probe cannot answer this question, and the first version of
     * this script proved it: minimax answered while three NVIDIA models were
     * refused for free-models-per-day, and the script reported "the free tier
     * is answering". The daily allowance is not one bucket - it binds per
     * provider or per model pool - so one model saying yes says nothing about
     * the others.
     */
    const vendorsSeen = new Set();
    const probes = [];
    for (const id of free) {
        const vendor = id.split("/")[0];
        if (vendorsSeen.has(vendor)) continue;
        vendorsSeen.add(vendor);
        probes.push(id);
        if (probes.length === 3) break;
    }

    let answered = 0;
    let limited = 0;
    for (const id of probes) {
        const r = await ping(id);
        if (r.ok) {
            answered += 1;
            console.log("  answering    " + String(r.ms).padStart(6) + "ms  " + id);
        } else if (/free-models-per-day|rate limit/i.test(r.error)) {
            limited += 1;
            console.log("  RATE LIMITED           " + id);
        } else {
            console.log("  not answering          " + id.padEnd(46) + r.error.slice(0, 34));
        }
    }

    console.log("");
    if (limited === probes.length) {
        console.log("  The day is spent on every provider probed. Nothing to do but wait.");
        console.log("  OpenRouter reports no reset time - limit_reset comes back null - so");
        console.log("  running this again is the way to find out that it has reset.");
    } else if (limited > 0) {
        console.log("  Partly spent: " + limited + " of " + probes.length + " providers refused for the day, " + answered + " answered.");
        console.log("  The allowance is not one bucket. A run needs enough providers, not");
        console.log("  enough requests, so check with --all before convening.");
    } else if (answered === 0) {
        console.log("  Nothing answered, and nothing was rate limited. That is pitfall 10 -");
        console.log("  free models refusing or returning empty - rather than the allowance.");
    } else {
        console.log("  " + answered + " of " + probes.length + " providers answering, none rate limited. Run with --all");
        console.log("  to see how many distinct providers are available for arrangement B.");
    }
    console.log("");
    process.exit(0);
}

const answering = [];
let rateLimited = 0;
for (const id of free) {
    const r = await ping(id);
    if (r.ok) {
        answering.push(id);
        console.log("  ANSWERED " + String(r.ms).padStart(6) + "ms  " + id);
    } else {
        if (/free-models-per-day|rate limit/i.test(r.error)) rateLimited += 1;
        console.log("  ---                " + id.padEnd(50) + r.error.slice(0, 42));
    }
}
const vendors = [...new Set(answering.map(id => id.split("/")[0]))];
console.log("");
console.log("  answering:          " + answering.length + " of " + free.length);
console.log("  distinct providers: " + vendors.length + (vendors.length ? "  (" + vendors.join(", ") + ")" : ""));
if (rateLimited) console.log("  rate-limited:       " + rateLimited + " - the day is partly or wholly spent");
console.log("");
console.log("  Arrangement B wants seven distinct models. Three distinct providers is");
console.log("  enough to put each judge on a different one, which is the claim Module 14");
console.log("  actually makes - see docs/coordination.md.");
console.log("");
'
