var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/json-e/dist/index.js
var require_dist = __commonJS({
  "node_modules/json-e/dist/index.js"(exports, module) {
    (function(global, factory) {
      typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, global.jsone = factory());
    })(exports, function() {
      "use strict";
      var parser = {};
      var AST = {};
      class ASTNode {
        constructor(token) {
          this.token = token;
          this.constructorName = "ASTNode";
        }
      }
      let Primitive$1 = ASTNode;
      class BinOp$1 extends ASTNode {
        constructor(token, left, right) {
          super(token);
          this.constructorName = "BinOp";
          this.left = left;
          this.right = right;
        }
      }
      class UnaryOp$1 extends ASTNode {
        constructor(token, expr) {
          super(token);
          this.constructorName = "UnaryOp";
          this.expr = expr;
        }
      }
      class FunctionCall$1 extends ASTNode {
        constructor(token, name, args) {
          super(token);
          this.constructorName = "FunctionCall";
          this.name = name;
          this.args = args;
        }
      }
      class ContextValue$1 {
        constructor(token) {
          this.token = token;
          this.constructorName = "ContextValue";
        }
      }
      class List$1 extends ASTNode {
        constructor(token, list) {
          super(token);
          this.constructorName = "List";
          this.list = list;
        }
      }
      class ValueAccess$1 extends ASTNode {
        constructor(token, arr, isInterval, left, right) {
          super(token);
          this.constructorName = "ValueAccess";
          this.isInterval = isInterval;
          this.arr = arr;
          this.left = left;
          this.right = right;
        }
      }
      class Object$2 extends ASTNode {
        constructor(token, obj) {
          super(token);
          this.constructorName = "Object";
          this.obj = obj;
        }
      }
      AST.ASTNode = ASTNode;
      AST.BinOp = BinOp$1;
      AST.UnaryOp = UnaryOp$1;
      AST.Primitive = Primitive$1;
      AST.FunctionCall = FunctionCall$1;
      AST.ContextValue = ContextValue$1;
      AST.ValueAccess = ValueAccess$1;
      AST.List = List$1;
      AST.Object = Object$2;
      class JSONTemplateError$1 extends Error {
        constructor(message) {
          super(message);
          this.location = [];
        }
        add_location(loc) {
          this.location.unshift(loc);
        }
        toString() {
          if (this.location.length) {
            return `${this.name} at template${this.location.join("")}: ${this.message}`;
          } else {
            return `${this.name}: ${this.message}`;
          }
        }
      }
      class SyntaxError$3 extends JSONTemplateError$1 {
        constructor(message) {
          super(message);
          this.message = message;
          this.name = "SyntaxError";
        }
      }
      class BaseError extends JSONTemplateError$1 {
        constructor(message) {
          super(message);
          this.message = message;
          this.name = "BaseError";
        }
      }
      class InterpreterError$1 extends BaseError {
        constructor(message) {
          super(message);
          this.name = "InterpreterError";
        }
      }
      class TemplateError$1 extends BaseError {
        constructor(message) {
          super(message);
          this.name = "TemplateError";
        }
      }
      class BuiltinError$1 extends BaseError {
        constructor(message) {
          super(message);
          this.name = "BuiltinError";
        }
      }
      var error = { JSONTemplateError: JSONTemplateError$1, SyntaxError: SyntaxError$3, InterpreterError: InterpreterError$1, TemplateError: TemplateError$1, BuiltinError: BuiltinError$1 };
      const { UnaryOp, BinOp, Primitive, ContextValue, FunctionCall, ValueAccess, List, Object: Object$1 } = AST;
      const { SyntaxError: SyntaxError$2 } = error;
      let syntaxRuleError$1 = (token, expects) => {
        expects.sort();
        return new SyntaxError$2(`Found: ${token.value} token, expected one of: ${expects.join(", ")}`, token);
      };
      class Parser$1 {
        constructor(tokenizer2, source, offset = 0) {
          this._source = source;
          this._tokenizer = tokenizer2;
          this.current_token = this._tokenizer.next(this._source, offset);
          this.unaryOpTokens = ["-", "+", "!"];
          this.primitivesTokens = ["number", "null", "true", "false", "string"];
          this.operations = [["||"], ["&&"], ["in"], ["==", "!="], ["<", ">", "<=", ">="], ["+", "-"], ["*", "/"], ["**"]];
          this.expectedTokens = ["!", "(", "+", "-", "[", "false", "identifier", "null", "number", "string", "true", "{"];
        }
        takeToken(...kinds) {
          if (this.current_token == null) {
            throw new SyntaxError$2("Unexpected end of input");
          }
          if (kinds.length > 0 && kinds.indexOf(this.current_token.kind) === -1) {
            throw syntaxRuleError$1(this.current_token, kinds);
          }
          try {
            this.current_token = this._tokenizer.next(this._source, this.current_token.end);
          } catch (err) {
            throw err;
          }
        }
        parse(level = 0) {
          let node;
          if (level == this.operations.length - 1) {
            node = this.parsePropertyAccessOrFunc();
            let token = this.current_token;
            for (; token != null && this.operations[level].indexOf(token.kind) !== -1; token = this.current_token) {
              this.takeToken(token.kind);
              node = new BinOp(token, this.parse(level), node);
            }
          } else {
            node = this.parse(level + 1);
            let token = this.current_token;
            for (; token != null && this.operations[level].indexOf(token.kind) !== -1; token = this.current_token) {
              this.takeToken(token.kind);
              node = new BinOp(token, node, this.parse(level + 1));
            }
          }
          return node;
        }
        parsePropertyAccessOrFunc() {
          let node = this.parseUnit();
          let operators2 = ["[", "(", "."];
          let rightPart;
          for (let token = this.current_token; token != null && operators2.indexOf(token.kind) !== -1; token = this.current_token) {
            if (token.kind == "[") {
              node = this.parseAccessWithBrackets(node);
            } else if (token.kind == ".") {
              token = this.current_token;
              this.takeToken(".");
              rightPart = new Primitive(this.current_token);
              this.takeToken("identifier");
              node = new BinOp(token, node, rightPart);
            } else if (token.kind == "(") {
              node = this.parseFunctionCall(node);
            }
          }
          return node;
        }
        parseUnit() {
          let token = this.current_token;
          let node;
          let isUnaryOpToken = this.unaryOpTokens.indexOf(token.kind) !== -1;
          let isPrimitivesToken = this.primitivesTokens.indexOf(token.kind) !== -1;
          if (this.current_token == null) {
            throw new SyntaxError$2("Unexpected end of input");
          }
          if (isUnaryOpToken) {
            this.takeToken(token.kind);
            node = new UnaryOp(token, this.parseUnit());
          } else if (isPrimitivesToken) {
            this.takeToken(token.kind);
            node = new Primitive(token);
          } else if (token.kind == "identifier") {
            this.takeToken(token.kind);
            node = new ContextValue(token);
          } else if (token.kind == "(") {
            this.takeToken("(");
            node = this.parse();
            if (node == null) {
              throw syntaxRuleError$1(this.current_token, this.expectedTokens);
            }
            this.takeToken(")");
          } else if (token.kind == "[") {
            node = this.parseList();
          } else if (token.kind == "{") {
            node = this.parseObject();
          }
          return node;
        }
        parseFunctionCall(name) {
          let token = this.current_token;
          let node;
          let args = [];
          this.takeToken("(");
          if (this.current_token.kind != ")") {
            node = this.parse();
            args.push(node);
            while (this.current_token != null && this.current_token.kind == ",") {
              if (args[args.length - 1] == null) {
                throw syntaxRuleError$1(this.current_token, this.expectedTokens);
              }
              this.takeToken(",");
              node = this.parse();
              args.push(node);
            }
          }
          this.takeToken(")");
          node = new FunctionCall(token, name, args);
          return node;
        }
        parseList() {
          let node;
          let arr = [];
          let token = this.current_token;
          this.takeToken("[");
          if (this.current_token.kind != "]") {
            node = this.parse();
            arr.push(node);
            while (this.current_token.kind == ",") {
              if (arr[arr.length - 1] == null) {
                throw syntaxRuleError$1(this.current_token, this.expectedTokens);
              }
              this.takeToken(",");
              node = this.parse();
              arr.push(node);
            }
          }
          this.takeToken("]");
          node = new List(token, arr);
          return node;
        }
        parseAccessWithBrackets(node) {
          let leftArg = null, rightArg = null;
          let token = this.current_token;
          let isInterval = false;
          this.takeToken("[");
          if (this.current_token.kind == "]") {
            throw syntaxRuleError$1(this.current_token, this.expectedTokens);
          }
          if (this.current_token.kind != ":") {
            leftArg = this.parse();
          }
          if (this.current_token.kind == ":") {
            isInterval = true;
            this.takeToken(":");
          }
          if (this.current_token.kind != "]") {
            rightArg = this.parse();
          }
          if (isInterval && rightArg == null && this.current_token.kind != "]") {
            throw syntaxRuleError$1(this.current_token, this.expectedTokens);
          }
          this.takeToken("]");
          node = new ValueAccess(token, node, isInterval, leftArg, rightArg);
          return node;
        }
        parseObject() {
          let node;
          let obj = {};
          let key, value;
          let objToken = this.current_token;
          this.takeToken("{");
          let token = this.current_token;
          while (token != null && (token.kind == "string" || token.kind == "identifier")) {
            key = token.value;
            if (token.kind == "string") {
              key = parseString(key);
            }
            this.takeToken(token.kind);
            this.takeToken(":");
            value = this.parse();
            if (value == null) {
              throw syntaxRuleError$1(this.current_token, this.expectedTokens);
            }
            obj[key] = value;
            if (this.current_token != null && this.current_token.kind == "}") {
              break;
            } else {
              this.takeToken(",");
            }
            token = this.current_token;
          }
          this.takeToken("}");
          node = new Object$1(objToken, obj);
          return node;
        }
      }
      let parseString = (str) => {
        return str.slice(1, -1);
      };
      parser.Parser = Parser$1;
      var { SyntaxError: SyntaxError$1 } = error;
      let escapeRegex = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      let isRegEx = (re) => {
        if (typeof re !== "string") {
          return false;
        }
        try {
          new RegExp(`^${re}$`);
        } catch (e) {
          return false;
        }
        return true;
      };
      let isNonCaptureRegex = (re) => {
        return isRegEx(re) && new RegExp(`^(?:|${re})$`).exec("").length === 1;
      };
      let indexOfNotUndefined = (a, start = 0) => {
        let n = a.length;
        for (let i = start; i < n; i++) {
          if (a[i] !== void 0) {
            return i;
          }
        }
        return -1;
      };
      const assert = (prop) => {
        if (!prop) {
          throw new Error("Token configuration is invalid");
        }
      };
      class Tokenizer$1 {
        constructor(options = {}) {
          options = Object.assign({}, {
            ignore: null,
            patterns: {},
            tokens: []
          }, options);
          assert(options.ignore === null || isNonCaptureRegex(options.ignore));
          assert(options.patterns instanceof Object);
          for (let pattern of Object.keys(options.patterns)) {
            assert(isNonCaptureRegex(options.patterns[pattern]));
          }
          assert(options.tokens instanceof Array);
          options.tokens.forEach((tokenName) => assert(typeof tokenName === "string"));
          this._tokens = options.tokens;
          this._hasIgnore = options.ignore ? 1 : 0;
          this._regex = new RegExp("^(?:" + [
            this._hasIgnore ? `(${options.ignore})` : null,
            ...this._tokens.map((tokenName) => {
              return `(${options.patterns[tokenName] || escapeRegex(tokenName)})`;
            })
          ].filter((e) => e !== null).join("|") + ")");
        }
        next(source, offset = 0) {
          let m, i;
          do {
            m = this._regex.exec(source.slice(offset));
            if (m === null) {
              if (source.slice(offset) !== "") {
                throw new SyntaxError$1(
                  `Unexpected input for '${source}' at '${source.slice(offset)}'`,
                  { start: offset, end: source.length }
                );
              }
              return null;
            }
            i = indexOfNotUndefined(m, 1);
            offset += m[0].length;
          } while (this._hasIgnore && i === 1);
          return {
            kind: this._tokens[i - 1 - this._hasIgnore],
            value: m[i],
            start: offset - m[0].length,
            end: offset
          };
        }
        tokenize(source, offset = 0) {
          let token = { end: offset };
          let tokens = [];
          while (token = this.next(source, token.end)) {
            tokens.push(token);
          }
          return tokens;
        }
      }
      var tokenizer$1 = Tokenizer$1;
      var interpreter = {};
      let utils = {
        isString: (expr) => typeof expr === "string",
        isNumber: (expr) => typeof expr === "number",
        isInteger: (expr) => typeof expr === "number" && Number.isInteger(expr),
        isBool: (expr) => typeof expr === "boolean",
        isNull: (expr) => expr === null,
        isArray: (expr) => expr instanceof Array,
        isObject: (expr) => expr instanceof Object && !(expr instanceof Array) && !(expr instanceof Function),
        isFunction: (expr) => expr instanceof Function,
        isTruthy: (expr) => {
          return expr !== null && (utils.isArray(expr) && expr.length > 0 || utils.isObject(expr) && Object.keys(expr).length > 0 || utils.isString(expr) && expr.length > 0 || utils.isNumber(expr) && expr !== 0 || utils.isBool(expr) && expr || utils.isFunction(expr));
        }
      };
      var typeUtils = utils;
      const { isFunction: isFunction$2, isObject: isObject$2, isString: isString$2, isArray: isArray$3, isNumber: isNumber$2, isInteger: isInteger$1, isTruthy: isTruthy$1 } = typeUtils;
      const { InterpreterError } = error;
      let expectationError = (operator, expectation) => new InterpreterError(`${operator} expects ${expectation}`);
      class Interpreter$1 {
        constructor(context) {
          this.context = context;
        }
        visit(node) {
          let funcName = "visit_" + node.constructorName;
          return this[funcName](node);
        }
        visit_ASTNode(node) {
          let str;
          switch (node.token.kind) {
            case "number":
              return +node.token.value;
            case "null":
              return null;
            case "string":
              str = node.token.value.slice(1, -1);
              return str;
            case "true":
              return true;
            case "false":
              return false;
            case "identifier":
              return node.token.value;
          }
        }
        visit_UnaryOp(node) {
          let value = this.visit(node.expr);
          switch (node.token.kind) {
            case "+":
              if (!isNumber$2(value)) {
                throw expectationError("unary +", "number");
              }
              return +value;
            case "-":
              if (!isNumber$2(value)) {
                throw expectationError("unary -", "number");
              }
              return -value;
            case "!":
              return !isTruthy$1(value);
          }
        }
        visit_BinOp(node) {
          let left = this.visit(node.left);
          let right;
          switch (node.token.kind) {
            case "||":
              return isTruthy$1(left) || isTruthy$1(this.visit(node.right));
            case "&&":
              return isTruthy$1(left) && isTruthy$1(this.visit(node.right));
            default:
              right = this.visit(node.right);
          }
          switch (node.token.kind) {
            case "+":
              testMathOperands("+", left, right);
              return left + right;
            case "-":
              testMathOperands("-", left, right);
              return left - right;
            case "/":
              testMathOperands("/", left, right);
              if (right == 0) {
                throw new InterpreterError("division by zero");
              }
              return left / right;
            case "*":
              testMathOperands("*", left, right);
              return left * right;
            case ">":
              testComparisonOperands(">", left, right);
              return left > right;
            case "<":
              testComparisonOperands("<", left, right);
              return left < right;
            case ">=":
              testComparisonOperands(">=", left, right);
              return left >= right;
            case "<=":
              testComparisonOperands("<=", left, right);
              return left <= right;
            case "!=":
              testComparisonOperands("!=", left, right);
              return !isEqual(left, right);
            case "==":
              testComparisonOperands("==", left, right);
              return isEqual(left, right);
            case "**":
              testMathOperands("**", left, right);
              return Math.pow(right, left);
            case ".": {
              if (isObject$2(left)) {
                if (left.hasOwnProperty(right)) {
                  return left[right];
                }
                throw new InterpreterError(`object has no property "${right}"`);
              }
              throw expectationError("infix: .", "objects");
            }
            case "in": {
              if (isObject$2(right)) {
                if (!isString$2(left)) {
                  throw expectationError("Infix: in-object", "string on left side");
                }
                right = Object.keys(right);
              } else if (isString$2(right)) {
                if (!isString$2(left)) {
                  throw expectationError("Infix: in-string", "string on left side");
                }
                return right.indexOf(left) !== -1;
              } else if (!isArray$3(right)) {
                throw expectationError("Infix: in", "Array, string, or object on right side");
              }
              return right.some((r) => isEqual(left, r));
            }
          }
        }
        visit_List(node) {
          let list = [];
          if (node.list[0] !== void 0) {
            node.list.forEach(function(item) {
              list.push(this.visit(item));
            }, this);
          }
          return list;
        }
        visit_ValueAccess(node) {
          let array = this.visit(node.arr);
          let left = 0, right = null;
          if (node.left) {
            left = this.visit(node.left);
          }
          if (node.right) {
            right = this.visit(node.right);
          }
          const slice_or_index = (isInterval, value, left2, right2) => {
            if (left2 < 0) {
              left2 = value.length + left2;
              if (left2 < 0)
                left2 = 0;
            }
            if (isInterval) {
              right2 = right2 === null ? value.length : right2;
              if (right2 < 0) {
                right2 = value.length + right2;
                if (right2 < 0)
                  right2 = 0;
              }
              if (left2 > right2) {
                left2 = right2;
              }
              if (!isInteger$1(left2) || !isInteger$1(right2)) {
                throw new InterpreterError("cannot perform interval access with non-integers");
              }
              return value.slice(left2, right2);
            }
            if (!isInteger$1(left2)) {
              throw new InterpreterError("should only use integers to access arrays or strings");
            }
            if (left2 >= value.length) {
              throw new InterpreterError("index out of bounds");
            }
            return value[left2];
          };
          if (isArray$3(array)) {
            return slice_or_index(node.isInterval, array, left, right);
          }
          if (isString$2(array)) {
            if (/^[\x00-\x7F]*$/.test(array)) {
              return slice_or_index(node.isInterval, array, left, right);
            }
            let res = slice_or_index(node.isInterval, [...array], left, right);
            if (isArray$3(res)) {
              res = res.join("");
            }
            return res;
          }
          if (!isObject$2(array)) {
            throw expectationError(`infix: "[..]"`, "object, array, or string");
          }
          if (!isString$2(left)) {
            throw new InterpreterError("object keys must be strings");
          }
          if (array.hasOwnProperty(left)) {
            return array[left];
          } else {
            return null;
          }
        }
        visit_ContextValue(node) {
          if (this.context.hasOwnProperty(node.token.value)) {
            let contextValue = this.context[node.token.value];
            return contextValue;
          }
          throw new InterpreterError(`unknown context value ${node.token.value}`);
        }
        visit_FunctionCall(node) {
          let args = [];
          let funcName = this.visit(node.name);
          if (isFunction$2(funcName)) {
            node.args.forEach(function(item) {
              args.push(this.visit(item));
            }, this);
            if (funcName.hasOwnProperty("jsone_builtin")) {
              args.unshift(this.context);
            }
            return funcName.apply(null, args);
          } else {
            throw new InterpreterError(`${funcName} is not callable`);
          }
        }
        visit_Object(node) {
          let obj = {};
          for (let key in node.obj) {
            obj[key] = this.visit(node.obj[key]);
          }
          return obj;
        }
        interpret(tree) {
          return this.visit(tree);
        }
      }
      let isEqual = (a, b) => {
        if (isArray$3(a) && isArray$3(b) && a.length === b.length) {
          for (let i = 0; i < a.length; i++) {
            if (!isEqual(a[i], b[i])) {
              return false;
            }
          }
          return true;
        }
        if (isFunction$2(a)) {
          return a === b;
        }
        if (isObject$2(a) && isObject$2(b)) {
          let keys = Object.keys(a).sort();
          if (!isEqual(keys, Object.keys(b).sort())) {
            return false;
          }
          for (let k of keys) {
            if (!isEqual(a[k], b[k])) {
              return false;
            }
          }
          return true;
        }
        return a === b;
      };
      let testMathOperands = (operator, left, right) => {
        if (operator === "+" && !(isNumber$2(left) && isNumber$2(right) || isString$2(left) && isString$2(right))) {
          throw expectationError("infix: +", "numbers/strings + numbers/strings");
        }
        if (["-", "*", "/", "**"].some((v) => v === operator) && !(isNumber$2(left) && isNumber$2(right))) {
          throw expectationError(`infix: ${operator}`, `number ${operator} number`);
        }
        return;
      };
      let testComparisonOperands = (operator, left, right) => {
        if (operator === "==" || operator === "!=") {
          return null;
        }
        let test = [">=", "<=", "<", ">"].some((v) => v === operator) && (isNumber$2(left) && isNumber$2(right) || isString$2(left) && isString$2(right));
        if (!test) {
          throw expectationError(`infix: ${operator}`, `numbers/strings ${operator} numbers/strings`);
        }
        return;
      };
      interpreter.Interpreter = Interpreter$1;
      var timeExp = new RegExp([
        "^(\\s*(-|\\+))?",
        "(\\s*(?<years>\\d+)\\s*(y|year|years|yr))?",
        "(\\s*(?<months>\\d+)\\s*(months|month|mo))?",
        "(\\s*(?<weeks>\\d+)\\s*(weeks|week|wk|w))?",
        "(\\s*(?<days>\\d+)\\s*(days|day|d))?",
        "(\\s*(?<hours>\\d+)\\s*(hours|hour|hr|h))?",
        "(\\s*(?<minutes>\\d+)\\s*(minutes|minute|min|m))?",
        "(\\s*(?<seconds>\\d+)\\s*(seconds|second|sec|s))?",
        "\\s*$"
      ].join(""), "i");
      var parseTime = function(str) {
        var match = timeExp.exec(str || "");
        if (!match) {
          throw new Error("String: '" + str + "' isn't a time expression");
        }
        var neg = match[2] === "-" ? -1 : 1;
        let groups = match.groups;
        return {
          years: parseInt(groups["years"] || 0, 10) * neg,
          months: parseInt(groups["months"] || 0, 10) * neg,
          weeks: parseInt(groups["weeks"] || 0, 10) * neg,
          days: parseInt(groups["days"] || 0, 10) * neg,
          hours: parseInt(groups["hours"] || 0, 10) * neg,
          minutes: parseInt(groups["minutes"] || 0, 10) * neg,
          seconds: parseInt(groups["seconds"] || 0, 10) * neg
        };
      };
      var fromNow$2 = (timespan = "", reference) => {
        let offset = parseTime(timespan);
        offset.days += 30 * offset.months;
        offset.days += 365 * offset.years;
        if (reference) {
          reference = new Date(reference);
        } else {
          reference = /* @__PURE__ */ new Date();
        }
        var retval = new Date(
          reference.getTime() + offset.weeks * 7 * 24 * 60 * 60 * 1e3 + offset.days * 24 * 60 * 60 * 1e3 + offset.hours * 60 * 60 * 1e3 + offset.minutes * 60 * 1e3 + offset.seconds * 1e3
        );
        return retval.toJSON();
      };
      var jsonStableStringifyWithoutJsonify = function(obj, opts) {
        if (!opts) opts = {};
        if (typeof opts === "function") opts = { cmp: opts };
        var space = opts.space || "";
        if (typeof space === "number") space = Array(space + 1).join(" ");
        var cycles = typeof opts.cycles === "boolean" ? opts.cycles : false;
        var replacer = opts.replacer || function(key, value) {
          return value;
        };
        var cmp = opts.cmp && /* @__PURE__ */ function(f) {
          return function(node) {
            return function(a, b) {
              var aobj = { key: a, value: node[a] };
              var bobj = { key: b, value: node[b] };
              return f(aobj, bobj);
            };
          };
        }(opts.cmp);
        var seen = [];
        return function stringify2(parent, key, node, level) {
          var indent = space ? "\n" + new Array(level + 1).join(space) : "";
          var colonSeparator = space ? ": " : ":";
          if (node && node.toJSON && typeof node.toJSON === "function") {
            node = node.toJSON();
          }
          node = replacer.call(parent, key, node);
          if (node === void 0) {
            return;
          }
          if (typeof node !== "object" || node === null) {
            return JSON.stringify(node);
          }
          if (isArray$2(node)) {
            var out = [];
            for (var i = 0; i < node.length; i++) {
              var item = stringify2(node, i, node[i], level + 1) || JSON.stringify(null);
              out.push(indent + space + item);
            }
            return "[" + out.join(",") + indent + "]";
          } else {
            if (seen.indexOf(node) !== -1) {
              if (cycles) return JSON.stringify("__cycle__");
              throw new TypeError("Converting circular structure to JSON");
            } else seen.push(node);
            var keys = objectKeys(node).sort(cmp && cmp(node));
            var out = [];
            for (var i = 0; i < keys.length; i++) {
              var key = keys[i];
              var value = stringify2(node, key, node[key], level + 1);
              if (!value) continue;
              var keyValue = JSON.stringify(key) + colonSeparator + value;
              out.push(indent + space + keyValue);
            }
            seen.splice(seen.indexOf(node), 1);
            return "{" + out.join(",") + indent + "}";
          }
        }({ "": obj }, "", obj, 0);
      };
      var isArray$2 = Array.isArray || function(x) {
        return {}.toString.call(x) === "[object Array]";
      };
      var objectKeys = Object.keys || function(obj) {
        var has = Object.prototype.hasOwnProperty || function() {
          return true;
        };
        var keys = [];
        for (var key in obj) {
          if (has.call(obj, key)) keys.push(key);
        }
        return keys;
      };
      var { BuiltinError } = error;
      var fromNow$1 = fromNow$2;
      var {
        isString: isString$1,
        isNumber: isNumber$1,
        isBool: isBool$1,
        isInteger,
        isArray: isArray$1,
        isObject: isObject$1,
        isNull,
        isFunction: isFunction$1
      } = typeUtils;
      let types = {
        string: isString$1,
        number: isNumber$1,
        integer: isInteger,
        boolean: isBool$1,
        array: isArray$1,
        object: isObject$1,
        null: isNull,
        function: isFunction$1
      };
      let builtinError = (builtin) => new BuiltinError(`invalid arguments to ${builtin}`);
      var builtins = (context) => {
        let builtins2 = {};
        let define2 = (name, context2, {
          argumentTests = [],
          minArgs = false,
          variadic = null,
          needsContext = false,
          invoke
        }) => {
          context2[name] = (...args) => {
            let ctx = args.shift();
            if (!variadic && args.length < argumentTests.length) {
              throw builtinError(`builtin: ${name}`, `${args.toString()}, too few arguments`);
            }
            if (minArgs && args.length < minArgs) {
              throw builtinError(`builtin: ${name}: expected at least ${minArgs} arguments`);
            }
            if (variadic) {
              argumentTests = args.map((_, i) => i < argumentTests.length ? argumentTests[i] : variadic);
            }
            args.forEach((arg, i) => {
              if (!argumentTests[i].split("|").some((test) => types[test](arg))) {
                throw builtinError(`builtin: ${name}`, `argument ${i + 1} to be ${argumentTests[i]} found ${typeof arg}`);
              }
            });
            if (needsContext)
              return invoke(ctx, ...args);
            return invoke(...args);
          };
          context2[name].jsone_builtin = true;
          return context2[name];
        };
        ["max", "min"].forEach((name) => {
          if (Math[name] == void 0) {
            throw new Error(`${name} in Math undefined`);
          }
          define2(name, builtins2, {
            minArgs: 1,
            variadic: "number",
            invoke: (...args) => Math[name](...args)
          });
        });
        ["sqrt", "ceil", "floor", "abs"].forEach((name) => {
          if (Math[name] == void 0) {
            throw new Error(`${name} in Math undefined`);
          }
          define2(name, builtins2, {
            argumentTests: ["number"],
            invoke: (num) => Math[name](num)
          });
        });
        define2("range", builtins2, {
          minArgs: 2,
          argumentTests: ["integer", "integer", "integer"],
          variadic: "number",
          invoke: (start, stop, step = 1) => {
            return Array.from(
              { length: Math.ceil((stop - start) / step) },
              (_, i) => start + i * step
            );
          }
        });
        define2("lowercase", builtins2, {
          argumentTests: ["string"],
          invoke: (str) => str.toLowerCase()
        });
        define2("uppercase", builtins2, {
          argumentTests: ["string"],
          invoke: (str) => str.toUpperCase()
        });
        define2("str", builtins2, {
          argumentTests: ["string|number|boolean|null"],
          invoke: (obj) => {
            if (obj === null) {
              return "null";
            }
            return obj.toString();
          }
        });
        define2("number", builtins2, {
          argumentTests: ["string"],
          invoke: Number
        });
        define2("len", builtins2, {
          argumentTests: ["string|array"],
          invoke: (obj) => Array.from(obj).length
        });
        define2("strip", builtins2, {
          argumentTests: ["string"],
          invoke: (str) => str.trim()
        });
        define2("rstrip", builtins2, {
          argumentTests: ["string"],
          invoke: (str) => str.replace(/\s+$/, "")
        });
        define2("lstrip", builtins2, {
          argumentTests: ["string"],
          invoke: (str) => str.replace(/^\s+/, "")
        });
        define2("split", builtins2, {
          minArgs: 2,
          argumentTests: ["string", "string|number"],
          invoke: (input, delimiter) => input.split(delimiter)
        });
        define2("join", builtins2, {
          argumentTests: ["array", "string|number"],
          invoke: (list, separator) => list.join(separator)
        });
        define2("fromNow", builtins2, {
          variadic: "string",
          minArgs: 1,
          needsContext: true,
          invoke: (ctx, str, reference) => fromNow$1(str, reference || ctx.now)
        });
        define2("typeof", builtins2, {
          argumentTests: ["string|number|boolean|array|object|null|function"],
          invoke: (x) => {
            for (let type of ["string", "number", "boolean", "array", "object", "function"]) {
              if (types[type](x)) {
                return type;
              }
            }
            if (types["null"](x)) {
              return "null";
            }
            throw builtinError("builtin: typeof");
          }
        });
        define2("defined", builtins2, {
          argumentTests: ["string"],
          needsContext: true,
          invoke: (ctx, str) => ctx.hasOwnProperty(str)
        });
        return Object.assign({}, builtins2, context);
      };
      const { Parser } = parser;
      const Tokenizer = tokenizer$1;
      const { Interpreter } = interpreter;
      var fromNow = fromNow$2;
      var stringify = jsonStableStringifyWithoutJsonify;
      var {
        isString,
        isNumber,
        isBool,
        isArray,
        isObject,
        isTruthy,
        isFunction
      } = typeUtils;
      var addBuiltins = builtins;
      var { JSONTemplateError, TemplateError, SyntaxError } = error;
      let syntaxRuleError = (token) => {
        return new SyntaxError(`Found: ${token.value} token, expected one of: !=, &&, (, *, **, +, -, ., /, <, <=, ==, >, >=, [, in, ||`);
      };
      function checkUndefinedProperties(template, allowed) {
        var unknownKeys = "";
        var combined = new RegExp(allowed.join("|") + "$");
        for (var key of Object.keys(template).sort()) {
          if (!combined.test(key)) {
            unknownKeys += " " + key;
          }
        }
        if (unknownKeys) {
          throw new TemplateError(allowed[0].replace("\\", "") + " has undefined properties:" + unknownKeys);
        }
      }
      let flattenDeep = (a) => {
        return Array.isArray(a) ? [].concat(...a.map(flattenDeep)) : a;
      };
      let interpolate = (string, context) => {
        let result = "";
        let remaining = string;
        let offset;
        while ((offset = remaining.search(/\$?\${/g)) !== -1) {
          result += remaining.slice(0, offset);
          if (remaining[offset + 1] != "$") {
            let v = parseUntilTerminator(remaining.slice(offset + 2), "}", context);
            if (isArray(v.result) || isObject(v.result)) {
              let input = remaining.slice(offset + 2, offset + v.offset);
              throw new TemplateError(`interpolation of '${input}' produced an array or object`);
            }
            if (v.result === null) {
              result += "";
            } else {
              result += v.result.toString();
            }
            remaining = remaining.slice(offset + v.offset + 1);
          } else {
            result += "${";
            remaining = remaining.slice(offset + 3);
          }
        }
        result += remaining;
        return result;
      };
      let deleteMarker = {};
      let operators = {};
      operators.$eval = (template, context) => {
        checkUndefinedProperties(template, ["\\$eval"]);
        if (!isString(template["$eval"])) {
          throw new TemplateError("$eval must be given a string expression");
        }
        return parse(template["$eval"], context);
      };
      operators.$flatten = (template, context) => {
        checkUndefinedProperties(template, ["\\$flatten"]);
        let value = render(template["$flatten"], context);
        if (!isArray(value)) {
          throw new TemplateError("$flatten value must evaluate to an array");
        }
        return value.reduce((a, b) => a.concat(b), []);
      };
      operators.$flattenDeep = (template, context) => {
        checkUndefinedProperties(template, ["\\$flattenDeep"]);
        let value = render(template["$flattenDeep"], context);
        if (!isArray(value)) {
          throw new TemplateError("$flattenDeep value must evaluate to an array");
        }
        return flattenDeep(value);
      };
      operators.$fromNow = (template, context) => {
        checkUndefinedProperties(template, ["\\$fromNow", "from"]);
        let value = render(template["$fromNow"], context);
        let reference = context.now;
        if (template["from"]) {
          reference = render(template["from"], context);
        }
        if (!isString(value)) {
          throw new TemplateError("$fromNow expects a string");
        }
        return fromNow(value, reference);
      };
      operators.$if = (template, context) => {
        checkUndefinedProperties(template, ["\\$if", "then", "else"]);
        if (!isString(template["$if"])) {
          throw new TemplateError("$if can evaluate string expressions only");
        }
        if (isTruthy(parse(template["$if"], context))) {
          if (template.hasOwnProperty("$then")) {
            throw new TemplateError("$if Syntax error: $then: should be spelled then: (no $)");
          }
          return template.hasOwnProperty("then") ? render(template.then, context) : deleteMarker;
        }
        return template.hasOwnProperty("else") ? render(template.else, context) : deleteMarker;
      };
      operators.$json = (template, context) => {
        checkUndefinedProperties(template, ["\\$json"]);
        const rendered = render(template["$json"], context);
        if (containsFunctions(rendered)) {
          throw new TemplateError("evaluated template contained uncalled functions");
        }
        return stringify(rendered);
      };
      operators.$let = (template, context) => {
        checkUndefinedProperties(template, ["\\$let", "in"]);
        if (!isObject(template["$let"])) {
          throw new TemplateError("$let value must be an object");
        }
        let variables = {};
        let initialResult = render(template["$let"], context);
        if (!isObject(initialResult)) {
          throw new TemplateError("$let value must be an object");
        }
        Object.keys(initialResult).forEach((key) => {
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
            throw new TemplateError("top level keys of $let must follow /[a-zA-Z_][a-zA-Z0-9_]*/");
          } else {
            variables[key] = initialResult[key];
          }
        });
        var child_context = Object.assign({}, context, variables);
        if (template.in == void 0) {
          throw new TemplateError("$let operator requires an `in` clause");
        }
        return render(template.in, child_context);
      };
      operators.$map = (template, context) => {
        const EACH_RE = "each\\(([a-zA-Z_][a-zA-Z0-9_]*)(,\\s*([a-zA-Z_][a-zA-Z0-9_]*))?\\)";
        checkUndefinedProperties(template, ["\\$map", EACH_RE]);
        let value = render(template["$map"], context);
        if (!isArray(value) && !isObject(value)) {
          throw new TemplateError("$map value must evaluate to an array or object");
        }
        if (Object.keys(template).length !== 2) {
          throw new TemplateError("$map must have exactly two properties");
        }
        let eachKey = Object.keys(template).filter((k) => k !== "$map")[0];
        let match = /^each\(([a-zA-Z_][a-zA-Z0-9_]*)(,\s*([a-zA-Z_][a-zA-Z0-9_]*))?\)$/.exec(eachKey);
        if (!match) {
          throw new TemplateError("$map requires each(identifier) syntax");
        }
        let x = match[1];
        let i = match[3];
        let each = template[eachKey];
        let object = isObject(value);
        if (object) {
          value = Object.keys(value).map((key) => ({ key, val: value[key] }));
          let eachValue;
          value = value.map((v) => {
            let args = typeof i !== "undefined" ? { [x]: v.val, [i]: v.key } : { [x]: v };
            eachValue = render(each, Object.assign({}, context, args));
            if (!isObject(eachValue)) {
              throw new TemplateError(`$map on objects expects each(${x}) to evaluate to an object`);
            }
            return eachValue;
          }).filter((v) => v !== deleteMarker);
          return Object.assign({}, ...value);
        } else {
          return value.map((v, idx) => {
            let args = typeof i !== "undefined" ? { [x]: v, [i]: idx } : { [x]: v };
            return render(each, Object.assign({}, context, args));
          }).filter((v) => v !== deleteMarker);
        }
      };
      operators.$reduce = (template, context) => {
        const EACH_RE = "each\\(([a-zA-Z_][a-zA-Z0-9_]*),\\s*([a-zA-Z_][a-zA-Z0-9_]*)(,\\s*([a-zA-Z_][a-zA-Z0-9_]*))?\\)";
        checkUndefinedProperties(template, ["\\$reduce", "initial", EACH_RE]);
        let value = render(template["$reduce"], context);
        if (!isArray(value)) {
          throw new TemplateError("$reduce value must evaluate to an array");
        }
        if (Object.keys(template).length !== 3) {
          throw new TemplateError("$reduce must have exactly three properties");
        }
        let eachKey = Object.keys(template).find((k) => k !== "$reduce" && k !== "initial");
        let match = /^each\(([a-zA-Z_][a-zA-Z0-9_]*),\s*([a-zA-Z_][a-zA-Z0-9_]*)(,\s*([a-zA-Z_][a-zA-Z0-9_]*))?\)$/.exec(eachKey);
        if (!match) {
          throw new TemplateError("$reduce requires each(identifier) syntax");
        }
        let a = match[1];
        let x = match[2];
        let i = match[4];
        let each = template[eachKey];
        let initialValue = template["initial"];
        return value.reduce((acc, v, idx) => {
          const args = typeof i !== "undefined" ? { [a]: acc, [x]: v, [i]: idx } : { [a]: acc, [x]: v };
          const r = render(each, Object.assign({}, context, args));
          return r === deleteMarker ? acc : r;
        }, initialValue);
      };
      operators.$find = (template, context) => {
        const EACH_RE = "each\\(([a-zA-Z_][a-zA-Z0-9_]*)(,\\s*([a-zA-Z_][a-zA-Z0-9_]*))?\\)";
        checkUndefinedProperties(template, ["\\$find", EACH_RE]);
        let value = render(template["$find"], context);
        if (!isArray(value)) {
          throw new TemplateError("$find value must evaluate to an array");
        }
        if (Object.keys(template).length !== 2) {
          throw new TemplateError("$find must have exactly two properties");
        }
        let eachKey = Object.keys(template).filter((k) => k !== "$find")[0];
        let match = /^each\(([a-zA-Z_][a-zA-Z0-9_]*)(,\s*([a-zA-Z_][a-zA-Z0-9_]*))?\)$/.exec(eachKey);
        if (!match) {
          throw new TemplateError("$find requires each(identifier) syntax");
        }
        if (!isString(template[eachKey])) {
          throw new TemplateError("each can evaluate string expressions only");
        }
        let x = match[1];
        let i = match[3];
        let each = template[eachKey];
        const result = value.find((v, idx) => {
          let args = typeof i !== "undefined" ? { [x]: v, [i]: idx } : { [x]: v };
          if (isTruthy(parse(each, Object.assign({}, context, args)))) {
            return render(each, Object.assign({}, context, args));
          }
        });
        return result !== void 0 ? result : deleteMarker;
      };
      operators.$match = (template, context) => {
        checkUndefinedProperties(template, ["\\$match"]);
        if (!isObject(template["$match"])) {
          throw new TemplateError("$match can evaluate objects only");
        }
        const result = [];
        const conditions = template["$match"];
        for (let condition of Object.keys(conditions).sort()) {
          if (isTruthy(parse(condition, context))) {
            result.push(render(conditions[condition], context));
          }
        }
        return result;
      };
      operators.$switch = (template, context) => {
        checkUndefinedProperties(template, ["\\$switch"]);
        if (!isObject(template["$switch"])) {
          throw new TemplateError("$switch can evaluate objects only");
        }
        let result = [];
        const conditions = template["$switch"];
        for (let condition of Object.keys(conditions).filter((k) => k !== "$default").sort()) {
          if (isTruthy(parse(condition, context))) {
            result.push(render(conditions[condition], context));
          }
        }
        if (result.length > 1) {
          throw new TemplateError("$switch can only have one truthy condition");
        }
        if (result.length === 0 && conditions["$default"]) {
          result.push(render(conditions["$default"], context));
        }
        return result.length > 0 ? result[0] : deleteMarker;
      };
      operators.$merge = (template, context) => {
        checkUndefinedProperties(template, ["\\$merge"]);
        let value = render(template["$merge"], context);
        if (!isArray(value) || value.some((o) => !isObject(o))) {
          throw new TemplateError("$merge value must evaluate to an array of objects");
        }
        return Object.assign({}, ...value);
      };
      operators.$mergeDeep = (template, context) => {
        checkUndefinedProperties(template, ["\\$mergeDeep"]);
        let value = render(template["$mergeDeep"], context);
        if (!isArray(value) || value.some((o) => !isObject(o))) {
          throw new TemplateError("$mergeDeep value must evaluate to an array of objects");
        }
        if (value.length === 0) {
          return {};
        }
        let merge = (l, r) => {
          if (isArray(l) && isArray(r)) {
            return l.concat(r);
          }
          if (isObject(l) && isObject(r)) {
            let res = Object.assign({}, l);
            for (let p in r) {
              if (p in l) {
                res[p] = merge(l[p], r[p]);
              } else {
                res[p] = r[p];
              }
            }
            return res;
          }
          return r;
        };
        return value.reduce(merge, value.shift());
      };
      operators.$reverse = (template, context) => {
        checkUndefinedProperties(template, ["\\$reverse"]);
        let value = render(template["$reverse"], context);
        if (!isArray(value)) {
          throw new TemplateError("$reverse value must evaluate to an array of objects");
        }
        return value.reverse();
      };
      operators.$sort = (template, context) => {
        const BY_RE = "by\\(([a-zA-Z_][a-zA-Z0-9_]*)\\)";
        checkUndefinedProperties(template, ["\\$sort", BY_RE]);
        let value = render(template["$sort"], context);
        if (!isArray(value)) {
          throw new TemplateError("$sorted values to be sorted must have the same type");
        }
        let byKey = Object.keys(template).filter((k) => k !== "$sort")[0];
        let match = /^by\(([a-zA-Z_][a-zA-Z0-9_]*)\)$/.exec(byKey);
        let by;
        if (match) {
          let contextClone = Object.assign({}, context);
          let x = match[1];
          let byExpr = template[byKey];
          by = (value2) => {
            contextClone[x] = value2;
            return parse(byExpr, contextClone);
          };
        } else {
          let needBy = value.some((v) => isArray(v) || isObject(v));
          if (needBy) {
            throw new TemplateError("$sorted values to be sorted must have the same type");
          }
          by = (value2) => value2;
        }
        let tagged = value.map((e) => [by(e), e]);
        if (tagged.length > 0) {
          let eltType = typeof tagged[0][0];
          if (eltType !== "number" && eltType !== "string" || tagged.some((e) => eltType !== typeof e[0])) {
            throw new TemplateError("$sorted values to be sorted must have the same type");
          }
        }
        return tagged.sort((a, b) => {
          a = a[0];
          b = b[0];
          if (a < b) {
            return -1;
          }
          if (a > b) {
            return 1;
          }
          return 0;
        }).map((e) => e[1]);
      };
      let render = (template, context) => {
        if (isNumber(template) || isBool(template) || template === null) {
          return template;
        }
        if (isString(template)) {
          return interpolate(template, context);
        }
        if (isArray(template)) {
          return template.map((v, i) => {
            try {
              return render(v, context);
            } catch (err) {
              if (err instanceof JSONTemplateError) {
                err.add_location(`[${i}]`);
              }
              throw err;
            }
          }).filter((v) => v !== deleteMarker);
        }
        let matches = Object.keys(operators).filter((c) => template.hasOwnProperty(c));
        if (matches.length > 1) {
          throw new TemplateError("only one operator allowed");
        }
        if (matches.length === 1) {
          return operators[matches[0]](template, context);
        }
        let result = {};
        for (let key of Object.keys(template)) {
          let value;
          try {
            value = render(template[key], context);
          } catch (err) {
            if (err instanceof JSONTemplateError) {
              if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
                err.add_location(`.${key}`);
              } else {
                err.add_location(`[${JSON.stringify(key)}]`);
              }
            }
            throw err;
          }
          if (value !== deleteMarker) {
            if (key.startsWith("$$")) {
              key = key.substr(1);
            } else if (/^\$[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
              throw new TemplateError("$<identifier> is reserved; use $$<identifier>");
            } else {
              key = interpolate(key, context);
            }
            result[key] = value;
          }
        }
        return result;
      };
      let tokenizer = new Tokenizer({
        ignore: "\\s+",
        // ignore all whitespace including \n
        patterns: {
          number: "[0-9]+(?:\\.[0-9]+)?",
          identifier: "[a-zA-Z_][a-zA-Z_0-9]*",
          string: `'[^']*'|"[^"]*"`,
          // avoid matching these as prefixes of identifiers e.g., `insinutations`
          true: "true(?![a-zA-Z_0-9])",
          false: "false(?![a-zA-Z_0-9])",
          in: "in(?![a-zA-Z_0-9])",
          null: "null(?![a-zA-Z_0-9])"
        },
        tokens: [
          "**",
          ..."+-*/[].(){}:,".split(""),
          ">=",
          "<=",
          "<",
          ">",
          "==",
          "!=",
          "!",
          "&&",
          "||",
          "true",
          "false",
          "in",
          "null",
          "number",
          "identifier",
          "string"
        ]
      });
      let parse = (source, context) => {
        let parser2 = new Parser(tokenizer, source);
        let tree = parser2.parse();
        if (parser2.current_token != null) {
          throw syntaxRuleError(parser2.current_token);
        }
        let interpreter2 = new Interpreter(context);
        return interpreter2.interpret(tree);
      };
      let parseUntilTerminator = (source, terminator, context) => {
        let parser2 = new Parser(tokenizer, source);
        let tree = parser2.parse();
        let next = parser2.current_token;
        if (!next) {
          let errorLocation = source.length;
          throw new SyntaxError(
            "unterminated ${..} expression",
            { start: errorLocation, end: errorLocation }
          );
        } else if (next.kind !== terminator) {
          throw syntaxRuleError(next);
        }
        let interpreter2 = new Interpreter(context);
        let result = interpreter2.interpret(tree);
        return { result, offset: next.start + 2 };
      };
      let containsFunctions = (rendered) => {
        if (isFunction(rendered)) {
          return true;
        } else if (Array.isArray(rendered)) {
          return rendered.some(containsFunctions);
        } else if (typeof rendered === "object" && rendered !== null) {
          for (const key of Object.keys(rendered)) {
            if (containsFunctions(rendered[key])) {
              return true;
            }
          }
          return false;
        } else {
          return false;
        }
      };
      var src = (template, context = {}) => {
        if (!isObject(context)) {
          throw new TemplateError("context must be an object");
        }
        let test = Object.keys(context).every((v) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v));
        if (!test) {
          throw new TemplateError("top level keys of context must follow /[a-zA-Z_][a-zA-Z0-9_]*/");
        }
        context = addBuiltins(Object.assign({}, { now: fromNow("0 seconds") }, context));
        let result = render(template, context);
        if (result === deleteMarker) {
          return null;
        }
        if (containsFunctions(result)) {
          throw new TemplateError("evaluated template contained uncalled functions");
        }
        return result;
      };
      return src;
    });
  }
});

