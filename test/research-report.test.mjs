import { expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateScenarios,
  collectReport,
  reportRecord,
  renderReport,
  projectLabelingProgress,
  projectAgentEvaluation,
  projectLabelingExpansion,
} from "../scripts/research-report.mjs";

test("expanded labeling progress separates reused labels and strips private evidence", () => {
  const result = projectLabelingExpansion({records:[{}, {}, {}],reused:[{}],fresh:[{caseId:'private-a'},{caseId:'private-b'}],
    passes:{a:[{caseId:'private-a',notes:'PRIVATE'}],b:[]},manifest:{records:[
      {caseId:'private-old',stratum:'CA/geographic',input:'PRIVATE'},
      {caseId:'private-a',stratum:'CA/challenge'}, {caseId:'private-b',stratum:'DC/geographic'},
    ]}}, {reviewRequired:1,disagreements:1,secret:'PRIVATE'}, {adjudicated:1,agentAccepted:2,unresolved:1,addresses:['PRIVATE'],releaseEligible:true});
  expect(result).toMatchObject({prepared:3,reused:1,newInputs:2,passA:1,passB:0,releaseEligible:false,phase:'complete-provisional'});
  expect(result.states.CA).toEqual({prepared:2,reused:1,newInputs:1,passA:1,passB:0});
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|private-/);
  const waiting = projectLabelingExpansion({records:[],reused:[],fresh:[],passes:{a:[],b:[]},manifest:{records:[]}},undefined,undefined,true);
  expect(waiting.phase).toBe('waiting-model-capacity');
});

test("automated benchmark exports aggregate counts without leaking labels or promoting model evidence", () => {
  const mode = spellingAlternatives => ({releaseEligible:false, parserHash:'a'.repeat(64),
    definition:{id:'b'.repeat(64), annotationStatus:'provisional', parserOptions:{spellingAlternatives}, population:'PRIVATE', sampleHash:'c'.repeat(64), annotationHash:'d'.repeat(64)},
    summary:{cases:200, exactInterpretationSet:{numerator:100,denominator:192,rate:1,notes:'PRIVATE'}, unsupportedReadings:10, addresses:['PRIVATE']}, cases:['PRIVATE']});
  const source = {schema:'agent-label-evaluation-v1', annotationStatus:'provisional', releaseEligible:false, bundleHash:'e'.repeat(64),
    results:{current:{'with-spelling':mode(true),'without-spelling':mode(false)}, PRIVATE:{secret:'PRIVATE'}}, sourceTokenLabels:['PRIVATE'],
    transitions:{'without-spelling':{exactGained:2,exactLost:1,examples:['PRIVATE']}}};
  const result = projectAgentEvaluation(source);
  expect(result.releaseEligible).toBe(false);
  expect(result.results.current['without-spelling'].summary.exactInterpretationSet.rate).toBe(100/192);
  expect(result.transitions['without-spelling']).toMatchObject({exactGained:2,exactLost:1});
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(()=>projectAgentEvaluation({...source, releaseEligible:true})).toThrow();
  source.results.current['with-spelling'].definition.parserOptions.spellingAlternatives=false;
  expect(()=>projectAgentEvaluation(source)).toThrow(/conditions/);
});

test("labeling progress exports counts without promoting model agreement to correctness", () => {
  const projected = projectLabelingProgress({ prepared: 200, paired: 200, agreements: 200,
    model: "gpt-6-luna", phase: "pilot-complete-provisional", humanReviewed: 200,
    correctness: 100, addresses: ["PRIVATE ADDRESS"], notes: "PRIVATE",
    states: { CA: { prepared: 10, input: "PRIVATE" }, PRIVATE: { prepared: 1 } },
    workers: { a: { valid: 200, notes: "PRIVATE" } },
    final: { agentAccepted: 200, examples: ["PRIVATE"] },
  });
  expect(projected.correctness).toBe("not-measured");
  expect(projected.humanReviewed).toBe(0);
  expect(projected.agreements).toBe(200);
  expect(projected.tokenUsage).toBeNull();
  expect(projected.states.CA.prepared).toBe(10);
  expect(JSON.stringify(projected)).not.toContain("PRIVATE");
});

