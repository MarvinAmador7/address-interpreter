# Automated development evaluation, version 1

Manual labeling is optional for continuing parser development. This path uses the completed blind Luna pilot and its agent adjudication as provisional comparison labels. It does not certify the labels, claim population correctness, or open the 95% release gate.

## Frozen inputs and annotation projection

Use all 200 exact delivery-line inputs from the existing pilot within the one active corpus. Preserve the original pilot, manual review journal, corpus admission and splits. Verify corpus and policy hashes, pilot input membership in the development split, token evidence, labeling-guide hash, and the final annotation receipt before creating an immutable component-label bundle. Do not read parser output while projecting labels.

The projection carries the original status and completeness judgment forward as provisional agent judgments. Unresolved, unsupported and non-address cases remain present with no exhaustive accepted set. Supported street readings retain every assigned field and ordered secondary element. Source spans must reproduce the original token evidence. Reconstruct adjacent tokens without inventing spaces; collapse observed inter-token whitespace to one space. Preserve hyphens, fractions, leading zeros, letter suffixes, apostrophes and identifier punctuation.

Uppercase component text. Normalize only explicitly assigned street suffixes using the pinned USPS suffix reference, directionals using the eight fixed cardinal/intercardinal abbreviations, and secondary designators using the fixed projection dictionary. Keep street-name words, identifiers, and unknown secondary designators literal. Record unrecognized designators for later review. Do not generate spelling alternatives, infer missing fields, split identifiers, or choose a reading based on parser agreement.

Do not automatically convert mailing delivery kinds or locality/country values that the projection cannot represent faithfully. Keep the input visible as unresolved with a projection-review reason. Malformed evidence, changed inputs, duplicates or missing labels abort preparation rather than being removed from the denominator. Semantically duplicate projected readings also require review; the projection does not silently change an ambiguous label into a single-reading label.

The bundle includes source annotation provenance, projection warnings, original materialized token evidence, fixed sample order, annotation version and hashes. This is an explicit automated projection, not a reviewed human conversion. Both model passes used Luna and may share mistakes. The declared exhaustive sets may themselves be incomplete.

## Evaluation and research decisions

Evaluate the whole output set in both spelling modes, with a separate definition identity for each. Report exact-set agreement with agent labels, labeled-reading recall, additional readings relative to the provisional set, complete secondary-chain agreement, no-output cases, candidate counts and label coverage. The same scorer used for human review checks the structures, but these are model-label agreement measurements. They are not a national accuracy estimate or an alternative interpretation of the 93.43% MLS-to-ATTOM diagnostic.

Compare a frozen baseline and current parser against identical sample and annotation hashes. Save all per-input gains and losses privately. An improved percentage is a lead for investigation, not an automatic keep decision. For a code change, reproduce the structural failure with source-grounded fixtures, declare the hypothesis and acceptance rule, inspect lost readings, run the large development diagnostic and package/browser checks, then record the decision. Synthetic behavior tests and already completed human reviews provide separate checks.

Model-only results always remain experimental and release-ineligible, including if agreement exceeds 95%. Independent validation and an appropriate sampling/uncertainty design remain necessary for a public correctness claim. The manual interface remains available without blocking automated experiments.

## Commands

```sh
# One-time immutable projection of the existing labels. No model calls.
npm run research:prepare-agent-benchmark

# Evaluate both parser modes and compare against a frozen build.
npm run research:score-agent -- --baseline .local/parser-research-95-20260928/index.mjs

# Subsequent large-corpus research cycles can include this diagnostic.
npm run research -- --baseline .local/parser-research-95-20260928/index.mjs --agent-benchmark .local/correctness-review/agent-components-v1/bundle.json
```

Preparation refuses to overwrite an existing bundle. Evaluation creates a new directory with aggregate results and private per-case differences. This workflow reuses completed model work; it does not start a persistent labeling agent or spend tokens on new labeling jobs.
