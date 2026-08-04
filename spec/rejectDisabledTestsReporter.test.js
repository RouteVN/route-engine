import { describe, expect, it, vi } from "vitest";
import RejectDisabledTestsReporter from "../scripts/reject-disabled-tests-reporter.js";

const createTestModule = (optionsList) => ({
  children: {
    *allTests() {
      for (const [index, entry] of optionsList.entries()) {
        yield {
          fullName: `gate probe ${index + 1}`,
          location: { line: index + 1, column: 1 },
          module: { relativeModuleId: "gate-probe.test.js" },
          options: { mode: entry.mode, fails: entry.fails },
          result: () => ({
            state:
              entry.resultState ??
              (entry.mode === "run" ? "passed" : "skipped"),
          }),
        };
      }
    },
  },
});

describe("disabled-test collection reporter", () => {
  it("accepts ordinary run-mode tests", () => {
    const reporter = new RejectDisabledTestsReporter();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    reporter.onTestModuleCollected(
      createTestModule([{ mode: "run", fails: false }]),
    );

    expect(() => reporter.onTestRunEnd()).not.toThrow();
    expect(log).toHaveBeenCalledWith(
      "Test collection check passed (1 ordinary tests collected).",
    );
    log.mockRestore();
  });

  it("rejects every non-run mode and expected-failure inversion", () => {
    const reporter = new RejectDisabledTestsReporter();
    reporter.onTestModuleCollected(
      createTestModule([
        { mode: "skip", fails: false },
        { mode: "todo", fails: false },
        { mode: "only", fails: false },
        { mode: "run", fails: true },
        { mode: "run", fails: false, resultState: "skipped" },
      ]),
    );

    expect(() => reporter.onTestRunEnd()).toThrow(
      [
        "Test collection check failed. Every test must use ordinary run mode without expected-failure inversion:",
        "- gate-probe.test.js:1:1: skip test (gate probe 1)",
        "- gate-probe.test.js:2:1: todo test (gate probe 2)",
        "- gate-probe.test.js:3:1: only test (gate probe 3)",
        "- gate-probe.test.js:4:1: fails test (gate probe 4)",
        "- gate-probe.test.js:5:1: runtime-skip test (gate probe 5)",
      ].join("\n"),
    );
  });
});