const evaluation = {
  split: "development",
  results: {
    current: {
      scenarios: {
        "source-listing": {
          cases: 100,
          matched: 79,
          candidates: 160,
          missing: { unit: 8 },
          examples: [{ input: "PRIVATE ADDRESS" }],
        },
        "source-listing/cohort/challenge": {
          cases: 20,
          matched: 14,
          candidates: 45,
        },
        "source-listing/county/PRIVATE": { cases: 1, matched: 0 },
        "source-listing/state/CA": { cases: 50, matched: 40, candidates: 80 },
        "source-listing/state/DC": { cases: 20, matched: 15, candidates: 30 },
        "source-listing/state/UNKNOWN": { cases: 1, matched: 0 },
        "source-listing/state/PRIVATE": { cases: 1, matched: 0 },
        "source-listing/state/CA/county/PRIVATE": { cases: 1, matched: 0 },
      },
    },
  },
  transitions: {
    "source-listing": { improved: 4, regressed: 1, input: "PRIVATE ADDRESS" },
  },
};

test("report projection includes cohort aggregates but excludes examples and address-level data", () => {
  const record = reportRecord(
    {
      id: "run-1",
      status: "regression",
      directory: "/private/path",
      started: "2026-09-26T12:00:00Z",
      corpusHash: "abc",
      error: "PRIVATE ERROR",
    },
    evaluation,
  );
  expect(record.scenarios["source-listing"].matched).toBe(79);
  expect(record.scenarios["source-listing/cohort/challenge"].cases).toBe(20);
  expect(record.scenarios["source-listing/state/CA"].matched).toBe(40);
  expect(record.scenarios["source-listing/state/DC"].cases).toBe(20);
  expect(record.scenarios["source-listing/state/UNKNOWN"].cases).toBe(1);
  expect(record.transitions["source-listing"]).toEqual({
    improved: 4,
    regressed: 1,
  });
  expect(JSON.stringify(record)).not.toContain("PRIVATE");
  expect(JSON.stringify(record)).not.toContain("/private/path");
});

