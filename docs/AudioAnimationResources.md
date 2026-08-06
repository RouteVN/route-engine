# Audio Animation Resources

Status: proposed implementation plan.

## Executive Summary

Add reusable audio animation resources that deliberately follow the existing
visual animation model:

```text
audio animation resource
├── type: transition
│   ├── prev
│   └── next
└── type: update
    └── tween
```

The first product use case is BGM fading and crossfading. An authored BGM
action selects one resource at the point where the audio changes. Diffing then
determines which transition sides execute:

- add: `next` only
- remove: `prev` only
- replace: `prev` and `next`
- retained-property change: `type: update`

This is intentionally an action-edge model. The selected resource describes
the handoff between the resolved previous and next BGM states; it is not a
transition policy that must be attached separately to both audio nodes.

Route Graphics 1.39.0 supports node-owned inline `enter`, `update`, and `exit`
automation. That interface reads exit automation from the already-rendered
previous node, so it cannot implement a newly selected, one-reference
`prev`/`next` handoff by pass-through alone. Route Graphics must first gain a
next-render-owned audio handoff contract. The engine then compiles reusable
resources into that renderer contract; resource IDs and authoring-only fields
never reach Route Graphics.

## Decisions

### Use the visual animation structure

Audio resources have the same two structural kinds as visual animations:

- `transition` represents a lifecycle or source-identity handoff
- `update` represents mutation of a retained audio node

There are no separate `enter`, `exit`, `replace`, `fadeIn`, or `fadeOut`
resource types.

For `type: transition`:

- `next` without `prev` is entry
- `prev` without `next` is exit
- `prev` plus `next` is replacement

The engine determines the case from the previous/next diff, just as it does for
visual transition resources.

### Categorize transition operations by side first

The resource shape is side-first:

```yaml
type: transition
prev:
  fade: {}
next:
  fade: {}
```

This mirrors visual resources such as `prev.tween` and `next.tween`. A resource
is the atomic reusable unit; `prev` and `next` are coordinated parts of that
resource.

### Keep authoring separate from renderer input

Authoring uses resource references and concise audio operations. Route Graphics
continues to own concrete Web Audio scheduling.

The engine resolves:

- resource lookup
- previous/next BGM diffing
- target property values
- runtime master-volume scaling
- action-level speed
- skip policy

Route Graphics owns:

- a shared Web Audio start clock for both sides
- decode and delayed-start behavior
- outgoing/incoming instance overlap
- automation interruption from the renderer-owned current value
- exit cleanup
- `loopEnd` tail coordination

### Name the collection `audioAnimations`

The collection contains both `update` and `transition`, so
`resources.audioTransitions` would be misleading. Use:

```yaml
resources:
  audioAnimations:
```

The action selection field follows the existing visual spelling:

```yaml
bgm:
  animations:
    resourceId: music-crossfade
```

Context determines that `bgm.animations` resolves through
`resources.audioAnimations`, while visual `animations` selections continue to
resolve through `resources.animations`.

### Make selections action-scoped

An audio animation selection describes the change caused by its authored
action. It is not copied into settled BGM presentation state.

Consequences:

- a replacement action selects the animation for that replacement
- a removal action selects the animation for that removal
- later unrelated lines do not replay the animation
- save data stores settled BGM state, not active animation progress
- resource IDs and temporary side ownership do not become renderer node identity

## Goals

- define reusable BGM fade, crossfade, and retained-property animation resources
- select one resource once at the action that changes BGM
- mirror the visual `update` versus `transition` mental model
- make entry, exit, and replacement consequences of diffing
- support different `prev` and `next` fade timing in one resource
- preserve runtime music-volume and mute layering
- preserve Route Graphics audio-clock, replacement, interruption, and cleanup
  guarantees
- keep audio animations non-blocking for line and `renderComplete` completion
- provide exact schema, semantic, system, and browser/audio coverage

## Non-Goals

- changing sound-file resources into animation owners
- storing active fade progress in saves
- making `muted`, `loop`, `src`, `startAt`, `endAt`, `startDelayMs`, or playback
  commands tweenable
