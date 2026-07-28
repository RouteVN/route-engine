# Scene Replay

Scene Replay lets a project expose important story sequences without changing
the player's current story progress. Route Engine owns one global replay
catalog. The authoring UI decides how to present it; no layout ID belongs in the
resource.

## Project data

```yaml
resources:
  sceneReplay:
    pageSize: 6
    replays:
      - id: firstMeeting
        title: First Meeting
        thumbnailImageId: firstMeetingThumbnail
        startSectionId: replayFirstMeeting
        initialVariables:
          affection: 10
          acceptedInvitation: true
```

`pageSize` must be a positive integer. Replay IDs are unique. Each thumbnail
must reference `resources.images`, and `startSectionId` must reference an
existing section. A replay begins at that section's `initialLineId`, or its
first line when no initial line is declared.

`initialVariables` is optional. It may override only known, stored,
context-scoped variables with values of the declared type. Computed, readonly,
device-scoped, and account-scoped variables are rejected. Variables not listed
here use their normal fresh-context defaults; values from the current story
context are not copied.

## Projection

`engine.selectSceneReplay()` returns `null` when the resource is absent.
Otherwise it returns:

```yaml
isActive: false
activeReplayId: null
pageReplays:
  - replayId: firstMeeting
    title: First Meeting
    thumbnailImageId: firstMeetingThumbnail
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
  replayId: firstMeeting

finishSceneReplay: {}
exitSceneReplay: {}

moveToSceneReplayPage:
  pageIndex: 0
moveToNextSceneReplayPage: {}
moveToPreviousSceneReplayPage: {}
```

`startSceneReplay` pushes a fresh replay context and enters the configured
section. Starting another replay while one is active is an error.

`finishSceneReplay` marks the replay as finished. It does not remove the
current line before the player sees it. The next eligible advance after that
line is complete exits the replay and restores the caller. It is a no-op
outside replay, so a section shared by normal play and replay may use it safely.

`exitSceneReplay` exits immediately and is intended for close/back buttons. It
is also a no-op outside replay.

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
