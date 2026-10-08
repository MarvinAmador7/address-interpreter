import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { annotationTokens, validateAnnotation, annotationKey, materializeAnnotation, hash, LABEL_SCHEMA } from "./labeling-contract.mjs";

const readJSON = async (path) => JSON.parse(await readFile(path, "utf8"));
const readLines = async (path) => (await readFile(path, "utf8")).split("\n").filter((line) => line.trim()).map(JSON.parse);
const writeJSON = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
const writeLines = (path, value) => writeFile(path, value.map((v) => JSON.stringify(v)).join("\n") + "\n", { flag: "wx", mode: 0o600 });
const rank = (seed, id) => hash(`${seed}\n${id}`);
const ordered = (rows, seed) => [...rows].sort((a, b) => rank(seed, a.id).localeCompare(rank(seed, b.id)));
const privatePath = (path) => {
  const resolved = resolve(path);
  if (!resolved.split(/[\\/]/).includes(".local")) throw new Error("Label artifacts must stay under .local");
  return resolved;
};

export function selectPilot(queue, manifest, count = 200, seed = "luna-pilot-v1") {
  const metadata = new Map(manifest.records.map((r) => [r.id, r]));
  if (new Set(queue.map((r) => r.id)).size !== queue.length) throw new Error("Duplicate review IDs");
  const groups = new Map();
  for (const row of queue) {
    const stratum = metadata.get(row.id)?.stratum;
    if (!stratum || row.inputSha256 !== hash(row.input.deliveryLine)) throw new Error("Review queue provenance mismatch");
    if (row.decision !== "unreviewed" || row.readings.length) throw new Error("Pilot requires unseen review slots");
    const group = groups.get(stratum) ?? [];
    group.push(row);
    groups.set(stratum, group);
  }
  if (!Number.isSafeInteger(count) || count < groups.size || count > queue.length)
    throw new Error(`Pilot count must be between ${groups.size} and ${queue.length}`);
  // A discovery pilot deliberately covers every stratum before filling remaining
  // places. It does not estimate weighted national or corpus-wide accuracy.
  const chosen = [...groups.values()].map((g) => ordered(g, seed)[0]);
  const ids = new Set(chosen.map((r) => r.id));
  chosen.push(...ordered(queue.filter((r) => !ids.has(r.id)), seed).slice(0, count - chosen.length));
  return ordered(chosen, seed).map((row, i) => ({
    caseId: `p${String(i + 1).padStart(3, "0")}`, id: row.id,
    input: { deliveryLine: row.input.deliveryLine }, inputSha256: row.inputSha256,
    tokens: annotationTokens(row.input.deliveryLine),
  }));
}

export function validateBatch(records, annotations) {
  const byId = new Map(records.map((r) => [r.caseId, r]));
  const seen = new Set(), errors = [];
  for (const annotation of annotations) {
    const record = byId.get(annotation?.caseId);
    if (!record) { errors.push({ caseId: annotation?.caseId ?? null, errors: ["unexpected case"] }); continue; }
    if (seen.has(record.caseId)) { errors.push({ caseId: record.caseId, errors: ["duplicate case"] }); continue; }
    seen.add(record.caseId);
    const validation = validateAnnotation(record, annotation);
    if (!validation.valid) errors.push({ caseId: record.caseId, errors: validation.errors });
  }
  for (const record of records) if (!seen.has(record.caseId)) errors.push({ caseId: record.caseId, errors: ["missing case"] });
  return { valid: errors.length === 0, expected: records.length, received: annotations.length, errors };
}

