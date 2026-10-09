// Jempl 1.x accepts an absent operand as the number zero. Validate operand
// boundaries before rendering, while leaving property paths and quoted values
// to Jempl. In particular, the property in `variables.in` is not an operator.
export const validateLayoutCondition = (expression, path) => {
  let offset = 0;
  const fail = (reason) => {
    throw new Error(`Malformed $when condition at "${path}": ${reason}.`);
  };
  const skipWhitespace = () => {
    while (/\s/.test(expression[offset] ?? "") && offset < expression.length) {
      offset++;
    }
  };
  const readQuoted = () => {
    const quote = expression[offset++];
    while (offset < expression.length) {
      const char = expression[offset++];
      if (char === "\\") offset++;
      else if (char === quote) return;
    }
    fail("unterminated quoted value");
  };
  const readBracketed = () => {
    const closing = expression[offset++] === "[" ? "]" : "}";
    while (offset < expression.length) {
      const char = expression[offset];
      if (char === closing) {
        offset++;
        return;
      }
      if (char === "'" || char === '"') readQuoted();
      else if (char === "[" || char === "{") readBracketed();
      else offset++;
    }
    fail(`missing closing ${closing}`);
  };
  const operatorAt = () => {
    const rest = expression.slice(offset);
    const symbolic = /^(?:==|!=|>=|<=|&&|\|\||[<>])/.exec(rest);
    if (symbolic) return symbolic[0];
    // Jempl's arithmetic and membership operators require whitespace. Keep
    // unspaced hyphens and operator-looking property names as part of a path.
    if (offset === 0 || /\s/.test(expression[offset - 1])) {
      const spaced = /^(?:in|[+-])(?=\s|$|\))/.exec(rest);
      if (spaced) return spaced[0];
    }
    return null;
  };
  const readExpression = (closing, allowEmpty = false) => {
    let hasOperand = false;
    let lastOperator;
    skipWhitespace();
    if (allowEmpty && expression[offset] === closing) {
      offset++;
      return;
    }
    while (offset < expression.length) {
      skipWhitespace();
      const char = expression[offset];
      if (char === undefined || char === closing || char === ",") {
        if (!hasOperand)
          fail(
            `missing an operand${lastOperator ? ` after "${lastOperator}"` : ""}`,
          );
        if (char === closing) {
          offset++;
          return;
        }
        if (char === "," && allowEmpty) {
          offset++;
          hasOperand = false;
          lastOperator = ",";
          continue;
        }
        if (char === ",") fail("unexpected comma");
        break;
      }
      if (char === ")" || char === "]" || char === "}")
        fail(`unexpected ${char}`);
      const operator = operatorAt();
      if (operator) {
        if (!hasOperand) fail(`missing an operand before "${operator}"`);
        offset += operator.length;
        hasOperand = false;
        lastOperator = operator;
        continue;
      }
      if (char === "!" && expression[offset + 1] !== "=") {
        if (hasOperand) fail("unexpected !");
        offset++;
        lastOperator = "!";
        continue;
      }
      if (hasOperand) fail("missing an operator");
      if (char === "(") {
        offset++;
        readExpression(")");
      } else {
        const start = offset;
        while (offset < expression.length) {
          const token = expression[offset];
          if (
            /\s/.test(token) ||
            token === ")" ||
            token === "," ||
            operatorAt()
          )
            break;
          if (token === "'" || token === '"') readQuoted();
          else if (token === "[" || token === "{") readBracketed();
          else if (token === "(") {
            offset++;
            readExpression(")", true);
          } else if (
            token === "]" ||
            token === "}" ||
            token === "=" ||
            token === "&" ||
            token === "|"
          ) {
            fail(`unexpected ${token}`);
          } else offset++;
        }
        if (offset === start) fail("missing an operand");
      }
      hasOperand = true;
    }
    if (!hasOperand)
      fail(
        `missing an operand${lastOperator ? ` after "${lastOperator}"` : ""}`,
      );
    if (closing) fail(`missing closing ${closing}`);
  };
  readExpression();
};
