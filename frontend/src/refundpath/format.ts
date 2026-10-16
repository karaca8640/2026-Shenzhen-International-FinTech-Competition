export function amount(value: string | null | undefined): string {
  return value == null ? "—" : new Intl.NumberFormat("en-AU", {style: "currency", currency: "AUD", maximumFractionDigits: 2}).format(Number(value));
}
export function dateLabel(value: string | null | undefined): string {
  if (!value) return "Not confirmed";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return new Intl.DateTimeFormat("en-AU", {day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney"}).format(date);
}
export function title(value: string): string { return value.replace(/_/g, " ").replace(/^./, c => c.toUpperCase()); }
export function statusTone(status: string): string {
  return status === "Resolved" || status === "Draft ready" ? "good" : /Manual|Overdue|Escalated/.test(status) ? "warning" : /approval|review|Follow-up/.test(status) ? "attention" : "neutral";
}
