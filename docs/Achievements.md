# Achievements

This document defines the Route Engine primitives for achievements.

Route Engine owns canonical achievement resources, validation, selectors,
authored actions, and emitted effects. It does not own any store or platform
integration.

The resource schema, selectors, actions, effects, and cross-resource image
validation described here are implemented in the runtime.

## Boundary

Route Engine owns:

- achievement definitions under `resources.achievements`
- references from achievements to `resources.images`
- project-data validation
- public selectors for reading achievement definitions
- authored actions for completion, absolute progress, and showing achievements
- ordered effects that a host can consume

Route Engine does not own:

- Steam, Epic, GOG, Xbox, Google, Apple, or other platform IDs
- SDK adapters or SDK lifecycle
- credentials, authenticated users, API keys, or access tokens
- store publishing or import/export formats
- network requests, offline queues, retries, or reconciliation
- authoritative player achievement state
- native achievement UI

Consumers can map Route Engine resource IDs to any external system without
changing story content or the resource contract.

## Resource Location

Achievements are stored by stable resource ID under
`projectData.resources.achievements`.

The object key is the canonical Route Engine achievement ID. Do not duplicate
it as an `id` field inside the resource.

```json
{
  "resources": {
    "images": {
      "chapterOneAchievement": {
        "fileId": "achievements/chapter-one.png",
        "width": 1024,
        "height": 1024
      },
      "chapterOneAchievementLocked": {
        "fileId": "achievements/chapter-one-locked.png",
        "width": 1024,
        "height": 1024
      },
      "allEndingsAchievement": {
        "fileId": "achievements/all-endings.png",
        "width": 1024,
        "height": 1024
      }
    },
    "achievements": {
      "chapterOneComplete": {
        "type": "boolean",
        "name": "A New Beginning",
        "description": "Complete Chapter One.",
        "lockedDescription": "Continue the story to discover this achievement.",
        "iconImageId": "chapterOneAchievement",
        "lockedIconImageId": "chapterOneAchievementLocked",
        "hidden": false,
        "sortOrder": 10
      },
      "discoverAllEndings": {
        "type": "number",
        "target": 5,
        "name": "Every Road Travelled",
        "description": "Discover every ending.",
        "iconImageId": "allEndingsAchievement",
        "hidden": false,
        "sortOrder": 20
      }
    }
  }
}
```

## Resource Fields

| Field               | Required          | Meaning                                                                                   |
| ------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `type`              | yes               | `boolean` for direct completion or `number` for numeric progress.                         |
| `target`            | for `number` only | Positive integer at which a `number` achievement completes.                               |
| `name`              | yes               | Source-language public/unlocked display name.                                             |
| `description`       | yes               | Source-language public/unlocked description.                                              |
| `lockedName`        | no                | Presentation override while locked. Falls back to `name`.                                 |
| `lockedDescription` | no                | Presentation override while locked. Falls back to `description`.                          |
| `iconImageId`       | yes               | Unlocked icon reference into `resources.images`.                                          |
| `lockedIconImageId` | no                | Locked icon reference into `resources.images`. Consumers decide the fallback when absent. |
| `hidden`            | no                | Whether consumers should conceal the achievement before completion. Defaults to `false`.  |
| `sortOrder`         | no                | Non-negative authoring/display order.                                                     |

The resource contains only portable authored data. External IDs, rewards,
scores, trophy tiers, and integration options do not belong in this object.

## Achievement Types

Boolean achievement:

```json
{
  "type": "boolean"
}
```

Number achievement:

```json
{
  "type": "number",
  "target": 5
}
```

`boolean` achievements have only incomplete and complete states. They are
completed explicitly with `completeAchievement`.

`number` achievements accept non-negative integer progress. Progress starts at
zero, so there is no authored `minimum`. Their positive-integer `target` is the
completion threshold. It is also the effective maximum because emitted progress
is clamped to it. Reporting progress equal to or greater than the target
completes the achievement.

The game owns the semantic value. For example, `endingsFound` belongs in a
normal project variable. A `number` achievement declares only the target; it
does not duplicate current player progress.

Repeatable achievements are not part of the portable contract. An achievement
resource represents one permanent completion milestone.

