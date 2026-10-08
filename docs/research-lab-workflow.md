# Research lab workflow

The report now has Overview, Benchmarks, Research, Data & methods, and Try the parser. State comparisons are inside Benchmarks. The annotation pilot and its independent state selector are under Data & methods. The existing corpus and historical results remain intact.

Run `npm run build` and `npm run research:report` to regenerate `.local/research/index.html`. The file compiles the actual library source into a browser bundle and records its package version and bundle SHA-256. This hash identifies the browser artifact, separately from the package build. The explorer uses synthetic examples and accepts full addresses or delivery lines through `interpretFullAddress`. It sends no requests, writes no input to the URL or storage, and excludes input from JSON exports. Auto-refresh pauses while the explorer is open. Documentation links require a deliberate click to leave the report.

Benchmarks currently reports correctness evaluation as in preparation. The exact-set scorer is executable, but the provisional token-role pilot has not been converted to reviewed component annotations or evaluated as correctness truth. External baselines, sampling uncertainty, and public release evidence are pending. See [the scoring contract](benchmark-contract-v1.md).

Manual labeling does not block parser development. The [automated evaluation protocol](automated-evaluation-v1.md) freezes a separate, provisional component projection of the existing Luna pilot. A research cycle can include it with `--agent-benchmark .local/correctness-review/agent-components-v1/bundle.json`, or the same path in the private report configuration's `agentBenchmark` field. The Benchmarks panel compares both builds and spelling modes, separately from the MLS agreement chart. Completed human reviews remain separate checks. Model-only results never become correctness truth automatically.

## Declare an experiment before evaluation

Save public-safe research descriptions in an experiment JSON file under `.local`. Do not put private addresses in the plan, label, or note, since these descriptions appear in the HTML.

```json
{
  "question": "Are repeated secondary markers losing source evidence?",
  "hypothesis": "Preserving marker order retains both building and apartment identifiers.",
  "expectedEffect": "Development examples with multiple explicit secondary components.",
  "change": "Retain each secondary source span in delivery order.",
  "acceptanceRule": "No lost accepted readings on exhaustive fixtures; inspect every diagnostic regression before deciding."
}
```

```sh
npm run research -- --baseline .local/baseline/index.mjs --experiment .local/experiment.json --label "Repeated secondary markers"
```

The harness validates and freezes the plan into `run.json` before checks and development evaluation. It records explicit parser options and the evaluator hash. The correctness gate still returns code 2 while correctness evidence is missing. A high diagnostic agreement score cannot open it.

Unplanned commands remain available for diagnostic checkpoints. Their notebook entries say the hypothesis and decision are unrecorded. Historical plans and decisions are never inferred from score changes.

## Record the decision after reviewing evidence

```sh
npm run research:decide -- --run .local/research/<run-directory> --decision inconclusive --reason "The chain fixtures pass; ambiguous readings still need adjudication."
```

Choose `keep`, `reject`, or `inconclusive`. The reason should address observed gains, regressions, candidate cost, timing, and the predeclared acceptance rule. This command records the scientific decision; it does not merge, revert, or publish code.

The immutable `decision.json` sidecar binds to the exact completed `run.json` bytes. Running experiments cannot receive a decision, and existing decisions cannot be overwritten. The report rejects a decision if the run evidence changes. A decision refreshes the report but does not change historical results or imply correctness approval.

## Compare only recorded measurement definitions

Diagnostic lines require identical corpus hash, policy hash, evaluator hash, measurement version, split, and explicit parser options. Missing historical identities remain independent points. Holdout results remain unconnected. Each run's gains and losses are relative to that run's recorded baseline, not necessarily the preceding chart point.

Correctness evaluation identities additionally bind annotation, guide, sample, output-contract, and normalization versions. Their scores must not be placed on the legacy field-agreement curve.

## Publication status

This is a local, public-oriented report, not a deployed public site. Corpus rows and annotation text remain private. Aggregate exports and intentionally public research prose still need ordinary editorial review before publication. The page makes no released accuracy or competitor-performance claim. A customer comprehension test and expert label calibration remain future work.

## Browser regression checks

Run `npx playwright install --only-shell chromium` once, then `npm run test:research-ui`. CI installs the matching browser and runs this check on every change. It builds the actual report with synthetic inputs and submits its form, testing exact candidate sets with spelling alternatives on and off, source offsets, mobile overflow, and the absence of external requests.

The full-address regression catches a previous explorer wiring error: calling the delivery-line API on a full string could absorb the city into the street and turn `FL` plus a ZIP into a floor. Tests of the full-address library API alone could not catch a caller using the wrong entry point.

## Human calibration workspace

The local labeling interface is separate from the public-oriented report. Start it with:

```sh
npm run research:calibration
npm run research:review-ui
```

Run preparation once. It refuses to replace an existing workspace. The default URL is `http://127.0.0.1:4319`, with private evidence under `.local/correctness-review/human-calibration-v1/`. Restart only the second command to resume. The first prepared queue contains 63 cases: all 42 Luna disagreements, all eight cases unresolved after adjudication, and 20 seeded consensus cases, deduplicated and mixed. It presents batches of 20. These groups overlap; they are not 70 different inputs. Selection never reads parser predictions or holdout inputs.

The reviewer enters their name and experience, assigns source tokens to fields, checks canonical values, and explicitly saves an initial reading. Proposals are absent from browser responses until that initial reading is durably saved. Comparing and finalizing records a separate decision. Uncertainty remains visible. Notes explain changed decisions and canonical overrides. Drafts save locally, while initial readings and final revisions remain in an append-only journal. Reviewer experience is self-reported. Human-reviewed labels remain provisional.

The browser's Export reviews link downloads a private review bundle. It includes all selected inputs and marks unfinished cases unresolved. It is not the public dashboard's aggregate export. The original Luna pilot and its historical zero-human-review counters are unchanged. The new workspace tracks human progress separately.

After at least one finalized review, run:

```sh
npm run research:score-reviewed
# Optional, explicitly separate parser mode:
npm run research:score-reviewed -- --with-spelling
```

The command freezes sample, annotation, guide, evaluator, parser-option and parser-build identities into a timestamped experimental evaluation. The default has spelling alternatives off, but all emitted repairs still participate in exact-set scoring. No labels are silently generated from parser output. Unfinished and uncertain cases remain in coverage; the resulting score describes this selected calibration sample only. No result opens the public correctness gate.

`npm run test:review-ui` exercises the real browser and local server using synthetic inputs in a disposable workspace. CI runs it alongside the report's browser checks. Store/API tests cover blinding, stale edits, complete source evidence, full chains, journal replay and corruption detection, private-file routing, and score integration. See the [frozen human calibration protocol](human-calibration-v1.md).
