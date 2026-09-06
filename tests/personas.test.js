// tests/personas.test.js — the cast and the prompts.
//
// Sources: docs/spec.md §1, S2, S4, §5 pitfalls 4 and 14;
// docs/coordination.md ("The agents", "The seat does not fix the position");
// docs/problem.md §2 (the named judges) and §4 (no claim about real law).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
    SPEAKERS,
    JUDGES,
    buildVerdictForm,
    speakerSystemPrompt,
    judgeSystemPrompt,
    findSpeaker,
    findJudge,
} from "../src/tribunal/personas.js";

import {
    SPEAKER_COUNT,
    JUDGE_COUNT,
    MINIMUM_REASONS,
    VERDICT_SETS,
    verdictsFor,
} from "../src/constants.js";

import { JUSTIFICATION_CASE, GUILT_CASE, countOccurrences } from "./helpers.js";

const ALL_AGENTS = [...SPEAKERS, ...JUDGES];

describe("personas · the cast", () => {
    test("S1 · there are four representatives and three judges", () => {
        assert.equal(SPEAKERS.length, SPEAKER_COUNT);
        assert.equal(JUDGES.length, JUDGE_COUNT);
    });

    test("coordination.md · the four representatives are the four named in the design", () => {
        assert.deepEqual(
            SPEAKERS.map((s) => s.name).sort(),
            ["Daenerys Targaryen", "Grey Worm", "Jon Snow", "Tyrion Lannister"],
        );
    });

    test("coordination.md · the three judges are the three named in the design", () => {
        assert.deepEqual(
            JUDGES.map((j) => j.name).sort(),
            ["Aharon Barak", "Meir Shamgar", "Menachem Elon"],
        );
    });

    test("coordination.md · two prosecution seats and two defence seats", () => {
        const roles = SPEAKERS.map((s) => s.role);
        assert.equal(roles.filter((r) => r === "Prosecution").length, 2, `roles were ${roles.join(", ")}`);
        assert.equal(roles.filter((r) => r === "Defence").length, 2, `roles were ${roles.join(", ")}`);
    });

    test("coordination.md · side follows role, PRO for prosecution and CON for defence", () => {
        for (const s of SPEAKERS) {
            assert.equal(
                s.side,
                s.role === "Prosecution" ? "PRO" : "CON",
                `${s.name} sits in the ${s.role} seat but is side ${s.side}`,
            );
        }
    });

    test("coordination.md · Daenerys and Grey Worm prosecute, Jon and Tyrion defend", () => {
        const roleOf = (name) => SPEAKERS.find((s) => s.name === name)?.role;
        assert.equal(roleOf("Daenerys Targaryen"), "Prosecution");
        assert.equal(roleOf("Grey Worm"), "Prosecution");
        assert.equal(roleOf("Jon Snow"), "Defence");
        assert.equal(roleOf("Tyrion Lannister"), "Defence");
    });

    test("S15 · every seat has a distinct id, so a model can be assigned per seat", () => {
        const ids = ALL_AGENTS.map((a) => a.id);
        assert.equal(ids.length, 7);
        assert.equal(new Set(ids).size, 7, `duplicate agent ids: ${ids.join(", ")}`);
        for (const id of ids) {
            assert.equal(typeof id, "string");
            assert.ok(id.length > 0);
        }
    });

    test("every agent carries the fields the interface declares", () => {
        for (const s of SPEAKERS) {
            for (const field of ["id", "name", "role", "side", "title", "blurb", "character"]) {
                assert.equal(typeof s[field], "string", `speaker ${s.id} is missing ${field}`);
                assert.ok(s[field].length > 0, `speaker ${s.id}.${field} is empty`);
            }
        }
        for (const j of JUDGES) {
            for (const field of ["id", "name", "title", "blurb", "character"]) {
                assert.equal(typeof j[field], "string", `judge ${j.id} is missing ${field}`);
                assert.ok(j[field].length > 0, `judge ${j.id}.${field} is empty`);
            }
        }
    });

    test("findSpeaker and findJudge resolve their own cast", () => {
        for (const s of SPEAKERS) assert.equal(findSpeaker(s.id), s);
        for (const j of JUDGES) assert.equal(findJudge(j.id), j);
    });

    test("findSpeaker and findJudge never return the other cast", () => {
        for (const j of JUDGES) assert.ok(!findSpeaker(j.id), `findSpeaker returned judge ${j.id}`);
        for (const s of SPEAKERS) assert.ok(!findJudge(s.id), `findJudge returned speaker ${s.id}`);
    });

    test("an unknown id resolves to a blank, never to the wrong agent", () => {
        // docs/interfaces.md said `undefined` and the code returns `null`; the
        // document was mine and wrong, and was corrected. What matters, and is
        // what this asserts, is that an unknown id never resolves to a real
        // member of the cast.
        assert.equal(findSpeaker("no-such-agent"), null);
        assert.equal(findJudge("no-such-agent"), null);
    });
});

