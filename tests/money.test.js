// tests/money.test.js — cost arithmetic.
//
// Sources: docs/spec.md S7, S11, §5 pitfall 9; docs/problem.md §3 item 7;
// docs/interfaces.md (Model prices are "dollars per single token").

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
    estimateTokens,
    computeCallCost,
    estimateRunCost,
    formatUsd,
    formatTokens,
    formatDuration,
} from "../src/lib/money.js";

import { model, FREE_MODEL } from "./helpers.js";

describe("money · estimateTokens", () => {
    test("empty text costs nothing", () => {
        assert.equal(estimateTokens(""), 0);
    });

    test("absent text is treated as empty, not as NaN", () => {
        assert.equal(estimateTokens(undefined), 0);
        assert.equal(estimateTokens(null), 0);
    });

    test("an estimate is a non-negative whole number", () => {
        const n = estimateTokens("The water was rising and the boat was tethered to a fixed cleat.");
        assert.equal(typeof n, "number");
        assert.ok(Number.isFinite(n));
        assert.ok(Number.isInteger(n), `estimateTokens returned ${n}, which is not a whole number of tokens`);
        assert.ok(n > 0);
    });

    test("S7 · longer text never estimates fewer tokens", () => {
        // A worst-case cost that can fall as the prompt grows cannot bound a run.
        let previous = -1;
        for (const length of [0, 10, 100, 1000, 10000]) {
            const n = estimateTokens("a".repeat(length));
            assert.ok(n >= previous, `estimateTokens fell from ${previous} to ${n} at length ${length}`);
            previous = n;
        }
    });

    test("S7 · the estimate is in the right order of magnitude for English prose", () => {
        // coordination.md budgets "roughly 16,000-17,000 tokens per
        // deliberation", which only holds if this is roughly chars/4.
        const text = "the quick brown fox jumps over the lazy dog. ".repeat(200); // 9000 chars
        const n = estimateTokens(text);
        assert.ok(
            n >= text.length / 10 && n <= text.length / 2,
            `${text.length} characters estimated as ${n} tokens, outside the plausible band`,
        );
    });
});

describe("money · computeCallCost", () => {
    test("S11 · cost is prompt tokens times prompt price plus completion tokens times completion price", () => {
        const m = model("vendor/paid", { promptPrice: 1e-6, completionPrice: 2e-6 });
        const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
        // 1000 * 1e-6 = 0.001 ; 500 * 2e-6 = 0.001
        assert.equal(computeCallCost(usage, m), 0.002);
    });

    test("S11 · prompt and completion are priced separately, not at one rate", () => {
        const m = model("vendor/asymmetric", { promptPrice: 1e-6, completionPrice: 5e-6 });
        const heavyPrompt = computeCallCost(
            { promptTokens: 1000, completionTokens: 0, totalTokens: 1000 },
            m,
        );
        const heavyCompletion = computeCallCost(
            { promptTokens: 0, completionTokens: 1000, totalTokens: 1000 },
            m,
        );
        assert.equal(heavyPrompt, 0.001);
        assert.equal(heavyCompletion, 0.005);
    });

    test("§5 pitfall 9 · a free model costs exactly zero dollars", () => {
        const usage = { promptTokens: 12000, completionTokens: 4000, totalTokens: 16000 };
        assert.equal(computeCallCost(usage, FREE_MODEL), 0);
    });

    test("S11 · the cost reported by upstream is preferred over the estimate", () => {
        // docs/interfaces.md: Usage.reportedCost is "dollars, from upstream,
        // when available". S11 requires each call's cost be *recorded*; the
        // authoritative figure is the one upstream billed.
        const m = model("vendor/paid", { promptPrice: 1e-6, completionPrice: 2e-6 });
        const usage = {
            promptTokens: 1000,
            completionTokens: 500,
            totalTokens: 1500,
            reportedCost: 0.0031,
        };
        assert.equal(computeCallCost(usage, m), 0.0031);
    });

    test("a missing usage or model yields zero, not NaN", () => {
        const m = model("vendor/paid");
        assert.equal(computeCallCost(undefined, m), 0);
        assert.equal(computeCallCost({ promptTokens: 10, completionTokens: 10, totalTokens: 20 }, undefined), 0);
    });

    test("cost is never negative", () => {
        const m = model("vendor/paid");
        const cost = computeCallCost({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }, m);
        assert.equal(cost, 0);
    });
});

