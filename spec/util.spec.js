import { describe, it, expect } from 'vitest';
import { createStore, createSequentialActionsExecutor, createSelectiveActionsExecutor } from '../src/util.js';

describe('createStore', () => {
  it('should create a store with selectors and actions', () => {
    const initialState = { count: 0, name: 'test' };
    const selectorsAndActions = {
      selectCount: (state) => state.count,
      selectName: (state) => state.name,
      increment: (state) => { state.count++; },
      setName: (state, newName) => { state.name = newName; }
    };

    const store = createStore(selectorsAndActions, initialState);

    expect(store.selectCount).toBeDefined();
    expect(store.selectName).toBeDefined();
    expect(store.increment).toBeDefined();
    expect(store.setName).toBeDefined();
  });

  it('should correctly execute selectors', () => {
    const initialState = { count: 5, items: ['a', 'b', 'c'] };
    const selectorsAndActions = {
      selectCount: (state) => state.count,
      selectItems: (state) => state.items,
      selectItemByIndex: (state, index) => state.items[index]
    };

    const store = createStore(selectorsAndActions, initialState);

    expect(store.selectCount()).toBe(5);
    expect(store.selectItems()).toEqual(['a', 'b', 'c']);
    expect(store.selectItemByIndex(1)).toBe('b');
  });

  it('should handle selectors with multiple arguments', () => {
    const initialState = { users: { 1: 'Alice', 2: 'Bob' } };
    const selectorsAndActions = {
      selectUser: (state, id) => state.users[id],
      selectUserWithDefault: (state, id, defaultValue) => state.users[id] || defaultValue
    };

    const store = createStore(selectorsAndActions, initialState);

    expect(store.selectUser(1)).toBe('Alice');
    expect(store.selectUserWithDefault(3, 'Unknown')).toBe('Unknown');
  });

  it('should execute actions and properly update state', () => {
    const initialState = { count: 0 };
    const selectorsAndActions = {
      selectCount: (state) => state.count,
      increment: (state) => { state.count++; },
      addValue: (state, value) => { state.count += value; }
    };

    const store = createStore(selectorsAndActions, initialState);

    // Actions should now properly update the state
    store.increment();
    expect(store.selectCount()).toBe(1); // State is updated

    store.addValue(5);
    expect(store.selectCount()).toBe(6); // State continues to update
  });

  it('should handle complex state mutations in actions properly', () => {
    const initialState = { 
      todos: [],
      counter: 0
    };
    const selectorsAndActions = {
      selectTodos: (state) => state.todos,
      selectCounter: (state) => state.counter,
      addTodo: (state, todo) => { 
        state.todos.push(todo);
        state.counter++;
      },
      removeTodo: (state, index) => {
        state.todos.splice(index, 1);
        state.counter--;
      }
    };

    const store = createStore(selectorsAndActions, initialState);

    store.addTodo({ id: 1, text: 'Test todo' });
    // Actions should now work properly
    expect(store.selectTodos()).toHaveLength(1);
    expect(store.selectCounter()).toBe(1);
    
    store.removeTodo(0);
    expect(store.selectTodos()).toHaveLength(0);
    expect(store.selectCounter()).toBe(0);
  });

  it('should preserve original state structure after cloning and update store state', () => {
    const initialState = { 
      nested: { value: 1 },
      array: [1, 2, 3]
    };
    const selectorsAndActions = {
      selectNested: (state) => state.nested,
      updateNested: (state, value) => { state.nested.value = value; }
    };

    const store = createStore(selectorsAndActions, initialState);
    
    // Verify initial state is preserved
    expect(initialState.nested.value).toBe(1);
    
    store.updateNested(5);
    // Store state should now update properly
    expect(store.selectNested().value).toBe(5);
    
    // Original remains unchanged (which is expected due to structuredClone)
    expect(initialState.nested.value).toBe(1);
  });

  it('should handle empty selectorsAndActions object', () => {
    const initialState = { value: 42 };
    const store = createStore({}, initialState);

    expect(Object.keys(store)).toHaveLength(0);
  });

  it('should distinguish between selectors and actions based on "select" prefix', () => {
    const initialState = { value: 0 };
    const selectorsAndActions = {
      selectValue: (state) => state.value,
      selectedItem: (state) => state.value * 2, // Should be treated as action, not selector
      setValue: (state, val) => { state.value = val; }
    };

    const store = createStore(selectorsAndActions, initialState);

    expect(typeof store.selectValue).toBe('function');
    expect(typeof store.selectedItem).toBe('function');
    expect(typeof store.setValue).toBe('function');
    
    // Verify selectValue works as selector
    expect(store.selectValue()).toBe(0);
  });

  it('should exclude createInitialState from the store', () => {
    const initialState = { count: 0, name: 'default' };
    const selectorsAndActions = {
      createInitialState: () => ({ count: 0, name: 'initial' }),
      selectCount: (state) => state.count,
      increment: (state) => { state.count++; },
      setName: (state, name) => { state.name = name; }
    };

    const store = createStore(selectorsAndActions, initialState);

    // createInitialState should not be included in the store
    expect(store.createInitialState).toBeUndefined();
    
    // Other functions should be present
    expect(store.selectCount).toBeDefined();
    expect(store.increment).toBeDefined();
    expect(store.setName).toBeDefined();
  });

  it('should work correctly with multiple special functions including createInitialState', () => {
    const initialState = { value: 10, items: [] };
    const selectorsAndActions = {
      createInitialState: () => ({ value: 0, items: [] }),
      selectValue: (state) => state.value,
      selectItems: (state) => state.items,
      createNewItem: () => ({ id: Date.now(), text: 'new' }), // Regular action
      addItem: (state, item) => { state.items.push(item); }
    };

    const store = createStore(selectorsAndActions, initialState);

    // createInitialState should be excluded
    expect(store.createInitialState).toBeUndefined();
    
    // All other functions should be included
    expect(store.selectValue).toBeDefined();
    expect(store.selectItems).toBeDefined();
    expect(store.createNewItem).toBeDefined();
    expect(store.addItem).toBeDefined();
    
    // Verify they work correctly
    expect(store.selectValue()).toBe(10);
    expect(store.selectItems()).toEqual([]);
  });
});

