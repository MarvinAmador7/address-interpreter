import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash, annotationKey, annotationTokens, validateAnnotation } from './labeling-contract.mjs';
import { inspectBatches } from './labeling-batches.mjs';
import { normalizeReading, inputHash, artifactHash } from './benchmark-contract.mjs';
import { componentReading, FIELD_NAMES } from './review-fields.mjs';

export const DEFAULT_REVIEW = '.local/correctness-review/human-calibration-v1';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const lines = text => text.split('\n').filter(s => s.trim()).map(JSON.parse);
const local = path => { const p = resolve(path); if (!p.split(/[\\/]/).includes('.local')) throw new Error('Review data must stay in .local'); return p; };
const ensure = (value, message, status = 400) => { if (!value) throw Object.assign(new Error(message), { status }); };
const rank = (seed, id) => hash(`${seed}\n${id}`);
const ordered = (items, seed) => [...items].sort((a,b) => rank(seed,a.caseId).localeCompare(rank(seed,b.caseId)));
const protocol = async () => hash(Buffer.concat(await Promise.all(['docs/human-calibration-v1.md','docs/labeling-guide-v1.md','scripts/review-fields.mjs','scripts/usps-suffix-reference.json','scripts/labeling-contract.mjs','scripts/benchmark-contract.mjs'].map(p => readFile(p)))));

export function selectCalibration(records, a, b, final, count = 20) {
  const map = rows => new Map(rows.map(r => [r.caseId,r]));
  const aa=map(a), bb=map(b), ff=map(final);
  ensure(records.every(r => aa.has(r.caseId) && bb.has(r.caseId) && ff.has(r.caseId)), 'Pilot annotations are incomplete');
  const agrees = r => annotationKey(aa.get(r.caseId)) === annotationKey(bb.get(r.caseId));
  const consensus = new Set(ordered(records.filter(agrees), 'human-calibration-v1/consensus').slice(0,count).map(r => r.caseId));
  return ordered(records.map(r => ({...r, reasons: [
    ...(!agrees(r) ? ['model-disagreement'] : []),
    ...(!['address','ambiguous'].includes(ff.get(r.caseId).status) ? ['unresolved-after-adjudication'] : []),
    ...(consensus.has(r.caseId) ? ['consensus-audit'] : []),
  ]})).filter(r => r.reasons.length), 'human-calibration-v1/order');
}
function dematerialize(label) {
  const ids = evidence => evidence.tokenIndices;
  return {caseId:label.caseId,inputSha256:label.inputSha256,status:label.status,complete:label.complete,notes:label.notes,
    readings:label.readings.map(r => ({fields:Object.fromEntries(Object.entries(r.fields).map(([k,v])=>[k,ids(v)])),
      secondary:r.secondary.map(s=>({kind:s.kind,designator:ids(s.designator),identifier:ids(s.identifier)})),separators:ids(r.separators),unresolved:ids(r.unresolved)}))};
}
export async function prepareWorkspace(directory = DEFAULT_REVIEW, pilot = '.local/correctness-review/luna-pilot-v1') {
  directory=local(directory); pilot=local(pilot);
  const {records,annotations}=await inspectBatches(pilot);
  const manifest=await json(join(pilot,'manifest.json'));
  const finalBytes=await readFile(join(pilot,'provisional.labels.jsonl'));
  const finalSummary=await json(join(pilot,'final-summary.json'));
  ensure(hash(finalBytes)===finalSummary.outputSha256, 'Frozen adjudicated labels changed');
  const final=lines(finalBytes.toString()).map(dematerialize);
  const selected=selectCalibration(records,annotations.a,annotations.b,final);
  const byId = xs => new Map(xs.map(x=>[x.caseId,x]));
  const a=byId(annotations.a),b=byId(annotations.b),f=byId(final);
  const cases=selected.map(r=>({caseId:r.caseId,input:r.input,inputSha256:r.inputSha256,tokens:annotationTokens(r.input.deliveryLine),reasons:r.reasons,
    proposals:[{name:'Luna pass A',annotation:a.get(r.caseId)},{name:'Luna pass B',annotation:b.get(r.caseId)},{name:'Agent adjudication / consensus',annotation:f.get(r.caseId)}]}));
  return createWorkspace(directory,cases,{corpusHash:manifest.corpusHash,
    policyHash:(await json('.local/corpus/mls-valid.manifest.json')).policySha256,
    pilotInputsHash:manifest.inputsSha256,pilotFinalHash:hash(finalBytes)});
}
export async function createWorkspace(directory,cases,provenance) {
  directory=local(directory);
  ensure(Array.isArray(cases) && cases.length>0 && new Set(cases.map(r=>r.caseId)).size===cases.length,'Unique nonempty calibration cases required');
  for(const record of cases){
    ensure(record.inputSha256===hash(record.input.deliveryLine) && JSON.stringify(record.tokens)===JSON.stringify(annotationTokens(record.input.deliveryLine)),'Input evidence differs');
    ensure(record.proposals.length===3 && record.proposals.every(p=>validateAnnotation(record,p.annotation).valid),'Invalid frozen proposals');
  }
  for(const key of ['corpusHash','policyHash','pilotInputsHash','pilotFinalHash'])ensure(/^[a-f0-9]{64}$/.test(provenance[key]),`Missing ${key}`);
  const bytes=JSON.stringify(cases,null,2)+'\n';
  const snapshot={schema:'human-calibration-workspace-v1',createdAt:new Date().toISOString(),protocolHash:await protocol(),
    guideHash:hash(await readFile('docs/human-calibration-v1.md')),...provenance,casesHash:hash(bytes),count:cases.length,batchSize:20,
    selection:'All pilot disagreements and unresolved cases plus 20 hash-selected consensus cases; mixed frozen order. Targeted development calibration, not population accuracy.',
    selectionSeeds:['human-calibration-v1/consensus','human-calibration-v1/order'],releaseEligible:false};
  await mkdir(resolve(directory,'..'),{recursive:true});
  await mkdir(directory,{mode:0o700}); // Existing sessions must never be replaced.
  await writeFile(join(directory,'cases.json'),bytes,{flag:'wx',mode:0o600});
  await writeFile(join(directory,'manifest.json'),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o600});
  await writeFile(join(directory,'events.jsonl'),'',{flag:'wx',mode:0o600});
  return snapshot;
}

