import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, FileText, ShieldCheck, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui";
import { api } from "./api";
import CaseForm, { Modal } from "./CaseForm";
import { Calculation, Recipient, Safety, Timeline } from "./CasePanels";
import Documents from "./Documents";
import { CorrectionForm, DraftPreview } from "./ReviewDialogs";
import { amount, dateLabel, title } from "./format";
import { Status, type Action } from "./shared";
import type { Case, CaseDocument, Draft, Fact, Registry } from "./types";

const tabs = ["Overview", "Documents", "Evidence", "Calculation", "Recipient", "Timeline", "Safety"];

export default function CaseWorkspace({c, rules, busy, action}: {c: Case; rules: Registry | null; busy: boolean; action: Action}) {
  const [tab, setTab] = useState("Overview");
  const [preview, setPreview] = useState<CaseDocument | null>(null);
  const [correction, setCorrection] = useState<Fact | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [edit, setEdit] = useState(false);
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);
  const a = c.analysis;
  const canDraft = c.student_reviewed && !!a && a.risks.length === 0;
  const submitted = c.drafts.some(d => d.kind === "refund" && d.simulated_at);
  const nextTab = submitted || c.status === "Resolved" ? "Timeline" : !a ? "Documents" : a.risks.length ? "Safety" : "Evidence";

  return <>
    <Link to="/" className="back-link"><ArrowLeft size={14}/>All refund cases</Link>
    <div className="workspace-heading"><div><div className="eyebrow">{c.reference} <span>•</span> {c.synthetic ? "Synthetic demo case" : "Private sandbox case"}</div><h1>{c.details.provider_name}</h1><p>{c.details.course_name} <span>·</span> {c.details.student_name}</p></div><div className="workspace-actions"><Status value={c.display_status}/><Button onClick={() => setEdit(true)}>Edit details</Button></div></div>
    <div className="case-tabs" role="tablist" aria-label="Case sections" onKeyDown={e => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const current = tabs.indexOf(tab);
      const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (current + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      setTab(tabs[next]); document.getElementById(`tab-${tabs[next]}`)?.focus();
    }}>{tabs.map(t => <button key={t} role="tab" tabIndex={tab === t ? 0 : -1} aria-selected={tab === t} aria-controls="case-tabpanel" id={`tab-${t}`} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}{t === "Documents" && <span>{c.documents.length}</span>}</button>)}</div>
    <div id="case-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="tab-content" key={tab}>
    {tab === "Overview" && <>
      <div className="case-overview-grid"><div className="amount-panel"><div className="eyebrow">Provisional refund estimate <span className="small-tag">AUD</span></div><div className="hero-amount">{amount(a?.estimate)}</div><p>{a?.estimate ? "Based on matching evidence and the 2024 statutory formula." : "Complete and verify your evidence to calculate an estimate."}</p><button onClick={() => setTab("Calculation")}>See how this was calculated<ArrowRight size={16}/></button><div className="amount-panel-footer"><ShieldCheck size={15}/>No money moves. Every action stays in the sandbox.</div></div>
      <div className="case-context"><div className="context-row"><Clock3 size={18}/><div><small>Provider obligation deadline</small><strong>{dateLabel(a?.deadline?.date)}</strong><p>{c.remaining_days == null ? "The legal trigger has not been confirmed." : c.remaining_days < 0 ? `${Math.abs(c.remaining_days)} days past the provisional date` : `${c.remaining_days} days remaining · ${c.details.timezone}`}</p></div></div><div className="context-row"><FileText size={18}/><div><small>Your next step</small><strong>{c.status === "Resolved" ? "Case marked resolved" : submitted ? "Track the local follow-up" : !a ? "Upload documents and run analysis" : a.risks.length ? "Resolve the flagged evidence" : !c.student_reviewed ? "Review your extracted information" : "Prepare and approve your request"}</strong><p>{a?.risks.length ? `${a.risks.length} checks need attention` : "You stay in control of each step."}</p></div></div><Button variant="primary" onClick={() => setTab(nextTab)}>{submitted ? "View timeline" : "Continue case"}<ArrowRight size={15}/></Button></div></div>
      <div className="section-heading"><div><h2>Case progress</h2><p>Evidence first. Student approval before every simulation.</p></div></div>
      <div className="progress-track">{[["Documents added", c.documents.length >= 5], ["Evidence analysed", !!a], ["Student reviewed", c.student_reviewed], ["Draft approved", c.drafts.some(d => d.approved && !d.stale)], ["Submission simulated", c.drafts.some(d => d.simulated_at)]].map(([label, done], i) => <div className={done ? "done" : ""} key={String(label)}><span>{done ? <Check size={15}/> : i + 1}</span><p>{label}</p></div>)}</div>
      <div className="section-heading"><div><h2>Request drafts</h2><p>Preview, download and approve your text.</p></div><div className="inline-actions"><Button disabled={busy || !canDraft} onClick={() => void action(() => api.draft(c.id, "refund"), "Refund request drafted. Open it to preview and approve.")}>Create request<ArrowRight size={15}/></Button><Button disabled={busy} onClick={() => void action(() => api.draft(c.id, "complaint"), "Complaint draft prepared. Confirm the appropriate channel.")}>Complaint draft</Button></div></div>
      {c.drafts.length ? <div className="draft-list">{c.drafts.map(d => <button key={d.id} onClick={() => setDraft(d)}><FileText size={19}/><div><strong>{title(d.kind)} draft</strong><small>{dateLabel(d.created_at)} · {d.stale ? "Stale · evidence changed" : d.simulated_at ? "Simulated" : d.approved ? "Approved for simulation" : "Awaiting approval"}</small></div><ChevronRight size={17}/></button>)}</div> : <div className="empty-inline"><FileText size={22}/><p>No drafts yet. Review the evidence to prepare your refund request.</p></div>}
      <p className="legal-footnote">RefundPath is a prototype, not a legal or financial adviser. Estimates and calendar dates need authoritative confirmation; they do not establish entitlement or replace a provider’s decision.</p>
    </>}
    {tab === "Documents" && <Documents c={c} busy={busy} action={action} preview={setPreview}/>}
    {tab === "Evidence" && <>
      <div className="section-heading"><div><h2>Review the extracted information</h2><p>Confidence measures extraction quality, not authenticity or legal entitlement.</p></div><Button disabled={busy || !c.documents.length} onClick={() => void action(() => api.analyse(c.id), "Analysis refreshed.")}>Reanalyse</Button></div>
      {!a ? <div className="empty-inline"><FileText/><p>Upload documents and run analysis first.</p><Button onClick={() => setTab("Documents")}>Go to documents</Button></div> : <>
      {!!a.risks.length && <div className="notice">{a.risks.length} checks need human attention. Review the Safety tab before progressing.</div>}
      <div className="evidence-table">{a.facts.map(f => <div className="evidence-row" key={f.field}><div><small>{title(f.field)}</small><strong>{f.value}</strong></div><div className="source-quote"><p>“{f.quote}”</p><small>{f.document_name} · p. {f.page}{f.line ? `, line ${f.line}` : ""}</small></div><div><span className={`confidence ${f.confidence >= .85 ? "high" : "low"}`}>{Math.round(f.confidence * 100)}% extraction</span><button className="text-button" onClick={() => setCorrection(f)}>Correct field</button></div></div>)}</div>
      {!a.facts.length && <div className="empty-inline"><p>No readable source fields. Upload a text document or obtain manual extraction.</p></div>}
      <div className="student-review"><label className="checkbox-row"><input type="checkbox" checked={reviewedVersion === c.content_version || c.student_reviewed} disabled={busy || c.student_reviewed || !!a.risks.length} onChange={e => setReviewedVersion(e.target.checked ? c.content_version : null)}/>I have checked the critical values against their source documents.</label><Button variant="primary" disabled={busy || reviewedVersion !== c.content_version || c.student_reviewed || !!a.risks.length} onClick={() => void action(() => api.review(c), "Evidence reviewed. Your refund request can now be drafted.")}>{c.student_reviewed ? <><Check size={15}/>Evidence reviewed</> : "Confirm evidence review"}</Button></div>
      </>}
    </>}
    {tab === "Calculation" && <Calculation c={c}/>}
    {tab === "Recipient" && <Recipient c={c} onEdit={() => setEdit(true)}/>}
    {tab === "Timeline" && <Timeline c={c} busy={busy} action={action}/>}
    {tab === "Safety" && <Safety c={c} rules={rules} busy={busy} action={action}/>}
    </div>
    {preview && <Modal title={preview.name} onClose={() => setPreview(null)}><div className="sandbox-notice"><FileText size={16}/>Masked extracted text · raw file not retained</div>{preview.issue && <p className="notice">{preview.issue}</p>}<pre className="document-preview">{preview.preview || "No locally readable text. Upload a text PDF or TXT copy for analysis."}</pre><div className="dialog-actions"><Button onClick={() => setPreview(null)}><X size={15}/>Close preview</Button></div></Modal>}
    {correction && <CorrectionForm fact={correction} c={c} busy={busy} action={action} onClose={() => setCorrection(null)}/>}
    {draft && <DraftPreview draft={draft} c={c} busy={busy} action={action} onClose={() => setDraft(null)}/>}
    {edit && <CaseForm initial={c.details} busy={busy} onClose={() => setEdit(false)} onSubmit={async details => { const ok = await action(() => api.update(c.id, details), "Details saved; run analysis again."); if (ok) setEdit(false); }}/>} 
  </>;
}
