import { expect, test } from "vitest";
import {
  createAddressResolver,
  interpretAddress,
  interpretFullAddress,
} from "../src/index";

// Synthetic examples of feed formatting problems, not downloaded listing rows.
test.each([
  [
    "123 Oak Road Road Apt 4",
    {
      streetName: "OAK",
      streetSuffix: "RD",
      secondary: { designator: "APT", number: "4" },
    },
  ],
  ["123 Oak Ct Court", { streetName: "OAK", streetSuffix: "CT" }],
  [
    "123 County Rd 7 Apt 4",
    {
      streetName: "COUNTY ROAD 7",
      secondary: { designator: "APT", number: "4" },
    },
  ],
  ["123 Co Hwy M", { streetName: "COUNTY HIGHWAY M" }],
  ["123 US Hwy 8 N", { streetName: "US HIGHWAY 8", postDirectional: "N" }],
  ["123 Hwy 8", { streetName: "HIGHWAY 8" }],
  ["123 CR 8", { streetName: "COUNTY ROAD 8" }],
  ["123 State Rte 8", { streetName: "STATE ROUTE 8" }],
  [
    "123 Main St Apt4",
    {
      streetName: "MAIN",
      streetSuffix: "ST",
      secondary: { designator: "APT", number: "4" },
    },
  ],
  [
    "123 Main St4B",
    { streetName: "MAIN", streetSuffix: "ST", secondary: { number: "4B" } },
  ],
  [
    "123 County Rd8 Apt4",
    {
      streetName: "COUNTY ROAD 8",
      secondary: { designator: "APT", number: "4" },
    },
  ],
  [
    "123 Main St Bldg7 Apt4",
    {
      streetName: "MAIN",
      secondaryUnits: [
        { designator: "BLDG", number: "7" },
        { designator: "APT", number: "4" },
      ],
    },
  ],
  ["123 - 125 Main St", { houseNumber: "123-125", streetName: "MAIN" }],
  ["123- 125 Main St", { houseNumber: "123-125", streetName: "MAIN" }],
  ["123 -125 Main St", { houseNumber: "123-125", streetName: "MAIN" }],
  ["N 123 Main St", { houseNumber: "N123", streetName: "MAIN" }],
  ["123-1/2 Main St", { houseNumber: "123 1/2", streetName: "MAIN" }],
  [
    "123 Main St WH 2255",
    {
      streetName: "MAIN",
      streetSuffix: "ST",
      secondary: { number: "WH 2255" },
    },
  ],
  [
    "123 Main St 4 B",
    { streetName: "MAIN", streetSuffix: "ST", secondary: { number: "4 B" } },
  ],
  [
    "123 Oak Rd Road 4 B",
    { streetName: "OAK", streetSuffix: "RD", secondary: { number: "4B" } },
  ],
  [
    "123 Main St Bldg A Apt 4 B",
    {
      streetName: "MAIN",
      secondaryUnits: [
        { designator: "BLDG", number: "A" },
        { designator: "APT", number: "4B" },
      ],
    },
  ],
] as const)("interprets feed formatting: %s", (deliveryLine, components) => {
  const result = interpretAddress({ deliveryLine });
  expect(result.candidates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        components: expect.objectContaining(components),
      }),
    ]),
  );
});

test("a duplicate suffix retains the literal street name and exposes its repair assumption", async () => {
  const input = { deliveryLine: "123 Oak Road Road" };
  const candidates = interpretAddress(input).candidates;
  expect(candidates[0].components.streetName).toBe("OAK ROAD");
  expect(
    candidates.find((c) => c.components.streetName === "OAK")?.assumptions,
  ).toContain("repeated-street-suffix");
  const resolver = createAddressResolver({
    async lookupCandidates(readings) {
      return readings.map((c) => ({
        candidateId: c.id,
        entityId: c.components.streetName!,
        value: c.components,
      }));
    },
  });
  expect((await resolver.resolve(input)).status).toBe("ambiguous");
});

test("token repairs preserve exact source ranges in full addresses", () => {
  const line = "123 Main St4B, Austin, TX 78701";
  const result = interpretFullAddress(line);
  const repaired = result.candidates.find(
    (c) =>
      c.components.secondary?.number === "4B" &&
      c.components.streetSuffix === "ST" &&
      c.components.city === "AUSTIN",
  )!;
  expect(repaired).toBeDefined();
  expect(repaired.assumptions).toContain("joined-address-components");
  expect(
    line.slice(
      repaired.sourceSpans.street!.start,
      repaired.sourceSpans.street!.end,
    ),
  ).toBe("Main St");
  expect(
    line.slice(
      repaired.sourceSpans.secondary!.start,
      repaired.sourceSpans.secondary!.end,
    ),
  ).toBe("4B,");
  for (const token of result.tokens)
    expect(line.slice(token.start, token.end)).toBe(token.raw);
});

test("repairs preserve significant house and unit punctuation", () => {
  const candidates = interpretAddress({
    deliveryLine: "12-34 Main St Apt 4-5",
  }).candidates;
  expect(
    candidates.every(
      (c) =>
        c.components.houseNumber === "12-34" &&
        c.components.secondary?.number === "4-5",
    ),
  ).toBe(true);
});

test("incomplete units and absent house numbers stay diagnosed after repair", () => {
  expect(
    interpretAddress({ deliveryLine: "123 Main St Apt" }).diagnostics,
  ).toEqual(["incomplete-secondary"]);
  expect(interpretAddress({ deliveryLine: "Main St4B" }).diagnostics).toEqual([
    "missing-house-number",
  ]);
});

test("different suffixes and ordinary words do not trigger feed repairs", () => {
  for (const line of [
    "123 Oak Court Road",
    "123 Rd Mountain Lane",
    "123 CR Mountain Lane",
  ]) {
    expect(
      interpretAddress({ deliveryLine: line }).candidates.every(
        (c) =>
          !c.assumptions.includes("repeated-street-suffix") &&
          !c.assumptions.includes("route-name-expanded"),
      ),
    ).toBe(true);
  }
});
