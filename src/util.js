import { current, isDraft, produce } from "immer";
import { evaluateCondition, parseAndRender } from "jempl";

/**
 * Creates a store with selectors and actions from a single object definition.
 *
 * Functions starting with "select" become selectors that read from state.
 * All other functions (except "createInitialState") become actions that can modify state.
 * The special function "createInitialState" is excluded from the store.
 *
 * @param {Object} selectorsAndActions - Object containing selector and action functions
 * @param {Object} initialState - The initial state for the store
 * @returns {Object} Store object with bound selectors and actions
 *
 * @example
 * // Basic usage
 * const store = createStore({
 *   // Selectors - read from state
 *   selectCount: (state) => state.count,
 *   selectDoubleCount: (state) => state.count * 2,
 *
 *   // Actions - modify state (note: mutations don't persist due to current implementation)
 *   increment: (state) => { state.count++; },
 *   decrement: (state) => { state.count--; },
 *   addAmount: (state, amount) => { state.count += amount; }
 * }, { count: 0 });
 *
 * console.log(store.selectCount()); // 0
 * console.log(store.selectDoubleCount()); // 0
 *
 * @example
 * // With complex state and createInitialState
 * const store = createStore({
 *   createInitialState: () => ({ todos: [], filter: 'all' }), // This won't be in store
 *
 *   selectTodos: (state) => state.todos,
 *   selectActiveTodos: (state) => state.todos.filter(t => !t.completed),
 *   selectTodoById: (state, id) => state.todos.find(t => t.id === id),
 *
 *   addTodo: (state, text) => {
 *     state.todos.push({ id: Date.now(), text, completed: false });
 *   },
 *   toggleTodo: (state, id) => {
 *     const todo = state.todos.find(t => t.id === id);
 *     if (todo) todo.completed = !todo.completed;
 *   }
 * }, { todos: [], filter: 'all' });
 *
 * // createInitialState is not included in the store
 * console.log(store.createInitialState); // undefined
 */
export const createStore = (
  initialState,
  selectorsAndActions,
  options = {},
) => {
  let state = structuredClone(initialState);
  const selectors = {};
  const actions = {};

  const {
    transformSelectorFirstArgument = (state) => state,
    transformActionFirstArgument = (state) => state,
  } = options;

  for (const [name, func] of Object.entries(selectorsAndActions)) {
    if (name === "createInitialState") {
      // Skip createInitialState - it's a special function
      continue;
    } else if (name.startsWith("select")) {
      selectors[name] = (...args) =>
        func(transformSelectorFirstArgument(state), ...args);
    } else {
      actions[name] = (...args) => {
        let actionResult;
        const newState = produce(state, (draft) => {
          const result = func(transformActionFirstArgument(draft), ...args);
          actionResult =
            result !== undefined && !isDraft(result) ? result : undefined;
        });
        state = newState;
        return actionResult;
      };
    }
  }

  return {
    ...selectors,
    ...actions,
  };
};

/**
 * Creates a sequential actions executor that processes payloads through all provided actions.
 *
 * Automatically handles both single payloads and arrays of payloads. For arrays,
 * each payload goes through all actions sequentially, accumulating state changes.
 * For single payloads, all actions are applied once.
 *
 * @param {Function} createInitialState - Function that returns the initial state
 * @param {Object} actions - Object containing action functions that mutate state
 * @returns {Function} Executor function that accepts a payload or array of payloads and returns the final state
 *
 * @example
 * // Single payload processing
 * const executePresentationActions = createSequentialActionsExecutor(
 *   () => ({ count: 0, items: [] }),
 *   {
 *     addItem: (state, payload) => { state.items.push(payload); },
 *     incrementCount: (state) => { state.count++; }
 *   }
 * );
 *
 * const result1 = executePresentationActions('apple');
 * // Result: { count: 1, items: ['apple'] }
 *
 * @example
 * // Array payload processing
 * const result2 = executePresentationActions(['banana', 'orange']);
 * // Result: { count: 2, items: ['banana', 'orange'] }
 *
 * @example
 * // Complex processing with objects
 * const executeOrderActions = createSequentialActionsExecutor(
 *   () => ({ orders: [], totalRevenue: 0, processedCount: 0 }),
 *   {
 *     recordOrder: (state, order) => {
 *       state.orders.push({
 *         id: order.id,
 *         product: order.product,
 *         amount: order.amount
 *       });
 *     },
 *     updateRevenue: (state, order) => {
 *       state.totalRevenue += order.amount;
 *     },
 *     incrementProcessed: (state) => {
 *       state.processedCount++;
 *     }
 *   }
 * );
 *
 * // Single order
 * const singleResult = executeOrderActions({ id: 1, product: 'Book', amount: 20 });
 * // Result: { orders: [{ id: 1, product: 'Book', amount: 20 }], totalRevenue: 20, processedCount: 1 }
 *
 * // Multiple orders
 * const batchResult = executeOrderActions([
 *   { id: 1, product: 'Book', amount: 20 },
 *   { id: 2, product: 'Pen', amount: 5 },
 *   { id: 3, product: 'Notebook', amount: 15 }
 * ]);
 * // Result: { orders: [...], totalRevenue: 40, processedCount: 3 }
 *
 */
