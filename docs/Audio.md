# Audio Channel Design

This document defines the intended channel-based audio interface for
`route-engine` and `route-graphics`.

It is a design and interface document. The current engine still emits the older
`bgm`, `sfx`, and `voice` presentation actions into flat Route Graphics `sound`
audio nodes.

## Goals

- model audio with the same declarative state/effect split used by Route
  Graphics visual nodes and animations
- keep channels out of `resources`
- keep audio nodes focused on current audio state
- put automation and filters in a separate `audioEffects` array
- support mixer-style channel volume without a separate mixer concept
- support smooth volume fades and crossfades
- preserve existing `bgm`, `sfx`, and `voice` authoring through normalization
- leave room for pan, playback-rate automation, and Web Audio filters

## Non-Goals

- no nested audio channels in the first implementation
- no command-style `play` / `stop` operation model in Route Graphics
- no required channel declarations in project resources
- no first implementation dependency on reverb, delay, or EQ filters

## Render-State Shape

Route Graphics should accept two audio-facing top-level arrays:

```yaml
audio: []
audioEffects: []
```

`audio` defines the desired audio graph state. `audioEffects` defines typed
effects that target audio node IDs.

All `audio` node IDs and `audioEffects` IDs share one render-state namespace.
IDs must be globally unique within a rendered frame. This keeps `targetId`
resolution unambiguous and avoids channel-scoped lookup rules.

```yaml
audio:
  - id: music
    type: audio-channel
    volume: 80
    muted: false
    children:
      - id: bgm
        type: sound
        src: theme
        loop: true
        volume: 100

audioEffects:
  - id: music-volume
    type: audioTransition
    targetId: music
    properties:
      volume:
        enter: { from: 0, duration: 1000, easing: linear }
        exit: { to: 0, duration: 1000, easing: linear }
        update: { duration: 300, easing: linear }

  - id: music-lowpass
    type: audioFilter
    targetId: music
    filterType: lowpass
    frequency: 12000
    q: 1

  - id: music-lowpass-sweep
    type: audioTransition
    targetId: music-lowpass
    properties:
      frequency:
        update: { duration: 500, easing: linear }
```

For compatibility, flat `sound` nodes should remain valid:

```yaml
audio:
  - id: click
    type: sound
    src: click
```

Flat sounds are treated as children of an implicit root channel.

## Audio Nodes

The first implementation has two audio node types:

- `audio-channel`
- `sound`

Effects are not audio nodes. They live in `audioEffects`.

### Audio Channels

An `audio-channel` is a bus/container. It does not play a file. It controls its
child sounds.

```yaml
id: music
type: audio-channel
volume: 80
muted: false
pan: 0
children: []
```

Fields:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | string | required | Stable globally unique channel ID |
| `type` | `audio-channel` | required | Node type |
| `volume` | number | `100` | Local channel volume, `0` to `100` |
| `muted` | boolean | `false` | Forces this channel's effective output to zero |
| `pan` | number | `0` | Stereo pan, `-1` left to `1` right |
| `children` | sound[] | `[]` | Sound nodes owned by this channel |

First implementation rule:

- `audio-channel.children` may contain `sound` nodes only.
- nested `audio-channel` nodes are invalid until explicitly supported.

### Sounds

A `sound` is a playable source. It resolves to one Web Audio source instance.

```yaml
id: bgm
type: sound
src: theme
volume: 100
muted: false
pan: 0
loop: true
startDelayMs: 0
playbackRate: 1
startAt: 0
endAt: null
```

Fields:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | string | required | Stable globally unique sound ID |
| `type` | `sound` | required | Node type |
| `src` | string | required | Audio asset alias or source URL |
| `volume` | number | `100` | Local sound volume, `0` to `100` |
| `muted` | boolean | `false` | Forces this sound's effective output to zero |
| `pan` | number | `0` | Stereo pan, `-1` left to `1` right |
| `loop` | boolean | `false` | Loop playback |
| `startDelayMs` | number | `0` | Delay in milliseconds before playback starts |
| `playbackRate` | number | `1` | Playback speed multiplier |
| `startAt` | number | `0` | Start offset in seconds |
| `endAt` | number/null | `null` | Optional end time in seconds |

`startAt` and `endAt` are intended for partial playback. If `endAt` is present,
duration is `endAt - startAt`.

Legacy Route Graphics `sound.delay` may be accepted as a migration alias, but
new render state should use `startDelayMs`. This avoids confusion with the
future `delay` audio filter.

## Audio Effects

`audioEffects` is a typed effect list. It contains automation and processing
nodes that target audio node IDs or other effect IDs.

Supported effect item types:

- `audioTransition`
- `audioFilter`

Effects are render-state entries, not resources.

### Validation Rules

Route Graphics should reject invalid audio render state instead of guessing:

- duplicate IDs across `audio` nodes and `audioEffects`
- `audio-channel.children` entries whose type is not `sound`
- nested `audio-channel` nodes in the first implementation
- `audioTransition.targetId` that cannot be resolved in the state used for its
  lifecycle
