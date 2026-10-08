import {FIELD_NAMES,SECONDARY_NAMES,STATUS_NAMES,sourceText,componentReading,blankReading} from '/review-fields.mjs';
const $=id=>document.getElementById(id),copy=x=>structuredClone(x),esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const primary=['houseNumber','preDirectional','streetName','streetSuffix','postDirectional'];
let session,record,draft,reading=0,selected=new Set(),batch=0,timer,changes=0,saved=0,pending=Promise.resolve(),busy=false;
const supported=()=>['address','ambiguous'].includes(draft.annotation.status);
const active=()=>draft.annotation.readings[reading];
const showError=error=>{$('message').textContent=error.message ?? error;$('message').hidden=false;};
const clearError=()=>{$('message').hidden=true;};
async function api(path,body){
  const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
}
function initial(r){return {annotation:{caseId:r.caseId,inputSha256:r.inputSha256,status:'address',complete:true,readings:[blankReading()],notes:''},components:[{}],exposedBefore:false};}
function payload(){
  const p=copy(draft);p.annotation.complete=supported();
  if(!supported()){p.annotation.readings=[];p.components=[];}
  return p;
}
function markDirty(){changes++;$('confirmed').checked=false;$('save-state').textContent='Unsaved changes';clearTimeout(timer);timer=setTimeout(()=>saveDraft().catch(showError),650);}
function saveDraft(){
  clearTimeout(timer);
  if(!record || changes===saved)return pending;
  const id=record.caseId,value=copy(draft),version=changes;
  const task=pending.then(async()=>{
    $('save-state').textContent='Saving draft…';
    const response=await api(`/api/case/${id}/draft`,{revision:record.revision,payload:value});
    record.revision=response.revision;saved=version;
    $('save-state').textContent=changes===saved?'Draft saved locally':'Unsaved changes';
  });pending=task.catch(()=>{});return task;
}
function refreshQueue(){
  $('reviewer-name').textContent=session.profile?.name ?? 'Local calibration';
  $('progress').textContent=`${session.finalized} of ${session.total} finalized · review in batches of ${session.batchSize}`;
  $('batch').innerHTML=Array.from({length:Math.ceil(session.total/session.batchSize)},(_,i)=>`<option value="${i}">Batch ${i+1} · ${i*session.batchSize+1}–${Math.min((i+1)*session.batchSize,session.total)}</option>`).join('');$('batch').value=batch;
  const offset=batch*session.batchSize;
  $('queue').innerHTML=session.cases.slice(offset,offset+session.batchSize).map((r,i)=>`<button type="button" data-case="${esc(r.caseId)}" aria-current="${r.caseId===record?.caseId}" aria-label="Case ${offset+i+1}, ${r.stage==='final'?'finalized':r.stage==='compare'?'ready to compare':'initial review'}" class="${r.stage==='final'?'done':r.stage==='compare'?'comparing':''}">${r.stage==='final'?'✓':offset+i+1}</button>`).join('');
  for(const button of $('queue').querySelectorAll('button'))button.onclick=()=>loadCase(button.dataset.case).catch(showError);
}
async function loadCase(id){
  if(busy)return;busy=true;
  try{
    await saveDraft();
    const next=await api('/api/case/'+id);
    record=next;draft=copy(next.draft ?? next.final ?? next.blind ?? initial(next));
    if(!draft.annotation.readings.length){draft.annotation.readings=[blankReading()];draft.components=[{}];}
    changes=0;saved=0;reading=0;selected.clear();clearError();
    batch=Math.floor(session.cases.findIndex(r=>r.caseId===id)/session.batchSize);
    $('confirmed').checked=false;refreshQueue();render();$('workspace').focus({preventScroll:true});
  }finally{busy=false;}
}
function assignedTokens(r){
  const map=new Map();
  for(const [field,ids]of Object.entries(r.fields))for(const id of ids)map.set(id,FIELD_NAMES[field]);
  for(const [i,s]of r.secondary.entries())for(const id of [...s.designator,...s.identifier])map.set(id,`${SECONDARY_NAMES[s.kind]} ${i+1}`);
  for(const id of r.separators)map.set(id,'Formatting punctuation');
  return map;
}
function fieldRow(role,ids,value,label){return `<div class="field-row"><button class="assign" type="button" data-role="${esc(role)}" title="Assign selected source pieces"><span>${esc(label)}</span><small>${esc(ids.length?sourceText(record,ids):'Select source pieces to assign')}</small></button><input data-value="${esc(role)}" aria-label="${esc(label)} canonical value" value="${esc(value)}" ${ids.length?'':'disabled'}><button class="remove" type="button" data-clear="${esc(role)}" aria-label="Clear ${esc(label)}">×</button></div>`;}
function renderEditor(){
  $('supported-editor').hidden=!supported();if(!supported())return;
  const r=active(),c=draft.components[reading],assigned=assignedTokens(r);
  $('reading-tabs').innerHTML=draft.annotation.readings.map((_,i)=>`<button type="button" data-reading="${i}" aria-pressed="${reading===i}">Reading ${i+1}</button>`).join('');
  $('remove-reading').disabled=draft.annotation.readings.length===1;
  $('tokens').innerHTML=record.tokens.map(t=>`<button type="button" data-token="${t.index}" aria-pressed="${selected.has(t.index)}" aria-label="${esc(t.raw)}, ${esc(assigned.get(t.index)??'unassigned')}" class="${assigned.has(t.index)?'assigned':''}" title="${esc(assigned.get(t.index)??'Unassigned')}">${esc(t.raw)}</button>`).join('');
  $('selection-count').textContent=selected.size?`${selected.size} selected`:'';
  $('coverage').textContent=`${record.tokens.length-assigned.size} pieces unassigned`;
  const fields=[...primary,...Object.keys(r.fields).filter(k=>!primary.includes(k))];
  $('fields').innerHTML=fields.map(k=>fieldRow('fields.'+k,r.fields[k]??[],c[k]??'',FIELD_NAMES[k])).join('');
  $('extra-field').innerHTML=Object.keys(FIELD_NAMES).filter(k=>!fields.includes(k)).map(k=>`<option value="${k}">${FIELD_NAMES[k]}</option>`).join('');
  $('add-field').disabled=!$('extra-field').options.length;
  $('secondaries').innerHTML=r.secondary.map((s,i)=>`<section class="secondary"><div class="secondary-heading"><label>Secondary ${i+1}<select data-kind="${i}" aria-label="Secondary ${i+1} kind">${Object.entries(SECONDARY_NAMES).map(([k,v])=>`<option value="${k}" ${k===s.kind?'selected':''}>${v}</option>`).join('')}</select></label><button type="button" class="text-button" data-remove-secondary="${i}">Remove</button></div>${fieldRow(`secondary.${i}.designator`,s.designator,c.secondaryUnits?.[i]?.designator??'',`Secondary ${i+1} designator`)}${fieldRow(`secondary.${i}.identifier`,s.identifier,c.secondaryUnits?.[i]?.number??'',`Secondary ${i+1} identifier`)}</section>`).join('');
  $('separators').textContent=sourceText(record,r.separators);
  for(const button of $('tokens').querySelectorAll('button'))button.onclick=()=>{const n=Number(button.dataset.token);selected.has(n)?selected.delete(n):selected.add(n);renderEditor();$('tokens').querySelector(`[data-token="${n}"]`).focus();};
  for(const button of $('reading-tabs').querySelectorAll('button'))button.onclick=()=>{reading=Number(button.dataset.reading);selected.clear();renderEditor();};
  for(const button of document.querySelectorAll('[data-role]'))button.onclick=()=>assign(button.dataset.role);
  for(const button of document.querySelectorAll('[data-clear]'))button.onclick=()=>changeRoles(r=>setRole(r,button.dataset.clear,[]));
  for(const input of document.querySelectorAll('[data-value]'))input.oninput=()=>{
    const parts=input.dataset.value.split('.');
    if(parts[0]==='fields')draft.components[reading][parts[1]]=input.value;
    else {const part=parts[2]==='identifier'?'number':'designator';draft.components[reading].secondaryUnits[Number(parts[1])][part]=input.value;}
    markDirty();
  };
  for(const select of document.querySelectorAll('[data-kind]'))select.onchange=()=>changeRoles(r=>{r.secondary[Number(select.dataset.kind)].kind=select.value;});
  for(const button of document.querySelectorAll('[data-remove-secondary]'))button.onclick=()=>changeRoles(r=>r.secondary.splice(Number(button.dataset.removeSecondary),1));
}
function setRole(r,role,ids){const parts=role.split('.');if(parts[0]==='fields')r.fields[parts[1]]=ids;else if(parts[0]==='secondary')r.secondary[Number(parts[1])][parts[2]]=ids;else r.separators=ids;}
function getRole(r,role){const parts=role.split('.');return parts[0]==='fields'?r.fields[parts[1]]??[]:parts[0]==='secondary'?r.secondary[Number(parts[1])][parts[2]]:r.separators;}
function changeRoles(fn){
  const old=copy(active()),values=copy(draft.components[reading]);fn(active());
  const r=active(),next=componentReading(record,r,session.suffixes);
  for(const field of Object.keys(next))if(field!=='secondaryUnits' && JSON.stringify(r.fields[field])===JSON.stringify(old.fields[field]) && values[field]!==undefined)next[field]=values[field];
  r.secondary.forEach((s,i)=>{if(JSON.stringify(s)===JSON.stringify(old.secondary[i]) && values.secondaryUnits?.[i])next.secondaryUnits[i]=values.secondaryUnits[i];});
  draft.components[reading]=next;selected.clear();markDirty();renderEditor();
}
function assign(role){
  if(!selected.size){showError('Select source pieces above, then choose their field.');return;}
  if(role==='separators' && [...selected].some(i=>! /^[.,;:]$/.test(record.tokens[i].raw))){showError('Only formatting periods, commas, colons and semicolons can be separators. Keep meaningful punctuation with its field.');return;}
  clearError();const chosen=new Set(selected);
  changeRoles(r=>{
    for(const k of Object.keys(r.fields))r.fields[k]=r.fields[k].filter(i=>!chosen.has(i));
    for(const s of r.secondary){s.designator=s.designator.filter(i=>!chosen.has(i));s.identifier=s.identifier.filter(i=>!chosen.has(i));}
    r.separators=r.separators.filter(i=>!chosen.has(i));
    setRole(r,role,[...getRole(r,role),...chosen].sort((a,b)=>a-b));
  });
}
function proposalMarkup(name,p,index){
  return `<section class="proposal"><h3>${esc(name)}</h3><p class="proposal-status">${esc(STATUS_NAMES[p.annotation.status])}</p>${p.annotation.readings.map((r,i)=>{
    const c=p.components?.[i] ?? componentReading(record,r,session.suffixes);
    return `<dl>${p.annotation.readings.length>1?`<dt>Reading ${i+1}</dt>`:''}${Object.entries(c).filter(([k])=>k!=='secondaryUnits').map(([k,v])=>`<div><dt>${esc(FIELD_NAMES[k]??k)}</dt><dd>${esc(v)}</dd></div>`).join('')}${(c.secondaryUnits??[]).map((s,j)=>`<div><dt>Secondary ${j+1}</dt><dd>${esc([s.designator,s.number].filter(Boolean).join(' '))}</dd></div>`).join('')}</dl>`;
  }).join('')}${p.annotation.notes?`<p class="note">${esc(p.annotation.notes)}</p>`:''}<button type="button" data-proposal="${index}">${index===-1?'Restore my initial reading':'Load for editing'}</button></section>`;
}
function render(){
  const index=session.cases.findIndex(r=>r.caseId===record.caseId);
  $('case-number').textContent=`Case ${index+1} of ${session.total}`;
  $('phase').textContent=record.stage==='final'?'Finalized · revisions allowed':record.blind?'2 · Compare & finalize':'1 · Your initial reading';
  $('save-state').textContent=record.draft?'Draft restored':record.final?'Final decision saved':record.blind?'Initial reading frozen':'No changes yet';
  $('address').textContent=record.input.deliveryLine;
  $('phase-help').textContent=record.blind?'Compare the proposals, make any changes, and save your final decision. Your original reading stays in the record.':'Read only this text. Assign every source piece, or mark the case unsure with a short reason.';
  $('status').innerHTML=Object.entries(STATUS_NAMES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');$('status').value=draft.annotation.status;
  $('notes').value=draft.annotation.notes;$('exposed').checked=draft.exposedBefore;$('exposed').disabled=!!record.blind;
  $('save-review').textContent=record.blind?(record.final?'Save revised final decision':'Finalize review & continue'):'Save initial reading & compare';
  $('blind-help').hidden=!!record.blind;$('comparison').hidden=!record.blind;
  if(record.blind){
    $('proposals').innerHTML=proposalMarkup('Your initial reading',record.blind,-1)+record.proposals.map((p,i)=>proposalMarkup(p.name,p,i)).join('');
    for(const button of $('proposals').querySelectorAll('button'))button.onclick=()=>{
      const index=Number(button.dataset.proposal),p=index===-1?record.blind:record.proposals[index];
      draft.annotation=copy(p.annotation);draft.components=copy(p.components??p.annotation.readings.map(r=>componentReading(record,r,session.suffixes)));
      if(!draft.annotation.readings.length){draft.annotation.readings=[blankReading()];draft.components=[{}];}
      draft.annotation.notes='';reading=0;selected.clear();markDirty();render();$('save-state').textContent='Proposal loaded · review before saving';$('workspace').scrollIntoView({block:'start'});
    };
  }
  renderEditor();
}
$('profile-form').onsubmit=async event=>{event.preventDefault();try{session=await api('/api/profile',{name:$('reviewer').value,experience:$('experience').value});await start();}catch(e){showError(e);}};
$('status').onchange=()=>{draft.annotation.status=$('status').value;markDirty();renderEditor();};
$('notes').oninput=()=>{draft.annotation.notes=$('notes').value;markDirty();};
$('exposed').onchange=()=>{draft.exposedBefore=$('exposed').checked;markDirty();};
$('clear-selection').onclick=()=>{selected.clear();renderEditor();};
$('assign-separator').onclick=()=>assign('separators');
$('add-field').onclick=()=>{const field=$('extra-field').value;if(field)changeRoles(r=>{r.fields[field]=[];});};
$('add-secondary').onclick=()=>changeRoles(r=>r.secondary.push({kind:'unit',designator:[],identifier:[]}));
$('add-reading').onclick=()=>{
  if(draft.annotation.readings.length>=16)return showError('At most 16 supported readings can be represented. Use unsure if the alternatives cannot be enumerated.');
  draft.annotation.readings.push(copy(active()));draft.components.push(copy(draft.components[reading]));reading=draft.annotation.readings.length-1;draft.annotation.status='ambiguous';selected.clear();markDirty();render();
};
$('remove-reading').onclick=()=>{if(draft.annotation.readings.length<2)return;draft.annotation.readings.splice(reading,1);draft.components.splice(reading,1);reading=0;if(draft.annotation.readings.length===1)draft.annotation.status='address';markDirty();render();};
$('save-draft').onclick=()=>saveDraft().catch(showError);
async function next(){const index=session.cases.findIndex(r=>r.caseId===record.caseId);const target=session.cases[index+1]??session.cases.find(r=>r.stage!=='final');if(target)await loadCase(target.caseId);else{$('save-state').textContent='All calibration reviews finalized';$('progress').textContent=`All ${session.total} reviews finalized. Your evidence is ready for analysis.`;}}
$('next').onclick=()=>next().catch(showError);
$('batch').onchange=()=>{const id=session.cases[Number($('batch').value)*session.batchSize].caseId;loadCase(id).catch(showError);};
$('save-review').onclick=async()=>{
  if(busy)return;busy=true;$('save-review').disabled=true;clearError();
  try{
    if(!$('confirmed').checked)throw new Error('Check the review confirmation before saving.');
    await saveDraft();const action=record.blind?'final':'blind';
    const result=await api(`/api/case/${record.caseId}/${action}`,{revision:record.revision,payload:payload(),confirmed:true});
    record=result;draft=copy(result.final??result.blind);changes=saved=0;selected.clear();reading=0;
    if(!draft.annotation.readings.length){draft.annotation.readings=[blankReading()];draft.components=[{}];}
    session=await api('/api/session');$('confirmed').checked=false;refreshQueue();render();
    busy=false;
    if(action==='final')await next();else $('comparison').scrollIntoView({block:'nearest'});
  }catch(e){showError(e);}finally{busy=false;$('save-review').disabled=false;}
};
window.addEventListener('beforeunload',event=>{if(changes!==saved){event.preventDefault();event.returnValue='';}});
async function start(){
  $('loading').hidden=true;$('onboarding').hidden=!!session.profile;$('review-app').hidden=!session.profile;
  if(session.profile){refreshQueue();await loadCase((session.cases.find(r=>r.stage!=='final')??session.cases[0]).caseId);}else $('reviewer').focus();
}
try{session=await api('/api/session');await start();}catch(e){$('loading').hidden=true;showError(e);}
