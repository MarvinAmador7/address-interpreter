import { expect, test } from "vitest";
import { interpretAddress } from "../src/index";

test.each([
  ["123 Main St 12-A", { streetName: "MAIN", secondary: { number: "12A" } }],
  ["123 Main St A-12", { streetName: "MAIN", secondary: { number: "A12" } }],
  [
    "123 Main St 3-204",
    {
      streetName: "MAIN",
      secondaryUnits: [
        { designator: "BLDG", number: "3" },
        { designator: "UNIT", number: "204" },
      ],
      secondary: { designator: "UNIT", number: "204" },
    },
  ],
  [
    "123 Main St Apt 3-204",
    {
      streetName: "MAIN",
      secondaryUnits: [
        { designator: "BLDG", number: "3" },
        { designator: "APT", number: "204" },
      ],
      secondary: { designator: "APT", number: "204" },
    },
  ],
  [
    "123 Main St Bldg A Apt 3-204",
    {
      secondaryUnits: [
        { designator: "BLDG", number: "A" },
        { designator: "APT", number: "3-204" },
      ],
    },
  ],
  ["123 St George Ave", { streetName: "SAINT GEORGE", streetSuffix: "AVE" }],
  ["123 Mt Hope Rd", { streetName: "MOUNT HOPE", streetSuffix: "RD" }],
  ["123 Ft Hill Rd", { streetName: "FORT HILL", streetSuffix: "RD" }],
  ["123 42 Street", { streetName: "42ND", streetSuffix: "ST" }],
  ["123 Twenty First Street", { streetName: "21ST", streetSuffix: "ST" }],
  ["123 Eleventh Street", { streetName: "11TH", streetSuffix: "ST" }],
  ["123 Third Street", { streetName: "3", streetSuffix: "ST" }],
  ["123 3rd Street", { streetName: "THIRD", streetSuffix: "ST" }],
  ["123 19 TH Avenue", { streetName: "19TH", streetSuffix: "AVE" }],
  ["123 Ave B", { streetName: "AVENUE B" }],
  ["123 Mc Arthur Rd", { streetName: "MCARTHUR", streetSuffix: "RD" }],
  ["123 Old Hwy 26", { streetName: "OLD HIGHWAY 26" }],
  ["123 Main St Apt B B", { secondary: { designator: "APT", number: "B" } }],
  ["123- 1/2 Main St", { houseNumber: "123 1/2", streetName: "MAIN" }],
  ["123 - 1/2 Main St", { houseNumber: "123 1/2", streetName: "MAIN" }],
  [
    "123 Main St - Building 2",
    { streetName: "MAIN", secondary: { designator: "BLDG", number: "2" } },
  ],
  ["123 O'Neil St", { streetName: "ONEIL", streetSuffix: "ST" }],
  ["123 US26", { streetName: "US HIGHWAY 26" }],
  ["123 CR26", { streetName: "COUNTY ROAD 26" }],
  ["123 26 Highway", { streetName: "HIGHWAY 26" }],
  ["123 N Oak St North", { streetName: "OAK", postDirectional: "N" }],
  ["123 N North Oak St", { streetName: "OAK", preDirectional: "N" }],
  [
    "123 Oak St Building",
    { streetName: "OAK", secondary: { designator: "BLDG" } },
  ],
  ["123 Oak St A12", { streetName: "OAK", secondary: { number: "A-12" } }],
  ["123 B Oak St", { streetName: "OAK", secondary: { number: "B" } }],
  ["123 Oak B12 St", { streetName: "OAK", secondary: { number: "B12" } }],
  [
    "123 Oak B St Apt B",
    { streetName: "OAK", secondary: { designator: "APT", number: "B" } },
  ],
  [
    "123 Main St SP 7",
    { streetName: "MAIN", secondary: { designator: "SPC", number: "7" } },
  ],
  [
    "123 Main St -- 7B",
    { streetName: "MAIN", secondary: { designator: "UNIT", number: "7B" } },
  ],
  [
    "123 Main St 2nd Flr Apt 7B",
    {
      streetName: "MAIN",
      secondaryUnits: [
        { designator: "FL", number: "2" },
        { designator: "APT", number: "7B" },
      ],
    },
  ],
  [
    "123 Main St Bldg A 2nd Flr Apt 7B",
    {
      streetName: "MAIN",
      secondaryUnits: [
        { designator: "BLDG", number: "A" },
        { designator: "FL", number: "2" },
        { designator: "APT", number: "7B" },
      ],
    },
  ],
  [
    "123 Main St 7B - 2nd Floor",
    {
      streetName: "MAIN",
      secondaryUnits: [{ number: "7B" }, { designator: "FL", number: "2" }],
    },
  ],
  [
    "123 Main St 2nd Flr - #7B",
    {
      streetName: "MAIN",
      secondaryUnits: [
        { designator: "FL", number: "2" },
        { designator: "#", number: "7B" },
      ],
    },
  ],
] as const)(
  "retains a supported interpretation of %s",
  (deliveryLine, components) => {
    const matches = interpretAddress({ deliveryLine }).candidates.map(
      (c) => c.components,
    );
    expect(matches).toEqual(
      expect.arrayContaining([expect.objectContaining(components)]),
    );
  },
);