describe('createSequentialActionsExecutor', () => {
  it('should process single payload through all actions', () => {
    const createInitialState = () => ({ count: 0, items: [] });
    const actions = {
      addItem: (state, payload) => { state.items.push(payload); },
      incrementCount: (state) => { state.count++; }
    };

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    const result = pipeline('apple');

    expect(result).toEqual({ 
      count: 1, 
      items: ['apple'] 
    });
  });

  it('should process multiple payloads through all actions', () => {
    const createInitialState = () => ({ count: 0, items: [] });
    const actions = {
      addItem: (state, payload) => { state.items.push(payload); },
      incrementCount: (state) => { state.count++; }
    };

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    const result = pipeline(['apple', 'banana', 'orange']);

    expect(result).toEqual({ 
      count: 3, 
      items: ['apple', 'banana', 'orange'] 
    });
  });

  it('should return a function that accepts payload or payloads array', () => {
    const createInitialState = () => ({ value: 0 });
    const actions = {};

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    
    expect(typeof pipeline).toBe('function');
  });

  it('should handle single payload with multiple actions', () => {
    const createInitialState = () => ({ sum: 0, operations: [] });
    const actions = {
      addToSum: (state, payload) => { state.sum += payload; },
      logOperation: (state, payload) => { state.operations.push(`add ${payload}`); }
    };

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    const result = pipeline(5);

    expect(result.sum).toBe(5);
    expect(result.operations).toEqual(['add 5']);
  });

  it('should apply all actions for each payload in array', () => {
    const createInitialState = () => ({ sum: 0, operations: [] });
    const actions = {
      addToSum: (state, payload) => { state.sum += payload; },
      logOperation: (state, payload) => { state.operations.push(`add ${payload}`); }
    };

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    const result = pipeline([5, 3, 2]);

    expect(result.sum).toBe(10);
    expect(result.operations).toEqual(['add 5', 'add 3', 'add 2']);
  });

  it('should handle empty payloads array', () => {
    const createInitialState = () => ({ value: 42, name: 'initial' });
    const actions = {
      double: (state) => { state.value *= 2; }
    };

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    const result = pipeline([]);

    expect(result).toEqual({ value: 42, name: 'initial' });
  });

  it('should create fresh initial state for each pipeline execution', () => {
    const createInitialState = () => ({ count: 0 });
    const actions = {
      increment: (state) => { state.count++; }
    };

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    
    const result1 = pipeline([1, 2, 3]);
    const result2 = pipeline([1, 2]);
    const result3 = pipeline(1);

    expect(result1.count).toBe(3);
    expect(result2.count).toBe(2);
    expect(result3.count).toBe(1);
  });

  it('should maintain action order for each payload', () => {
    const createInitialState = () => ({ log: [] });
    const actions = {
      first: (state, payload) => { state.log.push(`first-${payload}`); },
      second: (state, payload) => { state.log.push(`second-${payload}`); },
      third: (state, payload) => { state.log.push(`third-${payload}`); }
    };

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    const result = pipeline(['A', 'B']);

    expect(result.log).toEqual([
      'first-A', 'second-A', 'third-A',
      'first-B', 'second-B', 'third-B'
    ]);
  });

  it('should handle single object payload vs array distinction', () => {
    const createInitialState = () => ({ orders: [], count: 0 });
    const actions = {
      addOrder: (state, order) => {
        state.orders.push(order);
        state.count++;
      }
    };

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    
    // Single object
    const singleResult = pipeline({ id: 1, product: 'Book' });
    expect(singleResult.orders).toEqual([{ id: 1, product: 'Book' }]);
    expect(singleResult.count).toBe(1);

    // Array of objects
    const multiResult = pipeline([
      { id: 1, product: 'Book' },
      { id: 2, product: 'Pen' }
    ]);
    expect(multiResult.orders).toEqual([
      { id: 1, product: 'Book' },
      { id: 2, product: 'Pen' }
    ]);
    expect(multiResult.count).toBe(2);
  });

  it('should handle complex batch processing', () => {
    const createInitialState = () => ({
      orders: [],
      totalRevenue: 0,
      processedCount: 0
    });
    
    const actions = {
      recordOrder: (state, order) => {
        state.orders.push({
          id: order.id,
          product: order.product,
          amount: order.amount
        });
      },
      updateRevenue: (state, order) => {
        state.totalRevenue += order.amount;
      },
      incrementProcessed: (state) => {
        state.processedCount++;
      }
    };

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    const result = pipeline([
      { id: 1, product: 'Book', amount: 20 },
      { id: 2, product: 'Pen', amount: 5 },
      { id: 3, product: 'Notebook', amount: 15 }
    ]);

    expect(result).toEqual({
      orders: [
        { id: 1, product: 'Book', amount: 20 },
        { id: 2, product: 'Pen', amount: 5 },
        { id: 3, product: 'Notebook', amount: 15 }
      ],
      totalRevenue: 40,
      processedCount: 3
    });
  });

  it('should handle errors in actions gracefully', () => {
    const createInitialState = () => ({ values: [], errors: [] });
    const actions = {
      process: (state, payload) => { 
        try {
          state.values.push(10 / payload);
        } catch (e) {
          state.errors.push(e.message);
        }
      }
    };

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    const result = pipeline([2, 0, 5]);
    
    expect(result.values).toEqual([5, Infinity, 2]);
    expect(result.errors).toHaveLength(0);
  });

  it('should accumulate state changes across payloads', () => {
    const createInitialState = () => ({ 
      items: [], 
      runningTotal: 0,
      history: []
    });
    const actions = {
      addItem: (state, item) => {
        state.items.push(item);
        state.runningTotal += item.value;
        state.history.push(`Added ${item.name} (total: ${state.runningTotal})`);
      }
    };

    const pipeline = createSequentialActionsExecutor(createInitialState, actions);
    const result = pipeline([
      { name: 'A', value: 10 },
      { name: 'B', value: 20 },
      { name: 'C', value: 30 }
    ]);

    expect(result.runningTotal).toBe(60);
    expect(result.history).toEqual([
      'Added A (total: 10)',
      'Added B (total: 30)',
      'Added C (total: 60)'
    ]);
  });
});

