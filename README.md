# `@marvin-amador-7/address-interpreter`

US address interpretation with source offsets, explicit ambiguity candidates, and resolution through your own address index. No runtime dependencies or network calls. ESM, CommonJS, and TypeScript declarations are included. Runtime support starts at Node.js 18.

```sh
npm install @marvin-amador-7/address-interpreter
```

```ts
import { interpretAddress, interpretFullAddress } from "@marvin-amador-7/address-interpreter";

const delivery = interpretAddress({
  deliveryLine: "123 Main St B",
  city: "Austin",
  state: "Texas",
  postalCode: "78701",
});
// Includes MAIN ST, unit B, and the literal street MAIN ST B.

const full = interpretFullAddress("PO Box 123, Boston, MA 02108");
// components: { kind: "po-box", boxNumber: "123", city: "BOSTON", ... }
```

A string can describe several addresses. `123 Highway 6` can contain a street named `HIGHWAY 6` or a street named `HIGHWAY` and unit `6`. Directional words, street/city boundaries, and house-number ranges create similar ambiguity. Candidates record supported readings; an address index determines which ones exist. Candidate order is not a confidence ranking.

## Supported input

| Format | Examples |
| --- | --- |
| Street addresses | `123 Main Street`, `10 Via Del Paradiso` |
| Fractional numbers | `123 1/2 Main St`, `123½ Main St` |
| Hyphenated and alphanumeric numbers | `123-45 Main St`, `123-A Main St`, `12N345 Main St` |
| Compound grid numbers | `N112W16500 Main Rd`, `W123 N456 Main Rd` |
| Numeric house ranges | `123/125 Main St`, `123 125 Main St` |
| Explicit units | `123 Main St Apt 4`, `123 Broadway #4`, `123 Main St PMB 42` |
| Secondary chains | `123 Main St Bldg A Apt 4` |
| Towers and leading secondary phrases | `123 Main St Bldg 2 Tower East Apt 4`, `Apt 4 123 Main St` |
| Compound building/unit candidates | `123 Main St 3-204` retains `3-204` and offers building `3`, unit `204` |
| Named and compound units | `123 Main St Apt PH`, `123 Main St # A#4` |
| Reversed floor notation | `123 Main St 2nd Floor`, `123 Main St First Floor` |
| Bare unit candidates | `123 Main St B`, `123 Broadway 4B`, `123 Main St 4/5` |
| Multi-token bare units | `123 Main St WH 2255`, `123 Main St 4 B` |
| Feed formatting alternatives | `123 Oak Rd Road`, `123 Main St4B`, `123 Main St Apt4`, `123 - 125 Main St` |
| Highway-name expansions | `123 County Rd 7`, `123 US Hwy 8`, `123 CR 8` |
| PO boxes | `PO Box 123`, `P.O. Box 123`, `Post Office Box 123` |
| Rural and highway-contract routes | `RR 2 Box 152`, `HC 68 Box 23A` |
| Military delivery lines | `PSC 123 Box 4567`, `UNIT 4 BOX 12`, `CMR 2 BOX 9` |
| General Delivery | `General Delivery, Nome, AK 99762` |
| Puerto Rico urbanization lines | `URB Las Flores\n150 Calle A\nSan Juan PR 00926` |

Known suffixes normalize using the 206 primary forms in USPS Appendix C1 and their listed aliases. `CARR` is also recognized. Unknown street text is preserved. Directionals include single words, abbreviations, and two-word combinations such as `North East`.

Feed repairs add candidates for repeated equivalent suffixes, joined suffix/unit markers, spaces inside house numbers, and abbreviated route names. The original reading remains when it parses. A two-part unit such as `4 B` also has a `4B` alternative. Alphanumeric unit punctuation can have alternatives such as `4-B`; the original identifier remains available. House-number hyphens and numeric unit ranges are preserved. Two different suffixes, as in `Oak Court Road`, remain street name plus suffix.

Additional candidates cover numbered-street spellings, saint/mount/fort abbreviations, apostrophes, repeated directionals and identifiers, and short units placed before a street suffix. `Tower` is an informal secondary marker and can also remain part of a street name. A compound building/unit interpretation requires an observed hyphen and does not replace an existing explicit chain. All such readings record assumptions. They are possible interpretations, not corrections or confirmed aliases.

