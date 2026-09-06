// tests/constants.test.js — the fixed numbers and vocabularies.
//
// Sources: docs/spec.md S1, S2, S8, S15, §3, §5 pitfall 8; docs/interfaces.md.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
    CHAT_ENDPOINT,
    MODELS_ENDPOINT,
    ACCOUNT_ENDPOINT,
    DATABASE_NAME,
    CASE_STORE,
    DATABASE_VERSION,
    SPEAKER_COUNT,
    JUDGE_COUNT,
    CALLS_PER_RUN,
    CONFIG_SINGLE,
    CONFIG_SPLIT,
    CONFIG_LABELS,
    DEFAULT_BUDGET_USD,
    MAX_BUDGET_USD,
    SPEECH_MAX_TOKENS,
    VERDICT_MAX_TOKENS,
    MINIMUM_REASONS,
    DEFAULT_VERDICT_SET,
    VERDICT_SETS,
    FALLBACK_MODELS,
    verdictsFor,
} from "../src/constants.js";
import { SPEAKERS, JUDGES } from "../src/tribunal/personas.js";
import { assignDistinctModels } from "../src/tribunal/modelChoice.js";
import { distinctModelCount } from "../src/tribunal/runCase.js";

import { JUSTIFICATION_CASE, GUILT_CASE, UNSET_CASE } from "./helpers.js";

// ---------------------------------------------------------------------------
// Criteria that are repository checks rather than unit tests, and are handled
// outside this suite:
//
//   S9  · "The API key does not appear in the client bundle" —
//         `grep -r "sk-or-" dist/` is empty. Needs a build, not a process.
//   S10 · "The key does not appear anywhere in git history" —
//         the pre-commit hook plus the one history rewrite. Needs git.
//
// The nearest things reachable from here — that no constant, no fallback model
// entry and no run result carries a key pattern, and that every endpoint is a
// same-origin /api/* path — are asserted below and in runCase.test.js.
// ---------------------------------------------------------------------------

describe("constants · the fixed numbers", () => {
    test("S1 · CALLS_PER_RUN is exactly 7", () => {
        assert.equal(CALLS_PER_RUN, 7);
    });

    test("S1 · seven calls is four speakers plus three judges", () => {
        assert.equal(SPEAKER_COUNT, 4);
        assert.equal(JUDGE_COUNT, 3);
        assert.equal(SPEAKER_COUNT + JUDGE_COUNT, CALLS_PER_RUN);
    });

    test("S2 · MINIMUM_REASONS is 2", () => {
        assert.equal(MINIMUM_REASONS, 2);
    });

    test("S8 · MAX_BUDGET_USD is 5", () => {
        assert.equal(MAX_BUDGET_USD, 5);
    });

    test("S8 · the default budget sits inside the cap", () => {
        assert.equal(typeof DEFAULT_BUDGET_USD, "number");
        assert.ok(DEFAULT_BUDGET_USD > 0, "a zero default budget would refuse every run");
        assert.ok(
            DEFAULT_BUDGET_USD <= MAX_BUDGET_USD,
            `DEFAULT_BUDGET_USD (${DEFAULT_BUDGET_USD}) exceeds MAX_BUDGET_USD (${MAX_BUDGET_USD})`,
        );
    });

    test("token allowances are positive whole numbers", () => {
        for (const [name, value] of [
            ["SPEECH_MAX_TOKENS", SPEECH_MAX_TOKENS],
            ["VERDICT_MAX_TOKENS", VERDICT_MAX_TOKENS],
        ]) {
            assert.equal(typeof value, "number", `${name} is not a number`);
            assert.ok(Number.isInteger(value), `${name} is not an integer`);
            assert.ok(value > 0, `${name} is not positive`);
        }
    });

    test("§5 pitfall 3 · the verdict allowance leaves room to reach the form", () => {
        // "Reasoning models exhaust the token allowance thinking and never
        // reach the form." A ruling is a verdict, a confidence, >=2 reasons, a
        // decisive point and a paragraph — a few hundred tokens at minimum.
        assert.ok(
            VERDICT_MAX_TOKENS >= 300,
            `VERDICT_MAX_TOKENS is ${VERDICT_MAX_TOKENS}; a full ruling cannot fit`,
        );
    });

    test("the database identifiers are usable", () => {
        assert.equal(typeof DATABASE_NAME, "string");
        assert.ok(DATABASE_NAME.length > 0);
        assert.equal(typeof CASE_STORE, "string");
        assert.ok(CASE_STORE.length > 0);
        assert.ok(Number.isInteger(DATABASE_VERSION) && DATABASE_VERSION >= 1);
    });
});

