import {
  readFile,
  readdir,
  mkdir,
  writeFile,
  appendFile,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeResearchReport } from "./research-report.mjs";
import { ACTIVE_CORPUS } from "./corpus-policy.mjs";
import { verifyActiveCorpus } from "./corpus-integrity.mjs";
import { assessResearchObjective, RESEARCH_OBJECTIVE } from "./research-objective.mjs";
import { validateExperiment } from "./research-experiment.mjs";
import { readAgentBundle, evaluateAgentBenchmark } from "./agent-benchmark.mjs";

// One autonomous measurement cycle: quality checks -> development evaluation ->
// cross-source disagreement groups -> immutable run evidence -> correctness gate.
// An agent chooses and implements the next hypothesis from development evidence.
// This command never reads individual holdout failures or changes scoring rules.
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = resolve(option("--output", ".local/research"));
const reportConfig = JSON.parse(
  await readFile(join(root, "report-config.json"), "utf8").catch((error) => {
    if (error.code === "ENOENT") return "{}";
    throw error;
  }),
);
const target = Number(option("--target", reportConfig.target ?? 95));
const baseline = option("--baseline");
const experimentFile = option("--experiment");
const experiment = experimentFile ? validateExperiment(JSON.parse(await readFile(experimentFile, "utf8"))) : undefined;
const input = ACTIVE_CORPUS;
if (resolve(option("--input", input)) !== resolve(input))
  throw new Error(
    "Research cycles use the single frozen curated corpus at " + input,
  );
if (!baseline || !Number.isFinite(target) || target <= 0 || target > 100)
  throw new Error(
    "Usage: research-cycle.mjs --baseline <frozen-build.mjs> [--target 95]",
  );
if (!root.split(/[\\/]/).includes(".local"))
  throw new Error("Reports must stay under .local");
await readFile(baseline); // Fail before doing work if the comparison build is absent.
const hash = (value) => createHash("sha256").update(value).digest("hex");
const files = async (dir) =>
  (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map(async (entry) =>
        entry.isDirectory()
          ? files(join(dir, entry.name))
          : [join(dir, entry.name)],
      ),
    )
  ).flat();
const sourceFiles = [...(await files("src")), ...(await files("test"))].sort();
const sourceHash = hash(
  (
    await Promise.all(
      sourceFiles.map(
        async (path) => path + "\n" + (await readFile(path, "utf8")),
      ),
    )
  ).join("\n"),
);
const corpusContent = await readFile(input);
const corpusManifest = await verifyActiveCorpus(input, corpusContent);
const corpusHash = hash(corpusContent);
const agentBundleFile = option("--agent-benchmark", reportConfig.agentBenchmark);
const agentBundle = agentBundleFile ? await readAgentBundle(agentBundleFile) : undefined;
if (agentBundle && (agentBundle.bundle.corpusHash !== corpusHash || agentBundle.bundle.policyHash !== corpusManifest.policySha256))
  throw new Error("Agent labels must belong to the active frozen corpus and policy");
