const tokenPattern = /\s*(\d+(?:\.\d+)?|[()+\-*/])\s*/gy;

function tokenize(expression: string) {
  const tokens: string[] = [];
  let cursor = 0;

  while (cursor < expression.length) {
    tokenPattern.lastIndex = cursor;
    const match = tokenPattern.exec(expression);

    if (!match || match.index !== cursor) {
      throw new Error("INVALID_EXPRESSION");
    }

    tokens.push(match[1]!);
    cursor = tokenPattern.lastIndex;
  }

  return tokens;
}

export function evaluateMoneyExpression(expression: string) {
  const tokens = tokenize(expression.trim());
  let index = 0;

  const parsePrimary = (): number => {
    const token = tokens[index];

    if (token === "+" || token === "-") {
      index += 1;
      const value = parsePrimary();
      return token === "-" ? -value : value;
    }

    if (token === "(") {
      index += 1;
      const value = parseSum();
      if (tokens[index] !== ")") throw new Error("INVALID_EXPRESSION");
      index += 1;
      return value;
    }

    if (!token || !/^\d+(?:\.\d+)?$/.test(token)) {
      throw new Error("INVALID_EXPRESSION");
    }

    index += 1;
    return Number(token);
  };

  const parseProduct = (): number => {
    let value = parsePrimary();

    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index++];
      const right = parsePrimary();
      if (operator === "/" && right === 0) throw new Error("DIVIDE_BY_ZERO");
      value = operator === "*" ? value * right : value / right;
    }

    return value;
  };

  function parseSum(): number {
    let value = parseProduct();

    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++];
      const right = parseProduct();
      value = operator === "+" ? value + right : value - right;
    }

    return value;
  }

  if (tokens.length === 0) throw new Error("INVALID_EXPRESSION");
  const result = parseSum();

  if (index !== tokens.length || !Number.isFinite(result) || result <= 0) {
    throw new Error("INVALID_EXPRESSION");
  }

  return result.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
