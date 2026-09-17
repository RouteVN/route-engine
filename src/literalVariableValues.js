// The marker applies only to updateVariable operations, never to objects that
// merely contain action-like keys inside user data.
export const isLiteralVariableOperation = (operation, variableType) => {
  if (!Object.hasOwn(operation, "valueMode")) return false;
  if (operation.valueMode !== "literal") {
    throw new Error('updateVariable valueMode must be "literal" when provided');
  }
  if (
    operation.op !== "set" ||
    operation.roundTo !== undefined ||
    (variableType !== undefined && variableType !== "object") ||
    operation.value === null ||
    typeof operation.value !== "object"
  ) {
    throw new Error(
      'Literal variable values require an object variable, op "set", an object or array value, and no roundTo',
    );
  }
  return true;
};

export const cloneLiteralVariableValue = (value) => {
  const ancestors = new Set();
  const copy = (entry, depth) => {
    if (depth > 128)
      throw new Error("Literal variable value exceeds JSON depth 128");
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "boolean"
    )
      return entry;
    if (typeof entry === "number" && Number.isFinite(entry)) return entry;
    if (typeof entry !== "object")
      throw new Error("Literal variable values must contain only JSON data");
    if (ancestors.has(entry))
      throw new Error("Literal variable values cannot contain cycles");
    const prototype = Object.getPrototypeOf(entry);
    if (
      Array.isArray(entry)
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      throw new Error(
        "Literal variable values must contain plain JSON objects",
      );
    ancestors.add(entry);
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (!(Array.isArray(entry) && key === "length") &&
            (!descriptors[key].enumerable ||
              !Object.hasOwn(descriptors[key], "value"))),
      )
    ) {
      throw new Error(
        "Literal variable values cannot contain accessors, symbols or hidden fields",
      );
    }
    let result;
    if (Array.isArray(entry)) {
      if (
        keys.length !== entry.length + 1 ||
        keys.some(
          (key) =>
            key !== "length" &&
            (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= entry.length),
        )
      )
        throw new Error("Literal variable arrays must be dense JSON arrays");
      result = entry.map((item) => copy(item, depth + 1));
    } else {
      result = Object.fromEntries(
        keys.map((key) => [key, copy(descriptors[key].value, depth + 1)]),
      );
    }
    ancestors.delete(entry);
    return result;
  };
  return copy(value, 0);
};
