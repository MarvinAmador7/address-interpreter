import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash,annotationTokens,validateAnnotation,materializeAnnotation} from './labeling-contract.mjs';
import {verifyActiveCorpus} from './corpus-integrity.mjs';
import {ACTIVE_CORPUS} from './corpus-policy.mjs';
import {artifactHash,inputHash,normalizeReading,evaluateBenchmark,scoreCase,EVALUATOR_HASH,OUTPUT_CONTRACT,NORMALIZATION,METRICS} from './benchmark-contract.mjs';

export const AGENT_BUNDLE='.local/correctness-review/agent-components-v1/bundle.json';
export const PROJECTION='agent-token-components-v1';
const SOURCE_GUIDE=new URL('../docs/labeling-guide-v1.md',import.meta.url);
const GUIDE=new URL('../docs/automated-evaluation-v1.md',import.meta.url);
const SUFFIXES=new URL('./usps-suffix-reference.json',import.meta.url);
const ensure=(value,message)=>{if(!value)throw new Error(message);};
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const lines=text=>text.split('\n').filter(x=>x.trim()).map(JSON.parse);
const privatePath=path=>{const p=resolve(path);ensure(p.split(/[\\/]/).includes('.local'),'Private artifacts must stay under .local');return p;};
const directionals={N:'N',S:'S',E:'E',W:'W',NE:'NE',NW:'NW',SE:'SE',SW:'SW',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',NORTHEAST:'NE',NORTHWEST:'NW',SOUTHEAST:'SE',SOUTHWEST:'SW'};
const designators={APARTMENT:'APT',APT:'APT',BUILDING:'BLDG',BLDG:'BLDG',FLOOR:'FL',FL:'FL',SUITE:'STE',STE:'STE',ROOM:'RM',RM:'RM',UNIT:'UNIT',LOT:'LOT',SPACE:'SPC',SPC:'SPC',DEPARTMENT:'DEPT',DEPT:'DEPT',BASEMENT:'BSMT',BSMT:'BSMT',FRONT:'FRNT',FRNT:'FRNT',LOBBY:'LBBY',LBBY:'LBBY',LOWER:'LOWR',LOWR:'LOWR',OFFICE:'OFC',OFC:'OFC',PENTHOUSE:'PH',PH:'PH',REAR:'REAR',SIDE:'SIDE',TRAILER:'TRLR',TRLR:'TRLR',UPPER:'UPPR',UPPR:'UPPR',PMB:'PMB','#':'#'};
const streetFields=['houseNumber','preDirectional','streetName','streetSuffix','postDirectional','city','state','postalCode','urbanization','country'];
const normal=text=>text.trim().replace(/\s+/gu,' ').toUpperCase();
const observed=(record,ids)=>normal(ids.map((id,i)=>{
  const t=record.tokens[id],previous=record.tokens[ids[i-1]];
  return (previous&&t.start>previous.end?' ':'')+t.raw;
}).join(''));
function tokenAnnotation(label){
  const ids=value=>value.tokenIndices;
  return {caseId:label.caseId,inputSha256:label.inputSha256,status:label.status,complete:label.complete,notes:label.notes,
    readings:label.readings.map(r=>({fields:Object.fromEntries(Object.entries(r.fields).map(([k,v])=>[k,ids(v)])),secondary:r.secondary.map(s=>({kind:s.kind,designator:ids(s.designator),identifier:ids(s.identifier)})),separators:ids(r.separators),unresolved:ids(r.unresolved)}))};
}
export function projectAgentLabel(record,label,suffixes){
  ensure(label && label.caseId===record.caseId,'Missing or mismatched pilot label');
  ensure(label.review?.provisional===true && label.review.humanReviewed===false,'Expected provisional agent provenance');
  ensure(record.inputSha256===hash(record.input.deliveryLine),'Input digest differs');
  ensure(artifactHash(record.tokens)===artifactHash(annotationTokens(record.input.deliveryLine)),'Annotation tokens differ from the exact input');
  const annotation=tokenAnnotation(label),check=validateAnnotation(record,annotation);
  ensure(check.valid,`Invalid token annotation: ${check.errors.join('; ')}`);
  ensure(artifactHash(materializeAnnotation(record,annotation).readings)===artifactHash(label.readings),'Materialized source spans differ');
  const base={caseId:record.caseId,inputHash:inputHash(record.input),status:annotation.status,exhaustive:annotation.complete,readings:[]};
  const warnings=[];
  if(!['address','ambiguous'].includes(base.status))return {annotation:{...base,exhaustive:false},warnings,sourceStatus:annotation.status};
  const readings=[];
  const needsReview=reason=>({annotation:{...base,status:'unresolved',exhaustive:false,readings:[]},warnings:[...warnings,reason],sourceStatus:annotation.status});
  for(const reading of annotation.readings){
    if(Object.keys(reading.fields).some(k=>!streetFields.includes(k)))return needsReview('delivery-kind-needs-component-review');
    const output={};
    for(const [key,ids]of Object.entries(reading.fields)){
      if(!ids.length)continue;
      const raw=observed(record,ids),word=raw.replaceAll('.','');
      output[key]=key==='streetSuffix'?(suffixes[word]??(Object.values(suffixes).includes(word)?word:raw))
        :['preDirectional','postDirectional'].includes(key)?(directionals[word]??raw):raw;
    }
    if(reading.secondary.length)output.secondaryUnits=reading.secondary.map(s=>{
      const result={};
      if(s.designator.length){const raw=observed(record,s.designator),word=raw.replaceAll('.','');result.designator=designators[word]??raw;
        if(!designators[word])warnings.push('literal-secondary-designator-needs-audit');}
      if(s.identifier.length)result.number=observed(record,s.identifier);
      return result;
    });
    try{normalizeReading(output);}catch{return needsReview('component-shape-needs-review');}
    readings.push(output);
  }
  if(new Set(readings.map(r=>artifactHash(normalizeReading(r)))).size!==readings.length)return needsReview('projected-ambiguity-collapsed');
  return {annotation:{...base,readings},warnings:[...new Set(warnings)],sourceStatus:annotation.status};
}

export async function prepareAgentBenchmark({pilot='.local/correctness-review/luna-pilot-v1',output=AGENT_BUNDLE}={}){
  pilot=privatePath(pilot);output=privatePath(output);
  const corpusBytes=await readFile(ACTIVE_CORPUS),corpusManifest=await verifyActiveCorpus(ACTIVE_CORPUS,corpusBytes);
  const manifest=await json(join(pilot,'manifest.json')),receipt=await json(join(pilot,'final-summary.json'));
  const inputBytes=await readFile(join(pilot,'inputs.jsonl')),labelBytes=await readFile(join(pilot,'provisional.labels.jsonl'));
  ensure(hash(inputBytes)===manifest.inputsSha256 && hash(labelBytes)===receipt.outputSha256,'Frozen pilot inputs or labels changed');
  ensure(manifest.split==='development' && manifest.corpusHash===corpusManifest.sha256 && receipt.corpusHash===manifest.corpusHash,'Pilot population differs');
  ensure(hash(await readFile(SOURCE_GUIDE))===manifest.guideSha256 && receipt.guideSha256===manifest.guideSha256,'Frozen source annotation guide changed');
  const records=lines(inputBytes.toString()),labels=lines(labelBytes.toString()),byId=new Map(labels.map(l=>[l.caseId,l])),metadata=new Map(manifest.records.map(r=>[r.caseId,r]));
  ensure(records.length===manifest.count && labels.length===records.length && byId.size===labels.length && new Set(records.map(r=>r.caseId)).size===records.length,'Missing or duplicate pilot cases');
  const corpus=lines(corpusBytes.toString());
  for(const r of records){const meta=metadata.get(r.caseId),row=corpus[meta?.sourceIndex];
    ensure(row?.split==='development' && r.id===meta.id && r.id===hash(`${manifest.corpusHash}\n${meta.sourceIndex}`) && row.listing_address===r.input.deliveryLine && Object.keys(r.input).length===1,'Pilot input is not the pinned development delivery line');}
  const suffixes=await json(SUFFIXES);
  const projected=records.map(r=>projectAgentLabel(r,byId.get(r.caseId),suffixes));
  const sample=records.map(r=>({caseId:r.caseId,split:'development',input:r.input})),annotations=projected.map(r=>r.annotation);
  const bundle={schema:PROJECTION,createdAt:new Date().toISOString(),annotationStatus:'provisional',releaseEligible:false,
    corpusHash:corpusManifest.sha256,policyHash:corpusManifest.policySha256,sourceInputsHash:hash(inputBytes),sourceLabelsHash:hash(labelBytes),
    sourceGuideHash:manifest.guideSha256,guideHash:hash(await readFile(GUIDE)),projectionHash:hash(await readFile(new URL(import.meta.url))),suffixReferenceHash:hash(await readFile(SUFFIXES)),
    sampleHash:artifactHash(sample),annotationHash:artifactHash(annotations),sample,annotations,
    sourceRecords:records,sourceRecordsHash:artifactHash(records),sourceTokenLabelsHash:artifactHash(labels),
    projectionAudit:projected.map((r,i)=>({caseId:records[i].caseId,sourceStatus:r.sourceStatus,warnings:r.warnings,sourceReview:byId.get(records[i].caseId).review})),sourceTokenLabels:labels};
  const bytes=JSON.stringify(bundle,null,2)+'\n';
  await mkdir(resolve(output,'..'),{recursive:true});
  await writeFile(output,bytes,{flag:'wx',mode:0o600});
  const counts={};for(const a of annotations)counts[a.status]=(counts[a.status]??0)+1;
  return {file:output,bundleHash:hash(bytes),cases:sample.length,statuses:counts,projectionWarnings:projected.filter(r=>r.warnings.length).length,releaseEligible:false};
}

export async function readAgentBundle(file=AGENT_BUNDLE){
  const bytes=await readFile(privatePath(file)),bundle=JSON.parse(bytes);
  ensure(bundle.schema===PROJECTION && bundle.annotationStatus==='provisional' && bundle.releaseEligible===false,'Expected a provisional automated bundle');
  ensure(artifactHash(bundle.sample)===bundle.sampleHash && artifactHash(bundle.annotations)===bundle.annotationHash,'Frozen component bundle changed');
  ensure(bundle.projectionHash===hash(await readFile(new URL(import.meta.url))) && bundle.guideHash===hash(await readFile(GUIDE)) && bundle.suffixReferenceHash===hash(await readFile(SUFFIXES)),'Projection implementation or guide changed; create a versioned successor');
  ensure(artifactHash(bundle.sourceRecords)===bundle.sourceRecordsHash && artifactHash(bundle.sourceTokenLabels)===bundle.sourceTokenLabelsHash,'Source token evidence changed');
  const labels=new Map(bundle.sourceTokenLabels.map(l=>[l.caseId,l])),suffixes=await json(SUFFIXES);
  ensure(labels.size===bundle.sourceTokenLabels.length && labels.size===bundle.sourceRecords.length && new Set(bundle.sourceRecords.map(r=>r.caseId)).size===labels.size,'Missing or duplicate source evidence');
  ensure(artifactHash(bundle.sourceRecords.map(r=>({caseId:r.caseId,split:'development',input:r.input})))===bundle.sampleHash,'Sample differs from source evidence');
  ensure(artifactHash(bundle.sourceRecords.map(r=>projectAgentLabel(r,labels.get(r.caseId),suffixes).annotation))===bundle.annotationHash,'Component labels differ from the frozen projection');
  return {bundle,hash:hash(bytes)};
}

export function compareAgentRuns(before,after){
  const old=new Map(before.map(r=>[r.caseId,r]));
  ensure(old.size===before.length && before.length===after.length && new Set(after.map(r=>r.caseId)).size===old.size,'Comparison populations differ');
  const transitions={exactGained:0,exactLost:0,labeledReadingsGained:0,labeledReadingsLost:0};
  const keys=candidates=>new Set(candidates.map(c=>artifactHash(normalizeReading(c.components))));
  for(const current of after){
    const prior=old.get(current.caseId);
    ensure(prior && artifactHash(prior.label)===artifactHash(current.label) && inputHash(prior.input)===inputHash(current.input),'Comparison labels or inputs differ');
    transitions.exactGained+=Number(prior.score.exact===false&&current.score.exact===true);
    transitions.exactLost+=Number(prior.score.exact===true&&current.score.exact===false);
    const a=keys(prior.candidates),b=keys(current.candidates);
    for(const reading of current.label.readings){const key=artifactHash(normalizeReading(reading));
      transitions.labeledReadingsGained+=Number(!a.has(key)&&b.has(key));
      transitions.labeledReadingsLost+=Number(a.has(key)&&!b.has(key));}
  }
  return transitions;
}
export async function evaluateAgentBenchmark({file=AGENT_BUNDLE,current='dist/index.js',baseline,output}={}){
  ensure(output,'Choose a private evaluation directory');output=privatePath(output);
  const {bundle,hash:bundleHash}=await readAgentBundle(file);
  const versions={current,...(baseline?{baseline}:{})},results={},details={};
  for(const [version,path]of Object.entries(versions)){
    const build=await readFile(path),parserHash=hash(build),url=pathToFileURL(resolve(path));url.searchParams.set('sha256',parserHash);
    const library=await import(url);
    results[version]={};details[version]={};
    for(const spellingAlternatives of [false,true]){
      const mode=spellingAlternatives?'with-spelling':'without-spelling';
      const definition={corpusHash:bundle.corpusHash,policyHash:bundle.policyHash,sampleHash:bundle.sampleHash,annotationHash:bundle.annotationHash,guideHash:bundle.guideHash,
        split:'development',annotationStatus:'provisional',outputContract:OUTPUT_CONTRACT,normalization:NORMALIZATION,metrics:METRICS,evaluatorHash:EVALUATOR_HASH,
        parserOptions:{spellingAlternatives},population:`Coverage-selected ${bundle.sample.length}-case Luna development pilot; automated component projection, not population accuracy.`};
      const parsedInputs=new Map();
      results[version][mode]=evaluateBenchmark({definition,sample:bundle.sample,annotations:bundle.annotations,interpret:(input,options)=>{
        const parsed=library.interpretAddress(input,options);parsedInputs.set(inputHash(input),parsed);return parsed;
      },parserHash});
      const labels=new Map(bundle.annotations.map(a=>[a.caseId,a]));
      details[version][mode]=bundle.sample.map(r=>{
        const parsed=parsedInputs.get(inputHash(r.input)),label=labels.get(r.caseId);
        return {caseId:r.caseId,input:r.input,label,score:scoreCase(label,r.input,parsed.candidates),candidates:parsed.candidates};
      });
    }
    ensure(hash(await readFile(path))===parserHash,'Parser build changed during evaluation');
  }
  const transitions={};
  if(baseline)for(const mode of ['without-spelling','with-spelling'])transitions[mode]=compareAgentRuns(details.baseline[mode],details.current[mode]);
  const report={schema:'agent-label-evaluation-v1',recordedAt:new Date().toISOString(),bundleHash,corpusHash:bundle.corpusHash,policyHash:bundle.policyHash,
    annotationStatus:'provisional',evidenceStatus:'experimental',releaseEligible:false,results,transitions};
  await mkdir(resolve(output,'..'),{recursive:true});await mkdir(output);
  await writeFile(join(output,'evaluation.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  await writeFile(join(output,'cases.private.json'),JSON.stringify(details,null,2)+'\n',{flag:'wx',mode:0o600});
  return {file:join(output,'evaluation.json'),report};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [command,...args]=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
  if(command==='prepare')console.log(JSON.stringify(await prepareAgentBenchmark({output:option('--output',AGENT_BUNDLE)}),null,2));
  else if(command==='evaluate'){
    const result=await evaluateAgentBenchmark({file:option('--bundle',AGENT_BUNDLE),current:option('--module','dist/index.js'),baseline:option('--baseline'),
      output:option('--output',`.local/agent-evaluations/${new Date().toISOString().replace(/[:.]/g,'-')}`)});
    console.log(JSON.stringify({file:result.file,releaseEligible:false,results:Object.fromEntries(Object.entries(result.report.results).map(([version,modes])=>[version,Object.fromEntries(Object.entries(modes).map(([mode,r])=>[mode,r.summary]))])),transitions:result.report.transitions},null,2));
  }else throw new Error('Usage: agent-benchmark.mjs prepare|evaluate');
}