const evaluatorHash = hash(
  Buffer.concat([
    await readFile("scripts/evaluate-corpus.mjs"),
    await readFile("scripts/evaluation-metrics.mjs"),
    await readFile("scripts/benchmark-parser.mjs"),
    await readFile("scripts/usps-suffix-reference.json"),
    await readFile("scripts/corpus-policy.mjs"),
    await readFile("scripts/corpus-integrity.mjs"),
    await readFile("scripts/usps-suffix-aliases.json"),
    await readFile("scripts/research-objective.mjs"),
  ]),
);
const started = new Date().toISOString();
const directory = join(
  root,
  `${started.replace(/[:.]/g, "-")}-${sourceHash.slice(0, 8)}`,
);
await mkdir(directory, { recursive: true });
const context = {
  started,
  sourceHash,
  corpusHash,
  policyHash: corpusManifest.policySha256,
  policyVersion: corpusManifest.policyVersion,
  evaluatorHash,
  baselineHash: hash(await readFile(baseline)),
  input: resolve(input),
  baseline: resolve(baseline),
  target,
  objective: RESEARCH_OBJECTIVE,
  diagnosticMeasurement: "mls-attom-field-agreement",
  parserOptions: { spellingAlternatives: true },
  experiment,
  experimentHash: experiment ? hash(JSON.stringify(experiment)) : undefined,
  agentBundleHash: agentBundle?.hash,
  directory,
  label: option("--label", "Research cycle"),
  note: option("--note", ""),
};
await writeFile(
  join(directory, "run.json"),
  JSON.stringify({ ...context, status: "running" }, null, 2) + "\n",
);
async function updateVisualization() {
  try {
    await writeResearchReport(root);
  } catch (error) {
    console.error(`Visualization update failed: ${error.message}`);
  }
}
await updateVisualization();
let phase = "checks";
function run(command, arguments_, logfile) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return writeFile(
    join(directory, logfile),
    (result.stdout ?? "") + (result.stderr ?? ""),
  ).then(() => {
    if (result.error || result.status !== 0)
      throw new Error(`${command} failed; inspect ${join(directory, logfile)}`);
  });
}
try {
  await run("npm", ["run", "check"], "checks.log");
  phase = "evaluation";
  const prefix = join(directory, "development");
  await run(
    process.execPath,
    [
      "scripts/evaluate-corpus.mjs",
      "--input",
      input,
      "--split",
      "development",
      "--baseline",
      baseline,
      "--failure-limit",
      "50000",
      "--output",
      prefix,
    ],
    "evaluation.log",
  );
  const evaluation = JSON.parse(await readFile(`${prefix}.json`, "utf8"));
  phase = "benchmark";
  await run(
    process.execPath,
    [
      "scripts/benchmark-parser.mjs",
      "--baseline",
      baseline,
      "--output",
      join(directory, "performance.json"),
    ],
    "performance.log",
  );
  const benchmark = JSON.parse(
    await readFile(join(directory, "performance.json"), "utf8"),
  );
  let agentEvaluation;
  if (agentBundle) {
    phase = "agent-evaluation";
    if ((await readAgentBundle(agentBundleFile)).hash !== agentBundle.hash)
      throw new Error("Agent label bundle changed during the cycle");
    const result = await evaluateAgentBenchmark({file: agentBundleFile, baseline, output: join(directory, "agent-evaluation")});
    if (result.report.bundleHash !== agentBundle.hash)
      throw new Error("Evaluation used a different agent label bundle");
    agentEvaluation = {sha256: hash(await readFile(result.file)), bundleHash: agentBundle.hash};
  }
  phase = "reporting";
  const failures = (await readFile(`${prefix}.failures.jsonl`, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse)
    .filter(
      (row) => row.version === "current" && row.scenario === "source-listing",
    );
  const groups = new Map();
  for (const failure of failures) {
    const key = [...failure.differences].sort().join(" + ");
    const group = groups.get(key) ?? { fields: key, cases: 0, examples: [] };
    group.cases++;
    if (group.examples.length < 5) group.examples.push(failure);
    groups.set(key, group);
  }
  const ranked = [...groups.values()].sort((a, b) => b.cases - a.cases);
  await writeFile(
    join(directory, "failure-groups.json"),
    JSON.stringify(ranked, null, 2) + "\n",
  );
  const tally = evaluation.results.current.scenarios["source-listing"];
  const score = (tally.matched / tally.cases) * 100;
  const gate = assessResearchObjective(evaluation);
  const record = {
    ...context,
    agentEvaluation,
    score,
    matched: tally.matched,
    cases: tally.cases,
    // score is retained for old aggregate consumers; it is diagnostic agreement.
    correctness: gate.correctness,
    meanCandidates: tally.candidates / tally.cases,
    firstCandidateAgreement: (tally.firstCandidateMatched / tally.cases) * 100,
    alternativeOnlyMatched: tally.alternativeOnlyMatched,
    disagreeingCandidates: tally.disagreeingCandidates,
    noCandidates: tally.noCandidates,
    performance: {
      cases: benchmark.cases,
      baselineMs: benchmark.medianMs.baseline,
      currentMs: benchmark.medianMs.current,
      withoutSpellingMs: benchmark.medianMs.withoutSpelling,
      changePercent: benchmark.changePercent,
    },
    diagnosticRegressions: gate.diagnosticRegressions,
    transitions: evaluation.transitions,
    status: gate.status,
    directory,
  };
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(record, null, 2) + "\n",
  );
  await appendFile(join(root, "history.jsonl"), JSON.stringify(record) + "\n");
  console.log(
    JSON.stringify(
      {
        ...record,
        failureGroups: ranked
          .map(({ fields, cases }) => ({ fields, cases }))
          .slice(0, 12),
      },
      null,
      2,
    ),
  );
  // Cross-source agreement cannot satisfy the parser correctness objective.
  // A loss here needs adjudication; it is not automatically a parser regression.
  process.exitCode = gate.exitCode;
} catch (error) {
  const record = { ...context, status: "failed", phase, error: error.message };
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(record, null, 2) + "\n",
  );
  await appendFile(join(root, "history.jsonl"), JSON.stringify(record) + "\n");
  console.error(JSON.stringify(record, null, 2));
  process.exitCode = 1;
} finally {
  await updateVisualization();
}