test("compound-unit alternatives preserve the complete identifier and evidence", () => {
  const line = "123 Main St 3-204";
  const candidates = interpretAddress({ deliveryLine: line }).candidates;
  expect(
    candidates.some((c) => c.components.secondary?.number === "3-204"),
  ).toBe(true);
  const split = candidates.find(
    (c) => c.components.secondaryUnits?.length === 2,
  )!;
  expect(split.assumptions).toContain("compound-unit-is-building-and-unit");
  expect(
    split.sourceSpans.secondaryUnits?.map((s) => line.slice(s.start, s.end)),
  ).toEqual(["3", "204"]);
});

test("numeric spelling alternatives do not turn highway numbers into ordinal streets", () => {
  const candidates = interpretAddress({
    deliveryLine: "123 County Road 21",
  }).candidates;
  expect(
    candidates.some((c) => c.components.streetName === "COUNTY ROAD 21ST"),
  ).toBe(false);
});

test("route reordering and repeated directionals preserve distinct alternatives", () => {
  const route = interpretAddress({ deliveryLine: "123 26 Highway" }).candidates;
  expect(
    route.find((c) => c.components.streetName === "HIGHWAY 26")?.components
      .streetSuffix,
  ).toBeUndefined();
  expect(
    route.some(
      (c) =>
        c.components.streetName === "26" && c.components.streetSuffix === "HWY",
    ),
  ).toBe(true);
  const directionals = interpretAddress({
    deliveryLine: "123 N Oak St North",
  }).candidates;
  expect(
    directionals.some(
      (c) =>
        c.components.streetName === "OAK" &&
        !c.components.preDirectional &&
        c.components.postDirectional === "N",
    ),
  ).toBe(true);
  expect(
    directionals.some(
      (c) =>
        c.components.preDirectional === "N" &&
        c.components.postDirectional === "N",
    ),
  ).toBe(true);
});

test("compound-unit spans survive compatible Unicode and preserve an existing chain", () => {
  const line = "123 Main St Apt ３－２０４";
  const result = interpretAddress({ deliveryLine: line });
  const compound = result.candidates.find(
    (c) => c.components.secondaryUnits?.length === 2,
  )!;
  expect(compound.components.secondaryUnits).toEqual([
    { designator: "BLDG", number: "3" },
    { designator: "APT", number: "204" },
  ]);
  expect(
    compound.sourceSpans.secondaryUnits?.map((s) => line.slice(s.start, s.end)),
  ).toEqual(["３", "２０４"]);
  const explicit = interpretAddress({
    deliveryLine: "123 Main St Bldg A Apt 3-204",
  });
  expect(
    explicit.candidates.every(
      (c) => !c.assumptions.includes("compound-unit-is-building-and-unit"),
    ),
  ).toBe(true);
});

