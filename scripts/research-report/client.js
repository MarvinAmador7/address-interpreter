(() => {
  const data = JSON.parse(document.getElementById("research-data").textContent);
  const $ = (id) => document.getElementById(id);
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const count = (value) =>
    Number.isFinite(value)
      ? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : "—";
  const pct = (value) =>
    Number.isFinite(value) ? value.toFixed(2) + "%" : "—";
  const params = new URLSearchParams(location.hash.slice(1));
  const stateNames = data.states ?? {};
  const legacyViews = { experiments: "benchmarks", states: "benchmarks", labels: "method" };
  const requestedView = legacyViews[params.get("view")] ?? params.get("view");
  const state = {
    view: ["overview", "benchmarks", "research", "method", "try"].includes(requestedView) ? requestedView : "overview",
    dataset:
      params.get("dataset") || data.defaultDataset || data.datasets[0]?.id,
    scenario: params.get("scenario") || "source-listing",
    cohort: params.get("cohort") || "all",
    region: params.get("region") || "all",
    labelRegion: params.get("labelRegion") || "all",
    stateSort: params.get("stateSort") || "score",
    mode: params.get("mode") === "cost" ? "cost" : "iteration",
    holdout: params.get("holdout") !== "false",
    selected: params.get("selected"),
    auto: params.get("auto") === "true",
  };
  const colors = {
    development: "#315dd8",
    holdout: "#087f83",
    rejected: "#b84747",
  };
  const metricKey = () =>
    state.scenario +
    (state.region !== "all"
      ? "/state/" + state.region
      : state.cohort === "all"
        ? ""
        : "/cohort/" + state.cohort);
  const stats = (record, key = metricKey(), baseline = false) => {
    const t = (baseline ? record.baseline : record.scenarios)?.[key];
    return {
      ...t,
      score:
        t?.cases > 0 && Number.isFinite(t.matched)
          ? (t.matched / t.cases) * 100
          : null,
      mean:
        t?.cases > 0 && Number.isFinite(t.candidates)
          ? t.candidates / t.cases
          : null,
    };
  };
  const lost = (r) =>
    Object.values(r.transitions ?? {}).reduce(
      (n, t) => n + (t.regressed ?? 0),
      0,
    );
  const bad = (r) => r.status === "regression" ||
    (r.objective !== "parser-correctness-v1" && lost(r) > 0);
  const unscored = (r) => r.status === "failed" || r.status === "running";
  const color = (r) =>
    bad(r)
      ? colors.rejected
      : r.split === "holdout"
        ? colors.holdout
        : colors.development;
  const status = (r) =>
    r.status === "failed"
      ? "Evaluation stopped"
      : r.status === "running"
        ? "In progress"
        : r.status === "awaiting-correctness-labels"
          ? "Correctness labels needed"
          : r.status === "diagnostic-review-required"
            ? "Agreement loss needs review"
        : bad(r)
          ? "Historical agreement regression"
          : r.split === "holdout"
            ? "Holdout check"
            : r.kind === "baseline"
              ? "Starting baseline"
              : "No agreement loss";
  function saveState() {
    const p = new URLSearchParams(
      Object.entries(state).map(([k, v]) => [k, String(v ?? "")]),
    );
    history.replaceState(null, "", "#" + p);
  }
  function records() {
    return data.records.filter(
      (r) =>
        r.dataset === state.dataset && (state.holdout || r.split !== "holdout"),
    );
  }
  function showLatest() {
    const target = researchTarget(), p = data.labeling, e = data.labelingExpansion;
    const context = e ? e.final
      ? `${count(e.final.agentAccepted)} provisional labels · ${count(e.final.unresolved)} need review`
      : `${count(e.reused)} labels reused · ${count(e.passA + e.passB)} / ${count(e.newInputs * 2)} new pass labels`
      : p?.final
      ? `${count(p.final.agentAccepted)} provisional labels · ${count(p.final.unresolved)} need review`
      : p ? `${count(p.paired)} / ${count(p.prepared)} inputs labeled twice`
      : "Independent labels for the exact input are needed";
    $("latest").innerHTML = `<span class="objective-status"><i class="status-dot" aria-hidden="true"></i><strong>Correctness unmeasured</strong></span><span class="objective-target">${target}% target</span><span class="status-context">${context}</span>`;
    const latest = data.records.filter((r) => r.dataset === state.dataset && r.split === "holdout" && r.kind !== "baseline" && !unscored(r)).at(-1);
    $("historical-evidence").innerHTML = latest
      ? `<h3>Historical holdout evidence</h3><p>${pct(stats(latest, "source-listing").score)} MLS → ATTOM agreement across ${count(stats(latest, "source-listing").cases)} records. ${escape(latest.started?.slice(0, 10))} · ${escape(latest.label)}.</p><p>This comparison is separate from parser correctness. It does not use the provisional Luna labels.</p>`
      : '<p>No historical holdout measurement is available.</p>';
  }
  let plotted = [];
  function renderLabeling() {
    renderExpansion();
    const p = data.labeling;
    $("labeling-panel").hidden = !p;
    $("labeling-empty").hidden = Boolean(p);

    if (!p) return;
    const scope = $("label-region")?.value && $("label-region").value !== "all" ? p.states?.[$("label-region").value] : null;
    const n = scope?.prepared ?? p.prepared;
    const paired = scope?.paired ?? p.paired, agreed = scope?.agreements ?? p.agreements, disagreed = scope?.disagreements ?? p.disagreements;
    const label = scope ? stateNames[$("label-region").value] : "All states + DC";
    const passA = scope?.passA ?? p.workers.a.valid, passB = scope?.passB ?? p.workers.b.valid;
    const completed = p.phase === "pilot-complete-provisional", pairedAll = p.paired === p.prepared;
    const stage = (title, value, done) => `<li><span class="stage-symbol ${done ? "" : "pending"}" aria-hidden="true">${done ? "✓" : "·"}</span><span><strong>${title}</strong><small>${value}</small></span></li>`;
    const width = (value) => n > 0 ? Math.max(0, Math.min(100, value / n * 100)) : 0;
    const passes = [["Luna pass A", passA], ["Luna pass B", passB]];
    $("labeling-progress").innerHTML = `
      <p class="section-caption">Whole pilot · ${count(p.prepared)} development inputs · ${completed ? "Review complete; all labels remain provisional." : pairedAll ? "Both passes complete. Adjudication pending." : "Labeling in progress."}</p>
      <ol class="pilot-stages" aria-label="Whole-pilot progress">
        ${stage("Inputs prepared", `${count(p.prepared)} source strings`, true)}
        ${stage("Two blind passes", `${count(p.workers.a.valid + p.workers.b.valid)} / ${count(p.prepared * 2)} labels`, pairedAll)}
        ${stage("Separate review", completed ? `${count(p.final.adjudicated)} cases adjudicated` : "Pending adjudication", completed)}
        ${stage("Provisional output", completed ? `${count(p.final.agentAccepted)} accepted · ${count(p.final.unresolved)} unresolved` : "Awaiting review", completed)}
      </ol>
      <div class="label-grid">
        <section class="panel" aria-labelledby="comparison-title">
          <div class="panel-title"><h3 id="comparison-title">Pass agreement</h3><span class="count">${escape(label)}</span></div>
          <div class="comparison-summary"><strong>${paired ? pct(agreed / paired * 100) : "—"}</strong><span>${count(paired)} / ${count(n)} paired inputs</span></div>
          <div class="agreement-bar" role="img" aria-label="${count(agreed)} agree, ${count(disagreed)} disagree, ${count(n - paired)} awaiting labels"><span class="agreed" style="width:${width(agreed)}%"></span><span class="disagreed" style="width:${width(disagreed)}%"></span></div>
          <ul class="agreement-key"><li><i class="agreed"></i>Agree<strong>${count(agreed)}</strong></li><li><i class="disagreed"></i>Disagree<strong>${count(disagreed)}</strong></li>${n > paired ? `<li><i class="waiting"></i>Pending<strong>${count(n - paired)}</strong></li>` : ""}</ul>
          ${passes.map(([name, valid]) => `<div class="bar-row"><div class="bar-heading"><span>${name}</span><span>${count(valid)} / ${count(n)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${width(valid)}%"></div></div></div>`).join("")}
          <p class="subtle">Agreement measures consistency between labelers. Both passes use the same model and can share mistakes.</p>
        </section>
        <section class="panel" aria-labelledby="review-title">
          <div class="panel-title"><h3 id="review-title">Review outcome</h3><span class="count">Whole pilot</span></div>
          ${p.final ? `<dl class="review-totals"><div><dt>Provisionally accepted</dt><dd>${count(p.final.agentAccepted)}</dd></div><div><dt>Unresolved or unsupported</dt><dd>${count(p.final.unresolved)}</dd></div><div><dt>Separately adjudicated</dt><dd>${count(p.final.adjudicated)}</dd></div><div><dt>Human-reviewed labels</dt><dd>0</dd></div></dl><p class="review-note">Blind audit: ${count(p.final.auditDisagreements)} of ${count(p.final.auditCases)} cases differed from at least one Luna pass. ${count(p.final.consensusAuditCases - p.final.consensusAuditDisagreements)} of ${count(p.final.consensusAuditCases)} Luna consensus cases agreed with the separate reviewer.</p>` : '<p class="empty">Review outcomes appear after disagreements and the blind audit have been adjudicated.</p>'}
          <p class="review-note">These labels do not establish parser accuracy. Unresolved cases stay in the review queue.</p>
        </section>
      </div>
      <section class="execution-details" aria-labelledby="execution-title"><h3 id="execution-title">Execution</h3><dl><div><dt>Model</dt><dd>GPT-6 Luna · medium</dd></div><div><dt>Batch size</dt><dd>20 addresses</dd></div><div><dt>Median measured job</dt><dd>${p.timing.medianBatchSeconds !== null ? p.timing.medianBatchSeconds.toFixed(1) + " seconds" : "Unavailable"}</dd></div><div><dt>Billed usage &amp; cost</dt><dd>Unavailable</dd></div></dl><p class="subtle">Timing includes coordination and tool work across ${count(p.timing.measuredBatches)} instrumented jobs. The worker runtime does not expose billed usage. The pilot covers states and difficult formats; it is not an unbiased accuracy estimate.</p></section>`;
  }
  function renderExpansion() {
    const e = data.labelingExpansion, panel = $("labeling-expansion");
    panel.hidden = !e;
    if (!e) return;
    const pass = (title, value) => `<div class="bar-row"><div class="bar-heading"><span>${title}</span><span>${count(value)} / ${count(e.newInputs)}</span></div><progress max="${e.newInputs || 1}" value="${value}" aria-label="${title}">${count(value)} / ${count(e.newInputs)}</progress></div>`;
    panel.innerHTML = `<div class="section-heading"><div><h2 id="expansion-title">Expanded annotation sample</h2><p>${count(e.prepared)} inputs from the same corpus. ${count(e.reused)} previous labels retained; ${count(e.newInputs)} new inputs receive two blind passes.</p></div><span class="badge neutral">${e.final ? "Provisional labels" : e.phase === "paused" ? "Paused" : e.phase === "waiting-model-capacity" ? "Waiting for Luna" : "In progress"}</span></div>
      <div class="expansion-passes">${pass("New Luna pass A", e.passA)}${pass("New Luna pass B", e.passB)}</div>
      ${e.phase === "paused" ? '<p role="status">Labeling is paused. Completed batches are saved; no worker or automatic retry is running.</p>' : ''}
      ${e.phase === "waiting-model-capacity" ? '<p role="status">Luna is at capacity. Completed batches are saved for a later retry.</p>' : ''}
      <p>${e.final ? `${count(e.final.adjudicated)} new cases adjudicated. Across the whole sample, ${count(e.final.agentAccepted)} labels are provisionally accepted and ${count(e.final.unresolved)} remain unresolved or unsupported.` : e.reviewRequired !== null ? `${count(e.reviewRequired)} new cases await separate review, including ${count(e.disagreements)} pass disagreements.` : "Separate review begins after both passes finish. Disagreements and a seeded audit receive a blind third reading before adjudication."}</p>
      <p class="subtle">One active Luna worker, batches of 20. Progress counts validated labels; model agreement does not establish parser accuracy.</p>
      <details><summary>Annotation coverage by state</summary><div class="agent-table-scroll" role="region" aria-label="Expanded annotation coverage" tabindex="0"><table><caption>New-pass counts exclude reused labels. This is a discovery sample, not population weighting.</caption><thead><tr><th scope="col">State</th><th scope="col">Inputs</th><th scope="col">Reused</th><th scope="col">Pass A</th><th scope="col">Pass B</th></tr></thead><tbody>${Object.entries(e.states).sort(([a],[b]) => a.localeCompare(b)).map(([code,s]) => `<tr><th scope="row">${escape(stateNames[code] ?? code)}</th><td>${count(s.prepared)}</td><td>${count(s.reused)}</td><td>${count(s.passA)} / ${count(s.newInputs)}</td><td>${count(s.passB)} / ${count(s.newInputs)}</td></tr>`).join("")}</tbody></table></div></details>`;
  }
  function renderViews() {
    for (const button of document.querySelectorAll("[data-view]")) {
      const active = button.dataset.view === state.view;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      $("view-" + button.dataset.view).hidden = !active;
    }
    $("research-filters").hidden = state.view !== "benchmarks";
    for (const control of document.querySelectorAll("[data-diagnostic-filter]")) control.hidden = state.view !== "benchmarks";
  }
  function researchTarget() {
    return (
      data.target ??
      data.records.filter((r) => r.dataset === state.dataset).at(-1)?.target ??
      95
    );
  }
  function renderLab() {
    const agent = data.agentEvaluations?.filter(r => data.records.some(record => record.corpusHash === r.corpusHash && record.dataset === state.dataset)).at(-1);
    $("agent-benchmark").hidden = !agent;
    if (agent) {
      const fraction = value => value?.rate == null ? "Not measured" : `${(value.rate * 100).toFixed(1)}% <span>(${count(value.numerator)} / ${count(value.denominator)})</span>`;
      const summary = agent.results.current["without-spelling"].summary;
      const rows = ["without-spelling", "with-spelling"].flatMap(mode => ["baseline", "current"].filter(version => agent.results[version]).map(version => {
        const s = agent.results[version][mode].summary;
        return `<tr><th scope="row">${version === "current" ? "Current" : "Baseline"} · spelling ${mode === "with-spelling" ? "on" : "off"}</th><td>${fraction(s.exactInterpretationSet)}</td><td>${fraction(s.acceptedReadingRecall)}</td><td>${count(s.unsupportedReadings)}</td><td>${fraction(s.completeSecondaryChain)}</td></tr>`;
      })).join("");
      $("agent-benchmark").innerHTML = `<div class="section-heading"><div><p class="eyebrow">Automated development evaluation · ${escape(agent.started.slice(0, 10))}</p><h2 id="agent-benchmark-title">Agreement with provisional agent labels</h2><p>${count(summary.labelingCoverage.numerator)} of ${count(summary.cases)} pilot inputs have a provisionally exhaustive label set. Every input remains in the evaluation; ${count(summary.cases - summary.labelingCoverage.numerator)} have no complete comparison set.</p></div><span class="badge neutral">Experimental</span></div><div class="agent-table-scroll" role="region" aria-label="Agent-label comparison" tabindex="0"><table><caption>Same frozen inputs and labels for both builds. Exact set includes every emitted interpretation.</caption><thead><tr><th scope="col">Parser mode</th><th scope="col">Exact set</th><th scope="col">Labeled-reading recall</th><th scope="col">Additional readings</th><th scope="col">Exact secondary-chain set</th></tr></thead><tbody>${rows}</tbody></table></div><p>Both labeling passes used Luna. Shared model mistakes and incomplete alternative sets remain possible. These counts guide development; they do not establish population accuracy or satisfy the correctness target. Manual review is optional for continuing experiments.</p><details><summary>Frozen comparison identity</summary><code>${escape(agent.bundleHash)}</code></details>`;
    }
    const latest = data.records.filter((r) => r.dataset === state.dataset && r.split === "development" && !unscored(r)).at(-1);
    const measurement = latest ? stats(latest, "source-listing") : {};
    const dataset = data.datasets.find((d) => d.id === state.dataset);
    $("evidence-overview").innerHTML = `<section><span class="eyebrow">Selected MLS population</span><strong>${count(dataset?.rows)}</strong><p>Admitted records in one frozen corpus. Source consistency filters shape this population.</p><button class="quiet" data-open="method">Inspect the data →</button></section><section><span class="eyebrow">Development diagnostic</span><strong>${Number.isFinite(measurement.score) ? measurement.score.toFixed(3) + "%" : "Not measured"}</strong><p>MLS → ATTOM field agreement. ${count(measurement.matched)} / ${count(measurement.cases)} records have at least one agreeing candidate.</p><button class="quiet" data-open="benchmarks">See measurements →</button></section><section><span class="eyebrow">Parser correctness</span><strong>Unmeasured</strong><p>Model labels remain provisional. Exact interpretation sets require calibrated labels and a versioned evaluation.</p><button class="quiet" data-open="method">Review the method →</button></section>`;
    $("benchmark-status").innerHTML = `<dl><div><dt>Exact interpretation-set correctness</dt><dd>Not measured</dd></div><div><dt>Full secondary-chain correctness</dt><dd>Not measured</dd></div><div><dt>Comparable external baselines</dt><dd>Not run</dd></div><div><dt>Population uncertainty</dt><dd>Not estimated</dd></div></dl><p>The historical MLS → ATTOM diagnostics below do not penalize extra readings. Their unit check does not evaluate the whole building/floor/unit chain; the separate agent-label comparison does.</p>`;
    const b = data.benchmark;
    $("benchmark-contract").innerHTML = `<div class="method-body"><p><strong>All unranked candidates count.</strong> The scorer compares complete interpretation sets, accepted-reading recall, unsupported readings, no-candidate failures, and ordered secondary chains. Incomplete labels cannot establish false positives.</p><dl class="contract-ids"><div><dt>Output contract</dt><dd>${escape(b?.outputContract ?? "Not attached")}</dd></div><div><dt>Normalization</dt><dd>${escape(b?.normalization ?? "Not attached")}</dd></div><div><dt>Metric version</dt><dd>${escape(b?.metrics ?? "Not attached")}</dd></div></dl><p>The scorer is implemented and checked with synthetic fixtures. Expert calibration, a frozen evaluation-label version, sampling uncertainty, and common-input baseline runs are still required for a public accuracy claim. The ${researchTarget()}% correctness target is not an achieved score.</p></div>`;
    $("method-identity").innerHTML = latest ? `<dl><div><dt>Corpus SHA-256</dt><dd><code>${escape(latest.corpusHash)}</code></dd></div><div><dt>Admission policy SHA-256</dt><dd><code>${escape(latest.policyHash ?? "Not recorded")}</code></dd></div><div><dt>Historical evaluation identity</dt><dd>${latest.comparisonKey ? `<code>${escape(latest.comparisonKey)}</code>` : "Incomplete metadata · trend points remain independent"}</dd></div></dl>` : '<p class="empty">No corpus identity is attached yet.</p>';
    $("research-notebook").innerHTML = data.records.filter((r) => r.dataset === state.dataset).slice().reverse().map((r) => {
      const e = r.experiment, s = stats(r, "source-listing"), t = r.transitions?.["source-listing"];
      return `<article class="notebook-entry"><div class="notebook-date">${escape(r.started?.slice(0, 10))}<span>${escape(r.split)}</span></div><div><div class="panel-title"><h3>${escape(r.label)}</h3><span class="badge neutral">${escape(e?.decision || "Decision not recorded")}</span></div>${r.note ? `<p>${escape(r.note)}</p>` : ""}<dl><div><dt>Question &amp; hypothesis</dt><dd>${escape(e?.question || "Not recorded before this evaluation.")}${e?.hypothesis ? `<br>${escape(e.hypothesis)}` : ""}</dd></div>${e?.expectedEffect ? `<div><dt>Expected effect</dt><dd>${escape(e.expectedEffect)}</dd></div>` : ""}${e?.change ? `<div><dt>Change</dt><dd>${escape(e.change)}</dd></div>` : ""}<div><dt>Observed diagnostic</dt><dd>${Number.isFinite(s.score) && !unscored(r) ? `${s.score.toFixed(3)}% agreement · ${count(s.matched)} / ${count(s.cases)}${t ? ` · +${count(t.improved)} gained / ${count(t.regressed)} lost vs. recorded baseline` : ""}` : "No completed measurement"}</dd></div><div><dt>Decision evidence</dt><dd>${escape(e?.decisionReason || "No explicit keep/reject rationale is attached. A gain in field agreement is not a correctness result.")}</dd></div></dl><button class="quiet" data-evaluation="${escape(r.id)}">Inspect evaluation →</button></div></article>`;
    }).join("") || '<p class="empty">No research evaluations are attached yet.</p>';
    for (const button of $("research-notebook").querySelectorAll("[data-evaluation]")) button.onclick = () => {
      state.selected = button.dataset.evaluation; state.holdout = true; state.scenario = "source-listing"; state.cohort = "all"; state.region = "all"; openView("benchmarks"); $("detail").scrollIntoView({ block: "center" });
    };
    for (const button of document.querySelectorAll("[data-open]")) button.onclick = () => { openView(button.dataset.open); $("tab-" + button.dataset.open).focus(); };
  }

  const examples = {
    locality: "12 Oak St, Vero Beach, FL 32963",
    chain: "12 Oak St Bldg A Floor 2 Apt 204", ambiguous: "12 Oak St B",
    hyphen: "12-14 Oak St", box: "PO Box 204", rejected: "Call for details",
  };
  function parseExample() {
    const input = $("parser-input").value, spellingAlternatives = $("parser-spelling").checked;
    $("parser-build").textContent = `Local build v${data.explorer?.version ?? "unknown"} · SHA-256 ${data.explorer?.buildHash?.slice(0, 12) ?? "unknown"} · spelling alternatives ${spellingAlternatives ? "on" : "off"}`;
    try {
      const result = ParserLab.interpretFullAddress(input, { spellingAlternatives });
      const rows = result.candidates.map((candidate, index) => {
        const c = candidate.components, chain = c.secondaryUnits ?? (c.secondary ? [c.secondary] : []);
        const fields = Object.entries(c).filter(([key, value]) => value !== undefined && !["secondary", "secondaryUnits"].includes(key));
        const spans = Object.entries(candidate.sourceSpans).flatMap(([field, span]) => Array.isArray(span) ? span.map((value, i) => [`${field}[${i}]`, value]) : [[field, span]]);
        return `<details class="candidate-reading" ${index === 0 ? "open" : ""}><summary>Reading ${index + 1}<span>${escape(c.kind ?? "street")}</span></summary><div class="method-body"><dl class="component-fields">${fields.map(([field, value]) => `<div><dt>${escape(field)}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>${chain.length ? `<h3>Complete secondary chain</h3><ol class="secondary-chain">${chain.map((s) => `<li><span>${escape(s.designator ?? "Unspecified")}</span><strong>${escape(s.number ?? "No identifier")}</strong></li>`).join("")}</ol>` : '<p class="subtle">No secondary components in this reading.</p>'}<p class="assumptions"><strong>Assumptions:</strong> ${candidate.assumptions.length ? candidate.assumptions.map(escape).join(", ") : "None emitted"}</p><details><summary>Original source evidence</summary><table class="span-table"><thead><tr><th>Field</th><th>UTF-16 offsets</th><th>Original text</th></tr></thead><tbody>${spans.map(([field, span]) => `<tr><th scope="row">${escape(field)}</th><td>${span.start}–${span.end}</td><td><code>${escape(input.slice(span.start, span.end))}</code></td></tr>`).join("")}</tbody></table></details></div></details>`;
      });
      $("parser-output").innerHTML = `<div class="parser-result-heading"><h3>${result.candidates.length} ${result.candidates.length === 1 ? "reading" : "readings"}</h3><span>Unranked · no existence check</span></div>${result.diagnostics.length ? `<p class="diagnostic-message">Diagnostics: ${result.diagnostics.map(escape).join(", ")}</p>` : ""}${rows.join("")}${!rows.length ? '<p class="empty">The parser returned no interpretation. This outcome alone does not prove an input is not an address.</p>' : ""}<details class="raw-output"><summary>Raw API response</summary><pre><code>${escape(JSON.stringify(result, null, 2))}</code></pre></details>`;
    } catch (error) {
      $("parser-output").textContent = `Parser could not complete: ${error.message}`;
    }
  }
  function renderChart(rows) {
    const all = rows.map((r, index) => ({ record: r, index, ...stats(r) }));
    plotted = all.filter(
      (p) =>
        Number.isFinite(p.score) &&
        !unscored(p.record) &&
        (state.mode !== "cost" || Number.isFinite(p.mean)),
    );
    $("chart-title").textContent =
      state.mode === "cost"
        ? "Agreement vs. candidate count"
        : state.scenario === "source-listing"
          ? "MLS → ATTOM agreement"
          : "Formatting coverage over time";
    if (state.region !== "all")
      $("chart-title").textContent += ` · ${stateNames[state.region]}`;
    $("chart-caption").textContent =
      state.mode === "cost"
        ? "Higher points agree with more reference records. Farther right means more candidate readings per input. Use the experiment log to select overlapping points."
        : "Each point is a recorded build or evaluation checkpoint. Lines require identical recorded measurement definitions; missing identities remain unconnected. Diamonds are historical holdout evaluations. Click any point for its evidence.";
    $("chart-kicker").textContent =
      state.mode === "cost"
        ? "Diagnostic comparison · candidates per input"
        : "Diagnostic comparison · explicit measurement versions";
    if (!plotted.length) {
      $("chart").innerHTML =
        '<div class="empty">No scored experiments for this selection yet. Completed harness cycles will appear here automatically.</div>';
      return;
    }
    const width = Math.max(280, Math.min(1100, $("chart").clientWidth || 760)),
      height = width < 500 ? 320 : 355,
      m = { left: 52, right: 24, top: 27, bottom: 58 };
    const scores = plotted.map((p) => p.score);
    let min = Math.max(0, Math.floor(Math.min(...scores) - 0.7));
    let max = Math.min(100, Math.ceil(Math.max(...scores) + 0.7));
    if (max - min < 2) min = Math.max(0, max - 2);
    const means = plotted.map((p) => p.mean);
    const lowX = Math.max(0, Math.min(...means) - 0.12),
      highX = Math.max(...means) + 0.12;
    const x = (p) =>
      m.left +
      (state.mode === "cost"
        ? (p.mean - lowX) / Math.max(0.1, highX - lowX)
        : (p.index + 0.4) / Math.max(1, rows.length - 0.2)) *
        (width - m.left - m.right);
    const y = (score) =>
      height -
      m.bottom -
      ((score - min) / (max - min)) * (height - m.top - m.bottom);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Score by ${state.mode === "cost" ? "mean candidate count" : "recorded iteration"}"><title>Parser research progression</title><desc>Use the experiment log below as an accessible alternative to the chart. Select a point with Enter or Space.</desc>`;
    for (let i = 0; i <= 4; i++) {
      const tick = min + ((max - min) * i) / 4;
      svg += `<line x1="${m.left}" x2="${width - m.right}" y1="${y(tick)}" y2="${y(tick)}" stroke="#e3eaf1"/><text x="${m.left - 10}" y="${y(tick) + 4}" text-anchor="end">${tick.toFixed(1)}%</text>`;
    }
    if (state.mode === "cost") {
      for (let i = 0; i <= 4; i++) {
        const t = lowX + ((highX - lowX) * i) / 4;
        const px = m.left + (i / 4) * (width - m.left - m.right);
        svg += `<text x="${px}" y="${height - m.bottom + 22}" text-anchor="middle">${t.toFixed(2)}</text>`;
      }
    } else
      for (const p of all)
        svg += `<text x="${x(p)}" y="${height - m.bottom + 22}" text-anchor="middle">${p.index + 1}</text>`;
    svg += `<text class="axis-label" x="${(width + m.left) / 2}" y="${height - 8}" text-anchor="middle">${state.mode === "cost" ? "Mean candidates per address →" : "Recorded experiment / checkpoint →"}</text>`;
    const groups = new Map();
    for (const p of plotted.filter(
      (p) => p.record.split === "development" && !bad(p.record),
    )) {
      const key = p.record.comparisonKey;
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    for (const group of groups.values())
      if (group.length > 1)
        svg += `<path d="${group.map((p, i) => `${i ? "L" : "M"}${x(p)} ${y(p.score)}`).join(" ")}" fill="none" stroke="#315dd8" stroke-width="2" opacity=".5"/>`;
    for (const p of plotted) {
      const selected = state.selected === p.record.id,
        px = x(p),
        py = y(p.score),
        c = color(p.record);
      const text = `${p.index + 1}. ${p.record.label}: ${pct(p.score)}, ${p.mean?.toFixed(2) ?? "unknown"} candidates, ${p.record.split}`;
      svg += `<g class="marker" role="button" tabindex="0" data-record="${escape(p.record.id)}" aria-label="${escape(text)}" aria-pressed="${selected}"><title>${escape(text)}</title>${selected ? `<circle cx="${px}" cy="${py}" r="17" fill="${c}" opacity=".13"/>` : ""}`;
      svg +=
        p.record.split === "holdout"
          ? `<path d="M${px} ${py - 10}L${px + 10} ${py}L${px} ${py + 10}L${px - 10} ${py}Z" fill="${c}" stroke="white" stroke-width="2"/>`
          : `<circle cx="${px}" cy="${py}" r="10" fill="${c}" stroke="white" stroke-width="2"/>`;
      if (state.mode === "iteration" || selected)
        svg += `<text class="point-label" x="${px}" y="${py + 3}" text-anchor="middle">${p.index + 1}</text>`;
      svg += "</g>";
    }
    $("chart").innerHTML = svg + "</svg>";
    for (const marker of $("chart").querySelectorAll("[data-record]")) {
      marker.addEventListener("click", () => select(marker.dataset.record));
      marker.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) {
          event.preventDefault();
          select(marker.dataset.record);
          const next = [...$("chart").querySelectorAll("[data-record]")].find(
            (e) => e.dataset.record === state.selected,
          );
          next?.focus();
        }
      });
      marker.addEventListener("pointerenter", () => {
        $("tooltip").textContent = marker.getAttribute("aria-label");
        $("tooltip").hidden = false;
      });
      marker.addEventListener("pointermove", (event) => {
        $("tooltip").style.left =
          Math.max(8, Math.min(innerWidth - 285, event.clientX + 12)) + "px";
        $("tooltip").style.top =
          Math.min(innerHeight - 75, event.clientY + 15) + "px";
      });
      marker.addEventListener("pointerleave", () => {
        $("tooltip").hidden = true;
      });
    }
  }
  function readingQuality(current, baseline) {
    if (!Number.isFinite(current.firstCandidateMatched))
      return '<p class="subtle">Reading-quality counts were not recorded for this earlier evaluation.</p>';
    const rate = (t, key) =>
      t.cases > 0 && Number.isFinite(t[key])
        ? pct((100 * t[key]) / t.cases)
        : "—";
    const mean = (t, key) =>
      t.cases > 0 && Number.isFinite(t[key])
        ? (t[key] / t.cases).toFixed(2)
        : "—";
    const rows = [
      ["First candidate agrees", (t) => rate(t, "firstCandidateMatched")],
      ["Only a later candidate agrees", (t) => count(t.alternativeOnlyMatched)],
      ["Multiple candidates", (t) => rate(t, "ambiguous")],
      ["No interpretation", (t) => count(t.noCandidates)],
      ["Disagreeing readings / input", (t) => mean(t, "disagreeingCandidates")],
    ];
    return `<details class="reading-quality"><summary>Candidate diagnostics</summary><table><thead><tr><th scope="col">Measure</th><th scope="col">Selected</th><th scope="col">Baseline</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><th scope="row">${label}</th><td>${value(current)}</td><td>${value(baseline)}</td></tr>`).join("")}</tbody></table><p class="subtle">Order is unranked. A first-candidate agreement is not a confidence score. Disagreeing readings differ from ATTOM property fields; they are not proven invalid addresses.</p></details>`;
  }
  function detail(record) {
    if (!record) {
      $("detail").innerHTML =
        '<div class="empty">Select an experiment to see its evidence.</div>';
      $("failures").innerHTML =
        '<div class="empty">No experiment selected.</div>';
      return;
    }
    const s = stats(record),
      base = stats(record, metricKey(), true),
      transition =
        state.cohort === "all" && state.region === "all"
          ? record.transitions?.[state.scenario]
          : undefined;
    const tone =
      bad(record) || record.status === "failed"
        ? "bad"
        : record.split === "holdout"
          ? "holdout"
          : "";
    $("detail").innerHTML =
      `<span class="badge ${tone}">${escape(status(record))}</span><h3>${escape(record.label)}</h3>${state.region !== "all" ? `<p class="eyebrow">${escape(stateNames[state.region])} · ALL COHORTS</p>` : ""}<div class="detail-score">${pct(s.score)}</div><div class="denominator">${s.cases ? `${count(s.matched)} / ${count(s.cases)} records${s.mean !== null ? ` · ${s.mean.toFixed(2)} candidates` : ""}` : "No completed measurement"}</div>${record.note && (state.cohort !== "all" || state.region !== "all" || state.scenario !== "source-listing") ? '<p class="eyebrow">WHOLE-EXPERIMENT NOTE</p>' : ""}<p class="note">${escape(record.note || (unscored(record) ? `No score was recorded. ${record.phase ? "Stopped during " + record.phase + "." : "Checks are still running."}` : "Completed corpus comparison. Select another point to compare the evidence."))}</p>${transition ? `<div class="deltas"><div><strong class="gain">+${count(transition.improved)}</strong><span>agreements gained</span></div><div><strong class="${transition.regressed ? "loss" : "gain"}">${count(transition.regressed)}</strong><span>agreements lost</span></div></div><p class="subtle">Compared with this experiment's baseline.${bad(record) && !transition.regressed ? " The regression gate failed in another measurement." : ""}</p>` : Number.isFinite(s.score) && Number.isFinite(base.score) && record.kind !== "baseline" ? `<div class="deltas"><div><strong>${s.score - base.score >= 0 ? "+" : ""}${(s.score - base.score).toFixed(2)}</strong><span>percentage points vs baseline</span></div><div><strong>${count(s.matched - base.matched)}</strong><span>net agreements vs baseline</span></div></div>` : ""}${readingQuality(s, base)}${record.performance ? `<p class="subtle">Development timing sample · ${count(record.performance.cases)} inputs<br>Median ${record.performance.currentMs?.toFixed(1) ?? "—"} ms · baseline ${record.performance.baselineMs?.toFixed(1) ?? "—"} ms. Local timing varies.</p>` : ""}<details class="provenance"><summary>Reproducibility</summary><p>${escape(record.split)} · ${escape(record.started?.slice(0, 19).replace("T", " "))} UTC<br>Corpus ${escape(record.corpusHash?.slice(0, 12))}${record.sourceHash ? `<br>Source ${escape(record.sourceHash.slice(0, 12))}` : ""}${record.baselineHash ? `<br>Baseline ${escape(record.baselineHash.slice(0, 12))}` : ""}${record.evaluatorHash ? `<br>Evaluator ${escape(record.evaluatorHash.slice(0, 12))}` : ""}</p></details>`;
    const names = {
      streetSuffix: "Street suffix",
      unit: "Unit / secondary",
      streetName: "Street name",
      houseNumber: "House number",
      preDirectional: "Pre-directional",
      postDirectional: "Post-directional",
      "no-candidates": "No interpretation",
    };
    const missing = Object.entries(s.missing ?? {})
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const largest = missing[0]?.[1] ?? 1;
    $("failures").innerHTML = missing.length
      ? missing
          .map(
            ([field, n]) =>
              `<div class="bar-row"><div class="bar-heading"><span>${escape(names[field] ?? field)}</span><span>${count(n)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${(n / largest) * 100}%"></div></div></div>`,
          )
          .join("")
      : `<div class="empty">${unscored(record) ? "This experiment stopped before a complete error breakdown was recorded." : "No field-difference counts are available for this selection."}</div>`;
  }
  function select(id) {
    state.selected = id;
    $("tooltip").hidden = true;
    render();
  }
  function stateResults(record) {
    if (!record || unscored(record)) return [];
    return Object.entries(stateNames)
      .map(([code, name]) => {
        const s = stats(record, "source-listing/state/" + code);
        const base = stats(record, "source-listing/state/" + code, true);
        return {
          code,
          name,
          ...s,
          delta:
            record.kind !== "baseline" &&
            Number.isFinite(s.score) &&
            Number.isFinite(base.score) &&
            s.cases === base.cases
              ? s.score - base.score
              : null,
        };
      })
      .filter((s) => Number.isFinite(s.score));
  }
  function renderStates(record) {
    const items = stateResults(record);
    items.sort((a, b) => {
      if (state.stateSort === "name") return a.name.localeCompare(b.name);
      if (state.stateSort === "sample")
        return b.cases - a.cases || a.name.localeCompare(b.name);
      if (state.stateSort === "gain")
        return (
          (b.delta ?? -Infinity) - (a.delta ?? -Infinity) ||
          a.name.localeCompare(b.name)
        );
      return a.score - b.score || a.name.localeCompare(b.name);
    });
    $("states-caption").textContent = record
      ? `${record.label} · ${record.split} · raw MLS · all cohorts · ${items.length} state groups. This panel follows the selected experiment.`
      : "Select an experiment to compare states.";
    $("states-chart").innerHTML = items.length
      ? items
          .map((s) => {
            const change =
              s.delta === null
                ? "Δ unavailable"
                : `Δ ${s.delta >= 0 ? "+" : ""}${s.delta.toFixed(2)} pp`;
            return `<button class="state-row" data-state="${escape(s.code)}" aria-pressed="${state.region === s.code}" aria-label="${escape(s.name)}: ${pct(s.score)}, ${count(s.matched)} of ${count(s.cases)} records, ${change}. Show state progression."><span class="state-heading"><span><strong>${escape(s.code)}</strong> ${escape(s.name)}</span><strong>${pct(s.score)}</strong></span><span class="state-meter" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, s.score))}%"></span></span><span class="state-counts"><span>${count(s.matched)} / ${count(s.cases)}</span><span>${change}</span></span></button>`;
          })
          .join("")
      : '<div class="empty">No completed state breakdown is available for this experiment.</div>';
    for (const button of $("states-chart").querySelectorAll("[data-state]")) {
      button.addEventListener("click", () => {
        state.view = "benchmarks";
        state.region = button.dataset.state;
        state.scenario = "source-listing";
        state.cohort = "all";
        render();
        $("region").focus({ preventScroll: true });
        $("chart-title").scrollIntoView({ block: "center" });
      });
    }
  }
  function render() {
    renderViews();
    const quality = data.curation;
    $("curation").hidden = !quality;
    if (quality) {
      $("curation-summary").textContent =
        `${count(quality.retained)} admitted / ${count(quality.sourceRows)} downloaded · ${count(quality.excluded)} excluded`;
      const labels = {
        "missing-listing-address": "Missing listing text",
        "missing-reference-primary-fields": "Missing ATTOM primary fields",
        "placeholder-address": "Placeholder address",
        "land-description": "Land description without a separate house number",
        "reference-house-number-not-observed":
          "ATTOM house number absent from listing",
        "reference-street-name-not-verified":
          "ATTOM street-name evidence unverified",
        "reference-street-suffix-not-observed":
          "ATTOM suffix absent or conflicting",
        "reference-pre-directional-not-observed": "ATTOM predirectional absent",
        "reference-post-directional-not-observed": "ATTOM postdirectional absent",
        "reference-unit-not-observed": "ATTOM unit absent from listing",
        "explicit-unit-missing-from-reference":
          "Explicit listing unit missing from property fields",
        "holdout-address-previously-seen": "Holdout address previously seen",
      };
      $("curation-reasons").innerHTML = `<ul>${Object.entries(quality.byReason)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([reason, n]) =>
            `<li>${escape(labels[reason] ?? reason)}: ${count(n)}</li>`,
        )
        .join("")}</ul>`;
    }
    const dataset =
      data.datasets.find((d) => d.id === state.dataset) ?? data.datasets[0];
    if (dataset) state.dataset = dataset.id;
    const regions = Object.entries(stateNames)
      .filter(([code]) =>
        data.records.some(
          (r) =>
            r.dataset === state.dataset &&
            r.scenarios["source-listing/state/" + code]?.cases > 0,
        ) || Boolean(data.labeling?.states?.[code]?.prepared),
      )
      .sort((a, b) => a[1].localeCompare(b[1]));
    if (
      !regions.some(([code]) => code === state.region) ||
      (state.view === "benchmarks" && (state.scenario !== "source-listing" || state.cohort !== "all"))
    )
      state.region = "all";
    $("region").innerHTML =
      '<option value="all">All states + DC</option>' +
      regions
        .map(
          ([code, name]) =>
            `<option value="${escape(code)}">${escape(name)} (${escape(code)})</option>`,
        )
        .join("");
    $("region").disabled =
      !regions.length || (state.view === "benchmarks" && (state.scenario !== "source-listing" || state.cohort !== "all"));
    $("dataset").hidden = data.datasets.length === 1;
    $("corpus-label").hidden = data.datasets.length !== 1;
    $("corpus-label").textContent = dataset?.label ?? "";
    if (!["score", "name", "sample", "gain"].includes(state.stateSort))
      state.stateSort = "score";
    $("state-sort").value = state.stateSort;
    const hasCohorts = data.records.some(
      (r) =>
        r.dataset === state.dataset &&
        Object.keys(r.scenarios).some((key) => key.includes("/cohort/")),
    );
    if (!hasCohorts) state.cohort = "all";
    $("cohort").disabled = !hasCohorts;
    const rows = records();
    if (!rows.some((r) => r.id === state.selected))
      state.selected =
        rows.filter((r) => !unscored(r) && r.kind !== "baseline").at(-1)?.id ??
        rows.at(-1)?.id;
    for (const name of ["dataset", "scenario", "cohort", "region"])
      $(name).value = state[name];
    $("holdout").checked = state.holdout;
    $("auto").checked = state.auto;
    for (const button of document.querySelectorAll("[data-mode]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.mode === state.mode),
      );
    showLatest();
    renderLab();
    renderLabeling();
    renderChart(rows);
    detail(rows.find((r) => r.id === state.selected));
    renderStates(rows.find((r) => r.id === state.selected));
    $("run-count").textContent = `${rows.length} recorded results`;

    $("timeline").innerHTML = rows.length
      ? rows
          .map((r, index) => {
            const s = stats(r);
            return `<button class="run ${r.id === state.selected ? "selected" : ""} ${bad(r) || r.status === "failed" ? "bad" : r.split === "holdout" ? "holdout" : ""}" data-record="${escape(r.id)}" aria-pressed="${r.id === state.selected}"><span class="sequence">${index + 1}</span><span><strong>${escape(r.label)}</strong><small>${escape(r.started?.slice(0, 10))} · ${escape(status(r))}</small></span><span class="run-score">${unscored(r) ? "—" : pct(s.score)}<small>${r.split === "holdout" ? "holdout" : unscored(r) ? (r.status === "running" ? "running" : "not scored") : bad(r) ? "regressed" : "development"}</small></span></button>`;
          })
          .join("")
      : '<div class="empty">Run a research cycle to start the notebook.</div>';
    for (const button of $("timeline").querySelectorAll("[data-record]"))
      button.addEventListener("click", () => select(button.dataset.record));
    $("scope-note").textContent = state.view === "method"
      ? "State selection filters pass agreement. Review outcomes and execution statistics cover the whole pilot."
      : `${state.region !== "all" ? stateNames[state.region] + " · " : ""}${state.cohort === "all" ? "All cohorts" : state.cohort === "challenge" ? "Difficult formats" : "Geographic sample"} · ${state.scenario === "source-listing" ? "MLS → ATTOM agreement is diagnostic, not parser accuracy." : "Generated and property-line results measure formatting coverage."}`;
    saveState();
  }
  const tabs = [...document.querySelectorAll("[data-view]")];
  function openView(view) { state.view = view; $("tooltip").hidden = true; render(); }
  $("parser-form").addEventListener("submit", (event) => { event.preventDefault(); parseExample(); });
  for (const button of document.querySelectorAll("[data-example]")) button.addEventListener("click", () => {
    $("parser-input").value = examples[button.dataset.example]; openView("try"); parseExample(); $("parser-input").focus();
  });
  $("label-region").innerHTML = '<option value="all">All states + DC</option>' + Object.keys(data.labeling?.states ?? {}).filter((code) => stateNames[code]).sort().map((code) => `<option value="${escape(code)}">${escape(stateNames[code])}</option>`).join("");
  if (!data.labeling?.states?.[state.labelRegion]) state.labelRegion = "all";
  $("label-region").value = state.labelRegion;
  $("label-region").addEventListener("change", (event) => { state.labelRegion = event.target.value; renderLabeling(); saveState(); });
  $("geography").addEventListener("toggle", () => { if ($("geography").open) renderStates(records().find((r) => r.id === state.selected)); });
  parseExample();
  for (const [index, button] of tabs.entries()) {
    button.addEventListener("click", () => openView(button.dataset.view));
    button.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault(); openView(tabs[next].dataset.view); tabs[next].focus();
    });
  }
  $("dataset").innerHTML = data.datasets
    .map((d) => `<option value="${escape(d.id)}">${escape(d.label)}</option>`)
    .join("");
  for (const name of ["dataset", "scenario", "cohort", "region"])
    $(name).addEventListener("change", (event) => {
      state[name] = event.target.value;
      if (name === "dataset") state.selected = null;
      render();
    });
  $("state-sort").addEventListener("change", (event) => {
    state.stateSort = event.target.value;
    render();
  });
  $("holdout").addEventListener("change", (event) => {
    state.holdout = event.target.checked;
    render();
  });
  for (const button of document.querySelectorAll("[data-mode]"))
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      render();
    });
  $("updated").textContent =
    "Updated " +
    new Date(data.generatedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  $("refresh").addEventListener("click", () => location.reload());
  $("auto").addEventListener("change", (event) => {
    state.auto = event.target.checked;
    saveState();
  });
  setInterval(() => {
    if (state.auto && !document.hidden && state.view !== "try") location.reload();
  }, 30000);
  let resizeFrame;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => renderChart(records()));
  });
  $("download").addEventListener("click", () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            generatedAt: data.generatedAt,
            objective: data.objective,
            benchmark: data.benchmark,
            correctness: data.correctness,
            labeling: data.labeling,
            labelingExpansion: data.labelingExpansion,
            diagnosticMeasurement: "mls-attom-field-agreement",
            selection: {
              view: state.view,
              dataset: state.dataset,
              scenario: state.scenario,
              cohort: state.cohort,
              region: state.region,
              labelRegion: state.labelRegion,
            },
            stateComparison: {
              experiment: state.selected,
              scenario: "source-listing",
              cohort: "all",
              split: records().find((r) => r.id === state.selected)?.split,
              states: stateResults(
                records().find((r) => r.id === state.selected),
              ),
            },
            points: plotted.map((p) => ({
              label: p.record.label,
              split: p.record.split,
              status: status(p.record),
              score: p.score,
              matched: p.matched,
              cases: p.cases,
              meanCandidates: p.mean,
              corpusHash: p.record.corpusHash,
              comparisonKey: p.record.comparisonKey,
              evidenceStatus: p.record.evidenceStatus,
              sourceHash: p.record.sourceHash,
            })),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "parser-research-chart.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  render();
})();
