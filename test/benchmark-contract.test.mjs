import { expect, test } from "vitest";
import { benchmarkDefinition, diagnosticIdentity, inputHash, METRICS, NORMALIZATION, OUTPUT_CONTRACT, normalizeReading, scoreCase, summarizeScores } from "../scripts/benchmark-contract.mjs";
import { artifactHash, EVALUATOR_HASH, evaluateBenchmark } from "../scripts/benchmark-contract.mjs";
import { interpretAddress } from "../src/index.ts";

// Synthetic, authored expectations. They are not MLS labels or a population benchmark.
const input = { deliveryLine: "12 Oak St Bldg A Apt 204" };
const reading = { houseNumber: "12", streetName: "OAK", streetSuffix: "ST", secondaryUnits: [{ designator: "BLDG", number: "A" }, { designator: "APT", number: "204" }] };
const label = { status: "address", exhaustive: true, inputHash: inputHash(input), readings: [reading] };
const candidate = (components) => ({ components });
const score = (outputs, truth = label, source = input) => scoreCase(truth, source, outputs.map(candidate));

test("complete chains are evaluated, not only the final apartment", () => {
  expect(score([reading])).toMatchObject({ exact: true, completeChainExact: true });
  const lastOnly = { ...reading, secondaryUnits: [{ designator: "APT", number: "204" }] };
  expect(score([lastOnly])).toMatchObject({ exact: false, matchedReadings: 0, completeChainExact: false, unsupportedReadings: 1 });
  expect(score([{ ...reading, secondaryUnits: [...reading.secondaryUnits].reverse() }]).completeChainExact).toBe(false);
});

test("a supported candidate surrounded by guesses does not pass exact-set correctness", () => {
  const extra = { ...reading, houseNumber: "13" };
  expect(score([reading, extra])).toMatchObject({ exact: false, matchedReadings: 1, unsupportedReadings: 1 });
  expect(summarizeScores([score([reading, extra])])).toMatchObject({
    exactInterpretationSet: { rate: 0 }, acceptedReadingRecall: { rate: 1 }, supportedReadingPrecision: { rate: 0.5 },
  });
});

test("reading order is irrelevant, semantic duplicates are counted as candidate cost", () => {
  const second = { ...reading, streetName: "OAK ST" };
  const truth = { ...label, status: "ambiguous", readings: [reading, second] };
  expect(score([second, reading, reading], truth)).toMatchObject({ exact: true, emittedCandidates: 3, uniqueReadings: 2, duplicateReadings: 1 });
  expect(score([reading], truth)).toMatchObject({ exact: false, matchedReadings: 1, acceptedReadings: 2 });
});

test("incomplete labels support recall but cannot classify additional readings as wrong", () => {
  const result = score([reading, { ...reading, streetName: "PINE" }], { ...label, exhaustive: false });
  expect(result).toMatchObject({ exact: null, unsupportedReadings: null, completeChainExact: null, matchedReadings: 1 });
  expect(summarizeScores([result])).toMatchObject({ exactInterpretationSet: { denominator: 0, rate: null }, supportedReadingPrecision: { rate: null }, acceptedReadingRecall: { rate: 1 } });
});

test("rejected valid input fails and missing labels remain visible in coverage", () => {
  const unknown = score([], { ...label, status: "unresolved", exhaustive: false, readings: [] });
  const unsupported = score([], { ...label, status: "unsupported", exhaustive: false, readings: [] });
  expect(summarizeScores([score([]), unknown, unsupported])).toMatchObject({
    cases: 3, labelingCoverage: { numerator: 1, denominator: 3 }, exactInterpretationSet: { rate: 0 },
    noCandidateOnSupportedInput: { numerator: 1, denominator: 1 }, statuses: { unresolved: 1, unsupported: 1 },
  });
});

test("non-address rejection is a separate robustness task", () => {
  const result = score([], { ...label, status: "non_address", exhaustive: false, readings: [] });
  expect(summarizeScores([result])).toMatchObject({ exactInterpretationSet: { denominator: 0, rate: null }, nonAddressRejection: { rate: 1 } });
});

test("normalization preserves punctuation, identifier spacing, and designator meaning", () => {
  expect(normalizeReading({ ...reading, streetName: " oak  grove " }).streetName).toBe("OAK GROVE");
  expect(score([{ ...reading, houseNumber: "12-14" }]).exact).toBe(false);
  expect(score([{ ...reading, secondaryUnits: [{ designator: "BLDG", number: "A" }, { designator: "UNIT", number: "204" }] }]).exact).toBe(false);
  expect(normalizeReading({ houseNumber: "12", streetName: "OAK", secondary: { number: "2 B" } }).secondaryUnits).toEqual([{ number: "2 B" }]);
});

test("single-secondary and explicit chain forms compare consistently", () => {
  const single = { houseNumber: "12", streetName: "OAK", secondary: { number: "B" } };
  expect(normalizeReading(single)).toEqual(normalizeReading({ ...single, secondaryUnits: [{ number: "B" }] }));
  expect(() => normalizeReading({ ...single, secondaryUnits: [{ number: "C" }] })).toThrow("differs");
});

