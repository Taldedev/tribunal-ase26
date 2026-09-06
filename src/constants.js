/*
 * constants.js - values shared across the application.
 */

// Where the browser reaches the two serverless functions. The key lives behind
// these, never in this bundle.
export const CHAT_ENDPOINT = "/api/openrouter";
export const MODELS_ENDPOINT = "/api/models";
export const ACCOUNT_ENDPOINT = "/api/account";

// The IndexedDB store that keeps past cases, so a case can be found again.
export const DATABASE_NAME = "tribunaldb";
export const DATABASE_VERSION = 1;
export const CASE_STORE = "cases";

// One deliberation is always these seven calls: four speeches, then three
// rulings. Nothing in the application may quietly make it more.
export const SPEAKER_COUNT = 4;
export const JUDGE_COUNT = 3;
export const CALLS_PER_RUN = SPEAKER_COUNT + JUDGE_COUNT;

/*
 * The two arrangements the project is asked to compare.
 *
 *   SINGLE - one model does all seven calls, and the seven personalities come
 *            entirely from the system prompts.
 *   SPLIT  - every agent runs on its own model, chosen per seat. Pointing all
 *            four representatives at one model and all three judges at another
 *            is a special case of this rather than a separate arrangement.
 */
export const CONFIG_SINGLE = "SINGLE";
export const CONFIG_SPLIT = "SPLIT";

export const CONFIG_LABELS = {
    SINGLE: "A · One model for all seven",
    SPLIT: "B · A separate model for each of the seven"
};

/*
 * The budget for one complete run. The brief sets a ceiling of five dollars
 * and asks for free models wherever possible, so the default cap sits far
 * below the ceiling and the ceiling itself cannot be exceeded.
 */
export const DEFAULT_BUDGET_USD = 0.25;
export const MAX_BUDGET_USD = 5;

// How many completion tokens each kind of call may produce.
export const SPEECH_MAX_TOKENS = 1200;
/*
 * Judges get a larger allowance than speakers because several free models
 * reason at length before they answer, and an answer cut off mid-thought is a
 * lost call rather than a short one.
 */
export const VERDICT_MAX_TOKENS = 1600;

/*
 * The two answers a judge is allowed to return. Anything else is a malformed
 * answer, and a malformed answer is a failure, never a verdict.
 *
 * Which pair applies belongs to the case rather than to the program. A charge
 * of unlawful disclosure asks whether the accused is guilty; the Tribunal's
 * canonical case asks whether a killing was justified, and answering that one
 * with "guilty" would be answering a different question from the one put.
 */
export const VERDICT_SETS = {
    GUILT: {
        positive: "GUILTY",
        negative: "NOT GUILTY"
    },
    JUSTIFICATION: {
        positive: "JUSTIFIED",
        negative: "NOT JUSTIFIED"
    }
};

/*
 * What a charge sheet answers in when it does not say.
 *
 * This is the Tribunal, and the Tribunal decides whether an act was justified.
 * The guilt vocabulary is kept because the machinery below it is what stopped
 * the court answering in words its own question never used, and a charge sheet
 * that genuinely asks about guilt only needs the one field - but it is not
 * offered as a choice on screen, because on this case there is only one right
 * setting and a control with one right setting is a way to get it wrong.
 */
export const DEFAULT_VERDICT_SET = "JUSTIFICATION";

// Resolves a charge sheet to the pair its question is actually asking for.
export function verdictsFor(chargeSheet) {
    const key = (chargeSheet && chargeSheet.verdictSet) || DEFAULT_VERDICT_SET;
    return VERDICT_SETS[key] || VERDICT_SETS[DEFAULT_VERDICT_SET];
}

// A judge must give a verdict and at least this many reasons for it. Fewer
// reasons is not a weaker verdict; it is a malformed answer.
export const MINIMUM_REASONS = 2;

/*
 * Models used when the live catalogue cannot be reached.
 *
 * These are free tiers, so a fallback run still costs nothing, and they were
 * each confirmed to answer rather than chosen from a list. Free models on
 * OpenRouter come and go, so treat this as a lifeboat and not a
 * recommendation - the pickers should normally be showing the live catalogue.
 */
export const FALLBACK_MODELS = [
    {
        id: "minimax/minimax-m3:free",
        name: "MiniMax M3 (free)",
        contextLength: 1048576,
        promptPrice: 0,
        completionPrice: 0,
        isFree: true
    },
    {
        id: "nvidia/nemotron-3-super-120b-a12b:free",
        name: "Nemotron 3 Super 120B (free)",
        contextLength: 262144,
        promptPrice: 0,
        completionPrice: 0,
        isFree: true
    },
    {
        id: "nvidia/nemotron-3.5-lightning:free",
        name: "Nemotron 3.5 Lightning (free)",
        contextLength: 1000000,
        promptPrice: 0,
        completionPrice: 0,
        isFree: true
    },
    {
        id: "poolside/laguna-s-2.1:free",
        name: "Laguna S 2.1 (free)",
        contextLength: 262144,
        promptPrice: 0,
        completionPrice: 0,
        isFree: true
    }
];
