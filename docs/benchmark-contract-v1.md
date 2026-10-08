# Interpretation-set benchmark contract

Implementation: [`scripts/benchmark-contract.mjs`](../scripts/benchmark-contract.mjs).
This is a scoring contract and an executable research interface. It does not certify the existing model labels or report a population accuracy result.

## Definitions and identity

`benchmarkDefinition` requires corpus, admission-policy, sample, annotation, guide, and evaluator SHA-256 identities; a declared population and split; annotation status; explicit parser options; and supported output, normalization, and metric versions. Its ID is a SHA-256 of the definition with recursively sorted object keys. Array order is preserved.

An evaluation binds that definition to a parser-build hash, recording time, Node/runtime information, elapsed batch time, and aggregate results. `evaluateBenchmark` checks the sample and annotation hashes, exact case membership, unique IDs, input hashes, the declared split, and the executing scorer hash. Missing annotations must appear as unresolved labels. They cannot disappear from the batch. The corpus and guide hashes identify external provenance; this in-memory API does not verify the sample's membership in an on-disk corpus or independently audit the guide. The caller must validate that lineage when freezing a sample.

`artifactHash` hashes canonical JSON for sample and annotation arrays. It is not a raw JSONL file hash. `inputHash` binds the entire exact input object, including any supplied locality fields. Whitespace and case in the input change its identity. Artifact arrays must retain their frozen order.

`evidenceStatus` is `synthetic-conformance` for synthetic annotations and `experimental` otherwise. `releaseEligible` remains false, including for annotations described as calibrated. A scorer cannot approve its own labels, sampling, or public claims. The research correctness gate stays closed.

## Output and normalization

`complete-interpretation-set-v1` evaluates every unranked parser candidate using its components. Candidate IDs, candidate order, source spans, and assumption descriptions do not change semantic equivalence. Source-span correctness is still covered by invariants and requires separate annotation-aware evaluation before claiming an empirical span-accuracy result.

`case-whitespace-v1` trims field boundaries, collapses whitespace runs, and uppercases field values. Missing and undefined optional fields are equivalent. Empty strings, nulls, unknown fields, and inconsistent final-secondary/chain values fail validation. There are no suffix, directional, spelling, punctuation, or designator aliases in this normalizer. Annotators must supply the intended canonical output. `UNIT` and `APT` remain distinct; `12-14` and `1214` remain distinct. The normalizer never runs the parser to generate expectations.

Omitted street kind is equivalent to `kind: "street"`. A single `secondary` and a one-element `secondaryUnits` array are equivalent. Multi-element chains preserve every component and its order. When both representations are present, `secondary` must equal the last chain element. Mailing forms retain their explicit kind and required route/box fields.

All emitted interpretations participate, including spelling alternatives and feed repairs. `spellingAlternatives: false` does not establish that each candidate is text-supported. The current API has no separate scored channel for speculative repairs. Such a channel needs a new output contract before it can be omitted from exact-set scoring.

## Metrics and denominators

| Metric | Definition |
| --- | --- |
| Exact interpretation set | Fraction of exhaustively labeled supported inputs whose unique output readings equal the full accepted set |
| Accepted-reading recall | Matched accepted readings / all accepted readings, including known readings in incomplete label sets |
| Supported-reading precision | Matched readings / unique emitted readings on exhaustive supported inputs only |
| Unsupported readings | Extra unique readings on exhaustive supported inputs only |
| Complete secondary chain | Exact set of ordered secondary chains on exhaustive inputs with at least one labeled secondary chain |
| No candidate on supported input | Supported inputs rejected / supported labeled inputs |
| Labeling coverage | Exhaustively labeled supported inputs / every sampled input |
| Non-address rejection | Rejected non-address examples / labeled non-address examples, reported separately |
| Candidate cost | Total emitted candidates and duplicate semantic readings, including all sampled inputs |

Every ratio exposes numerator, denominator, and rate. An empty denominator yields null. Rates are fractions from zero to one. Precision has a null denominator when no readings are emitted, while exact-set correctness and no-candidate metrics still penalize rejection of valid supported inputs.

Chain correctness isolates chain extraction; a wrong primary can still have the right chain. Exact interpretation-set correctness checks both. Duplicate semantic readings do not change set correctness, but increase emitted-candidate cost. The scorer does not choose the first candidate as a prediction.

Unresolved and unsupported forms remain visible in coverage and status counts. Their unknown truth is not silently classified as either parser success or parser failure. Incomplete label sets support accepted-reading recall but cannot establish exact correctness or false positives. Non-address examples measure rejection behavior and do not enter valid-address correctness.

The pilot used coverage selection. This contract does not invent confidence intervals from its counts. Population intervals require a declared sampling design and treatment of property/address clusters. `elapsedMs` includes scorer work and is not parser throughput; use the separate repeated timing harness for performance comparisons.

## Annotation sidecars

A sample entry is `{ caseId, split, input }`. A component annotation is:

```json
{
  "caseId": "synthetic-chain",
  "inputHash": "<SHA-256 from inputHash(input)>",
  "status": "address",
  "exhaustive": true,
  "readings": [{
    "houseNumber": "12",
    "streetName": "OAK",
    "streetSuffix": "ST",
    "secondaryUnits": [
      { "designator": "BLDG", "number": "A" },
      { "designator": "APT", "number": "204" }
    ]
  }]
}
```

Supported statuses are `address`, `ambiguous`, `unresolved`, `unsupported`, and `non_address`. Exhaustive ambiguous annotations require multiple accepted readings. Non-supported statuses have empty readings and `exhaustive: false`.

The existing `address-token-roles-v1` pilot is a different artifact. Do not cast its source-token labels into this component schema or call them gold. A reviewed conversion must resolve delivery kinds, canonical abbreviations, token joins, locality context, completeness, and every secondary component. Preserve the original token evidence and publish a new annotation version when that conversion is accepted.

## Label-quality review still required

Before a correctness release, freeze a calibration plan covering ordinary examples, secondary-chain complexity, ambiguous inputs, mailing forms in scope, and unresolved cases. A domain expert should label exact source text without parser output or ATTOM fields, review a blind sample of model agreements as well as disagreements, and record rationale and uncertain readings. Use the sample to revise the guide, then re-review affected labels under a new version. Both Luna passes use the same model and may share errors.

Freeze the acceptance rule, label audit, population estimator, cluster handling, and release access history before evaluating a release. Existing holdout aggregates have been viewed. They cannot be described as pristine unseen evidence. No new holdout evaluation was performed for this implementation.

## Using the scorer

Import `inputHash`, `artifactHash`, `EVALUATOR_HASH`, and `evaluateBenchmark`. Freeze the sample and annotations, compute their artifact hashes, supply a definition using the exported contract constants, and pass the actual parser function plus its build hash:

```js
const result = evaluateBenchmark({
  definition, sample, annotations,
  interpret: interpretAddress,
  parserHash: sha256OfEvaluatedBuild,
});
```

[`test/benchmark-contract.test.mjs`](../test/benchmark-contract.test.mjs) includes an end-to-end synthetic example with the actual parser and adversarial scorer fixtures. These establish scorer behavior, not an MLS or national accuracy estimate.
