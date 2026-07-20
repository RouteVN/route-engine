# Scene Replay Feature Plan

Status: proposed. The concepts document anticipates replay contexts, but the
runtime currently has no context kind/identity, replay catalog, start/end
actions, context push/pop lifecycle, or replay mutation guards.

This plan follows
[FeatureSystemsArchitecture.md](./FeatureSystemsArchitecture.md). All catalog,
state, action, and transition contracts are JSON-serializable.

## Product Outcome

An author can publish a replay gallery of important story sequences. Each entry
starts at the first line of an authored section, may traverse an explicit set of
sections, and has one or more terminal lines. Starting a replay pushes an
isolated replay context over the current story context. Ending it discards the
replay context and returns to the exact caller state.

Replay cannot save/load, mutate account progress, unlock new extras, or escape
its declared section sandbox. Context variables and inventories are isolated.
Device preferences such as volume and locale may still change normally.

## Research Applied

Ren'Py replay:

- can be launched from a menu or in-game screen
- returns to the invocation point
- preserves an in-progress game
- disables saving/loading
- starts with cleaned state plus explicit scope values
- expects a self-contained sequence and explicit end

See [Ren'Py Replay](https://www.renpy.org/doc/html/rooms.html#replay).

Route Engine's existing context stack is a natural fit, but Route Engine line
actions all execute when a line is entered. Therefore copying Ren'Py's
`end_replay()` placement literally would end a line before it is displayed.
This plan uses explicit terminal pointers intercepted on the next advance, plus
an immediate `endSceneReplay` action for buttons/choices.

## Scope

### V1 Includes

- one or more replay-gallery catalogs
- ordered replay entries with thumbnail/title/description
- shared unlockable references
- isolated replay contexts
- explicit allowed-section sandbox
- explicit terminal line pointers
- optional context-variable and inventory starting overrides
- entry/exit screen animation resources
- save/load and persistent-mutation guards
- rollback inside the replay when enabled
- return to caller menu/gallery/story state
- localized metadata and thumbnails

### V1 Does Not Include

- recording arbitrary past execution as a replay file
- replaying from the middle of a section
- nested replays
- carrying current story-local variables into replay implicitly
- saving a replay context
- earning unseen/progress/unlocks during replay
- deterministic input recording or automated demo playback
- multiplayer/spectator replay

## Why Replay Starts at a Section Boundary

Route Engine presentation state can derive visuals from prior presentation
actions in a section, but story-variable and inventory actions are executed at
runtime. Starting at an arbitrary middle line would risk a visually reconstructed
scene with missing logical setup.

V1 requires the entry pointer to equal the target section's
`initialLineId`/first line. Authors who need a shorter memory should create a
dedicated replay section. That section may reuse resource IDs and normal story
content, but it must establish its own initial screen/background/layout state.

This is stricter and more predictable than guessing which earlier actions to
replay.

## Layer Boundary

### Route Engine Owns

- replay gallery/entry schema
- unlock checks
- context push/pop and identity
- clean replay initial state
- variable/inventory overrides
- allowed-section navigation guards
- terminal-pointer interception
- persistent mutation and save/load restrictions
- caller transient-state suspension/restoration
- replay gallery projection
- entry/exit animation selection

### Route Graphics Owns

- rendering the active context
- screen transition playback
- generic input events
- visual/audio lifecycle
- paused/resumed underlying audio cursor once generic pause exists

### Host/Tooling Owns

- thumbnail/audio/image asset loading
- editor section/line pickers
- static replay reachability/lint reports

No `replay` Route Graphics node or renderer context is needed.

## Project Data Contract

Add `resources.sceneReplays`. Each resource is one replay gallery.

```yaml
resources:
  sceneReplays:
    memories:
      name: Scene Replay
      layoutId: sceneReplayLayout
      lockedThumbnailImageId: replayLockedThumbnail
      entries:
        - id: firstMeeting
          title: First Meeting
          description: The first conversation at the station.
          thumbnailImageId: replayFirstMeetingThumb
          unlockableId: replay.firstMeeting
          start:
            sectionId: replayFirstMeeting
          allowedSectionIds:
            - replayFirstMeeting
            - replayFirstMeetingChoiceA
            - replayFirstMeetingChoiceB
          terminalPointers:
            - sectionId: replayFirstMeetingChoiceA
              lineId: endingA
            - sectionId: replayFirstMeetingChoiceB
              lineId: endingB
          context:
            variables:
              trust: 25
            inventories:
              player:
                stacks: []
          allowRollback: true
          animations:
            enterId: replayEnter
            exitId: replayExit
```

### Gallery Fields

| Field                    | Required | Rule                                      |
| ------------------------ | -------- | ----------------------------------------- |
| `name`                   | Yes      | Localizable source label                  |
| `layoutId`               | Yes      | Replay gallery layout                     |
| `lockedThumbnailImageId` | No       | Safe fallback art                         |
| `entries`                | Yes      | Non-empty ordered entries with unique IDs |

### Entry Fields

| Field               | Required | Rule                                                    |
| ------------------- | -------- | ------------------------------------------------------- |
| `id`                | Yes      | Stable unique ID inside gallery                         |
| `title`             | Yes      | Localizable source text                                 |
| `description`       | No       | Localizable source text                                 |
| `thumbnailImageId`  | Yes      | Image resource, hidden while locked                     |
| `unlockableId`      | No       | Missing means always available                          |
| `start.sectionId`   | Yes      | Existing section, starts at its initial/first line      |
| `allowedSectionIds` | Yes      | Non-empty unique list including start and all terminals |
| `terminalPointers`  | Yes      | Non-empty unique section/line pointers                  |
| `context`           | No       | Valid context-scoped literal overrides                  |
| `allowRollback`     | No       | Default true                                            |
| `animations`        | No       | Existing screen animation resources                     |

### Context Overrides

- `variables` may contain only known `scope: "context"` stored variables.
- Computed/readonly variables cannot be overridden.
- Values must match their variable types.
- `inventories` uses the normal saved inventory state shape and must satisfy
  item/capacity invariants.
- Device/account variables are never copied into this object.
- Missing context variables/inventories use normal fresh-context defaults.

### Static Validation and Lint

Structural validation proves references and start/terminal membership.
Additional lint should report:

- start section whose first line does not establish a clean presentation
- allowed section with an authored transition outside the sandbox
- terminal line that is also configured to transition on entry
- allowed path that can end without reaching a terminal
- terminal that appears statically unreachable
- persistent mutation actions inside allowed sections
- save/load/reset/replay actions inside replay content

Some reachability is dynamic. Runtime guards remain authoritative even when lint
cannot prove every branch.

## Unlock Semantics

A common default-like rule is to unlock when the normal story start line has
been seen:

```yaml
resources:
  unlockables:
    replay.firstMeeting:
      when:
        call: isLineViewed
        args:
          - chapter1Meeting
          - line30
```

Authors may instead dispatch `unlockContent` at an ending. Replay execution
never adds viewed lines/resources or unlock records. Locked entries hide the
real destination, thumbnail, context overrides, and section membership from
layout projection.

## Context State Contract

Normal context:

```yaml
id: context-1
kind: story
pointers:
  read:
    sectionId: chapter2
    lineId: line12
```

Active replay context pushed above it:

```yaml
id: context-2
kind: replay
replay:
  sessionId: replay-session-4
  galleryId: memories
  entryId: firstMeeting
  returnContextId: context-1
  allowedSectionIds:
    - replayFirstMeeting
    - replayFirstMeetingChoiceA
    - replayFirstMeetingChoiceB
  terminalPointers:
    - sectionId: replayFirstMeetingChoiceA
      lineId: endingA
    - sectionId: replayFirstMeetingChoiceB
      lineId: endingB
  allowRollback: true
pointers:
  read:
    sectionId: replayFirstMeeting
    lineId: start
variables:
  trust: 25
inventories:
  player:
    stacks: []
```

The replay context also has its own configuration, views, BGM, runtime,
rollback, and any other normal context-owned fields. No object is shared by
reference with the underlying context.

Old contexts loaded from saves receive `kind: "story"` and a normalized ID.
Replay contexts never appear in a valid save slot.

## Replay Gallery Session

The browser menu is a transient feature session separate from execution:

```yaml
global:
  featureSessions:
    sceneReplay:
      sessionId: replay-gallery-session-2
      galleryId: memories
      openedFrom:
        contextId: context-1
        overlayDepth: 0
```

It remains suspended while a replay context is active so ending the replay can
return to the same gallery. It is cleared on slot load/new game/project update.

## Actions

### Gallery Actions

```yaml
openSceneReplays:
  galleryId: memories
closeSceneReplays:
  sessionId: replay-gallery-session-2
```

### Start Replay

```yaml
startSceneReplay:
  sessionId: replay-gallery-session-2
  entryId: firstMeeting
```

Start behavior:

1. validate gallery session, entry, unlock state, and no active replay
2. snapshot transient caller runtime needed for return
3. clear active timers, confirm dialog, forms, and visible overlay stack
4. preserve the suspended replay-gallery feature session
5. create a fresh replay context from project defaults
6. apply validated context overrides
7. push context with a new ID/session ID
8. render from an opaque black screen into the replay entry using `enterId`
9. execute only the replay start line's normal entry actions

The underlying context and its rollback timeline are not reset or cloned into
the replay.

### Terminal Advance

When `nextLine` is requested after the current terminal line is complete, the
engine ends replay instead of looking for another line:

```yaml
currentPointer:
  sectionId: replayFirstMeetingChoiceA
  lineId: endingA
result: endSceneReplay
```

If the line is still revealing, the first activation still completes it under
normal `nextLine` rules. Replay ends only on the subsequent eligible advance.

### Immediate End

```yaml
endSceneReplay:
  sessionId: replay-session-4
  confirm: false
```

This action is for an exit button or choice action. With `confirm: true`, it
uses the existing confirm-dialog mechanism and ends only after confirmation.

End behavior:

1. reject stale session ID
2. clear replay timers, modal UI, pending replay renders, and replay audio
3. pop and discard the top replay context
4. verify the revealed lower context matches `returnContextId`
5. restore suspended transient caller modes/overlays that remain valid
6. render caller state with `exitId`
7. resume eligible caller timers after non-aborted render completion

Device settings changed during replay, including locale and volume, are not
rolled back.

### Runtime Escape Safety

If replay reaches the end of a section with no next line, no transition, and a
pointer not declared terminal, it must not trap the player. The engine ends the
replay with a structured developer diagnostic and returns safely. Tests and
lint should make this a project error before release.

## Replay Restrictions

The top active context kind is the authoritative guard. UI visibility flags are
not security boundaries.

### Allowed

- presentation actions
- dialogue, choice, and form interactions
- `nextLine`
- `sectionTransition`/`jumpToLine` within `allowedSectionIds`
- context-scoped variable updates
- replay-context inventory updates/use
- rollback when entry permits it
- transient UI preferences
- device settings such as sound/music volume, mute, text speed, and locale
- `endSceneReplay`

### Blocked

- `saveSlot` and `loadSlot`
- `resetStoryAtSection`
- nested `startSceneReplay`
- navigation outside `allowedSectionIds`
- device/account-scoped authored variable mutation
- `unlockContent`
- account viewed line/resource writes
- any persistence effect except legitimate device settings changed by the user
- project-data replacement from authored content

Blocked authored actions return a structured rejection or throw a clear
developer contract error before mutation. Direct engine calls are guarded the
same way as layout events.

### Global Variable Read Policy

Account/device authored variables may be read for display or conditions so a
replay can show already-earned state. They are read-only during replay. Context
variables resolve from the replay context.

Computed variables evaluate against that combination. A computed variable
cannot cause a write.

## Layout Projection

Replay gallery:

```yaml
replayGallery:
  sessionId: replay-gallery-session-2
  galleryId: memories
  name: Scene Replay
  unlockedCount: 1
  totalCount: 2
  entries:
    - id: firstMeeting
      title: First Meeting
      description: The first conversation at the station.
      thumbnailImageId: replayFirstMeetingThumb
      unlocked: true
    - id: secretEnding
      title: ""
      description: ""
      thumbnailImageId: replayLockedThumbnail
      unlocked: false
```

Runtime projection during execution:

```yaml
runtime:
  inReplay: true
  replayId: firstMeeting
  canSave: false
  canLoad: false
  canRollback: true
```

Locked projection never exposes start/terminal/allowed section IDs or context
overrides. A localized locked label is supplied by the authored layout.
`startSceneReplay` rechecks unlock state.

Existing save/load UI should consume `runtime.canSave` and `runtime.canLoad`,
but store action guards remain mandatory.

## Presentation, Screen, and Audio

### Visual State

A replay begins from clean presentation state. The first replay line must
establish its screen/background/layout rather than inherit caller visuals. The
engine supplies an opaque black backing during entry so missing setup cannot
flash the caller scene.

Entry/exit animations are selected by Route Engine and executed by Route
Graphics as normal screen transitions.

### Audio

Replay BGM belongs to the replay context. Underlying `context.bgm` state is not
mutated.

Preferred cursor-preserving behavior shares the generic sound-pause work in
[MusicBox.md](./MusicBox.md):

1. render underlying context-qualified BGM nodes paused
2. render replay BGM nodes active
3. remove replay nodes on end
4. resume underlying nodes

Without generic pause, Route Engine can restore the same logical underlying BGM
but Route Graphics will restart it. The product and tests must describe the
actual behavior; the engine must never store a guessed audio cursor.

Replay SFX/voice/BGM resources are not recorded as newly viewed account
resources.

## Rollback

When `allowRollback` is true:

- replay context gets a fresh rollback timeline anchored at its start
- context variable and inventory actions are replayed only within that context
- rollback cannot move before replay start
- rollback cannot cross into the underlying context
- terminal/end action is not a rollback checkpoint in the caller
- ending discards the entire replay rollback timeline

When false, `selectCanRollback` returns false and rollback actions are guarded.

Underlying rollback remains byte-for-byte/logically unchanged across replay
except for any pre-existing transient normalization unrelated to replay, which
should itself be avoided.

## Save/Load and Persistence

- `saveSlot` and `loadSlot` are disabled while the top context is replay.
- A valid slot never serializes replay contexts.
- Account viewed/unlock state is not changed.
- Device settings changed through preference actions continue to persist.
- Starting/ending replay emits no account persistence effect.
- Browser refresh during replay returns through normal app initialization; v1
  does not persist/resume replay execution.

## Localization

Localization patches may replace:

- replay gallery `name`
- entry `title` and `description`
- thumbnail file through image resource override
- layout labels and text styles
- all normal story text/assets inside replay sections through their canonical
  section/line/resource targets

Patches cannot alter replay pointers, sandbox sections, terminal pointers,
context overrides, restrictions, IDs, or unlocks. See [L10n.md](./L10n.md).

## Project Update Behavior

`updateProjectData` during replay is a host/developer operation, not an authored
action. The safe policy is:

- validate new project data first
- if active replay entry and all active pointers remain valid, rebuild resolved
  resources and continue
- otherwise end replay safely, return to the underlying context, and report an
  invalidated replay diagnostic
- never partially rewrite replay catalog metadata in live context state

## Implementation Phases

1. Add context `id`/`kind` and old-slot normalization.
2. Add replay gallery schema, terminal/sandbox validation, and lint.
3. Add replay-gallery transient session and locked-safe projection.
4. Add start action and clean context push.
5. Add replay-aware action/persistence/navigation guards.
6. Add terminal interception and immediate end/pop/return.
7. Add replay-local rollback behavior.
8. Add context-qualified paused audio restoration after generic graphics work.
9. Add localization targets.
10. Add focused unit/system, VT, and browser coverage.

## Test Plan

### Unit and System Coverage

- schema references, unique IDs, allowed-section membership, and terminal
  validation
- start must equal first/initial section line
- locked projection hides routing/context data
- crafted locked start is rejected
- context defaults/overrides are cloned and valid
- underlying pointer, variables, inventories, BGM, views, and rollback unchanged
- context/account variable write guards
- viewed/unlock persistence suppression
- in-sandbox and out-of-sandbox navigation
- terminal line completes text first, then ends on next activation
- immediate confirmed/unconfirmed end
- save/load disabled by store action, not only UI
- rollback enabled/disabled and cannot cross context boundary
- stale session end ignored
- malformed non-terminal dead end returns safely with diagnostic
- locale/volume device setting changes survive return
- old save context kind/ID migration
- active replay never enters save payload

### VT and Browser Coverage

Create isolated fixtures for:

- locked/unlocked replay gallery
- click unlocked entry, black entry frame, and first replay scene
- branch to each declared terminal and return
- exit button with confirmation
- replay-local rollback
- blocked save/load UI plus direct-action system test
- return to exact underlying story/menu visual state
- replay BGM to underlying BGM restoration
- locale switch inside replay and after return

Replay enter/exit and terminal advance are click/transition/timing paths. They
require targeted state tests and actual browser-level reproduction. Do not
combine gallery slideshow or music-box track controls into the replay fixture.

## Acceptance Criteria

- Replay catalog/state/actions round-trip through JSON.
- Starting replay pushes a fresh isolated context and leaves caller context
  unchanged.
- Replay cannot save/load, persist story progress, or leave its section sandbox.
- Terminal advance and explicit exit return reliably to the caller.
- Replay rollback is isolated and disposable.
- Locked routing data never reaches layout/render projection.
- Visual transitions stay in Route Graphics; replay policy stays in Route
  Engine.
- Underlying BGM behavior is tested and documented accurately.