export const createSequentialActionsExecutor = (
  createInitialState,
  actions,
) => {
  return (payloadOrPayloads) => {
    const initialState = createInitialState();
    const payloads = Array.isArray(payloadOrPayloads)
      ? payloadOrPayloads
      : [payloadOrPayloads];

    return produce(initialState, (draft) => {
      payloads.forEach((payload) => {
        actions.forEach((action) => {
          action(draft, payload);
        });
      });
    });
  };
};

/**
 * Creates a selective actions executor that applies only specified actions with their corresponding payloads.
 *
 * Unlike createSequentialActionsExecutor which applies all actions sequentially, this function applies only
 * the actions that have provided payloads using Immer's produce for efficient mutations. Each action
 * receives its own specific payload from the payloads object, making it ideal for applying multiple
 * independent state updates selectively.
 *
 * @param {Object} deps - Dependencies object passed to all actions (e.g., external state, services)
 * @param {Object} actions - Object containing action functions that mutate state
 * @param {Function} createInitialState - Function that returns the initial state
 * @returns {Function} Executor function that accepts payloads object and returns the new state
 *
 * @example
 * // Basic selective construction
 * const executeSystemActions = createSelectiveActionsExecutor(
 *   { api: apiService, config: appConfig },
 *   {
 *     setUser: (state, deps, payload) => {
 *       state.user = payload.user;
 *       state.lastUpdated = Date.now();
 *     },
 *     setPreferences: (state, deps, payload) => {
 *       state.preferences = { ...state.preferences, ...payload.prefs };
 *     },
 *     incrementCounter: (state, deps, payload) => {
 *       state.counter += payload.amount || 1;
 *     }
 *   },
 *   () => ({ user: null, preferences: {}, counter: 0, lastUpdated: null })
 * );
 *
 * const newState = executeSystemActions({
 *   setUser: { user: { id: 1, name: 'Alice' } },
 *   setPreferences: { prefs: { theme: 'dark', lang: 'en' } },
 *   incrementCounter: { amount: 5 }
 * });
 * // Result: {
 * //   user: { id: 1, name: 'Alice' },
 * //   preferences: { theme: 'dark', lang: 'en' },
 * //   counter: 5,
 * //   lastUpdated: 1234567890
 * // }
 *
 * @example
 * // Complex state updates with dependencies
 * const executeGameActions = createSelectiveActionsExecutor(
 *   {
 *     gameRules: { maxHealth: 100, maxMana: 50 },
 *     logger: console
 *   },
 *   {
 *     takeDamage: (state, deps, payload) => {
 *       state.player.health = Math.max(0, state.player.health - payload.damage);
 *       if (state.player.health === 0) {
 *         state.gameOver = true;
 *         deps.logger.log('Game Over!');
 *       }
 *     },
 *     healPlayer: (state, deps, payload) => {
 *       state.player.health = Math.min(
 *         deps.gameRules.maxHealth,
 *         state.player.health + payload.amount
 *       );
 *     },
 *     addItem: (state, deps, payload) => {
 *       state.inventory.push(payload.item);
 *       state.inventoryCount++;
 *     },
 *     spendMana: (state, deps, payload) => {
 *       state.player.mana = Math.max(0, state.player.mana - payload.cost);
 *     }
 *   },
 *   () => ({
 *     player: { health: 100, mana: 50 },
 *     inventory: [],
 *     inventoryCount: 0,
 *     gameOver: false
 *   })
 * );
 *
 * // Apply multiple game actions at once
 * const battleResult = executeGameActions({
 *   takeDamage: { damage: 30 },
 *   spendMana: { cost: 10 },
 *   addItem: { item: { id: 1, name: 'Health Potion', type: 'consumable' } }
 * });
 *
 * @example
 * // Selective action application - only provided actions are executed
 * const executeAppActions = createSelectiveActionsExecutor(
 *   {},
 *   {
 *     updateA: (state) => { state.a = 'updated'; },
 *     updateB: (state) => { state.b = 'updated'; },
 *     updateC: (state) => { state.c = 'updated'; }
 *   },
 *   () => ({ a: 'initial', b: 'initial', c: 'initial' })
 * );
 *
 * // Only updateA and updateC are applied
 * const result = executeAppActions({
 *   updateA: {},
 *   updateC: {}
 * });
 * // Result: { a: 'updated', b: 'initial', c: 'updated' }
 */
export const createSelectiveActionsExecutor = (
  deps,
  actions,
  createInitialState,
) => {
  return (payloads) => {
    const initialState = createInitialState();
    return produce(initialState, (draft) => {
      for (const [name, action] of Object.entries(actions)) {
        if (name in payloads) {
          action(draft, deps, payloads[name]);
        }
      }
    });
  };
};

