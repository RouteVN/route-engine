var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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
        var has2 = Object.prototype.hasOwnProperty || function() {
          return true;
        };
        var keys = [];
        for (var key in obj) {
          if (has2.call(obj, key)) keys.push(key);
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
        let each2 = template[eachKey];
        let object = isObject(value);
        if (object) {
          value = Object.keys(value).map((key) => ({ key, val: value[key] }));
          let eachValue;
          value = value.map((v) => {
            let args = typeof i !== "undefined" ? { [x]: v.val, [i]: v.key } : { [x]: v };
            eachValue = render(each2, Object.assign({}, context, args));
            if (!isObject(eachValue)) {
              throw new TemplateError(`$map on objects expects each(${x}) to evaluate to an object`);
            }
            return eachValue;
          }).filter((v) => v !== deleteMarker);
          return Object.assign({}, ...value);
        } else {
          return value.map((v, idx) => {
            let args = typeof i !== "undefined" ? { [x]: v, [i]: idx } : { [x]: v };
            return render(each2, Object.assign({}, context, args));
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
        let each2 = template[eachKey];
        let initialValue = template["initial"];
        return value.reduce((acc, v, idx) => {
          const args = typeof i !== "undefined" ? { [a]: acc, [x]: v, [i]: idx } : { [a]: acc, [x]: v };
          const r = render(each2, Object.assign({}, context, args));
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
        let each2 = template[eachKey];
        const result = value.find((v, idx) => {
          let args = typeof i !== "undefined" ? { [x]: v, [i]: idx } : { [x]: v };
          if (isTruthy(parse(each2, Object.assign({}, context, args)))) {
            return render(each2, Object.assign({}, context, args));
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

// node_modules/immer/dist/immer.mjs
var NOTHING = Symbol.for("immer-nothing");
var DRAFTABLE = Symbol.for("immer-draftable");
var DRAFT_STATE = Symbol.for("immer-state");
var errors = true ? [
  // All error codes, starting by 0:
  function(plugin) {
    return `The plugin for '${plugin}' has not been loaded into Immer. To enable the plugin, import and call \`enable${plugin}()\` when initializing your application.`;
  },
  function(thing) {
    return `produce can only be called on things that are draftable: plain objects, arrays, Map, Set or classes that are marked with '[immerable]: true'. Got '${thing}'`;
  },
  "This object has been frozen and should not be mutated",
  function(data) {
    return "Cannot use a proxy that has been revoked. Did you pass an object from inside an immer function to an async process? " + data;
  },
  "An immer producer returned a new value *and* modified its draft. Either return a new value *or* modify the draft.",
  "Immer forbids circular references",
  "The first or second argument to `produce` must be a function",
  "The third argument to `produce` must be a function or undefined",
  "First argument to `createDraft` must be a plain object, an array, or an immerable object",
  "First argument to `finishDraft` must be a draft returned by `createDraft`",
  function(thing) {
    return `'current' expects a draft, got: ${thing}`;
  },
  "Object.defineProperty() cannot be used on an Immer draft",
  "Object.setPrototypeOf() cannot be used on an Immer draft",
  "Immer only supports deleting array indices",
  "Immer only supports setting array indices and the 'length' property",
  function(thing) {
    return `'original' expects a draft, got: ${thing}`;
  }
  // Note: if more errors are added, the errorOffset in Patches.ts should be increased
  // See Patches.ts for additional errors
] : [];
function die(error, ...args) {
  if (true) {
    const e = errors[error];
    const msg = typeof e === "function" ? e.apply(null, args) : e;
    throw new Error(`[Immer] ${msg}`);
  }
  throw new Error(
    `[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`
  );
}
var getPrototypeOf = Object.getPrototypeOf;
function isDraft(value) {
  return !!value && !!value[DRAFT_STATE];
}
function isDraftable(value) {
  if (!value)
    return false;
  return isPlainObject(value) || Array.isArray(value) || !!value[DRAFTABLE] || !!value.constructor?.[DRAFTABLE] || isMap(value) || isSet(value);
}
var objectCtorString = Object.prototype.constructor.toString();
function isPlainObject(value) {
  if (!value || typeof value !== "object")
    return false;
  const proto = getPrototypeOf(value);
  if (proto === null) {
    return true;
  }
  const Ctor = Object.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  if (Ctor === Object)
    return true;
  return typeof Ctor == "function" && Function.toString.call(Ctor) === objectCtorString;
}
function each(obj, iter) {
  if (getArchtype(obj) === 0) {
    Reflect.ownKeys(obj).forEach((key) => {
      iter(key, obj[key], obj);
    });
  } else {
    obj.forEach((entry, index) => iter(index, entry, obj));
  }
}
function getArchtype(thing) {
  const state = thing[DRAFT_STATE];
  return state ? state.type_ : Array.isArray(thing) ? 1 : isMap(thing) ? 2 : isSet(thing) ? 3 : 0;
}
function has(thing, prop) {
  return getArchtype(thing) === 2 ? thing.has(prop) : Object.prototype.hasOwnProperty.call(thing, prop);
}
function set(thing, propOrOldValue, value) {
  const t = getArchtype(thing);
  if (t === 2)
    thing.set(propOrOldValue, value);
  else if (t === 3) {
    thing.add(value);
  } else
    thing[propOrOldValue] = value;
}
function is(x, y) {
  if (x === y) {
    return x !== 0 || 1 / x === 1 / y;
  } else {
    return x !== x && y !== y;
  }
}
function isMap(target) {
  return target instanceof Map;
}
function isSet(target) {
  return target instanceof Set;
}
function latest(state) {
  return state.copy_ || state.base_;
}
function shallowCopy(base, strict) {
  if (isMap(base)) {
    return new Map(base);
  }
  if (isSet(base)) {
    return new Set(base);
  }
  if (Array.isArray(base))
    return Array.prototype.slice.call(base);
  const isPlain = isPlainObject(base);
  if (strict === true || strict === "class_only" && !isPlain) {
    const descriptors = Object.getOwnPropertyDescriptors(base);
    delete descriptors[DRAFT_STATE];
    let keys = Reflect.ownKeys(descriptors);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const desc = descriptors[key];
      if (desc.writable === false) {
        desc.writable = true;
        desc.configurable = true;
      }
      if (desc.get || desc.set)
        descriptors[key] = {
          configurable: true,
          writable: true,
          // could live with !!desc.set as well here...
          enumerable: desc.enumerable,
          value: base[key]
        };
    }
    return Object.create(getPrototypeOf(base), descriptors);
  } else {
    const proto = getPrototypeOf(base);
    if (proto !== null && isPlain) {
      return { ...base };
    }
    const obj = Object.create(proto);
    return Object.assign(obj, base);
  }
}
function freeze(obj, deep = false) {
  if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj))
    return obj;
  if (getArchtype(obj) > 1) {
    obj.set = obj.add = obj.clear = obj.delete = dontMutateFrozenCollections;
  }
  Object.freeze(obj);
  if (deep)
    Object.entries(obj).forEach(([key, value]) => freeze(value, true));
  return obj;
}
function dontMutateFrozenCollections() {
  die(2);
}
function isFrozen(obj) {
  return Object.isFrozen(obj);
}
var plugins = {};
function getPlugin(pluginKey) {
  const plugin = plugins[pluginKey];
  if (!plugin) {
    die(0, pluginKey);
  }
  return plugin;
}
var currentScope;
function getCurrentScope() {
  return currentScope;
}
function createScope(parent_, immer_) {
  return {
    drafts_: [],
    parent_,
    immer_,
    // Whenever the modified draft contains a draft from another scope, we
    // need to prevent auto-freezing so the unowned draft can be finalized.
    canAutoFreeze_: true,
    unfinalizedDrafts_: 0
  };
}
function usePatchesInScope(scope, patchListener) {
  if (patchListener) {
    getPlugin("Patches");
    scope.patches_ = [];
    scope.inversePatches_ = [];
    scope.patchListener_ = patchListener;
  }
}
function revokeScope(scope) {
  leaveScope(scope);
  scope.drafts_.forEach(revokeDraft);
  scope.drafts_ = null;
}
function leaveScope(scope) {
  if (scope === currentScope) {
    currentScope = scope.parent_;
  }
}
function enterScope(immer2) {
  return currentScope = createScope(currentScope, immer2);
}
function revokeDraft(draft) {
  const state = draft[DRAFT_STATE];
  if (state.type_ === 0 || state.type_ === 1)
    state.revoke_();
  else
    state.revoked_ = true;
}
function processResult(result, scope) {
  scope.unfinalizedDrafts_ = scope.drafts_.length;
  const baseDraft = scope.drafts_[0];
  const isReplaced = result !== void 0 && result !== baseDraft;
  if (isReplaced) {
    if (baseDraft[DRAFT_STATE].modified_) {
      revokeScope(scope);
      die(4);
    }
    if (isDraftable(result)) {
      result = finalize(scope, result);
      if (!scope.parent_)
        maybeFreeze(scope, result);
    }
    if (scope.patches_) {
      getPlugin("Patches").generateReplacementPatches_(
        baseDraft[DRAFT_STATE].base_,
        result,
        scope.patches_,
        scope.inversePatches_
      );
    }
  } else {
    result = finalize(scope, baseDraft, []);
  }
  revokeScope(scope);
  if (scope.patches_) {
    scope.patchListener_(scope.patches_, scope.inversePatches_);
  }
  return result !== NOTHING ? result : void 0;
}
function finalize(rootScope, value, path) {
  if (isFrozen(value))
    return value;
  const state = value[DRAFT_STATE];
  if (!state) {
    each(
      value,
      (key, childValue) => finalizeProperty(rootScope, state, value, key, childValue, path)
    );
    return value;
  }
  if (state.scope_ !== rootScope)
    return value;
  if (!state.modified_) {
    maybeFreeze(rootScope, state.base_, true);
    return state.base_;
  }
  if (!state.finalized_) {
    state.finalized_ = true;
    state.scope_.unfinalizedDrafts_--;
    const result = state.copy_;
    let resultEach = result;
    let isSet2 = false;
    if (state.type_ === 3) {
      resultEach = new Set(result);
      result.clear();
      isSet2 = true;
    }
    each(
      resultEach,
      (key, childValue) => finalizeProperty(rootScope, state, result, key, childValue, path, isSet2)
    );
    maybeFreeze(rootScope, result, false);
    if (path && rootScope.patches_) {
      getPlugin("Patches").generatePatches_(
        state,
        path,
        rootScope.patches_,
        rootScope.inversePatches_
      );
    }
  }
  return state.copy_;
}
function finalizeProperty(rootScope, parentState, targetObject, prop, childValue, rootPath, targetIsSet) {
  if (childValue === targetObject)
    die(5);
  if (isDraft(childValue)) {
    const path = rootPath && parentState && parentState.type_ !== 3 && // Set objects are atomic since they have no keys.
    !has(parentState.assigned_, prop) ? rootPath.concat(prop) : void 0;
    const res = finalize(rootScope, childValue, path);
    set(targetObject, prop, res);
    if (isDraft(res)) {
      rootScope.canAutoFreeze_ = false;
    } else
      return;
  } else if (targetIsSet) {
    targetObject.add(childValue);
  }
  if (isDraftable(childValue) && !isFrozen(childValue)) {
    if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) {
      return;
    }
    finalize(rootScope, childValue);
    if ((!parentState || !parentState.scope_.parent_) && typeof prop !== "symbol" && Object.prototype.propertyIsEnumerable.call(targetObject, prop))
      maybeFreeze(rootScope, childValue);
  }
}
function maybeFreeze(scope, value, deep = false) {
  if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) {
    freeze(value, deep);
  }
}
function createProxyProxy(base, parent) {
  const isArray = Array.isArray(base);
  const state = {
    type_: isArray ? 1 : 0,
    // Track which produce call this is associated with.
    scope_: parent ? parent.scope_ : getCurrentScope(),
    // True for both shallow and deep changes.
    modified_: false,
    // Used during finalization.
    finalized_: false,
    // Track which properties have been assigned (true) or deleted (false).
    assigned_: {},
    // The parent draft state.
    parent_: parent,
    // The base state.
    base_: base,
    // The base proxy.
    draft_: null,
    // set below
    // The base copy with any updated values.
    copy_: null,
    // Called by the `produce` function.
    revoke_: null,
    isManual_: false
  };
  let target = state;
  let traps = objectTraps;
  if (isArray) {
    target = [state];
    traps = arrayTraps;
  }
  const { revoke, proxy } = Proxy.revocable(target, traps);
  state.draft_ = proxy;
  state.revoke_ = revoke;
  return proxy;
}
var objectTraps = {
  get(state, prop) {
    if (prop === DRAFT_STATE)
      return state;
    const source = latest(state);
    if (!has(source, prop)) {
      return readPropFromProto(state, source, prop);
    }
    const value = source[prop];
    if (state.finalized_ || !isDraftable(value)) {
      return value;
    }
    if (value === peek(state.base_, prop)) {
      prepareCopy(state);
      return state.copy_[prop] = createProxy(value, state);
    }
    return value;
  },
  has(state, prop) {
    return prop in latest(state);
  },
  ownKeys(state) {
    return Reflect.ownKeys(latest(state));
  },
  set(state, prop, value) {
    const desc = getDescriptorFromProto(latest(state), prop);
    if (desc?.set) {
      desc.set.call(state.draft_, value);
      return true;
    }
    if (!state.modified_) {
      const current2 = peek(latest(state), prop);
      const currentState = current2?.[DRAFT_STATE];
      if (currentState && currentState.base_ === value) {
        state.copy_[prop] = value;
        state.assigned_[prop] = false;
        return true;
      }
      if (is(value, current2) && (value !== void 0 || has(state.base_, prop)))
        return true;
      prepareCopy(state);
      markChanged(state);
    }
    if (state.copy_[prop] === value && // special case: handle new props with value 'undefined'
    (value !== void 0 || prop in state.copy_) || // special case: NaN
    Number.isNaN(value) && Number.isNaN(state.copy_[prop]))
      return true;
    state.copy_[prop] = value;
    state.assigned_[prop] = true;
    return true;
  },
  deleteProperty(state, prop) {
    if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
      state.assigned_[prop] = false;
      prepareCopy(state);
      markChanged(state);
    } else {
      delete state.assigned_[prop];
    }
    if (state.copy_) {
      delete state.copy_[prop];
    }
    return true;
  },
  // Note: We never coerce `desc.value` into an Immer draft, because we can't make
  // the same guarantee in ES5 mode.
  getOwnPropertyDescriptor(state, prop) {
    const owner = latest(state);
    const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
    if (!desc)
      return desc;
    return {
      writable: true,
      configurable: state.type_ !== 1 || prop !== "length",
      enumerable: desc.enumerable,
      value: owner[prop]
    };
  },
  defineProperty() {
    die(11);
  },
  getPrototypeOf(state) {
    return getPrototypeOf(state.base_);
  },
  setPrototypeOf() {
    die(12);
  }
};
var arrayTraps = {};
each(objectTraps, (key, fn) => {
  arrayTraps[key] = function() {
    arguments[0] = arguments[0][0];
    return fn.apply(this, arguments);
  };
});
arrayTraps.deleteProperty = function(state, prop) {
  if (isNaN(parseInt(prop)))
    die(13);
  return arrayTraps.set.call(this, state, prop, void 0);
};
arrayTraps.set = function(state, prop, value) {
  if (prop !== "length" && isNaN(parseInt(prop)))
    die(14);
  return objectTraps.set.call(this, state[0], prop, value, state[0]);
};
function peek(draft, prop) {
  const state = draft[DRAFT_STATE];
  const source = state ? latest(state) : draft;
  return source[prop];
}
function readPropFromProto(state, source, prop) {
  const desc = getDescriptorFromProto(source, prop);
  return desc ? `value` in desc ? desc.value : (
    // This is a very special case, if the prop is a getter defined by the
    // prototype, we should invoke it with the draft as context!
    desc.get?.call(state.draft_)
  ) : void 0;
}
function getDescriptorFromProto(source, prop) {
  if (!(prop in source))
    return void 0;
  let proto = getPrototypeOf(source);
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc)
      return desc;
    proto = getPrototypeOf(proto);
  }
  return void 0;
}
function markChanged(state) {
  if (!state.modified_) {
    state.modified_ = true;
    if (state.parent_) {
      markChanged(state.parent_);
    }
  }
}
function prepareCopy(state) {
  if (!state.copy_) {
    state.copy_ = shallowCopy(
      state.base_,
      state.scope_.immer_.useStrictShallowCopy_
    );
  }
}
var Immer2 = class {
  constructor(config) {
    this.autoFreeze_ = true;
    this.useStrictShallowCopy_ = false;
    this.produce = (base, recipe, patchListener) => {
      if (typeof base === "function" && typeof recipe !== "function") {
        const defaultBase = recipe;
        recipe = base;
        const self2 = this;
        return function curriedProduce(base2 = defaultBase, ...args) {
          return self2.produce(base2, (draft) => recipe.call(this, draft, ...args));
        };
      }
      if (typeof recipe !== "function")
        die(6);
      if (patchListener !== void 0 && typeof patchListener !== "function")
        die(7);
      let result;
      if (isDraftable(base)) {
        const scope = enterScope(this);
        const proxy = createProxy(base, void 0);
        let hasError = true;
        try {
          result = recipe(proxy);
          hasError = false;
        } finally {
          if (hasError)
            revokeScope(scope);
          else
            leaveScope(scope);
        }
        usePatchesInScope(scope, patchListener);
        return processResult(result, scope);
      } else if (!base || typeof base !== "object") {
        result = recipe(base);
        if (result === void 0)
          result = base;
        if (result === NOTHING)
          result = void 0;
        if (this.autoFreeze_)
          freeze(result, true);
        if (patchListener) {
          const p = [];
          const ip = [];
          getPlugin("Patches").generateReplacementPatches_(base, result, p, ip);
          patchListener(p, ip);
        }
        return result;
      } else
        die(1, base);
    };
    this.produceWithPatches = (base, recipe) => {
      if (typeof base === "function") {
        return (state, ...args) => this.produceWithPatches(state, (draft) => base(draft, ...args));
      }
      let patches, inversePatches;
      const result = this.produce(base, recipe, (p, ip) => {
        patches = p;
        inversePatches = ip;
      });
      return [result, patches, inversePatches];
    };
    if (typeof config?.autoFreeze === "boolean")
      this.setAutoFreeze(config.autoFreeze);
    if (typeof config?.useStrictShallowCopy === "boolean")
      this.setUseStrictShallowCopy(config.useStrictShallowCopy);
  }
  createDraft(base) {
    if (!isDraftable(base))
      die(8);
    if (isDraft(base))
      base = current(base);
    const scope = enterScope(this);
    const proxy = createProxy(base, void 0);
    proxy[DRAFT_STATE].isManual_ = true;
    leaveScope(scope);
    return proxy;
  }
  finishDraft(draft, patchListener) {
    const state = draft && draft[DRAFT_STATE];
    if (!state || !state.isManual_)
      die(9);
    const { scope_: scope } = state;
    usePatchesInScope(scope, patchListener);
    return processResult(void 0, scope);
  }
  /**
   * Pass true to automatically freeze all copies created by Immer.
   *
   * By default, auto-freezing is enabled.
   */
  setAutoFreeze(value) {
    this.autoFreeze_ = value;
  }
  /**
   * Pass true to enable strict shallow copy.
   *
   * By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
   */
  setUseStrictShallowCopy(value) {
    this.useStrictShallowCopy_ = value;
  }
  applyPatches(base, patches) {
    let i;
    for (i = patches.length - 1; i >= 0; i--) {
      const patch = patches[i];
      if (patch.path.length === 0 && patch.op === "replace") {
        base = patch.value;
        break;
      }
    }
    if (i > -1) {
      patches = patches.slice(i + 1);
    }
    const applyPatchesImpl = getPlugin("Patches").applyPatches_;
    if (isDraft(base)) {
      return applyPatchesImpl(base, patches);
    }
    return this.produce(
      base,
      (draft) => applyPatchesImpl(draft, patches)
    );
  }
};
function createProxy(value, parent) {
  const draft = isMap(value) ? getPlugin("MapSet").proxyMap_(value, parent) : isSet(value) ? getPlugin("MapSet").proxySet_(value, parent) : createProxyProxy(value, parent);
  const scope = parent ? parent.scope_ : getCurrentScope();
  scope.drafts_.push(draft);
  return draft;
}
function current(value) {
  if (!isDraft(value))
    die(10, value);
  return currentImpl(value);
}
function currentImpl(value) {
  if (!isDraftable(value) || isFrozen(value))
    return value;
  const state = value[DRAFT_STATE];
  let copy;
  if (state) {
    if (!state.modified_)
      return state.base_;
    state.finalized_ = true;
    copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_);
  } else {
    copy = shallowCopy(value, true);
  }
  each(copy, (key, childValue) => {
    set(copy, key, currentImpl(childValue));
  });
  if (state) {
    state.finalized_ = false;
  }
  return copy;
}
var immer = new Immer2();
var produce = immer.produce;
var produceWithPatches = immer.produceWithPatches.bind(
  immer
);
var setAutoFreeze = immer.setAutoFreeze.bind(immer);
var setUseStrictShallowCopy = immer.setUseStrictShallowCopy.bind(immer);
var applyPatches = immer.applyPatches.bind(immer);
var createDraft = immer.createDraft.bind(immer);
var finishDraft = immer.finishDraft.bind(immer);

