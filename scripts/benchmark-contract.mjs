import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

export const OUTPUT_CONTRACT = "complete-interpretation-set-v1";
export const NORMALIZATION = "case-whitespace-v1";
export const METRICS = "interpretation-set-metrics-v1";
const digest = (value) => createHash("sha256").update(value).digest("hex");
export const EVALUATOR_HASH = digest(readFileSync(new URL(import.meta.url)));
const stable = (value) => JSON.stringify(canonical(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const hashValue = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
export const artifactHash = (value) => digest(stable(value));

/** Hash the whole input, including supplied locality. Delivery text alone is insufficient. */
export function inputHash(input) {
  assert(object(input) && typeof input.deliveryLine === "string", "Expected an address input");
  for (const [key, value] of Object.entries(input)) {
    assert(["deliveryLine", "city", "state", "postalCode", "urbanization"].includes(key), `Unknown input field: ${key}`);
    assert(typeof value === "string", `Input ${key} must be a string`);
  }
  return digest(stable(input));
}

/** A definition identifies evaluation conditions, never a parser build or achieved score. */
export function benchmarkDefinition(value) {
  assert(object(value), "Expected a benchmark definition");
  const keys = ["corpusHash", "policyHash", "sampleHash", "annotationHash", "guideHash", "split", "annotationStatus", "outputContract", "normalization", "metrics", "evaluatorHash", "parserOptions", "population"];
  assert(Object.keys(value).every((key) => keys.includes(key)), "Unknown benchmark definition field");
  for (const key of ["corpusHash", "policyHash", "sampleHash", "annotationHash", "guideHash", "evaluatorHash"])
    assert(hashValue(value[key]), `${key} must be a SHA-256 digest`);
  assert(["development", "release", "synthetic"].includes(value.split), "Unknown benchmark split");
  assert(["provisional", "calibrated", "synthetic"].includes(value.annotationStatus), "Unknown annotation status");
  assert(value.outputContract === OUTPUT_CONTRACT && value.normalization === NORMALIZATION && value.metrics === METRICS, "Unsupported scoring contract version");
  assert(object(value.parserOptions) && Object.keys(value.parserOptions).length === 1 && typeof value.parserOptions.spellingAlternatives === "boolean", "Pin spellingAlternatives explicitly");
  assert(typeof value.population === "string" && value.population.trim(), "Declare the evaluated population");
  return { ...value, id: digest(stable(value)) };
}

// Deliberately conservative. Labels contain canonical USPS abbreviations where
// intended; this scorer never invokes the parser to normalize expected readings.
function text(value) {
  assert(typeof value === "string" && value.trim(), "Component values must be nonempty strings");
  return value.trim().replace(/\s+/gu, " ").toUpperCase();
}
const locality = ["city", "state", "postalCode", "urbanization", "country"];
const street = ["houseNumber", "preDirectional", "streetName", "streetSuffix", "postDirectional"];
const mailing = { "po-box": ["boxNumber"], "rural-route": ["routeNumber", "boxNumber"], "highway-contract": ["routeNumber", "boxNumber"], military: ["militaryUnit", "routeNumber", "boxNumber"], "general-delivery": [] };
function secondary(value) {
  assert(object(value) && Object.keys(value).every((key) => ["designator", "number"].includes(key)), "Invalid secondary component");
  const entries = Object.entries(value).filter(([, value]) => value !== undefined);
  assert(entries.length > 0, "Empty secondary component");
  return Object.fromEntries(entries.map(([key, value]) => [key, text(value)]));
}
export function normalizeReading(value) {
  assert(object(value), "Expected reading components");
  const kind = value.kind === undefined ? "street" : value.kind;
  const fields = kind === "street" ? street : mailing[kind];
  assert(Array.isArray(fields), "Unknown delivery kind");
  const allowed = ["kind", ...fields, ...locality, ...(kind === "street" ? ["secondary", "secondaryUnits"] : [])];
  assert(Object.keys(value).every((key) => allowed.includes(key)), "Unknown or incompatible reading field");
  for (const key of kind === "street" ? ["houseNumber", "streetName"] : fields)
    assert(typeof value[key] === "string" && value[key].trim(), `Missing ${key}`);
  const output = { kind };
  for (const key of [...fields, ...locality]) if (value[key] !== undefined) output[key] = text(value[key]);
  if (kind === "military") assert(["PSC", "UNIT", "CMR"].includes(output.militaryUnit), "Invalid military unit");
  if (output.country) assert(output.country === "US", "Unsupported country");
  if (kind === "street") {
    if (value.secondaryUnits !== undefined) {
      assert(Array.isArray(value.secondaryUnits) && value.secondaryUnits.length > 0, "Secondary chain must be nonempty");
      output.secondaryUnits = value.secondaryUnits.map(secondary);
      if (value.secondary !== undefined) assert(stable(secondary(value.secondary)) === stable(output.secondaryUnits.at(-1)), "Final secondary differs from chain");
    } else output.secondaryUnits = value.secondary === undefined ? [] : [secondary(value.secondary)];
  }
  return canonical(output);
}

/** Score ALL unranked outputs. Incomplete labels cannot establish false positives. */
export function scoreCase(label, input, candidates) {
  assert(label.inputHash === inputHash(input), "Label input hash differs");
  assert(["address", "ambiguous", "unresolved", "unsupported", "non_address"].includes(label.status), "Unknown label status");
  assert(typeof label.exhaustive === "boolean" && Array.isArray(label.readings), "Invalid label contract");
  assert(Array.isArray(candidates), "Expected candidate array");
  const expected = label.readings.map(normalizeReading);
  const outputs = candidates.map((candidate) => normalizeReading(candidate.components));
  const truth = new Set(expected.map(stable)), predicted = new Set(outputs.map(stable));
  assert(truth.size === expected.length, "Duplicate expected readings");
  const supported = ["address", "ambiguous"].includes(label.status);
  if (supported) assert(truth.size > 0, "Supported input needs accepted readings");
  if (label.status === "address" && label.exhaustive) assert(truth.size === 1, "Address label needs one exhaustive reading");
  if (label.status === "ambiguous" && label.exhaustive) assert(truth.size > 1, "Ambiguous label needs multiple exhaustive readings");
  if (!supported) assert(!truth.size && !label.exhaustive, "Unresolved and robustness cases cannot supply correctness truth");
  const matched = [...truth].filter((key) => predicted.has(key)).length;
  const eligible = supported && label.exhaustive;
  const chains = (readings) => new Set(readings.map((r) => stable({ kind: r.kind, chain: r.secondaryUnits ?? [] })));
  const expectedChains = chains(expected), outputChains = chains(outputs);
  const sameSet = (a, b) => a.size === b.size && [...a].every((key) => b.has(key));
  return {
    status: label.status, eligible, acceptedReadings: supported ? truth.size : 0,
    matchedReadings: supported ? matched : 0,
    emittedCandidates: candidates.length, uniqueReadings: predicted.size,
    duplicateReadings: candidates.length - predicted.size,
    exact: eligible ? sameSet(truth, predicted) : null,
    unsupportedReadings: eligible ? predicted.size - matched : null,
    noCandidate: supported ? predicted.size === 0 : null,
    completeChainExact: eligible && expected.some((r) => r.secondaryUnits?.length)
      ? sameSet(expectedChains, outputChains) : null,
    rejectedNonAddress: label.status === "non_address" ? predicted.size === 0 : null,
  };
}

export function summarizeScores(scores) {
  const sum = (rows, key) => rows.reduce((n, row) => n + row[key], 0);
  const ratio = (numerator, denominator) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });
  const complete = scores.filter((s) => s.eligible), supported = scores.filter((s) => s.noCandidate !== null);
  const chains = scores.filter((s) => s.completeChainExact !== null), robustness = scores.filter((s) => s.rejectedNonAddress !== null);
  return {
    cases: scores.length,
    statuses: Object.fromEntries(["address", "ambiguous", "unresolved", "unsupported", "non_address"].map((status) => [status, scores.filter((s) => s.status === status).length])),
    labelingCoverage: ratio(complete.length, scores.length),
    exactInterpretationSet: ratio(sum(complete, "exact"), complete.length),
    acceptedReadingRecall: ratio(sum(supported, "matchedReadings"), sum(supported, "acceptedReadings")),
    supportedReadingPrecision: ratio(sum(complete, "matchedReadings"), sum(complete, "uniqueReadings")),
    unsupportedReadings: sum(complete, "unsupportedReadings"),
    completeSecondaryChain: ratio(sum(chains, "completeChainExact"), chains.length),
    noCandidateOnSupportedInput: ratio(sum(supported, "noCandidate"), supported.length),
    nonAddressRejection: ratio(sum(robustness, "rejectedNonAddress"), robustness.length),
    emittedCandidates: sum(scores, "emittedCandidates"), duplicateReadings: sum(scores, "duplicateReadings"),
    uncertainty: { status: "not-estimated", reason: "Requires a declared sampling and cluster design; counts alone do not justify population intervals." },
  };
}

