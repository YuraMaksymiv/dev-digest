#!/usr/bin/env bash
# collect-diff.sh — every open change, from four buckets, as one reviewable set.
#
# Buckets: committed-on-this-branch, staged, unstaged, untracked. A change in any
# of them is going into the PR, so all four are in scope.
#
#   --files    print only the file paths (default prints paths + a summary to stderr)
#   --json     print a JSON object instead
#   --base REF override the comparison base (default: origin/main)
#
# Exit 0 always when it can determine a base; exit 2 if it cannot.
set -uo pipefail

BASE_REF="origin/main"
MODE="text"
while [ $# -gt 0 ]; do
  case "$1" in
    --files) MODE="files" ;;
    --json)  MODE="json" ;;
    --base)  shift; BASE_REF="${1:-}" ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel)" || exit 2

# Resolve the base. origin/main is the honest default: a stale local `main`
# silently changes what "my changes" means.
if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null; then
  if git rev-parse --verify --quiet main >/dev/null; then
    echo "note: $BASE_REF not found, falling back to main" >&2
    BASE_REF="main"
  else
    echo "error: cannot resolve a base ref ($BASE_REF or main)" >&2
    exit 2
  fi
fi
BASE="$(git merge-base "$BASE_REF" HEAD)" || exit 2

committed="$(git diff --name-only "$BASE"...HEAD)"
staged="$(git diff --cached --name-only)"
unstaged="$(git diff --name-only)"
untracked="$(git ls-files --others --exclude-standard)"

# Whitespace-only changes carry no reviewable content. A file that appears in the
# normal diff but not in the -w diff changed only in whitespace.
ws_all="$(printf '%s\n%s\n%s\n' "$committed" "$staged" "$unstaged" | sed '/^$/d' | sort -u)"
# `git diff -w --name-only` does NOT filter files — the whitespace options only
# affect hunk generation. --numstat does: a whitespace-only change yields no row.
ws_real="$( { git diff -w --ignore-blank-lines --numstat "$BASE"...HEAD; git diff -w --ignore-blank-lines --cached --numstat; git diff -w --ignore-blank-lines --numstat; } | cut -f3- | sed '/^$/d' | sort -u)"
ws_only="$(comm -23 <(printf '%s\n' "$ws_all") <(printf '%s\n' "$ws_real"))"

deleted="$( { git diff --diff-filter=D --name-only "$BASE"...HEAD; git diff --cached --diff-filter=D --name-only; git diff --diff-filter=D --name-only; } | sed '/^$/d' | sort -u)"

all="$(printf '%s\n%s\n%s\n%s\n' "$committed" "$staged" "$unstaged" "$untracked" | sed '/^$/d' | sort -u)"
# Reviewable = everything except whitespace-only and deleted files.
reviewable="$(printf '%s\n' "$all" | { [ -n "$ws_only" ] && comm -23 - <(printf '%s\n' "$ws_only") || cat; } \
  | { [ -n "$deleted" ] && comm -23 - <(printf '%s\n' "$deleted") || cat; } | sed '/^$/d')"

# printf '%s' drops a trailing newline, which makes wc -l undercount by one.
count() { printf '%s\n' "${1:-}" | sed '/^$/d' | wc -l | tr -d ' '; }

case "$MODE" in
  files) printf '%s\n' "$reviewable" | sed '/^$/d' ;;
  json)
    esc() { printf '%s' "${1:-}" | sed '/^$/d' | sed 's/"/\\"/g' | sed 's/.*/"&"/' | paste -sd, - ; }
    printf '{"base":"%s","base_ref":"%s","committed":[%s],"staged":[%s],"unstaged":[%s],"untracked":[%s],"deleted":[%s],"whitespace_only":[%s],"reviewable":[%s]}\n' \
      "$BASE" "$BASE_REF" "$(esc "$committed")" "$(esc "$staged")" "$(esc "$unstaged")" \
      "$(esc "$untracked")" "$(esc "$deleted")" "$(esc "$ws_only")" "$(esc "$reviewable")"
    ;;
  text)
    {
      echo "base:       $BASE_REF @ ${BASE:0:12}"
      echo "committed:  $(count "$committed")"
      echo "staged:     $(count "$staged")"
      echo "unstaged:   $(count "$unstaged")"
      echo "untracked:  $(count "$untracked")"
      [ -n "$deleted" ]  && echo "deleted:    $(count "$deleted") (checked for broken importers only)"
      [ -n "$ws_only" ] && echo "whitespace: $(count "$ws_only") (dropped)"
      echo "reviewable: $(count "$reviewable")"
    } >&2
    printf '%s\n' "$reviewable" | sed '/^$/d'
    ;;
esac
