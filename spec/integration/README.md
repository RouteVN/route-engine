# Engine integration tests

These suites exercise the public `RouteEngine` API together with the real
effects handler. Rendering, persistence, and ticker time are replaced only at
their external boundaries so journeys stay deterministic.

## Conventions

- Prefer multi-step player and host journeys over direct store-action tests.
- Send UI actions through the renderer event handler when the contract starts
  from rendered input.
- Assert both the user-visible result and important ownership state, such as
  the current pointer, active interaction, timer count, or persisted payload.
- Use ordinary `it` for supported behavior.
- Use `itKnownDefect` only for a reproduced engine defect. Put setup and
  precondition assertions outside its `expectFailure` call. Inside it, provide
  one `observed` assertion that fingerprints the exact current defect and one
  `desired` assertion for the intended contract. Both must contain exactly one
  synchronous `expect` call. Setup, schema, changed-defect, and unrelated
  assertion failures remain real failures. When the desired contract becomes
  healthy, the observed fingerprint or the helper itself fails and asks for the
  marker to be removed.
- Keep each known-defect case narrow enough that the marked assertion identifies
  one specific regression.

## Action-pipeline characterization

`createActionPipelineTranscriptHarness` records only observable boundaries:
host or renderer dispatch, rendered snapshots, external effects, persistence
writes, errors, and a compact public-state summary. Use it to protect action
ordering and transaction behavior without asserting private executor details.

- Distinguish a store/action failure before commit from an effect or renderer
  failure after commit.
- Assert repeated external effects by payload and order; do not collapse them
  by effect name.
- Include the settled pointer, relevant variables, active interaction, render
  count, and pending-effect state when navigation is involved.
- Do not snapshot random engine/render IDs or the entire system state.
- When a VT project covers the same contract, load that exact YAML in a
  companion integration journey so an unrelated fixture failure cannot make a
  healthy visual reference misleading.

Browser-level counterparts live in `vt/specs/robustness`. Healthy scenarios
have committed references. Known-broken scenarios intentionally have no
reference until their production fix renders the expected state.

GitHub Actions runs each healthy robustness scenario in an isolated container.
`scripts/run-vt-ci.sh` rejects scenarios without references and applies an
OS-level watchdog in addition to RTGL's own timeout, so a crashed browser cannot
leave a CI runner waiting indefinitely. The capture container has networking
disabled; all browser dependencies are built into `VtDependencies.js` so CDN
availability cannot stall or invalidate the visual gate. Capture runs in
Chromium with ANGLE's SwiftShader backend forced so GPU-less hosted runners use
a stable software-rendering path instead of returning an empty WebGL canvas.

Only deterministic scenarios belong in the CI matrix. A scenario with a healthy
reference can still remain local-only when its capture depends on a narrow
wall-clock window; `choice-skip-pause-resume.yaml` is currently excluded for
that reason.

Playback timing scenarios can opt into the VT harness's deterministic ticker by
declaring the context boolean variable
`vtDeterministicPlaybackTicker` with `default: true`. Their steps advance the
clock with `customEvent` named `vt:tickPlayback` and a non-negative `deltaMS`.
RTGL transports structured custom-event detail as strings; the harness parses
and validates that boundary before invoking the installed playback callback.
Use this path for deadline assertions instead of wall-clock waits, and keep a
companion integration journey that loads the exact YAML project.
