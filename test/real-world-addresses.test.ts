import { describe, expect, test } from "vitest";
import {
  createAddressResolver,
  interpretAddress,
  interpretFullAddress,
} from "../src/index";

test.each(["Apt 4", "#4", "Building A"].flatMap((prefix) =>
  ["\n", ", "].map((separator) => ({ prefix, separator })),
))("preserves a leading secondary line in full addresses: $prefix $separator", ({ prefix, separator }) => {
  for (const spellingAlternatives of [false, true]) {
    for (const ending of ["", ", Austin, TX 78701"]) {
      const input = `${prefix}${separator}12 Main St${ending}`;
      const result = interpretFullAddress(input, { spellingAlternatives });
      expect(result.diagnostics).toEqual([]);
      expect(result.candidates).toHaveLength(1);
      const candidate = result.candidates[0];
      expect(candidate.components).toMatchObject({
        houseNumber: "12", streetName: "MAIN", streetSuffix: "ST",
        secondary: { number: prefix === "Building A" ? "A" : "4" },
        ...(ending ? { city: "AUSTIN", state: "TX", postalCode: "78701" } : {}),
      });
      expect(candidate.assumptions).toContain("secondary-before-house-number");
      for (const [field, expected] of [["houseNumber", "12"], ["secondary", prefix]] as const) {
        const source = candidate.sourceSpans[field]!;
        expect(input.slice(source.start, source.end).replace(/,$/, "")).toBe(expected);
      }
    }
  }
});

test("leading secondary lines do not absorb explicit locality separators", () => {
  const result = interpretFullAddress("Apt 4\n12 Main St, Rural Hall, NC 27045");
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].components).toMatchObject({
    streetName: "MAIN", city: "RURAL HALL", state: "NC", postalCode: "27045",
  });
});

test.each(["123, Austin TX 78701", "123, Main St"])(
  "does not absorb a locality separator immediately after the house number: %s",
  (input) => {
    expect(interpretFullAddress(input).candidates).toHaveLength(0);
  },
);