Name words can have abbreviation alternatives, such as `Rocky Pt` and `Rocky Point`. When a suffix establishes the name boundary, common name-forming words also support one space change, such as `Lakeview Road` and `Lake View Road`. These alternatives preserve the original spelling, source spans, house number and secondary chain. They do not select a registered spelling, and the additional candidates can increase ambiguity and lookup cost.

`interpretFullAddress` handles commas without surrounding spaces, semicolons, colons, newlines, full state names, state/territory and military abbreviations, ZIP Codes, ZIP+4, nine-digit ZIP strings, and terminal US country labels. Unseparated boundaries remain candidates. Separate apartment lines can belong to the delivery address. City names such as `Key West` and `Front Royal` retain their locality reading despite unit-keyword collisions.

These are syntactic interpretations. The library does not assert deliverability, validate city/ZIP relationships, correct missing or misspelled street names, or infer a unit absent from the input. Intersections, arbitrary recipient/company lines, dual street-and-PO-box mailing blocks, and Puerto Rico kilometer-only rural descriptions do not have dedicated grammars. The generic literal fallback can retain unsupported text; a candidate is not proof that its format or address is valid.

## Public API and migration

```ts
interface AddressInput {
  deliveryLine: string;
  city?: string;
  state?: string;
  postalCode?: string;
  urbanization?: string;
}

interface AddressInterpretationOptions {
  spellingAlternatives?: boolean; // defaults to true
}

interpretAddress(input: AddressInput, options?: AddressInterpretationOptions): AddressInterpretation;
interpretFullAddress(fullAddress: string, options?: AddressInterpretationOptions): AddressInterpretation;
```

Structured locality fields normalize whitespace and case. Known full state names become abbreviations. Nine-digit postal codes become ZIP+4 strings. Supplied locality fields remain unvalidated evidence.

Pass `{ spellingAlternatives: false }` to skip alternative street/route spellings and secondary identifier spacing/punctuation. Suffix and directional normalization, structural ambiguity, feed repairs, and building/unit chain interpretations remain enabled. For example, `123 Lakeview Dr Unit A-204` retains `LAKEVIEW` and the opaque `A-204` identifier, plus its possible building/unit split; it does not add `LAKE VIEW` or `A204`. Both modes preserve source tokens and spans. Candidate order is unranked in both modes.

Existing calls keep spelling alternatives enabled. Resolver factories also retain the full default candidate set. Disabling spelling alternatives deliberately reduces possible readings and can reduce MLS agreement; it does not make the remaining readings authoritative.

This expansion changes the TypeScript component contract and broadens candidate sets. Adapters written for the street-only API need a review before upgrading:

- `AddressComponents` is now a union. Street candidates retain their existing shape and omit `kind`; non-street candidates have an explicit `kind` and no house/street fields. Use `StreetAddressComponents` where a street-specific type is required.
- `sourceSpans.houseNumber` and `sourceSpans.street` are optional. Non-street addresses expose `delivery`, `boxNumber`, and `routeNumber` spans where applicable.
- Candidate IDs are opaque and unique within an interpretation. Their spelling and candidate counts can change as supported readings expand.
- Bare alphabetic and suffixless units, directional names, and separated numeric house ranges now produce alternatives. Always pass the entire candidate set to the index.
- Invalid adapter evidence throws `TypeError`. Infrastructure errors still propagate normally.
- Multiple secondary components appear in `secondaryUnits` in input order. `secondary` is the last component, for compatibility with single-unit consumers. An adapter **must match the complete chain when present**; matching only the last unit can confuse apartments in different buildings.

