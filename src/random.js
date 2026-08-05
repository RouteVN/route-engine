const UINT32_CARDINALITY = 0x1_0000_0000;
const UINT53_CARDINALITY = 0x20_0000_0000_0000;
const MIN_WEIGHT_SHARE = 1 / UINT53_CARDINALITY;
const MAX_REJECTION_ATTEMPTS = 128;
const MAX_DICE_COUNT = 100;
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

const sampleDice = (distribution, randomSource) => {
  assertAllowedKeys(
    distribution,
    new Set(["type", "count", "sides", "modifier", "keep"]),
    "random.distribution",
  );
  const count = assertSafeInteger(
    distribution.count ?? 1,
    "random.distribution.count",
    { min: 1, max: MAX_DICE_COUNT },
  );
  if (!Object.prototype.hasOwnProperty.call(distribution, "sides")) {
    throw new Error("random.distribution.sides is required");
  }
  const sides = assertSafeInteger(
    distribution.sides,
    "random.distribution.sides",
    { min: 2, max: UINT32_CARDINALITY },
  );
  const modifier = assertSafeInteger(
    distribution.modifier ?? 0,
    "random.distribution.modifier",
  );

  let keepCount = count;
  let keepType;
  if (distribution.keep !== undefined) {
    assertRecord(distribution.keep, "random.distribution.keep");
    assertAllowedKeys(
      distribution.keep,
      new Set(["type", "count"]),
      "random.distribution.keep",
    );
    keepType = distribution.keep.type;
    if (keepType !== "highest" && keepType !== "lowest") {
      throw new Error(
        'random.distribution.keep.type must be "highest" or "lowest"',
      );
    }
    if (!Object.prototype.hasOwnProperty.call(distribution.keep, "count")) {
      throw new Error("random.distribution.keep.count is required");
    }
    keepCount = assertSafeInteger(
      distribution.keep.count,
      "random.distribution.keep.count",
      { min: 1, max: count },
    );
  }

  const minTotal = keepCount + modifier;
  const maxTotal = keepCount * sides + modifier;
  if (!Number.isSafeInteger(minTotal) || !Number.isSafeInteger(maxTotal)) {
    throw new Error("random dice result range must contain only safe integers");
  }

  const rolls = Array.from(
    { length: count },
    () => sampleUint32Range(randomSource, sides) + 1,
  );
  const selectedIndexes = new Set(
    rolls
      .map((value, index) => ({ value, index }))
      .sort((left, right) => {
        const comparison = left.value - right.value;
        return (
          (keepType === "highest" ? -comparison : comparison) ||
          left.index - right.index
        );
      })
      .slice(0, keepCount)
      .map(({ index }) => index),
  );
  const keptRolls = rolls.filter((_, index) => selectedIndexes.has(index));
  const discardedRolls = rolls.filter(
    (_, index) => !selectedIndexes.has(index),
  );

  return cloneAndFreeze({
    type: "dice",
    value: keptRolls.reduce((total, roll) => total + roll, modifier),
    rolls,
    keptRolls,
    discardedRolls,
    modifier,
  });
};

const sampleInteger = (distribution, randomSource) => {
  assertAllowedKeys(
    distribution,
    new Set(["type", "min", "max"]),
    "random.distribution",
  );
  if (!Object.prototype.hasOwnProperty.call(distribution, "min")) {
    throw new Error("random.distribution.min is required");
  }
  if (!Object.prototype.hasOwnProperty.call(distribution, "max")) {
    throw new Error("random.distribution.max is required");
  }
  const min = assertSafeInteger(distribution.min, "random.distribution.min");
  const max = assertSafeInteger(distribution.max, "random.distribution.max");
  const cardinality = max - min + 1;
  if (cardinality < 1 || cardinality > UINT32_CARDINALITY) {
    throw new Error(
      "random integer range must contain from 1 through 4294967296 values",
    );
  }
  return cloneAndFreeze({
    type: "integer",
    value: min + sampleUint32Range(randomSource, cardinality),
  });
};

const sampleChance = (distribution, randomSource) => {
  assertAllowedKeys(
    distribution,
    new Set(["type", "probability"]),
    "random.distribution",
  );
  if (!Object.prototype.hasOwnProperty.call(distribution, "probability")) {
    throw new Error("random.distribution.probability is required");
  }
  const probability = assertFiniteNumber(
    distribution.probability,
    "random.distribution.probability",
    { min: 0, max: 1 },
  );
  const value =
    probability === 0
      ? false
      : probability === 1
        ? true
        : sampleUnit53(randomSource) < probability;
  return cloneAndFreeze({ type: "chance", value });
};

