import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { ACTIVE_CORPUS } from "./corpus-policy.mjs";
import { verifyActiveCorpus } from "./corpus-integrity.mjs";
import { assessCandidates, norm } from "./evaluation-metrics.mjs";

// Run after npm run build. These are candidate-recall comparisons against source
// fields, not deliverability/identity tests. Raw listing fields can disagree.
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const split = option("--split", "development");
if (!["development", "holdout", "all"].includes(split))
  throw new Error("Unknown split");
const input = option("--input", ACTIVE_CORPUS);
const output = option("--output", `.local/corpus/${split}-evaluation`);
const failureLimit = Number(option("--failure-limit", "30"));
const currentOptions = args.includes("--without-spelling")
  ? { spellingAlternatives: false }
  : { spellingAlternatives: true };
if (!Number.isInteger(failureLimit) || failureLimit < 0)
  throw new Error("--failure-limit must be a nonnegative integer");
if (!resolve(output).split(/[\\/]/).includes(".local"))
  throw new Error("Keep address-level reports in .local");
const modules = {
  current: await import(
    pathToFileURL(resolve(option("--module", "dist/index.js")))
  ),
};
if (args.includes("--baseline"))
  modules.baseline = await import(pathToFileURL(resolve(option("--baseline"))));
// Optional, independently captured USPS C1 table. Not the parser's own table.
const suffixPath = option(
  "--suffix-reference",
  "scripts/usps-suffix-reference.json",
);
const suffixes = JSON.parse(await readFile(suffixPath, "utf8"));
const directions = {
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
};
const directional = (value) => directions[norm(value)] ?? norm(value);
const suffix = (value) => suffixes[norm(value)] ?? norm(value);
const corpusContent = await readFile(input, "utf8");
const corpusManifest = await verifyActiveCorpus(input, corpusContent);
const rows = corpusContent
  .trim()
  .split("\n")
  .map(JSON.parse)
  .filter((row) => split === "all" || row.split === split);
const summary = {
  split,
  rows: rows.length,
  measurementVersion: "candidate-agreement-v2",
  measurement: "mls-attom-field-agreement",
  correctness: { status: "not-measured", score: null },
  parserOptions: { current: currentOptions ?? {} },
  policyVersion: corpusManifest?.policyVersion,
  policyHash: corpusManifest?.policySha256,
  results: {},
};
const failures = [];
const recorded = new Map();
const outcomes = new Map();
const regressions = [];
summary.transitions = {};