// src/util.js
var createStore = (initialState, selectorsAndActions, options = {}) => {
  let state = structuredClone(initialState);
  const selectors = {};
  const actions = {};
  const {
    transformSelectorFirstArgument = (state2) => state2,
    transformActionFirstArgument = (state2) => state2
  } = options;
  for (const [name, func] of Object.entries(selectorsAndActions)) {
    if (name === "createInitialState") {
      continue;
    } else if (name.startsWith("select")) {
      selectors[name] = (...args) => func(transformSelectorFirstArgument(state), ...args);
    } else {
      actions[name] = (...args) => {
        const newState = produce(state, (draft) => func(transformActionFirstArgument(draft), ...args));
        state = newState;
      };
    }
  }
  return {
    ...selectors,
    ...actions
  };
};
var createSequentialActionsExecutor = (createInitialState5, actions) => {
  return (payloadOrPayloads) => {
    const initialState = createInitialState5();
    const payloads = Array.isArray(payloadOrPayloads) ? payloadOrPayloads : [payloadOrPayloads];
    return produce(initialState, (draft) => {
      payloads.forEach((payload) => {
        const actionsArray = Array.isArray(actions) ? actions : Object.values(actions);
        actionsArray.forEach((action) => {
          action(draft, payload);
        });
      });
    });
  };
};

