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
- an independent runtime master-volume control
- action-level speed
- explicit skip settlement control

Route Graphics owns:

- a shared Web Audio start clock when both sides are ready at reconciliation
- decode and delayed-start behavior
- outgoing/incoming instance overlap
- independent master and authored/automation gain layers
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

### Own each accepted action occurrence

Action scope also needs an occurrence identity. An authored story/action path is
not sufficient: a settings-only render can observe the same current action
metadata without accepting it again, while rollback or a later visit can
legitimately execute the same authored path again.

Extend the system store's existing transactional playback ownership with a
monotonic `bgmActionOccurrenceId`. Every successfully accepted BGM action gets
an immutable identity equivalent to:

```yaml
lifecycleGeneration: 3
lineEntryId: 27
bgmActionOccurrenceId: 9
```

The `lineEntryId` records the line occurrence; the BGM-specific counter keeps
ownership explicit instead of assuming that an authored path or render count is
an action edge. A legitimate revisit receives new line-entry and BGM occurrence
IDs even when its path and payload are identical. Settings changes, unrelated
renders, and repeated `selectRenderState()` or `prepareRenderState()` calls do
not allocate a new occurrence. Allocation is part of the accepted action's
transaction: failed validation, failed action execution, or transaction rollback
cannot leak an occurrence ID or pending record.

For an occurrence with an animation selection, the engine retains a pending
record containing the identity, selection, and immutable previous/next
canonical BGM snapshots. Selection is pure: every render prepared before
commit carries the same occurrence-keyed handoff or update. After
`routeGraphics.render()` accepts a current-lifecycle render,
`commitRenderState()` consumes that occurrence. Later renders omit it. If
renderer dispatch throws or commit is not reached, the occurrence remains
pending and a retry uses the same identity and payload.

The ownership state machine is:

- accepted action: allocate the occurrence and mark its animation `pending`
- render selection/preparation: read `pending` without changing it
- failed renderer dispatch: remain `pending`
- accepted current-lifecycle render commit: atomically mark that occurrence
  `consumed`
- later commit of another prepared render for the consumed occurrence: no-op

Route Graphics must accept an identical duplicate occurrence idempotently
without restarting automation. Reusing an occurrence ID with different
handoff/update content is a contract error. Deduplication is scoped to the
engine lifecycle generation, so a later visit to the same authored action is a
new animation rather than a false duplicate. Pending and consumed occurrence
metadata is engine-owned runtime state and is never serialized.

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

When the incoming source is ready at reconciliation, both sides begin from the
same Route Graphics Web Audio base time. When decoding delays the incoming
source, the outgoing fade still begins immediately and is never postponed. The
incoming source and its fade begin together only after decode, validation, and
`startDelayMs` complete. The remaining overlap may therefore be shorter, or an
audible gap may occur if the outgoing side finishes first.

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

Each handoff side must also own an immutable channel-processing snapshot. The
previous branch keeps the previous graph's authored channel `volume`, `pan`, and
`muted` values and its sound-local processing; the next branch uses the next
graph's values. Reconciliation of the stable public `channel:bgm` target must
not replace processing shared by both branches. Otherwise a replacement that
changes channel volume, pan, or mute would apply the next value to outgoing
audio before its fade completes.

Conceptually, Route Graphics keeps occurrence-scoped internal branches beneath
one runtime output stage:

```text
prev sounds -> prev sound processing -> prev channel volume/pan/mute -> prev side gain --\
                                                                                         +-> runtime music master -> muteAll gate
next sounds -> next sound processing -> next channel volume/pan/mute -> next side gain --/
```

The runtime output stage is the only shared processing above the two branches:
its persistent music master gain affects both sides uniformly, and its separate
global `muteAll` gate affects both sides immediately. No authored BGM channel
gain, panner, or mute gate is shared during a handoff. Internal branch IDs are
namespaced by the action occurrence; they do not replace the stable public
channel or sound identity contract.

This is also distinct from retained-property automation. Route Graphics must
keep the master gain, per-side authored channel processing, authored sound
processing, temporary side gains, and retained automation as independent
stages:

```text
effective gain per side = runtime master gain * authored side channel gain
                        * authored side sound gain * handoff side gain
```

After completion, the next side settles without a handoff gain and the previous
side and its processing snapshot are released. The next snapshot becomes the
retained channel processing. A runtime setting render may update only the
shared runtime output stage; it cannot reconcile or rebase either side's local
state or fade envelope.

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