```ts
import type { AddressCandidate } from "@marvin-amador-7/address-interpreter";

function lookup(candidate: AddressCandidate) {
  const c = candidate.components;
  if (c.kind === undefined || c.kind === "street") {
    // houseNumber and streetName are strings here.
    const units = c.secondaryUnits ?? (c.secondary ? [c.secondary] : []);
    return findStreet(c.houseNumber, c.streetName, units);
  }
  switch (c.kind) {
    case "po-box": return findPoBox(c.boxNumber);
    case "rural-route":
    case "highway-contract": return findRouteBox(c.kind, c.routeNumber, c.boxNumber);
    case "military": return findMilitaryBox(c.militaryUnit, c.routeNumber, c.boxNumber);
    case "general-delivery": return findGeneralDelivery(c.city, c.state, c.postalCode);
  }
}
```

The `find*` functions above represent your data access. Include locality, directionals, suffixes, urbanization, and every other identity-relevant component in your real lookup. Parameterize queries; normalized strings are still untrusted input.

## Lossless evidence

Every token has `raw`, `normalized`, `start`, and `end`. Offsets are zero-based, end-exclusive JavaScript string offsets into the original `deliveryLine` or full-address string. Normalization never rewrites that original string. Unicode apostrophes, compatible characters, and fraction glyphs normalize without moving source spans.

```ts
const result = interpretAddress({ deliveryLine: "123½ O’Connor Ave #4" });
const candidate = result.candidates[0];
// houseNumber: "123 1/2", streetName: "O'CONNOR", streetSuffix: "AVE"
// The house-number span still slices the original text "123½".
```

`sourceSpans.secondary` covers the complete secondary phrase. A chain also has individual `secondaryUnits` spans. Full addresses can have `city`, `state`, `postalCode`, `country`, and `urbanization` spans. Fields supplied separately to `interpretAddress` have no span in the delivery line.

Repairs can split an original token. In `Main St4B`, the repaired street span ends after `St` and the unit span starts at `4B`; the returned tokens still preserve `St4B` as written. Source spans may therefore start or end inside a token. They can include trailing delimiters retained by tokenization.

`assumptions` records uncertain structural choices, such as `trailing-token-is-unit`, `street-city-boundary-inferred`, `house-number-boundary-inferred`, or `leading-directional-is-street-name`. An empty list does not imply postal validation or exhaustive coverage of every possible address grammar.

Feed-specific assumptions include `joined-address-components`, `house-number-spacing`, `fractional-house-separator`, `repeated-street-suffix`, `route-name-expanded`, `trailing-tokens-are-unit`, and `secondary-identifier-spacing`.

Other assumptions include `compound-unit-is-building-and-unit`, `numbered-street-spelling`, `secondary-identifier-punctuation`, `secondary-before-house-number`, and `repeated-house-number`. Evidence spans can overlap when a unit appears inside the street phrase. A duplicate identifier's span remains available even when an alternative treats it as repeated text.

## Resolution

```ts
import {
  createAddressResolver,
  createFullAddressResolver,
  type AddressIndex,
} from "@marvin-amador-7/address-interpreter";

interface Property { id: string }
declare const index: AddressIndex<Property>;

const resolver = createAddressResolver(index);
const result = await resolver.resolve({ deliveryLine: "123 Main St B" });
const fullResolver = createFullAddressResolver(index);
```

```ts
interface AddressIndex<T> {
  lookupCandidates(candidates: readonly AddressCandidate[]): Promise<readonly AddressMatch<T>[]>;
}
interface AddressMatch<T> {
  candidateId: string;
  entityId: string;
  value: T;
}
```

The resolver calls the index once with all candidates. It rejects matches that reference an unknown candidate or an empty/missing entity ID.

| Result | Meaning |
| --- | --- |
| `invalid` | No complete candidate set; the index is not called. |
| `not-found` | The index returned no matches. |
| `resolved` | Every returned match identifies the same entity. |
| `ambiguous` | Returned matches identify different entities. |

For aliases sharing an `entityId`, the first match's value is returned. Your adapter must ensure those values are interchangeable. A display address, photo URL, or owner name is not reliable identity evidence. Tenant scope, authorization, and complete component matching belong in the adapter.

## Diagnostics and limits

`AddressDiagnostic` includes `missing-house-number`, `unrecognized-delivery-line`, `invalid-input`, `incomplete-secondary`, `input-too-long`, and `too-many-candidates`.

