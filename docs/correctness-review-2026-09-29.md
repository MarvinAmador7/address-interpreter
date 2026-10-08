# Correctness review and research objective

The goal is 95% parser correctness on independently reviewed input text. The existing **93.427%** result measures MLS → ATTOM field agreement. It cannot tell us the current correctness percentage or how many fixes remain to reach 95%.

The [primary-source and dataset investigation](research-parser-correctness-sources-2026-09-29.md) covers USPS, RESO, usaddress, libpostal, OpenAddresses, and the National Address Database, with citations and a pinned public-data audit. This document records the implementation decisions from that review.

## Findings that change the loop

1. **The comparison labels come from a different source.** `download-geographic-corpus.py` pairs `MLSLISTINGADDRESS` with ATTOM `PROPERTYADDRESS*` fields. A unit visible in the input can be missing from that reference. Losing agreement with that field can be the correct parser behavior.
2. **Any-candidate agreement rewards expansion.** `evaluation-metrics.mjs` marks a record matched when any complete candidate agrees. Extra unsupported readings do not reduce that score. First-candidate agreement is also diagnostic because the API deliberately does not rank candidates.
3. **The comparator misses part of the secondary hierarchy.** It checks `secondary.number`, the final identifier. Different buildings or floors with the same final unit can both pass. The library can retain the complete `secondaryUnits` chain, but the existing corpus metric does not test it.
4. **Admission is not proof of validity.** The frozen policy uses reference-field consistency, including approximate lexical evidence. It can retain unresolved role conflicts and exclude plausible addresses. The original 400,000 rows became 336,057 admitted records; those historical exclusions are not 63,943 proven invalid addresses. State counts also describe the selected cohort, not nationwide coverage.
5. **The smaller candidate mode is not a strict correctness mode.** `spellingAlternatives: false` still permits structural ambiguity, feed repairs and compound building/unit interpretations. Neither mode has measured candidate precision. The next parser-design work should distinguish text-supported structure from optional search aliases and repair hypotheses before presenting a single accuracy claim.

These findings do not establish that every disagreement is reference error. Actual parser failures remain. They show why source disagreement needs adjudication before it can guide a correctness improvement.

## Changes made now

The research runner declares `parser-correctness-v1` as its objective. It continues package checks, cross-source diagnostics, timing measurements and immutable run journals. `research-objective.mjs` explicitly returns correctness as unmeasured and prevents any agreement score, including 100%, from passing the 95% objective.

Successful diagnostic cycles return exit code `2` and `awaiting-correctness-labels`. A loss of cross-source agreement returns `2` and `diagnostic-review-required`; it is evidence to inspect, not automatic proof of a parser regression. Failed package checks still return `1`. No correctness scorer or accepted gold labels are installed yet. Future support must validate annotation provenance and completeness before opening the target gate.

The dashboard gives the 95% correctness objective its own unmeasured status. Agreement charts and state comparisons remain available as diagnostics, with their old counts. They no longer draw a correctness target line or compute a purported correctness shortfall from ATTOM disagreements. The historical holdout is dated and identified by its recorded parser checkpoint.

The parser implementation, candidate order, active corpus, admission-policy bytes and split membership were preserved in this review. Previous run artifacts retain their original scores and targets. The frozen corpus SHA-256 remains:

```text
d4bfa27a475c3a6d61d198369335ed1ebb8a4262f515335f1b400ec561f662c6
```

## A blind annotation queue within the one corpus

`npm run research:review` produced 2,000 **unreviewed** development inputs under `.local/correctness-review/development-v1/`. The selection covers all 50 states plus DC and both cohorts, 102 strata. No holdout examples were exported or evaluated in this review.

The sampler reserves up to five records per stratum, allocates remaining places proportionally to remaining stratum population, and takes a seeded hash ranking within each stratum. It records the sample size, population, inclusion probability and weight for every stratum. This is a reproducible review sample of the admitted development population, not a nationally representative sample or a release test.