- lifecycle-scoped action-occurrence ID and occurrence-derived stable handoff ID
- target audio graph/node ID
- complete immutable previous- and next-side channel-processing snapshots
- optional previous-side volume automation
- optional next-side volume automation
- shared reconciliation ownership
- an independent persistent master-volume gain/control
- independent authored side mute gates and a global runtime mute gate
- an explicit automation-settlement control that is valid without a handoff or
  current animation selection

The normalized renderer input must include an explicit command equivalent to:

```yaml
audioAnimationControl:
  commandId: 42
  operation: settle
```

The exact field name may follow Route Graphics conventions, but the command is
not optional behavior. `commandId` is monotonically increasing within an engine
lifetime, making repeated renders and stale commands deterministic. A render
without this command preserves active automation; a render carrying a newer
accepted `settle` command performs settlement even if it has no handoff, update,
or current animation selection.

The handoff is supplied with the next render state and may target nodes resolved
from the previous state, next state, or both. Route Graphics normalizes it to
the same internal keyframe automation used by inline audio transitions.

Required semantics:

- one renderer validation pass sees previous audio, next audio, and handoff
- an identical duplicate action occurrence is idempotent and cannot restart,
  reschedule, or extend automation; conflicting content for the same occurrence
  ID is rejected
- previous and next channel volume, pan, authored mute, and sound-local state
  remain isolated for the lifetime of a handoff
- both sides use one Web Audio base time only when the incoming side is ready at
  reconciliation
- outgoing automation begins immediately at reconciliation and pending decode
  never postpones its fade, teardown, or cleanup
- a delayed incoming source starts its fade from the beginning when playback
  actually starts; its automation does not advance silently during decode
- incoming decode/validation failure does not restore or postpone the outgoing
  side
- interruption begins from renderer-owned current gain
- outgoing cleanup waits for its finite fade and applicable `loopEnd` tail
- handoffs do not block `renderComplete`
- master-volume changes multiply active local automation without cancelling,
  restarting, rescaling, or extending its timeline
- authored and global mute changes use independent gates and never cancel,
  hold, rewrite, or settle scheduled volume/side-gain automation
- an explicit settle control cancels both active handoffs and retained-property
  update automation immediately at the latest declared state
- settle commands are monotonic and idempotent; stale commands cannot affect a
  newer renderer generation
- ordinary omission of animation input does not settle or cancel active
  automation
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

- pending accepted BGM action occurrence, including lifecycle generation,
  `lineEntryId`, `bgmActionOccurrenceId`, selection, and immutable previous/next
  canonical BGM snapshots
- `resources.audioAnimations`
- resolved runtime music volume and mute/skip state
- stable render/audio target IDs

Outputs:

- settled Route Graphics audio graph with authored/local volume separate from
  runtime master volume
- optional occurrence-keyed concrete renderer audio handoff/update input with
  isolated previous/next channel-processing snapshots
- explicit renderer automation-settlement control when skip is active

Resolution order:

1. Read the pending accepted occurrence without consuming it. A render with no
   pending occurrence has no action animation to rediscover from the current
   authored path.
2. Read its captured canonical previous and next BGM graphs without animation
   metadata.
3. Resolve the selected resource ID and reject a missing resource.
4. Validate that resource `type` matches the captured graph diff.
5. Normalize playback speed; default to `1`.
6. Resolve authored values against unscaled authored/local target properties.
7. Scale delays and durations by speed.
8. Remove authoring-only `name`, `resourceId`, `target`, and playback metadata.
9. Emit runtime music volume through its independent renderer master-gain
   control.
10. Emit concrete Route Graphics handoff/update data with the occurrence ID when
    skip is false.
11. When skip is true, omit new animation input and emit the explicit settle
    control even when there is no pending occurrence. Omission alone is never a
    settlement signal.

Resolution and render-state selection do not consume the occurrence. The engine
associates the occurrence with the prepared render ID in private sidecar
metadata, matching the existing persistent-animation commit pattern.
`commitRenderState()` consumes it only after Route Graphics accepts that exact
current-lifecycle render. Multiple prepared renders for one occurrence therefore
produce deterministic duplicate handoffs, while a settings-only render after a
successful commit cannot regenerate one. A newly accepted action supersedes an
older pending occurrence; Route Graphics interruption semantics start the new
occurrence from renderer-owned current values.

A skipped render also associates and consumes any pending occurrence after the
renderer accepts its settlement control, despite emitting no new handoff or
update. Disabling skip later cannot replay the skipped action.

Errors must include both selection and resource paths, for example:

```text
[story.scenes.scene1.sections.intro.lines[4].actions.bgm.animations]
Audio animation resource "music-crossfade" does not exist.
```

## Runtime Settings and Interruption

### Master volume

