#!/usr/bin/env bash

set -euo pipefail

if (( $# < 3 )); then
  echo "VT browser wrapper requires UID, GID, and a command." >&2
  exit 2
fi

readonly run_uid="$1"
readonly run_gid="$2"
shift 2

if [[ ! "$run_uid" =~ ^[0-9]+$ || ! "$run_gid" =~ ^[0-9]+$ ]]; then
  echo "VT browser wrapper requires numeric UID and GID arguments." >&2
  exit 2
fi

readonly scheduler="/usr/local/lib/rtgl/global/node_modules/@rettangoli/vt/src/capture/capture-scheduler.js"
readonly original='const browser = await chromium.launch({ headless });'
readonly replacement='const browser = await chromium.launch({ headless, args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"] });'

if [[ ! -f "$scheduler" ]]; then
  echo "Pinned RTGL capture scheduler was not found: $scheduler" >&2
  exit 2
fi

if [[ "$(grep -Fc "$original" "$scheduler")" != "1" ]]; then
  echo "Pinned RTGL Chromium launch contract changed; refusing an unverified patch." >&2
  exit 2
fi

sed -i "s|$original|$replacement|" "$scheduler"

exec setpriv \
  --reuid "$run_uid" \
  --regid "$run_gid" \
  --clear-groups \
  -- \
  "$@"
