#!/bin/sh
#
# Repository checks for the two specification criteria that are not unit
# testable, because they are properties of the build output and of git history
# rather than of any function.
#
#   S9   The API key does not appear in the client bundle.
#   S10  The key does not appear anywhere in git history.
#
# Run with:  npm run verify
#
# This is the slow half of the gate. The pre-commit hook runs the cheap half on
# every commit; this one walks the whole history and is meant for CI, for a
# release, and for any time the answer actually matters.

set -e
cd "$(dirname "$0")/.."

PATTERN='sk-or-v1-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
FAILED=0

echo ""
echo "Repository checks"
echo ""

# --- S9 ---------------------------------------------------------------------
# The bundle is what the browser is actually handed. A key that reached it is
# readable by anyone who opens the page, so this is checked against the built
# output and never against the sources it came from.
printf "  S9   key absent from the client bundle ......... "
if [ ! -d dist ]; then
    echo "SKIPPED (no dist - run 'npm run build' first)"
elif grep -rqE "$PATTERN" dist 2>/dev/null; then
    echo "FAILED"
    echo ""
    echo "       A credential is present in the built bundle:"
    grep -rlE "$PATTERN" dist 2>/dev/null | sed 's/^/         /'
    echo ""
    echo "       The key must only ever be read inside netlify/functions."
    FAILED=1
else
    echo "ok"
fi

# --- S10 --------------------------------------------------------------------
# Every commit that has ever existed on any branch, not just the current tree.
# History is permanent: removing a key in a later commit leaves it in the
# earlier one, and in every clone anyone took in between.
printf "  S10  key absent from all git history .......... "
if git log -p --all --no-color 2>/dev/null | grep -qE "$PATTERN"; then
    echo "FAILED"
    echo ""
    echo "       A credential exists in history. Deleting it now does not"
    echo "       remove it. Treat the key as compromised, issue a new one,"
    echo "       and rewrite the history that carries the old one."
    echo ""
    git log --all --oneline -S"sk-or-v1-" --pickaxe-regex 2>/dev/null | sed 's/^/         /' || true
    FAILED=1
else
    echo "ok"
fi

echo ""
if [ "$FAILED" -ne 0 ]; then
    echo "Repository checks FAILED."
    echo ""
    exit 1
fi
echo "Repository checks passed."
echo ""
exit 0