## JSON Schema

The following draft-07 schema describes the value of
`resources.achievements`. It can be moved into the project-data schemas when
the resource is implemented.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Achievement Resources",
  "type": "object",
  "patternProperties": {
    "^.+$": {
      "$ref": "#/definitions/achievement"
    }
  },
  "additionalProperties": false,
  "definitions": {
    "achievement": {
      "type": "object",
      "properties": {
        "type": {
          "enum": ["boolean", "number"]
        },
        "target": {
          "type": "integer",
          "minimum": 1
        },
        "name": {
          "type": "string",
          "minLength": 1
        },
        "description": {
          "type": "string",
          "minLength": 1
        },
        "lockedName": {
          "type": "string",
          "minLength": 1
        },
        "lockedDescription": {
          "type": "string",
          "minLength": 1
        },
        "iconImageId": {
          "type": "string",
          "minLength": 1
        },
        "lockedIconImageId": {
          "type": "string",
          "minLength": 1
        },
        "hidden": {
          "type": "boolean",
          "default": false
        },
        "sortOrder": {
          "type": "integer",
          "minimum": 0
        }
      },
      "required": ["type", "name", "description", "iconImageId"],
      "allOf": [
        {
          "if": {
            "properties": {
              "type": {
                "const": "number"
              }
            }
          },
          "then": {
            "required": ["target"]
          }
        },
        {
          "if": {
            "properties": {
              "type": {
                "const": "boolean"
              }
            }
          },
          "then": {
            "not": {
              "required": ["target"]
            }
          }
        }
      ],
      "additionalProperties": false
    }
  }
}
```

Schema validation cannot verify that icon IDs exist in `resources.images`.
Project validation must perform that cross-resource check separately.

Route Engine does not impose platform image dimensions or file formats. Those
checks belong to whatever consumes or exports the resources.

## Localization

Achievement source-language text lives directly on the resource. Do not add a
parallel `localizations` object to each achievement.

The planned patch-based localization model should target the stable achievement
resource ID and override only the translated fields:

- `name`
- `description`
- `lockedName`
- `lockedDescription`

Image localization is not part of this contract. Prefer achievement icons
without text. See [L10n.md](./L10n.md) for the project-wide localization
direction.

## Public Selectors

The engine exposes achievement definitions without requiring consumers to read
the full internal system state.

### `selectAchievements()`

Returns a cloned map of all achievement resources. It returns an empty object
when the project has no achievements.

```js
const achievements = engine.selectAchievements();
const chapterOne = achievements.chapterOneComplete;
```

### `selectAchievement({ resourceId })`

Returns a cloned achievement resource or `undefined` when it does not exist.

```js
const achievement = engine.selectAchievement({
  resourceId: "chapterOneComplete",
});
```

The selectors return authored definitions only. They do not return player
completion state.

## Authored Actions

Story and UI content use Route Engine resource IDs only.

### Complete

```json
{
  "completeAchievement": {
    "resourceId": "chapterOneComplete"
  }
}
```

Direct JavaScript dispatch uses the existing action API:

```js
engine.handleAction("completeAchievement", {
  resourceId: "chapterOneComplete",
});
```

`completeAchievement` is valid for `boolean` and `number` achievements. It
means the game has declared the achievement complete, regardless of remaining
numeric progress.

### Set Absolute Progress

```json
{
  "setAchievementProgress": {
    "resourceId": "discoverAllEndings",
    "current": "${variables.endingsFound}"
  }
}
```

Direct JavaScript dispatch:

```js
engine.handleAction("setAchievementProgress", {
  resourceId: "discoverAllEndings",
  current: 3,
});
```

Progress rules:

- `resourceId` must resolve to a `number` achievement.
- `current` must resolve to a non-negative integer.
- `current` is absolute, not a delta.
- Route Engine clamps `current` to the authored `target` in the emitted effect.
- The emitted effect includes whether the target has been completed.
- There is deliberately no `incrementAchievement` action.

Absolute progress is required because line actions can run again after replay,
load, retry, or branch navigation. A delta-based action could report the same
progress more than once.

Route Engine does not retain previously reported progress. Consumers decide
how to reconcile repeated or lower absolute values with their authoritative
state.

### Show Achievements

```json
{
  "showAchievements": {}
}
```

Direct JavaScript dispatch:

```js
engine.handleAction("showAchievements", {});
```

This action expresses a generic request to show achievements. Route Engine does
not decide whether the consumer opens native UI, renders custom UI, or ignores
the request in an environment without achievement UI.

## Emitted Effects

Achievement actions validate their input and enqueue external effects. They do
not render anything and do not mutate engine variables or player achievement
state.

Completion effect:

```js
{
  name: "completeAchievement",
  payload: {
    resourceId: "chapterOneComplete"
  }
}
```

Progress effect:

```js
{
  name: "setAchievementProgress",
  payload: {
    resourceId: "discoverAllEndings",
    current: 3,
    target: 5,
    completed: false
  }
}
```

Completed progress effect:

```js
{
  name: "setAchievementProgress",
  payload: {
    resourceId: "discoverAllEndings",
    current: 5,
    target: 5,
    completed: true
  }
}
```

Show effect:

```js
{
  name: "showAchievements";
}
```

Effect rules:

- Achievement effects are ordered.
- They must not be coalesced only by effect name. One action batch may affect
  multiple achievements.
- Repeated effects are valid.
- A missing resource, invalid progress value, or wrong progress type is an
  authored-data error and fails before an effect is queued.
- Effects contain Route Engine resource IDs, never external IDs.

## Consuming the Primitives

`createEffectsHandler(...)` already sends unknown effects to
`handleUnhandledEffect(effect, deps)`. The callback receives the engine in
`deps`, so a consumer can read the canonical resource when handling an
achievement effect.

```js
const achievementEffectNames = new Set([
  "completeAchievement",
  "setAchievementProgress",
  "showAchievements",
]);

