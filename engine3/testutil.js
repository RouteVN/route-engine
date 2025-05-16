import { readdir, stat } from "node:fs/promises";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import yaml from "js-yaml";
import { expect, test, describe } from "vitest";

const get = (obj, path) => {
  return path.split(".").reduce((acc, part) => acc && acc[part], obj);
};

/**
 * Mocks a function with a sequence of inputs and outputs
 * @param {*} mockSequence 
 * @returns 
 */
const mock = (mockSequence) => {
  let calledTimes = 0;
  return {
    mockedFunction: (...args) => {
      const sequenceItem = mockSequence[calledTimes];
      expect(args).toEqual(sequenceItem.in);
      calledTimes++;
      return sequenceItem.out;
    },
    assertCalledTimes: () => {
      expect(calledTimes).toEqual(mockSequence.length);
    },
  };
};

/**
 *
 * Example
 *
 * const path = findAttribute({
 *   a: {
 *     b: {
 *       c: "d"
 *     },
 *     c: "e"
 *   }
 * }, "c")
 *
 * // path is ["a.b.c", "a.c"]
 *
 *
 * Example 2
 *
 * const path = findAttribute([{
 *   a: {
 *     b: {
 *       c: "d"
 *     }
 *   }
 * }], "c")
 *
 * // path is ["0.a.b.c"]
 *
 * @param {*} inputObject
 * @param {*} attributeName
 * @returns array of paths to the attribute
 */
const findAttribute = (inputObject, attributeName) => {
  const allPaths = [];
  
  // Helper function to search recursively and collect all paths
  const search = (obj, path = []) => {
    if (!obj || typeof obj !== "object") {
      return;
    }

    // Check if the current object has the attribute
    if (Object.prototype.hasOwnProperty.call(obj, attributeName)) {
      allPaths.push([...path, attributeName].join("."));
    }

    // Check all properties/elements - continue searching even if found
    if (Array.isArray(obj)) {
      // Handle array elements
      for (let i = 0; i < obj.length; i++) {
        search(obj[i], [...path, i.toString()]);
      }
    } else {
      // Handle object properties
      for (const key in obj) {
        search(obj[key], [...path, key]);
      }
    }
  };

  search(inputObject);
  return allPaths;
};

/**
 * Replaces a value at a specific path in an object
 * 
 * @param {*} obj - The object to modify
 * @param {string} path - The dot notation path where to replace the value
 * @param {*} value - The new value to set
 * @returns The modified object
 */
const replaceByPath = (obj, path, value) => {
  const parts = path.split('.');
  const lastPart = parts.pop();
  let current = obj;
  
  // Navigate to the parent object
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const nextPart = i < parts.length - 1 ? parts[i + 1] : null;
    
    // Create new objects/arrays as needed while traversing
    if (current[part] === undefined) {
      // If the next part is a number, create an array, otherwise an object
      current[part] = (nextPart !== null && !isNaN(Number(nextPart))) ? [] : {};
    }
    current = current[part];
  }
  
  // Replace the value
  if (lastPart !== undefined) {
    current[lastPart] = value;
  }
  
  return obj;
};

/**
 * 
 * Example
 * 
 * const obj = {
 *   a: {
 *     b: {
 *       c: "d"
 *     }
 *   }
 * }
 * 
 * replaceAttribute(obj, "c", "e")
 * // obj is now {
 * //   a: {
 * //     b: {
 * //       c: "e"
 * //     }
 * //   }
 * // }
 * 
 * @param {*} inputObject - The object to modify
 * @param {*} path - Either an attribute name to find or a direct dot notation path
 * @param {*} newValue - The new value to set
 * @returns updated inputObject
 */
const replaceAttribute = (inputObject, path, newValue) => {
  if (typeof path === 'string') {
    // If a string path is provided, use it directly
    return replaceByPath(inputObject, path, newValue);
  }
  
  // Old behavior: find attribute by name and replace first occurrence
  const paths = findAttribute(inputObject, path);
  if (paths.length === 0) return inputObject; // Attribute not found
  
  return replaceByPath(inputObject, paths[0], newValue);
};

