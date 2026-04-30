# Audio Render Mapping

Last updated: 2026-04-30

This document defines Route Engine's responsibility for audio normalization.
Route Graphics owns the renderer-facing `audio` and `audioEffects` contract.
Route Engine owns the mapping from visual-novel presentation actions such as
`bgm`, `sfx`, and `voice` into that render state.

The current engine still emits flat Route Graphics `sound` nodes. The mappings
below describe the target shape once Route Graphics supports channel-based
audio.

## Mapping Rules

- Do not require audio channels in project `resources`.
- Synthesize standard channels from Route Engine presentation state.
- Use stable sound IDs for persistent playback, such as background music.
- Use generated playback-instance sound IDs for replayable one-shots, such as
  voice lines and sound effects.
- Map authored `delay` fields to Route Graphics `startDelayMs`.
- Let renderer volume multiplication handle channel volume and sound volume.

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
        volume: ${bgm.volume ?? 100}
        startDelayMs: ${bgm.delay ?? 0}
```

If the `bgm` `src` changes while the ID remains `bgm`, Route Graphics should
treat it as a replacement and may crossfade the outgoing and incoming playback
instances if matching audio effects exist.

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
      - id: sfx-${lineId}-${item.id}-${playbackIndex}
        type: sound
        src: door-close-file
        loop: false
        volume: 80
        startDelayMs: ${item.delay ?? 0}
```

Replayable one-shot SFX should always use generated playback-instance IDs. A
stable SFX ID is only appropriate for a sound that should persist across render
states, such as a looping ambient effect.

## Voice

Voice is also one-shot playback. A fixed child ID such as `line-voice` is
incorrect because two consecutive lines can use the same `voice.resourceId`.
If the generated render state has the same sound ID and same `src`, the
renderer sees continuation, not replay.

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
      - id: voice-${sceneId}-${lineId}-${resourceId}-${playbackIndex}
        type: sound
        src: voices/current-scene/alice_001.ogg
        loop: false
        volume: ${voice.volume ?? runtime.soundVolume}
        startDelayMs: ${voice.delay ?? 0}
```

The generated voice ID must include a playback-instance component. A static
`sceneId`, `lineId`, and `resourceId` tuple is not enough if the same line can be
visited more than once and should replay voice. In that case the ID must also
include a visit counter, playback counter, or equivalent token.

Future voice-specific controls, such as per-character voice mute, should affect
the `voice` channel or generated voice sound volume. They should not require
channel declarations in `resources`.

## Volume

Route Graphics channel and sound volume stack multiplicatively.

Examples:

- `music` channel volume should come from `runtime.musicVolume`.
- `sfx` and `voice` channel volume should come from `runtime.soundVolume`.
- `runtime.muteAll` should mute the generated channels.
- per-action volume should stay on the generated child sound.

If the channel volume is `50` and the sound volume is `50`, the effective output
is `25%`.

## Suggested Implementation Stages

1. Wait for Route Graphics support for `audio-channel`, `audioEffects`, and
   `startDelayMs`.
2. Update `constructRenderState` to emit synthesized `music`, `sfx`, and
   `voice` channels.
3. Preserve existing flat `sound` output until the renderer contract is
   available.
4. Generate playback-instance IDs for one-shot `sfx` and `voice`.
5. Add regression coverage for consecutive lines using the same
   `voice.resourceId`; the second line must replay.
6. Add coverage that stable `bgm` identity continues playback when `src` is
   unchanged.