// engine2/stateTo2dRenderElements.js
var import_json_e = __toESM(require_dist(), 1);
var generateScreenBackgroundElement = ({
  elements,
  transitions,
  state,
  resources,
  screen
}) => {
  const newElements = elements.concat([
    {
      id: "bg-screen",
      type: "graphics",
      x1: 0,
      x2: screen.width,
      y1: 0,
      y2: screen.height,
      fill: screen.backgroundColor,
      clickEventName: "LeftClick",
      rightClickEventName: "RightClick",
      wheelEventName: "ScrollUp"
    }
  ]);
  return [newElements, transitions];
};
var addBackgrundOrCg = ({
  elements,
  transitions,
  state,
  resources,
  resolveFile
}) => {
  let newElements = elements.concat([]);
  let newTransitions = transitions.concat([]);
  if (state.background) {
    if (state.background.backgroundId) {
      const background = resources.backgrounds[state.background.backgroundId];
      newElements = newElements.concat([
        {
          id: "bg-cg",
          type: "sprite",
          x: 0,
          y: 0,
          url: resolveFile(background.fileId)
        }
      ]);
    }
    if (state.background.animations) {
      if (state.background.animations.in) {
        const animation = resources.animations[state.background.animations.in];
        newTransitions = newTransitions.concat([
          {
            id: "bg-cg-animation",
            type: "keyframes",
            event: "add",
            elementId: "bg-cg",
            animationProperties: animation.properties
          }
        ]);
      }
      if (state.background.animations.out) {
        const animation = resources.animations[state.background.animations.out];
        newTransitions = newTransitions.concat([
          {
            id: "bg-cg-animation-2",
            type: "keyframes",
            event: "remove",
            elementId: "bg-cg",
            animationProperties: animation.properties
          }
        ]);
      }
    }
  }
  return [newElements, newTransitions];
};
var addCharacters = ({
  elements,
  transitions,
  state,
  resources,
  resolveFile
}) => {
  let newElements = elements.concat([]);
  if (state.character) {
    const items = state.character.items;
    for (const item of items) {
      const { positionId, spriteParts } = item;
      const spritePartIds = spriteParts.map(({ spritePartId }) => spritePartId);
      const position = resources.positions[positionId];
      const characterContainer = {
        type: "container",
        id: `character-container-${item.id}`,
        x: position.x,
        y: position.y,
        xa: position.xa,
        ya: position.ya,
        anchor: position.anchor,
        children: []
      };
      const matchedSpriteParts = [];
      Object.entries(resources.characters).flatMap(([key, character]) => {
        const { spriteParts: spriteParts2 } = character;
        Object.entries(spriteParts2).map(([partId, part]) => {
          if (spritePartIds.includes(partId)) {
            matchedSpriteParts.push({
              partId,
              fileId: part.fileId
            });
          }
        });
      });
      for (const spritePart of matchedSpriteParts) {
        characterContainer.children.push({
          type: "sprite",
          id: `${item.id}-${spritePart.partId}`,
          url: resolveFile(spritePart.fileId)
        });
      }
      newElements.push(characterContainer);
    }
  }
  return [newElements, transitions];
};
var addVisuals = ({
  elements,
  transitions,
  state,
  resources,
  resolveFile
}) => {
  let newElements = elements.concat([]);
  let newTransitions = transitions.concat([]);
  if (state.visual) {
    const items = state.visual.items;
    for (const item of items) {
      if (item.visualId) {
        const visual = resources.visuals[item.visualId];
        const position = resources.positions[item.positionId];
        newElements = newElements.concat([
          {
            id: `visual-${item.id}`,
            type: "sprite",
            url: resolveFile(visual.fileId),
            x: position.x,
            y: position.y,
            xa: position.xa,
            ya: position.ya
          }
        ]);
      }
      if (item.animations) {
        if (item.animations.in) {
          const animation = resources.animations[item.animations.in];
          newTransitions = newTransitions.concat([
            {
              id: `${item.id}-animation`,
              type: "keyframes",
              event: "add",
              elementId: `visual-${item.id}`,
              animationProperties: animation.properties
            }
          ]);
        }
        if (item.animations.out) {
          const animation = resources.animations[item.animations.out];
          newTransitions = newTransitions.concat([
            {
              id: `${item.id}-animation-2`,
              type: "keyframes",
              event: "remove",
              elementId: `visual-${item.id}`,
              animationProperties: animation.properties
            }
          ]);
        }
      }
    }
  }
  return [newElements, newTransitions];
};
var addDialogue = ({ elements, transitions, state, ui, resources }) => {
  let newElements = elements.concat([]);
  if (state.dialogue) {
    const dialogueBoxScreen = ui.screens[state.dialogue.dialogueBoxId];
    let character;
    if (state.dialogue.characterId) {
      character = resources.characters[state.dialogue.characterId];
    }
    newElements = newElements.concat(
      (0, import_json_e.default)(dialogueBoxScreen.elements, {
        dialogue: {
          text: state.dialogue.text,
          character: {
            name: character?.name
          }
        }
      })
    );
  }
  return [newElements, transitions];
};
var addScreens = ({ elements, transitions, state, ui, resources, variables }) => {
  let newElements = elements.concat([]);
  if (state.screen) {
    const screen = ui.screens[state.screen.screenId];
    newElements = newElements.concat(
      (0, import_json_e.default)(screen.elements, {
        variables
      })
    );
  }
  return [newElements, transitions];
};
var addChoices = ({ elements, transitions, state, resources, ui }) => {
  let newElements = elements.concat([]);
  if (state.choices) {
    const screen = ui.screens[state.choices.choiceScreenId];
    newElements = newElements.concat(
      (0, import_json_e.default)(screen.elements, {
        choices: {
          items: state.choices.items
        }
      })
    );
  }
  return [newElements, transitions];
};
var generateRenderElements = ({
  state,
  resources,
  resolveFile,
  screen,
  ui,
  variables
}) => {
  let elements = [];
  let transitions = [];
  [elements, transitions] = generateScreenBackgroundElement({
    elements,
    transitions,
    state,
    resources,
    screen
  });
  [elements, transitions] = addBackgrundOrCg({
    elements,
    resolveFile,
    transitions,
    state,
    resources
  });
  [elements, transitions] = addCharacters({
    elements,
    transitions,
    state,
    resources,
    resolveFile
  });
  [elements, transitions] = addVisuals({
    elements,
    transitions,
    state,
    resources,
    resolveFile
  });
  [elements, transitions] = addDialogue({
    elements,
    transitions,
    state,
    resources,
    ui
  });
  [elements, transitions] = addScreens({
    elements,
    transitions,
    state,
    ui,
    resources,
    variables
  });
  [elements, transitions] = addChoices({
    elements,
    transitions,
    state,
    resources,
    ui
  });
  return {
    elements,
    transitions
  };
};
var stateTo2dRenderElements_default = generateRenderElements;

