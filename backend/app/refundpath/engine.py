"""Versioned deterministic rules. No model can decide money or dates."""
import copy
import json
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from zoneinfo import ZoneInfo

RULES_PATH = Path(__file__).with_name("rules.json")
TIMEZONES = {"Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth", "Australia/Adelaide", "Australia/Darwin", "Australia/Hobart"}
REQUIRED = {"agreement", "invoice", "receipt", "policy", "visa_refusal"}


def registry() -> dict:
    try:
        return json.loads(RULES_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"version": None, "sources": [], "rules": []}


def normalize(value: str) -> str:
    return " ".join(value.casefold().split())


def money(value: str) -> Decimal:
    # No floating point, silently guessed currency, exponents or negative fees.
    import re
    if not re.fullmatch(r"\d{1,9}(?:\.\d{1,2})?", value):
        raise ValueError("An amount must be a nonnegative decimal with at most two decimal places.")
    result = Decimal(value)
    if not result.is_finite():
        raise ValueError("Invalid amount.")
    return result.quantize(Decimal("0.01"))


def local_today(now: datetime, tz: str) -> date:
    if now.tzinfo is None or tz not in TIMEZONES:
        raise ValueError("Use an aware timestamp and a supported Australian timezone.")
    return now.astimezone(ZoneInfo(tz)).date()


def calendar_deadline(default_day: str, weeks: int) -> str:
    # Date-only arithmetic stays stable across DST, leap days and month ends.
    return (date.fromisoformat(default_day) + timedelta(weeks=weeks)).isoformat()


def complaint_channel(provider_type: str, level: str) -> dict:
    provider_type, level = normalize(provider_type), normalize(level)
    source = "https://www.ombudsman.gov.au/complaints/international-student-complaints"
    if level == "higher education" and provider_type in {"public", "private"}:
        label = "National Student Ombudsman"
    elif level == "vet" and provider_type == "private":
        label = "Commonwealth Ombudsman · Overseas Student team"
    elif level == "vet" and provider_type == "public":
        label = "State or territory ombudsman · confirm the provider’s jurisdiction"
    else:
        label = "Channel unconfirmed · verify provider type, education level and jurisdiction"
    return {"label": label, "source": source, "requires_confirmation": True, "checked_at": "2026-10-14"}