`ADDRESS_LIMITS` exposes fixed budgets of 4,096 characters per input field, 128 tokens, and 256 candidates. When a budget is exceeded, the result contains no candidates. The library never sends a truncated set to an index, since that could hide a competing match. Incorrect JavaScript argument types return `invalid-input` instead of throwing.

## Validation and corpus evaluation

Use Node.js 22 or 24 for development tooling. The built library supports Node.js 18 and later.

```sh
npm ci
npm run check
npm run package:files
```

The quality gate runs strict TypeScript checking, regression and seeded invariant tests, the ESM/CommonJS build, and tests against the actual npm tarball. Tarball checks exercise both runtime entry points and TypeScript `.mts`/`.cts` consumers. CI repeats the package checks on Node.js 18.

The [initial review report](docs/review-2026-09-26.md) documents the source review and first comparisons. The [400,000-address research report](docs/research-400k-2026-09-26.md) records the expanded HomeAnalytics MotherDuck sample and subsequent parser iterations. The [September 28 development follow-up](docs/research-2026-09-28.md) records later grammar improvements and the state-level input audit on that same corpus. The [curated-corpus report](docs/research-valid-corpus-2026-09-28.md) documents admission rules, the new baseline, spelling improvements and the 93.573% held-out result. The [parser design follow-up](docs/parser-design-2026-09-28.md) explains optional spelling expansion, compatibility checks, candidate-quality measurements, and the admission audit. The [95% investigation](docs/research-95-2026-09-28.md) records the next gains and corrects the comparison-source description after a live schema check. Address extracts and address-level reports remain under the ignored `.local/` directory.

The [correctness review](docs/correctness-review-2026-09-29.md) supersedes cross-source agreement as the research objective. The [source and dataset investigation](docs/research-parser-correctness-sources-2026-09-29.md) compares USPS, RESO, usaddress, libpostal, OpenAddresses, and the National Address Database. Correctness remains unmeasured until exact-input annotations are independently reviewed. Public datasets and generated inputs do not supply those labels automatically.

The [ordinal boundary experiment](docs/research-ordinal-boundaries-2026-09-29.md) removes invented house-number and street-name readings while retaining all previous development agreements. It records the predeclared hypothesis, exact-set regression tests, candidate differences, timing uncertainty, and keep decision. Fewer candidates alone do not establish corpus-wide correctness.

The [street-keyword experiment](docs/research-keyword-boundaries-2026-10-05.md) recovers suffixed street names containing secondary keywords before bare units. It gains 32 development agreements and one provisional labeled reading, with no removed readings in the development audit. Exact-set agreement remains unchanged.

The [bare-unit floor experiment](docs/research-bare-unit-floor-2026-10-05.md) fixes inputs such as `12 Oak St 204 Floor 2`. Its first attempt was rejected despite a higher field-agreement score because it misread ordinal floor phrases. The final repair passes the expanded regression suite and preserves every audited development interpretation; measured corpus scores remain unchanged.

Prepare a blind development review queue within the same corpus:

```sh
npm run research:review -- --count 2000
```

This creates private, immutable sampling evidence under `.local/correctness-review/development-v1/`, with 2,000 unreviewed inputs stratified by state and cohort. Reviewers see only the exact delivery line, opaque identity, and empty annotation slots. ATTOM fields, parser predictions, and holdout examples are omitted. Selection probabilities and source-row mapping are saved separately. The command refuses to overwrite a review directory. This is annotation preparation, not a scored benchmark or a new corpus.

The [Luna labeling pilot](docs/labeling-pilot-2026-09-29.md) runs two blind passes over 200 inputs from that queue. The [annotation guide](docs/labeling-guide-v1.md) requires source-token evidence for every field and every building, floor, and unit element. Structural checks reject invented evidence, missing tokens, duplicate cases, and changed inputs. Disagreements, unsupported decisions, and a preselected audit sample go to a separate reviewer. All resulting labels remain provisional, including model consensus.