// engine2/actions.js
var nextStep = (payload, deps) => {
  if (deps.autoNext) {
    if (deps.autoNext.preventManual) {
      return;
    }
  }
  deps.stepManager.nextStep();
  const renderObject = deps.generateRender();
  if (renderObject) {
    deps.dispatchEvent("render", renderObject);
  }
};
var prevStep = (payload, deps) => {
  deps.stepManager.prevStep();
};
var goToSectionScene = (payload, deps) => {
  const { sectionId, sceneId } = payload;
  deps.stepManager.goToSectionScene(sectionId, sceneId);
  const renderObject = deps.generateRender();
  deps.dispatchEvent("render", renderObject);
};
var setRuntimeVariable = (payload, deps) => {
  Object.assign(deps.variables.runtime, payload);
  const renderObject = deps.generateRender();
  deps.dispatchEvent("render", renderObject);
};
var setPreset = (payload, deps) => {
  const preset = deps.vnData.presets[payload.presetId];
  deps.currentPreset = preset;
};
var actions_default = {
  nextStep,
  prevStep,
  goToSectionScene,
  setRuntimeVariable,
  setPreset
};

// engine/SeenSections.js
var SeenSections = class {
  /**
   *
   * Key is sectionId
   * Value is stepId
   *
   * if Value is true, then the whole section has been seen
   *
   * Example
   *
   * {
   *   "asdklfje": true,
   *   "asdklfje2": 'fkeljwl,
   * }
   */
  _seenSections = {};
  /**
   * Value is choiceId
   */
  _seenChoices = [];
  constructor(seenSections = {}) {
    this._seenSections = seenSections;
  }
  /**
   * Adds a section's step as seen
   * @param {*} sectionId
   * @param {*} stepId
   * @returns
   */
  addStepId(sectionId, stepId) {
    if (this._seenSections[sectionId] === true) {
      return;
    }
    this._seenSections[sectionId] = stepId;
  }
  /**
   * Check whether a secion's and step has been seen
   * @param {*} section
   * @param {*} stepId
   * @returns
   */
  isStepIdSeen(section, stepId) {
    if (this._seenSections[section.sectionId] === true) {
      return true;
    }
    const currentIndex = section.steps.findIndex((step) => step.id === stepId);
    const seenIndex = section.steps.findIndex(
      (step) => step.id === this._seenSections[section.sectionId]
    );
    return seenIndex >= currentIndex;
  }
  addChoice(choiceId) {
    if (this.isChoiceSeen(choiceId)) {
      return;
    }
    this._seenChoices.push(choiceId);
  }
  /**
   * Check whether a choice has been seen
   * @param {*} choiceId
   * @returns
   */
  isChoiceSeen(choiceId) {
    return this._seenChoices.includes(choiceId);
  }
};
var SeenSections_default = SeenSections;

