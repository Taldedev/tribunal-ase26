/*
 * modelChoice.js - which models the pickers should open on.
 *
 * The free tier is sorted alphabetically once price stops separating anything,
 * and alphabetical order puts a code-completion model and a note-taking
 * preview at the top. Neither writes a closing speech or a reasoned ruling, so
 * the panel would open on two poor choices and the first run would look like a
 * fault in the application.
 *
 * So free models are scored instead. The scoring is a heuristic over names and
 * nothing more: OpenRouter does not publish what a model is good at, and a
 * heuristic that is roughly right beats an alphabet that is reliably wrong.
 */

// Names that mark a model built for something other than open-ended reasoning.
// A court needs prose and judgement, and none of these produce it well.
const SPECIALIST_MARKERS = [
    "code", "coder", "codestral", "safety", "guard", "moderation", "shield",
    "embed", "rerank", "note", "clip", "tts", "whisper", "audio", "vision",
    "ocr", "image", "diffusion", "translate", "math", "sql", "fin"
];

/*
 * General-purpose families that write usable prose and hold a fixed answer
 * format. Kept deliberately short: every name here has either been seen
 * answering a judge prompt from this application or is a long-standing
 * general instruct family. Guessing from a product name does not work - a
 * plausible-sounding model that is gated or withdrawn scores well and then
 * fails on the first call.
 */
const GENERAL_FAMILIES = [
    "minimax", "nemotron", "laguna", "glm", "gemma", "llama", "qwen",
    "deepseek", "mistral", "command", "phi", "olmo"
];

function score(model) {
    const haystack = (model.id + " " + model.name).toLowerCase();
    let points = 0;

    // A router forwards each call to a different model, which defeats the
    // point of choosing one. Never open on it.
    if (model.isRouter || /\brouter\b/.test(haystack)) {
        points -= 200;
    }

    SPECIALIST_MARKERS.forEach(function (marker) {
        if (haystack.indexOf(marker) !== -1) {
            points -= 40;
        }
    });

    GENERAL_FAMILIES.forEach(function (family) {
        if (haystack.indexOf(family) !== -1) {
            points += 20;
        }
    });

    // A preview or an experimental build is more likely to be withdrawn or
    // rate-limited than a released one.
    if (/preview|experimental|alpha|beta/.test(haystack)) {
        points -= 12;
    }

    // A judge reads the charge sheet plus four speeches, so a short context is
    // a real risk rather than a preference.
    if (model.contextLength >= 128000) {
        points += 6;
    } else if (model.contextLength < 32000) {
        points -= 25;
    }

    return points;
}

/*
 * Routers are removed from consideration rather than merely ranked last.
 *
 * A router picks a different model per call behind one id, so seven seats
 * pointed at routers report seven distinct models and are not distinct at all
 * - which is the one thing arrangement B exists to measure. Ranking them last
 * left them selectable whenever the catalogue offered nothing else, and a
 * silently meaningless comparison is worse than an empty picker that says so.
 */
function selectable(models) {
    return (models || []).filter(function (model) {
        return !model.isRouter;
    });
}

/*
 * Picks the two models the pickers open on: the best free model for the
 * speakers, and the best free model from a different provider for the judges.
 *
 * A different provider rather than merely a different name, because
 * arrangement B exists to stop the judges inheriting the speakers' habits of
 * reasoning, and two models from one lab share more of those than two names
 * suggest.
 */
export function pickDefaultModels(models) {
    const usable = selectable(models);
    if (usable.length === 0) {
        return { speakerModel: null, judgeModel: null };
    }

    const free = usable.filter(function (model) {
        return model.isFree;
    });
    const pool = free.length >= 2 ? free : usable;

    const ranked = pool.slice().sort(function (a, b) {
        return score(b) - score(a);
    });

    const speakerModel = ranked[0];
    const speakerProvider = speakerModel.id.split("/")[0];

    const judgeModel =
        ranked.find(function (model) {
            return model.id.split("/")[0] !== speakerProvider;
        }) || ranked[1] || speakerModel;

    return { speakerModel: speakerModel, judgeModel: judgeModel };
}

/*
 * Assigns a model to each of the seven seats for arrangement B.
 *
 * Distinct models are handed out in ranked order and providers are spread as
 * far as they go, because two models from one lab share more habits of
 * reasoning than two names suggest. When fewer usable models exist than there
 * are seats - which is the normal case on the free tier, where only a handful
 * answer at any moment - the list wraps, and the caller is told how many
 * distinct models it actually got rather than being left to assume seven.
 */
export function assignDistinctModels(models, agentIds) {
    const usable = selectable(models);
    if (usable.length === 0 || !agentIds || agentIds.length === 0) {
        return {};
    }

    const free = usable.filter(function (model) {
        return model.isFree;
    });
    const pool = (free.length >= 2 ? free : usable)
        .slice()
        .sort(function (a, b) {
            return score(b) - score(a);
        });

    // Walk providers round-robin so neighbouring seats rarely share a lab.
    const byProvider = {};
    pool.forEach(function (model) {
        const provider = model.id.split("/")[0];
        if (!byProvider[provider]) {
            byProvider[provider] = [];
        }
        byProvider[provider].push(model);
    });
    const providers = Object.keys(byProvider);

    const spread = [];
    let depth = 0;
    while (spread.length < pool.length) {
        let added = false;
        providers.forEach(function (provider) {
            const model = byProvider[provider][depth];
            if (model) {
                spread.push(model);
                added = true;
            }
        });
        if (!added) {
            break;
        }
        depth += 1;
    }

    const assignment = {};
    agentIds.forEach(function (id, index) {
        assignment[id] = spread[index % spread.length];
    });
    return assignment;
}
