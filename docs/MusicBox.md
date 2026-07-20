# Music Box Feature Plan

Status: proposed. Route Engine has BGM/audio-channel support, but no music-box
catalog, player session, pause/resume contract, or natural-completion event.

This plan follows
[FeatureSystemsArchitecture.md](./FeatureSystemsArchitecture.md). All public
contracts are JSON-serializable.

## Product Outcome

An author can define one or more music boxes containing ordered, localizable,
unlockable tracks. Players can select a track, play/pause, stop, move next or
previous, choose repeat behavior, and enable shuffle. Opening the music box
does not overwrite the story context's BGM declaration. Closing it restores the
underlying audio state.

The UI is an authored layout driven by a music-box projection. Route Graphics
remains a generic declarative audio renderer.

## Research Applied

Ren'Py's MusicRoom keeps playlist policy separate from its screen. It supports
locked tracks, play/pause, next/previous, loop, shuffle, single-track behavior,
fade in/out, and restoration of menu music when leaving. See
[Ren'Py Music Room](https://www.renpy.org/doc/html/rooms.html#music-room).

Naninovel implements music galleries on top of its shared unlockable service,
not with music-specific persistent flags. See
[Naninovel Unlockables](https://naninovel.com/guide/unlockables).

Route Engine should apply both patterns: shared unlock state plus an
engine-owned playlist session, while delegating actual audio clock behavior to
Route Graphics.

## Current Gaps

Route Engine v1.29 already:

- declares sound resources
- stores persistent multi-sound BGM in the active context
- maps story BGM to a Route Graphics `audio-channel`
- applies global `musicVolume` and `muteAll`

The pinned Route Graphics contract currently lacks two behaviors needed for a
complete music box:

1. declarative pause/resume that preserves the playback cursor
2. a semantic event when a non-looping sound naturally finishes

Route Graphics already has channel graphs and audio transitions internally, but
Route Engine does not yet emit top-level `audioEffects`. These are prerequisites,
not reasons to put playlist policy in the graphics layer.

## Scope

### V1 Includes

- multiple music boxes
- ordered track catalogs
- title, artist, album, description, and cover metadata
- shared unlockable references
- play, pause, resume, stop, next, and previous
- repeat modes `off`, `all`, and `one`
- shuffle with a stored session order
- track start/end clips through existing sound fields
- fade/crossfade through generic Route Graphics audio effects
- restoration of underlying logical BGM
- localized metadata and localized audio/cover resource overrides
- global music volume and mute behavior

### V1 Does Not Include

- waveform rendering
- seek/progress slider
- elapsed-time polling
- user playlists or favorites
- streamed remote audio
- equalizer/DSP controls
- gapless sample-accurate albums
- background OS media-session integration

Seek can be added later as a generic Route Graphics sound-position contract.
It should not be faked with engine timers.

## Layer Boundary

### Route Engine Owns

- music-box and track schemas
- unlock checks
- playlist eligibility
- selected track and deterministic shuffle order
- repeat-mode behavior
- play/pause/stop intent
- stale completion-event guards
- suppression/suspension policy for underlying story BGM
- mapping the player to generic audio/audio-effect render state
- layout projection and feature actions

### Route Graphics Owns

- decoded sound buffers and Web Audio nodes
- playback cursor and accurate pause/resume offset
- natural sound completion detection
- volume/pan/playback-rate automation
- fade and crossfade timing
- browser audio-context resume behavior

### Host/Tooling Owns

- loading audio and cover assets
- editor waveform/duration analysis if offered
- platform autoplay-unlock integration through Route Graphics

## Required Route Graphics Contract

The following must be designed and landed generically in Route Graphics before
the music box is considered complete.

### Paused Sound State

Add `paused` to a `sound` node:

```yaml
id: music-box:session-2:player
type: sound
src: theme.ogg
loop: false
paused: true
startAt: 0
endAt: null
```

Semantics:

- changing `paused` from false to true stops output and stores the sound cursor
- changing it back resumes from that cursor
- changing sound identity fields (`src`, `startAt`, `endAt`, or playback
  instance token encoded in `id`) resets the cursor
- removing the node destroys the cursor
- a paused sound does not emit natural completion
- changing volume, pan, muted, channel ownership, or global render state does
  not restart playback

This remains declarative desired state, not a `pause()` command API.

### Natural Completion Event

Add an optional `complete` event config to a sound:

```yaml
id: music-box:session-2:player:token-8
type: sound
src: theme.ogg
loop: false
complete:
  payload:
    actions:
      musicBoxTrackCompleted:
        sessionId: music-session-2
        playbackToken: 8
```

Route Graphics emits semantic event name `soundComplete` only when the selected
segment finishes naturally. It does not emit for delete, replacement, abort,
pause, context destruction, or failed decode. The configured payload is merged
with `_event` metadata containing the sound ID.

### Audio Effects in Route Engine Render State

Route Engine must preserve Route Graphics' two-array distinction:

```yaml
audio: []
audioEffects: []
```

`audio` is desired graph state. `audioEffects` contains generic
`audio-transition` lifecycle automation. Music-box fades are mapped into this
contract rather than implemented by an engine ticker.

## Project Data Contract

Add `resources.musicBoxes`.

```yaml
resources:
  musicBoxes:
    soundtrack:
      name: Music Box
      layoutId: musicBoxLayout
      lockedCoverImageId: musicLockedCover
      defaults:
        repeatMode: all
        shuffle: false
        fadeInMs: 400
        fadeOutMs: 400
      tracks:
        - id: mainTheme
          title: A New Route
          artist: Example Composer
          album: Original Soundtrack
          description: Main theme.
          soundId: mainTheme
          coverImageId: mainThemeCover
          unlockableId: music.mainTheme
          startAt: 0
          endAt: null
          volume: 100
        - id: menuTheme
          title: At the Crossroads
          artist: Example Composer
          soundId: menuTheme
          coverImageId: menuThemeCover
```

### Music Box Fields

| Field                | Required | Rule                                    |
| -------------------- | -------- | --------------------------------------- |
| `name`               | Yes      | Localizable source label                |
| `layoutId`           | Yes      | Music-box screen layout                 |
| `lockedCoverImageId` | No       | Safe art for locked track rows          |
| `defaults`           | No       | Validated player defaults               |
| `tracks`             | Yes      | Non-empty ordered array with unique IDs |

### Track Fields

| Field          | Required | Rule                                             |
| -------------- | -------- | ------------------------------------------------ |
| `id`           | Yes      | Stable unique ID inside the box                  |
| `title`        | Yes      | Localizable source text                          |
| `artist`       | No       | Localizable source text                          |
| `album`        | No       | Localizable source text                          |
| `description`  | No       | Localizable source text                          |
| `soundId`      | Yes      | Reference to `resources.sounds`                  |
| `coverImageId` | No       | Reference to `resources.images`                  |
| `unlockableId` | No       | Missing means always available                   |
| `startAt`      | No       | Finite seconds, default from sound resource or 0 |
| `endAt`        | No       | Null or finite seconds greater than `startAt`    |
| `volume`       | No       | Local 0–100, default from sound resource or 100  |

Track `loop` is intentionally not authored. Looping is controlled consistently
by the player's repeat mode. `playbackRate`, `pan`, and delayed starts are also
not part of v1 music-box tracks even though general sound resources support
them; soundtrack playback should be predictable.

### Defaults

```yaml
repeatMode: all
shuffle: false
fadeInMs: 0
fadeOutMs: 0
```

- `repeatMode` is `off`, `all`, or `one`.
- Fade values are non-negative finite milliseconds.
- Crossfade duration is the overlap of outgoing `fadeOutMs` and incoming
  `fadeInMs`; each lifecycle is still independently represented.

## Unlock Semantics

Tracks use the shared unlockable model. A normal automatic rule is:

```yaml
resources:
  unlockables:
    music.mainTheme:
      when:
        call: isResourceViewed
        args:
          - sounds
          - mainTheme
```

The engine marks a sound viewed when normal story presentation commits it for
BGM playback. Preloading, muted loading, music-box playback, and replay playback
do not mark new normal-story progress. An author can also dispatch
`unlockContent` at a precise story milestone.

Locked tracks:

- may appear as locked rows or may be filtered by layout using projected data
- never expose real `soundId`, localized file ID, cover ID, segment offsets, or
  hidden metadata in layout projection
- cannot be selected through a crafted action

## Runtime State

```yaml
global:
  featureSessions:
    musicBox:
      sessionId: music-session-2
      musicBoxId: soundtrack
      trackId: mainTheme
      status: playing
      repeatMode: all
      shuffle: false
      playOrder:
        - mainTheme
        - menuTheme
      playOrderIndex: 0
      shuffleSeed: 281009473
      playbackToken: 8
      openedFrom:
        contextId: context-1
        overlayDepth: 0
```

Rules:

- `status` is `stopped`, `playing`, or `paused`.
- `playOrder` contains only currently unlocked track IDs.
- `playOrderIndex` points at `trackId` when a track is selected.
- `playbackToken` increments whenever playback must restart from the beginning.
- pausing does not increment the token.
- shuffle uses a serializable seed and stores the resulting order. Rendering
  and selectors never call randomness.
- toggling shuffle preserves the current track, then deterministically orders
  remaining eligible tracks.
- newly unlocked tracks are included the next time order is rebuilt, not
  inserted unpredictably into an in-progress shuffled cycle.
- the session is transient and cleared by load, new game, project replacement,
  or invalidated catalog data.

## Layout Projection

```yaml
musicBox:
  sessionId: music-session-2
  musicBoxId: soundtrack
  name: Music Box
  status: playing
  repeatMode: all
  shuffle: false
  current:
    id: mainTheme
    title: A New Route
    artist: Example Composer
    album: Original Soundtrack
    description: Main theme.
    coverImageId: mainThemeCover
  tracks:
    - id: mainTheme
      title: A New Route
      artist: Example Composer
      coverImageId: mainThemeCover
      unlocked: true
      selected: true
    - id: secretTheme
      title: ""
      artist: ""
      coverImageId: musicLockedCover
      unlocked: false
      selected: false
  canPrevious: true
  canNext: true
```

No elapsed cursor is projected in v1 because Route Engine does not own the
audio clock. A localized locked-row label is authored in the layout; the engine
does not synthesize player-facing text.

## Actions

```yaml
openMusicBox:
  musicBoxId: soundtrack
selectMusicBoxTrack:
  sessionId: music-session-2
  trackId: mainTheme
  autoplay: true
playMusicBox:
  sessionId: music-session-2
pauseMusicBox:
  sessionId: music-session-2
toggleMusicBoxPause:
  sessionId: music-session-2
stopMusicBox:
  sessionId: music-session-2
musicBoxNext:
  sessionId: music-session-2
musicBoxPrevious:
  sessionId: music-session-2
setMusicBoxRepeatMode:
  sessionId: music-session-2
  repeatMode: one
setMusicBoxShuffle:
  sessionId: music-session-2
  enabled: true
closeMusicBox:
  sessionId: music-session-2
```

Internal completion action:

```yaml
musicBoxTrackCompleted:
  sessionId: music-session-2
  playbackToken: 8
```

Completion behavior:

- stale session/token: no-op
- repeat `one`: Route Graphics loops the active sound; no completion is
  expected
- repeat `all`: advance and wrap
- repeat `off`: advance if another track exists, otherwise set `stopped`
- shuffled order uses the stored order; it is not reshuffled on each next

Previous while more than a future seek threshold into a track is deferred
because v1 has no cursor. In v1 it always selects the previous order entry.

## Audio Render-State Mapping

When playing:

```yaml
audio:
  - id: channel:music-box:music-session-2
    type: audio-channel
    volume: 50
    muted: false
    pan: 0
    children:
      - id: music-box:music-session-2:player:8
        type: sound
        src: main-theme-file
        volume: 100
        loop: false
        paused: false
        startAt: 0
        endAt: null
        complete:
          payload:
            actions:
              musicBoxTrackCompleted:
                sessionId: music-session-2
                playbackToken: 8
audioEffects:
  - id: music-box:music-session-2:fade
    type: audio-transition
    targetId: channel:music-box:music-session-2
    properties:
      volume:
        enter:
          initialValue: 0
          keyframes:
            - value: 50
              duration: 400
              easing: linear
        exit:
          keyframes:
            - value: 0
              duration: 400
              easing: linear
```

The channel volume is the authored/local value layered with persisted
`runtime.musicVolume`, consistent with normal BGM. `muteAll` applies at channel
construction.

When status is `paused`, the sound remains in render state with `paused: true`.
When status is `stopped`, the player sound is absent.

### Underlying Story BGM

Opening a music box must not overwrite `context.bgm`.

Preferred behavior after generic pause support:

1. render underlying BGM with stable context-qualified IDs and `paused: true`
2. render the music-box channel as active
3. on close remove the music-box channel
4. render underlying BGM with `paused: false`, resuming its cursor

This requires changing current fixed IDs such as `channel:bgm` to
context-qualified identities while preserving compatibility for a single
normal context.

If exact resume is not implemented, the only acceptable documented fallback is
to restore the same logical BGM declaration from its start. Do not claim cursor
preservation when Route Graphics has destroyed the sound node.

## Modal Story Behavior

The music box is modal. Opening it:

- activates a store-owned modal guard before clearing any pending work
- blocks every action that could change the active story pointer or rollback
  cursor, including `nextLine`, `nextLineFromSystem`, `jumpToLine`,
  `sectionTransition`, `rollbackByOffset`, and `rollbackToLine`
- rejects `markLineCompleted` and stale story render-completion callbacks so the
  underlying line cannot become viewed or schedule navigation timers
- clears live auto/skip/line-config timers without toggling saved preferences
- pauses normal BGM through renderer state
- leaves the underlying context and rollback timeline untouched

The guard belongs at the system-store action boundary, before mutation or
effects, and is based on the active music-box session rather than the caller.
Public engine calls, rendered keyboard bindings, choice/control action batches,
conditional continuation, and internal auto/skip/timer callbacks therefore all
reach the same guard. A stale callback that was already queued when the modal
opened is a rejected no-op and cannot advance after the clear effects run.
A choice, control, or conditional batch that would navigate is rejected before
its first member executes, so an earlier variable/inventory action cannot
partially mutate the story beneath the modal.
The same guard applies to `markLineCompleted`, whether it is called directly,
captured before opening, or emitted when the modal render completes. It prevents
the reveal-completion, viewed-state, and timer effects that otherwise mutate the
underlying line without changing its pointer.
Dispatch helpers that normally enqueue effects before navigation, including
conditional auto-continuation, must query the same store-owned blocked selector
before enqueueing them; the guards inside every navigation store action remain
authoritative for direct calls.

Destructive lifecycle operations documented to clear transient sessions are
the deliberate exception: `loadSlot`, fresh-start `resetStoryAtSection`, and
project replacement close the music-box session and remove its channel in the
same store transaction before changing context state. They never navigate
beneath a still-active player. Other context/modal switches are rejected until
the music box closes.

Closing removes the guard, restores only timers that are still eligible for the
unchanged story line, and resumes BGM. It must not replay input or an expired
timer received while the guard was active.

## Localization

Localization patches may replace:

- music-box `name`
- track `title`, `artist`, `album`, and `description`
- cover image file through a localized image override
- track audio file through a localized sound override
- layout labels and locale-specific text styles

They cannot change track order, IDs, unlockable references, segment bounds, or
player defaults. Localized audio must still satisfy the authored `startAt` and
`endAt`; tooling should warn when replacement duration is too short.

## Persistence, Save/Load, and Rollback

- Music-box catalogs are project data.
- Unlocks and viewed sounds are account state outside slots.
- The music-box player session is transient and not persisted.
- Opening/playing creates no story rollback checkpoint.
- Loading a slot closes the player and removes its audio channel.
- Account unlock state is unchanged by slot load/rollback.
- Normal story BGM remains context state and retains existing slot behavior.

## Error Handling

- Missing sound/cover/layout/unlockable references fail project validation.
- Decode or asset-load failures are reported by the host using Route Graphics'
  safe asset error and leave the selected player stopped.
- Locked selection is a safe no-op.
- Malformed action fields throw before mutation.
- A natural-completion event for an old token is ignored.
- If the active track becomes unavailable after project update, rebuild order,
  select the first eligible track, and stop instead of autoplaying unexpectedly.
- Empty eligible playlists render a valid empty projection and disable player
  actions.

## Implementation Phases

1. Land shared unlockables and typed viewed sounds.
2. Add Route Graphics `paused` sound state with unit and browser audio tests.
3. Add Route Graphics `complete` payload and `soundComplete` event.
4. Wire Route Engine `audioEffects` to Route Graphics render state.
5. Add music-box schema and semantic validation.
6. Add transient session, order/repeat/shuffle transitions, and actions.
7. Add layout projection and modal rendering.
8. Add underlying context-BGM pause/resume identity.
9. Add localization targets.
10. Add isolated system, VT, and browser coverage.

## Test Plan

### Route Graphics Unit/Browser Tests

- pause preserves cursor and resume does not restart
- pause during delayed start
- pause/resume inside an audio channel
- natural completion emits exactly once
- delete, replace, pause, destroy, and decode failure do not emit completion
- looped sounds do not emit completion
- audio enter/exit fades target the correct channel
- changing volume/mute does not restart sound

Browser audio timing tests need a short deterministic fixture and event logs;
mock-only Web Audio tests are not sufficient for the actual playback path.

### Route Engine Unit/System Tests

- schema and cross-reference validation
- locked track projection and crafted-action guard
- open/select/play/pause/resume/stop transitions
- next/previous boundaries for each repeat mode
- stable deterministic shuffle order and current-track preservation
- stale completion tokens ignored
- global music volume and mute layering
- localized metadata/resource resolution
- load/new game closes player
- unlock survives load/rollback
- underlying BGM state is not overwritten
- while open, direct store and public-engine attempts through `nextLine`,
  `nextLineFromSystem`, `jumpToLine`, `sectionTransition`,
  `rollbackByOffset`, and `rollbackToLine` leave line-completion/viewed state,
  pointer, rollback cursor/timeline, pending effects, and player session
  unchanged
- auto, skip, line-config, and conditional-continuation callbacks captured
  before opening remain harmless if invoked after the modal guard is active
- direct and stale renderer calls to `markLineCompleted` leave the underlying
  completion/viewed state and pending effects unchanged
- navigation-producing choice, control, and conditional batches reject before
  an earlier context mutation can partially apply
- closing re-enables one deliberate navigation action without replaying blocked
  input or stale timer callbacks
- load, fresh-start reset, and project replacement close the player/channel
  before their context mutation rather than being blocked or mutating beneath
  the modal

### VT and Browser Tests

Use separate fixtures for:

- locked/unlocked track list
- click track and selected-row state
- pause/resume button state plus real audio continuation
- next/previous and repeat-mode controls
- shuffle order projection
- fade/crossfade path
- close music box and resume underlying BGM
- locale switch changing metadata/cover
- on an isolated modal fixture with the normal keyboard `nextLine` binding,
  open the modal while the story line is incomplete; its render completion,
  keyboard advance, click advance, and rollback input leave on-screen
  completion/viewed/pointer/rollback markers unchanged until close; after
  close, one fresh input advances exactly once

Do not put image-gallery slideshow or replay execution in the music timing page.

## Acceptance Criteria

- Track and player contracts round-trip through JSON.
- Locked audio IDs never reach the layout/render state.
- Pause/resume is cursor-preserving in a real browser path.
- Natural completion advances exactly once and stale events are harmless.
- Repeat and shuffle behavior is determined by engine state, not renderer state.
- Closing the music box restores the underlying logical BGM and truthfully
  documents whether cursor resume is supported.
- No music-box domain type is added to Route Graphics.
