import { current, isDraft, produce } from "immer";
import { evaluateCondition, parseAndRender, parseConditionJson } from "jempl";

export const evaluateRouteCondition = (condition, context = {}) => {
  if (typeof condition === "string") {
    throw new Error(
      "String condition expressions are not supported; use semantic JSON conditions",
    );
  }

  return evaluateCondition(condition, context);
};

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

const setOwnDataProperty = (object, key, value) => {
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
};

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const cloneDataValue = (value) => {
  const source = isDraft(value) ? current(value) : value;
  return structuredClone(source);
};

const resolveCharacterNameVariable = ({
  characterId,
  resourceCharacter,
  variables = {},
} = {}) => {
  if (!hasOwn(resourceCharacter, "nameVariableId")) {
    return undefined;
  }

  const variableId = resourceCharacter.nameVariableId;
  const value = variables?.[variableId];

  if (typeof value !== "string") {
    throw new Error(
      `Character "${characterId}" nameVariableId "${variableId}" must resolve to a string variable`,
    );
  }

  return value;
};

export const resolveCharacterDisplayName = ({
  characterId,
  character,
  characterName,
  characters = {},
  variables = {},
} = {}) => {
  const resourceCharacter = characterId ? characters?.[characterId] : undefined;

  if (character?.name !== undefined) {
    return character.name;
  }

  if (characterName !== undefined) {
    return characterName;
  }

  const variableName = resolveCharacterNameVariable({
    characterId,
    resourceCharacter,
    variables,
  });

  if (variableName !== undefined) {
    return variableName;
  }

  return resourceCharacter?.name || "";
};

export const isComputedVariableConfig = (config) => hasOwn(config, "computed");

export const filterStoredVariables = (variables = {}, variableConfigs = {}) =>
  Object.fromEntries(
    Object.entries(variables ?? {}).filter(
      ([variableId]) => !isComputedVariableConfig(variableConfigs[variableId]),
    ),
  );

const createInvalidComputedReferencePathError = (path, pathLabel) =>
  new Error(`${pathLabel} has invalid path: ${JSON.stringify(path)}`);

const decodeQuotedPathPart = (rawValue, path, pathLabel) => {
  const quote = rawValue[0];

  if (quote === '"') {
    try {
      return JSON.parse(rawValue);
    } catch {
      throw createInvalidComputedReferencePathError(path, pathLabel);
    }
  }

  let value = "";

  for (let index = 1; index < rawValue.length - 1; index += 1) {
    const character = rawValue[index];
    if (character !== "\\") {
      if (character.charCodeAt(0) < 0x20) {
        throw createInvalidComputedReferencePathError(path, pathLabel);
      }
      value += character;
      continue;
    }

    index += 1;
    if (index >= rawValue.length - 1) {
      throw createInvalidComputedReferencePathError(path, pathLabel);
    }

    const escapedCharacter = rawValue[index];
    if (escapedCharacter === "u") {
      const hexValue = rawValue.slice(index + 1, index + 5);
      if (hexValue.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hexValue)) {
        throw createInvalidComputedReferencePathError(path, pathLabel);
      }
      value += String.fromCharCode(Number.parseInt(hexValue, 16));
      index += 4;
      continue;
    }

    const escapedValues = {
      "\\": "\\",
      '"': '"',
      "'": "'",
      "/": "/",
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
    };

    if (!hasOwn(escapedValues, escapedCharacter)) {
      throw createInvalidComputedReferencePathError(path, pathLabel);
    }
    value += escapedValues[escapedCharacter];
  }

  return value;
};