test("mailing types are scored without imposing street requirements", () => {
  const box = { kind: "po-box", boxNumber: "12" };
  expect(score([box], { ...label, readings: [box] }).exact).toBe(true);
  expect(() => normalizeReading({ ...box, houseNumber: "12" })).toThrow("incompatible");
  expect(() => normalizeReading({ kind: "rural-route", routeNumber: "2" })).toThrow("boxNumber");
});

test("malformed truth or outputs abort, instead of becoming missing or correct records", () => {
  expect(() => score([reading], { ...label, readings: [reading, reading] })).toThrow("Duplicate");
  expect(() => score([reading], { ...label, readings: [] })).toThrow("needs accepted");
  expect(() => score([{ ...reading, privateGuess: "yes" }])).toThrow("Unknown");
  expect(() => score([{ ...reading, secondaryUnits: [{}] }])).toThrow("Empty");
  expect(() => score([reading], { ...label, status: "unresolved" })).toThrow("cannot supply");
});

test("input identity includes locality, preserves exact text, and ignores key order", () => {
  expect(inputHash({ city: "Austin", ...input })).toBe(inputHash({ ...input, city: "Austin" }));
  expect(() => score([reading], label, { ...input, city: "Austin" })).toThrow("hash differs");
  expect(() => score([reading], label, { deliveryLine: input.deliveryLine.toUpperCase() })).toThrow("hash differs");
});

const definition = {
  corpusHash: "a".repeat(64), policyHash: "b".repeat(64), sampleHash: "c".repeat(64), annotationHash: "d".repeat(64), guideHash: "e".repeat(64), evaluatorHash: "f".repeat(64),
  split: "development", annotationStatus: "provisional", population: "Coverage-selected annotation pilot",
  outputContract: OUTPUT_CONTRACT, normalization: NORMALIZATION, metrics: METRICS, parserOptions: { spellingAlternatives: false },
};
test("benchmark identity changes with labels, sample, scorer, normalization, and options", () => {
  const first = benchmarkDefinition(definition);
  for (const key of ["corpusHash", "sampleHash", "annotationHash", "guideHash", "evaluatorHash"])
    expect(benchmarkDefinition({ ...definition, [key]: "0".repeat(64) }).id).not.toBe(first.id);
  expect(benchmarkDefinition({ ...definition, parserOptions: { spellingAlternatives: true } }).id).not.toBe(first.id);
  expect(() => benchmarkDefinition({ ...definition, normalization: "unversioned" })).toThrow();
  expect(() => benchmarkDefinition({ ...definition, sampleHash: undefined })).toThrow();
  expect(() => benchmarkDefinition({ ...definition, parserOptions: {} })).toThrow();
  expect(benchmarkDefinition(Object.fromEntries(Object.entries(definition).reverse())).id).toBe(first.id);
});

test("legacy diagnostics with missing identity are never connected as comparable benchmarks", () => {
  const record = { corpusHash: definition.corpusHash, policyHash: definition.policyHash, evaluatorHash: definition.evaluatorHash, split: "development", measurementVersion: "agreement-v1", parserOptions: { spellingAlternatives: true } };
  expect(diagnosticIdentity(record)).toMatch(/^[a-f0-9]{64}$/);
  expect(diagnosticIdentity({ ...record, parserOptions: undefined })).toBeNull();
  expect(diagnosticIdentity({ ...record, evaluatorHash: "0".repeat(64) })).not.toBe(diagnosticIdentity(record));
});

test("a frozen batch evaluates the actual parser without promoting fixture or provisional results", () => {
  const sample = [{ caseId: "synthetic-chain", split: "synthetic", input }];
  const annotations = [{ ...label, caseId: "synthetic-chain" }];
  const pinned = { ...definition, split: "synthetic", annotationStatus: "synthetic", sampleHash: artifactHash(sample), annotationHash: artifactHash(annotations), evaluatorHash: EVALUATOR_HASH };
  const evaluate = (overrides = {}) => evaluateBenchmark({ definition: pinned, sample, annotations, interpret: interpretAddress, parserHash: "1".repeat(64), ...overrides });
  expect(evaluate()).toMatchObject({ evidenceStatus: "synthetic-conformance", releaseEligible: false, summary: { cases: 1, exactInterpretationSet: { rate: 1 } } });
  expect(evaluate({ definition: { ...pinned, annotationStatus: "provisional" } }).evidenceStatus).toBe("experimental");
  expect(() => evaluate({ sample: [...sample, sample[0]] })).toThrow("Sample differs");
  expect(() => evaluate({ annotations: [] })).toThrow("Annotations differ");
  expect(() => evaluate({ definition: { ...pinned, evaluatorHash: "0".repeat(64) } })).toThrow("Evaluator code differs");
  const missing = { ...pinned, annotationHash: artifactHash([]) };
  expect(() => evaluate({ definition: missing, annotations: [] })).toThrow("Every sampled input");
  const extra = [...annotations, { ...annotations[0], caseId: "extra" }];
  expect(() => evaluate({ definition: { ...pinned, annotationHash: artifactHash(extra) }, annotations: extra })).toThrow("Extra or duplicate");
});
