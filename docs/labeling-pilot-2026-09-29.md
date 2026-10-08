# Luna address-labeling pilot

Two independent GPT-6 Luna passes labeled the same 200 development inputs. They agreed on 158 cases and disagreed on 42. This 79% agreement measures consistency between labelers. Parser correctness remains unmeasured.

The pilot uses the existing frozen corpus and review queue. It creates annotations beside that corpus, with no changes to its admission rules or denominator. Private inputs, labels, and execution receipts live in `.local/correctness-review/luna-pilot-v1/`.

## Selection and execution

The 200 inputs come from the previously frozen 2,000-input development review queue. Selection takes one case from each of 102 state/cohort groups, then fills the remaining 98 places by seeded hash order. All 50 states plus DC appear. This emphasizes coverage and difficult formats, so the resulting percentages are not estimates of national or full-corpus accuracy. Holdout examples were not used.

Each Luna worker used medium reasoning, its own conversation, and a different input order. The two workers saw only the frozen [annotation guide](labeling-guide-v1.md), assigned delivery lines, independently generated tokens, and their own output. They did not see parser predictions, ATTOM components, the other pass, or address-lookup results. Labels required individual judgment. Code could serialize labels and check evidence but could not replace the labeling task with another parser.

The initial 200-record assignments produced no completed output. Reducing each assignment to 20 records yielded ten completed batches per worker. Both workers retained their own context between batches. These are separate labeling passes using the same model, so their mistakes may be correlated.

Every output passed structural validation. The validator checks input hashes, case coverage, allowed fields, complete token accounting, secondary-element order, and preserved punctuation. It cannot decide whether a field assignment is semantically correct.

## Results

| Measurement | Result |
| --- | ---: |
| Pass A labels | 200 |
| Pass B labels | 200 |
| Exact agreement on status and reading set | 158 / 200 |
| Disagreements | 42 / 200 |
| Preselected blind audit | 20 |
| Cases requiring adjudication | 60 |
| Provisionally accepted after adjudication | 192 |
| Remaining unresolved or unsupported | 8 |
| Median instrumented 20-record job | 45.7 seconds |
| Instrumented jobs | 16 / 20 |
| Human-reviewed labels | 0 |
| Parser correctness | Unmeasured |
| Billed tokens and cost | Unavailable |

The timing runs from coordinator dispatch to the output file's final write. It includes tool work and coordination. It is not pure model latency. The initial failed assignments are outside the job median. Managed collaboration workers did not expose billed token usage or cost, so these values are stored as `null`, never zero. Public API prices would not establish the cost of these managed jobs.

Pass A classified 172 cases as addresses, 27 as unresolved, and one as unsupported. Pass B classified 196 as addresses, two as unresolved, and two as unsupported. Neither pass used `non_address`. The difference in willingness to assign roles is a reason to retain adjudication even when both workers use the same guide.

Among the 42 disagreements, 27 differ in secondary labels, 18 in street name or suffix evidence, five in directionals, three in primary-number evidence, and three in separator treatment. Status differs in 25 cases and the number of readings differs in three. These categories overlap and describe model differences, not verified errors.

The separate reviewer labeled the 20 audit cases before seeing any proposals. Three differed from at least one Luna pass. The reviewer independently agreed with all 17 cases where the two Luna passes agreed. This small sample does not establish a label-error rate or meet a 95% correctness target.

The reviewer adjudicated all 60 required cases. The final 200-case output contains 191 addresses, one ambiguous address, seven unresolved cases, and one unsupported form. This yields 192 provisionally accepted labels and eight cases requiring further review. All 200 remain in the export. The reviewer kept 59 blind decisions and revised one to unresolved after comparing proposals. No audited Luna consensus was overturned.

The decision journal identifies recurring issues with bare-unit abstention, numbered-road segmentation, splitting compound identifiers, and overstating certainty for duplicated suffixes. These findings guide the next annotation-policy review and parser investigation. They do not establish that every accepted label is correct.

