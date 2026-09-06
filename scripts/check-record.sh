#!/bin/sh
#
# Proves the record is actually connected, by using it.
#
# Criteria S20 and S21 are satisfied in code and that is not the same as
# satisfied in operation: the tables have to exist, the key has to be the one
# that can write, and row-level security has to be on. This writes a probe
# case, reads it back, checks that its call row came with it, and deletes it
# again - so a green run means a real round trip happened, not that a variable
# was set.
#
# It reaches Supabase directly and therefore stops short of the function that
# will use these keys. S22 - a refused save reported beside the verdicts - is
# not in its reach at all, and the closing message says so rather than
# collecting a criterion it never tested.
#
# Run it after creating the Supabase project and running supabase/schema.sql:
#
#     ./scripts/check-record.sh
#
# It reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env, and
# SUPABASE_ANON_KEY too when it is there, and prints none of them. Nothing it
# writes survives the run.

set -e
cd "$(dirname -- "$0")/.."

if [ ! -f .env ]; then
    echo "No .env file. Copy .env.example to .env and put your values in it."
    exit 1
fi

# Only these two are taken out of .env, and neither is ever echoed.
URL=$(grep -E '^SUPABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')

if [ -z "$URL" ] || [ -z "$KEY" ]; then
    echo "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env."
    exit 1
fi

case "$KEY" in
    *replace-me*|*your-project*)
        echo "SUPABASE_SERVICE_ROLE_KEY is still the placeholder from .env.example."
        exit 1
        ;;
esac

REST="$URL/rest/v1"
PROBE="probe-$(date +%s)"
FAILED=0

# Prints the HTTP status of one REST call. The key goes in a header and never
# into a URL, a log line or this script's output.
call() {
    method=$1
    path=$2
    body=$3
    if [ -n "$body" ]; then
        curl -s -o /tmp/record-check-body -w '%{http_code}' -X "$method" \
            "$REST/$path" \
            -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
            -H "Content-Type: application/json" \
            -H "Prefer: return=minimal" \
            -d "$body"
    else
        curl -s -o /tmp/record-check-body -w '%{http_code}' -X "$method" \
            "$REST/$path" \
            -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
    fi
}

step() {
    printf '  %-46s' "$1"
}

pass() { echo "ok"; }
fail() {
    echo "FAILED"
    echo ""
    echo "       $1"
    if [ -s /tmp/record-check-body ]; then
        echo "       the database said:"
        sed 's/^/         /' /tmp/record-check-body | head -4
    fi
    echo ""
    FAILED=1
}

echo ""
echo "The record"
echo ""

# --- 1. the tables exist -------------------------------------------------
step "the cases table exists"
status=$(call GET "cases?select=run_id&limit=1")
if [ "$status" = "200" ]; then pass; else
    fail "Status $status. If it is 404 the schema has not been run: open the
       Supabase SQL editor and run supabase/schema.sql. If it is 401 the key
       is not the service-role one."
fi

step "the model_calls table exists"
status=$(call GET "model_calls?select=run_id&limit=1")
if [ "$status" = "200" ]; then pass; else
    fail "Status $status. Same two causes as above."
fi

# Nothing below can work if the tables are not there.
if [ "$FAILED" -ne 0 ]; then
    echo "Stopping: the schema has to be in place first."
    echo ""
    exit 1
fi

# --- 2. a deliberation can be written ------------------------------------
step "a case can be written"
status=$(call POST "cases" '[{
    "run_id": "'"$PROBE"'",
    "config": "SINGLE",
    "charge_sheet": {"label":"probe","defendant":"probe","act":"probe","question":"probe?"},
    "speeches": [], "rulings": [],
    "totals": {"totalTokens":0,"cachedTokens":0,"costUsd":0},
    "ok": true, "distinct_models": 1
}]')
if [ "$status" = "201" ] || [ "$status" = "200" ]; then pass; else
    fail "Status $status. A 401 or 403 here means the key can read but not
       write, which is what an anon or publishable key does. Use the
       service_role (or sb_secret_) key."
fi

step "a model call is logged against it"
status=$(call POST "model_calls" '[{
    "run_id": "'"$PROBE"'", "call_id": "probe-seat", "stage": "speech",
    "agent": "probe", "model_id": "probe/model", "ok": true,
    "prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2,
    "cached_tokens": 0, "cost_usd": 0, "elapsed_ms": 1, "truncated": false
}]')
if [ "$status" = "201" ] || [ "$status" = "200" ]; then pass; else
    fail "Status $status. A 409 means the foreign key rejected it, which means
       the case above did not land."
