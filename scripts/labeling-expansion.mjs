import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {selectPilot, validateBatch, comparePasses} from './labeling-pilot.mjs';
import {hash, materializeAnnotation, annotationKey} from './labeling-contract.mjs';
import {verifyActiveCorpus} from './corpus-integrity.mjs';
import {ACTIVE_CORPUS} from './corpus-policy.mjs';

export const EXPANSION='.local/correctness-review/luna-expansion-v1';
const GUIDE='docs/labeling-guide-v1.md', PROTOCOL='docs/labeling-expansion-v1.md';
const ensure=(condition,message)=>{if(!condition)throw new Error(message);};
const rows=text=>text.split('\n').filter(x=>x.trim()).map(JSON.parse);
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const lines=async path=>rows(await readFile(path,'utf8'));
const privatePath=path=>{const p=resolve(path);ensure(p.split(/[\\/]/).includes('.local'),'Private directory required');return p;};
const write=async(path,value)=>writeFile(path,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const writeLines=(path,values)=>write(path,values.map(v=>JSON.stringify(v)).join('\n')+'\n');
const ordered=(values,seed)=>[...values].sort((a,b)=>hash(seed+'\n'+a.id).localeCompare(hash(seed+'\n'+b.id)));
const check=(records,labels)=>{const result=validateBatch(records,labels);ensure(result.valid,JSON.stringify(result.errors));};
const optional=async path=>{try{return await readFile(path,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}};

export function splitExpansion(records,previous){
  const old=new Map(previous.map(r=>[r.id,r]));
  ensure(old.size===previous.length && new Set(records.map(r=>r.id)).size===records.length,'Duplicate input IDs');
  const reused=[],fresh=[];
  for(const record of records){const prior=old.get(record.id);
    if(prior){ensure(prior.inputSha256===record.inputSha256 && prior.input.deliveryLine===record.input.deliveryLine,'Reused input changed');reused.push({caseId:record.caseId,previousCaseId:prior.caseId,id:record.id});}
    else fresh.push(record);
  }
  ensure(reused.length===previous.length,'Expansion must retain the entire previous sample');
  return {reused,fresh};
}

export async function prepareExpansion({directory=EXPANSION,count=1000,source='.local/correctness-review/development-v1',pilot='.local/correctness-review/luna-pilot-v1'}={}){
  directory=privatePath(directory);source=privatePath(source);pilot=privatePath(pilot);
  const corpusBytes=await readFile(ACTIVE_CORPUS),corpus=await verifyActiveCorpus(ACTIVE_CORPUS,corpusBytes);
  const queueBytes=await readFile(join(source,'review.jsonl')),sampling=await json(join(source,'manifest.json'));
  const oldManifest=await json(join(pilot,'manifest.json')),oldReceipt=await json(join(pilot,'final-summary.json'));
  const oldInput=await readFile(join(pilot,'inputs.jsonl')),oldLabels=await readFile(join(pilot,'provisional.labels.jsonl'));
  ensure(hash(queueBytes)===sampling.queueSha256 && sampling.corpusHash===corpus.sha256,'Review queue changed');
  ensure(hash(oldInput)===oldManifest.inputsSha256 && hash(oldLabels)===oldReceipt.outputSha256 && oldManifest.corpusHash===corpus.sha256,'Previous pilot changed');
  ensure(hash(await readFile(GUIDE))===oldManifest.guideSha256,'Annotation guide changed');
  const records=selectPilot(rows(queueBytes.toString()),sampling,count,oldManifest.seed);
  const {reused,fresh}=splitExpansion(records,rows(oldInput.toString()));
  const metadata=new Map(sampling.records.map(r=>[r.id,r])),population=rows(corpusBytes.toString());
  for(const r of records){const meta=metadata.get(r.id),row=population[meta?.sourceIndex];ensure(row?.split==='development' && row.listing_address===r.input.deliveryLine && r.id===hash(corpus.sha256+'\n'+meta.sourceIndex),'Input outside frozen development corpus');}
  const previousLabels=new Map(rows(oldLabels.toString()).map(r=>[r.caseId,r]));
  const labels=reused.map(r=>{const old=previousLabels.get(r.previousCaseId);ensure(old?.id===r.id,'Previous label identity changed');return {...old,caseId:r.caseId};});
  const seed='luna-expansion-v1',audit=ordered(fresh,seed+'/audit').slice(0,Math.ceil(fresh.length*.1));
  await mkdir(resolve(directory,'..'),{recursive:true});await mkdir(directory);
  await writeLines(join(directory,'inputs.jsonl'),records);
  await writeLines(join(directory,'new-inputs.jsonl'),fresh);
  await writeLines(join(directory,'reused.labels.jsonl'),labels);
  const batches=[];
  for(const worker of ['a','b']){
    const work=ordered(fresh,seed+'/'+worker);
    for(let i=0;i<work.length;i+=20){const batch=i/20+1,stem=`worker-${worker}.batch${String(batch).padStart(2,'0')}`,subset=work.slice(i,i+20);
      await writeLines(join(directory,stem+'.input.jsonl'),subset);
      batches.push({worker,batch,input:stem+'.input.jsonl',output:stem+'.labels.jsonl',count:subset.length,inputSha256:hash(await readFile(join(directory,stem+'.input.jsonl')))});
    }
  }
  await write(join(directory,'batches.json'),{batchSize:20,batches});
  await write(join(directory,'manifest.json'),{schemaVersion:'labeling-expansion-v1',createdAt:new Date().toISOString(),count,split:'development',corpusHash:corpus.sha256,policyHash:corpus.policySha256,
    guideSha256:hash(await readFile(GUIDE)),protocolSha256:hash(await readFile(PROTOCOL)),coordinatorSha256:hash(await readFile(new URL(import.meta.url))),queueSha256:sampling.queueSha256,
    inputsSha256:hash(await readFile(join(directory,'inputs.jsonl'))),newInputsSha256:hash(await readFile(join(directory,'new-inputs.jsonl'))),reusedLabelsSha256:hash(await readFile(join(directory,'reused.labels.jsonl'))),batchesSha256:hash(await readFile(join(directory,'batches.json'))),
    selectionSeed:oldManifest.seed,selection:'Nested coverage-first discovery sample within frozen review queue; not population accuracy',newCount:fresh.length,reusedCount:reused.length,reused,
    previous:{directory:pilot,inputsSha256:hash(oldInput),labelsSha256:hash(oldLabels),receiptSha256:hash(await readFile(join(pilot,'final-summary.json')))},
    auditIds:audit.map(r=>r.caseId),model:'gpt-6-luna',reasoning:'medium',records:records.map(r=>({caseId:r.caseId,...metadata.get(r.id)}))});
  return {directory,count,newCount:fresh.length,reusedCount:reused.length,batches:batches.length,releaseEligible:false};
}

export async function readExpansion(directory=EXPANSION){
  directory=privatePath(directory);const manifest=await json(join(directory,'manifest.json'));
  for(const [file,key] of [['inputs.jsonl','inputsSha256'],['new-inputs.jsonl','newInputsSha256'],['reused.labels.jsonl','reusedLabelsSha256'],['batches.json','batchesSha256']])ensure(hash(await readFile(join(directory,file)))===manifest[key],`Frozen ${file} changed`);
  ensure(hash(await readFile(GUIDE))===manifest.guideSha256 && hash(await readFile(PROTOCOL))===manifest.protocolSha256,'Frozen annotation protocol changed');
  const records=await lines(join(directory,'inputs.jsonl')),fresh=await lines(join(directory,'new-inputs.jsonl')),reused=await lines(join(directory,'reused.labels.jsonl'));
  const originals=new Map(fresh.map(r=>[r.caseId,JSON.stringify(r)])),passes={a:[],b:[]},details=[];
  for(const batch of (await json(join(directory,'batches.json'))).batches){
    ensure(['a','b'].includes(batch.worker) && [batch.input,batch.output].every(p=>!p.includes('/')&&!p.includes('\\')),'Invalid batch path');
    const input=await readFile(join(directory,batch.input),'utf8'),subset=rows(input);
    ensure(hash(input)===batch.inputSha256 && subset.length===batch.count && subset.every(r=>originals.get(r.caseId)===JSON.stringify(r)),'Batch input changed');
    const output=await optional(join(directory,batch.output));
    if(output===null){details.push({...batch,status:'pending'});continue;}
    const labels=rows(output);check(subset,labels);passes[batch.worker].push(...labels);details.push({...batch,status:'valid',outputSha256:hash(output)});
  }
  for(const labels of Object.values(passes))ensure(new Set(labels.map(r=>r.caseId)).size===labels.length,'Repeated labels across batches');
  return {directory,manifest,records,fresh,reused,passes,details};
}

export async function compareExpansion(directory=EXPANSION){
  const run=await readExpansion(directory),{fresh,passes,manifest}=run;check(fresh,passes.a);check(fresh,passes.b);
  const comparisons=comparePasses(fresh,passes.a,passes.b,manifest.auditIds),required=new Set(comparisons.filter(r=>r.reviewRequired).map(r=>r.caseId));
  await write(join(run.directory,'comparison.json'),comparisons);
  const selected=fresh.filter(r=>required.has(r.caseId));
  for(let i=0;i<selected.length;i+=20)await writeLines(join(run.directory,`adjudication.batch${String(i/20+1).padStart(2,'0')}.input.jsonl`),selected.slice(i,i+20));
  await writeLines(join(run.directory,'adjudication.input.jsonl'),selected);
  const a=new Map(passes.a.map(r=>[r.caseId,r])),b=new Map(passes.b.map(r=>[r.caseId,r]));
  await writeLines(join(run.directory,'adjudication.proposals.jsonl'),selected.map(r=>({caseId:r.caseId,proposals:[a.get(r.caseId),b.get(r.caseId)]})));
  const summary={newCount:fresh.length,reusedCount:run.reused.length,agreements:comparisons.filter(r=>r.agrees).length,disagreements:comparisons.filter(r=>!r.agrees).length,reviewRequired:selected.length,auditCases:manifest.auditIds.length,releaseEligible:false};
  await write(join(run.directory,'comparison-summary.json'),summary);return summary;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [command,...args]=process.argv.slice(2),directory=args.includes('--run')?args[args.indexOf('--run')+1]:EXPANSION;
  if(command==='prepare')console.log(JSON.stringify(await prepareExpansion({directory}),null,2));
  else if(command==='compare')console.log(JSON.stringify(await compareExpansion(directory),null,2));
  else if(command==='status'){const r=await readExpansion(directory);console.log(JSON.stringify({total:r.records.length,reused:r.reused.length,new:r.fresh.length,passA:r.passes.a.length,passB:r.passes.b.length,validatedBatches:r.details.filter(d=>d.status==='valid').length,releaseEligible:false},null,2));}
  else throw new Error('Usage: labeling-expansion.mjs prepare|status|compare [--run private-directory]');
}