/** Missing historical identities remain unknown, not inferred from today's code. */
export function diagnosticIdentity(record) {
  const fields = ["corpusHash", "policyHash", "evaluatorHash", "measurementVersion", "split", "parserOptions"];
  if (fields.some((key) => record[key] === undefined || record[key] === null)) return null;
  if (!["corpusHash", "policyHash", "evaluatorHash"].every((key) => hashValue(record[key]))) return null;
  if (!object(record.parserOptions) || typeof record.parserOptions.spellingAlternatives !== "boolean") return null;
  return digest(stable(Object.fromEntries(fields.map((key) => [key, record[key]]))));
}

/** Evaluate a frozen annotation sidecar. Never upgrades labels to release evidence. */
export function evaluateBenchmark({ definition: supplied, sample, annotations, interpret, parserHash }) {
  const definition = benchmarkDefinition(supplied);
  assert(definition.evaluatorHash === EVALUATOR_HASH, "Evaluator code differs from definition");
  assert(hashValue(parserHash), "Pin the evaluated parser build hash");
  assert(Array.isArray(sample) && sample.length > 0 && Array.isArray(annotations), "Expected nonempty sample and annotations");
  assert(artifactHash(sample) === definition.sampleHash, "Sample differs from definition");
  assert(artifactHash(annotations) === definition.annotationHash, "Annotations differ from definition");
  const ids = new Set(), labels = new Map();
  for (const row of sample) {
    assert(typeof row.caseId === "string" && row.caseId && !ids.has(row.caseId), "Duplicate or missing sample identity");
    assert(row.split === definition.split, "Sample split differs from definition");
    inputHash(row.input); ids.add(row.caseId);
  }
  for (const label of annotations) {
    assert(ids.has(label.caseId) && !labels.has(label.caseId), "Extra or duplicate annotation identity");
    labels.set(label.caseId, label);
  }
  assert(labels.size === sample.length, "Every sampled input needs a label, including unresolved cases");
  const started = performance.now();
  const results = sample.map((row) => scoreCase(labels.get(row.caseId), row.input, interpret(row.input, definition.parserOptions).candidates));
  return {
    schema: "parser-evaluation-v1", definition, parserHash,
    evidenceStatus: definition.annotationStatus === "synthetic" ? "synthetic-conformance" : "experimental",
    releaseEligible: false,
    recordedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    elapsedMs: performance.now() - started,
    summary: summarizeScores(results),
  };
}
