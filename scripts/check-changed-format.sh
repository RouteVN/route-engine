#!/usr/bin/env bash

set -euo pipefail

base_sha="${FORMAT_BASE_SHA:-}"

is_commit() {
  [[ -n "$1" ]] && git cat-file -e "$1^{commit}" 2>/dev/null
}

if ! is_commit "$base_sha"; then
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    base_sha="$(git merge-base HEAD origin/main)"
  elif git rev-parse --verify HEAD^ >/dev/null 2>&1; then
    base_sha="HEAD^"
  else
    base_sha="$(git hash-object -t tree /dev/null)"
  fi
fi

declare -a format_files=()
while IFS= read -r -d '' file; do
  [[ -f "$file" ]] || continue
  case "$file" in
    *.cjs|*.css|*.html|*.js|*.json|*.md|*.mjs|*.scss|*.yaml|*.yml)
      format_files+=("$file")
      ;;
  esac
done < <(git diff --name-only --diff-filter=ACMR -z "$base_sha" --)

if [[ ${#format_files[@]} -eq 0 ]]; then
  echo "No changed Prettier-supported files."
  exit 0
fi

echo "Checking formatting for ${#format_files[@]} changed file(s)."
bun run prettier --check "${format_files[@]}"
