const UINT32_CARDINALITY = 0x1_0000_0000;
const UINT53_CARDINALITY = 0x20_0000_0000_0000;
const MIN_WEIGHT_SHARE = 1 / UINT53_CARDINALITY;
const MAX_REJECTION_ATTEMPTS = 128;
const MAX_WEIGHTED_OUTCOMES = 1000;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const assertAllowedKeys = (value, allowedKeys, path) => {
  const unexpectedKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unexpectedKey !== undefined) {
    throw new Error(`${path}.${unexpectedKey} is not supported`);
  }
};

const assertRecord = (value, path) => {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
};

const assertSafeInteger = (value, path, { min, max } = {}) => {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${path} must be a safe integer`);
  }
  if (min !== undefined && value < min) {
    throw new Error(`${path} must be at least ${min}`);
  }
  if (max !== undefined && value > max) {
    throw new Error(`${path} must be at most ${max}`);
  }
  return value;
};

const assertFiniteNumber = (value, path, { min, max } = {}) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  if (min !== undefined && value < min) {
    throw new Error(`${path} must be at least ${min}`);
  }
  if (max !== undefined && value > max) {
    throw new Error(`${path} must be at most ${max}`);
  }
  return value;
};

const cloneAndFreeze = (value) => {
  const clone = structuredClone(value);
  const freeze = (item) => {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(clone);
};

const createDefaultRandomSource = () => ({
  nextUint32() {
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Math.floor(Math.random() * UINT32_CARDINALITY);
  },
});

export const normalizeRandomSource = (randomSource) => {
  const source = randomSource ?? createDefaultRandomSource();
  if (!isRecord(source) || typeof source.nextUint32 !== "function") {
    throw new TypeError("randomSource must provide nextUint32()");
  }

  return {
    nextUint32() {
      const value = source.nextUint32();
      if (
        !Number.isInteger(value) ||
        value < 0 ||
        value >= UINT32_CARDINALITY
      ) {
        throw new Error(
          "randomSource.nextUint32() must return an integer from 0 through 4294967295",
        );
      }
      return value;
    },
  };
};

const sampleUint32Range = (randomSource, cardinality) => {
  const limit = UINT32_CARDINALITY - (UINT32_CARDINALITY % cardinality);
  for (let attempt = 0; attempt < MAX_REJECTION_ATTEMPTS; attempt += 1) {
    const value = randomSource.nextUint32();
    if (value < limit) {
      return value % cardinality;
    }
  }
  throw new Error(
    `random source exhausted after ${MAX_REJECTION_ATTEMPTS} rejected samples`,
  );
};

const sampleUnit53 = (randomSource) => {
  const high = randomSource.nextUint32() >>> 5;
  const low = randomSource.nextUint32() >>> 6;
  return (high * 0x4_000_000 + low) / UINT53_CARDINALITY;
};

const validateIntegerDistribution = (distribution, path) => {
  assertAllowedKeys(distribution, new Set(["type", "min", "max"]), path);
  if (!Object.prototype.hasOwnProperty.call(distribution, "min")) {
    throw new Error(`${path}.min is required`);
  }
  if (!Object.prototype.hasOwnProperty.call(distribution, "max")) {
    throw new Error(`${path}.max is required`);
  }
  const min = assertSafeInteger(distribution.min, `${path}.min`);
  const max = assertSafeInteger(distribution.max, `${path}.max`);
  const cardinality = max - min + 1;
  if (
    !Number.isSafeInteger(cardinality) ||
    cardinality < 1 ||
    cardinality > UINT32_CARDINALITY
  ) {
    throw new Error(
      "random integer range must contain from 1 through 4294967296 values",
    );
  }
  return { min, cardinality };
};

const sampleInteger = (
  distribution,
  randomSource,
  path = "random.distribution",
) => {
  const { min, cardinality } = validateIntegerDistribution(distribution, path);
  return cloneAndFreeze({
    type: "integer",
    value:
      cardinality === 1
        ? min
        : min + sampleUint32Range(randomSource, cardinality),
  });
};

// Validates the weights of a weighted distribution's entries and returns them
// rescaled by the largest weight.
const validateWeightedEntries = (entries, path, allowedKeys, validateEntry) => {
  if (
    !Array.isArray(entries) ||
    entries.length < 1 ||
    entries.length > MAX_WEIGHTED_OUTCOMES
  ) {
    throw new Error(`${path} must contain from 1 through 1000 items`);
  }

  const weights = entries.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    assertRecord(entry, entryPath);
    assertAllowedKeys(entry, allowedKeys, entryPath);
    if (!Object.prototype.hasOwnProperty.call(entry, "weight")) {
      throw new Error(`${entryPath}.weight is required`);
    }
    validateEntry(entry, entryPath);
    return assertFiniteNumber(entry.weight, `${entryPath}.weight`, {
      min: 0,
    });
  });
  const maxWeight = Math.max(...weights);
  if (maxWeight <= 0) {
    throw new Error("random weighted total weight must be positive");
  }
  const scaledWeights = weights.map((weight) => weight / maxWeight);
  const totalWeight = scaledWeights.reduce(
    (total, weight) => total + weight,
    0,
  );
  scaledWeights.forEach((weight, index) => {
    if (
      weights[index] > 0 &&
      (weight === 0 || weight / totalWeight <= MIN_WEIGHT_SHARE)
    ) {
      throw new Error(
        `${path}[${index}].weight is below the supported probability resolution`,
      );
    }
  });
  return { scaledWeights, totalWeight };
};

const sampleWeightedIndex = ({ scaledWeights, totalWeight }, randomSource) => {
  const target = sampleUnit53(randomSource) * totalWeight;
  let cumulativeWeight = 0;
  let outcomeIndex = scaledWeights.findLastIndex((weight) => weight > 0);
  for (let index = 0; index < scaledWeights.length; index += 1) {
    cumulativeWeight += scaledWeights[index];
    if (target < cumulativeWeight) {
      outcomeIndex = index;
      break;
    }
  }
  return cloneAndFreeze({ type: "weighted", outcomeIndex });
};

const sampleWeighted = (distribution, randomSource) => {
  assertAllowedKeys(
    distribution,
    new Set(["type", "outcomes"]),
    "random.distribution",
  );
  const weights = validateWeightedEntries(
    distribution.outcomes,
    "random.distribution.outcomes",
    new Set(["weight", "actions"]),
    (outcome, path) => {
      assertRecord(outcome.actions, `${path}.actions`);
    },
  );
  return sampleWeightedIndex(weights, randomSource);
};

const VARIABLE_DISTRIBUTION_PATH = "updateVariable random distribution";

// A weighted value is stored in a variable as it is, so it is one of the
// scalar variable types.
const isRandomVariableValue = (value) =>
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));

const validateWeightedValues = (distribution) => {
  assertAllowedKeys(
    distribution,
    new Set(["type", "values"]),
    VARIABLE_DISTRIBUTION_PATH,
  );
  return validateWeightedEntries(
    distribution.values,
    `${VARIABLE_DISTRIBUTION_PATH}.values`,
    new Set(["weight", "value"]),
    (entry, path) => {
      if (!isRandomVariableValue(entry.value)) {
        throw new Error(
          `${path}.value must be a string, a finite number or a boolean`,
        );
      }
    },
  );
};

const VARIABLE_DISTRIBUTION_TYPE_ERROR =
  'updateVariable random distribution.type must be "integer" or "weighted"';

// Checks the distribution of an updateVariable random operation without
// drawing from the random source.
export const validateVariableRandomDistribution = (distribution) => {
  assertRecord(distribution, VARIABLE_DISTRIBUTION_PATH);
  if (distribution.type === "integer") {
    validateIntegerDistribution(distribution, VARIABLE_DISTRIBUTION_PATH);
  } else if (distribution.type === "weighted") {
    validateWeightedValues(distribution);
  } else {
    throw new Error(VARIABLE_DISTRIBUTION_TYPE_ERROR);
  }
};

// Draws the result of an updateVariable random operation: the integer itself,
// or the index of the selected weighted value.
export const sampleVariableRandomDistribution = (
  distribution,
  { randomSource },
) => {
  assertRecord(distribution, VARIABLE_DISTRIBUTION_PATH);
  if (distribution.type === "integer") {
    return sampleInteger(
      distribution,
      randomSource,
      VARIABLE_DISTRIBUTION_PATH,
    );
  }
  if (distribution.type === "weighted") {
    return sampleWeightedIndex(
      validateWeightedValues(distribution),
      randomSource,
    );
  }
  throw new Error(VARIABLE_DISTRIBUTION_TYPE_ERROR);
};

export const sampleRandomDistribution = (distribution, { randomSource }) => {
  assertRecord(distribution, "random.distribution");
  const samplers = {
    integer: sampleInteger,
    weighted: sampleWeighted,
  };
  const sampler = samplers[distribution.type];
  if (!sampler) {
    throw new Error('random.distribution.type must be "integer" or "weighted"');
  }
  return sampler(distribution, randomSource);
};

export const validateRandomResult = (result, expectedType) => {
  assertRecord(result, "random result");
  if (result.type !== expectedType) {
    throw new Error("random result type does not match its recorded type");
  }
  if (expectedType === "integer") {
    assertAllowedKeys(result, new Set(["type", "value"]), "random result");
    assertSafeInteger(result.value, "random result.value");
  } else if (expectedType === "weighted") {
    assertAllowedKeys(
      result,
      new Set(["type", "outcomeIndex"]),
      "random result",
    );
    assertSafeInteger(result.outcomeIndex, "random result.outcomeIndex", {
      min: 0,
      max: MAX_WEIGHTED_OUTCOMES - 1,
    });
  } else {
    throw new Error(`unsupported recorded random result type: ${expectedType}`);
  }
  return cloneAndFreeze(result);
};
