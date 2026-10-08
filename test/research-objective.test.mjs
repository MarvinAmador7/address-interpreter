import { expect, test } from "vitest";
import { assessResearchObjective } from "../scripts/research-objective.mjs";

test("even 100% cross-source agreement cannot pass a parser correctness target", () => {
  expect(
    assessResearchObjective({
      results: {
        current: {
          scenarios: { "source-listing": { cases: 100, matched: 100 } },
        },
      },
      transitions: { "source-listing": { regressed: 0 } },
    }),
  ).toMatchObject({
    correctness: { status: "not-measured", score: null, targetMet: false },
    status: "awaiting-correctness-labels",
    exitCode: 2,
  });
});

test("losing ATTOM agreement requires review instead of declaring a correctness regression", () => {
  expect(
    assessResearchObjective({
      transitions: {
        "source-listing": { regressed: 3 },
        "source-property": { regressed: 2 },
      },
    }),
  ).toMatchObject({
    diagnosticRegressions: 5,
    status: "diagnostic-review-required",
    correctness: { targetMet: false },
    exitCode: 2,
  });
  expect(assessResearchObjective().correctness.score).toBeNull();
});