describe("money · estimateRunCost", () => {
    test("S7 · a plan is priced as prompt tokens plus the full completion allowance", () => {
        // Worst case: every call runs to its token limit.
        const m = model("vendor/paid", { promptPrice: 1e-6, completionPrice: 2e-6 });
        const plan = [
            { model: m, promptTokens: 500, maxTokens: 1000 },
            { model: m, promptTokens: 2000, maxTokens: 800 },
        ];
        // (500e-6 + 2000e-6) + (1000*2e-6 + 800*2e-6) = 0.0025 + 0.0036
        assert.equal(Number(estimateRunCost(plan).toFixed(10)), 0.0061);
    });

    test("S7 · an empty plan costs nothing", () => {
        assert.equal(estimateRunCost([]), 0);
    });

    test("§5 pitfall 9 · a seven-call plan on free models costs zero", () => {
        const plan = Array.from({ length: 7 }, () => ({
            model: FREE_MODEL,
            promptTokens: 2000,
            maxTokens: 900,
        }));
        assert.equal(estimateRunCost(plan), 0);
    });

    test("S7 · cost rises with the plan, so the cap can bind", () => {
        const m = model("vendor/paid");
        const small = estimateRunCost([{ model: m, promptTokens: 100, maxTokens: 100 }]);
        const large = estimateRunCost([
            { model: m, promptTokens: 100, maxTokens: 100 },
            { model: m, promptTokens: 10000, maxTokens: 4000 },
        ]);
        assert.ok(large > small, `${large} is not greater than ${small}`);
    });
});

describe("money · formatting", () => {
    test("formatUsd returns a dollar string", () => {
        const out = formatUsd(1.25);
        assert.equal(typeof out, "string");
        assert.ok(out.includes("$"), `formatUsd(1.25) = "${out}" has no currency mark`);
        assert.ok(/1[.,]2/.test(out), `formatUsd(1.25) = "${out}" lost the value`);
    });

    test("formatUsd(0) is zero, not NaN or blank", () => {
        const out = formatUsd(0);
        assert.equal(typeof out, "string");
        assert.ok(out.length > 0);
        assert.ok(!/NaN|undefined/i.test(out), `formatUsd(0) = "${out}"`);
        assert.ok(/0/.test(out));
    });

    test("problem.md §3.7 · a sub-cent cost does not display as free", () => {
        // The run must report cost per call. Rounding a real charge to "$0.00"
        // makes the report say the opposite of the truth, and makes pitfall 9's
        // distinction between free models and cheap ones invisible.
        assert.notEqual(formatUsd(0.0004), formatUsd(0));
    });

    test("formatTokens renders a count", () => {
        const out = formatTokens(1234);
        assert.equal(typeof out, "string");
        assert.ok(/1[,.   ]?234/.test(out), `formatTokens(1234) = "${out}"`);
    });

    test("formatTokens(0) is zero", () => {
        assert.ok(/0/.test(formatTokens(0)));
        assert.ok(!/NaN/i.test(formatTokens(0)));
    });

    test("formatDuration renders elapsed time", () => {
        const out = formatDuration(1500);
        assert.equal(typeof out, "string");
        assert.ok(out.length > 0);
        assert.ok(!/NaN|undefined/i.test(out), `formatDuration(1500) = "${out}"`);
        assert.ok(/s/i.test(out), `formatDuration(1500) = "${out}" names no unit`);
    });

    test("formatDuration distinguishes a fast run from a slow one", () => {
        // coordination.md claims ~40s parallel against ~97s sequential; a
        // formatter that flattens the two would hide S5 entirely.
        assert.notEqual(formatDuration(40000), formatDuration(97000));
    });

    test("formatDuration(0) is not NaN", () => {
        const out = formatDuration(0);
        assert.equal(typeof out, "string");
        assert.ok(!/NaN|undefined/i.test(out), `formatDuration(0) = "${out}"`);
    });
});
