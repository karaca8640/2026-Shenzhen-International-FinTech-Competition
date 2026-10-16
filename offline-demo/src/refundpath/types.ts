export interface Details {
  student_name: string; provider_name: string; course_name: string; course_start: string;
  country: "AU"; provider_type: "public" | "private" | "unknown";
  education_level: "higher education" | "vet" | "school" | "elicos" | "unknown";
  event_type: "visa_no_start" | "visa_withdrawal" | "provider_default" | "other";
  recipient_name: string; payer_name: string; payer_type: "student" | "agent" | "third_party";
  timezone: string; bank_changed: boolean;
}
export interface Fact {
  field: string; value: string; document_id: string; document_name: string; page: number;
  line: number | null; quote: string; confidence: number; method: string;
}
export interface CaseDocument {
  id: string; kind: string; name: string; size: number; pages: number; preview: string;
  facts: Fact[]; injection_flag: boolean; issue: string | null; synthetic: boolean; raw_retained: boolean;
}
export interface LegalSource {
  id: string; title: string; url: string; snapshot_url?: string; version: string;
  effective_from: string | null; checked_at: string; section: string; summary: string;
}
export interface Rule {
  id: string; section: string; sources: string[]; effective_from: string; checked_at: string;
  deduction_percent?: string; deduction_cap_aud?: string; weeks_after_default?: number;
}
export interface Registry {
  version: string | null; checked_at: string; review_due: string; sources: LegalSource[]; rules: Rule[];
  complaint_routes: {provider_types: string[]; education_level: string; label: string; source_id: string; checked_at: string}[];
}
export interface Analysis {
  status: string; facts: Fact[]; risks: {code: string; message: string; severity: string}[];
  missing_documents: string[]; rule_version: string | null; applied_rules: Rule[];
  currency: string; gross_payments: string | null; included_payments: string | null;
  deduction: string | null; estimate: string | null; formula: string;
  deadline: {date: string; trigger: string; trigger_label: string; timezone: string; rule_id: string; section: string; source_ids: string[]; kind: string; qualification: string} | null;
  complaint_channel: {label: string; source: string; requires_confirmation: boolean; checked_at: string};
  summary: string; checks: {label: string; passed: boolean}[];
}
export interface Draft {
  id: string; kind: "refund" | "follow_up" | "complaint"; text: string; created_at: string;
  approved: boolean; stale: boolean; content_version: number; rule_version: string; simulated_at: string | null;
  purpose: 'refund' | 'follow_up' | 'internal_complaint' | 'external_complaint'; channel: string;
}
export interface Case {
  id: string; reference: string; details: Details; status: string; display_status: string;
  documents: CaseDocument[]; corrections: Fact[]; analysis: Analysis | null; student_reviewed: boolean;
  content_version: number; drafts: Draft[]; history: {id: string; at: string; status: string; text: string}[];
  follow_up_date: string | null; external_ai_opt_in: boolean;
  assistant_summary: {text: string; method: string; created_at: string} | null;
  created_at: string; synthetic: boolean; remaining_days: number | null;
  agent_steps: AgentStep[]; log: LogEvent[]; scenario: string; reviewed_groups: string[];
  provider_report: PaymentLine | null; bank_line: PaymentLine | null; receipt_confirmed: boolean;
  receipt_differences: string[]; submitted_at: string | null; internal_complaint_at: string | null;
  findings: Finding[]; student_note: string; authority: Authority | null; redirect_acknowledged: boolean;
}

export type ProviderReply = 'paid_full' | 'underpaid' | 'different_payee' | 'no_reply';
export interface PaymentLine {amount: string; date: string; payee: string; note: string}
export interface Authority {passed: boolean; payer: string; nominated: string; proposed: string; note: string; needed_documents: string[]}
export interface Finding {kind: 'injection' | 'redirect'; quote: string; source: string; line: number; field: string; unchanged: string}
export type Tool = 'extract_documents' | 'check_recipient_authority' | 'calculate_refund' | 'compute_deadline' | 'draft_request' | 'simulate_submission' | 'check_receipt' | 'escalate' | 'scan_untrusted_instructions';
export interface AgentStep {tool: Tool; input_summary: string; output_summary: string; decision: string; status: 'done' | 'blocked' | 'awaiting_approval'; timestamp: string}
export interface LogEvent {event_id: string; case_id: string; timestamp: string; actor: 'student' | 'assistant' | 'provider_sim'; action: string; tool: Tool | null; input_summary: string; result: string; status: string}