- synchronizing audio animations with visual animation timelines
- exposing arbitrary shared multi-target author timelines in the first release
- applying audio animation resources to the music-room player in the first release
- changing SFX or voice authoring in the first release
- preserving or introducing legacy `audioEffects` authoring in Route Engine
- implementing the feature through two externally visible renderer renders

## Authored Contract

### Transition resource

```yaml
resources:
  audioAnimations:
    music-crossfade:
      name: Music crossfade
      type: transition
      prev:
        fade:
          duration: 1000
          easing: easeInOutSine
      next:
        fade:
          duration: 1000
          easing: easeInOutSine
```

`prev.fade` means fade the outgoing side from its renderer-owned current volume
to silence. `next.fade` means start the incoming side at silence and fade it to
its resolved target volume.

### Replacement

```yaml
bgm:
  animations:
    resourceId: music-crossfade
  sounds:
    - id: main
      resourceId: battle-theme
      loop: true
      volume: 80
```

If the resolved previous BGM contains `main` with a different source identity,
the engine performs one replacement handoff:

```text
previous main: current volume -> 0
next main:                    0 -> 80
```

Both sides begin from the same Route Graphics reconciliation clock when the
incoming source is ready. Decode-delay behavior follows the renderer contract.

### Entry

The same action shape with no previous BGM runs only `next.fade`.

### Exit

```yaml
bgm:
  animations:
    resourceId: music-crossfade
  sounds: []
```

The empty desired sound list clears BGM after running `prev.fade`. The
selection remains available as transient current-action metadata even though
the settled presentation state contains no BGM.

### Asymmetric transition

```yaml
resources:
  audioAnimations:
    slow-in-fast-out:
      name: Slow in, fast out
      type: transition
      prev:
        fade:
          duration: 300
          easing: easeInQuad
      next:
        fade:
          delay: 200
          duration: 2000
          easing: easeOutSine
```

Each side has an independent delay, duration, and easing, while remaining one
atomic resource selection.

### One-sided transition

```yaml
resources:
  audioAnimations:
    fade-out-only:
      type: transition
      prev:
        fade:
          duration: 800
          easing: linear
```

Missing sides are immediate. On replacement, the previous side fades while the
next side begins at its resolved volume.

### Update resource

```yaml
resources:
  audioAnimations:
    smooth-volume:
      name: Smooth volume update
      type: update
      tween:
        volume:
          keyframes:
            - value: target
              duration: 500
              easing: easeInOutSine
```

Apply it while retaining the same BGM graph and source identity:

```yaml
bgm:
  volume: 30
  animations:
    resourceId: smooth-volume
  sounds:
    - id: main
      resourceId: peaceful-theme
      loop: true
```

The channel volume moves from the renderer-owned current value to the resolved
target. No playback source is restarted or duplicated.

### Action-level speed

```yaml
bgm:
  animations:
    resourceId: music-crossfade
    playback:
      speed: 2
  sounds:
    - id: main
      resourceId: battle-theme
      loop: true
```

`speed` is a finite number greater than zero. It divides all authored delays
and durations on both sides. A speed of `2` makes a 1000 ms fade take 500 ms;
`0.5` makes it take 2000 ms.

Audio animation playback does not support `loop` or `continuity`.

## Resource Schema

Add `src/schemas/projectData/audioAnimationResource.yaml`.

The top-level discriminator and exclusivity rules mirror
`animationResource.yaml`:

```yaml
$schema: http://json-schema.org/draft-07/schema#
title: Audio Animation Resource
type: object
required: [type]

properties:
  name:
    type: string
  type:
    enum: [update, transition]
  tween:
    $ref: "#/$defs/updateTween"
  prev:
    $ref: "#/$defs/transitionSide"
  next:
    $ref: "#/$defs/transitionSide"

allOf:
  - if:
      properties:
        type:
          const: update
    then:
      required: [tween]
      not:
        anyOf:
          - required: [prev]
          - required: [next]
  - if:
      properties:
        type:
          const: transition
    then:
      anyOf:
        - required: [prev]
        - required: [next]
      not:
        required: [tween]

additionalProperties: false
```

