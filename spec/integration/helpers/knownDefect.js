import { expect, it } from "vitest";

const isAssertionError = (error) => error?.name === "AssertionError";

const runSingleSynchronousExpectation = (title, kind, assertion) => {
  if (typeof assertion !== "function") {
    throw new Error(
      `Known-defect test "${title}" requires a ${kind} assertion callback.`,
    );
  }

  const assertionCountBefore = expect.getState().assertionCalls;
  const result = assertion();
  if (typeof result?.then === "function") {
    throw new Error(
      `Known-defect ${kind} assertion "${title}" must be synchronous so its result cannot escape the guard.`,
    );
  }

  const assertionCount =
    expect.getState().assertionCalls - assertionCountBefore;
  if (assertionCount !== 1) {
    throw new Error(
      `Known-defect ${kind} assertion "${title}" must contain exactly one expect call; received ${assertionCount}.`,
    );
  }
};

/**
 * Runs a known-defect journey as an ordinary test while allowing exactly one
 * deliberately marked desired-contract assertion to fail. Setup errors and
 * assertions outside `expectFailure` remain real test failures. Once the
 * desired contract passes, the test fails and asks for the marker to be
 * removed.
 */
export const verifyKnownDefect = async (title, testFunction) => {
  let observedExpectedFailure = false;

  const expectFailure = ({ observed, desired } = {}) => {
    if (observedExpectedFailure) {
      throw new Error(
        `Known-defect test "${title}" marked more than one expected failure.`,
      );
    }
    if (typeof desired !== "function") {
      throw new Error(
        `Known-defect test "${title}" requires a desired-contract assertion callback.`,
      );
    }

    runSingleSynchronousExpectation(title, "observed-behavior", observed);

    const assertionCountBefore = expect.getState().assertionCalls;
    try {
      const result = desired?.();
      if (typeof result?.then === "function") {
        throw new Error(
          `Known-defect desired-contract assertion "${title}" must be synchronous so its failure cannot escape the guard.`,
        );
      }
    } catch (error) {
      if (!isAssertionError(error)) {
        throw error;
      }
      const assertionCount =
        expect.getState().assertionCalls - assertionCountBefore;
      if (assertionCount !== 1) {
        throw new Error(
          `Known-defect desired-contract assertion "${title}" must contain exactly one expect call; received ${assertionCount}.`,
          { cause: error },
        );
      }
      observedExpectedFailure = true;
      return;
    }

    throw new Error(
      `Known defect no longer reproduces: ${title}. Remove the marker and keep the desired assertion.`,
    );
  };

  await testFunction({ expectFailure });

  if (!observedExpectedFailure) {
    throw new Error(
      `Known-defect test "${title}" did not execute its expected-failure assertion.`,
    );
  }
};

export const itKnownDefect = (title, testFunction) => {
  it(`[known defect] ${title}`, () => verifyKnownDefect(title, testFunction));
};
