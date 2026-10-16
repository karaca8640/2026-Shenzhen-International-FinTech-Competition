"""Local extraction of labelled fields. Document text is never an instruction."""
import io
import re
import uuid
from pathlib import PurePath

from pypdf import PdfReader

MAX_BYTES = 5 * 1024 * 1024
KINDS = {"agreement", "invoice", "receipt", "policy", "visa_refusal", "agent"}
ALLOWED = {".txt", ".pdf", ".png", ".jpg", ".jpeg"}
LABELS = {
    "student name": "student_name", "provider name": "provider_name",
    "course name": "course_name",
    "course start": "course_start", "provider type": "provider_type",
    "education level": "education_level", "registered provider": "registered_provider",
    "student visa": "student_visa", "tuition paid": "tuition_paid",
    "non-tuition paid": "non_tuition_paid", "invoice total": "invoice_total",
    "receipt total": "receipt_total", "currency": "currency",
    "payment date": "payment_date", "payer name": "payer_name",
    "payer type": "payer_type", "recipient name": "recipient_name",
    "bank changed": "bank_changed", "visa refused": "visa_refused",
    "refusal date": "refusal_date", "refusal caused no start": "refusal_caused_no_start",
    "provider started course": "provider_started_course", "student started course": "student_started_course",
    "previously withdrawn": "previously_withdrawn", "default day": "default_day",
    "event type": "event_type", "claimed deduction": "claimed_deduction",
    "agent fees": "agent_fees", "timezone": "timezone",
}
INJECTION = re.compile(
    r"ignore.{0,60}(instruction|previous|rule)|system\s*prompt|<\|system|"
    r"(send|transfer|redirect).{0,60}(bank|account|money)|"
    r"(replace|change|override).{0,40}(recipient|bank|account)|developer\s*message", re.I
)


def redact(text: str) -> str:
    text = re.sub(r"(?im)((?:passport(?: number| no\.?)?|visa(?: number| id| no\.?)|account(?: number| no\.?)?|bank account(?: number)?|bsb|identity(?: number| id)?|swift|iban)\s*[:=])[^\n]*", r"\1 [REDACTED]", text)
    text = re.sub(r"(?im)^(\s*visa\s*[:=])[^\n]*", r"\1 [REDACTED]", text)
    text = re.sub(r"\b\d{6,}\b", "[REDACTED]", text)
    return text


def safe_filename(name: str) -> str:
    name = PurePath(name.replace("\\", "/")).name
    name = re.sub(r"[^\w. -]", "_", name)[:80]
    return redact(name) or "document.txt"


def parse_document(kind: str, filename: str, raw: bytes) -> dict:
    if kind not in KINDS:
        raise ValueError("Choose a supported document category.")
    suffix = PurePath(filename).suffix.lower()
    if suffix not in ALLOWED or not raw or len(raw) > MAX_BYTES:
        raise ValueError("Use PDF, TXT, PNG or JPEG files, up to 5 MB.")
    pages: list[str] = []
    issue = None
    if suffix == ".txt":
        if b"\x00" in raw:
            raise ValueError("The file is not a plain text document.")
        try:
            pages = [raw.decode("utf-8-sig")]
        except UnicodeDecodeError as exc:
            raise ValueError("Text documents must use UTF-8.") from exc
    elif suffix == ".pdf":
        if not raw.startswith(b"%PDF-"):
            raise ValueError("The file does not have a valid PDF signature.")
        try:
            reader = PdfReader(io.BytesIO(raw), strict=True)
            if reader.is_encrypted or len(reader.pages) > 30:
                raise ValueError("Use an unencrypted PDF with at most 30 pages.")
            if any(key in reader.root_object for key in ("/OpenAction", "/AA")):
                issue = "Active PDF content detected; manual review required."
            pages = [(page.extract_text() or "")[:20000] for page in reader.pages]
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("This PDF cannot be read safely. Use a text-only copy.") from exc
    else:
        valid = raw.startswith(b"\x89PNG\r\n\x1a\n") if suffix == ".png" else raw.startswith(b"\xff\xd8\xff")
        if not valid:
            raise ValueError("The image signature does not match its file type.")
        issue = "Image OCR is unavailable. Upload a text PDF or TXT version for local extraction."
    text = "\n".join(pages)
    if len(text) > 100000:
        raise ValueError("Extracted document text exceeds the 100,000 character limit.")
    injection = bool(INJECTION.search(text))
    doc_id = str(uuid.uuid4())
    facts = []
    for page_number, page in enumerate(pages, 1):
        for line_number, line in enumerate(page.splitlines(), 1):
            match = re.fullmatch(r"\s*([A-Za-z -]+)\s*:\s*(.{1,180})\s*", line)
            if not match or match[1].strip().lower() not in LABELS:
                continue
            facts.append({
                "field": LABELS[match[1].strip().lower()], "value": redact(match[2].strip()),
                "document_id": doc_id, "document_name": safe_filename(filename),
                "page": page_number, "line": line_number, "quote": redact(line.strip())[:220],
                "confidence": 0.35 if injection else 0.95, "method": "local labelled-field parser",
            })
    if not facts and not issue:
        issue = "No supported labelled fields found. Human extraction is required."
    return {
        "id": doc_id, "kind": kind, "name": safe_filename(filename), "size": len(raw),
        "pages": len(pages), "preview": redact(text)[:12000], "page_previews": [redact(page) for page in pages], "facts": facts,
        "injection_flag": injection, "issue": issue,
        "synthetic": text.startswith("SYNTHETIC REFUNDPATH DEMO"),
        "raw_retained": False,
    }
