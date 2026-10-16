# RefundPath offline assistant demo

Open `dist/RefundPath-arayuzler.html` in a modern browser. It is one self-contained file; the browser needs no server, connection, account or API key. All case data is synthetic and kept in memory.

The original production application is separate. This folder implements the requested standalone presentation without changing the backend or its legal registry. It reuses the existing React controls, typography, icons and compiled styles. The registry is the existing `au-2026-10-14.2` snapshot; additional complaint routing metadata points to its complaint source. The course-fee deduction and ESOS four-week default-day rule are preserved.

## Presentation flow

1. Open a matching case. Inspect **Agent activity**: RefundPath Assistant extracts free-text source facts, scans untrusted instructions, compares recipient authority and runs the versioned refund/default checks.
2. On **Evidence**, confirm the Critical and Other source groups, then confirm the overall review. The assistant prepares the refund draft.
3. Preview the exact draft, approve it, and separately choose **Simulate submission**. Approval alone never submits it.
4. On **Payment**, use **Simulate provider reply** with Paid in full, Underpaid (AUD 500 short), Paid to different payee or No reply. Supply an invented bank line manually or with a TXT upload. A wrong amount, payee or out-of-window date produces **Payment discrepancy** and blocks resolution. A matching receipt enables **Mark resolved** on Timeline.
5. For an unpaid submitted case, advance the **Demo clock** twice by seven days to generate the follow-up. **Jump past deadline** proposes the provider’s internal complaint. Approve and simulate it; advance three more weeks to propose the versioned external channel. Every draft requires approval, and complaints require channel confirmation.
6. Use **Export log (JSON)** for a case or **Export all logs (JSON)** on Activity. Activity can be filtered by case. The JSON schema includes event ID, case ID, demo timestamp, actor, action, tool, input summary, result and status.

The clock starts at **14 October 2026, 10:00 Australia/Sydney** (`2026-10-13T23:00:00.000Z`). All domain timestamps use that clock. Student and simulated provider events advance it by two minutes; each assistant tool step advances it by ten seconds. Supporting semantic events and state transitions receive strictly ordered second slots within a tool step. Sample loading also advances the clock. All-case exports are sorted chronologically. Reset demo or reload clears temporary data.

## Six scenarios

- Matching documents: review and complete the synthetic payment/receipt workflow.
- Missing document: source completeness blocks the calculation and request.
- Paid by education agent: the signed agreement nomination matches the proposed recipient; a clear information note explains the authority comparison.
- Conflicting amount: invoice and receipt totals disagree; human review is required.
- Untrusted instructions: the exact quotation, document and line appear with an ignored-as-data badge. The protected recipient is unchanged.
- Refund redirect request: a money-mule / crypto-forwarding request is flagged with a plain warning and official-contact next step. Calculation and deadline stay active. Until the student acknowledges the warning, recipient / bank changes, payment confirmation and resolution are blocked; acknowledging it never applies the unsafe instruction.

## Planner and safety boundary

`AgentPlanner` is an asynchronous interface; `ScriptedPlanner` is this build’s deterministic implementation. `Agent.run` executes local tools and records actual results. No LLM service is connected. A future planner can implement the interface; outbound APIs are absent and blocked by the HTML Content Security Policy in this demo.

Heuristic extraction scores are source-reading indicators, not calibrated probabilities or authenticity checks. Source text is displayed through React text nodes; it is never executed. Unsafe instructions cannot modify protected fields. Financial calculations use integer decimal cents. Receipt comparisons use exact amounts and a documented seven-day date window. The 14-day follow-up and 20-day escalation windows are presentation rules, not newly asserted legal deadlines.

The synthetic documents include a separate provider confirmation letter for student-specific commencement/default facts. The generic refund policy contains no such facts. Uploaded TXT is previewed locally and requires manual verification; PDF/OCR processing is outside this file.

## Rebuild and checks

From the repository root, with the existing frontend dependencies and `frontend/dist` available:

```powershell
node offline-demo/build.cjs
node offline-demo/typecheck.cjs
node offline-demo/check.cjs
```

If development dependencies or the original compiled styles are missing, first run the repository’s existing frontend installation/build workflow. No additional dependency has been added by this demo.

The build writes `offline-demo/dist/RefundPath-arayuzler.html`. Set `REFUNDPATH_HTML_OUTPUT` only when a different output file is required. The bundled test API is regenerated during the build; `check.cjs` exercises all six scenarios, approvals, receipt discrepancies, resolution, the shared clock, escalation, routing, protected instruction handling, log schema and embedded assets.

Validated: strict TypeScript; scenario/flow checks; all six scenarios clicked through in the final HTML with no console errors; grouped evidence approval; provider payment and receipt correction; disabled resolution before confirmation; follow-up/internal/external complaint approvals; per-case and all-case JSON downloads; case filtering; desktop inspector and mobile collapse; no page-wide mobile overflow. Browser QA uses a temporary loopback preview of the same HTML file.
