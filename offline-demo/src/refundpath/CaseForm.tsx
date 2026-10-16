import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "../components/ui";
import type { Details } from "./types";

export function Modal({title, children, onClose}: {title: string; children: React.ReactNode; onClose: () => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="rp-dialog" onCancel={onClose} aria-labelledby="dialog-title"><div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}

const empty: Details = {student_name: "", provider_name: "", course_name: "", course_start: "", country: "AU", provider_type: "unknown", education_level: "unknown", event_type: "visa_no_start", recipient_name: "", payer_name: "", payer_type: "student", timezone: "Australia/Sydney", bank_changed: false};

export default function CaseForm({initial, busy, onSubmit, onClose}: {initial?: Details; busy: boolean; onSubmit: (details: Details) => Promise<void>; onClose: () => void}) {
  const [data, setData] = useState<Details>(initial ?? empty);
  const set = <K extends keyof Details>(key: K, value: Details[K]) => setData(d => ({...d, [key]: value}));
  const submit = (e: FormEvent) => { e.preventDefault(); void onSubmit(data); };
  return <Modal title={initial ? "Edit case details" : "Create a refund case"} onClose={onClose}>
    <p className="dialog-intro">Australia only. Use invented details for this in-memory demonstration. Account, passport and visa numbers are not needed.</p>
    <form onSubmit={submit} className="case-form">
      <div className="form-grid">
        <label>Student name<input required minLength={2} maxLength={80} value={data.student_name} onChange={e => set("student_name", e.target.value)}/></label>
        <label>Provider name<input required minLength={2} maxLength={120} value={data.provider_name} onChange={e => set("provider_name", e.target.value)}/></label>
        <label>Course name<input required minLength={2} maxLength={120} value={data.course_name} onChange={e => set("course_name", e.target.value)}/></label>
        <label>Agreed course starting day<input type="date" required value={data.course_start} onInput={e => set("course_start", e.currentTarget.value)} onChange={e => set("course_start", e.target.value)}/></label>
        <label>Provider type<select value={data.provider_type} onChange={e => set("provider_type", e.target.value as Details["provider_type"])}><option value="unknown">Not confirmed</option><option value="private">Private provider</option><option value="public">Public provider</option></select></label>
        <label>Education level<select value={data.education_level} onChange={e => set("education_level", e.target.value as Details["education_level"])}><option value="unknown">Not confirmed</option><option value="vet">Vocational education (VET)</option><option value="higher education">Higher education</option><option value="school">School</option><option value="elicos">ELICOS</option></select></label>
        <label>Event type<select value={data.event_type} onChange={e => set("event_type", e.target.value as Details["event_type"])}><option value="visa_no_start">Visa refusal · did not start</option><option value="visa_withdrawal">Visa refusal · withdrew</option><option value="provider_default">Provider default</option><option value="other">Other · manual review</option></select></label>
        <label>Provider’s timezone<select value={data.timezone} onChange={e => set("timezone", e.target.value)}>{["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Darwin", "Hobart"].map(t => <option key={t} value={`Australia/${t}`}>{t}</option>)}</select></label>
        <label>Original payer name<input required minLength={2} maxLength={80} value={data.payer_name} onChange={e => set("payer_name", e.target.value)}/></label>
        <label>Original payer type<select value={data.payer_type} onChange={e => set("payer_type", e.target.value as Details["payer_type"])}><option value="student">Student</option><option value="agent">Education agent</option><option value="third_party">Other person / organisation</option></select></label>
        <label className="full-row">Proposed refund recipient<input required minLength={2} maxLength={80} value={data.recipient_name} onChange={e => set("recipient_name", e.target.value)}/></label>
      </div>
      <label className="checkbox-row"><input type="checkbox" checked={data.bank_changed} onChange={e => set("bank_changed", e.target.checked)}/>Different bank details are proposed (requires manual review)</label>
      {data.event_type !== "visa_no_start" && <p className="notice">This event can be tracked, but its legal calculation requires manual review in this MVP.</p>}
      <div className="dialog-actions"><Button onClick={onClose} type="button">Cancel</Button><Button variant="primary" disabled={busy} type="submit">{busy ? "Saving…" : initial ? "Save details" : "Create case"}</Button></div>
    </form>
  </Modal>;
}
