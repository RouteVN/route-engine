# Computed Variables

This document locks the authored interface for computed variables.

Computed variables are read-only derived values exposed through the same
`variables.*` template namespace as stored variables. They are recalculated from
current engine state and are not persisted as mutable state.

## Goals

- Let authors define derived values such as labels, percentages, flags, and UI
  objects.
- Reuse the existing conditional-action `when` condition model.
- Keep literal objects easy to write.
- Avoid arbitrary custom functions.
- Keep save/load, scoped persistence, and rollback state free of derived values.

## Variable Shape

A variable with a `computed` property is computed:

```yaml
resources:
  variables:
    hp:
      type: number
      scope: context
      default: 80

    maxHp:
      type: number
      scope: context
      default: 100

    hpPercent:
      type: number
      scope: context
      computed:
        expr:
          round:
            - mul:
                - div:
                    - var: variables.hp
                    - var: variables.maxHp
                - 100
```

The same declaration in JSON can compose stored and computed values:

```json
{
  "resources": {
    "variables": {
      "a": { "type": "boolean", "scope": "context", "default": true },
      "b": { "type": "boolean", "scope": "context", "default": true },
      "x": { "type": "number", "scope": "context", "default": 2 },
      "y": { "type": "number", "scope": "context", "default": 3 },
      "both": {
        "type": "boolean",
        "scope": "context",
        "computed": {
          "expr": {
            "and": [{ "var": "variables.a" }, { "var": "variables.b" }]
          }
        }
      },
      "sum": {
        "type": "number",
        "scope": "context",
        "computed": {
          "expr": {
            "add": [{ "var": "variables.x" }, { "var": "variables.y" }]
          }
        }
      },
      "doubleSum": {
        "type": "number",
        "scope": "context",
        "computed": {
          "expr": {
            "mul": [{ "var": "variables.sum" }, 2]
          }
        }
      }
    }
  }
}
```

Presence of `computed` implies read-only behavior. `readonly` is not required
for computed variables.

Computed variables must still declare `type` and `scope`:

- `type` is the expected output type.
- `scope` describes the variable's authored namespace. It does not make the
  computed value persistent.

Computed variables must not declare a top-level `default`. Use
`computed.default` only as the fallback for computed branches.

Variable resource IDs must be non-empty. The ID `__proto__` is reserved and is
rejected for both stored and computed variables.

## Simple Computed Values

A simple computed variable uses exactly one of `computed.expr` or
`computed.value`.

Use `expr` for evaluated expressions:

```yaml
hpRatio:
  type: number
  scope: context
  computed:
    expr:
      div:
        - var: variables.hp
        - var: variables.maxHp
```

Use `value` for literal data:

```yaml
mainMenuBadge:
  type: object
  scope: context
  computed:
    value:
      text: Main Menu
      colorId: white
```

`value` may be any literal YAML value, including objects and arrays.

## Conditional Computed Values

Conditional computed variables use ordered `branches` plus an explicit
`default`.

```yaml
hpState:
  type: string
  scope: context
  computed:
    branches:
      - when:
          lte:
            - var: variables.hp
            - 0
        expr: down

      - when:
          lte:
            - var: variables.hp
            - 25
        expr: critical

    default:
      expr: healthy
```

Branch rules:

- Branches are evaluated in order.
- The first branch whose `when` condition passes wins.
- Every branch must have `when`.
- Every branch must have exactly one of `expr` or `value`.
- Branches without `when` are invalid. Fallback belongs in `default`.

Default rules:

- `default` is required when `branches` exists.
- `default` must have exactly one of `expr` or `value`.
- `default` uses the same result shape as branches.

Literal object fallback example:

```yaml
hpBadge:
  type: object
  scope: context
  computed:
    branches:
      - when:
          lte:
            - var: variables.hp
            - 0
        value:
          text: Down
          colorId: gray

      - when:
          lte:
            - var: variables.hp
            - 25
        value:
          text: Critical
          colorId: red

    default:
      value:
        text: OK
        colorId: green
```

Expression fallback example:

```yaml
hpPercent:
  type: number
  scope: context
  computed:
    branches:
      - when:
          lte:
            - var: variables.maxHp
            - 0
        expr: 0

    default:
      expr:
        round:
          - mul:
              - div:
                  - var: variables.hp
                  - var: variables.maxHp
              - 100
```

## Conditions

`when` uses the same condition model as conditional actions.

```yaml
when:
  gte:
    - var: variables.trust
    - 70
```

String expression conditions are not supported.

Conditions evaluate against:

- `variables`
- `runtime`

`when` uses the conditional-action condition grammar, not the computed `expr`
operator grammar. Put arithmetic or object derivation in `expr`, or reference a
separate computed variable from `when`.

Computed variable conditions do not receive event context. `_event.*` bindings
are not available.

Function calls are not supported in computed-variable conditions. Conditions
must remain deterministic and expose all variable dependencies through `var`.

Comparisons are strict and never coerce operands. `eq` and `neq` compare both
type and value, so `1` is not equal to `"1"` and `false` is not equal to `0`.
Objects and arrays compare by identity, not by deep contents. Ordered operators
(`gt`, `gte`, `lt`, and `lte`) compare only two finite numbers or two strings;
mixed types and every other operand combination evaluate to `false`. A missing
path is also distinct from an explicit `null` value. There is currently no
dedicated `exists` operator.

These rules apply to semantic JSON computed conditions and computed expressions.
Jempl string expressions inside layout templates are a separate interface.

## Expressions

`expr` is an evaluated expression. It may be:

- a primitive literal: string, number, boolean, or null
- a variable reference
- one of the fixed expression operators

Primitive literals:

```yaml
expr: 0
expr: true
expr: healthy
expr: null
```

