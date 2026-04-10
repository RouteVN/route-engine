# Runtime Implementation Plan

This document translates the current "internal/system variables" discussion into
an implementation plan across `route-engine`, `routevn-creator-model`, and
`routevn-creator-client`.

It is intentionally technical and migration-oriented.

## Goal

Replace hidden engine-owned variable ids with a first-class runtime surface.

That means:

- `route-engine` should stop hardcoding ids like `_autoForwardTime` or `loadPage`
- engine-owned state should no longer live in `resources.variables`
- authored content should read engine state through `runtime.*`
- engine-owned mutations should happen through explicit actions, not
  `updateVariable`
- project-level config/default overrides are deferred from the first
  implementation pass

## Non-Goals

Out of scope for this migration:

- turning all engine state into generic mutable data
- adding a generic `updateRuntime` action
- adding project-level runtime/config default overrides in v1
- keeping long-term dual support for old internal-variable authoring
- exposing every `state.global` property to authored templates/conditions
- solving every future runtime feature in this pass

## Agreed Design

### 1. `runtime` is a public authored API, not a variable bag

Authoring should read:

- `${runtime.dialogueTextSpeed}`
- `${runtime.autoMode}`
- `runtime.skipMode == true`

Authoring should not rely on:

- `${variables._dialogueTextSpeed}`
- `${variables._autoForwardTime}`
- `variables.loadPage`
- `state.*`
- `state.global.*`

Implementation rule:

- `state.global` and `state.contexts[]` remain internal engine storage
- `runtime.*` is the only public authored read surface for engine-owned state
- authored templates, layout conditions, and similar view-facing expressions
  must not receive direct access to `state` or `state.global`
- `selectSystemState()` may continue to exist for debugging/tooling, but it is
  not part of the authored/view contract

### 2. Project config is deferred from v1

The first implementation pass does not add a new `projectData.config` shape.

V1 uses engine-defined defaults only.

Possible future direction:

- add a top-level `projectData.config`
- allow selected runtime defaults to be overridden there

But this is intentionally not part of the first coding pass.

### 3. Keep `state.global` as engine storage

This migration does not require replacing `state.global`.

Global/session/device-like runtime state stays in `state.global`.
Context-scoped runtime state moves into `state.contexts[].runtime`.

The public `runtime.*` API is produced by a selector that reads from those
storage locations.

### 4. Exposed runtime is defined by a source-only registry

Use a canonical registry in `route-engine`, for example:

```js
export const RUNTIME_FIELDS = Object.freeze({
  dialogueTextSpeed: { source: "global.dialogueTextSpeed" },
  autoForwardDelay: { source: "global.autoForwardDelay" },
  skipUnseenText: { source: "global.skipUnseenText" },
  autoMode: { source: "global.autoMode" },
  skipMode: { source: "global.skipMode" },
  dialogueUIHidden: { source: "global.dialogueUIHidden" },
  isLineCompleted: { source: "global.isLineCompleted" },
  saveLoadPagination: { source: "context.runtime.saveLoadPagination" },
  menuPage: { source: "context.runtime.menuPage" },
  menuEntryPoint: { source: "context.runtime.menuEntryPoint" },
  soundVolume: { source: "global.soundVolume" },
  musicVolume: { source: "global.musicVolume" },
  muteAll: { source: "global.muteAll" },
  skipTransitionsAndAnimations: {
    source: "global.skipTransitionsAndAnimations",
  },
});
```

Important:

- the registry defines exposure only
- it does not define defaults
- it does not define type
- it does not define scope metadata

Defaults stay in engine initialization.
Type validation stays in engine/model code.

### 5. No generic `updateRuntime`

Engine-owned runtime state is mutated through explicit actions.

Examples:

- `setDialogueTextSpeed`
- `setAutoForwardDelay`
- `setSkipUnseenText`
- `setSoundVolume`
- `setMusicVolume`
- `setMuteAll`
- `setSaveLoadPagination`
- `setMenuPage`
- `setMenuEntryPoint`

Existing explicit actions remain explicit:

- `toggleAutoMode`
- `toggleSkipMode`
- `toggleDialogueUI`
- `markLineCompleted`

This is intentionally less flexible than `updateVariable`, but more precise and
robust for engine-owned state.

## Current State Problems

Today the contract is split and drifting:

### In `route-engine`

Engine code reads variable ids directly:

