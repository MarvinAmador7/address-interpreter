import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateBatch, comparePasses } from "./labeling-pilot.mjs";
import { inspectBatches } from "./labeling-batches.mjs";
import { hash, annotationKey, materializeAnnotation } from "./labeling-contract.mjs";

const readLines = async (path) => (await readFile(path, "utf8")).split("\n").filter((v) => v.trim()).map(JSON.parse);

export function finalizeLabels(records, passA, passB, audit, adjudicated, auditIds) {
  const byId = (rows) => new Map(rows.map((r) => [r.caseId, r]));
  const a = byId(passA), b = byId(passB), c = byId(adjudicated), audited = byId(audit);
  const comparisons = comparePasses(records, passA, passB, auditIds);
  const required = new Set(comparisons.filter((r) => r.reviewRequired).map((r) => r.caseId));
  for (const [subset, annotations] of [
    [records.filter((r) => required.has(r.caseId)), adjudicated],
    [records.filter((r) => auditIds.includes(r.caseId)), audit],
  ]) if (!validateBatch(subset, annotations).valid) throw new Error("Adjudication and blind audit must be complete and valid");
  let auditDisagreements = 0, consensusAuditCases = 0, consensusAuditDisagreements = 0, consensusOverturned = 0;
  for (const id of auditIds) {
    const first = annotationKey(a.get(id)), second = annotationKey(b.get(id)), blind = annotationKey(audited.get(id));
    if (blind !== first || blind !== second) auditDisagreements++;
    if (first === second) {
      consensusAuditCases++;
      if (blind !== first) consensusAuditDisagreements++;
      if (annotationKey(c.get(id)) !== first) consensusOverturned++;
    }
  }
  const output = records.map((record) => {
    const annotation = required.has(record.caseId) ? c.get(record.caseId) : a.get(record.caseId);
    const supported = ["address", "ambiguous"].includes(annotation.status);
    return { ...materializeAnnotation(record, annotation),
      review: { status: !supported ? "unresolved" : required.has(record.caseId) ? "agent-adjudicated" : "agent-consensus",
        provisional: true, humanReviewed: false, inputBlindAudit: auditIds.includes(record.caseId),
        annotators: ["gpt-6-luna/pass-a", "gpt-6-luna/pass-b"],
        adjudicator: required.has(record.caseId) ? "separate-parent-model-reviewer" : null,
      } };
  });
  const statuses = {};
  for (const label of output) statuses[label.status] = (statuses[label.status] ?? 0) + 1;
  return { output, summary: { prepared: records.length, agreements: comparisons.filter((r) => r.agrees).length,
    disagreements: comparisons.filter((r) => !r.agrees).length, adjudicated: required.size,
    agentAccepted: output.filter((r) => r.review.status !== "unresolved").length,
    unresolved: output.filter((r) => r.review.status === "unresolved").length,
    auditCases: auditIds.length, auditDisagreements, consensusAuditCases, consensusAuditDisagreements, consensusOverturned,
    statuses, humanReviewed: 0, correctness: "not-measured", targetMet: false, provisional: true,
  } };
}

async function main() {
  const args = process.argv.slice(2);
  const directory = resolve(args.includes("--run") ? args[args.indexOf("--run") + 1] : ".local/correctness-review/luna-pilot-v1");
  if (!directory.split(/[\\/]/).includes(".local")) throw new Error("Private output directory required");
  const { records, annotations, details, progress } = await inspectBatches(directory);
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  const evidenceNames = ["audit-blind.labels.jsonl", "adjudication-blind.labels.jsonl", "adjudicated.labels.jsonl", "adjudication.proposals.jsonl"];
  const evidence = {};
  for (const name of evidenceNames) evidence[name] = hash(await readFile(join(directory, name)));
  const audit = await readLines(join(directory, "audit-blind.labels.jsonl"));
  const adjudicated = await readLines(join(directory, "adjudicated.labels.jsonl"));
  const blind = await readLines(join(directory, "adjudication-blind.labels.jsonl"));
  const comparisons = comparePasses(records, annotations.a, annotations.b, manifest.auditIds);
  const required = new Set(comparisons.filter((r) => r.reviewRequired).map((r) => r.caseId));
  if (!validateBatch(records.filter((r) => required.has(r.caseId)), blind).valid)
    throw new Error("Adjudicator's original blind labels must be complete");
  const blindById = new Map(blind.map((r) => [r.caseId, r]));
  if (audit.some((r) => annotationKey(r) !== annotationKey(blindById.get(r.caseId))))
    throw new Error("Original blind audit labels were changed");
  const events = await readLines(join(directory, "execution.jsonl"));
  const freeze = events.find((e) => e.event === "blind-audit-frozen");
  if (!freeze || freeze.sha256 !== evidence["audit-blind.labels.jsonl"])
    throw new Error("Blind audit must match its pre-comparison freeze receipt");
  const adjudicationFreeze = events.find((e) => e.event === "adjudication-blind-frozen");
  if (!adjudicationFreeze || adjudicationFreeze.sha256 !== evidence["adjudication-blind.labels.jsonl"])
    throw new Error("Blind adjudication must match its pre-proposal freeze receipt");
  const { output, summary } = finalizeLabels(records, annotations.a, annotations.b, audit, adjudicated, manifest.auditIds);
  const outputText = output.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await writeFile(join(directory, "provisional.labels.jsonl"), outputText, { flag: "wx", mode: 0o600 });
  const final = { schemaVersion: "labeling-pilot-final-v1", ...summary,
    completedAt: new Date().toISOString(), corpusHash: manifest.corpusHash, queueSha256: manifest.queueSha256,
    guideSha256: manifest.guideSha256, contractSha256: hash(await readFile("scripts/labeling-contract.mjs")),
    initialContractSha256: manifest.contractSha256, outputSha256: hash(outputText), evidence,
    batchEvidence: details, timing: progress.timing, tokenUsage: null, costUsd: null,
    measurementNote: "Blind audit differences measure model disagreement, not human-verified label error. The pilot is coverage-selected development evidence, not a correctness estimate.",
  };
  await writeFile(join(directory, "final-summary.json"), JSON.stringify(final, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(summary, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