// src/stores/constructPresentationState.js
var constructPresentationState_exports = {};
__export(constructPresentationState_exports, {
  applyAnimation: () => applyAnimation,
  applyBackground: () => applyBackground,
  applyBgm: () => applyBgm,
  applyCharacter: () => applyCharacter,
  applyChoices: () => applyChoices,
  applyCleanAll: () => applyCleanAll,
  applyDialogue: () => applyDialogue,
  applyScreen: () => applyScreen,
  applySfx: () => applySfx,
  applyVisual: () => applyVisual,
  createInitialState: () => createInitialState
});
var applyBackground = (state, instruction) => {
  if (instruction.background) {
    if (!instruction.background?.backgroundId) {
      delete state.background;
    } else {
      state.background = instruction.background;
    }
  }
};
var applySfx = (state, instruction) => {
  if (instruction.sfx) {
    state.sfx = instruction.sfx;
  } else if (state.sfx) {
    delete state.sfx;
  }
};
var applyBgm = (state, instruction) => {
  if (instruction.bgm) {
    state.bgm = {
      ...instruction.bgm,
      loop: instruction.bgm.loop || instruction.bgm.loop === void 0
    };
  }
};
var applyVisual = (state, instruction) => {
  if (instruction.visual) {
    state.visual = instruction.visual;
  }
};
var applyDialogue = (state, instruction) => {
  if (!instruction.dialogue) {
    return;
  }
  if (!state.dialogue) {
    state.dialogue = {};
  }
  Object.assign(state.dialogue, instruction.dialogue);
  if (instruction.dialogue.text) {
    delete state.dialogue.segments;
  }
  if (instruction.dialogue.character && !instruction.dialogue.character.characterName && state.dialogue.character) {
    delete state.dialogue.character.characterName;
  }
};
var applyCharacter = (state, instruction) => {
  if (!instruction.character) {
    return;
  }
  if (!state.character) {
    state.character = JSON.parse(JSON.stringify(instruction.character));
    return;
  }
  Object.assign(state.character, instruction.character);
  if (!state.character.items) {
    state.character.items = [];
  }
  for (let i = 0; i < state.character.items.length; i++) {
    const existingItem = state.character.items[i];
    const matchingItem = instruction.character.items.find(
      (item) => item.id === existingItem.id
    );
    if (!matchingItem) {
      delete existingItem.inAnimation;
    } else {
      Object.assign(existingItem, matchingItem);
      if (!matchingItem.inAnimation) {
        delete existingItem.inAnimation;
      }
      if (!matchingItem.outAnimation) {
        delete existingItem.outAnimation;
      }
    }
  }
  instruction.character.items.forEach((instructionItem) => {
    if (!state.character.items.some((item) => item.id === instructionItem.id)) {
      state.character.items.push(instructionItem);
    }
  });
};
var applyAnimation = (state, instruction) => {
  if (instruction.animation) {
    state.animation = instruction.animation;
  } else if (state.animation) {
    delete state.animation;
  }
};
var applyScreen = (state, instruction) => {
  if (instruction.screen) {
    state.screen = instruction.screen;
  } else if (state.screen) {
    delete state.screen;
  }
};
var applyChoices = (state, instruction) => {
  if (instruction.choices) {
    state.choices = instruction.choices;
  } else if (state.choices) {
    delete state.choices;
  }
};
var applyCleanAll = (state, instruction) => {
  if (instruction.cleanAll) {
    Object.keys(state).forEach((key) => {
      delete state[key];
    });
  }
};
var createInitialState = () => {
  return {};
};