- `_skipUnseenText`
- `_autoForwardTime`
- `_skipTransitionsAndAnimations`
- `loadPage`
- `_muteAll`
- `_soundVolume`
- `_musicVolume`
- `_textSpeed`

### In `creator-model`

The "system variable" catalog currently contains:

- `_skipUnseenText`
- `_dialogueTextSpeed`
- `_currentSaveLoadPagination`
- `_currentMenuPage`
- `_menuEntryPoint`

### In `creator-client`

The client merges that catalog into projected variables and uses it for:

- variable pickers
- layout conditions
- preview/runtime shims
- a dedicated `System Variables` page

This creates several inconsistencies:

- engine and client/model do not agree on the same ids
- `_dialogueTextSpeed` and `_textSpeed` are both used for the same concept
- `loadPage` and `_currentSaveLoadPagination` overlap
- save/load pagination is modeled as a variable in the editor, but the engine
  hardcodes `loadPage`
- slider bindings to system variables are actually coupling authored UI to
  hidden engine variable ids

## Target Runtime Surface

The first migration pass should cover all currently known engine-owned internal
values.

### Canonical runtime ids

| Canonical runtime id | Replaces old ids / concepts |
| --- | --- |
| `dialogueTextSpeed` | `_dialogueTextSpeed`, `_textSpeed` |
| `autoForwardDelay` | `_autoForwardTime` |
| `skipUnseenText` | `_skipUnseenText` |
| `skipTransitionsAndAnimations` | `_skipTransitionsAndAnimations` |
| `soundVolume` | `_soundVolume` |
| `musicVolume` | `_musicVolume` |
| `muteAll` | `_muteAll` |
| `saveLoadPagination` | `_currentSaveLoadPagination`, `loadPage` |
| `menuPage` | `_currentMenuPage` |
| `menuEntryPoint` | `_menuEntryPoint` |
| `autoMode` | current `state.global.autoMode` |
| `skipMode` | current `state.global.skipMode` |
| `dialogueUIHidden` | current `state.global.dialogueUIHidden` |
| `isLineCompleted` | current `state.global.isLineCompleted` |

Notes:

- `saveLoadPagination` is the canonical pagination runtime field
- `pageNumber` is intentionally rejected as too generic
- `dialogueTextSpeed` is the canonical text-speed field

### Frozen v1 runtime ids

The first implementation pass includes all currently known engine-owned
runtime/system values:

- `dialogueTextSpeed`
- `autoForwardDelay`
- `skipUnseenText`
- `skipTransitionsAndAnimations`
- `soundVolume`
- `musicVolume`
- `muteAll`
- `saveLoadPagination`
- `menuPage`
- `menuEntryPoint`
- `autoMode`
- `skipMode`
- `dialogueUIHidden`
- `isLineCompleted`

### Frozen v1 action surface

Writable runtime values use explicit actions with payload shape:

```yaml
setDialogueTextSpeed:
  value: 50

setAutoForwardDelay:
  value: 1000

setSkipUnseenText:
  value: false

setSkipTransitionsAndAnimations:
  value: false

setSoundVolume:
  value: 500

setMusicVolume:
  value: 500

setMuteAll:
  value: true

setSaveLoadPagination:
  value: 0

incrementSaveLoadPagination: {}
decrementSaveLoadPagination: {}

setMenuPage:
  value: options

setMenuEntryPoint:
  value: title
```

Existing explicit actions remain:

- `toggleAutoMode`
- `toggleSkipMode`
- `toggleDialogueUI`
- `markLineCompleted`

### Frozen v1 migration decisions

- `menuPage` and `menuEntryPoint` are included immediately in v1
- save/load pagination drops `paginationVariableId` immediately in current
  authoring; no new-schema transitional support is kept for that field

## Route-Engine Plan

### Phase 1: Add runtime contract files

Add a small internal runtime module, for example:

- `src/runtimeFields.js`

It should export:

- `RUNTIME_FIELDS`
- helpers to resolve a runtime field by source path
- helper to build the exposed `runtime` object

### Phase 2: Move engine-owned defaults out of variables

Initialize engine-owned defaults directly in state creation.

Global/runtime-like defaults belong in `state.global`, for example:

- `dialogueTextSpeed`
- `autoForwardDelay`
- `skipUnseenText`
- `skipTransitionsAndAnimations`
- `soundVolume`
- `musicVolume`
- `muteAll`
- `autoMode`
- `skipMode`
- `dialogueUIHidden`
- `isLineCompleted`

Context-scoped defaults belong in `createDefaultContextState`, for example:

