# Automated annotation expansion, version 1

Expand the existing development annotation sample to 1,000 inputs from the same frozen MLS corpus. Keep the original 200 inputs and their completed provisional labels. Select the additional 800 using the existing coverage-first sampler and seed within the frozen 2,000-input review queue. This is a discovery sample, not a national accuracy estimate. No holdout inputs or parser predictions participate in selection.

Two separate Luna workers label each new input under the unchanged token annotation guide. They receive only exact delivery lines and independent tokens. Each worker must inspect every input individually. Code may serialize explicit choices and validate evidence, but must not infer roles or generate labels with parsing rules. Preserve unresolved cases. Keep worker outputs in immutable batches of 20. Record actual model identity; unavailable billed usage and cost remain null.

A third Luna worker independently labels all disagreements, non-supported decisions, and a seeded ten percent audit of new inputs. Freeze this blind pass before exposing either proposal. The same reviewer then adjudicates with source evidence and short reasons. This is role separation within one model family, not independent model calibration. Consensus and adjudication remain provisional and release-ineligible.

Reused labels retain their historical provenance. New labels record the actual Luna adjudicator. Do not replace historical labels with new parser-informed judgments. Freeze input, output, guide, implementation and evidence hashes. Verify exact corpus membership and all expected case identities. Missing or invalid labels fail the run instead of reducing its denominator.

Separately audit 50 pilot cases with extra parser readings, selected by seeded state coverage from the frozen current evaluation. First freeze independent token labels, then inspect the emitted readings and historical labels. Classify each extra reading as supported, unsupported, or uncertain, with an error family and a short source-grounded reason. This audit is deliberately selected using parser disagreements. It diagnoses precision and label completeness and must not be reported as an unbiased accuracy estimate. It does not rewrite either frozen benchmark.

No parser change is accepted solely because agreement rises. Confirm the largest error family with source-grounded cases, declare an experiment, preserve justified ambiguity, and run the existing quality and corpus checks before recording a keep decision.
