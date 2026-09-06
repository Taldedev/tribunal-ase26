#!/bin/sh
#
# A PreToolUse hook. It refuses a write before it happens.
#
# Module 11: a file advises, a hook enforces. CLAUDE.md's first standing rule
# says the keys live in .env and in Netlify's environment variables and nowhere
# else, and a standing rule in a file is a rule an agent can read and still get
# wrong - the paragraph is thousands of tokens back by the time it matters.
# This runs on every Write and Edit whether anyone remembered it or not.
#
# It is the earliest of three barriers around the same mistake, and the only
# one that acts before the damage:
#
#   this hook          refuses the write        nothing is on disk
#   scripts/pre-commit refuses the commit       it is on disk, not in history
#   npm run verify     finds it in history      it is already compromised
#
# By the third, the key must be rotated rather than removed. Which is why the
# first exists.
#
# Wired up in .claude/settings.json. Reads the tool call as JSON on stdin;
# exit 2 blocks the call and shows the message to the agent.

INPUT=$(cat)

. "$(dirname -- "$0")/secret-patterns.sh"
PATTERN=$(secret_patterns)

# 1. A credential in the content being written, wherever it is going.
if printf '%s' "$INPUT" | grep -qE "$PATTERN"; then
    echo "BLOCKED: that write carries something shaped like a credential." >&2
    echo "" >&2
    echo "  Keys belong in .env, which is gitignored, and in Netlify's" >&2
    echo "  environment variables. Nowhere else - not in source, not in" >&2
    echo "  .env.example, not in a document, not in a test fixture." >&2
    echo "" >&2
    echo "  If this is a placeholder, make it obviously one: the scanners" >&2
    echo "  here require 20 or more characters after the prefix, so" >&2
    echo "  sk-or-v1-replace-me passes and a real key does not." >&2
    exit 2
fi

# 2. .env itself. Not because writing to it is wrong - it is the one right
#    place - but because an agent editing it is an agent handling a live key,
#    and that is a decision for the person whose key it is.
if printf '%s' "$INPUT" | grep -qE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*/\.env"'; then
    echo "BLOCKED: .env is not edited by an agent." >&2
    echo "" >&2
    echo "  It holds live credentials. Edit it yourself, or change" >&2
    echo "  .env.example instead and say which variable is needed." >&2
    exit 2
fi

exit 0