def analyse(case: dict, rules: dict | None = None, now: datetime | None = None) -> dict:
    rules = registry() if rules is None else rules
    now = now or datetime.now(timezone.utc)
    tz = case["details"].get("timezone", "Australia/Sydney")
    today = local_today(now, tz)
    risks: list[dict] = []

    def flag(code: str, message: str, severity: str = "block"):
        if code not in {r["code"] for r in risks}:
            risks.append({"code": code, "message": message, "severity": severity})

    docs = case.get("documents", [])
    missing = sorted(REQUIRED - {d["kind"] for d in docs})
    if missing:
        flag("missing_documents", "Required documents are missing: " + ", ".join(missing))
    facts: dict[str, dict] = {}
    for doc in docs:
        if doc.get("injection_flag"):
            flag("untrusted_instruction", "Instruction-like text was detected and treated as data. Human review is required.")
        if doc.get("issue"):
            flag("document_quality", doc["issue"])
        for fact in doc.get("facts", []):
            if fact["confidence"] < 0.85:
                flag("low_confidence", "One or more extracted fields have low confidence.")
            key = fact["field"]
            if key in facts and normalize(facts[key]["value"]) != normalize(fact["value"]):
                flag("conflicting_" + key, "Documents disagree on " + key.replace("_", " ") + ". Replace or correct the source document.")
            elif key not in facts:
                facts[key] = fact
    for fact in case.get("corrections", []):
        facts[fact["field"]] = fact
        if not fact.get("source_matches"):
            flag("unsourced_correction", "A student correction does not match its cited source. Manual verification is required.")

    def value(key: str, kinds: set[str] | None = None) -> str | None:
        fact = facts.get(key)
        if not fact or not fact.get("quote") or not fact.get("page"):
            flag("unsourced_" + key, "Source evidence is needed for " + key.replace("_", " ") + ".")
            return None
        source_doc = next((d for d in docs if d["id"] == fact["document_id"]), None)
        if source_doc is None or (kinds and source_doc["kind"] not in kinds):
            flag("wrong_source_" + key, "The evidence category is not sufficient for " + key.replace("_", " ") + ".")
            return None
        return fact["value"]

    fee = deduction = estimated = None
    formula = "No estimate until the facts and rule conditions are confirmed."
    deadline = None
    applied_rules = []
    try:
        active = {r["id"]: r for r in rules["rules"]}
        source_ids = {s["id"] for s in rules["sources"] if s.get("url") and s.get("checked_at")}
        if not rules.get("version") or today > date.fromisoformat(rules["review_due"]):
            raise ValueError("Rule review expired.")
        for key in ("visa-no-start-amount", "visa-default-deadline"):
            rule = active[key]
            if not set(rule["sources"]).issubset(source_ids) or today < date.fromisoformat(rule["effective_from"]):
                raise ValueError("Rule source unavailable.")
        amount_rule, date_rule = active["visa-no-start-amount"], active["visa-default-deadline"]
    except (KeyError, ValueError, TypeError):
        amount_rule = date_rule = None
        flag("rule_unavailable", "The legal rule version or its sources could not be validated. No money estimate or deadline will be generated.")

    source_kinds = {
        "course_start": {"agreement"}, "default_day": {"policy"},
        "refusal_date": {"visa_refusal"}, "registered_provider": {"agreement"},
        "student_visa": {"agreement", "visa_refusal"}, "visa_refused": {"visa_refusal"},
        "refusal_caused_no_start": {"policy"}, "provider_started_course": {"policy"},
        "student_started_course": {"policy"}, "previously_withdrawn": {"policy"},
        "tuition_paid": {"receipt"}, "non_tuition_paid": {"receipt"},
        "invoice_total": {"invoice"}, "receipt_total": {"receipt"},
        "payment_date": {"receipt"}, "payer_name": {"receipt"}, "payer_type": {"receipt"},
        "provider_name": {"agreement", "invoice", "receipt"},
        "student_name": {"agreement", "invoice", "receipt", "visa_refusal"},
        "course_name": {"agreement", "invoice", "receipt", "visa_refusal"},
        "currency": {"invoice", "receipt"}, "event_type": {"policy"},
    }
    values = {key: value(key, kinds) for key, kinds in source_kinds.items()}
    for key in ("student_name", "provider_name", "course_name", "course_start", "payer_name", "payer_type"):
        if values.get(key) and normalize(case["details"].get(key, "")) != normalize(values[key]):
            flag("intake_" + key, "The case details and documents disagree on " + key.replace("_", " ") + ".")
    if case["details"].get("country") != "AU":
        flag("jurisdiction", "Only Australian education providers are supported.")
    if case["details"].get("event_type") != "visa_no_start" or values.get("event_type") != "visa_no_start":
        flag("event_unsupported", "This event needs manual legal review. This MVP calculates only visa refusal causing failure to start.")
    expected = {"registered_provider": "yes", "student_visa": "yes", "visa_refused": "yes", "refusal_caused_no_start": "yes", "provider_started_course": "yes", "student_started_course": "no", "previously_withdrawn": "no"}
    for key, expected_value in expected.items():
        if normalize(values.get(key) or "") != expected_value:
            flag("condition_" + key, "Confirm the legal condition: " + key.replace("_", " ") + ".")
    if values.get("currency") != "AUD":
        flag("currency", "Only AUD is supported. No currency conversion is performed.")
    payer = values.get("payer_name")
    recipient = case["details"].get("recipient_name", "")
    if not payer or normalize(payer) != normalize(recipient):
        flag("recipient_mismatch", "The proposed recipient differs from the original payer. Progress is blocked pending human verification.")
    if values.get("payer_type") != "student":
        flag("third_party_payer", "An agent or third party paid the fees. Confirm authority and the agreement’s nominated recipient with a professional.")
    if normalize(facts.get("bank_changed", {}).get("value", "no")) != "no" or case["details"].get("bank_changed"):
        flag("bank_change", "Different bank details were indicated. This demo cannot verify bank ownership.")
    if normalize(facts.get("recipient_name", {}).get("value", recipient)) != normalize(recipient):
        flag("recipient_source_mismatch", "The documents and proposed recipient disagree.")

    try:
        start = date.fromisoformat(values["course_start"] or "")
        default = date.fromisoformat(values["default_day"] or "")
        refusal = date.fromisoformat(values["refusal_date"] or "")
        paid = date.fromisoformat(values["payment_date"] or "")
        if default != start or refusal > start or paid >= default or default > today:
            flag("dates", "Confirm the default day, refusal date and pre-default payments. A future start does not establish a default yet.")
    except (ValueError, TypeError, OverflowError):
        flag("dates", "One or more dates are missing or invalid. No deadline can be inferred from the refusal letter alone.")
    try:
        tuition = money(values["tuition_paid"] or "")
        non_tuition = money(values["non_tuition_paid"] or "")
        fee = tuition + non_tuition
        if fee <= 0 or fee != money(values["receipt_total"] or "") or fee != money(values["invoice_total"] or ""):
            flag("amount_mismatch", "Invoice, receipt and included fee amounts do not match.")
        if amount_rule:
            deduction = min(fee * Decimal(amount_rule["deduction_percent"]), money(amount_rule["deduction_cap_aud"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if "claimed_deduction" in facts and money(facts["claimed_deduction"]["value"]) != deduction:
                flag("unsupported_deduction", "A proposed deduction differs from the sourced statutory formula.")
        if "agent_fees" in facts and money(facts["agent_fees"]["value"]) > 0:
            flag("agent_fees", "Separate agent fees are outside the provider-fee calculation and need contract review.")
    except (ValueError, TypeError, InvalidOperation):
        flag("invalid_amount", "Source amounts must be valid nonnegative decimal values.")

    if any(r["code"] in {"currency", "conflicting_currency"} for r in risks):
        # Do not label an unsupported or mixed-currency source total as AUD.
        fee = None

    blocked = any(r["severity"] == "block" for r in risks)
    if not blocked and amount_rule and date_rule:
        estimated = fee - deduction
        formula = f"AUD {fee:,.2f} − min(5% × {fee:,.2f}, 500.00) = AUD {estimated:,.2f}"
        try:
            deadline = {"date": calendar_deadline(values["default_day"], date_rule["weeks_after_default"]), "trigger": values["default_day"], "trigger_label": "Confirmed agreed starting day / default day", "timezone": tz, "rule_id": date_rule["id"], "section": date_rule["section"], "source_ids": date_rule["sources"], "kind": "Provider obligation deadline", "qualification": "Provisional calendar deadline; holidays or case-specific legal exceptions require professional confirmation."}
        except (ValueError, OverflowError):
            estimated = None
            flag("date_overflow", "The dates exceed the supported range. Manual review is required.")
        applied_rules = [amount_rule, date_rule]
    status = "Documents needed" if missing else "Manual review required" if risks else "Needs student review"
    return {
        "status": status, "facts": sorted(facts.values(), key=lambda f: f["field"]), "risks": risks,
        "missing_documents": missing, "rule_version": rules.get("version"), "applied_rules": applied_rules,
        "currency": values.get("currency") or "Unconfirmed", "gross_payments": str(fee) if fee is not None else None,
        "included_payments": str(fee) if fee is not None and not blocked else None,
        "deduction": str(deduction) if estimated is not None else None,
        "estimate": str(estimated) if estimated is not None else None,
        "formula": formula, "deadline": deadline,
        "complaint_channel": complaint_channel(case["details"].get("provider_type", "unknown"), case["details"].get("education_level", "unknown")),
        "summary": "Review the cited facts before preparing a request." if not risks else "Human review is needed before progressing. No money moves in this sandbox.",
        "checks": [{"label": "Document completeness", "passed": not missing}, {"label": "Source consistency and extraction confidence", "passed": not any(r["code"].startswith(("conflicting", "low_confidence", "unsourced", "document_quality")) for r in risks)}, {"label": "Versioned rule and event conditions", "passed": estimated is not None}, {"label": "Original payer / proposed recipient comparison", "passed": not any(r["code"] in {"recipient_mismatch", "third_party_payer", "bank_change", "recipient_source_mismatch"} for r in risks)}, {"label": "External submission disabled", "passed": True}],
    }


def display_state(case: dict, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    result = {**copy.deepcopy(case), "display_status": case["status"], "remaining_days": None}
    if case.get("analysis"):
        # A stored estimate is never returned as current after its rules expire.
        current = analyse(case, now=now)
        if current["rule_version"] != case["analysis"]["rule_version"]:
            current["risks"].append({"code": "rule_changed", "message": "The legal registry changed. Reanalyse and review a new draft.", "severity": "block"})
            current["estimate"] = current["deduction"] = current["deadline"] = None
        result["analysis"] = current
        if current["risks"]:
            result["student_reviewed"] = False
            if case["status"] != "Resolved":
                result["display_status"] = current["status"] if current["status"] != "Needs student review" else "Manual review required"
            for draft in result.get("drafts", []):
                if not draft.get("simulated_at"):
                    draft["stale"] = True
                    draft["approved"] = False
    deadline = (result.get("analysis") or {}).get("deadline")
    if deadline:
        remaining = (date.fromisoformat(deadline["date"]) - local_today(now, deadline["timezone"])).days
        result["remaining_days"] = remaining
        if case["status"] in {"Waiting for provider", "Follow-up due", "Simulated submission"}:
            if remaining < 0:
                result["display_status"] = "Overdue"
            elif case.get("follow_up_date") and local_today(now, deadline["timezone"]).isoformat() >= case["follow_up_date"]:
                result["display_status"] = "Follow-up due"
    return result