// src/stores/constructRenderState.js
var import_json_e = __toESM(require_dist(), 1);
var createInitialState2 = () => {
  return {
    elements: [],
    transitions: []
  };
};
var generateScreenBackgroundElement = ({ elements, transitions }, { screen }) => {
  elements.push({
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
  });
};
var addBackgrundOrCg = ({ elements, transitions }, { template, resources, resolveFile }) => {
  if (template.background) {
    if (template.background.backgroundId) {
      const background = resources.backgrounds[template.background.backgroundId];
      elements.push({
        id: "bg-cg",
        type: "sprite",
        x: 0,
        y: 0,
        url: resolveFile(background.fileId)
      });
    }
    if (template.background.animations) {
      if (template.background.animations.in) {
        const animation = resources.animations[template.background.animations.in];
        transitions.push({
          id: "bg-cg-animation",
          type: "keyframes",
          event: "add",
          elementId: "bg-cg",
          animationProperties: animation.properties
        });
      }
      if (template.background.animations.out) {
        const animation = resources.animations[template.background.animations.out];
        transitions.push({
          id: "bg-cg-animation-2",
          type: "keyframes",
          event: "remove",
          elementId: "bg-cg",
          animationProperties: animation.properties
        });
      }
    }
  }
};
var addCharacters = ({ elements, transitions }, { template, resources, resolveFile }) => {
  if (template.character) {
    const items = template.character.items;
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
      elements.push(characterContainer);
    }
  }
};
var addVisuals = ({ elements, transitions }, { template, resources, resolveFile }) => {
  if (template.visual) {
    const items = template.visual.items;
    for (const item of items) {
      if (item.visualId) {
        const visual = resources.visuals[item.visualId];
        const position = resources.positions[item.positionId];
        elements.push({
          id: `visual-${item.id}`,
          type: "sprite",
          url: resolveFile(visual.fileId),
          x: position.x,
          y: position.y,
          xa: position.xa,
          ya: position.ya
        });
      }
      if (item.animations) {
        if (item.animations.in) {
          const animation = resources.animations[item.animations.in];
          transitions.push({
            id: `${item.id}-animation`,
            type: "keyframes",
            event: "add",
            elementId: `visual-${item.id}`,
            animationProperties: animation.properties
          });
        }
        if (item.animations.out) {
          const animation = resources.animations[item.animations.out];
          transitions.push({
            id: `${item.id}-animation-2`,
            type: "keyframes",
            event: "remove",
            elementId: `visual-${item.id}`,
            animationProperties: animation.properties
          });
        }
      }
    }
  }
};
var addDialogue = ({ elements, transitions }, { template, ui, resources, dialogueUIHidden }) => {
  if (!dialogueUIHidden && template.dialogue) {
    const dialogueBoxScreen = ui.screens[template.dialogue.dialogueBoxId];
    let character;
    if (template.dialogue.characterId) {
      character = resources.characters[template.dialogue.characterId];
    }
    const dialogueElements = (0, import_json_e.default)(dialogueBoxScreen.elements, {
      dialogue: {
        text: template.dialogue.text,
        character: {
          name: character?.name
        }
      }
    });
    elements.push(...dialogueElements);
  }
};
var addScreens = ({ elements, transitions }, { template, ui, variables }) => {
  console.log("variables", variables);
  if (template.screen) {
    const screen = ui.screens[template.screen.screenId];
    const screenElements = (0, import_json_e.default)(screen.elements, {
      variables
    });
    elements.push(...screenElements);
  }
};
var addChoices = ({ elements, transitions }, { template, resources, ui }) => {
  if (template.choices) {
    const screen = ui.screens[template.choices.choiceScreenId];
    const choiceElements = (0, import_json_e.default)(screen.elements, {
      choices: {
        items: template.choices.items
      }
    });
    elements.push(...choiceElements);
  }
};
var constructRenderState_default = [
  generateScreenBackgroundElement,
  addBackgrundOrCg,
  addCharacters,
  addVisuals,
  addDialogue,
  addScreens,
  addChoices
];