describe("personas · buildVerdictForm", () => {
    const form = buildVerdictForm(VERDICT_SETS.JUSTIFICATION);

    test("S2 · the form names both verdict words of the case", () => {
        assert.ok(form.includes("JUSTIFIED"), form);
        assert.ok(form.includes("NOT JUSTIFIED"), form);
    });

    test("S2 · the form demands at least MINIMUM_REASONS reasons", () => {
        assert.ok(
            /reason/i.test(form),
            "the form does not ask for reasons at all",
        );
        assert.ok(
            new RegExp(`(at least\\s+${MINIMUM_REASONS}|${MINIMUM_REASONS}\\s+reasons|two reasons)`, "i").test(form),
            `the form never states the minimum of ${MINIMUM_REASONS} reasons:\n${form}`,
        );
    });

    test("coordination.md · the form asks for verdict, reasons, decisive point and reasoning", () => {
        for (const part of ["VERDICT", "REASON", "DECISIVE", "REASONING"]) {
            assert.ok(form.includes(part), `the form omits ${part}:\n${form}`);
        }
    });

    test("S2 · the form is built from the case's own vocabulary, not a fixed one", () => {
        const guilt = buildVerdictForm(VERDICT_SETS.GUILT);
        assert.ok(guilt.includes("GUILTY"), guilt);
        assert.ok(guilt.includes("NOT GUILTY"), guilt);
        assert.ok(!guilt.includes("JUSTIFIED"), `the GUILT form leaked the JUSTIFICATION vocabulary:\n${guilt}`);
    });
});