export const setupTest = (spec, fun, testClass) => {
  test(spec.name, async () => {
    // Create a registry for mocks
    const mockRegistry = {};
    
    // Process inputs if they exist
    if (spec.in && spec.mocks) {
      spec.in.forEach((inItem) => {
        // Find all paths with $mock properties
        const mockPaths = findAttribute(inItem, '$mock');
        
        // Process each found mock path
        mockPaths.forEach((path) => {
          // Get the mock name from the path
          const mockName = get(inItem, path);
          
          // Get the mock configuration
          const mockConfig = spec.mocks[mockName];
          if (!mockConfig) {
            throw new Error(`Mock "${mockName}" not defined in spec.mocks`);
          }
          
          // Create a mock object
          const { mockedFunction, assertCalledTimes } = mock(mockConfig);
          mockRegistry[mockName] = assertCalledTimes;
          
          // Replace the entire object containing $mock with the mocked function
          const parentPath = path.replace(/\.\$mock$/, '');
          if (parentPath) {
            replaceAttribute(inItem, parentPath, mockedFunction);
          } else {
            // Root level mock (unlikely but handle it)
            inItem = mockedFunction;
          }
        });
      });
    }

    // @ts-ignore
    const out = await fun(...(spec.in || []));
    if (out instanceof Error) {
      expect(out.message).toEqual(spec.out.message);
    } else {
      expect(out).toEqual(spec.out);
    }

    if (spec.executions) {
      spec.executions.forEach((execution) => {
        if (execution.method) {
          const out = testClass[execution.method](...(execution.in || []));
          if (execution.out) {
            expect(out).toEqual(execution.out);
          }
        } else if (execution.property) {
          expect(
            get(testClass, execution.property),
            execution.name
          ).toEqual(execution.out);
        }
      });
    }

    // Verify all mocks were called the expected times
    for (const assertCalledTimes of Object.values(mockRegistry)) {
      assertCalledTimes();
    }
  });
};

export const setupTestSuite = (suitName, specs, fun, testClass) => {
  describe(suitName, () => {
    specs.forEach((spec) => {
      setupTest(spec, fun, testClass);
    });
  });
};

export const setupTestSuiteFromYaml = async () => {
  const loadYamlFile = (path) => {
    const includeType = new yaml.Type('!include', {
      kind: 'scalar',
      construct: function (filePath) {
        const content = fs.readFileSync(join(path, "..", filePath), "utf8");
        return yaml.load(content); // you could recurse here
      },
    });

    // // Add support for undefined values in YAML
    // const undefinedType = new yaml.Type('!undefined', {
    //   kind: 'scalar',
    //   construct: function() {
    //     return undefined;
    //   }
    // });

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

    const exportName = test.exportName || 'default';
    const imported = await import(test.file);
    const originalFun = imported[exportName];
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
        if (test.class.method === "noop") {
          fun = () => {};
        } else {
          fun = fun[test.class.method];
        }
      }
    }

    if (test.cases) {
      if (!fun) {
        throw new Error(`fun is not defined in ${test.name || test.file}`);
      }
      setupTestSuite(test.name || test.file, test.cases, fun, testClass);
    }

    if (test.suites) {
      describe(test.name || test.file, async () => {
        for (const suite of test.suites) {
          const suiteExportedName = suite.exportName || test.exportName || 'default';
          let suiteFun = imported[suiteExportedName] || originalFun;
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
              if (suite.class.method === "noop") {
                suiteFun = () => {};
              } else {
                suiteFun = suiteTestClass[suite.class.method];
              }
            }
          } else if (test.class) {
            suiteFun = fun;
          }

          setupTestSuite(suite.name, suite.cases, suiteFun, suiteTestClass);
        }
      });
    }
  }
};
