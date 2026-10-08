import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { renderReport } from "./research-report.mjs";

// Authored synthetic examples, separate from private MLS corpus measurements.
// Exercise the generated HTML and form submission, including the actual parser
// bundle. Unit-testing interpretFullAddress alone cannot catch a miswired UI.
const primary = { houseNumber: "12", streetName: "OAK", streetSuffix: "ST" };
const locality = { city: "VERO BEACH", state: "FL", postalCode: "32963" };
const secondaryUnits = [{ designator: "BLDG", number: "A" }, { designator: "FL", number: "2" }, { designator: "APT", number: "204" }];
const cases = [
  { input: "12 Oak St, Vero Beach, FL 32963", expected: [{ ...primary, ...locality }] },
  { input: "12 Oak St, Vero Beach, FL 32963-1234", expected: [{ ...primary, ...locality, postalCode: "32963-1234" }] },
  { input: "12 Oak St\nVero Beach, FL 32963", expected: [{ ...primary, ...locality }] },
  { input: "12 Oak St, Lake Placid, NY 12946", expected: [{ ...primary, city: "LAKE PLACID", state: "NY", postalCode: "12946" }] },
  { input: "12 Oak St, Rural Hall, NC 27045", expected: [{ ...primary, city: "RURAL HALL", state: "NC", postalCode: "27045" }] },
  { input: "12 Oak St Bldg A Floor 2 Apt 204, Vero Beach, FL 32963", expected: [{ ...primary, ...locality, secondary: secondaryUnits.at(-1), secondaryUnits }] },
  { input: "12 Oak St Bldg A Floor 2 Apt 204", expected: [{ ...primary, secondary: secondaryUnits.at(-1), secondaryUnits }] },
  { input: "Apt 204\n12 Oak St, Vero Beach, FL 32963", expected: [{ ...primary, ...locality, secondary: { designator: "APT", number: "204" } }] },
  { input: "12 Oak St 204 Floor 2, Vero Beach, FL 32963", expected: [
    { ...primary, ...locality, secondary: { designator: "FL", number: "2" }, secondaryUnits: [{ number: "204" }, { designator: "FL", number: "2" }] },
    { houseNumber: "12", streetName: "OAK ST 204", ...locality, secondary: { designator: "FL", number: "2" } },
  ] },
  { input: "12 Oak St FL 2", expected: [{ ...primary, secondary: { designator: "FL", number: "2" } }] },
  { input: "12-14 Oak St", expected: [{ ...primary, houseNumber: "12-14" }] },
  { input: "12 Oak St B", expected: [{ ...primary, secondary: { number: "B" } }, { houseNumber: "12", streetName: "OAK ST B" }] },
  { input: "PO Box 204, Vero Beach, FL 32963", expected: [{ kind: "po-box", boxNumber: "204", ...locality }] },
  { input: "Call for details", expected: [] },
];
const directory = await mkdtemp(join(tmpdir(), "address-explorer-"));
let browser;
try {
  const file = join(directory, "index.html");
  const ratio = (numerator,denominator) => ({numerator,denominator,rate:denominator ? numerator/denominator : null});
  const agentSummary = {cases:200,labelingCoverage:ratio(192,200),exactInterpretationSet:ratio(120,192),acceptedReadingRecall:ratio(189,193),unsupportedReadings:101,completeSecondaryChain:ratio(3,44)};
  const modes = {'without-spelling':{summary:agentSummary},'with-spelling':{summary:agentSummary}};
  await writeFile(file, await renderReport({ records: [{id:'synthetic',dataset:'synthetic',corpusHash:'a'.repeat(64),started:'2026-10-05T00:00:00Z',split:'development',scenarios:{'source-listing':{cases:10,matched:9,candidates:15}}}], datasets: [{id:'synthetic',label:'Synthetic fixture',rows:10}], states: {},
    labelingExpansion:{prepared:1000,reused:200,newInputs:800,passA:200,passB:0,phase:'waiting-model-capacity',reviewRequired:null,final:null,states:{CA:{prepared:20,reused:5,newInputs:15,passA:8,passB:0}}},
    agentEvaluations:[{started:'2026-10-05T00:00:00Z',corpusHash:'a'.repeat(64),bundleHash:'b'.repeat(64),results:{current:modes,baseline:modes}}]}));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [], externalRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
  await page.goto(pathToFileURL(file).href + "#view=try");
  let checks = 0;
  for (const spelling of [false, true]) {
    await page.locator("#parser-spelling").setChecked(spelling);
    for (const { input, expected } of cases) {
      await page.locator("#parser-input").fill(input);
      await page.locator("#parser-form button[type=submit]").click();
      const result = JSON.parse(await page.locator(".raw-output code").textContent());
      const context = `${input} · spelling alternatives ${spelling}`;
      // Exact candidate counts and components: one good reading cannot hide extras.
      assert.equal(result.candidates.length, expected.length, context);
      for (const reading of expected)
        assert.ok(result.candidates.some((candidate) => {
          try { assert.deepEqual(candidate.components, reading); return true; } catch { return false; }
        }), `Missing exact reading: ${context}\n${JSON.stringify(result.candidates.map((c) => c.components))}`);
      assert.equal(await page.locator(".candidate-reading").count(), expected.length, context);
      for (const candidate of result.candidates) {
        if (candidate.components.state) {
          const span = candidate.sourceSpans.state;
          assert.equal(input.slice(span.start, span.end), candidate.components.state, context);
        }
        if (candidate.components.postalCode) {
          const span = candidate.sourceSpans.postalCode;
          assert.equal(input.slice(span.start, span.end), candidate.components.postalCode, context);
        }
      }
      assert.ok(!page.url().includes(encodeURIComponent(input)), "Visitor input leaked into URL");
      checks++;
    }
  }
  // Check the source-evidence table and narrow layout with a real locality result.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#parser-input").fill(cases[0].input);
  await page.locator("#parser-form button[type=submit]").click();
  await page.getByText("Original source evidence", { exact: true }).click();
  const stateRow = page.locator(".span-table tr").filter({ has: page.getByRole("rowheader", { name: "state", exact: true }) });
  assert.equal(await stateRow.locator("code").textContent(), "FL");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Explorer overflows mobile viewport");
  await page.getByRole('tab',{name:'Benchmarks',exact:true}).click();
  assert.equal(await page.locator('#agent-benchmark tbody tr').count(),4);
  assert.match(await page.locator('#agent-benchmark').textContent(),/120 \/ 192/);
  assert.match(await page.locator('#agent-benchmark').textContent(),/Manual review is optional/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Agent comparison overflows mobile viewport");
  await page.getByRole('tab',{name:'Data & methods',exact:true}).click();
  assert.match(await page.locator('#labeling-expansion').textContent(),/200 previous labels retained/);
  assert.match(await page.locator('#labeling-expansion').textContent(),/Waiting for Luna/);
  assert.match(await page.locator('#labeling-expansion [role="status"]').textContent(),/Completed batches are saved/);
  assert.equal(await page.getByRole('progressbar',{name:'New Luna pass A'}).getAttribute('value'),'200');
  assert.equal(await page.getByRole('progressbar',{name:'New Luna pass B'}).getAttribute('value'),'0');
  await page.locator('#labeling-expansion summary').click();
  assert.match(await page.locator('#labeling-expansion tbody').textContent(),/8 \/ 15/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Expanded annotation coverage overflows mobile viewport");
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log(`Research explorer: ${checks} exact interpretation checks, source evidence, provisional agent comparison, labeling progress, mobile layout and offline behavior passed.`);
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
