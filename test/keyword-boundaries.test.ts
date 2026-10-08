import { expect, test } from "vitest";
import { interpretAddress, interpretFullAddress } from "../src/index";

test("a keyword inside a suffixed street name does not hide a trailing unit", () => {
  const deliveryLine = "12 Harbor Key Dr 204";
  const result = interpretAddress({ deliveryLine }, { spellingAlternatives: false });
  const expected = [
    { houseNumber: "12", streetName: "HARBOR KEY", streetSuffix: "DR", secondary: { number: "204" } },
    { houseNumber: "12", streetName: "HARBOR KEY DR 204" },
    { houseNumber: "12", streetName: "HARBOR", secondary: { designator: "KEY", number: "DR 204" } },
  ];
  expect(result.candidates.map(candidate => candidate.components)).toEqual(expect.arrayContaining(expected));
  expect(result.candidates).toHaveLength(expected.length);
  const recovered = result.candidates.find(candidate => candidate.components.streetSuffix === "DR");
  expect(deliveryLine.slice(recovered!.sourceSpans.street!.start, recovered!.sourceSpans.street!.end)).toBe("Harbor Key Dr");
  expect(deliveryLine.slice(recovered!.sourceSpans.secondary!.start, recovered!.sourceSpans.secondary!.end)).toBe("204");
});

test.each(["Key", "Pier", "Hangar", "Unit", "Lot"])("later suffixes remain available after %s in a street name", keyword => {
  for (const spellingAlternatives of [false, true]) {
    const deliveryLine = `12 Harbor ${keyword} Dr 204`;
    const readings = interpretAddress({ deliveryLine }, { spellingAlternatives }).candidates;
    expect(readings.map(c => c.components)).toContainEqual(expect.objectContaining({
      houseNumber: "12", streetName: `HARBOR ${keyword.toUpperCase()}`, streetSuffix: "DR", secondary: { number: "204" },
    }));
    if (!spellingAlternatives) expect(readings).toHaveLength(3);
  }
});

test.each(["204 B", "A 204 B", "204-B"])("retains the complete trailing identifier %s", number => {
  const deliveryLine = `12 Harbor Key Dr ${number}`;
  const candidates = interpretAddress({ deliveryLine }, { spellingAlternatives: false }).candidates;
  const reading = candidates.find(c => c.components.streetName === "HARBOR KEY" && c.components.streetSuffix === "DR" && c.components.secondary?.number === number);
  expect(reading).toBeDefined();
  const evidence = reading!.sourceSpans.secondary!;
  expect(deliveryLine.slice(evidence.start, evidence.end)).toBe(number);
});

test.each(["NW", "North West"])("post-directional %s does not hide the later suffix", direction => {
  const deliveryLine = `12 Harbor Key Dr ${direction} 204`;
  const candidates = interpretAddress({ deliveryLine }, { spellingAlternatives: false }).candidates;
  expect(candidates.map(c => c.components)).toContainEqual(expect.objectContaining({houseNumber: "12", streetName: "HARBOR KEY", streetSuffix: "DR", postDirectional: "NW", secondary: {number: "204"}}));
});

test("the recovered unit composes with an ordinal floor and preserves the whole chain", () => {
  const deliveryLine = "12 Harbor Key Dr 204 2nd Floor";
  const candidates = interpretAddress({deliveryLine}, {spellingAlternatives: false}).candidates;
  const reading = candidates.find(c => c.components.streetName === "HARBOR KEY" && c.components.streetSuffix === "DR");
  expect(reading?.components.secondaryUnits).toEqual([{number: "204"}, {designator: "FL", number: "2"}]);
  expect(reading?.sourceSpans.secondaryUnits?.map(s => deliveryLine.slice(s.start, s.end))).toEqual(["204", "2nd Floor"]);
});

test.each([false, true])("full-address parsing keeps locality and keyword-bearing street names, spelling %s", spellingAlternatives => {
  const input = "12 Harbor Key Dr 204, Key West, FL 33040";
  const readings = interpretFullAddress(input, {spellingAlternatives}).candidates;
  const reading = readings.find(c => c.components.streetName === "HARBOR KEY" && c.components.secondary?.number === "204" && c.components.city === "KEY WEST");
  expect(reading?.components).toMatchObject({houseNumber: "12", streetSuffix: "DR", state: "FL", postalCode: "33040"});
  expect(input.slice(reading!.sourceSpans.street!.start, reading!.sourceSpans.street!.end)).toBe("Harbor Key Dr");
});

test.each([
  ["12 Oak St Key 204", 1],
  ["12 Oak St Apt Key", 2],
  ["12 Oak St Bldg A Apt 204", 1],
  ["12 Harbor Key 204", 2],
  ["12 Harbor Key NW 204", 2],
  ["12 Harbor Key North West 204", 2],
  ["12 Harbor Apt 204", 2],
] as const)("does not add a bare-unit reading without a later suffix: %s", (deliveryLine, size) => {
  const candidates = interpretAddress({deliveryLine}, {spellingAlternatives: false}).candidates;
  expect(candidates).toHaveLength(size);
  expect(candidates.every(c => c.components.secondary === undefined || c.components.secondary.designator !== undefined)).toBe(true);
});
