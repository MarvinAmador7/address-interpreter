import {test,expect} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {request} from 'node:http';
import {openWorkspace,selectCalibration,validateReview} from '../scripts/review-workspace.mjs';
import {startReviewServer} from '../scripts/review-server.mjs';
import {reviewFixture,syntheticReview,syntheticCase} from '../scripts/review-fixture.mjs';
import {evaluateBenchmark,artifactHash,EVALUATOR_HASH,OUTPUT_CONTRACT,NORMALIZATION,METRICS} from '../scripts/benchmark-contract.mjs';
import {hash} from '../scripts/labeling-contract.mjs';
import {componentReading} from '../scripts/review-fields.mjs';
const reviewer={name:'Synthetic tester',experience:'data-product'};
const uncertain=record=>({annotation:{caseId:record.caseId,inputSha256:record.inputSha256,status:'unresolved',complete:false,readings:[],notes:'Synthetic uncertainty'},components:[],exposedBefore:false});

test('calibration selection includes disagreement, uncertainty and seeded consensus without duplicates',()=>{
  const records=Array.from({length:8},(_,i)=>syntheticCase('case-'+i));
  const a=records.map(r=>r.proposals[0].annotation),b=structuredClone(a),f=structuredClone(a);
  b[0]=uncertain(records[0]).annotation;f[1]=uncertain(records[1]).annotation;
  const selected=selectCalibration(records,a,b,f,2);
  expect(selected.some(r=>r.caseId==='case-0'&&r.reasons.includes('model-disagreement'))).toBe(true);
  expect(selected.some(r=>r.caseId==='case-1'&&r.reasons.includes('unresolved-after-adjudication'))).toBe(true);
  expect(selected.filter(r=>r.reasons.includes('consensus-audit'))).toHaveLength(2);
  expect(selected).toEqual(selectCalibration(records,a,b,f,2));
  expect(new Set(selected.map(r=>r.caseId)).size).toBe(selected.length);
});

test('human components require complete source evidence, intact chains and a reason for normalization overrides',()=>{
  const r=syntheticCase(),p=syntheticReview(r);
  expect(validateReview(r,p,{})).toEqual(p);
  const lost=structuredClone(p);lost.components[0].secondaryUnits.shift();
  expect(()=>validateReview(r,lost,{})).toThrow(/secondary/);
  const primary=structuredClone(p);primary.components[0].houseNumber='1214';
  expect(()=>validateReview(r,primary,{})).toThrow(/Explain/);
  const missing=structuredClone(p);missing.annotation.readings[0].fields.streetName=[];
  expect(()=>validateReview(r,missing,{})).toThrow();
  expect(validateReview(r,uncertain(r),{}).annotation.status).toBe('unresolved');
  expect(componentReading(r,p.annotation.readings[0],{})).toEqual(p.components[0]);
});

test('initial reading freezes before reveal; stale edits, premature finals and second writers are rejected',async()=>{
  const fixture=await reviewFixture();let store;
  try{
    store=await openWorkspace(fixture.directory);const id=fixture.records[0].caseId,p=syntheticReview(fixture.records[0]);
    expect(store.publicCase(id)).not.toHaveProperty('proposals');
    expect(JSON.stringify(store.overview())).not.toContain('consensus-audit');
    await expect(openWorkspace(fixture.directory)).rejects.toThrow(/already open/);
    await store.mutate('profile',null,reviewer);
    await expect(store.mutate('final',id,{revision:0,payload:p,confirmed:true})).rejects.toThrow(/initial/);
    await store.mutate('draft',id,{revision:0,payload:p});
    expect(store.publicCase(id)).not.toHaveProperty('proposals');
    await expect(store.mutate('blind',id,{revision:0,payload:p,confirmed:true})).rejects.toThrow(/another tab/);
    const result=await store.mutate('blind',id,{revision:1,payload:p,confirmed:true});
    expect(result.proposals).toHaveLength(3);
    const original=structuredClone(result.blind);
    await expect(store.mutate('blind',id,{revision:2,payload:p,confirmed:true})).rejects.toThrow(/already frozen/);
    await store.mutate('final',id,{revision:2,payload:p,confirmed:true});
    await store.close();store=await openWorkspace(fixture.directory);
    expect(store.publicCase(id).blind).toEqual(original);
    expect(store.overview().finalized).toBe(1);
    expect(store.exportReview().annotations[1]).toMatchObject({status:'unresolved',exhaustive:false,readings:[],review:{status:'unreviewed'}});
    expect(store.exportReview().releaseEligible).toBe(false);
    await expect(store.mutate('profile',null,reviewer)).rejects.toThrow(/already recorded/);
  }finally{await store?.close();await fixture.cleanup();}
});