Do not pre-scale authored BGM channel volume by runtime music volume. Route
Graphics must expose a separate persistent master-gain stage/control so local
animation and device settings remain independently multiplicative.

A reusable update ending at `target` resolves to the authored/local channel
value. Changing `musicVolume` updates only the independent master gain and must
not cancel, restart, rebase, rescale, or extend an active fade or retained
update.

Example:

```text
authored BGM volume: 70
runtime music volume: 50
renderer local channel volume and update target: 70
renderer master volume: 50
effective output before sound/side gains: 35
```

The renderer input is conceptually:

```yaml
id: channel:bgm
type: audio-channel
volume: 70
masterVolume: 50
```

The exact master field name may follow Route Graphics conventions. Its separate
gain parameter and reconciliation behavior are required: a settings-only render
changes `masterVolume`, leaves `volume` unchanged, and does not touch scheduled
local volume automation.

This requires replacing the current combined BGM channel volume emitted by
`addBgm`. Legacy and canonical BGM must preserve their existing effective output
while using separate local and master renderer parameters.

### Mute

`muteAll` and authored `muted` remain immediate hard gates. They must not be
implemented by setting the same gain parameter used for a handoff fade or a
retained volume update.

Route Graphics must use independent gain parameters:

- each handoff side owns an authored channel mute gate captured in that side's
  processing snapshot
- a retained channel keeps an authored mute gate separate from its automatable
  volume gain
- the runtime output stage owns a global `muteAll` gate separate from the
  persistent music master gain

A gate change sets only its own parameter to `0` or `1` at the current Web Audio
time. It does not cancel, hold, rewrite, restart, or settle automation on local
volume or temporary side gains. Automation clocks continue while inaudible, so
unmuting reveals the renderer-owned envelope value for that instant, not its
initial value or final target. Fade resources automate volume and never tween
the boolean gates.

### Skip

When `skipTransitionsAndAnimations` is true at dispatch, add, remove, replace,
and update settle immediately. The engine emits no new animation input and does
emit an explicit renderer settlement control on every skipped render, including
renders whose current action has no audio animation selection.

If skip becomes true while either a handoff or retained `type: update`
automation is active, Route Graphics must cancel all applicable scheduled
automation at one shared current Web Audio time. It must then settle handoff
targets at the next declared state, release previous handoff sides, and set
retained update targets to their latest declared volume or pan immediately.
Merely removing an inline declaration is insufficient under the current
renderer contract: ordinary omission must allow scheduled automation to
continue, and when a retained property's declaration is unchanged its envelope
otherwise has no reason to stop. The explicit signal is therefore part of the
renderer prerequisite and active handoff and retained-update settlement must
both have browser/audio coverage.

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
- Active audio clocks, side gains, resource selections, occurrence
  pending/consumed state, and partial progress are not serialized.
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
3. Add occurrence-keyed idempotent handoff acceptance.
4. Add isolated previous/next channel-processing snapshots.
5. Add an independent persistent master-volume gain stage/control plus separate
   per-side authored and global runtime mute gates.
6. Implement shared-clock previous/next side gain automation for ready sources
   and immediate outgoing progress during delayed incoming decode.
7. Add explicit automation settlement independent of handoff/selection input.
8. Implement interruption, failure, cleanup, and idempotent settlement.
9. Add targeted unit/system tests.
10. Add isolated deterministic audio visual tests.
11. Release Route Graphics.

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
2. Allocate transactional BGM action-occurrence ownership beneath the existing
   line-entry identity and consume it only after accepted render commit.
3. Keep pending action-scoped BGM animation metadata and canonical graph
   snapshots available to render construction.
4. Add the isolated audio animation resolver.
5. Compile transition resources into occurrence-keyed renderer handoffs.
6. Compile update resources into concrete retained-node automation.
7. Emit authored BGM volume and runtime master volume as independent renderer
   controls.
8. Emit explicit settlement whenever skip is active, including without a
   current animation selection.
9. Emit authored and runtime mute through independent gates and apply speed
   rules.
10. Add exact-path semantic errors.

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

### Route Graphics prerequisite tests

- normalizing the same occurrence and byte-equivalent handoff twice creates one
  automation schedule and preserves its original base time
- conflicting handoff/update content for an accepted occurrence ID is rejected
- previous and next channel volume, pan, authored mute gates, and sound-local
  processing remain distinct until previous-side cleanup
- changing the runtime master during a handoff or retained update touches only
  the persistent master parameter
- toggling `muteAll` during an active handoff touches only the global mute gate;
  scheduled side-gain events and their base times remain unchanged, and unmute
  exposes the values expected at the advanced audio clock
