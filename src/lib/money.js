/*
 * money.js - token and cost arithmetic.
 *
 * OpenRouter prices are dollars per single token, so the numbers here are
 * very small and formatting matters: a run that costs $0.0004 must not be
 * displayed as $0.00, or the cost report stops being a report.
 */

// A rough token count used only for the estimate shown before a run starts.
// English text runs at roughly four characters to the token.
export function estimateTokens(text) {
    return Math.ceil(String(text || "").length / 4);
}

/*
 * What one finished call actually cost.
 *
 * OpenRouter returns the real charge when it can work it out, and that number
 * is preferred over the price list, because a model's listed price and the
 * price actually charged can differ for cached or discounted tokens.
 */
export function computeCallCost(usage, model) {
    if (!usage) {
        return 0;
    }
    if (typeof usage.reportedCost === "number" && usage.reportedCost >= 0) {
        return usage.reportedCost;
    }
    if (!model) {
        return 0;
    }
    const promptCost = (usage.promptTokens || 0) * (model.promptPrice || 0);
    const completionCost = (usage.completionTokens || 0) * (model.completionPrice || 0);
    return promptCost + completionCost;
}

/*
 * The worst case a run could cost, worked out before any call is made.
 *
 * It assumes every call fills its completion allowance, which is the most any
 * of them can spend. The run is refused when this exceeds the cap, so the cap
 * binds before money is spent rather than after.
 */
export function estimateRunCost(plan) {
    let total = 0;
    plan.forEach(function (call) {
        const model = call.model;
        if (!model) {
            return;
        }
        total += call.promptTokens * (model.promptPrice || 0);
        total += call.maxTokens * (model.completionPrice || 0);
    });
    return total;
}

// Money, shown with enough places that a real charge never rounds to nothing.
export function formatUsd(value) {
    const amount = Number(value) || 0;
    if (amount === 0) {
        return "$0.00";
    }
    if (amount < 0.01) {
        return "$" + amount.toFixed(6);
    }
    if (amount < 1) {
        return "$" + amount.toFixed(4);
    }
    return "$" + amount.toFixed(2);
}

// Token counts, grouped so four and five figure numbers stay readable.
export function formatTokens(value) {
    return (Number(value) || 0).toLocaleString("en-US");
}

// Durations, in the unit that suits their size.
export function formatDuration(milliseconds) {
    const ms = Number(milliseconds) || 0;
    if (ms < 1000) {
        return Math.round(ms) + " ms";
    }
    return (ms / 1000).toFixed(1) + " s";
}
