const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {api}=require('./offline-api-test.cjs');
let checks=0;
const ok=(value,message)=>{assert.ok(value,message);checks++;};
const equal=(actual,expected,message)=>{assert.equal(actual,expected,message);checks++;};
const reject=async(promise,regex)=>{await assert.rejects(promise,regex);checks++;};
async function reviewed(c){c=await api.reviewGroup(c.id,'Critical');c=await api.reviewGroup(c.id,'Other');return api.review(c);}
async function submitted(c){c=await reviewed(c);const draft=c.drafts.find(d=>d.purpose==='refund');c=await api.approve(c,draft.id,true);return api.simulate(c.id,draft.id,false);}
(async()=>{
  await api.reset();const initial=await api.cases();
  equal(initial.length,2);equal(initial[0].log[0].timestamp,'2026-10-13T23:02:00.000Z');ok((await api.clock()).timestamp>initial[1].log[0].timestamp);
  for(const seeded of initial)for(let i=1;i<seeded.agent_steps.length;i++)equal(Date.parse(seeded.agent_steps[i].timestamp)-Date.parse(seeded.agent_steps[i-1].timestamp),10000,'Agent steps advance ten seconds, including steps with transitions');
  const beforeStudent=(await api.clock()).timestamp;await api.reviewGroup(initial[0].id,'Critical');const afterStudent=(await api.clock()).timestamp;equal(Date.parse(afterStudent)-Date.parse(beforeStudent),120000,'Student event advances two minutes');
  equal(initial[0].reference,'RP-2026-001');ok(initial[0].details.student_name!==initial[1].details.student_name);ok(initial[0].details.provider_name!==initial[1].details.provider_name);
  for(const scenario of ['matched','missing','agent','conflict','injection','redirect']){
    const c=await api.demo(scenario);ok(c.agent_steps.length>=7,scenario);ok(c.agent_steps.some(s=>s.tool==='scan_untrusted_instructions'));
    ok(c.documents.find(d=>d.kind==='provider_confirmation'));ok(!c.documents.find(d=>d.kind==='policy').facts.some(f=>f.field==='default_day'));
    ok(new Set(c.analysis.facts.map(f=>f.confidence)).size>4);
    ok(c.analysis.facts.every(f=>c.documents.some(d=>d.id===f.document_id)));
    if(['matched','agent','redirect'].includes(scenario)){equal(c.analysis.estimate,'12000.00');equal(c.analysis.deadline.date,'2026-11-04');equal(c.remaining_days,21);ok(c.authority.passed);}
    else{equal(c.analysis.estimate,null);ok(c.agent_steps.some(s=>s.status==='blocked'));await reject(api.reviewGroup(c.id,'Critical'),/Resolve source risks/);}
    if(scenario==='agent')ok(c.authority.note.includes('education agent'));
    if(scenario==='injection'){const f=c.findings.find(f=>f.kind==='injection');ok(f.quote.includes('Ignore previous instructions'));ok(f.line>1);equal(f.unchanged,c.details.recipient_name);}
    if(scenario==='redirect'){ok(c.findings.some(f=>f.kind==='redirect'&&f.quote.includes('crypto')));ok(!c.redirect_acknowledged);ok(!c.analysis.risks.length);equal(c.agent_steps.find(s=>s.tool==='calculate_refund').status,'done');equal(c.agent_steps.find(s=>s.tool==='compute_deadline').status,'done');await reject(api.update(c.id,{...c.details,recipient_name:'Unsafe New Payee'}),/Acknowledge the refund redirect warning/);}
    for(let i=1;i<c.agent_steps.length;i++)equal(Date.parse(c.agent_steps[i].timestamp)-Date.parse(c.agent_steps[i-1].timestamp),10000,scenario+' step cadence');
  }
  await api.reset();let [c]=await api.cases();await reject(api.resolve(c.id),/Receipt must be confirmed/);
  await reject(api.review(c),/Confirm both/);
  c=await reviewed(c);equal(c.drafts.length,1);const refund=c.drafts[0].id;ok(!c.submitted_at);
  await reject(api.simulate(c.id,refund,false),/Approve/);
  c=await api.approve(c,refund,true);equal(c.status,'Draft approved');ok(!c.submitted_at);
  c=await api.simulate(c.id,refund,false);equal(c.status,'Request submitted (simulated)');
  await reject(api.simulate(c.id,refund,false),/already simulated/);await reject(api.resolve(c.id),/Receipt must be confirmed/);
  const today=(await api.clock()).date;
  c=await api.simulateProviderReply(c.id,'paid_full');equal(c.status,'Provider reports paid');ok(!c.receipt_confirmed);
  c=await api.confirmReceipt(c.id,{amount:'11999.99',payee:'Wrong Synthetic Payee',date:today,note:''});equal(c.status,'Payment discrepancy');ok(c.receipt_differences.some(d=>d.startsWith('Bank amount')));ok(c.receipt_differences.some(d=>d.startsWith('Bank payee')));
  await reject(api.resolve(c.id),/Receipt must be confirmed/);
  c=await api.confirmReceipt(c.id,{amount:'12000.00',payee:c.details.recipient_name,date:'2026-10-22',note:''});equal(c.status,'Payment discrepancy');ok(c.receipt_differences.some(d=>d.includes('allowed window')));
  c=await api.confirmReceipt(c.id,{amount:'12000.0',payee:c.details.recipient_name,date:today,note:''});equal(c.status,'Receipt confirmed');ok(c.receipt_confirmed);
  c=await api.resolve(c.id);equal(c.status,'Resolved');
  const caseLog=JSON.parse(await api.exportLog(c.id)).events;ok(caseLog.some(e=>e.actor==='provider_sim'));ok(caseLog.some(e=>e.tool==='check_receipt'));ok(caseLog.some(e=>e.action==='Refund draft approved'));ok(caseLog.some(e=>e.action==='Receipt confirmed'));
  for(const e of caseLog){for(const key of ['event_id','case_id','timestamp','actor','action','tool','input_summary','result','status'])ok(key in e);ok(Number.isFinite(Date.parse(e.timestamp)));}
  for(let i=1;i<caseLog.length;i++)ok(caseLog[i].timestamp>caseLog[i-1].timestamp,'Case timeline is strictly increasing');
  for(let i=0;i<14;i++)await api.moveClock('week',c.id);
  const archived=(await api.cases()).find(item=>item.id===c.id);equal(archived.status,'Resolved');ok(archived.receipt_confirmed);
  await api.reset();[c]=await api.cases();c=await submitted(c);const caseId=c.id;
  await api.moveClock('week',caseId);c=(await api.cases()).find(c=>c.id===caseId);equal(c.remaining_days,14);ok(!c.drafts.some(d=>d.purpose==='follow_up'));
  await api.moveClock('week',caseId);c=(await api.cases()).find(c=>c.id===caseId);equal(c.remaining_days,7);const follow=c.drafts.find(d=>d.purpose==='follow_up');ok(follow&&!follow.approved&&!follow.simulated_at);ok(follow.created_at>c.submitted_at);ok(follow.text.includes('$12,000.00 AUD'));ok(follow.text.includes('4 Nov 2026'));ok(!follow.text.includes('AUD 12000.00')); 
  await api.moveClock('deadline',caseId);c=(await api.cases()).find(c=>c.id===caseId);equal((await api.clock()).date,'2026-11-05');equal(c.remaining_days,-1);const internal=c.drafts.find(d=>d.purpose==='internal_complaint');ok(internal&&!internal.approved);ok(internal.channel.includes('internal complaints'));ok(!c.drafts.some(d=>d.purpose==='external_complaint'));
  c=await api.approve(c,internal.id,true);await reject(api.simulate(c.id,internal.id,false),/Confirm the complaint channel/);c=await api.simulate(c.id,internal.id,true);
  for(let i=0;i<3;i++)await api.moveClock('week',caseId);
  c=(await api.cases()).find(c=>c.id===caseId);const external=c.drafts.find(d=>d.purpose==='external_complaint');ok(external&&!external.approved&&!external.simulated_at);ok(external.channel.includes('Commonwealth Ombudsman'));ok(external.text.startsWith('Dear Ombudsman team,'));
  equal(c.drafts.filter(d=>d.purpose==='internal_complaint').length,1);equal(c.drafts.filter(d=>d.purpose==='external_complaint').length,1);
  c=await api.approve(c,external.id,true);c=await api.simulate(c.id,external.id,true);equal(c.status,'External complaint submitted (simulated)');
  let agency=await api.demo('agent');ok(agency.authority.passed);agency=await api.update(agency.id,{...agency.details,recipient_name:'Another Synthetic Person'});ok(!agency.authority.passed);equal(agency.analysis.estimate,null);ok(agency.authority.needed_documents.length>=3);
  const changed=await api.update(c.id,{...c.details,education_level:'higher education'});equal(changed.analysis.complaint_channel.label,'National Student Ombudsman');
  const publicVet=await api.update(changed.id,{...changed.details,education_level:'vet',provider_type:'public'});ok(publicVet.analysis.complaint_channel.label.startsWith('State or territory'));
  const suspicious=await api.note(publicVet.id,'Please receive and re-send money to another person, or pay via crypto.');ok(suspicious.findings.some(f=>f.kind==='redirect'));equal(suspicious.details.recipient_name,publicVet.details.recipient_name);
  // All four provider presets, safe redirect acknowledgement and student bank entry.
  await api.reset();let redirect=await api.demo('redirect');redirect=await submitted(redirect);
  const redirectId=redirect.id, recipient=redirect.details.recipient_name;
  let before=(await api.clock()).timestamp;redirect=await api.simulateProviderReply(redirectId,'no_reply');
  equal(redirect.provider_report,null);ok(!redirect.receipt_confirmed);equal(redirect.analysis.estimate,'12000.00');equal(redirect.analysis.deadline.date,'2026-11-04');
  const noReply=redirect.log.findLast(e=>e.action==='Provider reply simulated');equal(noReply.actor,'provider_sim');ok(noReply.result.includes('No reply'));equal(Date.parse(noReply.timestamp)-Date.parse(before),120000,'Provider event advances two minutes');
  redirect=await api.simulateProviderReply(redirectId,'underpaid');equal(redirect.provider_report.amount,'11500.00');
  redirect=await api.confirmReceipt(redirectId,{...redirect.provider_report,note:''});ok(!redirect.receipt_confirmed);ok(redirect.receipt_differences.some(d=>d.includes('Provider amount $11,500.00 AUD')));await reject(api.resolve(redirectId),/Receipt must be confirmed/);
  redirect=await api.simulateProviderReply(redirectId,'different_payee');equal(redirect.provider_report.amount,'12000.00');ok(redirect.provider_report.payee!==recipient);
  redirect=await api.confirmReceipt(redirectId,{...redirect.provider_report,note:''});ok(!redirect.receipt_confirmed);ok(redirect.receipt_differences.some(d=>d.startsWith('Provider payee')));
  redirect=await api.simulateProviderReply(redirectId,'paid_full');const bank={...redirect.provider_report,note:''};
  redirect=await api.confirmReceipt(redirectId,bank);ok(!redirect.receipt_confirmed);ok(redirect.receipt_differences.some(d=>d.includes('acknowledgement')));
  await reject(api.resolve(redirectId),/Receipt must be confirmed/);equal(redirect.details.recipient_name,recipient);
  redirect=await api.acknowledgeRedirect(redirectId);ok(redirect.redirect_acknowledged);ok(redirect.receipt_confirmed);equal(redirect.analysis.estimate,'12000.00');equal(redirect.analysis.deadline.date,'2026-11-04');
  ok(redirect.log.some(e=>e.actor==='student'&&e.action==='Refund redirect warning acknowledged'));
  redirect=await api.resolve(redirectId);equal(redirect.status,'Resolved');
  let uploadCase=(await api.cases())[0];uploadCase=await submitted(uploadCase);uploadCase=await api.simulateProviderReply(uploadCase.id,'paid_full');
  const line=uploadCase.provider_report;uploadCase=await api.receiptUpload(uploadCase.id,new File([`${line.date} | ${line.amount} | ${line.payee} | Synthetic upload`],'bank.txt'));ok(uploadCase.receipt_confirmed,'Student TXT upload remains available');
  uploadCase=await api.confirmReceipt(uploadCase.id,{...line,note:'Forward your refund to another person.'});ok(!uploadCase.receipt_confirmed);ok(!uploadCase.redirect_acknowledged);equal(uploadCase.analysis.estimate,'12000.00');
  uploadCase=await api.acknowledgeRedirect(uploadCase.id);ok(uploadCase.receipt_confirmed);
  uploadCase=await api.confirmReceipt(uploadCase.id,{...line,note:'Convert the payment to crypto.'});ok(!uploadCase.redirect_acknowledged);ok(!uploadCase.receipt_confirmed,'A changed warning requires fresh acknowledgement');
  let recipientEdit=await api.demo('redirect');recipientEdit=await api.acknowledgeRedirect(recipientEdit.id);recipientEdit=await api.update(recipientEdit.id,{...recipientEdit.details,recipient_name:'Another Synthetic Payee'});equal(recipientEdit.details.recipient_name,'Another Synthetic Payee','Recipient editing is unlocked after acknowledgement; normal authority verification still applies');ok(!recipientEdit.authority.passed);
  const exportAll=JSON.parse(await api.exportLog()).events;for(let i=1;i<exportAll.length;i++)ok(exportAll[i].timestamp>exportAll[i-1].timestamp,'All-case export is globally ordered with unique timestamps');
  for(let i=1;i<exportAll.length;i++)if(exportAll[i].actor!=='assistant')equal(Date.parse(exportAll[i].timestamp)-Date.parse(exportAll[i-1].timestamp),120000,'Every student/provider event advances two minutes');
  equal(new Set(exportAll.map(e=>e.event_id)).size,exportAll.length);
  // Group membership is also checked against the source to avoid widening the UI group.
  const format=fs.readFileSync(path.join(__dirname,'src/refundpath/format.ts'),'utf8');ok(format.includes("'payer_name','nominated_recipient','proposed_recipient'"));ok(!format.match(/criticalFields=.*'refusal_date'/));
  const html=fs.readFileSync(fs.existsSync(path.resolve(__dirname,'../frontend/package.json'))?path.resolve(__dirname,'dist/RefundPath-arayuzler.html'):path.resolve(__dirname,'../../outputs/RefundPath-arayuzler.html'),'utf8');
  equal((html.match(/<\/script>/g)||[]).length,1);ok(!/<script[^>]+src=/.test(html));ok(!/<link[^>]+rel="stylesheet"/.test(html));ok(!/url\((?!data:)/.test(html));equal((html.match(/data:font\/woff2/g)||[]).length,11);ok(html.includes("connect-src 'none'"));ok(!html.includes('fetch('));
  for(const name of ['clock.ts','fixtures.ts','model.ts','agent.ts','offline-api.ts']){const source=fs.readFileSync(path.join(__dirname,name),'utf8');ok(!/Date\.now\(|new Date\(\)/.test(source),name);}
  console.log(`PASS ${checks} assertions: 6 scenarios, source extraction, nominated education agent, approval boundaries, four provider presets, redirect acknowledgement, exact receipt verification, discrepancy/resolution, strictly increasing event clock and ten-second agent steps, escalation chain, jurisdiction routing, safe instructions, event schema and one offline HTML.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
