# Parser design and measurement follow-up

This change separates structural parsing from optional spelling expansion. It keeps the existing default interpretations and adds a way to request fewer spelling hypotheses. It adds no spelling rules and makes no ranking or preferred-address claim.

## Interface and implementation

Both `interpretAddress` and `interpretFullAddress` accept an optional `AddressInterpretationOptions` argument. `spellingAlternatives` defaults to `true`. Setting it to `false` skips street/route spelling aliases and secondary identifier punctuation/spacing aliases. It retains suffix/directional normalization, structural ambiguities, feed repairs, opaque identifiers, and building/unit chain interpretations. Invalid runtime options return `invalid-input`.

Resolver factories retain the default set of interpretations. A reduced set is useful for parsing callers, but it cannot establish a unique real-world address.

`spelling.ts` owns street and route spelling expansion. It caches derived strings within one interpretation, including reuse across full-address locality splits. It retains no user-address cache across calls. `secondary-format.ts` owns secondary identifier alternatives and building/unit interpretations. Structural feed repairs remain in `feed-format.ts`.

`candidate-set.ts` deduplicates candidates as they arrive, retains structural-first ordering and the first provenance, and stops generation when the unique candidate count exceeds 256. It returns the existing `too-many-candidates` diagnostic with no partial set. It does not silently truncate ambiguity. Some duplicate internal derivations remain; removing them safely would require preserving their effects on later transformations and provenance.

## Measurement

MLS field agreement remains the primary benchmark. Its comparator and admitted population are unchanged. The evaluator now also records:

- First-candidate agreement, with the same record denominator as any-candidate agreement.
- Cases that agree only through a later candidate.
- Agreeing and disagreeing candidate counts, plus single-candidate successes.
- Parser rejections and cases with multiple interpretations.
- First-candidate gains and losses against the comparison build.

These are annotation-agreement measurements. The first candidate is unranked. A candidate that disagrees with MLS is not necessarily an invalid address, and multiple candidates can agree with the same scalar MLS fields while differing in their building chains. The new counts do not measure precision or reference-backed identity.

The legacy `invalid` tally is retained for report compatibility and means no parser candidates. New reports call it `noCandidates`. These cases stay in the admitted denominator. Exclusions happen before parsing and remain governed by the frozen admission policy.

Each research cycle also saves an independent timing comparison. It uses every sixteenth development row, two full-sample warmups per parser, and eight trials in alternating forward/reverse order. Input preparation is outside the timed region. It records baseline, current default, and current spelling-disabled mode. Timings are local observations, not an acceptance gate or production latency guarantee.

The dashboard adds a reading-quality comparison to each selected experiment. The same counts are available for state and cohort selections. Earlier runs show missing measurements explicitly. The national timing sample is labeled separately from the selected state or cohort.

## Admission audit

A deterministic diagnostic sample selected four development exclusions per reason before inspection, yielding 43 distinct records across 11 reasons. The review used source strings and annotations, without parser output or holdout examples. The private evidence is `.local/design-admission-audit-sample.json`.

Thirty-nine sampled exclusions had visible missing text/reference fields, placeholders or lot descriptions, absent expected components, or conflicting identifiers. Two had unresolved street-name spelling differences. Two route-name cases looked plausibly equivalent despite admission rejection. In one, state-route canonicalization removes a highway word from the input but retains it in the reference spelling. That is a concrete admission weakness to address in a separately versioned corpus review.

This small sample does not estimate the overall exclusion error rate. It supports keeping the corpus description precise: an admitted, source-consistent benchmark with heuristic admission, not a complete inventory of valid US addresses. This change leaves corpus bytes, split membership, and admission-policy bytes frozen. It does not certify delivery or silently change the reported denominator.

## Compatibility evidence

The delegated parser review compared complete default outputs against the frozen pre-refactor build on all 268,923 development listing inputs. Zero outputs changed, including candidate ordering, IDs, assumptions, spans, tokens, and diagnostics. Its evidence is `.local/parser-design-equivalence.json`. The subsequent options validation change applies only to invalid new option arguments.

The public contract tests cover both modes, normalization and ambiguity, full-address propagation, building/unit chain spans, independent successive calls, runtime option validation, and candidate-budget exhaustion. Packed ESM/CommonJS and TypeScript consumers exercise the new interface.

The final gate passed 417 tests, type checking, builds, and packed consumers on Node.js 24.21.0. The full development comparison found zero gains or losses in any-candidate and first-candidate agreement across all five scenarios. All pre-existing aggregate counters, including candidate counts and missing-field counts, match the previous accepted evaluation in every group. State sums also reconcile for the new quality counts.

| Default-mode measurement | Before | After |
| --- | ---: | ---: |
| MLS listing agreement | 251,098 / 268,923, 93.372% | unchanged |
| First-candidate agreement | 227,836 / 268,923, 84.722% | unchanged |
| Agreements requiring a later candidate | 23,262 | unchanged |
| Total candidates | 644,424 | unchanged |
| Inputs with multiple candidates | 145,203, 53.994% | unchanged |
| Parser rejections | 1,069 | unchanged |
| Median sample parsing time | 406.3 ms | 357.7 ms |

The timing comparison used 16,808 development inputs. Default parsing took 11.96% less time in this local run. Disabling spelling expansion took 293.8 ms in the same run, with different output semantics. These are paired observations within one benchmark, not a comparison with timings from earlier sessions.

The immutable run is `.local/research/2026-09-29T00-36-56-568Z-706c358e`. The frozen build is `.local/parser-design-final-20260928/index.mjs`, SHA-256 `4d348d960ecb406b0d93763f4553a61248930e27a09b8c8ed3fca0b18cf9235e`. `.local/parser-design-verification.json` records the aggregate reconciliation. Holdout was not used for this redesign or re-evaluated; the dashboard retains the earlier holdout evidence with its original date and build.

## Optional spelling mode

On the same 268,923 development listings, disabling spelling alternatives agrees on 244,418 records, 90.888%, versus 93.372% by default. It returns 399,651 candidates, 1.486 per input, versus 644,424 by default. This is 37.98% fewer candidates and 6,680 fewer agreeing records. First-candidate agreement remains 227,836 / 268,923.

This tradeoff is explicit and opt-in. Both modes retain structural ambiguity. The complete five-scenario aggregates are saved in `.local/corpus/parser-design-without-spelling.json`, with `parserOptions.current.spellingAlternatives` set to `false`. This measurement uses the same active corpus and creates no second corpus.