- `audioFilter.targetId` that does not resolve to an `audio-channel` or `sound`
  in the first implementation
- transition phases missing required `duration` or `easing`
- transition phases that use an unsupported easing name
- unknown audio node, effect, filter, or automated property types

## Audio Transitions

An `audioTransition` automates property changes on a target.

```yaml
audioEffects:
  - id: music-transitions
    type: audioTransition
    targetId: music
    properties:
      volume:
        enter: { from: 0, duration: 1000, easing: linear }
        exit: { to: 0, duration: 1000, easing: linear }
        update: { duration: 300, easing: linear }
      pan:
        update: { duration: 200, easing: linear }
```

Fields:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | string | required | Stable effect ID |
| `type` | `audioTransition` | required | Effect type |
| `targetId` | string | required | Audio node or effect ID to automate |
| `properties` | object | required | Property automation map |

`targetId` may reference:

- an `audio-channel`
- a `sound`
- an `audioFilter`

Transition phases:

| Phase | When it applies | Transition source |
| --- | --- | --- |
| `enter` | Target appears in the next render state | next `audioEffects` |
| `exit` | Target disappears from the next render state | previous `audioEffects` |
| `update` | Target remains but the property value changes | next `audioEffects` |

Transition phase fields:

| Phase | Required fields | Value rule |
| --- | --- | --- |
| `enter` | `from`, `duration`, `easing` | Starts at `from`; ends at the target's declared value |
| `exit` | `to`, `duration`, `easing` | Starts at the current value; ends at `to` |
| `update` | `duration`, `easing` | Starts at the current value; ends at the next declared value |

`duration` is in milliseconds. `easing` is required and must not be defaulted
silently. The first implementation only needs to support `linear`.

Using the previous state's `audioEffects` for `exit` lets a removed sound or
filter fade out without keeping a dead target in the next render state.

First implementation target:

```yaml
audioEffects:
  - id: music-volume
    type: audioTransition
    targetId: music
    properties:
      volume:
        enter: { from: 0, duration: 1000, easing: linear }
        exit: { to: 0, duration: 1000, easing: linear }
        update: { duration: 300, easing: linear }
```

Future transition targets:

```yaml
audioEffects:
  - id: bgm-transitions
    type: audioTransition
    targetId: bgm
    properties:
      pan:
        update: { duration: 200, easing: linear }
      playbackRate:
        update: { duration: 500, easing: linear }
```

## Audio Filters

An `audioFilter` is a Web Audio processing effect. In the first implementation,
it targets an audio node.

```yaml
audioEffects:
  - id: music-lowpass
    type: audioFilter
    targetId: music
    filterType: lowpass
    frequency: 900
    q: 1
```

Fields:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | string | required | Stable filter effect ID |
| `type` | `audioFilter` | required | Effect type |
| `targetId` | string | required | Audio node ID to process |
| `filterType` | string | required | Web Audio filter kind |
| `enabled` | boolean | `true` | Disabled filters are bypassed |

Filter-specific fields depend on `filterType`.

`targetId` may reference:

- an `audio-channel`
- a `sound`

When multiple filters target the same node, they are applied in `audioEffects`
order.

Future versions may allow an `audioFilter` to target another `audioFilter`.
That requires graph validation, topological ordering, and cycle rejection. It
should not be part of the first filter implementation.

### Planned Filter Types

| `filterType` | Web Audio node | Common fields |
| --- | --- | --- |
| `lowpass` | `BiquadFilterNode` | `frequency`, `q` |
| `highpass` | `BiquadFilterNode` | `frequency`, `q` |
| `bandpass` | `BiquadFilterNode` | `frequency`, `q` |
| `notch` | `BiquadFilterNode` | `frequency`, `q` |
| `lowshelf` | `BiquadFilterNode` | `frequency`, `gain` |
| `highshelf` | `BiquadFilterNode` | `frequency`, `gain` |
| `peaking` | `BiquadFilterNode` | `frequency`, `q`, `gain` |
| `allpass` | `BiquadFilterNode` | `frequency`, `q` |
| `delay` | `DelayNode` plus feedback gain | `delayTime`, `feedback`, `wet` |
| `compressor` | `DynamicsCompressorNode` | `threshold`, `knee`, `ratio`, `attack`, `release` |
| `reverb` | `ConvolverNode` | `impulseSrc`, `wet` |

Filters are not required for the first implementation. The interface should be
designed now so filters can be added without changing the audio tree shape.

### Filter Lifecycle

`enabled` is an immediate bypass flag. It should not be treated as a fade.

Smooth filter enter and exit need one of these explicit strategies:

- transition filter parameters toward or away from neutral values
- use a filter-provided `wet` parameter when the filter supports wet/dry mixing

For example, a lowpass filter can be made less audible by transitioning
`frequency` back toward a high neutral value before the filter is removed.
Removing a filter without such a transition may change the sound immediately.

### Filter Automation

Filter parameters are automated by targeting the filter effect ID with an
`audioTransition`.

