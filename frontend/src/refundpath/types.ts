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
}
export interface Registry {
  version: string | null; checked_at: string; review_due: string; sources: LegalSource[]; rules: Rule[];
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
}
export interface Case {
  id: string; reference: string; details: Details; status: string; display_status: string;
  documents: CaseDocument[]; corrections: Fact[]; analysis: Analysis | null; student_reviewed: boolean;
  content_version: number; drafts: Draft[]; history: {id: string; at: string; status: string; text: string}[];
  follow_up_date: string | null; external_ai_opt_in: boolean;
  assistant_summary: {text: string; method: string; created_at: string} | null;
  created_at: string; synthetic: boolean; remaining_days: number | null;
}