## Review and evidence

Adjudication includes every disagreement, every preselected audit case, and every consensus decision outside `address` or `ambiguous`. A separate parent-model reviewer first labels those inputs blind. The coordinator freezes that file's SHA-256 before the reviewer sees the Luna proposals. The original 20 audit labels must remain unchanged in the blind file, even if the reviewer later revises a decision during adjudication.

The finalizer requires both freeze receipts, complete valid adjudication, and the original blind audit. It exports all 200 cases with raw spans and review provenance. Consensus and adjudicated readings remain provisional. Unresolved or unsupported inputs remain visible for further review; they are not silently removed as invalid addresses. No agent label opens the parser's correctness gate.

The input and guide stay frozen throughout the pilot. Comparison code was corrected to ignore JSON property order in secondary labels, and malformed-output validation was hardened. These fixes do not change allowed address interpretations. The initial contract is archived, and the final summary records both contract hashes.

## Running another pilot

Use a new private run directory. Preparation refuses to overwrite existing evidence. The default repeats the same seeded 200-input selection so labeling policies can be compared. Pass `--count 2000` to prepare the entire existing review queue.

```sh
npm run research:label -- prepare --run .local/correctness-review/luna-pilot-v2
node scripts/labeling-batches.mjs prepare --run .local/correctness-review/luna-pilot-v2
```

A coordinator then assigns each `worker-*.batch*.input.jsonl` to its designated blind worker using the guide. The scripts do not dispatch model calls themselves. Run the separate preselected `audit.input.jsonl` review before inspecting proposals. Record its file hash as a `blind-audit-frozen` event in the run's append-only `execution.jsonl`.

Each output can be validated against its assigned batch:

```sh
npm run research:label -- validate --run .local/correctness-review/luna-pilot-v2 \
  --input .local/correctness-review/luna-pilot-v2/worker-a.batch01.input.jsonl \
  --file .local/correctness-review/luna-pilot-v2/worker-a.batch01.labels.jsonl
```

After all batches pass validation:

```sh
node scripts/labeling-batches.mjs merge --run .local/correctness-review/luna-pilot-v2
npm run research:label -- compare --run .local/correctness-review/luna-pilot-v2
```

Give the reviewer `adjudication.input.jsonl` and its own original blind audit. Require `adjudication-blind.labels.jsonl`, validate it, and append an `adjudication-blind-frozen` event with its SHA-256. Both freeze events have `at`, `event`, and `sha256` fields. Only then reveal `adjudication.proposals.jsonl` and collect `adjudicated.labels.jsonl`.

```sh
node scripts/finalize-labeling-pilot.mjs --run .local/correctness-review/luna-pilot-v2
node scripts/labeling-batches.mjs progress --run .local/correctness-review/luna-pilot-v2
npm run research:report
```

To instrument job duration, append a `batch-dispatched` event with UTC `at`, worker `a` or `b`, and numeric `batch` immediately before dispatch. Without that event, the job has no measured duration. Configure `labelingProgress` in `.local/research/report-config.json` to point at the chosen run's `progress.json`.

The HTML shows pass completion and disagreement counts under the existing state filter. Adjudication totals remain explicitly scoped to the whole pilot. An aggregate allowlist keeps address strings, record IDs, and annotation notes out of the generated HTML.

## Validation and next step

`npm run check` passed 453 tests across 17 files, strict TypeScript checking, the build, and packed ESM/CommonJS/TypeScript entry-point checks on Node 24.21.0. The added tests cover annotation evidence, malformed model output, ambiguity, missing and duplicate cases, blind sampling, provisional finalization, and aggregate-only dashboard projection.

Luna can generate first-pass labels in small batches. Scaling should preserve the second pass, blind audit, and explicit adjudication. Before treating those labels as a correctness benchmark, independently review label quality and implement a scorer for the complete set of supported readings. The existing 93.427% MLS-to-ATTOM diagnostic remains a separate measure.
