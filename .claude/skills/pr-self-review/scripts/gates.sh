#!/usr/bin/env bash
# gates.sh — Phase 1. Deterministic checks only: no LLM, no judgement calls.
#
# Everything here is cheap and has no false positives, so a failure is a real
# failure. Run it before paying for a review of code that does not compile.
#
#   --quick   skip typecheck and tests (repo rules + secrets + arch only)
#   --base R  comparison base (default: origin/main)
#
# Exit 0 = all gates passed. Exit 1 = at least one CRITICAL gate failed.
set -uo pipefail

QUICK=0
BASE_REF="origin/main"
while [ $# -gt 0 ]; do
  case "$1" in
    --quick) QUICK=1 ;;
    --base)  shift; BASE_REF="${1:-}" ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel)" || exit 2
git rev-parse --verify --quiet "$BASE_REF" >/dev/null || BASE_REF=main
BASE="$(git merge-base "$BASE_REF" HEAD)" || exit 2

FAILED=0
pass() { printf '  \033[32mok\033[0m   %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAILED=1; }
note() { printf '       %s\n' "$1"; }

FILES="$(git diff --name-only "$BASE"...HEAD; git diff --cached --name-only; git diff --name-only; git ls-files --others --exclude-standard)"
FILES="$(printf '%s\n' "$FILES" | sed '/^$/d' | sort -u)"
# Added lines only — we grade what this change introduces, not what was there.
ADDED="$( { git diff "$BASE"...HEAD; git diff --cached; git diff; } | grep '^+' | grep -v '^+++' )"
touches() { printf '%s\n' "$FILES" | grep -q "^$1"; }

echo "Phase 1 — deterministic gates"

# ---------------------------------------------------------------- repo rules
# Applied migrations are immutable: a correction is a NEW migration. Adding a
# generated .sql is fine; modifying one that already shipped is not.
modified_sql="$( { git diff --diff-filter=M --name-only "$BASE"...HEAD; git diff --diff-filter=M --cached --name-only; git diff --diff-filter=M --name-only; } \
  | grep '^server/src/db/migrations/.*\.sql$' | sort -u)"
if [ -n "$modified_sql" ]; then
  fail "migrations: an already-generated .sql was modified"
  printf '%s\n' "$modified_sql" | sed 's/^/       /'
else
  pass "migrations: no existing .sql modified"
fi

# A lockfile changes only as a side effect of add/remove/update.
lock_bad=0
for lock in $(printf '%s\n' "$FILES" | grep -E '(pnpm-lock\.yaml|package-lock\.json)$'); do
  dir="$(dirname "$lock")"
  printf '%s\n' "$FILES" | grep -q "^$dir/package.json$" || { fail "lockfile changed with no package.json change: $lock"; lock_bad=1; }
done
[ "$lock_bad" -eq 0 ] && pass "lockfiles: consistent with package.json changes"

# The design system is vendored; reach it through the barrel only.
if printf '%s\n' "$ADDED" | grep -qE "from ['\"](@devdigest/ui/|.*vendor/ui/)"; then
  fail "vendor/ui: deep import instead of the @devdigest/ui barrel"
  printf '%s\n' "$ADDED" | grep -nE "from ['\"](@devdigest/ui/|.*vendor/ui/)" | head -5 | sed 's/^/       /'
else
  pass "vendor/ui: imported through the barrel"
fi

# A runtime (non-type) import from the vendored shared package breaks the
# client's webpack build. Statement-level check — these imports are multi-line,
# so a line-based grep gives false positives on `export type { … } from …`.
client_files="$(printf '%s\n' "$FILES" | grep -E '^client/src/.*\.tsx?$' | grep -v '/vendor/' || true)"
if [ -z "$client_files" ]; then
  note "client: skipped (no client sources touched)"
elif out="$(node "$(dirname "$0")/check-shared-imports.cjs" $client_files 2>&1)"; then
  pass "client: @devdigest/shared imported as types only"
else
  fail "client: runtime import from @devdigest/shared (breaks the webpack build)"
  printf '%s\n' "$out" | head -5 | sed 's/^/       /'
fi

# The two vendored copies drift. If this change touches one side, the other
# side's twin must not silently diverge.
drift=""
for f in $(printf '%s\n' "$FILES" | grep '^server/src/vendor/shared/'); do
  twin="client/src/vendor/shared/${f#server/src/vendor/shared/}"
  [ -f "$twin" ] || continue
  cmp -s "$f" "$twin" && continue
  printf '%s\n' "$FILES" | grep -q "^$twin$" || drift="$drift$f -> $twin\n"
done
if [ -n "$drift" ]; then
  fail "vendor/shared: server copy changed, client twin differs and was not updated"
  printf "$drift" | sed 's/^/       /'
else
  pass "vendor/shared: no new drift introduced"
fi

# ------------------------------------------------------------------ secrets
SECRET_RE='(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,})'
if printf '%s\n' "$ADDED" | grep -qE "$SECRET_RE"; then
  fail "secrets: credential-shaped string in added lines"
  printf '%s\n' "$ADDED" | grep -oE "$SECRET_RE" | cut -c1-12 | sed 's/$/…/' | sort -u | head -5 | sed 's/^/       /'
else
  pass "secrets: none detected in added lines"
fi

# ------------------------------------------------------------- architecture
if touches server; then
  if pnpm --dir server arch >/dev/null 2>&1; then
    pass "arch: no new dependency-direction violations"
  else
    fail "arch: new dependency-direction violation — run 'pnpm --dir server arch'"
    pnpm --dir server arch 2>&1 | grep -E '^\s+(error|warn)' | head -5 | sed 's/^/     /'
  fi
else
  note "arch: skipped (server/ untouched)"
fi

# --------------------------------------------------------- typecheck + tests
if [ "$QUICK" -eq 1 ]; then
  note "typecheck/tests: skipped (--quick)"
else
  run_pkg() { # <dir> <pm> [extra test args…]
    local d="$1" pm="$2"; shift 2
    touches "$d" || { note "$d: skipped (untouched)"; return; }
    if (cd "$d" && $pm run typecheck >/dev/null 2>&1); then pass "$d: typecheck"; else fail "$d: typecheck"; fi
    if (cd "$d" && $pm run test "$@" >/dev/null 2>&1); then pass "$d: tests"; else fail "$d: tests"; fi
  }

  run_pkg client pnpm

  # server is handled explicitly: Testcontainers-backed tests boot a real
  # Postgres, so they only earn their time when the change could affect
  # persistence. `pnpm run test -- --exclude` does NOT reach vitest (the flag is
  # swallowed), so invoke vitest directly.
  if touches server; then
    if (cd server && pnpm run typecheck >/dev/null 2>&1); then pass "server: typecheck"; else fail "server: typecheck"; fi
    if printf '%s\n' "$FILES" | grep -qE '^server/src/(db|modules/[^/]+/repository)'; then
      note "server: DB layer touched — integration tests included"
      (cd server && pnpm exec vitest run >/dev/null 2>&1) && pass "server: tests (incl. integration)" || fail "server: tests"
    else
      (cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' >/dev/null 2>&1) \
        && pass "server: tests (unit only)" || fail "server: tests"
    fi
  else
    note "server: skipped (untouched)"
  fi
  run_pkg reviewer-core npm
fi

echo
[ "$FAILED" -eq 0 ] && echo "Phase 1: all gates passed" || echo "Phase 1: BLOCKED — fix the failures above"
exit "$FAILED"