const sampleWeighted = (distribution, randomSource) => {
  assertAllowedKeys(
    distribution,
    new Set(["type", "outcomes"]),
    "random.distribution",
  );
  if (
    !Array.isArray(distribution.outcomes) ||
    distribution.outcomes.length < 1 ||
    distribution.outcomes.length > MAX_WEIGHTED_OUTCOMES
  ) {
    throw new Error(
      "random.distribution.outcomes must contain from 1 through 1000 items",
    );
  }

  const outcomes = distribution.outcomes.map((outcome, index) => {
    const path = `random.distribution.outcomes[${index}]`;
    assertRecord(outcome, path);
    assertAllowedKeys(outcome, new Set(["weight", "actions"]), path);
    if (!Object.prototype.hasOwnProperty.call(outcome, "weight")) {
      throw new Error(`${path}.weight is required`);
    }
    assertRecord(outcome.actions, `${path}.actions`);
    return {
      weight: assertFiniteNumber(outcome.weight, `${path}.weight`, {
        min: 0,
      }),
    };
  });
  const maxWeight = Math.max(...outcomes.map(({ weight }) => weight));
  if (maxWeight <= 0) {
    throw new Error("random weighted total weight must be positive");
  }
  const scaledOutcomes = outcomes.map((outcome) => ({
    ...outcome,
    weight: outcome.weight / maxWeight,
  }));
  const totalWeight = scaledOutcomes.reduce(
    (total, outcome) => total + outcome.weight,
    0,
  );
  scaledOutcomes.forEach((outcome, index) => {
    if (
      outcomes[index].weight > 0 &&
      (outcome.weight === 0 || outcome.weight / totalWeight < MIN_WEIGHT_SHARE)
    ) {
      throw new Error(
        `random.distribution.outcomes[${index}].weight is below the supported probability resolution`,
      );
    }
  });

  const target = sampleUnit53(randomSource) * totalWeight;
  let cumulativeWeight = 0;
  let outcomeIndex = scaledOutcomes.findLastIndex(({ weight }) => weight > 0);
  for (let index = 0; index < scaledOutcomes.length; index += 1) {
    const outcome = scaledOutcomes[index];
    cumulativeWeight += outcome.weight;
    if (target < cumulativeWeight) {
      outcomeIndex = index;
      break;
    }
  }
  return cloneAndFreeze({ type: "weighted", outcomeIndex });
};

export const sampleRandomDistribution = (distribution, { randomSource }) => {
  assertRecord(distribution, "random.distribution");
  const samplers = {
    dice: sampleDice,
    integer: sampleInteger,
    chance: sampleChance,
    weighted: sampleWeighted,
  };
  const sampler = samplers[distribution.type];
  if (!sampler) {
    throw new Error(
      'random.distribution.type must be "dice", "integer", "chance", or "weighted"',
    );
  }
  return sampler(distribution, randomSource);
};

export const validateRandomResult = (result, expectedType) => {
  assertRecord(result, "random result");
  if (result.type !== expectedType) {
    throw new Error("random result type does not match its recorded type");
  }
  if (expectedType === "dice") {
    assertAllowedKeys(
      result,
      new Set([
        "type",
        "value",
        "rolls",
        "keptRolls",
        "discardedRolls",
        "modifier",
      ]),
      "random result",
    );
    assertSafeInteger(result.value, "random result.value");
    assertSafeInteger(result.modifier, "random result.modifier");
    for (const key of ["rolls", "keptRolls", "discardedRolls"]) {
      if (
        !Array.isArray(result[key]) ||
        result[key].some(
          (value) =>
            !Number.isSafeInteger(value) ||
            value < 1 ||
            value > UINT32_CARDINALITY,
        )
      ) {
        throw new Error(
          `random result.${key} must be an array of positive integers`,
        );
      }
    }
    const breakdownCounts = new Map();
    [...result.keptRolls, ...result.discardedRolls].forEach((roll) => {
      breakdownCounts.set(roll, (breakdownCounts.get(roll) ?? 0) + 1);
    });
    const rollsMatchBreakdown = result.rolls.every((roll) => {
      const count = breakdownCounts.get(roll) ?? 0;
      if (count === 0) return false;
      breakdownCounts.set(roll, count - 1);
      return true;
    });
    const expectedValue = result.keptRolls.reduce(
      (total, roll) => total + roll,
      result.modifier,
    );
    if (
      result.rolls.length < 1 ||
      result.rolls.length > MAX_DICE_COUNT ||
      result.keptRolls.length < 1 ||
      result.keptRolls.length + result.discardedRolls.length !==
        result.rolls.length ||
      !rollsMatchBreakdown ||
      expectedValue !== result.value
    ) {
      throw new Error("random dice result breakdown is inconsistent");
    }
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
    assertAllowedKeys(result, new Set(["type", "value"]), "random result");
    if (expectedType === "integer") {
      assertSafeInteger(result.value, "random result.value");
    } else if (expectedType === "chance") {
      if (typeof result.value !== "boolean") {
        throw new Error("random result.value must be a boolean");
      }
    } else {
      throw new Error(
        `unsupported recorded random result type: ${expectedType}`,
      );
    }
  }
  return cloneAndFreeze(result);
};