export function validateReview(record, payload, suffixes) {
  ensure(payload && typeof payload==='object' && !Array.isArray(payload),'Review is missing');
  const {annotation,components,exposedBefore}=payload;
  ensure(typeof exposedBefore==='boolean','Declare prior exposure');
  const check=validateAnnotation(record,annotation);
  ensure(check.valid,check.errors.join('; '));
  ensure(Array.isArray(components) && components.length===annotation.readings.length,'Each reading needs canonical components');
  const supported=['address','ambiguous'].includes(annotation.status);
  if (!supported) ensure(annotation.readings.length===0,'For uncertain or unsupported cases, save a reason without partial readings');
  const canonical=[];
  for (const [i,reading] of annotation.readings.entries()) {
    ensure(Object.keys(reading.fields).every(k=>k in FIELD_NAMES),'This editor supports street addresses; mark other forms unsupported');
    const expected=componentReading(record,reading,suffixes),actual=components[i];
    ensure(actual && Object.keys(actual).sort().join()===Object.keys(expected).sort().join(),'Components must correspond to the assigned source fields');
    const chain=actual.secondaryUnits ?? [], evidence=expected.secondaryUnits ?? [];
    ensure(chain.length===evidence.length && chain.every((s,j)=>Object.keys(s).sort().join()===Object.keys(evidence[j]).sort().join()),'Every secondary needs its own source evidence');
    const normalized=normalizeReading(actual);
    if (JSON.stringify(normalized)!==JSON.stringify(normalizeReading(expected)))
      ensure(annotation.notes.trim(),'Explain canonical values changed from the source suggestion');
    canonical.push(JSON.stringify(normalized));
  }
  ensure(new Set(canonical).size===canonical.length,'Accepted readings must have distinct components');
  return structuredClone({annotation,components,exposedBefore});
}