// engine2/StepPointer.js
var StepPointer = class {
  /**
   * @type {string | undefined}
   */
  _sectionId;
  /**
   * @type {string | undefined}
   */
  _stepId;
  constructor() {
  }
  /**
   * Whether the pointer is pointing to a section and step
   * @returns {boolean}
   */
  get isActive() {
    return !!this._sectionId && !!this._stepId;
  }
  /**
   * Clears the pointer
   */
  clear() {
    this._sectionId = void 0;
    this._stepId = void 0;
  }
  /**
   * Sets the pointer
   * @param {string} sectionId
   * @param {string} stepId
   */
  set(sectionId, stepId) {
    this._sectionId = sectionId;
    this._stepId = stepId;
  }
};
var StepPointer_default = StepPointer;

// engine2/History.js
var History = class {
  /**
   * @type {HistorySection[]}
   */
  _historySections = [];
  /**
   * Index of the section that the user is currently in history mode
   * @type {number | undefined}
   */
  _historyModeSectionIndex = void 0;
  _lastStepId = void 0;
  setLastStepId(stepId) {
    this._lastStepId = stepId;
  }
  get lastStepId() {
    return this._lastStepId;
  }
  /**
   * @param {HistorySection[]} sections
   */
  constructor(sections) {
    this._historySections = sections;
  }
  /**
   * Returns current section id in history mode
   * @returns {string | undefined}
   */
  get historyModeSectionId() {
    if (this._historyModeSectionIndex === void 0) {
      return void 0;
    }
    return this._historySections[this._historyModeSectionIndex].sectionId;
  }
  clear() {
    this._historySections = [];
  }
  /**
   * Adds a section to the history
   * @param {HistorySection} historySection
   */
  addSection(historySection) {
    this._historySections.push(historySection);
  }
  /**
   * Clears the history mode index
   */
  clearHistoryModeIndex() {
    this._historyModeSectionIndex = void 0;
  }
  /**
   * Moves to the next section in history mode
   */
  nextSection() {
    if (this._historyModeSectionIndex === void 0) {
      return;
    }
    if (this._historyModeSectionIndex === this._historySections.length - 1) {
      return;
    }
    this._historyModeSectionIndex++;
  }
  /**
   * Moves to the previous section in history mode
   */
  previousSection() {
    if (this._historyModeSectionIndex === void 0) {
      return;
    }
    if (this._historyModeSectionIndex === 0) {
      return;
    }
    this._historyModeSectionIndex--;
  }
};
var History_default = History;