describe("constants · the two arrangements", () => {
    test("S15 · arrangement A and arrangement B are two distinct config values", () => {
        assert.equal(typeof CONFIG_SINGLE, "string");
        assert.equal(typeof CONFIG_SPLIT, "string");
        assert.notEqual(CONFIG_SINGLE, CONFIG_SPLIT);
    });

    test("both arrangements carry a label", () => {
        assert.equal(typeof CONFIG_LABELS.SINGLE, "string");
        assert.equal(typeof CONFIG_LABELS.SPLIT, "string");
        assert.ok(CONFIG_LABELS.SINGLE.length > 0);
        assert.ok(CONFIG_LABELS.SPLIT.length > 0);
        assert.notEqual(CONFIG_LABELS.SINGLE, CONFIG_LABELS.SPLIT);
    });
});

describe("constants · the endpoints", () => {
    // spec §3: "The browser holds no secret and enforces no rule that matters.
    // ... The key, the model catalogue filter, and the request ceiling live
    // behind /api/*."
    const endpoints = {
        CHAT_ENDPOINT,
        MODELS_ENDPOINT,
        ACCOUNT_ENDPOINT,
    };

    for (const [name, value] of Object.entries(endpoints)) {
        test(`§3 · ${name} is a same-origin /api/* path`, () => {
            assert.equal(typeof value, "string");
            assert.ok(
                value.startsWith("/api/"),
                `${name} is "${value}"; the spec puts every network route behind /api/*`,
            );
        });

        test(`S9 · ${name} names no upstream host and carries no key`, () => {
            assert.ok(
                !/openrouter\.ai|anthropic\.com|https?:\/\//i.test(value),
                `${name} addresses an upstream directly: "${value}"`,
            );
            assert.ok(!/sk-or-|sk-ant-/.test(value), `${name} contains a key pattern`);
        });
    }
});

describe("constants · the verdict vocabularies", () => {
    test("S2 · every verdict set has a positive and a negative word", () => {
        const keys = Object.keys(VERDICT_SETS);
        assert.ok(keys.length >= 1);
        for (const key of keys) {
            const set = VERDICT_SETS[key];
            assert.equal(typeof set.positive, "string", `${key}.positive`);
            assert.equal(typeof set.negative, "string", `${key}.negative`);
            assert.ok(set.positive.length > 0);
            assert.ok(set.negative.length > 0);
            assert.notEqual(set.positive, set.negative);
        }
    });

    test("§5 pitfall 2 · the negative word contains the positive word, so ordering matters", () => {
        // Not a defect — it is the reason the parser must match the negative
        // first. Recorded here so the property is not silently lost.
        for (const [key, set] of Object.entries(VERDICT_SETS)) {
            assert.ok(
                set.negative.includes(set.positive),
                `${key}: negative "${set.negative}" no longer contains positive "${set.positive}"; ` +
                    "if this changed deliberately, pitfall 2's parser ordering must be re-checked",
            );
        }
    });

    test("DEFAULT_VERDICT_SET names a real set", () => {
        assert.equal(typeof DEFAULT_VERDICT_SET, "string");
        assert.ok(
            Object.prototype.hasOwnProperty.call(VERDICT_SETS, DEFAULT_VERDICT_SET),
            `DEFAULT_VERDICT_SET is "${DEFAULT_VERDICT_SET}", which is not a key of VERDICT_SETS`,
        );
    });

    test("S2 · verdictsFor returns the sheet's own vocabulary", () => {
        assert.deepEqual(verdictsFor(JUSTIFICATION_CASE), VERDICT_SETS.JUSTIFICATION);
        assert.deepEqual(verdictsFor(GUILT_CASE), VERDICT_SETS.GUILT);
    });

    test("S2 · an absent verdictSet means DEFAULT_VERDICT_SET", () => {
        assert.deepEqual(verdictsFor(UNSET_CASE), VERDICT_SETS[DEFAULT_VERDICT_SET]);
    });

    test("verdictsFor falls back to the default rather than returning nothing", () => {
        // The parser must always have a vocabulary to check against; a missing
        // one would make S2 unenforceable for that case.
        const set = verdictsFor({ ...UNSET_CASE, verdictSet: "NO_SUCH_SET" });
        assert.deepEqual(set, VERDICT_SETS[DEFAULT_VERDICT_SET]);
    });

    test("verdictsFor tolerates a missing charge sheet without throwing", () => {
        const set = verdictsFor(undefined);
        assert.equal(typeof set.positive, "string");
        assert.equal(typeof set.negative, "string");
    });
});