Variable reference:

```yaml
expr:
  var: variables.hp
```

Expressions may read:

- `variables.*`
- `runtime.*`

Every `variables.*` reference must name a declared variable resource. Bare
namespace references such as `{ var: variables }`, unknown variables, malformed
paths, and other namespaces are rejected. Use quoted bracket syntax for IDs that
contain dots:

```yaml
expr:
  var: variables["player.stats"]
```

Computed expressions and computed branch conditions use the same strict path
resolver. Quoted keys support normal JSON escaping, so IDs containing dots,
quotes, backslashes, or brackets remain addressable. Numeric brackets must be
canonical (`[0]`, `[12]`); quote string keys with leading zeroes (`["01"]`).
Malformed or ambiguous paths are rejected. Nested traversal reads own data
properties only and never follows inherited prototype properties.

Objects and arrays should be authored with `value`, not `expr`, unless the
object is an expression operator.

## Expression Operators

Computed expressions use a fixed operator set. Arbitrary function calls and
custom functions are not part of this interface.

Arithmetic:

```yaml
add: [a, b]
sub: [a, b]
mul: [a, b]
div: [a, b]
mod: [a, b]
neg: [value]
```

Numeric helpers:

```yaml
round: [value]
floor: [value]
ceil: [value]
min: [a, b]
max: [a, b]
clamp: [value, min, max]
```

Comparisons:

```yaml
eq: [a, b]
neq: [a, b]
gt: [a, b]
gte: [a, b]
lt: [a, b]
lte: [a, b]
in: [value, collection]
```

Expression comparisons use the same strict rules as branch conditions. `in`
uses strict element matching, and `includes` does not coerce its searched value;
in particular, string containment requires a string search value.

Logical operators:

```yaml
and: [a, b]
or: [a, b]
all: [a, b]
any: [a, b]
not: [value]
```

`and`, `or`, `all`, and `any` accept one or more operands. `all` and `any` are
aliases for `and` and `or`.

Collection helpers:

```yaml
length: [value]
includes: [collection, value]
```

Use `literal` when literal data is needed as an expression operand:

```yaml
literal:
  var: this-is-data-not-a-reference
```

For a whole literal computed result, prefer `computed.value`.

Each operator object must contain exactly one operator key.

## Runtime Semantics

Computed variables are projected into `variables` whenever the engine builds
template data, render state, or action condition context.

They must be visible anywhere stored variables are visible:

```yaml
content: "HP: ${variables.hpPercent}%"
```

```yaml
when:
  eq:
    - var: variables.hpState
    - critical
```

Computed values are not stored in:

- `state.global.variables`
- `context.variables`
- save slots
- scoped data persistence updates
- rollback recorded actions

`updateVariable` must reject attempts to update a computed variable.

## Public Helper

Hosts can evaluate the same computed-variable interface outside an engine
instance with `resolveComputedVariables`.

```js
import { resolveComputedVariables } from "rvn-temp";

const variables = resolveComputedVariables({
  projectData,
  variables: {
    hp: 40,
    maxHp: 100,
  },
  runtime: {
    muteAll: false,
  },
});
```

The helper accepts either full `projectData` or a `variableConfigs` object:

```js
resolveComputedVariables({
  variableConfigs: projectData.resources.variables,
  variables,
  runtime,
});
```

The returned object contains stored variables plus resolved computed variables.
Computed keys in the input `variables` object are ignored and recomputed from
their declarations.

## Type Validation

Every authored result path is validated against the variable `type` whenever
its type can be determined statically. After evaluation, the computed result is
also checked against that type.

Expected output types:

- `number`: finite JavaScript number
- `boolean`: boolean
- `string`: string
- `object`: non-null object or array

Type mismatches fail fast.

## Dependency Rules

Computed variables may reference stored variables and other computed variables
through `variables.*`.

Authoring order does not affect correctness. Before initial state creation,
project replacement, or public-helper evaluation, the engine collects a complete
dependency graph and fails fast for cycles. Dependency collection inspects every
expression operand, branch condition, branch result, and default regardless of
which path current state would select.

Full computed projections are evaluated in dependency order, so long acyclic
chains do not depend on declaration order or recursive JavaScript calls. Lazy
projections remain demand-driven and do not evaluate unrelated or inactive
values. Invalid project replacements are rejected before the engine starts the
action batch or mutates the current project state.

Literal `value` payloads and `literal` expression payloads remain opaque data and
do not create dependency edges.

Invalid cycle example:

```yaml
a:
  type: number
  scope: context
  computed:
    expr:
      add:
        - var: variables.b
        - 1

b:
  type: number
  scope: context
  computed:
    expr:
      add:
        - var: variables.a
        - 1
```

## Validation Summary

- `computed` implies read-only behavior.
- Computed variables must declare `type` and `scope`.
- Variable IDs must be non-empty and must not be `__proto__`.
- Computed variables must not declare top-level `default`.
- `computed` must contain either:
  - exactly one of `expr` or `value`
  - `branches` plus `default`
- `computed.expr` and `computed.value` are mutually exclusive.
- Each branch must have `when`.
- Each branch must have exactly one of `expr` or `value`.
- Branches without `when` are invalid.
- `computed.default` is required when `branches` exists.
- `computed.default` must have exactly one of `expr` or `value`.
- `expr` object values must contain exactly one supported operator.
- Operator names and operand counts are validated recursively.
- Variable references must target declared variables through a concrete
  `variables.*` path.
- Computed-variable conditions cannot call functions.
- Arbitrary function calls are not supported.
- Evaluation output must match `type`.
- Cycles are invalid even when hidden in inactive branches, defaults, conditions,
  or short-circuited operands.
