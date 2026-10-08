# Bare units before explicit floors

`12 Oak St 204 Floor 2` previously returned no candidates. The parser now retains a reading with bare identifier `204` followed by floor `2`, with separate source spans for both. It also retains the alternative reading in which `204` belongs to the street name. This experiment fixes that omission and strengthens the regression suite. It does not improve the measured corpus percentage.

## Diagnosis and implementation

The initial regression failed with an empty candidate array. Direct inspection at the street-parser boundary confirmed two problems. Numeric-prefix floor recognition consumed `204 Floor` as floor 204, then rejected the remaining `2`. Changing the identifier to `A204` avoided that rejection but left the identifier inside the street name instead of composing a secondary chain. Candidate deduplication was not the cause.

The repair composes a validated explicit-floor continuation with existing interpretations of the prefix. At least one prefix interpretation must contain a bare identifier after a recognized street suffix. Shared chain assembly preserves every secondary element, the final `secondary` field and the original source spans. Ordinal-floor handling uses the same assembly helper.

Recovery examines the first eligible floor marker and parses its prefix without recursively applying recovery. Long-chain tests exercise forty floor elements. The repair is deliberately limited to compact numeric or letter-number floor identifiers, including `02`, `-1`, `1.5`, `B2` and `2B`. Other floor formats retain their existing behavior.

## Rejected first attempt

The first attempt passed its fixtures and gained nine MLS → ATTOM agreements. The complete candidate audit exposed why that was insufficient evidence. It added interpretations such as bare unit `2ND` on floor `REAR` for `2nd Floor Rear`. It also created secondary chains from ground-floor and floor-plan descriptions.

That attempt changed 66 development inputs across 13 states, adding 130 distinct readings with spelling off and 157 with spelling on. It removed no readings, and the 200-case pilot showed no regressions. Nevertheless, the source text contradicted the new interpretations. The decision is **reject**, and the recorded score increase is not credited as an improvement.

The narrowed version preserves numeric and spelled ordinal phrases, named-floor phrases, floor-plan descriptions and standalone street directionals. Negative fixtures reproduce the failures from the broad attempt. The two-word ordinal spelling `1 ST` is covered as well as `1ST`, because token repairs can expose that form.

## Final results

All comparisons use the original pre-experiment baseline, not the rejected build. The corpus, policy, provisional labels, projection and scoring rules are unchanged.

| Measurement | Before | Final |
| --- | ---: | ---: |
| Source-listing field agreement | 251,279/268,923 | 251,279/268,923 |
| Source-listing percentage | 93.4390% | 93.4390% |
| Agent-labeled reading recall, either mode | 190/193 | 190/193 |
| Exact agent-set agreement, spelling off | 120/192 | 120/192 |
| Exact agent-set agreement, spelling on | 85/192 | 85/192 |
| Emitted development candidates, spelling off | 385,759 | 385,759 |
| Emitted development candidates, spelling on | 630,837 | 630,837 |

All five corpus scenarios have zero gained or lost agreements, including first-candidate comparisons. An independent audit of every development delivery line finds identical normalized component sets, candidate counts and first readings in both spelling modes. The five finalized manual reviews retain their scores, and their journal is unchanged. Holdout failures were not inspected.

The targeted omission is demonstrated by the synthetic fixtures but is not represented by changed outputs on this frozen development population. That is a coverage gap in the sample, not grounds to substitute synthetic results for corpus accuracy. The 200-case agent pilot also failed to detect the first attempt's new errors. Future labeling and challenge selection should deliberately include nearby floor-description forms.

The final suite passes 562 tests, including 38 new floor tests. These cover aliases, identifier punctuation, complete later building/apartment chains, full-address locality, fractional houses, keyword-bearing street names, ambiguity, incomplete chains, ordinal and named-floor controls, and long inputs. Type checking, both package builds and packed ESM/CommonJS/TypeScript consumers pass. Browser checks now exercise 26 exact interpretation cases, including this full address in both spelling modes, plus source evidence, mobile layout and offline behavior.

Timing remains inconclusive. The cycle measured 241.65 ms for the baseline and 254.70 ms for the final build on 16,808 inputs, a difference of +5.40%. A separate 20-round repeat measured 232.80 ms and 231.49 ms, a difference of −0.56%. No speed change is claimed.

Decision: **keep the narrowed repair**. The demonstrable parser failure is fixed, the false interpretations from the first attempt are excluded, and the audited development outputs remain unchanged. Public correctness remains unmeasured; the provisional scores do not satisfy the release target.

## Reproducible evidence

Private artifacts remain under `.local/`:

- Original baseline: `parser-research-floor-20261005/index.mjs`, SHA-256 `f3418503a712965391a39ba7d8fa2e52e2e85db8c589723f3234e65e5b1edc48`.
- Rejected cycle and decision: `research/2026-10-05T23-55-51-446Z-78f3f507/`.
- Final cycle and decision: `research/2026-10-06T00-02-46-846Z-020b03a2/`.
- Final parser snapshot: the final cycle's `parser-current.mjs`, SHA-256 `069f2d9b4bb3475f7e35e5fb8b3ec8c06e13dc56955acf389a7d9a84600abfc6`.
- Full delivery-line audits: `bare-unit-floor-audit-20261005/` and `bare-unit-floor-v2-audit-20261005/`.
- Predeclared plans: `experiments/bare-unit-floor-v1.json` and `experiments/bare-unit-floor-v2.json`.

The final run began on October 5 in Costa Rica; its directory uses October 6 UTC. The dashboard retains both decisions so the rejected percentage gain remains explainable.
