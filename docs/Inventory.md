# Inventory Feature Plan

Status: proposed. Route Engine currently has object variables that can imitate a
small inventory, but it has no item catalog, invariant-preserving inventory
actions, inventory projection, or first-class save/rollback contract.

This plan follows
[FeatureSystemsArchitecture.md](./FeatureSystemsArchitecture.md). All authored,
runtime, and action data is JSON-serializable.

## Product Outcome

An author can define item resources and one or more story-local inventories.
The engine tracks ordered stacks, validates quantity/capacity rules, saves and
loads contents with the context, restores them through rollback, and exposes a
safe projection to an authored layout. Items may declare a guarded use behavior
composed from normal rollbackable engine actions.

Route Graphics renders generic item rows/cards and emits generic input events.
It does not own item quantities or inventory rules.

## Research Applied

Ren'Py does not impose an inventory data model. Screens display store data and
dispatch actions, while generic drag/drop displayables may be used to build an
inventory UI. This reinforces that inventory meaning belongs above the renderer.
See [Screens and Screen Language](https://www.renpy.org/doc/html/screens.html)
and [Drag and Drop](https://www.renpy.org/doc/html/drag_drop.html).

Naninovel documents an inventory UI as custom game state registered with its
state manager so save/load and rollback work with it. See
[Naninovel State Management](https://naninovel.com/guide/state-management).

Route Engine already has the equivalent owner: context state plus rollback
action replay. Inventory should live there instead of in Route Graphics or an
untracked UI store.

## Why a Dedicated Engine Model

An `object` variable can store arbitrary item quantities, but that alone cannot
guarantee:

- valid item references
- non-negative integer quantities
- one stack per item
- stack limits and slot capacity
- atomic add/remove behavior
- safe item-use actions
- standard projections for layouts and conditions
- consistent rollback action classification

The item catalog and inventory state therefore deserve a small domain model.
The model remains data-driven and does not require author scripting.

## Scope

### V1 Includes

- multiple named inventories per story context
- static item catalog
- ordered, stackable items
- positive integer quantities
- per-item stack limits
- inventory slot capacity
- initial contents
- add, remove, set quantity, clear, select, use, and discard actions
- semantic JSON condition helpers for quantities/capacity
- item-use conditions and rollbackable follow-up actions
- context save/load and rollback
- localizable item/inventory metadata and localized icons
- click-based inventory UI using authored layouts

### V1 Does Not Include

- unique item instances with per-instance durability/metadata
- equipment slots or character stats
- crafting recipes
- weight capacity
- drag-to-reorder or drag-to-transfer
- multiple stacks of the same item
- account-scoped/meta inventories
- network-authoritative inventories

These are separate domain features. The v1 state shape is deliberately simple
and can be migrated later with an explicit format version.

## Layer Boundary

### Route Engine Owns

- item and inventory schemas
- initial state construction
- quantity, stack-limit, and slot-capacity invariants
- item-use conditions and action transaction
- context persistence and rollback classification
- active inventory UI session and selection
- item and inventory projections
- localization resolution before projection

### Route Graphics Owns

- rendering item icons/text/count badges
- scrollable containers and clipping
- hover, click, wheel, and generic drag events
- item-card animations

### Host/Tooling Owns

- loading icon assets
- editor item/inventory pickers
- static reports for unused items and impossible initial contents

V1 needs no Route Graphics changes. Later drag/drop should extend generic drag
target/event behavior, not add an inventory plugin.

## Project Data Contract

Add `resources.items` and `resources.inventories`.

```yaml
resources:
  items:
    healingTea:
      name: Healing Tea
      description: Restores a little energy.
      iconImageId: itemHealingTea
      tags:
        - consumable
        - healing
      stackLimit: 9
      use:
        consumeQuantity: 1
        when:
          lte:
            - var: variables.energy
            - 90
        actions:
          updateVariable:
            id: useHealingTea
            operations:
              - variableId: energy
                op: increment
                value: 10
    oldKey:
      name: Old Key
      description: It opens something in the station.
      iconImageId: itemOldKey
      tags:
        - key-item
      stackLimit: 1
  inventories:
    player:
      name: Inventory
      layoutId: inventoryLayout
      slotCapacity: 20
      allowDiscard: true
      initialStacks:
        - itemId: healingTea
          quantity: 2
```

### Item Fields

| Field         | Required | Rule                                      |
| ------------- | -------- | ----------------------------------------- |
| `name`        | Yes      | Localizable source label                  |
| `description` | No       | Localizable source text                   |
| `iconImageId` | Yes      | Reference to `resources.images`           |
| `tags`        | No       | Unique non-empty machine-readable strings |
| `stackLimit`  | No       | Positive integer, default 1               |
| `use`         | No       | Guarded use definition described below    |

Tags are not translated and have no built-in engine meaning in v1. They are
project-defined machine labels exposed for UI filtering and future condition
helpers.

### Inventory Fields

| Field           | Required | Rule                                           |
| --------------- | -------- | ---------------------------------------------- |
| `name`          | Yes      | Localizable source label                       |
| `layoutId`      | Yes      | Reference to inventory layout                  |
| `slotCapacity`  | No       | Positive integer or null/omitted for unlimited |
| `allowDiscard`  | No       | Default false                                  |
| `initialStacks` | No       | Unique item IDs with valid positive quantities |

One distinct `itemId` consumes one slot regardless of quantity. Initial
quantities must not exceed the item's stack limit and initial distinct items
must fit slot capacity.

### Item Use Definition

```yaml
consumeQuantity: 1
when:
  lte:
    - var: variables.energy
    - 90
actions:
  updateVariable:
    id: useHealingTea
    operations:
      - variableId: energy
        op: increment
        value: 10
```

Rules:

- `consumeQuantity` is a positive integer and defaults to 1.
- `when` uses the existing semantic JSON condition grammar and is optional.
- `actions` is required and uses the normal action object shape.
- Use actions are restricted in v1 to deterministic, rollbackable context
  actions: `conditional`, `updateVariable`, and inventory mutations.
- Item use runs `conditional` in a non-continuing execution mode: it evaluates
  the first matching/default branch but never performs conditional's normal
  implicit story advance.
- Use actions cannot save/load, navigate story, start/end replay, open another
  modal, change device/account state, unlock account content, or recursively
  call `useInventoryItem`.
- Item use and consumption commit atomically as one rollback action batch.

Implement the non-continuing behavior as an internal-only action-runner option,
`conditionalContinuation: "none"`, whose default remains the existing
`"nextLine"` behavior for every non-item invocation, including normal line,
choice, form, and control batches.
`useInventoryItem` always supplies `"none"`, and the option propagates through
every nested conditional. In this mode the conditional runner does not create,
merge, or dispatch its auto-continuation token, does not clear navigation
timers for an implicit advance, and never calls `nextLineFromSystem`. This is
invocation metadata, not an authorable YAML field. The complete nested action
tree is still recursively checked against the item-use allowlist before any
quantity or branch action mutates state.

Restricting follow-up actions keeps inventory use reconstructible during
rollback and avoids a consumed item being mixed with a half-completed section
transition or persistent write.

## Runtime State

Inventory contents belong to each context:

```yaml
contexts:
  - id: context-1
    kind: story
    inventories:
      player:
        stacks:
          - itemId: healingTea
            quantity: 2
          - itemId: oldKey
            quantity: 1
```

Invariant rules:

- Every project inventory exists in a newly initialized story context.
- Every state item references a known item resource.
- Each item appears at most once per inventory.
- Quantity is an integer from 1 through `stackLimit`.
- Empty quantities remove the stack; quantity 0 is never stored.
- Stack array order is meaningful UI/story state and is saved and rolled back.
- Distinct stacks do not exceed slot capacity.
- Unknown inventories/items in old or malformed saves fail normalization or
  follow an explicit migration; they are never silently rendered as valid.

### Transient UI Session

Selection and the open screen are not story inventory contents:

```yaml
global:
  featureSessions:
    inventory:
      sessionId: inventory-session-5
      contextId: context-1
      inventoryId: player
      selectedItemId: healingTea
      openedFrom:
        overlayDepth: 0
```

This session is transient, closes on slot load/reset, and does not create a
rollback checkpoint. Contents remain context state.

## Actions

### Story/Domain Mutations

```yaml
addInventoryItem:
  inventoryId: player
  itemId: healingTea
  quantity: 2
  overflow: reject
removeInventoryItem:
  inventoryId: player
  itemId: healingTea
  quantity: 1
  shortage: reject
setInventoryItemQuantity:
  inventoryId: player
  itemId: healingTea
  quantity: 4
clearInventory:
  inventoryId: player
```

Policies:

- `overflow` is `reject` or `clamp`; default `reject`.
- `shortage` is `reject` or `clamp`; default `reject`.
- `reject` performs no mutation and returns a structured rejected result.
- `clamp` applies the maximum/minimum valid amount and reports the actual delta.
- A quantity of 0 is allowed only for `setInventoryItemQuantity` and removes
  the stack.
- Negative, fractional, NaN-like, string, or boolean quantities are rejected
  before mutation.
- `clearInventory` is allowed for authored reset/setup flows but should normally
  be absent from player-facing layouts.

Example action result shape used by tests/tooling:

```yaml
applied: false
reason: stackLimit
inventoryId: player
itemId: healingTea
requestedQuantity: 2
appliedQuantity: 0
quantity: 9
```

Action results are not persisted and are not part of render state.

### Use and Discard

```yaml
useInventoryItem:
  inventoryId: player
  itemId: healingTea
discardInventoryItem:
  inventoryId: player
  itemId: healingTea
  quantity: 1
```

`useInventoryItem`:

1. verifies the active context is a story or replay context; replay use is
   pinned to that top replay context
2. verifies the item exists and declares `use`
3. verifies sufficient quantity
4. evaluates `when` against the latest variables/inventory queries
5. resolves and validates the complete restricted follow-up action tree
6. applies consumption and follow-up actions in one Immer transaction/action
   batch, with nested conditionals in non-continuing mode and every read/write
   pinned to the active context ID
7. records that batch in rollback history when the active context's rollback
   policy enables checkpoints
8. emits one final render and coalesced persistence effects

If any validation fails, none of the transaction is applied. For a replay, the
engine also verifies the same replay context is still active at commit; a use
cannot read or mutate the suspended story context below it.

`discardInventoryItem` additionally requires the inventory's `allowDiscard`.
It has no item-use effects.

### UI Session Actions

```yaml
openInventory:
  inventoryId: player
selectInventoryItem:
  sessionId: inventory-session-5
  itemId: healingTea
closeInventory:
  sessionId: inventory-session-5
```

Selection of an item no longer in the inventory clears selection. All session
actions guard `sessionId` and active context identity.

## Condition Functions

Add pure, whitelisted inventory functions to the existing semantic JSON
condition evaluator:

```yaml
conditionFunctions:
  - inventoryQuantity(inventoryId, itemId)
  - inventoryHas(inventoryId, itemId, quantity)
  - inventoryCanAdd(inventoryId, itemId, quantity)
  - inventorySlotsUsed(inventoryId)
  - inventorySlotsFree(inventoryId)
```

Example authored condition:

```yaml
conditional:
  branches:
    - when:
        call: inventoryHas
        args:
          - player
          - oldKey
          - 1
      actions:
        sectionTransition:
          sectionId: stationDoorOpened
    - actions:
        sectionTransition:
          sectionId: stationDoorLocked
```

Functions close over the active engine state; project data never supplies their
implementation.

## Layout Projection

```yaml
inventory:
  sessionId: inventory-session-5
  inventoryId: player
  name: Inventory
  slotCapacity: 20
  slotsUsed: 2
  slotsFree: 18
  allowDiscard: true
  items:
    - id: healingTea
      name: Healing Tea
      description: Restores a little energy.
      iconImageId: itemHealingTea
      tags:
        - consumable
        - healing
      quantity: 2
      stackLimit: 9
      selected: true
      usable: true
      discardable: true
    - id: oldKey
      name: Old Key
      description: It opens something in the station.
      iconImageId: itemOldKey
      tags:
        - key-item
      quantity: 1
      stackLimit: 1
      selected: false
      usable: false
      discardable: true
  selected:
    id: healingTea
    name: Healing Tea
    description: Restores a little energy.
    iconImageId: itemHealingTea
    quantity: 2
    usable: true
    discardable: true
```

The projection contains no mutable references and does not expose `use.actions`
to the layout. A use button dispatches `useInventoryItem`; the engine resolves
the authoritative item definition.

An authored grid uses the existing JSON loop and ordinary nodes:

```yaml
id: inventoryGrid
type: container
x: 100
y: 160
width: 900
height: 720
direction: horizontal
gapX: 20
gapY: 20
scroll: true
children:
  - "$for item in inventory.items:":
      - id: item-${item.id}
        type: sprite
        imageId: ${item.iconImageId}
        x: 0
        y: 0
        width: 128
        height: 128
        click:
          payload:
            actions:
              selectInventoryItem:
                sessionId: ${inventory.sessionId}
                itemId: ${item.id}
      - id: item-${item.id}-quantity
        type: text
        x: 88
        y: 94
        content: ${item.quantity}
        textStyleId: inventoryQuantity
```

## Save/Load Contract

Context save state includes `inventories`:

```yaml
state:
  contexts:
    - id: context-1
      kind: story
      inventories:
        player:
          stacks:
            - itemId: healingTea
              quantity: 2
```

Load normalization:

- old slots without inventories receive each inventory's initial stacks only
  when migrating from a format that predates the feature
- once the slot format includes inventories, a missing inventory is malformed,
  not permission to respawn initial items
- unknown removed item IDs require an explicit project migration table or make
  the slot incompatible; silently dropping valuable items is not acceptable
- transient inventory session is cleared on load

## Rollback Contract

Inventory mutations are story-local and rollbackable.

- Every inventory action executed from a story line or interaction is recorded
  in the rollback action batch using its fully resolved JSON payload.
- Rollback reconstruction starts from catalog initial stacks, then replays
  inventory mutations in order with context variable mutations.
- Abandoned future inventory actions are removed when branching.
- Account unlocks and viewed registries remain outside rollback.
- A replay context receives fresh initial inventories plus replay-specific
  overrides if the replay catalog explicitly allows them. It never aliases the
  underlying story inventory.

The engine must add inventory actions to its explicit rollback-action
classification; merely serializing current stacks into checkpoints would
create a second rollback model.

## Localization

Localization patches may replace:

- item `name` and `description`
- inventory `name`
- icon image file through normal localized image overrides
- inventory layout labels and text styles

Patches cannot alter IDs, tags, stack limits, initial quantities, use
conditions/actions, capacity, or discard policy. See [L10n.md](./L10n.md).

## Error and Edge-Case Rules

- Removing the final quantity removes the stack and clears matching selection.
- Adding an absent item appends it to the end of `stacks`.
- Adding to an existing item preserves order.
- `setInventoryItemQuantity` from 0 to positive appends at the end.
- Project update that lowers a stack limit below live quantities is rejected
  until a migration is supplied.
- Project update that lowers capacity below slots used is rejected until a
  migration is supplied.
- Item use condition is reevaluated at click time.
- Repeated double-click use actions serialize through the store; the second
  action sees the first action's committed quantity.
- Replay permits item use when the fully resolved action tree stays inside the
  restricted item-use allowlist and all inventory/variable targets belong to
  the active replay context. A tree that navigates, changes context, targets the
  suspended story context, or otherwise escapes replay is rejected in full
  before consumption.

## Implementation Phases

1. Add item/inventory schemas and semantic cross-reference validation.
2. Add initial context inventory construction and load migrations.
3. Add pure selectors and condition functions.
4. Add invariant-preserving mutation actions and rollback classification.
5. Add an atomic action-batch facility for guarded item use.
6. Add transient UI session and layout projection.
7. Add localization targets.
8. Add focused tests, VT fixtures, and browser interaction paths.
9. Add creator/editor tooling after the runtime schema is locked.

## Test Plan

### Unit and System Coverage

- valid/invalid item and inventory schema
- duplicate initial stacks and missing references
- add existing/absent item
- stack-limit and slot-capacity reject/clamp behavior
- remove shortage reject/clamp and zero-stack removal
- set/clear semantics and stable order
- use guard true/false
- atomic consumption plus variable/inventory effects
- matched, default, unmatched, and nested item-use conditionals apply their
  allowed branch effects without changing the story pointer or scheduling
  `nextLineFromSystem`; ordinary non-item conditionals retain their existing
  single auto-continuation behavior
- nested invalid use action causes no mutation
- double use sees latest quantity
- condition functions at boundary values
- save round-trip and old-slot migration
- removed-item migration failure
- rollback across add/remove/use and branch abandonment
- replay-local use updates only the replay inventory/variables and, when replay
  rollback is enabled, its own rollback data; an escaping follow-up action
  rejects the whole use and leaves both replay and suspended story contexts
  unchanged
- localized metadata/icon resolution
- selector clones and session clearing

### VT and Browser Coverage

Create isolated pages for:

- empty inventory
- multi-row scrollable inventory
- selecting one item and showing details
- quantity badge update after add/remove
- usable versus disabled use button
- using an item and observing both quantity and variable-driven UI change
- discard confirmation path if confirmation is used
- locale switch changing names/descriptions/icon

If drag/reorder is later added, it requires both store transition tests and a
real browser drag path. Do not claim it from click-only tests or combine it with
unrelated gallery/music fixtures.

## Acceptance Criteria

- All inventory state and actions round-trip through JSON.
- Invalid quantities/capacity never partially mutate state.
- Inventory contents survive save/load and reconstruct through rollback.
- Item use is deterministic, guarded, atomic, and rollbackable.
- Layouts receive safe read-only projections and remain fully customizable.
- Route Graphics receives only ordinary visual/input nodes.
- Localization changes presentation without altering inventory mechanics.
