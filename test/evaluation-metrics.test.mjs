import { expect, test } from "vitest";
import { assessCandidates } from "../scripts/evaluation-metrics.mjs";

const expected = {
  houseNumber: "12",
  streetName: "OAK",
  streetSuffix: "ST",
  unit: "4",
};
const candidate = (overrides = {}) => ({
  components: {
    houseNumber: "12",
    streetName: "OAK",
    streetSuffix: "ST",
    secondary: { number: "4" },
    ...overrides,
  },
});

test("a later agreement raises recall without claiming the first interpretation improved", () => {
  const result = assessCandidates(
    [candidate({ streetName: "OAKS" }), candidate()],
    expected,
  );
  expect(result).toMatchObject({
    matched: true,
    firstCandidateMatched: false,
    alternativeOnlyMatched: true,
    singleCandidateMatched: false,
    matchingCandidates: 1,
    disagreeingCandidates: 1,
    candidates: 2,
    ambiguous: true,
    closest: [],
  });
});

test("all fields must agree in one candidate, not across different readings", () => {
  expect(
    assessCandidates(
      [
        candidate({ streetName: "OAKS" }),
        candidate({ secondary: { number: "5" } }),
      ],
      expected,
    ),
  ).toMatchObject({
    matched: false,
    matchingCandidates: 0,
    disagreeingCandidates: 2,
  });
});

test("no candidates is a parser rejection and stays in the admitted denominator", () => {
  expect(assessCandidates([], expected)).toMatchObject({
    matched: false,
    firstCandidateMatched: false,
    alternativeOnlyMatched: false,
    noCandidates: true,
    disagreeingCandidates: 0,
    closest: ["no-candidates"],
  });
});

test("multiple readings can agree with MLS fields, so agreement is not address identity", () => {
  const result = assessCandidates(
    [
      candidate({
        secondaryUnits: [{ designator: "BLDG", number: "A" }, { number: "4" }],
      }),
      candidate({
        secondaryUnits: [{ designator: "BLDG", number: "B" }, { number: "4" }],
      }),
    ],
    expected,
  );
  expect(result).toMatchObject({
    firstCandidateMatched: true,
    matchingCandidates: 2,
    disagreeingCandidates: 0,
    ambiguous: true,
    singleCandidateMatched: false,
  });
});

test("single candidate and first candidate agreement retain the existing normalization", () => {
  expect(
    assessCandidates(
      [candidate({ streetName: "  oak  ", secondary: { number: "４" } })],
      expected,
    ),
  ).toMatchObject({
    firstCandidateMatched: true,
    singleCandidateMatched: true,
    alternativeOnlyMatched: false,
    closest: [],
  });
});
