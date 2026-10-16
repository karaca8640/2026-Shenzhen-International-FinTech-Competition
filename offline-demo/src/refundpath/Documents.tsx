import { useRef } from "react";
import { Check, ChevronRight, FileText, LockKeyhole, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Button, Spinner } from "../components/ui";
import { api } from "./api";
import type { Action } from "./shared";
import type { Case, CaseDocument } from "./types";

const kinds = [
  ["agreement", "Letter of offer / written agreement", "Course, provider and student details"],
  ["invoice", "Fee invoice", "Itemised provider fees and currency"],
  ["receipt", "Payment receipts", "Amounts, payment date and original payer"],
  ["policy", "Refund policy", "Generic provider policy; no individual default facts"],
  ["provider_confirmation", "Provider confirmation letter", "Default day, course commencement and failure-to-start conditions"],
  ["visa_refusal", "Visa refusal letter", "Decision and refusal date; redact identifiers"],
  ["agent", "Education agent documents", "Optional · intermediary payment or signed authority"],
];

function UploadArea({kind, name, hint, c, busy, action, preview}: {kind: string; name: string; hint: string; c: Case; busy: boolean; action: Action; preview: (doc: CaseDocument) => void}) {
  const input = useRef<HTMLInputElement>(null);
  const docs = c.documents.filter(d => d.kind === kind);
  return <div className="document-slot"><div className="document-slot-heading"><div className="file-icon"><FileText size={19}/></div><div><h3>{name}</h3><p>{hint}</p></div><span className={`slot-state ${docs.length ? "complete" : ""}`}>{docs.length ? <><Check size={13}/>Added</> : kind === "agent" ? "Optional" : "Needed"}</span></div>
    {docs.map(doc => <div className="uploaded-file" key={doc.id}><button onClick={() => preview(doc)}><FileText size={15}/><span>{doc.name}<small>{(doc.size / 1024).toFixed(1)} KB · {doc.pages || "No text"} {doc.pages === 1 ? "page" : "pages"} · raw file discarded</small></span><ChevronRight size={14}/></button><button className="icon-button" aria-label={`Delete ${doc.name}`} disabled={busy} onClick={() => void action(() => api.deleteDocument(c.id, doc.id), "Document deleted; analysis must be refreshed.")}><Trash2 size={15}/></button></div>)}
    <input ref={input} type="file" hidden accept=".txt" aria-label={`Upload ${name}`} onChange={e => {
      const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
      void action(() => file.size > 5 * 1024 * 1024 ? Promise.reject(new Error("Files must be no larger than 5 MB.")) : api.upload(c.id, kind, file), "Document processed locally. Run analysis to check the evidence.");
    }}/>
    <button className="upload-button" disabled={busy} onClick={() => input.current?.click()}><Upload size={15}/>{busy ? "Processing…" : docs.length ? "Add another document" : "Choose a document"}</button>
  </div>;
}

export default function Documents({c, busy, action, preview}: {c: Case; busy: boolean; action: Action; preview: (doc: CaseDocument) => void}) {
  return <><div className="section-heading"><div><h2>Your source documents</h2><p>Synthetic UTF-8 TXT · up to 5 MB each · 12 files per case.</p></div><Button variant="primary" disabled={busy || !c.documents.length} onClick={() => void action(() => api.analyse(c.id), "Analysis completed. Review the evidence and risks.")}>{busy ? <Spinner/> : <ShieldCheck size={15}/>}Run analysis</Button></div>
  <div className="local-processing"><LockKeyhole size={18}/><div><strong>Processed locally by default</strong><p>Synthetic source text stays in temporary browser memory. Uploaded TXT needs manual verification; PDF and OCR are not included.</p></div></div>
  <div className="document-grid">{kinds.map(([kind, name, hint]) => <UploadArea key={kind} kind={kind} name={name} hint={hint} c={c} busy={busy} action={action} preview={preview}/>)}</div></>;
}
