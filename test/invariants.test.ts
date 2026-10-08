import { expect, test } from "vitest";
import {
  ADDRESS_LIMITS,
  createFullAddressResolver,
  interpretAddress,
  interpretFullAddress,
  type SourceSpan,
} from "../src/index";

test("lossless offsets, deterministic results and unique candidate IDs survive varied input", () => {
  let seed = 20260926;
  const next = (length: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % length;
  };
  const pieces = [
    "123",
    "1/2",
    "Main",
    "N",
    "North",
    "East",
    "West",
    "St.",
    "Apt",
    "#",
    "PH",
    "Bldg",
    "A",
    "4",
    "Front",
    "Royal",
    "TX",
    "78701",
    "O’Connor",
    "José",
    "🏡",
    "",
    "URB",
    "PO",
    "Box",
    "St4B",
    "Apt4",
    "Rd8",
    "123-",
    "125",
    "County",
    "WH",
    "3-204",
    "Flr",
    "--",
    "21st",
    "PH-A",
    "BLDG-A",
    "UNIT-4",
    "1.5",
    "A/B",
    "C",
    "R",
    "Cobb-Adams",
    "Lakeview",
    "Lake",
    "View",
    "Rocky",
    "Pt",
    "Northpark",
    "-",
  ];
  const separators = [" ", "\t", "\r\n", ",", "; ", "  "];
  for (let trial = 0; trial < 1500; trial += 1) {
    const size = 2 + next(12);
    const input = Array.from(
      { length: size },
      () => pieces[next(pieces.length)],
    ).join(separators[next(separators.length)]);
    for (const interpret of [
      interpretFullAddress,
      (value: string) => interpretAddress({ deliveryLine: value }),
    ]) {
      const result = interpret(input);
      expect(result).toEqual(interpret(input));
      expect(result.candidates.length).toBeLessThanOrEqual(
        ADDRESS_LIMITS.candidates,
      );
      expect(
        new Set(result.candidates.map((candidate) => candidate.id)).size,
      ).toBe(result.candidates.length);
      for (const token of result.tokens)
        expect(input.slice(token.start, token.end)).toBe(token.raw);
      for (const candidate of result.candidates) {
        if (!candidate.components.kind) {
          expect(candidate.components.houseNumber).toMatch(/\d/);
          expect(candidate.components.streetName).toMatch(/[\p{L}\p{N}]/u);
        }
        for (const value of Object.values(candidate.sourceSpans)) {
          const spans: readonly SourceSpan[] = Array.isArray(value)
            ? value
            : [value];
          for (const sourceSpan of spans) {
            expect(sourceSpan.start).toBeGreaterThanOrEqual(0);
            expect(sourceSpan.end).toBeGreaterThan(sourceSpan.start);
            expect(sourceSpan.end).toBeLessThanOrEqual(input.length);
            // Repaired joined components can start/end inside an original token.
            const splitToken =
              candidate.assumptions.includes("joined-address-components") ||
              candidate.assumptions.includes(
                "compound-unit-is-building-and-unit",
              );
            expect(
              result.tokens.some((token) =>
                splitToken
                  ? token.start <= sourceSpan.start &&
                    sourceSpan.start < token.end
                  : token.start === sourceSpan.start,
              ),
            ).toBe(true);
            expect(
              result.tokens.some((token) =>
                splitToken
                  ? token.start < sourceSpan.end && sourceSpan.end <= token.end
                  : token.end === sourceSpan.end,
              ),
            ).toBe(true);
          }
        }
        const ranges = Object.values(candidate.sourceSpans)
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .sort((a, b) => a.start - b.start);
        for (const token of result.tokens.filter((token) => token.normalized)) {
          let coveredUntil = token.start;
          for (const range of ranges) {
            if (range.start <= coveredUntil && range.end > coveredUntil)
              coveredUntil = range.end;
          }
          expect(
            coveredUntil,
            `unaccounted token ${token.raw} in ${candidate.id}`,
          ).toBeGreaterThanOrEqual(token.end);
        }
      }
    }
  }
});

test("character and token budgets fail without a partial candidate set", () => {
  for (const input of [
    "123 " + "A".repeat(ADDRESS_LIMITS.characters),
    "123 " + "A ".repeat(ADDRESS_LIMITS.tokens),
  ]) {
    for (const result of [
      interpretAddress({ deliveryLine: input }),
      interpretFullAddress(input),
    ]) {
      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toEqual(["input-too-long"]);
    }
  }
});

test("directional alternatives do not duplicate street-name tokens", () => {
  const result = interpretAddress({ deliveryLine: "123 North East St" });
  expect(
    result.candidates.map((candidate) => candidate.components.streetName),
  ).toEqual(["EAST", "NORTH EAST"]);
});

test("delivery candidate expansion is bounded too", () => {
  const result = interpretAddress({
    deliveryLine: `123 North East ${Array(120).fill("KEY").join(" ")} 1`,
  });
  expect(result.candidates).toEqual([]);
  expect(result.diagnostics).toEqual(["too-many-candidates"]);
});

test("full-address runtime misuse produces diagnostics", () => {
  for (const value of [undefined, null, 42, {}, []]) {
    expect(interpretFullAddress(value as never)).toEqual({
      tokens: [],
      candidates: [],
      diagnostics: ["invalid-input"],
    });
  }
});

test("candidate exhaustion cannot resolve a partial set", async () => {
  const input = `123 ${Array(10).fill("North East Apt Road").join(" ")} City TX 78701`;
  let lookups = 0;
  const resolver = createFullAddressResolver({
    async lookupCandidates() {
      lookups += 1;
      return [];
    },
  });
  const result = await resolver.resolve(input);
  expect(result.status).toBe("invalid");
  expect(result.interpretation.diagnostics).toEqual(["too-many-candidates"]);
  expect(result.interpretation.candidates).toEqual([]);
  expect(lookups).toBe(0);
});