For human review, run `npm run research:calibration` once, then `npm run research:review-ui`. The local interface at `http://127.0.0.1:4319` saves an initial source-only reading before revealing agent proposals. It supports token selection, complete secondary chains, ambiguous readings, uncertainty, resumable drafts and recorded final revisions. After reviews are finalized, `npm run research:score-reviewed` creates a versioned experimental evaluation. The [human calibration workflow](docs/research-lab-workflow.md#human-calibration-workspace) explains selection, privacy, review provenance and scoring limits.

**Manual labeling is optional for continuing development.** The [automated evaluation protocol](docs/automated-evaluation-v1.md) freezes a component projection of the existing Luna labels without consulting parser output. Run `npm run research:prepare-agent-benchmark` once, then `npm run research:score-agent -- --baseline <frozen-build.mjs>`. Both spelling modes report exact-set agreement, labeled-reading recall, extra readings and complete secondary chains. Unresolved cases remain visible. These provisional comparisons do not establish population accuracy; completed human reviews remain separate evidence.

Pass `--agent-benchmark .local/correctness-review/agent-components-v1/bundle.json` to a research cycle, or set `agentBenchmark` to that path in its private report configuration. Each cycle pins the bundle, runs the automated comparison and adds aggregate results to Benchmarks. The correctness release gate is unchanged; its pending status does not prevent development experiments.

The scripts prepare work, validate outputs, compare passes, and finalize review evidence. A coordinator dispatches the actual model jobs; these commands do not call a model API or start a persistent labeling service. After workers finish, refresh the aggregate labeling panel with:

```sh
npm run research:label-progress
npm run research:report
```

Set `labelingProgress` in `.local/research/report-config.json` to the private pilot's `progress.json`. The dashboard shows both passes and their disagreements by state, plus whole-pilot adjudication counts. It exports only allowed aggregate fields. Agent acceptance and model agreement never populate the parser-correctness score.

The [annotation expansion protocol](docs/labeling-expansion-v1.md) extends that sample to 1,000 inputs within the same corpus. It reuses the 200 completed labels and assigns 800 new inputs to two blind Luna passes. Run `node scripts/labeling-expansion.mjs prepare` once, then `status` to inspect validated batch counts and `compare` after both passes finish. Use one active worker and batches of 20 to limit request pressure. After the separate reviewer's blind labels are saved, `node scripts/finish-labeling-expansion.mjs freeze-review` records their receipt before proposal inspection; `finalize` requires complete adjudication and decision evidence. Historical labels and manual reviews remain separate, and all new model labels remain provisional.

Set `labelingExpansion` in the private report configuration to `.local/correctness-review/luna-expansion-v1`. Each `npm run research:report` verifies the completed batches and refreshes a separate expansion panel with reused-label counts, both new passes, review status, and state coverage. The original pilot panel remains available. Public exports contain aggregate counts only.

Workers can import `writeLabelBatch(inputFile, annotations)` from `scripts/write-label-batch.mjs` to validate their chosen token assignments before saving. Invalid batches create no output, and completed batch files cannot be overwritten. The helper serializes decisions; it does not infer address labels.

Research uses one frozen, curated corpus at `.local/corpus/mls-valid.jsonl`: 336,057 records admitted from the 400,000-address download. It contains 268,923 development records and 67,134 holdout records, across all 50 states plus DC. The geographic and difficult-format cohorts remain within that single corpus. The original download and earlier stress sample are audit sources, not active benchmarks. Historical evaluations can still use explicit inputs:

```sh
python scripts/download-mls-corpus.py
npm run build
node scripts/evaluate-corpus.mjs --input .local/corpus/mls.jsonl --split development
node scripts/evaluate-corpus.mjs --input .local/corpus/mls.jsonl --split holdout
```

Use `--baseline /path/to/baseline.mjs` to compare another build. The downloader reads only address fields and performs no remote writes. It samples source blocks, stratifies by address shape, and assigns every property to either development or holdout. The saved manifest records the source, sampling parameters, timestamp, counts, and corpus hash. The optional `--suffix-reference` points to an independent normalization reference for evaluating source labels.

To prepare the active county-balanced sample, use DuckDB and the HomeAnalytics token profile. Freeze a baseline build before editing the parser, then run:

```sh
mkdir -p .local/baseline
cp dist/index.js .local/baseline/index.mjs
python scripts/download-geographic-corpus.py --rows 400000
node scripts/prepare-holdout.mjs
npm run research:prepare
npm run research -- --baseline .local/baseline/index.mjs --target 95
```

The larger downloader accepts 300,000 to 500,000 rows. Three quarters form the county-balanced geographic cohort; one quarter samples difficult formats. It excludes property groups from the earlier corpus. The saved sample covers all 50 states plus DC. It is not population weighted, and source county groups are not an independently validated county inventory.

Admission rules in `scripts/corpus-policy.mjs` inspect listing text and source fields, independently of parser output. Placeholder and land-description records, missing fields, observed conflicts, and unverified street-name evidence are quarantined with reasons. Spacing, common abbreviations, fractions, route order and compound identifiers remain admissible. This is input/reference consistency, not proof of a registered or deliverable address. Unverified records are not automatically declared invalid real-world addresses. The preparation command refuses to overwrite its frozen corpus, manifest or exclusion journal.

Each research cycle verifies the corpus and admission-policy hashes, runs the package checks, evaluates development diagnostics, groups disagreements, and saves corpus, source, evaluator, and baseline hashes with a run journal. The objective is now **parser correctness**, with a 95% target. An exact interpretation-set scorer is implemented, but calibrated component labels and a population correctness evaluation are still pending, so successful diagnostic cycles return `2`, `awaiting-correctness-labels`. Even 100% ATTOM agreement cannot pass this target. Cross-source losses return `2`, `diagnostic-review-required`, because they need adjudication rather than automatic rejection. Package/check failures return `1`. Historical exit statuses retain their original meaning. An agent or developer implements the next hypothesis; this command does not modify code or run a persistent background agent.

The harness always uses the active corpus; an explicit `--input` must name that same file. The standalone evaluator defaults to it but still accepts other inputs for historical audits and the derived holdout.

Every cycle regenerates `.local/research/index.html` at startup and completion. The public-oriented lab has **Overview, Benchmarks, Research, Data & methods, and Try the parser**. Benchmarks contains the diagnostic trend/scatter plot, field disagreements, and state comparisons. Research records hypotheses, observed results, and decisions. Data & methods explains admission, labeling, selection bias, and evidence maturity. The explorer runs the actual bundled parser locally on synthetic examples or visitor input, showing full chains, assumptions, and source spans.

State results show MLS → ATTOM agreement for the selected evaluation, with matched/evaluated counts and changes from its own baseline. They combine both cohorts. The annotation pilot has a separate state selector under Data & methods; review outcomes cover the whole pilot. Unknown measurements remain unscored, and model consistency is never displayed as parser accuracy.

Use `--experiment .local/experiment.json` to freeze a question, hypothesis, expected effect, change, and acceptance rule before evaluation. Record a keep/reject/inconclusive decision afterward with `npm run research:decide`. Decisions bind to exact run evidence and cannot overwrite earlier decisions. Unplanned and historical runs remain diagnostic checkpoints with missing research metadata disclosed. See [the research workflow](docs/research-lab-workflow.md) and [scoring contract](docs/benchmark-contract-v1.md).

```sh
npm run build
npm run research:report
```

The standalone report command refreshes the HTML without rerunning evaluation. `--input` selects a research directory and `--output` selects its HTML destination; both must remain under `.local`. It embeds aggregate metrics, public-safe research descriptions, synthetic examples, and the parser build. Private corpus rows and annotation text are excluded. Visitor inputs stay in memory and are excluded from exports. No external assets or services are loaded. The page supports keyboard navigation, saved view/filter URLs, aggregate JSON export, and optional 30-second refresh, paused while the parser explorer is open.

Optional `.local/research/report-config.json` sets the correctness `target` shown in the evidence status bar and used by future cycles unless `--target` overrides it. Diagnostic agreement charts have no correctness target line. Historical run targets remain intact. It also names corpora, annotates older runs, and registers separately captured evaluation summaries, including holdouts. `corpora` maps a corpus SHA-256 to `{ "id": "expanded", "label": "Expanded corpus", "rows": 400000, "description": "..." }`. Related development and holdout hashes can share that display ID; chart lines require identical recorded corpus, policy, evaluator, measurement-version, split, and parser-option identities. Missing historical identities remain unconnected. `annotations` maps a run directory name to `{ "label": "...", "note": "..." }`. Each `checkpoints` entry supplies `id`, `label`, `file`, `corpusHash`, and an ISO `started` timestamp; use `version: "baseline"` and `kind: "baseline"` to display a summary's comparison build. Only aggregate `.json` files under `.local` are accepted. Records are read from run directories; no historical result is rewritten by the visualization.

The local report configuration sets `activeDataset: "valid"` to show only the curated corpus. `curationManifest` names its aggregate admission manifest, displayed in Data & methods with retained and excluded counts. Earlier run files and checkpoint registrations remain intact but are excluded from the active HTML. Both the starting parser and improved builds are evaluated on the same admitted records; the change in denominator is not counted as a parser improvement.

Holdout selection excludes exact structured-address and listing/locality keys seen in the earlier corpus or new development data, and removes duplicates within the holdout. Freeze the parser before evaluating it. To score the selected holdout without exporting ordinary failure examples:

```sh
node scripts/evaluate-corpus.mjs --split holdout --baseline .local/baseline/index.mjs --failure-limit 0 --output .local/corpus/valid-holdout
```

The diagnostic corpus metric compares `MLSLISTINGADDRESS` with ATTOM `PROPERTYADDRESSHOUSENUMBER`, `PROPERTYADDRESSSTREET*`, and `PROPERTYADDRESSUNIT*` fields. These are property-address comparison labels, not native MLS component annotations. The live source schema was checked during the 95% investigation. The dashboard now calls this **MLS → ATTOM field agreement**. Listing strings can omit components or contradict those property fields, so a mismatch is not automatically a parser error. Generated variants test formatting of the property components. Neither metric is a national accuracy estimate, a false-positive measurement, or a deliverability test.

New evaluations also record first-candidate agreement, successes found only in later candidates, the number of readings that disagree with ATTOM property fields, and parser rejections. No-candidate results remain in the admitted denominator. The legacy `invalid` aggregate is an alias for parser rejection, not a corpus exclusion. Candidate order is unranked, and cross-source disagreement is not proof of a false interpretation. Earlier reports leave these new measurements empty rather than assuming zero.

Every research cycle now saves `performance.json` with eight alternating local timing trials after two warmups on every sixteenth development input. It compares the baseline, current default, and current parser with spelling alternatives disabled. Input preparation is outside the timed region. Timings inform review and do not gate acceptance because local timing varies. The dashboard shows reading-quality counts by state or cohort and a separately labeled national timing sample.

To measure the optional mode or repeat the timing comparison on the same corpus:

```sh
node scripts/evaluate-corpus.mjs --without-spelling --failure-limit 0 --output .local/corpus/without-spelling
node scripts/benchmark-parser.mjs --baseline .local/baseline/index.mjs
```

## Sources

Normalization and delivery grammars were checked against USPS Publication 28:

- [Appendix C1, street suffixes](https://pe.usps.com/text/pub28/28apc_002.htm)
- [Appendix C2, secondary designators](https://pe.usps.com/text/pub28/pub28apc_003.htm)
- [Section 233, directionals](https://pe.usps.com/text/pub28/28c2_014.htm)
- [Section 234, consecutive suffix words](https://pe.usps.com/text/pub28/28c2_015.htm)
- [Section 235, numeric street names](https://pe.usps.com/text/pub28/28c2_016.htm)
- [Appendix F, highway names](https://pe.usps.com/text/pub28/28apf.htm)
- [Appendix D2, grid addresses](https://pe.usps.com/text/pub28/28apd_003.htm)
- [Appendix D4, fractional addresses](https://pe.usps.com/text/pub28/28apd_005.htm)
- [Section 241, rural routes](https://pe.usps.com/text/pub28/28c2_021.htm)
- [Section 225, military addresses](https://pe.usps.com/text/pub28/28c2_010.htm)

This package is not affiliated with USPS. It is not a CASS, DPV, geocoding, or authoritative address-validation service.