/**
 * Gets the default value for a variable based on its configuration
 * @param {Object} config - Variable configuration
 * @param {string} config.type - Variable type (number, boolean, string, object)
 * @param {*} config.default - Optional default value
 * @param {string} variableId - Variable identifier (for error messages)
 * @returns {*} Default value for the variable
 * @throws {Error} If variable type is invalid
 *
 * @example
 * getVariableDefaultValue({ type: 'number' }, 'score') // 0
 * getVariableDefaultValue({ type: 'boolean', default: true }, 'flag') // true
 * getVariableDefaultValue({ type: 'object', default: {items: []} }, 'data') // {items: []}
 * getVariableDefaultValue({ type: 'unknown' }, 'bad') // throws Error
 */
export const getVariableDefaultValue = (config, variableId) => {
  if (config.default !== undefined) {
    return config.default;
  }

  const VALID_TYPES = ["number", "boolean", "string", "object"];

  if (!VALID_TYPES.includes(config.type)) {
    throw new Error(
      `Invalid variable type: ${config.type} for variable ${variableId}. Expected one of: ${VALID_TYPES.join(", ")}`,
    );
  }

  switch (config.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string":
      return "";
    case "object":
      return {};
  }
};

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object ?? {}, key);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const cloneDataValue = (value) => {
  const source = isDraft(value) ? current(value) : value;
  return structuredClone(source);
};

export const isComputedVariableConfig = (config) => hasOwn(config, "computed");

export const filterStoredVariables = (variables = {}, variableConfigs = {}) =>
  Object.fromEntries(
    Object.entries(variables ?? {}).filter(
      ([variableId]) => !isComputedVariableConfig(variableConfigs[variableId]),
    ),
  );

const parseVariablePath = (path) =>
  String(path)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

const resolvePathFrom = (value, pathParts) => {
  let currentValue = value;

  for (const part of pathParts) {
    if (currentValue === undefined || currentValue === null) {
      return undefined;
    }
    currentValue = currentValue[part];
  }

  return currentValue;
};

const resolveComputedPath = (path, context = {}) => {
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error("Computed expression var requires a non-empty string path");
  }

  const pathParts = parseVariablePath(path);
  const [root, variableId, ...nestedPath] = pathParts;

  if (root === "variables") {
    if (!variableId) {
      return context.variables;
    }

    const variableValue =
      typeof context.resolveVariable === "function"
        ? context.resolveVariable(variableId)
        : context.variables?.[variableId];
    return resolvePathFrom(variableValue, nestedPath);
  }

  if (root === "runtime") {
    return resolvePathFrom(context.runtime, pathParts.slice(1));
  }

  return resolvePathFrom(context, pathParts);
};

const assertOperandList = (operator, operands, expectedLength) => {
  if (!Array.isArray(operands)) {
    throw new Error(
      `Computed expression operator "${operator}" requires an array`,
    );
  }

  if (expectedLength !== undefined && operands.length !== expectedLength) {
    throw new Error(
      `Computed expression operator "${operator}" requires ${expectedLength} operand(s)`,
    );
  }
};

const assertAtLeastOneOperand = (operator, operands) => {
  if (!Array.isArray(operands)) {
    throw new Error(
      `Computed expression operator "${operator}" requires an array`,
    );
  }

  if (operands.length === 0) {
    throw new Error(
      `Computed expression operator "${operator}" requires at least one operand`,
    );
  }
};

