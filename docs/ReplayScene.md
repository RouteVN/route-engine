# Scene Replay

Scene Replay lets a project expose completed scenes without changing the
player's current story progress. Route Engine owns one global replay catalog
and an account-persisted unlock registry. The authoring UI decides how to
present the catalog; no layout ID belongs in the resource.

## Project data

```yaml
resources:
  sceneReplay:
    pageSize: 6
    replays:
      - sceneId: firstMeeting
        title: First Meeting
        thumbnailImageId: firstMeetingThumbnail
        initialVariables:
          affection: 10
          acceptedInvitation: true
```

`pageSize` must be a positive integer. Every `sceneId` is unique in the
catalog and must reference `story.scenes`. Each thumbnail must reference
`resources.images`.

A replay begins at the referenced scene's `initialSectionId`, then at that
section's `initialLineId`, or its first line when no initial line is declared.
The catalog cannot choose a separate replay-only start section.

`initialVariables` is optional. It may override only known, stored,
context-scoped variables with values of the declared type. Computed, readonly,
device-scoped, and account-scoped variables are rejected. Variables not listed
here use their normal fresh-context defaults; values from the current story
context are not copied.

## Unlock lifecycle and persistence

Replay entries are locked by default. Author the empty action at every normal
story endpoint that completes a replayable scene:

```yaml
finishSceneReplay: {}
```

During normal story play, this action finds the scene containing the current
section. If that `sceneId` is declared in `resources.sceneReplay`, the engine
unlocks it. Calling the action again is idempotent. Calling it in an unlisted
scene does nothing.

Unlocks live outside save slots in:

```yaml
global:
  accountReplayRegistry:
    sceneIds:
      - firstMeeting
```

The engine emits this scoped persistence update for each new unlock:

```yaml
name: applyScopedDataUpdates
payload:
  updates:
    - scope: account
      path: replayRegistry
      op: unlock
      value:
        sceneIds:
          - firstMeeting
```

The built-in IndexedDB persistence handler stores the registry per project
namespace and merges updates as a monotonic, deduplicated set. Hosts using
custom persistence should apply the same set-union behavior and pass the loaded
`accountReplayRegistry` into `engine.init()` with the other global persisted
state.

Finishing or exiting an active replay never grants a new unlock. An active
replay was necessarily unlocked before it could start, and `exitSceneReplay`
is safe for early close/back behavior.

## Projection

`engine.selectSceneReplay()` returns `null` when the resource is absent.
Otherwise it returns:

```yaml
isActive: false
activeSceneId: null
pageReplays:
  - sceneId: firstMeeting
    title: First Meeting
    thumbnailImageId: firstMeetingThumbnail
    locked: false
pagination:
  pageIndex: 0
  pageCount: 1
  canMoveToPreviousPage: false
  canMoveToNextPage: false
```

The same object is available to layout templates as `sceneReplay`.
`engine.selectIsSceneReplayActive()` provides the activity boolean directly.

## Actions

```yaml
startSceneReplay:
  sceneId: firstMeeting

finishSceneReplay: {}
exitSceneReplay: {}

moveToSceneReplayPage:
  pageIndex: 0
moveToNextSceneReplayPage: {}
moveToPreviousSceneReplayPage: {}
```

`startSceneReplay` starts only an unlocked catalog entry. A locked or unknown
`sceneId` is a safe no-op. A valid start pushes a fresh replay context and
enters the referenced scene's initial line. Starting another replay while one
is active is an error.

Inside an active replay, `finishSceneReplay` marks the current line as the
terminal replay line. It remains visible until the next eligible advance after
the line completes; that advance exits the replay and restores the caller.

`exitSceneReplay` exits immediately and is intended for close/back buttons. It
is a no-op outside replay.

If replay content reaches the natural end of a section without an explicit
finish or another navigation action, Route Engine exits safely and logs a
developer warning.

## Isolation

The replay context owns its pointer, presentation, BGM, rollback history,
context variables, and context runtime. On exit it is discarded. The caller's
pointer and transient UI state—line completion, overlays, forms, auto/skip
mode, and next-line configuration—are restored.

Inside replay:

- context variable updates and normal section/line navigation are allowed;
- device preferences such as volume may still change;
- viewed-line/resource recording and achievement progress are suppressed;
- account/device variable mutations are rejected;
- save, load, story reset, project replacement, and nested replay start are
  rejected.

There is no section sandbox. Authors may branch through any section and place
`finishSceneReplay` wherever a replay path should end.