```yaml
audioEffects:
  - id: music-lowpass
    type: audioFilter
    targetId: music
    filterType: lowpass
    frequency: 12000
    q: 1

  - id: music-lowpass-transition
    type: audioTransition
    targetId: music-lowpass
    properties:
      frequency:
        update: { duration: 600, easing: linear }
      q:
        update: { duration: 300, easing: linear }
```

No dotted paths are needed.

## Volume

Channel volume and sound volume stack multiplicatively.

```yaml
audio:
  - id: music
    type: audio-channel
    volume: 50
    children:
      - id: bgm
        type: sound
        src: theme
        volume: 50
```

Effective volume:

```text
channel 50% * sound 50% = 25%
```

In Web Audio terms:

```js
effectiveGain = (channel.volume / 100) * (sound.volume / 100);
```

This matches normal mixer behavior: source gain is scaled by track/channel gain.

If both channel and sound volumes transition at the same time, both ramps apply.
Authors should use channel transitions for group fades and sound transitions for
individual sound fades.

## Add, Update, Remove

Route Graphics should keep audio declarative.

- Added audio node or effect: create it and apply `enter` transition if a
  matching `audioTransition` exists in the next `audioEffects`.
- Updated audio node or effect: update changed properties and apply `update`
  transition if a matching `audioTransition` exists in the next `audioEffects`.
- Removed audio node or effect: keep the internal node alive until `exit`
  transition from the previous `audioEffects` completes, then stop and clean up.

No explicit `op: play` or `op: stop` is needed in Route Graphics render state.

### Same ID, Different Source

If a `sound` keeps the same `id` but changes `src`, treat it as replacement:

1. old source uses its `exit` transition
2. new source uses its `enter` transition
3. both internal playback instances may coexist during the crossfade

Example:

```yaml
# previous
audio:
  - id: music
    type: audio-channel
    children:
      - id: bgm
        type: sound
        src: track-a

audioEffects:
  - id: bgm-volume
    type: audioTransition
    targetId: bgm
    properties:
      volume:
        exit: { to: 0, duration: 1000, easing: linear }

# next
audio:
  - id: music
    type: audio-channel
    children:
      - id: bgm
        type: sound
        src: track-b

audioEffects:
  - id: bgm-volume
    type: audioTransition
    targetId: bgm
    properties:
      volume:
        enter: { from: 0, duration: 1000, easing: linear }
```

The public ID remains `bgm`, but the audio stage needs separate internal
playback instance IDs so the outgoing and incoming sources can overlap safely.

## Web Audio Mapping

The intended internal graph for one channel and one child sound is:

```text
AudioBufferSourceNode
  -> sound GainNode
  -> sound StereoPannerNode
  -> sound-targeted filters
  -> channel GainNode
  -> channel StereoPannerNode
  -> channel-targeted filters
  -> AudioContext.destination
```

Volume and transition scheduling use Web Audio `AudioParam` automation:

```js
const now = audioContext.currentTime;
const seconds = duration / 1000;

gain.gain.cancelScheduledValues(now);
gain.gain.setValueAtTime(currentValue, now);
gain.gain.linearRampToValueAtTime(targetValue, now + seconds);
```

For removed nodes with an exit transition, cleanup happens after the ramp:

```js
source.stop(now + seconds);
```

## Route Engine Mapping

Route Engine should keep existing authored actions and normalize them into
channel render state.

### `bgm`

```yaml
bgm:
  resourceId: theme
```

Normalizes to:

```yaml
audio:
  - id: music
    type: audio-channel
    volume: ${runtime.musicVolume}
    muted: ${runtime.muteAll}
    children:
      - id: bgm
        type: sound
        src: theme-file
        loop: true
```

### `sfx`

```yaml
sfx:
  items:
    - id: door
      resourceId: door-close
      volume: 80
```

Normalizes to:

```yaml
audio:
  - id: sfx
    type: audio-channel
    volume: ${runtime.soundVolume}
    muted: ${runtime.muteAll}
    children:
      - id: door
        type: sound
        src: door-close-file
        volume: 80
```

### `voice`

```yaml
voice:
  resourceId: alice_001
```

Normalizes to:

```yaml
audio:
  - id: voice
    type: audio-channel
    volume: ${runtime.soundVolume}
    muted: ${runtime.muteAll}
    children:
      - id: line-voice
        type: sound
        src: voices/current-scene/alice_001.ogg
        loop: false
```

Future voice-specific controls, such as per-character voice mute, should affect
the `voice` channel or the generated voice sound volume. They should not require
channel declarations in `resources`.

## Suggested Implementation Stages

1. Add Route Graphics schemas/docs for `audio-channel`, extended `sound`, and
   `audioEffects`.
2. Normalize flat `sound` nodes into an implicit root channel.
3. Refactor Route Graphics `AudioStage` into an audio graph manager with channel
   gain nodes and internal playback instance IDs.
4. Implement `audioTransition` for `volume` on channels and sounds.
5. Update Route Engine render-state construction to emit channels for `bgm`,
   `sfx`, and `voice`.
6. Add Route Engine generic `audio` authoring once renderer support is stable.
7. Add `audioFilter`, pan transitions, and playback-rate transitions in separate
   patches.
