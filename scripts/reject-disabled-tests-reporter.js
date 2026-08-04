const formatLocation = (testCase) => {
  const location = testCase.location;
  const moduleId = testCase.module.relativeModuleId;
  return location
    ? `${moduleId}:${location.line}:${location.column}`
    : moduleId;
};

export default class RejectDisabledTestsReporter {
  testCases = [];

  onTestModuleCollected(testModule) {
    for (const testCase of testModule.children.allTests()) {
      this.testCases.push(testCase);
    }
  }

  onTestRunEnd() {
    const forbiddenTests = [];
    for (const testCase of this.testCases) {
      const mode = testCase.options.fails
        ? "fails"
        : testCase.options.mode !== "run"
          ? testCase.options.mode
          : testCase.result().state === "skipped"
            ? "runtime-skip"
            : "run";
      if (mode !== "run") {
        forbiddenTests.push({
          location: formatLocation(testCase),
          mode,
          name: testCase.fullName,
        });
      }
    }
    if (forbiddenTests.length > 0) {
      const details = forbiddenTests.map(
        ({ location, mode, name }) => `- ${location}: ${mode} test (${name})`,
      );
      throw new Error(
        [
          "Test collection check failed. Every test must use ordinary run mode without expected-failure inversion:",
          ...details,
        ].join("\n"),
      );
    }

    console.log(
      `Test collection check passed (${this.testCases.length} ordinary tests collected).`,
    );
  }
}