- `context.runtime.saveLoadPagination`
- `context.runtime.menuPage`
- `context.runtime.menuEntryPoint`

Implementation points:

- `src/stores/system.store.js`
- `src/util.js`
- `src/schemas/systemState/systemState.yaml`

### Phase 3: Defer project config/default overrides

Do not add project-level runtime/config overrides in v1.

During engine init:

- use engine hardcoded defaults
- then merge loaded persisted values / loaded save-slot values on top

Any future `projectData.config` work should be a follow-up once the runtime API
surface is stable.

### Phase 4: Add `selectRuntime`

Add a selector that returns the exposed flat runtime API by reading
`RUNTIME_FIELDS`.

For example:

- global sources read from `state.global`
- context sources read from the active context

This selector becomes the authored runtime read surface.

Use it in:

- `RouteEngine.handleActions()` template context
- render/template construction
- any future public runtime inspection API

Plumbing points:

- `src/stores/system.store.js`
- `src/RouteEngine.js`
- `src/util.js`
- `src/stores/constructRenderState.js`

### Phase 5: Replace hardcoded variable reads

Remove direct reads from `state.global.variables.*` and merged `allVariables.*`
for engine-owned behavior.

Replace with explicit state fields plus `selectRuntime()` where relevant.

Known call sites to migrate:

- `_autoForwardTime` in `startAutoMode`, `nextLine`, `markLineCompleted`
- `_skipUnseenText` checks in skip behavior
- `loadPage` in `selectSaveSlotPage`
- `_skipTransitionsAndAnimations` in render-state construction
- `_muteAll`, `_soundVolume`, `_musicVolume`, `_textSpeed` in template data and
  audio/render helpers

Also unify naming:

- `_dialogueTextSpeed` and `_textSpeed` -> `dialogueTextSpeed`
- `_currentSaveLoadPagination` and `loadPage` -> `saveLoadPagination`

### Phase 6: Keep explicit mutation actions

Do not add `updateRuntime`.

Instead:

- keep existing explicit actions for engine modes
- add explicit set/toggle/increment/decrement actions where needed for writable
  runtime values

This requires:

- `src/schemas/systemActions.yaml`
- `src/stores/system.store.js`
- docs updates in `docs/RouteEngine.md`

The first implementation pass includes:

- `setDialogueTextSpeed`
- `setAutoForwardDelay`
- `setSkipUnseenText`
- `setSkipTransitionsAndAnimations`
- `setSoundVolume`
- `setMusicVolume`
- `setMuteAll`
- `setSaveLoadPagination`
- `incrementSaveLoadPagination`
- `decrementSaveLoadPagination`
- `setMenuPage`
- `setMenuEntryPoint`

Existing actions stay:

- `toggleAutoMode`
- `toggleSkipMode`
- `toggleDialogueUI`

### Phase 7: Save/load, rollback, and persistence

Global runtime values that outlive a story session must stop depending on
variable persistence.

Required changes:

- persist device/account-like runtime values separately from variables
- include context runtime values in save slots
- restore context runtime on `loadSlot`
- decide rollback behavior for context runtime

Recommended rule:

- context runtime should follow the same restore path as context variables
- global runtime should not be rolled back unless there is an explicit feature
  requirement

Files:

- `src/stores/system.store.js`
- `src/schemas/systemState/systemState.yaml`
- save/load docs/specs

### Phase 8: Templating and layout runtime access

Templates and authored conditions must be able to read `runtime.*`.

Work:

- add `runtime` to template context
- keep `variables` for project variables only
- migrate built-in template uses such as text reveal speed to
  `${runtime.dialogueTextSpeed}`

Files:

- `src/RouteEngine.js`
- `src/util.js`
- `src/stores/constructRenderState.js`

Important distinction:

- `runtime.*` is the public authored read surface
- the engine may still keep other internal-only state in `state.global`
- only ids listed in `RUNTIME_FIELDS` are exposed
- `state` and `state.global` must not be exposed to authored view/template
  contexts

## Creator-Model Plan

### Phase 1: Bump schema version

This is a large authoring-contract change.

The model should move to a new schema line:

- `SCHEMA_VERSION = 3`

### Phase 2: Defer project config/state schema changes

Do not add `state.project.config` in v1.

Schema 3 is still justified by the runtime migration because:

- old internal-variable references are removed from current-schema authoring
- `runtime.*` becomes a first-class authored read surface
- old schema-1/schema-2 authored content needs destructive rewrite

