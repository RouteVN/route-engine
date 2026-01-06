import { produce } from "immer";

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
        const newState = produce(state, (draft) =>
          func(transformActionFirstArgument(draft), ...args),
        );
        state = newState;
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
 *       volume: { type: 'number', scope: 'global-device', default: 50 }
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
      const value = getVariableDefaultValue(config, variableId);

      if (config.scope === "context") {
        contextVariableDefaultValues[variableId] = value;
      } else {
        // global-device and global-account scopes both go to globalVariablesDefaultValues
        globalVariablesDefaultValues[variableId] = value;
      }
    },
  );

  return { contextVariableDefaultValues, globalVariablesDefaultValues };
};

/**
 * Recursively converts text element content to strings (required by PixiJS)
 * Mutates the element in place
 *
 * @param {Object} element - Element to process
 *
 * @example
 * const element = { type: 'text', content: 123 };
 * stringifyTextContent(element);
 * // element.content is now "123"
 */
export const stringifyTextContent = (element) => {
  if (element.type === "text" && element.content != null) {
    element.content = String(element.content);
  }

  if (element.children && Array.isArray(element.children)) {
    element.children.forEach(stringifyTextContent);
  }
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
 * validateVariableScope('runtime', 'score') // No error
 * validateVariableScope('invalid', 'score') // Throws Error
 * validateVariableScope(undefined, 'score') // Throws Error
 */
export const validateVariableScope = (scope, variableId) => {
  const VALID_SCOPES = ["context", "global-device", "global-account"];

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
 * @param {string} targetScope - Scope to filter by (context, global-device, or global-account)
 * @returns {Object} New object containing only variables matching the target scope
 *
 * @example
 * const vars = { score: 100, volume: 80, achievement: true };
 * const configs = {
 *   score: { scope: 'context' },
 *   volume: { scope: 'global-device' },
 *   achievement: { scope: 'global-account' }
 * };
 * filterVariablesByScope(vars, configs, 'global-device') // { volume: 80 }
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