const assertNumber = (operator, value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Computed expression operator "${operator}" requires finite numeric operands`,
    );
  }
};

const evaluateOperandList = (operator, operands, context, expectedLength) => {
  assertOperandList(operator, operands, expectedLength);
  return operands.map((operand) =>
    evaluateComputedExpression(operand, context),
  );
};

const evaluateNumericOperandList = (
  operator,
  operands,
  context,
  expectedLength,
) => {
  const values = evaluateOperandList(
    operator,
    operands,
    context,
    expectedLength,
  );
  values.forEach((value) => assertNumber(operator, value));
  return values;
};

const evaluateComputedOperator = (operator, operands, context) => {
  switch (operator) {
    case "var":
      return resolveComputedPath(operands, context);
    case "add": {
      const [left, right] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        2,
      );
      return left + right;
    }
    case "sub": {
      const [left, right] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        2,
      );
      return left - right;
    }
    case "mul": {
      const [left, right] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        2,
      );
      return left * right;
    }
    case "div": {
      const [left, right] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        2,
      );
      return left / right;
    }
    case "mod": {
      const [left, right] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        2,
      );
      return left % right;
    }
    case "neg": {
      const [value] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        1,
      );
      return -value;
    }
    case "round": {
      const [value] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        1,
      );
      return Math.round(value);
    }
    case "floor": {
      const [value] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        1,
      );
      return Math.floor(value);
    }
    case "ceil": {
      const [value] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        1,
      );
      return Math.ceil(value);
    }
    case "min": {
      const [left, right] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        2,
      );
      return Math.min(left, right);
    }
    case "max": {
      const [left, right] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        2,
      );
      return Math.max(left, right);
    }
    case "clamp": {
      const [value, min, max] = evaluateNumericOperandList(
        operator,
        operands,
        context,
        3,
      );
      return Math.min(max, Math.max(min, value));
    }
    case "eq": {
      const [left, right] = evaluateOperandList(operator, operands, context, 2);
      return left == right;
    }
    case "neq": {
      const [left, right] = evaluateOperandList(operator, operands, context, 2);
      return left != right;
    }
    case "gt": {
      const [left, right] = evaluateOperandList(operator, operands, context, 2);
      return left > right;
    }
    case "gte": {
      const [left, right] = evaluateOperandList(operator, operands, context, 2);
      return left >= right;
    }
    case "lt": {
      const [left, right] = evaluateOperandList(operator, operands, context, 2);
      return left < right;
    }
    case "lte": {
      const [left, right] = evaluateOperandList(operator, operands, context, 2);
      return left <= right;
    }
    case "in": {
      const [left, right] = evaluateOperandList(operator, operands, context, 2);
      return Array.isArray(right) ? right.includes(left) : false;
    }
    case "and":
    case "all": {
      assertAtLeastOneOperand(operator, operands);
      return operands.every((operand) =>
        Boolean(evaluateComputedExpression(operand, context)),
      );
    }
    case "or":
    case "any": {
      assertAtLeastOneOperand(operator, operands);
      return operands.some((operand) =>
        Boolean(evaluateComputedExpression(operand, context)),
      );
    }
    case "not": {
      const [value] = evaluateOperandList(operator, operands, context, 1);
      return !value;
    }
    case "length": {
      const [value] = evaluateOperandList(operator, operands, context, 1);
      if (typeof value === "string" || Array.isArray(value)) {
        return value.length;
      }
      if (isRecord(value)) {
        return Object.keys(value).length;
      }
      return 0;
    }
    case "includes": {
      const [collection, value] = evaluateOperandList(
        operator,
        operands,
        context,
        2,
      );
      if (typeof collection === "string") {
        return collection.includes(value);
      }
      return Array.isArray(collection) ? collection.includes(value) : false;
    }
    case "literal":
      return cloneDataValue(operands);
    default:
      throw new Error(`Unknown computed expression operator: ${operator}`);
  }
};

export const evaluateComputedExpression = (expr, context = {}) => {
  if (expr === null || typeof expr !== "object") {
    return expr;
  }

  if (Array.isArray(expr)) {
    throw new Error(
      "Computed expression arrays are not valid; use value for literal arrays",
    );
  }

  const entries = Object.entries(expr);
  if (entries.length !== 1) {
    throw new Error(
      "Computed expression objects must contain exactly one operator",
    );
  }

  const [[operator, operands]] = entries;
  return evaluateComputedOperator(operator, operands, context);
};

const evaluateComputedCondition = (condition, context = {}) => {
  return evaluateCondition(condition, {
    variables: context.variables,
    runtime: context.runtime,
  });
};

const assertComputedResultConfig = (resultConfig, path) => {
  if (!isRecord(resultConfig)) {
    throw new Error(`${path} must be an object`);
  }

  const hasExpr = hasOwn(resultConfig, "expr");
  const hasValue = hasOwn(resultConfig, "value");
  if (hasExpr === hasValue) {
    throw new Error(`${path} must contain exactly one of expr or value`);
  }
};

const evaluateComputedResultConfig = (resultConfig, path, context) => {
  assertComputedResultConfig(resultConfig, path);

  if (hasOwn(resultConfig, "value")) {
    return cloneDataValue(resultConfig.value);
  }

  return evaluateComputedExpression(resultConfig.expr, context);
};

export const evaluateComputedVariable = (
  computedConfig,
  context = {},
  variableId = "unknown",
) => {
  if (!isRecord(computedConfig)) {
    throw new Error(
      `Computed variable "${variableId}" computed must be an object`,
    );
  }

  const hasExpr = hasOwn(computedConfig, "expr");
  const hasValue = hasOwn(computedConfig, "value");
  const hasBranches = hasOwn(computedConfig, "branches");

  if (hasBranches) {
    if (hasExpr || hasValue) {
      throw new Error(
        `Computed variable "${variableId}" cannot combine branches with expr or value`,
      );
    }

    if (!Array.isArray(computedConfig.branches)) {
      throw new Error(
        `Computed variable "${variableId}" branches must be an array`,
      );
    }
    if (computedConfig.branches.length === 0) {
      throw new Error(
        `Computed variable "${variableId}" branches must not be empty`,
      );
    }
    if (!isRecord(computedConfig.default)) {
      throw new Error(`Computed variable "${variableId}" requires default`);
    }

    for (let index = 0; index < computedConfig.branches.length; index += 1) {
      const branch = computedConfig.branches[index];
      if (!isRecord(branch)) {
        throw new Error(
          `Computed variable "${variableId}" branch ${index} must be an object`,
        );
      }
      if (!hasOwn(branch, "when")) {
        throw new Error(
          `Computed variable "${variableId}" branch ${index} requires when`,
        );
      }

      if (evaluateComputedCondition(branch.when, context)) {
        return evaluateComputedResultConfig(
          branch,
          `Computed variable "${variableId}" branch ${index}`,
          context,
        );
      }
    }

    return evaluateComputedResultConfig(
      computedConfig.default,
      `Computed variable "${variableId}" default`,
      context,
    );
  }

  if (hasExpr === hasValue) {
    throw new Error(
      `Computed variable "${variableId}" must contain exactly one of expr, value, or branches`,
    );
  }

  return evaluateComputedResultConfig(
    computedConfig,
    `Computed variable "${variableId}"`,
    context,
  );
};

export const assertComputedVariableValueType = (variableId, type, value) => {
  switch (type) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(
          `Computed variable "${variableId}" expected type number, got ${Array.isArray(value) ? "array" : typeof value}`,
        );
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new Error(
          `Computed variable "${variableId}" expected type boolean, got ${Array.isArray(value) ? "array" : typeof value}`,
        );
      }
      return;
    case "string":
      if (typeof value !== "string") {
        throw new Error(
          `Computed variable "${variableId}" expected type string, got ${Array.isArray(value) ? "array" : typeof value}`,
        );
      }
      return;
    case "object":
      if (value === null || typeof value !== "object") {
        throw new Error(
          `Computed variable "${variableId}" expected type object, got ${typeof value}`,
        );
      }
      return;
    default:
      throw new Error(
        `Invalid variable type: ${type} for computed variable ${variableId}`,
      );
  }
};

export const selectVariablesWithComputedValues = ({
  variables = {},
  runtime = {},
  variableConfigs = {},
  eager = true,
} = {}) => {
  const storedVariables = filterStoredVariables(variables, variableConfigs);
  const computedVariableIds = Object.entries(variableConfigs)
    .filter(([, config]) => isComputedVariableConfig(config))
    .map(([variableId]) => variableId);
  const resolvedComputedVariables = {};
  const resolvingVariableIds = [];

  const resolveVariable = (variableId) => {
    if (hasOwn(resolvedComputedVariables, variableId)) {
      return resolvedComputedVariables[variableId];
    }

    const variableConfig = variableConfigs[variableId];
    if (!isComputedVariableConfig(variableConfig)) {
      return storedVariables[variableId];
    }

    const existingStackIndex = resolvingVariableIds.indexOf(variableId);
    if (existingStackIndex >= 0) {
      const cycle = [
        ...resolvingVariableIds.slice(existingStackIndex),
        variableId,
      ].join(" -> ");
      throw new Error(`Computed variable cycle detected: ${cycle}`);
    }

    resolvingVariableIds.push(variableId);
    try {
      const value = evaluateComputedVariable(
        variableConfig.computed,
        computedContext,
        variableId,
      );
      assertComputedVariableValueType(variableId, variableConfig.type, value);
      resolvedComputedVariables[variableId] = value;
      return value;
    } finally {
      resolvingVariableIds.pop();
    }
  };

  const variablesProxy = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property !== "string") {
          return undefined;
        }
        return resolveVariable(property);
      },
      has: (_target, property) =>
        typeof property === "string" &&
        (hasOwn(storedVariables, property) ||
          computedVariableIds.includes(property)),
      ownKeys: () => [
        ...new Set([...Object.keys(storedVariables), ...computedVariableIds]),
      ],
      getOwnPropertyDescriptor: (_target, property) => {
        if (
          typeof property !== "string" ||
          (!hasOwn(storedVariables, property) &&
            !computedVariableIds.includes(property))
        ) {
          return undefined;
        }

        return {
          enumerable: true,
          configurable: true,
        };
      },
    },
  );

  const computedContext = {
    variables: variablesProxy,
    runtime,
    resolveVariable,
  };

  if (!eager) {
    return variablesProxy;
  }

  computedVariableIds.forEach((variableId) => {
    resolveVariable(variableId);
  });

  return {
    ...storedVariables,
    ...resolvedComputedVariables,
  };
};

export const resolveComputedVariables = ({
  variables = {},
  runtime = {},
  variableConfigs,
  projectData,
} = {}) => {
  return selectVariablesWithComputedValues({
    variables,
    runtime,
    variableConfigs: variableConfigs ?? projectData?.resources?.variables ?? {},
    eager: true,
  });
};

/**
 * Gets default variable values from project data, categorizing them by scope
 * Pure function - throws error for invalid variable types or scopes
 *
 * @param {Object} projectData - Project data containing variable definitions
 * @param {Object} projectData.resources.variables - Variable definitions
 * @returns {Object} Object with contextVariableDefaultValues and globalVariablesDefaultValues
 * @throws {Error} If variable has invalid type
 *
 * @example
 * const projectData = {
 *   resources: {
 *     variables: {
 *       playerName: { type: 'string', scope: 'context', default: 'Player' },
 *       volume: { type: 'number', scope: 'device', default: 50 }
 *     }
 *   }
 * };
 * const { contextVariableDefaultValues, globalVariablesDefaultValues } = getDefaultVariablesFromProjectData(projectData);
 * // contextVariableDefaultValues = { playerName: 'Player' }
 * // globalVariablesDefaultValues = { volume: 50 }
 */
export const getDefaultVariablesFromProjectData = (projectData) => {
  const contextVariableDefaultValues = {};
  const globalVariablesDefaultValues = {};

  if (!projectData.resources?.variables) {
    return { contextVariableDefaultValues, globalVariablesDefaultValues };
  }

  Object.entries(projectData.resources.variables).forEach(
    ([variableId, config]) => {
      if (isComputedVariableConfig(config)) {
        return;
      }

      const value = getVariableDefaultValue(config, variableId);

      if (config.scope === "context") {
        contextVariableDefaultValues[variableId] = value;
      } else {
        // device and account scopes both go to globalVariablesDefaultValues
        globalVariablesDefaultValues[variableId] = value;
      }
    },
  );

  return { contextVariableDefaultValues, globalVariablesDefaultValues };
};

/**
 * Validates that a variable scope is defined and valid
 * Pure function - throws error for invalid scopes
 *
 * @param {string} scope - Variable scope to validate
 * @param {string} variableId - Variable identifier (for error messages)
 * @throws {Error} If scope is missing or invalid
 *
 * @example
 * validateVariableScope('device', 'score') // No error
 * validateVariableScope('invalid', 'score') // Throws Error
 * validateVariableScope(undefined, 'score') // Throws Error
 */
export const validateVariableScope = (scope, variableId) => {
  const VALID_SCOPES = ["context", "device", "account"];

  if (!scope) {
    throw new Error(`Variable scope is required for variable: ${variableId}`);
  }

  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(
      `Invalid variable scope: ${scope} for variable ${variableId}. Expected one of: ${VALID_SCOPES.join(", ")}`,
    );
  }
};

/**
 * Validates that an operation is compatible with a variable type
 * Pure function - throws error for incompatible operations
 *
 * @param {string} type - Variable type (number, boolean, string)
 * @param {string} op - Operation to validate
 * @param {string} variableId - Variable identifier (for error messages)
 * @throws {Error} If type is unknown or operation is incompatible
 *
 * @example
 * validateVariableOperation('number', 'increment', 'score') // No error
 * validateVariableOperation('boolean', 'increment', 'flag') // Throws Error
 * validateVariableOperation('string', 'set', 'name') // No error
 */
export const validateVariableOperation = (type, op, variableId) => {
  const VALID_OPS_BY_TYPE = {
    number: ["set", "increment", "decrement", "multiply", "divide"],
    boolean: ["set", "toggle"],
    string: ["set"],
    object: ["set"],
  };

  // First check if type is valid
  const validOps = VALID_OPS_BY_TYPE[type];
  if (!validOps) {
    throw new Error(
      `Unknown variable type: ${type} for variable ${variableId}`,
    );
  }

  // Check if operation is known at all
  const allOps = Object.values(VALID_OPS_BY_TYPE).flat();
  if (!allOps.includes(op)) {
    throw new Error(`Unknown operation: ${op}`);
  }

  // Check if operation is valid for this type
  if (!validOps.includes(op)) {
    throw new Error(
      `Operation "${op}" is not valid for variable "${variableId}" of type "${type}". Valid operations: ${validOps.join(", ")}`,
    );
  }
};

/**
 * Applies a variable operation to calculate the new value
 * Pure function - returns new value without side effects
 *
 * @param {*} currentValue - Current value of the variable
 * @param {string} op - Operation to apply (set, increment, decrement, multiply, divide, toggle)
 * @param {*} value - Value parameter for the operation (optional for increment/decrement/toggle)
 * @returns {*} New value after applying the operation
 * @throws {Error} If operation is unknown
 *
 * @example
 * applyVariableOperation(5, 'increment') // 6
 * applyVariableOperation(10, 'increment', 5) // 15
 * applyVariableOperation(true, 'toggle') // false
 * applyVariableOperation(3, 'multiply', 4) // 12
 */
export const applyVariableOperation = (currentValue, op, value) => {
  switch (op) {
    case "set":
      return value;
    case "multiply":
      return (currentValue ?? 1) * value;
    case "divide":
      return (currentValue ?? 0) / value;
    case "increment":
      return (currentValue ?? 0) + (value ?? 1);
    case "decrement":
      return (currentValue ?? 0) - (value ?? 1);
    case "toggle":
      return !currentValue;
    default:
      throw new Error(`Unknown operation: ${op}`);
  }
};

/**
 * Filters variables by scope from a variables object
 * Pure function - returns new object with filtered variables
 *
 * @param {Object} variables - Object containing variable values
 * @param {Object} variableConfigs - Variable configuration objects with scope information
 * @param {string} targetScope - Scope to filter by (context, device, or account)
 * @returns {Object} New object containing only variables matching the target scope
 *
 * @example
 * const vars = { score: 100, volume: 80, achievement: true };
 * const configs = {
 *   score: { scope: 'context' },
 *   volume: { scope: 'device' },
 *   achievement: { scope: 'account' }
 * };
 * filterVariablesByScope(vars, configs, 'device') // { volume: 80 }
 * filterVariablesByScope(vars, configs, 'context') // { score: 100 }
 */
export const filterVariablesByScope = (
  variables,
  variableConfigs,
  targetScope,
) => {
  return Object.fromEntries(
    Object.entries(variables).filter(
      ([varId]) => variableConfigs?.[varId]?.scope === targetScope,
    ),
  );
};

/**
 * Formats a timestamp into a readable date string.
 *
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @param {string} [format="DD/MM/YYYY - HH:mm"] - Format string with tokens
 * @returns {string} Formatted date string, or empty string if no timestamp
 *
 * Supported tokens:
 * - DD: Day (01-31)
 * - MM: Month (01-12)
 * - YYYY: Full year (2026)
 * - YY: Short year (26)
 * - HH: Hours (00-23)
 * - mm: Minutes (00-59)
 * - ss: Seconds (00-59)
 *
 * @example
 * formatDate(1736275000000) // "07/01/2026 - 19:56"
 * formatDate(1736275000000, "YYYY-MM-DD") // "2026-01-07"
 * formatDate(1736275000000, "MM/DD/YY HH:mm:ss") // "01/07/26 19:56:40"
 */
export const formatDate = (timestamp, format = "DD/MM/YYYY - HH:mm") => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, "0");
  return format
    .replace("DD", pad(date.getDate()))
    .replace("MM", pad(date.getMonth() + 1))
    .replace("YYYY", date.getFullYear())
    .replace("YY", String(date.getFullYear()).slice(-2))
    .replace("HH", pad(date.getHours()))
    .replace("mm", pad(date.getMinutes()))
    .replace("ss", pad(date.getSeconds()));
};

/**
 * Compares two dialogue states, flagging changes only for renderable dialogue
 * asset updates. Ignores content, characterId, and speaker name changes to
 * reduce noise.
 * @param {Object} prevDialogue - Previous dialogue state
 * @param {Object} currDialogue - Current dialogue state
 * @returns {Object|null} Change object or null if no significant change
 */
const diffDialogue = (prevDialogue, currDialogue) => {
  const toRenderableDialogueState = (dialogue) => {
    if (!dialogue) {
      return undefined;
    }

    const renderableState = {};
    if (dialogue.ui) {
      renderableState.ui = dialogue.ui;
    }

    const sprite = dialogue.character?.sprite;
    if (sprite && Object.keys(sprite).length > 0) {
      renderableState.sprite = sprite;
    }

    return Object.keys(renderableState).length > 0
      ? renderableState
      : undefined;
  };

  const prevRenderable = toRenderableDialogueState(prevDialogue);
  const currRenderable = toRenderableDialogueState(currDialogue);

  if (JSON.stringify(prevRenderable) === JSON.stringify(currRenderable)) {
    return null;
  }

  if (prevRenderable && !currRenderable) {
    return { changeType: "delete", data: prevDialogue };
  }

  if (currRenderable && !prevRenderable) {
    return { changeType: "add", data: currDialogue };
  }

  if (currRenderable && prevRenderable) {
    return { changeType: "update", data: currDialogue };
  }

  return null;
};

/**
 * Compares two presentation states and returns the changes (add, update, delete)
 * for all renderable assets.
 *
 * @param {Object} prev - Previous presentation state
 * @param {Object} curr - Current presentation state
 * @returns {Object} Changes object keyed by asset type
 */
export const diffPresentationState = (prev = {}, curr = {}) => {
  const changes = {};
  const instantaneousKeys = ["sfx", "voice"];

  const diffObject = (key) => {
    const prevItem = prev[key];
    const currItem = curr[key];

    if (currItem && !prevItem) {
      changes[key] = { changeType: "add", data: currItem };
    } else if (prevItem && !currItem) {
      if (!instantaneousKeys.includes(key)) {
        changes[key] = { changeType: "delete", data: prevItem };
      }
    } else if (prevItem && currItem) {
      if (JSON.stringify(prevItem) !== JSON.stringify(currItem)) {
        changes[key] = { changeType: "update", data: currItem };
      }
    }
  };

  diffObject("background");
  diffObject("bgm");
  diffObject("voice");

  // Special handling for dialogue
  const dialogueChange = diffDialogue(prev.dialogue, curr.dialogue);
  if (dialogueChange) {
    changes.dialogue = dialogueChange;
  }

  diffObject("choice");
  diffObject("form");
  diffObject("layout");
  diffObject("animation");
  diffObject("control");

  diffObject("character");
  diffObject("visual");
  diffObject("sfx");

  return changes;
};

export const normalizePersistentPresentationState = (state = {}) => {
  const normalizedState = structuredClone(state);

  if (normalizedState.background) {
    if (
      normalizedState.background.animations?.playback?.continuity !==
      "persistent"
    ) {
      delete normalizedState.background.animations;
    }

    if (!normalizedState.background.resourceId) {
      delete normalizedState.background;
    }
  }

  const stripAnimationsFromObject = (key) => {
    if (!normalizedState[key]) {
      return;
    }

    delete normalizedState[key].animations;

    if (Object.keys(normalizedState[key]).length === 0) {
      delete normalizedState[key];
    }
  };

  stripAnimationsFromObject("layout");
  stripAnimationsFromObject("choice");
  stripAnimationsFromObject("form");

  if (normalizedState.dialogue?.ui) {
    delete normalizedState.dialogue.ui.animations;

    if (Object.keys(normalizedState.dialogue.ui).length === 0) {
      delete normalizedState.dialogue.ui;
    }

    if (Object.keys(normalizedState.dialogue).length === 0) {
      delete normalizedState.dialogue;
    }
  }

  if (normalizedState.dialogue?.character?.sprite) {
    delete normalizedState.dialogue.character.sprite.animations;

    if (Object.keys(normalizedState.dialogue.character.sprite).length === 0) {
      delete normalizedState.dialogue.character.sprite;
    }

    if (Object.keys(normalizedState.dialogue.character).length === 0) {
      delete normalizedState.dialogue.character;
    }

    if (Object.keys(normalizedState.dialogue).length === 0) {
      delete normalizedState.dialogue;
    }
  }

  const stripAnimationsFromItems = (key, hasPersistentFields) => {
    const items = normalizedState[key]?.items;
    if (!Array.isArray(items)) {
      return;
    }

    normalizedState[key].items = items
      .map((item) => {
        const normalizedItem = { ...item };
        delete normalizedItem.animations;
        return hasPersistentFields(normalizedItem) ? normalizedItem : null;
      })
      .filter(Boolean);

    if (normalizedState[key].items.length === 0) {
      delete normalizedState[key];
    }
  };

  stripAnimationsFromItems(
    "character",
    (item) =>
      (item.sprites && item.sprites.length > 0) ||
      item.transformId ||
      item.resourceId,
  );
  stripAnimationsFromItems(
    "visual",
    (item) => item.resourceId || item.transformId,
  );

  return normalizedState;
};

const getValueByPath = (source, path) => {
  if (!source || !path) return undefined;

  let current = source;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (!(segment in Object(current))) return undefined;
    current = current[segment];
  }
  return current;
};

const resolveEventBindingString = (value, eventData) => {
  if (typeof value !== "string") return value;
  if (value === "_event") {
    if (eventData === undefined || eventData === null) {
      throw new Error(
        'Action template binding "_event" requires event context "_event".',
      );
    }
    return eventData;
  }
  if (!value.startsWith("_event.")) return value;
  if (eventData === undefined || eventData === null) {
    throw new Error(
      `Action template binding "${value}" requires event context "_event".`,
    );
  }

  const path = value.slice("_event.".length);
  const resolved = getValueByPath(eventData, path);
  if (resolved === undefined) {
    throw new Error(
      `Action template binding "${value}" could not be resolved from "_event".`,
    );
  }
  return resolved;
};

const OPAQUE_ACTION_BRANCHES = {
  conditional: new Set(["branches"]),
  updateProjectData: new Set(["projectData"]),
  showConfirmDialog: new Set(["confirmActions", "cancelActions"]),
  form: new Set(["submitActions", "cancelActions"]),
  submitForm: new Set(["actions"]),
  cancelForm: new Set(["actions"]),
};

const isOpaqueActionBranch = (path, key) => {
  const parentKey = path[path.length - 1];
  if (!parentKey) {
    return false;
  }

  return OPAQUE_ACTION_BRANCHES[parentKey]?.has(key) === true;
};

const resolveEventBindings = (value, eventData, path = []) => {
  if (Array.isArray(value)) {
    return value.map((item) => resolveEventBindings(item, eventData, path));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isOpaqueActionBranch(path, key)
          ? nestedValue
          : resolveEventBindings(nestedValue, eventData, [...path, key]),
      ]),
    );
  }
  return resolveEventBindingString(value, eventData);
};

const renderActionTemplates = (value, context, path = []) => {
  if (Array.isArray(value)) {
    return value.map((item) => renderActionTemplates(item, context, path));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isOpaqueActionBranch(path, key)
          ? nestedValue
          : renderActionTemplates(nestedValue, context, [...path, key]),
      ]),
    );
  }

  if (typeof value === "string") {
    return parseAndRender(value, context);
  }

  return value;
};

/**
 * Processes action payloads by resolving `_event.*` bindings and rendering jempl templates.
 *
 * `_event.*` bindings are resolved directly from event context.
 * jempl interpolation remains available for `${variables.*}` and similar templates.
 *
 * @param {Object} actions - Action payload object that may contain `_event.*` and jempl template strings
 * @param {Object} context - Context object (e.g., { _event: { value: 42 }, variables: {...} })
 * @returns {Object} Processed actions with event bindings and templates resolved
 */
export const processActionTemplates = (actions, context) => {
  if (!context) return actions;
  if (Object.prototype.hasOwnProperty.call(context, "event")) {
    throw new Error(
      'Action template context key "event" is no longer supported. Use "_event".',
    );
  }

  const eventResolvedActions = resolveEventBindings(actions, context._event);
  return renderActionTemplates(eventResolvedActions, context);
};
