import { expect, test } from "vitest";
import { annotationTokens, validateAnnotation, annotationKey, materializeAnnotation, hash } from "../scripts/labeling-contract.mjs";
import { selectPilot, validateBatch, comparePasses } from "../scripts/labeling-pilot.mjs";
import { finalizeLabels } from "../scripts/finalize-labeling-pilot.mjs";

const input = "12-14 N O'Neil St Bldg A Apt 2";
const record = { caseId: "p001", id: "opaque", input: { deliveryLine: input }, inputSha256: hash(input) };
const label = () => ({ caseId: "p001", inputSha256: hash(input), status: "address", complete: true,
  readings: [{ fields: { houseNumber: [0, 1, 2], preDirectional: [3], streetName: [4, 5, 6], streetSuffix: [7] },
    secondary: [{ kind: "building", designator: [8], identifier: [9] }, { kind: "unit", designator: [10], identifier: [11] }],
    separators: [], unresolved: [] }], notes: "" });

test("independent tokenization preserves offsets and punctuation, including Unicode", () => {
  expect(annotationTokens(input).map((t) => t.raw)).toEqual(["12", "-", "14", "N", "O", "'", "Neil", "St", "Bldg", "A", "Apt", "2"]);
  for (const text of [input, "12 Calle Peña 🏠 Apt2B", "12½ Example St"])
    for (const token of annotationTokens(text)) expect(text.slice(token.start, token.end)).toBe(token.raw);
});

test("complete chain evidence can be materialized without losing the building", () => {
  expect(validateAnnotation(record, label())).toEqual({ valid: true, errors: [] });
  const result = materializeAnnotation(record, label());
  expect(result.readings[0].secondary.map((s) => s.kind)).toEqual(["building", "unit"]);
  expect(result.readings[0].fields.houseNumber.spans.map((s) => s.raw).join("")).toBe("12-14");
});

test("wrong identity, changed source and invented token positions fail validation", () => {
  for (const change of [
    (x) => x.caseId = "other",
    (x) => x.inputSha256 = hash("different"),
    (x) => x.readings[0].fields.houseNumber.push(100),
    (x) => x.correctness = 100,
  ]) {
    const x = label(); change(x); expect(validateAnnotation(record, x).valid).toBe(false);
  }
});

test("malformed model output returns validation failures rather than crashing", () => {
  for (const change of [
    (x) => x.readings[0].secondary = "wrong",
    (x) => { x.status = "unresolved"; x.notes = 7; },
    (x) => x.readings[0].fields = null,
  ]) {
    const x = label(); change(x);
    expect(validateAnnotation(record, x).valid).toBe(false);
  }
});

test("hyphens cannot disappear, be ignored, or be assigned twice", () => {
  for (const change of [
    (x) => x.readings[0].fields.houseNumber = [0, 2],
    (x) => { x.readings[0].fields.houseNumber = [0, 2]; x.readings[0].separators = [1]; },
    (x) => x.readings[0].fields.streetName.push(1),
  ]) {
    const x = label(); change(x); expect(validateAnnotation(record, x).valid).toBe(false);
  }
});

test("secondary order and full coverage are enforced", () => {
  const reordered = label(); reordered.readings[0].secondary.reverse();
  expect(validateAnnotation(record, reordered).valid).toBe(false);
  const missing = label(); missing.readings[0].secondary.shift();
  expect(validateAnnotation(record, missing).valid).toBe(false);
});

test("uncertain and unsupported addresses remain unresolved records", () => {
  for (const status of ["unresolved", "unsupported", "non_address"])
    expect(validateAnnotation(record, { ...label(), status, complete: false, readings: [], notes: "Needs context" }).valid).toBe(true);
  const unresolved = label(); unresolved.complete = false;
  expect(validateAnnotation(record, unresolved).valid).toBe(false);
});

test("agreement ignores JSON property ordering and notes but preserves structure", () => {
  const a = label(), b = label();
  b.notes = "Independent wording";
  b.readings[0].fields = Object.fromEntries(Object.entries(b.readings[0].fields).reverse());
  b.readings[0].secondary = b.readings[0].secondary.map((s) => ({ identifier: s.identifier, kind: s.kind, designator: s.designator }));
  expect(annotationKey(a)).toBe(annotationKey(b));
  b.readings[0].secondary[0].kind = "unit";
  expect(annotationKey(a)).not.toBe(annotationKey(b));
});

test("duplicates do not manufacture ambiguity or a second review", () => {
  const duplicate = label(); duplicate.status = "ambiguous"; duplicate.readings.push(structuredClone(duplicate.readings[0]));
  expect(validateAnnotation(record, duplicate).valid).toBe(false);
  expect(validateBatch([record], [label(), label()]).valid).toBe(false);
  expect(validateBatch([record], []).errors[0].errors).toContain("missing case");
});

test("agreement is provisional and audit selection still requires review", () => {
  expect(comparePasses([record], [label()], [label()], ["p001"])[0]).toMatchObject({
    agrees: true, reviewRequired: true, reasons: ["preselected-blind-audit"],
  });
  const b = label(); b.readings[0].secondary[0].kind = "unit";
  expect(comparePasses([record], [label()], [b])[0]).toMatchObject({ agrees: false, reviewRequired: true });
  expect(() => comparePasses([record], [label()], [])).toThrow();
});

test("pilot keeps input identity, covers strata and does not expose stratum metadata", () => {
  const queue = Array.from({ length: 8 }, (_, i) => ({ id: String(i), input: { deliveryLine: input }, inputSha256: hash(input), decision: "unreviewed", readings: [] }));
  const manifest = { records: queue.map((r, i) => ({ id: r.id, stratum: i < 7 ? "CA/geographic" : "NY/challenge" })) };
  const result = selectPilot(queue, manifest, 3);
  expect(result).toHaveLength(3);
  expect(result.some((r) => r.id === "7")).toBe(true);
  expect(result).toEqual(selectPilot(queue, manifest, 3));
  expect(JSON.stringify(result)).not.toMatch(/CA\/geographic|NY\/challenge/);
  expect(() => selectPilot(queue, manifest, 1)).toThrow();
  expect(() => selectPilot([...queue, queue[0]], manifest, 3)).toThrow();
});

test("a blind audit can disagree with unanimous Luna labels without becoming a gold score", () => {
  const first = label(), audit = label();
  audit.readings[0].secondary[0].kind = "unit";
  const result = finalizeLabels([record], [first], [first], [audit], [audit], [record.caseId]);
  expect(result.summary).toMatchObject({ agreements: 1, disagreements: 0, adjudicated: 1,
    consensusAuditCases: 1, consensusAuditDisagreements: 1, consensusOverturned: 1,
    correctness: "not-measured", targetMet: false, humanReviewed: 0 });
  expect(result.output[0].review).toMatchObject({ provisional: true, status: "agent-adjudicated" });
});

test("incomplete adjudication cannot silently promote uncertain records or drop them", () => {
  const unresolved = { ...label(), status: "unresolved", complete: false, readings: [], notes: "Uncertain roles" };
  expect(() => finalizeLabels([record], [label()], [unresolved], [], [], [])).toThrow();
  const result = finalizeLabels([record], [label()], [unresolved], [], [unresolved], []);
  expect(result.output).toHaveLength(1);
  expect(result.summary).toMatchObject({ prepared: 1, unresolved: 1, agentAccepted: 0, targetMet: false });
});
