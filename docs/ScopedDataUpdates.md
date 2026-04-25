# Scoped Data Update Interface

`applyScopedDataUpdates` is a public runtime-facing persistence effect. Hosts and runtime adapters must treat it as a stable interface.

It is for scoped data that lives outside save slots, such as device/account variables and account-level viewed state.

## Effect Shape

```ts
type ApplyScopedDataUpdatesEffect = {
  name: "applyScopedDataUpdates";
  payload: {
    updates: ScopedDataUpdate[];
  };
};

type ScopedDataUpdate = VariableSetUpdate | ViewedRegistryMarkViewedUpdate;

type Scope = "device" | "account";

type VariableSetUpdate = {
  scope: Scope;
  path: `variables.${string}`;
  op: "set";
  value: unknown;
};

type ViewedRegistryMarkViewedUpdate = {
  scope: "account";
  path: "viewedRegistry";
  op: "markViewed";
  value: {
    sections?: Array<{
      sectionId: string;
      lineId?: string;
    }>;
    resources?: Array<{
      resourceId: string;
    }>;
  };
};
```

## Examples

```js
{
  name: "applyScopedDataUpdates",
  payload: {
    updates: [
      {
        scope: "device",
        path: "variables.textSpeed",
        op: "set",
        value: 60,
      },
      {
        scope: "account",
        path: "variables.routeUnlocked",
        op: "set",
        value: true,
      },
      {
        scope: "account",
        path: "viewedRegistry",
        op: "markViewed",
        value: {
          sections: [
            { sectionId: "prologue", lineId: "line2" },
            { sectionId: "chapter1", lineId: "line5" },
          ],
          resources: [
            { resourceId: "cg-opening" },
          ],
        },
      },
    ],
  },
}
```

## Rules

- `scope` is required on every update. Do not encode scope into `path`.
- `path` is scoped within `scope`.
- `updates` are ordered. Runtime and persistence adapters must apply them in order.
- `applyScopedDataUpdates` is incremental. It must not be coalesced by effect name.
- Every update has an explicit `op`; there is no implicit replace or merge behavior.

## Variables

Variable updates use one update per variable:

```js
{
  scope: "account",
  path: "variables.routeUnlocked",
  op: "set",
  value: true,
}
```

Rules:

- `path` must be `variables.<variableId>`.
- `op` must be `set`.
- The update sets only that variable key in the specified scope.
- It must not replace the entire variable map for that scope.
- If future variable operations are needed, add explicit operations such as `delete`, `increment`, or `append` rather than overloading `set`.

## Viewed Registry

Viewed registry updates are account-scoped domain operations:

```js
{
  scope: "account",
  path: "viewedRegistry",
  op: "markViewed",
  value: {
    sections: [{ sectionId: "prologue", lineId: "line2" }],
    resources: [{ resourceId: "cg-opening" }],
  },
}
```

Rules:

- `scope` must be `account`.
- `path` must be `viewedRegistry`.
- `op` must be `markViewed`.
- `sections` and `resources` are optional, but at least one should be present.
- `sections[].lineId` means mark that line and earlier lines in the section as viewed.
- A section entry without `lineId` preserves the existing whole-section-viewed registry behavior.
- Resource entries are set-like and idempotent.
- This operation is monotonic. It must never remove viewed state or move a section frontier backward.

`markViewed` is intentionally not a generic `merge` or `set`. It depends on viewed-registry semantics, including section line ordering and monotonic frontier advancement. Runtime implementations and persistence adapters must apply it through viewed-registry logic, not plain object merge.

## Storage Notes

Save slots must not store this effect payload. Save slots keep story context state only.

The built-in browser persistence adapter may store scoped data in its existing storage shape for compatibility, but the public write interface should remain `applyScopedDataUpdates`.

Host persistence adapters that implement account sync must map:

- `{ scope: "account", path: "variables.<id>" }` to account variable storage
- `{ scope: "account", path: "viewedRegistry" }` to account viewed-state storage
- `{ scope: "device", path: "variables.<id>" }` to device-local variable storage
