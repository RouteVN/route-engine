# Audio Render Mapping

Last updated: 2026-05-01

This document defines Route Engine's audio normalization work for Route Graphics
1.15.0.

Route Graphics owns the renderer-facing `audio` and `audioEffects` contract.
Route Engine owns the mapping from visual-novel presentation actions such as
`bgm`, `sfx`, and `voice` into that render state.

## Route Graphics 1.15.0 Contract

Route Graphics 1.15.0 supports:

- top-level `audio`
- top-level `audioEffects`
- `audio-channel` nodes
- `sound` nodes inside channels
- flat `sound` nodes for compatibility
- `startDelayMs`
- `audioTransition` for `volume`
- `linear` easing
- globally unique audio node and audio effect IDs

Route Graphics 1.15.0 does not support:

- `sound.delay`
- `audioFilter`
- transition automation for `pan`
- transition automation for `playbackRate`
- nested `audio-channel` nodes

The immediate Engine compatibility blocker is `sound.delay`: current Engine
render output still emits `delay` on BGM, SFX, and voice sounds. Route Graphics
1.15.0 rejects that field. Engine must emit `startDelayMs` instead.

## Engine Scope

Engine implementation should:

- synthesize standard channels from presentation state
- keep channels out of project `resources`
- emit `audioEffects: []` even when no effects are active
- map authored `delay` fields to Route Graphics `startDelayMs`
- use stable sound IDs for persistent playback, such as BGM
- use generated playback-instance sound IDs for replayable one-shots, such as
  SFX and voice
- put runtime mixer volume and mute state on channels
- put authored per-sound volume on child sounds

Engine implementation should not emit:

- `audioFilter`
- pan transitions
- playback-rate transitions

Those are not part of the Route Graphics 1.15.0 implementation.

## Render-State Shape

Target Engine render state should include both audio arrays:

```yaml
audio: []
audioEffects: []
```

`audioEffects` can be empty. It is still useful to emit it explicitly so Engine
render state mirrors the Route Graphics 1.15.0 contract.

## Background Music

`bgm` is persistent playback. A stable child sound ID is correct because the
same music should continue across render states instead of restarting.

Authored action:

```yaml
bgm:
  resourceId: theme
```

Target render state:

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
        volume: 100
        startDelayMs: ${bgm.delay ?? 0}

audioEffects: []
```

If the `bgm` `src` changes while the ID remains `bgm`, Route Graphics treats it
as a replacement. The outgoing and incoming internal playback instances can
overlap if matching `audioTransition` effects exist.

## Sound Effects

Most `sfx` items are one-shots. Their generated sound IDs must identify the
playback instance, not only the sound asset.

Authored action:

```yaml
sfx:
  items:
    - id: door
      resourceId: door-close
      volume: 80
```

Target render state:

```yaml
audio:
  - id: sfx
    type: audio-channel
    volume: ${runtime.soundVolume}
    muted: ${runtime.muteAll}
    children:
      - id: sfx-${lineEntryId}-${item.id}-${itemIndex}
        type: sound
        src: door-close-file
        loop: false
        volume: ${item.volume ?? 100}
        startDelayMs: ${item.delay ?? 0}

audioEffects: []
```

Replayable one-shot SFX should always use generated playback-instance IDs. A
stable SFX ID is only appropriate for a sound that should persist across render
states, such as a looping ambient effect.

## Voice

Voice is also one-shot playback. A fixed child ID such as `line-voice` is
incorrect because two consecutive lines can use the same `voice.resourceId`.
If the generated render state has the same sound ID and same `src`, Route
Graphics sees continuation, not replay.

Authored action:

```yaml
voice:
  resourceId: alice_001
```

Target render state:

```yaml
audio:
  - id: voice
    type: audio-channel
    volume: ${runtime.soundVolume}
    muted: ${runtime.muteAll}
    children:
      - id: voice-${sceneId}-${lineEntryId}-${resourceId}
        type: sound
        src: voices/current-scene/alice_001.ogg
        loop: false
        volume: ${voice.volume ?? 100}
        startDelayMs: ${voice.delay ?? 0}

audioEffects: []
```

The generated voice ID must include a playback-instance component. A static
`sceneId`, `lineId`, and `resourceId` tuple is not enough if the same line can be
entered more than once and should replay voice. In that case the ID must include
a line-entry token, visit counter, playback counter, or equivalent value.

Do not use Route Engine's render sequence as the playback-instance component.
Render state may be selected more than once for the same line entry; changing
the sound ID on each render selection would replay one-shots accidentally.

Future voice-specific controls, such as per-character voice mute, should affect
the `voice` channel or generated voice sound volume. They should not require
channel declarations in `resources`.

## Volume

Route Graphics channel and sound volume stack multiplicatively.

Engine should map volume this way:

- `music.volume` comes from `runtime.musicVolume`
- `sfx.volume` and `voice.volume` come from `runtime.soundVolume`
- `runtime.muteAll` maps to `muted: true` on generated channels
- per-action volume stays on the generated child sound

If the channel volume is `50` and the sound volume is `50`, the effective output
is `25%`.

This changes how authored SFX and voice volume should be interpreted: authored
sound volume becomes a local trim under the runtime sound-volume channel instead
of replacing the runtime sound volume.

## Audio Transitions

Route Graphics 1.15.0 supports `audioTransition` for `volume` only.

Engine does not need to emit transitions for the first compatibility pass. It
should emit `audioEffects: []`.

Later, Engine can add authored fade support by emitting grouped volume
transitions:

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

Do not document or implement Engine-authored filters yet. Route Graphics
currently documents `audioFilter` as planned work, not supported runtime
behavior.

## Schema and Test Alignment

Before implementation, align the public schema, docs, and render-state tests:

- `bgm` docs and render helpers reference `loop` and `delay`, while the current
  presentation-action schema only declares `resourceId`.
- SFX render helpers and tests reference resource-level `loop`, `volume`, and
  `delay` defaults, while the current `resources.sounds` schema only declares
  `fileId` and `fileType`.
- The Route Graphics 1.15.0 target uses `startDelayMs`; existing Engine
  render-state tests still expect `delay`.

The implementation should either add the missing schema fields or remove the
unsupported behavior from docs/tests before changing renderer output.

## Implementation TODO

1. Upgrade Engine's Route Graphics integration to 1.15.0.
2. Add `audioEffects: []` to Engine render state.
3. Replace emitted `delay` fields with `startDelayMs`.
4. Change `bgm`, `sfx`, and `voice` render output from flat sounds to generated
   `music`, `sfx`, and `voice` channels.
5. Introduce a line-entry or audio-playback token that changes when line actions
   execute, but remains stable across repeated render-state selections for the
   same line entry.
6. Generate playback-instance IDs for one-shot `sfx` and `voice`.
7. Keep BGM child ID stable as `bgm` so unchanged BGM continues playback.
8. Add regression coverage for consecutive lines using the same
   `voice.resourceId`; the second line must replay.
9. Add coverage that repeated render-state selection for the same line entry
   does not replay SFX or voice.
10. Add coverage that stable BGM identity continues playback when `src` is
    unchanged.
11. Add coverage that runtime music/sound volume and `muteAll` map to channel
    volume/mute state.
