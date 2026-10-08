import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";

// Freeze address novelty before measuring holdout. This selects by input and
// address identity only, never by parser output, score, or failure category.
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const input = option("--input", ".local/corpus/mls-geographic.jsonl");
const prior = option("--prior", ".local/corpus/mls.jsonl");
const output = resolve(
  option("--output", ".local/corpus/mls-geographic-holdout-novel.jsonl"),
);
if (!output.split(/[\\/]/).includes(".local"))
  throw new Error("Keep the holdout under .local");
if (
  await access(output).then(
    () => true,
    () => false,
  )
)
  throw new Error("Holdout already exists; select a new path");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const norm = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
const identityFields = [
  "house_number",
  "pre_directional",
  "street_name",
  "street_suffix",
  "post_directional",
  "unit",
  "city",
  "state",
  "zip",
];
const keys = (row) => {
  const identity = digest(
    JSON.stringify(identityFields.map((field) => norm(row[field]))),
  );
  const raw = row.listing_address
    ? digest(
        JSON.stringify(
          ["listing_address", "city", "state", "zip"].map((field) =>
            norm(row[field]),
          ),
        ),
      )
    : undefined;
  return [identity, raw];
};
async function* rows(path) {
  const lines = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}
const identities = new Set(),
  inputs = new Set();
function remember(row) {
  const [identity, raw] = keys(row);
  identities.add(identity);
  if (raw) inputs.add(raw);
}
for await (const row of rows(prior)) remember(row);
for await (const row of rows(input))
  if (row.split === "development") remember(row);
const retained = [],
  excluded = { structuredAddressSeen: 0, listingInputSeen: 0 };
let total = 0;
for await (const row of rows(input)) {
  if (row.split !== "holdout") continue;
  total++;
  const [identity, raw] = keys(row);
  if (identities.has(identity)) {
    excluded.structuredAddressSeen++;
    continue;
  }
  if (raw && inputs.has(raw)) {
    excluded.listingInputSeen++;
    continue;
  }
  retained.push(JSON.stringify(row));
  remember(row); // Also remove repeated addresses inside the new holdout.
}
const text = retained.join("\n") + "\n";
await mkdir(dirname(output), { recursive: true });
await writeFile(output, text, { flag: "wx" });
const manifest = {
  createdAt: new Date().toISOString(),
  input,
  prior,
  inputSha256: digest(await readFile(input)),
  priorSha256: digest(await readFile(prior)),
  sha256: digest(text),
  total,
  retained: retained.length,
  excluded,
  selection:
    "Exclude structured address keys and raw listing/locality keys seen in prior corpus, new development, or earlier retained holdout rows. No parser output used.",
};
await writeFile(
  output.replace(/\.jsonl$/, "") + ".manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
  { flag: "wx" },
);
console.log(JSON.stringify(manifest, null, 2));
