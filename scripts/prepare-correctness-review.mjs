import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ACTIVE_CORPUS } from "./corpus-policy.mjs";
import { verifyActiveCorpus } from "./corpus-integrity.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Sample development rows without importing a parser or examining its results. */
export function prepareReviewSample(
  rows,
  { corpusHash, count = 2000, minimum = 5, seed = "parser-correctness-v1" } = {},
) {
  if (!/^[a-f0-9]{64}$/.test(corpusHash ?? ""))
    throw new Error("A frozen corpus SHA-256 is required");
  if (!Number.isSafeInteger(count) || count < 1 ||
      !Number.isSafeInteger(minimum) || minimum < 1)
    throw new Error("Count and stratum minimum must be positive integers");
  if (typeof seed !== "string" || !seed.trim()) throw new Error("Seed is required");
  const strata = new Map();
  for (const [sourceIndex, row] of rows.entries()) {
    if (row.split !== "development") continue;
    if (typeof row.listing_address !== "string" || !row.listing_address.trim())
      throw new Error("Development record has no reviewable input");
    const key = `${row.state || "UNKNOWN"}/${row.cohort || "unknown"}`;
    const group = strata.get(key) ?? { key, rows: [] };
    const id = hash(`${corpusHash}\n${sourceIndex}`);
    group.rows.push({ sourceIndex, id, rank: hash(`${seed}\n${id}`), row });
    strata.set(key, group);
  }
  const groups = [...strata.values()].sort((a, b) => compare(a.key, b.key));
  const population = groups.reduce((n, g) => n + g.rows.length, 0);
  const reserved = groups.reduce((n, g) => n + Math.min(minimum, g.rows.length), 0);
  if (count < reserved || count > population)
    throw new Error(`Count must be between ${reserved} and ${population}`);
  const extra = count - reserved;
  const capacity = population - reserved;
  for (const group of groups) {
    const base = Math.min(minimum, group.rows.length);
    const ideal = capacity ? extra * (group.rows.length - base) / capacity : 0;
    group.selected = base + Math.floor(ideal);
    group.remainder = ideal - Math.floor(ideal);
  }
  const remaining = count - groups.reduce((n, g) => n + g.selected, 0);
  const allocation = [...groups].sort(
    (a, b) => b.remainder - a.remainder || compare(a.key, b.key),
  );
  for (let i = 0; i < remaining; i++) allocation[i].selected++;
  const chosen = groups.flatMap((group) =>
    group.rows.sort((a, b) => compare(a.rank, b.rank))
      .slice(0, group.selected).map((entry) => ({ ...entry, stratum: group.key })),
  ).sort((a, b) => compare(a.rank, b.rank));
  // Deliberate allowlist. Do not expose ATTOM components, locality, categories,
  // parser candidates or failure groups to annotators. The task is delivery-line
  // interpretation. State/cohort metadata lives only in the sampling manifest.
  const queue = chosen.map(({ id, row }) => ({
    schemaVersion: "parser-review-queue-v1",
    id,
    input: { deliveryLine: row.listing_address },
    inputSha256: hash(row.listing_address),
    decision: "unreviewed",
    readings: [],
    review: { annotator: null, adjudicator: null, notes: "" },
  }));
  return {
    queue,
    manifest: {
      schemaVersion: "parser-review-sampling-v1",
      corpusHash,
      split: "development",
      seed,
      population,
      count,
      minimum,
      selection: "Hash-ranked within state/cohort; minimum then proportional allocation",
      labeled: 0,
      correctness: "not-measured",
      strata: groups.map(({ key, rows: entries, selected }) => ({
        key, population: entries.length, selected,
        inclusionProbability: selected / entries.length,
        weight: entries.length / selected,
      })),
      records: chosen.map(({ id, sourceIndex, stratum }) => ({ id, sourceIndex, stratum })),
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const directory = resolve(option("--output", ".local/correctness-review/development-v1"));
  if (!directory.split(/[\\/]/).includes(".local"))
    throw new Error("Private review files must stay under .local");
  const content = await readFile(ACTIVE_CORPUS, "utf8");
  const corpus = await verifyActiveCorpus(ACTIVE_CORPUS, content);
  const { queue, manifest } = prepareReviewSample(
    content.trimEnd().split("\n").map(JSON.parse),
    { corpusHash: corpus.sha256, count: Number(option("--count", 2000)),
      minimum: Number(option("--minimum", 5)), seed: option("--seed", "parser-correctness-v1") },
  );
  const queueText = queue.map((row) => JSON.stringify(row)).join("\n") + "\n";
  await mkdir(resolve(directory, ".."), { recursive: true });
  // Reserve a new directory. Never overwrite completed or in-progress reviews.
  await mkdir(directory);
  await writeFile(join(directory, "review.jsonl"), queueText, { flag: "wx", mode: 0o600 });
  await writeFile(join(directory, "manifest.json"), JSON.stringify({
    ...manifest, createdAt: new Date().toISOString(), queueSha256: hash(queueText),
  }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ directory, queued: queue.length, labeled: 0,
    strata: manifest.strata.length, corpusHash: manifest.corpusHash,
    correctness: "not-measured" }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
