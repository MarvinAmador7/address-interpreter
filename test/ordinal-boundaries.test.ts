import { expect, test } from "vitest";
import { interpretAddress, interpretFullAddress } from "../src/index";

// Synthetic structural expectations. These test the whole candidate set in the
// smaller spelling mode, not merely the presence of one acceptable candidate.
test.each(["1st", "3rd", "21st", "23rd", "101st", "103rd", "11th", "13th"])(
  "keeps %s intact before a separate street suffix",
  (ordinal) => {
    const input = `12 ${ordinal} Avenue`;
    const result = interpretAddress({ deliveryLine: input }, { spellingAlternatives: false });
    expect(result.candidates.map((candidate) => candidate.components)).toEqual([
      { houseNumber: "12", streetName: ordinal.toUpperCase(), streetSuffix: "AVE" },
    ]);
    for (const candidate of interpretAddress({ deliveryLine: input }).candidates) {
      expect(candidate.components.houseNumber).toBe("12");
      expect(candidate.assumptions).not.toContain("joined-address-components");
    }
  },
);

test("ordinal protection composes with directionals and explicit secondary chains", () => {
  const deliveryLine = "12 E 33rd Street NW Bldg A Floor 2 Apt 4";
  const candidates = interpretAddress({ deliveryLine }, { spellingAlternatives: false }).candidates;
  expect(candidates).toHaveLength(1);
  expect(candidates[0].components).toEqual({
    houseNumber: "12", preDirectional: "E", streetName: "33RD", streetSuffix: "ST", postDirectional: "NW",
    secondary: { designator: "APT", number: "4" },
    secondaryUnits: [{ designator: "BLDG", number: "A" }, { designator: "FL", number: "2" }, { designator: "APT", number: "4" }],
  });
  expect(candidates[0].sourceSpans.secondaryUnits?.map((span) => deliveryLine.slice(span.start, span.end)))
    .toEqual(["Bldg A", "Floor 2", "Apt 4"]);
});

test("a full locality does not revive a rejected ordinal split", () => {
  const result = interpretFullAddress("12 1st Avenue, Vero Beach, FL 32963", { spellingAlternatives: false });
  expect(result.candidates.map((candidate) => candidate.components)).toEqual([
    { houseNumber: "12", streetName: "1ST", streetSuffix: "AVE", city: "VERO BEACH", state: "FL", postalCode: "32963" },
  ]);
});

test.each(["42AVE", "186ST", "21ST", "3RD"])(
  "preserves joined-street readings for %s without inventing a larger primary number",
  (joined) => {
    const deliveryLine = `12 ${joined}`;
    for (const spellingAlternatives of [false, true]) {
      const candidates = interpretAddress({ deliveryLine }, { spellingAlternatives }).candidates;
      expect(candidates.every((candidate) => candidate.components.houseNumber === "12")).toBe(true);
      expect(candidates.some((candidate) => candidate.components.streetName === joined && !candidate.components.streetSuffix)).toBe(true);
      const parts = joined.match(/^(\d+)([A-Z]+)$/)!;
      const suffix = parts[2] === "AVE" ? "AVE" : parts[2] === "RD" ? "RD" : "ST";
      expect(candidates.some((candidate) => candidate.components.streetName === parts[1] && candidate.components.streetSuffix === suffix)).toBe(true);
    }
  },
);

test("retains an actually separated compound primary number", () => {
  const candidates = interpretAddress({ deliveryLine: "12 42 Oak St" }, { spellingAlternatives: false }).candidates;
  expect(candidates.some((candidate) => candidate.components.houseNumber === "12 42" && candidate.components.streetName === "OAK")).toBe(true);
});

test("an ordinal unit identifier is not changed by the street repair guard", () => {
  const candidates = interpretAddress({ deliveryLine: "12 Oak St Apt 21ST" }, { spellingAlternatives: false }).candidates;
  expect(candidates.map((candidate) => candidate.components)).toEqual([
    { houseNumber: "12", streetName: "OAK", streetSuffix: "ST", secondary: { designator: "APT", number: "21ST" } },
  ]);
});
