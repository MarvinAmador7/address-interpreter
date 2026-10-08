import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const fields = ["question", "hypothesis", "expectedEffect", "change", "acceptanceRule"];
export function validateExperiment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key)))
    throw new Error("Experiment must contain only the five predeclared research fields");
  for (const key of fields) if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > 4000)
    throw new Error(`Experiment ${key} must be a nonempty public-safe description`);
  return Object.fromEntries(fields.map((key) => [key, value[key]]));
}

export function verifyDecision(runBytes, decision) {
  if (!decision || decision.runHash !== sha(runBytes)) throw new Error("Decision does not bind to these run results");
  if (!["keep", "reject", "inconclusive"].includes(decision.decision) || typeof decision.decisionReason !== "string" || !decision.decisionReason.trim() || decision.decisionReason.length > 4000)
    throw new Error("Decision requires keep/reject/inconclusive and a reason");
  if (!Number.isFinite(Date.parse(decision.recordedAt))) throw new Error("Decision requires a timestamp");
  return { decision: decision.decision, decisionReason: decision.decisionReason };
}

export async function recordDecision(directory, choice, reason) {
  directory = resolve(directory);
  if (!directory.split(/[\\/]/).includes(".local")) throw new Error("Research decisions must stay under .local");
  const bytes = await readFile(join(directory, "run.json"));
  const run = JSON.parse(bytes);
  if (run.status === "running") throw new Error("Wait for evaluation to finish before recording a decision");
  if (!run.experiment) throw new Error("This run has no predeclared experiment; preserve it as a diagnostic checkpoint");
  validateExperiment(run.experiment);
  const decision = { runHash: sha(bytes), recordedAt: new Date().toISOString(), decision: choice, decisionReason: reason };
  verifyDecision(bytes, decision);
  // A new sidecar, never an edit of the experiment plan or completed run evidence.
  await writeFile(join(directory, "decision.json"), JSON.stringify(decision, null, 2) + "\n", { flag: "wx" });
  return decision;
}

async function main() {
  const args = process.argv.slice(2), option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  if (!option("--run") || !option("--decision") || !option("--reason")) throw new Error("Usage: research-experiment.mjs --run .local/research/<run> --decision keep|reject|inconclusive --reason <public-safe rationale>");
  const result = await recordDecision(option("--run"), option("--decision"), option("--reason"));
  const { writeResearchReport } = await import("./research-report.mjs");
  await writeResearchReport(resolve(option("--run"), ".."));
  console.log(JSON.stringify(result));
}

// Finish module initialization before loading the report, which imports
// verifyDecision from this module. Awaiting that import at top level deadlocks.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
