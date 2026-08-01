#!/usr/bin/env bash

set -euo pipefail

readonly DEFAULT_VT_IMAGE="han4wluc/rtgl@sha256:827d5b36a8d05e3e368127f0394ae01ada34f7f487020f3ae760e430eed08789"
readonly VT_IMAGE="${VT_DOCKER_IMAGE:-$DEFAULT_VT_IMAGE}"
readonly VT_ITEM="${VT_ITEM:-}"
readonly VT_CASE_ID="${VT_CASE_ID:-local}"
readonly VT_CAPTURE_TIMEOUT_MS="${VT_CAPTURE_TIMEOUT_MS:-60000}"
readonly VT_PROCESS_TIMEOUT_SECONDS="${VT_PROCESS_TIMEOUT_SECONDS:-180}"
readonly VT_REPORT_DIFF_THRESHOLD="${VT_REPORT_DIFF_THRESHOLD:-0.8}"

if [[ -z "$VT_ITEM" ]]; then
  echo "VT_ITEM must name one visual-test spec relative to vt/specs." >&2
  exit 2
fi

case "$VT_ITEM" in
  robustness/*.yaml) ;;
  *)
    echo "CI VT only accepts robustness/*.yaml specs; received: $VT_ITEM" >&2
    exit 2
    ;;
esac

if [[ ! -f "vt/specs/$VT_ITEM" ]]; then
  echo "Visual-test spec does not exist: vt/specs/$VT_ITEM" >&2
  exit 2
fi

readonly reference_pattern="vt/reference/${VT_ITEM%.yaml}*.webp"
if ! compgen -G "$reference_pattern" >/dev/null; then
  echo "Refusing to baseline a known-broken VT spec without a healthy reference: $VT_ITEM" >&2
  exit 2
fi

readonly project_dir="$(pwd -P)"
readonly safe_case_id="${VT_CASE_ID//[^a-zA-Z0-9_.-]/-}"
readonly container_name="route-engine-vt-${safe_case_id}-${GITHUB_RUN_ID:-local}-$$"
current_container=""

# Keep diagnostics scoped to this one matrix case. RTGL otherwise leaves diff
# images from earlier local runs in place, which makes artifacts misleading.
rm -rf -- .rettangoli/vt/_site/candidate .rettangoli/vt/_site/diff

cleanup() {
  if [[ -n "$current_container" ]]; then
    docker rm --force "$current_container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

run_vt_container() {
  local phase="$1"
  shift
  local -a container_command=(rtgl vt "$@")
  local -a container_user=(--user "$(id -u):$(id -g)")

  if [[ "$phase" == "screenshot" ]]; then
    # The wrapper needs root only to patch the pinned image's Chromium launch
    # flags. It drops back to this host user's IDs before RTGL writes anything.
    container_user=()
    container_command=(
      bash /app/scripts/run-vt-browser-ci.sh
      "$(id -u)" "$(id -g)"
      rtgl vt "$@"
    )
  fi

  current_container="${container_name}-${phase}"
  echo "Running VT $phase for $VT_ITEM with watchdog ${VT_PROCESS_TIMEOUT_SECONDS}s"

  if timeout \
    --foreground \
    --signal=TERM \
    --kill-after=10s \
    "${VT_PROCESS_TIMEOUT_SECONDS}s" \
    docker run \
    --name "$current_container" \
    --rm \
    --init \
    --network none \
    --shm-size=1g \
    "${container_user[@]}" \
    --env RTGL_VT_DEBUG=true \
    --volume "$project_dir:/app" \
    --workdir /app \
    "$VT_IMAGE" \
    "${container_command[@]}"; then
    current_container=""
    return 0
  else
    local status=$?
    echo "VT $phase failed for $VT_ITEM (exit $status)." >&2
    return "$status"
  fi
}

run_vt_container screenshot \
  screenshot \
  --wait-event vt:ready \
  --concurrency 1 \
  --timeout "$VT_CAPTURE_TIMEOUT_MS" \
  --item "$VT_ITEM"

run_vt_container report \
  report \
  --diff-threshold "$VT_REPORT_DIFF_THRESHOLD" \
  --item "$VT_ITEM"
