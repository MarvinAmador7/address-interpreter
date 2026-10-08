# Evidence for a public address research lab

Reviewed September 29, 2026. This is a methodological assessment, not a new parser evaluation. It uses the [correctness review](correctness-review-2026-09-29.md), [labeling pilot](labeling-pilot-2026-09-29.md), and [admission policy](../scripts/corpus-policy.mjs). No individual addresses were looked up, no private records were published, and no parser or benchmark code was changed.

## Judgment

The project has a credible exploratory research process. Freezing the corpus, retaining failed runs, hiding predictions during initial annotation, preserving unresolved cases, and withdrawing the misleading correctness claim are substantive strengths. It does not yet have a validated correctness benchmark. A public lab can show what the team has learned and how it tests changes today. It cannot yet demonstrate 95% parser correctness, national accuracy, superiority to existing parsers, or successful address matching.

The current evidence is specific. There are 336,057 admitted MLS inputs, split into 268,923 development and 67,134 holdout records. The 93.427% development result measures MLS-to-ATTOM field agreement. Two Luna passes agreed on 158 of 200 pilot cases. Adjudication provisionally accepted 192, leaving eight unresolved or unsupported. Human-reviewed labels remain zero, and a correctness scorer is not installed. Those are different measurements with different denominators. [Correctness review](correctness-review-2026-09-29.md), [pilot results](labeling-pilot-2026-09-29.md).

## What six primary sources contribute

