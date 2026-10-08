// Independent comparison against ATTOM property fields. This measures agreement, not
// address identity, deliverability, or the precision of possible interpretations.
export const norm = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[’‘]/g, "'")
    .replace(/⁄/g, "/")
    .replace(/\s+/g, " ");

export function assessCandidates(candidates, expected) {
  let closest = ["no-candidates"];
  let matchingCandidates = 0;
  let firstCandidateMatched = false;
  for (const [index, candidate] of candidates.entries()) {
    const actual = {
      ...candidate.components,
      unit: candidate.components.secondary?.number,
    };
    const differences = Object.keys(expected).filter(
      (key) => norm(actual[key]) !== norm(expected[key]),
    );
    if (index === 0 || differences.length < closest.length)
      closest = differences;
    if (!differences.length) {
      matchingCandidates++;
      if (index === 0) firstCandidateMatched = true;
    }
  }
  const matched = matchingCandidates > 0;
  return {
    matched,
    firstCandidateMatched,
    alternativeOnlyMatched: matched && !firstCandidateMatched,
    singleCandidateMatched: matched && candidates.length === 1,
    matchingCandidates,
    disagreeingCandidates: candidates.length - matchingCandidates,
    candidates: candidates.length,
    noCandidates: candidates.length === 0,
    ambiguous: candidates.length > 1,
    closest,
  };
}
