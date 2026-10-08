import { expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { recordDecision, validateExperiment, verifyDecision } from "../scripts/research-experiment.mjs";

const plan = { question: "Does a repeated secondary marker lose evidence?", hypothesis: "Retaining marker order preserves both identifiers.", expectedEffect: "Repeated-marker development cases.", change: "Keep each source span in delivery order.", acceptanceRule: "No lost readings on exhaustive fixtures; review every diagnostic regression." };
test("decision CLI exits successfully and refreshes the report after recording evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "decision-cli-")), folder = join(root, ".local", "run");
  await mkdir(folder, { recursive: true });
  try {
    await writeFile(join(folder,"run.json"),JSON.stringify({status:"awaiting-correctness-labels",experiment:plan,started:"2026-10-05T00:00:00Z",corpusHash:"a".repeat(64)}));
    const output = execFileSync(process.execPath,["scripts/research-experiment.mjs","--run",folder,"--decision","keep","--reason","Synthetic CLI regression check."],{encoding:"utf8",timeout:10000});
    expect(JSON.parse(output).decision).toBe("keep");
    expect(await readFile(join(root,".local","index.html"),"utf8")).toContain("Synthetic CLI regression check.");
  } finally { await rm(root,{recursive:true,force:true}); }
});
test("plans require predeclared acceptance criteria and cannot embed a decision", () => {
  expect(validateExperiment(plan)).toEqual(plan);
  expect(() => validateExperiment({ ...plan, acceptanceRule: "" })).toThrow();
  expect(() => validateExperiment({ ...plan, decision: "keep" })).toThrow();
});

test("decisions bind to finished run evidence, preserve history, and cannot be overwritten", async () => {
  const root = await mkdtemp(join(tmpdir(), "experiment-")), folder = join(root, ".local", "run");
  await mkdir(folder, { recursive: true });
  const path = join(folder, "run.json"), bytes = JSON.stringify({ status: "awaiting-correctness-labels", experiment: plan });
  try {
    await writeFile(path, JSON.stringify({ status: "running", experiment: plan }));
    await expect(recordDecision(folder, "keep", "Useful diagnostic gain.")).rejects.toThrow("finish");
    await writeFile(path, bytes);
    const decision = await recordDecision(folder, "inconclusive", "Labels are not calibrated.");
    expect(verifyDecision(Buffer.from(bytes), decision).decision).toBe("inconclusive");
    expect(() => verifyDecision(Buffer.from(bytes + " "), decision)).toThrow("bind");
    await expect(recordDecision(folder, "keep", "Overwrite earlier decision.")).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe(bytes);
  } finally { await rm(root, { recursive: true, force: true }); }
});