describe("US delivery formats", () => {
  test.each([
    [
      "123 1/2 Main St",
      { houseNumber: "123 1/2", streetName: "MAIN", streetSuffix: "ST" },
    ],
    ["123½ Main St", { houseNumber: "123 1/2", streetName: "MAIN" }],
    ["123 ½ Main St", { houseNumber: "123 1/2", streetName: "MAIN" }],
    [
      "N112W16500 Mequon Rd",
      { houseNumber: "N112W16500", streetName: "MEQUON" },
    ],
    [
      "N112 W16500 Mequon Rd",
      { houseNumber: "N112 W16500", streetName: "MEQUON" },
    ],
    ["W123N456 Main St", { houseNumber: "W123N456", streetName: "MAIN" }],
    ["W123 N456 Main St", { houseNumber: "W123 N456", streetName: "MAIN" }],
    ["12N345 Main St", { houseNumber: "12N345", streetName: "MAIN" }],
    ["123-A Main St", { houseNumber: "123-A", streetName: "MAIN" }],
    ["123/125 Main St", { houseNumber: "123/125", streetName: "MAIN" }],
    ["123 125 Main St", { houseNumber: "123 125", streetName: "MAIN" }],
    [
      "123 N West St",
      { preDirectional: "N", streetName: "WEST", streetSuffix: "ST" },
    ],
    [
      "123 N West River Rd",
      { preDirectional: "N", streetName: "WEST RIVER", streetSuffix: "RD" },
    ],
    ["123 North Side Dr", { streetName: "NORTH SIDE", streetSuffix: "DR" }],
    [
      "123 SW Village Apt 4",
      {
        preDirectional: "SW",
        streetName: "VILLAGE",
        secondary: { designator: "APT", number: "4" },
      },
    ],
    ["123 Broadway W", { streetName: "BROADWAY", postDirectional: "W" }],
    [
      "123 Main St B",
      { streetName: "MAIN", streetSuffix: "ST", secondary: { number: "B" } },
    ],
    [
      "123 Main St AB",
      { streetName: "MAIN", streetSuffix: "ST", secondary: { number: "AB" } },
    ],
    [
      "123 Main St 4/5",
      { streetName: "MAIN", streetSuffix: "ST", secondary: { number: "4/5" } },
    ],
    [
      "123 Broadway 4B",
      { streetName: "BROADWAY", secondary: { number: "4B" } },
    ],
    [
      "123 Main St 2nd Floor",
      { streetName: "MAIN", secondary: { designator: "FL", number: "2" } },
    ],
    [
      "123 Main St First Floor",
      { streetName: "MAIN", secondary: { designator: "FL", number: "1" } },
    ],
    [
      "123 Main St # A#4",
      { streetName: "MAIN", secondary: { designator: "#", number: "A#4" } },
    ],
    [
      "123 Main St Unit 1#PH",
      { streetName: "MAIN", secondary: { designator: "UNIT", number: "1#PH" } },
    ],
    [
      "123 Main St Bldg A 2nd Floor",
      {
        streetName: "MAIN",
        secondaryUnits: [
          { designator: "BLDG", number: "A" },
          { designator: "FL", number: "2" },
        ],
      },
    ],
    [
      "123 North Ave Apt 4",
      {
        streetName: "NORTH",
        streetSuffix: "AVE",
        secondary: { designator: "APT", number: "4" },
      },
    ],
    [
      "123 North East Main Street South West",
      {
        preDirectional: "NE",
        streetName: "MAIN",
        streetSuffix: "ST",
        postDirectional: "SW",
      },
    ],
    ["123 O’Connor Av", { streetName: "O'CONNOR", streetSuffix: "AVE" }],
    ["123 Canyon Gardens", { streetName: "CANYON", streetSuffix: "GDNS" }],
    ["123 Main St Apt #4", { secondary: { designator: "APT", number: "4" } }],
    ["123 Main St PMB 42", { secondary: { designator: "PMB", number: "42" } }],
    ["123 Main St Apt PH", { secondary: { designator: "APT", number: "PH" } }],
    ["123 Main St #PH", { secondary: { designator: "#", number: "PH" } }],
    [
      "123 Main St Bsmt Apt",
      { secondary: { designator: "BSMT", number: "APT" } },
    ],
    [
      "123 Main St Upper Rear",
      { secondary: { designator: "UPPR", number: "REAR" } },
    ],
    [
      "123 Main St Bldg A Apt 4",
      {
        secondary: { designator: "APT", number: "4" },
        secondaryUnits: [
          { designator: "BLDG", number: "A" },
          { designator: "APT", number: "4" },
        ],
      },
    ],
    ["PO Box 00123", { kind: "po-box", boxNumber: "00123" }],
    ["P.O. Box 123", { kind: "po-box", boxNumber: "123" }],
    ["Post Office Box 123", { kind: "po-box", boxNumber: "123" }],
    [
      "RR 2 Box 152",
      { kind: "rural-route", routeNumber: "2", boxNumber: "152" },
    ],
    [
      "Rural Route 2 Box 152",
      { kind: "rural-route", routeNumber: "2", boxNumber: "152" },
    ],
    [
      "HC 68 Box 23A",
      { kind: "highway-contract", routeNumber: "68", boxNumber: "23A" },
    ],
    [
      "PSC 123 Box 4567",
      {
        kind: "military",
        militaryUnit: "PSC",
        routeNumber: "123",
        boxNumber: "4567",
      },
    ],
    ["General Delivery", { kind: "general-delivery" }],
  ])("interprets %s", (deliveryLine, expected) => {
    expect(
      interpretAddress({ deliveryLine }).candidates.map((c) => c.components),
    ).toEqual(expect.arrayContaining([expect.objectContaining(expected)]));
  });

  test.each([
    "123 /",
    "abc1! Main St",
    "123 , ;",
    "123 Main St Apt",
    "123 Main St Rear #",
    "PO Box",
    "RR 2 Box",
  ])("does not silently accept malformed input %s", (deliveryLine) => {
    expect(interpretAddress({ deliveryLine }).candidates).toHaveLength(0);
  });

  test("preserves a street-name reading when a unit word is followed by a street suffix", () => {
    const result = interpretAddress({
      deliveryLine: "123 Main Street Road Apt 4",
    });
    expect(result.candidates.map((c) => c.components)).toContainEqual(
      expect.objectContaining({
        streetName: "MAIN STREET",
        streetSuffix: "RD",
        secondary: { designator: "APT", number: "4" },
      }),
    );
    const collision = interpretAddress({
      deliveryLine: "123 Main St Unit Road",
    });
    expect(collision.candidates.map((c) => c.components)).toContainEqual(
      expect.objectContaining({
        streetName: "MAIN ST UNIT",
        streetSuffix: "RD",
      }),
    );
    expect(
      interpretAddress({
        deliveryLine: "123 Main St Unit Road Apt 4",
      }).candidates.map((c) => c.components),
    ).toContainEqual(
      expect.objectContaining({
        streetName: "MAIN ST UNIT",
        streetSuffix: "RD",
        secondary: { designator: "APT", number: "4" },
      }),
    );
  });

  test("normalizes structured locality fields consistently", () => {
    expect(
      interpretAddress({
        deliveryLine: "123 Main St",
        city: "  San   José ",
        state: "California",
        postalCode: "951121234",
      }).candidates[0]?.components,
    ).toMatchObject({
      city: "SAN JOSÉ",
      state: "CA",
      postalCode: "95112-1234",
    });
  });
});

