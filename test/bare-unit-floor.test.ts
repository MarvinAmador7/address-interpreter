import {expect, test} from "vitest";
import {interpretAddress, interpretFullAddress} from "../src/index";

test("a bare unit followed by an explicit floor retains both identifiers", () => {
  const deliveryLine = "12 Oak St 204 Floor 2";
  const result = interpretAddress({deliveryLine}, {spellingAlternatives: false});
  expect(result.candidates.map(c => c.components)).toEqual(expect.arrayContaining([
    {houseNumber: "12", streetName: "OAK", streetSuffix: "ST", secondary: {designator: "FL", number: "2"}, secondaryUnits: [{number: "204"}, {designator: "FL", number: "2"}]},
    {houseNumber: "12", streetName: "OAK ST 204", secondary: {designator: "FL", number: "2"}},
  ]));
  expect(result.candidates).toHaveLength(2);
  const reading = result.candidates.find(c => c.components.streetSuffix === "ST")!;
  expect(reading.sourceSpans.secondaryUnits?.map(s => deliveryLine.slice(s.start, s.end))).toEqual(["204", "Floor 2"]);
  expect(result.diagnostics).toEqual([]);
});

test.each(["Floor", "FL", "Flr"])("recognizes explicit %s after varied bare identifiers", marker => {
  for (const number of ["204", "A204", "002", "B", "20-B", "A/2", "204 B"]) {
    const deliveryLine = `12 Oak St ${number} ${marker} 02`;
    for (const spellingAlternatives of [false, true]) {
      const result = interpretAddress({deliveryLine}, {spellingAlternatives});
      const reading = result.candidates.find(c => c.components.streetName === "OAK" && c.components.streetSuffix === "ST" && c.components.secondaryUnits?.[0].number === number);
      expect(reading?.components.secondaryUnits).toEqual([{number}, {designator: "FL", number: "02"}]);
      expect(reading?.sourceSpans.secondaryUnits?.map(s => deliveryLine.slice(s.start, s.end))).toEqual([number, `${marker} 02`]);
    }
  }
});

test("floor continuation preserves every later building and apartment element", () => {
  const deliveryLine = "12 Oak St 204 Floor 2 Bldg A Apt 7";
  const result = interpretAddress({deliveryLine}, {spellingAlternatives: false});
  expect(result.candidates).toHaveLength(2);
  const reading = result.candidates.find(c => c.components.streetSuffix === "ST")!;
  expect(reading.components.secondaryUnits).toEqual([{number:"204"},{designator:"FL",number:"2"},{designator:"BLDG",number:"A"},{designator:"APT",number:"7"}]);
  expect(reading.components.secondary).toEqual({designator:"APT",number:"7"});
  expect(reading.sourceSpans.secondaryUnits?.map(s => deliveryLine.slice(s.start,s.end))).toEqual(["204","Floor 2","Bldg A","Apt 7"]);
});

test.each(["-1", "1.5", "B2", "2B"])("preserves the explicit floor identifier %s", floor => {
  const result = interpretAddress({deliveryLine:`12 Oak St 204 Floor ${floor}`},{spellingAlternatives:false});
  const reading = result.candidates.find(c => c.components.streetSuffix === "ST" && c.components.secondaryUnits?.[0].number === "204");
  expect(reading?.components.secondaryUnits).toEqual([{number:"204"},{designator:"FL",number:floor}]);
});

test.each(["12 Oak St A204 Floor 2", "12 Oak St 204 - Floor 2", "12 Oak St 204 Floor #2"])("retains existing ambiguity and the complete new chain in %s", deliveryLine => {
  const result = interpretAddress({deliveryLine},{spellingAlternatives:false});
  expect(result.candidates).toHaveLength(3);
  const reading = result.candidates.find(c => c.components.secondaryUnits?.[0].number === (deliveryLine.includes("A204") ? "A204" : "204") && !c.components.secondaryUnits?.[0].designator)!;
  expect(reading.components.secondaryUnits?.[reading.components.secondaryUnits.length - 1]).toEqual({designator:"FL",number:"2"});
  for (const token of result.tokens) {
    expect(Object.values(reading.sourceSpans).flat().some(s => s.start <= token.start && s.end >= token.end)).toBe(true);
  }
});

test.each([false,true])("full-address parsing keeps floor-chain and locality evidence, spelling %s", spellingAlternatives => {
  const input = "12 Oak St 204 Floor 2, Vero Beach, FL 32963";
  const result = interpretFullAddress(input,{spellingAlternatives});
  if (!spellingAlternatives) expect(result.candidates).toHaveLength(2);
  const reading = result.candidates.find(c => c.components.streetName === "OAK" && c.components.secondaryUnits?.[0].number === "204")!;
  expect(reading.components).toMatchObject({city:"VERO BEACH",state:"FL",postalCode:"32963",secondaryUnits:[{number:"204"},{designator:"FL",number:"2"}]});
  expect(reading.sourceSpans.secondaryUnits?.map(s=>input.slice(s.start,s.end))).toEqual(["204","Floor 2,"]);
  expect(input.slice(reading.sourceSpans.state!.start,reading.sourceSpans.state!.end)).toBe("FL");
});