`review.jsonl` contains only opaque record identity, the exact delivery line, its hash, and empty review slots. It hides ATTOM components, locality, parser output and success/failure labels. `manifest.json` separately records the corpus hash, source-row mapping, strata, sampling seed and initial queue hash. A new directory is required for a different sample; the command refuses to overwrite existing reviews. Raw files stay under ignored `.local/` and are not embedded in the HTML or npm package.

The queue is a preparation format, not an accepted gold-label schema. All decisions are `unreviewed`, all reading lists are empty, and the labeled count is zero. Editing that file alone does not authorize a correctness score.

## Annotation and measurement rules for the next implementation

Review the exact input before showing any parser output or ATTOM field. Record the annotator's identity and whether they are human or automated. Independent second review and adjudication are needed for trustworthy labels; an LLM proposal or agreement between parsers is not automatically gold. Freeze the annotation rules after a pilot and re-review pilot records affected by rule changes.

| Review outcome | Treatment |
| --- | --- |
| Clear, supported address | Label every field role, source span and complete secondary chain |
| Multiple text-supported readings | Label all accepted complete readings; record whether the set is exhaustive |
| Valid address outside the current grammar, such as a range or intersection | Retain as an address and count the unsupported case in coverage; do not call it invalid |
| Insufficient context for reliable labels | Report separately as unresolved; do not turn uncertainty into a false parse or an invalid-address exclusion |
| Clearly malformed or non-address text | Exclude from the address-correctness denominator with adjudicated reasons; report false acceptance separately |
| Missing or conflicting ATTOM fields | Review the input on its own; this condition does not establish input invalidity |

Labels must preserve the complete house identifier and every building, floor, unit or room in order. Missing, explicitly empty and unknown fields need different representations. Normalization rules must be versioned and limited to documented transformations. Do not silently erase primary hyphens, select range endpoints, invent units, drop observed directionals, or declare two street spellings to be the same registered address.

For this unranked candidate API, the recommended headline metric is **exact supported-interpretation-set agreement** on fully adjudicated records: no accepted reading missing and no unsupported reading added. Measure candidate recall, supported-candidate precision, no-candidate coverage failures, complete secondary-chain agreement, and candidate cost separately. A one-correct-plus-ten-wrong candidate set must not pass the headline metric. The pilot must settle normalization and exhaustive ambiguity annotation before this metric is implemented or reported.

Use stratum weights when estimating the admitted corpus population, and show raw sample counts alongside weighted results. Report reviewed, adjudicated, unresolved, unsupported and excluded counts. Never use incomplete annotation sets to declare all unlisted candidates wrong. A development sample is for learning; the 95% release claim needs a frozen parser, independently reviewed protected evaluation labels, duplicate/property-cluster checks, and a predeclared uncertainty rule. Existing holdout aggregate scores have already been observed and must not be described as never used.

Public labeled examples can improve grammar regression coverage after checking their license and label mapping. They remain separately identified fixtures. They do not become another active corpus or enter this corpus's correctness numerator.

## What remains before resuming a numerical correctness loop

Complete the annotation pilot, validate a versioned gold sidecar, and implement a scorer for the complete output contract. Then run correctness and performance checks together with the cross-source diagnostics. The review establishes the measurement boundary and prepares the data; it does not claim 95% correctness or manufacture labels to meet that number.

## Validation

The complete cycle at `.local/research/2026-09-29T23-10-28-524Z-16dd6689` passed TypeScript, all 439 tests, the build, and packed ESM/CommonJS/TypeScript consumers. Its expected exit code was `2`, with status `awaiting-correctness-labels` and a null correctness score. Tests explicitly cover 100% cross-source agreement failing to pass the correctness gate, sampling independence from reference/prediction fields, held-out row exclusion, deterministic allocation, and private report projections.

Development agreement remains 251,247 / 268,923, or 93.427%. Both any-candidate and first-candidate comparisons show zero gains and zero losses in all five scenarios. The parser build SHA-256 remains `876cd9563f59309ba01dcf83da086f5f1bd0a82b70a6a33cff6d453075c685ae`, identical to the frozen preceding build. The report renders all 51 state groups, both chart modes and the unmeasured correctness card without a diagnostic target marker or horizontal overflow. Aggregate verification is saved in `.local/correctness-review/verification.json`.
