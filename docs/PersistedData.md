# Persisted Player Data

This is everything the engine persists for a player between sessions: the exact storage location, the full record shape, an example, how to restore it on startup, and what to sync when moving progress to another device. For save/load behavior itself, see [Save/Load](./SaveLoad.md).

## Where It Lives

The built-in adapter stores one IndexedDB record per host-supplied namespace. The namespace must be a non-empty string and is trimmed. By default, the database is `route-engine`, opened at version 1, and the object store is `projectPersistence`, with key path `namespace`. Pass `databaseName` or `objectStoreName` to `createIndexedDbPersistence` to override the defaults. The engine does not use `localStorage` or `sessionStorage`.

A record has the shape `{ namespace, version: 1, saveSlots, globalDeviceVariables, globalAccountVariables, globalRuntime, accountViewedRegistry, accountReplayRegistry }`. `load()` returns the six data fields, without `namespace` or `version`; missing or invalid fields default to `{}`. The host reads storage before initialization and supplies the result through `initialState.global`.

## Record Fields

| Field                    | Contents                                                                         | Scope          | Written by effect → adapter method                                 | Sync?                        |
| ------------------------ | -------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------ | ---------------------------- |
| `saveSlots`              | Map from `String(slotId)` to slot; each write replaces the whole map             | Story progress | `saveSlots` → `saveSlots`                                          | Yes                          |
| `globalAccountVariables` | Variables authored with `scope: "account"`; scoped updates patch individual keys | Account        | `applyScopedDataUpdates` → `applyScopedDataUpdates` (`set`)        | Yes                          |
| `accountViewedRegistry`  | `{ sections: [{ sectionId, lastLineId? }], resources: [{ resourceId }] }`        | Account        | `applyScopedDataUpdates` → `applyScopedDataUpdates` (`markViewed`) | Yes                          |
| `accountReplayRegistry`  | `{ sceneIds: string[] }`, with unique scene IDs                                  | Account        | `applyScopedDataUpdates` → `applyScopedDataUpdates` (`unlock`)     | Yes                          |
| `globalDeviceVariables`  | Variables authored with `scope: "device"`; scoped updates patch individual keys  | Device         | `applyScopedDataUpdates` → `applyScopedDataUpdates` (`set`)        | Usually no                   |
| `globalRuntime`          | Device preferences; each write replaces the whole object                         | Device         | `saveGlobalRuntime` → `saveGlobalRuntime`                          | Usually no; product decision |

Variable updates include those from `updateVariable` and form commits. A viewed section without `lastLineId` means the whole section has been viewed; otherwise `lastLineId` is the furthest line seen. The viewed registry drives skip-unseen text and viewed-resource checks such as image gallery and music room unlocks. Viewed lines and resources are not recorded during scene replay. `finishSceneReplay` unlocks a declared replayable scene when reached during normal play, not while replaying or restoring rollback.

Context-scoped variables are stored in `contexts[].variables` within slots, not independently. The handler also supports the legacy `saveGlobalDeviceVariables` and `saveGlobalAccountVariables` full-snapshot effects.

## Global Runtime

| Field                          | Type / range                     | Engine default |
| ------------------------------ | -------------------------------- | -------------- |
| `dialogueTextSpeed`            | finite number                    | `50`           |
| `autoForwardDelay`             | finite number, milliseconds, ≥ 0 | `1000`         |
| `autoForwardSpeed`             | finite number, 0–100             | `50`           |
| `skipUnseenText`               | boolean                          | `false`        |
| `skipTransitionsAndAnimations` | boolean                          | `false`        |
| `soundVolume`                  | finite number, 0–100             | `50`           |
| `musicVolume`                  | finite number, 0–100             | `50`           |
| `muteAll`                      | boolean                          | `false`        |
| `localizationPackageId`        | string or null                   | `null`         |