export function comparePasses(records, passA, passB, auditIds = []) {
  for (const pass of [passA, passB]) {
    const validation = validateBatch(records, pass);
    if (!validation.valid) throw new Error("Both passes must pass structural validation before comparison");
  }
  const a = new Map(passA.map((r) => [r.caseId, r])), b = new Map(passB.map((r) => [r.caseId, r]));
  const audit = new Set(auditIds);
  return records.map((record) => {
    const first = a.get(record.caseId), second = b.get(record.caseId);
    const agrees = annotationKey(first) === annotationKey(second);
    return { caseId: record.caseId, agrees,
      reviewRequired: !agrees || audit.has(record.caseId) || !["address", "ambiguous"].includes(first.status),
      reasons: [!agrees && "pass-disagreement", audit.has(record.caseId) && "preselected-blind-audit",
        !["address", "ambiguous"].includes(first.status) && "non-supported-decision"].filter(Boolean) };
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const directory = privatePath(option("--run", ".local/correctness-review/luna-pilot-v1"));
  if (command === "prepare") {
    const source = privatePath(option("--source", ".local/correctness-review/development-v1"));
    const content = await readFile(join(source, "review.jsonl"), "utf8");
    const manifest = await readJSON(join(source, "manifest.json"));
    if (hash(content) !== manifest.queueSha256) throw new Error("Review queue changed after its freeze");
    const queue = content.trimEnd().split("\n").map(JSON.parse);
    const seed = "luna-pilot-v1", count = Number(option("--count", 200));
    const records = selectPilot(queue, manifest, count, seed);
    const audit = ordered(records, seed + "/audit").slice(0, Math.ceil(count * 0.1));
    const guide = await readFile("docs/labeling-guide-v1.md");
    await mkdir(resolve(directory, ".."), { recursive: true });
    await mkdir(directory);
    await writeLines(join(directory, "inputs.jsonl"), records);
    for (const worker of ["a", "b"])
      await writeLines(join(directory, `worker-${worker}.input.jsonl`), ordered(records, seed + "/" + worker));
    await writeLines(join(directory, "audit.input.jsonl"), audit);
    const metadata = new Map(manifest.records.map((r) => [r.id, r]));
    await writeJSON(join(directory, "manifest.json"), {
      schemaVersion: LABEL_SCHEMA, createdAt: new Date().toISOString(), corpusHash: manifest.corpusHash,
      queueSha256: manifest.queueSha256, guideSha256: hash(guide),
      contractSha256: hash(await readFile("scripts/labeling-contract.mjs")),
      coordinatorSha256: hash(await readFile("scripts/labeling-pilot.mjs")),
      inputsSha256: hash(await readFile(join(directory, "inputs.jsonl"))),
      seed, count, split: "development", selection: "Coverage-first pilot within the existing review sample; not an accuracy estimate",
      workers: { a: { model: "gpt-6-luna", reasoning: "medium" }, b: { model: "gpt-6-luna", reasoning: "medium" } },
      execution: "managed-collaboration-workers", auditIds: audit.map((r) => r.caseId),
      records: records.map((r) => ({ caseId: r.caseId, id: r.id, ...metadata.get(r.id) })),
    });
    console.log(JSON.stringify({ directory, records: count, audit: audit.length, correctness: "not-measured" }));
    return;
  }
  const manifest = await readJSON(join(directory, "manifest.json"));
  const inputContent = await readFile(join(directory, "inputs.jsonl"), "utf8");
  if (hash(inputContent) !== manifest.inputsSha256 || hash(await readFile("docs/labeling-guide-v1.md")) !== manifest.guideSha256)
    throw new Error("Frozen labeling input or guide changed");
  const allRecords = inputContent.trimEnd().split("\n").map(JSON.parse);
  if (command === "validate") {
    const input = option("--input");
    const records = input ? await readLines(privatePath(input)) : allRecords;
    // The optional subset must preserve original evidence exactly.
    const originals = new Map(allRecords.map((r) => [r.caseId, JSON.stringify(r)]));
    if (new Set(records.map((r) => r.caseId)).size !== records.length || records.some((r) => originals.get(r.caseId) !== JSON.stringify(r)))
      throw new Error("Validation subset differs from frozen pilot");
    const output = validateBatch(records, await readLines(privatePath(option("--file"))));
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = output.valid ? 0 : 1;
    return;
  }
  if (command === "compare") {
    const passA = await readLines(join(directory, "worker-a.labels.jsonl")), passB = await readLines(join(directory, "worker-b.labels.jsonl"));
    const comparisons = comparePasses(allRecords, passA, passB, manifest.auditIds);
    await writeJSON(join(directory, "comparison.json"), comparisons);
    const required = new Set(comparisons.filter((r) => r.reviewRequired).map((r) => r.caseId));
    await writeLines(join(directory, "adjudication.input.jsonl"), allRecords.filter((r) => required.has(r.caseId)));
    // Only read these proposals AFTER an adjudicator freezes its own blind pass.
    await writeLines(join(directory, "adjudication.proposals.jsonl"), allRecords.filter((r) => required.has(r.caseId)).map((r) => ({
      caseId: r.caseId, proposals: [passA.find((a) => a.caseId === r.caseId), passB.find((b) => b.caseId === r.caseId)],
    })));
    const summary = { schemaVersion: "labeling-pilot-summary-v1", corpusHash: manifest.corpusHash,
      prepared: allRecords.length, passA: passA.length, passB: passB.length,
      structurallyValid: true, agreements: comparisons.filter((r) => r.agrees).length,
      disagreements: comparisons.filter((r) => !r.agrees).length, reviewRequired: required.size,
      auditSample: manifest.auditIds.length, humanReviewed: 0, correctness: "not-measured",
      model: "gpt-6-luna", reasoning: "medium", tokenUsage: null, costUsd: null,
      usageNote: "Managed worker runtime did not expose per-task billed usage; null is not zero.",
    };
    await writeJSON(join(directory, "summary.json"), summary);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  throw new Error("Usage: labeling-pilot.mjs prepare|validate|compare --run <private-directory>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