test("keyword-bearing streets and fractional houses compose with a floor", () => {
  const deliveryLine = "12 1/2 Harbor Key Dr 204 Floor 2";
  const result = interpretAddress({deliveryLine},{spellingAlternatives:false});
  const reading = result.candidates.find(c => c.components.streetName === "HARBOR KEY" && c.components.streetSuffix === "DR" && c.components.secondaryUnits?.[0].number === "204")!;
  expect(reading.components.houseNumber).toBe("12 1/2");
  expect(deliveryLine.slice(reading.sourceSpans.houseNumber!.start,reading.sourceSpans.houseNumber!.end)).toBe("12 1/2");
  expect(reading.components.secondaryUnits).toEqual([{number:"204"},{designator:"FL",number:"2"}]);
});

test.each([
  ["12 Oak St Floor 2", {designator:"FL",number:"2"}],
  ["12 Oak St 2 Floor", {designator:"FL",number:"2"}],
  ["12 Oak St 2nd Floor", {designator:"FL",number:"2"}],
  ["12 Oak St First Floor", {designator:"FL",number:"1"}],
  ["12 Oak St Bldg Floor 2", {designator:"BLDG",number:"FLOOR 2"}],
  ["12 Oak St Apt Floor 2", {designator:"APT",number:"FLOOR 2"}],
  ["12 Oak St Floor Plan", {designator:"FL",number:"PLAN"}],
] as const)("preserves the established single reading of %s", (deliveryLine,secondary) => {
  const result = interpretAddress({deliveryLine},{spellingAlternatives:false});
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].components).toMatchObject({houseNumber:"12",streetName:"OAK",streetSuffix:"ST",secondary});
  expect(result.candidates[0].components.secondaryUnits).toBeUndefined();
});

test("explicit apartment and floor chains do not acquire a bare-unit alternative", () => {
  const result = interpretAddress({deliveryLine:"12 Oak St Apt 204 Floor 2"},{spellingAlternatives:false});
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].components.secondaryUnits).toEqual([{designator:"APT",number:"204"},{designator:"FL",number:"2"}]);
});

test.each(["12 Oak St 204 Floor 2 Apt", "12 Oak St 204 Floor 2 Bldg", "12 Oak St Floor"])("incomplete explicit chains remain incomplete: %s", deliveryLine => {
  expect(interpretAddress({deliveryLine},{spellingAlternatives:false}).candidates).toEqual([]);
});

test("long floor chains complete without recursively branching", () => {
  for (const floor of ["Floor 2", "2nd Floor"]) {
    const deliveryLine = "12 Oak St 204 " + Array(40).fill(floor).join(" ");
    const result = interpretAddress({deliveryLine},{spellingAlternatives:false});
    expect(result.diagnostics).toEqual([]);
    expect(result.candidates).toHaveLength(2);
    const reading = result.candidates.find(c => c.components.streetSuffix === "ST")!;
    expect(reading.components.secondaryUnits).toHaveLength(41);
    expect(reading.sourceSpans.secondaryUnits).toHaveLength(41);
  }
}, 1000);

test.each(["2nd", "1st", "13th", "First", "Second", "A-2nd", "1 ST"])("an ordinal floor phrase does not invent a bare %s unit", ordinal => {
  for (const ending of ["2", "Rear", "Apt 7", "#2"]) {
    const result = interpretAddress({deliveryLine:`12 Oak St ${ordinal} Floor ${ending}`},{spellingAlternatives:false});
    expect(result.candidates.every(c => !c.components.secondaryUnits?.some(unit => !unit.designator && unit.number?.includes(ordinal.toUpperCase())))).toBe(true);
  }
});

test.each(["Ground", "Mezzanine"])("a named %s floor is not part of a bare identifier", namedFloor => {
  const result = interpretAddress({deliveryLine:`12 Oak St 204 ${namedFloor} Floor 2`},{spellingAlternatives:false});
  expect(result.candidates.every(c => !c.components.secondaryUnits?.some(unit => unit.number?.includes(namedFloor.toUpperCase())))).toBe(true);
});

test("a floor-plan description does not create a floor PLAN chain", () => {
  const result = interpretAddress({deliveryLine:"12 Oak St B204 Floor Plan"},{spellingAlternatives:false});
  expect(result.candidates.every(c => c.components.secondaryUnits === undefined)).toBe(true);
});

test("a street post-directional before a floor does not become an unmarked unit", () => {
  const result = interpretAddress({deliveryLine:"12 Oak St N Floor 2"},{spellingAlternatives:false});
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].components).toMatchObject({streetName:"OAK",streetSuffix:"ST",postDirectional:"N",secondary:{designator:"FL",number:"2"}});
  expect(result.candidates[0].components.secondaryUnits).toBeUndefined();
});
