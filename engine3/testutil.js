import { expect, test, describe } from "vitest";
import { readdir, stat } from "node:fs/promises";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import fs from "node:fs";

export const mock = (obj, prop, parts) => {
  let calledTimes = 0;
  const props = prop.split(".");
  const recurseAdd = (props, object) => {
    if (props.length === 1) {
      const p = props.shift();
      object[p] = (...args) => {
        expect(args).toEqual(parts[calledTimes]?.in);
        calledTimes++;
        const out = parts[calledTimes - 1].out;
        if (out instanceof Error) {
          throw out;
        }
        return out;
      };
      return;
    }
    const p = props.shift();
    if (!object[p]) {
      object[p] = {};
    }
    recurseAdd(props, object[p]);
  };
  recurseAdd(props, obj);
  return () => {
    return {
      calledTimes,
    };
  };
};

export const mockObj = (obj = {}) => {
  const deps = {};
  const getDatas = {};
  Object.entries(obj).forEach(([key, value]) => {
    getDatas[key] = mock(deps, key, value);
  });
  return {
    deps,
    assertCalledTimes: () => {
      Object.keys(getDatas).forEach((key) => {
        try {
          expect(getDatas[key]().calledTimes).toEqual(obj[key].length);
        } catch (error) {
          throw new Error(
            `Expected ${key} to be called ${
              obj[key].length
            } times, but it was called ${getDatas[key]().calledTimes} times`
          );
        }
      });
    },
  };
};

export const setupTest = (spec, fun) => {
  test(spec.name, async () => {
    const { deps: mockedDeps, assertCalledTimes } = mockObj(spec.deps);
    // @ts-ignore
    const out = await fun(...(spec.in || []));
    if (out instanceof Error) {
      expect(out.message).toEqual(spec.out.message);
    } else {
      expect(out).toEqual(spec.out);
    }

    assertCalledTimes();
  });
};

export const setupTestSuite = (suitName, specs, fun) => {
  describe(suitName, () => {
    specs.forEach((spec) => {
      setupTest(spec, fun);
    });
  });
};

export const setupTestSuiteFromYaml = async () => {
  const loadYamlFile = (path) => {
    const includeType = new yaml.Type("!include", {
      kind: "scalar",
      construct: function (filePath) {
        const content = fs.readFileSync(join(path, "..", filePath), "utf8");
        return yaml.load(content); // you could recurse here
      },
    });

    const schema = yaml.DEFAULT_SCHEMA.extend([includeType]);

    return yaml.load(fs.readFileSync(path, "utf8"), { schema });
  };

  async function findTestYamlFiles(startPath) {
    const results = [];

    async function traverseDirectory(currentPath) {
      const files = await readdir(currentPath);

      for (const file of files) {
        const filePath = path.join(currentPath, file);
        const stats = await stat(filePath);

        if (stats.isDirectory()) {
          await traverseDirectory(filePath);
        } else if (
          file.endsWith(".test.yaml") ||
          file.endsWith(".test.yml") ||
          file.endsWith(".spec.yaml") ||
          file.endsWith(".spec.yml")
        ) {
          results.push(filePath);
        }
      }
    }

    await traverseDirectory(startPath);
    return results;
  }

  // Get directory of current file (ESM equivalent of __dirname)
  const __filename = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(__filename);

  const testYamlFiles = await findTestYamlFiles(currentDir);

  for (const file of testYamlFiles) {
    const test = loadYamlFile(file);

    const originalFun = (await import(test.file)).default;
    let fun = originalFun;
    let testClass;

    if (test.class) {
      testClass = new fun(...test.class.classConstructor);
      if (test.class.isProperty) {
        const propertyWrapper = () => {
          const out = testClass[test.class.method];
          return out;
        };
        fun = propertyWrapper;
      } else if (test.class.method) {
        fun = fun[test.class.method];
      }
    }

    if (!fun) {
      throw new Error("fun is not defined");
    }

    if (test.cases) {
      setupTestSuite(test.name || test.file, test.cases, fun);
    }

    if (test.suites) {
      describe(test.name || test.file, () => {
        test.suites.forEach((suite) => {
          let suiteFun = originalFun;
          let suiteTestClass;

          if (suite.class) {
            suiteTestClass = new suiteFun(...suite.class.classConstructor);
            if (suite.class.isProperty) {
              const propertyWrapper = () => {
                const out = suiteTestClass[suite.class.method];
                return out;
              };
              suiteFun = propertyWrapper;
            } else if (suite.class.method) {
              suiteFun = suiteTestClass[suite.class.method];
            }
          } else if (test.class) {
            suiteFun = fun;
          }

          setupTestSuite(suite.name, suite.cases, suiteFun);
        });
      });
    }
  }
};
