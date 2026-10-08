import { expect, test } from "vitest";
import { interpretAddress } from "../src/index";

test.each([
  [
    "123 NW 186st 4-211",
    {
      houseNumber: "123",
      preDirectional: "NW",
      streetName: "186TH",
      streetSuffix: "ST",
      secondary: { number: "4-211" },
    },
  ],
  [
    "123 E 47th North",
    {
      houseNumber: "123",
      preDirectional: "E",
      streetName: "47",
      postDirectional: "N",
    },
  ],
  ["123 County 42 Road", { houseNumber: "123", streetName: "COUNTY ROAD 42" }],
  ["123 AA Highway", { houseNumber: "123", streetName: "HIGHWAY AA" }],
  [
    "123 F48 Highway W 60",
    {
      houseNumber: "123",
      streetName: "HIGHWAY F48",
      postDirectional: "W",
      secondary: { number: "60" },
    },
  ],
] as const)(
  "recovers an observed compact or reordered street: %s",
  (deliveryLine, expected) => {
    expect(
      interpretAddress({ deliveryLine }).candidates.map((c) => c.components),
    ).toContainEqual(
      expect.objectContaining({ ...expected, houseNumber: "123" }),
    );
  },
);

test("compact numbered street alternatives retain the literal ordinal and its source offsets", () => {
  const input = "123 N 21st #4B";
  const result = interpretAddress({ deliveryLine: input });
  const literal = result.candidates.find(
    (c) =>
      c.components.streetName === "21ST" &&
      !c.components.streetSuffix &&
      c.components.secondary?.number === "4B",
  );
  expect(literal).toBeDefined();
  const split = result.candidates.find(
    (c) =>
      c.components.streetName === "21" &&
      c.components.streetSuffix === "ST" &&
      c.components.secondary?.number === "4B",
  );
  expect(split).toBeDefined();
  expect(
    input.slice(
      split!.sourceSpans.street!.start,
      split!.sourceSpans.street!.end,
    ),
  ).toBe("N 21st");
  expect(split!.assumptions).toContain("joined-address-components");
});

test.each(["123 186st Avenue", "123 Main St Apt 186st"])(
  "keeps literal numbered names and unit identifiers: %s",
  (deliveryLine) => {
    const candidates = interpretAddress({ deliveryLine }).candidates;
    if (deliveryLine.includes("Apt"))
      expect(
        candidates.some((c) => c.components.secondary?.number === "186ST"),
      ).toBe(true);
    else
      expect(
        candidates.some(
          (c) =>
            c.components.streetName === "186ST" &&
            c.components.streetSuffix === "AVE",
        ),
      ).toBe(true);
  },
);

test.each([
  ["123 Cobb-Adams Road A", "COBB ADAMS"],
  ["123 Main - Cross Road", "MAIN CROSS"],
  ["123 KY-55", "KY HIGHWAY 55"],
  ["123 Kentucky 55", "KY HIGHWAY 55"],
  ["123 C R 42", "COUNTY ROAD 42"],
  ["123 S R 42", "STATE ROAD 42"],
  ["123 Farm to Market 42", "FM 42"],
  ["123 HWY FM 42", "FM 42"],
  ["123 County Road 42", "CR 42"],
  ["123 Bay W Drive", "BAY WEST"],
  ["123 N Avenue", "NORTH"],
] as const)(
  "retains supported street spelling alternatives: %s",
  (deliveryLine, streetName) => {
    expect(
      interpretAddress({ deliveryLine }).candidates.some(
        (c) => c.components.streetName === streetName,
      ),
    ).toBe(true);
  },
);

test("street punctuation alternatives do not change significant house or unit hyphens", () => {
  const result = interpretAddress({
    deliveryLine: "12-34 Cobb-Adams Rd Apt 5-6",
  });
  const candidates = result.candidates.filter(
    (c) => c.components.streetName === "COBB ADAMS",
  );
  expect(candidates.length).toBeGreaterThan(0);
  expect(
    candidates.every(
      (c) =>
        c.components.houseNumber === "12-34" &&
        c.components.secondary?.number === "5-6",
    ),
  ).toBe(true);
});

