import { describe, expect, test } from "vitest";
import { interpretAddress } from "../src/index";

describe("interpretAddress", () => {
  test("returns one interpretation when a secondary unit is explicit", () => {
    const interpretation = interpretAddress({
      deliveryLine: "123 Main St Apt 231-B",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
    });

    expect(interpretation.candidates).toHaveLength(1);
    expect(interpretation.candidates[0]?.components).toEqual({
      houseNumber: "123",
      streetName: "MAIN",
      streetSuffix: "ST",
      secondary: {
        designator: "APT",
        number: "231-B",
      },
      city: "AUSTIN",
      state: "TX",
      postalCode: "78701",
    });
  });

  test("preserves raw delivery-line tokens and their source spans", () => {
    const interpretation = interpretAddress({
      deliveryLine: "123-45 O'Connor Ave #231",
      city: "Queens",
      state: "NY",
    });

    expect(interpretation.tokens).toEqual([
      { raw: "123-45", normalized: "123-45", start: 0, end: 6 },
      { raw: "O'Connor", normalized: "O'CONNOR", start: 7, end: 15 },
      { raw: "Ave", normalized: "AVE", start: 16, end: 19 },
      { raw: "#", normalized: "#", start: 20, end: 21 },
      { raw: "231", normalized: "231", start: 21, end: 24 },
    ]);
    expect(interpretation.candidates[0]?.components).toEqual({
      houseNumber: "123-45",
      streetName: "O'CONNOR",
      streetSuffix: "AVE",
      secondary: {
        designator: "#",
        number: "231",
      },
      city: "QUEENS",
      state: "NY",
      postalCode: undefined,
    });
  });

  test("normalizes abbreviation punctuation without changing raw tokens", () => {
    const interpretation = interpretAddress({
      deliveryLine: "100 O'Connor Ave. Apt. 4",
      city: "San Jose",
      state: "CA",
    });

    expect(interpretation.tokens.map(({ raw, normalized }) => ({ raw, normalized }))).toEqual([
      { raw: "100", normalized: "100" },
      { raw: "O'Connor", normalized: "O'CONNOR" },
      { raw: "Ave.", normalized: "AVE" },
      { raw: "Apt.", normalized: "APT" },
      { raw: "4", normalized: "4" },
    ]);
    expect(interpretation.candidates).toHaveLength(1);
    expect(interpretation.candidates[0]?.components).toMatchObject({
      houseNumber: "100",
      streetName: "O'CONNOR",
      streetSuffix: "AVE",
      secondary: { designator: "APT", number: "4" },
    });
  });

  test("keeps both meanings of a bare trailing unit-shaped token", () => {
    const interpretation = interpretAddress({
      deliveryLine: "3637 Snell Ave 231",
      city: "San Jose",
      state: "CA",
      postalCode: "95136",
    });

    expect(
      interpretation.candidates.map(({ id, assumptions, components }) => ({
        id,
        assumptions,
        components,
      })),
    ).toEqual([
      {
        id: "trailing-token-as-unit",
        assumptions: ["trailing-token-is-unit"],
        components: {
          houseNumber: "3637",
          streetName: "SNELL",
          streetSuffix: "AVE",
          secondary: { number: "231" },
          city: "SAN JOSE",
          state: "CA",
          postalCode: "95136",
        },
      },
      {
        id: "trailing-token-as-street",
        assumptions: ["trailing-token-is-street"],
        components: {
          houseNumber: "3637",
          streetName: "SNELL AVE 231",
          city: "SAN JOSE",
          state: "CA",
          postalCode: "95136",
        },
      },
    ]);
    expect(interpretation.candidates[0]?.sourceSpans).toEqual({
      houseNumber: { start: 0, end: 4 },
      street: { start: 5, end: 14 },
      secondary: { start: 15, end: 18 },
    });
    expect(interpretation.candidates[1]?.sourceSpans).toEqual({
      houseNumber: { start: 0, end: 4 },
      street: { start: 5, end: 18 },
    });
  });

  test("does not resolve route-shaped text as a unit without index evidence", () => {
    const interpretation = interpretAddress({
      deliveryLine: "123 State Spur 5",
      city: "Houston",
      state: "TX",
    });

    expect(interpretation.candidates.map((candidate) => candidate.id)).toEqual([
      "trailing-token-as-unit",
      "trailing-token-as-street",
    ]);
    expect(interpretation.candidates[0]?.components).toMatchObject({
      streetName: "STATE",
      streetSuffix: "SPUR",
      secondary: { number: "5" },
    });
    expect(interpretation.candidates[1]?.components).toMatchObject({
      streetName: "STATE SPUR 5",
    });
    expect(interpretation.candidates[1]?.components.secondary).toBeUndefined();
  });

  test.each([
    "123 Abbey Road 4",
    "123 Desert Willow Loop 4",
    "100 State Turnpike 12",
    "123 Old Highway 12",
    "123 PR Carr 2",
  ])("preserves both interpretations of route-like %s", (deliveryLine) => {
    const interpretation = interpretAddress({
      deliveryLine,
      city: "Test City",
      state: "TX",
    });

    expect(interpretation.candidates.map((candidate) => candidate.id)).toEqual([
      "trailing-token-as-unit",
      "trailing-token-as-street",
    ]);
    expect(interpretation.candidates[1]?.components.streetName).toBe(
      deliveryLine.split(" ").slice(1).join(" ").toUpperCase(),
    );
  });

  test.each(["231-B", "B231", "231-233"])(
    "recognizes %s as a bare unit-shaped token without choosing it",
    (unitNumber) => {
      const interpretation = interpretAddress({
        deliveryLine: `123 Main St ${unitNumber}`,
        city: "Austin",
        state: "TX",
      });

      expect(interpretation.candidates).toHaveLength(2);
      expect(interpretation.candidates[0]?.components.secondary).toEqual({
        number: unitNumber,
      });
      expect(interpretation.candidates[1]?.components.streetName).toBe(
        `MAIN ST ${unitNumber}`,
      );
    },
  );

  test("ignores trailing punctuation on a bare unit-shaped token", () => {
    const interpretation = interpretAddress({
      deliveryLine: "123 Main St 231,",
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.tokens[3]).toEqual({
      raw: "231,",
      normalized: "231",
      start: 12,
      end: 16,
    });
    expect(interpretation.candidates).toHaveLength(2);
    expect(interpretation.candidates[0]?.components.secondary).toEqual({
      number: "231",
    });
  });

  test("returns one literal candidate for an ordinary street address", () => {
    const interpretation = interpretAddress({
      deliveryLine: "123 Main Street",
      city: "Austin",
      state: "tx",
      postalCode: "78701-1234",
    });

    expect(
      interpretation.candidates.map(({ id, assumptions, components }) => ({
        id,
        assumptions,
        components,
      })),
    ).toEqual([
      {
        id: "literal",
        assumptions: [],
        components: {
          houseNumber: "123",
          streetName: "MAIN",
          streetSuffix: "ST",
          city: "AUSTIN",
          state: "TX",
          postalCode: "78701-1234",
        },
      },
    ]);
  });

  test("keeps a suffixless street as one literal candidate", () => {
    const interpretation = interpretAddress({
      deliveryLine: "10 Via Del Paradiso",
      city: "Rancho Mirage",
      state: "CA",
      postalCode: "92270",
    });

    expect(interpretation.candidates).toHaveLength(1);
    expect(interpretation.candidates[0]?.components).toEqual({
      houseNumber: "10",
      streetName: "VIA DEL PARADISO",
      city: "RANCHO MIRAGE",
      state: "CA",
      postalCode: "92270",
    });
    expect(interpretation.candidates[0]?.assumptions).toEqual([]);
  });

  test.each([
    ["Boulevard", "BLVD"],
    ["Circle", "CIR"],
    ["Court", "CT"],
    ["Drive", "DR"],
    ["Lane", "LN"],
    ["Place", "PL"],
    ["Parkway", "PKWY"],
    ["Terrace", "TER"],
    ["Trail", "TRL"],
    ["Way", "WAY"],
  ])("normalizes the %s street suffix", (rawSuffix, streetSuffix) => {
    const interpretation = interpretAddress({
      deliveryLine: `123 Main ${rawSuffix}`,
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.candidates).toHaveLength(1);
    expect(interpretation.candidates[0]?.components).toMatchObject({
      streetName: "MAIN",
      streetSuffix,
    });
  });

  test.each([
    ["Allee", "ALY"],
    ["Annex", "ANX"],
    ["Bayou", "BYU"],
    ["Bottom", "BTM"],
    ["Causeway", "CSWY"],
    ["Crescent", "CRES"],
    ["Expressway", "EXPY"],
    ["Freeway", "FWY"],
    ["Junction", "JCT"],
    ["Mountain", "MTN"],
    ["Plaza", "PLZ"],
    ["Ridge", "RDG"],
    ["Route", "RTE"],
    ["Square", "SQ"],
    ["Station", "STA"],
    ["Viaduct", "VIA"],
    ["Vista", "VIS"],
    ["Well", "WL"],
  ])("uses the USPS abbreviation for %s", (rawSuffix, streetSuffix) => {
    const interpretation = interpretAddress({
      deliveryLine: `123 Main ${rawSuffix}`,
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.candidates[0]?.components).toMatchObject({
      streetName: "MAIN",
      streetSuffix,
    });
  });

  test.each([
    ["Cove", "CV"],
    ["Run", "RUN"],
    ["Path", "PATH"],
    ["Pass", "PASS"],
    ["Point", "PT"],
    ["Bend", "BND"],
    ["Trace", "TRCE"],
    ["Crossing", "XING"],
    ["Park", "PARK"],
    ["Pike", "PIKE"],
    ["View", "VW"],
    ["Walk", "WALK"],
    ["Glen", "GLN"],
    ["Creek", "CRK"],
    ["Landing", "LNDG"],
    ["Heights", "HTS"],
    ["Grove", "GRV"],
    ["Hill", "HL"],
    ["Row", "ROW"],
  ])("recognizes the dataset-reported USPS %s suffix", (rawSuffix, streetSuffix) => {
    const interpretation = interpretAddress({
      deliveryLine: `123 Main ${rawSuffix}`,
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.candidates[0]?.components).toMatchObject({
      streetName: "MAIN",
      streetSuffix,
    });
  });

  test("does not absorb a directional when the street uses Cove", () => {
    const interpretation = interpretAddress({
      deliveryLine: "26027 S Outrider Cove",
      city: "Test City",
      state: "TX",
    });

    expect(interpretation.candidates[0]?.components).toMatchObject({
      preDirectional: "S",
      streetName: "OUTRIDER",
      streetSuffix: "CV",
    });
  });

  test("surfaces trailing-unit ambiguity when the street uses Crossing", () => {
    const interpretation = interpretAddress({
      deliveryLine: "3309 Wyndham Crossing 3176",
      city: "Test City",
      state: "TX",
    });

    expect(interpretation.candidates.map((candidate) => candidate.id)).toEqual([
      "trailing-token-as-unit",
      "trailing-token-as-street",
    ]);
    expect(interpretation.candidates[0]?.components).toMatchObject({
      streetName: "WYNDHAM",
      streetSuffix: "XING",
      secondary: { number: "3176" },
    });
  });

  test("separates pre- and post-directionals from the street name", () => {
    const interpretation = interpretAddress({
      deliveryLine: "123 N. Main St. SW",
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.candidates).toHaveLength(1);
    expect(interpretation.candidates[0]?.components).toEqual({
      houseNumber: "123",
      preDirectional: "N",
      streetName: "MAIN",
      streetSuffix: "ST",
      postDirectional: "SW",
      city: "AUSTIN",
      state: "TX",
      postalCode: undefined,
    });
  });

  test("normalizes full-word pre- and post-directionals", () => {
    const interpretation = interpretAddress({
      deliveryLine: "123 North Main Street Southwest",
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.candidates).toHaveLength(1);
    expect(interpretation.candidates[0]?.components).toMatchObject({
      preDirectional: "N",
      streetName: "MAIN",
      streetSuffix: "ST",
      postDirectional: "SW",
    });
  });

  test("keeps a post-directional before an explicit unit", () => {
    const interpretation = interpretAddress({
      deliveryLine: "5800 Oakdale Road SE #120",
      city: "Mableton",
      state: "GA",
      postalCode: "30126",
    });

    expect(interpretation.candidates).toHaveLength(1);
    expect(interpretation.candidates[0]?.components).toEqual({
      houseNumber: "5800",
      streetName: "OAKDALE",
      streetSuffix: "RD",
      postDirectional: "SE",
      secondary: { designator: "#", number: "120" },
      city: "MABLETON",
      state: "GA",
      postalCode: "30126",
    });
  });

  test("preserves a multi-token explicit unit number", () => {
    const interpretation = interpretAddress({
      deliveryLine: "123 Main St Apt 231 B",
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.candidates).toHaveLength(1);
    expect(interpretation.candidates[0]?.components.secondary).toEqual({
      designator: "APT",
      number: "231 B",
    });
    expect(interpretation.candidates[0]?.sourceSpans.secondary).toEqual({
      start: 12,
      end: 21,
    });
  });

  test("keeps both meanings of a bare token after a post-directional", () => {
    const interpretation = interpretAddress({
      deliveryLine: "123 Main St NW 4",
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.candidates).toHaveLength(2);
    expect(interpretation.candidates[0]?.components).toMatchObject({
      streetName: "MAIN",
      streetSuffix: "ST",
      postDirectional: "NW",
      secondary: { number: "4" },
    });
    expect(interpretation.candidates[1]?.components).toMatchObject({
      streetName: "MAIN ST NW 4",
    });
    expect(interpretation.candidates[1]?.components.postDirectional).toBeUndefined();
  });

  test("rejects a delivery line without a house number", () => {
    const interpretation = interpretAddress({
      deliveryLine: "Main St",
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.candidates).toEqual([]);
    expect(interpretation.diagnostics).toEqual(["missing-house-number"]);
  });

  test.each([
    ["Unit", "UNIT"],
    ["Spc", "SPC"],
    ["Ste", "STE"],
    ["Suite", "STE"],
    ["Building", "BLDG"],
    ["Department", "DEPT"],
    ["Floor", "FL"],
    ["Hanger", "HNGR"],
    ["Key", "KEY"],
    ["Lot", "LOT"],
    ["Pier", "PIER"],
    ["Room", "RM"],
    ["Slip", "SLIP"],
    ["Stop", "STOP"],
    ["Trailer", "TRLR"],
  ])("recognizes the explicit %s unit designator", (rawDesignator, designator) => {
    const interpretation = interpretAddress({
      deliveryLine: `123 Main Rd ${rawDesignator} B231`,
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.candidates).toHaveLength(1);
    expect(interpretation.candidates[0]?.components).toMatchObject({
      streetName: "MAIN",
      streetSuffix: "RD",
      secondary: { designator, number: "B231" },
    });
  });

  test("accepts an approved unit designator that does not require a number", () => {
    const interpretation = interpretAddress({
      deliveryLine: "123 Main St Basement",
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.candidates).toHaveLength(1);
    expect(interpretation.candidates[0]?.components).toMatchObject({
      streetName: "MAIN",
      streetSuffix: "ST",
      secondary: { designator: "BSMT" },
    });
    expect(
      interpretation.candidates[0]?.components.secondary?.number,
    ).toBeUndefined();
  });

  test.each([
    ["Front", "FRNT"],
    ["Lobby", "LBBY"],
    ["Lower", "LOWR"],
    ["Office", "OFC"],
    ["Penthouse", "PH"],
    ["Rear", "REAR"],
    ["Side", "SIDE"],
    ["Upper", "UPPR"],
  ])(
    "accepts the numberless USPS %s unit designator",
    (rawDesignator, designator) => {
      const interpretation = interpretAddress({
        deliveryLine: `123 Main St ${rawDesignator}`,
        city: "Austin",
        state: "TX",
      });

      expect(interpretation.candidates[0]?.components.secondary).toEqual({
        designator,
      });
    },
  );

  test("does not treat a unit keyword inside the street name as a designator", () => {
    const interpretation = interpretAddress({
      deliveryLine: "123 Unit St",
      city: "Austin",
      state: "TX",
    });

    expect(interpretation.candidates).toHaveLength(1);
    expect(interpretation.candidates[0]?.components).toMatchObject({
      streetName: "UNIT",
      streetSuffix: "ST",
    });
    expect(interpretation.candidates[0]?.components.secondary).toBeUndefined();
  });
});