// src/stores/system.store.js
var system_store_exports = {};
__export(system_store_exports, {
  clearCurrentMode: () => clearCurrentMode,
  clearPendingEffects: () => clearPendingEffects,
  createInitialState: () => createInitialState3,
  goToSectionScene: () => goToSectionScene,
  loadVnData: () => loadVnData,
  nextStep: () => nextStep,
  prevStep: () => prevStep,
  saveVnData: () => saveVnData,
  selectAutoMode: () => selectAutoMode,
  selectAutoNext: () => selectAutoNext,
  selectCurrentPointer: () => selectCurrentPointer,
  selectCurrentPresetId: () => selectCurrentPresetId,
  selectDialogueUIHidden: () => selectDialogueUIHidden,
  selectHistory: () => selectHistory,
  selectPendingEffects: () => selectPendingEffects,
  selectPointerMode: () => selectPointerMode,
  selectPointers: () => selectPointers,
  selectRuntimeState: () => selectRuntimeState,
  selectSaveData: () => selectSaveData,
  selectSkipMode: () => selectSkipMode,
  selectSpecificPointer: () => selectSpecificPointer,
  selectVariables: () => selectVariables,
  setPreset: () => setPreset,
  startAutoMode: () => startAutoMode,
  startSkipMode: () => startSkipMode,
  stepCompleted: () => stepCompleted,
  stopAutoMode: () => stopAutoMode,
  stopSkipMode: () => stopSkipMode,
  toggleAutoMode: () => toggleAutoMode,
  toggleSkipMode: () => toggleSkipMode,
  updateVariable: () => updateVariable
});
var createInitialState3 = ({ sectionId, stepId, presetId, autoNext, saveData, variables }) => {
  const state = {
    pendingEffects: [],
    variables,
    saveData,
    story: {
      lastStepAction: void 0,
      dialogueUIHidden: false,
      currentPointer: "read",
      autoNext,
      autoMode: false,
      skipMode: false,
      pointers: {
        read: {
          presetId,
          sectionId,
          stepId
        },
        menu: {
          // TODO remove hardcode
          presetId: "3ijasdk3",
          sectionId: void 0,
          stepId: void 0
        },
        history: {
          presetId,
          sectionId: void 0,
          stepId: void 0,
          historyEntryIndex: void 0
        }
        // title: {
        //   presetId: undefined,
        //   sectionId: undefined,
        //   stepId: undefined
        // },
      },
      history: {
        entries: []
        // entries: [{
        //   sectionId: 'asdkjl32',
        // }, {
        //   sectionId: '3jd3kd'
        // }, {
        //   sectionId: '39fk32'
        // }, {
        //   sectionId: '39cksk3',
        //   // this is current actual stepId the user is lastest on
        //   stepId: 'step3'
        // }]
      }
    }
  };
  state.story.history.entries.push({
    sectionId
  });
  return state;
};
var selectPendingEffects = (state) => {
  return state.pendingEffects;
};
var selectCurrentPointer = (state) => {
  return state.story.pointers[state.story.currentPointer];
};
var selectCurrentPresetId = (state) => {
  return state.story.pointers[state.story.currentPointer].presetId;
};
var selectSkipMode = (state) => {
  return state.story.skipMode;
};
var selectAutoMode = (state) => {
  return state.story.autoMode;
};
var selectPointers = (state) => {
  return state.story.pointers;
};
var selectAutoNext = (state) => {
  return state.story.autoNext;
};
var selectRuntimeState = (state) => {
  return state.runtimeState;
};
var selectPointerMode = (state) => {
  return state.story.currentPointer;
};
var selectDialogueUIHidden = (state) => {
  return state.story.dialogueUIHidden;
};
var selectHistory = (state) => {
  return state.story.history;
};
var selectSpecificPointer = (state, mode) => {
  return state.story.pointers[mode];
};
var selectSaveData = (state) => {
  return state.saveData;
};
var selectVariables = (state) => {
  return state.variables;
};
var clearPendingEffects = ({ state }) => {
  state.pendingEffects = [];
};
var stepCompleted = ({ state, projectDataStore }) => {
  const autoMode = selectAutoMode(state);
  const { pendingEffects } = state;
  if (autoMode) {
    pendingEffects.push({
      name: "systemInstructions",
      options: {
        delay: 1e3,
        systemInstructions: {
          nextStep: {
            forceSkipAutonext: true
          }
        }
      }
    });
    return;
  }
  const skipMode = selectSkipMode(state);
  if (skipMode) {
    pendingEffects.push({
      name: "systemInstructions",
      options: {
        delay: 300,
        systemInstructions: {
          nextStep: {
            forceSkipAutonext: true
          }
        }
      }
    });
    return;
  }
  const autoNext = selectAutoNext(state);
  if (!autoNext) {
    return;
  }
  const { nextTrigger, delay } = autoNext;
  switch (nextTrigger) {
    case "onComplete":
      delete state.story.autoNext;
      break;
    case "fromComplete":
      pendingEffects.push({
        name: "systemInstructions",
        options: {
          delay,
          systemInstructions: {
            nextStep: {
              forceSkipAutonext: true
            }
          }
        }
      });
      break;
    case "manual":
      delete state.story.autoNext;
      break;
    default:
      delete state.story.autoNext;
      break;
  }
};
var nextStep = ({ state, projectDataStore }) => {
  const {
    pendingEffects
  } = state;
  const currentPointer = selectCurrentPointer(state);
  const pointerMode = selectPointerMode(state);
  const steps = projectDataStore.selectSectionSteps(
    currentPointer.sectionId
  );
  const currentStepIndex = steps.findIndex(
    (step) => step.id === currentPointer.stepId
  );
  const nextStep2 = steps[currentStepIndex + 1];
  console.log("cccccccccccc", nextStep2);
  if (!nextStep2) {
    return;
  }
  state.story.pointers[state.story.currentPointer].stepId = nextStep2.id;
  pendingEffects.push({
    name: "render"
  });
};
var prevStep = ({ state, projectDataStore }) => {
  const pointerMode = selectPointerMode(state);
  const currentPointer = selectCurrentPointer(state);
  const steps = projectDataStore.selectSectionSteps(
    currentPointer.sectionId
  );
  const currentStepIndex = steps.findIndex(
    (step) => step.id === currentPointer.stepId
  );
  const prevStep2 = steps[currentStepIndex - 1];
  if (!prevStep2) {
    console.log({
      pointerMode,
      "state.story.historyEntryIndex": state.story.historyEntryIndex
    });
    if (pointerMode === "history") {
      if (state.story.historyEntryIndex > 0) {
        state.story.historyEntryIndex--;
      } else {
        return;
      }
      console.log(
        "state.story.historyEntryIndex",
        state.story.historyEntryIndex
      );
      state.story.pointers["history"].sectionId = state.story.history.entries[state.story.historyEntryIndex].sectionId;
      const prevSectionSteps = vnDataSelectors.selectSectionSteps(
        vnData,
        systemState.story.pointers["history"].sectionId
      );
      console.log("prevSectionSteps", prevSectionSteps);
      systemState.story.pointers["history"].stepId = prevSectionSteps[prevSectionSteps.length - 1].id;
      console.log({
        stepId: systemState.story.pointers["history"].stepId,
        sectionId: systemState.story.pointers["history"].sectionId
      });
      systemState.story.lastStepAction = "prevStep";
      effects.push({
        name: "render"
      });
    }
    return;
  }
  if (pointerMode === "read") {
    systemState.story.currentPointer = "history";
    systemState.story.historyEntryIndex = systemState.story.history.entries.length - 1;
  }
  systemState.story.pointers["history"].stepId = prevStep2.id;
  systemState.story.pointers["history"].sectionId = currentPointer.sectionId;
  systemState.story.lastStepAction = "prevStep";
  effects.push({
    name: "render"
  });
};
var goToSectionScene = ({ payload, systemState: systemState2, effects: effects2, vnData: vnData2 }) => {
  const { sectionId, sceneId, mode, presetId } = payload;
  const steps = vnDataSelectors.selectSectionSteps(vnData2, sectionId);
  if (mode) {
    systemState2.story.currentPointer = mode;
  }
  const currentMode = systemStateSelectors.selectPointerMode(systemState2);
  if (currentMode === "read") {
    systemState2.story.history.entries.push({
      sectionId
    });
  } else if (currentMode === "history") {
    if (sectionId === systemState2.story.history.entries[systemState2.story.historyEntryIndex + 1].sectionId) {
      systemState2.story.historyEntryIndex++;
    } else {
    }
  }
  systemState2.story.pointers[currentMode].sectionId = sectionId;
  systemState2.story.pointers[currentMode].sceneId = sceneId;
  systemState2.story.pointers[currentMode].stepId = steps[0].id;
  systemState2.story.autoNext = steps[0].autoNext;
  if (presetId) {
    systemState2.story.pointers[currentMode].presetId = presetId;
  }
  effects2.push({
    name: "render"
  });
};
var updateVariable = ({ payload, systemState: systemState2, effects: effects2, vnData: vnData2 }) => {
  const { operations } = payload;
  for (const operation of operations) {
    const { variableId, op, value } = operation;
    if (op === "set") {
      systemState2.variables[variableId] = value;
    } else if (op === "increment") {
      systemState2.variables[variableId] += value;
    } else if (op === "decrement") {
      systemState2.variables[variableId] -= value;
    }
  }
  const vnDataVariables = vnDataSelectors.selectVariables(vnData2);
  const localVariableKeys = Object.keys(systemState2.variables).filter(
    (key) => vnDataVariables[key].persistence === "local"
  );
  const localVariables = localVariableKeys.reduce((acc, key) => {
    acc[key] = systemState2.variables[key];
    return acc;
  }, {});
  effects2.push({
    name: "render"
  });
  effects2.push({
    name: "updateLocalVariables",
    options: {
      variables: localVariables
    }
  });
};
var setPreset = ({ payload, systemState: systemState2, effects: effects2 }) => {
  systemState2.story.pointers[systemState2.story.currentPointer].presetId = payload.presetId;
};
var clearCurrentMode = ({ payload, systemState: systemState2, effects: effects2 }) => {
  systemState2.story.currentPointer = payload.mode;
  effects2.push({
    name: "render"
  });
};
var startAutoMode = ({ systemState: systemState2, effects: effects2 }) => {
  if (systemStateSelectors.selectSkipMode(systemState2)) {
    systemState2.story.skipMode = false;
  }
  systemState2.story.autoMode = true;
  effects2.push({
    name: "cancelTimerEffect"
  });
  effects2.push({
    name: "systemInstructions",
    options: {
      delay: 1e3,
      systemInstructions: {
        nextStep: {
          forceSkipAutonext: true
        }
      }
    }
  });
};
var stopAutoMode = ({ systemState: systemState2, effects: effects2 }) => {
  systemState2.story.autoMode = false;
  effects2.push({
    name: "cancelTimerEffect"
  });
};
var toggleAutoMode = ({ systemState: systemState2, effects: effects2 }) => {
  const autoMode = systemStateSelectors.selectAutoMode(systemState2);
  if (autoMode) {
    stopAutoMode({ systemState: systemState2, effects: effects2 });
  } else {
    startAutoMode({ systemState: systemState2, effects: effects2 });
  }
};
var startSkipMode = ({ systemState: systemState2, effects: effects2 }) => {
  if (systemStateSelectors.selectAutoMode(systemState2)) {
    systemState2.story.autoMode = false;
  }
  systemState2.story.skipMode = true;
  effects2.push({
    name: "cancelTimerEffect"
  });
  effects2.push({
    name: "systemInstructions",
    options: {
      delay: 300,
      systemInstructions: {
        nextStep: {
          forceSkipAutonext: true
        }
      }
    }
  });
};
var stopSkipMode = ({ systemState: systemState2, effects: effects2 }) => {
  systemState2.story.skipMode = false;
  effects2.push({
    name: "cancelTimerEffect"
  });
};
var toggleSkipMode = ({ systemState: systemState2, effects: effects2 }) => {
  const skipMode = systemStateSelectors.selectSkipMode(systemState2);
  if (skipMode) {
    stopSkipMode({ systemState: systemState2, effects: effects2 });
  } else {
    startSkipMode({ systemState: systemState2, effects: effects2 });
  }
};
var saveVnData = ({ systemState: systemState2, effects: effects2, payload }) => {
  systemState2.saveData.push({
    id: Date.now().toString().slice(4, 10),
    slotIndex: payload.slotIndex,
    pointer: systemStateSelectors.selectSpecificPointer(systemState2, "read"),
    history: systemStateSelectors.selectHistory(systemState2)
  });
  effects2.push({
    name: "saveVnData",
    options: {
      saveData: [...systemState2.saveData]
    }
  });
};
var loadVnData = ({ systemState: systemState2, effects: effects2, payload }) => {
  const { slotIndex } = payload;
  console.log("systemState.saveData", systemState2.saveData);
  const saveData = systemStateSelectors.selectSaveData(systemState2);
  const matchedSlotSaveData = saveData.filter(
    (save) => save.slotIndex === slotIndex
  );
  if (matchedSlotSaveData.length === 0) {
    console.warn(`No save data found for slot index ${slotIndex}`);
    return;
  }
  const { pointer, history } = matchedSlotSaveData[matchedSlotSaveData.length - 1];
  systemState2.story.currentPointer = "read";
  systemState2.story.pointers["read"] = pointer;
  systemState2.story.history = history;
  effects2.push({
    name: "render"
  });
};

