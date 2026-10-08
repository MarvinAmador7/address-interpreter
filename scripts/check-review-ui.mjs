import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {reviewFixture} from './review-fixture.mjs';
import {startReviewServer} from './review-server.mjs';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const fixture=await reviewFixture();let app,browser;
try{
  app=await startReviewServer({directory:fixture.directory,port:0});browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1400,height:1050}}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(app.url))external.push(r.url());});
  await page.goto(app.url);await page.locator('#reviewer').fill('Synthetic browser reviewer');await page.locator('#experience').selectOption('data-product');await page.locator('#profile-form button').click();
  await page.locator('#address').waitFor();
  assert.equal(await page.locator('#comparison').isVisible(),false);
  assert.equal(await page.locator('[data-proposal]').count(),0);
  const initial=await (await fetch(app.url+'/api/case/synthetic-1')).json();
  assert.equal('proposals' in initial,false);assert.equal('reasons' in initial,false);
  const assign=async(indices,role)=>{for(const index of indices)await page.locator(`[data-token="${index}"]`).click();await page.locator(`[data-role="${role}"]`).click();};
  await assign([0],'fields.houseNumber');await assign([1],'fields.streetName');
  await page.locator('#save-draft').click();await page.waitForFunction(()=>document.getElementById('save-state').textContent==='Draft saved locally');
  await page.reload();await page.locator('[data-value="fields.houseNumber"]').waitFor();
  assert.equal(await page.locator('[data-value="fields.houseNumber"]').inputValue(),'12');
  assert.equal(await page.locator('[data-value="fields.streetName"]').inputValue(),'OAK');
  await assign([2],'fields.streetSuffix');
  for(const [index,kind]of ['building','floor','unit'].entries()){
    await page.locator('#add-secondary').click();await page.locator(`[data-kind="${index}"]`).selectOption(kind);
    await assign([3+index*2],`secondary.${index}.designator`);await assign([4+index*2],`secondary.${index}.identifier`);
  }
  assert.equal(await page.locator('#coverage').textContent(),'0 pieces unassigned');
  assert.equal(await page.locator('[data-value="secondary.1.designator"]').inputValue(),'FL');
  if(process.argv.includes('--screenshots')){
    await mkdir('.local/review-ui-qa',{recursive:true});await page.screenshot({path:resolve('.local/review-ui-qa/desktop.png'),fullPage:true});
  }
  for(const width of [1024,768,390,320]){
    await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);
    if(width===390&&process.argv.includes('--screenshots'))await page.screenshot({path:resolve('.local/review-ui-qa/mobile.png'),fullPage:true});
  }
  await page.setViewportSize({width:1400,height:1050});
  await page.locator('#save-review').click();assert.match(await page.locator('#message').textContent(),/confirmation/);
  await page.locator('#confirmed').check();await page.locator('#save-review').click();
  await page.locator('#comparison').waitFor();assert.equal(await page.locator('[data-proposal]').count(),4);
  const blind=await (await fetch(app.url+'/api/case/synthetic-1')).json();assert.equal(blind.blind.components[0].secondaryUnits.length,3);
  if(process.argv.includes('--screenshots'))await page.screenshot({path:resolve('.local/review-ui-qa/compare.png'),fullPage:true});
  await page.locator('#confirmed').check();await page.locator('#save-review').click();
  await page.waitForFunction(()=>document.getElementById('case-number').textContent.startsWith('Case 2'));
  await page.locator('#status').selectOption('unresolved');await page.locator('#notes').fill('Uncertain <script>globalThis.injected=true</script>');
  await page.locator('#confirmed').check();await page.locator('#save-review').click();await page.locator('#comparison').waitFor();
  assert.equal(await page.evaluate(()=>globalThis.injected),undefined);
  await page.locator('#confirmed').check();await page.locator('#save-review').click();await page.waitForFunction(()=>document.getElementById('progress').textContent.includes('All 2 reviews finalized'));
  await page.reload();await page.locator('#address').waitFor();
  assert.match(await page.locator('#progress').textContent(),/2 of 2 finalized/);
  const result=await (await fetch(app.url+'/api/export')).json();
  assert.equal(result.annotations.length,2);assert.equal(result.annotations[0].readings[0].secondaryUnits.length,3);
  assert.equal(result.annotations[1].status,'unresolved');assert.equal(result.releaseEligible,false);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('Review UI passed: blind entry, complete secondary chain, draft resume, compare/finalize, uncertainty, durable export, 5 viewport sizes, no external requests. Synthetic workspace only.');
}finally{await browser?.close();await app?.close();await fixture.cleanup();}