test.each(["123 Kentucky Avenue", "123 Texas Ranch Road", "123 State Street"])(
  "does not invent a highway jurisdiction or identifier in %s",
  (deliveryLine) => {
    expect(
      interpretAddress({ deliveryLine }).candidates.every(
        (c) => !c.components.streetName?.includes("HIGHWAY"),
      ),
    ).toBe(true);
  },
);

test.each([
  [
    "123 Main St PH-A",
    {
      streetName: "MAIN",
      streetSuffix: "ST",
      secondary: { designator: "PH", number: "A" },
    },
  ],
  [
    "123 Main St APT-6C",
    {
      streetName: "MAIN",
      streetSuffix: "ST",
      secondary: { designator: "APT", number: "6C" },
    },
  ],
  [
    "123 Main St BLDG-A UNIT-4",
    {
      streetName: "MAIN",
      streetSuffix: "ST",
      secondaryUnits: [
        { designator: "BLDG", number: "A" },
        { designator: "UNIT", number: "4" },
      ],
      secondary: { designator: "UNIT", number: "4" },
    },
  ],
  [
    "123 Main St 1.5",
    { streetName: "MAIN", streetSuffix: "ST", secondary: { number: "1.5" } },
  ],
  [
    "123 Main St A/B",
    { streetName: "MAIN", streetSuffix: "ST", secondary: { number: "A/B" } },
  ],
  [
    "123 School APT 301 Street",
    {
      streetName: "SCHOOL",
      streetSuffix: "ST",
      secondary: { designator: "APT", number: "301" },
    },
  ],
  [
    "123 APT B Main Street",
    {
      streetName: "MAIN",
      streetSuffix: "ST",
      secondary: { designator: "APT", number: "B" },
    },
  ],
  ["123 123 Olive Court", { streetName: "OLIVE", streetSuffix: "CT" }],
  [
    "123 S 123 South 8th Street",
    { preDirectional: "S", streetName: "8TH", streetSuffix: "ST" },
  ],
  ["123 County Rd 18.4", { streetName: "COUNTY ROAD 18.4" }],
] as const)(
  "recovers explicit secondary structure and repeated feed fields: %s",
  (deliveryLine, expected) => {
    expect(
      interpretAddress({ deliveryLine }).candidates.map((c) => c.components),
    ).toContainEqual(
      expect.objectContaining({ ...expected, houseNumber: "123" }),
    );
  },
);

test("embedded secondary phrases preserve their identifier and original offsets", () => {
  const input = "123 School APT 301 Street";
  const result = interpretAddress({ deliveryLine: input });
  const candidate = result.candidates.find(
    (c) =>
      c.components.streetName === "SCHOOL" &&
      c.components.streetSuffix === "ST" &&
      c.components.secondary?.number === "301",
  );
  expect(candidate).toBeDefined();
  expect(
    input.slice(
      candidate!.sourceSpans.secondary!.start,
      candidate!.sourceSpans.secondary!.end,
    ),
  ).toBe("APT 301");
});

test("duplicate house readings keep distinct numbers and numeric street names", () => {
  expect(
    interpretAddress({ deliveryLine: "123 125 Olive Ct" }).candidates.every(
      (c) =>
        c.components.streetName !== "OLIVE" ||
        c.components.houseNumber === "123 125",
    ),
  ).toBe(true);
  expect(
    interpretAddress({ deliveryLine: "123 123 Street" }).candidates.some(
      (c) => c.components.streetName === "123",
    ),
  ).toBe(true);
});

test.each([
  ["123 Main St PH-A.", "PH", "A"],
  ["123 Main St Apt.-6C.", "APT", "6C"],
] as const)(
  "recognizes punctuation around a joined secondary marker: %s",
  (deliveryLine, designator, number) => {
    const result = interpretAddress({ deliveryLine });
    expect(
      result.candidates.some(
        (c) =>
          c.components.streetName === "MAIN" &&
          c.components.streetSuffix === "ST" &&
          c.components.secondary?.designator === designator &&
          c.components.secondary.number === number,
      ),
    ).toBe(true);
  },
);