### Phase 3: Remove system variable support from variable validation

Remove the current special-case system variable path:

- delete `src/systemVariables.js`
- stop exporting `SYSTEM_VARIABLE_GROUPS`
- remove `isSystemVariableId`
- stop accepting system variable ids inside `isVariableReferenceTarget`

After this migration:

- `variables` means authored project variables only
- engine runtime is no longer represented as variables

### Phase 4: Add `runtime.*` condition target support

Current model condition parsing accepts:

- `variables.foo`
- `variables["foo"]`
- special top-level runtime flags like `autoMode`

Target model should accept:

- `runtime.dialogueTextSpeed`
- `runtime.autoMode`
- `runtime.saveLoadPagination`

Recommended migration:

- add `runtime.<id>` parsing/validation
- keep the old special targets only as schema-1/schema-2 migration input
- remove them from current-schema authoring once client/editor is migrated

### Phase 5: One-time schema-1/schema-2 overwrite

This migration is intentionally destructive for older schemas.

Compatibility adapters for schema 1 and schema 2 should rewrite old
internal-variable usage into the new runtime contract.

At minimum, rewrite:

1. Layout/control `variableId` bindings to system variables

- `_dialogueTextSpeed` -> remove `variableId`, set `initialValue` to
  `${runtime.dialogueTextSpeed}`, and replace auto-generated `updateVariable`
  change action with `setDialogueTextSpeed`

2. Save/load pagination bindings

- `paginationVariableId: _currentSaveLoadPagination`
- `paginationVariableId: loadPage`

Rewrite to the new runtime-backed save/load pagination model and remove the old
variable binding field immediately in the current schema.

3. Layout condition targets

- `variables._skipUnseenText` -> `runtime.skipUnseenText`
- `variables._dialogueTextSpeed` -> `runtime.dialogueTextSpeed`
- and equivalent bracket syntax

4. Opaque authored action payloads where known system variable operations appear

- `updateVariable` operations targeting known internal ids must be split into
  explicit runtime actions
- mixed payloads must keep project-variable operations under `updateVariable`
  and move runtime mutations to explicit action keys

Known legacy ids to rewrite with one shared mapping:

- `_dialogueTextSpeed` and `_textSpeed` -> `dialogueTextSpeed`
- `_autoForwardTime` -> `autoForwardDelay`
- `_skipUnseenText` -> `skipUnseenText`
- `_skipTransitionsAndAnimations` -> `skipTransitionsAndAnimations`
- `_soundVolume` -> `soundVolume`
- `_musicVolume` -> `musicVolume`
- `_muteAll` -> `muteAll`
- `_currentSaveLoadPagination` and `loadPage` -> `saveLoadPagination`
- `_currentMenuPage` -> `menuPage`
- `_menuEntryPoint` -> `menuEntryPoint`

This rewrite logic should be implemented once and reused by:

- creator-model compatibility adapters
- any client/repository migration path that rewrites persisted project state

### Phase 6: Update fixtures and direct coverage

Required model work:

- regenerate compat fixtures for schema 3
- keep schema-1 and schema-2 archives
- update upgrade adapters to rewrite to schema 3
- update direct coverage that currently expects `_dialogueTextSpeed`
  to be a valid variable reference

Files:

- `src/model.js`
- `src/index.js`
- `scripts/generate-compat-fixtures.js`
- `tests/support/compatFixtures.js`
- `tests/model-api.test.js`
- `tests/command-direct-coverage.test.js`
- `tests/compat/schema-*`

## Creator-Client Plan

### Phase 1: Stop projecting system variables into `resources.variables`

Remove the synthetic merge:

- project variables remain in `resources.variables`
- runtime values are read from `runtime.*` in preview/runtime contexts

Files:

- `src/internal/systemVariables.js` should be removed
- `src/internal/project/projection.js`

### Phase 2: Replace the System Variables page

`System Variables` is no longer the right concept.

Replace it with a `Runtime` page or equivalent read-only runtime-reference page
that
shows:

- exposed runtime ids
- descriptions

This page should be driven from the runtime contract, not from variables.

Affected files:

- `src/pages/systemVariables/*` -> rename/rework
- `src/pages/resourceTypes/resourceTypes.store.js`
- route wiring in `src/pages/app/*`

### Phase 3: Remove system variables from variable pickers

`updateVariable` and variable-binding UIs should show authored variables only.

System/runtime ids should disappear from:

