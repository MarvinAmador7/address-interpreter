import { expect, test } from "vitest";
import { prepareReviewSample } from "../scripts/prepare-correctness-review.mjs";

const corpusHash = "a".repeat(64);
const rows = Array.from({ length: 100 }, (_, i) => ({
  listing_address: `${i + 1} Example St Bldg A Apt 2`,
  split: i < 90 ? "development" : "holdout",
  state: i < 70 ? "CA" : "NY",
  cohort: i % 2 ? "geographic" : "challenge",
  house_number: "REFERENCE MUST NOT LEAK",
  candidates: ["PARSER MUST NOT LEAK"],
}));

test("review sample is deterministic, stratified and holds back holdout rows", () => {
  const options = { corpusHash, count: 20, minimum: 2 };
  const result = prepareReviewSample(rows, options);
  expect(prepareReviewSample(rows, options)).toEqual(result);
  expect(result.queue).toHaveLength(20);
  expect(result.manifest.strata).toHaveLength(4);
  expect(result.manifest.strata.every((s) => s.selected >= 2)).toBe(true);
  expect(result.manifest.records.every((r) => r.sourceIndex < 90)).toBe(true);
  expect(result.manifest.strata.reduce((n, s) => n + s.selected * s.weight, 0)).toBeCloseTo(90);
  expect(new Set(result.queue.map((r) => r.id)).size).toBe(20);
  expect(prepareReviewSample(rows, { ...options, seed: "different" }).queue).not.toEqual(result.queue);
});

test("reviewers get only exact input text and empty review slots", () => {
  const result = prepareReviewSample(rows, { corpusHash, count: 20, minimum: 2 });
  expect(result.manifest.labeled).toBe(0);
  for (const record of result.queue) {
    expect(Object.keys(record)).toEqual([
      "schemaVersion", "id", "input", "inputSha256", "decision", "readings", "review",
    ]);
    expect(record.input).toEqual({ deliveryLine: expect.any(String) });
    expect(record.decision).toBe("unreviewed");
    expect(record.readings).toEqual([]);
  }
  expect(JSON.stringify(result.queue)).not.toMatch(/REFERENCE|PARSER|state|cohort|house_number/);
  const replaced = rows.map((r) => ({ ...r, house_number: "WRONG", candidates: ["OTHER"] }));
  expect(prepareReviewSample(replaced, { corpusHash, count: 20, minimum: 2 }).queue).toEqual(result.queue);
});

test("sampling retains difficult input and never filters by a parser or reference match", () => {
  const difficult = [{ ...rows[0], listing_address: "12-14 Example St / Bldg A Apt 2" }];
  const result = prepareReviewSample(difficult, { corpusHash, count: 1 });
  expect(result.queue[0].input.deliveryLine).toBe(difficult[0].listing_address);
  expect(result.manifest.strata[0].inclusionProbability).toBe(1);
});

test("impossible sample sizes and invalid provenance are rejected", () => {
  for (const options of [
    { count: 1, minimum: 2 }, { count: 91 }, { count: 2.5 },
    { count: 20, minimum: 0 }, { count: 20, corpusHash: "wrong" },
  ]) expect(() => prepareReviewSample(rows, { corpusHash, ...options })).toThrow();
});
