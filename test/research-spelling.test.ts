import { expect, test } from "vitest";
import { interpretAddress } from "../src/index";

test.each([
  [
    "123 Avenue at Port Example #4",
    "AVENUE AT PORT EXAMPLE",
    "AVE AT PORT EXAMPLE",
  ],
  ["123 Little Mt Church Rd #4", "LITTLE MT CHURCH", "LITTLE MOUNT CHURCH"],
  ["123 Rocky Pt Rd #4", "ROCKY PT", "ROCKY POINT"],
  ["123 Old Fort Example Rd #4", "OLD FORT EXAMPLE", "OLD FT EXAMPLE"],
  ["123 District Rd 8 #4", "DISTRICT RD 8", "DISTRICT ROAD 8"],
  ["123 79th St #4", "79TH", "79TH"],
] as const)(
  "preserves observed name words while offering an abbreviation reading: %s",
  (input, literal, alternate) => {
    const result = interpretAddress({ deliveryLine: input });
    const matching = result.candidates.filter(
      (c) =>
        c.components.houseNumber === "123" &&
        c.components.secondary?.number === "4",
    );
    expect(matching.some((c) => c.components.streetName === literal)).toBe(
      true,
    );
    const variant = matching.find((c) => c.components.streetName === alternate);
    expect(variant).toBeDefined();
    expect(
      input.slice(
        variant!.sourceSpans.secondary!.start,
        variant!.sourceSpans.secondary!.end,
      ),
    ).toBe("#4");
    if (literal !== alternate)
      expect(variant!.assumptions.length).toBeGreaterThan(0);
  },
);

test("name spelling alternatives preserve explicit building and unit identifiers", () => {
  const result = interpretAddress({
    deliveryLine: "123 Rocky Pt Rd Bldg ST Apt MT",
  });
  expect(result.candidates.map((c) => c.components)).toContainEqual(
    expect.objectContaining({
      streetName: "ROCKY POINT",
      streetSuffix: "RD",
      secondary: { designator: "APT", number: "MT" },
      secondaryUnits: [
        { designator: "BLDG", number: "ST" },
        { designator: "APT", number: "MT" },
      ],
    }),
  );
});

test.each([
  ["123 Lakeview Rd Apt 4", "LAKEVIEW", "LAKE VIEW"],
  ["123 Lake View Rd Apt 4", "LAKE VIEW", "LAKEVIEW"],
  ["123 Silverstone Rd Apt 4", "SILVERSTONE", "SILVER STONE"],
  ["123 Old Meadow View Rd Apt 4", "OLD MEADOW VIEW", "OLD MEADOWVIEW"],
  ["123 Forestview Rd Apt 4", "FORESTVIEW", "FOREST VIEW"],
  ["123 NORTHPARK Rd Apt 4", "NORTHPARK", "NORTH PARK"],
] as const)(
  "keeps both compound-name spellings without changing identifiers: %s",
  (input, literal, alternate) => {
    const result = interpretAddress({ deliveryLine: input });
    const readings = result.candidates.filter(
      (c) =>
        c.components.secondary?.number === "4" &&
        c.components.streetSuffix === "RD",
    );
    expect(readings.map((c) => c.components.streetName)).toContain(literal);
    const changed = readings.find((c) => c.components.streetName === alternate);
    expect(changed).toBeDefined();
    expect(changed!.components.houseNumber).toBe("123");
    expect(changed!.assumptions).toContain("compound-street-name-spacing");
    expect(changed!.sourceSpans).toEqual(
      readings.find((c) => c.components.streetName === literal)!.sourceSpans,
    );
  },
);

test("compound word spelling does not segment house numbers or opaque unit names", () => {
  const result = interpretAddress({
    deliveryLine: "123A Lakeview Rd Bldg LAKEVIEW Apt RIDGEVIEW",
  });
  const changed = result.candidates.find(
    (c) =>
      c.components.streetName === "LAKE VIEW" &&
      c.components.secondaryUnits?.length === 2,
  );
  expect(changed?.components).toMatchObject({
    houseNumber: "123A",
    secondaryUnits: [
      { designator: "BLDG", number: "LAKEVIEW" },
      { designator: "APT", number: "RIDGEVIEW" },
    ],
  });
});

test("compound name rules do not split incidental short fragments", () => {
  const result = interpretAddress({ deliveryLine: "123 Willow Rd" });
  expect(result.candidates.map((c) => c.components.streetName)).not.toContain(
    "WIL LOW",
  );
  expect(result.candidates.map((c) => c.components.streetName)).toContain(
    "WILLOW",
  );
});