const parseVariablePath = (path, pathLabel = "Computed expression var") => {
  if (typeof path !== "string" || path.length === 0 || path.trim() !== path) {
    throw createInvalidComputedReferencePathError(path, pathLabel);
  }

  const pathParts = [];
  let index = 0;

  const readBarePart = () => {
    const startIndex = index;
    while (
      index < path.length &&
      path[index] !== "." &&
      path[index] !== "[" &&
      path[index] !== "]"
    ) {
      index += 1;
    }

    const part = path.slice(startIndex, index);
    if (part.length === 0 || part.trim() !== part || /\s/.test(part)) {
      throw createInvalidComputedReferencePathError(path, pathLabel);
    }
    pathParts.push(part);
  };

  const readBracketPart = () => {
    index += 1;
    while (index < path.length && /\s/.test(path[index])) {
      index += 1;
    }

    const firstCharacter = path[index];
    if (/\d/.test(firstCharacter ?? "")) {
      const startIndex = index;
      while (index < path.length && /\d/.test(path[index])) {
        index += 1;
      }
      const rawPart = path.slice(startIndex, index);
      while (index < path.length && /\s/.test(path[index])) {
        index += 1;
      }
      if (
        path[index] !== "]" ||
        (rawPart.length > 1 && rawPart.startsWith("0"))
      ) {
        throw createInvalidComputedReferencePathError(path, pathLabel);
      }
      index += 1;
      pathParts.push(rawPart);
      return;
    }

    if (firstCharacter !== '"' && firstCharacter !== "'") {
      throw createInvalidComputedReferencePathError(path, pathLabel);
    }

    const quote = firstCharacter;
    const startIndex = index;
    index += 1;
    let escaped = false;
    while (index < path.length) {
      const character = path[index];
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        const rawPart = path.slice(startIndex, index + 1);
        index += 1;
        while (index < path.length && /\s/.test(path[index])) {
          index += 1;
        }
        if (path[index] !== "]") {
          throw createInvalidComputedReferencePathError(path, pathLabel);
        }
        index += 1;
        pathParts.push(decodeQuotedPathPart(rawPart, path, pathLabel));
        return;
      }
      index += 1;
    }

    if (escaped || index >= path.length) {
      throw createInvalidComputedReferencePathError(path, pathLabel);
    }
  };

  readBarePart();
  while (index < path.length) {
    if (path[index] === ".") {
      index += 1;
      readBarePart();
      continue;
    }

    if (path[index] === "[") {
      readBracketPart();
      continue;
    }

    throw createInvalidComputedReferencePathError(path, pathLabel);
  }

  return pathParts;
};