test("the active corpus retains its development and derived holdout while leaving historical files intact", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "parser-report-"));
  const root = join(temporary, ".local", "research");
  await mkdir(root, { recursive: true });
  const historical = {
    corpusHash: "old",
    started: "2026-09-20T00:00:00Z",
    status: "failed",
  };
  try {
    for (const [id, record] of [
      ["historical", historical],
      ["development", { corpusHash: "big", started: "2026-09-21T00:00:00Z" }],
    ]) {
      await mkdir(join(root, id));
      await writeFile(join(root, id, "run.json"), JSON.stringify(record));
      if (id === "development")
        await writeFile(
          join(root, id, "development.json"),
          JSON.stringify(evaluation),
        );
    }
    const holdout = join(root, "holdout.json");
    await writeFile(
      holdout,
      JSON.stringify({ ...evaluation, split: "holdout" }),
    );
    const config = {
      target: 95,
      activeDataset: "expanded",
      defaultDataset: "stress",
      corpora: {
        old: { id: "stress", label: "Historical" },
        big: { id: "expanded", label: "400,000 addresses", rows: 400000 },
        novel: { id: "expanded", label: "400,000 addresses", rows: 400000 },
      },
      checkpoints: [
        {
          id: "novel-holdout",
          file: holdout,
          corpusHash: "novel",
          started: "2026-09-22T00:00:00Z",
        },
      ],
    };
    await writeFile(join(root, "report-config.json"), JSON.stringify(config));
    const report = await collectReport(root);
    expect(report.target).toBe(95);
    expect(report.objective).toBe("parser-correctness-v1");
    expect(report.correctness).toEqual({
      status: "not-measured", score: null, targetMet: false,
    });
    expect(report.defaultDataset).toBe("expanded");
    expect(report.datasets.map((d) => d.id)).toEqual(["expanded"]);
    expect(report.records.map((r) => [r.id, r.split])).toEqual([
      ["development", "development"],
      ["novel-holdout", "holdout"],
    ]);
    expect(report.records[1].scenarios["source-listing/state/CA"].matched).toBe(
      40,
    );
    expect(
      JSON.parse(await readFile(join(root, "historical", "run.json"), "utf8")),
    ).toEqual(historical);
    await writeFile(
      join(root, "report-config.json"),
      JSON.stringify({ ...config, activeDataset: "absent" }),
    );
    const empty = await collectReport(root);
    expect(empty.records).toEqual([]);
    expect(empty.datasets).toEqual([]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("failed and incomplete cycles stay unscored instead of becoming zero-percent points", () => {
  const record = reportRecord({
    id: "failed",
    status: "failed",
    phase: "checks",
    corpusHash: "a",
  });
  expect(record.scenarios).toEqual({});
  expect(record.status).toBe("failed");
  expect(record.phase).toBe("checks");
  expect(
    aggregateScenarios({ "source-listing": { cases: NaN, matched: Infinity } })[
      "source-listing"
    ],
  ).toMatchObject({ cases: null, matched: null });
});

test("report comparability requires explicit historical measurement identities and public options only", () => {
  const record = { id: "versioned", corpusHash: "a".repeat(64), policyHash: "b".repeat(64), evaluatorHash: "c".repeat(64), parserOptions: { spellingAlternatives: true, privateInput: "PRIVATE" } };
  expect(reportRecord(record, evaluation).comparisonKey).toBeNull();
  const known = reportRecord(record, { ...evaluation, measurementVersion: "agreement-v2" });
  expect(known.comparisonKey).toMatch(/^[a-f0-9]{64}$/);
  expect(known.evidenceStatus).toBe("diagnostic");
  expect(JSON.stringify(known)).not.toContain("PRIVATE");
  expect(reportRecord(record, { ...evaluation, measurementVersion: "agreement-v3" }).comparisonKey).not.toBe(known.comparisonKey);
  const actual = reportRecord(record, { ...evaluation, measurementVersion: "agreement-v2", parserOptions: { current: { spellingAlternatives: false } } });
  expect(actual.parserOptions.spellingAlternatives).toBe(false);
  expect(actual.comparisonKey).not.toBe(known.comparisonKey);
});

test("candidate quality counts survive projection without inventing values for earlier cycles", () => {
  const prior = aggregateScenarios(evaluation.results.current.scenarios)[
    "source-listing"
  ];
  expect(prior.firstCandidateMatched).toBeNull();
  const projected = aggregateScenarios({
    "source-listing": {
      cases: 10,
      matched: 9,
      firstCandidateMatched: 6,
      alternativeOnlyMatched: 3,
      singleCandidateMatched: 4,
      matchingCandidates: 9,
      disagreeingCandidates: 11,
      noCandidates: 1,
      candidates: 20,
      privateExamples: ["PRIVATE"],
    },
  })["source-listing"];
  expect(projected).toMatchObject({
    firstCandidateMatched: 6,
    alternativeOnlyMatched: 3,
    disagreeingCandidates: 11,
    noCandidates: 1,
  });
  expect(JSON.stringify(projected)).not.toContain("PRIVATE");
});

test("baseline checkpoints keep their own score and cannot inherit current-build improvements", () => {
  const record = reportRecord(
    { id: "baseline", version: "baseline" },
    {
      ...evaluation,
      results: {
        ...evaluation.results,
        baseline: {
          scenarios: {
            "source-listing": { cases: 100, matched: 75, candidates: 130 },
          },
        },
      },
    },
  );
  expect(record.scenarios["source-listing"].matched).toBe(75);
  expect(record.transitions).toEqual({});
});

test("embedded report data cannot terminate its JSON script element", async () => {
  const payload = "</script><script>globalThis.injection = true</script>";
  const html = await renderReport({
    records: [{ label: payload }],
    datasets: [],
  });
  expect(html).not.toContain(payload);
  const encoded = html.match(
    /<script type="application\/json" id="research-data">(.*?)<\/script>/s,
  )[1];
  expect(JSON.parse(encoded).records[0].label).toBe(payload);
  expect(html).not.toMatch(/<script[^>]+src=/);
  expect(html).not.toContain("{{DATA}}");
  expect(html).not.toContain("REPORT_SCRIPT");
  expect(html).toContain('document.getElementById("research-data")');
  expect(html).toContain("Correctness is not measured yet.");
  expect(html).not.toContain('class="target-label"');
  expect(html).not.toContain("more matches to");
});

test("corpus admission reports counts without exposing quarantined records", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "parser-curation-"));
  const root = join(temporary, ".local", "research");
  await mkdir(root, { recursive: true });
  try {
    const manifest = join(root, "corpus.manifest.json");
    await writeFile(
      manifest,
      JSON.stringify({
        sourceRows: 100,
        retained: 80,
        excluded: 20,
        policyVersion: "mls-source-consistency-v1",
        byReason: { "reference-unit-not-observed": 12, "PRIVATE ADDRESS": 1 },
        examples: [{ input: "PRIVATE ADDRESS" }],
      }),
    );
    await writeFile(
      join(root, "report-config.json"),
      JSON.stringify({ curationManifest: manifest }),
    );
    const report = await collectReport(root);
    expect(report.curation).toEqual({
      sourceRows: 100,
      retained: 80,
      excluded: 20,
      policyVersion: "mls-source-consistency-v1",
      byReason: { "reference-unit-not-observed": 12 },
    });
    expect(JSON.stringify(report)).not.toContain("PRIVATE");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
