import {Agent, ScriptedPlanner, type ToolCall} from './agent';
import {addDays, clock, localDate} from './clock';
import {fixture, scenarios} from './fixtures';
import {analyse, authority, channel, exactAmount, extract, facts, refreshDays, registry, required, scan, redirectPending, underpaidAmount} from './model';
import {dateLabel, moneyLabel} from './src/refundpath/format';
import type {AgentStep, Case, Details, Draft, Fact, LogEvent, PaymentLine, ProviderReply, Tool} from './src/refundpath/types';
const copy=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
let serial=0, caseNumber=0;
const nextId=(kind:string)=>`${kind}-${String(++serial).padStart(6,'0')}`;
const reference=()=>`RP-2026-${String(++caseNumber).padStart(3,'0')}`;
let records=new Map<string,Case>();
let ready:Promise<void>|null=null;
let activeStepStart:number|null=null;
function eventTime(actor:LogEvent['actor']) {return clock.tick(actor==='assistant' ? activeStepStart===null?10:1 : 120);}
function load(id:string){const c=records.get(id);if(!c)throw new Error('This demo case was deleted. Return to Overview.');return c;}
function emit(c:Case, actor:LogEvent['actor'], action:string, result:string, tool:Tool|null=null, input='', status='done', nextState?:string, timestamp?:string){
  if(nextState&&c.status!==nextState){const old=c.status;c.status=c.display_status=nextState;const transition:LogEvent={event_id:nextId('event'),case_id:c.id,timestamp:eventTime(actor),actor,action:'State transition',tool,input_summary:old,result:`${old} → ${nextState}`,status:nextState};c.log.push(transition);}
  const e:LogEvent={event_id:nextId('event'),case_id:c.id,timestamp:timestamp??eventTime(actor),actor,action,tool,input_summary:input,result,status};c.log.push(e);
  c.history.push({id:e.event_id,at:e.timestamp,status:action,text:result});return e;
}
function invalidate(c:Case){c.redirect_acknowledged=false;c.content_version++;c.student_reviewed=false;c.reviewed_groups=[];c.analysis=null;c.authority=null;c.assistant_summary=null;c.receipt_confirmed=false;c.receipt_differences=[];c.drafts.forEach(d=>{if(!d.simulated_at){d.stale=true;d.approved=false;}});emit(c,'student','Evidence changed','Evidence review, receipt confirmation and pending draft approvals were invalidated.',null,'Current case content','done','Documents needed');}
function output(c:Case){refreshDays(c);c.display_status=c.status;if(c.follow_up_date&&clock.today()>=c.follow_up_date&&c.submitted_at&&!c.provider_report&&c.status==='Request submitted (simulated)')c.display_status='Follow-up due';return copy(c);}
function usable(c:Case){return !!c.analysis?.estimate&&!c.analysis.risks.length&&c.student_reviewed;}
function draftLabel(purpose:string){return purpose==='refund'?'Refund':purpose==='follow_up'?'Follow-up':purpose==='internal_complaint'?'Internal complaint':'External complaint';}
export function triggers(c:Case){
  const submitted=c.submitted_at?localDate(c.submitted_at):null;
  return {follow_up:submitted?addDays(submitted,14):null,internal_complaint:c.analysis?.deadline?addDays(c.analysis.deadline.date,1):null,external_complaint:c.internal_complaint_at?addDays(localDate(c.internal_complaint_at),20):null};
}
function permitted(c:Case,purpose:Draft['purpose']){
  const dates=triggers(c),today=clock.today();
  if(purpose==='refund')return usable(c)&&!c.submitted_at;
  if(c.provider_report||!c.submitted_at)return false;
  return purpose==='follow_up'?!!dates.follow_up&&today>=dates.follow_up:purpose==='internal_complaint'?!!dates.internal_complaint&&today>=dates.internal_complaint:!!dates.external_complaint&&today>=dates.external_complaint;
}
function makeDraft(c:Case,purpose:Draft['purpose']):Draft{
  const old=c.drafts.find(d=>d.purpose===purpose&&!d.stale);if(old)return old;
  if(!permitted(c,purpose))throw new Error('This request is not available yet. Review the evidence or advance the demo clock to its trigger.');
  const a=c.analysis!,d=c.details;
  const destination=purpose==='external_complaint'?channel(c).label:purpose==='internal_complaint'?`${d.provider_name} · internal complaints team`:`${d.provider_name} · refund team`;
  const text=(purpose==='external_complaint'?'Dear Ombudsman team,\n\n':'')+`SYNTHETIC SANDBOX ${draftLabel(purpose).toUpperCase()} DRAFT\n\nCase: ${c.reference}\nDemo date: ${dateLabel(clock.today())}\nTo: ${destination}\n\n${purpose==='external_complaint'?'':'Dear review team,\n\n'}${purpose==='refund'?`I request review of my student-visa-refusal course-fee refund for ${d.course_name}. The provider confirmation records a failure to start on ${dateLabel(d.course_start)}.`:purpose==='follow_up'?'Please provide the status of the synthetic refund request submitted 14 or more days ago.':purpose==='internal_complaint'?'The provisional provider obligation date has passed without a reported payment. I request an internal review and written response.':'The internal complaint remains unresolved for at least 20 demo days. Please confirm jurisdiction and review the attached source evidence.'}\n\nProvisional course-fee estimate: ${moneyLabel(a.estimate)}\nCalculation: ${a.formula}\nProvisional obligation date: ${dateLabel(a.deadline?.date)} (${d.timezone})\nRule registry: ${a.rule_version}\n\nProposed recipient: ${d.recipient_name}. Please verify the signed written-agreement nomination and original payment authority through secure official channels. Bank identifiers are omitted.\n\nSources: ${c.documents.map(doc=>doc.name).join(', ')}\n\n${d.student_name}\n\nOffline demonstration only. Dates and estimates require professional confirmation. Nothing is sent and no money is moved.`;
  const draft:Draft={id:nextId('draft'),kind:purpose==='refund'?'refund':purpose==='follow_up'?'follow_up':'complaint',purpose,channel:destination,text,created_at:clock.now(),approved:false,stale:false,content_version:c.content_version,rule_version:a.rule_version??'unavailable',simulated_at:null};
  c.drafts.push(draft);emit(c,'assistant',`${draftLabel(purpose)} draft prepared`,`Draft for ${destination}. Student approval is required before simulation.`,'draft_request',draftLabel(purpose),'awaiting_approval','Awaiting student approval');return draft;
}
function receiptCheck(c:Case){
  const report=c.provider_report,line=c.bank_line;const diffs:string[]=[];
  if(!report)return {confirmed:false,differences:['The provider has not reported a payment.']};
  if(!line)return {confirmed:false,differences:['Add a synthetic bank statement line to confirm receipt.']};
  if(!c.analysis?.estimate||c.analysis.risks.length)diffs.push('The current evidence and refund estimate need verification.');
  if(exactAmount(report.amount)!==c.analysis?.estimate)diffs.push(`Provider amount ${moneyLabel(report.amount)} differs from the expected ${moneyLabel(c.analysis?.estimate)}.`);
  if(exactAmount(line.amount)!==exactAmount(report.amount))diffs.push(`Bank amount ${moneyLabel(line.amount)} differs from provider-reported ${moneyLabel(report.amount)}.`);
  const norm=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
  if(norm(report.payee)!==norm(c.details.recipient_name))diffs.push(`Provider payee “${report.payee}” differs from nominated recipient “${c.details.recipient_name}”.`);
  if(norm(line.payee)!==norm(report.payee))diffs.push(`Bank payee “${line.payee}” differs from provider-reported payee “${report.payee}”.`);
  if(line.date<report.date||line.date>addDays(report.date,7)||line.date>clock.today())diffs.push(`Bank date ${dateLabel(line.date)} is outside the allowed window ${dateLabel(report.date)}–${dateLabel(addDays(report.date,7))} or is in the demo future.`);
  if(c.findings.some(f=>f.kind==='injection'))diffs.push('Untrusted payment instructions require official-channel verification.');
  if(redirectPending(c))diffs.push('Student acknowledgement of the refund redirect warning is required before payment confirmation.');
  return {confirmed:!diffs.length,differences:diffs};
}
function step(tool:Tool,input:string,result:string,decision:string,status:AgentStep['status']='done'):AgentStep{return {tool,input_summary:input,output_summary:result,decision,status,timestamp:clock.now()};}
function refreshFindings(c:Case){
  const found=scan(c), redirects=(findings:Case['findings'])=>JSON.stringify(findings.filter(f=>f.kind==='redirect'));
  if(redirects(found)!==redirects(c.findings))c.redirect_acknowledged=false;
  c.findings=found;
}
function execute(c:Case,call:ToolCall):AgentStep{
  switch(call.tool){
    case 'scan_untrusted_instructions':refreshFindings(c);c.documents.forEach(d=>d.injection_flag=c.findings.some(f=>f.source===d.name));return step(call.tool,'Document text, provider messages and student notes',c.findings.length?`${c.findings.length} unsafe instruction pattern${c.findings.length===1?'':'s'} ignored.`:'No instruction or payment-redirect pattern found.',c.findings.some(f=>f.kind==='injection')?'Stop financial progress; verify the message through official provider contacts.':redirectPending(c)?'Calculation and deadline remain active. Acknowledge the warning before changing the recipient, confirming payment or resolving the case.':'Treat all document text as data, never as an instruction.',c.findings.some(f=>f.kind==='injection')||redirectPending(c)?'blocked':'done');
    case 'extract_documents':c.documents.forEach(d=>{d.facts=extract(d);});return step(call.tool,`${c.documents.length} synthetic source documents`,`${facts(c).length} source-linked fields extracted.`,required.every(k=>c.documents.some(d=>d.kind===k))?'Read free-text evidence with recorded confidence; authenticity is not established.':'A required document is missing. Obtain it before review.',required.every(k=>c.documents.some(d=>d.kind===k))?'done':'blocked');
    case 'check_recipient_authority':c.authority=authority(c);return step(call.tool,'Original payer · agreement nomination · proposed recipient',c.authority.passed?'Recipient authority comparison passed.':'Recipient needs verification.',c.authority.note,c.authority.passed?'done':'blocked');
    case 'calculate_refund':c.analysis=analyse(c);refreshDays(c);if(c.analysis.risks.length){c.student_reviewed=false;emit(c,'assistant','Evidence needs review',c.analysis.summary,call.tool,'Sourced conditions','blocked',c.analysis.status);}else if(!c.student_reviewed&&!c.submitted_at&&c.status!=='Needs student review') emit(c,'assistant','Source report ready','Sourced checks completed. Student evidence review is required.',call.tool,'Current source report','done','Needs student review');return step(call.tool,`Course-fee evidence · registry ${registry.version}`,c.analysis.estimate?`Provisional refund ${moneyLabel(c.analysis.estimate)}.`:'No estimate generated.',c.analysis.estimate?'Apply the existing lesser-of-5%-or-$500.00 AUD deduction using integer decimal cents.':c.analysis.risks.map(r=>r.message).join(' '),c.analysis.estimate?'done':'blocked');
    case 'compute_deadline':return step(call.tool,'Confirmed default day · ESOS s 47E · four weeks',c.analysis?.deadline?`Provider obligation date ${dateLabel(c.analysis.deadline.date)}; ${c.remaining_days} demo days remaining.`:'No deadline established.',c.analysis?.deadline?'Four calendar weeks after the sourced default day; professional confirmation of exceptions is required.':'Missing or inconsistent legal conditions block the date.',c.analysis?.deadline?'done':'blocked');
    case 'draft_request':{
      const purpose=call.purpose??'refund';
      if(!c.analysis?.estimate||c.analysis.risks.length)return step(call.tool,draftLabel(purpose),'Drafting blocked by unresolved evidence.',c.analysis?.summary??'Run the sourced checks.','blocked');
      if(!c.student_reviewed)return step(call.tool,'Critical and other evidence groups','Student evidence review required.','Confirm both source groups before the assistant prepares a request.','awaiting_approval');
      const draft=makeDraft(c,purpose);return step(call.tool,draftLabel(purpose),`${draftLabel(purpose)} draft ready.`,draft.simulated_at?'This exact draft was already simulated.':draft.approved?'Exact draft approved; the student must separately choose simulation.':'Read the exact draft and explicitly approve it.',draft.approved||draft.simulated_at?'done':'awaiting_approval');}
    case 'simulate_submission':{
      if(c.analysis?.risks.length)return step(call.tool,'Current evidence and student approval','Submission blocked by unresolved evidence.','Student approval cannot override source risks or unsafe instructions.','blocked');
      const draft=c.drafts.find(d=>d.purpose===(call.purpose??'refund')&&!d.stale);
      return step(call.tool,'Exact current draft and student approval',draft?.simulated_at?'Submission simulation recorded.':draft?.approved?'Draft approved; explicit simulation action still required.':'Submission is paused.',draft?.simulated_at?'No real email, application or payment occurred.':'The assistant cannot click the student’s simulation action or move money.',draft?.simulated_at?'done':'awaiting_approval');}
    case 'check_receipt':{
      const check=receiptCheck(c);c.receipt_confirmed=check.confirmed;c.receipt_differences=check.differences;
      if(check.confirmed){if(c.status!=='Resolved')emit(c,'assistant','Receipt confirmed','Amount, nominated payee and date window match.','check_receipt','Provider report compared with bank statement','done','Receipt confirmed');}
      else if(c.bank_line)emit(c,'assistant','Payment discrepancy found',check.differences.join(' '),'check_receipt','Provider report compared with bank statement','blocked','Payment discrepancy');
      return step(call.tool,'Exact amount, payee and payment-date window',check.confirmed?'Synthetic receipt confirmed.':check.differences.join(' '),check.confirmed?c.status==='Resolved'?'Receipt was confirmed before resolution; no further submission is planned.':'The student may now mark this case resolved.':'Keep the case open until the discrepancy is corrected or receipt is supplied.',check.confirmed?'done':'blocked');}
    case 'escalate':{
      const purpose=call.purpose==='external_complaint'?'external_complaint':'internal_complaint';
      const d=makeDraft(c,purpose);return step(call.tool,purpose==='internal_complaint'?'Deadline passed without reported payment':'Internal complaint unresolved for 20 demo days',`Proposed channel: ${d.channel}.`,d.simulated_at?'This complaint was already simulated.':'Student approval and complaint-channel confirmation are required.','awaiting_approval');}
  }
}
export const agent=new Agent(new ScriptedPlanner(),{beginStep:()=>{activeStepStart=Date.parse(clock.now());},execute,record:(c,s)=>{
  // Supporting semantic events get ordered second slots inside this ten-second tool step.
  const elapsed=(Date.parse(clock.now())-activeStepStart!)/1000;
  s.timestamp=clock.tick(10-elapsed);activeStepStart=null;
  emit(c,'assistant',s.status==='blocked'?'Assistant tool blocked':s.status==='awaiting_approval'?'Assistant awaiting approval':'Assistant tool completed',`${s.output_summary} ${s.decision}`,s.tool,s.input_summary,s.status,undefined,s.timestamp);
}});
async function newPreset(scenario:string){const c=fixture(scenario,nextId,reference());records.set(c.id,c);emit(c,'student','Demo case loaded',`Synthetic scenario: ${scenarios.find(s=>s[0]===scenario)![1]}.`,null,'Invented source documents');await agent.run(c);return output(c);}
async function ensure(){if(!ready&&caseNumber===0)ready=(async()=>{await newPreset('matched');await newPreset('agent');})();await ready;}
function checkDraft(c:Case,id:string){const d=c.drafts.find(d=>d.id===id);if(!d||d.stale||d.simulated_at||d.content_version!==c.content_version)throw new Error('This draft is stale or already simulated. Prepare a current draft.');return d;}
function validDate(date:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)===date;}
function payment(line:PaymentLine){if(!validDate(line.date)||!line.payee.trim())throw new Error('Supply a valid synthetic payment date and payee.');return {...line,amount:exactAmount(line.amount),payee:line.payee.trim().slice(0,120),note:line.note.slice(0,500)};}
function mask(s:string){return s.replace(/((?:passport|account|iban|visa (?:number|id|no))\s*[:#]\s*)[^\n]+/gi,'$1[MASKED]').replace(/\b\d{6,}\b/g,'[MASKED NUMBER]').replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g,'[MASKED EMAIL]');}
export const api={
  session:async()=>{await ensure();return {sandbox:true};},
  cases:async()=>{await ensure();return [...records.values()].map(output);},
  rules:async()=>copy(registry),
  clock:async()=>({timestamp:clock.now(),date:clock.today(),planner:agent.planner.label}),
  reset:async()=>{records=new Map();deletedLog=[];serial=0;caseNumber=0;ready=null;clock.reset();await ensure();},
  moveClock:async(mode:'week'|'deadline',caseId?:string)=>{
    if(mode==='week')clock.advance(7);else{const c=caseId?load(caseId):[...records.values()].find(c=>c.analysis?.deadline&&!c.receipt_confirmed);if(!c?.analysis?.deadline)throw new Error('No confirmed deadline is available. Choose a matching demo case.');clock.jumpPast(c.analysis.deadline.date);}
    for(const c of records.values()){emit(c,'student','Demo clock advanced',`Demo clock advanced to ${dateLabel(clock.today())} (Australia/Sydney).`,null,mode);await agent.run(c);}return [...records.values()].map(output);},
  demo:async(scenario:string)=>{await ensure();if(records.size>=20)throw new Error('Delete a demo case or reset before adding more.');return newPreset(scenario);},
  create:async(details:Details)=>{await ensure();const c=fixture('matched',nextId,reference());c.details=copy(details);c.scenario='custom';c.documents=[];records.set(c.id,c);emit(c,'student','Case created','Use synthetic information only. Custom evidence remains subject to manual review.');await agent.run(c);return output(c);},
  update:async(id:string,details:Details)=>{const c=load(id);if(redirectPending(c)&&(details.recipient_name!==c.details.recipient_name||details.bank_changed!==c.details.bank_changed))throw new Error('Acknowledge the refund redirect warning before changing the recipient or bank details.');c.details=copy(details);invalidate(c);await agent.run(c);return output(c);},
  remove:async(id:string)=>{const c=load(id);emit(c,'student','Case deleted','Case was removed from this temporary workspace.');deletedLog.push(...copy(c.log));records.delete(id);},
  upload:async(id:string,kind:string,file:File)=>{load(id);if(file.size>5*1024*1024||!file.name.toLowerCase().endsWith('.txt'))throw new Error('Use a synthetic UTF-8 TXT file up to 5 MB. PDF and OCR are not included.');const raw=await file.text();const c=load(id);if(c.documents.length>=12)throw new Error('A case supports 12 source documents.');if(![...required,'agent'].includes(kind))throw new Error('Unsupported source category.');c.documents.push({id:nextId('document'),kind,name:mask(file.name).slice(0,180),size:file.size,pages:1,preview:mask(raw).slice(0,30000),facts:[],injection_flag:false,issue:'Uploaded TXT needs manual verification in this synthetic demo.',synthetic:false,raw_retained:false});invalidate(c);emit(c,'student','Document preview added',`${file.name.slice(0,80)}; original bytes discarded.`);await agent.run(c);return output(c);},
  deleteDocument:async(id:string,doc:string)=>{const c=load(id);c.documents=c.documents.filter(d=>d.id!==doc);c.corrections=c.corrections.filter(f=>f.document_id!==doc);invalidate(c);emit(c,'student','Document deleted','Source preview removed.');await agent.run(c);return output(c);},
  analyse:async(id:string)=>{const c=load(id);await agent.run(c);return output(c);},
  reviewGroup:async(id:string,group:string)=>{const c=load(id);if(!['Critical','Other'].includes(group)||!c.analysis||c.analysis.risks.length)throw new Error('Resolve source risks before confirming a group.');if(!c.reviewed_groups.includes(group))c.reviewed_groups.push(group);emit(c,'student',`${group} evidence group confirmed`,'Student checked this group against its quoted sources.');return output(c);},
  review:async(snapshot:Case)=>{const c=load(snapshot.id);if(snapshot.content_version!==c.content_version||c.analysis?.risks.length||!c.analysis?.estimate||!['Critical','Other'].every(g=>c.reviewed_groups.includes(g)))throw new Error('Confirm both current evidence groups and resolve risks first.');c.student_reviewed=true;emit(c,'student','Evidence reviewed','Student confirmed both source groups.',null,'Current content version','done','Evidence reviewed');await agent.run(c);return output(c);},
  correct:async(id:string,body:unknown)=>{const c=load(id),req=body as Pick<Fact,'field'|'value'|'quote'|'document_id'|'page'>,doc=c.documents.find(d=>d.id===req.document_id);if(!doc||req.page!==1)throw new Error('Choose a valid cited source page.');const value=mask(String(req.value)).slice(0,180),quote=mask(String(req.quote)).slice(0,220);const same=doc.facts.some(f=>f.field===req.field&&f.value===value&&doc.preview.includes(quote));c.corrections=c.corrections.filter(f=>f.field!==req.field);c.corrections.push({field:req.field,value,quote,document_id:doc.id,document_name:doc.name,page:1,line:null,confidence:same?.94:.5,method:'Student correction'});invalidate(c);emit(c,'student','Source correction recorded','A correction must remain consistent with its cited text.');await agent.run(c);return output(c);},
  draft:async(id:string,kind:string)=>{const c=load(id);const purpose=kind==='complaint'?'internal_complaint':kind as Draft['purpose'];if(!['refund','follow_up','internal_complaint','external_complaint'].includes(purpose))throw new Error('Choose a supported draft.');makeDraft(c,purpose);await agent.run(c);return output(c);},
  approve:async(snapshot:Case,id:string,approved:boolean)=>{const c=load(snapshot.id);if(snapshot.content_version!==c.content_version)throw new Error('The case evidence changed. Review its current draft.');const d=checkDraft(c,id);d.approved=approved;emit(c,'student',`${draftLabel(d.purpose)} draft ${approved?'approved':'approval revoked'}`,approved?'Student approved the exact displayed draft. Explicit simulation remains a separate action.':'Student revoked approval.',null,`Draft ${d.id}; content version ${d.content_version}`,approved?'done':'awaiting_approval',approved?'Draft approved':'Awaiting student approval');await agent.run(c);return output(c);},
  simulate:async(id:string,draftId:string,confirmed:boolean)=>{const c=load(id),d=checkDraft(c,draftId);if(!d.approved)throw new Error('Approve the exact current draft first.');if(d.kind!=='complaint'&&!usable(c))throw new Error('Current sourced evidence and student review are required.');if(d.kind==='complaint'&&!confirmed)throw new Error('Confirm the complaint channel before simulation.');if(!permitted(c,d.purpose))throw new Error('This simulation trigger no longer applies.');if(d.rule_version!==registry.version)throw new Error('The legal rule changed; prepare a new draft.');const state=d.purpose==='refund'?'Request submitted (simulated)':d.purpose==='follow_up'?'Follow-up submitted (simulated)':d.purpose==='internal_complaint'?'Internal complaint submitted (simulated)':'External complaint submitted (simulated)';const event=emit(c,'student',`${draftLabel(d.purpose)} submission simulated`,`Local simulation to ${d.channel}. No external service was contacted.`,'simulate_submission',`Approved draft ${d.id}`,'done',state);d.simulated_at=event.timestamp;if(d.purpose==='refund')c.submitted_at=event.timestamp;if(d.purpose==='internal_complaint')c.internal_complaint_at=event.timestamp;await agent.run(c);const completed=step('simulate_submission',`Approved ${draftLabel(d.purpose)} draft ${d.id}`,`Local ${draftLabel(d.purpose).toLowerCase()} simulation completed.`,`The exact draft approval and current trigger were validated. No external service was contacted.`);c.agent_steps.push(completed);completed.timestamp=emit(c,'assistant','Simulation tool completed',completed.output_summary,'simulate_submission',completed.input_summary,'done').timestamp;return output(c);},
  providerReport:async(id:string,line:PaymentLine)=>{const c=load(id);if(!c.submitted_at||c.status==='Resolved')throw new Error('Submit an approved refund request simulation first.');const p=payment(line);if(p.date<localDate(c.submitted_at)||p.date>clock.today())throw new Error('Provider payment date must be between submission and the current demo date.');c.provider_report=p;c.receipt_confirmed=false;emit(c,'provider_sim','Provider reports paid',`Provider reports ${moneyLabel(p.amount)} paid to ${p.payee} on ${dateLabel(p.date)}. Receipt is not yet confirmed.`,null,p.note.startsWith('Simulated preset:')?p.note:'Simulated provider payment message','done','Provider reports paid');await agent.run(c);return output(c);},
  simulateProviderReply:async(id:string,preset:ProviderReply)=>{
    const c=load(id);if(!c.submitted_at||c.status==='Resolved')throw new Error('Submit an approved refund request simulation first.');
    if(!['paid_full','underpaid','different_payee','no_reply'].includes(preset))throw new Error('Choose a provider reply preset.');
    c.receipt_confirmed=false;c.receipt_differences=[];
    if(preset==='no_reply'){c.provider_report=null;emit(c,'provider_sim','Provider reply simulated','No reply. No payment has been reported.',null,'No reply','done','Request submitted (simulated)');await agent.run(c);return output(c);}
    const amount=c.analysis?.estimate;if(!amount)throw new Error('A confirmed refund estimate is required for a payment simulation.');
    const label=preset==='paid_full'?'Paid in full':preset==='underpaid'?'Underpaid (AUD 500 short)':'Paid to different payee';
    return api.providerReport(id,{amount:preset==='underpaid'?underpaidAmount(amount):amount,date:clock.today(),payee:preset==='different_payee'?'Synthetic Alternate Payee':c.details.recipient_name,note:`Simulated preset: ${label}.`});
  },
  acknowledgeRedirect:async(id:string)=>{const c=load(id);if(!c.findings.some(f=>f.kind==='redirect'))throw new Error('No refund redirect warning to acknowledge.');c.redirect_acknowledged=true;emit(c,'student','Refund redirect warning acknowledged','Student acknowledged the warning and the need to verify through official provider contacts. Redirect instructions remain ignored.');await agent.run(c);return output(c);},
  confirmReceipt:async(id:string,line:PaymentLine)=>{const c=load(id);if(!c.provider_report)throw new Error('Record a simulated provider payment report first.');c.bank_line=payment(line);emit(c,'student','Synthetic bank statement entered',`Bank line: ${moneyLabel(c.bank_line.amount)}; ${c.bank_line.payee}; ${dateLabel(c.bank_line.date)}.`,'check_receipt','Synthetic statement line');await agent.run(c);return output(c);},
  receiptUpload:async(id:string,file:File)=>{if(file.size>100000||!file.name.toLowerCase().endsWith('.txt'))throw new Error('Use a synthetic bank line TXT file up to 100 KB.');const text=await file.text();const m=text.match(/^(\d{4}-\d{2}-\d{2})\s*\|\s*(\d+(?:\.\d{1,2})?)\s*\|\s*([^\n|]+)(?:\|\s*([^\n]*))?\s*$/);if(!m)throw new Error('Use: YYYY-MM-DD | 12000.00 | Synthetic payee | Optional note');return api.confirmReceipt(id,{date:m[1],amount:m[2],payee:m[3].trim(),note:m[4]??''});},
  note:async(id:string,text:string)=>{const c=load(id);c.student_note=mask(text).slice(0,1000);invalidate(c);emit(c,'student','Student note recorded','The assistant will treat the note as untrusted data.');await agent.run(c);return output(c);},
  reminder:async(id:string,date:string)=>{if(!validDate(date))throw new Error('Choose a valid reminder date.');const c=load(id);c.follow_up_date=date;emit(c,'student','Local reminder saved',`Reminder date ${dateLabel(date)}; no email or notification sent.`);return output(c);},
  resolve:async(id:string)=>{const c=load(id);const check=receiptCheck(c);if(!c.receipt_confirmed||!check.confirmed)throw new Error('Receipt must be confirmed with an exact amount, authorised payee and valid date window before resolution.');emit(c,'student','Case resolved','Student closed the case after receipt confirmation.',null,'Confirmed receipt','done','Resolved');await agent.run(c);return output(c);},
  consent:async(id:string,optIn:boolean)=>{if(optIn)throw new Error('The scripted RefundPath Assistant runs locally; external AI is not connected.');return output(load(id));},
  assist:async(id:string,_optIn:boolean)=>{const c=load(id);await agent.run(c);c.assistant_summary={method:agent.planner.label,text:`${c.documents.length} synthetic documents checked. ${c.analysis?.summary} The assistant prepared only actions allowed by the current evidence and demo clock. Every simulated submission still requires student approval.`,created_at:clock.now()};return output(c);},
  log:async(id?:string)=>copy((id?load(id).log:[...deletedLog,...[...records.values()].flatMap(c=>c.log)]).sort((a,b)=>a.timestamp.localeCompare(b.timestamp))),
  exportLog:async(id?:string)=>JSON.stringify({schema_version:'1.0',planner:agent.planner.label,demo_clock:clock.now(),rule_registry:registry.version,scope:id??'all_cases',events:await api.log(id)},null,2),
};
let deletedLog:LogEvent[]=[];
