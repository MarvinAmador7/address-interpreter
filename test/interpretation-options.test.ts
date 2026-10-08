import { expect, test } from "vitest";
import {
  interpretAddress,
  interpretFullAddress,
  type AddressInterpretationOptions,
} from "../src/index";

const observedSpellings: AddressInterpretationOptions = {
  spellingAlternatives: false,
};

test.each([
  ["123 First St", "FIRST", "1ST"],
  ["123 Rocky Pt Rd", "ROCKY PT", "ROCKY POINT"],
  ["123 Lakeview Dr", "LAKEVIEW", "LAKE VIEW"],
  ["123 O'Neil Rd", "O'NEIL", "ONEIL"],
  ["123 CR 12", "CR 12", "COUNTY ROAD 12"],
])(
  "street spelling expansion is optional: %s",
  (deliveryLine, observed, alias) => {
    const input = { deliveryLine };
    const expanded = interpretAddress(input);
    expect(interpretAddress(input, { spellingAlternatives: true })).toEqual(
      expanded,
    );
    const literal = interpretAddress(input, observedSpellings);
    expect(
      literal.candidates.some((c) => c.components.streetName === observed),
    ).toBe(true);
    expect(
      literal.candidates.some((c) => c.components.streetName === alias),
    ).toBe(false);
    expect(
      expanded.candidates.some((c) => c.components.streetName === alias),
    ).toBe(true);
    expect(literal.tokens).toEqual(expanded.tokens);
  },
);

test("disabling spelling alternatives preserves normalization and grammatical ambiguity", () => {
  const normalized = interpretAddress(
    { deliveryLine: "123 N. Main Boulevard Apt. B12" },
    observedSpellings,
  );
  expect(normalized.candidates.map((c) => c.components)).toEqual([
    {
      houseNumber: "123",
      preDirectional: "N",
      streetName: "MAIN",
      streetSuffix: "BLVD",
      secondary: { designator: "APT", number: "B12" },
    },
  ]);
  const ambiguous = interpretAddress(
    { deliveryLine: "123 North East St" },
    observedSpellings,
  );
  expect(ambiguous.candidates.map((c) => c.components)).toEqual([
    {
      houseNumber: "123",
      preDirectional: "N",
      streetName: "EAST",
      streetSuffix: "ST",
    },
    { houseNumber: "123", streetName: "NORTH EAST", streetSuffix: "ST" },
  ]);
});

test("feed repairs remain available without spelling alternatives", () => {
  const joined = interpretAddress(
    { deliveryLine: "123 Main Rd4" },
    observedSpellings,
  );
  expect(joined.candidates.map((c) => c.components)).toContainEqual({
    houseNumber: "123",
    streetName: "MAIN",
    streetSuffix: "RD",
    secondary: { number: "4" },
  });
  const repeated = interpretAddress(
    { deliveryLine: "123 Main Road Rd" },
    observedSpellings,
  );
  expect(repeated.candidates.map((c) => c.components.streetName)).toEqual([
    "MAIN ROAD",
    "MAIN",
  ]);
});

test("opaque units and inferred building/unit chains survive without punctuation aliases", () => {
  const input = { deliveryLine: "123 Lakeview Dr Unit A-204" };
  const literal = interpretAddress(input, observedSpellings);
  expect(literal.candidates.map((c) => c.components)).toEqual([
    {
      houseNumber: "123",
      streetName: "LAKEVIEW",
      streetSuffix: "DR",
      secondary: { designator: "UNIT", number: "A-204" },
    },
    {
      houseNumber: "123",
      streetName: "LAKEVIEW",
      streetSuffix: "DR",
      secondary: { designator: "UNIT", number: "204" },
      secondaryUnits: [
        { designator: "BLDG", number: "A" },
        { designator: "UNIT", number: "204" },
      ],
    },
  ]);
  expect(
    interpretAddress(input).candidates.some(
      (c) => c.components.secondary?.number === "A204",
    ),
  ).toBe(true);
  const chain = literal.candidates[1];
  expect(
    chain.sourceSpans.secondaryUnits?.map((span) =>
      input.deliveryLine.slice(span.start, span.end),
    ),
  ).toEqual(["A", "204"]);
});

test("full address boundaries share the selected spelling mode without losing locality or spans", () => {
  const input = "123 Lakeview Dr Apt B12, Austin TX 78701";
  const literal = interpretFullAddress(input, observedSpellings);
  expect(
    literal.candidates.every(
      (c) =>
        c.components.streetName === "LAKEVIEW" &&
        c.components.secondary?.number === "B12",
    ),
  ).toBe(true);
  const withCity = literal.candidates.find(
    (c) => c.components.city === "AUSTIN",
  );
  expect(withCity?.components).toMatchObject({
    state: "TX",
    postalCode: "78701",
  });
  expect(
    input.slice(
      withCity!.sourceSpans.secondary!.start,
      withCity!.sourceSpans.secondary!.end,
    ),
  ).toBe("Apt B12,");
  const expanded = interpretFullAddress(input);
  expect(
    expanded.candidates.some((c) => c.components.streetName === "LAKE VIEW"),
  ).toBe(true);
  expect(
    expanded.candidates.some((c) => c.components.secondary?.number === "B-12"),
  ).toBe(true);
  expect(interpretFullAddress(input, { spellingAlternatives: true })).toEqual(
    expanded,
  );
});

test("spelling options and memoized aliases do not affect subsequent interpretations", () => {
  const first = { deliveryLine: "123 Lakeview Dr Apt B12" };
  const expected = interpretAddress(first);
  interpretAddress(first, observedSpellings);
  interpretFullAddress("7 Rocky Pt Rd Unit D-99, Austin TX 78701");
  expect(interpretAddress(first)).toEqual(expected);
});

test.each([
  null,
  false,
  0,
  "false",
  [],
  { spellingAlternatives: "false" },
  { spellingAlternatives: null },
  { spellingAlternatives: 0 },
])("invalid runtime options return diagnostics: %j", (options) => {
  for (const result of [
    interpretAddress({ deliveryLine: "123 Main St" }, options as never),
    interpretFullAddress("123 Main St, Austin TX 78701", options as never),
  ]) {
    expect(result).toEqual({
      tokens: [],
      candidates: [],
      diagnostics: ["invalid-input"],
    });
  }
});

test("omitted spelling settings and unrelated option keys retain the default behavior", () => {
  const input = { deliveryLine: "123 Lakeview Dr" };
  for (const options of [
    undefined,
    {},
    { spellingAlternatives: undefined },
    { unrelated: true },
  ])
    expect(
      interpretAddress(input, options as AddressInterpretationOptions),
    ).toEqual(interpretAddress(input));
});

test.each([true, false])(
  "candidate exhaustion returns no partial result with spellingAlternatives=%s",
  (spellingAlternatives) => {
    const deliveryLine = `123 North East ${Array(120).fill("KEY").join(" ")} 1`;
    for (const result of [
      interpretAddress({ deliveryLine }, { spellingAlternatives }),
      interpretFullAddress(deliveryLine, { spellingAlternatives }),
    ]) {
      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toEqual(["too-many-candidates"]);
    }
  },
);
