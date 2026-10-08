# From a working dashboard to a public research lab

This is a methodology and information-architecture proposal. It does not change the parser, corpus, labels, benchmark results, or public deployment. The companion [evidence review](research-lab-evidence-2026-09-29.md) records primary sources.

## Assessment

The project has a useful foundation for exploratory research: frozen corpus and policy hashes, versioned run evidence, regression checks, source spans, explicit interpretation candidates, blinded annotation passes, and visible unresolved cases. It does not yet have a validated parser-correctness benchmark. The correctness gate explicitly remains closed in `scripts/research-objective.mjs`.

The recent redesign improved usability but organized the page around our work. Its tabs mix processes, a geographic dimension, and documentation. A public visitor still needs to work out what the product does, what has been demonstrated, and why it is useful. Renaming the existing agreement chart to a benchmark would not close that gap.

The initial public audience should be engineers and data teams evaluating address parsing, especially property and MLS ingestion. The future reference-backed matching service needs its own results when it exists. The parser's present promise is faithful interpretation of supplied text, with retained evidence and explicit ambiguity. It cannot establish address existence or deliverability on its own.

## What today's numbers establish

| Evidence | Current result | Supported interpretation |
| --- | --- | --- |
| Curated corpus | 336,057 admitted from 400,000 downloaded records | Size of this selected MLS population |
| Development diagnostic | 93.427% MLS → ATTOM agreement | At least one candidate agrees with the comparison fields |
| Two-pass annotation pilot | 158 of 200 agree, 42 disagree | Labeler consistency on a coverage-selected development pilot |
| Completed pilot output | 192 provisional, eight unresolved or unsupported | Annotation progress, not 96% parser accuracy |
| Blind audit | 17 consensus cases independently agreed with the separate model reviewer | Limited corroboration; no established label-error rate |
| Parser correctness | Unmeasured | No accepted correctness scorer and evaluation labels yet |

The pilot labels are bound to exact input hashes. Neither model consensus nor stronger-model adjudication establishes truth by itself. A small expert-reviewed calibration sample should test the annotation rules and estimate label quality before automated labels support public accuracy claims. Keep automated labeling for scale, including blind review of agreements as well as disagreements.

## Methodological work before a correctness claim

1. **Freeze the output contract.** Distinguish text-supported structure, normalization, and speculative repair or search aliases. The current API emits unranked candidates. An arbitrary first candidate is not a best prediction. A correct reading surrounded by unsupported guesses must not receive full correctness credit.
2. **Complete the scoring contract.** On records with exhaustive adjudicated readings, score exact interpretation-set agreement and complete building/floor/unit chains. Also report accepted-reading recall, unsupported candidate counts, rejection of supported inputs, candidate counts, and timing. Do not penalize every unlisted candidate when the label set is incomplete.
3. **Validate annotation quality.** Freeze instructions after calibration, record model/reviewer versions, sample consensus decisions for independent review, and preserve disagreement and unresolved rates. Re-review affected cases when the policy changes. A single model supplies both Luna passes, so shared errors remain possible.
4. **Declare the population.** Current admission requires compatibility with ATTOM components. That selection is independent of parser output but still reference-dependent. Weighting can estimate the admitted corpus population; it cannot restore excluded address types. State presence does not establish nationwide representativeness or coverage of every US address format.
5. **Protect release evaluation.** Use development evidence to make changes. Record and limit access to release labels, check property/address clusters across splits, and predeclare the acceptance rule and uncertainty calculation. Historical holdout aggregates have already been observed; disclose that history. No existing subset should be relabeled as a pristine unseen test.
6. **Run comparable baselines.** Compare pinned library releases and suitable parser baselines on identical inputs, with explicit field mappings and supported scope. libpostal's `road` field and this library's separate street/suffix fields are different contracts. Publish common-task results separately from capabilities other libraries do not expose. Do not copy a competitor's published accuracy into a comparison table as if it used this corpus.
7. **Record experiments as decisions.** Each cycle needs a question, hypothesis, anticipated affected cases, code change, fixed evaluation definition, observed gains and losses, and a keep/reject decision with its reason. Preserve null results and failed hypotheses. The present cycle script runs evaluation and records evidence; it does not by itself supply this full scientific decision loop.

The corpus can remain one active, frozen corpus throughout this work. Annotation sidecars, sampling plans, and named diagnostic slices are not new competing corpora. If the population is broadened later, create an explicit new corpus version and keep old results attached to their original denominator. Do not change the frozen admission policy to improve a score.

Unknown labels, unsupported valid forms, and malformed inputs need different treatment. Keep the eight unresolved/unsupported pilot records visible. Report labeling coverage alongside any score on adjudicable records. If malformed input is evaluated for rejection behavior, report that robustness task separately from valid-address correctness.

