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
export const createStore = (selectorsAndActions, initialState) => {
  const state = structuredClone(initialState);
  const selectors = {};
  const actions = {};

  for (const [name, func] of Object.entries(selectorsAndActions)) {
    if (name === "createInitialState") {
      // Skip createInitialState - it's a special function
      continue;
    } else if (name.startsWith("select")) {
      selectors[name] = (...args) => func(state, ...args);
    } else {
      actions[name] = (...args) => {
        const newState = produce(state, (draft) => func(draft, ...args));
        Object.assign(state, newState);
        return newState;
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
export const createSequentialActionsExecutor = (createInitialState, actions) => {
  return (payloadOrPayloads) => {
    const initialState = createInitialState();
    const payloads = Array.isArray(payloadOrPayloads) 
      ? payloadOrPayloads 
      : [payloadOrPayloads];
    
    return produce(initialState, (draft) => {
      payloads.forEach((payload) => {
        Object.values(actions).forEach((action) => {
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
export const createSelectiveActionsExecutor = (deps, actions, createInitialState) => {
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

