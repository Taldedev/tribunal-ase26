#!/bin/sh
#
# Reads security-patterns.yaml and prints one extended-regexp alternation.
#
# Sourced by all three barriers so the list lives in exactly one place. A
# missing or unreadable file is a hard failure rather than an empty pattern: an
# empty pattern matches nothing, so every scan would pass and every scan would
# be worthless, which is the one outcome worse than no scan.

secret_patterns() {
    root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
    file="$root/security-patterns.yaml"

    if [ ! -r "$file" ]; then
        echo "secret-patterns: cannot read $file" >&2
        exit 1
    fi

    joined=$(sed -n "s/^[[:space:]]*match:[[:space:]]*'\(.*\)'[[:space:]]*$/\1/p" "$file" \
             | paste -sd '|' -)

    if [ -z "$joined" ]; then
        echo "secret-patterns: $file yielded no patterns" >&2
        exit 1
    fi

    printf '%s' "$joined"
}
