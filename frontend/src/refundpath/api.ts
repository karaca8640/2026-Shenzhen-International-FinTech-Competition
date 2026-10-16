import type { Case, Details, Registry } from "./types";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    method, credentials: "same-origin", headers: body && !form ? {"Content-Type": "application/json"} : {},
    body: body ? form ? body : JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    let message = "The request could not be completed. Please retry.";
    try { const error = await response.json(); if (typeof error.detail === "string") message = error.detail; } catch { /* Safe generic error. */ }
    throw new Error(message);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export const api = {
  session: () => request<{sandbox: boolean}>("/session", "POST"),
  cases: () => request<Case[]>("/cases"),
  rules: () => request<Registry>("/rules"),
  create: (details: Details) => request<Case>("/cases", "POST", details),
  demo: (scenario: string) => request<Case>("/demo", "POST", {scenario}),
  update: (id: string, details: Details) => request<Case>(`/cases/${id}`, "PATCH", details),
  remove: (id: string) => request<void>(`/cases/${id}`, "DELETE"),
  upload: (id: string, kind: string, file: File) => { const data = new FormData(); data.append("file", file); return request<Case>(`/cases/${id}/documents/${kind}`, "POST", data); },
  deleteDocument: (id: string, doc: string) => request<Case>(`/cases/${id}/documents/${doc}`, "DELETE"),
  analyse: (id: string) => request<Case>(`/cases/${id}/analyse`, "POST"),
  review: (c: Case) => request<Case>(`/cases/${c.id}/review`, "POST", {approved: true, content_version: c.content_version}),
  correct: (id: string, body: unknown) => request<Case>(`/cases/${id}/corrections`, "POST", body),
  draft: (id: string, kind: string) => request<Case>(`/cases/${id}/drafts`, "POST", {kind}),
  approve: (c: Case, id: string, approved: boolean) => request<Case>(`/cases/${c.id}/drafts/${id}/approve`, "POST", {approved, content_version: c.content_version}),
  simulate: (id: string, draft: string, channel: boolean) => request<Case>(`/cases/${id}/drafts/${draft}/simulate`, "POST", {channel_confirmed: channel}),
  reminder: (id: string, date: string) => request<Case>(`/cases/${id}/reminder`, "POST", {date}),
  resolve: (id: string) => request<Case>(`/cases/${id}/resolve`, "POST"),
  consent: (id: string, opt_in: boolean) => request<Case>(`/cases/${id}/ai-consent`, "POST", {opt_in}),
  assist: (id: string, opt_in: boolean) => request<Case>(`/cases/${id}/assist`, "POST", {opt_in}),
};
