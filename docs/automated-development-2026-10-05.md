# Automated development baseline — October 5, 2026

Development can continue without more manual labeling. A frozen, parser-independent projection now converts the existing Luna pilot's source-token annotations into provisional component sets. The research harness evaluates those sets in both spelling modes and displays aggregate comparisons in Benchmarks. This cycle changes evaluation tooling; the parser build is unchanged.

The [version 1 protocol](automated-evaluation-v1.md) defines projection and scoring. The 200 inputs remain a selected development sample within the same 336,057-record corpus. There are 192 provisionally exhaustive sets, containing 193 readings, plus seven unresolved inputs and one unsupported input. None were removed to improve a percentage. One literal secondary designator receives an audit warning. No new model jobs were run.

## Measurements

| Measurement | Frozen baseline, spelling off | Current, spelling off | Frozen baseline, spelling on | Current, spelling on |
| --- | ---: | ---: | ---: | ---: |
| Exact set agreement | 119/192 (61.98%) | 120/192 (62.50%) | 85/192 (44.27%) | 85/192 (44.27%) |
| Labeled-reading recall | 189/193 (97.93%) | 189/193 (97.93%) | 189/193 (97.93%) | 189/193 (97.93%) |
| Additional readings relative to labels | 112 | 101 | 309 | 292 |
| Exact secondary-chain set | 3/44 | 3/44 | 2/44 | 2/44 |
| No output on supported inputs | 0/192 | 0/192 | 0/192 | 0/192 |

These are agreement measurements against agent judgments, including their judgments about exhaustiveness. They are not verified accuracy. Both blind passes used Luna; shared errors and omitted legitimate interpretations remain possible. The secondary metric compares the complete set of chains across all outputs. A parser can return the labeled chain and still fail that metric by returning an additional chain.

The frozen baseline predates the ordinal-boundary correction. The one gained exact set and fewer additional readings describe that existing change, not a new parser improvement made today. Neither mode loses an accepted labeled reading relative to that baseline.

On the large development corpus, MLS → ATTOM agreement remains 251,247/268,923 (93.4271%). All five scenarios have zero gains and zero losses against the frozen baseline. Timing on 16,808 development inputs measured a current median of 239.97 ms versus 242.11 ms for the baseline, a local difference of −0.88%; no performance improvement is claimed. Holdout failures were not examined.

## Research leads

With spelling alternatives off, 68 of the 72 exact-set disagreements already contain every labeled reading. Additional interpretations are therefore a useful investigation target, but deleting them merely to agree with Luna would risk suppressing valid ambiguity. Thirty-seven of the 41 secondary-chain disagreements also already contain the complete labeled reading.

The four missing labeled readings separate into three issues:

- A secondary keyword intercepts a street-name word. The synthetic input `12 Harbor Key Dr 204` reproduces this: the parser treats `KEY` as a secondary marker and omits the `HARBOR KEY` street reading. A focused experiment should recover the street interpretation while preserving genuine explicit secondary uses.
- Two floor labels preserve ordinal text while the parser canonicalizes it numerically. The synthetic input `12 Oak Street 2nd Floor` produces floor `2`; the projection preserves `2ND`. These are normalization-contract differences to investigate, not automatically parser failures. Any normalization change needs a successor label version.
- One lot/block expression needs a clear structural convention. The projection preserves both labeled elements and flags its unfamiliar designator instead of silently merging or deleting it.

## Evidence and decision

The integrated cycle is `.local/research/2026-10-05T23-32-17-290Z-28eb1798/`. It reproduces the standalone agent evaluation. Its decision keeps the automated workflow, with model evidence still experimental and release-ineligible. Exit status `2` means the public correctness gate remains pending; it does not block another development cycle.

The cycle passed 502 tests, type checking, package builds and packed ESM/CommonJS/TypeScript consumers. Browser checks passed 24 exact interpretation cases, the provisional comparison table, mobile layout and offline behavior. Subsequent end-to-end use exposed a circular-import deadlock in the decision command's dashboard refresh, after the decision was safely saved. The CLI now finishes module initialization before loading the report; a subprocess regression test verifies successful exit and regenerated HTML. The existing decision was preserved and the report refreshed separately. The final suite passes all 503 tests.

Five finalized manual reviews remain in their separate workspace. Their labels and journal were not modified. No raw corpus rows, source-token labels or private review notes enter the dashboard export.

Frozen component bundle SHA-256: `91335b9f3f49a6579d1b84b7a92a3c1db6f2ece2176090fe763d34202c1c97d4`.

Current parser SHA-256: `6ac36a3f2d1fcb75bd0b5f6cd5e33e5083aabc468e240d289a0e537a6cf9cf84`.

The private report configuration now enables this bundle for future cycles. For each proposed parser change: state the hypothesis and acceptance rule, add source-grounded structural fixtures, inspect every lost labeled reading, run the large development diagnostic, then record a keep/reject/inconclusive decision. Further human labeling is optional during this work. Public correctness claims still require independent validation and a defensible population evaluation.