### Fade operation

```yaml
fade:
  type: object
  required: [duration]
  properties:
    delay:
      type: number
      minimum: 0
      default: 0
    duration:
      type: number
      minimum: 0
    easing:
      $ref: "#/$defs/easing"
  additionalProperties: false
```

Use the same easing enum as visual animation keyframes and Route Graphics audio
keyframes. Omitted easing defaults to `linear` during compilation.

`transitionSide` initially supports only `fade`:

```yaml
transitionSide:
  type: object
  minProperties: 1
  properties:
    fade:
      $ref: "#/$defs/fade"
  additionalProperties: false
```

This keeps the first renderer handoff contract bounded. Reusable transition
tweens for pan and playback rate can be added later without changing the
`prev`/`next` resource structure.

### Update tween

The first update surface supports channel `volume` and `pan`:

```yaml
updateTween:
  type: object
  minProperties: 1
  properties:
    volume:
      $ref: "#/$defs/volumeTweenProperty"
    pan:
      $ref: "#/$defs/panTweenProperty"
  additionalProperties: false
```

Each property has a non-empty keyframe array. Keyframe values are either a
property-valid number or the authoring-only string `target`:

```yaml
value:
  oneOf:
    - type: number
    - const: target
```

For `enter`-equivalent and retained `update` automation, the final keyframe
must resolve to the node's declared value. In reusable update resources, require
the last keyframe to be `target` during semantic validation. JSON Schema cannot
conveniently express a last-array-item rule, so enforce it in the resolver with
an action/resource path in the error.

The first BGM surface does not expose sound-level `playbackRate` updates.
Generic sound-level audio animation support may add it later; Route Graphics
already supports the property on sounds.

### Resource collection

Add to `src/schemas/projectData/resources.yaml`:

```yaml
audioAnimations:
  type: object
  description: Reusable audio update and transition resources
  patternProperties:
    "^.+$":
      $ref: "audioAnimationResource.yaml"
  additionalProperties: false
```

### Selection schema

Add separate audio selection definitions to
`src/schemas/presentationActions.yaml`. Do not reuse visual
`animationPlayback`, because audio animation playback supports only speed.

```yaml
audioAnimationPlayback:
  type: object
  properties:
    speed:
      type: number
      exclusiveMinimum: 0
  additionalProperties: false

audioAnimationSelection:
  type: object
  properties:
    resourceId:
      type: string
      minLength: 1
    playback:
      $ref: "#/definitions/audioAnimationPlayback"
  required: [resourceId]
  additionalProperties: false
```

Add `animations` to canonical `bgm` actions. Audio animations require the
canonical `sounds` form; the legacy `resourceId` shorthand remains accepted
without audio animation selection.

```yaml
allOf:
  - if:
      required: [animations]
    then:
      required: [sounds]
```

This avoids extending the legacy ambiguity where top-level BGM volume means
sound volume rather than canonical channel volume.

## BGM Diff Contract

The engine compares resolved previous and next canonical BGM graphs without
considering `animations` selection metadata.

### Identity

Channel identity remains `channel:bgm`.

Sound identity remains the stable authored sound ID after render-ID escaping.
Source identity remains the Route Graphics tuple:

- `src`
- `startAt`
- `endAt`
- `startDelayMs`

### Dispatch

For `type: transition`:

| Previous                | Next                    | Result                |
| ----------------------- | ----------------------- | --------------------- |
| absent                  | present                 | run `next`            |
| present                 | absent                  | run `prev`            |
| source/topology differs | source/topology differs | run `prev` and `next` |
| same graph              | same graph              | no-op                 |

For `type: update`:

- BGM channel and sound topology must be retained
- source identity must be retained
- at least one tweened declared property must change
- only declared tween properties run
- an unchanged tween property does not restart or interrupt automation

In the first release, applying the wrong structural type is an authored error:

- `type: transition` on a retained property-only change is rejected
- `type: update` on add, remove, topology change, or source replacement is
  rejected

