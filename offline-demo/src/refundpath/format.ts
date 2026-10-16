export function amount(value: string | null | undefined): string {
  return value == null ? "—" : new Intl.NumberFormat("en-AU", {style: "currency", currency: "AUD", maximumFractionDigits: 2}).format(Number(value));
}
export function moneyLabel(value: string | null | undefined): string {return value == null ? 'unconfirmed' : `${amount(value)} AUD`;}
export function dateLabel(value: string | null | undefined): string {
  if (!value) return "Not confirmed";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return new Intl.DateTimeFormat("en-AU", {day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney"}).format(date);
}
const labels:Record<string,string> = {
  visa_refusal:'Visa refusal notice',visa_no_start:'Visa refusal · did not start',visa_withdrawal:'Visa refusal · withdrew',provider_default:'Provider default',
  vet:'Vocational education (VET)',elicos:'English language course (ELICOS)',agent:'Education agent',third_party:'Other person / organisation',
  agreement:'Written agreement',invoice:'Fee invoice',receipt:'Payment receipt',policy:'Refund policy',provider_confirmation:'Provider confirmation letter',
  nominated_recipient:'Agreement-nominated recipient',nominated_recipient_role:'Nominated recipient role',separate_intermediary_fee:'Separate education agent fee',
  untrusted_instruction:'Untrusted text in document',student_visa:'Student visa condition',visa_refused:'Visa refusal confirmed',condition_visa_refused:'Visa refusal condition',
  extract_documents:'Extract documents',check_recipient_authority:'Check recipient authority',calculate_refund:'Calculate refund',compute_deadline:'Compute deadline',
  draft_request:'Draft request',simulate_submission:'Simulate submission',check_receipt:'Check receipt',escalate:'Escalate case',scan_untrusted_instructions:'Scan untrusted instructions',
  internal_complaint:'Internal complaint',external_complaint:'External complaint',follow_up:'Follow-up',refund:'Refund request',
  provider_sim:'Simulated provider',assistant:'RefundPath Assistant',student:'Student',awaiting_approval:'Awaiting student approval',
  yes:'Yes',no:'No',private:'Private provider',public:'Public provider',unknown:'Not confirmed',done:'Done',blocked:'Blocked',
  low_confidence:'Source confidence needs review',recipient_authority:'Recipient needs verification',untrusted_text:'Untrusted instructions ignored',
  legal_conditions:'Legal conditions need confirmation',manual_extraction:'Manual source verification',intake_mismatch:'Case details differ from sources',
};
export function title(value: string): string { return labels[value] ?? value.replace(/_/g, " ").replace(/^./, c => c.toUpperCase()); }
export function factValue(field:string,value:string) {return ['event_type','education_level','provider_type','payer_type','nominated_recipient_role','student_visa','visa_refused','registered_provider','student_started_course','previously_withdrawn','provider_started_course','refusal_caused_no_start','bank_changed'].includes(field)?title(value):value;}
export const criticalFields=new Set(['tuition_paid','non_tuition_paid','invoice_total','receipt_total','course_start','default_day','event_type','payer_name','nominated_recipient','proposed_recipient']);
export function statusTone(status: string): string {
  return /Resolved|Receipt confirmed|Evidence reviewed|Draft approved/.test(status) ? "good" : /Manual|Overdue|discrepancy/.test(status) ? "warning" : /approval|review|Follow-up|complaint|reports paid/.test(status) ? "attention" : "neutral";
}
