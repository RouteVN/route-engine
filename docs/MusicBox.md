# Music Room

Status: proposed. The catalog and player are not implemented yet.

## Contract

The music room follows the image-gallery architecture:

- One authored catalog at `resources.musicRoom`.
- One transient internal player.
- One computed `musicRoom` projection for templates.
- Ordinary layouts render that projection and dispatch music-room actions.
- Route Graphics owns decoding, playback, and the audio cursor.

There are no named rooms, layout associations, open/close actions, or track
variants. Each track references one `resources.sounds` entry. Alternate mixes
are separate tracks.

All authored and runtime values remain JSON-serializable.

## Authored Data

```yaml
resources:
  musicRoom:
    pageSize: 8
    tracks:
      - id: mainTheme
        soundId: mainTheme
        title: A New Route
        artist: Example Composer
        album: Original Soundtrack
        description: Main theme.
        coverImageId: mainThemeCover
```

Authored order controls pagination and previous/next navigation.

Validation is strict and runs during initialization and before
`updateProjectData`:

- `pageSize >= 1` is an integer; `tracks` is an array and may be empty.
- `id` is non-empty and unique; `soundId` resolves to `resources.sounds`;
  `title` is non-empty.
- `artist`, `album`, `description`, and `coverImageId` are optional non-empty
  strings; `coverImageId` must resolve to `resources.images`.
- Sounds require `playbackRate > 0` and, when known, `endAt > startAt`.
- All objects reject unknown properties.

Metadata is localizable; IDs, order, pagination, and segment bounds are not.
Decoded sounds are revalidated at playback, with invalid segments entering the
error state.

Sound file, volume, mute, pan, playback rate, `startAt`, and `endAt` come from
the referenced sound. Music-room playback overrides `loop: false` and
`startDelayMs: 0`.

Existing `startAt` and `endAt` values remain seconds. Music-room state, actions,
and renderer events use milliseconds with an `Ms` suffix.

### Locks

Locks reuse the image gallery's account viewed-resource registry. A track is
locked when its `soundId` is not viewed:

```yaml
addViewedResource:
  resourceId: mainTheme
```

There is no `resourceType`, authored lock, or music-specific unlock map.
Playback never unlocks. Locked tracks remain projected but cannot play. Viewed
identity is global and resource-ID-only, so reused or colliding IDs share lock
state.

## Computed Projection

`selectMusicRoom()` and the template root `musicRoom` expose the same snapshot:

```yaml
musicRoom:
  pageTracks:
    - trackId: mainTheme
      soundId: mainTheme
      title: A New Route
      artist: Example Composer
      album: Original Soundtrack
      description: Main theme.
      coverImageId: mainThemeCover
      locked: false

  selection:
    trackId: mainTheme
    soundId: mainTheme
    title: A New Route
    artist: Example Composer
    album: Original Soundtrack
    description: Main theme.
    coverImageId: mainThemeCover
    canPlayPreviousTrack: false
    canPlayNextTrack: true

  playback:
    status: paused
    readiness: ready
    positionMs: 83000
    durationMs: 183200
    positionText: "1:23"
    durationText: "3:03"
    canPlay: true
    canPause: false
    canSeek: true

  pagination:
    pageIndex: 0
    pageCount: 2
    canMoveToPreviousPage: false
    canMoveToNextPage: true
```

Projection rules:

- Absent resource: `musicRoom: null`.
- Empty catalog: empty page, null selection/playback, zero pagination.
- `pageTracks` contains only the browsed page. Selection may be on another
  page.
- Optional metadata is always present and becomes `null` when unauthored.
- Without selection, `playback` is `null`.
- `status` is `stopped`, `playing`, `paused`, or `ended`.
- `readiness` is `loading`, `ready`, or `error`.
- `durationMs` and `durationText` are `null` until decoding completes.
- `canPlay` means selected and not playing. `canPause` means playing.
  `canSeek` means ready with a known duration.

Time text is derived only for display:

- Milliseconds are floored to whole seconds.
- Below one hour uses `M:SS`; one hour or more uses `H:MM:SS`.
- `positionText` starts at `"0:00"`.
- Time text is never stored, accepted by actions, or supplied by the renderer.

Route Engine never estimates position from wall-clock time.

## Actions

Actions need no room or layout ID.

| Action                        | Payload          | Result                                    |
| ----------------------------- | ---------------- | ----------------------------------------- |
| `playMusicRoomTrack`          | `{ trackId }`    | Select and play/restart an unlocked track |
| `playMusicRoom`               | `{}`             | Resume or start the selection             |
| `pauseMusicRoom`              | `{}`             | Pause and preserve position               |
| `stopMusicRoom`               | `{}`             | Stop at zero and retain selection         |
| `seekMusicRoom`               | `{ positionMs }` | Seek within the playable segment          |
| `playPreviousMusicRoomTrack`  | `{}`             | Play the previous unlocked track          |
| `playNextMusicRoomTrack`      | `{}`             | Play the next unlocked track              |
| `clearMusicRoomSelection`     | `{}`             | Stop, clear, and release audio focus      |
| `moveToMusicRoomPage`         | `{ pageIndex }`  | Browse a zero-based page                  |
| `moveToNextMusicRoomPage`     | `{}`             | Browse the next page                      |
| `moveToPreviousMusicRoomPage` | `{}`             | Browse the previous page                  |