for (const [version, library] of Object.entries(modules)) {
  const results = {};
  const started = performance.now();
  for (const [rowIndex, row] of rows.entries()) {
    if (args.includes("--progress") && rowIndex % 50000 === 0)
      console.error(`${version}: ${rowIndex}/${rows.length} ${split} records`);
    const expected = {
      houseNumber: norm(row.house_number),
      preDirectional: directional(row.pre_directional),
      streetName: norm(row.street_name),
      streetSuffix: suffix(row.street_suffix),
      postDirectional: directional(row.post_directional),
      unit: norm(row.unit),
    };
    const base = [
      row.house_number,
      row.pre_directional,
      row.street_name,
      row.street_suffix,
      row.post_directional,
    ]
      .filter(Boolean)
      .join(" ");
    const explicit =
      base + (row.unit ? ` ${row.unit_prefix || "UNIT"} ${row.unit}` : "");
    const local = { city: row.city, state: row.state, postalCode: row.zip };
    const baseExpected = { ...expected };
    delete baseExpected.unit; // property address_full may or may not include its separately stored unit
    const scenarios = [
      {
        name: "source-property",
        line: row.address_full,
        expected: baseExpected,
      },
      { name: "source-listing", line: row.listing_address, expected },
      { name: "generated-explicit", line: explicit, expected },
      {
        name: "generated-bare",
        line: base + (row.unit ? ` ${row.unit}` : ""),
        expected,
      },
      {
        name: "generated-full",
        line: `${explicit}, ${row.city}, ${row.state} ${row.zip}`,
        expected: {
          ...expected,
          city: norm(row.city),
          state: norm(row.state),
          postalCode: norm(row.zip),
        },
        full: true,
      },
    ];
    for (const scenario of scenarios) {
      if (!scenario.line || !expected.houseNumber || !expected.streetName)
        continue;
      const groups = [scenario.name, `${scenario.name}/${row.category}`];
      if (row.cohort) groups.push(`${scenario.name}/cohort/${row.cohort}`);
      if (scenario.name === "source-listing") {
        groups.push(`${scenario.name}/state/${row.state || "UNKNOWN"}`);
        if (row.county_group)
          groups.push(`${scenario.name}/county/${row.county_group}`);
      }
      const interpretation = scenario.full
        ? library.interpretFullAddress(
            scenario.line,
            version === "current" ? currentOptions : undefined,
          )
        : library.interpretAddress(
            { deliveryLine: scenario.line, ...local },
            version === "current" ? currentOptions : undefined,
          );
      const outcome = assessCandidates(
        interpretation.candidates,
        scenario.expected,
      );
      const { matched, closest } = outcome;
      const outcomeKey = `${rowIndex}/${scenario.name}`;
      if (version === "current")
        outcomes.set(outcomeKey, {
          matched,
          firstCandidateMatched: outcome.firstCandidateMatched,
        });
      if (version === "baseline") {
        const current = outcomes.get(outcomeKey);
        const transition = (summary.transitions[scenario.name] ??= {
          improved: 0,
          regressed: 0,
          firstCandidateImproved: 0,
          firstCandidateRegressed: 0,
        });
        transition.improved += Number(!matched && current.matched);
        transition.regressed += Number(matched && !current.matched);
        transition.firstCandidateImproved += Number(
          !outcome.firstCandidateMatched && current.firstCandidateMatched,
        );
        transition.firstCandidateRegressed += Number(
          outcome.firstCandidateMatched && !current.firstCandidateMatched,
        );
        if (matched && !current.matched)
          regressions.push({
            scenario: scenario.name,
            category: row.category,
            input: scenario.line,
            expected: scenario.expected,
          });
      }
      for (const group of groups) {
        const tally = (results[group] ??= {
          cases: 0,
          matched: 0,
          invalid: 0,
          candidates: 0,
          ambiguous: 0,
          firstCandidateMatched: 0,
          alternativeOnlyMatched: 0,
          singleCandidateMatched: 0,
          matchingCandidates: 0,
          disagreeingCandidates: 0,
          noCandidates: 0,
          missing: {},
        });
        tally.cases += 1;
        tally.matched += Number(matched);
        tally.invalid += Number(!interpretation.candidates.length);
        tally.candidates += interpretation.candidates.length;
        tally.ambiguous += Number(interpretation.candidates.length > 1);
        for (const key of [
          "firstCandidateMatched",
          "alternativeOnlyMatched",
          "singleCandidateMatched",
          "matchingCandidates",
          "disagreeingCandidates",
          "noCandidates",
        ])
          tally[key] += Number(outcome[key]);
        if (!matched)
          for (const field of closest)
            tally.missing[field] = (tally.missing[field] ?? 0) + 1;
      }
      const failureGroup = `${version}/${scenario.name}/${row.category}`;
      if (!matched && (recorded.get(failureGroup) ?? 0) < failureLimit) {
        recorded.set(failureGroup, (recorded.get(failureGroup) ?? 0) + 1);
        failures.push({
          version,
          scenario: scenario.name,
          category: row.category,
          input: scenario.line,
          expected: scenario.expected,
          differences: closest,
          candidates: interpretation.candidates.map((c) => c.components),
        });
      }
    }
  }
  for (const tally of Object.values(results))
    tally.recall = Number(((tally.matched / tally.cases) * 100).toFixed(3));
  summary.results[version] = {
    elapsedMs: Math.round(performance.now() - started),
    scenarios: results,
  };
}
await mkdir(resolve(output, ".."), { recursive: true });
await writeFile(`${output}.json`, JSON.stringify(summary, null, 2) + "\n");
await writeFile(
  `${output}.failures.jsonl`,
  failures.map((row) => JSON.stringify(row)).join("\n") + "\n",
);
await writeFile(
  `${output}.regressions.jsonl`,
  regressions.map((row) => JSON.stringify(row)).join("\n") + "\n",
);
console.log(
  JSON.stringify(
    {
      split,
      rows: rows.length,
      results: Object.fromEntries(
        Object.entries(summary.results).map(([name, result]) => [
          name,
          {
            elapsedMs: result.elapsedMs,
            scenarios: Object.fromEntries(
              Object.entries(result.scenarios).filter(
                ([key]) => !key.includes("/"),
              ),
            ),
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