// engine2/StepManager.js
var StepManager = class {
  _vnData;
  /**
   * @type {Record<string, StepPointer>}
   * Step pointers for each mode
   */
  _stepPointers = {
    /**
     * Used for title screen and reading mode
     */
    read: new StepPointer_default(),
    /**
     * Used for menu screen
     */
    menu: new StepPointer_default(),
    /**
     * Used for history mode
     */
    history: new StepPointer_default()
  };
  _mode = "read";
  /**
   * @type {SeenSections}
   * All the sections seen by the user
   */
  _seenSections = new SeenSections_default();
  /**
   * @type {History}
   * All the history of the user
   */
  _history = new History_default([]);
  /**
   * @type {boolean}
   * Whether the engine is in auto mode
   */
  _autoMode = false;
  /**
   * @type {boolean}
   * Whether the engine is in skip mode
   */
  _skipMode = false;
  _skipModeInterval;
  constructor(vnData) {
    this._vnData = vnData;
    const initialIds = vnData.initialIds;
    this._stepPointers.read.set(initialIds.sectionId, initialIds.stepId);
  }
  nextStep = () => {
    const sectionSteps = this._vnData.getSectionSteps(this._stepPointers.read._sectionId);
    const currentStepIndex = sectionSteps.findIndex((step) => step.id === this._stepPointers.read._stepId);
    const nextStepIndex = currentStepIndex + 1;
    const nextStep2 = sectionSteps[nextStepIndex];
    if (nextStep2) {
      this._stepPointers.read.set(this._stepPointers.read._sectionId, nextStep2.id);
    }
  };
  getCurrentSteps = () => {
    const steps = this._vnData.getSectionSteps(this._stepPointers.read._sectionId);
    const currentStepIndex = steps.findIndex((step) => step.id === this._stepPointers.read._stepId);
    return steps.slice(0, currentStepIndex + 1);
  };
  goToSectionScene = (sectionId, sceneId) => {
    const steps = this._vnData.getSectionSteps(sectionId);
    if (sceneId) {
      this._stepPointers.read.set(sectionId, steps[0].id);
    } else {
      this._stepPointers.read.set(sectionId, steps[0].id);
    }
  };
};
var StepManager_default = StepManager;

