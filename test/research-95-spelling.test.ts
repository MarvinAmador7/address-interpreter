import { expect, test } from "vitest";
import { interpretAddress } from "../src/index";

test.each([
  ["123 J N Ford Rd", "J N FORD", "JN FORD"],
  ["123 J. F. Kennedy Blvd", "J F KENNEDY", "JF KENNEDY"],
  ["123 County Road 142", "COUNTY ROAD 142", "CR-142"],
  ["123 FM 246", "FM 246", "FM-246"],
  ["123 CR 200-C", "CR 200-C", "COUNTY ROAD 200C"],
])(
  "observed initials and route identifiers retain their literal spelling: %s",
  (deliveryLine, literal, alternative) => {
    const input = { deliveryLine };
    const result = interpretAddress(input);
    expect(
      result.candidates.some((c) => c.components.streetName === literal),
    ).toBe(true);
    expect(
      result.candidates.some((c) => c.components.streetName === alternative),
    ).toBe(true);
    expect(
      interpretAddress(input, { spellingAlternatives: false }).candidates.some(
        (c) => c.components.streetName === alternative,
      ),
    ).toBe(false);
  },
);

test("route and initial spelling changes do not alter opaque house numbers or units", () => {
  for (const deliveryLine of [
    "123-125 Main St Apt 4-6",
    "123 N E St",
    "123 Road 12-14",
  ]) {
    const result = interpretAddress({ deliveryLine });
    expect(
      result.candidates.some((c) => c.components.houseNumber === "123125"),
    ).toBe(false);
    expect(
      result.candidates.some((c) => c.components.secondary?.number === "46"),
    ).toBe(false);
    expect(
      result.candidates.some((c) => c.components.streetName === "NE"),
    ).toBe(false);
    expect(
      result.candidates.some((c) => c.components.streetName === "ROAD 1214"),
    ).toBe(false);
  }
});
