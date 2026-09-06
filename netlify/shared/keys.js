/*
 * keys.js - reading a credential out of the environment, and refusing a
 * placeholder as firmly as a missing one.
 *
 * Both functions that hold the model key used to ask only whether the variable
 * was set. `.env.example` ships with OPENROUTER_API_KEY=sk-or-v1-replace-me,
 * and copying that file is the documented first step - so the overwhelmingly
 * common failure is a key that is *present and not a key*. It passed the check,
 * went upstream, and came back as "OpenRouter refused the call: User not
 * found", which sends the reader to look at their OpenRouter account instead of
 * at the line they never edited.
 *
 * This lives outside netlify/functions on purpose: only files in that
 * directory become endpoints, and this is not one.
 */

// A value that is obviously the placeholder rather than a credential. The
// length floor is generous - every real provider key here is far longer - and
// deliberately not a format check, because guessing a provider's format is how
// a valid key gets rejected the week the provider changes it.
function isPlaceholder(value) {
    const text = String(value || "");
    return (
        text === "" ||
        text.length < 24 ||
        /replace|your-|placeholder|changeme|xxx/i.test(text)
    );
}

/*
 * Returns { key } or { error }. The error is the message the browser will
 * show, so it names the file, the variable and the two places it belongs.
 */
export function readModelKey() {
    const key = process.env.OPENROUTER_API_KEY;
    if (isPlaceholder(key)) {
        return {
            error:
                "OPENROUTER_API_KEY is not set to a real key. Locally it goes in " +
                ".env - copy .env.example if you have not, then replace the " +
                "sk-or-v1-replace-me placeholder with a key from " +
                "https://openrouter.ai/keys. On Netlify it goes under Site " +
                "configuration -> Environment variables, and the site has to be " +
                "redeployed afterwards because functions read the environment at " +
                "build time."
        };
    }
    return { key: key };
}

/*
 * The record's pair. Returns { url, key } or { error }.
 *
 * Absent configuration here is an ordinary state rather than a fault: a
 * checkout with no Supabase project still deliberates, and the screen says the
 * case was not kept. So the message describes what is lost, not what is broken.
 */
export function readRecordKeys() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (isPlaceholder(url) || isPlaceholder(key)) {
        return {
            error:
                "The record is not configured. Set SUPABASE_URL and " +
                "SUPABASE_SERVICE_ROLE_KEY - locally in .env, and on Netlify under " +
                "Site configuration -> Environment variables, followed by a " +
                "redeploy. Deliberations still run; they are simply not kept."
        };
    }
    return { url: url, key: key };
}