describe("full address boundaries", () => {
  test.each([
    [
      "123 Main St,Austin,TX 78701",
      {
        houseNumber: "123",
        streetName: "MAIN",
        city: "AUSTIN",
        state: "TX",
        postalCode: "78701",
      },
    ],
    ["123 Main St Austin", { streetName: "MAIN", city: "AUSTIN" }],
    [
      "123 Main St, Key West, FL 33040",
      { streetName: "MAIN", city: "KEY WEST", state: "FL" },
    ],
    [
      "123 Main St, Front Royal, VA 22630",
      { streetName: "MAIN", city: "FRONT ROYAL", state: "VA" },
    ],
    [
      "123 Main St, Upper Marlboro, MD 20772",
      { streetName: "MAIN", city: "UPPER MARLBORO", state: "MD" },
    ],
    [
      "123 Main St, Austin, TX 78701, USA",
      {
        streetName: "MAIN",
        city: "AUSTIN",
        state: "TX",
        postalCode: "78701",
        country: "US",
      },
    ],
    [
      "123 Main St, Austin, TX 787011234",
      { streetName: "MAIN", city: "AUSTIN", postalCode: "78701-1234" },
    ],
    [
      "PO Box 123, Boston, MA 02108",
      {
        kind: "po-box",
        boxNumber: "123",
        city: "BOSTON",
        state: "MA",
        postalCode: "02108",
      },
    ],
    [
      "RR 2 Box 152, Ponce, PR 00731",
      { kind: "rural-route", city: "PONCE", state: "PR" },
    ],
    [
      "PSC 123 Box 4567 APO AE 09012",
      { kind: "military", city: "APO", state: "AE", postalCode: "09012" },
    ],
    [
      "General Delivery, Nome, AK 99762",
      { kind: "general-delivery", city: "NOME", state: "AK" },
    ],
    [
      "URB Las Gladiolas\n150 Calle A\nSan Juan PR 00926",
      {
        houseNumber: "150",
        streetName: "CALLE A",
        urbanization: "LAS GLADIOLAS",
        city: "SAN JUAN",
        state: "PR",
      },
    ],
    [
      "123 Main St\nApt 4\nAustin TX 78701",
      {
        streetName: "MAIN",
        secondary: { designator: "APT", number: "4" },
        city: "AUSTIN",
        state: "TX",
      },
    ],
    [
      "123 Main St\n2nd Floor\nAustin TX 78701",
      {
        streetName: "MAIN",
        secondary: { designator: "FL", number: "2" },
        city: "AUSTIN",
        state: "TX",
      },
    ],
  ])("interprets %s", (input, expected) => {
    expect(
      interpretFullAddress(input).candidates.map((c) => c.components),
    ).toEqual(expect.arrayContaining([expect.objectContaining(expected)]));
  });

  test("does not interpret an explicit apartment line as a city", () => {
    expect(
      interpretFullAddress(
        "123 Main St\nApt 4\nAustin TX 78701",
      ).candidates.some((c) => c.components.city?.startsWith("APT")),
    ).toBe(false);
  });

  test("does not invent localities from a clear suffixed delivery line", () => {
    expect(interpretFullAddress("123 North Main Street").candidates).toEqual(
      interpretAddress({ deliveryLine: "123 North Main Street" }).candidates,
    );
  });

  test("honors locality delimiters across candidate endings", () => {
    const result = interpretFullAddress("123 Main St, Rural Hall, NC 27045");
    expect(
      result.candidates.every(
        (candidate) => candidate.components.streetName === "MAIN",
      ),
    ).toBe(true);
    expect(result.candidates[0]?.components).toMatchObject({
      city: "RURAL HALL",
      state: "NC",
    });
  });
});

describe("runtime and resolver boundaries", () => {
  test.each([
    undefined,
    null,
    42,
    {},
    { deliveryLine: null },
    { deliveryLine: "123 Main St", city: 42 },
  ])("diagnoses invalid runtime input %j", (input) => {
    expect(() => interpretAddress(input as never)).not.toThrow();
    expect(interpretAddress(input as never).candidates).toHaveLength(0);
  });

  test("rejects oversized input before generating candidates", () => {
    const result = interpretFullAddress(`123 ${"Main ".repeat(2000)}`);
    expect(result.candidates).toHaveLength(0);
    expect(result.diagnostics).toContain("input-too-long");
  });

  test.each([
    [{ candidateId: "foreign-candidate", entityId: "property-1", value: 1 }],
    [{ candidateId: "literal", entityId: "", value: 1 }],
    [{ candidateId: "literal", entityId: undefined, value: 1 }],
  ])("rejects untrustworthy adapter evidence %j", async (match) => {
    const resolver = createAddressResolver({
      async lookupCandidates() {
        return [match] as never;
      },
    });
    await expect(
      resolver.resolve({ deliveryLine: "123 Main St" }),
    ).rejects.toThrow();
  });
});
