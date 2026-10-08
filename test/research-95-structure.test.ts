import { expect, test } from "vitest";
import { interpretAddress } from "../src/index";

test.each([
  [
    "123 N N Main St Street",
    {
      houseNumber: "123",
      preDirectional: "N",
      streetName: "MAIN",
      streetSuffix: "ST",
    },
  ],
  [
    "123 123 Main Rd Road",
    { houseNumber: "123", streetName: "MAIN", streetSuffix: "RD" },
  ],
  [
    "123 N Main St Street N",
    {
      houseNumber: "123",
      preDirectional: "N",
      streetName: "MAIN",
      streetSuffix: "ST",
    },
  ],
  [
    "123 Main St Unit 4 Street",
    {
      houseNumber: "123",
      streetName: "MAIN",
      streetSuffix: "ST",
      secondary: { designator: "UNIT", number: "4" },
    },
  ],
  [
    "123 E 100 South S",
    {
      houseNumber: "123",
      preDirectional: "E",
      streetName: "100",
      postDirectional: "S",
    },
  ],
  [
    "123 Main St E East",
    {
      houseNumber: "123",
      streetName: "MAIN",
      streetSuffix: "ST",
      postDirectional: "E",
    },
  ],
])(
  "composes independently evidenced duplicate feed fields: %s",
  (deliveryLine, expected) => {
    for (const spellingAlternatives of [true, false]) {
      const result = interpretAddress(
        { deliveryLine },
        { spellingAlternatives },
      );
      expect(
        result.candidates.map((candidate) => candidate.components),
      ).toContainEqual(expected);
      expect(result.diagnostics).toEqual([]);
    }
  },
);

test("duplicate feed repairs preserve the literal first interpretation and its complete source span", () => {
  const deliveryLine = "123 N N Main St Street";
  const result = interpretAddress({ deliveryLine });
  expect(result.candidates[0].components).toEqual({
    houseNumber: "123",
    preDirectional: "N",
    streetName: "N MAIN ST",
    streetSuffix: "ST",
  });
  const repaired = result.candidates.find(
    (candidate) =>
      candidate.components.streetName === "MAIN" &&
      !candidate.components.secondary,
  );
  expect(repaired?.assumptions).toEqual(
    expect.arrayContaining([
      "repeated-predirectional",
      "repeated-street-suffix",
    ]),
  );
  const span = repaired!.sourceSpans.street!;
  expect(deliveryLine.slice(span.start, span.end)).toBe("N N Main St Street");
});

test.each([
  "123 Main St E Apt E",
  "123 Main St E Bldg E Unit E",
  "123 Main St E F",
])(
  "does not remove an explicit or different unit to deduplicate a directional: %s",
  (deliveryLine) => {
    const result = interpretAddress({ deliveryLine });
    expect(
      result.candidates.some(
        (candidate) =>
          candidate.components.streetName === "MAIN" &&
          candidate.components.streetSuffix === "ST" &&
          candidate.components.postDirectional === "E" &&
          !candidate.components.secondary,
      ),
    ).toBe(false);
  },
);