| Source | Evidence relevant to this project |
| --- | --- |
| [HELM, Stanford CRFM](https://crfm.stanford.edu/2022/11/17/helm.html) | Evaluates common scenarios with multiple metrics and explicitly identifies missing coverage. Its public results connect aggregate measurements to underlying runs. This is a useful communication example, not an address benchmark to copy wholesale. |
| [CheckList, Ribeiro et al., ACL 2020](https://aclanthology.org/2020.acl-main.442/) | Behavioral tests uncovered failures beyond ordinary held-out accuracy. This supports investigating address capabilities and failure patterns alongside geographic summaries. |
| [Datasheets for Datasets, Gebru et al.](https://arxiv.org/html/1803.09010v8) | Asks creators to document the sampled population, representativeness, collection, labels, preprocessing, splits, noise, intended uses, and restrictions. A large count and broad geographic coverage do not answer these questions. |
| [libpostal, maintained repository](https://github.com/openvenues/libpostal#examples-of-parsing) | Reports 99.45% full-parse accuracy on its own held-out data. Its training pipeline constructs strings from geographic sources and generates subunits and perturbations. Its result is not directly comparable to this MLS diagnostic. |
| [usaddress, DataMade repository](https://github.com/datamade/usaddress) | Provides probabilistic US address parsing and explicitly distinguishes it from validation. It is a relevant baseline with a different output contract. |
| [USPS DPV](https://postalpro.usps.com/address-quality/dpv) | Checks whether a ZIP+4-coded address is a known USPS delivery record, including distinctions between verified primary and secondary information. DPV does not fill missing fields or correct components. Parsing alone supplies none of this reference evidence. |

The recommendations below are our application of these sources to the repository. The sources do not certify this dataset, these labels, or the proposed scoring rule.

## Where the methodology needs work

### Admission defines the population

The policy avoids reading parser output, which prevents direct admission based on current parser success. It still requires compatibility with ATTOM fields, including excluding some explicit units absent from the reference. That can remove exactly the cases where preserving MLS text matters most. Reference-dependent selection and parser-independent selection can both be true. [Admission policy](../scripts/corpus-policy.mjs).

Keep the corpus frozen and describe it as an admitted MLS cohort. Weighting the review sample can estimate that cohort's performance; it cannot recover excluded records or make the cohort nationally representative. The 63,943 historical exclusions are not proven invalid addresses. A later exclusion audit would assess this selection effect separately without silently changing the active denominator. This follows the population and preprocessing questions in [Datasheets](https://arxiv.org/html/1803.09010v8).

### Reproducibility and independence are separate requirements

Hashes, deterministic seeds, immutable journals, and pinned builds make a run traceable. They do not stop repeated evaluation from influencing parser development. The existing holdout's aggregate results have already been observed. Audit exact duplicates and shared property/address clusters across splits, document previous holdout use, and freeze the parser, annotation rules, scorer, and decision rule before the next release evaluation. Protect the new correctness labels from tuning. This reduces further leakage but cannot erase historical exposure. Do not silently change split membership or call the existing holdout untouched. [Recorded evaluation history](correctness-review-2026-09-29.md).

### The pilot tests annotation feasibility

The 79% agreement rate describes two passes of the same model. Separate conversations and input orders reduce direct influence; they do not remove correlated mistakes. The parent-model adjudicator provides another judgment, not independently established truth. Structural validation proves that annotations follow a schema, not that the assigned roles are right.

The blind audit is valuable because it also inspects consensus cases. Its 17 consensus agreements are too few, and too dependent on automated judgment, to establish label accuracy. Review a probability sample of consensus cases as well as disagreements with qualified independent human reviewers. Blind their initial decisions, record policy ambiguities, adjudicate, and retain uncertainty. Humans also make mistakes, so document their agreement and adjudication rather than granting every human label automatic gold status. Keep all 200 pilot cases visible, including the eight unresolved or unsupported cases. [Pilot protocol and limitations](labeling-pilot-2026-09-29.md).

### Score the promised output

For an unranked set of text-supported interpretations, exact supported-set agreement is defensible only when reviewers can enumerate the acceptable set reliably. It must check complete structures, including building, floor, and unit, and penalize unsupported extra readings. A returned set containing one accepted reading and ten unsupported readings cannot be called fully correct.

Report supported-candidate precision, accepted-reading recall, no-candidate failures, and candidate count separately. If an annotation set is incomplete, an unlisted interpretation is unknown rather than automatically wrong. Decide whether spelling repairs and search aliases belong to the parser's correctness contract before scoring them. Otherwise exact-set scoring may punish useful retrieval hypotheses or reward annotation overconfidence. This is a project-specific recommendation based on the [documented candidate API and comparator weaknesses](correctness-review-2026-09-29.md).

A 95% release rule must specify its population, denominator, treatment of unresolved cases, and uncertainty requirement in advance. A 95% point estimate and a confidence-bound requirement above 95% are different targets. For sampled evaluations, account for the sampling design and property clustering; display reviewed counts and unresolved coverage with the estimate.

### Geography cannot stand in for behavioral coverage

All 50 states plus DC are represented. That establishes observed geography, not uniform robustness. Add challenge slices such as directional roles, numbered roads, hyphenated or fractional house identifiers, nested secondary units, bare units, duplicated suffixes, and unresolved text. These expose actionable failures in the spirit of [CheckList](https://aclanthology.org/2020.acl-main.442/).

Challenge slices can overlap and intentionally overrepresent rare cases. Show their denominators and do not average their percentages into population accuracy. Within a state, feed and challenge composition may explain a difference that a map would otherwise imply is geographic. Small reviewed samples should remain counts or explicitly uncertain estimates.

## What the public pages should prove

Experiments, Labeling, States, and Method are reasonable navigation. The scientific value comes from the evidence behind each page. [HELM](https://crfm.stanford.edu/2022/11/17/helm.html) is a useful precedent for exposing tradeoffs and incomplete coverage without collapsing them into one score.

| Page | A useful public question it can answer |
| --- | --- |
| Experiments | What hypothesis was tested, against which fixed baseline, and what improved or regressed? Show the parser and scorer versions, dataset/split, changed behavior, candidate cost, timing conditions, and failed or inconclusive outcomes. |
| Labeling | How much evidence is actually reviewed? Show pass agreement, blind-audit scope, reviewer type, provisional acceptance, unresolved counts, guide version, and zero human reviews until that changes. |
| States | Which parts of the admitted cohort are represented and reviewed? Distinguish corpus counts, label counts, cross-source agreement, and future correctness estimates. Give challenge slices at least equal analytic weight. |
| Method | What exact claim does each result support? Publish provenance, admission and sampling rules, weighting, duplicate checks, holdout history, annotation/scoring contracts, limitations, and reproducible commands. Link each result to its method version. |

Publish aggregate evidence and approved synthetic or openly licensed examples. Private MLS inputs need not appear in a public explorer. With a restricted corpus, public code and hashes permit inspection of methods but do not let outsiders independently reproduce the private numerical result. State that limitation directly.

The lab needs a same-input baseline comparison before claiming practical advantage over libpostal or usaddress. Pin model/package versions and the output adapter. Report a common component task alongside richer project-specific structure; do not count fields a baseline never promises as ordinary prediction errors. Use the same adjudicated inputs and timing environment. The broader `road` label in [libpostal](https://github.com/openvenues/libpostal#parser-labels) and the token/tag APIs in [usaddress](https://github.com/datamade/usaddress#how-to-use-the-usaddress-python-library) require an explicit mapping. No baseline was executed in this review.

## Keep the future matching service measurable on its own

A matching service must identify the correct reference entity, handle absent or ambiguous matches, and preserve distinctions between a property, building, and unit. Its evaluation should record reference source and snapshot, candidate retrieval recall, accepted-match precision, abstention coverage, wrong-property and wrong-unit matches, and operational cost. A useful parser can improve those outcomes; parser correctness alone does not establish them.

USPS DPV addresses a specific postal-reference question. A match to ATTOM or another property database does not establish USPS delivery-point status. Keep parsing, reference matching, and postal verification claims separate, and evaluate the complete future service before advertising its reliability. [USPS DPV](https://postalpro.usps.com/address-quality/dpv).

The next evidence worth investing in is independently checked labels, a frozen output contract and scorer, then a protected paired comparison with established parsers. The public lab is worth building around those results and their limitations. Run counts and a polished map alone will not demonstrate that the parser solves the customer's problem better.
