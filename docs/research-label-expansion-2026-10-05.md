# Precision audit and annotation expansion

The next development step is to distinguish excessive parser alternatives from incomplete labels, then broaden annotation coverage within the existing corpus. The parser remains frozen during labeling. MLS agreement and provisional component agreement measure different things.

## Pilot audit

The current spelling-off pilot has 72 inputs with additional readings relative to its labels. A seeded sample selects 50 of those inputs, covering all 42 states represented in that error group. This is a targeted diagnostic sample, not a precision estimate for the corpus.

A Luna reviewer first labeled the 50 inputs without seeing parser outputs or historical labels. After its blind labels were frozen, it reviewed all 116 distinct emitted readings. The final candidate-review receipt pins SHA-256 `7d14e74324e444e70acc39332a511cd207ca956e2ddaa73f3c4a98b48888ce3f`.

| Additional readings relative to historical labels | Luna judgment |
| --- | ---: |
| Supported | 2 |
| Unsupported | 55 |
| Uncertain | 10 |

Among the 55 readings judged unsupported, 28 absorbed a trailing unit into a street reading, nine involved directional boundaries, nine involved route-number boundaries, five involved compound secondary boundaries, one involved feed repair, and three had other explanations. These are hypotheses from model review. Familiar-looking suffixes and trailing identifiers do not establish the intended address without ambiguity in every case.

The two supported extras matter. One retained a directional within a numbered county-road name, an alternative absent from the historical label. The other normalized an ordinal floor number while the frozen label projection retained its original ordinal spelling. The latter is a normalization disagreement, not evidence that the parser lost the floor. The audit also judged one historically accepted reading uncertain.

There were process defects. The blind reviewer called one ordinary punctuation case unsupported after a serialization problem. Its post-freeze review corrected the judgment; the original blind file remains intact. Its initial candidate-review drafts were edited before the final revision was frozen. Use the final v2 receipt, not the earlier drafts. The reviewer's case-level completeness judgments also failed to flag the supported alternatives missing from historical labels. Candidate-level evidence therefore takes precedence over that inconsistent summary field. None of these model judgments updates the frozen benchmark automatically.

## Expanded sample

The new sample retains all 200 pilot inputs and adds 800 from the same frozen 2,000-input development review queue. Selection uses the existing coverage-first sampler and seed, without parser results. It covers all 50 states and DC, with 683 geographic-cohort inputs and 317 challenge-cohort inputs. The corpus remains 336,057 records with its existing development and holdout splits.

Each new input receives two blind Luna passes. Disagreements, non-supported decisions and a seeded ten percent audit receive a separate blind Luna review followed by adjudication. One worker runs at a time in batches of 20. Completed outputs are validated and saved before the next batch. Throttling stops dispatch rather than triggering a burst of retries.

The [expansion protocol](labeling-expansion-v1.md) and the private manifest bind sample membership and evidence. Reused labels retain their previous provenance. Manual review drafts and finalized reviews remain intact. Model consistency does not establish accuracy, and all resulting labels remain provisional and release-ineligible.

## Parser decision

Do not remove every extra reading to increase exact-set agreement. The audit found both a missing alternative and a normalization mismatch in the labels, and several remaining ambiguities. Use the expanded results to select a narrow source-grounded error family for a declared parser experiment. Preserve the original 200-case benchmark as a separate comparison so a changed annotation sample cannot masquerade as a parser improvement.

The current library deliberately returns both street and unit interpretations for some unmarked trailing identifiers, and the browser regression suite checks that behavior. The largest audit category therefore also raises a candidate-policy question. A stricter output policy needs an explicit contract and independent examples; model preference for a single reading is insufficient justification for removing an existing alternative.