// src/stores/projectData.store.js
var projectData_store_exports = {};
__export(projectData_store_exports, {
  createInitialState: () => createInitialState4,
  selectInitialIds: () => selectInitialIds,
  selectInitialPreset: () => selectInitialPreset,
  selectPreset: () => selectPreset,
  selectPresets: () => selectPresets,
  selectResources: () => selectResources,
  selectScreen: () => selectScreen,
  selectSectionSteps: () => selectSectionSteps,
  selectUi: () => selectUi,
  selectVariables: () => selectVariables2
});
var selectPresets = (state) => {
  return state.presets;
};
var selectInitialPreset = (state) => {
  return state.presets[state.story.initialPresetId];
};
var selectPreset = (state, presetId) => {
  return state.presets[presetId];
};
var selectResources = (state) => {
  return state.resources;
};
var selectUi = (state) => {
  return state.ui;
};
var selectScreen = (state) => {
  return state.screen;
};
var selectInitialIds = (state) => {
  const initialScene = state.story.scenes[state.story.initialSceneId];
  const initialSection = initialScene.sections[initialScene.initialSectionId];
  return {
    sceneId: state.story.initialSceneId,
    sectionId: initialScene.initialSectionId,
    presetId: state.story.initialPresetId,
    stepId: initialSection.steps[0].id,
    autoNext: initialSection.steps[0].autoNext
  };
};
var selectVariables2 = (state) => {
  return state.variables || {};
};
var selectSectionSteps = (state, sectionId, stepId) => {
  const sections = Object.values(state.story.scenes).flatMap((scene) => {
    return Object.entries(scene.sections).map(([id, section]) => ({
      ...section,
      id
    }));
  });
  const currentSection = sections.find((section) => section.id === sectionId);
  if (stepId) {
    const currentStepIndex = currentSection.steps.findIndex((step) => step.id === stepId);
    return currentSection.steps.slice(0, currentStepIndex + 1);
  }
  return currentSection.steps;
};
var createInitialState4 = (vnData2) => {
  const initialIds = selectInitialIds(vnData2);
  const { sectionId, stepId } = initialIds;
  if (!sectionId || !stepId) {
    throw new Error("No initial sectionId found");
  }
  return vnData2;
};

