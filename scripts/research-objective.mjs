// The existing evaluator compares MLS text with ATTOM property fields. No
// same-input, independently adjudicated correctness labels are installed yet.
// Keep this gate closed even when every cross-source comparison agrees.
export const RESEARCH_OBJECTIVE = "parser-correctness-v1";

export function assessResearchObjective(evaluation) {
  const diagnosticRegressions = Object.values(
    evaluation?.transitions ?? {},
  ).reduce((sum, value) => sum + (value.regressed ?? 0), 0);
  return {
    objective: RESEARCH_OBJECTIVE,
    correctness: { status: "not-measured", score: null, targetMet: false },
    diagnosticRegressions,
    status: diagnosticRegressions
      ? "diagnostic-review-required"
      : "awaiting-correctness-labels",
    exitCode: 2,
  };
}