Projects can set supported defaults in `projectData.config.runtimeDefaults`; persisted values override them. See [Project Runtime Defaults](./RouteEngine.md#project-runtime-defaults). Transient flags such as `autoMode`, `skipMode`, and `dialogueUIHidden` are not persisted.

## Save Slot Shape

A slot has `formatVersion: 1`, the original string or finite numeric `slotId`, `savedAt` in milliseconds, `image`, and `state: { contexts: [...] }`. `savedAt` uses the action's numeric value if supplied, otherwise `Date.now()`. `image` is the action's `thumbnailImage` (a host-provided base64 string, null, or undefined).

| Context field                         | Contents                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currentPointerMode`, `pointers.read` | `"read"`; read pointer with `sectionId`, `lineId`, and optional `sceneId`                                                                                                    |
| `configuration`, `views`, `bgm`       | Configuration object, array of view objects, and BGM object (optionally including `resourceId`)                                                                              |
| `variables`                           | Context-scoped variables                                                                                                                                                     |
| `dialogueHistory`                     | Optional `{ entries: [{ sectionId, lineId, appendToPrevious? }], currentLength, checkpointLengths }`                                                                         |
| `rollback`                            | `{ timeline: [{ sectionId, lineId, rollbackPolicy?, returnable?, executedActions?, randomOutcomeVersion?, randomOutcomes? }], currentIndex, isRestoring, replayStartIndex }` |
| `runtime`                             | Optional `{ saveLoadPagination, menuPage, menuEntryPoint }`                                                                                                                  |
| `kind`                                | Optional `"story"`                                                                                                                                                           |

Saving is rejected during active scene replay. Slots exclude project data, global/account data, renderer state, pending effects, and timers. See [Save/Load](./SaveLoad.md) for validation and restoration semantics.

## Example Record

IDs and values are illustrative; the thumbnail is a placeholder. The referenced story and variables must exist in the host's project for a meaningful restore.

```json
{
  "namespace": "my-vn",
  "version": 1,
  "saveSlots": {
    "1": {
      "formatVersion": 1,
      "slotId": 1,
      "savedAt": 1700000000000,
      "image": "data:image/webp;base64,...",
      "state": {
        "contexts": [
          {
            "currentPointerMode": "read",
            "pointers": {
              "read": {
                "sceneId": "scene1",
                "sectionId": "chapter1",
                "lineId": "line1"
              }
            },
            "configuration": {},
            "views": [],
            "bgm": {},
            "variables": { "score": 1 },
            "rollback": {
              "timeline": [{ "sectionId": "chapter1", "lineId": "line1" }],
              "currentIndex": 0,
              "isRestoring": false,
              "replayStartIndex": 0
            }
          }
        ]
      }
    },
    "quick": {
      "formatVersion": 1,
      "slotId": "quick",
      "savedAt": 1700000001000,
      "image": null,
      "state": {
        "contexts": [
          {
            "currentPointerMode": "read",
            "pointers": {
              "read": {
                "sceneId": "scene1",
                "sectionId": "chapter1",
                "lineId": "line2"
              }
            },
            "configuration": {},
            "views": [],
            "bgm": {},
            "variables": { "score": 2 },
            "rollback": {
              "timeline": [{ "sectionId": "chapter1", "lineId": "line2" }],
              "currentIndex": 0,
              "isRestoring": false,
              "replayStartIndex": 0
            }
          }
        ]
      }
    }
  },
  "globalDeviceVariables": { "hintLevel": 2 },
  "globalAccountVariables": { "endingUnlocked": true },
  "globalRuntime": {
    "dialogueTextSpeed": 60,
    "autoForwardDelay": 1000,
    "autoForwardSpeed": 50,
    "skipUnseenText": true,
    "skipTransitionsAndAnimations": false,
    "soundVolume": 50,
    "musicVolume": 40,
    "muteAll": false,
    "localizationPackageId": null
  },
  "accountViewedRegistry": {
    "sections": [
      { "sectionId": "prologue" },
      { "sectionId": "chapter1", "lastLineId": "line2" }
    ],
    "resources": [{ "resourceId": "cg-opening" }]
  },
  "accountReplayRegistry": { "sceneIds": ["ending"] }
}
```

## Restoring on Startup

```js
import { createIndexedDbPersistence } from "route-engine-js";

const persistence = createIndexedDbPersistence({ namespace });
const saved = await persistence.load();
engine.init({
  namespace,
  initialState: {
    projectData,
    global: {
      saveSlots: saved.saveSlots,
      variables: {
        ...saved.globalDeviceVariables,
        ...saved.globalAccountVariables,
      },
      runtime: saved.globalRuntime,
      accountViewedRegistry: saved.accountViewedRegistry,
      accountReplayRegistry: saved.accountReplayRegistry,
    },
  },
});
```

Initialization keeps loaded values for authored variables only when their scope is `device` or `account`, they are not computed, and the value matches the authored type; unknown keys are preserved. Loaded values override project defaults. If using imported localization packages, supply the corresponding `initialState.l10nData` as well; see [RouteEngine](./RouteEngine.md#initialization). Call `await persistence.clear()` to delete this namespace's record.

## Writes and Sync Integration

| Effect                       | Adapter method               | Argument                           |
| ---------------------------- | ---------------------------- | ---------------------------------- |
| `saveSlots`                  | `saveSlots`                  | Full slot map                      |
| `saveGlobalDeviceVariables`  | `saveGlobalDeviceVariables`  | Full device variable map (legacy)  |
| `saveGlobalAccountVariables` | `saveGlobalAccountVariables` | Full account variable map (legacy) |
| `saveGlobalRuntime`          | `saveGlobalRuntime`          | Full runtime object                |
| `applyScopedDataUpdates`     | `applyScopedDataUpdates`     | Ordered updates array              |

`createEffectsHandler` queues persistence writes. Errors go to `handlePersistenceError`, or to `console.error` if no callback is provided. See [Scoped Data Updates](./ScopedDataUpdates.md) for update payloads.

For sync, supply a custom adapter to `createEffectsHandler({ persistence, ... })`. Implement `load`, `clear`, and all write methods above. For example, a host can wrap the local adapter and enqueue an upload after a write:

```js
const local = createIndexedDbPersistence({ namespace });
const persistence = {
  ...local,
  async saveSlots(slots) {
    await local.saveSlots(slots);
    await queueUpload(); // Host-defined sync; apply the merge policy below.
  },
  async applyScopedDataUpdates(updates) {
    await local.applyScopedDataUpdates(updates);
    await queueUpload();
  },
};
const effectsHandler = createEffectsHandler({
  getEngine,
  routeGraphics,
  ticker,
  persistence,
});
```

The host must also arrange download, merge, and startup hydration. The example inherits the remaining methods from `local`; wrap any additional writes that your sync policy needs.

## Syncing Across Devices: Host-Side Recommendations

The engine does not implement cross-device conflict handling. A host can sync `saveSlots`, `globalAccountVariables`, `accountViewedRegistry`, and `accountReplayRegistry`, while usually keeping `globalDeviceVariables` and `globalRuntime` local.

| Data                                  | Suggested host merge                                                                                                                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slots                                 | Merge by slot key, keeping the higher `savedAt`. The engine sends the whole map, so merge before writing.                                                                                                                                                                  |
| Replay scene IDs and viewed resources | Set union.                                                                                                                                                                                                                                                                 |
| Viewed sections                       | Union by `sectionId`; a whole-section entry without `lastLineId` wins. Otherwise select the line further along in authored story order. The built-in adapter overwrites a partial frontier without comparing line order, so naive last-write merging can regress progress. |
| Account variables                     | No ordering is defined; use per-key last-write-wins or game-specific rules.                                                                                                                                                                                                |

The built-in adapter assumes one active engine writer per namespace. Slots reference authored IDs and are validated and reconciled against `projectData` on load, so devices need compatible project content. Thumbnails can dominate payload size; consider syncing `image` separately or omitting it.
