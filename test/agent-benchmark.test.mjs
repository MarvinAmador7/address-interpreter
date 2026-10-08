import {expect,test} from 'vitest';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {annotationTokens,materializeAnnotation,hash} from '../scripts/labeling-contract.mjs';
import {artifactHash,inputHash,scoreCase} from '../scripts/benchmark-contract.mjs';
import {projectAgentLabel,compareAgentRuns,readAgentBundle,evaluateAgentBenchmark,PROJECTION} from '../scripts/agent-benchmark.mjs';

const suffixes=JSON.parse(await readFile(new URL('../scripts/usps-suffix-reference.json',import.meta.url)));
const fixture=(text,reading,status='address')=>{
  const record={caseId:'synthetic-1',id:'synthetic',input:{deliveryLine:text},inputSha256:hash(text),tokens:annotationTokens(text)};
  const label=materializeAnnotation(record,{caseId:record.caseId,inputSha256:record.inputSha256,status,complete:['address','ambiguous'].includes(status),notes:'Synthetic test',readings:reading?[{secondary:[],separators:[],unresolved:[],...reading}]:[]});
  label.review={provisional:true,humanReviewed:false,status:'agent-consensus'};
  return {record,label};
};
const simple=()=>fixture('12 Oak St',{fields:{houseNumber:[0],streetName:[1],streetSuffix:[2]}});

test('projection retains punctuation, zeroes and every ordered secondary component without a parser',()=>{
  const {record,label}=fixture("0012-14 North O'Neil Street Bldg A Floor 02 Apt2-B",{
    fields:{houseNumber:[0,1,2],preDirectional:[3],streetName:[4,5,6],streetSuffix:[7]},
    secondary:[{kind:'building',designator:[8],identifier:[9]},{kind:'floor',designator:[10],identifier:[11]},{kind:'unit',designator:[12],identifier:[13,14,15]}]});
  const result=projectAgentLabel(record,label,suffixes);
  expect(result.annotation.readings).toEqual([{houseNumber:'0012-14',preDirectional:'N',streetName:"O'NEIL",streetSuffix:'ST',secondaryUnits:[{designator:'BLDG',number:'A'},{designator:'FL',number:'02'},{designator:'APT',number:'2-B'}]}]);
  expect(result.warnings).toEqual([]);
});

test('fractional house numbers and joined secondary identifiers retain source boundaries',()=>{
  const {record,label}=fixture('12 1/2 Oak St #03A',{fields:{houseNumber:[0,1,2,3],streetName:[4],streetSuffix:[5]},secondary:[{kind:'unit',designator:[6],identifier:[7,8]}]});
  expect(projectAgentLabel(record,label,suffixes).annotation.readings[0]).toEqual({houseNumber:'12 1/2',streetName:'OAK',streetSuffix:'ST',secondaryUnits:[{designator:'#',number:'03A'}]});
});

test('unknown designators stay literal and receive an audit warning',()=>{
  const {record,label}=fixture('12 Oak St Block B',{fields:{houseNumber:[0],streetName:[1],streetSuffix:[2]},secondary:[{kind:'other',designator:[3],identifier:[4]}]});
  const result=projectAgentLabel(record,label,suffixes);
  expect(result.annotation.readings[0].secondaryUnits).toEqual([{designator:'BLOCK',number:'B'}]);
  expect(result.warnings).toContain('literal-secondary-designator-needs-audit');
});

test('unresolved and unsupported inputs remain in the sample without invented truth',()=>{
  for(const status of ['unresolved','unsupported','non_address']){
    const {record,label}=fixture('Uncertain input',null,status);
    expect(projectAgentLabel(record,label,suffixes).annotation).toMatchObject({status,exhaustive:false,readings:[]});
  }
  const {record,label}=fixture('PO Box 12',{fields:{deliveryType:[0,1],boxNumber:[2]}});
  expect(projectAgentLabel(record,label,suffixes)).toMatchObject({annotation:{status:'unresolved',exhaustive:false,readings:[]},warnings:['delivery-kind-needs-component-review']});
});

test('changed source, raw spans and provenance cannot be scored as valid agent evidence',()=>{
  for(const change of [
    ({record})=>record.input.deliveryLine='13 Oak St',
    ({record})=>record.tokens[0].raw='13',
    ({label})=>label.readings[0].fields.houseNumber.spans[0].raw='13',
    ({label})=>label.review.humanReviewed=true,
    ({label})=>label.caseId='different',
  ]){const f=simple();change(f);expect(()=>projectAgentLabel(f.record,f.label,suffixes)).toThrow();}
  expect(()=>projectAgentLabel(simple().record,undefined,suffixes)).toThrow(/Missing/);
});