- toggling authored `muted` during an active retained volume update touches only
  its authored gate; scheduled volume events and their base time remain
  unchanged, and unmute exposes the value expected at the advanced audio clock
- settlement cancels active handoff and retained-update parameters but never
  aliases either mute gate

### Resolver and render-state tests

- no previous BGM emits next-only handoff
- removal emits previous-only handoff
- source replacement emits both sides once
- same BGM emits no handoff
- wrong structural type throws with exact action/resource paths
- update retains source identity and emits no replacement
- prepared renders for one pending action carry the same occurrence ID and
  byte-equivalent handoff/update content
- a settings-only render after occurrence commit emits no handoff/update
- target resolution uses authored/local volume without runtime pre-scaling
- runtime music volume is emitted through an independent master control
- changing runtime music volume mid-animation does not emit replacement/update
  automation or alter authored keyframe timing
- a replacement that changes channel volume, pan, or authored mute emits
  distinct previous/next processing snapshots
- the previous snapshot remains unchanged when the next graph or runtime master
  is reconciled
- speed scales delay and duration on every applicable side
- authored and global mute values are emitted through gates independent from
  automatable volume and handoff side gains
- skip emits explicit immediate settlement even without a current animation
  selection
- settlement command IDs increase monotonically and stale commands are ignored
- ordinary omission of animation input does not settle active automation
- duplicate/escaped authored sound IDs remain deterministic
- resource objects are never mutated
- authoring-only fields do not reach render output

### State and lifecycle tests

- action selection does not persist into settled BGM presentation state
- successful acceptance allocates one BGM occurrence beneath the current
  `lineEntryId`; repeated render selection and settings renders allocate none
- successful render commit consumes the pending occurrence exactly once
- failed renderer dispatch leaves the same occurrence pending for deterministic
  retry, and Route Graphics accepts the identical duplicate without restarting
- revisiting the same authored line allocates a new occurrence and runs its
  animation exactly once
- save/load does not serialize or replay partial animation progress
- rollback settles restored BGM without replaying the source action
- localization validates and resolves audio animation resources
- reinitialization/disposal cannot restore prior-generation handoff state
- a newer BGM action supersedes active automation without stale cleanup deleting
  the newest graph
- enabling skip during a retained update cancels its automation and settles the
  latest declared property value immediately
- changing runtime music volume during a handoff or retained update preserves
  local automation progress and changes only the independent master gain
- toggling `muteAll` during a handoff preserves the active side-gain clocks and
  unmuting reveals their current values
- toggling authored `muted` during a retained volume update preserves that
  update's clock and unmuting reveals its current value

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
8. skip enabled during an active handoff fade
9. retained-property update continues onto a line with no animation selection,
   then skip explicitly settles it
10. incoming decode delay while the outgoing fade and cleanup continue, then
    incoming fade starts from its beginning at actual playback
11. incoming decode/validation failure without outgoing postponement or
    restoration
12. runtime music-volume change during an active handoff
13. runtime music-volume change during an active retained-property update
14. settings-only rerender while an animated action remains current, proving
    the accepted occurrence does not restart
15. leave and revisit the same authored animated line, proving the new
    occurrence runs exactly once
16. replacement with a different authored channel volume, proving the outgoing
    branch retains its previous volume through its fade
17. replacement with a different authored channel pan, proving the outgoing and
    incoming branches keep independent panners
18. replacement with different authored `muted` values, proving each handoff
    branch keeps its own mute gate
19. `muteAll` mute/unmute during an active handoff, proving both fade clocks
    continue and unmute reveals their in-progress values
20. authored `muted` mute/unmute during an active retained volume update,
    proving its automation clock continues and unmute reveals its in-progress
    value

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
6. every accepted BGM action occurrence is dispatched at most once after commit,
   identical retries are idempotent, and a legitimate authored-line revisit
   receives a new occurrence
7. outgoing and incoming handoff sides retain independent authored channel
   volume, pan, mute, and sound-local processing snapshots
8. runtime volume remains an independent gain layer throughout active
   automation
9. authored and global mute gates remain independent from volume/side-gain
   automation, whose clocks continue while muted
10. explicit skip settlement, mute, speed, interruption, decode-delay, failure,
    and cleanup contracts pass
11. audio animations remain non-blocking
12. schemas, generated localization validators, system tests, engine browser
    fixtures, and Route Graphics deterministic audio visual tests all pass
13. existing BGM and visual animation authoring remains compatible

## Open Implementation Detail

The Route Graphics handoff field name and exact normalized JSON shape should be
finalized in its prerequisite PR. The behavior described here is locked; naming
may adapt to Route Graphics conventions without changing the Route Engine
authoring contract.
