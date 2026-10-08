import { expect, test } from "vitest";
import { assessCorpusRecord } from "../scripts/corpus-policy.mjs";

const row = (listing_address, fields = {}) => ({
  listing_address,
  house_number: "123",
  street_name: "MAIN",
  street_suffix: "ST",
  ...fields,
});
test.each([
  row("123 Main Street"),
  row("123 Main St Bldg A Apt 4", { unit: "4" }),
  row("123 Main St4B", { unit: "4B" }),
  row("123 Main St #04", { unit: "4" }),
  row("123 Lakeview Rd", { street_name: "LAKE VIEW", street_suffix: "RD" }),
  row("123 Rocky Pt Rd", { street_name: "ROCKY POINT", street_suffix: "RD" }),
  row("123 First Street", { street_name: "1ST" }),
  row("123 NW 21st", {
    street_name: "21",
    street_suffix: "ST",
    pre_directional: "NW",
  }),
  row("123 CR-8", { street_name: "COUNTY ROAD 8", street_suffix: "" }),
  row("123 Farm To Market 8", { street_name: "FM 8", street_suffix: "" }),
  row("123 N 59 Highway", {
    street_name: "HIGHWAY 59",
    street_suffix: "",
    pre_directional: "N",
  }),
  row("123 NC 305", { street_name: "NC HIGHWAY 305", street_suffix: "" }),
  row("123 Co Road 612", { street_name: "COUNTY ROAD 612", street_suffix: "" }),
  row("123 SR 12", { street_name: "STATE ROAD 12", street_suffix: "" }),
  row("123 ST RT 12", { street_name: "STATE ROUTE 12", street_suffix: "" }),
  row("123 Alabama Highway 12", {
    street_name: "AL HIGHWAY 12",
    street_suffix: "",
  }),
  row("123 County 12 Road", {
    street_name: "COUNTY ROAD 12",
    street_suffix: "",
  }),
  row("123 Main Terr", { street_suffix: "TER" }),
  row("123 Main St Lot111B", { unit: "111B" }),
  row("123 Main St SPC42", { unit: "42" }),
  row("123 Main St D1-4TH-FLR", { unit: "D1-4TH-FLR" }),
  row("123 Main St 2nd Floor", { unit: "2" }),
  row("123 Steeplechase", { street_name: "STEEPLECHASE", street_suffix: "" }),
  row("Lot 4 123 Main St"),
  row("123½ Main St", { house_number: "123 1/2" }),
  row("APT-4 123 Main St", { unit: "4" }),
  row("N28 W456 Main St", { house_number: "N28W456" }),
  row("123 Main St Bldg A Unit 4", { unit: "A" }),
])(
  "keeps independently verifiable field evidence in $listing_address",
  (record) => {
    expect(assessCorpusRecord(record)).toEqual({ eligible: true, reasons: [] });
  },
);

test.each([
  [row(null), "missing-listing-address"],
  [row("TBD Main St"), "placeholder-address"],
  [row("Lot 123 Main St"), "land-description"],
  [
    row("123 Main St", { house_number: "" }),
    "missing-reference-primary-fields",
  ],
  [row("123 Main"), "reference-street-suffix-not-observed"],
  [row("123 Main Road"), "reference-street-suffix-not-observed"],
  [row("123 Main St", { unit: "4" }), "reference-unit-not-observed"],
  [row("123 Main St Apt 4"), "explicit-unit-missing-from-reference"],
  [row("123 Oak St"), "reference-street-name-not-verified"],
  [row("124 Main St"), "reference-house-number-not-observed"],
  [
    row("123 Main St", { pre_directional: "N" }),
    "reference-pre-directional-not-observed",
  ],
])("quarantines unsupported source fields with a reason", (record, reason) => {
  const quality = assessCorpusRecord(record);
  expect(quality.eligible).toBe(false);
  expect(quality.reasons).toContain(reason);
});

test("admission is independent of parser candidates and previous match status", () => {
  const record = row("123 Main St");
  expect(
    assessCorpusRecord({ ...record, candidates: [], matched: false }),
  ).toEqual(
    assessCorpusRecord({
      ...record,
      candidates: [{ anything: true }],
      matched: true,
    }),
  );
});
