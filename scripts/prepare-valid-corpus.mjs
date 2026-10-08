import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import {
  ACTIVE_CORPUS,
  CORPUS_POLICY_VERSION,
  assessCorpusRecord,
} from "./corpus-policy.mjs";

const source = ".local/corpus/mls-geographic.jsonl";
const holdout = ".local/corpus/mls-geographic-holdout-novel.jsonl";
const hash = (text) => createHash("sha256").update(text).digest("hex");
const output = resolve(ACTIVE_CORPUS);
const manifestPath = output.replace(/\.jsonl$/, ".manifest.json");
const exclusionsPath = output.replace(/\.jsonl$/, ".excluded.jsonl");
for (const file of [output, manifestPath, exclusionsPath]) {
  if (
    await access(file).then(
      () => true,
      () => false,
    )
  )
    throw new Error(`Frozen artifact already exists: ${file}`);
}
const [sourceText, holdoutText, policy, reference, statesReference] =
  await Promise.all([
    readFile(source, "utf8"),
    readFile(holdout, "utf8"),
    readFile(new URL("./corpus-policy.mjs", import.meta.url)),
    readFile(new URL("./usps-suffix-aliases.json", import.meta.url)),
    readFile(new URL("./research-report/states.mjs", import.meta.url)),
  ]);
const novel = new Set(
  holdoutText
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).property_group),
);
const retained = [],
  excluded = [],
  byReason = {},
  splits = {},
  cohorts = {},
  states = {};
const count = (map, key, status) => {
  (map[key] ??= { retained: 0, excluded: 0 })[status]++;
};
for (const [index, line] of sourceText.trim().split("\n").entries()) {
  const row = JSON.parse(line);
  const quality = assessCorpusRecord(row);
  if (row.split === "holdout" && !novel.has(row.property_group))
    quality.reasons.push("holdout-address-previously-seen");
  const status = quality.reasons.length ? "excluded" : "retained";
  count(splits, row.split, status);
  count(cohorts, row.cohort, status);
  count(states, row.state || "UNKNOWN", status);
  if (status === "retained") retained.push(line);
  else {
    excluded.push(
      JSON.stringify({
        sourceIndex: index,
        propertyGroup: row.property_group,
        split: row.split,
        reasons: quality.reasons,
      }),
    );
    for (const reason of quality.reasons)
      byReason[reason] = (byReason[reason] ?? 0) + 1;
  }
}
const text = retained.join("\n") + "\n";
const manifest = {
  createdAt: new Date().toISOString(),
  policyVersion: CORPUS_POLICY_VERSION,
  policySha256: hash(Buffer.concat([policy, reference, statesReference])),
  source,
  sourceSha256: hash(sourceText),
  priorHoldout: holdout,
  priorHoldoutSha256: hash(holdoutText),
  sha256: hash(text),
  sourceRows: retained.length + excluded.length,
  retained: retained.length,
  excluded: excluded.length,
  byReason,
  splits,
  cohorts,
  states,
  admission:
    "Input and reference-field consistency only. No parser output, score or failure group is used. All rejected and unverified rows are quarantined with reasons; not all are invalid real-world addresses. Street spelling checks allow spaces, hyphens, ordinals and known word abbreviations. This does not establish deliverability.",
};
await mkdir(dirname(output), { recursive: true });
await writeFile(exclusionsPath, excluded.join("\n") + "\n", { flag: "wx" });
await writeFile(output, text, { flag: "wx" });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", {
  flag: "wx",
});
console.log(JSON.stringify(manifest, null, 2));