test('ambiguity that loses its distinction in component projection stays unresolved',()=>{
  const f=fixture('12 Oak St B',{fields:{houseNumber:[0],streetName:[1],streetSuffix:[2]},secondary:[{kind:'unit',designator:[],identifier:[3]}]});
  f.label.status='ambiguous';
  f.label.readings.push(structuredClone(f.label.readings[0]));
  f.label.readings[1].secondary[0].kind='building';
  expect(projectAgentLabel(f.record,f.label,suffixes)).toMatchObject({annotation:{status:'unresolved'},warnings:['projected-ambiguity-collapsed']});
});

test('comparison detects a lost accepted reading even when another accepted reading replaces it',()=>{
  const input={deliveryLine:'12 Oak St B'},a={houseNumber:'12',streetName:'OAK',streetSuffix:'ST',secondary:{number:'B'}},b={houseNumber:'12',streetName:'OAK ST B'};
  const label={caseId:'s',inputHash:inputHash(input),status:'ambiguous',exhaustive:true,readings:[a,b]};
  const row=components=>({caseId:'s',input,label,candidates:[{components}],score:scoreCase(label,input,[{components}])});
  expect(compareAgentRuns([row(a)],[row(b)])).toEqual({exactGained:0,exactLost:0,labeledReadingsGained:1,labeledReadingsLost:1});
  expect(()=>compareAgentRuns([row(a)],[])).toThrow(/populations/);
});

test('frozen bundle compares both modes on identical labels and rejects edited component truth',async()=>{
  const temporary=await mkdtemp(join(tmpdir(),'agent-benchmark-')),root=join(temporary,'.local');
  await mkdir(root);
  try{
    const {record,label}=simple(),sample=[{caseId:record.caseId,split:'development',input:record.input}],annotations=[projectAgentLabel(record,label,suffixes).annotation];
    const bundle={schema:PROJECTION,annotationStatus:'provisional',releaseEligible:false,corpusHash:'a'.repeat(64),policyHash:'b'.repeat(64),sample,annotations,
      sampleHash:artifactHash(sample),annotationHash:artifactHash(annotations),sourceRecords:[record],sourceRecordsHash:artifactHash([record]),sourceTokenLabels:[label],sourceTokenLabelsHash:artifactHash([label]),
      projectionHash:hash(await readFile(new URL('../scripts/agent-benchmark.mjs',import.meta.url))),guideHash:hash(await readFile(new URL('../docs/automated-evaluation-v1.md',import.meta.url))),suffixReferenceHash:hash(await readFile(new URL('../scripts/usps-suffix-reference.json',import.meta.url)))};
    const file=join(root,'bundle.json'),build=join(root,'parser.mjs');
    await writeFile(file,JSON.stringify(bundle));
    await writeFile(build,`export function interpretAddress(input,options){return {candidates:[{components:{houseNumber:'12',streetName:'OAK',streetSuffix:'ST'}},...(options.spellingAlternatives?[{components:{houseNumber:'12',streetName:'OAKS',streetSuffix:'ST'}}]:[])]}}`);
    const {report}=await evaluateAgentBenchmark({file,current:build,baseline:build,output:join(root,'evaluation')});
    expect(report.releaseEligible).toBe(false);
    expect(report.results.current['without-spelling'].summary.exactInterpretationSet.rate).toBe(1);
    expect(report.results.current['with-spelling'].summary).toMatchObject({exactInterpretationSet:{rate:0},unsupportedReadings:1});
    for(const mode of ['without-spelling','with-spelling'])expect(report.results.current[mode].definition.id).toBe(report.results.baseline[mode].definition.id);
    expect(report.results.current['without-spelling'].definition.id).not.toBe(report.results.current['with-spelling'].definition.id);
    bundle.annotations[0].readings[0].streetName='OAKS';bundle.annotationHash=artifactHash(bundle.annotations);
    await writeFile(file,JSON.stringify(bundle));
    await expect(readAgentBundle(file)).rejects.toThrow(/projection/);
  }finally{await rm(temporary,{recursive:true,force:true});}
});