Strict rejection prevents silent audio restarts and makes resource mistakes
visible with exact story/action paths. Fallback behavior can be considered only
after real authoring cases demonstrate a need.

### Multiple BGM sounds

A BGM transition is graph-scoped. All outgoing sounds belong to the `prev`
side and all incoming sounds belong to the `next` side. The fade is applied at
side-owned gain stages so a complete scheduled BGM channel can crossfade as one
unit without rewriting each sound's authored volume.

This is distinct from the persistent runtime music-volume gain. Side gains are
temporary renderer-owned handoff gains:

```text
effective gain = runtime music gain * authored channel gain
               * authored sound gain * handoff side gain
```

After completion, the next side settles without a handoff gain and the previous
side is released.

## Route Graphics Prerequisite

### Why inline transitions are insufficient

Route Graphics 1.39.0 reads:

- enter tracks from the next node
- update tracks from the next node
- exit tracks from the previous node

A transition selected by the current replacement/removal action was not present
on the already-rendered previous node. The engine therefore cannot add its
`prev` fade retroactively through the inline node field.

Do not solve this with two public `render()` calls. An intermediate render would
create extra reconciliation, `renderComplete` emissions, generation ownership,
and timing races.

### Required renderer capability

Add a next-render-owned audio handoff input to Route Graphics. Exact naming is
owned by the Route Graphics change, but the contract must carry:

- stable handoff ID
- target audio graph/node ID
- optional previous-side volume automation
- optional next-side volume automation
- shared reconciliation ownership

The handoff is supplied with the next render state and may target nodes resolved
from the previous state, next state, or both. Route Graphics normalizes it to
the same internal keyframe automation used by inline audio transitions.

Required semantics:

- one renderer validation pass sees previous audio, next audio, and handoff
- both ready sides use one Web Audio base time
- pending decode does not postpone outgoing teardown
- interruption begins from renderer-owned current gain
- outgoing cleanup waits for its finite fade and applicable `loopEnd` tail
- handoffs do not block `renderComplete`
- inline node transitions and a handoff may not target the same lifecycle side
  simultaneously
- existing inline and legacy `audioEffects` inputs remain compatible

The Route Graphics PR must include targeted AudioStage/normalization tests and
deterministic audio visual tests before the engine consumes its release.

## Engine Resolution Pipeline

Add a focused resolver module rather than growing
`constructRenderState.js` with schema interpretation. A suggested private module
is `src/resolveAudioAnimation.js`.

Inputs:

- previous resolved canonical BGM
- next resolved canonical BGM
- current action's audio animation selection
- `resources.audioAnimations`
- resolved runtime music volume and mute/skip state
- stable render/audio target IDs

Outputs:

- settled Route Graphics audio graph
- optional concrete renderer audio handoff/update input

Resolution order:

1. Resolve canonical previous and next BGM graphs without animation metadata.
2. Resolve the selected resource ID and reject a missing resource.
3. Validate that resource `type` matches the graph diff.
4. Normalize playback speed; default to `1`.
5. Resolve authored values against the final rendered target properties.
6. Scale delays and durations by speed.
7. Remove authoring-only `name`, `resourceId`, `target`, and playback metadata.
8. Emit concrete Route Graphics handoff/update data.
9. Omit all audio animation data when skip policy requires immediate settlement.

Errors must include both selection and resource paths, for example:

```text
[story.scenes.scene1.sections.intro.lines[4].actions.bgm.animations]
Audio animation resource "music-crossfade" does not exist.
```

## Runtime Settings and Interruption

### Master volume

Resolve final channel target values after applying runtime music volume. A
reusable update ending at `target` therefore lands on the actual Route Graphics
node value, not the pre-runtime authored value.

Example:

```text
authored BGM volume: 70
runtime music volume: 50
renderer channel volume and update target: 35
```

### Mute

`muteAll` and authored `muted` remain immediate hard gates. Fade resources
automate volume and do not tween booleans. Unmuting reveals the current
renderer-owned automation value.

### Skip

