import { readFile, readdir, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { US_STATES } from "./research-report/states.mjs";
import { RESEARCH_OBJECTIVE, assessResearchObjective } from "./research-objective.mjs";
import { diagnosticIdentity, OUTPUT_CONTRACT, NORMALIZATION, METRICS } from "./benchmark-contract.mjs";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { readExpansion } from "./labeling-expansion.mjs";
import { fileURLToPath } from "node:url";
import { verifyDecision } from "./research-experiment.mjs";

const number = (value) => (Number.isFinite(value) ? value : null);
const scenarios = [
  "source-listing",
  "source-property",
  "generated-explicit",
  "generated-bare",
  "generated-full",
];
const optionalJSON = async (file) => {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
};

/** Deliberate aggregate allowlist: never copy failure examples or address rows. */
export function aggregateScenarios(source = {}) {
  return Object.fromEntries(
    Object.entries(source)
      .filter(
        ([key]) =>
          scenarios.some(
            (name) => key === name || key.startsWith(name + "/cohort/"),
          ) ||
          (key.startsWith("source-listing/state/") &&
            Object.hasOwn(
              US_STATES,
              key.slice("source-listing/state/".length),
            )),
      )
      .map(([key, tally]) => [
        key,
        {
          cases: number(tally.cases),
          matched: number(tally.matched),
          candidates: number(tally.candidates),
          invalid: number(tally.invalid),
          ambiguous: number(tally.ambiguous),
          firstCandidateMatched: number(tally.firstCandidateMatched),
          alternativeOnlyMatched: number(tally.alternativeOnlyMatched),
          singleCandidateMatched: number(tally.singleCandidateMatched),
          matchingCandidates: number(tally.matchingCandidates),
          disagreeingCandidates: number(tally.disagreeingCandidates),
          noCandidates: number(tally.noCandidates ?? tally.invalid),
          missing: Object.fromEntries(
            Object.entries(tally.missing ?? {})
              .filter(([field]) =>
                [
                  "houseNumber",
                  "streetName",
                  "streetSuffix",
                  "preDirectional",
                  "postDirectional",
                  "unit",
                  "no-candidates",
                ].includes(field),
              )
              .map(([field, count]) => [field, number(count)]),
          ),
        },
      ]),
  );
}
function transitions(source = {}) {
  return Object.fromEntries(
    scenarios
      .filter((key) => source[key])
      .map((key) => [
        key,
        {
          improved: number(source[key].improved),
          regressed: number(source[key].regressed),
          ...(Number.isFinite(source[key].firstCandidateImproved)
            ? {
                firstCandidateImproved: number(
                  source[key].firstCandidateImproved,
                ),
                firstCandidateRegressed: number(
                  source[key].firstCandidateRegressed,
                ),
              }
            : {}),
        },
      ]),
  );
}
export function reportRecord(record, evaluation, annotation = {}) {
  const parserOptions = evaluation?.parserOptions?.[record.version ?? "current"] ?? record.parserOptions;
  const selected = evaluation?.results?.[record.version ?? "current"];
  const metrics = aggregateScenarios(selected?.scenarios);
  if (
    !Object.keys(metrics).length &&
    Number.isFinite(record.cases) &&
    Number.isFinite(record.matched)
  )
    metrics["source-listing"] = {
      cases: record.cases,
      matched: record.matched,
      candidates: Number.isFinite(record.meanCandidates)
        ? record.meanCandidates * record.cases
        : null,
      missing: {},
    };
  const result = {
    id: record.id ?? basename(record.directory),
    kind: record.kind ?? "cycle",
    label: annotation.label ?? record.label ?? "Research cycle",
    note: annotation.note ?? record.note ?? "",
    started: record.started,
    status: record.status ?? "checkpoint",
    phase: record.phase,
    split: evaluation?.split ?? record.split ?? "development",
    corpusHash: record.corpusHash,
    sourceHash: record.sourceHash,
    evaluatorHash: record.evaluatorHash,
    measurementVersion: evaluation?.measurementVersion,
    parserOptions: typeof parserOptions?.spellingAlternatives === "boolean" ? { spellingAlternatives: parserOptions.spellingAlternatives } : undefined,
    experiment: projectExperiment(record.experiment),
    diagnosticMeasurement: "mls-attom-field-agreement",
    objective: record.objective ?? "legacy-cross-source-agreement",
    performance: record.performance
      ? Object.fromEntries(
          [
            "cases",
            "baselineMs",
            "currentMs",
            "withoutSpellingMs",
            "changePercent",
          ].map((key) => [key, number(record.performance[key])]),
        )
      : undefined,
    policyHash: record.policyHash ?? evaluation?.policyHash,
    policyVersion: record.policyVersion ?? evaluation?.policyVersion,
    baselineHash: record.baselineHash,
    target: number(record.target) ?? 80,
    scenarios: metrics,
    baseline: aggregateScenarios(evaluation?.results?.baseline?.scenarios),
    transitions:
      record.version === "baseline"
        ? {}
        : transitions(evaluation?.transitions ?? record.transitions),
  };
  result.comparisonKey = diagnosticIdentity(result);
  result.evidenceStatus = "diagnostic";
  return result;
}

export function projectExperiment(value) {
  if (!value) return null;
  // Only intentionally public notebook fields; no inputs, review notes or file paths.
  return Object.fromEntries(["question", "hypothesis", "expectedEffect", "change", "acceptanceRule", "decision", "decisionReason"].map((key) =>
    [key, typeof value[key] === "string" ? value[key] : null]));
}

/** No inputs, annotation notes, case IDs or arbitrary version names are exported. */
export function projectAgentEvaluation(source) {
  const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null;
  if (source?.schema !== "agent-label-evaluation-v1" || source.annotationStatus !== "provisional" || source.releaseEligible !== false)
    throw new Error("Expected experimental agent-label evaluation");
  const ratio = value => {
    const numerator = number(value?.numerator), denominator = number(value?.denominator);
    return {numerator, denominator, rate: numerator !== null && denominator > 0 ? numerator / denominator : null};
  };
  const results = {};
  for (const version of ["baseline", "current"]) {
    if (!source.results?.[version]) continue;
    results[version] = {};
    for (const mode of ["without-spelling", "with-spelling"]) {
      const r = source.results[version][mode];
      if (!r || r.releaseEligible !== false || r.definition?.annotationStatus !== "provisional" || r.definition?.parserOptions?.spellingAlternatives !== (mode === "with-spelling"))
        throw new Error("Agent evaluation conditions differ");
      results[version][mode] = {
        parserHash: digest(r.parserHash), definitionId: digest(r.definition.id),
        sampleHash: digest(r.definition.sampleHash), annotationHash: digest(r.definition.annotationHash),
        summary: {
          ...Object.fromEntries(["cases", "unsupportedReadings", "emittedCandidates", "duplicateReadings"].map(key => [key, number(r.summary?.[key])])),
          ...Object.fromEntries(["labelingCoverage", "exactInterpretationSet", "acceptedReadingRecall", "supportedReadingPrecision", "completeSecondaryChain", "noCandidateOnSupportedInput"].map(key => [key, ratio(r.summary?.[key])])),
        },
      };
    }
  }
  return {annotationStatus: "provisional", releaseEligible: false, bundleHash: digest(source.bundleHash), corpusHash: digest(source.corpusHash), policyHash: digest(source.policyHash), results,
    transitions: Object.fromEntries(["without-spelling", "with-spelling"].map(mode => [mode, Object.fromEntries(["exactGained", "exactLost", "labeledReadingsGained", "labeledReadingsLost"].map(key => [key, number(source.transitions?.[mode]?.[key])]))]))};
}

export async function collectReport(root) {
  const config = (await optionalJSON(join(root, "report-config.json"))) ?? {};
  let labeling;
  if (config.labelingProgress) {
    const file = resolve(config.labelingProgress);
    if (!file.split(/[\\/]/).includes(".local") || !file.endsWith(".json"))
      throw new Error("Labeling progress must be JSON under .local");
    const progress = await optionalJSON(file);
    if (progress && (!config.activeDataset || config.corpora?.[progress.corpusHash]?.id === config.activeDataset))
      labeling = projectLabelingProgress(progress);
  }
  let labelingExpansion;
  if (config.labelingExpansion) {
    const run = await readExpansion(config.labelingExpansion);
    if (!config.activeDataset || config.corpora?.[run.manifest.corpusHash]?.id === config.activeDataset) {
      const final = await optionalJSON(join(run.directory, "final-summary.json"));
      if (final && createHash("sha256").update(await readFile(join(run.directory, "provisional.labels.jsonl"))).digest("hex") !== final.outputSha256)
        throw new Error("Expanded annotation receipt differs");
      const comparison = await optionalJSON(join(run.directory, "comparison-summary.json"));
      let events = [];
      try { events = (await readFile(join(run.directory, "execution.jsonl"), "utf8")).split("\n").filter(line => line.trim()).map(JSON.parse); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      const workerState = events.filter(event => ["model-capacity-backoff", "worker-resumed", "labeling-stopped-by-user"].includes(event.event)).at(-1)?.event;
      labelingExpansion = projectLabelingExpansion(run, comparison, final, workerState === "model-capacity-backoff", workerState === "labeling-stopped-by-user");
    }
  }
  let curation;
  if (config.curationManifest) {
    const path = resolve(config.curationManifest);
    if (
      !path.split(/[\\/]/).includes(".local") ||
      !path.endsWith(".manifest.json")
    )
      throw new Error("Corpus manifests must stay under .local");
    const manifest = await optionalJSON(path);
    if (manifest)
      curation = {
        sourceRows: number(manifest.sourceRows),
        retained: number(manifest.retained),
        excluded: number(manifest.excluded),
        policyVersion: manifest.policyVersion,
        byReason: Object.fromEntries(
          Object.entries(manifest.byReason ?? {})
            .filter(([reason]) =>
              [
                "missing-listing-address",
                "missing-reference-primary-fields",
                "placeholder-address",
                "land-description",
                "reference-house-number-not-observed",
                "reference-street-name-not-verified",
                "reference-street-suffix-not-observed",
                "reference-pre-directional-not-observed",
                "reference-post-directional-not-observed",
                "reference-unit-not-observed",
                "explicit-unit-missing-from-reference",
                "holdout-address-previously-seen",
              ].includes(reason),
            )
            .map(([reason, count]) => [reason, number(count)]),
        ),
      };
  }
  const records = [], agentEvaluations = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const record = await optionalJSON(join(root, entry.name, "run.json"));
    if (!record?.started || !record.corpusHash) continue;
    const decision = await optionalJSON(join(root, entry.name, "decision.json"));
    if (decision) record.experiment = { ...record.experiment, ...verifyDecision(await readFile(join(root, entry.name, "run.json")), decision) };
    const evaluation = await optionalJSON(
      join(root, entry.name, "development.json"),
    );
    if (record.agentEvaluation && (!config.activeDataset || config.corpora?.[record.corpusHash]?.id === config.activeDataset)) {
      const bytes = await readFile(join(root, entry.name, "agent-evaluation", "evaluation.json"));
      if (createHash("sha256").update(bytes).digest("hex") !== record.agentEvaluation.sha256)
        throw new Error("Agent evaluation artifact changed");
      const agent = JSON.parse(bytes);
      if (agent.corpusHash !== record.corpusHash || agent.policyHash !== record.policyHash || agent.bundleHash !== record.agentBundleHash)
        throw new Error("Agent evaluation population or labels differ from the cycle");
      agentEvaluations.push({started: record.started, ...projectAgentEvaluation(agent)});
    }
    records.push(
      reportRecord(
        { ...record, id: entry.name },
        evaluation,
        config.annotations?.[entry.name],
      ),
    );
  }
  for (const checkpoint of config.checkpoints ?? []) {
    const file = resolve(checkpoint.file);
    if (!file.split(/[\\/]/).includes(".local") || !file.endsWith(".json"))
      throw new Error("Checkpoint aggregates must be JSON files under .local");
    const evaluation = await optionalJSON(file);
    if (!evaluation) continue;
    records.push(
      reportRecord(
        { ...checkpoint, kind: checkpoint.kind ?? "checkpoint" },
        evaluation,
      ),
    );
  }
  const datasets = new Map();
  for (const record of records) {
    const metadata = config.corpora?.[record.corpusHash] ?? {
      id: record.corpusHash,
      label: `Corpus ${record.corpusHash.slice(0, 8)}`,
    };
    record.dataset = metadata.id;
    if (
      (!config.activeDataset || metadata.id === config.activeDataset) &&
      !datasets.has(metadata.id)
    )
      datasets.set(metadata.id, {
        id: metadata.id,
        label: metadata.label,
        rows: number(metadata.rows),
        description: metadata.description ?? "",
      });
  }
  records.sort(
    (a, b) => a.started.localeCompare(b.started) || a.id.localeCompare(b.id),
  );
  return {
    generatedAt: new Date().toISOString(),
    objective: RESEARCH_OBJECTIVE,
    correctness: assessResearchObjective().correctness,
    benchmark: {
      status: "in-preparation", outputContract: OUTPUT_CONTRACT,
      normalization: NORMALIZATION, metrics: METRICS,
      scorer: "implemented", calibration: "pending", populationEvaluation: "not-run",
      externalBaselines: "not-run", releaseClaims: [],
    },
    labeling,
    labelingExpansion,
    agentEvaluations: agentEvaluations.sort((a, b) => a.started.localeCompare(b.started)),
    target:
      Number.isFinite(config.target) &&
      config.target > 0 &&
      config.target <= 100
        ? config.target
        : undefined,
    curation,
    defaultDataset: config.activeDataset ?? config.defaultDataset,
    states: US_STATES,
    datasets: [...datasets.values()],
    records: config.activeDataset
      ? records.filter((record) => record.dataset === config.activeDataset)
      : records,
  };
}

/** Only aggregate progress leaves the private expanded annotation workspace. */
export function projectLabelingExpansion(run, comparison, final, waitingForModel = false, stoppedByUser = false) {
  const a = new Set(run.passes.a.map(r => r.caseId)), b = new Set(run.passes.b.map(r => r.caseId));
  const fresh = new Set(run.fresh.map(r => r.caseId)), states = {};
  for (const record of run.manifest.records) {
    const code = record.stratum?.split("/")[0];
    if (!Object.hasOwn(US_STATES, code)) continue;
    const group = states[code] ??= {prepared: 0, reused: 0, newInputs: 0, passA: 0, passB: 0};
    group.prepared++;
    group.reused += Number(!fresh.has(record.caseId));
    group.newInputs += Number(fresh.has(record.caseId));
    group.passA += Number(a.has(record.caseId)); group.passB += Number(b.has(record.caseId));
  }
  return {prepared: run.records.length, reused: run.reused.length, newInputs: run.fresh.length,
    passA: a.size, passB: b.size, states, model: "gpt-6-luna", releaseEligible: false,
    phase: final ? "complete-provisional" : stoppedByUser ? "paused" : waitingForModel ? "waiting-model-capacity" : comparison ? "awaiting-adjudication" : "labeling",
    reviewRequired: number(comparison?.reviewRequired), disagreements: number(comparison?.disagreements),
    final: final ? Object.fromEntries(["adjudicated", "agentAccepted", "unresolved"].map(key => [key, number(final[key])])) : null};
}

/** Annotation text, notes and IDs never enter the shareable research HTML. */
export function projectLabelingProgress(source) {
  const fields = (value, names) => Object.fromEntries(names.map((name) => [name, number(value?.[name])]));
  return {
    ...fields(source, ["prepared", "paired", "agreements", "disagreements", "auditSample"]),
    phase: ["labeling", "awaiting-adjudication", "pilot-complete-provisional"].includes(source.phase) ? source.phase : "unknown",
    model: source.model === "gpt-6-luna" ? source.model : "unrecorded",
    correctness: "not-measured", humanReviewed: 0,
    workers: Object.fromEntries(["a", "b"].map((key) => [key, fields(source.workers?.[key], ["labeled", "valid", "completedBatches"])])),
    states: Object.fromEntries(Object.entries(source.states ?? {}).filter(([code]) => Object.hasOwn(US_STATES, code))
      .map(([code, value]) => [code, fields(value, ["prepared", "passA", "passB", "paired", "agreements", "disagreements"])])),
    timing: fields(source.timing, ["measuredBatches", "medianBatchSeconds", "elapsedSeconds"]),
    tokenUsage: number(source.tokenUsage), costUsd: number(source.costUsd),
    final: source.final ? fields(source.final, ["adjudicated", "agentAccepted", "unresolved", "auditCases", "auditDisagreements", "consensusAuditCases", "consensusAuditDisagreements"]) : undefined,
  };
}

export async function renderReport(data) {
  const folder = new URL("./research-report/", import.meta.url);
  const [template, css, script] = await Promise.all(
    ["template.html", "style.css", "client.js"].map((file) =>
      readFile(new URL(file, folder), "utf8"),
    ),
  );
  // Compile the real library source. Report tests also work on clean checkouts
  // before package dist/ exists; the hash identifies this exact browser bundle.
  const entry = new URL("../src/index.ts", import.meta.url);
  const packageInfo = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const runtime = await build({ entryPoints: [fileURLToPath(entry)], bundle: true, write: false, format: "iife", globalName: "ParserLab", platform: "browser", target: "es2020", minify: true, logLevel: "silent" });
  const json = JSON.stringify({ ...data, explorer: {
    version: packageInfo.version, buildHash: createHash("sha256").update(runtime.outputFiles[0].contents).digest("hex"),
    parserOptions: { spellingAlternatives: false },
  } })
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return template
    .replace("/* REPORT_STYLE */", () => css)
    .replace("/* PARSER_RUNTIME */", () => runtime.outputFiles[0].text.replaceAll("</script", "<\\/script"))
    .replace("/* REPORT_SCRIPT */", () => script)
    .replace("{{DATA}}", () => json);
}
export async function writeResearchReport(
  root = resolve(".local/research"),
  output = join(root, "index.html"),
) {
  root = resolve(root);
  output = resolve(output);
  if (![root, output].every((path) => path.split(/[\\/]/).includes(".local")))
    throw new Error("Research reports must stay under .local");
  await mkdir(root, { recursive: true });
  const data = await collectReport(root);
  const html = await renderReport(data);
  await mkdir(resolve(output, ".."), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, html);
  await rename(temporary, output);
  return { output, records: data.records.length };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  const option = (name, fallback) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  console.log(
    JSON.stringify(
      await writeResearchReport(
        option("--input", ".local/research"),
        option("--output"),
      ),
    ),
  );
}
