import { describe, expect, it } from "vitest";
import { verifyKnownDefect } from "./helpers/knownDefect.js";

describe("known-defect integration guard", () => {
  it("accepts only the deliberately marked failing contract", async () => {
    await expect(
      verifyKnownDefect("still broken", ({ expectFailure }) => {
        expect("fixture").toBe("fixture");
        expectFailure({
          observed: () => expect("broken").toBe("broken"),
          desired: () => expect("broken").toBe("fixed"),
        });
      }),
    ).resolves.toBeUndefined();
  });

  it("does not accept fixture or setup errors", async () => {
    await expect(
      verifyKnownDefect("invalid fixture", () => {
        throw new Error("fixture schema is invalid");
      }),
    ).rejects.toThrow("fixture schema is invalid");
  });

  it("does not accept unrelated precondition assertion failures", async () => {
    await expect(
      verifyKnownDefect("bad precondition", () => {
        expect("unexpected").toBe("precondition");
      }),
    ).rejects.toMatchObject({ name: "AssertionError" });
  });

  it("expires when the desired contract becomes healthy", async () => {
    await expect(
      verifyKnownDefect("now fixed", ({ expectFailure }) => {
        expectFailure({
          observed: () => expect("fixed").toBe("fixed"),
          desired: () => expect("fixed").toBe("fixed"),
        });
      }),
    ).rejects.toThrow("Known defect no longer reproduces");

    await expect(
      verifyKnownDefect("changed shape", ({ expectFailure }) => {
        expectFailure({
          observed: () => expect("different bug").toBe("original bug"),
          desired: () => expect("different bug").toBe("fixed"),
        });
      }),
    ).rejects.toMatchObject({ name: "AssertionError" });
  });

  it("requires exactly one marked contract assertion", async () => {
    await expect(verifyKnownDefect("missing marker", () => {})).rejects.toThrow(
      "did not execute its expected-failure assertion",
    );

    await expect(
      verifyKnownDefect("duplicate marker", ({ expectFailure }) => {
        expectFailure({
          observed: () => expect("broken").toBe("broken"),
          desired: () => expect("broken").toBe("fixed"),
        });
        expectFailure({
          observed: () => expect("still broken").toBe("still broken"),
          desired: () => expect("still broken").toBe("fixed"),
        });
      }),
    ).rejects.toThrow("marked more than one expected failure");

    await expect(
      verifyKnownDefect("compound assertions", ({ expectFailure }) => {
        expectFailure({
          observed: () => expect("broken").toBe("broken"),
          desired: () => {
            expect("healthy precondition").toBe("healthy precondition");
            expect("broken").toBe("fixed");
          },
        });
      }),
    ).rejects.toThrow("must contain exactly one expect call");
  });
});
