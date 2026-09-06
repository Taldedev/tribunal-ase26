// tests/cases.test.js — the charge sheets that ship with the app.
//
// Sources: docs/spec.md §5 pitfalls 5 and 13; docs/problem.md §3.1 and §4.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { EXAMPLE_CASES } from "../src/tribunal/cases.js";
import { VERDICT_SETS, verdictsFor } from "../src/constants.js";
import { renderChargeSheet } from "../src/tribunal/protocol.js";

describe("cases · the shipped charge sheets", () => {
    test("there is at least one example case", () => {
        assert.ok(Array.isArray(EXAMPLE_CASES));
        assert.ok(EXAMPLE_CASES.length > 0, "the app ships with no example cases");
    });

    test("problem.md §3.1 · every case names a defendant, an act and an exact question", () => {
        for (const c of EXAMPLE_CASES) {
            for (const field of ["defendant", "act", "question"]) {
                assert.equal(typeof c[field], "string", `${c.label ?? "?"}: ${field} is not a string`);
                assert.ok(c[field].trim().length > 0, `${c.label ?? "?"}: ${field} is empty`);
            }
        }
    });

    test("§5 pitfall 5 · every case actually asks something", () => {
        // "A charge sheet may lack its question, in which case nothing is being
        // asked and the run should not start."
        for (const c of EXAMPLE_CASES) {
            assert.ok(
                c.question.trim().endsWith("?"),
                `${c.label ?? c.defendant}: "${c.question}" is not a question`,
            );
        }
    });

    test("every case names a verdict set that exists, or none at all", () => {
        for (const c of EXAMPLE_CASES) {
            if (c.verdictSet === undefined) continue;
            assert.ok(
                Object.prototype.hasOwnProperty.call(VERDICT_SETS, c.verdictSet),
                `${c.label ?? c.defendant}: verdictSet "${c.verdictSet}" is not a known set`,
            );
        }
    });

    test("labels are distinct so two cases cannot be confused", () => {
        const labels = EXAMPLE_CASES.map((c) => c.label).filter(Boolean);
        assert.equal(new Set(labels).size, labels.length, `duplicate labels: ${labels.join(" / ")}`);
    });

    test("§5 pitfall 13 · no case pre-decides itself with a conclusory adverb", () => {
        // "An earlier example sheet asserted that the statute 'plainly
        // prohibits what she did', and all three judges quoted it back. The
        // agreed factual record must contain facts, not conclusions."
        const conclusory =
            /\b(plainly|clearly|obviously|undoubtedly|manifestly|indisputably|self-evidently|unquestionably|beyond (any )?doubt|without question)\b/i;
        for (const c of EXAMPLE_CASES) {
            for (const field of ["defendant", "act", "question"]) {
                const hit = c[field].match(conclusory);
                assert.equal(
                    hit,
                    null,
                    `${c.label ?? c.defendant}: ${field} asserts a conclusion — "${hit?.[0]}" in "${c[field]}"`,
                );
            }
        }
    });

    test("§5 pitfall 13 · no case states its own answer in the factual record", () => {
        // The verdict words belong in the question, never in the record of
        // what happened.
        for (const c of EXAMPLE_CASES) {
            const { positive, negative } = verdictsFor(c);
            for (const word of [positive, negative]) {
                assert.ok(
                    !new RegExp(`\\b${word.replace(/\s+/g, "\\s+")}\\b`, "i").test(c.act),
                    `${c.label ?? c.defendant}: the act already declares the verdict "${word}"`,
                );
            }
        }
    });

    test("§5 pitfall 13 · no case asserts what a law or rule requires as settled", () => {
        const legalConclusion =
            /\b(prohibits|forbids|is illegal|was illegal|is unlawful|was unlawful|is a crime|constitutes an offence|constitutes an offense|breached the law|broke the law)\b/i;
        for (const c of EXAMPLE_CASES) {
            const hit = c.act.match(legalConclusion);
            assert.equal(
                hit,
                null,
                `${c.label ?? c.defendant}: the act states a legal conclusion — "${hit?.[0]}"`,
            );
        }
    });

    test("problem.md §4 · no case claims a real jurisdiction, statute or precedent", () => {
        // "Any claim about real law ... No jurisdiction, no statute, no
        // precedent, no prediction of what a real court would hold."
        const realLaw =
            /\b(U\.?S\.?C\.?|USC \d|§ ?\d|Article \d+ of the (Constitution|Treaty)|Supreme Court of|v\.\s+[A-Z]\w+\s+\(\d{4}\)|18 U\.S\.C)\b/;
        for (const c of EXAMPLE_CASES) {
            const text = `${c.defendant} ${c.act} ${c.question}`;
            const hit = text.match(realLaw);
            assert.equal(hit, null, `${c.label ?? c.defendant}: cites real law — "${hit?.[0]}"`);
        }
    });

    test("every shipped case renders without losing a part", () => {
        for (const c of EXAMPLE_CASES) {
            const rendered = renderChargeSheet(c);
            assert.ok(rendered.includes(c.defendant), `${c.label ?? c.defendant}: defendant lost in render`);
            assert.ok(rendered.includes(c.question), `${c.label ?? c.defendant}: question lost in render`);
        }
    });
});