These recommendations follow established evaluation principles: common evaluation conditions and multiple metrics in [HELM](https://crfm.stanford.edu/2022/11/17/helm.html), capability-oriented behavioral tests in [CheckList](https://aclanthology.org/2020.acl-main.442/), and documentation of dataset composition and intended use in [Datasheets for Datasets](https://arxiv.org/abs/1803.09010). They are proposed project rules, not certifications conferred by those sources.

## Public information architecture

| Section | Visitor question | Content |
| --- | --- | --- |
| Overview | What does this solve, and what is proven? | Product scope, concrete address problems, current evidence status, supported use cases, links to results and integration |
| Benchmarks | How well does it work, against what, and where does it fail? | Versioned evaluations, comparable baselines, denominators, uncertainty, secondary-chain results, error cases, latency and candidate cost |
| Research | What did you learn and improve? | Questions, experiments, before/after evidence, rejected approaches, release-linked findings |
| Data & methods | Why should I trust the measurements? | One corpus's composition, admission and sampling, label provenance and quality, adjudication, splits, known bias, metric definitions, reproducibility |
| Try the parser | Does it handle examples relevant to my application? | Actual library output, source spans, full secondary chains, ambiguity, a few curated challenge examples, and an SDK integration path |

Keep documentation and installation links available across the site. Geography belongs inside benchmark and corpus views, alongside address form, unit complexity, source format, and cohort. Labeling belongs under data quality publicly; its jobs and review queue can remain a dedicated internal workspace.

The working lab and public report should read the same versioned evidence. The private lab can expose unfinished runs, record-level review, operational controls, and model jobs. The public presentation should expose released findings and explicit experimental status. This is a presentation boundary, not a second corpus or a second implementation of the metrics.

A public benchmark page can honestly display "correctness evaluation in preparation" today. Existing MLS → ATTOM results should remain clearly labeled diagnostics. A 95% target must not resemble an achieved score.

## Show value through inspectable cases

A prospective user should be able to follow a small chain of evidence:

1. A messy input illustrates a costly integration problem.
2. The actual parser output exposes the relevant fields and uncertainty.
3. A reviewed interpretation explains what is supported by the text.
4. A benchmark slice shows how often that capability works and fails.
5. A version comparison shows the improvement and its tradeoffs.
6. A short SDK example makes the behavior usable.

For example, a clearly identified synthetic input such as `12 Oak St Bldg A Apt 204` can demonstrate retaining the building as well as the unit. It does not establish that this address exists. A hyphenated primary number can demonstrate evidence preservation. An ambiguous trailing identifier can demonstrate why the library returns alternatives. Include limitations and failures as well as successes.

Claim the behavior we can demonstrate: original evidence retained, complete chains represented, ambiguity made explicit, local parsing, and documented APIs. Measure downstream benefits before claiming fewer false property merges, less manual review, or savings. A parser benchmark cannot establish the quality of the future matching service.

Public fixtures should be synthetic or carry suitable redistribution rights, with their provenance visible. Keep private MLS rows out of the public build. An inspectable fixture suite and reproducible scorer can be public even when the main corpus cannot be redistributed; describe that reproducibility limit plainly.

## Proposed evidence model

Store explicit relationships instead of treating every JSON run as a comparable chart point:

- Corpus version → declared population, source/admission policy, hashes, splits.
- Annotation version → exact-input references, guide, reviewers, audit results, unresolved cases.
- Benchmark definition → corpus/split, annotation version, output contract, metric and normalization versions.
- Evaluation run → benchmark definition, parser/build, options, baseline, environment, counts and results.
- Experiment → hypothesis, change, linked evaluations, decision and interpretation.
- Release report → parser version, approved evaluations, supported claims and known limits.

Connect trend points only when their benchmark definitions are comparable. Changes to sampling, labels, scoring, parser options, or normalization need visible version boundaries. The report already checks corpus identity; a trustworthy correctness history will need the other identities as well.

## Next implementation order

First define and validate the correctness benchmark contract and label-quality review. Then implement the scorer and a benchmark-results model with explicit evidence status. Reorganize the public report around that model, add a real parser explorer with suitable examples, and turn selected experiments into concise research findings. Keep the current operational dashboard useful while these pieces are built.

Before public launch, test the proposed report with a few engineers from the intended audience. Ask them to explain the parser's scope, what each headline number measures, its important limitations, and how they would integrate it. Observe whether they can find evidence for a difficult address form without coaching. This tests whether the report communicates value; the current visual redesign alone cannot establish that it does.