Payload schemas reject unknown fields. `trackId` must be a non-empty string,
`pageIndex` a non-negative integer, and `positionMs` a finite number greater
than or equal to `0`.

Malformed payloads throw before mutation. Valid requests for absent, unknown,
locked, boundary, or out-of-range targets are no-ops and queue no render.
Failed actions preserve the complete previous state.

Exact authored track IDs take precedence over template-looking syntax such as
`${...}`. Other values use normal action-template resolution.

### Playback

- `playMusicRoomTrack` selects the track, moves to its page, and starts from
  zero. Selecting the active track restarts it.
- `playMusicRoom` resumes paused playback, starts a stopped track at its stored
  position, restarts an ended track, and retries an error. It is a no-op
  without a selection or while already playing.
- `pauseMusicRoom` preserves the renderer-owned cursor and also works while
  decoding.
- `stopMusicRoom` sets desired state to stopped at zero while retaining the
  selection, sound node, in-progress decode, and known duration.
- `clearMusicRoomSelection` removes the sound and selection, releases audio
  focus, and keeps the current page.
- Previous/next skips locked tracks, scans the full catalog, does not wrap,
  moves to the target page, and starts from zero.
- Page actions do not clear selection or interrupt playback.
- Playback never loops or automatically advances in v1. Natural completion
  sets `status: ended` and retains selection at the final position.

`status` represents desired playback even while `readiness: loading`. A decode
error changes readiness to `error` and status to `stopped`.

### Seeking

- Positions are milliseconds relative to the playable segment; zero means the
  resolved `startAt`.
- `startAt * 1000` must be below decoded source duration.
  `endAt * 1000`, when present, must not exceed it.
- `durationMs` is `(endAt - startAt) * 1000`, or decoded duration minus
  `startAt * 1000`, and must be finite and positive.
- Seeking before readiness or beyond duration is a no-op.
- Seeking exactly to duration sets `ended`.
- Seeking preserves playing/paused status. Seeking a stopped track changes its
  next start; seeking an ended track earlier changes it to stopped.
- Repeating the same seek still issues a new renderer command.

## Internal and Renderer Contract

Unsaved internal state holds track/page, status/readiness, position/duration,
`playbackGeneration`, and `commandRevision`. Internal readiness may be `idle`
only when no track is selected; public playback is then `null`.

`playbackGeneration` changes on start, restart, replacement, stop, clear, load,
new game, and project replacement, and is never reused during an engine
lifetime. `commandRevision` changes on every seek. Pause/resume changes
neither.

Every renderer event echoes track ID, generation, and revision. Events that do
not match all three are ignored, preventing replaced playback or stale seeks
from mutating current state.

Route Graphics must provide generic sound support for pause, seek, decoded
duration, progress, completion, and errors. `soundReady`, `soundProgress`, and
`soundComplete` carry `positionMs` and `durationMs`; `soundError` carries a
stable, non-sensitive `errorCode`.

Renderer values are strictly checked for identity, generation, revision, type,
finiteness, range, and current-state compatibility. Ready precedes progress or
completion; error is terminal for its generation. `soundProgress` is emitted
at least every `250ms` while playing and after pause, seek, or stop. Ready,
completion, and error use their dedicated events.

Renderer events use a private action path that bypasses form and choice input
gating. They must not report completion for pause, seek, replacement, removal,
failure, or context destruction.

Route Graphics `1.30.1` does not yet provide these capabilities. Route Engine
must not imitate pause with mute/removal or calculate progress with its ticker.

## Audio Focus and Lifecycle

The room player uses a separate music channel. While a track is selected,
story BGM remains logically unchanged but is rendered paused; voice and SFX
are unaffected. Pause, stop, and natural completion keep BGM paused.

Clearing selection releases focus and resumes the latest logical story BGM,
including one changed while the room held focus. A generated screen should
clear selection when closing if it wants BGM restored.

The player is transient:

- It is not saved and creates no rollback checkpoint.
- Load, new game, story reset, and successful project replacement invalidate
  playback, clear the player without reusing its generation, and release focus.
- Rollback never restores an earlier audio cursor.
- Project replacement validates first; rejection preserves the project,
  player, and pending effects.
- Playback never adds viewed resources.
- Successful state changes queue one render; no-ops queue none.

V1 excludes multiple rooms, variants, public sessions, layout associations,
shuffle, repeat, playlists, favorites, automatic next, waveform, DSP,
crossfade, and streaming.

Implementation requires strict schema/action tests and browser audio tests for
pause continuity, seeking, progress, completion, stale events, and BGM
restoration.