const handleUnhandledEffect = (effect, { engine }) => {
  if (!achievementEffectNames.has(effect.name)) {
    throw new Error(`Unhandled effect: ${effect.name}`);
  }

  const resourceId = effect.payload?.resourceId;
  const achievement = resourceId
    ? engine.selectAchievement({ resourceId })
    : undefined;

  handleAchievementEffect({
    effect,
    achievement,
  });
};
```

`handleAchievementEffect` is consumer-owned. It may enqueue work, send an event,
call a native bridge, update custom UI, or forward the effect to another
service. Route Engine does not lock that integration shape.

External ID mappings, if needed, are consumer-owned data:

```js
const externalAchievementIds = {
  chapterOneComplete: "external-achievement-id",
  discoverAllEndings: "external-progress-achievement-id",
};
```

Route Engine does not store or validate that map.

## State, Save, and Rollback

Route Engine does not own player achievement state.

- Achievement definitions are static project resources.
- Achievement actions emit effects without mutating system state.
- Achievement progress is not stored in save slots by this feature.
- Loading or rollback does not produce a reverse/clear achievement effect.
- Replaying a line may emit the same absolute effect again.
- External persistence and idempotency belong to the consumer.

Projects can use ordinary variables for gameplay counters, but those variables
remain separate from external achievement completion state.

## Validation Checklist

- Achievement resource IDs are unique and stable.
- `name`, `description`, and `iconImageId` are present.
- `iconImageId` resolves through `resources.images`.
- `lockedIconImageId`, when present, resolves through `resources.images`.
- Every achievement has an explicit `boolean` or `number` type.
- Boolean achievements do not have a `target`.
- Number achievement targets are positive integers.
- Story actions reference existing Route Engine resource IDs.
- Progress actions reference `number` achievements.
- Progress actions resolve to non-negative integers.
- Effects preserve authored order and are not coalesced by name.
- Resources and effects contain no external IDs or credentials.
- Public selectors return cloned definitions rather than live mutable objects.

## Implementation

The runtime includes:

- achievement resource and authored-action schemas
- cross-resource image validation during initialization and `updateProjectData`
- cloned public resource selectors
- validated store actions that enqueue ordered external effects
- pending-effect schemas without name-only coalescing
- coverage for schema rules, clone safety, templates, action errors, effect
  ordering, progress clamping, and the external-state boundary