describe('createSelectiveActionsExecutor', () => {
  it('should create a batch mutator that applies multiple actions', () => {
    const createInitialState = () => ({ a: 0, b: 0, c: 0 });
    const deps = { multiplier: 2 };
    const actions = {
      incrementA: (state, deps, payload) => { state.a += payload.amount; },
      incrementB: (state, deps, payload) => { state.b += payload.amount * deps.multiplier; },
      setC: (state, deps, payload) => { state.c = payload.value; }
    };

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    const result = executor({
      incrementA: { amount: 5 },
      incrementB: { amount: 3 },
      setC: { value: 10 }
    });

    expect(result).toEqual({ a: 5, b: 6, c: 10 });
  });

  it('should return a function that accepts payloads', () => {
    const createInitialState = () => ({});
    const deps = {};
    const actions = {};

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    
    expect(typeof executor).toBe('function');
  });

  it('should only apply actions that have corresponding payloads', () => {
    const createInitialState = () => ({ a: 'initial', b: 'initial', c: 'initial' });
    const deps = {};
    const actions = {
      updateA: (state) => { state.a = 'updated'; },
      updateB: (state) => { state.b = 'updated'; },
      updateC: (state) => { state.c = 'updated'; }
    };

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    
    // Only provide payloads for updateA and updateC
    const result = executor({
      updateA: {},
      updateC: {}
    });

    expect(result).toEqual({ a: 'updated', b: 'initial', c: 'updated' });
  });

  it('should pass dependencies to all actions', () => {
    const createInitialState = () => ({ log: [] });
    const deps = { 
      config: { prefix: 'LOG:' },
      timestamp: 12345
    };
    const actions = {
      logAction1: (state, deps, payload) => {
        state.log.push(`${deps.config.prefix} Action1 at ${deps.timestamp}`);
      },
      logAction2: (state, deps, payload) => {
        state.log.push(`${deps.config.prefix} Action2 with ${payload.message}`);
      }
    };

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    const result = executor({
      logAction1: {},
      logAction2: { message: 'test' }
    });

    expect(result.log).toEqual([
      'LOG: Action1 at 12345',
      'LOG: Action2 with test'
    ]);
  });

  it('should handle empty payloads object', () => {
    const createInitialState = () => ({ value: 42, name: 'initial' });
    const deps = {};
    const actions = {
      reset: (state) => { state.value = 0; state.name = ''; }
    };

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    const result = executor({});

    // No actions should be applied
    expect(result).toEqual({ value: 42, name: 'initial' });
  });

  it('should create fresh initial state for each execution', () => {
    const createInitialState = () => ({ count: 0 });
    const deps = {};
    const actions = {
      increment: (state) => { state.count++; }
    };

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    
    const result1 = executor({ increment: {} });
    const result2 = executor({ increment: {} });

    // Both should be 1, proving fresh state each time
    expect(result1.count).toBe(1);
    expect(result2.count).toBe(1);
  });

  it('should handle complex nested state mutations', () => {
    const createInitialState = () => ({
      users: {},
      settings: { theme: 'light', notifications: true },
      metadata: { lastUpdate: null, version: 1 }
    });
    const deps = { currentTime: Date.now() };
    const actions = {
      addUser: (state, deps, payload) => {
        state.users[payload.id] = payload.user;
        state.metadata.lastUpdate = deps.currentTime;
      },
      updateSettings: (state, deps, payload) => {
        Object.assign(state.settings, payload.settings);
      },
      incrementVersion: (state) => {
        state.metadata.version++;
      }
    };

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    const result = executor({
      addUser: { id: '1', user: { name: 'Alice', age: 30 } },
      updateSettings: { settings: { theme: 'dark' } },
      incrementVersion: {}
    });

    expect(result).toEqual({
      users: { '1': { name: 'Alice', age: 30 } },
      settings: { theme: 'dark', notifications: true },
      metadata: { lastUpdate: deps.currentTime, version: 2 }
    });
  });

  it('should handle array mutations properly', () => {
    const createInitialState = () => ({ 
      items: [],
      total: 0
    });
    const deps = {};
    const actions = {
      addItem: (state, deps, payload) => {
        state.items.push(payload.item);
        state.total += payload.item.price;
      },
      removeItem: (state, deps, payload) => {
        const index = state.items.findIndex(item => item.id === payload.id);
        if (index !== -1) {
          state.total -= state.items[index].price;
          state.items.splice(index, 1);
        }
      },
      sortItems: (state) => {
        state.items.sort((a, b) => a.price - b.price);
      }
    };

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    const result = executor({
      addItem: { item: { id: 1, name: 'Item 1', price: 50 } },
      sortItems: {}
    });

    expect(result).toEqual({
      items: [{ id: 1, name: 'Item 1', price: 50 }],
      total: 50
    });
  });

  it('should handle actions that throw errors gracefully', () => {
    const createInitialState = () => ({ value: 10, error: null });
    const deps = {};
    const actions = {
      safeAction: (state) => { state.value = 20; },
      errorAction: (state, deps, payload) => {
        throw new Error('Action failed');
      }
    };

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    
    // The error should propagate
    expect(() => {
      executor({
        safeAction: {},
        errorAction: {}
      });
    }).toThrow('Action failed');
  });

  it('should maintain action execution order based on object entries', () => {
    const createInitialState = () => ({ log: [], value: 0 });
    const deps = {};
    const actions = {
      first: (state) => { 
        state.log.push(`first: value was ${state.value}`);
        state.value = 1;
      },
      second: (state) => { 
        state.log.push(`second: value was ${state.value}`);
        state.value = 2;
      },
      third: (state) => { 
        state.log.push(`third: value was ${state.value}`);
        state.value = 3;
      }
    };

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    const result = executor({
      first: {},
      second: {},
      third: {}
    });

    expect(result.log).toEqual([
      'first: value was 0',
      'second: value was 1',
      'third: value was 2'
    ]);
    expect(result.value).toBe(3);
  });

  it('should work with undefined payloads for actions that do not need them', () => {
    const createInitialState = () => ({ counter: 0, timestamp: null });
    const deps = { currentTime: 12345 };
    const actions = {
      increment: (state) => { state.counter++; },
      setTimestamp: (state, deps) => { state.timestamp = deps.currentTime; }
    };

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    const result = executor({
      increment: undefined,
      setTimestamp: undefined
    });

    expect(result).toEqual({ counter: 1, timestamp: 12345 });
  });

  it('should handle multiple batch operations on same state property', () => {
    const createInitialState = () => ({ value: 0, history: [] });
    const deps = {};
    const actions = {
      add5: (state) => { 
        state.value += 5;
        state.history.push('add5');
      },
      multiply2: (state) => { 
        state.value *= 2;
        state.history.push('multiply2');
      },
      subtract3: (state) => { 
        state.value -= 3;
        state.history.push('subtract3');
      }
    };

    const executor = createSelectiveActionsExecutor(deps, actions, createInitialState);
    const result = executor({
      add5: {},
      multiply2: {},
      subtract3: {}
    });

    // (0 + 5) * 2 - 3 = 7
    expect(result.value).toBe(7);
    expect(result.history).toEqual(['add5', 'multiply2', 'subtract3']);
  });
});