import {registry as storedRegistry} from './demo-data.json';
import {addDays, clock, dayDifference} from './clock';
import type {Analysis, Authority, Case, CaseDocument, Fact, Finding, Registry} from './src/refundpath/types';
export const registry = storedRegistry as Registry;
export const required = ['agreement','invoice','receipt','policy','provider_confirmation','visa_refusal'];
const norm=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
function date(s:string) { const m=s.match(/(\d{1,2}) (\w+) (\d{4})/); if(!m)return s; return `${m[3]}-${String(months.indexOf(m[2])+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
const decimal=(s:string)=>s.replace(/,/g,'');

export function extract(doc: CaseDocument): Fact[] {
  const result:Fact[]=[];
  const lines=doc.preview.split('\n');
  function field(key:string, regex:RegExp, value:(m:RegExpMatchArray)=>string=(m)=>m[1], confidence=.94) {
    const index=lines.findIndex(line=>regex.test(line)); if(index<0)return;
    const quote=lines[index]; const match=quote.match(regex)!;
    result.push({field:key,value:value(match),document_id:doc.id,document_name:doc.name,page:1,line:index+1,quote,confidence,method:'Deterministic free-text extraction'});
  }
  if(doc.kind==='agreement') {
    field('student_name',/^Dear (.+),$/); field('provider_name',/^(.+) offers you a place/,m=>m[1],.96);
    field('course_name',/place in the (.+), with an agreed/,m=>m[1],.92);
    field('course_start',/agreed starting day of (\d+ \w+ \d{4})/,m=>date(m[1]),.98);
    field('registered_provider',/registered to enrol international students/,()=> 'yes',.92);
    field('student_visa',/study on a student visa/,()=> 'yes',.91);
    field('provider_type',/private vocational/,()=> 'private',.96); field('education_level',/vocational education/,()=> 'vet',.95);
    field('nominated_recipient',/agreement nominates (.+) as the refund recipient/,m=>m[1],.97);
    field('nominated_recipient_role',/as the refund recipient(.+)/,m=>m[1].includes('education agent')?'agent':'student',.93);
  }
  if(doc.kind==='invoice') {field('invoice_total',/total amount invoiced is AUD ([\d,.]+)/,m=>decimal(m[1].replace(/\.$/,'')),.99);field('currency',/\b(AUD|USD|EUR)\b/,m=>m[1],.99);}
  if(doc.kind==='receipt') {
    field('receipt_total',/received AUD ([\d,.]+) from/,m=>decimal(m[1]),.99);
    field('tuition_paid',/covered tuition of AUD ([\d,.]+)/,m=>decimal(m[1]),.98);
    field('non_tuition_paid',/non-tuition fees of AUD ([\d,.]+)/,m=>decimal(m[1]),.98);
    field('payment_date',/On (\d+ \w+ \d{4}) we received/,m=>date(m[1]),.97);
    field('payer_name',/received AUD [\d,.]+ from (.+), (?:an education agent|the student)/,m=>m[1],.96);
    field('payer_type',/received AUD .+ from .+, (.+)/,m=>m[1].includes('education agent')?'agent':'student',.94);
    field('bank_changed',/No changed bank details/,()=> 'no',.90);
  }
  if(doc.kind==='provider_confirmation') {
    field('default_day',/commenced on (\d+ \w+ \d{4})/,m=>date(m[1]),.97);
    field('event_type',/did not start the course because the student visa was refused/,()=> 'visa_no_start',.91);
    field('refusal_caused_no_start',/did not start the course because the student visa was refused/,()=> 'yes',.93);
    field('student_started_course',/did not start the course/,()=> 'no',.96);
    field('previously_withdrawn',/had not previously withdrawn/,()=> 'no',.91);
    field('provider_started_course',/provider did start the course/,()=> 'yes',.93);
  }
  if(doc.kind==='visa_refusal') {field('visa_refused',/application was refused/,()=> 'yes',.98);field('refusal_date',/refused on (\d+ \w+ \d{4})/,m=>date(m[1]),.98);}
  if(doc.kind==='policy') {
    field('policy_basis',/Calculation of Refund Instrument 2024/,()=> '2024 statutory course-fee refund policy',.88);
    field('untrusted_instruction',/Ignore previous instructions.+/,m=>m[0],.62);
  }
  if(doc.kind==='agent') field('separate_intermediary_fee',/service fee of AUD ([\d,.]+)/,m=>decimal(m[1]),.89);
  return result;
}
export function facts(c:Case): Fact[] {
  const map=new Map<string,Fact>(); c.documents.forEach(d=>d.facts.forEach(f=>{if(!map.has(f.field))map.set(f.field,f);}));
  c.corrections.forEach(f=>map.set(f.field,f)); return [...map.values()].sort((a,b)=>a.field.localeCompare(b.field));
}
export function scan(c:Case):Finding[] {
  const findings:Finding[]=[];
  const sources=[...c.documents.map(d=>({name:d.name,text:d.preview})),{name:'Student-entered note / simulated provider message',text:c.student_note},{name:'Simulated provider payment report',text:c.provider_report?.note??''},{name:'Synthetic bank statement note',text:c.bank_line?.note??''}];
  sources.forEach(s=>s.text.split('\n').forEach((line,index)=>{
    if(/ignore (?:(?:all|previous)\s+)*instructions|system prompt|set the refund recipient|override.*refund/i.test(line))findings.push({kind:'injection',quote:line.trim().slice(0,200),source:s.name,line:index+1,field:'Proposed refund recipient',unchanged:c.details.recipient_name});
    if(/forward (?:the |your |these )?(?:refund|funds|money)|receive.{0,50}(?:re[-‑–]?send|resend|send on)|(?:pay|convert|payment).{0,50}(?:crypto|bitcoin|ethereum|USDT)|redirect money|refund.{0,40}(?:another person|another account|different account)/i.test(line))findings.push({kind:'redirect',quote:line.trim().slice(0,200),source:s.name,line:index+1,field:'Refund destination',unchanged:c.details.recipient_name});
  })); return findings;
}
export function authority(c:Case):Authority {
  const f=facts(c); const val=(k:string)=>f.find(x=>x.field===k)?.value??'';
  const payer=val('payer_name'), nominated=val('nominated_recipient'), proposed=c.details.recipient_name;
  const education=val('nominated_recipient_role')==='agent';
  const passed=!!payer&&!!nominated&&!!proposed&&!c.details.bank_changed&&(norm(payer)===norm(nominated)&&norm(nominated)===norm(proposed)||education&&norm(nominated)===norm(proposed));
  return {passed,payer,nominated,proposed,note:passed ? education ? 'The signed written agreement nominates this education agent. The proposed recipient matches that nomination. This is an authority comparison, not bank verification.' : 'Original payer, agreement nomination and proposed recipient match.' : c.details.bank_changed ? 'Changed bank details require separate authority and account verification.' : 'The original payment, signed nomination and proposed recipient do not establish the same authority.',needed_documents:passed?[]:['Signed recipient nomination in the written agreement','Authority letter from the student / original payer','Original payment receipt and provider confirmation']};
}
function cents(s:string|undefined):bigint {if(!s||!/^\d{1,9}(?:\.\d{1,2})?$/.test(s))throw new Error('Invalid decimal amount');const [whole,part='']=s.split('.');return BigInt(whole)*100n+BigInt(part.padEnd(2,'0'));}
const asDecimal=(v:bigint)=>`${v/100n}.${String(v%100n).padStart(2,'0')}`;
export function exactAmount(value:string) {return asDecimal(cents(value));}
export function underpaidAmount(value:string) {const amount=cents(value);return asDecimal(amount>50000n?amount-50000n:0n);}
export function redirectPending(c:Case) {return c.findings.some(f=>f.kind==='redirect')&&!c.redirect_acknowledged;}
export function channel(c:Case) {
  const d=c.details;
  const route=registry.complaint_routes.find(r=>r.education_level===d.education_level&&r.provider_types.includes(d.provider_type));
  const source=registry.sources.find(s=>s.id===(route?.source_id??'complaints'));
  return {label:route&&source?route.label:'Channel unconfirmed · verify provider type, education level and jurisdiction',source:source?.url??'',requires_confirmation:true,checked_at:route?.checked_at??registry.checked_at};
}
export function analyse(c:Case):Analysis {
  const fs=facts(c), val=(key:string)=>fs.find(f=>f.field===key)?.value;
  const risks:Analysis['risks']=[];const flag=(code:string,message:string)=>{if(!risks.some(r=>r.code===code))risks.push({code,message,severity:'block'});};
  const missing=required.filter(k=>!c.documents.some(d=>d.kind===k));
  if(missing.length)flag('missing_documents','Required source documents are missing. Add the documents listed in the Documents tab.');
  if(c.documents.some(d=>!d.synthetic)||c.scenario==='custom')flag('manual_extraction','Uploaded or custom evidence requires manual verification; this demo operates only on synthetic fixtures.');
  if(c.findings.some(f=>f.kind==='injection'))flag('untrusted_text','An instruction attempt was ignored. Verify the message through the provider’s official contact details.');
  const seen=new Map<string,string>();c.documents.forEach(d=>d.facts.forEach(f=>{if(seen.has(f.field)&&norm(seen.get(f.field)!)!==norm(f.value))flag('conflicting_source','Source documents disagree. Verify the original evidence.');else seen.set(f.field,f.value);}));
  if(fs.some(f=>f.confidence<.85))flag('low_confidence','Some extracted text needs manual verification. It does not determine the recipient or amount.');
  const matchingKeys=['student_name','provider_name','course_name','course_start','payer_name','payer_type'];
  matchingKeys.forEach(key=>{if(val(key)&&norm(val(key)!)!==norm(String(c.details[key as keyof typeof c.details])))flag('intake_mismatch',`Case details disagree with the cited source for ${key.replace(/_/g,' ')}.`);});
  if(!c.authority?.passed)flag('recipient_authority','Recipient needs verification. Obtain a signed nomination and authority evidence before progressing.');
  const amountRule=registry.rules.find(r=>r.id==='visa-no-start-amount'),dateRule=registry.rules.find(r=>r.id==='visa-default-deadline');
  if(!registry.version||clock.today()>registry.review_due||!amountRule||!dateRule||[amountRule,dateRule].some(r=>r.sources.some(id=>!registry.sources.some(s=>s.id===id&&s.url&&s.checked_at))||clock.today()<r.effective_from))flag('rule_unavailable','The versioned legal registry needs review. No calculation or deadline is generated.');
  if(c.details.country!=='AU'||c.details.event_type!=='visa_no_start'||val('event_type')!=='visa_no_start')flag('unsupported_event','This demo supports student visa refusal causing failure to start only.');
  for(const [key,expected]of Object.entries({registered_provider:'yes',student_visa:'yes',visa_refused:'yes',refusal_caused_no_start:'yes',provider_started_course:'yes',student_started_course:'no',previously_withdrawn:'no'}))if(val(key)!==expected)flag('legal_conditions','Confirm the commencement and visa-refusal conditions using the offer, visa decision and provider confirmation.');
  const start=val('course_start'),def=val('default_day'),refusal=val('refusal_date'),paid=val('payment_date');
  if(!start||!def||!refusal||!paid||def!==start||refusal>start||paid>=def||def>clock.today())flag('dates','The agreed starting/default day, visa refusal and pre-default payment dates need confirmation.');
  if(val('currency')!=='AUD')flag('currency','Only Australian-dollar course fees are supported. No currency conversion is performed.');
  let fee:bigint|null=null,deduction:bigint|null=null;
  try {fee=cents(val('tuition_paid'))+cents(val('non_tuition_paid'));if(fee<=0n||fee!==cents(val('receipt_total'))||fee!==cents(val('invoice_total')))flag('amount_mismatch','Invoice total, payment receipt and included course fees differ.');
    const percent=amountRule?.deduction_percent??'0.05';const [whole,fraction='']=percent.split('.');const scale=10n**BigInt(fraction.length);const rate=BigInt(whole+fraction);const rateDeduction=(fee*rate+scale/2n)/scale;const cap=cents(amountRule?.deduction_cap_aud??'500.00');deduction=rateDeduction<cap?rateDeduction:cap;
  }catch{flag('invalid_amount','Source amounts must be valid decimal course-fee values.');}
  const allowed=!risks.length&&fee!==null&&deduction!==null;
  const estimate=allowed?asDecimal(fee!-deduction!):null;
  const fmt=(n:bigint)=>`$${Number(asDecimal(n)).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})} AUD`;
  const deadline=allowed?{date:addDays(def!,7*dateRule!.weeks_after_default!),trigger:def!,trigger_label:'Confirmed agreed starting day / default day',timezone:c.details.timezone,rule_id:dateRule!.id,section:dateRule!.section,source_ids:dateRule!.sources,kind:'Provider obligation deadline',qualification:'Provisional calendar deadline; holidays and case-specific legal exceptions require professional confirmation.'}:null;
  return {status:missing.length?'Documents needed':risks.length?'Manual review required':'Needs student review',facts:fs,risks,missing_documents:missing,rule_version:registry.version,applied_rules:allowed?[amountRule!,dateRule!]:[],currency:val('currency')??'Unconfirmed',gross_payments:fee!==null?asDecimal(fee):null,included_payments:allowed?asDecimal(fee!):null,deduction:allowed?asDecimal(deduction!):null,estimate,formula:allowed?`${fmt(fee!)} − min(5% × ${fmt(fee!)}, $500.00 AUD) = ${fmt(fee!-deduction!)}`:'No estimate until the sourced evidence and legal conditions are confirmed.',deadline,complaint_channel:channel(c),summary:risks.length?'Human review is required before a request can progress.':'Review the sourced information before approving a request.',checks:[{label:'Required source documents',passed:!missing.length},{label:'Source consistency and extraction',passed:!risks.some(r=>/confidence|mismatch|conflicting/.test(r.code))},{label:'Versioned refund and default rules',passed:allowed},{label:'Recipient nomination and authority',passed:!!c.authority?.passed},{label:'External submission and money movement disabled',passed:true}]};
}
export function refreshDays(c:Case) {c.remaining_days=c.analysis?.deadline?dayDifference(c.analysis.deadline.date,clock.today(c.details.timezone)):null;}
