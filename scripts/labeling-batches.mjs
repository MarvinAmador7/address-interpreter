import { readFile, writeFile, rename, stat } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { validateBatch } from "./labeling-pilot.mjs";
import { hash, annotationKey } from "./labeling-contract.mjs";

const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const lines = (content) => content.split("\n").filter((s) => s.trim()).map(JSON.parse);
const local = (path) => {
  const value = resolve(path);
  if (!value.split(/[\\/]/).includes(".local")) throw new Error("Private path required");
  return value;
};
const safeName = (name) => {
  if (typeof name !== "string" || basename(name) !== name) throw new Error("Batch filenames must be local basenames");
  return name;
};
const optional = async (path) => {
  try { return await readFile(path, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
};

export async function inspectBatches(directory) {
  directory = local(directory);
  const manifest = await json(join(directory, "manifest.json"));
  const batches = await json(join(directory, "batches.json"));
  const input = await readFile(join(directory, "inputs.jsonl"), "utf8");
  if (hash(input) !== manifest.inputsSha256 || hash(await readFile("docs/labeling-guide-v1.md")) !== manifest.guideSha256)
    throw new Error("Frozen pilot input or guide changed");
  const records = lines(input), originals = new Map(records.map((r) => [r.caseId, JSON.stringify(r)]));
  const workers = { a: { labeled: 0, valid: 0, completedBatches: 0 }, b: { labeled: 0, valid: 0, completedBatches: 0 } };
  const annotations = { a: [], b: [] }, details = [];
  const membership = { a: new Set(), b: new Set() };
  const events = lines(await optional(join(directory, "execution.jsonl")) ?? "");
  const durations = [];
  for (const batch of batches.batches) {
    if (!workers[batch.worker]) throw new Error("Unexpected worker");
    const batchText = await readFile(join(directory, safeName(batch.input)), "utf8"), inputs = lines(batchText);
    if (hash(batchText) !== batch.inputSha256 || inputs.length !== batch.count || inputs.some((r) => originals.get(r.caseId) !== JSON.stringify(r)))
      throw new Error("Batch input differs from frozen pilot");
    for (const record of inputs) {
      if (membership[batch.worker].has(record.caseId)) throw new Error("Repeated batch membership");
      membership[batch.worker].add(record.caseId);
    }
    const file = join(directory, safeName(batch.output)), text = await optional(file);
    if (text === null) { details.push({ worker: batch.worker, batch: batch.batch, status: "pending" }); continue; }
    let output;
    try { output = lines(text); } catch { details.push({ worker: batch.worker, batch: batch.batch, status: "incomplete-json" }); continue; }
    workers[batch.worker].labeled += output.length;
    const validation = validateBatch(inputs, output);
    if (!validation.valid) { details.push({ worker: batch.worker, batch: batch.batch, status: "invalid", errors: validation.errors }); continue; }
    annotations[batch.worker].push(...output);
    workers[batch.worker].valid += output.length;
    workers[batch.worker].completedBatches++;
    const dispatch = events.filter((e) => e.event === "batch-dispatched" && e.worker === batch.worker && e.batch === batch.batch).at(-1);
    const finishedAt = (await stat(file)).mtime.toISOString();
    const seconds = dispatch ? (Date.parse(finishedAt) - Date.parse(dispatch.at)) / 1000 : null;
    if (seconds !== null && seconds >= 0) durations.push(seconds);
    details.push({ worker: batch.worker, batch: batch.batch, status: "validated", sha256: hash(text), finishedAt, durationSeconds: seconds });
  }
  for (const members of Object.values(membership)) if (members.size !== records.length) throw new Error("Batches do not cover every pilot record");
  const a = new Map(annotations.a.map((r) => [r.caseId, r])), b = new Map(annotations.b.map((r) => [r.caseId, r]));
  let paired = 0, agreements = 0;
  const states = {};
  for (const meta of manifest.records) {
    const state = meta.stratum.split("/")[0];
    const group = states[state] ??= { prepared: 0, passA: 0, passB: 0, paired: 0, agreements: 0, disagreements: 0 };
    group.prepared++;
    group.passA += Number(a.has(meta.caseId)); group.passB += Number(b.has(meta.caseId));
    if (!a.has(meta.caseId) || !b.has(meta.caseId)) continue;
    paired++; group.paired++;
    if (annotationKey(a.get(meta.caseId)) === annotationKey(b.get(meta.caseId))) { agreements++; group.agreements++; }
    else group.disagreements++;
  }
  durations.sort((a, b) => a - b);
  const median = durations.length ? (durations[Math.floor((durations.length - 1) / 2)] + durations[Math.ceil((durations.length - 1) / 2)]) / 2 : null;
  const finalized = await optional(join(directory, "final-summary.json"));
  const final = finalized ? JSON.parse(finalized) : null;
  const progress = {
    schemaVersion: "labeling-progress-v1", generatedAt: new Date().toISOString(), corpusHash: manifest.corpusHash,
    phase: final ? "pilot-complete-provisional" : paired === records.length ? "awaiting-adjudication" : "labeling",
    prepared: records.length, workers, paired, agreements, disagreements: paired - agreements, states,
    model: "gpt-6-luna", reasoning: "medium", batchSize: batches.batchSize,
    auditSample: manifest.auditIds.length, humanReviewed: 0, correctness: "not-measured",
    timing: { measuredBatches: durations.length, medianBatchSeconds: median, elapsedSeconds: ((final ? Date.parse(final.completedAt) : Date.now()) - Date.parse(manifest.createdAt)) / 1000 },
    tokenUsage: null, costUsd: null,
    usageNote: "Managed worker runtime does not expose billed tokens or cost; elapsed includes coordination and review.",
    final,
  };
  return { progress, details, records, annotations };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const directory = local(args.includes("--run") ? args[args.indexOf("--run") + 1] : ".local/correctness-review/luna-pilot-v1");
  if (command === "prepare") {
    const batches = [];
    for (const worker of ["a", "b"]) {
      const records = lines(await readFile(join(directory, `worker-${worker}.input.jsonl`), "utf8"));
      for (let i = 0; i < records.length; i += 20) {
        const batch = i / 20 + 1, stem = `worker-${worker}.batch${String(batch).padStart(2, "0")}`;
        const subset = records.slice(i, i + 20), content = subset.map((r) => JSON.stringify(r)).join("\n") + "\n";
        await writeFile(join(directory, stem + ".input.jsonl"), content, { flag: "wx", mode: 0o600 });
        batches.push({ worker, batch, input: stem + ".input.jsonl", output: stem + ".labels.jsonl", count: subset.length, inputSha256: hash(content) });
      }
    }
    await writeFile(join(directory, "batches.json"), JSON.stringify({ createdAt: new Date().toISOString(), batchSize: 20, batches }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ batches: batches.length, batchSize: 20 }));
    return;
  }
  const result = await inspectBatches(directory);
  if (command === "merge") {
    for (const worker of ["a", "b"]) {
      const check = validateBatch(result.records, result.annotations[worker]);
      if (!check.valid) throw new Error(`Worker ${worker} is not complete and valid`);
    }
    for (const worker of ["a", "b"])
      await writeFile(join(directory, `worker-${worker}.labels.jsonl`), result.annotations[worker].map((r) => JSON.stringify(r)).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  } else if (command !== "progress") throw new Error("Usage: labeling-batches.mjs prepare|progress|merge [--run <directory>]");
  const target = join(directory, "progress.json"), temporary = target + ".tmp";
  await writeFile(temporary, JSON.stringify(result.progress, null, 2) + "\n", { mode: 0o600 });
  await rename(temporary, target);
  const { states, final, ...summary } = result.progress;
  console.log(JSON.stringify({ ...summary, stateGroups: Object.keys(states).length }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