const resolvePathFrom = (value, pathParts) => {
  let currentValue = value;

  for (const part of pathParts) {
    if (currentValue === undefined || currentValue === null) {
      return undefined;
    }
    if (!hasOwn(currentValue, part)) {
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

const materializeComputedConditionReferences = (condition, context) => {
  if (condition === null || typeof condition !== "object") {
    return condition;
  }

  if (hasOwn(condition, "literal")) {
    return condition;
  }
  if (hasOwn(condition, "var")) {
    return {
      literal: resolveComputedPath(condition.var, context),
    };
  }
  if (hasOwn(condition, "call")) {
    throw new Error(
      "Function calls are not supported in computed-variable conditions",
    );
  }

  return Object.fromEntries(
    Object.entries(condition).map(([operator, operands]) => [
      operator,
      Array.isArray(operands)
        ? operands.map((operand) =>
            materializeComputedConditionReferences(operand, context),
          )
        : materializeComputedConditionReferences(operands, context),
    ]),
  );
};

const evaluateComputedCondition = (condition, context = {}) => {
  if (typeof condition === "string") {
    throw new Error(
      "String condition expressions are not supported; use semantic JSON conditions",
    );
  }

  parseConditionJson(condition);
  return evaluateRouteCondition(
    materializeComputedConditionReferences(condition, context),
  );
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

const COMPUTED_EXPRESSION_FIXED_OPERAND_COUNTS = Object.freeze({
  add: 2,
  sub: 2,
  mul: 2,
  div: 2,
  mod: 2,
  neg: 1,
  round: 1,
  floor: 1,
  ceil: 1,
  min: 2,
  max: 2,
  clamp: 3,
  eq: 2,
  neq: 2,
  gt: 2,
  gte: 2,
  lt: 2,
  lte: 2,
  in: 2,
  not: 1,
  length: 1,
  includes: 2,
});

const COMPUTED_EXPRESSION_VARIADIC_OPERATORS = new Set([
  "and",
  "or",
  "all",
  "any",
]);

const COMPUTED_EXPRESSION_NUMERIC_RESULT_OPERATORS = new Set([
  "add",
  "sub",
  "mul",
  "div",
  "mod",
  "neg",
  "round",
  "floor",
  "ceil",
  "min",
  "max",
  "clamp",
  "length",
]);

const COMPUTED_EXPRESSION_NUMERIC_OPERAND_OPERATORS = new Set([
  "add",
  "sub",
  "mul",
  "div",
  "mod",
  "neg",
  "round",
  "floor",
  "ceil",
  "min",
  "max",
  "clamp",
]);

const COMPUTED_EXPRESSION_BOOLEAN_RESULT_OPERATORS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "and",
  "or",
  "all",
  "any",
  "not",
  "includes",
]);

const COMPUTED_CONDITION_RECURSIVE_OPERATORS = new Set([
  "all",
  "any",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "add",
  "sub",
]);

const computedVariableValidationCache = new WeakMap();

const getComputedStaticValueType = (value) => {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "object";
  }
  return typeof value;
};

const assertComputedConfigKeys = (value, allowedKeys, path) => {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${path} contains unsupported property "${key}"`);
    }
  }
};

const assertComputedStaticResultType = (
  variableId,
  expectedType,
  actualType,
  path,
) => {
  if (actualType !== undefined && actualType !== expectedType) {
    throw new Error(
      `Computed variable "${variableId}" ${path} expected type ${expectedType}, got ${actualType}`,
    );
  }
};

const validateComputedReference = (
  referencePath,
  { variableId, variableConfigs, dependencies, path },
) => {
  const pathLabel = `Computed variable "${variableId}" ${path} var`;
  const [root, referencedId, ...nestedPath] = parseVariablePath(
    referencePath,
    pathLabel,
  );

  if (root !== "variables" && root !== "runtime") {
    throw new Error(
      `${pathLabel} must reference variables.* or runtime.*, got ${JSON.stringify(referencePath)}`,
    );
  }

  if (!referencedId) {
    throw new Error(
      `${pathLabel} must reference a concrete ${root} member, got ${JSON.stringify(referencePath)}`,
    );
  }

  if (root === "runtime") {
    return undefined;
  }

  if (!hasOwn(variableConfigs, referencedId)) {
    throw new Error(
      `Computed variable "${variableId}" ${path} references unknown variable "${referencedId}"`,
    );
  }

  const referencedConfig = variableConfigs[referencedId];
  if (isComputedVariableConfig(referencedConfig)) {
    dependencies.add(referencedId);
  }

  return nestedPath.length === 0 ? referencedConfig?.type : undefined;
};

const validateComputedExpression = (
  expr,
  { variableId, variableConfigs, dependencies, path },
) => {
  if (expr === null || typeof expr !== "object") {
    if (typeof expr === "number" && !Number.isFinite(expr)) {
      throw new Error(
        `Computed variable "${variableId}" ${path} must use finite numeric literals`,
      );
    }
    return getComputedStaticValueType(expr);
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
  if (operator === "var") {
    if (typeof operands !== "string" || operands.trim() === "") {
      throw new Error(
        "Computed expression var requires a non-empty string path",
      );
    }
    return validateComputedReference(operands, {
      variableId,
      variableConfigs,
      dependencies,
      path,
    });
  }

  if (operator === "literal") {
    if (typeof operands === "number" && !Number.isFinite(operands)) {
      throw new Error(
        `Computed variable "${variableId}" ${path} must use finite numeric literals`,
      );
    }
    return getComputedStaticValueType(operands);
  }

  const fixedOperandCount = COMPUTED_EXPRESSION_FIXED_OPERAND_COUNTS[operator];
  if (
    fixedOperandCount === undefined &&
    !COMPUTED_EXPRESSION_VARIADIC_OPERATORS.has(operator)
  ) {
    throw new Error(`Unknown computed expression operator: ${operator}`);
  }

  if (fixedOperandCount === undefined) {
    assertAtLeastOneOperand(operator, operands);
  } else {
    assertOperandList(operator, operands, fixedOperandCount);
  }

  const operandTypes = operands.map((operand, index) =>
    validateComputedExpression(operand, {
      variableId,
      variableConfigs,
      dependencies,
      path: `${path}.${operator}[${index}]`,
    }),
  );

  if (COMPUTED_EXPRESSION_NUMERIC_OPERAND_OPERATORS.has(operator)) {
    operandTypes.forEach((operandType) => {
      if (operandType !== undefined && operandType !== "number") {
        throw new Error(
          `Computed expression operator "${operator}" requires numeric operands`,
        );
      }
    });
  }

  if (COMPUTED_EXPRESSION_NUMERIC_RESULT_OPERATORS.has(operator)) {
    return "number";
  }
  if (COMPUTED_EXPRESSION_BOOLEAN_RESULT_OPERATORS.has(operator)) {
    return "boolean";
  }

  return undefined;
};

const validateComputedCondition = (
  condition,
  { variableId, variableConfigs, dependencies, path },
) => {
  if (typeof condition === "string") {
    throw new Error(
      "String condition expressions are not supported; use semantic JSON conditions",
    );
  }

  try {
    parseConditionJson(condition);
  } catch (error) {
    throw new Error(
      `Computed variable "${variableId}" ${path} is invalid: ${error.message}`,
      { cause: error },
    );
  }

  const visit = (node, nodePath) => {
    if (node === null || typeof node !== "object") {
      return;
    }

    if (hasOwn(node, "literal")) {
      return;
    }

    if (hasOwn(node, "var")) {
      validateComputedReference(node.var, {
        variableId,
        variableConfigs,
        dependencies,
        path: nodePath,
      });
      return;
    }

    if (hasOwn(node, "call")) {
      throw new Error(
        `Computed variable "${variableId}" ${nodePath} function calls are not supported`,
      );
    }

    if (hasOwn(node, "not")) {
      visit(node.not, `${nodePath}.not`);
      return;
    }

    const operator = Object.keys(node).find((key) =>
      COMPUTED_CONDITION_RECURSIVE_OPERATORS.has(key),
    );
    node[operator].forEach((operand, index) => {
      visit(operand, `${nodePath}.${operator}[${index}]`);
    });
  };

  visit(condition, path);
};

const validateComputedResultConfig = (
  resultConfig,
  {
    variableId,
    variableConfig,
    variableConfigs,
    dependencies,
    path,
    allowedKeys = new Set(["expr", "value"]),
  },
) => {
  assertComputedResultConfig(
    resultConfig,
    `Computed variable "${variableId}" ${path}`,
  );
  assertComputedConfigKeys(resultConfig, allowedKeys, path);

  if (hasOwn(resultConfig, "value")) {
    assertComputedVariableValueType(
      variableId,
      variableConfig.type,
      resultConfig.value,
    );
    return;
  }

  const staticResultType = validateComputedExpression(resultConfig.expr, {
    variableId,
    variableConfigs,
    dependencies,
    path: `${path}.expr`,
  });
  assertComputedStaticResultType(
    variableId,
    variableConfig.type,
    staticResultType,
    `${path}.expr`,
  );
};

const collectComputedVariableDependencies = (
  variableId,
  variableConfig,
  variableConfigs,
) => {
  const computedConfig = variableConfig.computed;
  if (!isRecord(computedConfig)) {
    throw new Error(
      `Computed variable "${variableId}" computed must be an object`,
    );
  }

  const dependencies = new Set();
  const hasExpr = hasOwn(computedConfig, "expr");
  const hasValue = hasOwn(computedConfig, "value");
  const hasBranches = hasOwn(computedConfig, "branches");

  if (hasBranches) {
    assertComputedConfigKeys(
      computedConfig,
      new Set(["branches", "default"]),
      `Computed variable "${variableId}" computed`,
    );
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

    computedConfig.branches.forEach((branch, index) => {
      if (!isRecord(branch)) {
        throw new Error(
          `Computed variable "${variableId}" branch ${index} must be an object`,
        );
      }
      assertComputedConfigKeys(
        branch,
        new Set(["when", "expr", "value"]),
        `Computed variable "${variableId}" branch ${index}`,
      );
      if (!hasOwn(branch, "when")) {
        throw new Error(
          `Computed variable "${variableId}" branch ${index} requires when`,
        );
      }

      validateComputedCondition(branch.when, {
        variableId,
        variableConfigs,
        dependencies,
        path: `computed.branches[${index}].when`,
      });
      validateComputedResultConfig(branch, {
        variableId,
        variableConfig,
        variableConfigs,
        dependencies,
        path: `computed.branches[${index}]`,
        allowedKeys: new Set(["when", "expr", "value"]),
      });
    });

    validateComputedResultConfig(computedConfig.default, {
      variableId,
      variableConfig,
      variableConfigs,
      dependencies,
      path: "computed.default",
    });
    return dependencies;
  }

  assertComputedConfigKeys(
    computedConfig,
    new Set(["expr", "value"]),
    `Computed variable "${variableId}" computed`,
  );
  if (hasExpr === hasValue) {
    throw new Error(
      `Computed variable "${variableId}" must contain exactly one of expr, value, or branches`,
    );
  }

  validateComputedResultConfig(computedConfig, {
    variableId,
    variableConfig,
    variableConfigs,
    dependencies,
    path: "computed",
  });
  return dependencies;
};

export const validateComputedVariableConfigs = (variableConfigs = {}) => {
  if (!isRecord(variableConfigs)) {
    throw new Error("Variable configs must be an object");
  }

  if (hasOwn(variableConfigs, "__proto__")) {
    throw new Error('Variable id "__proto__" is reserved');
  }
  if (hasOwn(variableConfigs, "")) {
    throw new Error("Variable ids must not be empty");
  }

  const dependencyGraph = new Map();
  Object.entries(variableConfigs).forEach(([variableId, variableConfig]) => {
    if (!isComputedVariableConfig(variableConfig)) {
      return;
    }

    if (!isRecord(variableConfig)) {
      throw new Error(`Computed variable "${variableId}" must be an object`);
    }
    if (!hasOwn(variableConfig, "type")) {
      throw new Error(`Computed variable "${variableId}" requires type`);
    }
    if (!hasOwn(variableConfig, "scope")) {
      throw new Error(`Computed variable "${variableId}" requires scope`);
    }
    if (hasOwn(variableConfig, "default")) {
      throw new Error(
        `Computed variable "${variableId}" must not declare a top-level default`,
      );
    }

    validateVariableScope(variableConfig.scope, variableId);
    if (
      !["number", "boolean", "string", "object"].includes(variableConfig.type)
    ) {
      throw new Error(
        `Invalid variable type: ${variableConfig.type} for computed variable ${variableId}`,
      );
    }

    dependencyGraph.set(
      variableId,
      collectComputedVariableDependencies(
        variableId,
        variableConfig,
        variableConfigs,
      ),
    );
  });

  const visited = new Set();
  const evaluationOrder = [];
  dependencyGraph.forEach((_dependencies, startVariableId) => {
    if (visited.has(startVariableId)) {
      return;
    }

    const frames = [
      {
        variableId: startVariableId,
        dependencies: [...(dependencyGraph.get(startVariableId) ?? [])],
        nextDependencyIndex: 0,
      },
    ];
    const activeIndexes = new Map([[startVariableId, 0]]);

    while (frames.length > 0) {
      const frame = frames.at(-1);
      if (frame.nextDependencyIndex >= frame.dependencies.length) {
        frames.pop();
        activeIndexes.delete(frame.variableId);
        visited.add(frame.variableId);
        evaluationOrder.push(frame.variableId);
        continue;
      }

      const dependencyId = frame.dependencies[frame.nextDependencyIndex];
      frame.nextDependencyIndex += 1;
      if (visited.has(dependencyId)) {
        continue;
      }

      const cycleStartIndex = activeIndexes.get(dependencyId);
      if (cycleStartIndex !== undefined) {
        const cycle = [
          ...frames.slice(cycleStartIndex).map(({ variableId }) => variableId),
          dependencyId,
        ].join(" -> ");
        throw new Error(`Computed variable cycle detected: ${cycle}`);
      }

      activeIndexes.set(dependencyId, frames.length);
      frames.push({
        variableId: dependencyId,
        dependencies: [...(dependencyGraph.get(dependencyId) ?? [])],
        nextDependencyIndex: 0,
      });
    }
  });

  const validationResult = Object.freeze({
    evaluationOrder: Object.freeze(evaluationOrder),
  });
  computedVariableValidationCache.set(variableConfigs, validationResult);
  return validationResult;
};

export const selectVariablesWithComputedValues = ({
  variables = {},
  runtime = {},
  variableConfigs = {},
  eager = true,
} = {}) => {
  const { evaluationOrder } =
    computedVariableValidationCache.get(variableConfigs) ??
    validateComputedVariableConfigs(variableConfigs);
  const storedVariables = filterStoredVariables(variables, variableConfigs);
  const computedVariableIds = Object.entries(variableConfigs)
    .filter(([, config]) => isComputedVariableConfig(config))
    .map(([variableId]) => variableId);
  const resolvedComputedVariables = Object.create(null);
  const resolvingVariableIds = [];
  const evaluationOrderIndexes = new Map(
    evaluationOrder.map((variableId, index) => [variableId, index]),
  );
  let topologicallyResolvedThrough = -1;
  let isResolvingTopologically = false;

  const evaluateVariable = (variableId) => {
    if (hasOwn(resolvedComputedVariables, variableId)) {
      return resolvedComputedVariables[variableId];
    }

    const variableConfig = variableConfigs[variableId];
    if (!isComputedVariableConfig(variableConfig)) {
      return hasOwn(storedVariables, variableId)
        ? storedVariables[variableId]
        : undefined;
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
      setOwnDataProperty(resolvedComputedVariables, variableId, value);
      return value;
    } finally {
      resolvingVariableIds.pop();
    }
  };

  const resolveVariable = (variableId) => {
    if (hasOwn(resolvedComputedVariables, variableId)) {
      return resolvedComputedVariables[variableId];
    }

    const variableConfig = variableConfigs[variableId];
    if (!isComputedVariableConfig(variableConfig)) {
      return hasOwn(storedVariables, variableId)
        ? storedVariables[variableId]
        : undefined;
    }

    const targetIndex = evaluationOrderIndexes.get(variableId);
    if (
      eager &&
      !isResolvingTopologically &&
      targetIndex !== undefined &&
      targetIndex > topologicallyResolvedThrough
    ) {
      isResolvingTopologically = true;
      try {
        for (
          let index = topologicallyResolvedThrough + 1;
          index <= targetIndex;
          index += 1
        ) {
          evaluateVariable(evaluationOrder[index]);
          topologicallyResolvedThrough = index;
        }
      } finally {
        isResolvingTopologically = false;
      }
      return resolvedComputedVariables[variableId];
    }

    return evaluateVariable(variableId);
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
  const resolvedVariableConfigs =
    variableConfigs ?? projectData?.resources?.variables ?? {};
  validateComputedVariableConfigs(resolvedVariableConfigs);

  return selectVariablesWithComputedValues({
    variables,
    runtime,
    variableConfigs: resolvedVariableConfigs,
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
        setOwnDataProperty(contextVariableDefaultValues, variableId, value);
      } else {
        // device and account scopes both go to globalVariablesDefaultValues
        setOwnDataProperty(globalVariablesDefaultValues, variableId, value);
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

const DEFAULT_DIVIDE_ROUND_TO = 2;
const MAX_DIVIDE_ROUND_TO = 12;

const resolveDivideRoundTo = (roundTo = DEFAULT_DIVIDE_ROUND_TO) => {
  if (
    !Number.isInteger(roundTo) ||
    roundTo < 0 ||
    roundTo > MAX_DIVIDE_ROUND_TO
  ) {
    throw new Error(
      `Operation "divide" requires roundTo to be an integer between 0 and ${MAX_DIVIDE_ROUND_TO}.`,
    );
  }

  return roundTo;
};

const roundToDecimalPlaces = (value, decimalPlaces) => {
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

export const validateVariableOperationValue = (
  type,
  op,
  value,
  variableId,
  options = {},
) => {
  if (type !== "number") {
    return;
  }

  if (op === "set" && !isFiniteNumber(value)) {
    throw new Error(
      `Operation "set" requires value to be a number for variable "${variableId}".`,
    );
  }

  if (op === "multiply" && !isFiniteNumber(value)) {
    throw new Error(
      `Operation "multiply" requires value to be a number for variable "${variableId}".`,
    );
  }

  if (op === "divide" && !isFiniteNumber(value)) {
    throw new Error(
      `Operation "divide" requires value to be a number for variable "${variableId}".`,
    );
  }

  if (op === "divide") {
    if (value === 0) {
      throw new Error(
        `Operation "divide" requires value to be a non-zero number for variable "${variableId}".`,
      );
    }

    resolveDivideRoundTo(options.roundTo);
  }
};

/**
 * Applies a variable operation to calculate the new value
 * Pure function - returns new value without side effects
 *
 * @param {*} currentValue - Current value of the variable
 * @param {string} op - Operation to apply (set, increment, decrement, multiply, divide, toggle)
 * @param {*} value - Value parameter for the operation (optional for increment/decrement/toggle)
 * @param {Object} options - Operation options
 * @param {number} [options.roundTo=2] - Decimal places for divide results
 * @returns {*} New value after applying the operation
 * @throws {Error} If operation is unknown
 *
 * @example
 * applyVariableOperation(5, 'increment') // 6
 * applyVariableOperation(10, 'increment', 5) // 15
 * applyVariableOperation(true, 'toggle') // false
 * applyVariableOperation(3, 'multiply', 4) // 12
 */
export const applyVariableOperation = (
  currentValue,
  op,
  value,
  options = {},
) => {
  const resolveNumberOperand = (operand, fallback, label) => {
    const resolvedValue = operand ?? fallback;
    if (!isFiniteNumber(resolvedValue)) {
      throw new Error(`Operation "${op}" requires ${label} to be a number.`);
    }

    return resolvedValue;
  };

  const resolveDivisor = (operand) => {
    const divisor = resolveNumberOperand(operand, undefined, "value");
    if (divisor === 0) {
      throw new Error(
        `Operation "${op}" requires value to be a non-zero number.`,
      );
    }

    return divisor;
  };

  switch (op) {
    case "set":
      return value;
    case "multiply":
      return (
        resolveNumberOperand(currentValue, 1, "current value") *
        resolveNumberOperand(value, undefined, "value")
      );
    case "divide":
      return roundToDecimalPlaces(
        resolveNumberOperand(currentValue, 0, "current value") /
          resolveDivisor(value),
        resolveDivideRoundTo(options.roundTo),
      );
    case "increment":
      return (
        resolveNumberOperand(currentValue, 0, "current value") +
        resolveNumberOperand(value, 1, "value")
      );
    case "decrement":
      return (
        resolveNumberOperand(currentValue, 0, "current value") -
        resolveNumberOperand(value, 1, "value")
      );
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
 * - MMM: Abbreviated English month name (Jan-Dec)
 * - YYYY: Full year (2026)
 * - YY: Short year (26)
 * - HH: Hours (00-23)
 * - mm: Minutes (00-59)
 * - ss: Seconds (00-59)
 *
 * @example
 * const timestamp = new Date(2026, 0, 7, 19, 56, 40).getTime();
 * formatDate(timestamp) // "07/01/2026 - 19:56"
 * formatDate(timestamp, "DD MMM YYYY") // "07 Jan 2026"
 * formatDate(timestamp, "MM/DD/YY HH:mm:ss") // "01/07/26 19:56:40"
 */
export const formatDate = (timestamp, format = "DD/MM/YYYY - HH:mm") => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, "0");
  const year = String(date.getFullYear());
  const tokenValues = {
    DD: pad(date.getDate()),
    MM: pad(date.getMonth() + 1),
    MMM: MONTH_ABBREVIATIONS[date.getMonth()],
    YYYY: year,
    YY: year.slice(-2),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };

  return format.replace(
    /YYYY|MMM|YY|MM|DD|HH|mm|ss/g,
    (token) => tokenValues[token],
  );
};

/**
 * Compares two dialogue states, flagging changes only for dialogue UI updates.
 * Ignores content, speaker metadata, and speaker sprite changes to reduce
 * editor preview noise.
 * @param {Object} prevDialogue - Previous dialogue state
 * @param {Object} currDialogue - Current dialogue state
 * @returns {Object|null} Change object or null if no significant change
 */
const diffDialogue = (prevDialogue, currDialogue) => {
  const toDialogueUiState = (dialogue) => dialogue?.ui;

  const prevUi = toDialogueUiState(prevDialogue);
  const currUi = toDialogueUiState(currDialogue);

  if (JSON.stringify(prevUi) === JSON.stringify(currUi)) {
    return null;
  }

  if (prevUi && !currUi) {
    return { changeType: "delete", data: prevDialogue };
  }

  if (currUi && !prevUi) {
    return { changeType: "add", data: currDialogue };
  }

  if (currUi && prevUi) {
    return { changeType: "update", data: currDialogue };
  }

  return null;
};

/**
 * Returns whether a dialogue character sprite has enough data to render.
 * @param {Object} sprite - Dialogue character sprite state
 * @returns {boolean} Whether the sprite can be rendered
 */
export const hasRenderableDialogueCharacterSprite = (sprite) =>
  !!sprite?.transformId &&
  Array.isArray(sprite.items) &&
  sprite.items.length > 0;

/**
 * Compares the speaker sprites attached to two dialogue states.
 * @param {Object} prevDialogue - Previous dialogue state
 * @param {Object} currDialogue - Current dialogue state
 * @returns {Object|null} Change object or null if the sprite did not change
 */
const diffDialogueSprite = (prevDialogue, currDialogue) => {
  const previousSprite = prevDialogue?.character?.sprite;
  const currentSprite = currDialogue?.character?.sprite;
  const prevSprite = hasRenderableDialogueCharacterSprite(previousSprite)
    ? previousSprite
    : undefined;
  const currSprite = hasRenderableDialogueCharacterSprite(currentSprite)
    ? currentSprite
    : undefined;

  if (JSON.stringify(prevSprite) === JSON.stringify(currSprite)) {
    return null;
  }

  if (prevSprite && !currSprite) {
    return { changeType: "delete", data: prevSprite };
  }

  if (currSprite && !prevSprite) {
    return { changeType: "add", data: currSprite };
  }

  if (currSprite && prevSprite) {
    return { changeType: "update", data: currSprite };
  }

  return null;
};

const toBackgroundResourceChangeData = (background) => {
  if (background?.resourceId === undefined) {
    return undefined;
  }

  const data = {
    resourceId: background.resourceId,
  };

  if (background.transformId !== undefined) {
    data.transformId = background.transformId;
  }

  for (const field of [
    "x",
    "y",
    "anchorX",
    "anchorY",
    "scaleX",
    "scaleY",
    "rotation",
    "originX",
    "originY",
  ]) {
    if (background[field] !== undefined) {
      data[field] = background[field];
    }
  }

  for (const field of ["animationName", "animationSpeed", "loop"]) {
    if (background[field] !== undefined) {
      data[field] = background[field];
    }
  }

  return data;
};

const toBackgroundColorChangeData = (background) => {
  if (background?.colorId === undefined) {
    return undefined;
  }

  return {
    colorId: background.colorId,
  };
};

const diffChangeData = (prevData, currData) => {
  if (currData && !prevData) {
    return { changeType: "add", data: currData };
  }

  if (prevData && !currData) {
    return { changeType: "delete", data: prevData };
  }

  if (
    prevData &&
    currData &&
    JSON.stringify(prevData) !== JSON.stringify(currData)
  ) {
    return { changeType: "update", data: currData };
  }

  return null;
};

const diffBackground = (prevBackground, currBackground) => {
  const changes = {};
  const resourceChange = diffChangeData(
    toBackgroundResourceChangeData(prevBackground),
    toBackgroundResourceChangeData(currBackground),
  );
  const colorChange = diffChangeData(
    toBackgroundColorChangeData(prevBackground),
    toBackgroundColorChangeData(currBackground),
  );

  if (resourceChange) {
    changes.resource = resourceChange;
  }

  if (colorChange) {
    changes.color = colorChange;
  }

  return Object.keys(changes).length > 0 ? changes : null;
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

  const backgroundChange = diffBackground(prev.background, curr.background);
  if (backgroundChange) {
    changes.background = backgroundChange;
  }

  diffObject("screen");
  diffObject("bgm");
  diffObject("voice");

  // Special handling for dialogue
  const dialogueChange = diffDialogue(prev.dialogue, curr.dialogue);
  if (dialogueChange) {
    changes.dialogue = dialogueChange;
  }

  const dialogueSpriteChange = diffDialogueSprite(prev.dialogue, curr.dialogue);
  if (dialogueSpriteChange) {
    changes.dialogueSprite = dialogueSpriteChange;
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

    if (
      !normalizedState.background.resourceId &&
      !normalizedState.background.colorId
    ) {
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
  stripAnimationsFromObject("screen");

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
