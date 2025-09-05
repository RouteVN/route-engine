
/**
 * Creates a timer system wrapped around PixiJS ticker
 * @param {PIXI.Ticker} ticker - PixiJS ticker instance
 */
export const createTimer = (ticker) => {
  // Internal state
  const timers = new Map();
  const listeners = new Set();
  let nextId = 0;

  // Generate unique ID if not provided
  const generateId = () => `timer_${nextId++}`;

  // Emit event to all listeners
  const emit = (eventType, payload) => {
    const event = { eventType, payload, timestamp: performance.now() };
    listeners.forEach(listener => listener(event));
  };

  // Main update function added to PixiJS ticker
  const update = (time) => {
    const deltaMS = time.deltaMS;

    timers.forEach((timer, id) => {
      if (timer.paused) return;

      timer.elapsed += deltaMS;

      if (timer.elapsed >= timer.delay) {
        // Trigger the timer
        const eventPayload = {
          id,
          elapsed: timer.elapsed,
          delay: timer.delay,
          type: timer.type,
          triggerCount: timer.triggerCount + 1,
          overshoot: timer.elapsed - timer.delay,
          payload: timer.payload
        };

        emit(id, eventPayload);
        timer.triggerCount++;

        if (timer.type === 'timeout') {
          // Remove one-time timers
          timers.delete(id);
        } else if (timer.type === 'interval') {
          // Reset interval timers
          timer.elapsed = timer.elapsed - timer.delay;
        }
      }
    });
  };

  // Start the update loop
  ticker.add(update);

  // Public API
  return {
    /**
     * Set a one-time timer
     * @param {string} id - Timer ID
     * @param {*} payload - Payload to pass when timer triggers
     * @param {number} delay - Delay in milliseconds
     * @returns {string} Timer ID
     */
    setTimeout: (id, payload, delay) => {
      if (timers.has(id)) {
        console.warn(`Timer '${id}' already exists, replacing it`);
      }

      timers.set(id, {
        type: 'timeout',
        delay,
        payload,
        elapsed: 0,
        triggerCount: 0,
        paused: false
      });

      return id;
    },

    /**
     * Set a repeating timer
     * @param {string} id - Timer ID
     * @param {*} payload - Payload to pass when timer triggers
     * @param {number} interval - Interval in milliseconds
     * @returns {string} Timer ID
     */
    setInterval: (id, payload, interval) => {
      if (timers.has(id)) {
        console.warn(`Timer '${id}' already exists, replacing it`);
      }

      timers.set(id, {
        type: 'interval',
        delay: interval,
        payload,
        elapsed: 0,
        triggerCount: 0,
        paused: false
      });

      return id;
    },

    /**
     * Clear/remove a timer
     * @param {string} id - Timer ID
     */
    clear: (id) => {
      timers.delete(id);
    },

    /**
     * Pause a timer
     * @param {string} id - Timer ID
     */
    pause: (id) => {
      const timer = timers.get(id);
      if (timer) {
        timer.paused = true;
      }
    },

    /**
     * Resume a paused timer
     * @param {string} id - Timer ID
     */
    resume: (id) => {
      const timer = timers.get(id);
      if (timer && timer.paused) {
        timer.paused = false;
      }
    },

    /**
     * Pause all timers
     */
    pauseAll: () => {
      timers.forEach((timer, id) => {
        timer.paused = true;
      });
    },

    /**
     * Resume all timers
     */
    resumeAll: () => {
      timers.forEach((timer, id) => {
        timer.paused = false;
      });
    },

    /**
     * Clear all timers
     */
    clearAll: () => {
      timers.clear();
    },

    /**
     * Register an event listener
     * @param {Function} listener - Callback function
     * @returns {Function} Unsubscribe function
     */
    onEvent: (listener) => {
      listeners.add(listener);
      // Return unsubscribe function
      return () => listeners.delete(listener);
    },

    /**
     * Get timer info
     * @param {string} id - Timer ID
     * @returns {Object|null} Timer info or null if not found
     */
    getTimer: (id) => {
      const timer = timers.get(id);
      return timer ? { id, ...timer } : null;
    },

    /**
     * Get all active timer IDs
     * @returns {Array<string>} Array of timer IDs
     */
    getActiveTimers: () => {
      return Array.from(timers.keys());
    },

    /**
     * Destroy the timer system and clean up
     */
    destroy: () => {
      timers.clear();
      listeners.clear();
      ticker.remove(update);
    }
  };
};

// Usage Example:
/*
const timer = createTimer(app.ticker);

// Listen for events
const unsubscribe = timer.onEvent(({ eventType, payload }) => {
  if (eventType === 'timer') {
    console.log(`Timer ${payload.id} triggered after ${payload.elapsed}ms`);
    
    if (payload.id === 'spawn-enemy') {
      spawnEnemy();
    }
  }
});

// Set timers
timer.setTimeout('game-over', 5000);
timer.setInterval('spawn-enemy', 1000);

// Auto-generated IDs
const timerId = timer.setTimeout(3000); // Returns auto-generated ID

// Control timers
timer.pause('spawn-enemy');
timer.resume('spawn-enemy');
timer.clear('game-over');

// Cleanup
timer.destroy();
*/

export default createTimer;

