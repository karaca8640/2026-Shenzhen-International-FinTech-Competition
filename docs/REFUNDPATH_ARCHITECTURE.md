# RefundPath implementation

The existing repository uses React 18, TypeScript, Vite and Tailwind on the
frontend, and FastAPI, async SQLAlchemy, Alembic, PostgreSQL/SQLite, Redis and
LangGraph on the backend. The original chat and console concern a different
domain. Their backend remains isolated in `app/legacy_main.py` so existing
regression tests are preserved. The active `app.main:app` exposes only RefundPath.
No original demo data is seeded by the active application.

## Active flow

1. A browser receives a random HttpOnly, SameSite=Strict sandbox session cookie.
   Only its SHA-256 hash is stored; access to cases checks the session owner.
2. Case metadata is validated by Pydantic. Files have an allowlist, signatures,
   filename sanitisation, 5 MB file and bounded request limits. TXT and text PDFs
   are parsed locally. Image OCR is deliberately unavailable.
3. The parser records a document ID, page, line, masked quotation and extraction
   confidence for labelled fields. It does not authenticate a document.
4. The pure rule engine rejects missing, contradictory, low-quality or unsourced
   evidence. Dates, decimal amounts, currencies, event conditions, original payer
   and proposed recipient are checked independently of any model.
5. The student reviews facts. A draft captures the evidence version and the legal
   registry version. Approval is specific to the draft. Evidence changes make
   pending drafts stale; simulation rechecks the rules and risk gates.
6. Simulation only writes local history. There is no sender, payment tool, bank
   integration, provider portal integration or complaint submission API.

`rp_cases` is a JSON aggregate with an optimistic revision column. This keeps
evidence, history and draft state in one atomic update and avoids lost changes.
`rp_sessions` separates visitors. SQLite is the default local store; the same
SQLAlchemy tables and Alembic migration work with PostgreSQL. Redis and the
upstream agent are retained but not needed by RefundPath’s single-process demo.

## Legal scope

The implemented calculation is deliberately narrow: an Australian registered
provider, a student-visa refusal causing a qualifying failure to start, a provider
that did start the course, no previous withdrawal, sourced agreed/default day,
pre-default matching AUD payments, and a matching student payer/recipient.
`rules.json` contains the authoritative URLs, retrieved snapshots, version,
sections, effective/compilation dates, check date and review-expiry gate. A
missing or expired registry yields manual review, not a guessed rule.

The calendar estimate does not implement public-holiday, legal time-extension or
all statutory exception rules. It is prominently qualified for professional
confirmation. Visa withdrawal, provider default and contract-specific claims can
be tracked and drafted for review, but their monetary/date calculations are
manual. No universal deadline is derived from the visa refusal letter.

## AI boundary and threat model

The default assistant is a deterministic local summary. Optional external
summarisation reuses the existing provider factory only after stored per-case
opt-in plus just-in-time consent. It sends bounded masked excerpts and has no
tools. Its unverified response cannot alter any rule-engine fact or decision.
Flagged instruction-like document text blocks that external processing.

Key threats are prompt injection, forged/mislabelled documents, evidence
conflicts, third-party payment redirection, stale approvals, session crossover,
malicious file content, resource exhaustion and private data in error reports.
Defences include data-only parsing, provenance, manual-review gates, recipient
comparison, optimistic revisions, owner checks, request limits, redaction and
generic input/error responses. Heuristic injection detection is incomplete, but
even an undetected instruction cannot run a tool or decide a refund.

Raw files are discarded and never rendered as executable HTML/PDF content.
Masked text remains in the database until deletion or expiry cleanup. Sessions
last 24 hours. Cleanup runs each minute while the backend is running, on startup
and on new-session creation. This is not encrypted production storage; do not
use real sensitive documents for the competition demo.