test("informal designator abbreviations remain literal when no identifier follows", () => {
  const result = interpretAddress({ deliveryLine: "123 Oak Lane SP" });
  expect(
    result.candidates.some((c) => c.components.streetName === "OAK LANE SP"),
  ).toBe(true);
});

test("extracting a directional cannot leave a punctuation-only street name", () => {
  for (const input of ["123 # North Apt 4", "123 # N St Apt 4"]) {
    expect(
      interpretAddress({ deliveryLine: input }).candidates.every((c) =>
        /[\p{L}\p{N}]/u.test(c.components.streetName ?? ""),
      ),
    ).toBe(true);
  }
});

test("a repeated house number can be a feed duplicate but explicit units remain units", () => {
  const result = interpretAddress({ deliveryLine: "123 Oak St 123" });
  expect(
    result.candidates.some(
      (c) =>
        c.components.streetName === "OAK" &&
        !c.components.secondary &&
        c.assumptions.includes("repeated-house-number"),
    ),
  ).toBe(true);
  expect(
    result.candidates.some((c) => c.components.secondary?.number === "123"),
  ).toBe(true);
  const explicit = interpretAddress({ deliveryLine: "123 Oak St Apt 123" });
  expect(
    explicit.candidates.every((c) => c.components.secondary?.number === "123"),
  ).toBe(true);
});

test("floor and unit separators remain covered by evidence", () => {
  for (const line of [
    "123 Main St - Building 2",
    "123 Main St 7B - 2nd Floor",
  ]) {
    const result = interpretAddress({ deliveryLine: line });
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const candidate of result.candidates) {
      const spans = Object.values(candidate.sourceSpans).flat();
      for (const token of result.tokens)
        expect(
          spans.some((s) => s.start <= token.start && s.end >= token.end),
        ).toBe(true);
    }
  }
});

test.each(["Apt 4 123 Main St", "#4 123 Main St", "Building A 123 Main St"])(
  "parses a secondary phrase before its street in %s",
  (line) => {
    const result = interpretAddress({ deliveryLine: line });
    const candidate = result.candidates.find((c) =>
      c.assumptions.includes("secondary-before-house-number"),
    );
    expect(candidate?.components).toMatchObject({
      houseNumber: "123",
      streetName: "MAIN",
      streetSuffix: "ST",
      secondary: { number: line.startsWith("Building") ? "A" : "4" },
    });
    expect(
      line.slice(
        candidate!.sourceSpans.houseNumber!.start,
        candidate!.sourceSpans.houseNumber!.end,
      ),
    ).toBe("123");
    expect(candidate!.sourceSpans.secondary?.start).toBe(0);
  },
);

test("tower chains retain each building identifier and their source spans", () => {
  const line = "123 Main St Bldg 2 Tower East Apt 4";
  const candidate = interpretAddress({ deliveryLine: line }).candidates[0];
  expect(candidate?.components.secondaryUnits).toEqual([
    { designator: "BLDG", number: "2" },
    { designator: "TOWER", number: "EAST" },
    { designator: "APT", number: "4" },
  ]);
  expect(
    candidate.sourceSpans.secondaryUnits?.map((s) =>
      line.slice(s.start, s.end),
    ),
  ).toEqual(["Bldg 2", "Tower East", "Apt 4"]);
  expect(
    interpretAddress({ deliveryLine: "123 Ocean Tower" }).candidates.some(
      (c) => c.components.streetName === "OCEAN TOWER",
    ),
  ).toBe(true);
});

test.each([
  "123 Water Tower Rd 4",
  "123 Water Tower Rd Apt 4",
  "123 Bay Cove Tower #4",
  "123 Bay Cove Tower 4",
])("retains tower as part of the street name in %s", (line) => {
  expect(
    interpretAddress({ deliveryLine: line }).candidates.some(
      (c) =>
        c.components.streetName?.includes("TOWER") &&
        c.components.secondary?.number === "4",
    ),
  ).toBe(true);
});
