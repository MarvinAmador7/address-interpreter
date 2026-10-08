import {readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readExpansion, EXPANSION} from './labeling-expansion.mjs';
import {validateBatch, comparePasses} from './labeling-pilot.mjs';
import {hash, annotationKey, materializeAnnotation} from './labeling-contract.mjs';

const ensure=(condition,message)=>{if(!condition)throw new Error(message);};
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const lines=async p=>(await readFile(p,'utf8')).split('\n').filter(x=>x.trim()).map(JSON.parse);
const write=(p,v)=>writeFile(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
const validate=(records,labels)=>{const check=validateBatch(records,labels);ensure(check.valid,JSON.stringify(check.errors));};

export function requiredReviews(run){
  validate(run.fresh,run.passes.a);validate(run.fresh,run.passes.b);
  const comparisons=comparePasses(run.fresh,run.passes.a,run.passes.b,run.manifest.auditIds);
  const required=new Set(comparisons.filter(r=>r.reviewRequired).map(r=>r.caseId));
  return {comparisons,records:run.fresh.filter(r=>required.has(r.caseId))};
}

export async function freezeReview(directory=EXPANSION){
  const run=await readExpansion(directory),{records}=requiredReviews(run);
  const bytes=await readFile(join(run.directory,'adjudication-blind.labels.jsonl'));
  validate(records,await lines(join(run.directory,'adjudication-blind.labels.jsonl')));
  const receipt={createdAt:new Date().toISOString(),model:'gpt-6-luna',role:'independent-blind-adjudicator',count:records.length,
    sha256:hash(bytes),proposalsSha256:hash(await readFile(join(run.directory,'adjudication.proposals.jsonl'))),
    inputSha256:hash(await readFile(join(run.directory,'adjudication.input.jsonl')))};
  await write(join(run.directory,'adjudication-blind.freeze.json'),receipt);return receipt;
}

export function combineExpansion(run,blind,adjudicated,decisions){
  const {records,comparisons}=requiredReviews(run);
  validate(records,blind);validate(records,adjudicated);
  const required=new Set(records.map(r=>r.caseId)),byId=xs=>new Map(xs.map(r=>[r.caseId,r]));
  const a=byId(run.passes.a),b=byId(run.passes.b),c=byId(adjudicated),d=byId(blind),reused=byId(run.reused),notes=byId(decisions);
  ensure(notes.size===decisions.length && notes.size===required.size && [...notes].every(([id,r])=>required.has(id)&&typeof r.reason==='string'&&r.reason.trim()),'Missing, duplicate or invalid adjudication decisions');
  const labels=run.records.map(record=>{
    if(reused.has(record.caseId))return reused.get(record.caseId);
    const selected=required.has(record.caseId)?c.get(record.caseId):a.get(record.caseId);
    return {...materializeAnnotation(record,selected),review:{status:!selected.complete?'unresolved':required.has(record.caseId)?'agent-adjudicated':'agent-consensus',
      provisional:true,humanReviewed:false,inputBlindAudit:run.manifest.auditIds.includes(record.caseId),annotators:['gpt-6-luna/pass-a','gpt-6-luna/pass-b'],
      adjudicator:required.has(record.caseId)?'gpt-6-luna/independent-adjudicator':null}};
  });
  ensure(labels.length===run.manifest.count && new Set(labels.map(r=>r.caseId)).size===labels.length,'Final population differs');
  let consensusAuditCases=0,consensusAuditDisagreements=0,consensusOverturned=0;
  for(const id of run.manifest.auditIds){if(annotationKey(a.get(id))!==annotationKey(b.get(id)))continue;consensusAuditCases++;
    consensusAuditDisagreements+=Number(annotationKey(a.get(id))!==annotationKey(d.get(id)));
    consensusOverturned+=Number(annotationKey(a.get(id))!==annotationKey(c.get(id)));}
  const statuses={};for(const l of labels)statuses[l.status]=(statuses[l.status]??0)+1;
  return {labels,summary:{prepared:labels.length,newCount:run.fresh.length,reusedCount:run.reused.length,
    agreements:comparisons.filter(r=>r.agrees).length,disagreements:comparisons.filter(r=>!r.agrees).length,adjudicated:required.size,
    agentAccepted:labels.filter(r=>r.complete).length,unresolved:labels.filter(r=>!r.complete).length,statuses,
    auditCases:run.manifest.auditIds.length,consensusAuditCases,consensusAuditDisagreements,consensusOverturned,
    model:'gpt-6-luna',humanReviewed:0,correctness:'not-measured',provisional:true,releaseEligible:false,targetMet:false,tokenUsage:null,costUsd:null}};
}

export async function finishExpansion(directory=EXPANSION){
  const run=await readExpansion(directory),receipt=await json(join(run.directory,'adjudication-blind.freeze.json'));
  const evidence={};for(const name of ['adjudication-blind.labels.jsonl','adjudication.proposals.jsonl','adjudication.input.jsonl','adjudicated.labels.jsonl','adjudication-decisions.jsonl'])evidence[name]=hash(await readFile(join(run.directory,name)));
  ensure(receipt.sha256===evidence['adjudication-blind.labels.jsonl'] && receipt.proposalsSha256===evidence['adjudication.proposals.jsonl'] && receipt.inputSha256===evidence['adjudication.input.jsonl'],'Frozen blind review evidence changed');
  const {labels,summary}=combineExpansion(run,await lines(join(run.directory,'adjudication-blind.labels.jsonl')),await lines(join(run.directory,'adjudicated.labels.jsonl')),await lines(join(run.directory,'adjudication-decisions.jsonl')));
  const content=labels.map(r=>JSON.stringify(r)).join('\n')+'\n';
  await write(join(run.directory,'provisional.labels.jsonl'),content);
  const final={schemaVersion:'labeling-expansion-final-v1',...summary,completedAt:new Date().toISOString(),corpusHash:run.manifest.corpusHash,guideSha256:run.manifest.guideSha256,
    outputSha256:hash(content),protocolSha256:run.manifest.protocolSha256,preparationSha256:run.manifest.coordinatorSha256,finalizerSha256:hash(await readFile(new URL(import.meta.url))),
    contractSha256:hash(await readFile('scripts/labeling-contract.mjs')),previous:run.manifest.previous,evidence,batchEvidence:run.details,
    measurementNote:'Two blind Luna passes and a separate Luna adjudicator; correlated model errors remain possible. Coverage-selected development evidence, not verified accuracy. Billing is unavailable, not zero.'};
  await write(join(run.directory,'final-summary.json'),final);return summary;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [command,...args]=process.argv.slice(2),directory=args.includes('--run')?args[args.indexOf('--run')+1]:EXPANSION;
  if(command==='freeze-review')console.log(JSON.stringify(await freezeReview(directory),null,2));
  else if(command==='finalize')console.log(JSON.stringify(await finishExpansion(directory),null,2));
  else throw new Error('Usage: finish-labeling-expansion.mjs freeze-review|finalize [--run private-directory]');
}
