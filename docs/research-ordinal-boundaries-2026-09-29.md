# Ordinal street boundary experiment

September 29, 2026 local time. Evaluation began September 30 at 01:12 UTC. Decision: keep the parser change. The 95% correctness target remains unmeasured.

## Question and evidence

Can feed repair split an ordinary numbered street and then move part of that street into the house number?

Yes. The synthetic input `12 1st Avenue`, with spelling alternatives off, previously emitted three readings:

| House number | Street name | Suffix |
| --- | --- | --- |
| 12 | 1ST | AVE |
| 12 | 1 ST | AVE |
| 12 1 | ST | AVE |

Only the first reading preserves the observed ordinal and primary identifier. `3rd Street` had the same failure. An agreement check could pass because the correct reading was present, without detecting either extra reading.

USPS Publication 28 treats numeric street names as names and uses the ZIP+4 file to choose between numeric and spelled forms. Its suffix guidance also preserves street-name words before a separate suffix. Our parser has no ZIP+4 reference. These sources support preserving observed structure; they do not establish which spelling alternatives identify a real street. [USPS 235](https://pe.usps.com/text/pub28/28c2_016.htm), [USPS 234](https://pe.usps.com/text/pub28/28c2_015.htm).

## Predeclared experiment

The question, hypothesis, expected effect, change, and acceptance rule were written to `.local/research-plans/ordinal-boundaries-v1/experiment.json` before implementation. The completed run embeds that plan and its hash.

The hypothesis was that a canonical ordinal followed by a separate street suffix is an intact street-name token. A repaired numeric street fragment must not be partially moved into the primary number. Acceptance required exact-set synthetic checks, preserved identifiers and secondary chains, package and browser checks, and inspection of every lost development agreement. This cycle did not evaluate holdout records or change corpus admission.

Two changes implement that hypothesis:

- [Feed repair](../src/feed-format.ts) preserves canonical ordinals such as `1st Avenue` and `3rd Street` when a separate suffix follows. It still permits the literal and split readings of `21ST` without a separate suffix.
- [Delivery parsing](../src/delivery.ts) requires an observed token boundary before constructing a compound house number. A numeric fragment split from `42AVE` cannot become part of the house number. An actually separated input such as `12 42 Oak St` retains its ambiguity.

The [regression fixtures](../test/ordinal-boundaries.test.ts) cover ordinal endings, directionals, building/floor/apartment chains, full locality, joined numeric streets, separated compound primary identifiers, and ordinal unit identifiers. Twelve of the sixteen new tests failed before the fix. All sixteen pass afterward. The complete check passes 486 tests, strict TypeScript checking, package builds, and packed ESM/CommonJS and TypeScript consumers. The generated explorer passes 24 exact interpretation checks in Chromium, including source evidence and offline behavior. The explicit three-part secondary fixture also preserves its full chain in both spelling modes.

## Fixed development comparison

Run: `2026-09-30T01-12-38-020Z-005ff4af`.

The active corpus still contains 336,057 admitted records. This comparison uses its 268,923 development records. Results compare against the frozen September 28 parser, with spelling alternatives enabled for both builds.

| Measurement on source listings | Frozen baseline | Current |
| --- | ---: | ---: |
| At least one field-agreeing candidate | 251,247 | 251,247 |
| MLS-to-ATTOM field agreement | 93.4271% | 93.4271% |
| Total candidates | 657,274 | 630,678 |
| Candidates per input | 2.4441 | 2.3452 |
| First candidate agrees with reference | 227,836 | 227,836 |
| Inputs with no candidates | 1,069 | 1,069 |

There are zero gained or lost agreements in each of the five evaluated scenarios: source property, source listing, generated explicit unit, generated bare unit, and generated full address. The regression journal contains no records. These are diagnostic comparisons, not independent correctness labels.

A separate complete component-set audit of the development listings found:

- 4,539 changed inputs across 48 states and DC.
- 26,599 removed readings and three added readings, for a net reduction of 26,596 candidates, or 4.05%.
- Zero changed first readings and zero inputs becoming empty.
- 7,772 removed readings whose compound primary identifier is absent from the retained set.
- 3,669 removed readings whose secondary/locality combination is absent from the retained set. All involve inferred bare-secondary variants, including a street suffix incorrectly absorbed into the unit. They do not establish loss of an explicit building/floor/unit chain.

All removed readings carry the joined-component repair assumption. The three added readings occur on one input where an existing rule splits a joined `GARDEN` suffix and identifier. Keeping the ordinal intact changes how that independent repair composes with the street. The original literal and unit readings remain. This case still needs an exhaustive reviewed annotation; we do not count its alternatives as confirmed errors or confirmed corrections.

Private per-input differences and the reproducible audit script stay in `.local/research-plans/ordinal-boundaries-v1/`. Aggregate structural differences are evidence about this code change, not 26,599 independently adjudicated mistakes.

## Timing and decision

The planned eight-round benchmark measured a median of 311.83 ms for the baseline and 333.45 ms for the current build on 16,808 development inputs, a 6.93% increase. Variation between trials was large. A follow-up using the same builds and sample over 24 alternating rounds measured 304.21 ms and 291.06 ms, a 4.32% decrease. Both artifacts are retained. The contradictory direction makes a speed claim unjustified; candidate reduction is established, runtime change is inconclusive.

Keep the fix because the reproduced structural errors disappear, the complete-set fixtures pass, and the fixed development comparison loses no observed agreement. Keep the original corpus and unresolved annotation status. The immutable decision sidecar binds to the completed run evidence and appears in the research notebook.

This experiment improves a tested behavior while leaving the headline agreement unchanged. The next correctness work still requires reviewed component annotations, explicit treatment of optional spelling hypotheses, and a calibrated evaluation. The existing model-label pilot supplies provisional token roles, not that release evidence. See the [scoring contract](benchmark-contract-v1.md).

## Reproducibility

| Artifact | SHA-256 |
| --- | --- |
| Active corpus | `d4bfa27a475c3a6d61d198369335ed1ebb8a4262f515335f1b400ec561f662c6` |
| Admission policy | `928846fb004f041797f57ec2a2c02608f8f2f5c9b59fa6919f62785e48bf6acc` |
| Experiment plan embedded in run | `9bd75935632d464de530b7e6071ad5801678a2581db0c2553e4968c1a951f5ce` |
| Evaluated source and tests | `005ff4af32b7252e3cbb4e2bc5069dfd5aeb35beac89bd56f030272eab715bac` |
| Frozen baseline package build | `876cd9563f59309ba01dcf83da086f5f1bd0a82b70a6a33cff6d453075c685ae` |
| Current package build | `6ac36a3f2d1fcb75bd0b5f6cd5e33e5083aabc468e240d289a0e537a6cf9cf84` |

Run evidence lives under `.local/research/2026-09-30T01-12-38-020Z-005ff4af/`. The follow-up timing, before-fix test failure log, and component audit live under `.local/research-plans/ordinal-boundaries-v1/`. None of those private address artifacts is bundled in the public report.