When `skipTransitionsAndAnimations` is true at dispatch, add, remove, replace,
and update settle immediately with no audio animation input.

If skip becomes true while a handoff is active, Route Graphics must settle the
next state immediately, cancel pending automation, and release the previous
side. Merely removing an inline declaration is insufficient under the current
renderer contract, so this behavior is part of the handoff prerequisite and
must have browser/audio coverage.

### New actions during active automation

A newer accepted BGM action supersedes active handoff/update automation:

- cancel or hold scheduled parameters at a shared current Web Audio time
- use renderer-owned current values as the new starting point
- reconcile from the currently authoritative graph to the latest desired graph
- never restore an outgoing source detached by a failed incoming replacement

## Completion, Navigation, and Persistence

- Audio animations do not block line completion, automatic progression, or
  Route Graphics `renderComplete`.
- The renderer retains outgoing playback internally until finite exit work and
  any completable `loopEnd` tail finish.
- Save payloads contain settled BGM declarations only.
- Active audio clocks, side gains, resource selections, and partial progress are
  not serialized.
- Load, engine reinitialization, and project replacement settle audio without
  replaying the historical line action's animation.
- Rollback restores the target BGM state immediately in the first release; a
  future explicit rollback-transition selection can be designed separately.
- Localization may replace/add audio animation resources and BGM actions, but
  cannot patch active renderer progress.

## Localization and Resource Patches

For parity with visual animation resources, add:

- `resource.audioAnimation` to `l10nData.yaml`
- `audioAnimation: "audioAnimations"` to resource patch collection maps
- a generated `validateResourceAudioAnimation` validator
- exact-schema validation and finite-number validation

Localized BGM action replacements continue to validate through the BGM
presentation-action schema. Resource-reference existence is checked after the
canonical project and selected localization package are composed.

Regenerate `src/generated/l10nPayloadValidators.js` and keep the synchronization
test passing.

## Implementation Sequence

### Phase 0: Route Graphics handoff contract

1. Specify next-render-owned previous/next audio handoffs.
2. Add normalization and schema validation.
3. Implement shared-clock previous/next side gain automation.
4. Implement interruption, decode-delay, failure, cleanup, and skip settlement.
5. Add targeted unit/system tests.
6. Add isolated deterministic audio visual tests.
7. Release Route Graphics.

This phase is a hard dependency for the one-reference authoring contract.

### Phase 1: Engine schema and resource validation

1. Add `audioAnimationResource.yaml`.
2. Add `resources.audioAnimations`.
3. Add `audioAnimationPlayback` and `audioAnimationSelection`.
4. Add canonical `bgm.animations` and forbid it with legacy BGM shorthand.
5. Add project-data schema acceptance and rejection cases.
6. Add localization resource-patch schemas and regenerate validators.

### Phase 2: Engine diff and compilation

1. Upgrade the Route Graphics dependency and VT bundle to the released handoff
   version.
2. Keep action-scoped BGM animation metadata available to render construction.
3. Add the isolated audio animation resolver.
4. Compile transition resources into renderer handoffs.
5. Compile update resources into concrete retained-node automation.
6. Apply runtime volume, mute, speed, and skip rules.
7. Add exact-path semantic errors.

### Phase 3: Verification and documentation

1. Add targeted render-state and action/system tests.
2. Add isolated browser fixtures for entry, exit, replacement, update, skip, and
   interruption.
3. Run Route Graphics deterministic audio visual coverage against the released
   renderer contract.
4. Document authored resources and actions in `docs/RouteEngine.md`.
5. Add migration and Creator-facing examples.

### Phase 4: Follow-on surfaces

After BGM stabilizes, extend the same generic resource model to:

- individual canonical BGM sounds where explicit per-sound selection is needed
- SFX channels and sounds
- voice channel and sounds
- optional music-room player transitions
- transition-side pan and playback-rate operations

These extensions must reuse the same resource schema or add backwards-compatible
properties; they must not introduce separate fade-in/fade-out resource types.

## Test Plan

### Schema tests

Accept:

- two-sided, one-sided, and asymmetric transition resources
- update resources with volume/pan tracks ending at `target`
- finite positive action-level speed
- canonical BGM action references

Reject:

- missing or unsupported `type`
- `update` without `tween`
- `update` with `prev` or `next`
- `transition` without either side
- `transition` with `tween`
- empty transition sides
- negative/non-finite delay or duration
- unsupported easing
- empty update keyframes
- update resources whose final keyframe is not `target`
- zero/non-finite speed
- BGM animation selection combined with legacy `resourceId` shorthand

### Resolver and render-state tests

- no previous BGM emits next-only handoff
- removal emits previous-only handoff
- source replacement emits both sides once
- same BGM emits no handoff
- wrong structural type throws with exact action/resource paths
- update retains source identity and emits no replacement
- target resolution uses final runtime-scaled volume
- speed scales delay and duration on every applicable side
- mute remains a hard gate
- skip emits immediate settled audio
- duplicate/escaped authored sound IDs remain deterministic
- resource objects are never mutated
- authoring-only fields do not reach render output

### State and lifecycle tests

- action selection does not persist into settled BGM presentation state
- save/load does not serialize or replay partial animation progress
- rollback settles restored BGM without replaying the source action
- localization validates and resolves audio animation resources
- reinitialization/disposal cannot restore prior-generation handoff state
- a newer BGM action supersedes active automation without stale cleanup deleting
  the newest graph

### Browser and audio-path tests

Following `AGENTS.md`, do not hand the feature back for manual verification until
both targeted state-transition coverage and the real browser/audio path pass.

Create isolated fixtures that each exercise one behavior:

1. entry fade from silence
2. removal fade to silence and delayed cleanup
3. same-ID source replacement crossfade
4. asymmetric previous/next timing
5. retained channel volume update
6. transition interruption by a newer replacement
7. skip enabled before dispatch
8. skip enabled during active fade
9. incoming decode delay while outgoing cleanup continues

Engine VT must prove the authored click/input path reaches the expected concrete
renderer handoff. Route Graphics deterministic audio visual tests must prove the
actual gain envelope and overlap. A screenshot-only assertion is insufficient
for an audio timing feature.

## Migration and Compatibility

- Existing BGM actions remain valid and immediate.
- Legacy single-resource BGM shorthand remains valid but cannot select audio
  animation resources.
- Canonical BGM actions opt in with `animations.resourceId`.
- Existing visual animation resources and selections are unchanged.
- Route Graphics inline audio transitions remain supported for direct renderer
  consumers; Route Engine does not expose them as an alternate authored path in
  the first release.
- Do not expose both inline audio tracks and resource selection in Route Engine;
  one authoring path avoids precedence and validation ambiguity.

## Pull Request Breakdown

Keep implementation reviewable and independently revertible:

1. Route Graphics contract, implementation, unit tests, and deterministic AVT.
2. Route Engine schema/resource/L10n support without runtime activation.
3. Route Engine resolver and Route Graphics dependency integration.
4. Engine browser fixtures, public documentation, and Creator integration notes.

Do not combine the Route Graphics behavior change and all engine authoring work
in one cross-repository review.

## Acceptance Criteria

The feature is complete when:

1. one `bgm.animations.resourceId` selection can fade entry, fade exit, or
   crossfade replacement based solely on diffing
2. transition resources use `prev.fade` and `next.fade`
3. retained-property updates use `type: update` and `tween`
4. no separate enter/exit/replace resource types exist
5. authored resource metadata never reaches Route Graphics
6. runtime volume, mute, speed, skip, interruption, and cleanup contracts pass
7. audio animations remain non-blocking
8. schemas, generated localization validators, system tests, engine browser
   fixtures, and Route Graphics deterministic audio visual tests all pass
9. existing BGM and visual animation authoring remains compatible

## Open Implementation Detail

The Route Graphics handoff field name and exact normalized JSON shape should be
finalized in its prerequisite PR. The behavior described here is locked; naming
may adapt to Route Graphics conventions without changing the Route Engine
authoring contract.
