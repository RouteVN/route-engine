
I have 3 ways to write a read only object with selectors.

## Use standard class

```js
class CounterStore {
  _state = initialState;

  constructor(initialState = {}) {
    this._state = initialState;
  }

  selectIsEven = () => {
    return this._state.value % 2 === 0;
  }
}

// usage
const counterStore = new CounterStore({ value: 0 });
conterStore.isEven();
```


## Use a function

```js
const counterStore = (initialState = {}) => {
  return {
    selectIsEven: () => {
      return initialState.value % 2 === 0;
    }
  }
}

// usage
const counterStore = counterStore();
counterStore.isEven();
```

## Use function 2

```js
const createState = () => {
  return {
    value: 0
  }
}

const isEven = (state) => {
  return state.value % 2 === 0;
}

// usage
const state = createState();
counterStore.isEven(state);
```
