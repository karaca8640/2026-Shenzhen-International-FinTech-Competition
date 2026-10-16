# RefundPath validation record

Validated on Windows using Python 3.12.14 and the existing Vite 5 / React 18 stack.

## Automated checks

Final full backend run: **177 passed, 1 skipped**. Active RefundPath tests alone:
**60 passed**. Frontend: **10 passed**.

- Backend product tests: passing; deterministic conditions, money and date
  boundaries, evidence/provenance, privacy, retention, consent, session ownership,
  stale drafts, explicit approval and simulation were exercised.
- The retained upstream regression suite passed. One live-provider resilience
  test is skipped because no LLM API key is configured.
- Backend `ruff check .`: passed.
- Frontend ESLint: passed with zero warnings.
- TypeScript `tsc --noEmit`: passed.
- Frontend Vitest: **10 tests passed** in 2 files.
- Vite production build: passed; generated bundle about 219 KB JS before gzip.
- SQLite Alembic upgrades 0001 → 0002 → 0003: passed; `alembic check` reported
  no new upgrade operations.
- Standalone synthetic document generator: passed; a round-trip test uploads the
  generated masked source text and checks that its legal fields remain usable.
- `docker compose config --quiet`: passed. Container builds and PostgreSQL
  runtime checks were not run because Docker Desktop’s daemon is stopped.

## Browser checks

- The delivered desktop checkout was started with the minimal Python runtime
  and the production frontend on **http://127.0.0.1:8000**. Both health and page
  returned successfully. Start, stop (including the Windows Python child) and
  repeated-start protection were verified. Development preview processes were
  stopped; the delivered desktop application remains running.
- The complete matching-document → evidence review → draft → explicit approval
  → local simulation flow was repeated against that production application.
  The simulation button was disabled before approval and enabled after it.

- The actual local UI was exercised, including the key-free synthetic case,
  extracted evidence, amount/deadline presentation, student evidence review,
  draft creation, preview and explicit approval.
- Simulation was disabled before approval. After approval, simulation updated
  the local case to “Waiting for provider”; no external service was contacted.
- Mobile 390×844 and desktop 1440×960 layouts were inspected. Mobile Overview
  had no horizontal page overflow. The new-case form and five separate document
  upload areas were exercised with entirely synthetic TXT files.
- A date-input event issue found during browser testing was fixed. The case
  form successfully retained the date and created a new private case.
- A redaction collision found during upload testing was fixed: `Student visa:
  yes` remains source evidence, while visa identity labels are still masked.
  Dedicated status/provenance and generated-fixture round-trip tests cover it.
- Hidden mobile navigation is removed from keyboard visibility. Native dialogs
  support focus containment/Escape; case tabs support arrow/Home/End navigation.

## Review limits

The product is a local sandbox. Live LLM/OCR, real documents, email, payment,
provider portal and complaint service integration were not used. Image OCR is
unavailable; uploaded images/scanned PDFs need human review. Only the documented
visa-refusal/failure-to-start calculation is automated. Other events, third-party
payers, uncertain routing, legal extensions/holidays and unverified evidence need
human authority. Redaction is heuristic, local storage is not encrypted, and
production deployment is not claimed.

No root licence file exists in the supplied repository; none was invented.
The inspected source files did not contain a matching private-key/API-key pattern;
this is a source scan, not proof about every historical commit or environment.

Screenshots in `docs/screens/` contain synthetic data only.
