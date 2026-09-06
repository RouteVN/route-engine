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
- `bun run check:test-markers` scans every executable JavaScript, TypeScript,
  and Puty YAML test file in the repository. It rejects focused, skipped, todo,
  conditionally disabled, expected-failure, and known-defect markers, including
  parameterized, option-based, and handler-less Vitest forms. The full test run
  also verifies every collected task has `run` mode, does not invert failures,
  and does not skip dynamically at runtime, so supported syntax cannot bypass
  the static diagnostics. Merged behavior-neutral refactor preparation must
  keep every contract active; product defects are reproduced and fixed in
  their own PRs.
- During local defect reproduction, use `itKnownDefect` only for a reproduced
  engine defect, and remove the marker before merging. Put setup and
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
writes, playback schedule publications, physical ticker ownership changes,
errors, and a compact public-state summary. Use it to protect action ordering
and transaction behavior without asserting private executor details. Only
random render UUIDs are removed; playback, timer, rollback, and history
ownership remains visible.

`actionPipelineDispatchMatrix.integration.test.js` closes the action inventory
across authored system actions, presentation actions, store actions, and
explicit internal/test actions. It also locks host-single, host-batch,
line-authored, renderer choice/form/general, post-preprocess, and internal
dispatch admission. `actionPipelineWorkCounts.integration.test.js` protects
observable render/effect/persistence/schedule/ticker counts and repeats
successful and failed batches to detect leaked work.

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

## Cache and routing robustness coverage

`robustnessVtJourneys.integration.test.js` loads the same five projects used by
the browser regression gate:

- `duplicate-line-update-rejection`: rejected project replacement preserves
  the active game and its next canvas interaction.
- `routing-cycle-recovery`: bounded routing failure, host reset, and fresh
  input ownership after recovery.
- `cached-dialogue-save-rollback`: ADV append across a presentation checkpoint,
  followed by save, rollback, and load.
- `cached-nvl-clear-reentry`: clear a page, roll back, and re-enter without
  retaining or duplicating NVL rows.
- `cached-backlog-localization`: warmed history and speaker resources switch
  languages and return to the canonical project.

In VT capture mode, `vt:checkpoint` exposes a compact observation under
`window.__vtCheckpoint`; use `assert` steps against its pointer, dialogue,
history IDs, rendered text, pending effects, and timer count. These assertions
run before screenshots so a visually plausible wrong state cannot become a
passing reference. `vt:engineActions` models host dispatch and parses RTGL's
JSON-encoded `detail.actions` field. Normal player interactions use canvas
clicks through the standard renderer event handler.

For deliberate invalid-input scenarios, `_vtExpectedError` on a click payload
requires the action to throw the specified message substring. The helper
records whether state was preserved under `window.__vtExpectedError`; an
unexpected error or an action that succeeds is still a failure. These hooks
live only in the VT harness.

`presentationStateCache.regression.test.js` compares cold jumps, shuffled
reads, checkpoint eviction, resource-only edits, and cross-project/history
isolation with fresh projections. Seeded cases report their seed in the test
name. `projectRobustness.integration.test.js` also tests inactive-scene
validation and the exact 1,000/1,001 effect-batch boundary.