// engine2/state.js
var applyState = (state, step) => {
  if (!step.actions) {
    return {};
  }
  if (step.actions.background) {
    if (step.actions.background) {
      state.background = step.actions.background;
    } else {
      delete state.background;
    }
  }
  if (step.actions.sfx) {
    state.sfx = step.actions.sfx;
  } else {
    if (state.sfx) {
      delete state.sfx;
    }
  }
  if (step.actions.bgm) {
    state.bgm = step.actions.bgm;
    if (step.actions.bgm.loop || step.actions.bgm.loop === void 0) {
      state.bgm.loop = true;
    } else {
      state.bgm.loop = false;
    }
  } else {
  }
  if (step.actions.visual) {
    state.visual = step.actions.visual;
    for (const item of state.visual.items) {
    }
  } else {
    if (state.visual) {
      state.visual.items = state.visual.items.filter(
        (visual) => !!visual.visualId
      );
    }
  }
  if (step.actions.dialogue) {
    state.dialogue = {
      ...state.dialogue,
      ...step.actions.dialogue
    };
    if (step.actions.dialogue.segments) {
      delete state.dialogue.text;
    }
    if (step.actions.dialogue.text) {
      delete state.dialogue.segments;
    }
    if (step.actions.dialogue.character) {
      if (!step.actions.dialogue.character.characterName) {
        delete state.dialogue.character.characterName;
      }
    }
    if (step.actions.dialogue.incremental) {
      if (!state.dialogue.texts) {
        state.dialogue.texts = [];
      }
      state.dialogue.texts.push({
        template: step.actions.dialogue.template,
        text: step.actions.dialogue.text
      });
    }
  }
  if (step.actions.character) {
    if (!state.character) {
      state.character = JSON.parse(JSON.stringify(step.actions.character));
    } else {
      for (const item of step.actions.character.items) {
        const accStateItemIndex = state.character.items.findIndex(
          (i) => i.id === item.id
        );
        if (accStateItemIndex !== -1) {
          state.character.items[accStateItemIndex] = {
            ...state.character.items[accStateItemIndex],
            ...item
          };
          if (!item.inAnimation) {
            delete state.character.items[accStateItemIndex].inAnimation;
          }
          if (!item.outAnimation) {
            delete state.character.items[accStateItemIndex].outAnimation;
          }
        } else {
          state.character.items.push(item);
        }
      }
      for (const item of state.character.items) {
        const foundCharacter = step.actions.character.items.find(
          (c) => c.id === item.id
        );
        if (foundCharacter) {
          if (!foundCharacter.inAnimation) {
            delete item.inAnimation;
          }
        } else {
          delete item.inAnimation;
        }
      }
    }
  }
  if (step.actions.animation) {
    state.animation = step.actions.animation;
  } else {
    if (state.animation) {
      delete state.animation;
    }
  }
  if (step.actions.screen) {
    state.screen = step.actions.screen;
  } else {
    if (state.screen) {
      delete state.screen;
    }
  }
  if (step.actions.choices) {
    state.choices = step.actions.choices;
  } else {
    if (state.choices) {
      delete state.choices;
    }
  }
  if (step.actions.cleanAll) {
    state = {};
  }
  if (step.actions.goToSectionScene) {
    state.goToSectionScene = step.actions.goToSectionScene;
  }
  return state;
};

