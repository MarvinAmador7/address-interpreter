import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { ACTIVE_CORPUS } from "./corpus-policy.mjs";
import { verifyActiveCorpus } from "./corpus-integrity.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const baseline = option("--baseline");
const current = option("--module", "dist/index.js");
const output = option("--output", ".local/parser-benchmark.json");
const stride = Number(option("--stride", "16"));
const rounds = Number(option("--rounds", "8"));
if (
  !baseline ||
  !Number.isInteger(stride) ||
  stride < 1 ||
  !Number.isInteger(rounds) ||
  rounds < 4
)
  throw new Error(
    "Usage: benchmark-parser.mjs --baseline <frozen.mjs> [--stride 16] [--rounds 8]",
  );
if (!resolve(output).split(/[\\/]/).includes(".local"))
  throw new Error("Keep benchmarks in .local");
const content = await readFile(ACTIVE_CORPUS);
const manifest = await verifyActiveCorpus(ACTIVE_CORPUS, content);
// One corpus, development only. Input preparation is outside the timed region.
const inputs = content
  .toString()
  .trim()
  .split("\n")
  .map(JSON.parse)
  .filter((row) => row.split === "development")
  .filter((_, index) => index % stride === 0)
  .map((row) => ({
    deliveryLine: row.listing_address,
    city: row.city,
    state: row.state,
    postalCode: row.zip,
  }));
const [oldLibrary, library] = await Promise.all(
  [baseline, current].map((file) => import(pathToFileURL(resolve(file)))),
);
const parsers = {
  baseline: (input) => oldLibrary.interpretAddress(input),
  current: (input) => library.interpretAddress(input),
  withoutSpelling: (input) =>
    library.interpretAddress(input, { spellingAlternatives: false }),
};
function run(parse) {
  let candidates = 0,
    rejected = 0;
  const started = performance.now();
  for (const input of inputs) {
    const result = parse(input);
    candidates += result.candidates.length;
    rejected += Number(result.candidates.length === 0);
  }
  return { ms: performance.now() - started, candidates, rejected };
}
for (let warmup = 0; warmup < 2; warmup++)
  for (const parse of Object.values(parsers)) run(parse);
const trials = Object.fromEntries(
  Object.keys(parsers).map((name) => [name, []]),
);
// Alternating forward/reverse order reduces systematic order effects.
for (let round = 0; round < rounds; round++) {
  const names = Object.keys(parsers);
  if (round % 2) names.reverse();
  for (const name of names) trials[name].push(run(parsers[name]));
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const medianMs = Object.fromEntries(
  Object.entries(trials).map(([name, values]) => [
    name,
    median(values.map((v) => v.ms)),
  ]),
);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const report = {
  createdAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  corpusHash: manifest.sha256,
  baselineHash: digest(await readFile(baseline)),
  currentHash: digest(await readFile(current)),
  cases: inputs.length,
  stride,
  rounds,
  method:
    "Every nth admitted development input. Two full-sample warmups per parser, then alternating forward/reverse trials. Parser calls only; local timing, not a latency guarantee. Without-spelling mode has different output semantics.",
  trials,
  medianMs,
  changePercent: (medianMs.current / medianMs.baseline - 1) * 100,
};
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    { cases: inputs.length, medianMs, changePercent: report.changePercent },
    null,
    2,
  ),
);