test('final revisions keep initial evidence and require a changed-decision explanation',async()=>{
  const fixture=await reviewFixture(),store=await openWorkspace(fixture.directory);
  try{
    const r=fixture.records[0],p=syntheticReview(r);await store.mutate('profile',null,reviewer);
    await store.mutate('blind',r.caseId,{revision:0,payload:p,confirmed:true});
    const edited=structuredClone(p);edited.annotation.readings[0].secondary[0].kind='unit';
    await expect(store.mutate('final',r.caseId,{revision:1,payload:edited,confirmed:true})).rejects.toThrow(/differs/);
    edited.annotation.notes='Synthetic changed decision';await store.mutate('final',r.caseId,{revision:1,payload:edited,confirmed:true});
    await store.mutate('final',r.caseId,{revision:2,payload:p,confirmed:true});
    expect(store.publicCase(r.caseId).blind.annotation).toEqual(p.annotation);
    const events=(await readFile(join(fixture.directory,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    expect(events.filter(e=>e.action==='final')).toHaveLength(2);
  }finally{await store.close();await fixture.cleanup();}
});

test('journal corruption is detected on restart and the workspace is not overwritten',async()=>{
  const fixture=await reviewFixture();let store=await openWorkspace(fixture.directory);
  try{
    await store.mutate('profile',null,reviewer);await store.close();
    const path=join(fixture.directory,'events.jsonl'),bytes=await readFile(path,'utf8');
    await writeFile(path,bytes.replace('Synthetic tester','Tampered tester'));
    await expect(openWorkspace(fixture.directory)).rejects.toThrow(/integrity/);
    await writeFile(path,bytes.slice(0,-1));
    await expect(openWorkspace(fixture.directory)).rejects.toThrow(/Incomplete journal/);
  }finally{await fixture.cleanup();}
});

test('loopback API refuses cross-origin writes and never serves frozen private files',async()=>{
  const fixture=await reviewFixture(),app=await startReviewServer({directory:fixture.directory,port:0});
  try{
    const post=(path,body,origin=app.url)=>fetch(app.url+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
    expect((await post('/api/profile',reviewer,'https://example.com')).status).toBe(403);
    expect((await fetch(app.url+'/cases.json')).status).toBe(404);
    const wrongHost=await new Promise((resolve,reject)=>{
      const req=request(app.url+'/api/session',{headers:{Host:'example.com'}},res=>{res.resume();resolve(res.statusCode);});
      req.on('error',reject);req.end();
    });
    expect(wrongHost).toBe(403);
    expect((await post('/api/profile',reviewer)).status).toBe(200);
    const id=fixture.records[0].caseId;
    expect(await (await fetch(app.url+'/api/case/'+id)).json()).not.toHaveProperty('proposals');
    expect((await post('/api/case/'+id+'/blind',{revision:0,payload:syntheticReview(fixture.records[0]),confirmed:true})).status).toBe(200);
    expect((await (await fetch(app.url+'/api/case/'+id)).json()).proposals).toHaveLength(3);
  }finally{await app.close();await fixture.cleanup();}
});

test('review export connects to the scorer with unreviewed cases retained and no release promotion',async()=>{
  const fixture=await reviewFixture(),store=await openWorkspace(fixture.directory);
  try{
    const r=fixture.records[0],p=syntheticReview(r);await store.mutate('profile',null,reviewer);
    await store.mutate('blind',r.caseId,{revision:0,payload:p,confirmed:true});await store.mutate('final',r.caseId,{revision:1,payload:p,confirmed:true});
    const review=store.exportReview(),annotations=review.annotations.map(({review,...label})=>label);
    const result=evaluateBenchmark({sample:review.sample,annotations,parserHash:hash('synthetic parser'),interpret:()=>({candidates:p.components.map(components=>({components}))}),
      definition:{corpusHash:fixture.manifest.corpusHash,policyHash:fixture.manifest.policyHash,sampleHash:artifactHash(review.sample),annotationHash:artifactHash(annotations),guideHash:fixture.manifest.guideHash,
        split:'development',annotationStatus:'provisional',outputContract:OUTPUT_CONTRACT,normalization:NORMALIZATION,metrics:METRICS,evaluatorHash:EVALUATOR_HASH,parserOptions:{spellingAlternatives:false},population:'Synthetic test'}});
    expect(result.summary.labelingCoverage).toEqual({numerator:1,denominator:2,rate:0.5});
    expect(result.summary.exactInterpretationSet).toEqual({numerator:1,denominator:1,rate:1});
    expect(result.releaseEligible).toBe(false);
  }finally{await store.close();await fixture.cleanup();}
});