// engine2/VnData.js
var VnData = class {
  constructor(data) {
    this.data = data;
  }
  get presets() {
    return this.data.presets;
  }
  get initialPreset() {
    return this.data.presets[this.data.story.initialPresetId];
  }
  get resources() {
    return this.data.resources;
  }
  get ui() {
    return this.data.ui;
  }
  get screen() {
    return this.data.screen;
  }
  get initialIds() {
    const initialScene = this.data.story.scenes[this.data.story.initialSceneId];
    const section = initialScene.sections[initialScene.initialSectionId];
    return {
      sceneId: initialScene.id,
      sectionId: initialScene.initialSectionId,
      stepId: section.steps[0].id
    };
  }
  getSectionSteps(sectionId) {
    const sections = Object.values(this.data.story.scenes).flatMap((scene) => {
      return Object.entries(scene.sections).map(([id, section]) => ({
        ...section,
        id
      }));
    });
    const currentSection = sections.find((section) => section.id === sectionId);
    return currentSection.steps;
  }
};
var VnData_default = VnData;

// engine2/engine.js
var Engine = class {
  constructor() {
  }
  vnData;
  deps;
  _ticker;
  init = (vnData, params) => {
    const { callback, ticker } = params;
    this._ticker = ticker;
    this.vnData = new VnData_default(vnData);
    this.deps = {
      stepManager: new StepManager_default(this.vnData),
      vnData: this.vnData,
      generateRender: this.generateRender,
      dispatchEvent: this.dispatchEvent,
      _dialogueContent: [],
      autoNext: void 0,
      variables: {
        runtime: {
          currentMenuTabId: "options"
        }
      },
      currentPreset: this.vnData.initialPreset
    };
    this.on = callback;
    const renderObject = this.generateRender();
    console.log("renderObject", renderObject);
    this.dispatchEvent("render", renderObject);
  };
  generateRender = () => {
    const steps = this.deps.stepManager.getCurrentSteps();
    const lastStep = steps[steps.length - 1];
    if (lastStep.autoNext) {
      this.deps.autoNext = lastStep.autoNext;
      let elapsedInMs = 0;
      let stepId = lastStep.id;
      const effect = (time) => {
        const currentSteps = this.deps.stepManager.getCurrentSteps();
        if (currentSteps[currentSteps.length - 1].id !== stepId) {
          this._ticker.remove(effect);
          this.deps.autoNext = void 0;
          return;
        }
        elapsedInMs += time.deltaMS;
        if (elapsedInMs >= this.deps.autoNext.delay) {
          this._ticker.remove(effect);
          this.deps.autoNext = void 0;
          this.handleAction("nextStep", {});
        }
      };
      this._ticker.add(effect);
    } else {
      this.deps.autoNext = void 0;
    }
    const state = steps.reduce(applyState, {});
    console.log("state", state);
    if (lastStep.actions.goToSectionScene) {
      this.handleAction("goToSectionScene", state.goToSectionScene);
      return;
    }
    if (lastStep.actions.preset) {
      this.handleAction("setPreset", lastStep.actions.preset);
    }
    const resources = this.vnData.resources;
    const resolveFile = (fileId) => {
      return `file:${fileId}`;
    };
    const result = stateTo2dRenderElements_default({
      state,
      resources,
      resolveFile,
      screen: this.vnData.screen,
      ui: this.vnData.ui,
      variables: this.deps.variables
    });
    return result;
  };
  // event from pixijs 2drender
  handleEvent = (event, payload) => {
    if (event === "Actions") {
      const { actions: actions2 } = payload;
      if (actions2.goToSectionScene) {
        this.handleAction("goToSectionScene", actions2.goToSectionScene);
      }
      if (actions2.setRuntimeVariable) {
        this.handleAction("setRuntimeVariable", actions2.setRuntimeVariable);
      }
      return;
    }
    const { currentPreset } = this.deps;
    const { eventsMap } = currentPreset;
    const matchedMap = eventsMap[event];
    if (!matchedMap) {
      return;
    }
    const { actions } = matchedMap;
    Object.keys(actions).forEach((action) => {
      const payload2 = actions[action];
      this.handleAction(action, payload2);
    });
  };
  handleAction = (action, payload) => {
    const foundAction = actions_default[action];
    if (!foundAction) {
      throw new Error(`Action ${action} not found`);
    }
    foundAction(payload, this.deps);
  };
  dispatchEvent = (event, payload) => {
    this.on(event, payload);
  };
};
var engine_default = Engine;
export {
  engine_default as default
};