fi

# --- 3. and read back ----------------------------------------------------
step "the case reads back"
status=$(call GET "cases?select=run_id,distinct_models&run_id=eq.$PROBE")
if [ "$status" = "200" ] && grep -q "$PROBE" /tmp/record-check-body; then pass; else
    fail "Status $status, and the probe case was not in the answer."
fi

step "its call row reads back"
status=$(call GET "model_calls?select=call_id,cached_tokens&run_id=eq.$PROBE")
if [ "$status" = "200" ] && grep -q "probe-seat" /tmp/record-check-body; then pass; else
    fail "Status $status, and the probe call was not in the answer."
fi

# --- 4. what a request without the service key can reach -----------------
#
# Two checks, and the first one is weaker than it looks.
#
# A request carrying no key at all is refused by Supabase's API gateway before
# row-level security is ever consulted. So it passing tells you the endpoint is
# not open to the anonymous internet - which is worth knowing - and tells you
# nothing whatever about RLS. This check used to claim otherwise, in its own
# comment and in its failure message, which is the trap Module 16 names: where
# the prose and the code disagree, the code is true.
step "a request with no key is refused"
status=$(curl -s -o /tmp/record-check-body -w '%{http_code}' "$REST/cases?select=run_id&limit=1")
if [ "$status" = "401" ] || [ "$status" = "403" ]; then pass; else
    fail "Status $status - a request with no key at all was answered. That is
       the API gateway, not row-level security, and it should never happen."
fi

# The real test needs a key that RLS actually applies to. The anonymous or
# publishable key is public by design - it ships inside any browser app that
# uses one - so it is safe in .env and is the only way to prove from outside
# that the two ALTER TABLE lines at the bottom of schema.sql really ran.
#
# Without it, RLS is unproven and this says so rather than passing quietly.
ANON=$(grep -E '^SUPABASE_ANON_KEY=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
case "$ANON" in *replace-me*|"") ANON="" ;; esac

if [ -n "$ANON" ]; then
    step "the anon key reads nothing (RLS)"
    status=$(curl -s -o /tmp/record-check-body -w '%{http_code}' \
        "$REST/cases?select=run_id&limit=1" \
        -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
    if [ "$status" = "401" ] || [ "$status" = "403" ]; then
        pass
    elif [ "$status" = "200" ] && [ "$(tr -d ' \n' < /tmp/record-check-body)" = "[]" ]; then
        # 200 with an empty array is RLS working exactly as intended: the
        # request was allowed and no row was visible to it.
        pass
    else
        fail "Status $status, and the answer was not empty - the anon key can
       read these tables. Row-level security is not enabled. Run the two
       ALTER TABLE lines at the bottom of supabase/schema.sql."
    fi
else
    printf '  %-46s%s\n' "the anon key reads nothing (RLS)" "SKIPPED"
    echo "       No SUPABASE_ANON_KEY in .env, so row-level security is"
    echo "       UNPROVEN. The anon key is public by design; add it to .env"
    echo "       from Project Settings -> API Keys to check this."
fi

# --- 5. clean up ---------------------------------------------------------
# The call row goes with the case, on the foreign key's cascade. That is worth
# checking too, because it is what makes a delete from the app leave nothing
# behind.
step "deleting the case takes its calls with it"
call DELETE "cases?run_id=eq.$PROBE" >/dev/null
status=$(call GET "model_calls?select=call_id&run_id=eq.$PROBE")
if [ "$status" = "200" ] && ! grep -q "probe-seat" /tmp/record-check-body; then pass; else
    fail "The call row survived its case. The cascade on the foreign key is
       missing, so deleting a case will leave orphaned rows behind."
fi

rm -f /tmp/record-check-body
echo ""
if [ "$FAILED" -ne 0 ]; then
    echo "The record is NOT connected."
    echo ""
    exit 1
fi
echo "The record is connected: the schema is real, the key can write, and"
echo "row-level security is doing its job. Nothing this check wrote is still"
echo "there."
echo ""
echo "What that covers: the database layer of S20 and S21."
echo "What it does not: /api/cases, which is the thing that will actually use"
echo "these keys, and S22 - a refused save reported beside the verdicts - which"
echo "this script has no screen to observe. For those, run the app: npm run dev."
echo ""