describe("constants · FALLBACK_MODELS", () => {
    test("there is at least one fallback model and each has the documented shape", () => {
        assert.ok(Array.isArray(FALLBACK_MODELS));
        assert.ok(FALLBACK_MODELS.length > 0, "no fallback models: the app cannot run offline of the catalogue");
        for (const m of FALLBACK_MODELS) {
            assert.equal(typeof m.id, "string", "model.id");
            assert.ok(m.id.length > 0);
            assert.equal(typeof m.name, "string", `${m.id}.name`);
            assert.equal(typeof m.contextLength, "number", `${m.id}.contextLength`);
            assert.ok(m.contextLength > 0, `${m.id}.contextLength`);
            assert.equal(typeof m.promptPrice, "number", `${m.id}.promptPrice`);
            assert.equal(typeof m.completionPrice, "number", `${m.id}.completionPrice`);
            assert.ok(m.promptPrice >= 0 && m.completionPrice >= 0);
        }
    });

    test("§1 · there are at least enough fallback models for three different judges", () => {
        // "one model for all three judges ... destroys the product."
        assert.ok(
            FALLBACK_MODELS.length >= JUDGE_COUNT,
            `only ${FALLBACK_MODELS.length} fallback models; three judges cannot then differ`,
        );
    });

    test("S15 · a fallback-seated arrangement B reports its real number of models", () => {
        /*
         * Adjudicated. The suite originally required FALLBACK_MODELS to hold
         * seven entries, inferring that from S15's "a model per seat, seven
         * independently". The specification does not say it, and padding the
         * list would mean naming four more models nobody has confirmed will
         * answer - inventing exactly the kind of plausible detail this project
         * forbids.
         *
         * The list is a lifeboat for when the catalogue cannot be reached, not
         * a promise of seven. What must hold is that the shortfall is declared:
         * a run seated from it reports the number of distinct models it really
         * used, so nobody reads a four-model panel as a seven-model one.
         */
        const seats = [...SPEAKERS, ...JUDGES].map((a) => a.id);
        const seated = assignDistinctModels(FALLBACK_MODELS, seats);
        const reported = distinctModelCount(seated);
        const actual = new Set(Object.values(seated).map((m) => m.id)).size;

        assert.equal(reported, actual, "the reported model count is not the real one");
        assert.ok(reported <= FALLBACK_MODELS.length);
        assert.ok(
            reported >= JUDGE_COUNT,
            `only ${reported} distinct models; the three judges cannot then differ`,
        );
    });

    test("§5 pitfall 8 · no fallback model is a Router model", () => {
        const routers = FALLBACK_MODELS.filter((m) => m.isRouter === true);
        assert.deepEqual(
            routers.map((m) => m.id),
            [],
            "Router models pick a different model per call, which defeats arrangement B",
        );
    });

    test("fallback model ids are unique", () => {
        const ids = FALLBACK_MODELS.map((m) => m.id);
        assert.equal(new Set(ids).size, ids.length, "duplicate ids in FALLBACK_MODELS");
    });

    test("S9 · no fallback model entry smuggles a key", () => {
        assert.ok(!/sk-or-|sk-ant-/.test(JSON.stringify(FALLBACK_MODELS)));
    });
});