- `commandLineUpdateVariable`
- layout editor variable selectors
- visibility/pagination variable pickers
- preview variable editors

Files include:

- `src/components/commandLineUpdateVariable/*`
- `src/components/layoutEditPanel/*`
- `src/components/layoutEditorPreview/*`
- `src/internal/project/projection.js`

### Phase 4: Add explicit runtime action authoring

Because runtime changes are explicit actions now, the action editor must expose
them directly.

Work:

- add new action modes/previews in `systemActions`
- add dedicated forms for runtime actions where needed
- update any convenience UIs that previously depended on system-variable-based
  `updateVariable`

Files:

- `src/components/systemActions/*`
- `src/components/commandLineActions/*`
- any new dedicated runtime-action components

### Phase 5: Migrate slider/runtime bindings

Current slider convenience binds through:

- `variableId`
- auto-generated `updateVariable`
- `${variables.<id>}` initial value

Target behavior:

- `variableId` remains for project variables only
- runtime-backed sliders use explicit actions plus `${runtime.<id>}` initial
  value

This should be handled in:

- layout/control editor helpers
- compatibility rewrite path for old schema content

Files:

- `src/internal/layoutEditorElementRegistry.js`
- `src/internal/project/layout.js`

### Phase 6: Move built-in client preview/runtime shims to `runtime`

Current client preview logic injects fake system variables like
`_dialogueTextSpeed`.

Replace that with a preview/runtime object:

- scene preview text speed override
- layout preview variables
- save/load pagination preview
- any system-variable-only preview shims

Files:

- `src/pages/sceneEditor/sceneEditor.store.js`
- `src/components/layoutEditorPreview/support/*`
- `src/internal/layoutConditions.js`

### Phase 7: Save/load pagination editor cleanup

The current save/load layout editor asks for `paginationVariableId`, but the
engine does not actually honor arbitrary pagination variables as a true runtime
contract.

Target model:

- paginated save/load uses `runtime.saveLoadPagination`
- layout config no longer points at an arbitrary variable id
- pagination controls use explicit runtime actions

This is an intentional simplification and tightening of the contract.

Files:

- `src/components/layoutEditPanel/support/layoutEditPanelPagination.js`
- `src/components/layoutEditorPreview/support/layoutEditorPreviewSaveLoad.js`
- corresponding model validation and migration logic

## Migration Rules

### Runtime defaults

After migration:

- engine defaults remain canonical
- no project-level override layer exists in v1

### Old internal-variable references

They should not remain valid authoring in the new schema.

Compatibility strategy:

- rewrite old schema content once
- save back only the new runtime-based form

### Temporary engine fallback

Avoid shipping long-term dual-read behavior in engine logic.

Short-lived branch-local fallback from old internal variables may help while
migrating tests, but final steady-state should read the new runtime state only.

## Testing Plan

### Route-engine

Required coverage:

- unit/system tests for new explicit runtime actions
- selector tests for `selectRuntime`
- render-state tests proving runtime-backed text/audio/save-load behavior
- save/load tests for context runtime restore
- rollback tests for context runtime replay/restore rules
- VT coverage for:
  - dialogue text speed
  - save/load pagination
  - sound/music volume
  - mute-all behavior

### Creator-model

Required coverage:

- schema-3 state validation
- rejection of old system variable references in current schema
- compatibility upgrades from schema 1 and 2
- direct coverage for rewritten slider/layout/action cases

### Creator-client

Required coverage:

- action editor support for new runtime actions
- layout preview reads from `runtime.*`
- save/load pagination editor/preview no longer depends on variables

## Rollout Order

Recommended order:

1. Land the runtime contract and selector in `route-engine`
2. Land explicit runtime actions and state/persistence changes in `route-engine`
3. Land schema-3 and destructive schema-1/schema-2 rewrites in
   `routevn-creator-model`
4. Update `routevn-creator-client` projection, action editors, and preview UI
5. Remove the old system variable page and synthetic variable merging
6. Delete remaining legacy internal-variable references and fallback helpers

## Open Constraints To Preserve During Implementation

- `variables` must remain fully generic and project-owned
- runtime must stay outside `resources`
- runtime exposure must come from a source-only registry
- no generic `updateRuntime`
- no project-level config/default override layer in v1
- explicit actions remain the only mutation path for engine-owned runtime state
- the public authored surface must be a flat `runtime.*` API regardless of
  whether the underlying value lives in `state.global` or the active context
- `state` and `state.global` are internal only and must not be exposed to the
  authored view layer