// src/RouteEngine.js
var {
  createInitialState: createConstructPresentationStateInitialState,
  ...constructPresentationStateSelectorsAndActions
} = constructPresentationState_exports;
var {
  createInitialState: createSystemInitialState,
  ...systemStateSelectorsAndActions
} = system_store_exports;
var {
  createInitialState: createProjectDataInitialState,
  ...projectDataSelectorsAndActions
} = projectData_store_exports;
var RouteEngine = class {
  _projectDataStore;
  _systemStore;
  _constructRenderState;
  _constructPresentationState;
  _applySystemInstruction;
  _eventCallback = (event) => {
  };
  constructor() {
  }
  /**
   * Initialize the engine with visual novel data and rendering functions
   */
  init = ({ projectData }) => {
    this._projectDataStore = createStore(
      projectData,
      projectDataSelectorsAndActions
    );
    const initialIds = this._projectDataStore.selectInitialIds();
    this._systemStore = createStore(
      createSystemInitialState({
        sectionId: initialIds.sectionId,
        stepId: initialIds.stepId,
        presetId: initialIds.presetId,
        autoNext: initialIds.autoNext,
        saveData: {},
        variables: {}
      }),
      systemStateSelectorsAndActions,
      {
        transformActionFirstArgument: (state) => ({
          state,
          projectDataStore: this._projectDataStore
        })
      }
    );
    this._constructRenderState = createSequentialActionsExecutor(
      createInitialState2,
      constructRenderState_default
    );
    this._constructPresentationState = createSequentialActionsExecutor(
      createConstructPresentationStateInitialState,
      constructPresentationStateSelectorsAndActions
    );
    this._render();
  };
  onEvent = (callback) => {
    this._eventCallback = callback;
    return this;
  };
  offEvent = () => {
    this._eventCallback = () => {
    };
    return this;
  };
  // /**
  //  * Handles delayed execution of system instructions
  //  */
  // handleDelayedExecution = (options, callback) => {
  //   const { delay } = options;
  //   if (!delay) {
  //     callback();
  //     return;
  //   }
  //   let elapsedInMs = 0;
  //   const timerEffect = (time) => {
  //     elapsedInMs += time.deltaMS;
  //     if (elapsedInMs >= delay) {
  //       this._ticker.remove(timerEffect);
  //       callback();
  //     }
  //   };
  //   this._ticker.add(timerEffect);
  //   this._currentTimerEffect = timerEffect;
  // };
  // cancelTimerEffect = () => {
  //   if (this._currentTimerEffect) {
  //     this._ticker.remove(this._currentTimerEffect);
  //     this._currentTimerEffect = undefined;
  //   }
  // };
  /**
   * Use this for sending events to the engine
   */
  handleEvent = (event) => {
    const { eventType, payload } = event;
    const eventTypeToInstructionMap = {
      LeftClick: "nextStep"
    };
    const instructionType = eventTypeToInstructionMap[eventType];
    console.log("aaaaaaaaaaaa", {
      instructionType,
      payload
    });
    this._systemStore[instructionType](payload);
    const pendingEffects = this._systemStore.selectPendingEffects();
    pendingEffects.forEach((effect) => {
      if (effect.name === "render") {
        this._render();
      }
    });
    this._systemStore.clearPendingEffects();
  };
  /**
   * Renders the current state of the visual novel
   */
  _render = () => {
    const currentPointer = this._systemStore.selectCurrentPointer();
    const currentSteps = this._projectDataStore.selectSectionSteps(
      currentPointer.sectionId,
      currentPointer.stepId
    );
    if (!currentSteps.length) {
      console.warn(
        `No steps found for section: ${currentPointer.sectionId}, step: ${currentPointer.stepId}`
      );
      return;
    }
    const presentationActions = currentSteps.map(
      (step) => step.presentation || {}
    );
    const presentationState = this._constructPresentationState(presentationActions);
    const renderState = this._constructRenderState({
      // TODO
      template: presentationState,
      screen: this._projectDataStore.selectScreen(),
      resolveFile: (f) => `file:${f}`,
      resources: this._projectDataStore.selectResources(),
      ui: this._projectDataStore.selectUi()
    });
    this._eventCallback({
      eventType: "render",
      payload: renderState
    });
  };
};
var RouteEngine_default = RouteEngine;
export {
  RouteEngine_default as default
};
