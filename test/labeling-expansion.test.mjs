import {expect,test} from 'vitest';
import {splitExpansion,compareExpansion,readExpansion} from '../scripts/labeling-expansion.mjs';
import {combineExpansion,requiredReviews,freezeReview,finishExpansion} from '../scripts/finish-labeling-expansion.mjs';
import {hash,annotationTokens,materializeAnnotation} from '../scripts/labeling-contract.mjs';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {writeLabelBatch} from '../scripts/write-label-batch.mjs';

const record=(caseId,id=caseId)=>({caseId,id,input:{deliveryLine:'12 Oak St 2'},inputSha256:hash('12 Oak St 2'),tokens:annotationTokens('12 Oak St 2')});
const label=r=>({caseId:r.caseId,inputSha256:r.inputSha256,status:'address',complete:true,readings:[{fields:{houseNumber:[0],streetName:[1],streetSuffix:[2]},secondary:[{kind:'unit',designator:[],identifier:[3]}],separators:[],unresolved:[]}],notes:''});
function run(){const old=record('new-id','old-source'),fresh=record('fresh');return {
  manifest:{count:2,auditIds:['fresh']},records:[old,fresh],fresh:[fresh],
  reused:[{...materializeAnnotation(old,label(old)),review:{provisional:true,humanReviewed:false,adjudicator:'historical-reviewer'}}],passes:{a:[label(fresh)],b:[label(fresh)]},
};}
test('expansion retains previous source identities even when case IDs are reassigned',()=>{
  const old=record('old-id','shared'),renamed=record('new-id','shared'),fresh=record('fresh');
  expect(splitExpansion([renamed,fresh],[old])).toEqual({reused:[{caseId:'new-id',previousCaseId:'old-id',id:'shared'}],fresh:[fresh]});
  expect(()=>splitExpansion([fresh],[old])).toThrow(/retain/);
  expect(()=>splitExpansion([renamed,renamed],[old])).toThrow(/Duplicate/);
  expect(()=>splitExpansion([{...renamed,inputSha256:'changed'}],[old])).toThrow(/changed/);
});
test('consensus audit is required and preserves historical labels and actual new adjudicator',()=>{
  const r=run(),l=label(r.fresh[0]);expect(requiredReviews(r).records).toEqual(r.fresh);
  const result=combineExpansion(r,[l],[l],[{caseId:l.caseId,reason:'Supported by source tokens.'}]);
  expect(result.labels[0]).toEqual(r.reused[0]);
  expect(result.labels[1].review.adjudicator).toBe('gpt-6-luna/independent-adjudicator');
  expect(result.summary).toMatchObject({prepared:2,reusedCount:1,newCount:1,consensusAuditCases:1,releaseEligible:false,correctness:'not-measured'});
});
test('incomplete labels or adjudication cannot reduce the denominator',()=>{
  const r=run(),l=label(r.fresh[0]);
  expect(()=>combineExpansion(r,[],[l],[])).toThrow();
  expect(()=>combineExpansion(r,[l],[],[])).toThrow();
  expect(()=>combineExpansion(r,[l],[l],[])).toThrow(/decisions/);
  r.passes.b=[];expect(()=>requiredReviews(r)).toThrow();
});
test('uncertainty survives adjudication and consensus revisions are counted',()=>{
  const r=run(),l={...label(r.fresh[0]),status:'unresolved',complete:false,readings:[],notes:'Ambiguous trailing number.'};
  const result=combineExpansion(r,[l],[l],[{caseId:l.caseId,reason:l.notes}]);
  expect(result.summary).toMatchObject({unresolved:1,agentAccepted:1,consensusAuditDisagreements:1,consensusOverturned:1,releaseEligible:false});
  expect(result.labels[1].status).toBe('unresolved');
});

test('file workflow binds blind evidence, preserves all inputs and refuses changed or overwritten artifacts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'label-expansion-')),directory=join(root,'.local','run');await mkdir(directory,{recursive:true});
  const r=run(),l=label(r.fresh[0]),put=(name,data)=>writeFile(join(directory,name),JSON.stringify(data,null,2)+'\n'),
    putLines=(name,data)=>writeFile(join(directory,name),data.map(x=>JSON.stringify(x)).join('\n')+'\n');
  try{
    await putLines('inputs.jsonl',r.records);await putLines('new-inputs.jsonl',r.fresh);await putLines('reused.labels.jsonl',r.reused);
    const batches=[];
    for(const worker of ['a','b']){
      const input=`worker-${worker}.input.jsonl`,output=`worker-${worker}.labels.jsonl`;
      await putLines(input,r.fresh);await putLines(output,[l]);batches.push({worker,batch:1,input,output,count:1,inputSha256:hash(await readFile(join(directory,input)))});
    }
    await put('batches.json',{batches});
    const manifest={...r.manifest,corpusHash:'a'.repeat(64),guideSha256:hash(await readFile('docs/labeling-guide-v1.md')),protocolSha256:hash(await readFile('docs/labeling-expansion-v1.md'))};
    for(const [file,key]of [['inputs.jsonl','inputsSha256'],['new-inputs.jsonl','newInputsSha256'],['reused.labels.jsonl','reusedLabelsSha256'],['batches.json','batchesSha256']])manifest[key]=hash(await readFile(join(directory,file)));
    await put('manifest.json',manifest);
    expect(await compareExpansion(directory)).toMatchObject({newCount:1,reusedCount:1,reviewRequired:1,releaseEligible:false});
    await putLines('adjudication-blind.labels.jsonl',[l]);await freezeReview(directory);
    await putLines('adjudicated.labels.jsonl',[l]);await putLines('adjudication-decisions.jsonl',[{caseId:l.caseId,reason:'Source-supported.'}]);
    await putLines('adjudication-blind.labels.jsonl',[{...l,notes:'Changed after freeze'}]);
    await expect(finishExpansion(directory)).rejects.toThrow(/Frozen blind/);
    await putLines('adjudication-blind.labels.jsonl',[l]);
    expect(await finishExpansion(directory)).toMatchObject({prepared:2,newCount:1,reusedCount:1,releaseEligible:false});
    await expect(finishExpansion(directory)).rejects.toThrow(/EEXIST/);
    await putLines('new-inputs.jsonl',[]);
    await expect(readExpansion(directory)).rejects.toThrow(/Frozen new-inputs/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('batch writer creates no output for invalid indices and refuses overwriting a valid batch',async()=>{
  const root=await mkdtemp(join(tmpdir(),'label-writer-')),directory=join(root,'.local');await mkdir(directory);
  const input=join(directory,'worker-a.batch01.input.jsonl'),output=join(directory,'worker-a.batch01.labels.jsonl'),r=record('sample'),l=label(r);
  try{
    await writeFile(input,JSON.stringify(r)+'\n');
    const bad=structuredClone(l);bad.readings[0].fields.streetSuffix=[99];
    await expect(writeLabelBatch(input,[bad])).rejects.toThrow(/out of range/);
    await expect(readFile(output)).rejects.toThrow(/ENOENT/);
    expect(await writeLabelBatch(input,[l])).toMatchObject({valid:true,count:1});
    await expect(writeLabelBatch(input,[l])).rejects.toThrow(/EEXIST/);
  }finally{await rm(root,{recursive:true,force:true});}
});
