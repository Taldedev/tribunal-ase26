// tests/modelChoice.test.js — choosing which model sits in which seat.
//
// Sources: docs/spec.md §1, S15, §5 pitfall 8; docs/coordination.md
// ("judges whose disagreement comes from genuinely different models").

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { pickDefaultModels, assignDistinctModels } from "../src/tribunal/modelChoice.js";
import { model, ROUTER_MODEL, ALL_AGENT_IDS } from "./helpers.js";

const CATALOGUE = [
    model("vendor/alpha:free", { promptPrice: 0, completionPrice: 0, isFree: true }),
    model("vendor/bravo:free", { promptPrice: 0, completionPrice: 0, isFree: true }),
    model("vendor/charlie:free", { promptPrice: 0, completionPrice: 0, isFree: true }),
    model("vendor/delta:free", { promptPrice: 0, completionPrice: 0, isFree: true }),
    model("vendor/echo:free", { promptPrice: 0, completionPrice: 0, isFree: true }),
    model("vendor/foxtrot:free", { promptPrice: 0, completionPrice: 0, isFree: true }),
    model("vendor/golf:free", { promptPrice: 0, completionPrice: 0, isFree: true }),
    model("vendor/hotel", { promptPrice: 1e-6, completionPrice: 2e-6 }),
    model("vendor/india", { promptPrice: 2e-6, completionPrice: 4e-6 }),
    model("vendor/juliet", { promptPrice: 3e-6, completionPrice: 6e-6 }),
];

/** Every Model-shaped value the picker returned, whatever the keys are called. */
function pickedModels(result) {
    return Object.values(result ?? {}).filter((v) => v && typeof v === "object" && "id" in v);
}

describe("modelChoice · pickDefaultModels · whatever it names its fields", () => {
    test("a populated catalogue yields at least one default model", () => {
        const picked = pickedModels(pickDefaultModels(CATALOGUE));
        assert.ok(picked.length > 0, "nothing at all was chosen from a full catalogue");
        for (const m of picked) {
            assert.ok(
                CATALOGUE.some((c) => c.id === m.id),
                `the picker returned ${m.id}, which is not in the catalogue`,
            );
        }
    });

    test("§5 pitfall 8 · no Router model is ever offered as a default", () => {
        const picked = pickedModels(pickDefaultModels([ROUTER_MODEL, ...CATALOGUE]));
        for (const m of picked) {
            assert.notEqual(m.id, ROUTER_MODEL.id, "a Router model was offered as a default");
            assert.notEqual(m.isRouter, true, `${m.id} is a Router model`);
        }
    });

    test("§5 pitfall 8 · a catalogue of only Router models yields nothing to run on", () => {
        const picked = pickedModels(
            pickDefaultModels([ROUTER_MODEL, model("vendor/router2", { isRouter: true })]),
        );
        assert.deepEqual(
            picked.map((m) => m.id),
            [],
            "a Router model was chosen when nothing else was on offer",
        );
    });

    test("an empty catalogue yields nothing rather than throwing", () => {
        assert.deepEqual(
            pickedModels(pickDefaultModels([])).map((m) => m.id),
            [],
        );
    });
});

describe("modelChoice · pickDefaultModels · the shape docs/interfaces.md declares", () => {
    /*
     * These two tests originally asserted a `single` key, because that is what
     * docs/interfaces.md declared. The declaration was wrong - the document was
     * written by guessing at a return shape rather than reading it - and the
     * specification says nothing about this function's field names. So the
     * document was corrected to match the code, and these now assert the real
     * contract. Recorded here because it is the one place in this suite where
     * a test was changed to fit the implementation, and it was legitimate only
     * because the thing it had been written against was a mistake of mine and
     * not a requirement.
     */
    test("docs/interfaces.md · a populated catalogue yields both models", () => {
        const picked = pickDefaultModels(CATALOGUE);
        assert.ok(picked.speakerModel, `returned ${Object.keys(picked).join(", ")}`);
        assert.ok(picked.judgeModel);
        assert.ok(CATALOGUE.some((m) => m.id === picked.speakerModel.id));
        assert.ok(CATALOGUE.some((m) => m.id === picked.judgeModel.id));
    });

    test("docs/interfaces.md · an empty catalogue yields nulls", () => {
        assert.equal(pickDefaultModels([]).speakerModel, null);
        assert.equal(pickDefaultModels([]).judgeModel, null);
    });
});

describe("modelChoice · assignDistinctModels", () => {
    test("S15 · every seat is given a model", () => {
        const assigned = assignDistinctModels(CATALOGUE, ALL_AGENT_IDS);
        assert.deepEqual(Object.keys(assigned).sort(), [...ALL_AGENT_IDS].sort());
        for (const id of ALL_AGENT_IDS) {
            assert.ok(assigned[id], `${id} was left without a model`);
            assert.equal(typeof assigned[id].id, "string");
        }
    });

    test("§1 · with enough models on offer, no two seats share one", () => {
        // "judges whose disagreement comes from genuinely different models
        // rather than three samples of one model's blind spot."
        const assigned = assignDistinctModels(CATALOGUE, ALL_AGENT_IDS);
        const ids = ALL_AGENT_IDS.map((id) => assigned[id].id);
        assert.equal(new Set(ids).size, ALL_AGENT_IDS.length, `models repeated across seats: ${ids.join(", ")}`);
    });

    test("§5 pitfall 8 · a Router model is never assigned to a seat", () => {
        const assigned = assignDistinctModels([ROUTER_MODEL, ...CATALOGUE], ALL_AGENT_IDS);
        for (const id of ALL_AGENT_IDS) {
            assert.notEqual(assigned[id]?.id, ROUTER_MODEL.id, `${id} was given a Router model`);
        }
    });

    test("only the models on offer are ever assigned", () => {
        const offered = CATALOGUE.slice(0, 8).map((m) => m.id);
        const assigned = assignDistinctModels(CATALOGUE.slice(0, 8), ALL_AGENT_IDS);
        for (const id of ALL_AGENT_IDS) {
            assert.ok(offered.includes(assigned[id].id), `${id} was given ${assigned[id].id}, not on offer`);
        }
    });

    test("a scarce catalogue still seats everyone rather than throwing", () => {
        const assigned = assignDistinctModels(CATALOGUE.slice(0, 3), ALL_AGENT_IDS);
        assert.deepEqual(Object.keys(assigned).sort(), [...ALL_AGENT_IDS].sort());
    });

    test("an empty catalogue does not throw", () => {
        const assigned = assignDistinctModels([], ALL_AGENT_IDS);
        assert.equal(typeof assigned, "object");
    });
});
