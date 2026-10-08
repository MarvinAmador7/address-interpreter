# Street keywords before bare units

The parser now retains the `HARBOR KEY / DR / 204` reading of the synthetic input `12 Harbor Key Dr 204`. Previously, recognizing `KEY` as a secondary marker returned early and prevented the bare-unit grammar from considering the later `DR` boundary. The original two readings remain available. This change recovers a missing interpretation; it does not rank candidates or establish which address exists.

## Experiment and diagnosis

The predeclared plan is `.local/experiments/keyword-boundaries-v1.json`. The comparison build was frozen before changes at `.local/parser-research-keyword-20261005/index.mjs`, SHA-256 `6ac36a3f2d1fcb75bd0b5f6cd5e33e5083aabc468e240d289a0e537a6cf9cf84`.

The initial regression required all three expected component sets and exact street/unit source spans. `npx vitest run test/keyword-boundaries.test.ts` failed with only the two preexisting readings. Direct calls to the internal street parser reproduced the omission before deduplication. Replacing the keyword with a normal name word or the already-supported `Tower` case restored the boundary. This confirmed the early-return hypothesis rather than a tokenization or deduplication failure.

After an unanchored keyword reading, the street parser now considers bare-unit boundaries supported by a later street suffix. The suffix must follow the keyword, including when a post-directional follows the suffix. This matters because `KEY` can itself be parsed as a suffix. Anchored explicit units retain their existing behavior, and suffixless explicit units do not gain speculative bare-unit readings. Existing tower handling remains intact.

The 21 new fixtures cover several keywords, single and multiple identifier tokens, identifier punctuation, one- and two-word post-directionals, ordinal floor chains, full-address locality, both spelling modes, exact candidate counts and source spans. Seven controls guard existing explicit and suffixless interpretations. The full suite passes 524 tests, type checking, builds, packed ESM/CommonJS/TypeScript consumers, and 24 browser interpretation checks.

## Results and decision

Cycle `.local/research/2026-10-05T23-44-16-577Z-e500d95b/` records the plan, corpus evaluation, timing, provisional-label comparison and keep decision. The active corpus and label bundle are unchanged. Only development inputs were inspected.

| Measurement | Before | After |
| --- | ---: | ---: |
| MLS → ATTOM source-listing agreement | 251,247/268,923 | 251,279/268,923 |
| Source-listing agreement percentage | 93.4271% | 93.4390% |
| Agent-labeled reading recall, either mode | 189/193 | 190/193 |
| Exact agent-set agreement, spelling off | 120/192 | 120/192 |
| Exact agent-set agreement, spelling on | 85/192 | 85/192 |
| Additional readings relative to agent labels, spelling off | 101 | 101 |
| Additional readings relative to agent labels, spelling on | 292 | 293 |

The extra spelling-mode reading is an existing street-name abbreviation rule applied to the newly recovered interpretation. It remains an additional reading relative to the frozen provisional labels. Neither mode loses an accepted labeled reading or an exact-set agreement. The five finalized manual reviews retain their earlier scores and remain separate evidence.

All five corpus scenarios have zero lost agreements. Generated bare-unit inputs gain 30 agreements; the other generated and property-line scenarios gain none. First-candidate changes are recorded separately, although the API exposes unranked candidates.

An independent comparison of every development delivery line, using the scorer's component normalization, finds changes on 53 inputs across 13 states. There are 77 added readings with spelling off and 159 with spelling on, zero removed readings, and zero newly empty outputs. The first reading changes on 51 inputs. All changed cases were inspected privately. The additions include keyword-bearing names, reordered feed fields, repeated suffixes, compound identifiers, and ambiguous directional endings. These additions are not 77 or 159 independently verified correct addresses. Existing downstream repair rules still generate alternatives, some of which need separate investigation.

The audit is saved under `.local/keyword-boundary-audit-20261005/`; raw examples remain private. Local timing on 16,808 inputs measured medians of 243.11 ms before and 236.26 ms after, a difference of −2.82%. No speed improvement is claimed from this single local comparison.

Decision: keep. The fix restores a source-grounded structural interpretation and preserves every previously emitted reading on the audited development inputs. It adds no new label judgments and does not open the public correctness gate. Exact-set agreement remains the same; the measured improvement is recall and cross-source agreement.

Current build SHA-256: `f3418503a712965391a39ba7d8fa2e52e2e85db8c589723f3234e65e5b1edc48`.

## Next experiment

The expanded fixtures exposed a separate preexisting problem. `12 Oak St 204 Floor 2` returns no candidates, while an ordinal floor ending follows a different path. A direct assertion requiring the bare unit plus explicit floor chain reproduces the failure on the frozen baseline and current build. Investigate numeric-prefix floor recognition and secondary-chain boundaries separately, with a new baseline, predeclared acceptance criteria and full regression comparison. Do not change floor-label normalization to make the provisional score rise.
