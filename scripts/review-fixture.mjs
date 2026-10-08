// Synthetic fixtures for storage and browser verification, never real reviews.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {annotationTokens,hash} from './labeling-contract.mjs';
import {createWorkspace} from './review-workspace.mjs';
export function syntheticCase(caseId='synthetic-1',text='12 Oak St Bldg A Floor 2 Apt 4') {
  const input={deliveryLine:text},tokens=annotationTokens(text),inputSha256=hash(text);
  const annotation={caseId,inputSha256,status:'address',complete:true,notes:'',readings:[{
    fields:{houseNumber:[0],streetName:[1],streetSuffix:[2]},
    secondary:[{kind:'building',designator:[3],identifier:[4]},{kind:'floor',designator:[5],identifier:[6]},{kind:'unit',designator:[7],identifier:[8]}],separators:[],unresolved:[]} ]};
  return {caseId,input,inputSha256,tokens,reasons:['consensus-audit'],proposals:['Luna pass A','Luna pass B','Agent adjudication / consensus'].map(name=>({name,annotation:structuredClone(annotation)}))};
}
export function syntheticReview(record) {return {annotation:structuredClone(record.proposals[0].annotation),exposedBefore:false,
  components:[{houseNumber:'12',streetName:'OAK',streetSuffix:'ST',secondaryUnits:[{designator:'BLDG',number:'A'},{designator:'FL',number:'2'},{designator:'APT',number:'4'}]}]};}
export async function reviewFixture(){
  const root=await mkdtemp(join(tmpdir(),'address-review-test-')),directory=join(root,'.local','review');
  const records=[syntheticCase(),syntheticCase('synthetic-2')];
  const manifest=await createWorkspace(directory,records,{corpusHash:hash('synthetic corpus'),policyHash:hash('synthetic policy'),pilotInputsHash:hash('synthetic inputs'),pilotFinalHash:hash('synthetic labels')});
  return {root,directory,records,manifest,cleanup:()=>rm(root,{recursive:true,force:true})};
}