describe("personas · speaker prompts", () => {
    test("coordination.md · a speech is capped at five paragraphs", () => {
        for (const s of SPEAKERS) {
            const prompt = speakerSystemPrompt(s, JUSTIFICATION_CASE);
            assert.ok(
                /\b(five|5)\b[^.\n]{0,24}paragraph/i.test(prompt),
                `${s.name}'s prompt states no paragraph limit`,
            );
        }
    });

    test("§1 · a representative is never asked for a verdict", () => {
        // "never show an agent another agent's conclusion" — and a speaker has
        // no conclusion to give. Only judges rule.
        const { positive, negative } = verdictsFor(JUSTIFICATION_CASE);
        for (const s of SPEAKERS) {
            const prompt = speakerSystemPrompt(s, JUSTIFICATION_CASE);
            assert.ok(
                !/^\s*VERDICT:/m.test(prompt),
                `${s.name}'s prompt contains a VERDICT line; representatives do not rule`,
            );
            assert.ok(
                !prompt.includes(`${positive} or ${negative}`),
                `${s.name}'s prompt hands a representative the judges' verdict form`,
            );
        }
    });

    test("coordination.md · every representative differs from every other by system prompt", () => {
        const prompts = SPEAKERS.map((s) => speakerSystemPrompt(s, JUSTIFICATION_CASE));
        assert.equal(
            new Set(prompts).size,
            SPEAKERS.length,
            "two representatives share a system prompt; the arrangement then buys nothing",
        );
    });

    test("coordination.md · the seat does not fix the position", () => {
        // "A representative called from a prosecution seat argues where the
        // record takes them ... the single most consequential line in the
        // prompts."
        const permission =
            /(where the record takes|even if (it|that|this) (does not|doesn't|fails)|against the (side|seat)|not (obliged|required|bound) to|need not (argue|support|reach)|do not (argue|advocate) (for|a) (position|conclusion)|follow the record|the record takes you|regardless of (the|which) seat)/i;
        for (const s of SPEAKERS) {
            const prompt = speakerSystemPrompt(s, JUSTIFICATION_CASE);
            assert.ok(
                permission.test(prompt),
                `${s.name}'s prompt does not release them from their seat's position:\n${prompt}`,
            );
        }
    });

    test("the representative's own character reaches their prompt", () => {
        for (const s of SPEAKERS) {
            const prompt = speakerSystemPrompt(s, JUSTIFICATION_CASE);
            assert.ok(prompt.includes(s.character), `${s.name}'s character is not in their prompt`);
        }
    });
});

describe("personas · judge prompts", () => {
    test("coordination.md · every judge differs from every other by system prompt", () => {
        const prompts = JUDGES.map((j) => judgeSystemPrompt(j, JUSTIFICATION_CASE));
        assert.equal(
            new Set(prompts).size,
            JUDGES.length,
            "two judges share a system prompt; §1 calls three samples of one voice the failure mode",
        );
    });

    test("S4 · a judge's prompt never names another judge", () => {
        for (const judge of JUDGES) {
            const prompt = judgeSystemPrompt(judge, JUSTIFICATION_CASE);
            for (const other of JUDGES) {
                if (other.id === judge.id) continue;
                assert.ok(
                    !prompt.includes(other.name),
                    `${judge.name}'s prompt names ${other.name}`,
                );
                assert.ok(
                    !prompt.includes(other.character),
                    `${judge.name}'s prompt carries ${other.name}'s character`,
                );
            }
        }
    });

    test("§1 · a judge is never asked to agree, average, or reach a majority", () => {
        // "Any change that makes the panel more likely to agree ... destroys
        // the product while appearing to improve it."
        // Instructions toward agreement only. A judge's stated philosophy may
        // legitimately discuss majority rule as a subject; being told to join
        // a majority is the thing §1 forbids.
        const forbidden =
            /(reach (a )?consensus|find (a )?consensus|majority (verdict|ruling|of the (judges|panel|bench))|join the majority|agree with the other (judge|two)|align (with|your) (the )?other|average (of )?(the )?(verdict|confidence)|combined verdict|joint (ruling|verdict)|deliver a single (verdict|ruling))/i;
        for (const judge of JUDGES) {
            const prompt = judgeSystemPrompt(judge, JUSTIFICATION_CASE);
            const hit = prompt.match(forbidden);
            assert.equal(hit, null, `${judge.name}'s prompt pushes the panel toward agreement: "${hit?.[0]}"`);
        }
    });

    test("S2 · the judge is given the case's own vocabulary", () => {
        for (const judge of JUDGES) {
            const justification = judgeSystemPrompt(judge, JUSTIFICATION_CASE);
            assert.ok(justification.includes("NOT JUSTIFIED"), `${judge.name}: JUSTIFICATION vocabulary missing`);

            const guilt = judgeSystemPrompt(judge, GUILT_CASE);
            assert.ok(guilt.includes("NOT GUILTY"), `${judge.name}: GUILT vocabulary missing`);
            assert.ok(
                !guilt.includes("JUSTIFIED"),
                `${judge.name}: a GUILT case's prompt offers the JUSTIFICATION vocabulary as well`,
            );
        }
    });

    test("the judge's own character reaches their prompt", () => {
        for (const judge of JUDGES) {
            const prompt = judgeSystemPrompt(judge, JUSTIFICATION_CASE);
            assert.ok(prompt.includes(judge.character), `${judge.name}'s character is not in their prompt`);
        }
    });

    test("§5 pitfall 4 · the required form is stated at least twice", () => {
        // "A judge may return prose. State the required form twice — before
        // the character description and after it."
        for (const judge of JUDGES) {
            const prompt = judgeSystemPrompt(judge, JUSTIFICATION_CASE);
            const times = countOccurrences(prompt, "VERDICT");
            assert.ok(
                times >= 2,
                `${judge.name}'s prompt states the required form ${times} time(s), not twice`,
            );
        }
    });

    test("§5 pitfall 4 · the form is stated before the character description and again after it", () => {
        for (const judge of JUDGES) {
            const prompt = judgeSystemPrompt(judge, JUSTIFICATION_CASE);
            const characterAt = prompt.indexOf(judge.character);
            assert.notEqual(characterAt, -1, `${judge.name}'s character is not in their prompt at all`);
            const first = prompt.indexOf("VERDICT");
            const last = prompt.lastIndexOf("VERDICT");
            assert.ok(
                first !== -1 && first < characterAt,
                `${judge.name}: the required form is not stated before the character description`,
            );
            assert.ok(
                last > characterAt + judge.character.length - 1,
                `${judge.name}: the required form is not restated after the character description`,
            );
        }
    });

    test("problem.md §2 · the prompt says it adapts a published method rather than impersonating the judge", () => {
        // "Not to be impersonated or to have decisions predicted for them. Two
        // of the three are real public figures. The prompts adapt a published
        // method and say so, in the prompt itself."
        const disclosure = /(adapt|adapted|adaptation|published (method|approach)|method (of|associated)|not (a )?(prediction|impersonation)|do not (predict|impersonate)|fictional|simulat)/i;
        for (const judge of JUDGES) {
            const prompt = judgeSystemPrompt(judge, JUSTIFICATION_CASE);
            assert.ok(
                disclosure.test(prompt),
                `${judge.name}'s prompt does not say it adapts a method rather than being the person:\n${prompt}`,
            );
        }
    });
});

describe("personas · prompt injection wording", () => {
    // §5 pitfall 14: "Telling an agent to report prompt-injection attempts
    // causes it to invent one. Require quotable words. Telling it to confirm
    // the absence causes it to announce that instead. Require silence."
    const prompts = [
        ...SPEAKERS.map((s) => [s.name, speakerSystemPrompt(s, JUSTIFICATION_CASE)]),
        ...JUDGES.map((j) => [j.name, judgeSystemPrompt(j, JUSTIFICATION_CASE)]),
    ];

    test("§5 pitfall 14 · no prompt asks an agent to confirm that nothing was found", () => {
        // Only an instruction to affirmatively announce that nothing happened.
        // "Say nothing about it" is the required silence, not a violation.
        const confirmAbsence =
            /(confirm|state|report|note|declare|say so)\b[^.\n]{0,50}\b(that (there )?(were|was|are|is) (no|none)|the absence of|nothing was found|no attempt (was|were)|none (was|were) found|clean|all clear)\b/i;
        for (const [name, prompt] of prompts) {
            const hit = prompt.match(confirmAbsence);
            assert.equal(
                hit,
                null,
                `${name}'s prompt asks for a confirmation of absence: "${hit?.[0]}" — pitfall 14 says it will announce it`,
            );
        }
    });

    test("§5 pitfall 14 · where injection is mentioned at all, quotable words are required", () => {
        for (const [name, prompt] of prompts) {
            if (!/inject|manipulat|instruction[s]? (hidden|embedded)/i.test(prompt)) continue;
            assert.ok(
                /quot/i.test(prompt),
                `${name}'s prompt raises prompt injection without requiring quotable words`,
            );
        }
    });

    test("§5 pitfall 14 · where injection is mentioned at all, silence is required otherwise", () => {
        for (const [name, prompt] of prompts) {
            if (!/inject|manipulat|instruction[s]? (hidden|embedded)/i.test(prompt)) continue;
            assert.ok(
                /(silen|say nothing|do not mention|no( |-)comment|otherwise (say|write) nothing|without comment)/i.test(prompt),
                `${name}'s prompt raises prompt injection without requiring silence when there is nothing to quote`,
            );
        }
    });
});
