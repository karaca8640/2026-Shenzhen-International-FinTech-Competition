import { useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui";
import { api } from "./api";
import { amount, dateLabel, title } from "./format";
import type { Action } from "./shared";
import type { Case, Registry } from "./types";

export function Calculation({c}: {c: Case}) {
  const a = c.analysis;
  return <><div className="section-heading"><div><h2>Understand your refund estimate</h2><p>All money uses decimal arithmetic. No currency conversion is performed.</p></div><span className="small-tag">AUD only</span></div>
  <div className="calculation-layout"><div className="calculation-lines"><div><span>Gross provider payments</span><strong>{amount(a?.gross_payments)}</strong></div><div><span>Included provider course fees<small>Tuition + non-tuition fees received by the provider</small></span><strong>{amount(a?.included_payments)}</strong></div><div><span>Statutory deduction<small>Lesser of 5% of pre-default course fees or AUD 500</small></span><strong>{a?.deduction ? `−${amount(a.deduction)}` : "Unconfirmed"}</strong></div><div className="calculation-total"><span>Provisional refund estimate</span><strong>{amount(a?.estimate)}</strong></div><p className="formula">{a?.formula ?? "Run analysis to determine whether a rule applies."}</p><p className="fine-print">Separate agent fees are excluded pending contract review. A risk or unsupported condition suppresses the estimate and deadline.</p></div><aside className="rule-aside"><ShieldCheck size={22}/><h3>{a?.estimate ? "A sourced formula" : "Legal verification required"}</h3><p>{a?.estimate ? "Visa refusal causing failure to start; subject to the facts and statutory conditions." : "The applicable event, evidence or legal rule has not been confirmed."}</p><small>Calculation of Refund Instrument 2024<br/>Section 10(1)–(3)</small><Link to="/sources">Inspect official sources<ArrowRight size={14}/></Link></aside></div>
  <div className="deadline-detail"><Clock3 size={20}/><div><h3>{a?.deadline ? `${dateLabel(a.deadline.date)} · provider obligation date` : "No deadline established"}</h3><p>{a?.deadline ? `${a.deadline.section}. Trigger: ${a.deadline.trigger_label}, ${dateLabel(a.deadline.trigger)}. Timezone: ${a.deadline.timezone}.` : "The refusal letter date alone is insufficient. A qualifying default and its date must be evidenced."}</p>{a?.deadline && <p className="fine-print">{a.deadline.qualification}</p>}</div></div>
  {a?.applied_rules.map(r => <p className="fine-print" key={r.id}>{r.section} · effective {dateLabel(r.effective_from)} · last checked {dateLabel(r.checked_at)} · version {a.rule_version}</p>)}</>;
}

export function Recipient({c, onEdit}: {c: Case; onEdit: () => void}) {
  const a = c.analysis;
  const risks = a?.risks.filter(r => /payer|recipient|bank|agent/.test(r.code)) ?? [];
  return <><div className="section-heading"><div><h2>Check the proposed recipient</h2><p>This compares document fields. It does not verify identity, account ownership or payment authority.</p></div><Button onClick={onEdit}>Edit recipient</Button></div>
  <div className="recipient-comparison"><div><span className="eyebrow">Original payer</span><h3>{a?.facts.find(f => f.field === "payer_name")?.value ?? c.details.payer_name}</h3><p>{title(c.details.payer_type)}</p><small>Source: payment receipt · confirm the evidence</small></div><ArrowRight size={24}/><div><span className="eyebrow">Proposed refund recipient</span><h3>{c.details.recipient_name}</h3><p>Student-entered case detail</p><small>Account numbers are not collected</small></div></div>
  <div className={`notice ${a && !risks.length ? "success" : ""}`}><ShieldCheck size={18}/>{!a ? "Run analysis to compare the source fields." : risks.length ? "Recipient or payer risk found. Automatic progress is blocked." : "Names are consistent in the supplied evidence. This is not bank or identity verification."}</div>
  {risks.map(r => <div className="risk-row" key={r.code}><span className="risk-dot"/><div><h3>{title(r.code)}</h3><p>{r.message}</p></div></div>)}
  <p className="legal-footnote">A third party can be nominated in an agreement in some circumstances. This MVP requires human review for agent, third-party or changed bank details and does not determine their authority.</p></>;
}

export function Timeline({c, busy, action}: {c: Case; busy: boolean; action: Action}) {
  const [reminder, setReminder] = useState(c.follow_up_date ?? "");
  const canDraft = c.student_reviewed && !!c.analysis && !c.analysis.risks.length;
  return <><div className="section-heading"><div><h2>Track your case</h2><p>Every entry is local to your sandbox.</p></div><Button disabled={busy || c.status === "Resolved"} onClick={() => void action(() => api.resolve(c.id), "Case marked resolved in the sandbox.")}>Mark resolved</Button></div>
  <div className="timeline-layout"><div className="timeline">{[...c.history].reverse().map((h, i) => <div className="timeline-event" key={h.id}><span className={i === 0 ? "current" : ""}/><div><small>{new Intl.DateTimeFormat("en-AU", {dateStyle: "medium", timeStyle: "short", timeZone: c.details.timezone}).format(new Date(h.at))}</small><h3>{h.status}</h3><p>{h.text}</p></div></div>)}</div><aside className="timeline-tools"><h3>Local follow-up reminder</h3><p>Reminders appear in the dashboard. No email or push notification is sent.</p><label>Follow-up date<input type="date" value={reminder} onChange={e => setReminder(e.target.value)}/></label><Button disabled={busy || !reminder} onClick={() => void action(() => api.reminder(c.id, reminder), "Local reminder saved.")}>Save reminder</Button><hr/><h3>Provider follow-up</h3><Button disabled={busy || !canDraft || !c.drafts.some(d => d.kind === "refund" && d.simulated_at)} onClick={() => void action(() => api.draft(c.id, "follow_up"), "Follow-up draft prepared.")}>Prepare follow-up</Button><p className="fine-print">Available after the refund request simulation. Open the resulting draft from the Overview tab.</p></aside></div></>;
}

export function Safety({c, rules, busy, action}: {c: Case; rules: Registry | null; busy: boolean; action: Action}) {
  const a = c.analysis;
  return <><div className="section-heading"><div><h2>Checks, risks & human review</h2><p>{a?.summary ?? "Run analysis to generate your safety report."}</p></div></div>
  {a?.checks.map(check => <div className="check-row" key={check.label}>{check.passed ? <CheckCircle2 size={18} className="text-ok"/> : <Clock3 size={18} className="text-warn"/>}<span>{check.label}</span><strong>{check.passed ? "Passed" : "Needs attention"}</strong></div>)}
  {a?.risks.map(r => <div className="risk-row" key={r.code}><span className="risk-dot"/><div><h3>{title(r.code)}</h3><p>{r.message}</p></div><span className="small-tag">Human review</span></div>)}
  <div className="section-heading"><div><h2>Complaint channel</h2><p>Routing depends on education level and provider type.</p></div></div><p className="routing-label">{a?.complaint_channel.label ?? "Not confirmed · run analysis"}</p><p className="fine-print">Confirm jurisdiction and complete the provider’s complaint process where appropriate. A complaint draft can be prepared even while the channel is uncertain.</p><Button disabled={busy} onClick={() => void action(() => api.draft(c.id, "complaint"), "Complaint draft prepared; open it from Overview to review and approve.")}>Prepare complaint draft</Button>
  <div className="section-heading"><div><h2>Document assistant</h2><p>Summaries are unverified text. They never set eligibility, amounts, dates or recipients.</p></div></div>
  <label className="checkbox-row ai-consent"><input type="checkbox" checked={c.external_ai_opt_in} disabled={busy} onChange={e => void action(() => api.consent(c.id, e.target.checked), e.target.checked ? "Consent recorded. Summarisation must still be started explicitly." : "External AI consent revoked.")}/>I explicitly opt in to sending masked document excerpts to the configured external AI provider when I request a summary. Without a configured API, this stays local.</label>
  <Button disabled={busy || !c.documents.length} onClick={() => void action(() => api.assist(c.id, c.external_ai_opt_in), "Document summary prepared.")}>Summarise documents</Button>
  {c.assistant_summary && <div className="assistant-summary"><small>{c.assistant_summary.method}</small><p>{c.assistant_summary.text}</p></div>}
  <div className="privacy-note"><LockKeyhole size={18}/><p>Raw files are discarded after extraction. The session lasts 24 hours. Expired case data is purged while the backend runs, or on its next start; you can delete it sooner. No outbound communication endpoint exists.</p></div>
  <p className="fine-print">Legal registry: {rules?.version ?? "Unavailable"} · checked {dateLabel(rules?.checked_at)}</p></>;
}