export async function openWorkspace(directory=DEFAULT_REVIEW, {readOnly=false}={}) {
  directory=local(directory);
  const manifest=await json(join(directory,'manifest.json'));
  ensure(manifest.protocolHash===await protocol(),'Review protocol changed. Preserve this workspace and prepare a versioned successor.');
  const bytes=await readFile(join(directory,'cases.json'));
  ensure(hash(bytes)===manifest.casesHash,'Frozen calibration inputs or proposals changed');
  const cases=JSON.parse(bytes),records=new Map(cases.map(r=>[r.caseId,r]));
  ensure(records.size===cases.length,'Duplicate calibration case');
  const suffixes=await json('scripts/usps-suffix-reference.json');
  const lockPath=join(directory,'server.lock'); let locked=false;
  if (!readOnly) {
    try {const lock=await open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));await lock.close();locked=true;}
    catch(error) { if(error.code!=='EEXIST')throw error; throw new Error('This workspace is already open. Stop its review server before starting another.'); }
  }
  let profile=null,sequence=0,lastHash=manifest.casesHash;
  const states=new Map(cases.map(r=>[r.caseId,{revision:0,draft:null,blind:null,final:null}]));
  const apply=event=>{
    if(event.action==='profile') profile=event.payload;
    else {const s=states.get(event.caseId);ensure(s,'Unknown journal case');s.revision++;if(event.action==='draft')s.draft=event.payload;
      if(event.action==='blind'){s.blind=event.payload;s.draft=null;}
      if(event.action==='final'){s.final=event.payload;s.draft=null;}}
    sequence=event.sequence;lastHash=event.hash;
  };
  try {
    const journal=await readFile(join(directory,'events.jsonl'),'utf8');
    ensure(!journal || journal.endsWith('\n'),'Incomplete journal write. Preserve the file for recovery; no records were discarded.');
    for(const event of lines(journal)){
      const {hash:digest,...body}=event;
      ensure(body.sequence===sequence+1 && body.previous===lastHash && hash(JSON.stringify(body))===digest,'Review journal integrity check failed');
      ensure(['profile','draft','blind','final'].includes(event.action),'Unknown journal action');apply(event);
    }
  } catch(error) {if(locked)await unlink(lockPath);throw error;}
  let pending=Promise.resolve();
  const append=async(action,caseId,payload)=>{
    const body={sequence:sequence+1,previous:lastHash,at:new Date().toISOString(),action,caseId,payload:structuredClone(payload)};
    const event={...body,hash:hash(JSON.stringify(body))};
    const file=await open(join(directory,'events.jsonl'),'a',0o600);
    try {await file.writeFile(JSON.stringify(event)+'\n');await file.sync();}finally{await file.close();}
    apply(event);
  };
  const publicCase=id=>{
    const r=records.get(id),s=states.get(id);ensure(r,'Unknown case',404);
    return {caseId:r.caseId,input:r.input,inputSha256:r.inputSha256,tokens:r.tokens,...structuredClone(s),
      ...(s.blind?{proposals:r.proposals,reasons:r.reasons}:{}),stage:s.final?'final':s.blind?'compare':'blind'};
  };
  const overview=()=>({profile,protocol:'human-calibration-v1',batchSize:manifest.batchSize,total:cases.length,
    finalized:[...states.values()].filter(s=>s.final).length,releaseEligible:false,
    cases:cases.map(r=>({caseId:r.caseId,stage:states.get(r.caseId).final?'final':states.get(r.caseId).blind?'compare':'blind'})),suffixes});
  const mutate=(action,id,body)=>{
    const work=pending.then(async()=>{
      ensure(!readOnly,'Workspace is read-only',403);
      if(action==='profile'){
        ensure(!profile,'Reviewer is already recorded',409);
        ensure(typeof body.name==='string' && body.name.trim() && body.name.length<=100,'Enter your name');
        ensure(['data-product','address-specialist','other'].includes(body.experience),'Choose your experience');
        await append('profile',null,{name:body.name.trim(),experience:body.experience,selfReported:true});return overview();
      }
      ensure(profile,'Set your reviewer identity first');
      const record=records.get(id),state=states.get(id);ensure(record,'Unknown case',404);
      ensure(body.revision===state.revision,'This case changed in another tab. Reload before editing.',409);
      ensure(['draft','blind','final'].includes(action),'Unknown action');
      if(action==='draft') {
        ensure(body.payload && typeof body.payload==='object','Draft is missing');
        await append(action,id,{...body.payload,phase:state.blind?'compare':'blind'});
      } else {
        ensure(body.confirmed===true,'Confirm your review before saving');
        ensure(action==='blind'?!state.blind:!!state.blind,action==='blind'?'Initial reading is already frozen':'Save an initial reading before comparing',409);
        const payload=validateReview(record,body.payload,suffixes);
        if(action==='final'){
          ensure(payload.exposedBefore===state.blind.exposedBefore,'Prior exposure declaration is frozen with the initial reading');
          const changed=annotationKey(payload.annotation)!==annotationKey(state.blind.annotation) || artifactHash(payload.components)!==artifactHash(state.blind.components);
          ensure(!changed || payload.annotation.notes.trim(),'Explain why your final decision differs from your initial reading');
        }
        await append(action,id,{...payload,reviewer:profile});
      }
      return publicCase(id);
    });pending=work.catch(()=>{});return work;
  };
  const exportReview=()=>({schema:'human-calibration-export-v1',exportedAt:new Date().toISOString(),manifest,reviewer:profile,journalHead:lastHash,
    annotationStatus:'provisional',releaseEligible:false,
    sample:cases.map(r=>({caseId:r.caseId,split:'development',input:r.input})),
    annotations:cases.map(r=>{
      const s=states.get(r.caseId),v=s.final;
      return {caseId:r.caseId,inputHash:inputHash(r.input),status:v?.annotation.status ?? 'unresolved',exhaustive:v?.annotation.complete ?? false,
        readings:v?.components ?? [],review:{status:v?'human-reviewed-provisional':'unreviewed',blind:s.blind,final:v,revision:s.revision}};
    })});
  return {directory,manifest,overview,publicCase,mutate,exportReview,close:async()=>{await pending;if(locked){await unlink(lockPath);locked=false;}}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
  ensure(args[0]==='prepare','Usage: review-workspace.mjs prepare [--output .local/...]');
  const result=await prepareWorkspace(option('--output',DEFAULT_REVIEW));
  console.log(JSON.stringify({prepared:result.count,batchSize:result.batchSize,releaseEligible:false}));
}
