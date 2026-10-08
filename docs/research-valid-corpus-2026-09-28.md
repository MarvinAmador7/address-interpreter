# Curated corpus and spelling research, September 28

The active benchmark now contains 336,057 records admitted from the frozen 400,000-row HomeAnalytics MLS download. It has 268,923 development records and 67,134 held-out records. All 50 states and DC remain represented. The geographic cohort contains 253,401 records; the difficult-format cohort contains 82,656.

This change follows the decision to exclude malformed or non-address records and records with missing or conflicting MLS fields. The original download remains an audit source. There is one active corpus, `.local/corpus/mls-valid.jsonl`, with both splits inside it. Its SHA-256 is `d4bfa27a475c3a6d61d198369335ed1ebb8a4262f515335f1b400ec561f662c6`.

## Admission and limits

`scripts/corpus-policy.mjs` checks the input string and structured source fields without importing the parser or examining candidate success. The rules quarantine missing primary fields, placeholders, land descriptions without a separate house number, absent field evidence, unverified street-name evidence, and explicit unit conflicts. The earlier holdout exclusions for previously seen addresses remain in force. Split assignments and admitted source rows are unchanged.

The preparation step excluded 63,943 rows. Reasons can overlap. The largest groups were expected suffix not observed, 32,748; unit not observed, 8,785; street-name evidence not verified, 6,587; missing reference primary fields, 5,895; house number not observed, 5,622; absent predirectional, 5,561; and absent postdirectional, 4,006. There were also 515 previously seen holdout addresses.

These are admission checks for an input/reference-consistent benchmark. Quarantined records are not all invalid real-world addresses. Some have incomplete annotations or spellings the independent checks cannot verify. The admitted corpus is not independently geocoded or confirmed deliverable. Residual annotation errors can remain. Precision and address identity are still unmeasured.

The policy tolerates word spacing, hyphens, ordinals, fractional numbers, leading zeros, known route abbreviations and word order, joined suffix/unit markers, and multi-part secondary identifiers. Tests protect these cases from being removed simply because they are difficult to parse. A control audit also checked admission errors against previously matched development examples and exposed missing support for route notation, ordinal floors and uncommon suffix spellings before the corpus was frozen.

The independent suffix alias reference was captured directly from [USPS Publication 28, Appendix C1](https://pe.usps.com/text/pub28/28apc_002.htm). It contains 206 primary forms and 549 aliases/codes. Route spelling evidence follows the forms in [Appendix F](https://pe.usps.com/text/pub28/28apf.htm). Neither table is an address-location database. The scoring comparator itself remains unchanged.

The corpus manifest saves source, policy, and corpus hashes, plus admission counts by split, state and cohort. The private exclusion journal records a source row identifier and reasons. Preparation refuses to overwrite frozen files. Research cycles and the active evaluator verify both the corpus bytes and admission-policy hash before scoring.

## Parser changes on a fixed denominator

The starting parser already scores 93.082% on the admitted development records. The increase from the earlier 79.435% is a change in benchmark admission, not a parser improvement. The dashboard starts a separate baseline for this denominator.

| Build | Matches / 268,923 | Agreement | Additional matches |
| --- | ---: | ---: | ---: |
| Starting parser | 250,320 | 93.082% | — |
| Street-name word abbreviations | 250,524 | 93.158% | 204 |
| Compound-name spacing | 251,098 | 93.372% | 574 |

Together these changes gained 778 matches with zero lost matches across all five development scenarios. The geographic development cohort reached 190,911 / 202,790, or 94.142%; the difficult-format cohort reached 60,187 / 66,133, or 91.009%.

Word abbreviations apply inside parsed names and retain the literal spelling. The first broad attempt added unnecessary readings of street/unit boundary alternatives and Spanish `Via` names, so contract tests rejected it. The accepted version protects those readings. Its last audit on the original download gained 211 raw matches with zero regressions before the active benchmark changed.

Compound spacing uses general name-forming words, not registered street aliases. It adds one adjacent-word join or one split within a word after a street suffix establishes a boundary. It preserves house numbers, opaque secondary identifiers and complete secondary chains. A minimum fragment length prevents incidental splits such as `WIL LOW`. Existing tests now explicitly check the additional supported readings for compound names while preserving the earlier interpretations.

Mean candidates per admitted development listing rose from 1.901 to 2.396. The extra recall therefore has a cost in candidate volume. Candidate order remains unranked, and no preferred registered spelling is asserted.

## Validation artifacts

The final package gate passed 390 tests, TypeScript checking, ESM/CommonJS builds and packed JavaScript/TypeScript consumers on Node.js 24.21.0. The frozen final parser is `.local/parser-valid-final-20260928/index.mjs`, SHA-256 `c0b68e9a47ee004ad26c7c223abca77f4d11d791565ede0cfbc8ec6bb4ce04d9`.

Local artifacts include the corpus manifest and exclusion journal, `.local/valid-development-summary.json`, the development run directories, `.local/valid-final-checks.log`, and `.local/research/index.html`. The report shows the active corpus only, its admission reasons, state results and the new development baseline. Earlier research documents and run files remain unchanged.

The formatting pass changed only emitted whitespace. Minified executable output is identical to the measured compound-name build. A complete-output comparison on all 268,923 admitted development inputs also found zero differences in tokens, candidates, assumptions, spans or diagnostics.

## Held-out results

The frozen parser reached 62,819 / 67,134, or **93.573%**, compared with 62,599 / 67,134, or 93.245%, for the starting parser on the same admitted holdout. It recovered 220 additional raw listings and lost zero matches across all five scenarios. The geographic holdout reached 94.440%; the difficult-format holdout reached 90.916%.

No individual holdout failures were read or used to revise the admission policy or parser. The policy was frozen on development evidence before holdout scoring. Admission was applied mechanically to both splits. `.local/corpus/valid-holdout-20260928.json` records the complete aggregates; `.local/valid-holdout-summary.json` contains the comparison summary.

The 80% objective is met on both curated splits. This result applies to the admitted, source-consistent population and must not be presented as 93.6% agreement on the original unfiltered download.

## Runtime and dashboard checks

A local timing comparison used every sixteenth admitted development input, 16,808 cases, with a full-sample warmup and eight alternating trials. Median time rose from 267.7 ms to 344.7 ms, about 28.8%. Timings varied between trials. Mean candidates over the complete development set grew by about 26.1%. The additional interpretations improve recall but increase runtime and future index lookup work.

The dashboard contains five baseline, development and holdout records on the single curated corpus. Browser checks confirm the admission counts, 51 state groups, development score and national holdout card. Aggregate projection tests protect exclusion metadata from exposing address examples. Integrity checks also confirmed that changed corpus bytes, overwriting frozen files, and running a research cycle against the old download are rejected.
