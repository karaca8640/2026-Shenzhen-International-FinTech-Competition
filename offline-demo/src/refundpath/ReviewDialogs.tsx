import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { Button } from "../components/ui";
import { api } from "./api";
import { Modal } from "./CaseForm";
import { dateLabel, title } from "./format";
import { Download, type Action } from "./shared";
import type { Case, Draft, Fact } from "./types";

export function CorrectionForm({fact, c, busy, action, onClose}: {fact: Fact; c: Case; busy: boolean; action: Action; onClose: () => void}) {
  const [value, setValue] = useState(fact.value);
  const [quote, setQuote] = useState(fact.quote);
  const submit = (e: FormEvent) => { e.preventDefault(); void action(() => api.correct(c.id, {field: fact.field, value, quote, document_id: fact.document_id, page: fact.page}), "Correction recorded; run analysis again.").then(ok => { if (ok) onClose(); }); };
  return <Modal title={`Correct ${title(fact.field).toLowerCase()}`} onClose={onClose}><form onSubmit={submit} className="case-form"><p className="dialog-intro">Cite the source text exactly. A correction that does not match its source stays unverified and blocks calculation.</p><label>Corrected value<input value={value} onChange={e => setValue(e.target.value)} required maxLength={180}/></label><label>Exact source quotation<textarea value={quote} onChange={e => setQuote(e.target.value)} required maxLength={220}/></label><p className="fine-print">{fact.document_name} · page {fact.page}</p><div className="dialog-actions"><Button type="button" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy}>Record correction</Button></div></form></Modal>;
}

export function DraftPreview({draft, c, busy, action, onClose}: {draft: Draft; c: Case; busy: boolean; action: Action; onClose: () => void}) {
  const [channel, setChannel] = useState(false);
  const current = c.drafts.find(d => d.id === draft.id) ?? draft;
  return <Modal title={`${title(current.purpose)} draft`} onClose={onClose}>
    <div className="sandbox-notice"><LockKeyhole size={16}/><span>Sandbox preview. No real email, application or payment.</span></div>
    {current.stale && <p className="notice">Evidence changed. This draft is stale and cannot be approved. Prepare a new draft.</p>}
    <pre className="draft-text">{current.text}</pre><p className="fine-print">Proposed channel: {current.channel}</p>
    {!current.simulated_at && !current.stale && <div className="approval-block"><label className="checkbox-row"><input type="checkbox" checked={current.approved} disabled={busy} onChange={e => void action(() => api.approve(c, current.id, e.target.checked), e.target.checked ? "Draft approved for sandbox simulation." : "Approval revoked.")}/>I have reviewed this exact draft and approve a sandbox simulation.</label>
      {current.kind === "complaint" && <label className="checkbox-row"><input type="checkbox" checked={channel} onChange={e => setChannel(e.target.checked)}/>I have confirmed the complaint channel and provider jurisdiction.</label>}
    </div>}
    {current.simulated_at && <p className="notice success"><CheckCircle2 size={16}/>Simulated on {dateLabel(current.simulated_at)}. No external service was contacted.</p>}
    <div className="dialog-actions"><Download text={current.text} name={`${c.reference}-${current.purpose}-SANDBOX.txt`}/>{!current.simulated_at && <Button variant="primary" disabled={busy || !current.approved || current.stale || (current.kind === "complaint" && !channel)} onClick={() => void action(() => api.simulate(c.id, current.id, channel), "Submission simulated. Nothing was sent externally.")}>Simulate submission<ArrowRight size={15}/></Button>}</div>
  </Modal>;
}
